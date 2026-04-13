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
    return u?.id ? (u as { id: string; email?: string }) : null;
  } catch { return null; }
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function srvGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: srv });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function srvPatch(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { method: "PATCH", headers: srv, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${await r.text()}`);
  return r;
}

// text-embedding-3-small acepta hasta 8192 tokens. Con factor ~3 chars/token en español,
// 24k chars ≈ 8000 tokens. Margen conservador.
const MAX_CHARS = 24000;
function truncateForEmbedding(text: string): string {
  return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
}

async function embedBatch(texts: string[], attempt = 0): Promise<number[][]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts })
  });
  if (r.status === 429 || r.status === 503) {
    if (attempt >= 4) throw new Error(`OpenAI rate limit persistente`);
    const backoff = [1000, 2000, 4000, 8000][attempt] || 8000;
    await new Promise(res => setTimeout(res, backoff));
    return embedBatch(texts, attempt + 1);
  }
  if (!r.ok) {
    const err = await r.text();
    throw new Error(`OpenAI → ${r.status}: ${err.slice(0, 300)}`);
  }
  const data = await r.json();
  return data.data.map((d: any) => d.embedding);
}

async function embedOne(text: string): Promise<number[] | null> {
  try {
    const [emb] = await embedBatch([text]);
    return emb;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY no configurada" }, 500);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { norm_id } = body || {};
  if (!norm_id) return json({ error: "Falta norm_id" }, 400);

  const norms = await srvGet(`/rest/v1/normative_sources?id=eq.${norm_id}&select=id,status,norm_title,total_articles`);
  if (!Array.isArray(norms) || norms.length === 0) return json({ error: "Norma no encontrada" }, 404);
  const norm = norms[0];
  if (norm.status !== 'published') return json({ error: `Norma no published (status=${norm.status})` }, 400);

  const pending = await srvGet(`/rest/v1/normative_articles?norm_id=eq.${norm_id}&embedding=is.null&select=id,content,content_tokens,order_index&order=order_index.asc`);
  if (!Array.isArray(pending) || pending.length === 0) {
    return json({ ok: true, norm_id, embeddings_generated: 0, message: "No hay artículos pendientes" });
  }

  const BATCH_SIZE = 100;
  let generated = 0;
  let skipped_too_long = 0;
  let tokens_in_total = 0;
  const errors: Array<{ batch: number; error: string }> = [];
  const started = Date.now();

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const texts = batch.map((a: any) => truncateForEmbedding(a.content || ""));
    try {
      const embeddings = await embedBatch(texts);
      await Promise.all(batch.map(async (a: any, idx: number) => {
        const emb = embeddings[idx];
        if (!emb || emb.length !== 1536) throw new Error(`embedding inválido article ${a.id}`);
        await srvPatch(`/rest/v1/normative_articles?id=eq.${a.id}`, {
          embedding: emb,
          embedding_model: EMBEDDING_MODEL,
          embedding_generated_at: new Date().toISOString(),
          content_tokens: Math.ceil(texts[idx].length / 4)
        });
      }));
      generated += batch.length;
      tokens_in_total += texts.reduce((s, t) => s + Math.ceil(t.length / 4), 0);
    } catch (e) {
      // Si el batch falla, reintentar 1 por 1 (identifica cuál es el problemático)
      const errMsg = (e as Error).message;
      errors.push({ batch: Math.floor(i / BATCH_SIZE), error: errMsg.slice(0, 200) });
      for (let j = 0; j < batch.length; j++) {
        const a = batch[j];
        let text = truncateForEmbedding(a.content || "");
        // Truncar aún más agresivo si en el primer intento individual falla
        let emb = await embedOne(text);
        if (!emb && text.length > 12000) { text = text.slice(0, 12000); emb = await embedOne(text); }
        if (!emb) { skipped_too_long += 1; continue; }
        try {
          await srvPatch(`/rest/v1/normative_articles?id=eq.${a.id}`, {
            embedding: emb,
            embedding_model: EMBEDDING_MODEL,
            embedding_generated_at: new Date().toISOString(),
            content_tokens: Math.ceil(text.length / 4)
          });
          generated += 1;
          tokens_in_total += Math.ceil(text.length / 4);
        } catch { skipped_too_long += 1; }
      }
    }
  }

  const elapsed_ms = Date.now() - started;
  const cost_usd_estimate = (tokens_in_total / 1_000_000) * 0.02;

  return json({
    ok: errors.length === 0 || generated > 0,
    norm_id,
    norm_title: norm.norm_title,
    embeddings_generated: generated,
    skipped_too_long,
    pending_before: pending.length,
    pending_after: pending.length - generated - skipped_too_long,
    tokens_in_approx: tokens_in_total,
    cost_usd_estimate: Number(cost_usd_estimate.toFixed(6)),
    elapsed_ms,
    model: EMBEDDING_MODEL,
    batch_errors_count: errors.length
  });
});
