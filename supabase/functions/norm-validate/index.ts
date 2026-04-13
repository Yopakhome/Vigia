import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
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

async function patchNorm(norm_id: string, patch: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/normative_sources?id=eq.${norm_id}`, {
    method: "PATCH", headers: { ...srv, Prefer: "return=representation" }, body: JSON.stringify(patch)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`PATCH → ${r.status}: ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return null; }
}

// Best-effort call to norm-embed (existirá a partir de Fase 4; tolera 404)
async function triggerEmbed(norm_id: string, authHeader: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/norm-embed`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ norm_id })
    });
    return { ok: r.ok, status: r.status };
  } catch (e) { return { ok: false, status: 0, error: (e as Error).message }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);
  const email = (user.email || "").toLowerCase();
  if (!SUPERADMIN_EMAILS.includes(email)) return json({ error: "Requiere rol SuperAdmin" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { norm_id, action, rejection_reason } = body || {};
  if (!norm_id || !action) return json({ error: "Faltan norm_id y action" }, 400);
  if (!['approve','reject'].includes(action)) return json({ error: "action debe ser 'approve' o 'reject'" }, 400);
  if (action === 'reject' && !rejection_reason) return json({ error: "Rechazo requiere rejection_reason" }, 400);

  try {
    const patch: Record<string, unknown> = action === 'approve'
      ? { status: 'published', validated_by: user.id, validated_at: new Date().toISOString(), rejection_reason: null }
      : { status: 'rejected',  validated_by: user.id, validated_at: new Date().toISOString(), rejection_reason };
    const saved = await patchNorm(norm_id, patch);
    const row = Array.isArray(saved) ? saved[0] : saved;
    if (!row?.id) return json({ error: "No se encontró la norma" }, 404);

    let embed: any = null;
    if (action === 'approve') {
      embed = await triggerEmbed(norm_id, req.headers.get("Authorization")!);
    }
    return json({ norm_id, new_status: row.status, embed_triggered: embed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
