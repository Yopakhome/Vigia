/**
 * VIGÍA — Bot de Telegram
 * Edge Function: vigia-telegram
 *
 * Arquitectura:
 *   Telegram Webhook → esta función → norm-search (RAG) → Anthropic Claude
 *
 * Modos:
 *   enara_internal: Abogado ambiental senior del equipo ENARA. Sin restricción de org.
 *                   Comando /cliente para setear contexto de empresa en consulta.
 *   client (futuro): Usuario de org cliente, aislado por org_id + tier.
 *
 * Comandos:
 *   /start        — Bienvenida y registro de Telegram ID
 *   /ayuda        — Lista de comandos
 *   /cliente <x>  — Setear empresa en consulta (modo interno ENARA)
 *   /nuevo        — Nueva conversación (limpia historial de este hilo)
 *   /estado       — Ver usuario, modo, cliente activo, cuota del día
 *   /fuentes      — Fuentes de la última respuesta
 *
 * Deploy: supabase functions deploy vigia-telegram --no-verify-jwt
 * Webhook: POST https://api.telegram.org/bot{TOKEN}/setWebhook
 *          url=https://itkbujkqjesuntgdkubt.supabase.co/functions/v1/vigia-telegram
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ── Env ───────────────────────────────────────────────────────────────────────

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const ANTHROPIC_API_KEY  = Deno.env.get("ANTHROPIC_API_KEY")!;
const MODEL              = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY") ||
                           Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_API       = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const SRV = {
  apikey:        SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface TelegramUser {
  id:                   string;
  telegram_user_id:     number;
  telegram_username:    string | null;
  telegram_first_name:  string | null;
  mode:                 "enara_internal" | "client";
  tier:                 "free" | "pro" | "enterprise";
  is_active:            boolean;
  current_session_id:   string | null;
  client_context:       string | null;
  daily_query_count:    number;
  daily_query_date:     string;
  daily_query_limit:    number;
}

interface RAGResult {
  source_type?:        string;
  corpus_source?:      string;
  norm_type?:          string;
  norm_number?:        string;
  norm_year?:          string;
  norm_issuing_authority?: string;
  norm_title?:         string;
  article_label?:      string;
  article_number?:     number;
  article_title?:      string;
  content?:            string;
  resumen?:            string;
  vigencia_status?:    string;
  vigencia_global?:    string;
  derogado_por?:       string;
  modificado_por?:     string;
  section_label?:      string;
  corte?:              string;
  radicado?:           string;
  fecha_emision_anio?: string;
  similarity?:         number;
}

// ── Telegram API helpers ──────────────────────────────────────────────────────

async function tgSend(chatId: number, text: string): Promise<void> {
  const chunks = chunkText(text, 4000);
  for (const chunk of chunks) {
    try {
      const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: chunk, parse_mode: "Markdown" }),
      });
      if (!res.ok) {
        // Fallback sin Markdown si el parse falla
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: stripMarkdown(chunk) }),
        });
      }
    } catch (e) {
      console.error("tgSend error:", e);
    }
  }
}

async function tgTyping(chatId: number): Promise<void> {
  await fetch(`${TELEGRAM_API}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

function chunkText(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) { chunks.push(remaining); break; }
    const slice = remaining.slice(0, maxLen);
    const cutAt = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"), maxLen * 0.8) | 0;
    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt).trimStart();
  }
  return chunks;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/#{1,6}\s/g, "");
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function sbGet(table: string, query: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SRV });
  if (!r.ok) return [];
  return await r.json();
}

async function sbPost(table: string, body: object): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SRV, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

async function sbPatch(table: string, query: string, body: object): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: SRV,
    body: JSON.stringify(body),
  });
  return r.ok;
}

// ── User management ───────────────────────────────────────────────────────────

async function getUser(tgUserId: number): Promise<TelegramUser | null> {
  const rows = await sbGet("telegram_users",
    `telegram_user_id=eq.${tgUserId}&select=*&limit=1`);
  return (rows[0] as TelegramUser) || null;
}

async function touchUser(tgUserId: number, firstName: string, username: string): Promise<void> {
  await sbPatch("telegram_users", `telegram_user_id=eq.${tgUserId}`, {
    last_seen: new Date().toISOString(),
    telegram_first_name: firstName,
    telegram_username: username,
  });
}

async function checkQuota(user: TelegramUser): Promise<boolean> {
  const today = new Date().toISOString().split("T")[0];
  if (user.daily_query_date !== today) {
    await sbPatch("telegram_users", `telegram_user_id=eq.${user.telegram_user_id}`, {
      daily_query_count: 1,
      daily_query_date: today,
    });
    return true;
  }
  if (user.daily_query_count >= user.daily_query_limit) return false;
  await sbPatch("telegram_users", `telegram_user_id=eq.${user.telegram_user_id}`, {
    daily_query_count: user.daily_query_count + 1,
  });
  return true;
}

// ── Session & history ─────────────────────────────────────────────────────────

function newSessionId(): string {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function ensureSession(user: TelegramUser): Promise<string> {
  if (user.current_session_id) return user.current_session_id;
  const sid = newSessionId();
  await sbPatch("telegram_users", `telegram_user_id=eq.${user.telegram_user_id}`,
    { current_session_id: sid });
  return sid;
}

async function startNewSession(tgUserId: number): Promise<string> {
  const sid = newSessionId();
  await sbPatch("telegram_users", `telegram_user_id=eq.${tgUserId}`,
    { current_session_id: sid });
  return sid;
}

async function getHistory(tgUserId: number, sessionId: string, limit = 8): Promise<any[]> {
  const rows = await sbGet("telegram_conversations",
    `telegram_user_id=eq.${tgUserId}&session_id=eq.${sessionId}&order=created_at.asc&limit=${limit}`);
  return rows.map((r: any) => ({ role: r.role, content: r.content }));
}

async function saveMessage(
  tgUserId: number,
  sessionId: string,
  role: string,
  content: string,
  extra: object = {},
): Promise<void> {
  await sbPost("telegram_conversations", {
    telegram_user_id: tgUserId,
    session_id: sessionId,
    role,
    content,
    ...extra,
  });
}

async function getLastSources(tgUserId: number): Promise<any[]> {
  const rows = await sbGet("telegram_conversations",
    `telegram_user_id=eq.${tgUserId}&role=eq.assistant&order=created_at.desc&limit=1`);
  return rows[0]?.sources || [];
}

// ── RAG — norm-search ─────────────────────────────────────────────────────────

async function ragSearch(query: string, topK = 14): Promise<RAGResult[]> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/norm-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ query, top_k: topK, include_pedagogico: false }),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) return [];
    return data.results || [];
  } catch { return []; }
}

function deriveLabel(r: RAGResult): string {
  const cur = r.article_label || "";
  if (/\d+\.\d+/.test(cur)) return cur;
  const m = String(r.content || "").match(
    /^\s*(Art[íÍiI]culo|ART[ÍÍII]CULO|Art\.)\s+([\d\.]+[A-Za-z]?)/
  );
  if (m?.[2]?.includes(".")) return `${m[1]} ${m[2]}`;
  return cur || `Art. ${r.article_number || ""}`.trim();
}

function formatFragment(r: RAGResult, idx: number): string {
  if (r.source_type === "sentencia") {
    const hdr = `[FUENTE ${idx + 1} — JURISPRUDENCIA] ${r.corte || ""} ${r.radicado || ""} (${r.fecha_emision_anio || ""})`;
    return `${hdr}${r.section_label ? "\n" + r.section_label : ""}\n${(r.content || "").trim()}`;
  }
  if (r.source_type === "resumen_editorial") {
    return `[FUENTE ${idx + 1} — RESUMEN EDITORIAL EUREKA] ${r.source_type || ""}\n${(r.content || r.resumen || "").trim()}`;
  }
  if (r.corpus_source === "pedagogico") {
    return `[FUENTE ${idx + 1} — GUÍA TÉCNICA OFICIAL] ${r.norm_title || ""}\n[NOTA: Orientación técnica, no norma vinculante]\n${(r.content || "").trim()}`;
  }
  // Norma
  const hdr = `[FUENTE ${idx + 1}] ${(r.norm_type || "NORMA").toUpperCase()} ${r.norm_number}/${r.norm_year} — ${r.norm_issuing_authority || ""}`;
  const label = deriveLabel(r);
  const artLine = `${label}${r.article_title ? " — " + r.article_title : ""}`;
  let vig = "";
  if (r.vigencia_status === "derogado")
    vig = `\n[VIGENCIA: DEROGADO${r.derogado_por ? " por " + r.derogado_por : ""}]`;
  else if (r.vigencia_status === "modificado")
    vig = `\n[VIGENCIA: MODIFICADO${r.modificado_por ? " por " + r.modificado_por : ""}]`;
  else if (r.vigencia_global === "derogada_total")
    vig = `\n[VIGENCIA: NORMA GLOBALMENTE DEROGADA]`;
  return `${hdr}\n${artLine}${vig}\n${(r.content || "").trim()}`;
}

function buildCorpusContext(results: RAGResult[]): string {
  if (!results.length) return "(Sin fragmentos normativos relevantes para esta consulta)";
  return results.map((r, i) => formatFragment(r, i)).join("\n\n---\n\n");
}

// ── System prompt ─────────────────────────────────────────────────────────────

const REGLAS_CORE = `Tienes acceso a fragmentos literales del corpus normativo ambiental colombiano. Respondé siguiendo estas reglas obligatorias.

REGLA 1 — HONESTIDAD DE SCOPE
Si los fragmentos no contienen información suficiente, decirlo explícitamente: "No puedo responder con certeza basándome en el corpus consultado porque [razón]". Nunca inventes normas, artículos, fechas o citas.

REGLA 2 — INFORMACIÓN COMPLEMENTARIA MARCADA
Información NO presente en los fragmentos debe prefijarse con [INFORMACIÓN COMPLEMENTARIA NO VERIFICADA EN EL CORPUS].

REGLA 3 — CITAS VERIFICABLES
Cada afirmación sustantiva requiere cita exacta [Ley 1333/2009, Art. 40].

REGLA 4 — ESTRUCTURA VISUAL
Respuestas >3 párrafos usan headers Markdown, listas, **bold**. Adaptá al formato Telegram (sin HTML, solo Markdown básico).

REGLA 5 — RESPUESTA DIRECTA PRIMERO
Preguntas binarias: primera línea = SÍ / NO antes de la explicación.

REGLA 6 — FUERA DE SCOPE
Si no es ambiental: reconoce scope, identifica dominio correcto, da valor adyacente.

REGLA 7 — DISTINCIÓN DE VIGENCIA
Indica compilación (Dec 1076/2015), derogada, modificada, vigente.

REGLA 8 — HECHO vs INTERPRETACIÓN
"La norma establece:" (hecho) vs "En la práctica esto significa:" (interpretación).

REGLA 9 — LENGUAJE PARA EXPERTOS
Tu interlocutor es un consultor ambiental experto. Usa terminología técnica apropiada. No simplifiques innecesariamente.

REGLA 10 — SEGUIMIENTO
Respuestas >5 párrafos: 2-3 preguntas de seguimiento al final.

REGLA 11 — ADVERTENCIA DE RIESGO LEGAL
Si sugiere incumplimiento: advertencia breve al final.

REGLA 12 — TONO PROFESIONAL
Sin exclamaciones, sin entusiasmo simulado. Tono de colega experto.

REGLA 13 — CONTACTO ENARA (cuando aplique)
Cuando el caso requiera intervención directa de un asesor:
📧 info@enaraconsulting.com.co | 📞 +57 314 330 4008

REGLA 14 — VIGENCIA EXPLÍCITA (ABSOLUTA)
DEROGADO: no citar como vigente. MODIFICADO: advertir. Sin marcador: operar normalmente. Citar derogada como vigente es error grave de compliance.

REGLA 15 — JURISPRUDENCIA
Indicar corte + radicado + año. Las sentencias son criterio auxiliar (Art. 230 CP). C- vinculante general, T- inter partes, SU- unificación, Consejo de Estado sectorial.

REGLA 16 — TRATADOS INTERNACIONALES
Siempre mencionar la ley colombiana de ratificación. Los tratados ratificados hacen parte del bloque de constitucionalidad.

REGLA 17 — POLÍTICAS Y GUÍAS
Distinguir: Política nacional (orientación) vs Guía ANLA (instrumento técnico) vs Concepto ANLA (puede ser vinculante para trámites). Nunca equiparar con norma vinculante.

REGLA 18 — DOCUMENTOS PROPIOS DE ORG
Si hay fragmentos source_type='documento_org': PRIORIDAD MÁXIMA. Son los compromisos específicos de esa organización.

REGLA 19 — CONCORDANCIAS
Cuando un artículo tenga normas concordantes, sugerir explorar.

REGLA 20 — FUENTES PEDAGÓGICAS
Fuentes [GUÍA TÉCNICA OFICIAL]: aclarar que es orientación técnica, no norma vinculante. Nunca citar con el mismo peso que ley, decreto o resolución.

FRAGMENTOS RELEVANTES RECUPERADOS:`;

function buildSystemPrompt(user: TelegramUser): string {
  if (user.mode === "enara_internal") {
    const clientSection = user.client_context
      ? `\n*CLIENTE EN CONSULTA ACTIVO:* ${user.client_context}\nAdaptá tu análisis al perfil de este cliente. Señalá activamente obligaciones que pueden no haber considerado.\n`
      : "\n*Sin cliente específico en consulta.* Respondé en términos generales o preguntá por el perfil del caso.\n";

    return `*MODO: CONSULTOR JURÍDICO INTERNO — ENARA CONSULTING S.A.S.*
${clientSection}
Sos el abogado ambiental senior del equipo ENARA. El consultor que te escribe es un colega experto en consultoría ambiental colombiana.

COMO ABOGADO INTERNO DE ENARA:
- Respondé con profundidad técnica de abogado ambiental senior colombiano
- No simplifiques: tu interlocutor conoce el dominio perfectamente
- Sé explícito sobre zonas grises jurídicas, interpretaciones divergentes entre autoridades, riesgos no obvios
- Cuando hay jurisprudencia relevante, incorpórala con precisión: el consultor puede usarla en argumentos con clientes o con la autoridad
- Señalá activamente obligaciones que el cliente puede no haber registrado
- Si el caso requiere concepto de autoridad (ANLA, CAR, CVC, CORPORINOQUIA, etc.), decilo con precisión procedimental
- Podés sugerir estrategias de cumplimiento, no solo describir la norma
- Si hay ambigüedad interpretativa, describí las dos lecturas posibles y cuál es más favorable para el operador
- Para casos con implicaciones penales (Ley 1333/2009), sé especialmente preciso sobre requisitos de tipicidad

${REGLAS_CORE}`;
  }

  // Modo cliente (futuro)
  return `MODO: CONSULTA DE USUARIO CLIENTE VIGÍA

Sos VIGÍA, el asistente de inteligencia regulatoria ambiental de ENARA Consulting. Respondés consultas sobre normativa ambiental colombiana con base en el corpus normativo vigente.

${REGLAS_CORE}`;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

async function callClaude(
  systemPrompt: string,
  corpusContext: string,
  history: any[],
  userMessage: string,
): Promise<{ reply: string; tokensIn: number; tokensOut: number }> {
  const finalSystem = systemPrompt + "\n" + corpusContext;

  const messages = [
    ...history,
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system: finalSystem,
      messages,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Anthropic ${res.status}`);

  return {
    reply: data?.content?.[0]?.text || "",
    tokensIn: data?.usage?.input_tokens ?? 0,
    tokensOut: data?.usage?.output_tokens ?? 0,
  };
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleStart(chatId: number, tgUserId: number, firstName: string): Promise<void> {
  const user = await getUser(tgUserId);
  if (user && user.is_active) {
    await tgSend(chatId,
      `✅ *Ya estás registrado en VIGÍA*, ${user.telegram_first_name || firstName}.\n\n` +
      `Modo: *${user.mode === "enara_internal" ? "Consultor Interno ENARA" : "Cliente"}*\n\n` +
      `Envía /ayuda para ver los comandos disponibles.`
    );
    return;
  }

  // Usuario no registrado — mostrar su ID para que el admin lo agregue
  await tgSend(chatId,
    `👋 Hola, *${firstName}*.\n\n` +
    `*VIGÍA* es el sistema de inteligencia regulatoria ambiental de ENARA Consulting.\n\n` +
    `Para acceder, un administrador debe registrar tu cuenta.\n\n` +
    `📋 *Tu Telegram ID:* \`${tgUserId}\`\n\n` +
    `Comparte este número con el equipo ENARA para que te habiliten el acceso.`
  );
}

async function handleAyuda(chatId: number, user: TelegramUser): Promise<void> {
  const isInternal = user.mode === "enara_internal";
  const modeLabel = isInternal ? "Consultor Interno ENARA" : "Cliente VIGÍA";

  let text = `*VIGÍA — Asistente de Normativa Ambiental Colombiana*\n`;
  text += `Modo: _${modeLabel}_\n\n`;
  text += `*Comandos disponibles:*\n\n`;
  text += `/ayuda — Este mensaje\n`;
  text += `/nuevo — Nueva conversación (limpia el historial)\n`;
  text += `/estado — Tu información y cuota del día\n`;
  text += `/fuentes — Fuentes normativas de la última respuesta\n`;

  if (isInternal) {
    text += `\n*Comandos de consultor interno:*\n`;
    text += `/cliente <nombre empresa> — Activar contexto de cliente en consulta\n`;
    text += `Ej: \`/cliente Cementos Andinos S.A., sector cementero, Boyacá\`\n`;
    text += `/sin_cliente — Limpiar contexto de cliente\n`;
  }

  text += `\n*Cómo consultar:*\n`;
  text += `Escribí tu consulta normativa directamente. Respondo con base en el corpus de 14.200+ artículos vectorizados de normativa ambiental colombiana + jurisprudencia.\n\n`;
  text += `_Ejemplos:_\n`;
  text += `• ¿Cuáles son los límites de vertimiento para efluentes industriales?\n`;
  text += `• ¿Qué obligaciones tiene un titular de licencia ambiental en zona de páramo?\n`;
  text += `• ¿Cuándo se requiere DAA vs licencia ambiental?\n`;

  await tgSend(chatId, text);
}

async function handleEstado(chatId: number, user: TelegramUser): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const isToday = user.daily_query_date === today;
  const queryCount = isToday ? user.daily_query_count : 0;
  const remaining = user.daily_query_limit - queryCount;

  let text = `*Estado de tu cuenta VIGÍA*\n\n`;
  text += `👤 *Usuario:* ${user.telegram_first_name || "—"}`;
  if (user.telegram_username) text += ` (@${user.telegram_username})`;
  text += `\n`;
  text += `🎭 *Modo:* ${user.mode === "enara_internal" ? "Consultor Interno ENARA" : "Cliente"}\n`;
  text += `📦 *Tier:* ${user.tier}\n`;
  text += `📊 *Cuota hoy:* ${queryCount} / ${user.daily_query_limit} (${remaining} restantes)\n`;

  if (user.mode === "enara_internal") {
    text += `🏢 *Cliente activo:* ${user.client_context || "_Ninguno_"}\n`;
  }

  text += `\n_Corpus: 14.200+ artículos · 147 sentencias · RAG multi-capa_`;

  await tgSend(chatId, text);
}

async function handleCliente(chatId: number, tgUserId: number, args: string): Promise<void> {
  if (!args.trim()) {
    await tgSend(chatId,
      `⚠️ Indicá el nombre del cliente.\n\nEjemplo:\n\`/cliente Cementos Andinos S.A., sector cementero, Boyacá\``
    );
    return;
  }
  await sbPatch("telegram_users", `telegram_user_id=eq.${tgUserId}`,
    { client_context: args.trim() });
  await tgSend(chatId,
    `✅ *Cliente en consulta:* ${args.trim()}\n\n` +
    `Las próximas respuestas tendrán en cuenta este perfil de empresa.\n` +
    `Usá /sin_cliente para limpiar o /cliente para cambiar.`
  );
}

async function handleSinCliente(chatId: number, tgUserId: number): Promise<void> {
  await sbPatch("telegram_users", `telegram_user_id=eq.${tgUserId}`,
    { client_context: null });
  await tgSend(chatId, `✅ Contexto de cliente limpiado. Respondo en términos generales.`);
}

async function handleNuevo(chatId: number, tgUserId: number): Promise<void> {
  const sid = await startNewSession(tgUserId);
  await tgSend(chatId,
    `🆕 *Nueva conversación iniciada.*\n\n` +
    `El historial anterior no se borrará, pero no influirá en las próximas respuestas.\n` +
    `ID de sesión: \`${sid}\``
  );
}

async function handleFuentes(chatId: number, tgUserId: number): Promise<void> {
  const sources = await getLastSources(tgUserId);
  if (!sources.length) {
    await tgSend(chatId, `ℹ️ No hay fuentes registradas de la última respuesta.`);
    return;
  }

  let text = `*Fuentes de la última respuesta:*\n\n`;
  for (const [i, s] of sources.entries()) {
    if (s.source_type === "sentencia") {
      text += `${i + 1}. 📋 _Jurisprudencia_ — ${s.corte || ""} ${s.radicado || ""} (${s.norm_year || ""})\n`;
    } else {
      const label = `${(s.norm_type || "NORMA").toUpperCase()} ${s.norm_number || ""}/${s.norm_year || ""}`;
      const art = s.article_label ? ` · ${s.article_label}` : "";
      const sim = s.similarity ? ` · similitud ${(s.similarity * 100).toFixed(0)}%` : "";
      text += `${i + 1}. 📄 ${label}${art}${sim}\n`;
    }
  }
  text += `\n_${sources.length} fuente(s) recuperadas del corpus EUREKA_`;

  await tgSend(chatId, text);
}

// ── Main query handler ────────────────────────────────────────────────────────

async function handleQuery(
  chatId: number,
  user: TelegramUser,
  userMessage: string,
): Promise<void> {
  // Verificar cuota
  const hasQuota = await checkQuota(user);
  if (!hasQuota) {
    await tgSend(chatId,
      `⚠️ Alcanzaste tu límite de ${user.daily_query_limit} consultas por hoy.\n` +
      `El contador se resetea a medianoche (hora Colombia).`
    );
    return;
  }

  // Indicar que está procesando
  await tgTyping(chatId);

  // Sesión
  const sessionId = await ensureSession(user);

  // Historial (últimos N turnos)
  const history = await getHistory(user.telegram_user_id, sessionId, 8);

  // Actualizar last_seen
  await touchUser(user.telegram_user_id,
    user.telegram_first_name || "", user.telegram_username || "");

  // RAG
  const ragResults = await ragSearch(userMessage, 14);
  const corpusContext = buildCorpusContext(ragResults);

  // System prompt según modo
  const systemPrompt = buildSystemPrompt(user);

  // Llamar a Claude
  let reply: string;
  let tokensIn = 0;
  let tokensOut = 0;
  let ragMs = 0;

  const t0 = Date.now();
  try {
    ({ reply, tokensIn, tokensOut } = await callClaude(
      systemPrompt, corpusContext, history, userMessage
    ));
    ragMs = Date.now() - t0;
  } catch (e) {
    console.error("Claude error:", e);
    await tgSend(chatId,
      `❌ Error procesando la consulta. Por favor intentá de nuevo.\n\n_${(e as Error).message}_`
    );
    return;
  }

  // Guardar en historial
  await saveMessage(user.telegram_user_id, sessionId, "user", userMessage, {
    client_context: user.client_context,
  });

  const sources = ragResults.map((r: RAGResult) => ({
    source_type:  r.source_type || "norma",
    norm_type:    r.norm_type,
    norm_number:  r.norm_number,
    norm_year:    r.norm_year,
    article_label: r.article_label,
    radicado:     r.radicado,
    corte:        r.corte,
    similarity:   r.similarity,
  }));

  await saveMessage(user.telegram_user_id, sessionId, "assistant", reply, {
    sources,
    tokens_in:         tokensIn,
    tokens_out:        tokensOut,
    rag_elapsed_ms:    ragMs,
    rag_results_count: ragResults.length,
    client_context:    user.client_context,
  });

  // Enviar respuesta
  await tgSend(chatId, reply);

  // Footer con fuentes si hay
  if (ragResults.length > 0) {
    const normas = ragResults
      .filter((r: RAGResult) => r.source_type !== "sentencia" && r.source_type !== "resumen_editorial")
      .slice(0, 3)
      .map((r: RAGResult) => `${(r.norm_type || "N").toUpperCase()} ${r.norm_number}/${r.norm_year}`)
      .join(" · ");

    const jurCount = ragResults.filter((r: RAGResult) => r.source_type === "sentencia").length;
    let footer = `\n_📚 ${ragResults.length} fuentes consultadas`;
    if (normas) footer += ` · ${normas}`;
    if (jurCount > 0) footer += ` · ${jurCount} sentencia(s)`;
    footer += ` · /fuentes para detalle_`;

    await tgSend(chatId, footer);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Verificar token de Telegram (seguridad básica del webhook)
  if (!TELEGRAM_BOT_TOKEN) {
    return new Response("TELEGRAM_BOT_TOKEN no configurado", { status: 500 });
  }

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ status: "VIGÍA Telegram Bot activo", ok: true }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Solo procesamos messages de texto (no canales, no grupos por ahora)
  const message = update?.message;
  if (!message) return new Response("ok");

  const chatId    = message.chat?.id;
  const tgUserId  = message.from?.id;
  const firstName = message.from?.first_name || "";
  const username  = message.from?.username || "";
  const text      = (message.text || "").trim();

  if (!chatId || !tgUserId || !text) return new Response("ok");

  // Parsear comando
  const isCommand = text.startsWith("/");
  const [rawCmd, ...cmdArgs] = text.split(/\s+/);
  const cmd = isCommand ? rawCmd.toLowerCase().split("@")[0] : "";
  const args = cmdArgs.join(" ");

  // /start siempre se maneja (incluso sin usuario registrado)
  if (cmd === "/start") {
    await handleStart(chatId, tgUserId, firstName);
    return new Response("ok");
  }

  // Para todo lo demás, verificar que el usuario esté registrado
  const user = await getUser(tgUserId);

  if (!user || !user.is_active) {
    await tgSend(chatId,
      `🔒 No tenés acceso a VIGÍA.\n\n` +
      `Compartí tu Telegram ID con el equipo ENARA para solicitar acceso:\n` +
      `\`${tgUserId}\``
    );
    return new Response("ok");
  }

  // Comandos de usuario registrado
  switch (cmd) {
    case "/ayuda":
    case "/help":
      await handleAyuda(chatId, user);
      break;

    case "/estado":
      await handleEstado(chatId, user);
      break;

    case "/nuevo":
      await handleNuevo(chatId, tgUserId);
      break;

    case "/fuentes":
      await handleFuentes(chatId, tgUserId);
      break;

    case "/cliente":
      if (user.mode !== "enara_internal") {
        await tgSend(chatId, "Este comando solo está disponible en modo consultor interno.");
      } else {
        await handleCliente(chatId, tgUserId, args);
      }
      break;

    case "/sin_cliente":
      if (user.mode !== "enara_internal") {
        await tgSend(chatId, "Este comando solo está disponible en modo consultor interno.");
      } else {
        await handleSinCliente(chatId, tgUserId);
      }
      break;

    default:
      // Mensaje regular → consulta normativa
      if (!isCommand) {
        await handleQuery(chatId, user, text);
      } else {
        await tgSend(chatId,
          `Comando no reconocido: \`${cmd}\`\n\nUsá /ayuda para ver los comandos disponibles.`
        );
      }
  }

  return new Response("ok");
});
