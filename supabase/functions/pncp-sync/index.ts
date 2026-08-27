import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { legalMatch, safeNumber, scoreOpportunity, shouldKeepOpportunity } from "../_shared/opportunity.ts";

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";
const DEFAULT_MODALITIES = [1,2,3,4,5,6,7,8,9,10,11,12,13];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: CORS }); }
function yyyymmdd(date: Date) { return date.toISOString().slice(0,10).replaceAll("-",""); }
function externalId(item: any) {
  return String(item.numeroControlePNCP ?? `${item.orgaoEntidade?.cnpj ?? "sem-cnpj"}-${item.anoCompra ?? "0"}-${item.sequencialCompra ?? item.numeroCompra ?? crypto.randomUUID()}`);
}
function rowsFrom(payload: any) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  return Array.isArray(payload) ? payload : [];
}
async function fetchPage(modality:number, initialDate:string, finalDate:string, page:number) {
  const url = new URL(PNCP_BASE_URL);
  url.searchParams.set("dataInicial",initialDate);
  url.searchParams.set("dataFinal",finalDate);
  url.searchParams.set("codigoModalidadeContratacao",String(modality));
  url.searchParams.set("pagina",String(page));
  const response = await fetch(url,{headers:{Accept:"application/json","User-Agent":"Nuvy-Licitacoes/2.0"}});
  if(!response.ok) throw new Error(`PNCP ${response.status}: ${await response.text()}`);
  return response.json();
}
function rawRow(item:any) {
  const objectText = item.objetoCompra ?? item.objeto ?? "";
  return {
    source:"PNCP",
    external_id:externalId(item),
    source_url:item.linkSistemaOrigem ?? item.linkProcessoEletronico ?? null,
    title:objectText || item.numeroCompra || "Oportunidade PNCP",
    buyer_name:item.orgaoEntidade?.razaoSocial ?? item.unidadeOrgao?.nomeUnidade ?? null,
    city:item.unidadeOrgao?.municipioNome ?? null,
    state:item.unidadeOrgao?.ufSigla ?? null,
    modality:item.modalidadeNome ?? null,
    process_number:item.processo ?? item.numeroCompra ?? null,
    estimated_value:safeNumber(item.valorTotalEstimado),
    published_at:item.dataPublicacaoPncp ?? null,
    deadline_at:item.dataEncerramentoProposta ?? item.dataFimProposta ?? null,
    payload:item,
    last_seen_at:new Date().toISOString(),
  };
}
function qualifiedRow(item:any, organizationId:string, rawNoticeId:string|null) {
  const objectText = item.objetoCompra ?? item.objeto ?? "";
  const complementary = item.informacaoComplementar ?? "";
  const title = objectText || item.numeroCompra || "Oportunidade PNCP";
  const value = safeNumber(item.valorTotalEstimado);
  const deadline = item.dataEncerramentoProposta ?? item.dataFimProposta ?? null;
  const combined = `${title} ${objectText} ${complementary} ${item.modalidadeNome ?? ""}`;
  const match = legalMatch(combined);
  return {
    organization_id:organizationId,
    raw_notice_id:rawNoticeId,
    external_id:externalId(item),
    source:"PNCP",
    source_url:item.linkSistemaOrigem ?? item.linkProcessoEletronico ?? null,
    title,
    buyer_name:item.orgaoEntidade?.razaoSocial ?? item.unidadeOrgao?.nomeUnidade ?? null,
    buyer_cnpj:item.orgaoEntidade?.cnpj ?? null,
    city:item.unidadeOrgao?.municipioNome ?? null,
    state:item.unidadeOrgao?.ufSigla ?? null,
    sphere:item.orgaoEntidade?.esferaId ?? item.orgaoEntidade?.poderId ?? null,
    process_number:item.processo ?? item.numeroCompra ?? null,
    modality:item.modalidadeNome ?? null,
    object_text:objectText,
    estimated_value:value,
    published_at:item.dataPublicacaoPncp ?? null,
    deadline_at:deadline,
    score:scoreOpportunity(combined,value,deadline),
    legal_relevant:true,
    qualification_reason:{ strong_terms:match.strong, broad_terms:match.broad, minimum_value:value === null ? "unknown" : value >= 300000 },
    raw_payload:item,
    collected_at:new Date().toISOString(),
    updated_at:new Date().toISOString(),
  };
}

Deno.serve(async(req:Request)=>{
  if(req.method === "OPTIONS") return new Response("ok",{headers:CORS});
  if(req.method !== "POST") return json({error:"Use POST"},405);

  const startedAt = Date.now();
  let runId:string|undefined;
  try {
    const body = await req.json().catch(()=>({}));
    const organizationId = body.organization_id;
    if(!organizationId) return json({error:"organization_id is required"},400);
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");
    const supabase = createClient(supabaseUrl,serviceRoleKey);

    const {data:run} = await supabase.from("ingestion_runs").insert({source:"PNCP",status:"running"}).select("id").single();
    runId = run?.id;

    const now = new Date();
    const daysBack = Math.max(1,Math.min(Number(body.days_back ?? 30),365));
    const daysAhead = Math.max(1,Math.min(Number(body.days_ahead ?? 120),365));
    const maxPages = Math.max(1,Math.min(Number(body.max_pages ?? 150),500));
    const initialDate = yyyymmdd(new Date(now.getTime()-daysBack*86400000));
    const finalDate = yyyymmdd(new Date(now.getTime()+daysAhead*86400000));
    const modalities = Array.isArray(body.modalities) && body.modalities.length ? body.modalities : DEFAULT_MODALITIES;

    let scanned = 0, pagesScanned = 0, rawUpserted = 0, qualified = 0;
    const errors:string[] = [];

    for(const modality of modalities){
      for(let page=1; page<=maxPages; page++){
        try{
          const payload = await fetchPage(Number(modality),initialDate,finalDate,page);
          const rows = rowsFrom(payload);
          pagesScanned += 1;
          scanned += rows.length;
          if(rows.length === 0) break;

          const rawRows = rows.map(rawRow);
          const {data:storedRaw,error:rawError} = await supabase.from("raw_notices").upsert(rawRows,{onConflict:"source,external_id"}).select("id,external_id");
          if(rawError) throw rawError;
          rawUpserted += storedRaw?.length ?? 0;
          const rawIds = new Map((storedRaw ?? []).map((r:any)=>[String(r.external_id),String(r.id)]));

          const selected = rows.filter((item:any)=>{
            const text = `${item.objetoCompra ?? ""} ${item.informacaoComplementar ?? ""} ${item.modalidadeNome ?? ""}`;
            return shouldKeepOpportunity(text,safeNumber(item.valorTotalEstimado));
          }).map((item:any)=>qualifiedRow(item,organizationId,rawIds.get(externalId(item)) ?? null));

          if(selected.length){
            const {error:qError} = await supabase.from("opportunities").upsert(selected,{onConflict:"organization_id,source,external_id"});
            if(qError) throw qError;
            qualified += selected.length;
          }

          const totalPages = Number(payload?.totalPaginas ?? payload?.total_pages ?? 0);
          const remaining = Number(payload?.paginasRestantes ?? payload?.paginas_restantes ?? 0);
          if((totalPages > 0 && page >= totalPages) || (remaining === 0 && totalPages > 0)) break;
        }catch(error){
          errors.push(`modalidade ${modality} pagina ${page}: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }
    }

    const status = errors.length ? (scanned > 0 ? "partial" : "error") : "success";
    if(runId) await supabase.from("ingestion_runs").update({finished_at:new Date().toISOString(),status,scanned,inserted_raw:rawUpserted,qualified,errors,meta:{pages_scanned:pagesScanned,initialDate,finalDate,duration_ms:Date.now()-startedAt}}).eq("id",runId);
    await supabase.from("source_health").upsert({source:"PNCP",category:"built_in",enabled:true,status:status === "success" ? "online" : status === "partial" ? "degraded" : "offline",last_run_at:new Date().toISOString(),last_success_at:scanned>0?new Date().toISOString():null,last_error:errors[0] ?? null,last_scanned:scanned,last_qualified:qualified,avg_duration_ms:Date.now()-startedAt,updated_at:new Date().toISOString()},{onConflict:"source"});

    return json({source:"PNCP",scanned,raw_upserted:rawUpserted,qualified,pages_scanned:pagesScanned,initialDate,finalDate,status,errors});
  }catch(error){
    return json({error:error instanceof Error?error.message:String(error),run_id:runId},500);
  }
});
