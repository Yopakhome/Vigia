import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_OUTPUT_CHARS = 50000;

async function verifyUser(auth: string | null) {
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? u : null;
  } catch { return null; }
}

function base64ToUint8(b64: string): Uint8Array {
  // strip data: prefix
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function truncate(t: string): string {
  if (t.length > MAX_OUTPUT_CHARS) return t.slice(0, MAX_OUTPUT_CHARS) + "\n\n[... truncado — texto excede 50k chars]";
  return t;
}

// PDF extraction via unpdf, fallback vision si pocos chars
async function extractPdf(bytes: Uint8Array): Promise<{ text: string; method: string; confidence: string; pages: number }> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const cleaned = String(text || "").trim();
    if (cleaned.length >= 500) {
      return { text: truncate(cleaned), method: "direct_text", confidence: "high", pages: pdf.numPages };
    }
    // Scan detectado — fallback Claude vision
    if (ANTHROPIC_API_KEY) {
      const visionText = await claudeVisionOnPdf(bytes);
      return { text: truncate(visionText), method: "ocr_vision", confidence: "medium", pages: pdf.numPages };
    }
    return { text: truncate(cleaned), method: "direct_text", confidence: "low", pages: pdf.numPages };
  } catch (e) {
    throw new Error(`pdf_fail: ${(e as Error).message}`);
  }
}

async function claudeVisionOnPdf(bytes: Uint8Array): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any));
  const base64 = btoa(parts.join(""));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: "Extrae el texto completo de este documento oficial colombiano. Preserva la estructura de artículos y secciones. Solo texto, sin markdown." }
      ]}]
    })
  });
  if (!r.ok) throw new Error(`vision_fail_${r.status}`);
  const data = await r.json();
  return String(data?.content?.[0]?.text || "").trim();
}

async function claudeVisionOnImage(bytes: Uint8Array, mime: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) parts.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as any));
  const base64 = btoa(parts.join(""));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 16000,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
        { type: "text", text: "Extrae el texto completo de este documento oficial colombiano. Preserva estructura. Solo texto, sin markdown." }
      ]}]
    })
  });
  if (!r.ok) throw new Error(`vision_fail_${r.status}`);
  const data = await r.json();
  return String(data?.content?.[0]?.text || "").trim();
}

// DOCX: ZIP + parse word/document.xml (extraer nodos <w:t>)
async function extractDocx(bytes: Uint8Array): Promise<{ text: string; method: string; confidence: string }> {
  try {
    const { unzipSync, strFromU8 } = await import("npm:fflate@0.8.2");
    const unzipped = unzipSync(bytes);
    const docXml = unzipped["word/document.xml"];
    if (!docXml) throw new Error("no_document_xml");
    const xml = strFromU8(docXml);
    // Extraer <w:t> (texto) y <w:p> (párrafos)
    const parts: string[] = [];
    const paras = xml.split(/<w:p[\s>]/).slice(1);
    for (const p of paras) {
      const textMatches = p.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      const line = textMatches.map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, "")).join("");
      if (line) parts.push(line);
    }
    const text = parts.join("\n").trim();
    if (text.length < 20) throw new Error("no_text_extracted");
    return { text: truncate(text), method: "xml_parse", confidence: "high" };
  } catch (e) {
    throw new Error(`docx_fail: ${(e as Error).message}`);
  }
}

// DOC (legacy .doc — formato binario OLE): extracción mínima o fallback a vision
async function extractDoc(bytes: Uint8Array): Promise<{ text: string; method: string; confidence: string }> {
  // Intento simple: buscar texto plano legible en el binario
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);
  // Filtrar sólo caracteres ASCII imprimibles + acentos
  const extracted = (raw.match(/[\x20-\x7E\xC0-\xFF\n\r]{20,}/g) || []).join("\n").trim();
  if (extracted.length >= 500) {
    return { text: truncate(extracted), method: "direct_text", confidence: "low" };
  }
  throw new Error("doc_legacy_extract_fail — convert to docx or pdf");
}

function decodeTextAutoDetect(bytes: Uint8Array): string {
  // Probar UTF-8 → ISO-8859-1 → Windows-1252
  for (const enc of ["utf-8", "iso-8859-1", "windows-1252"]) {
    try {
      const d = new TextDecoder(enc, { fatal: true });
      return d.decode(bytes);
    } catch {}
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "• ")
    .replace(/^>\s+/gm, "")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await verifyUser(req.headers.get("Authorization"));
  if (!user) return json({ error: "No autorizado" }, 401);

  let body: any; try { body = await req.json(); } catch { return json({ error: "Body inválido" }, 400); }
  const { file_base64, mime_type, filename } = body || {};
  if (!file_base64 || !mime_type) return json({ error: "Falta file_base64 o mime_type" }, 400);

  let bytes: Uint8Array;
  try { bytes = base64ToUint8(file_base64); }
  catch { return json({ error: "file_base64 inválido" }, 400); }

  if (bytes.byteLength > 50 * 1024 * 1024) {
    return json({ text: "", method: "failed", error: "file_too_large (>50MB)" }, 413);
  }

  const mime = (mime_type || "").toLowerCase();
  try {
    let result: { text: string; method: string; confidence: string; pages?: number };

    if (mime.includes("pdf") || (filename || "").toLowerCase().endsWith(".pdf")) {
      result = await extractPdf(bytes);
    } else if (mime.includes("wordprocessingml") || (filename || "").toLowerCase().endsWith(".docx")) {
      result = await extractDocx(bytes);
    } else if (mime === "application/msword" || (filename || "").toLowerCase().endsWith(".doc")) {
      try { result = await extractDoc(bytes); }
      catch {
        // Fallback a vision (trata bytes como imagen? No — falla. Mejor error.)
        return json({ text: "", method: "failed", error: "doc_legacy_no_soportado — convierte a .docx o .pdf" }, 200);
      }
    } else if (mime.startsWith("image/")) {
      const text = await claudeVisionOnImage(bytes, mime);
      result = { text: truncate(text), method: "ocr_vision", confidence: "medium" };
    } else if (mime === "text/plain" || (filename || "").toLowerCase().match(/\.(txt|log|csv)$/)) {
      const text = decodeTextAutoDetect(bytes);
      result = { text: truncate(text.trim()), method: "direct_text", confidence: "high" };
    } else if (mime === "text/markdown" || mime === "text/x-markdown" || (filename || "").toLowerCase().endsWith(".md")) {
      const md = decodeTextAutoDetect(bytes);
      result = { text: truncate(stripMarkdown(md)), method: "markdown_strip", confidence: "high" };
    } else if (mime === "text/html" || (filename || "").toLowerCase().match(/\.html?$/)) {
      const h = decodeTextAutoDetect(bytes);
      result = { text: truncate(stripHtml(h)), method: "html_strip", confidence: "high" };
    } else {
      return json({ text: "", method: "failed", error: `mime_type no soportado: ${mime}` }, 200);
    }

    return json({ ...result, char_count: result.text.length });
  } catch (e) {
    return json({ text: "", method: "failed", error: (e as Error).message, char_count: 0 }, 200);
  }
});
