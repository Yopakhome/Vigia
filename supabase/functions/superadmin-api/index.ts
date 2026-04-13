import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
function jsonResponse(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

async function verifyUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return null;
    const u = await res.json();
    return u?.id ? (u as { id: string; email?: string }) : null;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);
  const email = (user.email || "").toLowerCase();
  if (!SUPERADMIN_EMAILS.includes(email)) return jsonResponse({ error: "Requiere rol SuperAdmin" }, 403);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }
  const { op, payload } = body || {};
  if (!op) return jsonResponse({ error: "Falta op" }, 400);

  try {
    if (op === "list-overview") {
      const [ur, or2, ob, al, nm] = await Promise.all([
        adminReq("/auth/v1/admin/users?page=1&per_page=50"),
        adminReq("/rest/v1/organizations?select=*"),
        adminReq("/rest/v1/obligations?select=id"),
        adminReq("/rest/v1/regulatory_alerts?select=id"),
        adminReq("/rest/v1/normative_sources?select=id,status")
      ]);
      return jsonResponse({ users: ur, orgs: or2, obligations: ob, alerts: al, normas: nm });
    }
    if (op === "list-requests") {
      const data = await adminReq("/rest/v1/org_update_requests?select=*&order=created_at.desc");
      return jsonResponse({ requests: data });
    }
    if (op === "approve-request") {
      const { id, org_id, requested_changes, reviewer_id } = payload || {};
      if (!id || !org_id) return jsonResponse({ error: "Faltan id y org_id" }, 400);
      await adminReq(`/rest/v1/organizations?id=eq.${org_id}`, "PATCH", requested_changes || {}, "return=representation");
      await adminReq(`/rest/v1/org_update_requests?id=eq.${id}`, "PATCH", { status: "approved", reviewed_by: reviewer_id || null, reviewed_at: new Date().toISOString(), review_note: null });
      return jsonResponse({ ok: true });
    }
    if (op === "reject-request") {
      const { id, note, reviewer_id } = payload || {};
      if (!id) return jsonResponse({ error: "Falta id" }, 400);
      await adminReq(`/rest/v1/org_update_requests?id=eq.${id}`, "PATCH", { status: "rejected", reviewed_by: reviewer_id || null, reviewed_at: new Date().toISOString(), review_note: note || "" });
      return jsonResponse({ ok: true });
    }
    if (op === "create-user") {
      const { email: ueEmail, password, org_id, role } = payload || {};
      if (!ueEmail || !password) return jsonResponse({ error: "Faltan email y password" }, 400);
      const created = await adminReq("/auth/v1/admin/users", "POST", { email: ueEmail, password, email_confirm: true }) as any;
      if (!created?.id) return jsonResponse({ error: "No se pudo crear usuario", detail: created }, 500);
      if (org_id && role && role !== "superadmin") {
        await adminReq("/rest/v1/user_org_map", "POST", { user_id: created.id, org_id, role }, "resolution=merge-duplicates,return=minimal");
      }
      return jsonResponse({ user: created });
    }
    if (op === "create-org") {
      const saved = await adminReq("/rest/v1/organizations", "POST", payload || {}, "resolution=merge-duplicates,return=representation") as any[];
      const row = Array.isArray(saved) ? saved[0] : saved;
      return jsonResponse({ org: row });
    }
    if (op === "list-norms") {
      const { status_filter = null, scope_filter = null } = payload || {};
      let q = "/rest/v1/normative_sources?select=id,norm_type,norm_number,norm_year,norm_title,issuing_body,scope,hierarchy_level,applies_to_sectors,total_articles,parser_quality,parser_method,status,proposed_by_org_id,proposed_by_user_id,validated_by,validated_at,rejection_reason,source_url,summary,created_at&order=hierarchy_level.asc,norm_year.desc";
      if (status_filter) q += `&status=eq.${status_filter}`;
      if (scope_filter) q += `&scope=eq.${scope_filter}`;
      const data = await adminReq(q);
      return jsonResponse({ normas: data });
    }
    if (op === "get-norm-articles") {
      const { norm_id, limit = 100, offset = 0 } = payload || {};
      if (!norm_id) return jsonResponse({ error: "Falta norm_id" }, 400);
      const data = await adminReq(`/rest/v1/normative_articles?norm_id=eq.${norm_id}&select=id,article_number,article_label,title,chapter,content,order_index,content_tokens,embedding_generated_at&order=order_index.asc&limit=${limit}&offset=${offset}`);
      return jsonResponse({ articles: data });
    }
    return jsonResponse({ error: `op desconocida: ${op}` }, 400);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
