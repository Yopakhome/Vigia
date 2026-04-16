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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);
  const email = (user.email || "").toLowerCase();
  if (!SUPERADMIN_EMAILS.includes(email)) return json({ error: "Requiere SuperAdmin" }, 403);

  try {
    const thresholds = [
      { days: 7, type: "due_7d", title: "Vence en 7 días", severity: "info" },
      { days: 3, type: "due_3d", title: "Vence en 3 días", severity: "warning" },
      { days: 1, type: "due_1d", title: "Vence mañana", severity: "urgent" },
      { days: 0, type: "due_today", title: "Vence hoy", severity: "urgent" },
    ];

    let totalCreated = 0;

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
        }
      }
    }

    // Vencidas — solo lunes
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
        }
      }
    }

    return json({ ok: true, created: totalCreated });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
