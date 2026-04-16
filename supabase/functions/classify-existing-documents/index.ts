import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

const PROMPT = `Eres un experto en instrumentos ambientales colombianos.
Clasifica este documento en EXACTAMENTE una categoría:
- instrumento_original: Acto administrativo original (licencia, permiso, resolución)
- acto_modificatorio: Resolución/acto que modifica el instrumento
- evidencia_cumplimiento: Foto, reporte, medición, informe que prueba cumplimiento
- comunicacion_autoridad_entrante: Oficio/requerimiento de la autoridad a la empresa
- comunicacion_autoridad_saliente: Respuesta/solicitud de la empresa a la autoridad
- informe_tecnico: Estudio técnico, caracterización, monitoreo
- estudio_ambiental: EIA, PMA, Plan de Contingencia
- acta_visita: Acta de visita de inspección
- foto_campo: Fotografía de campo
- otro: No encaja en los anteriores

RESPONDE SOLO JSON (sin markdown):
{"role":"<categoria>","confidence":0.XX,"document_date":"YYYY-MM-DD o null","authority_reference":"string o null"}

Archivo: {FILENAME}
Texto (primeros 6000 chars):
<<<
{TEXT}
>>>`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);
  if (!SUPERADMIN_EMAILS.includes((user.email || "").toLowerCase())) return json({ error: "Requiere SuperAdmin" }, 403);

  let batchSize = 50;
  try { const b = await req.json(); if (b?.batchSize) batchSize = Math.min(b.batchSize, 100); } catch {}

  const docsRes = await fetch(`${SUPABASE_URL}/rest/v1/documents?document_role=eq.otro&raw_text=not.is.null&select=id,original_name,raw_text&limit=${batchSize}`, { headers: srv });
  if (!docsRes.ok) return json({ error: "fetch failed" }, 500);
  const docs = await docsRes.json() as any[];

  let classified = 0, failed = 0;
  const errors: string[] = [];

  for (const doc of docs) {
    try {
      const text = (doc.raw_text || "").slice(0, 6000);
      if (!text.trim()) { failed++; continue; }

      const prompt = PROMPT.replace("{FILENAME}", doc.original_name || "sin_nombre").replace("{TEXT}", text);
      const cr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 300, messages: [{ role: "user", content: prompt }] })
      });
      if (!cr.ok) { failed++; errors.push(`LLM ${cr.status}: ${doc.id}`); continue; }

      const cd = await cr.json();
      const raw = cd.content?.[0]?.text || "";
      const match = raw.match(/\{[\s\S]*?\}/);
      if (!match) { failed++; continue; }
      const parsed = JSON.parse(match[0]);

      const ur = await fetch(`${SUPABASE_URL}/rest/v1/documents?id=eq.${doc.id}`, {
        method: "PATCH", headers: { ...srv, Prefer: "return=minimal" },
        body: JSON.stringify({ document_role: parsed.role || "otro", role_confidence: parsed.confidence || null, document_date: parsed.document_date || null, authority_reference: parsed.authority_reference || null })
      });
      if (ur.ok) classified++; else { failed++; errors.push(`PATCH ${ur.status}: ${doc.id}`); }
    } catch (e) { failed++; errors.push(`${doc.id}: ${(e as Error).message}`); }
  }

  return json({ ok: true, processed: docs.length, classified, failed, errors: errors.slice(0, 10) });
});
