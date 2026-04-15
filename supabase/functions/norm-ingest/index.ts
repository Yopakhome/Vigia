import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPERADMIN_EMAILS = (Deno.env.get("SUPERADMIN_EMAILS") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? (u as { id: string; email?: string }) : null;
  } catch { return null; }
}

const srv = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Chunked base64 decode (inverso al encode de extract-text)
function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function uploadToStorage(path: string, bytes: Uint8Array): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/normative-pdfs/${path}`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/pdf", "x-upsert": "true" },
    body: bytes
  });
  if (!r.ok) { const t = await r.text(); throw new Error(`Upload storage falló ${r.status}: ${t.slice(0,200)}`); }
}

async function dedupCheck(contentHash: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/normative_sources?content_hash=eq.${contentHash}&select=id,status,norm_title`, { headers: srv });
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function enrichMetadataWithLLM(textSample: string, proposed: any) {
  if (!ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY no configurada" };
  const sys = `Analiza el fragmento inicial de una norma ambiental colombiana y devuelve SOLO un JSON válido. Sin markdown, sin comentarios, solo el JSON:
{
  "title": "título oficial completo",
  "norm_type": "constitucion|ley|decreto_ley|decreto|resolucion|circular|sentencia|concepto|acuerdo|proyecto_normativo|otra",
  "norm_number": "número como texto",
  "norm_year": 2015,
  "issuing_authority": "autoridad emisora completa",
  "publication_date": "YYYY-MM-DD",
  "publication_source": "Diario Oficial No. XXXX o null",
  "scope": "general|agua|aire|residuos|biodiversidad|licenciamiento|sancionatorio|cambio_climatico|otra",
  "hierarchy_level": 5,
  "applies_to_sectors": ["mineria","energia","hidrocarburos","manufactura","agroindustria","infraestructura","todas"],
  "summary": "2-4 líneas sobre qué regula"
}
hierarchy_level: 1=Constitución, 2=Ley, 3=Decreto-Ley, 4=Decreto, 5=Resolución, 6=Circular, 7=otros.`;
  const userMsg = `Metadatos propuestos (pistas, verifícalos):\n${JSON.stringify(proposed || {}, null, 2)}\n\nFragmento inicial de la norma:\n${textSample.slice(0, 15000)}`;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1200, system: sys, messages: [{ role: "user", content: userMsg }] })
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data?.error?.message || `HTTP ${r.status}` };
    const raw = data?.content?.[0]?.text || "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const first = cleaned.indexOf("{"); const last = cleaned.lastIndexOf("}");
    const slice = first >= 0 && last > first ? cleaned.slice(first, last + 1) : cleaned;
    try { return { ok: true, meta: JSON.parse(slice), tokens_in: data?.usage?.input_tokens ?? null, tokens_out: data?.usage?.output_tokens ?? null }; }
    catch { return { ok: false, error: "LLM no devolvió JSON válido", raw: raw.slice(0, 500) }; }
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

interface Article { article_number: string; article_label: string; title: string | null; content: string; order_index: number; chapter: string | null; section: string | null; }

function parseArticlesRegex(fullText: string): Article[] {
  const norm = fullText.replace(/\r/g, "").replace(/[\u00A0\t]+/g, " ");
  const pattern = /(^|\n)\s*(Art[íÍiI]culo|ART[ÍÍII]CULO|Art\.)\s+(?:N[°º]?\s*)?(\d{1,4}[A-Za-z]?)[°º\.\s]/gi;
  const matches: Array<{ idx: number; label: string; num: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(norm)) !== null) matches.push({ idx: m.index + m[1].length, label: `${m[2]} ${m[3]}`.trim(), num: m[3] });
  if (matches.length === 0) return [];
  const chapterPattern = /\n\s*(T[ÍÍII]TULO|CAP[ÍÍII]TULO|SECCI[ÓßOOo]N)\s+[A-Z0-9][^\n]{0,120}/gi;
  const chapters: Array<{ idx: number; label: string }> = [];
  let c: RegExpExecArray | null;
  while ((c = chapterPattern.exec(norm)) !== null) chapters.push({ idx: c.index, label: c[0].trim() });
  function chapterAt(pos: number): string | null { let last: string | null = null; for (const ch of chapters) { if (ch.idx < pos) last = ch.label; else break; } return last; }
  const articles: Article[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : norm.length;
    const chunk = norm.slice(start, end).trim();
    const firstNl = chunk.indexOf("\n");
    const firstLine = firstNl > 0 ? chunk.slice(0, firstNl).trim() : chunk.slice(0, 200).trim();
    const afterLabel = firstLine.replace(/^(Art[íÍiI]culo|ART[ÍÍII]CULO|Art\.)\s+(?:N[°º]?\s*)?\d{1,4}[A-Za-z]?[°º\.\s]*/i, "").trim();
    const title = afterLabel.length > 0 && afterLabel.length < 160 && /[.:]$/.test(afterLabel) ? afterLabel.replace(/[.:]$/, "") : null;
    articles.push({ article_number: matches[i].num, article_label: matches[i].label, title, content: chunk, order_index: i + 1, chapter: chapterAt(start), section: null });
  }
  return articles;
}

function evaluateParserQuality(text: string, arts: Article[]): "high" | "medium" | "low" | "manual_review_needed" {
  if (arts.length === 0) return "manual_review_needed";
  const textLen = text.length;
  const avgLen = arts.reduce((s, a) => s + a.content.length, 0) / arts.length;
  if (arts.length < 5 && textLen > 10000) return "low";
  if (avgLen > 5000) return "low";
  if (arts.length >= 5 && arts.length <= 500 && avgLen >= 150 && avgLen <= 4000) return "high";
  return "medium";
}

async function insertNormAndArticles(fields: Record<string, unknown>, articles: Article[]): Promise<string> {
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/normative_sources`, {
    method: "POST", headers: { ...srv, Prefer: "return=representation" }, body: JSON.stringify(fields)
  });
  const t = await ins.text();
  if (!ins.ok) throw new Error(`INSERT normative_sources → ${ins.status}: ${t.slice(0,400)}`);
  const saved = JSON.parse(t);
  const row = Array.isArray(saved) ? saved[0] : saved;
  const norm_id = row.id;
  if (articles.length > 0) {
    const rows = articles.map(a => ({ ...a, norm_id, content_tokens: Math.ceil(a.content.length / 4) }));
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK);
      const r = await fetch(`${SUPABASE_URL}/rest/v1/normative_articles`, {
        method: "POST", headers: { ...srv, Prefer: "return=minimal" }, body: JSON.stringify(batch)
      });
      if (!r.ok) { const et = await r.text(); throw new Error(`INSERT normative_articles batch → ${r.status}: ${et.slice(0,300)}`); }
    }
  }
  return norm_id;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);
  const email = (user.email || "").toLowerCase();
  const isSuperAdmin = SUPERADMIN_EMAILS.includes(email);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const {
    pdf_url,                 // requerido
    raw_text,                // opcional: texto ya extraído (bypass OCR)
    pdf_base64,              // opcional: bytes del PDF ya en base64 (bypass descarga)
    content_hash: providedHash, // opcional: si el caller ya lo calculó
    proposed_metadata = {},
    proposed_by_org_id = null,
    proposed_by_user_id = null
  } = body || {};
  if (!pdf_url || typeof pdf_url !== "string") return json({ error: "Falta pdf_url" }, 400);
  if (!raw_text || typeof raw_text !== "string") return json({ error: "Falta raw_text. Llamá primero a norm-extract-text y pasá el resultado." }, 400);
  if (raw_text.length < 500) return json({ error: `raw_text muy corto (${raw_text.length} chars)` }, 400);

  const report: Record<string, unknown> = { pdf_url, caller: email, isSuperAdmin, raw_text_length: raw_text.length, used_provided_base64: !!pdf_base64 };
  try {
    // Bytes del PDF: del base64 provisto o descargar
    let pdfBytes: Uint8Array;
    if (pdf_base64) {
      pdfBytes = base64ToUint8(pdf_base64);
    } else {
      const r = await fetch(pdf_url, { headers: { "User-Agent": "Mozilla/5.0 VIGIA/norm-ingest" } });
      if (!r.ok) throw new Error(`Descarga PDF falló: HTTP ${r.status}`);
      pdfBytes = new Uint8Array(await r.arrayBuffer());
    }
    report.pdf_size_bytes = pdfBytes.byteLength;

    // Hash (usar el provisto si coincide, si no recalcular)
    const hash = providedHash || await sha256Hex(pdfBytes);
    report.content_hash = hash;

    // Dedup
    const dup = await dedupCheck(hash);
    if (dup && dup.status === 'published') return json({ error: "Ya existe una norma publicada con este contenido", existing: dup }, 409);

    // Enrichment de metadata
    const enriched = await enrichMetadataWithLLM(raw_text.slice(0, 15000), proposed_metadata);
    report.metadata_enrichment = enriched.ok ? { tokens_in: (enriched as any).tokens_in, tokens_out: (enriched as any).tokens_out } : { error: (enriched as any).error };
    const meta = enriched.ok ? (enriched as any).meta : proposed_metadata;
    if (!meta?.title && !proposed_metadata?.title) throw new Error("Metadata incompleta: falta title y el LLM falló");

    // Parser
    const articles = parseArticlesRegex(raw_text);
    const parserQuality = evaluateParserQuality(raw_text, articles);
    report.articles_parsed_regex = articles.length;
    report.parser_quality = parserQuality;

    // Storage
    const ytmp = Number(meta?.norm_year || proposed_metadata?.norm_year) || new Date().getFullYear();
    const storagePath = `${meta?.norm_type || proposed_metadata?.norm_type || 'otra'}/${ytmp}/${hash.slice(0, 16)}.pdf`;
    await uploadToStorage(storagePath, pdfBytes);
    report.pdf_storage_path = storagePath;

    // INSERT
    const fields: Record<string, unknown> = {
      norm_title: meta?.title || proposed_metadata?.title || "Sin título",
      norm_type: meta?.norm_type || proposed_metadata?.norm_type || "otra",
      norm_number: meta?.norm_number || proposed_metadata?.norm_number || null,
      norm_year: meta?.norm_year || proposed_metadata?.norm_year || null,
      issuing_body: meta?.issuing_authority || proposed_metadata?.issuing_authority || null,
      issue_date: meta?.publication_date || proposed_metadata?.publication_date || null,
      publication_source: meta?.publication_source || null,
      source_url: pdf_url,
      pdf_storage_path: storagePath,
      scope: meta?.scope || proposed_metadata?.scope || null,
      summary: meta?.summary || null,
      applies_to_sectors: meta?.applies_to_sectors || null,
      hierarchy_level: meta?.hierarchy_level || null,
      content_hash: hash,
      total_articles: articles.length,
      parser_quality: parserQuality,
      parser_method: 'regex',
      status: isSuperAdmin ? 'published' : 'pending_validation',
      is_universal: true,
      proposed_by_org_id, proposed_by_user_id: proposed_by_user_id || user.id,
      validated_by: isSuperAdmin ? user.id : null,
      validated_at: isSuperAdmin ? new Date().toISOString() : null
    };
    const norm_id = await insertNormAndArticles(fields, articles);
    report.norm_id = norm_id;
    report.status = fields.status;

    // Disparar embed (aun no existe en Fase 3; tolerar)
    let embed: any = null;
    if (fields.status === 'published') {
      try {
        const er = await fetch(`${SUPABASE_URL}/functions/v1/norm-embed`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization")!, apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ norm_id })
        });
        embed = { ok: er.ok, status: er.status };
      } catch (e) { embed = { ok: false, error: (e as Error).message }; }
    }
    report.embed_triggered = embed;

    return json({ norm_id, status: fields.status, articles_extracted: articles.length, parser_quality: parserQuality, embeddings_generated: false, report });
  } catch (e) {
    report.error = (e as Error).message;
    return json({ error: (e as Error).message, report }, 500);
  }
});
