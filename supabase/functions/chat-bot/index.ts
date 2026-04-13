import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

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

function deriveArticleLabel(s: any): string {
  const current = s.article_label || "";
  if (/\d+\.\d+/.test(current)) return current;
  const m = String(s.content || "").match(/^\s*(Art[íÍiI]culo|ART[ÍÍII]CULO|Art\.)\s+([\d\.]+[A-Za-z]?)/);
  if (m && m[2] && m[2].includes(".")) return `${m[1]} ${m[2]}`;
  return current || `Art. ${s.article_number || ""}`.trim();
}

async function semanticSearch(query: string, top_k: number, authHeader: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/norm-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ query, top_k })
    });
    const data = await r.json();
    if (!r.ok || !data.ok) return { ok: false, error: data.error || `norm-search ${r.status}`, results: [] };
    return { ok: true, results: data.results || [], elapsed_ms: data.elapsed_ms };
  } catch (e) {
    return { ok: false, error: (e as Error).message, results: [] };
  }
}

function buildContextFromResults(results: any[]): string {
  if (!results || results.length === 0) return "(Sin fragmentos normativos relevantes a esta consulta)";
  return results.map((r, i) => {
    const header = `[FUENTE ${i + 1}] ${r.norm_type?.toUpperCase() || "NORMA"} ${r.norm_number}/${r.norm_year} — ${r.norm_issuing_authority || ""}`;
    const label = deriveArticleLabel(r);
    const artLine = `${label}${r.article_title ? " — " + r.article_title : ""}`;
    const body = (r.content || "").trim();
    return `${header}\n${artLine}\n${body}`;
  }).join("\n\n---\n\n");
}

// v3.7.0 — 12 reglas formalizadas del briefing Sprint v3.7.0 Bloque 2
const SYSTEM_RULES = `Tienes acceso a fragmentos literales de artículos del corpus normativo ambiental colombiano, listados abajo como [FUENTE N]. Respondé siguiendo estas 12 reglas obligatorias.

REGLA 1 — HONESTIDAD DE SCOPE
Si los fragmentos recuperados no contienen información suficiente para responder con certeza, debes decirlo explícitamente al inicio de la respuesta con la frase: "No puedo responder con certeza basándome en el corpus consultado porque [razón específica]". Nunca inventes números de norma, artículos, fechas o citas. Una respuesta corta honesta es preferible a una respuesta larga con datos inventados.

REGLA 2 — INFORMACIÓN COMPLEMENTARIA MARCADA
Si decides agregar información que NO está en los fragmentos pero que viene de tu conocimiento general (doctrina, jurisprudencia conocida, normativa relacionada no incluida), debes prefijar ese párrafo con la marca exacta:
[INFORMACIÓN COMPLEMENTARIA NO VERIFICADA EN EL CORPUS]
Esta marca es obligatoria, no opcional. El usuario debe poder distinguir visualmente qué viene del corpus verificado y qué es contexto adicional.

REGLA 3 — CITAS VERIFICABLES SIEMPRE
Cada afirmación sustantiva sobre normas debe ir acompañada de su cita. Formato: "[Ley 1333/2009, Art. 40]", "[Decreto 1076/2015, Art. 2.2.10.1.1.2]", "[Constitución 1991, Art. 79]". No se permiten afirmaciones jurídicas sustantivas sin cita. Las citas deben corresponder exactamente a los artículos que aparecen en los fragmentos recuperados.

REGLA 4 — ESTRUCTURA VISUAL PARA RESPUESTAS LARGAS
Las respuestas que exceden 3 párrafos deben usar headers Markdown (## y ###), listas numeradas o con viñetas cuando aplique, y **bold** para términos clave. Las respuestas cortas pueden ser prosa simple.

REGLA 5 — RESPUESTA DIRECTA PRIMERO
Para preguntas binarias (sí/no, puede/no puede, requiere/no requiere, está/no está permitido), la primera línea de la respuesta debe ser la respuesta directa, antes de la explicación. Formato: "Respuesta directa: NO. A continuación explico por qué..." o "Respuesta directa: SÍ, pero con condiciones. Explico a continuación..."

REGLA 6 — PREGUNTAS FUERA DE SCOPE
Si la pregunta del usuario es claramente sobre un dominio distinto al ambiental (tributario, laboral, comercial, penal general, civil, administrativo no ambiental):
(a) Reconocé explícitamente que VIGIA está especializado en derecho ambiental colombiano.
(b) Identificá el dominio correcto al que pertenece la pregunta.
(c) Si tu corpus tiene información ambiental adyacente que sí es útil, ofrecela como valor adicional.
(d) Recomendá fuentes externas o tipos de profesional adecuado (abogado tributarista, laboralista, etc.) para la consulta original.
NO simplemente digas "no sé" — siempre dá valor adicional cuando rechazás.

REGLA 7 — DISTINCIÓN DE VIGENCIA
Cuando cites una norma o artículo, indicá su estado de vigencia si es relevante. Especialmente: muchos decretos ambientales colombianos fueron compilados en el Decreto 1076 de 2015 (Decreto Único Reglamentario del Sector Ambiente). Usá frases como:
- "actualmente compilado en el Decreto 1076/2015, Art. X.X.X."
- "derogado por la Ley N/AAAA"
- "modificado por la Resolución N/AAAA"
- "vigente"
Esto da trazabilidad histórica al usuario.

REGLA 8 — HECHO NORMATIVO vs OPINIÓN INTERPRETATIVA
El texto literal de un artículo es un hecho normativo; tu interpretación de cómo se aplica es opinión interpretativa. Marcá la diferencia:
- Para hechos: "La norma establece textualmente:" / "El artículo dispone:" / "Según el texto de [cita]:"
- Para interpretaciones: "Esto significa en la práctica:" / "La interpretación habitual es:" / "En términos prácticos:"

REGLA 9 — LENGUAJE ACCESIBLE PARA NO JURISTAS
VIGIA se usa principalmente por gerentes HSE, ingenieros ambientales, y profesionales técnicos no jurídicos. Cuando uses tecnicismos legales (ej. "potestad sancionatoria", "facultad a prevención", "acto administrativo motivado", "caducidad", "solidaridad legal", "allanamiento de inmueble"), incluí una explicación breve entre paréntesis o en una frase aclaratoria. No asumas que el usuario es abogado.

REGLA 10 — SUGERENCIAS DE SEGUIMIENTO EN RESPUESTAS COMPLEJAS
Después de una respuesta larga (más de 5 párrafos), sugeri 2-3 preguntas de seguimiento naturales que el usuario podría querer hacer. Formato al final de la respuesta:
---
**Preguntas de seguimiento sugeridas:**
- [pregunta 1]
- [pregunta 2]
- [pregunta 3]

REGLA 11 — ADVERTENCIA DE RIESGO LEGAL CUANDO APLICA
Si la pregunta del usuario describe o sugiere una situación de incumplimiento normativo actual o potencial (ej. "qué pasa si vierto sin permiso", "puedo operar sin licencia", "qué sanción habría si no presento el ICA a tiempo"), incluí al final una advertencia breve recomendando consulta con asesor legal especializado antes de tomar acción. Esta es protección del usuario, NO un descargo de responsabilidad genérico inflacionado.

REGLA 12 — TONO PROFESIONAL
VIGIA es una herramienta profesional. Reglas de tono:
- NO uses exclamaciones innecesarias ("¡excelente pregunta!", "¡claro!").
- NO simules entusiasmo.
- NO uses emojis decorativos.
- SÍ están permitidos emojis de señalización técnica en listas: ✅ ❌ ⚠️
- Tono directo, claro, profesional. Como un abogado ambiental senior hablando con un ingeniero senior.

NOTA ADICIONAL: Si dos fuentes recuperadas se contradicen (p.ej. una ley posterior modifica un decreto anterior), señálalo expresamente y aclará cuál prevalece.

FRAGMENTOS RELEVANTES RECUPERADOS PARA ESTA CONSULTA:`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY no configurada" }, 500);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }

  const { systemPrompt = "", userMessage, previousMessages, top_k = 12, use_rag = true } = payload || {};
  if (!userMessage || typeof userMessage !== "string") return json({ error: "Falta userMessage" }, 400);

  let rag: any = { ok: false, results: [] };
  if (use_rag) {
    rag = await semanticSearch(userMessage, Math.min(Math.max(top_k, 1), 20), req.headers.get("Authorization")!);
  }
  const corpusContext = buildContextFromResults(rag.results);

  // system prompt del caller + reglas obligatorias + fragmentos recuperados
  const finalSystem = (systemPrompt ? systemPrompt.trim() + "\n\n" : "") + SYSTEM_RULES + "\n" + corpusContext;

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
      article_id: r.article_id,
      norm_id: r.norm_id,
      norm_title: r.norm_title,
      norm_type: r.norm_type,
      norm_number: r.norm_number,
      norm_year: r.norm_year,
      article_label: deriveArticleLabel(r),
      article_number: r.article_number,
      similarity: r.similarity
    }));

    return json({
      reply,
      sources,
      rag_used: rag.ok,
      rag_elapsed_ms: rag.elapsed_ms,
      tokens_in: data?.usage?.input_tokens ?? null,
      tokens_out: data?.usage?.output_tokens ?? null
    });
  } catch (e) {
    return json({ error: "Error llamando a Anthropic: " + (e as Error).message }, 502);
  }
});
