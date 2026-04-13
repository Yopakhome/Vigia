import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-4-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function verifyUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { ok: false as const, reason: "Falta header Authorization" };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) return { ok: false as const, reason: `auth/v1/user respondió ${res.status}` };
    const user = await res.json();
    if (!user?.id) return { ok: false as const, reason: "Respuesta de auth sin id" };
    return { ok: true as const, userId: user.id };
  } catch (e) { return { ok: false as const, reason: (e as Error).message }; }
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const slice = cleaned.slice(first, last + 1);
    try { return JSON.parse(slice); } catch {}
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return jsonResponse({ error: "ANTHROPIC_API_KEY no configurada" }, 500);

  const authResult = await verifyUser(req.headers.get("Authorization"));
  if (!authResult.ok) return jsonResponse({ error: "No autorizado", detail: authResult.reason }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return jsonResponse({ error: "Body inválido" }, 400); }

  const { fileData, fileName, fileType, systemPrompt } = payload || {};
  if (!fileData || !fileName || !fileType) return jsonResponse({ error: "Faltan fileData, fileName o fileType" }, 400);

  const isPDF = fileType === "application/pdf";
  const isImage = typeof fileType === "string" && fileType.startsWith("image/");
  if (!isPDF && !isImage) return jsonResponse({ error: "Tipo no soportado. Subí PDF o imagen." }, 400);

  const systemForced = (systemPrompt || "") + "\n\nIMPORTANTE: Tu respuesta debe ser ÚNICAMENTE un objeto JSON válido, sin markdown, sin comentarios, sin texto antes ni después. Comienza con { y termina con }.";

  const content = isPDF
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: fileData } },
        { type: "text", text: `Analiza este documento para VIGIA. Identifica si es una norma. Nombre: "${fileName}". Responde sólo con el JSON del schema indicado.` }
      ]
    : [
        { type: "image", source: { type: "base64", media_type: fileType, data: fileData } },
        { type: "text", text: `Analiza este documento para VIGIA. Nombre: "${fileName}". Responde sólo con el JSON del schema indicado.` }
      ];

  let anthropicData: any;
  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, system: systemForced, messages: [{ role: "user", content }] })
    });
    anthropicData = await anthropicRes.json();
    if (!anthropicRes.ok) {
      const errMsg = anthropicData?.error?.message || `Anthropic error ${anthropicRes.status}`;
      const friendly = errMsg.includes("100 PDF pages") ? "El PDF supera las 100 páginas permitidas por la API." : errMsg;
      return jsonResponse({ error: friendly, detail: anthropicData }, 502);
    }
  } catch (e) {
    return jsonResponse({ error: "Error llamando a Anthropic: " + (e as Error).message }, 502);
  }

  const text: string = anthropicData?.content?.[0]?.text || "";
  const parsed = extractJson(text);
  if (!parsed) return jsonResponse({ error: "Respuesta de Anthropic no es JSON válido", raw: text.slice(0, 800) }, 502);

  return jsonResponse({ result: parsed });
});
