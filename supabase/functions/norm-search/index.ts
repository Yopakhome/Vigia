import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

async function embedQuery(q: string): Promise<number[]> {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: q.slice(0, 24000) })
  });
  if (!r.ok) throw new Error(`OpenAI embeddings → ${r.status}: ${(await r.text()).slice(0,200)}`);
  const data = await r.json();
  return data.data[0].embedding;
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function matchNormative(embedding: number[], top_k: number, filters: any) {
  const body = {
    query_embedding: embedding, match_count: top_k,
    filter_scope: filters?.scope || null,
    filter_norm_type: filters?.norm_type || null,
    filter_min_year: filters?.min_year || null,
    filter_max_year: filters?.max_year || null,
    filter_sectors: filters?.applies_to_sectors || null
  };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_normative_articles`, {
    method: "POST", headers: srv, body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`normative rpc → ${r.status}`);
  return r.json();
}

async function matchJurisprudence(embedding: number[], top_k: number) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_jurisprudence_articles`, {
    method: "POST", headers: srv,
    body: JSON.stringify({ query_embedding: embedding, match_count: top_k })
  });
  if (!r.ok) return [];
  return r.json();
}

async function matchEurekaResumen(embedding: number[], top_k: number) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_eureka_resumen`, {
    method: "POST", headers: srv,
    body: JSON.stringify({ query_embedding: embedding, match_count: top_k })
  });
  if (!r.ok) return [];
  return r.json();
}

async function matchOrgDocs(embedding: number[], top_k: number, orgId: string) {
  // Busca en documents con embedding del org del usuario
  const url = `${SUPABASE_URL}/rest/v1/documents?select=id,name,doc_type_detected,category,format_type,raw_text,uploaded_at&org_id=eq.${orgId}&embedding=not.is.null&limit=${top_k}`;
  const r = await fetch(url, { headers: srv });
  if (!r.ok) return [];
  // Sin RPC vectorial dedicado aún — retornamos los docs más recientes como fallback.
  // TODO: crear match_org_documents RPC en próxima iteración.
  return r.json();
}

async function getUserOrgId(userId: string): Promise<string | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/user_org_map?user_id=eq.${userId}&select=org_id&limit=1`, { headers: srv });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows?.[0]?.org_id || null;
}

const CONTENT_TRUNC = 1500;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY no configurada" }, 500);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { query, top_k = 10, filters = {}, include_jur = true, include_eureka = true, include_org = true, include_pedagogico = false } = body || {};
  if (!query || typeof query !== "string" || query.trim().length < 3) return json({ error: "Query vacía o demasiado corta" }, 400);

  const t0 = Date.now();
  try {
    const embedding = await embedQuery(query);

    // Si NO se incluye la capa pedagógica, obtener IDs de normas pedagógicas + circulares para excluirlos después del RPC
    let excluded_norm_ids: string[] = [];
    if (!include_pedagogico) {
      try {
        const rx = await fetch(`${SUPABASE_URL}/rest/v1/normative_sources?select=id&or=(corpus_source.eq.pedagogico,norm_type.eq.circular)`, { headers: srv });
        if (rx.ok) {
          const rows = await rx.json();
          excluded_norm_ids = (rows || []).map((n: any) => n.id);
        }
      } catch { /* si falla el fetch, no filtramos */ }
    }

    // Consultas en paralelo
    const topK = Math.min(Math.max(top_k, 1), 50);
    const jurTopK = Math.max(2, Math.floor(topK * 0.3));
    const euTopK = Math.max(2, Math.floor(topK * 0.2));

    const promises: Promise<any>[] = [matchNormative(embedding, topK, filters)];
    if (include_jur) promises.push(matchJurisprudence(embedding, jurTopK));
    if (include_eureka) promises.push(matchEurekaResumen(embedding, euTopK));

    const [normRows, jurRows, euRows] = await Promise.all([
      promises[0],
      include_jur ? promises[1] : Promise.resolve([]),
      include_eureka ? promises[promises.length-1] : Promise.resolve([]),
    ]);

    const results: any[] = [];

    // Normas (filtrando pedagógicas/circulares si corresponde)
    const excludedSet = new Set(excluded_norm_ids);
    const normRowsFiltered = excluded_norm_ids.length > 0
      ? (normRows as any[]).filter(r => !excludedSet.has(r.norm_id))
      : (normRows as any[]);
    for (const r of normRowsFiltered) {
      results.push({
        source_type: "norma",
        article_id: r.article_id, norm_id: r.norm_id,
        norm_title: r.norm_title, norm_type: r.norm_type,
        norm_number: r.norm_number, norm_year: r.norm_year,
        norm_scope: r.norm_scope, norm_issuing_authority: r.norm_issuing_authority,
        norm_source_url: r.norm_source_url,
        article_number: r.article_number, article_label: r.article_label,
        article_title: r.article_title, chapter: r.chapter,
        content: String(r.content || "").length > CONTENT_TRUNC ? String(r.content).slice(0, CONTENT_TRUNC) + "…" : r.content,
        distance: r.distance, similarity: Number((1 - (r.distance || 0)).toFixed(4)),
        vigencia_status: r.vigencia_status || null,
        derogado_por: r.derogado_por || null, modificado_por: r.modificado_por || null,
        vigencia_global: r.vigencia_global || null,
        corpus_source: r.corpus_source || null, category: r.category || null,
      });
    }

    // Jurisprudencia
    for (const r of (jurRows as any[])) {
      results.push({
        source_type: "sentencia",
        article_id: r.article_id, jur_id: r.jur_id,
        section_key: r.section_key, section_label: r.section_label,
        radicado: r.radicado, corte: r.corte, tipo_providencia: r.tipo_providencia,
        jur_title: r.jur_title, fecha_emision_anio: r.fecha_emision_anio,
        category: r.category,
        content: String(r.content || "").length > CONTENT_TRUNC ? String(r.content).slice(0, CONTENT_TRUNC) + "…" : r.content,
        distance: r.distance, similarity: Number((1 - (r.distance || 0)).toFixed(4)),
      });
    }

    // Eureka resumen
    for (const r of (euRows as any[])) {
      results.push({
        source_type: "resumen_editorial",
        source_id: r.source_id, src_type: r.source_type,
        resumen: String(r.resumen || "").length > CONTENT_TRUNC ? String(r.resumen).slice(0, CONTENT_TRUNC) + "…" : r.resumen,
        content: r.resumen,
        metadata: r.metadata,
        distance: r.distance, similarity: Number((1 - (r.distance || 0)).toFixed(4)),
      });
    }

    // Mix y sort global por distancia
    results.sort((a, b) => (a.distance ?? 1) - (b.distance ?? 1));

    const t_total = Date.now() - t0;
    return json({
      ok: true, results, total_returned: results.length,
      query, top_k: topK, filters,
      content_truncation: CONTENT_TRUNC, elapsed_ms: t_total,
      capas: { normas: normRowsFiltered.length, sentencias: jurRows.length, resumenes_editoriales: euRows.length, pedagogico_included: include_pedagogico, excluded_pedagogico_ids: excluded_norm_ids.length }
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
