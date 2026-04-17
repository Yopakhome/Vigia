import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const SOCRATA_APP_TOKEN = Deno.env.get("SOCRATA_APP_TOKEN") || "";
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

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

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

interface RawItem {
  externalId: string;
  url: string;
  title: string;
  excerpt?: string;
  date?: string;
  raw: any;
}

async function scrape_suin_sodaapi(source: any): Promise<RawItem[]> {
  const config = source.config || {};
  const datasetId = config.dataset_id || "fiev-nid6";
  const envSector = config.env_sector || "Ambiente y Desarrollo Sostenible";
  const materiaKeywords = (config.env_materia_keywords || ["Ambiental"]) as string[];

  const sinceDate = source.last_scan_at
    ? new Date(new Date(source.last_scan_at).getTime() - 3 * 86400000).toISOString()
    : new Date(Date.now() - 90 * 86400000).toISOString();

  const sectorQuery = `$where=${encodeURIComponent(`:created_at > '${sinceDate}' AND (sector = '${envSector}' OR materia like '%Ambiental%'`)})` +
    `&$order=:created_at DESC&$limit=500&$select=:id,:created_at,tipo,n_mero,a_o,sector,subtipo,vigencia,entidad,materia,art_culos`;

  const url = `https://www.datos.gov.co/resource/${datasetId}.json?${sectorQuery}`;

  const headers: Record<string, string> = { "Accept": "application/json" };
  if (SOCRATA_APP_TOKEN) headers["X-App-Token"] = SOCRATA_APP_TOKEN;

  const resp = await fetch(url, { headers });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`SODA API ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const records = await resp.json() as any[];

  const allFromSector = records.filter(r =>
    (r.sector || "").toLowerCase().includes("ambiente") ||
    (r.materia || "").toLowerCase().includes("ambiental") ||
    materiaKeywords.some(k => (r.materia || "").toLowerCase().includes(k.toLowerCase()))
  );

  return allFromSector.map(r => {
    const tipo = r.tipo || "Norma";
    const numero = r.n_mero || "";
    const anio = r.a_o || "";
    const entidad = r.entidad || "Entidad desconocida";
    const rowId = r[":id"] || `${tipo}_${numero}_${anio}`;

    return {
      externalId: rowId,
      url: `https://www.suin-juriscol.gov.co/buscador/resultado?tipo=${encodeURIComponent(tipo)}&numero=${encodeURIComponent(numero)}&anio=${encodeURIComponent(anio)}`,
      title: `${tipo} ${numero} de ${anio} — ${entidad}`,
      excerpt: [
        r.materia ? `Materia: ${r.materia}` : null,
        r.sector ? `Sector: ${r.sector}` : null,
        r.vigencia ? `Vigencia: ${r.vigencia}` : null,
        r.subtipo && r.subtipo !== "NULL" ? `Subtipo: ${r.subtipo}` : null,
      ].filter(Boolean).join(" | "),
      date: anio ? `${anio}-01-01` : undefined,
      raw: r
    };
  });
}

const HANDLERS: Record<string, (source: any) => Promise<RawItem[]>> = {
  scrape_suin_sodaapi,
};

async function ingestItems(sourceId: string, sourceKey: string, items: RawItem[]) {
  if (items.length === 0) return { new: 0, duplicated: 0 };

  let newCount = 0;
  let dupCount = 0;

  for (const item of items) {
    const payload = {
      source_id: sourceId,
      source_key: sourceKey,
      external_id: item.externalId,
      external_url: item.url,
      title: item.title,
      excerpt: item.excerpt,
      detected_date: item.date ? item.date.split("T")[0] : null,
      raw_payload: item.raw,
      status: "detected"
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/detected_items`, {
      method: "POST",
      headers: { ...srv, Prefer: "return=minimal,resolution=ignore-duplicates" },
      body: JSON.stringify(payload)
    });
    if (r.status === 201) newCount++;
    else dupCount++;
  }

  return { new: newCount, duplicated: dupCount };
}

async function enqueueClassificationTasks(sourceKey: string) {
  const pendingRes = await fetch(
    `${SUPABASE_URL}/rest/v1/detected_items?source_key=eq.${sourceKey}&status=eq.detected&select=id&limit=100`,
    { headers: srv }
  );
  const pending = await pendingRes.json() as any[];

  for (const item of (pending || [])) {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/enqueue_task`, {
      method: "POST", headers: srv,
      body: JSON.stringify({
        p_task_type: "radar.classify_item",
        p_payload: { detected_item_id: item.id },
        p_priority: 4,
        p_dedup_key: `classify_${item.id}`
      })
    });
  }

  return (pending || []).length;
}

async function updateSourceStatus(sourceId: string, status: string, error: string | null, itemsDetected: number, itemsNew: number) {
  await fetch(`${SUPABASE_URL}/rest/v1/normative_sources_monitored?id=eq.${sourceId}`, {
    method: "PATCH",
    headers: { ...srv, Prefer: "return=minimal" },
    body: JSON.stringify({
      last_scan_at: new Date().toISOString(),
      last_scan_status: status,
      last_scan_error: error,
      last_scan_items_detected: itemsDetected,
      last_scan_items_new: itemsNew,
      updated_at: new Date().toISOString()
    })
  });
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
    const sourceKey = body.source_key as string | undefined;

    let sourcesQuery = `/rest/v1/normative_sources_monitored?enabled=eq.true&select=*&order=priority.asc`;
    if (sourceKey) {
      sourcesQuery = `/rest/v1/normative_sources_monitored?source_key=eq.${sourceKey}&select=*`;
    }

    const sourcesRes = await fetch(`${SUPABASE_URL}${sourcesQuery}`, { headers: srv });
    const sources = await sourcesRes.json() as any[];
    const results: any[] = [];

    for (const source of sources) {
      const handler = HANDLERS[source.scrape_strategy];
      if (!handler) {
        results.push({ source_key: source.source_key, ok: false, error: `No handler: ${source.scrape_strategy}` });
        await updateSourceStatus(source.id, "failed", `No handler: ${source.scrape_strategy}`, 0, 0);
        continue;
      }

      try {
        const items = await handler(source);
        const { new: newCount, duplicated } = await ingestItems(source.id, source.source_key, items);
        const enqueued = await enqueueClassificationTasks(source.source_key);
        await updateSourceStatus(source.id, "success", null, items.length, newCount);

        results.push({
          source_key: source.source_key, ok: true,
          detected: items.length, new: newCount, duplicated,
          classification_enqueued: enqueued
        });
      } catch (e) {
        const errorMsg = (e as Error).message;
        await updateSourceStatus(source.id, "failed", errorMsg, 0, 0);
        results.push({ source_key: source.source_key, ok: false, error: errorMsg });
      }
    }

    return json({ ok: true, results });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
