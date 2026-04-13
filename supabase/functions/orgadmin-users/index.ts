import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    return user as { id: string };
  } catch { return null; }
}

const srvHeaders = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function adminReq(path: string, method = "GET", body?: unknown, prefer?: string) {
  const headers: Record<string, string> = { ...srvHeaders };
  if (prefer) headers["Prefer"] = prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const t = await res.text();
  let parsed: unknown = t;
  try { parsed = JSON.parse(t); } catch {}
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${t.slice(0, 200)}`);
  return parsed;
}

async function requireOrgAdmin(userId: string, orgId: string) {
  const rows = await adminReq(`/rest/v1/user_org_map?user_id=eq.${userId}&org_id=eq.${orgId}&select=role`) as any[];
  const role = Array.isArray(rows) && rows[0]?.role;
  if (role !== "admin") throw new Error("Requiere rol admin de la organización");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }
  const { op, orgId, payload } = body || {};
  if (!op || !orgId) return jsonResponse({ error: "Faltan op y orgId" }, 400);

  try {
    await requireOrgAdmin(user.id, orgId);

    if (op === "list") {
      const maps = await adminReq(`/rest/v1/user_org_map?org_id=eq.${orgId}&select=user_id,role,created_at`) as any[];
      const list = Array.isArray(maps) ? maps : [];
      if (list.length === 0) return jsonResponse({ users: [] });
      const ids = list.map(m => m.user_id).join(",");
      const profiles = await adminReq(`/rest/v1/user_profiles?id=in.(${ids})&select=id,email,full_name`) as any[];
      const byId: Record<string, any> = {};
      (Array.isArray(profiles) ? profiles : []).forEach(p => { byId[p.id] = p; });
      return jsonResponse({ users: list.map(m => ({ ...(byId[m.user_id] || {}), ...m })) });
    }

    if (op === "create") {
      const { email, password, role = "editor" } = payload || {};
      if (!email || !password) return jsonResponse({ error: "Faltan email y password" }, 400);
      const created = await adminReq("/auth/v1/admin/users", "POST", { email, password, email_confirm: true }) as any;
      if (!created?.id) return jsonResponse({ error: "No se pudo crear el usuario", detail: created }, 500);
      await adminReq("/rest/v1/user_org_map", "POST", { user_id: created.id, org_id: orgId, role }, "resolution=merge-duplicates,return=minimal");
      return jsonResponse({ user: created });
    }

    if (op === "remove") {
      const { userId } = payload || {};
      if (!userId) return jsonResponse({ error: "Falta userId" }, 400);
      await adminReq(`/rest/v1/user_org_map?user_id=eq.${userId}&org_id=eq.${orgId}`, "DELETE");
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: `op desconocida: ${op}` }, 400);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
