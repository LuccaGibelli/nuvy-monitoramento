import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LEGAL_TERMS = [
  "sociedade de advogados",
  "escritório de advocacia",
  "serviços advocatícios",
  "serviços jurídicos",
  "assessoria jurídica",
  "consultoria jurídica",
  "representação judicial",
  "representação extrajudicial",
  "contencioso",
  "recuperação de crédito",
  "direito tributário",
  "direito administrativo",
  "parecer jurídico",
  "assessoria legal",
];

const MINIMUM_VALUE = 300_000;
const PNCP_BASE_URL = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreOpportunity(text: string, value: number | null, deadline?: string | null) {
  const normalized = normalize(text);
  const matches = LEGAL_TERMS.filter((term) => normalized.includes(normalize(term))).length;
  let score = Math.min(65, matches * 12);

  if (value !== null) {
    if (value >= 1_000_000) score += 20;
    else if (value >= 500_000) score += 15;
    else if (value >= MINIMUM_VALUE) score += 10;
  } else {
    score += 5;
  }

  if (deadline) {
    const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
    if (days >= 3 && days <= 20) score += 10;
    if (days > 20) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function looksLegal(text: string) {
  const normalized = normalize(text);
  return LEGAL_TERMS.some((term) => normalized.includes(normalize(term)));
}

function mapOpportunity(item: any, organizationId: string) {
  const objectText = item.objetoCompra ?? item.objeto ?? "";
  const title = objectText || item.numeroCompra || "Oportunidade PNCP";
  const estimatedValue = Number.isFinite(Number(item.valorTotalEstimado))
    ? Number(item.valorTotalEstimado)
    : null;
  const deadline = item.dataEncerramentoProposta ?? item.dataFimProposta ?? null;
  const combined = `${title} ${objectText} ${item.modalidadeNome ?? ""}`;

  return {
    organization_id: organizationId,
    external_id: item.numeroControlePNCP ?? `${item.orgaoEntidade?.cnpj}-${item.anoCompra}-${item.sequencialCompra}`,
    source: "PNCP",
    source_url: item.linkSistemaOrigem ?? item.linkProcessoEletronico ?? null,
    title,
    buyer_name: item.orgaoEntidade?.razaoSocial ?? item.unidadeOrgao?.nomeUnidade ?? null,
    buyer_cnpj: item.orgaoEntidade?.cnpj ?? null,
    city: item.unidadeOrgao?.municipioNome ?? null,
    state: item.unidadeOrgao?.ufSigla ?? null,
    sphere: item.orgaoEntidade?.poderId ?? null,
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

async function fetchPncpPage(modality: number, finalDate: string, page = 1) {
  const url = new URL(PNCP_BASE_URL);
  url.searchParams.set("dataFinal", finalDate);
  url.searchParams.set("codigoModalidadeContratacao", String(modality));
  url.searchParams.set("pagina", String(page));

  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`PNCP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organization_id;
    if (!organizationId) {
      return new Response(JSON.stringify({ error: "organization_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const now = new Date();
    const finalDate = new Date(now.getTime() + 90 * 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replaceAll("-", "");

    const modalities = Array.isArray(body.modalities) && body.modalities.length
      ? body.modalities
      : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

    let scanned = 0;
    const selected: any[] = [];

    for (const modality of modalities) {
      const payload = await fetchPncpPage(Number(modality), finalDate, 1);
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      scanned += rows.length;

      for (const row of rows) {
        const text = `${row.objetoCompra ?? ""} ${row.informacaoComplementar ?? ""}`;
        const value = Number.isFinite(Number(row.valorTotalEstimado)) ? Number(row.valorTotalEstimado) : null;
        if (!looksLegal(text)) continue;
        if (value !== null && value < MINIMUM_VALUE) continue;
        selected.push(mapOpportunity(row, organizationId));
      }
    }

    if (selected.length) {
      const { error } = await supabase
        .from("opportunities")
        .upsert(selected, { onConflict: "organization_id,source,external_id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ scanned, selected: selected.length, finalDate }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
