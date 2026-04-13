import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
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

async function serviceFetch(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);

  const email = (user.email || "").toLowerCase();
  const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);

  try {
    const maps = await serviceFetch(`/rest/v1/user_org_map?user_id=eq.${user.id}&select=org_id,role`);
    if (!Array.isArray(maps) || maps.length === 0) {
      return jsonResponse({ org: null, role: null, isSuperAdmin });
    }
    const { org_id, role } = maps[0];
    const orgs = await serviceFetch(`/rest/v1/organizations?id=eq.${org_id}&select=*`);
    const org = Array.isArray(orgs) && orgs[0] ? orgs[0] : null;
    return jsonResponse({ org, role, isSuperAdmin });
  } catch (e) {
    return jsonResponse({ error: "Error consultando org", detail: (e as Error).message }, 500);
  }
});
