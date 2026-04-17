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
  status: s,
  headers: { ...cors, "Content-Type": "application/json" }
});

const srv = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

async function srvFetch(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { ...srv, ...(init.headers || {}) }
  });
}

async function handleEmailSend(payload: any): Promise<void> {
  const { to, subject, html, org_id, recipient_user_id, template_key } = payload;
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY missing");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "VIGÍA <notificaciones@vigia.enaraconsulting.com.co>",
      to: [to],
      subject,
      html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend ${res.status}: ${err}`);
  }

  const data = await res.json();

  await srvFetch("/rest/v1/email_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      org_id,
      recipient_email: to,
      recipient_user_id,
      subject,
      template_key,
      resend_id: data.id,
      status: "sent",
      payload
    })
  });
}

async function handleClassifyItem(payload: any): Promise<void> {
  const { detected_item_id } = payload;
  const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

  const itemRes = await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}&select=*`);
  const items = await itemRes.json() as any[];
  const item = items?.[0];
  if (!item) throw new Error(`Item not found: ${detected_item_id}`);

  await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ status: "classifying" })
  });

  const prompt = `Eres un experto en derecho ambiental colombiano. Analiza si la siguiente norma es relevante para el dominio ambiental y clasifícala.

NORMA:
Título: ${item.title}
Extracto: ${item.excerpt || "(sin extracto)"}
Fuente: ${item.source_key}

Responde EXCLUSIVAMENTE en JSON válido (sin markdown, sin explicación previa):

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
- Si la norma NO tiene relación directa con medio ambiente, recursos naturales, o regulación ambiental sectorial, marcar is_environmental: false
- "urgency_signal: alta" solo si la norma establece obligaciones nuevas con plazo corto o sanciones relevantes
- sector_aplicable puede ser múltiple; si aplica a todos los sectores industriales, usar ["todos"]
- Sé conservador: en duda, is_environmental: false es mejor que falso positivo`;

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!claudeRes.ok) throw new Error(`Claude classification failed: ${claudeRes.status}`);

  const claudeData = await claudeRes.json();
  const raw = claudeData.content?.[0]?.text || "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("LLM returned invalid JSON");

  const classification = JSON.parse(match[0]);
  const newStatus = classification.is_environmental ? "classified" : "discarded";

  await srvFetch(`/rest/v1/detected_items?id=eq.${detected_item_id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: newStatus,
      classification,
      classified_at: new Date().toISOString(),
      discard_reason: classification.is_environmental ? null : (classification.reasoning_brief || "Not environmental")
    })
  });

  if (classification.is_environmental) {
    await srvFetch("/rest/v1/events", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        event_type: "radar.norma_detected",
        event_source: "radar",
        entity_type: "detected_item",
        entity_id: detected_item_id,
        payload: {
          title: item.title,
          url: item.external_url,
          category: classification.category,
          urgency_signal: classification.urgency_signal,
          sectors: classification.sector_aplicable,
          source_key: item.source_key
        },
        severity: classification.urgency_signal === "alta" ? "warning" : "info"
      })
    });
  }
}

async function processTask(task: any): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (task.task_type) {
      case "email.send":
        await handleEmailSend(task.payload);
        break;
      case "radar.classify_item":
        await handleClassifyItem(task.payload);
        break;
      default:
        throw new Error(`Unknown task_type: ${task.task_type}`);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronHeader = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
    return json({ error: "No autorizado" }, 401);
  }

  try {
    const claimRes = await srvFetch(
      "/rest/v1/task_queue?status=eq.pending&scheduled_for=lte." + new Date().toISOString() +
      "&order=priority.asc,scheduled_for.asc&limit=20&select=id",
      { headers: { Prefer: "return=representation" } }
    );
    const claimed = await claimRes.json() as any[];

    if (!claimed || claimed.length === 0) {
      return json({ ok: true, processed: 0, message: "No pending tasks" });
    }

    const ids = claimed.map(t => t.id);
    await srvFetch(
      `/rest/v1/task_queue?id=in.(${ids.join(",")})`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "running",
          started_at: new Date().toISOString()
        })
      }
    );

    const detailsRes = await srvFetch(
      `/rest/v1/task_queue?id=in.(${ids.join(",")})&select=*`
    );
    const tasks = await detailsRes.json() as any[];

    let succeeded = 0;
    let failed = 0;

    for (const task of tasks) {
      const result = await processTask(task);

      if (result.ok) {
        await srvFetch(
          `/rest/v1/task_queue?id=eq.${task.id}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "completed",
              completed_at: new Date().toISOString(),
              attempts: (task.attempts || 0) + 1
            })
          }
        );
        succeeded++;
      } else {
        const newAttempts = (task.attempts || 0) + 1;
        const isDead = newAttempts >= (task.max_attempts || 3);
        await srvFetch(
          `/rest/v1/task_queue?id=eq.${task.id}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              status: isDead ? "failed" : "pending",
              attempts: newAttempts,
              error_message: result.error,
              scheduled_for: isDead ? undefined : new Date(Date.now() + 60000 * Math.pow(2, newAttempts)).toISOString()
            })
          }
        );
        failed++;
      }
    }

    return json({ ok: true, processed: tasks.length, succeeded, failed });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
