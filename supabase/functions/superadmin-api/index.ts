import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";

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
      try {
        const saved = await adminReq("/rest/v1/organizations", "POST", payload || {}, "resolution=merge-duplicates,return=representation") as any[];
        const row = Array.isArray(saved) ? saved[0] : saved;
        return jsonResponse({ org: row });
      } catch(e) {
        const msg = (e as Error).message || "";
        if (msg.includes("idx_org_numero_identificacion") || msg.includes("organizations_nit_key") || msg.includes("duplicate key")) {
          return jsonResponse({ error: "Ya existe un cliente con este número de identificación." }, 409);
        }
        throw e;
      }
    }
    if (op === "extract-org-identity") {
      const { file_base64, file_type, file_name } = payload || {};
      if (!file_base64) return jsonResponse({ error: "Falta file_base64" }, 400);
      if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY no configurada" }, 500);

      const extractPrompt = `Eres un extractor de información para onboarding de clientes en Colombia.
Analiza este documento y extrae la siguiente información si está disponible.
Responde SOLO en JSON con exactamente estos campos (usa null si no encuentras el dato):

{
  "tipo_persona": "juridica|natural",
  "tipo_identificacion": "NIT|CC|CE|PASAPORTE",
  "numero_identificacion": "número exacto incluyendo dígito verificador si aplica",
  "razon_social": "nombre de la empresa o persona",
  "representante_legal": "nombre completo del representante",
  "direccion": "dirección completa",
  "ciudad": "ciudad",
  "departamento": "departamento",
  "telefono": "teléfono",
  "email_corporativo": "email",
  "ciiu": "código CIIU o actividad económica principal",
  "sector": "energia|mineria|manufactura|construccion|agro|logistica|servicios|otro",
  "objeto_social": "descripción breve del objeto social",
  "fecha_constitucion": "YYYY-MM-DD si aplica",
  "confianza": 0-100
}

Documentos típicos:
- RUT: contiene NIT, razón social, actividad CIIU, dirección
- Certificado de Existencia y Representación Legal: razón social, rep. legal, domicilio
- Cédula/Pasaporte: nombre, número, tipo de documento

Extrae solo lo que está explícitamente en el documento. No inventes datos. No uses markdown ni backticks, solo el objeto JSON.`;

      const mediaType = file_type || "application/pdf";
      const isImage = typeof mediaType === "string" && mediaType.startsWith("image/");

      const content = isImage
        ? [{ type: "image", source: { type: "base64", media_type: mediaType, data: file_base64 } },
           { type: "text", text: extractPrompt }]
        : [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } },
           { type: "text", text: extractPrompt }];

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          messages: [{ role: "user", content }]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        return jsonResponse({ error: `Anthropic ${res.status}: ${errText.slice(0,200)}` }, 502);
      }
      const data = await res.json();
      const text = data?.content?.[0]?.text || "{}";
      let extracted: any = {};
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        extracted = JSON.parse(clean);
      } catch {
        const first = text.indexOf("{");
        const last = text.lastIndexOf("}");
        if (first >= 0 && last > first) {
          try { extracted = JSON.parse(text.slice(first, last + 1)); }
          catch { extracted = { error: "No se pudo parsear JSON", raw: text.slice(0, 300) }; }
        } else {
          extracted = { error: "No se pudo parsear JSON", raw: text.slice(0, 300) };
        }
      }
      return jsonResponse({ extracted, file_name: file_name || null });
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
    if (op === "list-org-context") {
      const { org_id } = payload || {};
      if (!org_id) return jsonResponse({ error: "Falta org_id" }, 400);
      const [org, inst, obs, docs] = await Promise.all([
        adminReq(`/rest/v1/organizations?id=eq.${org_id}&select=*&limit=1`),
        adminReq(`/rest/v1/instruments?org_id=eq.${org_id}&select=*&order=created_at.desc`),
        adminReq(`/rest/v1/obligations?org_id=eq.${org_id}&select=*&order=due_date.asc`),
        adminReq(`/rest/v1/documents?org_id=eq.${org_id}&select=id,original_name,doc_type_detected,doc_role,created_at&order=created_at.desc&limit=20`),
      ]);
      return jsonResponse({
        org: Array.isArray(org) ? org[0] : org,
        instruments: inst, obligations: obs, documents: docs
      });
    }
    if (op === "list-client-notes") {
      const { org_id } = payload || {};
      if (!org_id) return jsonResponse({ error: "Falta org_id" }, 400);
      const data = await adminReq(`/rest/v1/client_notes?org_id=eq.${org_id}&select=*&order=created_at.desc&limit=50`);
      return jsonResponse({ notes: data });
    }
    if (op === "save-client-note") {
      const { org_id, content, tags, author_id } = payload || {};
      if (!org_id || !content?.trim()) return jsonResponse({ error: "Faltan org_id y content" }, 400);
      const saved = await adminReq("/rest/v1/client_notes", "POST",
        { org_id, content: content.trim(), tags: tags || [], author_id: author_id || null },
        "resolution=merge-duplicates,return=representation"
      ) as any[];
      const row = Array.isArray(saved) ? saved[0] : saved;
      return jsonResponse({ note: row });
    }
    if (op === "update-client-type") {
      const { org_id, client_type } = payload || {};
      if (!org_id || !client_type) return jsonResponse({ error: "Faltan org_id y client_type" }, 400);
      if (!["vigia_subscriber","enara_consulting","both"].includes(client_type)) {
        return jsonResponse({ error: "client_type inválido" }, 400);
      }
      await adminReq(`/rest/v1/organizations?id=eq.${org_id}`, "PATCH",
        { client_type }, "return=minimal"
      );
      return jsonResponse({ ok: true });
    }
    if (op === "update-org") {
      const { org_id, updates } = payload || {};
      if (!org_id || !updates) return jsonResponse({ error: "Faltan org_id y updates" }, 400);
      const ALLOWED = ["name","representante_legal","email_corporativo","telefono",
        "sector","ciudad","departamento","client_type","tier","plan","plan_estado",
        "plan_inicio","plan_renovacion","limite_edis","limite_usuarios",
        "limite_intake_mes","nivel_confidencialidad","contacto_vigia","cargo_contacto",
        "risk_profile","direccion"];
      const safe = Object.fromEntries(
        Object.entries(updates).filter(([k]) => ALLOWED.includes(k))
      );
      if (Object.keys(safe).length === 0) return jsonResponse({ error: "Sin campos válidos" }, 400);
      if (safe.client_type && !["vigia_subscriber","enara_consulting","both"].includes(safe.client_type as string)) {
        return jsonResponse({ error: "client_type inválido" }, 400);
      }
      await adminReq(`/rest/v1/organizations?id=eq.${org_id}`, "PATCH", safe, "return=minimal");
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: `op desconocida: ${op}` }, 400);
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500);
  }
});
