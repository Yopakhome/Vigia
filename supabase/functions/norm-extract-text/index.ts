import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
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
    return u?.id ? u : null;
  } catch { return null; }
}

// Chunked base64 para no saturar heap con PDFs grandes
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000; // 32KB
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any));
  }
  return btoa(parts.join(""));
}

async function downloadPdf(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 VIGIA/norm-extract", "Accept": "application/pdf,*/*" } });
  if (!r.ok) throw new Error(`Descarga PDF falló: HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("pdf") && !ct.includes("octet-stream")) throw new Error(`Content-Type inesperado: ${ct}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function tryUnpdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return { text: String(text || "").trim(), pages: pdf.numPages };
  } catch (e) { return { text: "", pages: 0 }; }
}

async function claudeOCR(bytes: Uint8Array): Promise<{ text: string; tokens_in: number | null; tokens_out: number | null; model: string }> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");
  const base64Data = uint8ToBase64(bytes);
  const sys = `Eres un extractor de texto de PDFs jurídicos colombianos. Devuelve EXCLUSIVAMENTE el texto íntegro del documento en texto plano, preservando el orden natural y los títulos de artículos/capítulos/secciones (con sus numeraciones y encabezados "Artículo N", "CAPÍTULO X", etc.). No resumas, no omitas, no agregues markdown ni metadata. Si hay tablas, transcribe su contenido como texto lineal fila por fila. Omite encabezados/pies de página repetidos. Comienza directamente con el contenido.`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL, max_tokens: 32000, system: sys,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } },
        { type: "text", text: "Extrae el texto íntegro de este PDF en texto plano." }
      ]}]
    })
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    if (String(msg).includes("100 PDF pages")) throw new Error("PDF supera 100 páginas (límite API Anthropic)");
    throw new Error(`Claude OCR falló: ${msg}`);
  }
  const text = (data?.content || []).map((c: any) => c?.text || "").join("").trim();
  return { text, tokens_in: data?.usage?.input_tokens ?? null, tokens_out: data?.usage?.output_tokens ?? null, model: ANTHROPIC_MODEL };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { pdf_url, force_ocr = false, skip_ocr = false } = body || {};
  if (!pdf_url) return json({ error: "Falta pdf_url" }, 400);

  const report: Record<string, unknown> = { pdf_url, force_ocr, skip_ocr };
  try {
    const pdfBytes = await downloadPdf(pdf_url);
    report.pdf_size_bytes = pdfBytes.byteLength;

    // Hash sha256 (para dedup downstream)
    const buf = await crypto.subtle.digest("SHA-256", pdfBytes);
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    report.content_hash = hash;

    // Intento 1: unpdf (rápido, barato)
    let text = ""; let pages = 0; let method: "unpdf" | "claude_ocr" = "unpdf";
    if (!force_ocr) {
      const r = await tryUnpdf(pdfBytes);
      text = r.text; pages = r.pages;
    }
    report.unpdf_text_length = text.length;
    report.pages = pages;

    // Intento 2: Claude OCR si unpdf falló o texto es muy corto
    let ocrUsage: any = null;
    if (text.length < 500 && !skip_ocr) {
      method = "claude_ocr";
      const ocr = await claudeOCR(pdfBytes);
      text = ocr.text;
      ocrUsage = { tokens_in: ocr.tokens_in, tokens_out: ocr.tokens_out, model: ocr.model };
      report.ocr_usage = ocrUsage;
    }
    report.text_method = method;
    report.text_length = text.length;
    if (text.length < 500) throw new Error(`Texto extraído muy corto (${text.length} chars) tras ${method}`);

    // Devolvemos: text, metadata de extracción, y los bytes base64 para que el caller (o la siguiente función) pueda subirlos a storage sin re-descargar.
    const pdfBase64 = uint8ToBase64(pdfBytes);
    return json({
      ok: true,
      text,
      text_length: text.length,
      text_method: method,
      pages,
      content_hash: hash,
      pdf_size_bytes: pdfBytes.byteLength,
      pdf_base64: pdfBase64,
      ocr_usage: ocrUsage,
      report
    });
  } catch (e) {
    report.error = (e as Error).message;
    return json({ ok: false, error: (e as Error).message, report }, 500);
  }
});
