import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

async function embedQuery(q: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: q.slice(0, 24000) })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings → ${r.status}: ${(await r.text()).slice(0,200)}`);
  const data = await r.json();
  return data.data[0].embedding;
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function matchArticles(embedding: number[], top_k: number, filters: any) {
  const body = {
    query_embedding: embedding,
    match_count: top_k,
    filter_scope: filters?.scope || null,
    filter_norm_type: filters?.norm_type || null,
    filter_min_year: filters?.min_year || null,
    filter_max_year: filters?.max_year || null,
    filter_sectors: filters?.applies_to_sectors || null
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_normative_articles`, {
    method: "POST", headers: srv, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`match rpc → ${r.status}: ${(await r.text()).slice(0,300)}`);
  return r.json();
}

// Truncado de content a 1500 chars (v3.7.0 §1.2). Baja de 2000 para hacer sitio a top_k=12 en el contexto del LLM.
const CONTENT_TRUNC = 1500;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY no configurada" }, 500);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { query, top_k = 10, filters = {} } = body || {};
  if (!query || typeof query !== "string" || query.trim().length < 3) return json({ error: "Query vacía o demasiado corta" }, 400);

  const t0 = Date.now();
  try {
    const embedding = await embedQuery(query);
    const t_embed = Date.now() - t0;
    const rows = await matchArticles(embedding, Math.min(Math.max(top_k, 1), 50), filters);
    const t_total = Date.now() - t0;
    const results = (rows as any[]).map((r: any) => ({
      article_id: r.article_id,
      norm_id: r.norm_id,
      norm_title: r.norm_title,
      norm_type: r.norm_type,
      norm_number: r.norm_number,
      norm_year: r.norm_year,
      norm_scope: r.norm_scope,
      norm_issuing_authority: r.norm_issuing_authority,
      norm_source_url: r.norm_source_url,
      article_number: r.article_number,
      article_label: r.article_label,
      article_title: r.article_title,
      chapter: r.chapter,
      content: String(r.content || "").length > CONTENT_TRUNC ? String(r.content).slice(0, CONTENT_TRUNC) + "…" : r.content,
      distance: r.distance,
      similarity: Number((1 - (r.distance || 0)).toFixed(4))
    }));
    return json({ ok: true, results, total_returned: results.length, query, top_k, filters, content_truncation: CONTENT_TRUNC, elapsed_ms: t_total, embed_ms: t_embed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
