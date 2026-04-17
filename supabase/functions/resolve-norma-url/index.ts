import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
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

async function tryUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    clearTimeout(timeout);
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") || "";
    return ct.includes("text/html") || ct.includes("application/pdf");
  } catch { return false; }
}

type Resolution = { url: string; source: string };

async function resolveUrl(tipo: string, numero: string, ano: string, _authoritySlug: string | null): Promise<Resolution> {
  const tipoUpper = (tipo || "").toUpperCase().trim();
  const num = (numero || "").replace(/[^0-9]/g, "");
  const year = (ano || "").replace(/[^0-9]/g, "");

  if (!num || !year) {
    return { url: buildGoogleFallback(tipoUpper, num, year), source: "google_suin" };
  }

  // Level 1: Secretaría del Senado (works reliably for LEY and ACTO LEGISLATIVO)
  if (tipoUpper === "LEY" || tipoUpper === "ACTO LEGISLATIVO") {
    const prefix = tipoUpper === "LEY" ? "ley" : "acto_legislativo";
    const candidates = [
      `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num}_${year}.html`,
      `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num.padStart(4, "0")}_${year}.html`,
    ];
    for (const url of candidates) {
      if (await tryUrl(url)) return { url, source: "secretariasenado" };
    }
  }

  // Level 2: Secretaría del Senado for DECRETO (inconsistent but worth trying)
  if (tipoUpper === "DECRETO") {
    const candidates = [
      `http://www.secretariasenado.gov.co/senado/basedoc/decreto_${num}_${year}.html`,
      `http://www.secretariasenado.gov.co/senado/basedoc/decreto_${num.padStart(4, "0")}_${year}.html`,
    ];
    for (const url of candidates) {
      if (await tryUrl(url)) return { url, source: "secretariasenado" };
    }
  }

  // Level 3: SUIN viewDocument (if we had the ID — skip for now, no ID available)

  // Level 4: Google scoped to SUIN (universal fallback, always returns 200)
  return { url: buildGoogleFallback(tipoUpper, num, year), source: "google_suin" };
}

function buildGoogleFallback(tipo: string, numero: string, ano: string): string {
  const query = `site:suin-juriscol.gov.co ${tipo} ${numero} ${ano}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const cronHeader = req.headers.get("x-cron-secret");
  let authorized = false;
  if (CRON_SECRET && cronHeader === CRON_SECRET) { authorized = true; }
  else {
    const user = await verifyUser(req.headers.get("Authorization"));
    if (user) {
      const email = (user.email || "").toLowerCase();
      if (SUPERADMIN_EMAILS.includes(email)) authorized = true;
    }
  }
  if (!authorized) return json({ error: "No autorizado" }, 401);

  try {
    const body = await req.json().catch(() => ({}));
    const detectedItemId = body?.detected_item_id;

    if (!detectedItemId) return json({ error: "detected_item_id required" }, 400);

    const itemRes = await fetch(`${SUPABASE_URL}/rest/v1/detected_items?id=eq.${detectedItemId}&select=id,raw_payload,classification,resolved_official_url`, { headers: srv });
    const items = await itemRes.json() as any[];
    const item = items?.[0];
    if (!item) return json({ error: "Item not found" }, 404);

    if (item.resolved_official_url) {
      return json({ ok: true, url: item.resolved_official_url, source: "cached", skipped: true });
    }

    const rp = item.raw_payload || {};
    const tipo = rp.tipo || "";
    const numero = rp.n_mero || "";
    const ano = rp.a_o || "";
    const authoritySlug = item.classification?.authority_slug || null;

    const result = await resolveUrl(tipo, numero, ano, authoritySlug);

    await fetch(`${SUPABASE_URL}/rest/v1/detected_items?id=eq.${detectedItemId}`, {
      method: "PATCH",
      headers: { ...srv, Prefer: "return=minimal" },
      body: JSON.stringify({
        resolved_official_url: result.url,
        url_resolution_source: result.source,
        url_resolved_at: new Date().toISOString()
      })
    });

    return json({ ok: true, url: result.url, source: result.source });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
