import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  safeNumber,
  scoreOpportunity,
  shouldKeepOpportunity,
} from "../_shared/opportunity.ts";

const COMPRAS_14133 = "https://dadosabertos.compras.gov.br/modulo-contratacoes/1_consultarContratacoes_PNCP_14133";
const COMPRAS_LEGACY = "https://dadosabertos.compras.gov.br/modulo-legado/1_consultarLicitacao";
const MODALITIES_14133 = [1, 2, 3, 4, 5, 6, 7, 12, 20, 22, 33, 44, 57];

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function getJson(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Nuvy-Monitoramento/1.0" },
  });
  if (!response.ok) throw new Error(`${url.hostname} ${response.status}: ${await response.text()}`);
  return response.json();
}

function map14133(row: any, organizationId: string) {
  const objectText = row.objetoCompra ?? "";
  const complementary = row.informacaoComplementar ?? "";
  const estimatedValue = safeNumber(row.valorTotalEstimado);
  const deadline = row.dataEncerramentoPropostaPncp ?? null;
  const text = `${objectText} ${complementary} ${row.modalidadeNome ?? ""}`;

  return {
    organization_id: organizationId,
    external_id: row.numeroControlePNCP ?? row.idCompra ?? crypto.randomUUID(),
    // Esta API espelha contratacoes PNCP. Usar a mesma source permite deduplicar
    // com o coletor PNCP quando o numeroControlePNCP coincidir.
    source: "PNCP",
    source_url: row.linkSistemaOrigem ?? null,
    title: objectText || row.numeroCompra || "Contratacao Compras.gov.br",
    buyer_name: row.orgaoEntidadeRazaoSocial ?? row.unidadeOrgaoNomeUnidade ?? null,
    buyer_cnpj: row.orgaoEntidadeCnpj ?? null,
    city: row.unidadeOrgaoMunicipioNome ?? null,
    state: row.unidadeOrgaoUfSigla ?? null,
    sphere: row.orgaoEntidadeEsferaId ?? row.orgaoEntidadePoderId ?? null,
    process_number: row.processo ?? row.numeroCompra ?? null,
    modality: row.modalidadeNome ?? String(row.codigoModalidade ?? ""),
    object_text: objectText,
    estimated_value: estimatedValue,
    published_at: row.dataPublicacaoPncp ?? null,
    deadline_at: deadline,
    score: scoreOpportunity(text, estimatedValue, deadline),
    raw_payload: { ...row, _collector: "compras.gov.br/14133" },
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapLegacy(row: any, organizationId: string) {
  const objectText = row.objeto ?? "";
  const info = row.informacoes_gerais ?? "";
  const estimatedValue = safeNumber(row.valor_estimado_total);
  const deadline = row.data_entrega_proposta ?? row.data_abertura_proposta ?? null;
  const text = `${objectText} ${info} ${row.nome_modalidade ?? ""}`;

  return {
    organization_id: organizationId,
    external_id: row.identificador ?? row.id_compra ?? `${row.uasg ?? "uasg"}-${row.numero_aviso ?? "aviso"}-${row.data_publicacao ?? "data"}`,
    source: "Compras.gov.br Legado",
    source_url: row.endereco_entrega_edital ?? null,
    title: objectText || `Licitacao ${row.numero_aviso ?? ""}`.trim(),
    buyer_name: row.orgao_uasg ? String(row.orgao_uasg) : null,
    buyer_cnpj: null,
    city: null,
    state: row.uf_uasg ?? null,
    sphere: "Federal",
    process_number: row.numero_processo ?? null,
    modality: row.nome_modalidade ?? String(row.modalidade ?? ""),
    object_text: objectText,
    estimated_value: estimatedValue,
    published_at: row.data_publicacao ?? null,
    deadline_at: deadline,
    score: scoreOpportunity(text, estimatedValue, deadline),
    raw_payload: row,
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function collect14133(organizationId: string, start: string, end: string, maxPages: number) {
  const selected: any[] = [];
  let scanned = 0;
  let pages = 0;
  const errors: string[] = [];

  for (const modality of MODALITIES_14133) {
    for (let page = 1; page <= maxPages; page++) {
      try {
        const url = new URL(COMPRAS_14133);
        url.searchParams.set("pagina", String(page));
        url.searchParams.set("tamanhoPagina", "500");
        url.searchParams.set("dataPublicacaoPncpInicial", start);
        url.searchParams.set("dataPublicacaoPncpFinal", end);
        url.searchParams.set("codigoModalidade", String(modality));
        url.searchParams.set("contratacaoExcluida", "false");
        const payload = await getJson(url);
        const rows = Array.isArray(payload?.resultado) ? payload.resultado : [];
        scanned += rows.length;
        pages += 1;

        for (const row of rows) {
          const value = safeNumber(row.valorTotalEstimado);
          const text = `${row.objetoCompra ?? ""} ${row.informacaoComplementar ?? ""} ${row.modalidadeNome ?? ""}`;
          if (shouldKeepOpportunity(text, value)) selected.push(map14133(row, organizationId));
        }

        const totalPages = Number(payload?.totalPaginas ?? 0);
        if (rows.length === 0 || (totalPages > 0 && page >= totalPages)) break;
      } catch (error) {
        errors.push(`14133 modalidade ${modality}: ${error instanceof Error ? error.message : String(error)}`);
        break;
      }
    }
  }

  return { selected, scanned, pages, errors };
}

async function collectLegacy(organizationId: string, start: string, end: string, maxPages: number) {
  const selected: any[] = [];
  let scanned = 0;
  let pages = 0;
  const errors: string[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const url = new URL(COMPRAS_LEGACY);
      url.searchParams.set("pagina", String(page));
      url.searchParams.set("tamanhoPagina", "500");
      url.searchParams.set("data_publicacao_inicial", start);
      url.searchParams.set("data_publicacao_final", end);
      const payload = await getJson(url);
      const rows = Array.isArray(payload?.resultado) ? payload.resultado : [];
      scanned += rows.length;
      pages += 1;

      for (const row of rows) {
        const value = safeNumber(row.valor_estimado_total);
        const text = `${row.objeto ?? ""} ${row.informacoes_gerais ?? ""} ${row.nome_modalidade ?? ""}`;
        if (shouldKeepOpportunity(text, value)) selected.push(mapLegacy(row, organizationId));
      }

      const totalPages = Number(payload?.totalPaginas ?? 0);
      if (rows.length === 0 || (totalPages > 0 && page >= totalPages)) break;
    } catch (error) {
      errors.push(`legado pagina ${page}: ${error instanceof Error ? error.message : String(error)}`);
      break;
    }
  }

  return { selected, scanned, pages, errors };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organization_id;
    if (!organizationId) return new Response(JSON.stringify({ error: "organization_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const daysBack = Math.max(1, Math.min(Number(body.days_back ?? 30), 365));
    const maxPages = Math.max(1, Math.min(Number(body.max_pages ?? 100), 500));
    const now = new Date();
    const start = isoDate(new Date(now.getTime() - daysBack * 86_400_000));
    const end = isoDate(now);

    const [current, legacy] = await Promise.all([
      collect14133(organizationId, start, end, maxPages),
      body.include_legacy === false ? Promise.resolve({ selected: [], scanned: 0, pages: 0, errors: [] as string[] }) : collectLegacy(organizationId, start, end, maxPages),
    ]);

    const selected = [...current.selected, ...legacy.selected];
    if (selected.length) {
      const { error } = await supabase.from("opportunities").upsert(selected, { onConflict: "organization_id,source,external_id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({
      source: "Compras.gov.br",
      period: { start, end },
      scanned: current.scanned + legacy.scanned,
      selected: selected.length,
      pages_scanned: current.pages + legacy.pages,
      current_14133: { scanned: current.scanned, selected: current.selected.length, errors: current.errors },
      legacy: { scanned: legacy.scanned, selected: legacy.selected.length, errors: legacy.errors },
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
