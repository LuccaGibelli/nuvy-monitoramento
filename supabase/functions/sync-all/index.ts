import "jsr:@supabase/functions-js/edge-runtime.d.ts";

async function invoke(baseUrl: string, key: string, name: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = { raw: text }; }
  return { function: name, ok: response.ok, status: response.status, payload };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Use POST" }), { status: 405, headers: { "Content-Type": "application/json" } });

  try {
    const body = await req.json().catch(() => ({}));
    if (!body.organization_id) return new Response(JSON.stringify({ error: "organization_id is required" }), { status: 400, headers: { "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server secrets");

    const shared = {
      organization_id: body.organization_id,
      days_back: body.days_back ?? 30,
      max_pages: body.max_pages ?? 100,
    };

    const jobs = [
      invoke(supabaseUrl, serviceRoleKey, "pncp-sync", { ...shared, days_ahead: body.days_ahead ?? 120 }),
      invoke(supabaseUrl, serviceRoleKey, "compras-sync", { ...shared, include_legacy: body.include_legacy !== false }),
      invoke(supabaseUrl, serviceRoleKey, "source-sync", { organization_id: body.organization_id, connector_ids: body.connector_ids }),
    ];

    const results = await Promise.all(jobs);
    const ok = results.every((item) => item.ok);
    return new Response(JSON.stringify({ ok, results }), { status: ok ? 200 : 207, headers: { "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
