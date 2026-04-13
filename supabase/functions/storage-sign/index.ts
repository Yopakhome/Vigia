import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function verifyUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    return user as { id: string; email?: string };
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }
  const { path, bucket = "org-attachments", expiresIn = 300 } = payload || {};
  if (!path || typeof path !== "string") return jsonResponse({ error: "Falta path" }, 400);

  const email = (user.email || "").toLowerCase();
  const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);

  if (!isSuperAdmin) {
    const mapR = await fetch(`${SUPABASE_URL}/rest/v1/user_org_map?user_id=eq.${user.id}&select=org_id`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
    const maps = await mapR.json();
    const orgId = Array.isArray(maps) && maps[0]?.org_id;
    if (!orgId || !path.startsWith(`${orgId}/`)) {
      return jsonResponse({ error: "El path no pertenece a tu organización" }, 403);
    }
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encodeURI(path)}`, {
      method: "POST",
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn })
    });
    const data = await r.json();
    const rel = data.signedURL || data.signedUrl;
    if (!rel) return jsonResponse({ error: data.error || "No se pudo firmar URL" }, 500);
    return jsonResponse({ signedUrl: `${SUPABASE_URL}/storage/v1${rel}` });
  } catch (e) {
    return jsonResponse({ error: "Error firmando URL", detail: (e as Error).message }, 500);
  }
});
