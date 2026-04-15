import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_HAIKU_MODEL") || "claude-haiku-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

async function verify(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return j({ error: "ANTHROPIC_API_KEY no configurada" }, 500);
  const user = await verify(req.headers.get("Authorization"));
  if (!user) return j({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return j({ error: "Body inválido" }, 400); }
  const { prompt, max_tokens = 100, model } = body || {};
  if (!prompt || typeof prompt !== "string") return j({ error: "Falta prompt" }, 400);

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: model || MODEL,
        max_tokens: Math.min(max_tokens, 500),
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await r.json();
    if (!r.ok) return j({ error: data?.error?.message || `Anthropic ${r.status}` }, 502);
    return j({
      text: data?.content?.[0]?.text || "",
      tokens_in: data?.usage?.input_tokens ?? null,
      tokens_out: data?.usage?.output_tokens ?? null
    });
  } catch (e) {
    return j({ error: (e as Error).message }, 500);
  }
});
