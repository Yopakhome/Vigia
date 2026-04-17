import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function srvGet(path: string) {
  const r = await fetch(`${SUPABASE_URL}${path}`, { headers: srv });
  return r.ok ? await r.json() : [];
}

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

const severityOrder: Record<string, number> = { info: 0, warning: 1, urgent: 2, critical: 3 };

async function maybeEnqueueEmail(uid: string, orgId: string, title: string, body: string, severity: string, type: string, obligationId: string) {
  const prefRes = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${uid}&select=email_enabled,email_severity_threshold`,
    { headers: srv }
  );
  const prefs = await prefRes.json() as any[];
  const pref = prefs?.[0];

  const shouldEmail = pref?.email_enabled !== false &&
    ((severityOrder[severity] ?? 0) >= (severityOrder[pref?.email_severity_threshold || "warning"] ?? 1));

  if (!shouldEmail) return;

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${uid}`, { headers: srv });
  const user = await userRes.json() as any;
  if (!user?.email) return;

  const emailHtml = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#00c9a7;">VIGÍA — ${title}</h2>
      <p style="color:#333;font-size:14px;">${body.slice(0, 200)}</p>
      <a href="https://vigia-five.vercel.app"
         style="display:inline-block;background:#00c9a7;color:#060c14;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:bold;margin-top:16px;">
        Abrir en VIGÍA
      </a>
      <p style="color:#888;font-size:11px;margin-top:24px;">
        Puedes ajustar tus preferencias de email en VIGÍA &rarr; Perfil &rarr; Notificaciones
      </p>
    </div>
  `;

  const today = new Date().toISOString().split("T")[0];
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/enqueue_task`, {
    method: "POST", headers: srv,
    body: JSON.stringify({
      p_task_type: "email.send",
      p_payload: {
        to: user.email,
        subject: `VIGÍA · ${title}: ${body.slice(0, 60)}`,
        html: emailHtml,
        org_id: orgId,
        recipient_user_id: uid,
        template_key: `obligation_${type}`
      },
      p_priority: severity === "urgent" || severity === "critical" ? 2 : 5,
      p_dedup_key: `email_${type}_${obligationId}_${uid}_${today}`
    })
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  const cronHeader = req.headers.get("x-cron-secret");
  let authorized = false;
  if (CRON_SECRET && cronHeader === CRON_SECRET) { authorized = true; }
  else {
    const user = await verifyUser(req.headers.get("Authorization"));
    if (user) { const email = (user.email || "").toLowerCase(); if (SUPERADMIN_EMAILS.includes(email)) authorized = true; }
  }
  if (!authorized) return json({ error: "No autorizado" }, 401);

  try {
    const thresholds = [
      { days: 7, type: "due_7d", title: "Vence en 7 días", severity: "info" },
      { days: 3, type: "due_3d", title: "Vence en 3 días", severity: "warning" },
      { days: 1, type: "due_1d", title: "Vence mañana", severity: "urgent" },
      { days: 0, type: "due_today", title: "Vence hoy", severity: "urgent" },
    ];

    let totalCreated = 0;
    let emailsEnqueued = 0;

    for (const t of thresholds) {
      const target = new Date();
      target.setDate(target.getDate() + t.days);
      const dateStr = target.toISOString().split("T")[0];

      const obs = await srvGet(
        `/rest/v1/obligations?due_date=eq.${dateStr}&work_status=not.in.(cumplida,no_aplica)&select=id,org_id,name,description,assigned_to,instrument_id`
      ) as any[];

      for (const o of (obs || [])) {
        let recipients: string[] = [];
        if (o.assigned_to) {
          recipients = [o.assigned_to];
        } else {
          const admins = await srvGet(`/rest/v1/user_org_map?org_id=eq.${o.org_id}&role=in.(admin,editor)&select=user_id`) as any[];
          recipients = (admins || []).map((a: any) => a.user_id);
        }

        for (const uid of recipients) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_notification`, {
            method: "POST", headers: srv,
            body: JSON.stringify({
              p_user_id: uid, p_org_id: o.org_id,
              p_type: `obligation_${t.type}`, p_title: t.title,
              p_body: (o.name || o.description || "Obligación").slice(0, 120),
              p_link_module: "edi-detail",
              p_link_params: { obligation_id: o.id, instrument_id: o.instrument_id },
              p_icon: "alarm-clock", p_severity: t.severity,
              p_dedup_key: `${t.type}_${o.id}`
            })
          });
          if (r.ok) { const d = await r.json(); if (d) totalCreated++; }

          await maybeEnqueueEmail(uid, o.org_id, t.title, o.name || o.description || "Obligación", t.severity, t.type, o.id);
          emailsEnqueued++;
        }
      }
    }

    if (new Date().getDay() === 1) {
      const todayStr = new Date().toISOString().split("T")[0];
      const overdue = await srvGet(
        `/rest/v1/obligations?due_date=lt.${todayStr}&work_status=not.in.(cumplida,no_aplica)&select=id,org_id,name,description,assigned_to,instrument_id`
      ) as any[];
      const weekTag = Math.floor(Date.now() / (7 * 86400000));
      for (const o of (overdue || [])) {
        const recipients = o.assigned_to ? [o.assigned_to] :
          ((await srvGet(`/rest/v1/user_org_map?org_id=eq.${o.org_id}&role=in.(admin,editor)&select=user_id`) as any[]) || []).map((a: any) => a.user_id);
        for (const uid of recipients) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/create_notification`, {
            method: "POST", headers: srv,
            body: JSON.stringify({
              p_user_id: uid, p_org_id: o.org_id,
              p_type: "obligation_overdue", p_title: "Obligación vencida sin cumplir",
              p_body: (o.name || o.description || "Obligación").slice(0, 120),
              p_link_module: "edi-detail",
              p_link_params: { obligation_id: o.id, instrument_id: o.instrument_id },
              p_icon: "alert-triangle", p_severity: "urgent",
              p_dedup_key: `overdue_w${weekTag}_${o.id}`
            })
          });
          if (r.ok) { const d = await r.json(); if (d) totalCreated++; }

          await maybeEnqueueEmail(uid, o.org_id, "Obligación vencida sin cumplir", o.name || o.description || "Obligación", "urgent", "overdue", o.id);
          emailsEnqueued++;
        }
      }
    }

    return json({ ok: true, created: totalCreated, emails_enqueued: emailsEnqueued });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
