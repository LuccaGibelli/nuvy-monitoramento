import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function asInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}

function bearer(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function resolveContext(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Missing Supabase environment secrets");

  const token = bearer(req);
  if (!token) return { error: response({ error: "missing_bearer_token", message: "Envie Authorization: Bearer <access_token>." }, 401) } as const;

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) return { error: response({ error: "invalid_token", message: "Token inválido ou expirado." }, 401) } as const;

  const service = createClient(supabaseUrl, serviceRoleKey);
  const { data: memberships, error: membershipError } = await service
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id", userData.user.id)
    .limit(1);
  if (membershipError) throw membershipError;
  const membership = memberships?.[0];
  if (!membership) return { error: response({ error: "organization_not_found", message: "Usuário não pertence a uma organização Nuvy." }, 403) } as const;

  return { user: userData.user, organizationId: membership.organization_id as string, role: membership.role as string, service, supabaseUrl, serviceRoleKey } as const;
}

async function listOpportunities(url: URL, ctx: Awaited<ReturnType<typeof resolveContext>> & { organizationId: string; service: any }) {
  const page = asInt(url.searchParams.get("page"), 1, 1, 100000);
  const perPage = asInt(url.searchParams.get("per_page"), 50, 1, 200);
  const from = (page - 1) * perPage;
  const to = from + perPage - 1;

  let query = ctx.service
    .from("opportunities")
    .select("id,external_id,source,source_url,title,buyer_name,buyer_cnpj,city,state,sphere,process_number,modality,object_text,estimated_value,published_at,deadline_at,status,score,ai_summary,is_favorite,collected_at,updated_at", { count: "exact" })
    .eq("organization_id", ctx.organizationId);

  const q = url.searchParams.get("q")?.trim();
  if (q) query = query.or(`title.ilike.%${q}%,object_text.ilike.%${q}%,buyer_name.ilike.%${q}%,process_number.ilike.%${q}%`);
  const state = url.searchParams.get("state")?.trim().toUpperCase();
  if (state) query = query.eq("state", state);
  const city = url.searchParams.get("city")?.trim();
  if (city) query = query.ilike("city", city);
  const source = url.searchParams.get("source")?.trim();
  if (source) query = query.eq("source", source);
  const status = url.searchParams.get("status")?.trim();
  if (status) query = query.eq("status", status);
  const minValue = Number(url.searchParams.get("min_value"));
  if (Number.isFinite(minValue) && minValue > 0) query = query.gte("estimated_value", minValue);
  const minScore = Number(url.searchParams.get("min_score"));
  if (Number.isFinite(minScore) && minScore > 0) query = query.gte("score", minScore);
  if (url.searchParams.get("favorite") === "true") query = query.eq("is_favorite", true);
  const publishedAfter = url.searchParams.get("published_after");
  if (publishedAfter) query = query.gte("published_at", publishedAfter);
  const deadlineBefore = url.searchParams.get("deadline_before");
  if (deadlineBefore) query = query.lte("deadline_at", deadlineBefore);

  const sort = url.searchParams.get("sort") ?? "score";
  const allowedSort = new Set(["score", "estimated_value", "published_at", "deadline_at", "collected_at"]);
  const sortField = allowedSort.has(sort) ? sort : "score";
  const ascending = url.searchParams.get("order") === "asc";

  const { data, error, count } = await query.order(sortField, { ascending, nullsFirst: false }).range(from, to);
  if (error) throw error;

  return response({
    data: data ?? [],
    meta: {
      page,
      per_page: perPage,
      total: count ?? 0,
      total_pages: Math.ceil((count ?? 0) / perPage),
      filters: Object.fromEntries(url.searchParams.entries()),
    },
  });
}

async function getOpportunity(id: string, ctx: any) {
  const { data, error } = await ctx.service
    .from("opportunities")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return response({ error: "not_found", message: "Oportunidade não encontrada." }, 404);
  return response({ data });
}

async function listSources(ctx: any) {
  const [{ data: connectors, error: connectorError }, { data: opportunities, error: opportunityError }] = await Promise.all([
    ctx.service.from("source_connectors").select("id,name,category,url,kind,enabled,last_success_at,last_error,updated_at").or(`organization_id.is.null,organization_id.eq.${ctx.organizationId}`).order("name"),
    ctx.service.from("opportunities").select("source").eq("organization_id", ctx.organizationId),
  ]);
  if (connectorError) throw connectorError;
  if (opportunityError) throw opportunityError;

  const counts = new Map<string, number>();
  for (const item of opportunities ?? []) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  const builtIn = ["PNCP", "Compras.gov.br Legado"].map((name) => ({ name, category: "built_in", enabled: true, opportunities: counts.get(name) ?? 0 }));
  const configured = (connectors ?? []).map((item: any) => ({ ...item, opportunities: counts.get(item.name) ?? 0 }));
  return response({ data: [...builtIn, ...configured] });
}

async function sync(req: Request, ctx: any) {
  if (!new Set(["admin", "manager"]).has(ctx.role)) return response({ error: "forbidden", message: "Apenas admin/manager pode iniciar sincronização." }, 403);
  const body = await req.json().catch(() => ({}));
  const syncResponse = await fetch(`${ctx.supabaseUrl}/functions/v1/sync-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ctx.serviceRoleKey}`, apikey: ctx.serviceRoleKey },
    body: JSON.stringify({
      organization_id: ctx.organizationId,
      days_back: body.days_back ?? 30,
      days_ahead: body.days_ahead ?? 120,
      max_pages: body.max_pages ?? 100,
      include_legacy: body.include_legacy !== false,
      connector_ids: body.connector_ids,
    }),
  });
  const text = await syncResponse.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return response({ data: payload }, syncResponse.ok ? 200 : 502);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: jsonHeaders });
  const started = Date.now();
  try {
    const url = new URL(req.url);
    const ctx = await resolveContext(req);
    if ("error" in ctx) return ctx.error;

    const parts = url.pathname.split("/").filter(Boolean);
    const functionIndex = parts.indexOf("nuvy-api-v1");
    const route = parts.slice(functionIndex + 1);

    if (req.method === "GET" && route.length === 0) {
      return response({
        name: "Nuvy Licitações API",
        version: "v1",
        status: "online",
        organization_id: ctx.organizationId,
        endpoints: ["GET /opportunities", "GET /opportunities/:id", "GET /sources", "POST /sync"],
      });
    }
    if (req.method === "GET" && route[0] === "opportunities" && route.length === 1) return await listOpportunities(url, ctx as any);
    if (req.method === "GET" && route[0] === "opportunities" && route[1]) return await getOpportunity(route[1], ctx);
    if (req.method === "GET" && route[0] === "sources") return await listSources(ctx);
    if (req.method === "POST" && route[0] === "sync") return await sync(req, ctx);

    return response({ error: "not_found", message: "Rota não encontrada.", duration_ms: Date.now() - started }, 404);
  } catch (error) {
    return response({ error: "internal_error", message: error instanceof Error ? error.message : String(error), duration_ms: Date.now() - started }, 500);
  }
});
