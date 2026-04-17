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

async function tryHead(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), timeoutMs);
    const r = await fetch(url, { method: "HEAD", signal: c.signal, redirect: "follow" });
    clearTimeout(t);
    if (!r.ok) return false;
    const ct = r.headers.get("content-type") || "";
    return ct.includes("text/html") || ct.includes("application/pdf");
  } catch { return false; }
}

async function tryBtnIRedirect(tipo: string, num: string, year: string): Promise<string | null> {
  const query = `site:suin-juriscol.gov.co ${tipo} ${num} ${year}`;
  const btnIUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&btnI=1`;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    const r = await fetch(btnIUrl, { redirect: "manual", signal: c.signal });
    clearTimeout(t);

    const loc = r.headers.get("location") || "";
    if (loc.includes("google.com/url?q=")) {
      const match = loc.match(/[?&]q=([^&]+)/);
      if (match) {
        const decoded = decodeURIComponent(match[1]);
        if (decoded.includes("suin-juriscol.gov.co/viewDocument")) {
          if (await tryHead(decoded)) return decoded;
        }
      }
    }

    if (r.status >= 200 && r.status < 400) {
      const body = await r.text();
      const urlMatch = body.match(/suin-juriscol\.gov\.co\/viewDocument\.asp\?[^"'\s<>]+/);
      if (urlMatch) {
        const candidate = `https://www.${urlMatch[0]}`;
        if (await tryHead(candidate)) return candidate;
      }
    }
  } catch {}
  return null;
}

type Resolution = { url: string; source: string };

async function resolveUrl(tipo: string, numero: string, ano: string): Promise<Resolution> {
  const tipoUpper = (tipo || "").toUpperCase().trim();
  const num = (numero || "").replace(/[^0-9]/g, "");
  const year = (ano || "").replace(/[^0-9]/g, "");

  if (!num || !year) {
    return { url: buildGoogleFallback(tipoUpper, num, year), source: "google_suin" };
  }

  // Level 1: Secretaría del Senado (LEY, ACTO LEGISLATIVO — highly reliable)
  if (tipoUpper === "LEY" || tipoUpper === "ACTO LEGISLATIVO") {
    const prefix = tipoUpper === "LEY" ? "ley" : "acto_legislativo";
    const urls = [
      `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num}_${year}.html`,
      `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num.padStart(4, "0")}_${year}.html`,
    ];
    for (const url of urls) {
      if (await tryHead(url)) return { url, source: "secretariasenado" };
    }
  }

  // Level 2: Secretaría del Senado (DECRETO — inconsistent but worth trying)
  if (tipoUpper === "DECRETO") {
    const urls = [
      `http://www.secretariasenado.gov.co/senado/basedoc/decreto_${num}_${year}.html`,
      `http://www.secretariasenado.gov.co/senado/basedoc/decreto_${num.padStart(4, "0")}_${year}.html`,
    ];
    for (const url of urls) {
      if (await tryHead(url)) return { url, source: "secretariasenado" };
    }
  }

  // Level 3: Google btnI → extract SUIN viewDocument URL
  const suinDirect = await tryBtnIRedirect(tipoUpper, num, year);
  if (suinDirect) return { url: suinDirect, source: "suin_directo" };

  // Level 4: Google scoped fallback (always works)
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
    const result = await resolveUrl(rp.tipo || "", rp.n_mero || "", rp.a_o || "");

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
