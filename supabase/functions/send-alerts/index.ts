import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const FROM_EMAIL = "onboarding@resend.dev";
const FROM_NAME = "VIGÍA · ENARA Consulting";

const srvHeaders = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json"
};

async function adminReq(path: string) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { headers: srvHeaders });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return []; }
}

async function sendEmail(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: `${FROM_NAME} <${FROM_EMAIL}>`, to, subject, html })
  });
  return res.ok;
}

function emailTemplate(orgName: string, obligations: any[]) {
  const rows = obligations.map(ob => {
    const days = Math.ceil((new Date(ob.due_date).getTime() - Date.now()) / 86400000);
    const color = days < 0 ? "#ef4444" : days <= 7 ? "#f97316" : "#eab308";
    const label = days < 0
      ? `VENCIDA hace ${Math.abs(days)} d\u00edas`
      : days === 0 ? "VENCE HOY"
      : `Vence en ${days} d\u00eda${days !== 1 ? "s" : ""}`;
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;color:#e2e8f0">${ob.obligation_num || "\u2014"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:13px;color:#e2e8f0">${ob.name || "Sin nombre"}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #1e293b;font-size:12px;font-weight:700;color:${color}">${label}</td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#060c14;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px">
    <div style="margin-bottom:24px">
      <div style="display:inline-block;width:36px;height:36px;background:linear-gradient(135deg,#00c9a7,#0a9e82);border-radius:8px;text-align:center;line-height:36px">
        <span style="color:#060c14;font-weight:800;font-size:16px">V</span>
      </div>
      <span style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.03em;margin-left:12px;vertical-align:middle">VIG\u00cdA</span>
      <span style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;margin-left:8px;vertical-align:middle">Inteligencia Regulatoria</span>
    </div>

    <div style="background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:24px;margin-bottom:20px">
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">
        \u26a0\ufe0f Obligaciones que requieren atenci\u00f3n
      </div>
      <div style="font-size:13px;color:#94a3b8;margin-bottom:20px">
        ${orgName} \u00b7 ${obligations.length} obligaci\u00f3n${obligations.length !== 1 ? "es" : ""} pendiente${obligations.length !== 1 ? "s" : ""}
      </div>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1e293b">
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">C\u00f3digo</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Obligaci\u00f3n</th>
            <th style="padding:8px 12px;text-align:left;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.08em">Estado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div style="text-align:center;margin-bottom:20px">
      <a href="https://vigia-five.vercel.app" style="display:inline-block;background:#00c9a7;color:#060c14;font-weight:700;font-size:13px;padding:12px 28px;border-radius:8px;text-decoration:none">
        Ver en VIG\u00cdA \u2192
      </a>
    </div>

    <div style="font-size:10px;color:#475569;text-align:center;line-height:1.6">
      Este email fue generado autom\u00e1ticamente por VIG\u00cdA \u00b7 ENARA Consulting.<br>
      La informaci\u00f3n es de car\u00e1cter informativo para gesti\u00f3n de cumplimiento ambiental.
    </div>
  </div>
</body></html>`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { ...corsHeaders, "Content-Type": "application/json" }
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY no configurada" }, 500);

  let bodyData: any = {};
  try { bodyData = await req.json(); } catch { bodyData = {}; }
  const mode = bodyData?.mode || "vencimiento";

  if (mode === "activacion") {
    try {
      const users = await adminReq("/auth/v1/admin/users?page=1&per_page=100") as any;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const inactiveUsers = (users?.users || []).filter((u: any) => u.last_sign_in_at && u.last_sign_in_at < sevenDaysAgo);
      let sent = 0;
      for (const u of inactiveUsers) {
        const orgMap = await adminReq(`/rest/v1/user_org_map?user_id=eq.${u.id}&select=org_id&limit=1`) as any[];
        if (!Array.isArray(orgMap) || orgMap.length === 0) continue;
        const orgId = orgMap[0].org_id;
        const orgs = await adminReq(`/rest/v1/organizations?id=eq.${orgId}&select=name&limit=1`) as any[];
        const org = Array.isArray(orgs) ? orgs[0] : null;
        if (!org) continue;
        const cutoff = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];
        const obs = await adminReq(`/rest/v1/obligations?org_id=eq.${orgId}&due_date=gte.${today}&due_date=lte.${cutoff}&select=obligation_num,name,due_date&order=due_date.asc&limit=5`) as any[];
        const days = Math.floor((Date.now() - new Date(u.last_sign_in_at).getTime()) / 86400000);
        const userName = u.email?.split("@")[0] || "usuario";
        const obsRows = Array.isArray(obs) && obs.length > 0 ? obs.map((ob: any) => {
          const dLeft = Math.ceil((new Date(ob.due_date).getTime() - Date.now()) / 86400000);
          return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #334155;font-size:12px"><span style="color:#e2e8f0">${ob.obligation_num || ""} ${ob.name || ""}</span><span style="color:${dLeft <= 7 ? "#f97316" : "#eab308"};font-weight:700;flex-shrink:0;margin-left:8px">${dLeft}d</span></div>`;
        }).join("") : "";
        const html = `<!DOCTYPE html><html><body style="margin:0;padding:32px;background:#060c14;font-family:'Helvetica Neue',Arial,sans-serif"><div style="max-width:520px;margin:0 auto"><div style="background:linear-gradient(135deg,#00c9a7,#0a9e82);border-radius:10px 10px 0 0;padding:20px 24px"><div style="font-size:20px;font-weight:800;color:#060c14">VIG\u00cdA</div><div style="font-size:10px;color:#065f46;text-transform:uppercase;letter-spacing:0.1em">Inteligencia Regulatoria</div></div><div style="background:#0f172a;border:1px solid #1e293b;border-top:none;border-radius:0 0 10px 10px;padding:24px"><div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px">Hace ${days} d\u00edas que no entras a VIG\u00cdA</div><div style="font-size:13px;color:#94a3b8;line-height:1.7;margin-bottom:16px">Hola ${userName}, tu plataforma de cumplimiento ambiental para <strong style="color:#e2e8f0">${org.name}</strong> tiene novedades.</div>${obsRows ? `<div style="background:#1e293b;border-radius:8px;padding:12px;margin-bottom:16px"><div style="font-size:10px;font-weight:700;color:#00c9a7;text-transform:uppercase;margin-bottom:8px">Pr\u00f3ximas obligaciones</div>${obsRows}</div>` : ""}<div style="text-align:center"><a href="https://vigia-five.vercel.app" style="display:inline-block;background:#00c9a7;color:#060c14;font-weight:700;font-size:13px;padding:10px 24px;border-radius:8px;text-decoration:none">Ver VIG\u00cdA \u2192</a></div></div></div></body></html>`;
        const ok = await sendEmail(u.email, `Hace ${days} d\u00edas sin entrar \u2014 tienes ${Array.isArray(obs) ? obs.length : 0} obligaciones pr\u00f3ximas`, html);
        if (ok) sent++;
      }
      return json({ ok: true, mode: "activacion", inactive_users: inactiveUsers.length, sent });
    } catch (e) { return json({ error: (e as Error).message }, 500); }
  }

  try {
    const cutoffFuture = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const cutoffPast = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    const obs = await adminReq(
      `/rest/v1/obligations?due_date=gte.${cutoffPast}&due_date=lte.${cutoffFuture}&status=neq.cumplido&status=neq.no_aplica&select=*&order=due_date.asc`
    ) as any[];

    if (!Array.isArray(obs) || obs.length === 0) {
      return json({ ok: true, sent: 0, message: "Sin obligaciones pr\u00f3ximas" });
    }

    const byOrg: Record<string, any[]> = {};
    for (const ob of obs) {
      if (!ob.org_id) continue;
      if (!byOrg[ob.org_id]) byOrg[ob.org_id] = [];
      byOrg[ob.org_id].push(ob);
    }

    let sent = 0;
    const results: any[] = [];

    for (const [orgId, orgObs] of Object.entries(byOrg)) {
      const orgs = await adminReq(
        `/rest/v1/organizations?id=eq.${orgId}&select=name,email_corporativo`
      ) as any[];
      const org = Array.isArray(orgs) ? orgs[0] : null;
      if (!org) continue;

      const userMap = await adminReq(
        `/rest/v1/user_org_map?org_id=eq.${orgId}&select=user_id`
      ) as any[];

      const authUsers = await adminReq("/auth/v1/admin/users?page=1&per_page=100") as any;
      const userIds = new Set((userMap || []).map((u: any) => u.user_id));
      const emails: string[] = (authUsers?.users || [])
        .filter((u: any) => userIds.has(u.id))
        .map((u: any) => u.email)
        .filter(Boolean);

      if (org.email_corporativo && !emails.includes(org.email_corporativo)) {
        emails.push(org.email_corporativo);
      }

      if (emails.length === 0) continue;

      const subject = `\u26a0\ufe0f VIG\u00cdA: ${orgObs.length} obligaci\u00f3n${orgObs.length !== 1 ? "es" : ""} requieren atenci\u00f3n \u2014 ${org.name}`;
      const html = emailTemplate(org.name, orgObs);

      for (const email of emails) {
        const ok = await sendEmail(email, subject, html);
        if (ok) sent++;
        results.push({ org: org.name, email, ok });
      }
    }

    return json({ ok: true, sent, orgs: Object.keys(byOrg).length, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
