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

async function tryHead(url: string, timeoutMs = 3000): Promise<boolean> {
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

// CAPA 0: Corpus propio (normative_sources)
async function lookupInCorpus(tipo: string, numero: string, ano: string): Promise<{
  source_url: string | null; corpus_source: string | null; corpus_id: string | null;
} | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/normative_sources?norm_type=ilike.${encodeURIComponent(tipo.toLowerCase())}&norm_number=eq.${encodeURIComponent(numero)}&norm_year=eq.${ano}&select=id,source_url,corpus_source&limit=1`,
      { headers: srv }
    );
    if (!r.ok) return null;
    const rows = await r.json() as any[];
    if (!rows?.[0]?.source_url) return null;
    return { source_url: rows[0].source_url, corpus_source: rows[0].corpus_source, corpus_id: rows[0].id };
  } catch { return null; }
}

// CAPA 1: ANLA Eureka scrape listado
async function tryAnlaEureka(tipo: string, numero: string, ano: string): Promise<string | null> {
  const tipoPlural: Record<string, string> = { LEY: "leyes", DECRETO: "decretos", RESOLUCION: "resoluciones" };
  const section = tipoPlural[tipo];
  if (!section) return null;

  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r = await fetch(`https://www.anla.gov.co/eureka/normativa/${section}`, { signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const html = await r.text();

    const pattern = new RegExp(`/eureka/normativa/${section}/[^"]*-${numero}-de-${ano}[^"]*`, "i");
    const match = html.match(pattern);
    if (match) {
      const url = `https://www.anla.gov.co${match[0]}`;
      return url;
    }
  } catch {}
  return null;
}

// CAPA 2: Secretaría del Senado
async function trySenado(tipo: string, num: string, year: string): Promise<string | null> {
  const prefix = tipo === "LEY" ? "ley" : tipo === "ACTO LEGISLATIVO" ? "acto_legislativo" : tipo === "DECRETO" ? "decreto" : null;
  if (!prefix) return null;
  const urls = [
    `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num}_${year}.html`,
    `http://www.secretariasenado.gov.co/senado/basedoc/${prefix}_${num.padStart(4, "0")}_${year}.html`,
  ];
  for (const url of urls) {
    if (await tryHead(url)) return url;
  }
  return null;
}

// CAPA 3: Google btnI → SUIN directo
async function tryBtnIRedirect(tipo: string, num: string, year: string): Promise<string | null> {
  const query = `site:suin-juriscol.gov.co ${tipo} ${num} ${year}`;
  const btnIUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&btnI=1`;
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r = await fetch(btnIUrl, { redirect: "manual", signal: c.signal });
    clearTimeout(t);
    const loc = r.headers.get("location") || "";
    if (loc.includes("google.com/url?q=")) {
      const m = loc.match(/[?&]q=([^&]+)/);
      if (m) {
        const decoded = decodeURIComponent(m[1]);
        if (decoded.includes("suin-juriscol.gov.co/viewDocument")) {
          if (await tryHead(decoded)) return decoded;
        }
      }
    }
  } catch {}
  return null;
}

function buildGoogleFallback(tipo: string, numero: string, ano: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:suin-juriscol.gov.co ${tipo} ${numero} ${ano}`)}`;
}

type Resolution = { url: string; source: string; corpus_id?: string };

async function resolveUrl(tipo: string, numero: string, ano: string): Promise<Resolution> {
  const tipoUpper = (tipo || "").toUpperCase().trim();
  const num = (numero || "").replace(/[^0-9]/g, "");
  const year = (ano || "").replace(/[^0-9]/g, "");
  if (!num || !year) return { url: buildGoogleFallback(tipoUpper, num, year), source: "google_suin" };

  // CAPA 0: Corpus propio
  const corpus = await lookupInCorpus(tipoUpper, num, year);
  if (corpus?.source_url) {
    if (await tryHead(corpus.source_url, 2000)) {
      return { url: corpus.source_url, source: `corpus_${corpus.corpus_source}`, corpus_id: corpus.corpus_id || undefined };
    }
  }

  // CAPA 1: ANLA Eureka scrape
  const anla = await tryAnlaEureka(tipoUpper, num, year);
  if (anla) return { url: anla, source: "anla_eureka" };

  // CAPA 2: Senado
  if (["LEY", "ACTO LEGISLATIVO", "DECRETO"].includes(tipoUpper)) {
    const senado = await trySenado(tipoUpper, num, year);
    if (senado) return { url: senado, source: "secretariasenado" };
  }

  // CAPA 3: Google btnI → SUIN
  const suin = await tryBtnIRedirect(tipoUpper, num, year);
  if (suin) return { url: suin, source: "suin_directo" };

  // CAPA 4: Google fallback
  return { url: buildGoogleFallback(tipoUpper, num, year), source: "google_suin" };
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

    const patch: Record<string, any> = {
      resolved_official_url: result.url,
      url_resolution_source: result.source,
      url_resolved_at: new Date().toISOString()
    };
    if (result.corpus_id) patch.promoted_to_source_id = result.corpus_id;

    await fetch(`${SUPABASE_URL}/rest/v1/detected_items?id=eq.${detectedItemId}`, {
      method: "PATCH",
      headers: { ...srv, Prefer: "return=minimal" },
      body: JSON.stringify(patch)
    });

    return json({ ok: true, url: result.url, source: result.source, corpus_linked: !!result.corpus_id });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
