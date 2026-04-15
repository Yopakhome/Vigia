import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    return u?.id ? u : null;
  } catch { return null; }
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };

async function getOrgProfile(userId: string) {
  try {
    const rm = await fetch(`${SUPABASE_URL}/rest/v1/user_org_map?user_id=eq.${userId}&select=org_id&limit=1`, { headers: srv });
    if (!rm.ok) return null;
    const mp = await rm.json();
    const orgId = mp?.[0]?.org_id;
    if (!orgId) return null;
    const rp = await fetch(`${SUPABASE_URL}/rest/v1/org_profile?org_id=eq.${orgId}&select=*&limit=1`, { headers: srv });
    if (!rp.ok) return null;
    const p = await rp.json();
    return p?.[0] || null;
  } catch { return null; }
}

function deriveArticleLabel(s: any): string {
  const current = s.article_label || "";
  if (/\d+\.\d+/.test(current)) return current;
  const m = String(s.content || "").match(/^\s*(Art[íÍiI]culo|ART[ÍÍII]CULO|Art\.)\s+([\d\.]+[A-Za-z]?)/);
  if (m && m[2] && m[2].includes(".")) return `${m[1]} ${m[2]}`;
  return current || `Art. ${s.article_number || ""}`.trim();
}

async function semanticSearch(query: string, top_k: number, authHeader: string, include_pedagogico: boolean) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/norm-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ query, top_k, include_pedagogico })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) return { ok: false, error: data.error || `norm-search ${r.status}`, results: [] };
    return { ok: true, results: data.results || [], elapsed_ms: data.elapsed_ms, capas: data.capas };
  } catch (e) {
    return { ok: false, error: (e as Error).message, results: [] };
  }
}

function formatFragment(r: any, idx: number): string {
  if (r.source_type === "sentencia") {
    const header = `[FUENTE ${idx + 1} — JURISPRUDENCIA] ${r.corte || ""} ${r.radicado || ""} (${r.fecha_emision_anio || ""})`;
    const section = r.section_label ? `\n${r.section_label}` : "";
    return `${header}${section}\n${(r.content || "").trim()}`;
  }
  if (r.source_type === "resumen_editorial") {
    const header = `[FUENTE ${idx + 1} — RESUMEN EDITORIAL EUREKA] ${r.src_type || ""}`;
    return `${header}\n${(r.content || r.resumen || "").trim()}`;
  }
  // Fuentes pedagógicas: marcador distinto para REGLA 20
  if (r.corpus_source === "pedagogico") {
    const header = `[FUENTE ${idx + 1} — GUÍA TÉCNICA OFICIAL] ${r.norm_title || ""}`;
    return `${header}\n[NOTA: Fuente de orientación técnica, no norma vinculante]\n${(r.content || "").trim()}`;
  }
  // default: norma
  const categoryTag = r.category ? ` [Categoría: ${r.category}]` : "";
  const header = `[FUENTE ${idx + 1}] ${(r.norm_type || "NORMA").toUpperCase()} ${r.norm_number}/${r.norm_year} — ${r.norm_issuing_authority || ""}${categoryTag}`;
  const label = deriveArticleLabel(r);
  const artLine = `${label}${r.article_title ? " — " + r.article_title : ""}`;
  let vigencia = "";
  if (r.vigencia_status === "derogado") {
    vigencia = `\n[VIGENCIA: DEROGADO${r.derogado_por ? " por " + r.derogado_por : ""}]`;
  } else if (r.vigencia_status === "modificado") {
    vigencia = `\n[VIGENCIA: MODIFICADO${r.modificado_por ? " por " + r.modificado_por : ""}]`;
  } else if (r.vigencia_global === "derogada_total") {
    vigencia = `\n[VIGENCIA: NORMA GLOBALMENTE DEROGADA]`;
  } else if (r.vigencia_global === "derogada_parcial" && r.vigencia_status !== "derogado") {
    vigencia = `\n[VIGENCIA: vigente (la norma padre tiene artículos derogados pero este no)]`;
  }
  const body = (r.content || "").trim();
  return `${header}\n${artLine}${vigencia}\n${body}`;
}

function buildContextFromResults(results: any[]): string {
  if (!results || results.length === 0) return "(Sin fragmentos normativos relevantes a esta consulta)";
  return results.map((r, i) => formatFragment(r, i)).join("\n\n---\n\n");
}

function buildOrgContext(p: any): string {
  if (!p) return "";
  const fields = [
    ["Sectores", p.sectores],
    ["Actividades económicas", p.actividades_economicas],
    ["Departamentos de operación", p.departamentos_operacion],
    ["Autoridades competentes", p.autoridades_ambientales],
    ["Temas regulatorios frecuentes", p.temas_regulatorios],
    ["Normas más aplicables", p.normas_aplicables],
    ["Tipos de instrumento", p.tipos_instrumento],
  ];
  const lines: string[] = [];
  for (const [lbl, val] of fields) {
    if (Array.isArray(val) && val.length) lines.push(`${lbl}: ${val.slice(0, 5).join(", ")}`);
  }
  if (p.nivel_riesgo_ambiental) lines.push(`Nivel de riesgo ambiental: ${p.nivel_riesgo_ambiental}`);
  if (!lines.length) return "";
  return "CONTEXTO DE LA ORGANIZACIÓN USUARIA:\n" + lines.join("\n") + "\n\nUsá este contexto para personalizar tus respuestas. Si la consulta tiene relación con el sector/actividad de la organización, priorizá normas relevantes para ese sector y mencionalo.\n\n";
}

const SYSTEM_RULES = `Tienes acceso a fragmentos literales del corpus normativo ambiental colombiano, listados abajo como [FUENTE N]. Los fragmentos pueden ser de normas, jurisprudencia o resúmenes editoriales. Respondé siguiendo estas 21 reglas obligatorias.

REGLA 1 — HONESTIDAD DE SCOPE
Si los fragmentos recuperados no contienen información suficiente para responder con certeza, debes decirlo explícitamente al inicio con "No puedo responder con certeza basándome en el corpus consultado porque [razón]". Nunca inventes normas, artículos, fechas o citas.

REGLA 2 — INFORMACIÓN COMPLEMENTARIA MARCADA
Información NO presente en los fragmentos debe prefijarse con [INFORMACIÓN COMPLEMENTARIA NO VERIFICADA EN EL CORPUS].

REGLA 3 — CITAS VERIFICABLES
Cada afirmación sustantiva requiere cita [Ley 1333/2009, Art. 40], etc.

REGLA 4 — ESTRUCTURA VISUAL
Respuestas >3 párrafos usan headers Markdown, listas, **bold**.

REGLA 5 — RESPUESTA DIRECTA PRIMERO
Preguntas binarias: primera línea = SÍ/NO antes de la explicación.

REGLA 6 — FUERA DE SCOPE
Si no es ambiental: reconoce scope, identifica dominio correcto, da valor adyacente, recomienda profesional adecuado.

REGLA 7 — DISTINCIÓN DE VIGENCIA
Indica compilación (Dec 1076/2015), derogada, modificada, vigente.

REGLA 8 — HECHO vs INTERPRETACIÓN
"La norma establece:" (hecho) vs "Esto significa en la práctica:" (interpretación).

REGLA 9 — LENGUAJE ACCESIBLE
Usuarios son HSE/ingenieros. Traduce tecnicismos.

REGLA 10 — SEGUIMIENTO
Respuestas >5 párrafos: 2-3 preguntas de seguimiento al final.

REGLA 11 — ADVERTENCIA DE RIESGO LEGAL
Si sugiere incumplimiento, advertencia breve al final.

REGLA 12 — TONO PROFESIONAL
Sin exclamaciones, sin entusiasmo simulado, sin emojis decorativos.

REGLA 13 — INVITACIÓN A ENARA CONSULTING
Cuando se requiera asesor, cerrar con:
"Lo invitamos a contactarnos directamente — nuestro equipo en ENARA Consulting S.A.S. está disponible para acompañarlos en todo lo que necesiten:
📧 info@enaraconsulting.com.co
🌐 www.enaraconsulting.com.co
📞 +57 314 330 4008 / +57 320 277 3972"
Reemplaza cualquier "consulta con abogado" genérico.

REGLA 14 — VIGENCIA EXPLÍCITA (ABSOLUTA)
Cada fragmento puede incluir [VIGENCIA: ...].
- DEROGADO: no citar como vigente; responder "El [cita] fue DEROGADO por <norma>. El texto que sigue es histórico, ya no aplica." Si irrelevante, descartar en silencio.
- MODIFICADO: advertir "El [cita] fue modificado por <norma>. El texto recuperado puede no reflejar la versión vigente."
- NORMA GLOBALMENTE DEROGADA: tratar como histórica, sólo para antecedentes.
- Sin marcador: operar normalmente.
Citar derogada como vigente es error grave de compliance.

REGLA 15 — CITACIÓN DE JURISPRUDENCIA
Cuando cites jurisprudencia (fragmentos [FUENTE N — JURISPRUDENCIA]), siempre indicar corte + radicado + año. Ejemplo: "Según la Corte Constitucional en Sentencia C-035/2016...". Las sentencias son criterio auxiliar (Art. 230 CP), no fuente primaria — siempre mencionar la norma que interpretan. Distinguir tipo: C- (constitucionalidad, vinculante general), T- (tutela, efectos inter partes pero precedente), SU- (unificación), Consejo de Estado, Corte Suprema, etc.

REGLA 16 — TRATADOS Y DERECHO INTERNACIONAL
Cuando cites un tratado/convenio, mencionar SIEMPRE la ley colombiana de ratificación y el año. Ejemplo: "El Acuerdo de París, ratificado por Colombia mediante Ley 1844 de 2017...". Los tratados ratificados hacen parte del bloque de constitucionalidad; pueden tener jerarquía superior a leyes ordinarias en derechos humanos ambientales.

REGLA 17 — POLÍTICAS, GUÍAS Y CONCEPTOS
Distinguir naturaleza de la fuente:
- Política nacional: orientación de gobierno, no norma vinculante per se, pero informa interpretación.
- Guía o manual ANLA: instrumento técnico oficial, referencia para trámites.
- Concepto jurídico ANLA: interpretación oficial, puede ser vinculante para trámites ante ANLA.
Nunca equiparar política/guía con norma vinculante.

REGLA 18 — DOCUMENTOS PROPIOS DE LA ORGANIZACIÓN
Si hay fragmentos con source_type='documento_org', tienen PRIORIDAD MÁXIMA — son los compromisos específicos de ESA organización. Citar: "Según su [tipo de documento] de fecha [fecha]...". Los documentos propios pueden ser más exigentes que la norma general.

REGLA 19 — CONCORDANCIAS
Cuando un artículo tenga normas concordantes disponibles, sugerir explorar: "Este artículo tiene normas concordantes relevantes. Si desea profundizar en [tema], puedo orientarle."

REGLA 20 — FUENTES PEDAGÓGICAS Y DE ORIENTACIÓN TÉCNICA
Cuando uses una fuente con marcador [GUÍA TÉCNICA OFICIAL] o corpus_source='pedagogico' (guías sectoriales, manuales técnicos, instructivos ANLA):
1. Aclarar explícitamente: "Esta orientación proviene de una guía técnica oficial, no es norma vinculante."
2. Agregar recordatorio: "Verifique la normativa vigente aplicable a su caso específico."
3. Nunca citar estas fuentes con el mismo peso jurídico que una ley, decreto o resolución.
4. Si el usuario necesita certeza jurídica → aplicar REGLA 13 (invitación a ENARA Consulting).

REGLA 21 — PRIORIDAD POR DOMINIO TEMÁTICO
Cada fragmento recuperado tiene un campo category que indica su dominio
(ej: "Aguas y vertimientos", "Biodiversidad y fauna silvestre",
"Licenciamiento ambiental", etc.).
Cuando la consulta del usuario sea claramente sobre un dominio específico,
prioriza en tu respuesta los fragmentos cuya category coincida con ese dominio.
Si hay contradicción entre un artículo de "Marco general e institucional"
y uno de la categoría específica sobre el mismo tema, el específico prevalece.
Menciona la categoría cuando sea relevante para ayudar al usuario a entender
el alcance de la norma citada.

FRAGMENTOS RELEVANTES RECUPERADOS PARA ESTA CONSULTA:`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY no configurada" }, 500);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const { systemPrompt = "", userMessage, previousMessages, top_k = 12, use_rag = true, include_pedagogico = false } = payload || {};
  if (!userMessage || typeof userMessage !== "string") return json({ error: "Falta userMessage" }, 400);

  let rag: any = { ok: false, results: [] };
  if (use_rag) {
    rag = await semanticSearch(userMessage, Math.min(Math.max(top_k, 1), 20), req.headers.get("Authorization")!, include_pedagogico);
  }
  const corpusContext = buildContextFromResults(rag.results);
  const orgProfile = await getOrgProfile((user as any).id);
  const orgContext = buildOrgContext(orgProfile);

  const pedagogicoNote = include_pedagogico
    ? `\n\nFUENTES ACTIVAS EN ESTA CONSULTA: incluye circulares, guías técnicas y conceptos (corpus pedagógico). Estas fuentes son orientación técnica del regulador, NO norma vinculante. Cuando las cites, indica explícitamente "orientación técnica" o "guía no vinculante". REGLA 20 aplica con máxima prioridad.\n`
    : "";

  const finalSystem = orgContext + (systemPrompt ? systemPrompt.trim() + "\n\n" : "") + SYSTEM_RULES + "\n" + corpusContext + pedagogicoNote;

  const messages: any[] = [];
  if (Array.isArray(previousMessages)) {
    for (const m of previousMessages) {
      if (m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string") {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }
  messages.push({ role: "user", content: userMessage });

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 6144, system: finalSystem, messages })
    });
    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return json({ error: data?.error?.message || `Anthropic ${anthropicRes.status}`, detail: data }, 502);
    }
    const reply = data?.content?.[0]?.text || "";

    const sources = rag.results.map((r: any) => ({
      source_type: r.source_type || "norma",
      article_id: r.article_id,
      norm_id: r.norm_id, jur_id: r.jur_id,
      norm_title: r.norm_title || r.jur_title,
      norm_type: r.norm_type, norm_number: r.norm_number, norm_year: r.norm_year,
      radicado: r.radicado, corte: r.corte,
      article_label: r.article_label ? deriveArticleLabel(r) : (r.section_label || null),
      article_number: r.article_number,
      similarity: r.similarity
    }));

    return json({
      reply, sources,
      rag_used: rag.ok, rag_elapsed_ms: rag.elapsed_ms, capas: rag.capas,
      org_profile_loaded: !!orgProfile,
      tokens_in: data?.usage?.input_tokens ?? null,
      tokens_out: data?.usage?.output_tokens ?? null
    });
  } catch (e) {
    return json({ error: "Error llamando a Anthropic: " + (e as Error).message }, 502);
  }
});
