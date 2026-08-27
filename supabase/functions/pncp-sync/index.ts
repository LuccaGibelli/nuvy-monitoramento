import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  safeNumber,
  scoreOpportunity,
  shouldKeepOpportunity,
} from "../_shared/opportunity.ts";

const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";
const DEFAULT_MODALITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

function yyyymmdd(date: Date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function mapOpportunity(item: any, organizationId: string) {
  const objectText = item.objetoCompra ?? item.objeto ?? "";
  const complementary = item.informacaoComplementar ?? "";
  const title = objectText || item.numeroCompra || "Oportunidade PNCP";
  const estimatedValue = safeNumber(item.valorTotalEstimado);
  const deadline = item.dataEncerramentoProposta ?? item.dataFimProposta ?? null;
  const combined = `${title} ${objectText} ${complementary} ${item.modalidadeNome ?? ""}`;

  return {
    organization_id: organizationId,
    external_id: item.numeroControlePNCP ?? `${item.orgaoEntidade?.cnpj ?? "sem-cnpj"}-${item.anoCompra ?? "0"}-${item.sequencialCompra ?? item.numeroCompra ?? crypto.randomUUID()}`,
    source: "PNCP",
    source_url: item.linkSistemaOrigem ?? item.linkProcessoEletronico ?? null,
    title,
    buyer_name: item.orgaoEntidade?.razaoSocial ?? item.unidadeOrgao?.nomeUnidade ?? null,
    buyer_cnpj: item.orgaoEntidade?.cnpj ?? null,
    city: item.unidadeOrgao?.municipioNome ?? null,
    state: item.unidadeOrgao?.ufSigla ?? null,
    sphere: item.orgaoEntidade?.esferaId ?? item.orgaoEntidade?.poderId ?? null,
    process_number: item.processo ?? item.numeroCompra ?? null,
    modality: item.modalidadeNome ?? null,
    object_text: objectText,
    estimated_value: estimatedValue,
    published_at: item.dataPublicacaoPncp ?? null,
    deadline_at: deadline,
    score: scoreOpportunity(combined, estimatedValue, deadline),
    raw_payload: item,
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function fetchPncpPage(modality: number, initialDate: string, finalDate: string, page: number) {
  const url = new URL(PNCP_BASE_URL);
  url.searchParams.set("dataInicial", initialDate);
  url.searchParams.set("dataFinal", finalDate);
  url.searchParams.set("codigoModalidadeContratacao", String(modality));
  url.searchParams.set("pagina", String(page));

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Nuvy-Monitoramento/1.0" },
  });
  if (!response.ok) {
    throw new Error(`PNCP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

function rowsFrom(payload: any) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.resultado)) return payload.resultado;
  if (Array.isArray(payload)) return payload;
  return [];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organization_id;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const daysBack = Math.max(1, Math.min(Number(body.days_back ?? 14), 365));
    const daysAhead = Math.max(1, Math.min(Number(body.days_ahead ?? 120), 365));
    const maxPages = Math.max(1, Math.min(Number(body.max_pages ?? 100), 500));
    const initialDate = yyyymmdd(new Date(now.getTime() - daysBack * 86_400_000));
    const finalDate = yyyymmdd(new Date(now.getTime() + daysAhead * 86_400_000));
    const modalities = Array.isArray(body.modalities) && body.modalities.length ? body.modalities : DEFAULT_MODALITIES;

    let scanned = 0;
    let pagesScanned = 0;
    const selected: any[] = [];
    const errors: string[] = [];

    for (const modality of modalities) {
      let page = 1;
      while (page <= maxPages) {
        try {
          const payload = await fetchPncpPage(Number(modality), initialDate, finalDate, page);
          const rows = rowsFrom(payload);
          pagesScanned += 1;
          scanned += rows.length;

          for (const row of rows) {
            const text = `${row.objetoCompra ?? ""} ${row.informacaoComplementar ?? ""} ${row.modalidadeNome ?? ""}`;
            const value = safeNumber(row.valorTotalEstimado);
            if (!shouldKeepOpportunity(text, value)) continue;
            selected.push(mapOpportunity(row, organizationId));
          }

          const totalPages = Number(payload?.totalPaginas ?? payload?.total_pages ?? 0);
          const remaining = Number(payload?.paginasRestantes ?? payload?.paginas_restantes ?? 0);
          if (rows.length === 0) break;
          if (totalPages > 0 && page >= totalPages) break;
          if (remaining === 0 && totalPages > 0) break;
          page += 1;
        } catch (error) {
          errors.push(`modalidade ${modality} pagina ${page}: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }
    }

    if (selected.length) {
      const { error } = await supabase.from("opportunities").upsert(selected, { onConflict: "organization_id,source,external_id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      source: "PNCP",
      scanned,
      pages_scanned: pagesScanned,
      selected: selected.length,
      initialDate,
      finalDate,
      errors,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
