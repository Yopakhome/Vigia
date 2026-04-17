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

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

type MatchResult = {
  applies: boolean;
  score: number;
  urgency: "alta" | "media" | "baja";
  reasons: Array<{ factor: string; detail: string; weight: number }>;
};

async function matchNormaToOrg(item: any, org: any): Promise<MatchResult> {
  const reasons: MatchResult["reasons"] = [];
  let score = 0;

  const classification = item.classification || {};
  const sectorsNorma: string[] = classification.sector_aplicable || [];
  const authoritySlug: string | null = classification.authority_slug || null;
  const category: string = classification.category || "otra";
  const urgencySignalNorma: string = classification.urgency_signal || "baja";

  const orgSector: string | null = org.sector || null;
  const orgAreas: any[] = Array.isArray(org.operation_areas) ? org.operation_areas : [];

  if (sectorsNorma.length > 0 && orgSector) {
    if (sectorsNorma.includes("todos")) {
      score += 0.35;
      reasons.push({ factor: "sector", detail: `Norma aplica a todos los sectores, incluye ${orgSector}`, weight: 0.35 });
    } else if (sectorsNorma.map(s => s.toLowerCase()).includes(orgSector.toLowerCase())) {
      score += 0.50;
      reasons.push({ factor: "sector", detail: `Norma aplica específicamente al sector '${orgSector}'`, weight: 0.50 });
    }
  } else if (!orgSector) {
    score += 0.15;
    reasons.push({ factor: "sector", detail: "Sector de la organización no definido, se asume posible aplicabilidad", weight: 0.15 });
  }

  if (authoritySlug) {
    const authRes = await srvFetch(`/rest/v1/environmental_authorities?slug=eq.${authoritySlug}&select=slug,full_name,authority_type,scope_geographic&limit=1`);
    const auths = await authRes.json() as any[];
    const auth = auths?.[0];

    if (auth) {
      if (auth.authority_type === "ministerio" || auth.authority_type === "autoridad_nacional") {
        score += 0.25;
        reasons.push({ factor: "authority_national", detail: `Norma emitida por ${auth.full_name} (alcance nacional)`, weight: 0.25 });
      } else if (auth.authority_type === "car_regional" || auth.authority_type === "autoridad_urbana") {
        const authScope = auth.scope_geographic || "";
        const matchesArea = orgAreas.some((area: any) =>
          area.authority_slug === authoritySlug ||
          (area.department && authScope.includes(area.department)) ||
          (area.municipality && authScope.includes(area.municipality))
        );
        if (matchesArea) {
          score += 0.40;
          reasons.push({ factor: "authority_regional_match", detail: `Norma emitida por ${auth.full_name}, autoridad de zona donde opera la empresa`, weight: 0.40 });
        } else {
          score -= 0.20;
          reasons.push({ factor: "authority_regional_mismatch", detail: `Norma emitida por ${auth.full_name}, no corresponde a las áreas de operación declaradas`, weight: -0.20 });
        }
      } else if (auth.authority_type === "instituto_investigacion" || auth.authority_type === "parque_nacional") {
        score += 0.15;
        reasons.push({ factor: "authority_technical", detail: `Norma de ${auth.full_name}, relevante según ubicación específica de operaciones`, weight: 0.15 });
      }
    }
  }

  if (["licenciamiento", "sanciones", "general_ambiental"].includes(category)) {
    score += 0.10;
    reasons.push({ factor: "category_universal", detail: `Categoría '${category}' típicamente aplica a todas las empresas obligadas ambientalmente`, weight: 0.10 });
  }

  score = Math.max(0, Math.min(1, score));
  const applies = score >= 0.40;

  let urgency: "alta" | "media" | "baja" = "baja";
  if (applies) {
    if (urgencySignalNorma === "alta" && score >= 0.60) urgency = "alta";
    else if (urgencySignalNorma === "alta" || score >= 0.70) urgency = "media";
    else urgency = "baja";
  }

  return { applies, score: Math.round(score * 100) / 100, urgency, reasons };
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
    const detectedItemId = body?.detected_item_id || null;
    const batchLimit = Math.min(body?.batch_limit || 20, 50);

    let items: any[];
    if (detectedItemId) {
      const r = await srvFetch(`/rest/v1/detected_items?id=eq.${detectedItemId}&select=*`);
      items = await r.json() as any[];
    } else {
      const r = await srvFetch(`/rest/v1/detected_items?status=eq.classified&select=*&limit=${batchLimit}&order=classified_at.asc`);
      items = await r.json() as any[];
    }

    if (!items || items.length === 0) {
      return json({ ok: true, processed: 0, message: "No items to match" });
    }

    const orgsRes = await srvFetch(`/rest/v1/organizations?select=id,name,sector,operation_areas`);
    const orgs = await orgsRes.json() as any[];

    let totalMatches = 0;
    let totalApplicable = 0;

    for (const item of items) {
      for (const org of orgs) {
        const existsRes = await srvFetch(`/rest/v1/norma_applicability?detected_item_id=eq.${item.id}&org_id=eq.${org.id}&select=id`);
        const exists = await existsRes.json() as any[];
        if (exists && exists.length > 0) continue;

        const match = await matchNormaToOrg(item, org);

        await srvFetch("/rest/v1/norma_applicability", {
          method: "POST",
          headers: { Prefer: "return=minimal,resolution=ignore-duplicates" },
          body: JSON.stringify({
            detected_item_id: item.id,
            org_id: org.id,
            applicability_score: match.score,
            applies: match.applies,
            urgency: match.urgency,
            match_reasons: match.reasons,
            client_status: match.applies ? "nuevo" : "archivado"
          })
        });

        totalMatches++;
        if (match.applies) {
          totalApplicable++;

          await srvFetch("/rest/v1/events", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify({
              event_type: "radar.norma_applicable",
              event_source: "radar",
              org_id: org.id,
              entity_type: "detected_item",
              entity_id: item.id,
              payload: { title: item.title, urgency: match.urgency, score: match.score, reasons_count: match.reasons.length },
              severity: match.urgency === "alta" ? "warning" : "info"
            })
          });

          if (match.urgency !== "baja") {
            await srvFetch("/rest/v1/rpc/enqueue_task", {
              method: "POST",
              body: JSON.stringify({
                p_task_type: "radar.notify_applicable",
                p_payload: { detected_item_id: item.id, org_id: org.id, urgency: match.urgency },
                p_priority: match.urgency === "alta" ? 2 : 5,
                p_dedup_key: `notify_${item.id}_${org.id}`
              })
            });
          }
        }
      }
    }

    return json({ ok: true, items_processed: items.length, orgs_evaluated: orgs.length, total_matches_created: totalMatches, applicable_matches: totalApplicable });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
