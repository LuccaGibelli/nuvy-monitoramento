import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { safeNumber, scoreOpportunity, shouldKeepOpportunity } from "../_shared/opportunity.ts";

type Connector = {
  id: string;
  organization_id: string | null;
  name: string;
  category: string;
  url: string;
  kind: "json" | "rss";
  config: Record<string, any> | null;
};

function getPath(obj: any, path?: string | null): any {
  if (!path) return obj;
  return path.split(".").reduce((value, key) => value?.[key], obj);
}

function pick(row: any, mapping: Record<string, string>, field: string) {
  return getPath(row, mapping[field]);
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}

function xmlTag(block: string, names: string[]) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return decodeXml(match[1].replace(/<[^>]+>/g, " "));
  }
  return null;
}

function xmlLink(block: string) {
  const atom = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?\s*>/i);
  return atom?.[1] ?? xmlTag(block, ["link", "guid", "id"]);
}

function parseRss(xml: string) {
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return blocks.map((block) => ({
    title: xmlTag(block, ["title"]),
    description: xmlTag(block, ["description", "summary", "content"]),
    link: xmlLink(block),
    published: xmlTag(block, ["pubDate", "published", "updated"]),
    raw: block,
  }));
}

function parseBrl(value: string) {
  const cleaned = value.replace(/[^0-9.,]/g, "").replaceAll(".", "").replace(",", ".");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

async function fetchConnector(connector: Connector) {
  const headers = { Accept: connector.kind === "rss" ? "application/rss+xml, application/atom+xml, text/xml, */*" : "application/json", "User-Agent": "Nuvy-Monitoramento/1.0" };
  const response = await fetch(connector.url, { headers });
  if (!response.ok) throw new Error(`${connector.name} ${response.status}: ${await response.text()}`);
  if (connector.kind === "rss") return parseRss(await response.text());
  const payload = await response.json();
  const path = connector.config?.items_path ?? connector.config?.itemsPath ?? null;
  const rows = getPath(payload, path);
  if (Array.isArray(rows)) return rows;
  if (Array.isArray(payload)) return payload;
  throw new Error(`${connector.name}: items_path nao aponta para uma lista`);
}

function mapJson(row: any, connector: Connector, organizationId: string) {
  const config = connector.config ?? {};
  const mapping = config.mapping ?? {};
  const objectText = String(pick(row, mapping, "object") ?? pick(row, mapping, "description") ?? "");
  const title = String(pick(row, mapping, "title") ?? objectText ?? connector.name);
  const complement = String(pick(row, mapping, "complement") ?? "");
  const value = safeNumber(pick(row, mapping, "value"));
  const deadline = pick(row, mapping, "deadline") ?? null;
  const externalId = String(pick(row, mapping, "id") ?? pick(row, mapping, "process_number") ?? `${connector.id}-${crypto.randomUUID()}`);
  const text = `${title} ${objectText} ${complement}`;
  if (!shouldKeepOpportunity(text, value)) return null;

  return {
    organization_id: organizationId,
    external_id: externalId,
    source: connector.name,
    source_url: pick(row, mapping, "url") ?? connector.url,
    title,
    buyer_name: pick(row, mapping, "buyer_name") ?? null,
    buyer_cnpj: pick(row, mapping, "buyer_cnpj") ?? null,
    city: pick(row, mapping, "city") ?? null,
    state: pick(row, mapping, "state") ?? config.state ?? null,
    sphere: pick(row, mapping, "sphere") ?? config.sphere ?? connector.category,
    process_number: pick(row, mapping, "process_number") ?? null,
    modality: pick(row, mapping, "modality") ?? null,
    object_text: objectText,
    estimated_value: value,
    published_at: pick(row, mapping, "published_at") ?? null,
    deadline_at: deadline,
    score: scoreOpportunity(text, value, deadline),
    raw_payload: { ...row, _connector: { id: connector.id, name: connector.name } },
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function mapRss(row: any, connector: Connector, organizationId: string) {
  const text = `${row.title ?? ""} ${row.description ?? ""}`;
  const valueMatches = text.match(/R\$\s?[\d\.]+(?:,\d{2})?/g) ?? [];
  const parsed = valueMatches.map(parseBrl).filter((item): item is number => item !== null);
  const value = parsed.length ? Math.max(...parsed) : null;
  if (!shouldKeepOpportunity(text, value)) return null;

  return {
    organization_id: organizationId,
    external_id: row.link ?? `${connector.id}-${String(row.title ?? "").slice(0, 120)}`,
    source: connector.name,
    source_url: row.link ?? connector.url,
    title: row.title ?? "Publicacao em diario oficial",
    buyer_name: null,
    buyer_cnpj: null,
    city: connector.config?.city ?? null,
    state: connector.config?.state ?? null,
    sphere: connector.config?.sphere ?? connector.category,
    process_number: null,
    modality: null,
    object_text: row.description ?? row.title ?? "",
    estimated_value: value,
    published_at: row.published ?? null,
    deadline_at: null,
    score: scoreOpportunity(text, value, null),
    raw_payload: { ...row, _connector: { id: connector.id, name: connector.name } },
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: { "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    const organizationId = body.organization_id;
    if (!organizationId) return new Response(JSON.stringify({ error: "organization_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let query = supabase
      .from("source_connectors")
      .select("id,organization_id,name,category,url,kind,config")
      .eq("enabled", true)
      .or(`organization_id.is.null,organization_id.eq.${organizationId}`);
    if (Array.isArray(body.connector_ids) && body.connector_ids.length) query = query.in("id", body.connector_ids);
    const { data, error } = await query;
    if (error) throw error;

    const connectors = (data ?? []) as Connector[];
    let scanned = 0;
    const selected: any[] = [];
    const reports: any[] = [];

    for (const connector of connectors) {
      try {
        const rows = await fetchConnector(connector);
        scanned += rows.length;
        const mapped = rows
          .map((row: any) => connector.kind === "rss" ? mapRss(row, connector, organizationId) : mapJson(row, connector, organizationId))
          .filter(Boolean);
        selected.push(...mapped);
        reports.push({ connector: connector.name, status: "ok", scanned: rows.length, selected: mapped.length });
      } catch (error) {
        reports.push({ connector: connector.name, status: "error", error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (selected.length) {
      const { error } = await supabase.from("opportunities").upsert(selected, { onConflict: "organization_id,source,external_id" });
      if (error) throw error;
    }

    return new Response(JSON.stringify({ source: "configured-sources", connectors: connectors.length, scanned, selected: selected.length, reports }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
