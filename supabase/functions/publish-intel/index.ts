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
    return user as { id: string; email?: string };
  } catch { return null; }
}

// Campos permitidos por tabla. Cualquier otro campo del body se descarta.
const ALLOWED_ALERT_FIELDS = new Set(["norm_title","norm_type","norm_reference","norm_date","source_url","issuing_authority","impact_type","urgency","summary","detailed_analysis","suggested_action","confidence_pct","source","human_validated"]);
const ALLOWED_NORM_FIELDS = new Set(["norm_type","norm_number","norm_title","issuing_body","issue_date","effective_date","repeal_date","is_active","domain","keywords","full_text","source_url"]);

function pick(input: any, allowed: Set<string>) {
  const out: Record<string, unknown> = {};
  if (!input || typeof input !== "object") return out;
  for (const k of Object.keys(input)) if (allowed.has(k)) out[k] = input[k];
  return out;
}

async function insertInto(table: string, payload: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(payload)
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${t.slice(0, 200)}`);
  try { return JSON.parse(t); } catch { return t; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return jsonResponse({ error: "No autorizado" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }

  const kind = body?.kind;
  if (kind === "alert") {
    const payload = pick(body.data, ALLOWED_ALERT_FIELDS);
    if (!payload.norm_title || !payload.norm_type || !payload.impact_type || !payload.summary) {
      return jsonResponse({ error: "Campos requeridos: norm_title, norm_type, impact_type, summary" }, 400);
    }
    try {
      const saved = await insertInto("regulatory_alerts", payload);
      const row = Array.isArray(saved) ? saved[0] : saved;
      return jsonResponse({ row });
    } catch (e) { return jsonResponse({ error: "Error insertando alerta", detail: (e as Error).message }, 500); }
  }

  if (kind === "norm") {
    const payload = pick(body.data, ALLOWED_NORM_FIELDS);
    if (!payload.norm_type || !payload.norm_title) {
      return jsonResponse({ error: "Campos requeridos: norm_type, norm_title" }, 400);
    }
    try {
      const saved = await insertInto("normative_sources", payload);
      const row = Array.isArray(saved) ? saved[0] : saved;
      return jsonResponse({ row });
    } catch (e) { return jsonResponse({ error: "Error insertando norma", detail: (e as Error).message }, 500); }
  }

  return jsonResponse({ error: "kind debe ser 'alert' o 'norm'" }, 400);
});
