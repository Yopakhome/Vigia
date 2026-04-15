import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function extractProfile(text: string, meta: any) {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "no_key" };
  const sys = `Analiza este documento ambiental colombiano y extrae metadata estructurada. Responde SOLO JSON válido:
{
  "sectores": ["mineria","energia","hidrocarburos","manufactura","agroindustria","infraestructura","construccion","transporte","residuos","otro"] o subset,
  "actividades_economicas": ["palabras clave concretas detectadas"],
  "codigos_ciiu": ["códigos CIIU si aparecen"],
  "departamentos": ["departamentos de Colombia mencionados"],
  "municipios": ["municipios mencionados"],
  "cuencas": ["cuencas hidrográficas mencionadas"],
  "autoridades_ambientales": ["ANLA","MADS","CAR","CORANTIOQUIA" o las que aparezcan],
  "temas_regulatorios": ["vertimientos","emisiones","residuos","biodiversidad","licenciamiento","cambio climatico","consulta previa","sancionatorio","ordenamiento" o subset],
  "nivel_riesgo": "bajo"|"medio"|"alto"|"critico",
  "normas_mencionadas": ["Ley 1333/2009","Decreto 1076/2015"],
  "tipos_instrumento": ["licencia ambiental","plan de manejo","permiso vertimientos" o lista]
}
Solo incluir lo explícito. Si no hay info para un campo: arreglo vacío o null.`;
  const userMsg = `Metadata conocida: ${JSON.stringify(meta || {}).slice(0, 500)}\n\nTexto (primeras 15000 chars):\n${(text || "").slice(0, 15000)}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1500, system: sys, messages: [{ role: "user", content: userMsg }] })
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data?.error?.message || `http_${r.status}` };
    const raw = (data?.content?.[0]?.text || "").replace(/```(?:json)?/g, "").trim();
    const first = raw.indexOf("{"); const last = raw.lastIndexOf("}");
    if (first < 0 || last < 0) return { ok: false, error: "no_json" };
    try { return { ok: true, profile: JSON.parse(raw.slice(first, last + 1)), tokens_in: data?.usage?.input_tokens, tokens_out: data?.usage?.output_tokens }; }
    catch { return { ok: false, error: "parse_fail" }; }
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

function arrayUnion(existing: string[] | null, incoming: string[] | null): string[] {
  const a = Array.isArray(existing) ? existing : [];
  const b = Array.isArray(incoming) ? incoming : [];
  return Array.from(new Set([...a, ...b].filter(Boolean).map(s => String(s).trim()).filter(Boolean)));
}

function riskRank(r: string | null): number {
  return { bajo: 1, medio: 2, alto: 3, critico: 4 }[r as any] || 0;
}

async function upsertOrgProfile(orgId: string, incoming: any) {
  const rg = await fetch(`${SUPABASE_URL}/rest/v1/org_profile?org_id=eq.${orgId}&select=*&limit=1`, { headers: srv });
  const existing = rg.ok ? (await rg.json())[0] : null;

  const total = (existing?.total_documentos_procesados || 0) + 1;
  const conf = Math.min(1.0, (existing?.confianza_perfil || 0) + 1 / total);

  const newRiskRank = riskRank(incoming?.nivel_riesgo);
  const oldRiskRank = riskRank(existing?.nivel_riesgo_ambiental);
  const finalRisk = newRiskRank > oldRiskRank ? incoming?.nivel_riesgo : (existing?.nivel_riesgo_ambiental || null);

  const body: any = {
    org_id: orgId,
    sectores: arrayUnion(existing?.sectores, incoming?.sectores),
    actividades_economicas: arrayUnion(existing?.actividades_economicas, incoming?.actividades_economicas),
    codigos_ciiu: arrayUnion(existing?.codigos_ciiu, incoming?.codigos_ciiu),
    departamentos_operacion: arrayUnion(existing?.departamentos_operacion, incoming?.departamentos),
    municipios_operacion: arrayUnion(existing?.municipios_operacion, incoming?.municipios),
    cuencas_hidrograficas: arrayUnion(existing?.cuencas_hidrograficas, incoming?.cuencas),
    tipos_instrumento: arrayUnion(existing?.tipos_instrumento, incoming?.tipos_instrumento),
    autoridades_ambientales: arrayUnion(existing?.autoridades_ambientales, incoming?.autoridades_ambientales),
    temas_regulatorios: arrayUnion(existing?.temas_regulatorios, incoming?.temas_regulatorios),
    nivel_riesgo_ambiental: finalRisk,
    normas_aplicables: arrayUnion(existing?.normas_aplicables, incoming?.normas_mencionadas),
    ultimo_intake_at: new Date().toISOString(),
    total_documentos_procesados: total,
    confianza_perfil: conf,
    updated_at: new Date().toISOString(),
  };

  const method = existing ? "PATCH" : "POST";
  const url = existing ? `${SUPABASE_URL}/rest/v1/org_profile?org_id=eq.${orgId}` : `${SUPABASE_URL}/rest/v1/org_profile`;
  const res = await fetch(url, { method, headers: { ...srv, Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!res.ok) return { ok: false, error: await res.text() };
  const saved = await res.json();
  return { ok: true, profile: Array.isArray(saved) ? saved[0] : saved };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { org_id, text, metadata = {} } = body || {};
  if (!org_id) return json({ error: "Falta org_id" }, 400);
  if (!text || text.length < 200) return json({ error: "Texto insuficiente (<200 chars)" }, 400);

  const extraction = await extractProfile(text, metadata);
  if (!extraction.ok) return json({ error: "extract_fail", detail: (extraction as any).error }, 502);

  const res = await upsertOrgProfile(org_id, (extraction as any).profile);
  if (!res.ok) return json({ error: "upsert_fail", detail: res.error }, 500);

  return json({ ok: true, profile: res.profile, tokens_in: (extraction as any).tokens_in, tokens_out: (extraction as any).tokens_out });
});
