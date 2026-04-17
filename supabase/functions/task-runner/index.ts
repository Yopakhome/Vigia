import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...cors, "Content-Type": "application/json" }
});

const srv = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

async function srvFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, { ...init, headers: { ...srv, ...(init.headers || {}) } });
}

// ===== HANDLER: email.send =====

async function handleEmailSend(payload: any): Promise<void> {
  const { to, subject, html, org_id, recipient_user_id, template_key } = payload;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY missing");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "VIGÍA <notificaciones@enaraconsulting.com.co>", to: [to], subject, html })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Resend ${res.status}: ${err}`); }
  const data = await res.json();

  await srvFetch("/rest/v1/email_log", {
    method: "POST", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ org_id, recipient_email: to, recipient_user_id, subject, template_key, resend_id: data.id, status: "sent", payload })
  });
}

// ===== HANDLER: radar.classify_item (v2 — authority-enriched) =====

async function isEnvironmentalAuthority(entidad: string | null | undefined): Promise<{
  is_env_authority: boolean; authority_slug: string | null; authority_name: string | null;
}> {
  if (!entidad) return { is_env_authority: false, authority_slug: null, authority_name: null };

  const res = await srvFetch(`/rest/v1/environmental_authorities?full_name=ilike.*${encodeURIComponent(entidad.slice(0, 60))}*&is_active=eq.true&select=slug,full_name&limit=1`);
  if (res.ok) {
    const data = await res.json() as any[];
    if (data?.[0]) return { is_env_authority: true, authority_slug: data[0].slug, authority_name: data[0].full_name };
  }

  const keywords = entidad.toUpperCase().split(/\s+/);
  const shortNames = ["ANLA","IDEAM","PNN","SINCHI","IIAP","INVEMAR","SDA","AMVA","DAGMA","EPA",
    "CORTOLIMA","CVC","CARDER","CORPOCALDAS","CAM","CARDIQUE","CARSUCRE","CAS","CDA","CDMB",
    "CODECHOCO","CORALINA","CORANTIOQUIA","CORMACARENA","CORNARE","CORPAMAG","CORPOAMAZONIA",
    "CORPOBOYACA","CORPOCESAR","CORPOCHIVOR","CORPOGUAVIO","CORPOGUAJIRA","CORPOMOJANA",
    "CORPONARIÑO","CORPONOR","CORPORINOQUIA","CORPOURABA","CRA","CRC","CSB","CVS","CRQ"];
  for (const sn of shortNames) {
    if (keywords.includes(sn) || entidad.toUpperCase().includes(sn)) {
      const r2 = await srvFetch(`/rest/v1/environmental_authorities?short_name=ilike.${sn}&is_active=eq.true&select=slug,full_name&limit=1`);
      if (r2.ok) { const d2 = await r2.json() as any[]; if (d2?.[0]) return { is_env_authority: true, authority_slug: d2[0].slug, authority_name: d2[0].full_name }; }
    }
  }

  if (entidad.toUpperCase().includes("AMBIENTE") || entidad.toUpperCase().includes("AMBIENTAL") || entidad.toUpperCase().includes("MEDIO AMBIENTE")) {
    const r3 = await srvFetch(`/rest/v1/environmental_authorities?slug=eq.minambiente&select=slug,full_name&limit=1`);
    if (r3.ok) { const d3 = await r3.json() as any[]; if (d3?.[0]) return { is_env_authority: true, authority_slug: d3[0].slug, authority_name: d3[0].full_name }; }
  }

  return { is_env_authority: false, authority_slug: null, authority_name: null };
}

async function handleClassifyItem(payload: any): Promise<void> {
  const { detected_item_id } = payload;
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

  const itemRes = await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}&select=*`);
  const items = await itemRes.json() as any[];
  const item = items?.[0];
  if (!item) throw new Error(`Item not found: ${detected_item_id}`);

  await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "classifying" })
  });

  const rawPayload = item.raw_payload || {};
  const entidad = rawPayload.entidad || null;
  const authCheck = await isEnvironmentalAuthority(entidad);

  const authoritySignal = authCheck.is_env_authority
    ? `SEÑAL FUERTE: La entidad emisora "${entidad}" es la autoridad ambiental ${authCheck.authority_name} (slug: ${authCheck.authority_slug}). Esta es una de las autoridades ambientales reconocidas de Colombia. El hecho de que esta autoridad emita la norma es indicador MUY FUERTE de que la norma es ambiental, aunque los otros campos estén vacíos.`
    : `La entidad emisora "${entidad || 'no especificada'}" NO es una autoridad ambiental reconocida. Evalúa con base en los demás campos.`;

  const prompt = `Eres un experto en derecho ambiental colombiano. Analiza si la siguiente norma es relevante para el dominio ambiental y clasifícala.

${authoritySignal}

NORMA:
Título: ${item.title}
Extracto: ${item.excerpt || "(sin extracto)"}
Fuente: ${item.source_key}
Entidad emisora: ${entidad || "(no especificada)"}
Materia: ${rawPayload.materia || "(no especificada)"}
Sector: ${rawPayload.sector || "(no especificado)"}

Responde EXCLUSIVAMENTE en JSON válido (sin markdown):

{
  "is_environmental": true | false,
  "confidence": 0.XX,
  "category": "licenciamiento | vertimientos | residuos | emisiones | fauna | flora | recurso_hidrico | general_ambiental | sanciones | multisectorial | otra",
  "sector_aplicable": ["minería", "hidrocarburos", "energía", "manufactura", "construcción", "agroindustria", "servicios", "todos"],
  "autoridad_emisora": "string",
  "urgency_signal": "alta | media | baja",
  "reasoning_brief": "una frase explicando por qué"
}

Reglas:
- Si la entidad emisora ES una autoridad ambiental reconocida (señal fuerte arriba), clasificar is_environmental: true con confidence >= 0.75, excepto que el título/extracto indique claramente que es una norma de gestión administrativa interna sin impacto ambiental sustantivo.
- Si la entidad emisora NO es autoridad ambiental, evaluar con base en contenido. En duda, is_environmental: false.
- "urgency_signal: alta" solo si la norma establece obligaciones nuevas con plazo corto o sanciones relevantes.
- sector_aplicable puede ser múltiple; si aplica a todos los sectores industriales, usar ["todos"].`;

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, messages: [{ role: "user", content: prompt }] })
  });
  if (!claudeRes.ok) throw new Error(`Claude classification failed: ${claudeRes.status}`);

  const claudeData = await claudeRes.json();
  const raw = claudeData.content?.[0]?.text || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM returned invalid JSON");

  const classification = JSON.parse(match[0]);
  const newStatus = classification.is_environmental ? "classified" : "discarded";

  await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: newStatus,
      classification: { ...classification, authority_slug: authCheck.authority_slug, authority_is_environmental: authCheck.is_env_authority },
      classified_at: new Date().toISOString(),
      discard_reason: classification.is_environmental ? null : (classification.reasoning_brief || "Not environmental")
    })
  });

  if (classification.is_environmental) {
    await srvFetch("/rest/v1/events", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event_type: "radar.norma_detected", event_source: "radar",
        entity_type: "detected_item", entity_id: detected_item_id,
        payload: { title: item.title, url: item.external_url, category: classification.category, urgency_signal: classification.urgency_signal, sectors: classification.sector_aplicable, source_key: item.source_key },
        severity: classification.urgency_signal === "alta" ? "warning" : "info"
      })
    });

    await srvFetch("/rest/v1/rpc/enqueue_task", {
      method: "POST",
      body: JSON.stringify({ p_task_type: "radar.match_item", p_payload: { detected_item_id }, p_priority: 4, p_dedup_key: `match_${detected_item_id}` })
    });

    await srvFetch("/rest/v1/rpc/enqueue_task", {
      method: "POST",
      body: JSON.stringify({ p_task_type: "radar.resolve_url", p_payload: { detected_item_id }, p_priority: 5, p_dedup_key: `resolve_${detected_item_id}` })
    });
  }
}

// ===== HANDLER: radar.resolve_url =====

async function handleResolveUrl(payload: any): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/resolve-norma-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ detected_item_id: payload.detected_item_id })
  });
  if (!resp.ok) throw new Error(`resolve-norma-url failed: ${resp.status}`);
}

// ===== HANDLER: radar.match_item =====

async function handleMatchItem(payload: any): Promise<void> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/radar-match`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": CRON_SECRET },
    body: JSON.stringify({ detected_item_id: payload.detected_item_id })
  });
  if (!resp.ok) throw new Error(`radar-match failed: ${resp.status}`);
}

// ===== HANDLER: radar.notify_applicable =====

async function handleNotifyApplicable(payload: any): Promise<void> {
  const { detected_item_id, org_id, urgency } = payload;

  const [itemRes, orgRes] = await Promise.all([
    srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}&select=*`),
    srvFetch(`/rest/v1/organizations?id=eq.${org_id}&select=name`)
  ]);
  const item = (await itemRes.json() as any[])?.[0];
  const org = (await orgRes.json() as any[])?.[0];
  if (!item || !org) throw new Error("Item or org not found");

  const usersRes = await srvFetch(`/rest/v1/user_org_map?org_id=eq.${org_id}&role=in.(admin,editor)&select=user_id`);
  const usersMap = await usersRes.json() as any[];
  if (!usersMap || usersMap.length === 0) return;

  const urgencyLabels: Record<string, string> = { alta: "Urgente", media: "Importante", baja: "Informativa" };
  const urgencyLabel = urgencyLabels[urgency] || "Informativa";

  for (const u of usersMap) {
    await srvFetch("/rest/v1/rpc/create_notification", {
      method: "POST",
      body: JSON.stringify({
        p_user_id: u.user_id, p_org_id: org_id,
        p_type: `radar_norma_${urgency}`, p_title: `Nueva norma ${urgencyLabel.toLowerCase()} aplicable`,
        p_body: (item.title || "").slice(0, 140),
        p_link_module: "radar", p_link_params: { detected_item_id },
        p_icon: urgency === "alta" ? "alert-triangle" : "bell",
        p_severity: urgency === "alta" ? "urgent" : urgency === "media" ? "warning" : "info",
        p_dedup_key: `radar_${detected_item_id}_${u.user_id}`
      })
    });

    const prefRes = await srvFetch(`/rest/v1/notification_preferences?user_id=eq.${u.user_id}&select=email_enabled,email_severity_threshold`);
    const pref = (await prefRes.json() as any[])?.[0];
    const sevOrder: Record<string, number> = { info: 0, warning: 1, urgent: 2, critical: 3 };
    const currentSev = urgency === "alta" ? "urgent" : urgency === "media" ? "warning" : "info";
    const threshold = pref?.email_severity_threshold || "warning";
    const shouldEmail = pref?.email_enabled !== false && (sevOrder[currentSev] ?? 0) >= (sevOrder[threshold] ?? 1);
    if (!shouldEmail) continue;

    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.user_id}`, { headers: srv });
    const userObj = await userRes.json() as any;
    if (!userObj?.email) continue;

    const borderColor = urgency === "alta" ? "#ef4444" : urgency === "media" ? "#f59e0b" : "#3b82f6";
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;"><div style="background:#00c9a7;color:#060c14;padding:16px;border-radius:8px 8px 0 0;"><div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:4px;">VIGÍA Radar Normativo</div><div style="font-size:18px;font-weight:700;">${urgencyLabel}: Nueva norma aplicable</div></div><div style="background:white;padding:20px;border-radius:0 0 8px 8px;border:1px solid #e5e7eb;border-top:none;"><p style="color:#4b5563;font-size:13px;margin:0 0 16px;">Hemos detectado una nueva norma que podría requerir atención de <strong>${org.name}</strong>.</p><div style="background:#f9fafb;padding:14px;border-radius:6px;border-left:3px solid ${borderColor};margin:16px 0;"><div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:6px;">${item.title || ""}</div>${item.excerpt ? `<div style="font-size:12px;color:#6b7280;">${(item.excerpt || "").slice(0, 200)}</div>` : ""}</div><a href="https://vigia-five.vercel.app" style="display:inline-block;background:#00c9a7;color:#060c14;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:700;font-size:13px;">Ver en VIGÍA</a><p style="color:#9ca3af;font-size:11px;margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;">Puedes ajustar tus preferencias de email en VIGÍA. Esta alerta fue generada por el Radar Normativo.</p></div></div>`;

    await srvFetch("/rest/v1/rpc/enqueue_task", {
      method: "POST",
      body: JSON.stringify({
        p_task_type: "email.send",
        p_payload: { to: userObj.email, subject: `[VIGÍA Radar] ${urgencyLabel}: ${(item.title || "").slice(0, 60)}`, html, org_id, recipient_user_id: u.user_id, template_key: `radar_norma_${urgency}` },
        p_priority: urgency === "alta" ? 2 : 5,
        p_dedup_key: `email_radar_${detected_item_id}_${u.user_id}`
      })
    });
  }

  await srvFetch(`/rest/v1/norma_applicability?detected_item_id=eq.${detected_item_id}&org_id=eq.${org_id}`, {
    method: "PATCH", headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ notified_at: new Date().toISOString() })
  });
}

// ===== DISPATCH =====

async function processTask(task: any): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (task.task_type) {
      case "email.send": await handleEmailSend(task.payload); break;
      case "radar.classify_item": await handleClassifyItem(task.payload); break;
      case "radar.match_item": await handleMatchItem(task.payload); break;
      case "radar.resolve_url": await handleResolveUrl(task.payload); break;
      case "radar.notify_applicable": await handleNotifyApplicable(task.payload); break;
      default: throw new Error(`Unknown task_type: ${task.task_type}`);
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronHeader = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) return json({ error: "No autorizado" }, 401);

  try {
    const claimRes = await srvFetch(
      "/rest/v1/task_queue?status=eq.pending&scheduled_for=lte." + new Date().toISOString() +
      "&order=priority.asc,scheduled_for.asc&limit=20&select=id",
      { headers: { Prefer: "return=representation" } }
    );
    const claimed = await claimRes.json() as any[];
    if (!claimed || claimed.length === 0) return json({ ok: true, processed: 0, message: "No pending tasks" });

    const ids = claimed.map(t => t.id);
    await srvFetch(`/rest/v1/task_queue?id=in.(${ids.join(",")})`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "running", started_at: new Date().toISOString() })
    });

    const detailsRes = await srvFetch(`/rest/v1/task_queue?id=in.(${ids.join(",")})&select=*`);
    const tasks = await detailsRes.json() as any[];
    let succeeded = 0, failed = 0;

    for (const task of tasks) {
      const result = await processTask(task);
      if (result.ok) {
        await srvFetch(`/rest/v1/task_queue?id=eq.${task.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: "completed", completed_at: new Date().toISOString(), attempts: (task.attempts || 0) + 1 })
        });
        succeeded++;
      } else {
        const newAttempts = (task.attempts || 0) + 1;
        const isDead = newAttempts >= (task.max_attempts || 3);
        await srvFetch(`/rest/v1/task_queue?id=eq.${task.id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ status: isDead ? "failed" : "pending", attempts: newAttempts, error_message: result.error, scheduled_for: isDead ? undefined : new Date(Date.now() + 60000 * Math.pow(2, newAttempts)).toISOString() })
        });
        failed++;
      }
    }

    return json({ ok: true, processed: tasks.length, succeeded, failed });
  } catch (e) { return json({ error: (e as Error).message }, 500); }
});
