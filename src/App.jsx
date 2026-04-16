import React, { useState, useEffect } from "react";
import { Bell, FileText, AlertTriangle, CheckCircle, Clock, Search, ChevronRight, Shield, MessageSquare, BookOpen, BookMarked, Database, TrendingUp, Eye, BarChart2, Zap, RefreshCw, Layers, Mail, X, Upload, ArrowDown, ArrowUp, Scale, Gavel, FileCheck, Users, Paperclip, Download, Copy, Menu } from "lucide-react";

const SB_URL = "https://itkbujkqjesuntgdkubt.supabase.co";
const SB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV";
// SB_SERVICE ELIMINADO (v3.9.15) — todas las operaciones admin van via edge function
// superadmin-proxy que valida identity via JWT del usuario antes de usar service_role.
const sb = async (table, params="", token=SB_KEY) => {
const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(res.status);
return res.json();
};


// ─── AUTH ─────────────────────────────────────────────────────────────────────
const sbAuth = async (endpoint, body) => {
  const res = await fetch(`${SB_URL}/auth/v1/${endpoint}`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
};

const sbRefresh = async (refresh_token) => {
  if (!refresh_token) return null;
  const data = await sbAuth("token?grant_type=refresh_token", { refresh_token });
  if (data.access_token) {
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refresh_token,
      user: data.user,
      expires_at: data.expires_at
    };
    localStorage.setItem("vigia_session", JSON.stringify(session));
    return session;
  }
  return null;
};

const sbGetSession = async () => {
  const raw = localStorage.getItem("vigia_session");
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    const now = Date.now() / 1000;
    if (session.expires_at && now > session.expires_at - 60) {
      const refreshed = await sbRefresh(session.refresh_token);
      if (refreshed) return refreshed;
      localStorage.removeItem("vigia_session");
      return null;
    }
    return session;
  } catch { return null; }
};

const sbLogin = async (email, password) => {
  const data = await sbAuth("token?grant_type=password", { email, password });
  if (data.access_token) {
    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
      expires_at: data.expires_at
    };
    localStorage.setItem("vigia_session", JSON.stringify(session));
    return { ok: true, session };
  }
  return { ok: false, error: data.error_description || data.msg || "Credenciales incorrectas" };
};

const sbLogout = () => {
  localStorage.removeItem("vigia_session");
};

const validatePassword = (pwd) => {
  if(!pwd || pwd.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if(!/[0-9]/.test(pwd)) return "La contraseña debe incluir al menos un número";
  if(!/[A-Z]/.test(pwd)) return "La contraseña debe incluir al menos una mayúscula";
  return null;
};

const sbForgotPassword = async (email) => {
  try {
    const r = await fetch(`${SB_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    return r.ok;
  } catch { return false; }
};

const sbWithAuth = async (table, params, token) => {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${token || SB_KEY}`
    }
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
};

const uploadAttachment = async (file, orgId, token) => {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}/${safeName}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/org-attachments/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token||SB_KEY}`, "Content-Type": file.type || "application/pdf", "x-upsert": "false" },
    body: file
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Upload falló (${res.status}): ${t}`); }
  return { path, name: file.name, size: file.size, mime: file.type || "application/pdf" };
};

const callEdge = async (name, body, token) => {
  const res = await fetch(`${SB_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${token||SB_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || `${name} → ${res.status}`);
  return data;
};

const fetchOrgContext = async (token) => {
  try { return await callEdge("org-lookup", null, token); }
  catch(e) { console.log("org-lookup error", e); return { org: null, role: null, isSuperAdmin: false }; }
};

const getSignedAttachmentUrl = async (path, token) => {
  const data = await callEdge("storage-sign", { path, bucket: "org-attachments", expiresIn: 300 }, token);
  if (!data.signedUrl) throw new Error(data.error || "No se pudo firmar URL");
  return data.signedUrl;
};

const sbInsert = async (table, data, token=SB_KEY) => {
const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
  method:"POST",
  headers:{ apikey:SB_KEY, Authorization:`Bearer ${token}`, "Content-Type":"application/json", Prefer:"return=representation" },
  body:JSON.stringify(data)
});
const t = await res.text();
if (!res.ok) throw new Error(`${res.status}: ${t}`);
try { return JSON.parse(t); } catch { return t; }
};

// --- DESIGN TOKENS ------------------------------------------------------------
const C = { bg:"#060c14",surface:"#0c1523",surfaceEl:"#101d30",border:"#162236",primary:"#00c9a7",primaryDim:"rgba(0,201,167,0.10)",text:"#d8e6f0",textSec:"#5e7a95",textMuted:"#3a5270",red:"#ff4d6d",redDim:"rgba(255,77,109,0.12)",yellow:"#f7c948",yellowDim:"rgba(247,201,72,0.12)",green:"#2ec986",greenDim:"rgba(46,201,134,0.12)",blue:"#4d9fff",blueDim:"rgba(77,159,255,0.10)",purple:"#a78bfa",purpleDim:"rgba(167,139,250,0.10)" };
const FONT = "'Poppins','Segoe UI',sans-serif";
const SCOPE_LABELS = { general:"Marco general", agua:"Aguas", aire:"Aire y emisiones", residuos:"Residuos", biodiversidad:"Biodiversidad", licenciamiento:"Licenciamiento", sancionatorio:"Régimen sancionatorio", cambio_climatico:"Cambio climático", otra:"Otra" };
const SCOPE_COLORS = { general:C.primary, agua:C.blue, aire:C.purple, residuos:C.yellow, biodiversidad:C.green, licenciamiento:C.primary, sancionatorio:C.red, cambio_climatico:C.blue, otra:C.textSec };

// --- HELPERS ------------------------------------------------------------------
const StatusDot = ({status,size=8}) => { const color=status==="vencido"||status==="critico"?C.red:status==="proximo"||status==="moderado"?C.yellow:C.green; return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}88`,flexShrink:0}}/>; };
const Badge = ({label,color,bg}) => <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600,letterSpacing:"0.06em",color,background:bg,textTransform:"uppercase",flexShrink:0}}>{label}</span>;
const ImpactBadge = ({impact}) => { const m={derogatoria:{c:C.red,b:C.redDim},ampliatoria:{c:C.red,b:C.redDim},prospectiva:{c:C.yellow,b:C.yellowDim},interpretativa:{c:C.blue,b:C.blueDim}}[impact]||{c:C.textSec,b:C.surfaceEl}; return <Badge label={impact} color={m.c} bg={m.b}/>; };
const StatCard = ({icon:Icon,label,value,color,sub}) => <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:10,background:`${color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={18} color={color}/></div><div><div style={{fontSize:22,fontWeight:700,color:C.text,lineHeight:1}}>{value}</div><div style={{fontSize:11,color:C.textSec,marginTop:3}}>{label}</div>{sub&&<div style={{fontSize:10,color,marginTop:1}}>{sub}</div>}</div></div>;

// --- MARKDOWN RENDERER (ligero, sin dependencias) ----------------------------
// Maneja: # ## ### headers, **bold**, *italic*, listas 1. y -, párrafos, citas [Norma X, Art. Y].
// Si algo falla, fallback a texto plano.
function MarkdownText({ text }) {
  if (!text || typeof text !== "string") return null;
  try {
    const lines = text.split("\n");
    const blocks = []; let para = []; let list = null;
    const flushP = () => { if (para.length) { blocks.push({t:"p", text:para.join("\n")}); para=[]; } };
    const flushL = () => { if (list && list.items.length) { blocks.push({t:"list", ordered:list.ordered, items:list.items}); list=null; } };
    for (const line of lines) {
      const trimmed = line.trim();
      const leadingSpaces = line.length - line.trimStart().length;
      if (!trimmed) { flushP(); flushL(); continue; }
      const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (h) { flushP(); flushL(); blocks.push({t:"h", level:h[1].length, text:h[2]}); continue; }
      const nl = trimmed.match(/^(\d+)\.\s+(.+)$/);
      if (nl) { flushP(); if (!list || !list.ordered) { flushL(); list={ordered:true, items:[]}; } list.items.push({text:nl[2], indent:leadingSpaces}); continue; }
      const bl = trimmed.match(/^[-*]\s+(.+)$/);
      if (bl) {
        flushP();
        // Si la lista vigente es ordenada y este bullet tiene indent, es sub-bullet del último item ordered.
        if (leadingSpaces > 0 && list && list.ordered && list.items.length > 0) {
          const last = list.items[list.items.length - 1];
          if (!last.subItems) last.subItems = [];
          last.subItems.push(bl[1]);
        } else {
          if (!list || list.ordered) { flushL(); list={ordered:false, items:[]}; }
          list.items.push({text:bl[1], indent:leadingSpaces});
        }
        continue;
      }
      flushL(); para.push(line);
    }
    flushP(); flushL();

    // Inline: **bold**, *italic*, [cita]. Procesa bold antes que italic.
    const renderInline = (str, keyPrefix) => {
      const parts = []; let i = 0; let k = 0;
      while (i < str.length) {
        // Bold **...**
        if (str.slice(i, i+2) === "**") {
          const end = str.indexOf("**", i+2);
          if (end > i+2) { parts.push(<strong key={keyPrefix+"-"+(k++)} style={{fontWeight:700,color:C.text}}>{str.slice(i+2,end)}</strong>); i = end+2; continue; }
        }
        // Italic *...*  (no debe ser parte de ** ya consumido)
        if (str[i] === "*" && str[i+1] !== "*") {
          const end = str.indexOf("*", i+1);
          if (end > i+1 && str[end+1] !== "*" && str[end-1] !== " ") {
            parts.push(<em key={keyPrefix+"-"+(k++)} style={{fontStyle:"italic"}}>{str.slice(i+1,end)}</em>); i = end+1; continue;
          }
        }
        // Cita [contenido con número/año o Art.]
        if (str[i] === "[") {
          const end = str.indexOf("]", i+1);
          if (end > i+1) {
            const inner = str.slice(i, end+1);
            if (/(Art\.|Art[íi]culo|Ley|Decreto|Resoluci[óo]n|Circular|Constituci[óo]n|Sentencia|\d{3,4})/i.test(inner)) {
              parts.push(<span key={keyPrefix+"-"+(k++)} style={{color:C.primary,fontWeight:600}}>{inner}</span>); i = end+1; continue;
            }
          }
        }
        // Plain text hasta siguiente special
        let j = i+1;
        while (j < str.length && str[j] !== "*" && str[j] !== "[") j++;
        parts.push(<React.Fragment key={keyPrefix+"-"+(k++)}>{str.slice(i,j)}</React.Fragment>);
        i = j;
      }
      return parts;
    };

    const hSizes = [18, 15, 13];
    return (
      <div style={{fontSize:13, color:C.text, lineHeight:1.65}}>
        {blocks.map((b, bi) => {
          if (b.t === "h") return <div key={bi} style={{fontSize:hSizes[b.level-1]||13, fontWeight:700, color:C.text, marginTop:bi===0?0:14, marginBottom:6}}>{renderInline(b.text, "h"+bi)}</div>;
          if (b.t === "p")  return <div key={bi} style={{marginBottom:10, lineHeight:1.65, whiteSpace:"pre-wrap"}}>{renderInline(b.text, "p"+bi)}</div>;
          if (b.t === "list") return (
            <div key={bi} style={{paddingLeft:16, marginBottom:10, display:"flex", flexDirection:"column", gap:6}}>
              {b.items.map((it, ii) => (
                <div key={ii} style={{display:"flex", flexDirection:"column", gap:4}}>
                  <div style={{display:"flex", gap:8, paddingLeft:it.indent>1?16:0, alignItems:"flex-start"}}>
                    <span style={{color:C.primary, fontWeight:600, flexShrink:0, minWidth:b.ordered?18:10, fontSize:12, lineHeight:1.65}}>{b.ordered ? (ii+1)+"." : "•"}</span>
                    <div style={{flex:1}}>{renderInline(it.text, "l"+bi+"-"+ii)}</div>
                  </div>
                  {it.subItems && it.subItems.length > 0 && (
                    <div style={{paddingLeft:32, display:"flex", flexDirection:"column", gap:4}}>
                      {it.subItems.map((s, si) => (
                        <div key={si} style={{display:"flex", gap:8, alignItems:"flex-start"}}>
                          <span style={{color:C.textSec, flexShrink:0, minWidth:10, fontSize:12, lineHeight:1.65}}>•</span>
                          <div style={{flex:1, fontSize:12, color:C.textSec}}>{renderInline(s, "sl"+bi+"-"+ii+"-"+si)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
          return null;
        })}
      </div>
    );
  } catch (e) {
    return <div style={{fontSize:13, color:C.text, lineHeight:1.65, whiteSpace:"pre-wrap"}}>{text}</div>;
  }
}

// --- EXPORTACIÓN DE CONVERSACIONES (v3.8.0) ----------------------------------
// 4 formatos sin dependencias nuevas: Markdown, TXT, PDF (via window.print), Word (.doc HTML-flavored).
const EXPORT_DISCLAIMER = "Esta consulta fue generada por VIGÍA con base en el corpus normativo ambiental colombiano vigente al momento de la consulta. La información proporcionada es de carácter informativo y no constituye asesoría legal profesional. Las citas a normas y artículos son verificables contra los textos oficiales referenciados. Para decisiones jurídicas vinculantes, consulte con un asesor legal especializado.";
const EXPORT_PRODUCT_URL = "https://vigia-five.vercel.app";
const EXPORT_VIGIA_VERSION = "v3.9.45";

function exportTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  const fileStamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  const humanStamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} COT`;
  return { fileStamp, humanStamp };
}

function escapeHtml(str) {
  return String(str||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Convierte markdown (mismo subset que MarkdownText) a HTML plano para PDF/Word
function mdToHtml(md) {
  if (!md) return "";
  const lines = String(md).split("\n");
  const out = []; let list = null;
  const flushList = () => { if(list) { out.push(list.ordered ? "</ol>" : "</ul>"); list = null; } };
  const inline = (s) => {
    let r = escapeHtml(s);
    r = r.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    r = r.replace(/(^|[\s\(])\*([^*\n]+?)\*(?=[\s\.\,\:\;\)]|$)/g, "$1<em>$2</em>");
    r = r.replace(/(\[(?:Ley|Decreto|Decreto-Ley|Resoluci[oó]n|Circular|Sentencia|Constituci[oó]n|Art\.?|Art[ií]culo)[^\]]+\])/g,
      '<span style="color:#00836b;font-weight:600;">$1</span>');
    return r;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); out.push(""); continue; }
    const h = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (h) { flushList(); out.push(`<h${h[1].length+1}>${inline(h[2])}</h${h[1].length+1}>`); continue; }
    const nl = trimmed.match(/^\d+\.\s+(.+)$/);
    if (nl) { if (!list || !list.ordered) { flushList(); out.push("<ol>"); list = {ordered:true}; } out.push(`<li>${inline(nl[1])}</li>`); continue; }
    const bl = trimmed.match(/^[-*]\s+(.+)$/);
    if (bl) { if (!list || list.ordered) { flushList(); out.push("<ul>"); list = {ordered:false}; } out.push(`<li>${inline(bl[1])}</li>`); continue; }
    flushList();
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  flushList();
  return out.filter(x => x !== "").join("\n");
}

// Construye la estructura {items:[{question, answer, sources}]} a partir de botMessages.
// Un item = un par consulta-respuesta consecutivo (user → assistant).
function buildExportItems(botMessages, singleMessageIndex = null) {
  const pairs = [];
  for (let i = 0; i < botMessages.length; i++) {
    const m = botMessages[i];
    if (m.role === "assistant") {
      // Buscar el user anterior más cercano
      let userQ = "";
      for (let j = i - 1; j >= 0; j--) {
        if (botMessages[j].role === "user") { userQ = botMessages[j].text; break; }
        if (botMessages[j].role === "assistant") break;
      }
      pairs.push({ index: i, question: userQ, answer: m.text, sources: m.sources || [] });
    }
  }
  if (singleMessageIndex !== null) return pairs.filter(p => p.index === singleMessageIndex);
  return pairs;
}

function buildMarkdownExport({ items, orgName, isFullConversation }) {
  const { humanStamp } = exportTimestamp();
  let md = `# VIGÍA — Inteligencia Regulatoria\n\n`;
  md += `## ${isFullConversation ? "Conversación" : "Consulta"} exportada\n\n`;
  md += `**Fecha:** ${humanStamp}  \n**Organización:** ${orgName || "(sin especificar)"}  \n**Versión:** VIGÍA ${EXPORT_VIGIA_VERSION}\n\n---\n\n`;
  items.forEach((it, i) => {
    if (isFullConversation && items.length > 1) md += `## Consulta ${i+1}\n\n`;
    md += `### Pregunta del usuario\n\n${it.question}\n\n`;
    md += `### Respuesta de VIGÍA\n\n${it.answer}\n\n`;
    if (it.sources && it.sources.length > 0) {
      md += `### Fuentes consultadas\n\n`;
      it.sources.forEach((s, si) => {
        md += `${si+1}. **${(s.norm_type||"").toUpperCase()} ${s.norm_number}/${s.norm_year}** — ${s.article_label || `Art. ${s.article_number}`} (similitud ${(s.similarity*100).toFixed(0)}%)\n`;
      });
      md += `\n`;
    }
    if (i < items.length - 1) md += `---\n\n`;
  });
  md += `\n---\n\n*${EXPORT_DISCLAIMER}*\n\nURL del producto: ${EXPORT_PRODUCT_URL}  \nVersión: VIGÍA ${EXPORT_VIGIA_VERSION}\n`;
  return md;
}

function buildTxtExport({ items, orgName, isFullConversation }) {
  const { humanStamp } = exportTimestamp();
  const stripMd = (s) => String(s||"").replace(/\*\*/g,"").replace(/(?<!\*)\*(?!\*)/g,"").replace(/^#{1,3}\s+/gm,"").replace(/^[-*]\s+/gm,"• ");
  let t = `VIGÍA — INTELIGENCIA REGULATORIA\n${isFullConversation ? "CONVERSACIÓN" : "CONSULTA"} EXPORTADA\n\n`;
  t += `Fecha: ${humanStamp}\nOrganización: ${orgName || "(sin especificar)"}\nVersión: VIGÍA ${EXPORT_VIGIA_VERSION}\n\n${"=".repeat(60)}\n\n`;
  items.forEach((it, i) => {
    if (isFullConversation && items.length > 1) t += `CONSULTA ${i+1}\n${"-".repeat(30)}\n\n`;
    t += `PREGUNTA DEL USUARIO\n${it.question}\n\n`;
    t += `RESPUESTA DE VIGÍA\n${stripMd(it.answer)}\n\n`;
    if (it.sources && it.sources.length > 0) {
      t += `FUENTES CONSULTADAS\n`;
      it.sources.forEach((s, si) => {
        t += `  ${si+1}. ${(s.norm_type||"").toUpperCase()} ${s.norm_number}/${s.norm_year} — ${s.article_label || `Art. ${s.article_number}`} (sim ${(s.similarity*100).toFixed(0)}%)\n`;
      });
      t += `\n`;
    }
    if (i < items.length - 1) t += `${"=".repeat(60)}\n\n`;
  });
  t += `\n${"=".repeat(60)}\n\n${EXPORT_DISCLAIMER}\n\nURL: ${EXPORT_PRODUCT_URL}\nVersión: VIGÍA ${EXPORT_VIGIA_VERSION}\n`;
  return t;
}

function buildHtmlBody({ items, orgName, isFullConversation }) {
  const { humanStamp } = exportTimestamp();
  let h = `<h1>VIGÍA — Inteligencia Regulatoria</h1>`;
  h += `<h2>${isFullConversation ? "Conversación" : "Consulta"} exportada</h2>`;
  h += `<div class="meta"><strong>Fecha:</strong> ${escapeHtml(humanStamp)}<br/>`;
  h += `<strong>Organización:</strong> ${escapeHtml(orgName || "(sin especificar)")}<br/>`;
  h += `<strong>Versión:</strong> VIGÍA ${EXPORT_VIGIA_VERSION}</div>`;
  items.forEach((it, i) => {
    if (isFullConversation && items.length > 1) h += `<h2>Consulta ${i+1}</h2>`;
    h += `<h3>Pregunta del usuario</h3><p>${escapeHtml(it.question)}</p>`;
    h += `<h3>Respuesta de VIGÍA</h3>${mdToHtml(it.answer)}`;
    if (it.sources && it.sources.length > 0) {
      h += `<h3>Fuentes consultadas</h3><div class="source-list"><ol>`;
      it.sources.forEach((s) => {
        h += `<li><strong>${escapeHtml((s.norm_type||"").toUpperCase())} ${escapeHtml(String(s.norm_number||""))}/${escapeHtml(String(s.norm_year||""))}</strong> — ${escapeHtml(s.article_label || `Art. ${s.article_number||""}`)} <em>(similitud ${(s.similarity*100).toFixed(0)}%)</em></li>`;
      });
      h += `</ol></div>`;
    }
    if (i < items.length - 1) h += `<hr/>`;
  });
  h += `<div class="disclaimer">${escapeHtml(EXPORT_DISCLAIMER)}<br/><br/>URL: ${EXPORT_PRODUCT_URL} · Versión: VIGÍA ${EXPORT_VIGIA_VERSION}</div>`;
  return h;
}

function downloadBlob(content, filename, mime) {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    return true;
  } catch (e) { alert("No se pudo descargar: " + e.message); return false; }
}

function exportAsPdf(payload) {
  const w = window.open("", "_blank");
  if (!w) { alert("El navegador bloqueó la ventana de impresión. Permitir popups para VIGÍA y reintentar."); return; }
  const body = buildHtmlBody(payload);
  const { fileStamp } = exportTimestamp();
  const title = `VIGÍA ${payload.isFullConversation ? "conversación" : "consulta"} ${fileStamp}`;
  w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; background: #fff; padding: 40px; max-width: 820px; margin: 0 auto; font-size: 11pt; line-height: 1.55; }
h1 { font-size: 20pt; color: #00836b; margin: 0 0 4pt 0; border-bottom: 2px solid #00836b; padding-bottom: 6pt; }
h2 { font-size: 14pt; margin: 18pt 0 6pt; color: #1a1a1a; }
h3 { font-size: 12pt; margin: 14pt 0 4pt; color: #333; }
h4 { font-size: 11pt; margin: 10pt 0 4pt; font-weight: 700; }
p { margin: 6pt 0; line-height: 1.55; }
ul, ol { padding-left: 22pt; margin: 6pt 0; }
li { margin: 3pt 0; }
strong { font-weight: 700; }
em { font-style: italic; }
hr { border: none; border-top: 1px solid #ccc; margin: 20pt 0; }
.meta { color: #555; font-size: 10pt; background: #f4f4f4; padding: 10pt 14pt; border-radius: 4pt; margin-bottom: 20pt; line-height: 1.7; }
.source-list { background: #f8f8f8; border-left: 3px solid #00836b; padding: 8pt 16pt; font-size: 10pt; }
.source-list em { color: #666; font-size: 9pt; }
.disclaimer { font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 14pt; margin-top: 32pt; font-style: italic; line-height: 1.5; }
@media print {
  body { padding: 0; max-width: none; color: #000; }
  h1 { color: #000; border-color: #000; }
  .meta { background: transparent; border: 1px solid #999; }
  .source-list { background: transparent; }
  @page { margin: 18mm; }
}
</style></head><body>${body}</body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch(e) {} }, 350);
}

function exportAsWord(payload) {
  const body = buildHtmlBody(payload);
  const { fileStamp } = exportTimestamp();
  const filename = `vigia-${payload.isFullConversation ? "conversacion" : "consulta"}-${fileStamp}.doc`;
  const wordHtml = `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>VIGÍA</title>
<style>
body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
h1 { font-size: 20pt; color: #00836b; }
h2 { font-size: 14pt; margin-top: 18pt; }
h3 { font-size: 12pt; margin-top: 12pt; color: #333; }
.meta { background: #f4f4f4; padding: 10pt; font-size: 10pt; }
.source-list { background: #f8f8f8; padding: 8pt 14pt; font-size: 10pt; }
.disclaimer { font-size: 9pt; color: #666; font-style: italic; margin-top: 28pt; padding-top: 10pt; border-top: 1px solid #ccc; }
</style></head><body>${body}</body></html>`;
  downloadBlob(wordHtml, filename, "application/msword");
}

function exportAsMarkdownFile(payload) {
  const md = buildMarkdownExport(payload);
  const { fileStamp } = exportTimestamp();
  downloadBlob(md, `vigia-${payload.isFullConversation ? "conversacion" : "consulta"}-${fileStamp}.md`, "text/markdown;charset=utf-8");
}

function exportAsTxtFile(payload) {
  const txt = buildTxtExport(payload);
  const { fileStamp } = exportTimestamp();
  downloadBlob(txt, `vigia-${payload.isFullConversation ? "conversacion" : "consulta"}-${fileStamp}.txt`, "text/plain;charset=utf-8");
}

// --- FUENTE BADGE -------------------------------------------------------------
function FuenteBadge({fuente}) {
if(!fuente) return null;
const tipos = {
normativa:{ icon:BookOpen, color:"#4d9fff", bg:"rgba(77,159,255,0.10)", label:"Normativa" },
jurisprudencial:{ icon:Scale, color:"#a78bfa", bg:"rgba(167,139,250,0.10)", label:"Jurisprudencia" },
administrativa:{ icon:FileCheck, color:"#00c9a7", bg:"rgba(0,201,167,0.10)", label:"Acto Administrativo" },
};
const t = tipos[fuente.tipo]||tipos.normativa;
const Icon = t.icon;
return (
<div style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 8px",borderRadius:5,background:t.bg,border:`1px solid ${t.color}33`}}>
<Icon size={10} color={t.color}/>
<span style={{fontSize:10,fontWeight:600,color:t.color}}>{t.label}</span>
</div>
);
}

// --- FUENTE DETAIL ------------------------------------------------------------
function FuenteDetail({fuente}) {
if(!fuente) return null;
const fields = {
normativa:[
{k:"tipo_norma",l:"Tipo"},
{k:"numero",l:"Numero"},
{k:"articulo",l:"Articulo"},
{k:"parrafo",l:"Parrafo/inciso"},
{k:"fecha_expedicion",l:"Fecha expedicion"},
{k:"autoridad_emisora",l:"Autoridad emisora"},
{k:"vigencia",l:"Vigencia"},
],
jurisprudencial:[
{k:"tribunal",l:"Tribunal/Corte"},
{k:"numero_sentencia",l:"Sentencia/Radicado"},
{k:"fecha",l:"Fecha"},
{k:"magistrado_ponente",l:"Magistrado ponente"},
{k:"ratio_decidendi",l:"Ratio decidendi"},
{k:"aplicabilidad",l:"Aplicabilidad al caso"},
],
administrativa:[
{k:"tipo_acto",l:"Tipo de acto"},
{k:"numero_acto",l:"Numero del acto"},
{k:"fecha",l:"Fecha"},
{k:"autoridad_competente",l:"Autoridad competente"},
{k:"radicado",l:"Radicado"},
{k:"objeto",l:"Objeto del acto"},
],
};
const fs = fields[fuente.tipo]||fields.normativa;
const colores = {
normativa:{color:"#4d9fff",bg:"rgba(77,159,255,0.06)"},
jurisprudencial:{color:"#a78bfa",bg:"rgba(167,139,250,0.06)"},
administrativa:{color:"#00c9a7",bg:"rgba(0,201,167,0.06)"},
};
const tc = colores[fuente.tipo]||colores.normativa;
return (
<div style={{background:tc.bg,borderRadius:8,padding:"10px 12px",border:`1px solid ${tc.color}22`,marginTop:8}}>
<div style={{fontSize:10,color:tc.color,fontWeight:700,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Trazabilidad de fuente</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
{fs.map(f=>fuente[f.k]&&(
<div key={f.k} style={{gridColumn:f.k==="ratio_decidendi"||f.k==="objeto"||f.k==="aplicabilidad"?"1 / -1":"auto"}}>
<div style={{fontSize:9,color:C.textMuted,marginBottom:2,textTransform:"uppercase"}}>{f.l}</div>
<div style={{fontSize:11,color:C.text,fontWeight:500,lineHeight:1.4}}>{fuente[f.k]}</div>
</div>
))}
</div>
</div>
);
}

// SEED hardcoded eliminado (v3.1.1). Los datos vienen de Supabase; obligaciones sin
// `fuente` simplemente no muestran el badge (render ya tiene guards).

// --- INTAKE CONSTANTS ---------------------------------------------------------
const DOC_TYPES = {
norma:{ label:"Norma", color:"#a78bfa", bg:"rgba(167,139,250,0.10)", desc:"Ley, Decreto, Resolucion, Circular" },
acto_administrativo:{ label:"Acto Administrativo", color:"#ff4d6d", bg:"rgba(255,77,109,0.12)", desc:"Auto, Oficio, Resolucion individual" },
jurisprudencia:{ label:"Jurisprudencia", color:"#4d9fff", bg:"rgba(77,159,255,0.10)", desc:"Sentencia, Auto judicial" },
comunicacion:{ label:"Comunicacion", color:"#00c9a7", bg:"rgba(0,201,167,0.10)", desc:"Entrante o saliente con la autoridad" },
evidencia_cumplimiento:{ label:"Evidencia de Cumplimiento", color:"#2ec986", bg:"rgba(46,201,134,0.12)", desc:"Informe, certificado, constancia" },
documento_tecnico:{ label:"Documento Tecnico", color:"#f7c948", bg:"rgba(247,201,72,0.12)", desc:"Estudio, plan, protocolo, plano" },
otro:{ label:"Otro", color:"#5e7a95", bg:"rgba(94,122,149,0.10)", desc:"Documento no clasificado" },
};
const ACTIONS = {
crea_obligacion:{ label:"Crea obligacion nueva", color:"#ff4d6d" },
modifica_obligacion:{ label:"Modifica obligacion existente", color:"#f7c948" },
confirma_cumplimiento:{ label:"Confirma cumplimiento", color:"#2ec986" },
inicia_sancion:{ label:"Inicia proceso sancionatorio", color:"#ff4d6d" },
requiere_respuesta:{ label:"Requiere respuesta", color:"#f7c948" },
amplia_plazo:{ label:"Amplia plazo", color:"#4d9fff" },
aprueba_tramite:{ label:"Aprueba tramite", color:"#2ec986" },
agrega_a_normativa:{ label:"Agrega a base normativa", color:"#a78bfa" },
genera_alerta:{ label:"Genera alerta regulatoria", color:"#a78bfa" },
informativo:{ label:"Solo informativo", color:"#5e7a95" },
};
const SEED_INTAKE = [];

// --- INTAKE MODULE -------------------------------------------------------------
function IntakeModule({ onNewAlert, onNewNorm, clientOrg, sessionToken, onNewInstrument, onNewObligation, onObligationUpdate, instruments = [], obligations = [] }) {
const [docs, setDocs] = React.useState([]);
const [selectedDoc, setSelectedDoc] = React.useState(null);
const [uploadState, setUploadState] = React.useState("idle");
const [analysisResult, setAnalysisResult] = React.useState(null);
const [dragOver, setDragOver] = React.useState(false);
const [filterNature, setFilterNature] = React.useState("todos");
const [confirmAnswers, setConfirmAnswers] = React.useState({});
const [analysisStep, setAnalysisStep] = React.useState(0);
const [pendingChanges, setPendingChanges] = React.useState([]);
const fileRef = React.useRef();

const I = C;

const sbPost = async (table, body) => {
  if(!sessionToken) return {error:"No hay sesión activa"};
  const r = await fetch(SB_URL+"/rest/v1/"+table, {
    method:"POST",
    headers:{apikey:SB_KEY, Authorization:"Bearer "+sessionToken, "Content-Type":"application/json", Prefer:"return=representation"},
    body:JSON.stringify(body)
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {error:t}; }
};

const saveToSupabase = async (analysisResult, file) => {
  if(isDemoMode) return null;
  if(!clientOrg?.id) return null;
  // Ramificación por doc_nature:
  // - norma/jurisprudencia: van a normative_sources + regulatory_alerts vía
  //   onNewNorm/onNewAlert desde processAndLink. No crear instrument ni document aquí.
  // - acto_administrativo: crea EDI (instrument) + document + embed + obligations.
  // - evidencia_cumplimiento, documento_tecnico, comunicacion, otro: NO crea EDI nuevo;
  //   si hay candidate_edi que matchee un EDI existente, linkea; si no, doc huérfano.
  //   Siempre persiste document y vectoriza para activar REGLA 18.
  if(analysisResult.doc_nature === "norma" || analysisResult.doc_nature === "jurisprudencia") return null;
  const orgId = clientOrg.id;
  const now = new Date().toISOString().split("T")[0];
  const isActoAdmin = analysisResult.doc_nature === "acto_administrativo";

  // 1. Create instrument SOLO para acto_administrativo. Otros tipos: buscar EDI existente por candidate_edi.
  let instrId = null;
  if(isActoAdmin) {
    const limiteEdis = clientOrg?.limite_edis ?? 999;
    if(instruments.length >= limiteEdis) {
      alert(`Límite de ${limiteEdis} EDIs alcanzado para tu plan. Contacta a ENARA para ampliar.`);
      return null;
    }
    try {
      const instrPayload = {
        org_id: orgId,
        title: analysisResult.edi_title || null,
        instrument_type: analysisResult.candidate_edi || "Acto Administrativo",
        number: analysisResult.radicado || "SIN-RADICADO-"+Date.now(),
        issue_date: analysisResult.doc_date || now,
        authority_name: analysisResult.sender || "Por determinar",
        project_name: analysisResult.subject || analysisResult.candidate_edi || (clientOrg?.name ? `EDI ${clientOrg.name}` : "EDI sin título"),
        location_dept: clientOrg?.location_dept || null,
        location_mun: clientOrg?.location_mun || null,
        domain: clientOrg?.sector || "ambiental",
        edi_status: "activo",
        completeness_pct: analysisResult.candidate_confidence || 60,
        has_confidential_sections: false,
        ingested_at: new Date().toISOString()
      };
      const instrRes = await sbPost("instruments", instrPayload);
      if(Array.isArray(instrRes) && instrRes[0]?.id) {
        instrId = instrRes[0].id;
        if(onNewInstrument) onNewInstrument(instrRes[0]);
        logAudit("crear_edi","instrument",instrRes[0].id,{type:instrPayload.instrument_type,number:instrPayload.number});
      }
    } catch(e) { console.log("instrument save error", e); }
  } else if(analysisResult.candidate_edi) {
    // Link a EDI existente si candidate_edi matchea project_name o title
    const cand = analysisResult.candidate_edi;
    const existing = instruments.find(e => e.title === cand || e.project_name === cand || e.number === cand);
    if(existing?.id) instrId = existing.id;
  }

  // 2. Save document record (para TODOS los tipos no-norma/jurisprudencia)
  // doc_role CHECK permite: acto_principal|anexo_tecnico|modificacion|auto_seguimiento|informe_cumplimiento|evidencia|otro
  const DOC_ROLE_MAP = { acto_administrativo:"acto_principal", comunicacion:"auto_seguimiento", evidencia_cumplimiento:"evidencia", documento_tecnico:"anexo_tecnico", otro:"otro" };
  const docPayload = {
    org_id: orgId,
    instrument_id: instrId,
    original_name: file.name,
    file_type: file.type || "application/octet-stream",
    file_size_kb: Math.round(file.size/1024),
    doc_role: DOC_ROLE_MAP[analysisResult.doc_nature] || "otro",
    doc_label: analysisResult.edi_title || analysisResult.subject || file.name,
    accessibility: "pendiente_revisión",
    ocr_status: "completo",
    extracted_text: analysisResult.content_summary || "",
    raw_text: (analysisResult.raw_text || "").slice(0, 50000),
    format_type: file.type || null,
    processed_method: analysisResult.extraction_method || (analysisResult.ocr_used ? "ocr_vision" : "direct_text"),
    raw_text_length: (analysisResult.raw_text || "").length,
    doc_type_detected: analysisResult.doc_nature || null
  };
  let savedDoc = null;
  try {
    const dres = await sbPost("documents", docPayload);
    if (Array.isArray(dres) && dres[0]?.id) savedDoc = dres[0];
  } catch(e) { console.log("document save error", e); }

  // 3. Vectorizar el texto extraído para activar REGLA 18 (todos los tipos)
  if (savedDoc?.id && sessionToken && analysisResult.raw_text && analysisResult.raw_text.length > 100) {
    fetch(`${SB_URL}/functions/v1/embed-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ text: analysisResult.raw_text.slice(0, 8000) })
    }).then(r => r.ok ? r.json() : null)
      .then(ed => {
        if (ed?.embedding) {
          const vec = "[" + ed.embedding.map(f => f.toFixed(7)).join(",") + "]";
          fetch(`${SB_URL}/rest/v1/documents?id=eq.${savedDoc.id}`, {
            method: "PATCH",
            headers: { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ embedding: vec })
          }).catch(e => console.warn("doc vector patch silenced:", e));
        }
      }).catch(e => console.warn("embed-text silenced:", e));
  }

  // 4. Obligations: solo si hay instrument (acto_administrativo o match con EDI existente)
  if(instrId) {
    if(analysisResult.obligations_affected?.length > 0) {
      const newObs = [];
      for(let i=0; i<analysisResult.obligations_affected.length; i++){
        try {
          const oNum = analysisResult.obligations_affected[i];
          const dl = analysisResult.deadlines_found?.[i] || null;
          const obPayload = {
            instrument_id: instrId,
            org_id: orgId,
            obligation_num: oNum,
            name: oNum + " — Extraída de " + (analysisResult.subject||file.name).slice(0,80),
            description: analysisResult.content_summary || "",
            obligation_type: "ambiental",
            frequency: "única",
            due_date: dl ? null : null,
            status: "al_dia",
            confidence_level: analysisResult.candidate_confidence > 70 ? "alta" : "media",
            ai_interpretation: "Extraída automáticamente por VIGÍA INTAKE",
            requires_human_validation: analysisResult.requires_confirmation || false,
            has_regulatory_update: analysisResult.is_norma || false,
            norma_fundamento: analysisResult?.fuente?.tipo_norma && analysisResult?.fuente?.numero
              ? `${analysisResult.fuente.tipo_norma} ${analysisResult.fuente.numero}${analysisResult.fuente.fecha_expedicion ? "/" + String(analysisResult.fuente.fecha_expedicion).slice(0,4) : ""}`.trim()
              : null,
            articulo_fundamento: analysisResult?.fuente?.articulo || null,
            vigencia_fundamento: analysisResult?.fuente?.vigencia?.toLowerCase()?.includes("vigente") ? "vigente" : "sin_informacion"
          };
          const obRes = await sbPost("obligations", obPayload);
          if(Array.isArray(obRes) && obRes[0]) newObs.push(obRes[0]);
        } catch(e) { console.log("obligation save error", e); }
      }
      if(newObs.length > 0 && onNewObligation) onNewObligation(newObs);
    }
  }

  // ORG-3: enriquecer perfil de org (fire-and-forget)
  if (sessionToken && clientOrg?.id) {
    const enrichText = (analysisResult.content_summary || "") + "\n\n" +
      (analysisResult.subject || "") + "\n" +
      (analysisResult.obligations_affected || []).join("\n");
    if (enrichText.length >= 200) {
      fetch(`${SB_URL}/functions/v1/enrich-org-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
        body: JSON.stringify({
          org_id: clientOrg.id,
          text: enrichText.slice(0, 8000),
          metadata: {
            instrument_type: analysisResult.candidate_edi || analysisResult.doc_nature,
            issuing_authority: analysisResult.sender,
            sector: clientOrg?.sector,
          }
        })
      }).catch(e => console.warn('enrich-org-profile silenced:', e));
    }
  }
  return instrId;
};

const analyzeDocument = async (file) => {
  setUploadState("analyzing");
  setAnalysisStep(0);
  const isPDF = file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  const fn = file.name.toLowerCase();
  const isDocx = file.type.includes("wordprocessingml") || fn.endsWith(".docx");
  const isTxt = file.type === "text/plain" || fn.endsWith(".txt");
  const isMd = file.type === "text/markdown" || fn.endsWith(".md");
  const isHtml = file.type === "text/html" || fn.endsWith(".html") || fn.endsWith(".htm");
  const needsPreExtract = isDocx || isTxt || isMd || isHtml;
  if (!isPDF && !isImage && !needsPreExtract) {
    setAnalysisResult({doc_nature:"otro",is_norma:false,sender:"Por determinar",receiver:clientOrg?.name||"Mi Empresa",doc_date:null,radicado:null,subject:file.name,content_summary:"Tipo no soportado. Acepta PDF, DOCX, TXT, MD, HTML, PNG, JPG o WebP.",actions_detected:[],obligations_affected:[],deadlines_found:[],candidate_edi:null,candidate_confidence:0,matching_reasons:[],urgency:"informativa",requires_confirmation:true,confirmation_questions:[],recommended_classification:"Convertir a PDF y reintentar.",norma_data:null,proposed_changes:[],fuente:null,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:false});
    setUploadState("result");
    return;
  }
  if (file.size > 10*1024*1024) {
    setAnalysisResult({doc_nature:"otro",is_norma:false,sender:"Por determinar",receiver:clientOrg?.name||"Mi Empresa",doc_date:null,radicado:null,subject:file.name,content_summary:"El archivo supera 10 MB.",actions_detected:[],obligations_affected:[],deadlines_found:[],candidate_edi:null,candidate_confidence:0,matching_reasons:[],urgency:"informativa",requires_confirmation:true,confirmation_questions:[],recommended_classification:"Reducir tamaño y reintentar.",norma_data:null,proposed_changes:[],fuente:null,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:false});
    setUploadState("result");
    return;
  }

  let base64Data = null;
  try {
    base64Data = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result.split(",")[1]); r.onerror=reject; r.readAsDataURL(file); });
  } catch { base64Data=null; }

  // Pre-extract para formatos no-PDF/imagen (DOCX, TXT, MD, HTML) via multi-format-extractor
  let preExtractedText = null;
  let extractionMethod = null;
  if (needsPreExtract && base64Data && sessionToken) {
    try {
      const ex = await fetch(`${SB_URL}/functions/v1/multi-format-extractor`, {
        method:"POST",
        headers:{"Content-Type":"application/json", Authorization:`Bearer ${sessionToken}`, apikey: SB_KEY},
        body: JSON.stringify({ file_base64: base64Data, mime_type: file.type, filename: file.name })
      });
      const ed = await ex.json();
      if (ed.text && ed.text.length > 50) {
        preExtractedText = ed.text;
        extractionMethod = ed.method;
      }
    } catch(e) { console.warn("multi-format-extractor silenced:", e); }
  }

  for(let i=1;i<=5;i++){ await new Promise(r=>setTimeout(r,500)); setAnalysisStep(i); }

  const oblNums = obligations.map(o=>o.obligation_num||o.num).filter(Boolean);
  const SYSTEM = `Eres el motor de ingestion documental de VIGIA, plataforma de inteligencia regulatoria ambiental colombiana.

Organización del cliente: ${clientOrg?.name||"(sin definir)"} (sector ${clientOrg?.sector||"—"}).
EDIs activos (${instruments.length}): ${instruments.length===0?"ninguno registrado":instruments.map(e=>`${e.project_name||e.name||"(sin nombre)"} — instrumento No. ${e.number||"—"}, autoridad ${e.authority_name||"—"}`).join("; ")}.
Obligaciones activas (${obligations.length}): ${obligations.length===0?"ninguna registrada":obligations.map(o=>`${o.obligation_num||o.num||o.id}: ${o.name} (vence ${o.due_date||"—"}, estado ${o.status||"—"})`).join("; ")}.
IMPORTANTE: Si el documento es una norma (ley, decreto, resolucion, circular, sentencia), identificalo como tal y extrae sus metadatos normativos completos. Las normas deben agregarse a la base normativa Y generar alertas regulatorias Y proponer cambios a las obligaciones afectadas.

TÍTULO DESCRIPTIVO (edi_title): extrae un título en formato "[Tipo de instrumento] · [Nombre del proyecto o actividad] · [Municipio/Departamento]". Ejemplo: "Licencia Ambiental · Parque Solar Baranoa I · Barranquilla, Atlántico". Si falta información para algún componente, omítelo. Máximo 80 caracteres. Debe ser descriptivo y útil para que un humano confirme de un vistazo a qué se refiere el EDI.

REGLAS ESTRICTAS PARA proposed_changes:
- obligation_num DEBE ser exactamente uno de los siguientes valores literales: ${oblNums.length===0?"(no hay obligaciones registradas, devuelve proposed_changes: [])":oblNums.join(", ")}. Prohibido inventar, prohibido "TODAS", "GLOBAL", "N/A", null, o cualquier valor fuera de esa lista.
- field DEBE ser exactamente uno de estos nombres de columna reales de la tabla obligations: due_date, frequency, description, obligation_type, source_article, status, days_alert_before, start_date, end_date. No inventes campos.
- after DEBE respetar el tipo y los CHECK del campo:
  · frequency ∈ {única, diaria, semanal, quincenal, mensual, bimestral, trimestral, semestral, anual, por_hito}.
  · status ∈ {al_dia, proximo, vencido, cumplido, suspendido, no_aplica, pendiente}.
  · due_date, start_date, end_date en formato YYYY-MM-DD.
  · days_alert_before es un entero positivo.
- Si no puedes proponer un cambio concreto y aplicable que cumpla TODAS las reglas anteriores, devuelve proposed_changes: []. No inventes para llenar.
Responde SOLO en JSON:
{"doc_nature":"norma|acto_administrativo|jurisprudencia|comunicacion|evidencia_cumplimiento|documento_tecnico|otro","edi_title":"título descriptivo máx 80 chars o null","is_norma":true,"sender":"emisor","receiver":"destinatario","doc_date":"YYYY-MM-DD","radicado":"numero o null","subject":"asunto exacto","content_summary":"resumen 2-3 oraciones","actions_detected":["crea_obligacion|modifica_obligacion|confirma_cumplimiento|inicia_sancion|requiere_respuesta|amplia_plazo|aprueba_tramite|agrega_a_normativa|genera_alerta|informativo"],"obligations_affected":["OBL-04|OBL-07|OBL-11|OBL-03"],"deadlines_found":["plazos detectados"],"candidate_edi":"nombre EDI o null","candidate_confidence":0-100,"matching_reasons":["razon"],"urgency":"critica|moderada|informativa","requires_confirmation":false,"confirmation_questions":[],"recommended_classification":"como clasificar","norma_data":{"tipo_norma":"Ley|Decreto|Resolucion|Circular|Sentencia|Proyecto","numero":"numero","fecha_expedicion":"YYYY-MM-DD","autoridad_emisora":"quien la expidio","vigencia":"Vigente|Derogada|En consulta publica","articulos_relevantes":["Art. X - descripcion"]},"proposed_changes":[{"obligation_num":"OBL-XX","field":"campo a cambiar","before":"valor actual","after":"nuevo valor","reason":"articulo que lo sustenta"}],"fuente":{"tipo":"normativa|jurisprudencial|administrativa","tipo_norma":"si aplica","numero":"numero","articulo":"articulo","parrafo":"parrafo","fecha_expedicion":"fecha","autoridad_emisora":"autoridad","vigencia":"vigencia","tribunal":"si es jurisprudencia","numero_sentencia":"si aplica","magistrado_ponente":"si aplica","ratio_decidendi":"si aplica","tipo_acto":"si es administrativa","numero_acto":"numero","fecha":"fecha","autoridad_competente":"autoridad","radicado":"radicado","objeto":"objeto del acto"}}`;

  try {
    const payload = { fileData: base64Data, fileName: file.name, fileType: file.type || (isPDF?"application/pdf":"application/octet-stream"), systemPrompt: SYSTEM };
    if (preExtractedText) payload.preExtractedText = preExtractedText.slice(0, 30000);
    const res = await fetch(`${SB_URL}/functions/v1/analyze-document`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken||SB_KEY}`,
        apikey: SB_KEY
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.result) {
      const errMsg = data.error || `Error ${res.status}`;
      setAnalysisResult({doc_nature:"otro",is_norma:false,sender:"Por determinar",receiver:clientOrg?.name||"Mi Empresa",doc_date:null,radicado:null,subject:file.name.replace(/\.[^/.]+$/,"").replace(/_/g," "),content_summary:`No se pudo procesar: ${errMsg}`,actions_detected:["informativo"],obligations_affected:[],deadlines_found:[],candidate_edi:null,candidate_confidence:0,matching_reasons:["Error del analizador"],urgency:"informativa",requires_confirmation:true,confirmation_questions:[{question:"Tipo de documento?",options:Object.values(DOC_TYPES).map(t=>t.label)}],recommended_classification:"Clasificar manualmente.",norma_data:null,proposed_changes:[],fuente:null,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:false});
    } else {
      setAnalysisResult({...data.result, file_name:file.name, file_type:file.name.split(".").pop(), file_size:`${(file.size/1024/1024).toFixed(1)} MB`, ocr_used:true, extraction_method: extractionMethod, raw_text: preExtractedText});
    }
  } catch (e) {
    setAnalysisResult({doc_nature:"otro",is_norma:false,sender:"Por determinar",receiver:clientOrg?.name||"Mi Empresa",doc_date:null,radicado:null,subject:file.name.replace(/\.[^/.]+$/,"").replace(/_/g," "),content_summary:`Error de red: ${e.message}`,actions_detected:["informativo"],obligations_affected:[],deadlines_found:[],candidate_edi:null,candidate_confidence:0,matching_reasons:[],urgency:"informativa",requires_confirmation:true,confirmation_questions:[],recommended_classification:"Reintentar.",norma_data:null,proposed_changes:[],fuente:null,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:false});
  }
  setUploadState("result");
};

const EDITABLE_OBLIGATION_FIELDS = ["due_date","frequency","description","obligation_type","source_article","status","days_alert_before","start_date","end_date"];
const applyChange = async (idx) => {
  const ch = pendingChanges[idx];
  if(!ch || !clientOrg?.id) return;
  if(!ch.obligation_num || /^(todas|todos|global|n\/?a)$/i.test(String(ch.obligation_num))) { alert(`El cambio propuesto apunta a "${ch.obligation_num}", que no es una obligación válida. Editá manualmente si aplica.`); return; }
  const target = obligations.find(o => (o.obligation_num||o.num) === ch.obligation_num && o.org_id === clientOrg.id);
  if(!target?.id) { alert(`No se encontró la obligación ${ch.obligation_num} en tu organización.`); return; }
  if(!ch.field) { alert("El cambio propuesto no indica qué campo actualizar."); return; }
  if(!EDITABLE_OBLIGATION_FIELDS.includes(ch.field)) { alert(`El campo "${ch.field}" no es editable. Campos permitidos: ${EDITABLE_OBLIGATION_FIELDS.join(", ")}.`); return; }
  if(!sessionToken) { alert("Sesión expirada. Volvé a iniciar sesión."); return; }
  try {
    const r = await fetch(`${SB_URL}/rest/v1/obligations?id=eq.${target.id}`, {
      method:"PATCH",
      headers:{apikey:SB_KEY, Authorization:"Bearer "+sessionToken, "Content-Type":"application/json", Prefer:"return=representation"},
      body: JSON.stringify({ [ch.field]: ch.after })
    });
    const t = await r.text();
    if(!r.ok) throw new Error(`${r.status}: ${t.slice(0,120)}`);
    const saved = JSON.parse(t);
    const updated = Array.isArray(saved) ? saved[0] : saved;
    if(updated?.id && onObligationUpdate) onObligationUpdate(updated);
    setPendingChanges(p=>p.map((c,i)=>i===idx?{...c,applied:true}:c));
  } catch(e) {
    alert(`No se pudo aplicar el cambio en ${ch.obligation_num}: ${e.message||e}`);
  }
};

const processAndLink = () => {
if(!analysisResult) return;
const edi=instruments.find(e=>(e.project_name||e.name)===analysisResult.candidate_edi);
const newDoc={id:`int_${Date.now()}`,original_name:analysisResult.file_name,file_type:analysisResult.file_type,file_size:analysisResult.file_size,doc_nature:analysisResult.doc_nature,is_norma:analysisResult.is_norma||false,sender:analysisResult.sender,receiver:analysisResult.receiver,doc_date:analysisResult.doc_date||new Date().toISOString().split("T")[0],received_date:new Date().toISOString().split("T")[0],radicado:analysisResult.radicado,subject:analysisResult.subject,content_summary:analysisResult.content_summary,actions_detected:analysisResult.actions_detected,obligations_affected:analysisResult.obligations_affected,confidence_pct:analysisResult.candidate_confidence,edi_id:edi?.id||null,urgency:analysisResult.urgency,status:"procesado",processed_date:new Date().toISOString().split("T")[0],norma_data:analysisResult.norma_data||null,proposed_changes:analysisResult.proposed_changes||[]};
saveToSupabase(analysisResult, {name:analysisResult.file_name||"documento",type:analysisResult.file_type||"",size:(analysisResult.file_size||0)*1024}).catch(e=>console.log("supabase save",e));
setDocs(p=>[newDoc,...p]);
if(analysisResult.is_norma&&onNewNorm) onNewNorm(analysisResult);
if(analysisResult.is_norma&&onNewAlert) onNewAlert(analysisResult);
if(analysisResult.proposed_changes?.length>0) setPendingChanges(analysisResult.proposed_changes.map(c=>({...c,applied:false})));
setUploadState("idle"); setAnalysisResult(null); setConfirmAnswers({});
};

const STEPS=["Extrayendo contenido","Clasificando naturaleza","Identificando partes","Analizando impacto normativo","Buscando EDI afectado"];
const urgC=(u)=>u==="critica"?"#ff4d6d":u==="moderada"?"#f7c948":"#4d9fff";
const urgB=(u)=>u==="critica"?"rgba(255,77,109,0.12)":u==="moderada"?"rgba(247,201,72,0.12)":"rgba(77,159,255,0.10)";
const filteredDocs=docs.filter(d=>filterNature==="todos"||d.doc_nature===filterNature);
const pending=docs.filter(d=>d.status==="requiere_confirmacion").length;
const normasCount=docs.filter(d=>d.is_norma).length;

return (
<div style={{padding:28,color:I.text}}>
<style>{`@keyframes spinI{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulseI{0%,100%{opacity:0.3}50%{opacity:1}}@keyframes fadeInI{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:24,flexWrap:"wrap",gap:12}}>
    <div>
      <h1 style={{fontSize:22,fontWeight:700,color:I.text,margin:0}}>INTAKE</h1>
      <p style={{fontSize:13,color:I.textSec,margin:"4px 0 0"}}>
        Motor de ingestion documental - {docs.length} doc{docs.length!==1?"s":""} - {normasCount} norma{normasCount!==1?"s":""} procesada{normasCount!==1?"s":""}
        {pending>0&&<span style={{color:I.yellow,fontWeight:600}}> - {pending} pendiente{pending!==1?"s":""}</span>}
      </p>
    </div>
    <button onClick={()=>fileRef.current?.click()} style={{background:I.primary,border:"none",borderRadius:8,padding:"9px 18px",color:"#060c14",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
      <Upload size={14}/> Cargar documento
    </button>
    <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.webp,.html,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown,text/html" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&analyzeDocument(e.target.files[0])}/>
  </div>

  {pendingChanges.filter(c=>!c.applied).length>0&&(
    <div style={{background:"rgba(247,201,72,0.06)",border:`1px solid ${I.yellow}44`,borderRadius:12,padding:"16px 18px",marginBottom:20,animation:"fadeInI 0.3s ease"}}>
      <div style={{fontSize:13,fontWeight:700,color:I.yellow,marginBottom:12}}>Cambios propuestos a obligaciones - pendientes de aprobacion</div>
      {pendingChanges.filter(c=>!c.applied).map((ch,i)=>(
        <div key={i} style={{background:I.surface,borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:700,color:I.text,marginBottom:4}}>{ch.obligation_num} - {ch.field}</div>
            <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11}}>
              <span style={{color:I.red,textDecoration:"line-through"}}>{ch.before}</span>
              <span style={{color:I.textMuted}}>→</span>
              <span style={{color:I.green,fontWeight:600}}>{ch.after}</span>
            </div>
            <div style={{fontSize:10,color:I.textMuted,marginTop:4}}>{ch.reason}</div>
          </div>
          <button onClick={()=>applyChange(i)} style={{background:I.primaryDim,border:`1px solid ${I.primary}44`,borderRadius:6,padding:"6px 14px",color:I.primary,fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>Aplicar cambio</button>
        </div>
      ))}
    </div>
  )}

  {uploadState==="idle"&&(
    <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);e.dataTransfer.files?.[0]&&analyzeDocument(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()}
      style={{border:`2px dashed ${dragOver?I.primary:I.border}`,borderRadius:14,padding:"32px 24px",textAlign:"center",cursor:"pointer",marginBottom:24,background:dragOver?I.primaryDim:"transparent",transition:"all 0.15s"}}>
      <div style={{width:52,height:52,borderRadius:14,background:dragOver?I.primaryDim:I.surfaceEl,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}>
        <Upload size={22} color={dragOver?I.primary:I.textMuted}/>
      </div>
      <div style={{fontSize:15,fontWeight:700,color:dragOver?I.primary:I.textSec,marginBottom:6}}>{dragOver?"Suelta para analizar":"Arrastra cualquier documento o toca para seleccionar"}</div>
      <div style={{fontSize:12,color:I.textMuted,marginBottom:14}}>PDF - DOCX - JPG - PNG - ZIP - MSG - EML - Cualquier formato</div>
      <div style={{display:"flex",justifyContent:"center",gap:6,flexWrap:"wrap"}}>
        {["Resoluciones","Decretos","Leyes","Sentencias","Autos","Oficios","Informes","Planos","Contratos"].map(t=>(
          <span key={t} style={{padding:"3px 10px",borderRadius:12,fontSize:11,background:I.surfaceEl,color:I.textSec}}>{t}</span>
        ))}
      </div>
    </div>
  )}

  {uploadState==="analyzing"&&(
    <div style={{background:I.surface,border:`1px solid ${I.border}`,borderRadius:14,padding:"32px 24px",marginBottom:24}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
        <div style={{width:56,height:56,borderRadius:14,background:I.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <RefreshCw size={24} color={I.primary} style={{animation:"spinI 1s linear infinite"}}/>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontSize:16,fontWeight:700,color:I.text,marginBottom:4}}>Procesando documento</div>
          <div style={{fontSize:12,color:I.textSec}}>{STEPS[Math.min(analysisStep,STEPS.length-1)]}</div>
        </div>
        <div style={{width:"100%",maxWidth:400}}>
          {STEPS.map((step,i)=>(
            <div key={step} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:i<STEPS.length-1?`1px solid ${I.border}`:"none"}}>
              <div style={{width:24,height:24,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:i<analysisStep?I.primaryDim:I.surfaceEl,border:`1px solid ${i<analysisStep?I.primary:I.border}`,transition:"all 0.3s"}}>
                {i<analysisStep?<CheckCircle size={13} color={I.primary}/>:<span style={{fontSize:10,color:I.textMuted}}>{i+1}</span>}
              </div>
              <div style={{fontSize:12,color:i<analysisStep?I.text:I.textMuted,fontWeight:i<analysisStep?600:400}}>{step}</div>
              {i===analysisStep-1&&<div style={{marginLeft:"auto",display:"flex",gap:3}}>{[0,1,2].map(j=><div key={j} style={{width:5,height:5,borderRadius:"50%",background:I.primary,animation:"pulseI 1s infinite",animationDelay:`${j*0.2}s`}}/>)}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )}

  {uploadState==="result"&&analysisResult&&(
    <div style={{background:I.surface,border:`1px solid ${analysisResult.is_norma?I.purple+"55":I.border}`,borderRadius:14,padding:24,marginBottom:24,animation:"fadeInI 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
        <div style={{width:40,height:40,borderRadius:10,background:analysisResult.is_norma?I.purpleDim:I.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}>{analysisResult.is_norma?<BookOpen size={18} color={I.purple}/>:<Zap size={18} color={I.primary}/>}</div>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:I.text,display:"flex",alignItems:"center",gap:8}}>
            Analisis completado
            {analysisResult.is_norma&&<span style={{padding:"2px 8px",borderRadius:10,fontSize:10,fontWeight:700,background:I.purpleDim,color:I.purple}}>NORMA DETECTADA</span>}
          </div>
          <div style={{fontSize:11,color:I.textSec}}>{analysisResult.file_name} - {analysisResult.file_size}</div>
        </div>
        <button onClick={()=>{setUploadState("idle");setAnalysisResult(null);}} style={{marginLeft:"auto",background:"transparent",border:"none",cursor:"pointer",color:I.textMuted}}><X size={18}/></button>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:I.surfaceEl,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:I.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Naturaleza</div>
          <div style={{fontSize:12,fontWeight:700,color:DOC_TYPES[analysisResult.doc_nature]?.color||I.text}}>{DOC_TYPES[analysisResult.doc_nature]?.label||"Otro"}</div>
        </div>
        <div style={{background:I.surfaceEl,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:I.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Emisor</div>
          <div style={{fontSize:11,fontWeight:600,color:I.text,lineHeight:1.3}}>{analysisResult.sender}</div>
        </div>
        <div style={{background:I.surfaceEl,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:I.textMuted,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>EDI afectado</div>
          <div style={{fontSize:11,fontWeight:600,color:I.text}}>{analysisResult.candidate_edi||"General"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
            <div style={{flex:1,height:3,background:I.border,borderRadius:2}}><div style={{width:`${analysisResult.candidate_confidence}%`,height:"100%",background:analysisResult.candidate_confidence>=95?I.green:I.yellow,borderRadius:2}}/></div>
            <span style={{fontSize:10,fontWeight:700,color:analysisResult.candidate_confidence>=95?I.green:I.yellow}}>{analysisResult.candidate_confidence}%</span>
          </div>
        </div>
      </div>

      <div style={{background:I.surfaceEl,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div style={{fontSize:10,color:I.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Contenido analizado</div>
          {analysisResult.ocr_used?<span style={{padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,background:"rgba(0,201,167,0.15)",color:"#00c9a7"}}>OCR REAL</span>:<span style={{padding:"2px 8px",borderRadius:10,fontSize:9,fontWeight:700,background:I.surfaceEl,color:I.textMuted}}>NOMBRE ARCHIVO</span>}
        </div>
        <div style={{fontSize:13,color:I.text,lineHeight:1.6}}>{analysisResult.content_summary}</div>
        {analysisResult.deadlines_found?.length>0&&(
          <div style={{marginTop:10,padding:"8px 12px",background:"rgba(255,77,109,0.08)",borderRadius:6,borderLeft:"3px solid #ff4d6d"}}>
            <div style={{fontSize:10,color:"#ff4d6d",fontWeight:700,marginBottom:4}}>PLAZOS DETECTADOS</div>
            {analysisResult.deadlines_found.map((d,i)=><div key={i} style={{fontSize:12,color:I.text}}>{d}</div>)}
          </div>
        )}
      </div>

      {analysisResult.is_norma&&analysisResult.norma_data&&(
        <div style={{background:I.purpleDim,border:`1px solid ${I.purple}33`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:I.purple,marginBottom:12}}>Metadatos normativos</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["Tipo",analysisResult.norma_data.tipo_norma],["Numero",analysisResult.norma_data.numero],["Fecha expedicion",analysisResult.norma_data.fecha_expedicion],["Autoridad emisora",analysisResult.norma_data.autoridad_emisora],["Vigencia",analysisResult.norma_data.vigencia]].map(([l,v])=>v&&(
              <div key={l}><div style={{fontSize:9,color:I.textMuted,marginBottom:2,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:11,color:I.text,fontWeight:500}}>{v}</div></div>
            ))}
          </div>
          {analysisResult.norma_data.articulos_relevantes?.length>0&&(
            <div style={{marginTop:10}}>
              <div style={{fontSize:9,color:I.textMuted,marginBottom:6,textTransform:"uppercase"}}>Articulos relevantes para los EDIs</div>
              {analysisResult.norma_data.articulos_relevantes.map((a,i)=>(
                <div key={i} style={{fontSize:11,color:I.text,padding:"4px 0",borderBottom:`1px solid ${I.border}`}}>{a}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {analysisResult.proposed_changes?.length>0&&(
        <div style={{background:"rgba(247,201,72,0.06)",border:`1px solid ${I.yellow}33`,borderRadius:10,padding:"14px 16px",marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:I.yellow,marginBottom:12}}>Cambios propuestos a obligaciones existentes</div>
          {analysisResult.proposed_changes.map((ch,i)=>(
            <div key={i} style={{background:I.surface,borderRadius:8,padding:"10px 12px",marginBottom:6}}>
              <div style={{fontSize:12,fontWeight:700,color:I.text,marginBottom:4}}>{ch.obligation_num}</div>
              <div style={{display:"flex",gap:8,alignItems:"center",fontSize:11,marginBottom:4}}>
                <span style={{color:I.red}}>{ch.before}</span>
                <span style={{color:I.textMuted}}>→</span>
                <span style={{color:I.green,fontWeight:600}}>{ch.after}</span>
              </div>
              <div style={{fontSize:10,color:I.textMuted}}>{ch.reason}</div>
            </div>
          ))}
          <div style={{fontSize:11,color:I.yellow,marginTop:8}}>Los cambios se aplicaran tras confirmar el procesamiento.</div>
        </div>
      )}

      <div style={{display:"flex",gap:10}}>
        <button onClick={processAndLink} style={{flex:1,background:analysisResult.is_norma?I.purple:I.primary,border:"none",borderRadius:8,padding:"11px",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <CheckCircle size={14}/> {analysisResult.is_norma?"Agregar a normativa y generar alertas":analysisResult.doc_nature==="acto_administrativo"?"Crear EDI y vincular obligaciones":"Registrar en lista local (sin persistir)"}
        </button>
        <button onClick={()=>{setUploadState("idle");setAnalysisResult(null);}} style={{background:I.surfaceEl,border:`1px solid ${I.border}`,borderRadius:8,padding:"11px 18px",color:I.textSec,fontSize:13,cursor:"pointer"}}>Cancelar</button>
      </div>
    </div>
  )}

  {uploadState==="idle"&&(
    <>
      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        <select value={filterNature} onChange={e=>setFilterNature(e.target.value)} style={{background:I.surface,border:`1px solid ${I.border}`,borderRadius:6,padding:"5px 10px",color:I.textSec,fontSize:12,cursor:"pointer"}}>
          <option value="todos">Todos los tipos</option>
          {Object.entries(DOC_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{marginLeft:"auto",fontSize:12,color:I.textMuted,alignSelf:"center"}}>{filteredDocs.length} de {docs.length} documentos</span>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filteredDocs.map(doc=>{
          const nt=DOC_TYPES[doc.doc_nature]||DOC_TYPES.otro;
          const isSelected=selectedDoc?.id===doc.id;
          return (
            <div key={doc.id} style={{background:I.surface,border:`1px solid ${doc.is_norma?I.purple+"44":I.border}`,borderRadius:12,overflow:"hidden"}}>
              <div onClick={()=>setSelectedDoc(isSelected?null:doc)} style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:42,height:42,borderRadius:10,background:nt.bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {doc.is_norma?<BookOpen size={18} color={I.purple}/>:<FileText size={18} color={nt.color}/>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:600,color:I.text}}>{doc.subject}</span>
                    {doc.is_norma&&<Badge label="Norma" color={I.purple} bg={I.purpleDim}/>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <Badge label={nt.label} color={nt.color} bg={nt.bg}/>
                    <span style={{fontSize:11,color:I.textMuted}}>{doc.doc_date}</span>
                    <span style={{fontSize:11,color:I.textSec}}>{doc.sender}</span>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginBottom:4}}>
                    <div style={{width:50,height:3,background:I.border,borderRadius:2}}><div style={{width:`${doc.confidence_pct}%`,height:"100%",background:doc.confidence_pct>=95?I.green:I.yellow,borderRadius:2}}/></div>
                    <span style={{fontSize:10,fontWeight:700,color:doc.confidence_pct>=95?I.green:I.yellow}}>{doc.confidence_pct}%</span>
                  </div>
                  <span style={{fontSize:10,color:urgC(doc.urgency),fontWeight:600}}>{doc.urgency}</span>
                </div>
                <ChevronRight size={14} color={I.textMuted} style={{transform:isSelected?"rotate(90deg)":"none",transition:"transform 0.15s",flexShrink:0}}/>
              </div>
              {isSelected&&(
                <div style={{borderTop:`1px solid ${I.border}`,padding:"16px 18px",animation:"fadeInI 0.2s ease"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                    <div><div style={{fontSize:10,color:I.textMuted,marginBottom:2}}>Remitente</div><div style={{fontSize:12,color:I.text}}>{doc.sender}</div></div>
                    <div><div style={{fontSize:10,color:I.textMuted,marginBottom:2}}>Destinatario</div><div style={{fontSize:12,color:I.text}}>{doc.receiver}</div></div>
                    <div><div style={{fontSize:10,color:I.textMuted,marginBottom:2}}>Fecha</div><div style={{fontSize:12,color:I.text}}>{doc.doc_date}</div></div>
                    <div><div style={{fontSize:10,color:I.textMuted,marginBottom:2}}>Recibido</div><div style={{fontSize:12,color:I.text}}>{doc.received_date}</div></div>
                    {doc.radicado&&<div><div style={{fontSize:10,color:I.textMuted,marginBottom:2}}>Radicado</div><div style={{fontSize:12,color:I.text,fontFamily:"monospace"}}>{doc.radicado}</div></div>}
                  </div>
                  <div style={{fontSize:12,color:I.textSec,lineHeight:1.6,marginBottom:10,padding:"10px 12px",background:I.surfaceEl,borderRadius:8}}>{doc.content_summary}</div>
                  {doc.is_norma&&doc.norma_data&&(
                    <div style={{background:I.purpleDim,borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                      <div style={{fontSize:10,color:I.purple,fontWeight:700,marginBottom:6}}>NORMA - {doc.norma_data.tipo_norma} {doc.norma_data.numero}/{doc.norma_data.fecha_expedicion?.split("-")[0]}</div>
                      <div style={{fontSize:11,color:I.text}}>{doc.norma_data.autoridad_emisora} - {doc.norma_data.vigencia}</div>
                      {doc.norma_data.articulos_relevantes?.map((a,i)=><div key={i} style={{fontSize:11,color:I.textSec,marginTop:4}}>{a}</div>)}
                    </div>
                  )}
                  {doc.proposed_changes?.length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:I.yellow,fontWeight:700,marginBottom:6}}>CAMBIOS PROPUESTOS</div>
                      {doc.proposed_changes.map((ch,i)=>(
                        <div key={i} style={{fontSize:11,color:I.text,marginBottom:3}}>
                          <span style={{fontWeight:600}}>{ch.obligation_num}</span>: {ch.before} → <span style={{color:I.green}}>{ch.after}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {doc.actions_detected?.map(a=><span key={a} style={{padding:"3px 8px",borderRadius:4,fontSize:10,fontWeight:600,color:ACTIONS[a]?.color||I.textSec,background:(ACTIONS[a]?.color||I.textSec)+"18"}}>{ACTIONS[a]?.label||a}</span>)}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  )}
</div>

);
}

// --- MAIN APP -----------------------------------------------------------------

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [showForgot, setShowForgot] = React.useState(false);
  const [forgotEmail, setForgotEmail] = React.useState("");
  const [forgotSent, setForgotSent] = React.useState(false);
  const [forgotLoading, setForgotLoading] = React.useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError("Completa todos los campos"); return; }
    setLoading(true); setError("");
    const result = await sbLogin(email, password);
    if (result.ok) { onLogin(result.session); } else { setError(result.error); }
    setLoading(false);
  };

  const L = { bg:"#060c14",surface:"#0c1523",surfaceEl:"#101d30",border:"#162236",primary:"#00c9a7",primaryDim:"rgba(0,201,167,0.10)",text:"#d8e6f0",textSec:"#5e7a95",green:"#22c55e",greenDim:"rgba(34,197,94,0.10)",red:"#ff4d6d" };

  return (
    <div style={{height:"100vh",background:L.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Poppins','Segoe UI',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}`}</style>
      <div style={{width:380,padding:40,background:L.surface,borderRadius:20,border:`1px solid ${L.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:32}}>
          <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${L.primary},#0a9e82)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Shield size={22} color="#fff"/>
          </div>
          <div>
            <div style={{fontSize:22,fontWeight:800,color:L.text,letterSpacing:"-0.03em"}}>VIGÍA</div>
            <div style={{fontSize:10,color:L.textSec,textTransform:"uppercase",letterSpacing:"0.12em"}}>Inteligencia Regulatoria</div>
          </div>
        </div>

        {!showForgot && !forgotSent && <>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:L.textSec,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Correo electrónico</div>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="correo@empresa.co" style={{width:"100%",background:L.surfaceEl,border:`1px solid ${L.border}`,borderRadius:8,padding:"10px 14px",color:L.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:11,color:L.textSec,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Contraseña</div>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••" style={{width:"100%",background:L.surfaceEl,border:`1px solid ${L.border}`,borderRadius:8,padding:"10px 14px",color:L.text,fontSize:13,fontFamily:"inherit",outline:"none",boxSizing:"border-box"}}/>
          </div>
          {error&&<div style={{background:"rgba(255,77,109,0.10)",border:"1px solid rgba(255,77,109,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:L.red,marginBottom:16}}>{error}</div>}
          <button onClick={handleLogin} disabled={loading} style={{width:"100%",background:loading?L.surfaceEl:L.primary,border:"none",borderRadius:8,padding:"12px",color:loading?"#5e7a95":"#060c14",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}>{loading?"Verificando...":"Iniciar sesión"}</button>
          <div style={{textAlign:"center",marginTop:12}}>
            <button onClick={()=>{setShowForgot(true);setForgotEmail(email);}} style={{background:"transparent",border:"none",color:L.textSec,fontSize:11,cursor:"pointer",textDecoration:"underline"}}>¿Olvidaste tu contraseña?</button>
          </div>
          <div style={{textAlign:"center",marginTop:16}}>
            <a href="/demo" style={{fontSize:11,color:L.primary,textDecoration:"none",fontWeight:600}}>Probar demo sin login →</a>
          </div>
          <div style={{textAlign:"center",marginTop:8}}>
            <a href="/privacidad" target="_blank" style={{fontSize:10,color:L.textMuted,textDecoration:"none"}}>Política de privacidad · Ley 1581/2012</a>
          </div>
        </>}

        {showForgot && !forgotSent && (
          <div>
            <div style={{fontSize:14,fontWeight:600,color:L.text,marginBottom:8}}>Recuperar contraseña</div>
            <div style={{fontSize:12,color:L.textSec,marginBottom:14,lineHeight:1.5}}>Te enviaremos instrucciones para restablecer tu contraseña.</div>
            <input type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} placeholder="tu@empresa.com" style={{width:"100%",background:L.surfaceEl,border:`1px solid ${L.border}`,borderRadius:8,padding:"10px 14px",color:L.text,fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:12,fontFamily:"inherit"}}/>
            <button onClick={async()=>{if(!forgotEmail.trim())return;setForgotLoading(true);await sbForgotPassword(forgotEmail.trim());setForgotSent(true);setForgotLoading(false);}} disabled={forgotLoading||!forgotEmail.trim()} style={{width:"100%",background:forgotLoading?L.surfaceEl:L.primary,border:"none",borderRadius:8,padding:"10px",color:forgotLoading?"#5e7a95":"#060c14",fontSize:13,fontWeight:700,cursor:forgotLoading?"not-allowed":"pointer",fontFamily:"inherit"}}>{forgotLoading?"Enviando...":"Enviar instrucciones"}</button>
            <button onClick={()=>{setShowForgot(false);setForgotEmail("");}} style={{width:"100%",background:"transparent",border:"none",marginTop:8,color:L.textSec,fontSize:11,cursor:"pointer"}}>← Volver al login</button>
          </div>
        )}

        {forgotSent && (
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{width:40,height:40,borderRadius:10,background:L.greenDim,display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:12}}><CheckCircle size={20} color={L.green}/></div>
            <div style={{fontSize:14,color:L.green,fontWeight:600,marginBottom:6}}>Email enviado</div>
            <div style={{fontSize:12,color:L.textSec,lineHeight:1.5,marginBottom:16}}>Si ese email existe en VIGÍA, recibirás las instrucciones. Revisa también la carpeta de spam.</div>
            <button onClick={()=>{setShowForgot(false);setForgotSent(false);setForgotEmail("");}} style={{background:"transparent",border:"none",color:L.primary,fontSize:12,cursor:"pointer",fontWeight:600}}>← Volver al login</button>
          </div>
        )}
      </div>
    </div>
  );
}



const COLOMBIA = {
  "Amazonas":["Leticia","Puerto Nariño"],
  "Antioquia":["Medellín","Bello","Envigado","Itagüí","Apartadó","Turbo","Rionegro","Caucasia","Sabaneta","La Estrella","Copacabana","Girardota","Barbosa","Andes","Yarumal"],
  "Arauca":["Arauca","Saravena","Tame","Fortul"],
  "Atlántico":["Barranquilla","Soledad","Malambo","Sabanalarga","Baranoa","Galapa","Puerto Colombia"],
  "Bolívar":["Cartagena","Magangué","Turbaco","Arjona","El Carmen de Bolívar","Mompós"],
  "Boyacá":["Tunja","Duitama","Sogamoso","Chiquinquirá","Paipa","Moniquirá","Garagoa"],
  "Caldas":["Manizales","Villamaría","Chinchiná","La Dorada","Riosucio","Supía","Manzanares"],
  "Caquetá":["Florencia","San Vicente del Caguán","Belén de los Andaquíes"],
  "Casanare":["Yopal","Aguazul","Villanueva","Tauramena","Monterrey"],
  "Cauca":["Popayán","Santander de Quilichao","El Bordo","Puerto Tejada","Patía"],
  "Cesar":["Valledupar","Aguachica","Bosconia","Codazzi","La Paz","San Alberto"],
  "Chocó":["Quibdó","Istmina","Tadó","Riosucio","Bahía Solano"],
  "Córdoba":["Montería","Cereté","Lorica","Sahagún","Montelíbano","Tierralta"],
  "Cundinamarca":["Bogotá D.C.","Soacha","Fusagasugá","Zipaquirá","Facatativá","Chía","Mosquera","Madrid","Funza","Cajicá","Tocancipá","Sopó","La Calera","Girardot","Villeta"],
  "Guainía":["Inírida"],
  "Guaviare":["San José del Guaviare","El Retorno","Calamar"],
  "Huila":["Neiva","Pitalito","Garzón","La Plata","Campoalegre","Rivera"],
  "La Guajira":["Riohacha","Maicao","Uribia","Manaure","San Juan del Cesar"],
  "Magdalena":["Santa Marta","Ciénaga","Fundación","El Banco","Plato"],
  "Meta":["Villavicencio","Acacías","Granada","San Martín","Puerto López","Cumaral"],
  "Nariño":["Pasto","Tumaco","Ipiales","Túquerres","La Unión","Sandoná"],
  "Norte de Santander":["Cúcuta","Ocaña","Pamplona","Villa del Rosario","Los Patios","El Zulia"],
  "Putumayo":["Mocoa","Puerto Asís","Orito","Valle del Guamuez","Puerto Leguízamo"],
  "Quindío":["Armenia","Montenegro","Calarcá","Quimbaya","La Tebaida","Circasia"],
  "Risaralda":["Pereira","Dosquebradas","Santa Rosa de Cabal","La Virginia","Quinchía"],
  "San Andrés":["San Andrés","Providencia"],
  "Santander":["Bucaramanga","Floridablanca","Girón","Piedecuesta","Barrancabermeja","San Gil","Socorro","Vélez"],
  "Sucre":["Sincelejo","Corozal","Sampués","San Marcos","Tolú","Morroa"],
  "Tolima":["Ibagué","El Espinal","Melgar","Chaparral","Honda","Líbano","Fresno"],
  "Valle del Cauca":["Cali","Buenaventura","Palmira","Tuluá","Buga","Cartago","Yumbo","Jamundí","Dagua","Ginebra"],
  "Vaupés":["Mitú"],
  "Vichada":["Puerto Carreño","La Primavera"]
};

function ColombiaLocation({dpto, ciudad, onDpto, onCiudad, A}) {
  const deptos = Object.keys(COLOMBIA).sort();
  const cities = dpto && COLOMBIA[dpto] ? COLOMBIA[dpto].sort() : [];
  const sel = {width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"};
  return (
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      <div>
        <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Departamento *</div>
        <select value={dpto||""} onChange={e=>{onDpto(e.target.value); onCiudad("");}} style={sel}>
          <option value="">Seleccionar departamento...</option>
          {deptos.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div>
        <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Ciudad *</div>
        <select value={ciudad||""} onChange={e=>onCiudad(e.target.value)} disabled={!dpto} style={{...sel,opacity:dpto?1:0.5}}>
          <option value="">Seleccionar ciudad...</option>
          {cities.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
    </div>
  );
}

function SuperAdminModule({reviewerId, sessionToken}) {
  const saCall = (op, payload) => callEdge("superadmin-api", {op, payload}, sessionToken);
  const [tab, setTab] = React.useState("overview");
  const [users, setUsers] = React.useState([]);
  const [orgs, setOrgs] = React.useState([]);
  const [requests, setRequests] = React.useState([]);
  const [rejectNoteById, setRejectNoteById] = React.useState({});
  const [reviewingId, setReviewingId] = React.useState(null);
  const [stats, setStats] = React.useState({users:0,orgs:0,obligations:0,alerts:0});
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [newUser, setNewUser] = React.useState({email:"",password:"",org_id:"",role:"viewer"});
  const [newOrg, setNewOrg] = React.useState({client_type:"vigia_subscriber",tipo_persona:"juridica",tipo_identificacion:"NIT",numero_identificacion:"",plan:"prueba",nivel_confidencialidad:"estandar",acepta_terminos:true,consentimiento_datos:true,limite_edis:5,limite_usuarios:4,limite_intake_mes:100,pais_datos:"Colombia"});
  const [onboardingExtracting, setOnboardingExtracting] = React.useState(false);
  const [onboardingExtracted, setOnboardingExtracted] = React.useState(null);
  const [onboardingFileName, setOnboardingFileName] = React.useState(null);
  const [prefilledFields, setPrefilledFields] = React.useState(new Set());
  const [newOrgConfirming, setNewOrgConfirming] = React.useState(false);
  const [newOrgMsg, setNewOrgMsg] = React.useState(null);
  const [newOrgSaving, setNewOrgSaving] = React.useState(false);
  const [newOrgCreated, setNewOrgCreated] = React.useState(null);
  const [orgUsers, setOrgUsers] = React.useState([{email:"",password:"Vigia2026!",role:"editor"}]);
  const [addingUsers, setAddingUsers] = React.useState(false);
  const [usersLog, setUsersLog] = React.useState([]);
  const [pendingNorms, setPendingNorms] = React.useState([]);
  const [publishedNorms, setPublishedNorms] = React.useState([]);
  const [normsLoading, setNormsLoading] = React.useState(false);
  const [normRejectNote, setNormRejectNote] = React.useState({});
  const [selectedNormCat, setSelectedNormCat] = React.useState(null);
  const [normCatArticles, setNormCatArticles] = React.useState({});
  const [catalogSearch, setCatalogSearch] = React.useState("");
  const [auditLog, setAuditLog] = React.useState([]);
  const [supportTickets, setSupportTickets] = React.useState([]);
  const [supportFilter, setSupportFilter] = React.useState("all");
  const [supportSelected, setSupportSelected] = React.useState(null);
  const [supportReply, setSupportReply] = React.useState("");
  const [supportStatus, setSupportStatus] = React.useState("");
  const estadoBadge=(s)=>s==="abierto"?{c:A.yellow,bg:A.yellowDim}:s==="en_proceso"?{c:A.primary,bg:A.primaryDim}:s==="resuelto"?{c:A.green,bg:A.greenDim}:{c:A.textMuted,bg:A.surfaceEl};
  const prioBadge=(p)=>p==="critica"?{c:"#ef4444"}:p==="alta"?{c:"#f97316"}:p==="media"?{c:"#eab308"}:{c:"#64748b"};
  const [editingOrg, setEditingOrg] = React.useState(null);
  const [editOrgData, setEditOrgData] = React.useState({});
  const [editOrgSaving, setEditOrgSaving] = React.useState(false);
  const [editOrgMsg, setEditOrgMsg] = React.useState(null);
  const A = C;

  const openEditOrg = (o) => {
    setEditingOrg(o);
    setEditOrgMsg(null);
    setEditOrgData({
      name: o.name || "",
      representante_legal: o.representante_legal || "",
      email_corporativo: o.email_corporativo || "",
      telefono: o.telefono || "",
      sector: o.sector || "",
      ciudad: o.ciudad || "",
      departamento: o.departamento || "",
      direccion: o.direccion || "",
      client_type: o.client_type || "vigia_subscriber",
      tier: o.tier || "",
      plan: o.plan || "",
      plan_estado: o.plan_estado || "",
      limite_edis: o.limite_edis ?? 5,
      limite_usuarios: o.limite_usuarios ?? 4,
      limite_intake_mes: o.limite_intake_mes ?? 100,
      nivel_confidencialidad: o.nivel_confidencialidad || "estandar",
      contacto_vigia: o.contacto_vigia || "",
      cargo_contacto: o.cargo_contacto || ""
    });
  };

  const saveEditOrg = async () => {
    if (!editingOrg?.id) return;
    setEditOrgSaving(true); setEditOrgMsg(null);
    try {
      await saCall("update-org", { org_id: editingOrg.id, updates: editOrgData });
      setOrgs(list => list.map(o => o.id === editingOrg.id ? { ...o, ...editOrgData } : o));
      setEditingOrg(p => p ? { ...p, ...editOrgData } : p);
      setEditOrgMsg({ t: "success", m: "Organización actualizada." });
    } catch (e) {
      setEditOrgMsg({ t: "error", m: e.message || String(e) });
    }
    setEditOrgSaving(false);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { users: ur, orgs: or2, obligations: ob, alerts: al } = await saCall("list-overview");
      const ul = ur?.users || (Array.isArray(ur) ? ur : []);
      setUsers(ul);
      setOrgs(Array.isArray(or2)?or2:[]);
      setStats({users:ur?.total||ul.length, orgs:Array.isArray(or2)?or2.length:0, obligations:Array.isArray(ob)?ob.length:0, alerts:Array.isArray(al)?al.length:0});
    } catch(e) { setMsg({t:"error",m:e.message}); }
    setLoading(false);
  };

  React.useEffect(function() { load(); loadRequests(); loadAudit(); loadSupport(); }, []);

  const loadSupport = async () => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/support_tickets?select=*&order=created_at.desc&limit=100`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}` } });
      const d = await r.json();
      setSupportTickets(Array.isArray(d) ? d : []);
    } catch { setSupportTickets([]); }
  };

  const saveTicketResponse = async () => {
    if(!supportSelected) return;
    try {
      const body = {};
      if(supportReply.trim()) { body.respuesta_enara = supportReply.trim(); body.respondido_por = reviewerId; body.respondido_at = new Date().toISOString(); }
      if(supportStatus && supportStatus !== supportSelected.estado) body.estado = supportStatus;
      if(Object.keys(body).length === 0) return;
      body.updated_at = new Date().toISOString();
      await fetch(`${SB_URL}/rest/v1/support_tickets?id=eq.${supportSelected.id}`, {
        method: "PATCH", headers: { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(body)
      });
      setMsg({t:"success",m:"Ticket actualizado"});
      setSupportSelected(null); setSupportReply(""); setSupportStatus("");
      await loadSupport();
    } catch(e) { setMsg({t:"error",m:e.message}); }
  };

  const loadAudit = async () => {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/audit_log?select=*&order=created_at.desc&limit=100`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${sessionToken}` } });
      const d = await r.json();
      setAuditLog(Array.isArray(d) ? d : []);
    } catch { setAuditLog([]); }
  };

  const loadRequests = async () => {
    try {
      const { requests: data } = await saCall("list-requests");
      setRequests(Array.isArray(data)?data:[]);
    } catch(e) { /* ignore */ }
  };

  const approveRequest = async (r) => {
    setReviewingId(r.id); setMsg(null);
    try {
      await saCall("approve-request", { id: r.id, org_id: r.org_id, requested_changes: r.requested_changes, reviewer_id: reviewerId });
      setMsg({t:"success",m:"Solicitud aprobada y aplicada a la organización."});
      await loadRequests();
    } catch(e) { setMsg({t:"error",m:"Error aprobando: "+e.message}); }
    setReviewingId(null);
  };

  const rejectRequest = async (r) => {
    const note = (rejectNoteById[r.id]||"").trim();
    if(!note) { setMsg({t:"error",m:"Escribí un motivo antes de rechazar."}); return; }
    setReviewingId(r.id); setMsg(null);
    try {
      await saCall("reject-request", { id: r.id, note, reviewer_id: reviewerId });
      setRejectNoteById(p=>{ const n={...p}; delete n[r.id]; return n; });
      setMsg({t:"success",m:"Solicitud rechazada."});
      await loadRequests();
    } catch(e) { setMsg({t:"error",m:"Error rechazando: "+e.message}); }
    setReviewingId(null);
  };


  const createUser = async function() {
    if(!newUser.email||!newUser.password||!newUser.org_id){ setMsg({t:"error",m:"Completa todos los campos"}); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email.trim())){ setMsg({t:"error",m:"Email inválido (ej: nombre@empresa.com.co)"}); return; }
    var pwdErr = validatePassword(newUser.password);
    if(pwdErr){ setMsg({t:"error",m:pwdErr}); return; }
    setLoading(true); setMsg(null);
    try {
      await saCall("create-user", newUser);
      setMsg({t:"success",m:"Usuario "+newUser.email+" creado OK"});
      setNewUser({email:"",password:"",org_id:"",role:"viewer"});
      load();
    } catch(e) { setMsg({t:"error",m:e.message}); }
    setLoading(false);
  };

  const addOrgUser = function() {
    setOrgUsers(function(p){ return [...p, {email:"",password:"Vigia2026!",role:"editor"}]; });
  };
  const removeOrgUser = function(i) {
    setOrgUsers(function(p){ return p.filter(function(_,idx){ return idx!==i; }); });
  };
  const saveOrgUsers = async function() {
    setAddingUsers(true); setUsersLog([]);
    var log = [];
    for(var i=0;i<orgUsers.length;i++){
      var u = orgUsers[i];
      if(!u.email){ log.push({m:"Fila "+(i+1)+": email vacío, saltada",t:"warn"}); continue; }
      log.push({m:"Creando "+u.email+"...",t:"info"});
      setUsersLog([...log]);
      try {
        await saCall("create-user", { email: u.email, password: u.password, org_id: newOrgCreated.id, role: u.role });
        log.push({m:u.email+" ("+u.role+") — OK",t:"success"});
      } catch(e) { log.push({m:"ERROR "+u.email+": "+e.message,t:"error"}); }
      setUsersLog([...log]);
    }
    log.push({m:"Proceso completado",t:"success"});
    setUsersLog([...log]);
    setAddingUsers(false);
    load();
  };
  const resetNewOrg = function() {
    setNewOrgCreated(null); setNewOrgMsg(null);
    setNewOrg({client_type:"vigia_subscriber",tipo_persona:"juridica",tipo_identificacion:"NIT",numero_identificacion:"",plan:"prueba",nivel_confidencialidad:"estandar",acepta_terminos:true,consentimiento_datos:true,limite_edis:5,limite_usuarios:4,limite_intake_mes:100,pais_datos:"Colombia"});
    setOnboardingExtracted(null); setOnboardingFileName(null); setPrefilledFields(new Set()); setNewOrgConfirming(false);
    setOrgUsers([{email:"",password:"Vigia2026!",role:"editor"}]);
    setUsersLog([]);
  };

  const saveNewOrg = async function() {
    if(!newOrg.name||!newOrg.numero_identificacion||!newOrg.representante_legal||!newOrg.sector||!newOrg.ciudad||!newOrg.contacto_vigia){
      setNewOrgMsg({t:"error",m:"Completa los campos obligatorios (*)"});
      return;
    }
    if(!newOrg.acepta_terminos||!newOrg.consentimiento_datos){
      setNewOrgMsg({t:"error",m:"El cliente debe aceptar términos y consentimiento de datos"});
      return;
    }
    setNewOrgSaving(true); setNewOrgMsg(null);
    // Mapear: nit sólo se llena si tipo_identificacion es NIT (backward compat)
    var payload = Object.assign({},newOrg,{
      nit: newOrg.tipo_identificacion === "NIT" ? newOrg.numero_identificacion : null,
      tier:"free", risk_profile:"estándar",
      country:"CO", city:newOrg.ciudad,
      plan_estado:"activo",
      fecha_aceptacion_terminos:new Date().toISOString(),
      version_terminos:"1.0"
    });
    try {
      const { org: row } = await saCall("create-org", payload);
      if(row?.id) {
        setNewOrgCreated(row);
        setNewOrgMsg({t:"success",m:"Organización '"+row.name+"' creada exitosamente."});
        load();
      } else {
        setNewOrgMsg({t:"error",m:"Respuesta inesperada del servidor"});
      }
    } catch(e) {
      var errMsg = e.message || String(e);
      if(errMsg.includes("409")||errMsg.includes("Ya existe un cliente")||errMsg.includes("numero_identificacion")||errMsg.includes("nit_key")||errMsg.includes("duplicate")||errMsg.includes("unique")) {
        errMsg = "Ya existe un cliente con este número de identificación. Verifícalo.";
      }
      setNewOrgMsg({t:"error",m:errMsg});
    }
    setNewOrgSaving(false);
  };

  // Onboarding: upload de documento + extracción via Claude
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const b64 = typeof res === "string" ? res.split(",")[1] : "";
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleOnboardingUpload = async function(file) {
    if(!file) return;
    if(file.size > 10*1024*1024) { setNewOrgMsg({t:"error",m:"El archivo supera 10 MB."}); return; }
    setOnboardingExtracting(true); setOnboardingExtracted(null); setNewOrgMsg(null);
    setOnboardingFileName(file.name);
    try {
      const b64 = await fileToBase64(file);
      const { extracted } = await saCall("extract-org-identity", {
        file_base64: b64,
        file_type: file.type || "application/pdf",
        file_name: file.name
      });
      setOnboardingExtracted(extracted || {});
      if(extracted && !extracted.error) {
        const map = {
          razon_social: "name",
          representante_legal: "representante_legal",
          direccion: "direccion",
          ciudad: "ciudad",
          departamento: "departamento",
          telefono: "telefono",
          email_corporativo: "email_corporativo",
          ciiu: "ciiu",
          sector: "sector",
          fecha_constitucion: "fecha_constitucion",
          tipo_persona: "tipo_persona",
          tipo_identificacion: "tipo_identificacion",
          numero_identificacion: "numero_identificacion"
        };
        const updates = {};
        const filled = new Set();
        for(const [ek, nk] of Object.entries(map)) {
          const val = extracted[ek];
          if(val !== null && val !== undefined && val !== "") { updates[nk] = val; filled.add(nk); }
        }
        if(Object.keys(updates).length > 0) {
          setNewOrg(p => Object.assign({}, p, updates));
          setPrefilledFields(filled);
          setNewOrgMsg({t:"success",m:`Se pre-llenaron ${filled.size} campos desde ${file.name}. Revisá y completá los que falten.`});
        } else {
          setNewOrgMsg({t:"error",m:"No se pudo extraer información útil del documento. Llená los campos manualmente."});
        }
      } else {
        setNewOrgMsg({t:"error",m:"Error procesando documento: "+(extracted?.error||"desconocido")});
      }
    } catch(e) {
      setNewOrgMsg({t:"error",m:"Error subiendo documento: "+(e.message||e)});
    }
    setOnboardingExtracting(false);
  };

    var pendingCount = requests.filter(function(r){ return r.status==="pending"; }).length;
    var pendingNormCount = pendingNorms.length;

    async function loadNorms() {
      setNormsLoading(true);
      try {
        const [pending, published] = await Promise.all([
          saCall("list-norms", { status_filter: "pending_validation" }),
          saCall("list-norms", { status_filter: "published" })
        ]);
        setPendingNorms(pending?.normas || []);
        setPublishedNorms(published?.normas || []);
      } catch(e) { setMsg({t:"error",m:"Error cargando normas: "+e.message}); }
      setNormsLoading(false);
    }

    React.useEffect(function(){ if (tab==="curacion" || tab==="catalogo") loadNorms(); }, [tab]);

    async function loadNormCatArticles(nid) {
      if (normCatArticles[nid]) return;
      try {
        const { articles } = await saCall("get-norm-articles", { norm_id: nid, limit: 5 });
        setNormCatArticles(p => ({ ...p, [nid]: articles || [] }));
      } catch(e) { console.log("loadNormCatArticles", e); }
    }
    React.useEffect(function(){ if (selectedNormCat) loadNormCatArticles(selectedNormCat); }, [selectedNormCat]);

    async function approveNorm(normId) {
      setReviewingId(normId); setMsg(null);
      try {
        const r = await callEdge("norm-validate", { norm_id: normId, action: "approve" }, sessionToken);
        setMsg({t:"success",m:"Norma aprobada y publicada. Generando embeddings…"});
        await loadNorms();
      } catch(e) { setMsg({t:"error",m:"Error aprobando: "+e.message}); }
      setReviewingId(null);
    }
    async function rejectNorm(normId) {
      const note = (normRejectNote[normId]||"").trim();
      if (!note) { setMsg({t:"error",m:"Escribí un motivo antes de rechazar."}); return; }
      setReviewingId(normId); setMsg(null);
      try {
        await callEdge("norm-validate", { norm_id: normId, action: "reject", rejection_reason: note }, sessionToken);
        setNormRejectNote(p => { const n={...p}; delete n[normId]; return n; });
        setMsg({t:"success",m:"Norma rechazada."});
        await loadNorms();
      } catch(e) { setMsg({t:"error",m:"Error rechazando: "+e.message}); }
      setReviewingId(null);
    }

    var tabs = [{k:"overview",l:"Overview"},{k:"requests",l:"Solicitudes"+(pendingCount>0?" ("+pendingCount+")":"")},{k:"curacion",l:"Curación normativa"+(pendingNormCount>0?" ("+pendingNormCount+")":"")},{k:"catalogo",l:"Catálogo normativo"},{k:"users",l:"Usuarios"},{k:"orgs",l:"Organizaciones"},{k:"neworg",l:"+ Nueva Org"},{k:"create",l:"Crear usuario"},{k:"audit",l:"Auditoría"},{k:"support",l:`Soporte${supportTickets.filter(t=>t.estado==="abierto").length>0?" ("+supportTickets.filter(t=>t.estado==="abierto").length+")":""}`}];

  return (
    <div style={{padding:28,color:A.text}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div style={{width:40,height:40,borderRadius:10,background:"rgba(255,77,109,0.15)",display:"flex",alignItems:"center",justifyContent:"center"}}><Shield size={20} color={A.red}/></div>
        <div><h1 style={{fontSize:22,fontWeight:700,color:A.text,margin:0}}>SUPERADMIN</h1><p style={{fontSize:12,color:A.red,margin:0,fontWeight:600}}>ACCESO RESTRINGIDO - ENARA CONSULTING</p></div>
        <button onClick={load} style={{marginLeft:"auto",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:6,padding:"6px 12px",color:A.textSec,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}><RefreshCw size={12}/> Actualizar</button>
      </div>
      {msg&&<div style={{background:msg.t==="success"?A.greenDim:A.redDim,border:"1px solid "+(msg.t==="success"?A.green:A.red)+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:msg.t==="success"?A.green:A.red,marginBottom:16}}>{msg.m}</div>}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {tabs.map(function(t){ return <button key={t.k} onClick={function(){ setTab(t.k); }} style={{background:tab===t.k?A.primaryDim:A.surface,border:"1px solid "+(tab===t.k?A.primary+"44":A.border),borderRadius:6,padding:"6px 14px",color:tab===t.k?A.primary:A.textSec,fontSize:12,fontWeight:tab===t.k?600:400,cursor:"pointer"}}>{t.l}</button>; })}
      </div>

      {tab==="overview"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
            {[["Usuarios",stats.users,A.primary],["Organizaciones",stats.orgs,A.blue],["Obligaciones",stats.obligations,A.yellow],["Alertas",stats.alerts,A.red]].map(function(item){ return <div key={item[0]} style={{background:A.surface,border:"1px solid "+A.border,borderRadius:12,padding:"16px 20px"}}><div style={{fontSize:28,fontWeight:700,color:item[2]}}>{item[1]}</div><div style={{fontSize:12,color:A.textSec,marginTop:4}}>{item[0]}</div></div>; })}
          </div>
          <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:12,padding:"16px 20px"}}>
            <div style={{fontSize:13,fontWeight:600,color:A.text,marginBottom:12}}>Sistema</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
              {[["Supabase","itkbujkqjesuntgdkubt"],["GitHub","Yopakhome/Vigia"],["URL","vigia-five.vercel.app"],["Modelo IA","claude-sonnet-4-20250514"],["Stack","React + Vite + Supabase"],["Auth","Supabase Auth + RLS"]].map(function(item){ return <div key={item[0]} style={{background:A.surfaceEl,borderRadius:8,padding:"10px 12px"}}><div style={{fontSize:10,color:A.textMuted,marginBottom:2,textTransform:"uppercase"}}>{item[0]}</div><div style={{fontSize:11,color:A.text,fontWeight:500}}>{item[1]}</div></div>; })}
            </div>
          </div>
          <div style={{marginTop:12,display:"flex",gap:8,justifyContent:"flex-end",alignItems:"center"}}>
            <button onClick={async()=>{
              setMsg({t:"info",m:"Enviando alertas de vencimiento..."});
              try {
                const r = await fetch(`${SB_URL}/functions/v1/send-alerts`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionToken}`,apikey:SB_KEY},body:JSON.stringify({mode:"vencimiento"})});
                const d = await r.json();
                if(d.error) { setMsg({t:"error",m:d.error}); }
                else { setMsg({t:"success",m:`${d.sent} email${d.sent!==1?"s":""} enviado${d.sent!==1?"s":""} a ${d.orgs||0} org${d.orgs!==1?"s":""}. ${d.sent===0?"(Sin obligaciones próximas o RESEND_API_KEY no configurada)":""}`}); }
              } catch(e) { setMsg({t:"error",m:"Error: "+e.message}); }
            }} style={{background:A.primary,border:"none",borderRadius:6,padding:"4px 14px",color:"#060c14",fontSize:10,fontWeight:700,cursor:"pointer"}}>Alertas vencimiento</button>
            <button onClick={async()=>{
              setMsg({t:"info",m:"Buscando usuarios inactivos..."});
              try {
                const r = await fetch(`${SB_URL}/functions/v1/send-alerts`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${sessionToken}`,apikey:SB_KEY},body:JSON.stringify({mode:"activacion"})});
                const d = await r.json();
                if(d.error) { setMsg({t:"error",m:d.error}); }
                else { setMsg({t:"success",m:`${d.sent} recordatorio${d.sent!==1?"s":""} enviado${d.sent!==1?"s":""} (${d.inactive_users||0} usuarios inactivos detectados)`}); }
              } catch(e) { setMsg({t:"error",m:"Error: "+e.message}); }
            }} style={{background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:6,padding:"4px 14px",color:A.textSec,fontSize:10,cursor:"pointer"}}>Recordatorios activación</button>
            <button onClick={()=>{localStorage.removeItem("vigia_onboarded");setMsg({t:"success",m:"Onboarding reseteado."});}} style={{background:"transparent",border:`1px solid ${A.border}`,borderRadius:6,padding:"4px 10px",color:A.textMuted,fontSize:10,cursor:"pointer"}}>Resetear onboarding</button>
          </div>
        </div>
      )}

      {tab==="requests"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14,maxWidth:880}}>
          {requests.length===0 && <div style={{fontSize:13,color:A.textMuted,padding:"20px 0"}}>No hay solicitudes todavía.</div>}
          {requests.map(function(r){
            var org = orgs.find(function(o){ return o.id===r.org_id; });
            var requester = users.find(function(u){ return u.id===r.requested_by; });
            var isPending = r.status==="pending";
            var badge = isPending?{c:A.yellow,b:A.yellowDim,l:"Pendiente"}:r.status==="approved"?{c:A.green,b:A.greenDim,l:"Aprobada"}:{c:A.red,b:A.redDim,l:"Rechazada"};
            var busy = reviewingId===r.id;
            return (
              <div key={r.id} style={{background:A.surface,border:"1px solid "+A.border,borderRadius:12,padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                  <div style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:badge.b,color:badge.c,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{badge.l}</div>
                  <div style={{fontSize:13,fontWeight:700,color:A.text}}>{org?org.name:r.org_id.slice(0,8)+"..."}</div>
                  <div style={{fontSize:11,color:A.textMuted}}>· {requester?requester.email:(r.requested_by||"").slice(0,8)+"..."}</div>
                  <div style={{fontSize:11,color:A.textMuted,marginLeft:"auto"}}>{new Date(r.created_at).toLocaleString("es-CO")}</div>
                </div>
                <div style={{background:A.surfaceEl,borderRadius:8,padding:"10px 14px",marginBottom:10}}>
                  {Object.entries(r.requested_changes||{}).map(function(entry){
                    var k=entry[0], v=entry[1];
                    var cur = org?(org[k]||""):"";
                    return (
                      <div key={k} style={{display:"flex",gap:8,fontSize:12,marginBottom:3,flexWrap:"wrap"}}>
                        <span style={{color:A.textSec,fontWeight:600,minWidth:140}}>{ORG_FIELD_LABELS[k]||k}:</span>
                        <span style={{color:A.textMuted,textDecoration:"line-through"}}>{String(cur||"—")}</span>
                        <span style={{color:A.textMuted}}>→</span>
                        <span style={{color:A.green}}>{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
                {r.reason && <div style={{fontSize:11,color:A.textSec,fontStyle:"italic",marginBottom:10}}>Motivo del cliente: {r.reason}</div>}
                {r.attachments?.length>0 && (
                  <div style={{marginBottom:10,display:"flex",flexDirection:"column",gap:5}}>
                    <div style={{fontSize:11,color:A.textSec,fontWeight:600}}>Documentos adjuntos:</div>
                    {r.attachments.map(function(a,i){
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:A.surfaceEl,borderRadius:6,padding:"5px 10px"}}>
                          <Paperclip size={11} color={A.primary}/>
                          <span style={{flex:1,fontSize:11,color:A.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.name}</span>
                          <span style={{fontSize:10,color:A.textMuted}}>{a.size<1048576?(a.size/1024).toFixed(1)+" KB":(a.size/1048576).toFixed(1)+" MB"}</span>
                          <button onClick={async function(){ try { const url = await getSignedAttachmentUrl(a.path, sessionToken); window.open(url, "_blank"); } catch(e){ setMsg({t:"error",m:"No se pudo abrir: "+e.message}); } }} style={{background:"transparent",border:"1px solid "+A.border,borderRadius:6,padding:"3px 10px",color:A.primary,fontSize:10,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,fontWeight:600}}><Download size={10}/> Ver</button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {r.review_note && <div style={{fontSize:11,color:A.textSec,marginBottom:10}}><span style={{fontWeight:600}}>Nota:</span> {r.review_note}</div>}
                {isPending && (
                  <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                    <div style={{flex:"1 1 280px"}}>
                      <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Nota (obligatoria para rechazar)</div>
                      <input value={rejectNoteById[r.id]||""} onChange={function(e){ setRejectNoteById(function(p){ var n={...p}; n[r.id]=e.target.value; return n; }); }} placeholder="Motivo del rechazo..." style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"8px 12px",color:A.text,fontSize:12,outline:"none"}}/>
                    </div>
                    <button onClick={function(){ approveRequest(r); }} disabled={busy} style={{background:busy?A.surfaceEl:A.green,border:"none",borderRadius:8,padding:"8px 16px",color:busy?A.textSec:"#060c14",fontSize:12,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>{busy?"...":"Aprobar"}</button>
                    <button onClick={function(){ rejectRequest(r); }} disabled={busy} style={{background:"transparent",border:"1px solid "+A.red,borderRadius:8,padding:"8px 16px",color:A.red,fontSize:12,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>Rechazar</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab==="users"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {loading&&<div style={{color:A.textSec,fontSize:13}}>Cargando...</div>}
          {users.map(function(u){ return <div key={u.id} style={{background:A.surface,border:"1px solid "+A.border,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:36,height:36,borderRadius:8,background:A.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:14,fontWeight:700,color:A.primary}}>{(u.email||"?")[0].toUpperCase()}</span></div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:A.text}}>{u.email}</div><div style={{display:"flex",gap:8,marginTop:3}}><span style={{fontSize:10,color:A.textMuted}}>{(u.id||"").slice(0,8)}...</span><span style={{fontSize:10,color:u.email_confirmed_at?A.green:A.yellow}}>{u.email_confirmed_at?"Verificado":"Pendiente"}</span><span style={{fontSize:10,color:A.textMuted}}>{u.last_sign_in_at?new Date(u.last_sign_in_at).toLocaleDateString("es-CO"):"Nunca"}</span></div></div>
          </div>; })}
        </div>
      )}

      {tab==="orgs"&&!editingOrg&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {orgs.map(function(o){
            const ct = o.client_type || "vigia_subscriber";
            const ctColor = ct==="enara_consulting"?A.blue:ct==="both"?A.green:A.primary;
            const ctLabel = ct==="enara_consulting"?"CONSULTORÍA":ct==="both"?"SUSCRIPTOR + CONSULTORÍA":"VIGÍA";
            return <div key={o.id} onClick={()=>openEditOrg(o)} style={{background:A.surface,border:"1px solid "+A.border,borderRadius:10,padding:"14px 18px",cursor:"pointer",transition:"border-color 0.15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=A.primary+"66"} onMouseLeave={e=>e.currentTarget.style.borderColor=A.border}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <div style={{fontSize:13,fontWeight:600,color:A.text}}>{o.name}</div>
                <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:ctColor+"22",color:ctColor,textTransform:"uppercase",letterSpacing:"0.05em"}}>{ctLabel}</span>
              </div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {o.nit&&<span style={{fontSize:10,color:A.textSec}}>NIT: {o.nit}</span>}
                {o.sector&&<span style={{fontSize:10,color:A.blue}}>{o.sector}</span>}
                {o.plan&&ct!=="enara_consulting"&&<span style={{fontSize:10,color:A.primary,fontWeight:600}}>{o.plan}</span>}
                {o.ciudad&&<span style={{fontSize:10,color:A.textMuted}}>{o.ciudad}</span>}
                <span style={{marginLeft:"auto",fontSize:10,color:A.textMuted}}>Editar →</span>
              </div>
            </div>;
          })}
        </div>
      )}

      {tab==="orgs"&&editingOrg&&(
        <div style={{maxWidth:680}}>
          <button onClick={()=>{ setEditingOrg(null); setEditOrgMsg(null); }} style={{background:"transparent",border:"1px solid "+A.border,borderRadius:6,padding:"6px 12px",color:A.textSec,fontSize:11,cursor:"pointer",marginBottom:14}}>← Volver a la lista</button>
          <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:28}}>
            <div style={{fontSize:16,fontWeight:700,color:A.text,marginBottom:4}}>Editar organización</div>
            <div style={{fontSize:12,color:A.textSec,marginBottom:20}}>NIT: {editingOrg.nit||"—"} (no editable) · Creada {editingOrg.created_at?new Date(editingOrg.created_at).toLocaleDateString("es-CO"):"—"}</div>

            {editOrgMsg&&<div style={{background:editOrgMsg.t==="success"?A.greenDim:A.redDim,border:"1px solid "+(editOrgMsg.t==="success"?A.green:A.red)+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:editOrgMsg.t==="success"?A.green:A.red,marginBottom:16}}>{editOrgMsg.m}</div>}

            {/* Tipo de cliente */}
            <div style={{marginBottom:22}}>
              <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Tipo de cliente</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {value:"vigia_subscriber",label:"Suscriptor VIGÍA",desc:"Accede a la plataforma",color:A.primary},
                  {value:"enara_consulting",label:"Cliente consultoría",desc:"ENARA gestiona sus EDIs",color:A.blue},
                  {value:"both",label:"Ambos",desc:"Suscriptor + consultoría",color:A.green}
                ].map(opt => { const active = editOrgData.client_type===opt.value; return (
                  <div key={opt.value} onClick={()=>setEditOrgData(p=>({...p,client_type:opt.value}))} style={{border:"1px solid "+(active?opt.color+"66":A.border),background:active?opt.color+"12":A.surfaceEl,borderRadius:8,padding:"10px 12px",cursor:"pointer"}}>
                    <div style={{fontSize:12,fontWeight:600,color:active?A.text:A.textSec,marginBottom:3}}>{opt.label}</div>
                    <div style={{fontSize:10,color:A.textMuted}}>{opt.desc}</div>
                  </div>
                ); })}
              </div>
            </div>

            {/* Datos básicos */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Datos básicos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Razón social / Nombre","name","text"],["Representante legal","representante_legal","text"],["Email corporativo","email_corporativo","email"],["Teléfono","telefono","text"]].map(f => (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type={f[2]} value={editOrgData[f[1]]||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,[f[1]]:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Sector</div>
                <select value={editOrgData.sector||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,sector:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  <option value="">Sin definir</option>
                  {["energia","mineria","manufactura","construccion","agro","logistica","servicios","otro"].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Nivel de confidencialidad</div>
                <select value={editOrgData.nivel_confidencialidad||"estandar"} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,nivel_confidencialidad:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  <option value="estandar">Estándar</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                </select>
              </div>
            </div>

            {/* Ubicación */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Ubicación</div>
            <div style={{marginBottom:14}}>
              <ColombiaLocation A={A}
                dpto={editOrgData.departamento||""} ciudad={editOrgData.ciudad||""}
                onDpto={v=>setEditOrgData(p=>({...p,departamento:v,ciudad:""}))}
                onCiudad={v=>setEditOrgData(p=>({...p,ciudad:v}))}
              />
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Dirección</div>
              <input type="text" value={editOrgData.direccion||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,direccion:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
            </div>

            {/* Contacto */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Contacto VIGÍA</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Nombre contacto","contacto_vigia"],["Cargo","cargo_contacto"]].map(f => (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type="text" value={editOrgData[f[1]]||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,[f[1]]:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ))}
            </div>

            {/* Plan + límites (solo suscriptores) */}
            {editOrgData.client_type!=="enara_consulting" && (<>
              <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Plan y configuración</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
                <div>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Plan</div>
                  <select value={editOrgData.plan||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,plan:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                    <option value="">—</option>
                    <option value="prueba">Prueba</option>
                    <option value="basico">Básico</option>
                    <option value="profesional">Profesional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Estado plan</div>
                  <select value={editOrgData.plan_estado||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,plan_estado:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                    <option value="">—</option>
                    <option value="activo">Activo</option>
                    <option value="suspendido">Suspendido</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Tier</div>
                  <select value={editOrgData.tier||""} onChange={e=>{var v=e.target.value;setEditOrgData(p=>({...p,tier:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                    <option value="">—</option>
                    <option value="free">Free</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
                {[["Límite EDIs","limite_edis"],["Límite usuarios","limite_usuarios"],["Intake/mes","limite_intake_mes"]].map(f => (
                  <div key={f[1]}>
                    <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                    <input type="number" value={editOrgData[f[1]]!==undefined?editOrgData[f[1]]:""} onChange={e=>{var v=parseInt(e.target.value);setEditOrgData(p=>({...p,[f[1]]:isNaN(v)?0:v}));}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
              </div>
            </>)}

            <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
              <button onClick={()=>{ setEditingOrg(null); setEditOrgMsg(null); }} style={{background:"transparent",border:"1px solid "+A.border,borderRadius:8,padding:"10px 18px",color:A.textSec,fontSize:12,cursor:"pointer"}}>Cancelar</button>
              <button onClick={saveEditOrg} disabled={editOrgSaving} style={{background:editOrgSaving?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"10px 18px",color:editOrgSaving?A.textSec:"#060c14",fontSize:12,fontWeight:700,cursor:editOrgSaving?"not-allowed":"pointer"}}>{editOrgSaving?"Guardando…":"Guardar cambios"}</button>
            </div>
          </div>
        </div>
      )}

      {tab==="curacion"&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {normsLoading && <div style={{color:A.textSec,fontSize:13}}>Cargando normas pendientes…</div>}
          {!normsLoading && pendingNorms.length===0 && <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:10,padding:"24px",textAlign:"center",color:A.textMuted,fontSize:13}}>No hay normas pendientes de curación.</div>}
          {pendingNorms.map(n => {
            const busy = reviewingId === n.id;
            return (
              <div key={n.id} style={{background:A.surface,border:`1px solid ${A.yellow}44`,borderRadius:12,padding:"16px 20px"}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
                  <div style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:A.yellowDim,color:A.yellow,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>Pendiente</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:4,lineHeight:1.3}}>{n.norm_title}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",fontSize:10,color:A.textMuted}}>
                      <span style={{color:A.blue,fontWeight:600,textTransform:"uppercase"}}>{n.norm_type}</span>
                      {n.norm_number && <span style={{color:A.text}}>{n.norm_number}/{n.norm_year||""}</span>}
                      {n.issuing_body && <><span>·</span><span>{n.issuing_body.slice(0,50)}</span></>}
                      {n.scope && <><span>·</span><span style={{color:A.primary}}>{SCOPE_LABELS[n.scope]||n.scope}</span></>}
                      {n.total_articles>0 && <><span>·</span><span style={{color:A.green}}>{n.total_articles} art.</span></>}
                      {n.parser_quality && <><span>·</span><span style={{color:n.parser_quality==="high"?A.green:n.parser_quality==="medium"?A.yellow:A.red}}>parser: {n.parser_quality}</span></>}
                    </div>
                    {n.summary && <div style={{fontSize:11,color:A.textSec,marginTop:8,padding:"6px 10px",background:A.surfaceEl,borderRadius:6,lineHeight:1.5}}>{n.summary}</div>}
                    {n.source_url && <a href={n.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:A.primary,marginTop:6,display:"inline-block",textDecoration:"none"}}>↗ Ver PDF oficial</a>}
                  </div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 280px"}}>
                    <div style={{fontSize:10,color:A.textSec,marginBottom:5,fontWeight:600}}>Nota (obligatoria para rechazar)</div>
                    <input value={normRejectNote[n.id]||""} onChange={e=>setNormRejectNote(p=>({...p,[n.id]:e.target.value}))} placeholder="Motivo del rechazo…" style={{width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:6,padding:"7px 10px",color:A.text,fontSize:11,outline:"none"}}/>
                  </div>
                  <button onClick={()=>approveNorm(n.id)} disabled={busy} style={{background:busy?A.surfaceEl:A.green,border:"none",borderRadius:6,padding:"8px 16px",color:busy?A.textSec:"#060c14",fontSize:11,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>{busy?"…":"Aprobar"}</button>
                  <button onClick={()=>rejectNorm(n.id)} disabled={busy} style={{background:"transparent",border:`1px solid ${A.red}`,borderRadius:6,padding:"8px 16px",color:A.red,fontSize:11,fontWeight:700,cursor:busy?"not-allowed":"pointer"}}>Rechazar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab==="catalogo"&&(
        <div>
          {normsLoading && <div style={{color:A.textSec,fontSize:13,marginBottom:10}}>Cargando catálogo…</div>}
          <div style={{marginBottom:16,display:"flex",gap:8,flexWrap:"wrap"}}>
            <input value={catalogSearch} onChange={e=>setCatalogSearch(e.target.value)} placeholder="Buscar por título, número, autoridad…" style={{flex:"1 1 280px",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:6,padding:"7px 12px",color:A.text,fontSize:12,outline:"none"}}/>
            <div style={{fontSize:11,color:A.textMuted,alignSelf:"center"}}>{publishedNorms.length} normas publicadas · {publishedNorms.reduce((s,n)=>s+(n.total_articles||0),0)} artículos totales</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {publishedNorms.filter(n => !catalogSearch || (n.norm_title||"").toLowerCase().includes(catalogSearch.toLowerCase()) || (n.norm_number||"").includes(catalogSearch) || (n.issuing_body||"").toLowerCase().includes(catalogSearch.toLowerCase())).map(n => (
              <div key={n.id} style={{background:A.surface,border:`1px solid ${selectedNormCat===n.id?A.primary+"66":A.border}`,borderRadius:10,overflow:"hidden"}}>
                <div onClick={()=>setSelectedNormCat(selectedNormCat===n.id?null:n.id)} style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                  <div style={{width:30,height:30,borderRadius:6,background:A.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={13} color={A.primary}/></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:A.text,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.norm_title}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",fontSize:10,color:A.textMuted}}>
                      <span style={{color:A.blue,fontWeight:600,textTransform:"uppercase"}}>{n.norm_type}</span>
                      {n.norm_number && <span style={{color:A.text}}>{n.norm_number}/{n.norm_year||""}</span>}
                      {n.scope && <><span>·</span><span style={{color:A.primary}}>{SCOPE_LABELS[n.scope]||n.scope}</span></>}
                      {n.total_articles>0 && <><span>·</span><span style={{color:A.green}}>{n.total_articles} art.</span></>}
                      {n.parser_quality && n.parser_quality!=="high" && <><span>·</span><span style={{color:n.parser_quality==="medium"?A.yellow:A.red}}>{n.parser_quality}</span></>}
                    </div>
                  </div>
                  <ChevronRight size={14} color={A.textSec} style={{transform:selectedNormCat===n.id?"rotate(90deg)":"none",transition:"transform 0.15s"}}/>
                </div>
                {selectedNormCat===n.id && (
                  <div style={{padding:"0 16px 14px 16px",borderTop:`1px solid ${A.border}`}}>
                    {n.summary && <div style={{fontSize:11,color:A.textSec,padding:"10px 0",lineHeight:1.5}}>{n.summary}</div>}
                    {n.source_url && <a href={n.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:10,color:A.primary,textDecoration:"none"}}>↗ PDF oficial</a>}
                    <div style={{fontSize:10,fontWeight:700,color:A.primary,marginTop:12,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.08em"}}>Primeros artículos</div>
                    {(normCatArticles[n.id]||[]).length===0 ? <div style={{fontSize:11,color:A.textMuted,fontStyle:"italic"}}>Cargando…</div> :
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {(normCatArticles[n.id]||[]).slice(0,3).map(a => (
                          <div key={a.id} style={{background:A.surfaceEl,borderLeft:`3px solid ${A.primary}44`,borderRadius:4,padding:"6px 10px"}}>
                            <div style={{fontSize:10,fontWeight:700,color:A.primary,marginBottom:2}}>{a.article_label||`Art. ${a.article_number}`}</div>
                            <div style={{fontSize:11,color:A.text,lineHeight:1.4,whiteSpace:"pre-wrap"}}>{(a.content||"").slice(0,300)}{(a.content||"").length>300?"…":""}</div>
                          </div>
                        ))}
                      </div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==="create"&&(
        <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:24,maxWidth:480}}>
          <div style={{fontSize:15,fontWeight:700,color:A.text,marginBottom:20}}>Crear nuevo usuario</div>
          {[["Email","email","correo@empresa.co"],["Password","password","Min. 8 caracteres"]].map(function(f){ return <div key={f[0]} style={{marginBottom:14}}>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600,textTransform:"uppercase"}}>{f[0]}</div>
            <input type={f[1]} value={newUser[f[1]]} onChange={function(e){ var v=e.target.value; setNewUser(function(p){ return Object.assign({},p,{[f[1]]:v}); }); }} placeholder={f[2]} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"10px 14px",color:A.text,fontSize:13,outline:"none"}}/>
          </div>; })}
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600,textTransform:"uppercase"}}>Organizacion</div>
            {(function(){
              const subscribers = orgs.filter(o => !o.client_type || o.client_type==="vigia_subscriber" || o.client_type==="both");
              if(orgs.length===0) return <div style={{fontSize:12,color:A.yellow,padding:"10px 14px",background:A.yellowDim,borderRadius:8}}>No hay organizaciones — crea una en "+ Nueva Org" primero.</div>;
              if(subscribers.length===0) return <div style={{fontSize:11,color:A.yellow,padding:"10px 14px",background:A.yellowDim,borderRadius:8}}>No hay organizaciones suscriptoras activas. Crea una org de tipo "Suscriptor VIGÍA" primero.</div>;
              return (
                <select value={newUser.org_id} onChange={function(e){ var v=e.target.value; setNewUser(function(p){ return Object.assign({},p,{org_id:v}); }); }} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"10px 14px",color:A.text,fontSize:13,outline:"none"}}>
                  <option value="">Selecciona una organizacion...</option>
                  {subscribers.map(function(o){ return <option key={o.id} value={o.id}>{o.name} ({o.plan||"prueba"}){o.client_type==="both"?" · también consultoría":""}</option>; })}
                </select>
              );
            })()}
            <div style={{fontSize:10,color:A.textMuted,marginTop:4}}>Solo organizaciones suscritas a VIGÍA pueden tener usuarios. Los clientes de consultoría no tienen acceso a la plataforma.</div>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600,textTransform:"uppercase"}}>Rol</div>
            <div style={{display:"flex",gap:8}}>
              {[["viewer","Solo lectura"],["editor","Crea y edita EDIs"],["admin","Admin de org"]].map(function(item){ return <div key={item[0]} style={{flex:1}}><button onClick={function(){ setNewUser(function(p){ return Object.assign({},p,{role:item[0]}); }); }} style={{width:"100%",background:newUser.role===item[0]?A.primaryDim:A.surfaceEl,border:"1px solid "+(newUser.role===item[0]?A.primary+"44":A.border),borderRadius:6,padding:"8px 10px",color:newUser.role===item[0]?A.primary:A.textSec,fontSize:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}><span style={{fontWeight:600}}>{item[0]}</span><span style={{fontSize:9,opacity:0.7}}>{item[1]}</span></button></div>; })}
            </div>
          </div>
          <button onClick={createUser} disabled={loading} style={{width:"100%",background:loading?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"12px",color:loading?"#5e7a95":"#060c14",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer"}}>{loading?"Creando...":"Crear usuario"}</button>
        </div>
      )}

      {tab==="support"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:16}}>
            {[["Abiertos",supportTickets.filter(t=>t.estado==="abierto").length,A.yellow,A.yellowDim],["En proceso",supportTickets.filter(t=>t.estado==="en_proceso").length,A.primary,A.primaryDim],["Resueltos",supportTickets.filter(t=>t.estado==="resuelto").length,A.green,A.greenDim],["Cerrados",supportTickets.filter(t=>t.estado==="cerrado").length,A.textMuted,A.surfaceEl]].map(([l,v,c,bg])=><div key={l} style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:10,padding:"12px 16px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:c}}>{v}</div><div style={{fontSize:10,color:A.textSec,marginTop:2}}>{l}</div></div>)}
          </div>
          <div style={{display:"flex",gap:6,marginBottom:12}}>
            {["all","abierto","en_proceso","resuelto"].map(f=><button key={f} onClick={()=>setSupportFilter(f)} style={{background:supportFilter===f?A.primaryDim:"transparent",border:`1px solid ${supportFilter===f?A.primary+"66":A.border}`,borderRadius:6,padding:"4px 12px",color:supportFilter===f?A.primary:A.textSec,fontSize:11,fontWeight:supportFilter===f?700:500,cursor:"pointer",fontFamily:FONT}}>{f==="all"?"Todos":f.replace(/_/g," ")}</button>)}
          </div>
          {supportSelected ? (
            <div style={{background:A.surface,border:`1px solid ${A.primary}44`,borderRadius:12,padding:24}}>
              <button onClick={()=>{setSupportSelected(null);setSupportReply("");setSupportStatus("");}} style={{background:"transparent",border:`1px solid ${A.border}`,borderRadius:6,padding:"4px 10px",color:A.textSec,fontSize:10,cursor:"pointer",marginBottom:14}}>← Volver a la lista</button>
              <div style={{fontSize:14,fontWeight:700,color:A.text,marginBottom:4}}>{supportSelected.titulo_auto}</div>
              <div style={{fontSize:11,color:A.textSec,marginBottom:4}}>{supportSelected.org_name||"—"} · {supportSelected.user_email||"—"} · {new Date(supportSelected.created_at).toLocaleString("es-CO")}</div>
              <div style={{display:"flex",gap:6,marginBottom:12}}>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,background:estadoBadge(supportSelected.estado).bg,color:estadoBadge(supportSelected.estado).c,textTransform:"uppercase"}}>{supportSelected.estado?.replace(/_/g," ")}</span>
                <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:`1px solid ${prioBadge(supportSelected.prioridad).c}44`,color:prioBadge(supportSelected.prioridad).c}}>{supportSelected.prioridad}</span>
              </div>
              <div style={{background:A.surfaceEl,borderRadius:8,padding:"12px 14px",marginBottom:16,fontSize:12,color:A.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{supportSelected.descripcion}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                <div>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Cambiar estado</div>
                  <select value={supportStatus||supportSelected.estado} onChange={e=>setSupportStatus(e.target.value)} style={{width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                    {["abierto","en_proceso","resuelto","cerrado"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                  </select>
                </div>
              </div>
              <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Respuesta para el cliente</div>
              <textarea value={supportReply} onChange={e=>setSupportReply(e.target.value)} placeholder="Escribe la respuesta..." style={{width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"10px 12px",color:A.text,fontSize:12,fontFamily:FONT,resize:"vertical",minHeight:80,outline:"none",lineHeight:1.5,boxSizing:"border-box",marginBottom:12}}/>
              {supportSelected.respuesta_enara&&<div style={{background:A.primaryDim,border:`1px solid ${A.primary}33`,borderRadius:8,padding:"10px 14px",marginBottom:12}}><div style={{fontSize:10,fontWeight:700,color:A.primary,marginBottom:4}}>Respuesta anterior</div><div style={{fontSize:11,color:A.text,whiteSpace:"pre-wrap"}}>{supportSelected.respuesta_enara}</div></div>}
              <div style={{display:"flex",justifyContent:"flex-end"}}><button onClick={saveTicketResponse} style={{background:A.primary,border:"none",borderRadius:8,padding:"10px 20px",color:"#060c14",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Guardar respuesta</button></div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {(()=>{const eb=(s)=>s==="abierto"?{c:A.yellow,bg:A.yellowDim}:s==="en_proceso"?{c:A.primary,bg:A.primaryDim}:s==="resuelto"?{c:A.green,bg:A.greenDim}:{c:A.textMuted,bg:A.surfaceEl};
                const pb=(p)=>p==="critica"?{c:"#ef4444"}:p==="alta"?{c:"#f97316"}:p==="media"?{c:"#eab308"}:{c:"#64748b"};
                const filtered=supportTickets.filter(t=>supportFilter==="all"||t.estado===supportFilter);
                if(filtered.length===0) return <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"24px",textAlign:"center",fontSize:12,color:A.textMuted}}>Sin tickets en este filtro</div>;
                return filtered.map(t=>{const b=eb(t.estado);const p=pb(t.prioridad);return <div key={t.id} onClick={()=>{setSupportSelected(t);setSupportStatus(t.estado);setSupportReply("");}} style={{background:A.surfaceEl,borderRadius:8,padding:"10px 14px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,background:b.bg,color:b.c,textTransform:"uppercase"}}>{t.estado?.replace(/_/g," ")}</span>
                  <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:`1px solid ${p.c}44`,color:p.c}}>{t.prioridad}</span>
                  <span style={{fontSize:11,fontWeight:600,color:A.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.titulo_auto||t.categoria}</span>
                  <span style={{fontSize:10,color:A.textMuted}}>{t.org_name||"—"}</span>
                  <span style={{fontSize:10,color:A.textMuted}}>{new Date(t.created_at).toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</span>
                </div>;});
              })()}
            </div>
          )}
        </div>
      )}

      {tab==="audit"&&(
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em"}}>Log de auditoría — últimos 100 eventos</div>
            <button onClick={loadAudit} style={{background:"transparent",border:`1px solid ${A.border}`,borderRadius:6,padding:"3px 10px",color:A.textMuted,fontSize:10,cursor:"pointer"}}>Refrescar</button>
          </div>
          {auditLog.length===0 ? <div style={{fontSize:12,color:A.textMuted,textAlign:"center",padding:24,background:A.surface,borderRadius:12,border:`1px solid ${A.border}`}}>Sin eventos registrados aún</div> :
            <div style={{display:"flex",flexDirection:"column",gap:4}}>
              {auditLog.map(e=>(
                <div key={e.id} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",background:A.surfaceEl,borderRadius:8,fontSize:11}}>
                  <span style={{color:A.textMuted,flexShrink:0,minWidth:110}}>{new Date(e.created_at).toLocaleString("es-CO",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
                  <span style={{color:A.textSec,minWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.user_email||"—"}</span>
                  <span style={{fontWeight:700,padding:"2px 8px",borderRadius:4,flexShrink:0,fontSize:10,background:e.action==="crear_edi"?A.greenDim:e.action==="consulta_bot"?(A.primaryDim||A.surfaceEl):e.action==="logout"?A.surfaceEl:A.surfaceEl,color:e.action==="crear_edi"?A.green:e.action==="consulta_bot"?A.primary:A.textMuted}}>{e.action}</span>
                  <span style={{color:A.textMuted,flex:1}}>{e.entity_type||""}{e.entity_id?" #"+e.entity_id.slice(0,8):""}</span>
                </div>
              ))}
            </div>
          }
        </div>
      )}

      {tab==="neworg"&&(
        <div style={{maxWidth:680}}>
          <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:28}}>
            <div style={{fontSize:16,fontWeight:700,color:A.text,marginBottom:4}}>Nueva organización cliente</div>
            <div style={{fontSize:12,color:A.textSec,marginBottom:24}}>Completa todos los campos para activar al cliente en VIGÍA.</div>

            {newOrgMsg&&<div style={{background:newOrgMsg.t==="success"?A.greenDim:A.redDim,border:"1px solid "+(newOrgMsg.t==="success"?A.green:A.red)+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:newOrgMsg.t==="success"?A.green:A.red,marginBottom:16}}>{newOrgMsg.m}</div>}

            {/* Onboarding por documento (opcional) */}
            <div style={{background:A.surfaceEl,border:`1px dashed ${A.primary}66`,borderRadius:10,padding:"14px 18px",marginBottom:22}}>
              <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Documentos de onboarding (opcional pero recomendado)</div>
              <div style={{fontSize:12,color:A.textSec,marginBottom:10,lineHeight:1.5}}>
                Subí RUT, Cámara de Comercio o documento de identidad y VIGÍA pre-llenará el formulario automáticamente.
              </div>
              {onboardingExtracting ? (
                <div style={{fontSize:12,color:A.primary,padding:"10px 0",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{display:"flex",gap:4}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:A.primary,animation:"pulse 1.2s infinite",animationDelay:`${i*0.25}s`}}/>)}</div>
                  <span>Extrayendo información de {onboardingFileName || "documento"}…</span>
                </div>
              ) : (
                <label style={{display:"inline-flex",alignItems:"center",gap:8,background:A.primary,color:"#060c14",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  <Upload size={14}/>
                  {onboardingFileName ? "Subir otro documento" : "Subir documento"}
                  <input type="file" accept=".pdf,image/jpeg,image/jpg,image/png" style={{display:"none"}} onChange={e=>{ const f = e.target.files?.[0]; if(f) handleOnboardingUpload(f); e.target.value=""; }}/>
                </label>
              )}
              <div style={{fontSize:10,color:A.textMuted,marginTop:6}}>Formatos: PDF, JPG, PNG · Máx 10 MB</div>
              {onboardingExtracted && !onboardingExtracted.error && (
                <div style={{marginTop:10,fontSize:10,color:A.green,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  <CheckCircle size={12}/> <span>Confianza: {onboardingExtracted.confianza ?? "—"}%</span>
                  {onboardingExtracted.tipo_persona && <span>· {onboardingExtracted.tipo_persona}</span>}
                  {onboardingExtracted.tipo_identificacion && <span>· {onboardingExtracted.tipo_identificacion}</span>}
                </div>
              )}
            </div>

            {/* Tipo de cliente — PRIMERO */}
            <div style={{marginBottom:22}}>
              <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Tipo de cliente</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {value:"vigia_subscriber",label:"Suscriptor VIGÍA",desc:"Accede a la plataforma · tiene usuarios propios · factura mensual",color:A.primary},
                  {value:"enara_consulting",label:"Cliente consultoría",desc:"ENARA gestiona sus EDIs · sin acceso al producto · potencial upsell",color:A.blue},
                  {value:"both",label:"Suscriptor + Consultoría",desc:"Accede a la plataforma Y ENARA gestiona sus EDIs activamente",color:A.green}
                ].map(function(opt){ var active = (newOrg.client_type||"vigia_subscriber")===opt.value; return (
                  <div key={opt.value} onClick={function(){setNewOrg(function(p){return Object.assign({},p,{client_type:opt.value});});}} style={{border:"1px solid "+(active?opt.color+"66":A.border),background:active?opt.color+"12":A.surfaceEl,borderRadius:8,padding:"12px 14px",cursor:"pointer"}}>
                    <div style={{fontSize:13,fontWeight:600,color:active?A.text:A.textSec,marginBottom:4}}>{opt.label}</div>
                    <div style={{fontSize:11,color:A.textMuted,lineHeight:1.4}}>{opt.desc}</div>
                  </div>
                ); })}
              </div>
              {newOrg.client_type==="enara_consulting" && (
                <div style={{marginTop:8,fontSize:11,color:A.blue,fontStyle:"italic"}}>Este cliente no tendrá acceso a la plataforma. Los campos de plan y límites son opcionales.</div>
              )}
              {newOrg.client_type==="both" && (
                <div style={{marginTop:8,fontSize:11,color:A.green,fontStyle:"italic"}}>El cliente accede a VIGÍA Y ENARA gestiona sus EDIs. Completa plan y límites como suscriptor.</div>
              )}
            </div>

            {/* SECCIÓN 1: Datos básicos */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Datos básicos</div>

            {/* Identificación: depende de tipo_persona */}
            <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:14,marginBottom:16}}>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Tipo de documento *</div>
                <select value={newOrg.tipo_identificacion||"NIT"} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{tipo_identificacion:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+(prefilledFields.has("tipo_identificacion")?A.green+"66":A.border),borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  {newOrg.tipo_persona==="natural" ? (
                    <>
                      <option value="CC">Cédula de Ciudadanía</option>
                      <option value="CE">Cédula de Extranjería</option>
                      <option value="PASAPORTE">Pasaporte</option>
                    </>
                  ) : (
                    <option value="NIT">NIT</option>
                  )}
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Número de identificación *{newOrg.tipo_identificacion==="NIT"?" (con dígito verificador)":""}</div>
                <input type="text" value={newOrg.numero_identificacion||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{numero_identificacion:v});});}} placeholder={newOrg.tipo_identificacion==="NIT"?"900123456-7":"1234567890"} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+(prefilledFields.has("numero_identificacion")?A.green+"66":A.border),borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Razón social / Nombre *","name","text"],["Representante legal *","representante_legal","text"],["Email corporativo","email_corporativo","email"],["Teléfono","telefono","text"],["CIIU","ciiu","text"]].map(function(f){ return (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type={f[2]} value={newOrg[f[1]]||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+(prefilledFields.has(f[1])?A.green+"66":A.border),borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ); })}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Tipo persona *</div>
                <select value={newOrg.tipo_persona||"juridica"} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{tipo_persona:v, tipo_identificacion: v==="natural" ? (["CC","CE","PASAPORTE"].includes(p.tipo_identificacion) ? p.tipo_identificacion : "CC") : "NIT"});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  <option value="juridica">Jurídica</option>
                  <option value="natural">Natural</option>
                </select>
              </div>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Sector *</div>
                <select value={newOrg.sector||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{sector:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  <option value="">Seleccionar...</option>
                  {["energia","mineria","manufactura","construccion","agro","logistica","servicios","otro"].map(function(s){return <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>;})}
                </select>
              </div>
              {newOrg.client_type!=="enara_consulting" && (
                <div>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Plan *</div>
                  <select value={newOrg.plan||"prueba"} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{plan:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                    <option value="prueba">Prueba (30 días)</option>
                    <option value="basico">Básico</option>
                    <option value="profesional">Profesional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              )}
            </div>

            {/* SECCIÓN 2: Ubicación */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Ubicación</div>
            <div style={{marginBottom:14}}>
              <ColombiaLocation A={A}
                dpto={newOrg.departamento||""} ciudad={newOrg.ciudad||""}
                onDpto={function(v){setNewOrg(function(p){return Object.assign({},p,{departamento:v,ciudad:""});});}}
                onCiudad={function(v){setNewOrg(function(p){return Object.assign({},p,{ciudad:v});});}}
              />
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Dirección","direccion","text"],["País","pais_datos","text"]].map(function(f){ return (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type={f[2]} value={newOrg[f[1]]||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ); })}
            </div>

            {/* SECCIÓN 3: Contacto VIGÍA */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Contacto VIGÍA en la empresa</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Nombre contacto *","contacto_vigia","text"],["Cargo","cargo_contacto","text"]].map(function(f){ return (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type={f[2]} value={newOrg[f[1]]||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ); })}
            </div>

            {/* SECCIÓN 4: Configuración (solo suscriptores) */}
            {newOrg.client_type!=="enara_consulting" && (<>
              <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Configuración de cuenta</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
                {[["Límite EDIs","limite_edis",5],["Límite usuarios","limite_usuarios",4],["Intake/mes","limite_intake_mes",100]].map(function(f){ return (
                  <div key={f[1]}>
                    <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                    <input type="number" value={newOrg[f[1]]!==undefined?newOrg[f[1]]:f[2]} onChange={function(e){var v=parseInt(e.target.value);setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ); })}
              </div>
            </>)}
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Nivel de confidencialidad</div>
              <div style={{display:"flex",gap:8}}>
                {["estandar","sensible","critico"].map(function(n){ return <button key={n} onClick={function(){setNewOrg(function(p){return Object.assign({},p,{nivel_confidencialidad:n});});}} style={{background:(newOrg.nivel_confidencialidad||"estandar")===n?A.primaryDim:A.surfaceEl,border:"1px solid "+((newOrg.nivel_confidencialidad||"estandar")===n?A.primary+"44":A.border),borderRadius:6,padding:"7px 18px",color:(newOrg.nivel_confidencialidad||"estandar")===n?A.primary:A.textSec,fontSize:12,cursor:"pointer"}}>{n.charAt(0).toUpperCase()+n.slice(1)}</button>; })}
              </div>
            </div>

            {/* SECCIÓN 5: Términos */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Términos y consentimiento</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
              {[["acepta_terminos",<>Acepta <a href="/privacidad" target="_blank" style={{color:A.primary,textDecoration:"none"}}>términos y condiciones</a> de VIGÍA</>],["consentimiento_datos",<>Autoriza <a href="/privacidad" target="_blank" style={{color:A.primary,textDecoration:"none"}}>tratamiento de datos personales</a> (Ley 1581/2012)</>]].map(function(f){ return (
                <label key={f[0]} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                  <div onClick={function(){setNewOrg(function(p){return Object.assign({},p,{[f[0]]:!p[f[0]]});});}} style={{width:18,height:18,borderRadius:4,border:"2px solid "+(newOrg[f[0]]?A.primary:A.border),background:newOrg[f[0]]?A.primary:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {newOrg[f[0]]&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="#060c14" strokeWidth="2"/></svg>}
                  </div>
                  <span style={{fontSize:12,color:A.textSec}}>{f[1]}</span>
                </label>
              ); })}
            </div>

            {!newOrgCreated && !newOrgConfirming && (
              <button onClick={()=>{
                if(!newOrg.name||!newOrg.numero_identificacion||!newOrg.representante_legal||!newOrg.sector||!newOrg.ciudad||!newOrg.contacto_vigia){
                  setNewOrgMsg({t:"error",m:"Completa los campos obligatorios (*) antes de continuar."});
                  return;
                }
                setNewOrgMsg(null); setNewOrgConfirming(true);
              }} style={{width:"100%",background:A.primary,border:"none",borderRadius:8,padding:"13px",color:"#060c14",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                Revisar y confirmar →
              </button>
            )}

            {newOrgConfirming && !newOrgCreated && (
              <div style={{background:A.surfaceEl,border:`1px solid ${A.primary}44`,borderRadius:12,padding:24,marginTop:0}}>
                <div style={{fontSize:15,fontWeight:700,color:A.text,marginBottom:4}}>Confirmar creación de cliente</div>
                <div style={{fontSize:12,color:A.textSec,marginBottom:20}}>Revisá los datos antes de crear. Una vez creado, podés editarlo desde Organizaciones.</div>
                {newOrgMsg&&<div style={{background:newOrgMsg.t==="success"?A.greenDim:A.redDim,border:"1px solid "+(newOrgMsg.t==="success"?A.green:A.red)+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:newOrgMsg.t==="success"?A.green:A.red,marginBottom:16}}>{newOrgMsg.m}</div>}
                {[
                  {t:"Tipo de cliente",r:[["Tipo",newOrg.client_type==="vigia_subscriber"?"Suscriptor VIGÍA":newOrg.client_type==="enara_consulting"?"Cliente consultoría":"Suscriptor + Consultoría"]]},
                  {t:"Identificación",r:[["Tipo doc.",newOrg.tipo_identificacion||"NIT"],["Número",newOrg.numero_identificacion||"—"],["Tipo persona",newOrg.tipo_persona==="juridica"?"Jurídica":"Natural"]]},
                  {t:"Datos básicos",r:[["Razón social",newOrg.name||"—"],["Representante legal",newOrg.representante_legal||"—"],["Email",newOrg.email_corporativo||"—"],["Teléfono",newOrg.telefono||"—"],["CIIU",newOrg.ciiu||"—"],["Sector",newOrg.sector||"—"]]},
                  {t:"Ubicación",r:[["Departamento",newOrg.departamento||"—"],["Ciudad",newOrg.ciudad||"—"],["Dirección",newOrg.direccion||"—"]]},
                  {t:"Contacto VIGÍA",r:[["Nombre",newOrg.contacto_vigia||"—"],["Cargo",newOrg.cargo_contacto||"—"]]},
                  ...(newOrg.client_type!=="enara_consulting"?[{t:"Plan y configuración",r:[["Plan",newOrg.plan||"—"],["Límite EDIs",String(newOrg.limite_edis??5)],["Límite usuarios",String(newOrg.limite_usuarios??4)],["Intake/mes",String(newOrg.limite_intake_mes??100)]]}]:[])
                ].map(s=>(
                  <div key={s.t} style={{marginBottom:16}}>
                    <div style={{fontSize:10,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6,paddingBottom:4,borderBottom:`1px solid ${A.border}`}}>{s.t}</div>
                    {s.r.map(([l,v])=>(
                      <div key={l} style={{display:"flex",gap:8,fontSize:12,marginBottom:3}}>
                        <span style={{color:A.textSec,minWidth:140,flexShrink:0}}>{l}</span>
                        <span style={{color:A.text,fontWeight:500}}>{v}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:12}}>
                  <button onClick={()=>{setNewOrgConfirming(false);setNewOrgMsg(null);}} disabled={newOrgSaving} style={{background:"transparent",border:`1px solid ${A.border}`,borderRadius:8,padding:"10px 18px",color:A.textSec,fontSize:12,cursor:"pointer"}}>← Corregir datos</button>
                  <button onClick={saveNewOrg} disabled={newOrgSaving} style={{background:newOrgSaving?A.surfaceEl:A.green,border:"none",borderRadius:8,padding:"10px 20px",color:newOrgSaving?A.textSec:"#060c14",fontSize:12,fontWeight:700,cursor:newOrgSaving?"not-allowed":"pointer"}}>{newOrgSaving?"Creando…":"✓ Crear cliente"}</button>
                </div>
              </div>
            )}
          </div>

          {newOrgCreated && (
            <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:28,marginTop:16}}>
              <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                <div style={{width:36,height:36,borderRadius:8,background:A.greenDim,display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={A.green} strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:A.text}}>{newOrgCreated.name}</div>
                  <div style={{fontSize:11,color:A.green}}>Organización creada — ahora agrega los usuarios</div>
                </div>
                <button onClick={resetNewOrg} style={{marginLeft:"auto",background:"transparent",border:"1px solid "+A.border,borderRadius:6,padding:"5px 12px",color:A.textSec,fontSize:11,cursor:"pointer"}}>Nueva org</button>
              </div>

              <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Crear usuarios para esta organización</div>

              {orgUsers.map(function(u,i){ return (
                <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:10,marginBottom:10,alignItems:"end"}}>
                  <div>
                    {i===0&&<div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Email</div>}
                    <input type="email" value={u.email} placeholder="usuario@empresa.co" onChange={function(e){var v=e.target.value;setOrgUsers(function(p){var n=[...p];n[i]=Object.assign({},n[i],{email:v});return n;});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                  </div>
                  <div>
                    {i===0&&<div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Rol</div>}
                    <select value={u.role} onChange={function(e){var v=e.target.value;setOrgUsers(function(p){var n=[...p];n[i]=Object.assign({},n[i],{role:v});return n;});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                      <option value="viewer">viewer — Solo lectura</option>
                      <option value="editor">editor — Crea y edita EDIs</option>
                      <option value="admin">admin — Admin de org</option>
                    </select>
                  </div>
                  <div>
                    {i===0&&<div style={{fontSize:11,color:"transparent",marginBottom:5}}>.</div>}
                    <input type="text" value={u.password} onChange={function(e){var v=e.target.value;setOrgUsers(function(p){var n=[...p];n[i]=Object.assign({},n[i],{password:v});return n;});}} placeholder="Password" style={{background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",width:120}}/>
                  </div>
                  <div>
                    {i===0&&<div style={{fontSize:11,color:"transparent",marginBottom:5}}>.</div>}
                    {orgUsers.length>1&&<button onClick={function(){removeOrgUser(i);}} style={{background:A.redDim,border:"1px solid "+A.red+"44",borderRadius:8,padding:"9px 12px",color:A.red,fontSize:12,cursor:"pointer"}}>✕</button>}
                  </div>
                </div>
              ); })}

              <div style={{display:"flex",gap:10,marginTop:4,marginBottom:20}}>
                <button onClick={addOrgUser} style={{background:"transparent",border:"1px dashed "+A.border,borderRadius:8,padding:"8px 16px",color:A.textSec,fontSize:12,cursor:"pointer"}}>+ Agregar usuario</button>
              </div>

              {usersLog.length>0&&(
                <div style={{background:A.surfaceEl,borderRadius:8,padding:"10px 14px",marginBottom:16,maxHeight:160,overflowY:"auto"}}>
                  {usersLog.map(function(l,i){ return <div key={i} style={{fontSize:11,color:l.t==="success"?A.green:l.t==="error"?A.red:l.t==="warn"?A.yellow:A.textSec,marginBottom:2}}>{l.m}</div>; })}
                </div>
              )}

              <button onClick={saveOrgUsers} disabled={addingUsers} style={{width:"100%",background:addingUsers?A.surfaceEl:"#1a3a2a",border:"1px solid "+A.green+"44",borderRadius:8,padding:"12px",color:addingUsers?A.textSec:A.green,fontSize:14,fontWeight:700,cursor:addingUsers?"not-allowed":"pointer"}}>
                {addingUsers?"Creando usuarios...":"Crear usuarios y finalizar activación"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const ORG_EDITABLE_FIELDS = ["name","sector","representante_legal","contacto_vigia","cargo_contacto","ciudad","departamento"];
const ORG_FIELD_LABELS = {
  name: "Razón social",
  sector: "Sector",
  representante_legal: "Representante legal",
  contacto_vigia: "Contacto VIGÍA",
  cargo_contacto: "Cargo del contacto",
  ciudad: "Ciudad",
  departamento: "Departamento"
};

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

function OrgProfileModule({clientOrg, sessionToken, userId}) {
  const A = C;
  const [form, setForm] = React.useState({});
  const [reason, setReason] = React.useState("");
  const [files, setFiles] = React.useState([]);
  const fileInputRef = React.useRef(null);
  const [requests, setRequests] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const valid = [];
    const errors = [];
    picked.forEach(f => {
      if (f.type !== "application/pdf") { errors.push(`${f.name}: solo PDF.`); return; }
      if (f.size > MAX_ATTACHMENT_SIZE) { errors.push(`${f.name}: supera 10 MB.`); return; }
      valid.push(f);
    });
    if (files.length + valid.length > MAX_ATTACHMENTS) { errors.push(`Máximo ${MAX_ATTACHMENTS} archivos por solicitud.`); valid.splice(MAX_ATTACHMENTS - files.length); }
    if (errors.length) setMsg({t:"error",m:errors.join(" ")});
    else setMsg(null);
    setFiles(prev => [...prev, ...valid]);
    if (e.target) e.target.value = "";
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_,i)=>i!==idx));

  React.useEffect(()=>{
    if(!clientOrg) return;
    const initial = {};
    ORG_EDITABLE_FIELDS.forEach(k=>{ initial[k] = clientOrg[k] || ""; });
    setForm(initial);
  }, [clientOrg?.id]);

  const loadRequests = async () => {
    if(!clientOrg?.id) return;
    try {
      const data = await sb("org_update_requests", "select=*&order=created_at.desc", sessionToken||SB_KEY);
      setRequests(Array.isArray(data)?data:[]);
    } catch(e) { /* ignore: RLS o red */ }
  };

  React.useEffect(()=>{ loadRequests(); }, [clientOrg?.id]);

  const submit = async () => {
    if(!clientOrg?.id) return;
    const diff = {};
    ORG_EDITABLE_FIELDS.forEach(k=>{
      if((form[k]||"") !== (clientOrg[k]||"")) diff[k] = form[k];
    });
    if(Object.keys(diff).length === 0) { setMsg({t:"error",m:"No hay cambios para solicitar."}); return; }
    if(requests.find(r=>r.status==="pending")) { setMsg({t:"error",m:"Ya tenés una solicitud pendiente. Esperá aprobación o rechazo."}); return; }
    setLoading(true); setMsg(null);
    try {
      const attachments = [];
      for (const f of files) {
        const meta = await uploadAttachment(f, clientOrg.id, sessionToken);
        attachments.push(meta);
      }
      await sbInsert("org_update_requests", {
        org_id: clientOrg.id,
        requested_by: userId,
        requested_changes: diff,
        reason: reason.trim() || null,
        attachments
      }, sessionToken);
      setMsg({t:"success",m:"Solicitud enviada. Un SuperAdmin la revisará."});
      setReason("");
      setFiles([]);
      await loadRequests();
    } catch(e) { setMsg({t:"error",m:e.message}); }
    setLoading(false);
  };

  const formatSize = (bytes) => bytes < 1024 ? bytes + " B" : bytes < 1048576 ? (bytes/1024).toFixed(1)+" KB" : (bytes/1048576).toFixed(1)+" MB";

  const input = {width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:13,outline:"none",fontFamily:FONT};
  const statusBadge = (s) => s==="pending"?{color:A.yellow,bg:A.yellowDim,label:"Pendiente"}:s==="approved"?{color:A.green,bg:A.greenDim,label:"Aprobada"}:{color:A.red,bg:A.redDim,label:"Rechazada"};

  return (
    <div style={{padding:28,overflowY:"auto",height:"100%"}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:22,fontWeight:700,color:A.text,margin:0}}>Mi organización</h1>
        <p style={{fontSize:13,color:A.textSec,margin:"4px 0 0",lineHeight:1.5}}>Los datos definitivos solo los puede actualizar un SuperAdmin de ENARA. Podés solicitar cambios y recibirás el resultado en el historial.</p>
      </div>

      {msg && <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,background:msg.t==="error"?A.redDim:A.greenDim,color:msg.t==="error"?A.red:A.green,fontSize:12,fontWeight:500}}>{msg.m}</div>}

      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"18px 22px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:A.text,marginBottom:14}}>Datos actuales</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          {ORG_EDITABLE_FIELDS.map(k=>(
            <div key={k}>
              <div style={{fontSize:11,color:A.textSec,marginBottom:4,fontWeight:600}}>{ORG_FIELD_LABELS[k]}</div>
              <div style={{fontSize:13,color:A.text}}>{clientOrg?.[k] || <span style={{color:A.textMuted,fontStyle:"italic"}}>(sin definir)</span>}</div>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,paddingTop:14,borderTop:`1px dashed ${A.border}`,display:"flex",gap:18,fontSize:11,color:A.textMuted,flexWrap:"wrap"}}>
          <div><span style={{fontWeight:600,color:A.textSec}}>NIT:</span> {clientOrg?.nit || "—"}</div>
          <div><span style={{fontWeight:600,color:A.textSec}}>Plan:</span> {clientOrg?.plan || "—"}</div>
          <div style={{fontStyle:"italic"}}>(NIT y plan solo los modifica SuperAdmin)</div>
        </div>
      </div>

      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"18px 22px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:A.text,marginBottom:4}}>Solicitar actualización</div>
        <div style={{fontSize:11,color:A.textMuted,marginBottom:14}}>Solo se enviarán los campos que modifiques respecto a los datos actuales.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:14}}>
          {ORG_EDITABLE_FIELDS.filter(k=>k!=="ciudad"&&k!=="departamento").map(k=>(
            <div key={k}>
              <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{ORG_FIELD_LABELS[k]}</div>
              <input value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})} style={input}/>
            </div>
          ))}
        </div>
        <div style={{marginBottom:14}}>
          <ColombiaLocation dpto={form.departamento} ciudad={form.ciudad} onDpto={v=>setForm(f=>({...f,departamento:v,ciudad:""}))} onCiudad={v=>setForm(f=>({...f,ciudad:v}))} A={A}/>
        </div>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Motivo (opcional)</div>
          <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej: actualización de contacto por cambio de HSE manager." rows={2} style={{...input,resize:"vertical",minHeight:58,fontFamily:FONT}}/>
        </div>

        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Documentos de soporte (PDF, máx. 10 MB, hasta 5)</div>
          <input ref={fileInputRef} type="file" accept="application/pdf" multiple onChange={onPickFiles} style={{display:"none"}}/>
          <button type="button" onClick={()=>fileInputRef.current?.click()} disabled={files.length>=MAX_ATTACHMENTS} style={{display:"inline-flex",alignItems:"center",gap:8,background:"transparent",border:`1px dashed ${A.border}`,borderRadius:8,padding:"9px 14px",color:files.length>=MAX_ATTACHMENTS?A.textMuted:A.textSec,fontSize:12,cursor:files.length>=MAX_ATTACHMENTS?"not-allowed":"pointer",fontFamily:FONT}}>
            <Paperclip size={13}/> Adjuntar PDF ({files.length}/{MAX_ATTACHMENTS})
          </button>
          {files.length>0 && (
            <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:6}}>
              {files.map((f,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"7px 12px"}}>
                  <FileText size={13} color={A.primary}/>
                  <div style={{flex:1,fontSize:12,color:A.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                  <div style={{fontSize:10,color:A.textMuted}}>{formatSize(f.size)}</div>
                  <button onClick={()=>removeFile(i)} style={{background:"transparent",border:"none",color:A.red,cursor:"pointer",padding:2,display:"flex"}}><X size={13}/></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={submit} disabled={loading} style={{background:loading?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"10px 18px",color:loading?"#5e7a95":"#060c14",fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:FONT}}>{loading?"Enviando...":"Enviar solicitud"}</button>
      </div>

      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"14px 22px",borderBottom:`1px solid ${A.border}`,fontSize:13,fontWeight:700,color:A.text}}>Historial de solicitudes</div>
        {requests.length===0 && <div style={{padding:"20px 22px",fontSize:12,color:A.textMuted}}>No has enviado solicitudes todavía.</div>}
        {requests.map(r=>{
          const b = statusBadge(r.status);
          return (
            <div key={r.id} style={{padding:"14px 22px",borderBottom:`1px solid ${A.border}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                <div style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:b.bg,color:b.color,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{b.label}</div>
                <div style={{fontSize:11,color:A.textMuted}}>{new Date(r.created_at).toLocaleString("es-CO")}</div>
              </div>
              <div style={{fontSize:12,color:A.text,marginBottom:6}}>
                {Object.entries(r.requested_changes||{}).map(([k,v])=>(
                  <div key={k} style={{marginBottom:3}}><span style={{color:A.textMuted}}>{ORG_FIELD_LABELS[k]||k}:</span> <span style={{color:A.text}}>{String(v)}</span></div>
                ))}
              </div>
              {r.reason && <div style={{fontSize:11,color:A.textSec,fontStyle:"italic",marginTop:6}}>Motivo: {r.reason}</div>}
              {r.attachments?.length>0 && (
                <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
                  {r.attachments.map((a,i)=>(
                    <div key={i} style={{fontSize:11,color:A.textSec,display:"flex",alignItems:"center",gap:6}}>
                      <Paperclip size={11}/> <span style={{color:A.text}}>{a.name}</span> <span style={{color:A.textMuted}}>({formatSize(a.size)})</span>
                    </div>
                  ))}
                </div>
              )}
              {r.review_note && <div style={{fontSize:11,color:A.textSec,marginTop:6,paddingTop:6,borderTop:`1px dashed ${A.border}`}}><span style={{fontWeight:600}}>Nota SuperAdmin:</span> {r.review_note}</div>}
            </div>
          );
        })}
      </div>

      {/* Plan y suscripción */}
      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"20px 24px",marginTop:16}}>
        <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16}}>Plan y suscripción</div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,padding:"12px 16px",background:A.surfaceEl,borderRadius:8,border:`1px solid ${A.border}`}}>
          <div>
            <div style={{fontSize:13,fontWeight:600,color:A.text}}>{clientOrg?.tier==="enterprise"?"Enterprise":clientOrg?.tier==="pro"?"Profesional":"Gratuito"}</div>
            <div style={{fontSize:11,color:A.textMuted,marginTop:2}}>{clientOrg?.limite_edis??"—"} EDIs · {clientOrg?.limite_usuarios??"—"} usuarios{clientOrg?.plan_estado?` · ${clientOrg.plan_estado}`:""}</div>
          </div>
          <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:6,background:clientOrg?.tier==="enterprise"?A.primaryDim:clientOrg?.tier==="pro"?(A.blueDim||A.surfaceEl):A.surfaceEl,color:clientOrg?.tier==="enterprise"?A.primary:clientOrg?.tier==="pro"?(A.blue||A.textSec):A.textMuted,textTransform:"uppercase",letterSpacing:"0.05em"}}>{clientOrg?.tier||"free"}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:16}}>
          {[{n:"Gratuito",t:"free",p:"$0",e:"5 EDIs",u:"2 usuarios",i:"10 análisis/mes",c:A.textMuted},{n:"Profesional",t:"pro",p:"$3MM COP/mes",e:"25 EDIs",u:"5 usuarios",i:"50 análisis/mes",c:A.blue||A.primary},{n:"Enterprise",t:"enterprise",p:"$6MM COP/mes",e:"Ilimitados",u:"Ilimitados",i:"Ilimitados",c:A.primary}].map(plan=>{
            const cur=clientOrg?.tier===plan.t;
            return <div key={plan.t} style={{padding:"14px",borderRadius:8,border:`1px solid ${cur?plan.c+"66":A.border}`,background:cur?plan.c+"0d":A.surfaceEl,position:"relative"}}>
              {cur&&<div style={{position:"absolute",top:-8,left:"50%",transform:"translateX(-50%)",fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,background:plan.c,color:"#060c14",whiteSpace:"nowrap"}}>Plan actual</div>}
              <div style={{fontSize:12,fontWeight:700,color:plan.c,marginBottom:4}}>{plan.n}</div>
              <div style={{fontSize:14,fontWeight:800,color:A.text,marginBottom:8}}>{plan.p}</div>
              {[plan.e,plan.u,plan.i].map((f,i)=><div key={i} style={{fontSize:10,color:A.textSec,marginBottom:2}}>✓ {f}</div>)}
            </div>;
          })}
        </div>
        {clientOrg?.tier!=="enterprise" ? (
          <div style={{background:A.primaryDim,border:`1px solid ${A.primary}33`,borderRadius:8,padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div><div style={{fontSize:12,fontWeight:600,color:A.text,marginBottom:2}}>¿Necesitas más capacidad?</div><div style={{fontSize:11,color:A.textSec}}>Contacta a ENARA para escalar tu plan.</div></div>
            <a href={`mailto:info@enaraconsulting.com.co?subject=${encodeURIComponent("Solicitud upgrade plan VIGÍA — "+(clientOrg?.name||""))}&body=${encodeURIComponent("Hola equipo ENARA,\n\nSomos "+(clientOrg?.name||"")+" y estamos interesados en escalar nuestro plan de VIGÍA.\n\nPlan actual: "+(clientOrg?.tier||"free")+"\n\nQuedamos atentos.\n\nGracias.")}`} style={{background:A.primary,color:"#060c14",fontWeight:700,fontSize:11,padding:"8px 16px",borderRadius:6,textDecoration:"none",flexShrink:0,whiteSpace:"nowrap"}}>Solicitar upgrade →</a>
          </div>
        ) : (
          <div style={{fontSize:11,color:A.textSec,textAlign:"center",padding:"8px 0"}}>Estás en el plan más completo. Para necesidades personalizadas: <span style={{color:A.primary}}>info@enaraconsulting.com.co</span></div>
        )}
      </div>
    </div>
  );
}

function MyTeamModule({orgId, orgName, limiteUsuarios, sessionToken}) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [newUser, setNewUser] = React.useState({email:"",password:"Vigia2026!",role:"editor"});
  const A = C;
  const teamCall = (op, payload) => callEdge("orgadmin-users", {op, orgId, payload}, sessionToken);

  const load = async () => {
    if(!orgId) return;
    setLoading(true);
    try {
      const { users: list } = await teamCall("list");
      setUsers(Array.isArray(list) ? list : []);
    } catch(e) { setMsg({t:"error",m:e.message}); }
    setLoading(false);
  };

  React.useEffect(()=>{ load(); }, [orgId]);

  const createUser = async () => {
    if(!newUser.email || !newUser.password) { setMsg({t:"error",m:"Email y password requeridos"}); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email.trim())) { setMsg({t:"error",m:"Email inválido (ej: nombre@empresa.com.co)"}); return; }
    const pwdErr = validatePassword(newUser.password);
    if(pwdErr) { setMsg({t:"error",m:pwdErr}); return; }
    if(limiteUsuarios && users.length >= limiteUsuarios) { setMsg({t:"error",m:`Límite de ${limiteUsuarios} usuarios alcanzado para este plan.`}); return; }
    setLoading(true); setMsg(null);
    try {
      await teamCall("create", newUser);
      setMsg({t:"success",m:`Usuario ${newUser.email} creado`});
      setNewUser({email:"",password:"Vigia2026!",role:"editor"});
      await load();
    } catch(e) { setMsg({t:"error",m:e.message}); setLoading(false); }
  };

  const removeUser = async (userId, email) => {
    if(!window.confirm(`Quitar ${email} de ${orgName||"la organización"}? La cuenta seguirá existiendo pero perderá acceso a esta org.`)) return;
    try {
      await teamCall("remove", { userId });
      setMsg({t:"success",m:`${email} removido`});
      await load();
    } catch(e) { setMsg({t:"error",m:e.message}); }
  };

  const input = {width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:13,outline:"none",fontFamily:FONT};

  return (
    <div style={{padding:28,overflowY:"auto",height:"100%"}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:22,fontWeight:700,color:A.text,margin:0}}>Mi equipo</h1>
        <p style={{fontSize:13,color:A.textSec,margin:"4px 0 0"}}>Usuarios de {orgName||"tu organización"} — {users.length}{limiteUsuarios?` / ${limiteUsuarios}`:""}</p>
      </div>

      {msg && <div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,background:msg.t==="error"?A.redDim:A.greenDim,color:msg.t==="error"?A.red:A.green,fontSize:12,fontWeight:500}}>{msg.m}</div>}

      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"18px 22px",marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:700,color:A.text,marginBottom:14}}>Agregar usuario</div>
        <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:10,alignItems:"end"}}>
          <div>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Email *</div>
            <input value={newUser.email} onChange={e=>setNewUser({...newUser,email:e.target.value})} placeholder="usuario@ejemplo.com" style={input}/>
          </div>
          <div>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Password *</div>
            <input value={newUser.password} onChange={e=>setNewUser({...newUser,password:e.target.value})} style={input}/>
          </div>
          <div>
            <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Rol</div>
            <select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})} style={input}>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button onClick={createUser} disabled={loading} style={{background:loading?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"10px 18px",color:loading?"#5e7a95":"#060c14",fontSize:13,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:FONT}}>{loading?"...":"Crear"}</button>
        </div>
      </div>

      <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,overflow:"hidden"}}>
        <div style={{padding:"14px 22px",borderBottom:`1px solid ${A.border}`,fontSize:13,fontWeight:700,color:A.text}}>Usuarios activos</div>
        {users.length===0 && <div style={{padding:"20px 22px",fontSize:12,color:A.textMuted}}>{loading?"Cargando...":"No hay usuarios todavía."}</div>}
        {users.map(u=>(
          <div key={u.user_id} style={{padding:"14px 22px",borderBottom:`1px solid ${A.border}`,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:32,height:32,borderRadius:8,background:A.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:11,fontWeight:700,color:A.primary}}>{(u.email||"??").substring(0,2).toUpperCase()}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:A.text}}>{u.full_name||u.email?.split("@")[0]||"—"}</div>
              <div style={{fontSize:11,color:A.textMuted,overflow:"hidden",textOverflow:"ellipsis"}}>{u.email||u.user_id}</div>
            </div>
            <div style={{fontSize:10,padding:"3px 10px",borderRadius:6,background:A.surfaceEl,color:A.textSec,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{u.role}</div>
            <button onClick={()=>removeUser(u.user_id,u.email)} style={{background:"transparent",border:`1px solid ${A.border}`,borderRadius:6,padding:"5px 10px",color:A.red,fontSize:10,cursor:"pointer",fontWeight:600,fontFamily:FONT}}>Quitar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEMO_DATA = {
  org: { id:"demo-org", name:"Energía Solar del Caribe S.A.S.", sector:"energia", ciudad:"Barranquilla", departamento:"Atlántico", plan:"profesional", client_type:"vigia_subscriber", nit:"901234567-0" },
  instruments: [
    { id:"demo-inst-1", org_id:"demo-org", title:"Licencia Ambiental · Parque Solar Caribe I · Barranquilla", instrument_type:"licencia_ambiental", number:"ANLA-786/2022", issue_date:"2022-03-15", expiry_date:"2032-03-15", authority_name:"ANLA", authority_level:"nacional", domain:"energia", edi_status:"activo", completeness_pct:85, location_dept:"Atlántico", location_mun:"Barranquilla", project_name:"Parque Solar Caribe I" },
    { id:"demo-inst-2", org_id:"demo-org", title:"Permiso de Vertimiento · Canal Mallorquín · Barranquilla", instrument_type:"permiso_vertimiento", number:"CRA-PV-2021-0034", issue_date:"2021-06-01", expiry_date:"2024-06-01", authority_name:"CRA", authority_level:"regional", domain:"agua", edi_status:"vencido", completeness_pct:62, location_dept:"Atlántico", location_mun:"Barranquilla", project_name:"Canal Mallorquín" },
    { id:"demo-inst-3", org_id:"demo-org", title:"Concesión de Aguas · Río Magdalena · Atlántico", instrument_type:"concesion_aguas", number:"CRA-CA-2020-0012", issue_date:"2020-01-10", expiry_date:"2025-05-20", authority_name:"CRA", authority_level:"regional", domain:"agua", edi_status:"activo", completeness_pct:91, location_dept:"Atlántico", location_mun:"Sabanalarga", project_name:"Río Magdalena" }
  ],
  obligations: [
    { id:"demo-ob-1", org_id:"demo-org", instrument_id:"demo-inst-1", obligation_num:"OBL-01", name:"Informe semestral de cumplimiento ambiental", due_date:"2024-12-31", frequency:"semestral", status:"vencida", obligation_type:"reporte", norma_fundamento:"Resolución ANLA 786/2022" },
    { id:"demo-ob-2", org_id:"demo-org", instrument_id:"demo-inst-1", obligation_num:"OBL-02", name:"Monitoreo de calidad del aire — PM2.5", due_date:"2026-05-15", frequency:"trimestral", status:"pendiente", obligation_type:"monitoreo", norma_fundamento:"Resolución 2254/2017" },
    { id:"demo-ob-3", org_id:"demo-org", instrument_id:"demo-inst-1", obligation_num:"OBL-03", name:"Programa de compensación forestal", due_date:"2026-04-30", frequency:"anual", status:"pendiente", obligation_type:"compensacion", norma_fundamento:"Decreto 1076/2015 Art. 2.2.1.3.6" },
    { id:"demo-ob-4", org_id:"demo-org", instrument_id:"demo-inst-2", obligation_num:"OBL-04", name:"Renovación permiso de vertimiento", due_date:"2024-06-01", frequency:"unica", status:"vencida", obligation_type:"tramite", norma_fundamento:"Decreto 3930/2010" },
    { id:"demo-ob-5", org_id:"demo-org", instrument_id:"demo-inst-3", obligation_num:"OBL-05", name:"Pago tasa por uso del agua", due_date:"2026-06-30", frequency:"anual", status:"pendiente", obligation_type:"pago", norma_fundamento:"Ley 99/1993 Art. 43" }
  ],
  alerts: []
};

const SUPPORT_TREE={"Acceso y autenticación":{icon:"🔐",desc:"Problemas para entrar",subs:["No puedo iniciar sesión","Olvidé mi contraseña","Mi cuenta fue bloqueada","No recibí email de activación","Otro problema de acceso"]},"Expedientes (EDIs)":{icon:"📁",desc:"Problemas con expedientes",subs:["No puedo crear un EDI","Un EDI desapareció","Estado del EDI incorrecto","No puedo subir documentos","Análisis del documento falló","Obligaciones no detectadas","Otro problema con EDIs"]},"Motor de consulta":{icon:"💬",desc:"Problemas con el bot",subs:["El bot no responde","Respuesta incorrecta","Cita norma derogada","Límite de consultas","Respuesta muy lenta","Otro problema con bot"]},"Datos y organización":{icon:"🏢",desc:"Datos de tu organización",subs:["Datos incorrectos","Usuario no puede acceder","No puedo agregar usuarios","Fechas incorrectas","Información duplicada","Otro problema con datos"]},"Alertas":{icon:"🔔",desc:"Emails y notificaciones",subs:["No recibo alertas","Alertas incorrectas","Email bienvenida no llegó","Otro"]},"Rendimiento":{icon:"⚡",desc:"Lentitud o errores",subs:["Plataforma lenta","Página no carga","Errores constantes","INTAKE muy lento","Otro"]},"Plan y suscripción":{icon:"💳",desc:"Planes y facturación",subs:["Quiero escalar mi plan","Pregunta sobre factura","Límite de EDIs","Límite de usuarios","Otro"]},"Otro":{icon:"❓",desc:"Cualquier otro tema",subs:["Sugerencia de mejora","Error en datos normativos","Necesito capacitación","Otro"]}};
const PRIORIDADES=[{v:"baja",l:"Baja",d:"Puedo seguir trabajando",c:"#64748b"},{v:"media",l:"Media",d:"Me afecta parcialmente",c:"#eab308"},{v:"alta",l:"Alta",d:"Bloquea parte de mi trabajo",c:"#f97316"},{v:"critica",l:"Crítica",d:"No puedo usar la plataforma",c:"#ef4444"}];

function SupportModule({clientOrg, session}) {
  const A=C;
  const [tickets,setTickets]=React.useState([]);
  const [loading,setLoading]=React.useState(false);
  const [msg,setMsg]=React.useState(null);
  const [cat,setCat]=React.useState(null);
  const [sub,setSub]=React.useState(null);
  const [prio,setPrio]=React.useState("media");
  const [desc,setDesc]=React.useState("");
  const [saving,setSaving]=React.useState(false);
  const [expanded,setExpanded]=React.useState(null);

  const loadTickets=async()=>{
    if(!session?.access_token) return;
    setLoading(true);
    try {
      const r=await fetch(`${SB_URL}/rest/v1/support_tickets?select=*&order=created_at.desc&limit=30`,{headers:{apikey:SB_KEY,Authorization:`Bearer ${session.access_token}`}});
      const d=await r.json();
      setTickets(Array.isArray(d)?d:[]);
    } catch{setTickets([]);}
    setLoading(false);
  };
  React.useEffect(()=>{loadTickets();},[]);

  const submitTicket=async()=>{
    if(!cat||!sub){setMsg({t:"error",m:"Selecciona categoría y subcategoría"});return;}
    setSaving(true);setMsg(null);
    try {
      const body={org_id:clientOrg?.id||null,user_id:session?.user?.id||null,user_email:session?.user?.email||null,org_name:clientOrg?.name||null,categoria:cat,subcategoria:sub,titulo_auto:`${cat} — ${sub}`,descripcion:desc.trim()||"(sin descripción adicional)",prioridad:prio};
      const r=await fetch(`${SB_URL}/rest/v1/support_tickets`,{method:"POST",headers:{apikey:SB_KEY,Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json",Prefer:"return=representation"},body:JSON.stringify(body)});
      const d=await r.json();
      if(r.ok){setMsg({t:"success",m:"Ticket enviado. ENARA responderá pronto."});setCat(null);setSub(null);setPrio("media");setDesc("");await loadTickets();}
      else{setMsg({t:"error",m:d?.message||d?.error||"Error al enviar"});}
    }catch(e){setMsg({t:"error",m:e.message});}
    setSaving(false);
  };

  const estadoBadge=(s)=>s==="abierto"?{c:A.yellow,bg:A.yellowDim}:s==="en_proceso"?{c:A.primary,bg:A.primaryDim}:s==="resuelto"?{c:A.green,bg:A.greenDim}:{c:A.textMuted,bg:A.surfaceEl};
  const prioBadge=(p)=>p==="critica"?{c:"#ef4444"}:p==="alta"?{c:"#f97316"}:p==="media"?{c:"#eab308"}:{c:"#64748b"};
  const step=!cat?1:!sub?2:3;

  return <div style={{padding:28,overflowY:"auto",height:"100%"}}>
    <div style={{marginBottom:20}}><h1 style={{fontSize:22,fontWeight:700,color:A.text,margin:0}}>Soporte</h1><p style={{fontSize:13,color:A.textSec,margin:"4px 0 0"}}>¿Necesitas ayuda? Crea un ticket y ENARA te responderá.</p></div>
    {msg&&<div style={{padding:"10px 14px",borderRadius:8,marginBottom:16,background:msg.t==="error"?A.redDim:A.greenDim,color:msg.t==="error"?A.red:A.green,fontSize:12}}>{msg.m}</div>}

    {/* Progress */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20}}>
      {[1,2,3].map(s=><React.Fragment key={s}><div style={{width:24,height:24,borderRadius:"50%",background:step>=s?A.primary:A.surfaceEl,border:`2px solid ${step>=s?A.primary:A.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:step>=s?"#060c14":A.textMuted}}>{s}</div>{s<3&&<div style={{flex:1,height:2,background:step>s?A.primary:A.border,borderRadius:1}}/>}</React.Fragment>)}
    </div>

    {/* Paso A — Categoría */}
    <div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"16px 18px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>1. ¿Qué tipo de problema tienes?</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:8}}>
        {Object.entries(SUPPORT_TREE).map(([k,v])=>{const active=cat===k;return <button key={k} onClick={()=>{setCat(k);setSub(null);}} style={{textAlign:"left",background:active?`${A.primary}12`:A.surfaceEl,border:`1px solid ${active?A.primary+"66":A.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",color:A.text,fontFamily:FONT}}>
          <div style={{fontSize:14,marginBottom:4}}>{v.icon}</div>
          <div style={{fontSize:12,fontWeight:600,color:active?A.text:A.textSec}}>{k}</div>
          <div style={{fontSize:10,color:A.textMuted}}>{v.desc}</div>
        </button>;})}
      </div>
    </div>

    {/* Paso B — Subcategoría */}
    {cat&&<div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"16px 18px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>2. Más específico</div>
      <div style={{display:"flex",flexDirection:"column",gap:4}}>
        {SUPPORT_TREE[cat].subs.map(s=>{const active=sub===s;return <button key={s} onClick={()=>setSub(s)} style={{textAlign:"left",background:active?`${A.primary}12`:A.surfaceEl,border:`1px solid ${active?A.primary+"66":A.border}`,borderRadius:6,padding:"8px 12px",cursor:"pointer",fontSize:12,color:active?A.text:A.textSec,fontWeight:active?600:400,fontFamily:FONT}}>{s}</button>;})}
      </div>
    </div>}

    {/* Paso C — Prioridad + Descripción */}
    {sub&&<div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"16px 18px",marginBottom:12}}>
      <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>3. Prioridad y detalles</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
        {PRIORIDADES.map(p=>{const active=prio===p.v;return <button key={p.v} onClick={()=>setPrio(p.v)} style={{textAlign:"center",background:active?p.c+"18":"transparent",border:`1px solid ${active?p.c+"66":A.border}`,borderRadius:6,padding:"8px 6px",cursor:"pointer",fontFamily:FONT}}>
          <div style={{fontSize:11,fontWeight:700,color:p.c}}>{p.l}</div>
          <div style={{fontSize:9,color:A.textMuted,marginTop:2}}>{p.d}</div>
        </button>;})}
      </div>
      <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Cuéntanos más (opcional pero útil)</div>
      <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder={`Describe tu problema con "${sub}"...`} style={{width:"100%",background:A.surfaceEl,border:`1px solid ${A.border}`,borderRadius:8,padding:"10px 12px",color:A.text,fontSize:12,fontFamily:FONT,resize:"vertical",minHeight:80,outline:"none",lineHeight:1.5,boxSizing:"border-box"}}/>
      <div style={{display:"flex",justifyContent:"flex-end",marginTop:12}}>
        <button onClick={submitTicket} disabled={saving} style={{background:saving?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"10px 20px",color:saving?A.textSec:"#060c14",fontSize:13,fontWeight:700,cursor:saving?"not-allowed":"pointer",fontFamily:FONT}}>{saving?"Enviando...":"Enviar ticket"}</button>
      </div>
    </div>}

    {/* Tickets existentes */}
    <div style={{marginTop:24}}>
      <div style={{fontSize:11,fontWeight:700,color:A.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Mis tickets ({tickets.length})</div>
      {loading&&<div style={{fontSize:12,color:A.textMuted}}>Cargando...</div>}
      {!loading&&tickets.length===0&&<div style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:12,padding:"32px 20px",textAlign:"center",fontSize:13,color:A.textMuted}}>Todo va bien por ahora. Sin tickets abiertos.</div>}
      {tickets.map(t=>{const eb=estadoBadge(t.estado);const pb=prioBadge(t.prioridad);const isExp=expanded===t.id;return <div key={t.id} style={{background:A.surface,border:`1px solid ${A.border}`,borderRadius:10,marginBottom:6,overflow:"hidden"}}>
        <div onClick={()=>setExpanded(isExp?null:t.id)} style={{padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
          <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:4,background:eb.bg,color:eb.c,textTransform:"uppercase"}}>{t.estado?.replace(/_/g," ")}</span>
          <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,border:`1px solid ${pb.c}44`,color:pb.c}}>{t.prioridad}</span>
          <span style={{fontSize:12,fontWeight:600,color:A.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.titulo_auto||t.categoria}</span>
          <span style={{fontSize:10,color:A.textMuted,flexShrink:0}}>{new Date(t.created_at).toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</span>
          <ChevronRight size={14} color={A.textSec} style={{transform:isExp?"rotate(90deg)":"none",transition:"transform 0.15s"}}/>
        </div>
        {isExp&&<div style={{padding:"0 16px 14px",borderTop:`1px solid ${A.border}`}}>
          <div style={{fontSize:11,color:A.textSec,padding:"10px 0",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{t.descripcion}</div>
          {t.respuesta_enara&&<div style={{background:A.primaryDim,border:`1px solid ${A.primary}33`,borderRadius:8,padding:"10px 14px",marginTop:8}}>
            <div style={{fontSize:10,fontWeight:700,color:A.primary,marginBottom:4}}>Respuesta ENARA</div>
            <div style={{fontSize:12,color:A.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{t.respuesta_enara}</div>
            {t.respondido_at&&<div style={{fontSize:10,color:A.textMuted,marginTop:6}}>{new Date(t.respondido_at).toLocaleString("es-CO")}</div>}
          </div>}
        </div>}
      </div>;})}
    </div>
  </div>;
}

function PoliticaPrivacidad() {
  const L={bg:"#060c14",surface:"#0c1523",border:"#162236",primary:"#00c9a7",text:"#d8e6f0",textSec:"#8ba4ba",textMuted:"#5e7a95"};
  const S=[
    ["1. Responsable del tratamiento","ENARA Consulting S.A.S., sociedad legalmente constituida en Colombia, con domicilio en Barranquilla, Atlántico, actúa como responsable del tratamiento de los datos personales recopilados a través de la plataforma VIGÍA.\n\nContacto:\n- Correo: info@enaraconsulting.com.co\n- Teléfonos: +57 314 330 4008 / +57 320 277 3972\n- Web: www.enaraconsulting.com.co"],
    ["2. Marco legal","Esta política se rige por:\n- Ley 1581 de 2012 — Protección de Datos Personales (Habeas Data)\n- Decreto 1377 de 2013 — Reglamentación parcial de la Ley 1581\n- Decreto 1074 de 2015 (compilatorio)\n- Circular Única de la SIC"],
    ["3. Datos personales tratados","La Plataforma recopila:\n- Datos de identificación: nombre, número de identificación (cédula o NIT), cargo.\n- Datos de contacto: correo electrónico, teléfono, dirección.\n- Datos de uso: consultas al motor de inteligencia regulatoria, documentos subidos, fecha y hora de acceso.\n- Datos de la organización: razón social, sector, ubicación, instrumentos ambientales.\n\nNo recopilamos datos sensibles (Art. 5, Ley 1581/2012)."],
    ["4. Finalidades del tratamiento","Los datos son tratados para:\n- Prestar el servicio de inteligencia regulatoria ambiental.\n- Gestionar la relación comercial con la organización suscriptora.\n- Enviar notificaciones sobre vencimientos y actualizaciones normativas.\n- Generar informes de cumplimiento.\n- Cumplir obligaciones legales y contractuales.\n- Mejorar la Plataforma mediante análisis agregado y anonimizado."],
    ["5. Transferencias internacionales","ENARA Consulting S.A.S. transfiere datos a:\n- Supabase Inc. (EE.UU./Brasil) — Almacenamiento y autenticación\n- Anthropic PBC (EE.UU.) — Procesamiento de lenguaje natural\n- Vercel Inc. (EE.UU.) — Hospedaje de la aplicación\n- Resend Inc. (EE.UU.) — Envío de correos electrónicos\n\nEstas transferencias cumplen con el Art. 26 de la Ley 1581 de 2012. El titular consiente expresamente al aceptar los términos de uso."],
    ["6. Derechos del titular","Conforme al Art. 8, Ley 1581/2012:\n- Conocer, actualizar y rectificar sus datos personales.\n- Solicitar prueba de la autorización otorgada.\n- Ser informado sobre el uso dado a sus datos.\n- Presentar quejas ante la SIC.\n- Revocar la autorización y/o solicitar la supresión.\n- Acceder gratuitamente a sus datos.\n\nContacto: info@enaraconsulting.com.co\nPlazos: 10 días hábiles (consultas) · 15 días hábiles (reclamos)."],
    ["7. Conservación de los datos","Los datos se conservan durante la vigencia de la relación contractual y el período adicional exigido por ley. Después, se eliminan o anonimizan en máximo 90 días calendario."],
    ["8. Seguridad de la información","Medidas implementadas:\n- Cifrado en tránsito (HTTPS/TLS) y en reposo (AES-256).\n- Control de acceso basado en roles (RBAC) con aislamiento por organización.\n- Autenticación mediante tokens JWT con expiración automática.\n- Registro de auditoría de accesos y operaciones críticas.\n- Row Level Security (RLS) para aislamiento entre organizaciones."],
    ["9. Cookies y tecnologías similares","La Plataforma utiliza localStorage exclusivamente para la sesión del usuario. No utilizamos cookies de rastreo ni tecnologías de seguimiento publicitario."],
    ["10. Modificaciones","ENARA Consulting S.A.S. se reserva el derecho de modificar esta política. Las modificaciones serán notificadas con al menos 15 días de anticipación. El uso continuado constituye aceptación."],
    ["11. Autoridad de supervisión","Superintendencia de Industria y Comercio (SIC)\nCarrera 13 No. 27-00, Bogotá D.C.\nwww.sic.gov.co · Línea: 601 587 0000"]
  ];
  return <div style={{minHeight:"100vh",background:L.bg,fontFamily:"'Poppins','Segoe UI',sans-serif",color:L.text}}>
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}`}</style>
    <div style={{borderBottom:`1px solid ${L.border}`,padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:L.bg,zIndex:10}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:32,height:32,borderRadius:8,background:"linear-gradient(135deg,#00c9a7,#0a9e82)",display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#060c14",fontWeight:800,fontSize:14}}>V</span></div>
        <div><div style={{fontSize:15,fontWeight:800,letterSpacing:"-0.03em"}}>VIGÍA</div><div style={{fontSize:9,color:L.textMuted,textTransform:"uppercase",letterSpacing:"0.1em"}}>ENARA Consulting</div></div>
      </div>
      <a href="/" style={{fontSize:12,color:L.primary,textDecoration:"none",fontWeight:600}}>← Volver al inicio</a>
    </div>
    <div style={{maxWidth:780,margin:"0 auto",padding:"48px 32px 80px"}}>
      <div style={{marginBottom:40}}><h1 style={{fontSize:28,fontWeight:700,margin:"0 0 8px",letterSpacing:"-0.02em"}}>Política de Tratamiento de Datos Personales</h1><p style={{fontSize:13,color:L.textMuted,margin:0}}>VIGÍA by ENARA Consulting S.A.S. · Versión 1.0 · Vigente desde abril de 2026</p></div>
      {S.map(([t,c])=><div key={t} style={{marginBottom:32}}><h2 style={{fontSize:15,fontWeight:700,color:L.primary,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${L.border}`}}>{t}</h2><div style={{fontSize:13,color:L.textSec,lineHeight:1.9,whiteSpace:"pre-line"}}>{c}</div></div>)}
      <div style={{marginTop:48,paddingTop:24,borderTop:`1px solid ${L.border}`,fontSize:11,color:L.textMuted,textAlign:"center",lineHeight:1.8}}>ENARA Consulting S.A.S. · Barranquilla, Atlántico, Colombia<br/>info@enaraconsulting.com.co · +57 314 330 4008 / +57 320 277 3972<br/>www.enaraconsulting.com.co</div>
    </div>
  </div>;
}

export default function VIGIAApp() {
const isDemoMode = typeof window !== "undefined" && (window.location.pathname==="/demo" || window.location.search.includes("demo=true"));
const isPrivacidadPage = typeof window !== "undefined" && window.location.pathname==="/privacidad";
const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [userOrgRole, setUserOrgRole] = useState(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const applyOrgContext = ({ org, role, isSuperAdmin: superFlag }) => {
    if(org) setClientOrg(org);
    if(role !== undefined) setUserOrgRole(role||null);
    if(typeof superFlag === "boolean") setIsSuperAdmin(superFlag);
  };

  const applyDemoState = (sess) => {
    setSession(sess);
    setClientOrg(DEMO_DATA.org);
    setInstruments(DEMO_DATA.instruments);
    setObligations(DEMO_DATA.obligations);
    setAlerts(DEMO_DATA.alerts);
    setNormSources([]);
    setDbStatus("connected");
    setUserOrgRole("editor");
    setAuthLoading(false);
    setLastSync(new Date());
  };
  const DEMO_FALLBACK_SESSION = { access_token:SB_KEY, user:{id:"demo-user",email:"demo@vigia.co"}, expires_at:9999999999, refresh_token:"demo" };

  useEffect(()=>{
    if(isDemoMode) {
      sbLogin("demo@vigia.co","Vigia2026!").then(result => {
        if(result?.ok && result.session?.access_token) {
          applyDemoState(result.session);
        } else {
          applyDemoState(DEMO_FALLBACK_SESSION);
        }
      }).catch(() => applyDemoState(DEMO_FALLBACK_SESSION));
      return;
    }
    sbGetSession().then(async s=>{
      setSession(s);
      setAuthLoading(false);
      if(s?.access_token) {
        const ctx = await fetchOrgContext(s.access_token);
        applyOrgContext(ctx);
      }
    });
  },[]);

  const handleLogout = () => { logAudit("logout",null,null,{}); sbLogout(); setSession(null); };

  const logAudit = async (action, entityType, entityId, details={}) => {
    if(isDemoMode || !session?.access_token) return;
    try {
      await fetch(`${SB_URL}/rest/v1/audit_log`,{method:"POST",headers:{apikey:SB_KEY,Authorization:`Bearer ${session.access_token}`,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({org_id:clientOrg?.id||null,user_id:session?.user?.id||null,user_email:session?.user?.email||null,action,entity_type:entityType||null,entity_id:entityId?String(entityId):null,details})});
    } catch { /* silencio */ }
  };

  const [view, setView] = useState("dashboard");
const [selectedEDI, setSelectedEDI] = useState(null);
const [instruments, setInstruments] = useState([]);
const [obligations, setObligations] = useState([]);
const [alerts, setAlerts] = useState([]);
const [normSources, setNormSources] = useState([]);
const [oversight, setOversight] = useState([]);
const [orgProfile, setOrgProfile] = useState(null);
const [complianceAlerts, setComplianceAlerts] = useState([]);
const [dbStatus, setDbStatus] = useState("demo");
const [clientOrg, setClientOrg] = useState(null);
const [lastSync, setLastSync] = useState(null);
const [botInput, setBotInput] = useState("");
const [botMessages, setBotMessages] = useState([{role:"system",text:"VIGÍA activo. Selecciona fuentes y escribe tu consulta."}]);
const [botLoading, setBotLoading] = useState(false);
const [botHistory, setBotHistory] = useState([]);
const [botHistoryOpen, setBotHistoryOpen] = useState(false);
const [globalSearch, setGlobalSearch] = useState("");
const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
const [copiedMsgIndex, setCopiedMsgIndex] = useState(null);
const [dashboardView, setDashboardView] = useState("resumen");
const [demoQueriesLeft, setDemoQueriesLeft] = useState(isDemoMode ? Math.max(0, 3 - parseInt(localStorage.getItem("vigia_demo_queries")||"0")) : 3);
const [showOnboarding, setShowOnboarding] = useState(false);
const [onboardingStep, setOnboardingStep] = useState(1);
const [sidebarOpen, setSidebarOpen] = useState(false);
const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
useEffect(()=>{
  const h = () => setIsMobile(window.innerWidth < 768);
  window.addEventListener("resize", h);
  return () => window.removeEventListener("resize", h);
}, []);
const [sources, setSources] = useState({documentos:true,normativa:true,jurisprudencia:true,pedagogico:false,validacion:false});
const [ediSearch, setEdiSearch] = useState("");
const [ediFilter, setEdiFilter] = useState("todos");
const [selectedNorm, setSelectedNorm] = useState(null);
const [normArticles, setNormArticles] = useState({});
const [normScopeFilter, setNormScopeFilter] = useState("todos");
// --- Modo Consultor ENARA (SuperAdmin) ---
const [consultorOrgList, setConsultorOrgList] = useState([]);
const [consultorOrgId, setConsultorOrgId] = useState(null);
const [consultorOrg, setConsultorOrg] = useState(null);
const [consultorInstruments, setConsultorInstruments] = useState([]);
const [consultorObligations, setConsultorObligations] = useState([]);
const [consultorDocuments, setConsultorDocuments] = useState([]);
const [consultorLoading, setConsultorLoading] = useState(false);
const [consultorBotInput, setConsultorBotInput] = useState("");
const [consultorBotMessages, setConsultorBotMessages] = useState([{role:"system",text:"Modo Consultor ENARA. Selecciona un cliente para empezar."}]);
const [consultorBotLoading, setConsultorBotLoading] = useState(false);
const [consultorFilter, setConsultorFilter] = useState("all"); // all | vigia_subscriber | enara_consulting
const [consultorEditingType, setConsultorEditingType] = useState(false);
const [consultorNotes, setConsultorNotes] = useState([]);
const [consultorNoteInput, setConsultorNoteInput] = useState("");
const [consultorNoteLoading, setConsultorNoteLoading] = useState(false);
const [consultorNoteTags, setConsultorNoteTags] = useState([]);
const [consultorMetrics, setConsultorMetrics] = useState([]);
const [exportMenu, setExportMenu] = useState(null); // null | "conv" | messageIndex
useEffect(() => {
  if (exportMenu === null) return;
  const close = () => setExportMenu(null);
  document.addEventListener("click", close);
  return () => document.removeEventListener("click", close);
}, [exportMenu]);

const generateCompliancePDF = () => {
  const now=new Date();
  const fecha=now.toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"});
  const hora=now.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit"});
  const total=obligations.length;
  const vencidas=obligations.filter(o=>derivedStatus(o)==="vencido").length;
  const proximas=obligations.filter(o=>derivedStatus(o)==="proximo").length;
  const alDia=obligations.filter(o=>derivedStatus(o)==="al_dia").length;
  const cumpl=total>0?Math.round((alDia/total)*100):100;
  const cColor=cumpl>=80?"#22c55e":cumpl>=50?"#f97316":"#ef4444";
  const edisRows=instruments.map(i=>`<tr><td>${i.title||i.number||"\u2014"}</td><td>${(i.instrument_type||"").replace(/_/g," ")}</td><td>${i.authority_name||"\u2014"}</td><td>${i.edi_status||"\u2014"}</td><td>${i.expiry_date?new Date(i.expiry_date).toLocaleDateString("es-CO"):"\u2014"}</td></tr>`).join("");
  const obsRows=[...obligations].sort((a,b)=>new Date(a.due_date||0)-new Date(b.due_date||0)).map(ob=>{
    const ds=derivedStatus(ob);const days=ob.due_date?Math.ceil((new Date(ob.due_date)-now)/86400000):null;
    const sl=ds==="vencido"?`VENCIDA hace ${Math.abs(days)}d`:ds==="proximo"?`${days}d restantes`:ds==="al_dia"?"Al d\u00eda":ds||"\u2014";
    const sc=ds==="vencido"?"#ef4444":ds==="proximo"?"#f97316":ds==="al_dia"?"#22c55e":"#94a3b8";
    const edi=instruments.find(i=>i.id===ob.instrument_id);
    return `<tr><td>${ob.obligation_num||"\u2014"}</td><td>${ob.name||"\u2014"}</td><td>${edi?.title||edi?.number||"\u2014"}</td><td>${ob.due_date?new Date(ob.due_date).toLocaleDateString("es-CO"):"\u2014"}</td><td style="color:${sc};font-weight:600">${sl}</td></tr>`;
  }).join("");
  const orgName=clientOrg?.name||"Organizaci\u00f3n";
  const sector=clientOrg?.sector?clientOrg.sector.charAt(0).toUpperCase()+clientOrg.sector.slice(1):"";
  const ubicacion=[clientOrg?.ciudad,clientOrg?.departamento].filter(Boolean).join(", ");
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Informe de Cumplimiento \u2014 ${orgName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#1e293b;font-size:11px;line-height:1.5}.header{background:#060c14;color:white;padding:24px 32px;display:flex;align-items:center;justify-content:space-between}.logo{font-size:22px;font-weight:800;letter-spacing:-0.03em;color:#00c9a7}.logo-sub{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em}.hr{text-align:right;font-size:10px;color:#94a3b8}.content{padding:28px 32px}.title{font-size:18px;font-weight:700;margin-bottom:4px}.subtitle{font-size:11px;color:#64748b;margin-bottom:24px}.metrics{display:flex;gap:12px;margin-bottom:24px}.metric{flex:1;padding:14px 16px;border:1px solid #e2e8f0;border-radius:8px;text-align:center}.mv{font-size:26px;font-weight:800}.ml{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px}.green{color:#22c55e}.red{color:#ef4444}.yellow{color:#f97316}.primary{color:#00c9a7}.st{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:12px;margin-top:24px}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#f8fafc;padding:7px 10px;text-align:left;font-weight:700;color:#475569;font-size:9px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #e2e8f0}td{padding:7px 10px;border-bottom:1px solid #f1f5f9;color:#334155}.bbg{height:8px;background:#f1f5f9;border-radius:4px;margin:8px 0;overflow:hidden}.bfill{height:100%;background:${cColor};border-radius:4px;width:${cumpl}%}.disc{margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;line-height:1.6}.footer{background:#f8fafc;padding:12px 32px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.nb{page-break-inside:avoid}}</style></head><body><div class="header"><div><div class="logo">VIG\u00cdA</div><div class="logo-sub">Inteligencia Regulatoria Ambiental \u00b7 ENARA Consulting</div></div><div class="hr"><div style="font-weight:700;color:#fff;font-size:12px">Informe de Cumplimiento</div><div>${fecha} \u00b7 ${hora}</div></div></div><div class="content"><div class="title">${orgName}</div><div class="subtitle">${sector}${ubicacion?` \u00b7 ${ubicacion}`:""}</div><div class="metrics nb"><div class="metric"><div class="mv primary">${instruments.length}</div><div class="ml">EDIs activos</div></div><div class="metric"><div class="mv">${total}</div><div class="ml">Obligaciones</div></div><div class="metric"><div class="mv red">${vencidas}</div><div class="ml">Vencidas</div></div><div class="metric"><div class="mv yellow">${proximas}</div><div class="ml">Pr\u00f3ximas</div></div><div class="metric"><div class="mv green">${alDia}</div><div class="ml">Al d\u00eda</div></div><div class="metric"><div class="mv" style="color:${cColor}">${cumpl}%</div><div class="ml">Cumplimiento</div></div></div><div class="nb" style="margin-bottom:20px"><div style="display:flex;justify-content:space-between;font-size:10px;color:#64748b;margin-bottom:4px"><span>Tasa de cumplimiento</span><span style="font-weight:700;color:${cColor}">${cumpl}%</span></div><div class="bbg"><div class="bfill"></div></div></div><div class="st">Expedientes Digitales Inteligentes (EDIs)</div><table><thead><tr><th>EDI</th><th>Tipo</th><th>Autoridad</th><th>Estado</th><th>Vencimiento</th></tr></thead><tbody>${edisRows||'<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Sin EDIs</td></tr>'}</tbody></table><div class="st">Obligaciones ambientales</div><table><thead><tr><th>C\u00f3digo</th><th>Obligaci\u00f3n</th><th>EDI</th><th>Fecha l\u00edmite</th><th>Estado</th></tr></thead><tbody>${obsRows||'<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">Sin obligaciones</td></tr>'}</tbody></table><div class="disc">Este informe fue generado autom\u00e1ticamente por VIG\u00cdA \u00b7 ENARA Consulting S.A.S. La informaci\u00f3n refleja el estado registrado a la fecha de generaci\u00f3n. No constituye certificaci\u00f3n oficial.<br><br>info@enaraconsulting.com.co \u00b7 +57 314 330 4008 \u00b7 www.enaraconsulting.com.co</div></div><div class="footer"><span>VIG\u00cdA \u00b7 ENARA Consulting</span><span>${orgName} \u00b7 ${fecha}</span></div></body></html>`;
  const win=window.open("","_blank","width=900,height=700");
  if(!win){alert("Permite ventanas emergentes para generar el PDF.");return;}
  win.document.write(html);win.document.close();
  win.onload=()=>setTimeout(()=>{win.focus();win.print();},500);
};

const runExport = (format, singleMessageIndex = null) => {
  const items = buildExportItems(botMessages, singleMessageIndex);
  if (items.length === 0) { alert("No hay respuestas para exportar todavía."); return; }
  const payload = { items, orgName: clientOrg?.name || "", isFullConversation: singleMessageIndex === null };
  try {
    if (format === "md") exportAsMarkdownFile(payload);
    else if (format === "txt") exportAsTxtFile(payload);
    else if (format === "pdf") exportAsPdf(payload);
    else if (format === "doc") exportAsWord(payload);
  } catch (e) { alert("Error exportando: " + e.message); }
  setExportMenu(null);
};

const loadNormArticles = async (norm_id) => {
  if (!norm_id || normArticles[norm_id]) return;
  try {
    const t = session?.access_token || SB_KEY;
    const arts = await sb("normative_articles", `norm_id=eq.${norm_id}&select=id,article_number,article_label,title,chapter,content,order_index&order=order_index.asc`, t);
    setNormArticles(p => ({ ...p, [norm_id]: Array.isArray(arts) ? arts : [] }));
  } catch(e) { console.log("loadNormArticles error", e); }
};

useEffect(() => { if (selectedNorm) loadNormArticles(selectedNorm); }, [selectedNorm]);

useEffect(()=>{
if(isDemoMode) return;
const tryConnect = async () => {
try {
const t=session?.access_token||SB_KEY;
const [inst,obs,alrt,norms,ovs]=await Promise.all([sb("instruments","select=*&order=created_at.desc",t),sb("obligations","select=*&order=due_date.asc",t),sb("regulatory_alerts","select=*&order=norm_date.desc",t),sb("normative_sources","select=*&is_active=eq.true",t),sb("oversight_log","select=*&status=eq.activo&order=created_at.desc",t)]);
// Load data regardless of count
          setInstruments(Array.isArray(inst)?inst:[]);
          setObligations(Array.isArray(obs)?obs:[]);
          setAlerts(Array.isArray(alrt)?alrt:[]);
          setNormSources(Array.isArray(norms)?norms:[]);
          setOversight(Array.isArray(ovs)?ovs:[]);
          // ORG-5: fetch org_profile para el Dashboard
          if (clientOrg?.id) {
            try {
              const op = await sb("org_profile", `select=*&org_id=eq.${clientOrg.id}&limit=1`, t);
              if (Array.isArray(op) && op[0]) setOrgProfile(op[0]);
            } catch(e) { console.log("org_profile fetch silenced:", e); }
            try {
              const cm = await sb("compliance_matrix", `select=*&org_id=eq.${clientOrg.id}&alert_level=neq.OK&order=alert_level&limit=20`, t);
              setComplianceAlerts(Array.isArray(cm) ? cm : []);
            } catch(e) { console.log("compliance_matrix fetch silenced:", e); }
          }
          setDbStatus("connected");
          setLastSync(new Date());
          if(!isDemoMode && !localStorage.getItem("vigia_onboarded") && (!Array.isArray(inst) || inst.length===0)) {
            setShowOnboarding(true);
          }
          // Fetch client org via edge function (no service_role en browser)
          if(session?.access_token) {
            const ctx = await fetchOrgContext(session.access_token);
            applyOrgContext(ctx);
          }
} catch { setDbStatus("demo"); }
};
if(session) tryConnect();
},[session]);

const refetchClientOrg = async () => {
  if(!session?.access_token) return;
  try {
    const ctx = await fetchOrgContext(session.access_token);
    applyOrgContext(ctx);
  } catch(e) {}
};

const refreshDashboardData = async () => {
  if(!session?.access_token) return;
  try {
    const t = session.access_token;
    const [inst, obs] = await Promise.all([
      sb("instruments", "select=*&order=created_at.desc", t),
      sb("obligations", "select=*&order=due_date.asc", t),
    ]);
    if(Array.isArray(inst)) setInstruments(inst);
    if(Array.isArray(obs)) setObligations(obs);
    setLastSync(new Date());
  } catch(e) { console.log("refreshDashboardData silenced:", e); }
};

// --- Modo Consultor ENARA ---
const loadConsultorOrgList = async () => {
  if(!session?.access_token || !isSuperAdmin) return;
  try {
    const data = await callEdge("superadmin-api", { op: "list-overview" }, session.access_token);
    const orgs = Array.isArray(data?.orgs) ? data.orgs : [];
    setConsultorOrgList(orgs);
  } catch(e) { console.log("loadConsultorOrgList error:", e); }
};

const selectConsultorOrg = async (orgId) => {
  setConsultorEditingType(false);
  if(!orgId) {
    setConsultorOrgId(null); setConsultorOrg(null);
    setConsultorInstruments([]); setConsultorObligations([]); setConsultorDocuments([]);
    setConsultorNotes([]); setConsultorNoteInput(""); setConsultorNoteTags([]); setConsultorMetrics([]);
    setConsultorBotMessages([{role:"system",text:"Modo Consultor ENARA. Selecciona un cliente para empezar."}]);
    return;
  }
  setConsultorLoading(true); setConsultorOrgId(orgId);
  try {
    const data = await callEdge("superadmin-api", { op: "list-org-context", payload: { org_id: orgId } }, session.access_token);
    setConsultorOrg(data?.org || null);
    setConsultorInstruments(Array.isArray(data?.instruments) ? data.instruments : []);
    setConsultorObligations(Array.isArray(data?.obligations) ? data.obligations : []);
    setConsultorDocuments(Array.isArray(data?.documents) ? data.documents : []);
    setConsultorBotMessages([{role:"system",text:`Cliente activo: ${data?.org?.name || "(sin nombre)"} · ${(data?.instruments||[]).length} EDIs · ${(data?.obligations||[]).length} obligaciones`}]);
    try {
      const notesData = await callEdge("superadmin-api", { op: "list-client-notes", payload: { org_id: orgId } }, session.access_token);
      setConsultorNotes(Array.isArray(notesData?.notes) ? notesData.notes : []);
    } catch(e) { setConsultorNotes([]); console.log("list-client-notes silenced:", e); }
    try {
      const mr = await fetch(`${SB_URL}/rest/v1/bot_queries?org_id=eq.${orgId}&select=id,created_at,tokens_used&order=created_at.desc&limit=100`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}` } });
      const md = await mr.json();
      setConsultorMetrics(Array.isArray(md) ? md : []);
    } catch(e) { setConsultorMetrics([]); }
  } catch(e) {
    setConsultorBotMessages([{role:"system",text:"Error cargando contexto del cliente: "+(e.message||e)}]);
  }
  setConsultorLoading(false);
};

const updateConsultorClientType = async (newType) => {
  if(!consultorOrgId || !newType || !session?.access_token) return;
  try {
    await callEdge("superadmin-api", { op: "update-client-type", payload: { org_id: consultorOrgId, client_type: newType } }, session.access_token);
    setConsultorOrg(p => p ? {...p, client_type: newType} : p);
    setConsultorOrgList(list => list.map(o => o.id === consultorOrgId ? {...o, client_type: newType} : o));
    setConsultorEditingType(false);
  } catch(e) { alert("No se pudo actualizar el tipo: " + (e.message||e)); }
};

const saveConsultorNote = async () => {
  if(!consultorOrgId || !consultorNoteInput.trim() || consultorNoteLoading) return;
  setConsultorNoteLoading(true);
  try {
    const res = await callEdge("superadmin-api", { op: "save-client-note", payload: { org_id: consultorOrgId, content: consultorNoteInput.trim(), tags: consultorNoteTags, author_id: session?.user?.id || null } }, session.access_token);
    if(res?.note) {
      setConsultorNotes(p => [res.note, ...p]);
      setConsultorNoteInput(""); setConsultorNoteTags([]);
    }
  } catch(e) { alert("No se pudo guardar la nota: " + (e.message||e)); }
  setConsultorNoteLoading(false);
};

const sendConsultorBot = async () => {
  if(!consultorBotInput.trim() || consultorBotLoading || !consultorOrgId || !consultorOrg) return;
  const userMsg = { role:"user", text: consultorBotInput };
  setConsultorBotMessages(p=>[...p, userMsg]); setConsultorBotInput(""); setConsultorBotLoading(true);
  const overdueC = consultorObligations.filter(o=>derivedStatus(o)==="vencido").length;
  const upcomingC = consultorObligations.filter(o=>derivedStatus(o)==="proximo").length;
  const systemPrompt = `Eres VIGÍA actuando como asistente legal junior de ENARA Consulting.
Estás analizando el caso del cliente: ${consultorOrg.name} (NIT: ${consultorOrg.nit||"sin registrar"}).
Sector: ${consultorOrg.sector || "no especificado"}.
Tier: ${consultorOrg.tier || consultorOrg.plan || "—"}.
EDIs activos: ${consultorInstruments.length}.
Obligaciones vigentes: ${consultorObligations.length} (${overdueC} vencidas, ${upcomingC} próximas).

Tu rol: apoyar al equipo de ENARA con análisis jurídico rápido,
identificación de riesgos de compliance y recomendaciones específicas
para este cliente. Responde en español colombiano formal.
Cita siempre la norma exacta con artículo.
Cuando detectes un riesgo de compliance, destácalo claramente.`;
  const previousMessages = consultorBotMessages.filter(m=>m.role==="user"||m.role==="assistant").map(m=>({role:m.role,content:m.text}));
  try {
    const res = await fetch(`${SB_URL}/functions/v1/chat-bot`, {
      method:"POST",
      headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||SB_KEY}`, apikey:SB_KEY },
      body: JSON.stringify({ systemPrompt, userMessage: userMsg.text, previousMessages, override_org_id: consultorOrgId })
    });
    const data = await res.json();
    if(!res.ok || !data.reply) throw new Error(data.error || `Error ${res.status}`);
    const botSources = Array.isArray(data.sources) ? data.sources : [];
    setConsultorBotMessages(p=>[...p, { role:"assistant", text: data.reply, sources: botSources, capas: data.capas||null }]);
  } catch(e) {
    setConsultorBotMessages(p=>[...p, { role:"assistant", text:"Error: "+(e.message||"No fue posible procesar la consulta."), layers:"" }]);
  }
  setConsultorBotLoading(false);
};

useEffect(()=>{ if(view==="consultor-enara" && isSuperAdmin && consultorOrgList.length===0) loadConsultorOrgList(); }, [view, isSuperAdmin]);

const fetchBotHistory = async () => {
  if(!session?.access_token) return;
  const orgId = (isSuperAdmin && consultorOrg) ? consultorOrg.id : clientOrg?.id;
  if(!orgId) return;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/bot_queries?org_id=eq.${orgId}&select=id,query_text,response_text,created_at,sources_cited,tokens_used&order=created_at.desc&limit=20`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${session.access_token}` } }
    );
    const data = await r.json();
    setBotHistory(Array.isArray(data) ? data : []);
  } catch(e) { console.log("bot history silenced", e); }
};

useEffect(()=>{ if(view==="consultar" && session) fetchBotHistory(); }, [view, session, clientOrg?.id]);

useEffect(()=>{ if(view==="orgprofile" && session) refetchClientOrg(); },[view]);

useEffect(()=>{
  if(!session?.refresh_token) return;
  const tick = async () => {
    const now = Date.now()/1000;
    if(session.expires_at && session.expires_at - now < 300) {
      const refreshed = await sbRefresh(session.refresh_token);
      if(refreshed) setSession(refreshed);
      else { sbLogout(); setSession(null); }
    }
  };
  tick();
  const id = setInterval(tick, 240000);
  return () => clearInterval(id);
},[session?.refresh_token, session?.expires_at]);

useEffect(()=>{
  if(!session?.refresh_token || isDemoMode) return;
  const h = async () => {
    if(document.visibilityState!=="visible") return;
    const now = Math.floor(Date.now()/1000);
    if(session.expires_at && session.expires_at - now < 300) {
      const refreshed = await sbRefresh(session.refresh_token);
      if(refreshed) setSession(refreshed);
      else { sbLogout(); setSession(null); }
    }
  };
  document.addEventListener("visibilitychange",h);
  return ()=>document.removeEventListener("visibilitychange",h);
},[session?.refresh_token, session?.expires_at]);

// Deriva el estado efectivo de una obligación desde due_date + days_alert_before.
// Respeta estados finales (cumplido/suspendido/no_aplica) y el legacy "vencido"
// si alguien ya lo fijó manualmente. Para el resto, calcula en tiempo real.
const DERIVED_FINAL_STATUSES = ["cumplido","suspendido","no_aplica"];
const derivedStatus = (ob) => {
  if(!ob) return "al_dia";
  if(DERIVED_FINAL_STATUSES.includes(ob.status)) return ob.status;
  if(!ob.due_date) return ob.status==="vencido" ? "vencido" : "al_dia";
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(ob.due_date); due.setHours(0,0,0,0);
  if(isNaN(due.getTime())) return ob.status || "al_dia";
  const daysUntil = Math.ceil((due - today) / 86400000);
  if(daysUntil < 0) return "vencido";
  if(daysUntil <= (ob.days_alert_before || 30)) return "proximo";
  return "al_dia";
};
const overdue=obligations.filter(o=>derivedStatus(o)==="vencido").length;
const upcoming=obligations.filter(o=>derivedStatus(o)==="proximo").length;
const compliant=obligations.filter(o=>derivedStatus(o)==="al_dia").length;
const unreadAlerts=alerts.filter(a=>!a.human_validated).length;
const ediHealth=(inst)=>{ const obs=obligations.filter(o=>o.instrument_id===inst.id); if(obs.some(o=>derivedStatus(o)==="vencido"))return"critico"; if(obs.some(o=>derivedStatus(o)==="proximo"))return"moderado"; return"al_dia"; };
const ediObs=(id)=>obligations.filter(o=>o.instrument_id===id);
const toggleSource=(k)=>setSources(p=>({...p,[k]:!p[k]}));
const conf=()=>{ const a=Object.values(sources).filter(Boolean).length; if(a===0)return{label:"Sin fuentes",color:C.red,risk:"ROJO"}; if(sources.validacion)return{label:"Maxima precision con revision humana",color:C.green,risk:"VERDE"}; if(sources.documentos&&sources.normativa&&sources.jurisprudencia)return{label:"Alta precision - riesgo bajo",color:C.green,risk:"VERDE"}; if(sources.documentos&&sources.normativa)return{label:"Precision moderada",color:C.yellow,risk:"AMARILLO"}; return{label:"Precision limitada",color:C.yellow,risk:"AMARILLO"}; };

const handleNewAlert = async (analysisResult) => {
  const uiExtras = { fuente_norma: analysisResult.norma_data, proposed_changes: analysisResult.proposed_changes || [] };
  const dbAlert = {
    norm_title: analysisResult.subject,
    norm_type: analysisResult.norma_data?.tipo_norma?.toLowerCase() || "resolucion",
    norm_date: analysisResult.doc_date || new Date().toISOString().split("T")[0],
    issuing_authority: analysisResult.sender,
    impact_type: analysisResult.proposed_changes?.length > 0 ? "derogatoria" : "interpretativa",
    urgency: analysisResult.urgency === "critica" ? "critica" : analysisResult.urgency === "moderada" ? "moderada" : "informativa",
    summary: analysisResult.content_summary,
    detailed_analysis: analysisResult.norma_data?.articulos_relevantes?.join(". ") || "",
    suggested_action: "Revisar los cambios propuestos y aplicar los que correspondan.",
    confidence_pct: analysisResult.candidate_confidence,
    human_validated: false
  };
  try {
    const { row: saved } = await callEdge("publish-intel", { kind: "alert", data: dbAlert }, session?.access_token);
    if(!saved?.id) throw new Error("respuesta sin id");
    setAlerts(p => [{...saved, ...uiExtras}, ...p]);
  } catch(e) {
    console.log("handleNewAlert persist error", e);
    alert("No se pudo guardar la alerta en Supabase: "+(e.message||e));
  }
};

const handleNewNorm = async (analysisResult) => {
  if (!analysisResult.norma_data) return;
  const dbNorm = {
    norm_type: analysisResult.norma_data.tipo_norma?.toLowerCase() || "resolucion",
    norm_number: analysisResult.norma_data.numero || "",
    norm_title: analysisResult.subject,
    issuing_body: analysisResult.norma_data.autoridad_emisora || analysisResult.sender,
    issue_date: analysisResult.norma_data.fecha_expedicion || analysisResult.doc_date || null,
    is_active: true
  };
  try {
    const { row: saved } = await callEdge("publish-intel", { kind: "norm", data: dbNorm }, session?.access_token);
    if(!saved?.id) throw new Error("respuesta sin id");
    setNormSources(p => [saved, ...p]);
  } catch(e) {
    console.log("handleNewNorm persist error", e);
    alert("No se pudo guardar la norma en Supabase: "+(e.message||e));
  }
};

const sendBot=async()=>{
if(!botInput.trim()||botLoading)return;
const userMsg={role:"user",text:botInput};
setBotMessages(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
if(isDemoMode) {
  const demoCount = parseInt(localStorage.getItem("vigia_demo_queries")||"0");
  if(demoCount >= 3) {
    setTimeout(()=>{
      setBotMessages(p=>[...p,{role:"assistant",text:"**Has usado tus 3 consultas de demo.**\n\nEn tu sesión de prueba ya pudiste ver el motor RAG de VIGÍA consultando 365 normas y 147 sentencias con trazabilidad jurídica real.\n\n¿Quieres acceso completo para tu organización?\n\n**ENARA Consulting**\n- info@enaraconsulting.com.co\n- +57 314 330 4008 / +57 320 277 3972",sources:[]}]);
      setBotLoading(false);
    },600);
    return;
  }
  localStorage.setItem("vigia_demo_queries", String(demoCount+1));
  setDemoQueriesLeft(Math.max(0, 2-demoCount));
}
const layers=Object.entries(sources).filter(([,v])=>v).map(([k])=>({documentos:"Capa 1",normativa:"Capa 2a - Normativa",jurisprudencia:"Capa 2b - Jurisprudencia",pedagogico:"Capa 2c - Pedagógica",validacion:"Capa 3 - Validacion humana"}[k])).join(", ");
const obsCtx=obligations.map(o=>`${o.obligation_num||o.num} - ${o.name} (${o.status}, vence ${o.due_date})`).join("; ");
const normCtx=normSources.map(n=>`${n.norm_type} ${n.norm_number}: ${n.norm_title}`).join("; ");
const systemPrompt=`Eres VIGÍA, asistente de inteligencia regulatoria ambiental colombiana${clientOrg?.name?` de ${clientOrg.name}`:""}.\nFuentes activas: ${layers}.\nObligaciones: ${obsCtx}.\nNormativa: ${normCtx}.\nResponde en español colombiano formal. Cita fuentes con [Fuente: X]. No inventes normas.`;
const previousMessages = botMessages.filter(m=>m.role==="user"||m.role==="assistant").map(m=>({role:m.role,content:m.text}));
try {
const res=await fetch(`${SB_URL}/functions/v1/chat-bot`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${session?.access_token||SB_KEY}`,apikey:SB_KEY},body:JSON.stringify({systemPrompt,userMessage:userMsg.text,previousMessages,include_pedagogico:sources.pedagogico})});
if(res.status===429) { const d=await res.json(); setBotMessages(p=>[...p,{role:"assistant",text:`\u23f1\ufe0f ${d.error||"Límite de consultas alcanzado. Intenta en unos minutos."}`,sources:[]}]); setBotLoading(false); return; }
const data=await res.json();
if(!res.ok||!data.reply) throw new Error(data.error||`Error ${res.status}`);
const reply=data.reply;
const botSources=Array.isArray(data.sources)?data.sources:[];
setBotMessages(p=>[...p,{role:"assistant",text:reply,layers,sources:botSources,capas:data.capas||null}]);
logAudit("consulta_bot","bot_query",null,{query_length:userMsg.text.length,sources_count:botSources.length});
if(clientOrg?.id && session?.access_token) {
  try { await sbInsert("bot_queries",{org_id:clientOrg.id,query_text:userMsg.text,active_layers:sources,response_text:reply,tokens_used:(data.tokens_in||0)+(data.tokens_out||0),sources_cited:botSources.map(s=>({article_id:s.article_id,norm_id:s.norm_id,similarity:s.similarity}))},session.access_token); } catch(e){ console.log("bot_queries save error", e); }
}
} catch(e) { setBotMessages(p=>[...p,{role:"assistant",text:"Error: "+(e.message||"No fue posible procesar la consulta."),layers:""}]); }
setBotLoading(false);
};

const copyBotResponse = (msgIndex) => {
  const userMsg = botMessages.slice(0, msgIndex).reverse().find(m => m.role === "user");
  const msg = botMessages[msgIndex];
  if(!msg || msg.role !== "assistant") return;
  const date = new Date().toLocaleDateString("es-CO",{day:"numeric",month:"long",year:"numeric"});
  const div = "\u2501".repeat(40);
  let srcText = "";
  if(Array.isArray(msg.sources) && msg.sources.length > 0) {
    srcText = "\n\nFUENTES CONSULTADAS:\n" + msg.sources.map((s,i)=>{
      if(s.source_type==="sentencia") return `[${i+1}] ${s.corte||"Sentencia"} ${s.radicado||""}`;
      if(s.source_type==="documento_org") return `[${i+1}] Documento propio: ${s.norm_title||""}`;
      return `[${i+1}] ${s.norm_type||""} ${s.norm_number||""}/${s.norm_year||""} \u2014 ${s.article_label||`Art. ${s.article_number||""}`}`;
    }).join("\n");
  }
  const plain = (msg.text||"").replace(/#{1,6}\s/g,"").replace(/\*\*(.*?)\*\*/g,"$1").replace(/\*(.*?)\*/g,"$1").replace(/`(.*?)`/g,"$1");
  const formatted = [div,`CONSULTA VIG\u00cdA \u2014 ${date}`,`Generado por: VIG\u00cdA \u00b7 Inteligencia Regulatoria Ambiental`,div,"",
    ...(userMsg?[`PREGUNTA:\n${userMsg.text}`,""]:[]),`RESPUESTA:\n${plain}`,srcText,"",div,
    "Nota: Esta consulta es de car\u00e1cter informativo y no constituye asesor\u00eda legal profesional.",
    "VIG\u00cdA \u2014 https://vigia-five.vercel.app",div].join("\n");
  navigator.clipboard?.writeText(formatted).then(()=>{setCopiedMsgIndex(msgIndex);setTimeout(()=>setCopiedMsgIndex(null),2000);});
};

  const isOrgAdmin = userOrgRole === "admin" && !isSuperAdmin;
  const navItems=[{key:"dashboard",icon:BarChart2,label:"Dashboard"},{key:"edis",icon:Layers,label:"Mis EDIs",badge:obligations.filter(o=>derivedStatus(o)==="vencido"||derivedStatus(o)==="proximo").length||0},{key:"inteligencia",icon:TrendingUp,label:"Inteligencia",badge:unreadAlerts},{key:"consultar",icon:MessageSquare,label:"Consultar"},{key:"normativa",icon:BookOpen,label:"Normativa"},{key:"oversight",icon:Shield,label:"Oversight"},{key:"intake",icon:Upload,label:"INTAKE"},...(!isSuperAdmin?[{key:"soporte",icon:MessageSquare,label:"Soporte"}]:[]),...(isOrgAdmin?[{key:"myteam",icon:Users,label:"Mi equipo"},{key:"orgprofile",icon:FileText,label:"Mi organización"}]:[]),...(isSuperAdmin?[{key:"consultor-enara",icon:Scale,label:"Consultor ENARA",sub:consultorOrg?.name||null},{key:"superadmin",icon:Shield,label:"SuperAdmin"}]:[])];

  if(isPrivacidadPage) return <PoliticaPrivacidad/>;
  if(authLoading) return <div style={{height:"100vh",background:"#060c14",display:"flex",alignItems:"center",justifyContent:"center",color:"#00c9a7",fontSize:14}}>Cargando VIGIA...</div>;
  if(!session) return <LoginScreen onLogin={async s => {
    setSession(s);
    if(s?.access_token) {
      const ctx = await fetchOrgContext(s.access_token);
      applyOrgContext(ctx);
    }
  }}/>;

  const hC=(h)=>h==="critico"?C.red:h==="moderado"?C.yellow:C.green;
const hB=(h)=>h==="critico"?C.redDim:h==="moderado"?C.yellowDim:C.greenDim;

const renderDashboard=()=>(
<div style={{padding:28}}>
<div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Panel de cumplimiento</h1><p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>{dbStatus==="connected"?`Sincronizado con Supabase - ${lastSync?.toLocaleTimeString("es-CO")}`:clientOrg ? clientOrg.name : "Panel de cumplimiento"}</p></div><div style={{display:"flex",gap:6,alignItems:"center"}}>{[{k:"resumen",l:"Resumen"},{k:"timeline",l:"Línea de tiempo"},{k:"historico",l:"Histórico"}].map(t=><button key={t.k} onClick={()=>setDashboardView(t.k)} style={{background:dashboardView===t.k?C.primaryDim:"transparent",border:`1px solid ${dashboardView===t.k?C.primary+"66":C.border}`,borderRadius:6,padding:"4px 12px",color:dashboardView===t.k?C.primary:C.textSec,fontSize:11,fontWeight:dashboardView===t.k?700:500,cursor:"pointer",fontFamily:FONT}}>{t.l}</button>)}{(instruments.length>0||obligations.length>0)&&<button onClick={generateCompliancePDF} title="Descargar informe PDF" style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.textSec,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:FONT}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary+"66";e.currentTarget.style.color=C.primary;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSec;}}><Download size={11}/>PDF</button>}</div></div>
{dashboardView==="resumen" && <><div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
<StatCard icon={Layers} label="EDIs activos" value={instruments.length} color={C.primary}/>
<StatCard icon={AlertTriangle} label="Obligaciones vencidas" value={overdue} color={C.red} sub={overdue>0?"Requiere accion inmediata":"Sin vencimientos"}/>
<StatCard icon={Clock} label="Proximas (30 dias)" value={upcoming} color={C.yellow}/>
<StatCard icon={CheckCircle} label="Al dia" value={compliant} color={C.green}/>
</div>
{obligations.length > 0 && (
  <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:12,marginBottom:24}}>
    {/* Compliance rate */}
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"18px 20px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      {(()=>{
        const rate = Math.round((compliant / obligations.length) * 100);
        const color = rate >= 80 ? C.green : rate >= 60 ? C.yellow : C.red;
        return <>
          <div style={{fontSize:36,fontWeight:800,color,lineHeight:1}}>{rate}%</div>
          <div style={{fontSize:11,color:C.textSec,marginTop:6}}>Tasa de cumplimiento</div>
          <div style={{width:"100%",background:C.surfaceEl,borderRadius:4,height:6,marginTop:10}}>
            <div style={{width:`${rate}%`,background:color,borderRadius:4,height:"100%",transition:"width 0.3s"}}/>
          </div>
          <div style={{fontSize:10,color:C.textMuted,marginTop:4}}>{compliant} de {obligations.length} obligaciones al día</div>
        </>;
      })()}
    </div>
    {/* Próximos vencimientos */}
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px"}}>
      <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>Próximos vencimientos</div>
      {(()=>{
        const prox = [...obligations].filter(o=>o.due_date && (derivedStatus(o)==="vencido"||derivedStatus(o)==="proximo")).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)).slice(0,5);
        if(prox.length===0) return <div style={{fontSize:12,color:C.textMuted,padding:"8px 0"}}>Sin vencimientos pendientes.</div>;
        return <div style={{display:"flex",flexDirection:"column",gap:6}}>{prox.map(ob=>{
          const days = Math.ceil((new Date(ob.due_date)-new Date())/86400000);
          const isVenc = days < 0;
          const edi = instruments.find(i=>i.id===ob.instrument_id);
          return <div key={ob.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 8px",background:C.surfaceEl,borderRadius:6}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:isVenc?C.red:C.yellow,flexShrink:0}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ob.name||ob.obligation_num}</div>
              <div style={{fontSize:10,color:C.textMuted}}>{edi?.title||edi?.project_name||"—"}</div>
            </div>
            <span style={{fontSize:10,fontWeight:600,color:isVenc?C.red:C.yellow,flexShrink:0}}>{isVenc?`VENCIDA hace ${Math.abs(days)}d`:`${days}d restantes`}</span>
          </div>;
        })}</div>;
      })()}
    </div>
  </div>
)}
{!isSuperAdmin && userOrgRole!=="viewer" && (
  <div style={{marginTop:0,marginBottom:24,padding:"20px 24px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:700,color:C.text}}>Perfil Regulatorio de su Organización</div>
      {orgProfile?.total_documentos_procesados>0 && <span style={{fontSize:11,color:C.textSec}}>{orgProfile.total_documentos_procesados} documento{orgProfile.total_documentos_procesados!==1?"s":""} procesado{orgProfile.total_documentos_procesados!==1?"s":""} · confianza {Math.round((orgProfile.confianza_perfil||0)*100)}%</span>}
    </div>
    {(!orgProfile||orgProfile.total_documentos_procesados===0)?(
      <div style={{textAlign:"center",padding:"20px 0",color:C.textSec}}>
        <div style={{fontSize:13,marginBottom:8}}>Su perfil regulatorio aún está vacío.</div>
        <div style={{fontSize:12,maxWidth:520,margin:"0 auto"}}>Suba documentos en INTAKE para que VIGÍA identifique automáticamente sus normas aplicables, autoridades competentes y nivel de riesgo ambiental.</div>
        <button onClick={()=>setView("intake")} style={{marginTop:12,background:C.primary,border:"none",borderRadius:8,padding:"8px 18px",color:"#060c14",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Abrir INTAKE</button>
      </div>
    ):(
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12}}>
        {(orgProfile.sectores||[]).length>0 && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Sectores</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{orgProfile.sectores.slice(0,6).map(s=><span key={s} style={{fontSize:11,background:C.green+"22",color:C.green,padding:"2px 8px",borderRadius:4}}>{s}</span>)}</div>
        </div>}
        {orgProfile.nivel_riesgo_ambiental && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Nivel de riesgo</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:12,height:12,borderRadius:"50%",background:orgProfile.nivel_riesgo_ambiental==="critico"?C.red:orgProfile.nivel_riesgo_ambiental==="alto"?C.red:orgProfile.nivel_riesgo_ambiental==="medio"?C.yellow:C.green}}/>
            <span style={{fontSize:12,fontWeight:600,color:C.text,textTransform:"capitalize"}}>{orgProfile.nivel_riesgo_ambiental}</span>
          </div>
        </div>}
        {(orgProfile.autoridades_ambientales||[]).length>0 && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Autoridades competentes</div>
          <div style={{fontSize:11,color:C.text,lineHeight:1.5}}>{orgProfile.autoridades_ambientales.slice(0,5).join(" · ")}</div>
        </div>}
        {(orgProfile.temas_regulatorios||[]).length>0 && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Temas regulatorios</div>
          <ul style={{margin:0,padding:"0 0 0 16px",fontSize:11,color:C.text,lineHeight:1.7}}>{orgProfile.temas_regulatorios.slice(0,5).map(t=><li key={t}>{t}</li>)}</ul>
        </div>}
        {(orgProfile.normas_aplicables||[]).length>0 && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Normas más aplicables</div>
          <ul style={{margin:0,padding:"0 0 0 16px",fontSize:11,color:C.text,lineHeight:1.7}}>{orgProfile.normas_aplicables.slice(0,5).map(n=><li key={n} onClick={()=>setView("normativa")} style={{cursor:"pointer",textDecoration:"underline",textDecorationColor:C.border}}>{n}</li>)}</ul>
        </div>}
        {(orgProfile.departamentos_operacion||[]).length>0 && <div style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Departamentos</div>
          <div style={{fontSize:11,color:C.text,lineHeight:1.5}}>{orgProfile.departamentos_operacion.slice(0,5).join(" · ")}</div>
        </div>}
      </div>
    )}
  </div>
)}
{!isSuperAdmin && complianceAlerts.length > 0 && (
  <div style={{marginTop:0,marginBottom:24,padding:"20px 24px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:12}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
      <div style={{fontSize:14,fontWeight:700,color:C.text}}>Alertas de Cumplimiento</div>
      <span style={{fontSize:11,color:C.textSec}}>{complianceAlerts.length} alerta{complianceAlerts.length!==1?"s":""} activa{complianceAlerts.length!==1?"s":""}</span>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {complianceAlerts.slice(0,10).map(a=>{
        const crit = a.alert_level==="FUNDAMENTO_DEROGADO" || a.alert_level==="VENCIDA";
        const warn = a.alert_level==="FUNDAMENTO_MODIFICADO" || a.alert_level==="PROXIMA_30D";
        const col = crit?C.red:warn?C.yellow:C.green;
        const icon = a.alert_level==="FUNDAMENTO_DEROGADO"?"⚠️":a.alert_level==="FUNDAMENTO_MODIFICADO"?"📝":a.alert_level==="VENCIDA"?"🔴":a.alert_level==="PROXIMA_30D"?"🟡":"✅";
        return <div key={a.obligation_id} style={{padding:"10px 14px",background:col+"11",border:`1px solid ${col}44`,borderRadius:8,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:16}}>{icon}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:C.text}}>{a.obligation_num}: {(a.description||"").slice(0,90)}</div>
            {a.alert_level==="FUNDAMENTO_DEROGADO" && <div style={{fontSize:11,color:C.red}}>⚠️ Fundamento ({a.norma_fundamento}) derogado{a.derogado_por?` por ${a.derogado_por}`:""}</div>}
            {a.alert_level==="FUNDAMENTO_MODIFICADO" && <div style={{fontSize:11,color:C.yellow}}>📝 Fundamento modificado{a.modificado_por?` por ${a.modificado_por}`:""}</div>}
            {a.due_date && <div style={{fontSize:10,color:C.textMuted}}>Vencimiento: {new Date(a.due_date).toLocaleDateString("es-CO")}</div>}
          </div>
          <span style={{fontSize:10,color:col,fontWeight:700,textTransform:"uppercase"}}>{a.alert_level.replace(/_/g," ")}</span>
        </div>;
      })}
    </div>
  </div>
)}
<div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:16}}>
<div>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:13,fontWeight:600,color:C.text}}>Expedientes Digitales Inteligentes</span><span style={{fontSize:11,color:C.textSec}}>{instruments.length} EDIs activos</span></div>
<div style={{display:"flex",flexDirection:"column",gap:10}}>
{instruments.map(inst=>{ const h=ediHealth(inst); const obs=ediObs(inst.id); const color=hC(h); const bg=hB(h); return <div key={inst.id} onClick={()=>{setSelectedEDI(inst);setView("edi-detail");}} style={{background:C.surface,border:`1px solid ${h==="critico"?C.red+"44":C.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:42,height:42,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FileText size={18} color={color}/></div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:14,fontWeight:600,color:C.text}}>{inst.project_name || inst.projects?.name || `${(inst.instrument_type||"Instrumento").replace(/_/g," ")} ${inst.number||""}`}</span><StatusDot status={h}/></div><div style={{fontSize:11,color:C.textSec,marginBottom:6}}>Instrumento N. {inst.number} - {inst.authority_name||"Autoridad no definida"} - Nivel {inst.authority_level}</div><div style={{display:"flex",gap:12}}>{obs.filter(o=>derivedStatus(o)==="vencido").length>0&&<span style={{fontSize:11,color:C.red}}>* {obs.filter(o=>derivedStatus(o)==="vencido").length} vencida(s)</span>}{(obs.filter(o=>derivedStatus(o)==="proximo").length>0)&&<span style={{fontSize:11,color:C.yellow}}>* {obs.filter(o=>derivedStatus(o)==="proximo").length} proxima(s)</span>}<span style={{fontSize:11,color:C.green}}>* {obs.filter(o=>derivedStatus(o)==="al_dia").length} al dia</span></div></div><div style={{textAlign:"right",flexShrink:0}}><Badge label={`${inst.completeness_pct}% completo`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/><div style={{marginTop:4}}><ChevronRight size={14} color={C.textSec}/></div></div></div></div>; })}
</div>
</div>
<div>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:13,fontWeight:600,color:C.text}}>Alertas regulatorias</span>{unreadAlerts>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unreadAlerts} nuevas</span>}</div>
<div style={{display:"flex",flexDirection:"column",gap:10}}>
{alerts.slice(0,4).map(alert=>{ const color=alert.urgency==="critica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue; const bg=alert.urgency==="critica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim; return <div key={alert.id} onClick={()=>setView("inteligencia")} style={{background:C.surface,border:`1px solid ${!alert.human_validated?color+"55":C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer"}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><AlertTriangle size={13} color={color}/></div><div style={{flex:1}}>{!alert.human_validated&&<div style={{width:6,height:6,borderRadius:"50%",background:color,marginBottom:4,display:"inline-block",marginRight:4}}/>}<div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.4,marginBottom:4}}>{alert.norm_title}</div><ImpactBadge impact={alert.impact_type}/></div></div></div>; })}
</div>
</div>
</div>
</>}
{dashboardView==="timeline" && (()=>{
  const groups = {};
  [...obligations].filter(o=>o.due_date).sort((a,b)=>new Date(a.due_date)-new Date(b.due_date)).forEach(o=>{
    const d=new Date(o.due_date);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const label=d.toLocaleDateString("es-CO",{month:"long",year:"numeric"});
    if(!groups[key]) groups[key]={label,obs:[],key};
    groups[key].obs.push(o);
  });
  const months = Object.values(groups).sort((a,b)=>a.key.localeCompare(b.key));
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  if(months.length===0) return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"32px 20px",textAlign:"center",fontSize:13,color:C.textSec}}>Sin obligaciones con fecha de vencimiento para mostrar.</div>;
  return <div style={{position:"relative",paddingLeft:20}}>
    <div style={{position:"absolute",left:9,top:0,bottom:0,width:2,background:C.border}}/>
    {months.map(month=>{
      const hasVenc = month.obs.some(o=>derivedStatus(o)==="vencido");
      const hasProx = month.obs.some(o=>derivedStatus(o)==="proximo");
      const monthColor = hasVenc?C.red:hasProx?C.yellow:C.green;
      const isCurrent = month.key===currentKey;
      return <div key={month.key} style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginLeft:-14}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:monthColor,border:`2px solid ${C.bg}`,flexShrink:0,zIndex:1}}/>
          <div style={{fontSize:13,fontWeight:700,color:monthColor,textTransform:"capitalize"}}>{month.label}</div>
          {isCurrent && <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.primaryDim,color:C.primary}}>HOY</span>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginLeft:6}}>
          {month.obs.map(ob=>{
            const ds=derivedStatus(ob);
            const days=Math.ceil((new Date(ob.due_date)-now)/86400000);
            const dotColor=ds==="vencido"?C.red:ds==="proximo"?C.yellow:ds==="al_dia"?C.green:C.textMuted;
            const edi=instruments.find(i=>i.id===ob.instrument_id);
            return <div key={ob.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:isCurrent?C.surfaceEl:C.surface,border:`1px solid ${C.border}`,borderRadius:8}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:dotColor,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ob.obligation_num||""} {ob.name||""}</div>
                <div style={{fontSize:10,color:C.textMuted}}>{edi?.title||edi?.project_name||"—"} · {new Date(ob.due_date).toLocaleDateString("es-CO")}</div>
              </div>
              <span style={{fontSize:10,fontWeight:600,color:dotColor,flexShrink:0}}>
                {ds==="vencido"?`Vencida ${Math.abs(days)}d`:ds==="proximo"?`${days}d`:ds==="al_dia"?"Al día":ds}
              </span>
            </div>;
          })}
        </div>
      </div>;
    })}
  </div>;
})()}
{dashboardView==="historico" && (()=>{
  const now = new Date();
  const months = [];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const label=d.toLocaleDateString("es-CO",{month:"short",year:"numeric"});
    months.push({key,label,total:0,cumplidas:0,vencidas:0,pendientes:0});
  }
  obligations.forEach(ob=>{
    if(!ob.due_date) return;
    const d=new Date(ob.due_date);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const month=months.find(m=>m.key===key);
    if(!month) return;
    month.total++;
    const ds=derivedStatus(ob);
    if(ds==="al_dia"||ob.status==="cumplido") month.cumplidas++;
    else if(ds==="vencido") month.vencidas++;
    else month.pendientes++;
  });
  const data=months.map(m=>({...m,rate:m.total>0?Math.round((m.cumplidas/m.total)*100):null}));
  const last=data[data.length-1];
  const prev=data[data.length-2];
  const trend=last?.rate!==null&&prev?.rate!==null?last.rate-prev.rate:null;
  return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px"}}>
    <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:4}}>Tasa de cumplimiento — últimos 6 meses</div>
    <div style={{fontSize:11,color:C.textSec,marginBottom:20}}>Porcentaje de obligaciones al día vs total por mes</div>
    <div style={{display:"flex",alignItems:"flex-end",gap:12,height:160,marginBottom:12}}>
      {data.map(m=>{
        const pct=m.rate??0;
        const color=pct>=80?C.green:pct>=50?C.yellow:C.red;
        return <div key={m.key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
          <div style={{fontSize:11,fontWeight:700,color}}>{m.rate!==null?`${pct}%`:"\u2014"}</div>
          <div style={{width:"100%",display:"flex",flexDirection:"column",justifyContent:"flex-end",height:120}}>
            <div style={{width:"100%",height:m.rate!==null?`${Math.max(pct,4)}%`:"4%",background:m.rate!==null?`linear-gradient(180deg,${color},${color}88)`:C.border,borderRadius:"4px 4px 0 0",transition:"height 0.3s ease",minHeight:4}}/>
          </div>
          <div style={{fontSize:9,color:C.textMuted,textAlign:"center"}}>{m.label}</div>
          <div style={{fontSize:9,color:C.textMuted}}>{m.total} obs</div>
        </div>;
      })}
    </div>
    <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:8}}>
      {[[C.green,"\u226580%"],[C.yellow,"50-79%"],[C.red,"<50%"]].map(([c,l])=><div key={l} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:C.textSec}}><div style={{width:8,height:8,borderRadius:2,background:c}}/>{l}</div>)}
    </div>
    <div style={{marginTop:16,paddingTop:16,borderTop:`1px solid ${C.border}`,display:"flex",gap:20,flexWrap:"wrap"}}>
      {[["Mes actual",last?.rate!==null?`${last.rate}%`:"\u2014"],["Mes anterior",prev?.rate!==null?`${prev.rate}%`:"\u2014"],["Tendencia",trend!==null?(trend>=0?`+${trend}pp`:`${trend}pp`):"\u2014"],["Obligaciones activas",obligations.length]].map(([l,v])=><div key={l}><div style={{fontSize:16,fontWeight:700,color:C.text}}>{v}</div><div style={{fontSize:10,color:C.textMuted}}>{l}</div></div>)}
    </div>
  </div>;
})()}
</div>
);

const renderEDIDetail=()=>{
const inst=selectedEDI; if(!inst)return null;
const obs=ediObs(inst.id); const h=ediHealth(inst); const sc=hC(h);
return <div style={{padding:28}}>
<button onClick={()=>setView("dashboard")} style={{background:"transparent",border:"none",color:C.textSec,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,marginBottom:20,padding:0}}>Volver al panel</button>
<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 24px",marginBottom:20}}>
<div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
<div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><h2 style={{fontSize:20,fontWeight:700,color:C.text,margin:0}}>{inst.project_name || inst.projects?.name || `${(inst.instrument_type||"Instrumento").replace(/_/g," ")} ${inst.number||""}`}</h2><StatusDot status={h} size={10}/></div><div style={{fontSize:12,color:C.textSec,marginBottom:10}}>Instrumento N. {inst.number} - {inst.authority_name||"Autoridad no definida"}</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Badge label={inst.domain||"ambiental"} color={C.primary} bg={C.primaryDim}/><Badge label={inst.instrument_type?.replace(/_/g," ")||""} color={C.textSec} bg={C.surfaceEl}/><Badge label={`${inst.completeness_pct}% completitud`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/></div></div>
<button onClick={()=>setView("consultar")} style={{background:C.primaryDim,border:`1px solid ${C.primary}44`,color:C.primary,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><MessageSquare size={13}/>Consultar</button>
</div>
<div style={{marginTop:16}}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:C.textSec}}>Cumplimiento general</span><span style={{fontSize:11,fontWeight:600,color:sc}}>{obs.length>0?Math.round((obs.filter(o=>derivedStatus(o)==="al_dia").length/obs.length)*100):0}%</span></div>
<div style={{background:C.surfaceEl,borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${obs.length>0?(obs.filter(o=>derivedStatus(o)==="al_dia").length/obs.length)*100:0}%`,height:"100%",background:`linear-gradient(90deg,${sc},${sc}88)`,borderRadius:4}}/></div>
</div>
</div>
<div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Obligaciones del expediente</div>
<div style={{display:"flex",flexDirection:"column",gap:8}}>
{obs.map(ob=>{
const ds=derivedStatus(ob);
const color=ds==="vencido"?C.red:ds==="proximo"?C.yellow:C.green;
const bg=ds==="vencido"?C.redDim:ds==="proximo"?C.yellowDim:C.greenDim;
const days=ob.due_date?Math.ceil((new Date(ob.due_date)-new Date())/86400000):null;
return <div key={ob.id} style={{background:C.surface,border:`1px solid ${ds==="vencido"?C.red+"55":C.border}`,borderRadius:10,padding:"14px 18px"}}>
<div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"start",gap:14}}>
<div style={{width:38,height:38,borderRadius:8,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
{ds==="vencido"?<AlertTriangle size={16} color={color}/>:ds==="proximo"?<Clock size={16} color={color}/>:<CheckCircle size={16} color={color}/>}
</div>
<div>
<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
<span style={{fontSize:13,fontWeight:600,color:C.text}}>{ob.name}</span>
<span style={{fontSize:10,color:C.textMuted,fontFamily:"monospace"}}>{ob.obligation_num||ob.num}</span>
</div>
<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:ob.fuente?8:0}}>
<Badge label={ob.obligation_type?.replace(/_/g," ")||ob.frequency||""} color={C.textSec} bg={C.surfaceEl}/>
<Badge label={ob.frequency||""} color={C.blue} bg={C.blueDim}/>
{ob.confidence_level&&<Badge label={`${ob.confidence_level} confianza`} color={ob.confidence_level==="alta"?C.green:ob.confidence_level==="media"?C.yellow:C.red} bg={ob.confidence_level==="alta"?C.greenDim:ob.confidence_level==="media"?C.yellowDim:C.redDim}/>}
</div>
{ob.fuente&&(
<div>
<div style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}} >
<FuenteBadge fuente={ob.fuente}/>
<span style={{fontSize:10,color:C.textMuted}}>Trazabilidad de fuente</span>
</div>
<FuenteDetail fuente={ob.fuente}/>
</div>
)}
</div>
<div style={{textAlign:"right",flexShrink:0}}>
<div style={{fontSize:20,fontWeight:700,color,lineHeight:1}}>{days!==null?Math.abs(days):"-"}</div>
<div style={{fontSize:10,color:C.textMuted}}>{days!==null?(days<0?"dias vencido":"dias restantes"):""}</div>
<div style={{fontSize:11,color:C.textSec,marginTop:2}}>{ob.due_date}</div>
</div>
</div>
</div>;
})}
</div>
</div>;
};

const renderInteligencia=()=><div style={{padding:28}}>
<h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Inteligencia regulatoria</h1>
<p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>Motor de monitoreo continuo - {alerts.length} alertas activas</p>
<div style={{display:"flex",flexDirection:"column",gap:14}}>
{alerts.map(alert=>{
const color=alert.urgency==="critica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue;
const bg=alert.urgency==="critica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim;
return <div key={alert.id} style={{background:C.surface,border:`1px solid ${!alert.human_validated?color+"55":C.border}`,borderRadius:14,padding:"20px 22px"}}>
<div style={{display:"flex",alignItems:"flex-start",gap:16}}>
<div style={{width:44,height:44,borderRadius:12,background:bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
{alert.norm_type==="sentencia_tribunal"||alert.norm_type==="jurisprudencia"?<Scale size={20} color={color}/>:<AlertTriangle size={20} color={color}/>}
</div>
<div style={{flex:1}}>
<div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><ImpactBadge impact={alert.impact_type}/>{!alert.human_validated&&<Badge label="Nueva" color={color} bg={bg}/>}<span style={{fontSize:11,color:C.textMuted}}>{alert.norm_date}</span></div>
<div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.4}}>{alert.norm_title}</div>
<div style={{fontSize:12,color:C.textSec,marginBottom:12}}>{alert.issuing_authority}</div>
<div style={{fontSize:13,color:C.text,marginBottom:10,lineHeight:1.7,padding:"12px 16px",background:C.surfaceEl,borderRadius:8,borderLeft:`3px solid ${color}`}}>{alert.summary}</div>
{alert.detailed_analysis&&<div style={{fontSize:12,color:C.textSec,marginBottom:12,lineHeight:1.6}}>{alert.detailed_analysis}</div>}
{alert.fuente_norma&&<FuenteDetail fuente={{...alert.fuente_norma,tipo:alert.norm_type==="sentencia_tribunal"?"jurisprudencial":"normativa"}}/>}
{alert.proposed_changes?.length>0&&(
<div style={{marginTop:12,background:C.yellowDim,border:`1px solid ${C.yellow}33`,borderRadius:8,padding:"12px 14px"}}>
<div style={{fontSize:11,fontWeight:700,color:C.yellow,marginBottom:8}}>Cambios propuestos a obligaciones</div>
{alert.proposed_changes.map((ch,i)=>(
<div key={i} style={{fontSize:11,color:C.text,marginBottom:4}}><span style={{fontWeight:600}}>{ch.obligation_num}</span>: {ch.before} → <span style={{color:C.green}}>{ch.after}</span><div style={{fontSize:10,color:C.textMuted}}>{ch.reason}</div></div>
))}
</div>
)}
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginTop:12}}>
<div style={{fontSize:11,color:C.textMuted}}>Confianza: <span style={{color:(alert.confidence_pct||0)>85?C.green:C.yellow,fontWeight:700}}>{alert.confidence_pct}%</span></div>
<button onClick={()=>setAlerts(p=>p.map(a=>a.id===alert.id?{...a,human_validated:true}:a))} style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,color:C.textSec,cursor:"pointer"}}>Marcar revisado</button>
</div>
{alert.suggested_action&&<div style={{marginTop:12,padding:"10px 16px",background:bg,borderRadius:8,fontSize:12,color,fontWeight:600}}>Accion: {alert.suggested_action}</div>}
</div>
</div>
</div>;
})}
</div>

  </div>;

const renderNormativa=()=>{
  // UI-4: tabs dinámicos por categoría real. Fallback: si no hay category, usar scope.
  const hasCategories = normSources.some(n=>n.category);
  const groupKey = hasCategories ? (n=>n.category||"Otra") : (n=>n.scope||"otra");
  const filtered = normSources.filter(n => normScopeFilter==="todos" || groupKey(n)===normScopeFilter);
  const grouped = filtered.reduce((acc,n)=>{ const k=groupKey(n); (acc[k]=acc[k]||[]).push(n); return acc; }, {});
  const scopes = Object.keys(grouped).sort((a,b)=>(grouped[b].length-grouped[a].length));
  const allCats = {};
  normSources.forEach(n=>{ const k=groupKey(n); allCats[k]=(allCats[k]||0)+1; });
  const totalScopes = Object.keys(allCats).filter(k=>k!=="Otra"&&k!=="otra").sort((a,b)=>allCats[b]-allCats[a]);
  if(allCats["Otra"]) totalScopes.push("Otra");
  if(allCats["otra"]) totalScopes.push("otra");
  const detail = selectedNorm ? normSources.find(n=>n.id===selectedNorm) : null;
  const detailArticles = selectedNorm ? (normArticles[selectedNorm]||[]) : [];
  return (
    <div style={{padding:28,overflowY:"auto",height:"100%"}}>
      <div style={{marginBottom:16}}>
        <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Base normativa</h1>
        <p style={{fontSize:13,color:C.textSec,margin:0}}>{normSources.length} normas ambientales colombianas · corpus universal con búsqueda semántica</p>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {["todos", ...totalScopes].map(s=>{
          const label = s==="todos"?`Todos (${normSources.length})`:`${SCOPE_LABELS[s]||s} (${allCats[s]||0})`;
          const col = s==="todos"?C.primary:(SCOPE_COLORS[s]||C.textSec);
          const active = normScopeFilter===s;
          return <button key={s} onClick={()=>setNormScopeFilter(s)} style={{background:active?`${col}22`:C.surface,border:`1px solid ${active?col+"66":C.border}`,borderRadius:6,padding:"6px 12px",color:active?col:C.textSec,fontSize:11,fontWeight:active?700:500,cursor:"pointer"}}>{label}</button>;
        })}
      </div>
      {detail && (
        <div style={{background:C.surface,border:`1px solid ${C.primary}44`,borderRadius:12,padding:"18px 22px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:12}}>
            <div style={{width:36,height:36,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={16} color={C.primary}/></div>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.3}}>{detail.norm_title}</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
                <Badge label={detail.norm_type} color={C.blue} bg={C.blueDim}/>
                {detail.norm_number && <Badge label={`N. ${detail.norm_number}/${detail.norm_year||""}`} color={C.textSec} bg={C.surfaceEl}/>}
                {detail.scope && <Badge label={SCOPE_LABELS[detail.scope]||detail.scope} color={SCOPE_COLORS[detail.scope]||C.textSec} bg={`${SCOPE_COLORS[detail.scope]||C.textSec}22`}/>}
                {detail.total_articles>0 ? <Badge label={`${detail.total_articles} artículos`} color={C.green} bg={C.greenDim}/> : <span style={{opacity:0.5}}><Badge label="sin texto" color={C.textMuted} bg={C.surfaceEl}/></span>}
                {detail.vigencia_global==="vigente" && <Badge label="✓ Vigente" color={C.green} bg={C.greenDim}/>}
                {detail.vigencia_global==="derogada_parcial" && <Badge label="⚠ Derogada parcial" color={C.yellow} bg={C.yellowDim}/>}
                {detail.vigencia_global==="derogada_total" && <Badge label="✗ Derogada" color={C.red} bg={C.redDim}/>}
                {detail.category && <Badge label={detail.category} color={C.purple} bg={C.purpleDim||C.surfaceEl}/>}
              </div>
              {detail.issuing_body && <div style={{fontSize:11,color:C.textSec,marginBottom:4}}>{detail.issuing_body}{detail.issue_date?` · ${detail.issue_date}`:""}</div>}
              {detail.summary && <div style={{fontSize:12,color:C.text,lineHeight:1.5,marginTop:8,padding:"8px 12px",background:C.surfaceEl,borderRadius:6}}>{detail.summary}</div>}
              {detail.source_url && <div style={{marginTop:8}}><a href={detail.source_url} target="_blank" rel="noopener noreferrer" style={{fontSize:11,color:C.primary,textDecoration:"none"}}>↗ PDF oficial</a></div>}
            </div>
            <button onClick={()=>setSelectedNorm(null)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.textSec,fontSize:11,cursor:"pointer"}}>Cerrar ×</button>
          </div>
          <div style={{marginTop:14}}>
            <div style={{fontSize:11,fontWeight:700,color:C.primary,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Artículos ({detailArticles.length})</div>
            {detailArticles.length===0 ? <div style={{fontSize:12,color:C.textMuted,fontStyle:"italic"}}>Cargando…</div> :
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:480,overflowY:"auto"}}>
                {detailArticles.slice(0,20).map(a=>(
                  <div key={a.id} style={{background:C.surfaceEl,borderLeft:`3px solid ${C.primary}44`,borderRadius:4,padding:"8px 12px"}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.primary,marginBottom:3}}>{a.article_label||`Art. ${a.article_number}`}{a.chapter?` · ${a.chapter}`:""}</div>
                    {a.title && <div style={{fontSize:11,color:C.textSec,fontStyle:"italic",marginBottom:3}}>{a.title}</div>}
                    <div style={{fontSize:11,color:C.text,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{(a.content||"").slice(0,500)}{(a.content||"").length>500?"…":""}</div>
                  </div>
                ))}
                {detailArticles.length>20 && <div style={{fontSize:11,color:C.textMuted,textAlign:"center",padding:"8px"}}>Mostrando primeros 20 de {detailArticles.length} artículos</div>}
              </div>}
          </div>
        </div>
      )}
      {scopes.length===0 && <div style={{color:C.textMuted,fontSize:12,padding:"40px",textAlign:"center"}}>Sin normas en este scope.</div>}
      {scopes.map(sc=>(
        <div key={sc} style={{marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:4,height:18,background:SCOPE_COLORS[sc]||C.textSec,borderRadius:2}}/>
            <h2 style={{fontSize:14,fontWeight:700,color:C.text,margin:0,textTransform:"uppercase",letterSpacing:"0.05em"}}>{SCOPE_LABELS[sc]||sc}</h2>
            <span style={{fontSize:11,color:C.textMuted}}>{grouped[sc].length} norma{grouped[sc].length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {grouped[sc].sort((a,b)=>(a.hierarchy_level||9)-(b.hierarchy_level||9)||(b.norm_year||0)-(a.norm_year||0)).map(n=>(
              <div key={n.id} onClick={()=>setSelectedNorm(n.id)} style={{background:C.surface,border:`1px solid ${selectedNorm===n.id?C.primary+"66":C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,cursor:"pointer",transition:"border-color 0.15s"}}>
                <div style={{width:32,height:32,borderRadius:8,background:`${SCOPE_COLORS[sc]||C.primary}22`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={14} color={SCOPE_COLORS[sc]||C.primary}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n.norm_title}</div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:10,color:C.textMuted}}>
                    <span style={{color:C.blue,fontWeight:600,textTransform:"uppercase"}}>{n.norm_type}</span>
                    {n.norm_number && <span style={{color:C.text}}>{n.norm_number}/{n.norm_year||""}</span>}
                    {n.issuing_body && <><span>·</span><span>{n.issuing_body.slice(0,60)}</span></>}
                    <span>·</span>
                    {n.total_articles>0 ? <span style={{color:C.green}}>{n.total_articles} art.</span> : <span style={{color:C.textMuted,opacity:0.5,fontStyle:"italic"}}>sin texto</span>}
                    {n.vigencia_global==="derogada_total" && <><span>·</span><span style={{color:C.red,fontWeight:700}}>✗ DEROGADA</span></>}
                    {n.vigencia_global==="derogada_parcial" && <><span>·</span><span style={{color:C.yellow,fontWeight:600}}>⚠ parcial</span></>}
                  </div>
                </div>
                <ChevronRight size={14} color={C.textSec}/>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const renderOversight=()=><div style={{padding:28}}>
<h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Oversight legal automatico</h1>
<p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>Anomalias detectadas - {oversight.length} activas</p>
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{oversight.map(ov=>{ const color=ov.severity==="critico"?C.red:ov.severity==="moderado"?C.yellow:C.blue; const bg=ov.severity==="critico"?C.redDim:ov.severity==="moderado"?C.yellowDim:C.blueDim; return <div key={ov.id} style={{background:C.surface,border:`1px solid ${color+"55"}`,borderRadius:12,padding:"18px 22px"}}><div style={{display:"flex",alignItems:"flex-start",gap:14}}><div style={{width:40,height:40,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><AlertTriangle size={18} color={color}/></div><div style={{flex:1}}><div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><Badge label={ov.severity} color={color} bg={bg}/><Badge label={ov.anomaly_type?.replace(/_/g," ")||""} color={C.textSec} bg={C.surfaceEl}/></div><div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>{ov.title}</div><div style={{fontSize:13,color:C.textSec,marginBottom:10,lineHeight:1.6}}>{ov.description}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Referencia legal: <span style={{color:C.text}}>{ov.legal_reference}</span></div><div style={{marginTop:12,padding:"10px 14px",background:bg,borderRadius:8,fontSize:12,color,fontWeight:600}}>Accion: {ov.suggested_action}</div></div></div></div>; })}
</div>

  </div>;

const renderConsultar=()=>{ const c=conf(); const hasAssistantMsgs = botMessages.some(m=>m.role==="assistant"); const convMenuOpen = exportMenu==="conv"; return <div style={{height:"100%",display:"flex",flexDirection:"column",padding:28,gap:16}}><div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Motor de consulta</h1><p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}><span style={{color:sources.normativa?C.text:C.textSec,fontWeight:sources.normativa?600:400}}>{normSources.length} normas</span> · <span style={{color:sources.jurisprudencia?C.purple:C.textMuted,fontWeight:sources.jurisprudencia?600:400}}>147 sentencias</span>{sources.pedagogico&&<> · <span style={{color:C.yellow,fontWeight:600}}>17 guías</span></>} · {obligations.length} obligaciones · trazabilidad jurídica</p></div>{hasAssistantMsgs&&<div style={{position:"relative"}} onClick={e=>e.stopPropagation()}><button onClick={()=>setExportMenu(convMenuOpen?null:"conv")} style={{background:C.primaryDim,border:`1px solid ${C.primary}44`,borderRadius:8,padding:"7px 14px",color:C.primary,fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><Download size={13}/>Exportar conversación</button>{convMenuOpen&&<div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,boxShadow:"0 6px 24px rgba(0,0,0,0.35)",zIndex:20,minWidth:180,overflow:"hidden"}}>{[["md","Markdown (.md)"],["txt","Texto plano (.txt)"],["pdf","PDF (.pdf)"],["doc","Word (.doc)"]].map(([f,l])=>(<div key={f} onClick={()=>runExport(f)} style={{padding:"9px 14px",fontSize:12,color:C.text,cursor:"pointer",borderBottom:`1px solid ${C.border}`,transition:"background 0.12s"}} onMouseEnter={e=>e.currentTarget.style.background=C.primaryDim} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{l}</div>))}</div>}</div>}</div><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}><div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.1em"}}>Fuentes de consulta</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>{[{key:"documentos",icon:Database,label:"Mis documentos",sub:"Capa 1 - EDIs propios",color:C.primary},{key:"normativa",icon:BookOpen,label:"Normativa vigente",sub:`Capa 2a - ${normSources.length} normas`,color:C.blue},{key:"jurisprudencia",icon:Scale,label:"Jurisprudencia",sub:"Capa 2b - 147 sentencias",color:C.purple},{key:"validacion",icon:Eye,label:"Validación ENARA",sub:"Capa 3 - validación humana",color:C.yellow,soon:true},{key:"pedagogico",icon:BookMarked,label:"Circulares y guías",sub:"17 fuentes · orientación técnica",color:C.yellow,badge:"no vinculante",span:true}].map(({key,icon:Icon,label,sub,color,soon,badge,span})=>(<div key={key} onClick={soon?undefined:()=>toggleSource(key)} style={{gridColumn:span?"span 2":undefined,background:soon?C.surfaceEl:(sources[key]?`${color}12`:C.surfaceEl),border:`1px solid ${soon?C.border:(sources[key]?color+"66":C.border)}`,borderRadius:8,padding:"10px 12px",cursor:soon?"default":"pointer",display:"flex",alignItems:"center",gap:10,opacity:soon?0.65:1}}><div style={{width:28,height:28,borderRadius:6,background:sources[key]&&!soon?`${color}22`:C.border+"44",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={13} color={sources[key]&&!soon?color:C.textMuted}/></div><div style={{flex:1,minWidth:0}}><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}><div style={{fontSize:12,fontWeight:600,color:sources[key]&&!soon?C.text:C.textSec}}>{label}</div>{soon&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.yellowDim,color:C.yellow,textTransform:"uppercase",letterSpacing:"0.05em"}}>Próximamente</span>}{badge&&<span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.yellowDim,color:C.yellow,textTransform:"uppercase",letterSpacing:"0.05em"}}>{badge}</span>}</div><div style={{fontSize:10,color:C.textMuted}}>{sub}</div></div></div>))}</div><div style={{padding:"8px 12px",borderRadius:8,background:c.color===C.green?C.greenDim:c.color===C.red?C.redDim:C.yellowDim,fontSize:12,color:c.color,fontWeight:500}}>{c.risk} {c.label}</div></div>{botHistory.length>0&&(<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}><button onClick={()=>setBotHistoryOpen(p=>!p)} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"transparent",border:"none",cursor:"pointer",color:C.textSec,fontFamily:FONT}}><span style={{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em"}}>Consultas recientes ({botHistory.length})</span><ChevronRight size={14} style={{transform:botHistoryOpen?"rotate(90deg)":"none",transition:"transform 0.15s"}}/></button>{botHistoryOpen&&<div style={{borderTop:`1px solid ${C.border}`,maxHeight:280,overflowY:"auto",padding:"8px 12px",display:"flex",flexDirection:"column",gap:6}}>{botHistory.map(h=>(<div key={h.id} style={{background:C.surfaceEl,borderRadius:8,padding:"8px 12px",cursor:"pointer"}} onClick={()=>{setBotMessages(p=>[...p,{role:"user",text:h.query_text},{role:"assistant",text:h.response_text,sources:h.sources_cited||[]}]);setBotHistoryOpen(false);}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:10,color:C.textMuted}}>{new Date(h.created_at).toLocaleDateString("es-CO",{day:"numeric",month:"short"})}</span><span style={{fontSize:11,fontWeight:600,color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(h.query_text||"").slice(0,80)}</span>{h.tokens_used>0&&<span style={{fontSize:9,color:C.textMuted}}>{h.tokens_used} tok</span>}<button onClick={e=>{e.stopPropagation();navigator.clipboard?.writeText(`[Consulta VIGÍA — ${new Date(h.created_at).toLocaleDateString("es-CO")}]\nPregunta: ${h.query_text}\n\nRespuesta: ${h.response_text}`);}} title="Copiar" style={{background:"transparent",border:"none",padding:2,cursor:"pointer",color:C.textMuted,display:"flex"}}><Download size={11}/></button></div><div style={{fontSize:10,color:C.textSec,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{(h.response_text||"").slice(0,150)}</div></div>))}</div>}</div>)}<div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}><div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>{botMessages.map((msg,i)=>(<div key={i} style={{display:"flex",flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-start",gap:10}}>{msg.role!=="user"&&<div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Zap size={13} color={C.primary}/></div>}<div style={{maxWidth:"78%",background:msg.role==="user"?C.primaryDim:C.surfaceEl,border:`1px solid ${msg.role==="user"?C.primary+"44":C.border}`,borderRadius:msg.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"10px 14px",position:"relative"}}>{msg.role==="system"&&<div style={{fontSize:10,color:C.primary,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>VIGIA</div>}{msg.role==="assistant"&&msg.text&&!msg.text.startsWith("Error:")&&<div style={{position:"absolute",top:6,right:6,display:"flex",gap:2}} onClick={e=>e.stopPropagation()}><button onClick={()=>copyBotResponse(i)} title="Copiar con citas" style={{background:"transparent",border:"none",padding:4,borderRadius:4,cursor:"pointer",color:copiedMsgIndex===i?C.green:C.textMuted,display:"flex"}} onMouseEnter={e=>{if(copiedMsgIndex!==i)e.currentTarget.style.color=C.primary;}} onMouseLeave={e=>{e.currentTarget.style.color=copiedMsgIndex===i?C.green:C.textMuted;}}>{copiedMsgIndex===i?<CheckCircle size={12}/>:<Copy size={12}/>}</button><button onClick={()=>setExportMenu(exportMenu===i?null:i)} title="Exportar esta respuesta" style={{background:"transparent",border:"none",padding:4,borderRadius:4,cursor:"pointer",color:C.textMuted,display:"flex"}} onMouseEnter={e=>{e.currentTarget.style.background=C.bg;e.currentTarget.style.color=C.primary;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textMuted;}}><Download size={12}/></button>{exportMenu===i&&<div style={{position:"absolute",top:"calc(100% + 2px)",right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:6,boxShadow:"0 6px 24px rgba(0,0,0,0.35)",zIndex:20,minWidth:170,overflow:"hidden"}}>{[["md","Markdown (.md)"],["txt","Texto plano (.txt)"],["pdf","PDF (.pdf)"],["doc","Word (.doc)"]].map(([f,l])=>(<div key={f} onClick={()=>runExport(f,i)} style={{padding:"8px 12px",fontSize:11,color:C.text,cursor:"pointer",borderBottom:`1px solid ${C.border}`}} onMouseEnter={e=>e.currentTarget.style.background=C.primaryDim} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>{l}</div>))}</div>}</div>}{msg.role==="assistant"?<MarkdownText text={msg.text}/>:<div style={{fontSize:13,color:C.text,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{msg.text}</div>}{msg.role==="assistant"&&Array.isArray(msg.sources)&&msg.sources.length>0&&<div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border}`}}><div style={{fontSize:9,fontWeight:700,color:C.primary,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Fuentes consultadas ({msg.sources.length})</div><div style={{display:"flex",flexDirection:"column",gap:4}}>{msg.sources.map((s,si)=>(<div key={si} onClick={()=>{setView("normativa");setSelectedNorm(s.norm_id);}} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",background:C.bg,borderRadius:4,fontSize:10,color:C.textSec,cursor:"pointer",transition:"background 0.15s"}} onMouseEnter={e=>e.currentTarget.style.background=C.primaryDim} onMouseLeave={e=>e.currentTarget.style.background=C.bg}><span style={{color:C.primary,fontWeight:600,minWidth:20}}>[{si+1}]</span>{s?.source_type==="documento_org"?<><span style={{textTransform:"uppercase",fontWeight:600,color:C.green}}>{(s.article_label||s.doc_type_detected||"DOC ORG").toString().replace(/_/g," ")}</span><span style={{color:C.text}}>{(s.norm_title||"").slice(0,50)}</span><span style={{background:C.green+"22",color:C.green,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>📄 PROPIO</span></>:s?.source_type==="sentencia"?<><span style={{textTransform:"uppercase",fontWeight:600,color:C.purple}}>{s.corte||"SENTENCIA"}</span><span style={{color:C.text}}>{s.radicado||""}</span><span style={{background:C.blue+"22",color:C.blue,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>🔵 JURISPRUDENCIA</span></>:s?.source_type==="resumen_editorial"?<><span style={{textTransform:"uppercase",fontWeight:600,color:C.textSec}}>EDITORIAL</span><span style={{color:C.text}}>{(s.norm_title||"").slice(0,50)}</span><span style={{background:C.textMuted+"22",color:C.textMuted,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>⬜ EDITORIAL</span></>:s?.corpus_source==="pedagogico"?<><span style={{textTransform:"uppercase",fontWeight:600,color:C.yellow}}>GUÍA</span><span style={{color:C.text}}>{(s.norm_title||"").slice(0,50)}</span><span style={{background:C.yellow+"22",color:C.yellow,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>📖 GUÍA TÉCNICA</span></>:<><span style={{textTransform:"uppercase",fontWeight:600,color:C.blue}}>{s.norm_type}</span><span style={{color:C.text}}>{s.norm_number}/{s.norm_year}</span><span style={{color:C.textMuted}}>·</span><span>{s.article_label||`Art. ${s.article_number}`}</span>{s?.vigencia_status==="derogado"&&<span style={{background:C.red+"22",color:C.red,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>🔴 DEROGADO</span>}{s?.vigencia_status==="modificado"&&<span style={{background:C.yellow+"22",color:C.yellow,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>🟡 MODIFICADO</span>}{s?.vigencia_global==="derogada_total"&&!s?.vigencia_status&&<span style={{background:C.red+"22",color:C.red,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4}}>🔴 NORMA DEROGADA</span>}</>}<span style={{marginLeft:"auto",fontSize:9,color:C.textMuted}}>{(s.similarity*100).toFixed(0)}%</span></div>))}</div></div>}{msg.layers&&msg.role==="assistant"&&!Array.isArray(msg.sources)&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.textMuted}}>Fuentes: {msg.layers}</div>}{msg.capas&&msg.role==="assistant"&&<div style={{marginTop:8,fontSize:9,color:C.textMuted,display:"flex",gap:8,flexWrap:"wrap"}}><span>Capas consultadas:</span>{msg.capas.normas>0&&<span>📋 {msg.capas.normas} normas</span>}{msg.capas.sentencias>0&&<span>⚖️ {msg.capas.sentencias} sentencias</span>}{msg.capas.resumenes_editoriales>0&&<span>📰 {msg.capas.resumenes_editoriales} editoriales</span>}{msg.capas.documentos_org>0&&<span style={{color:C.green,fontWeight:600}}>📄 {msg.capas.documentos_org} propios</span>}</div>}</div></div>))}{botLoading&&<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={13} color={C.primary}/></div><div style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:"4px 12px 12px 12px",padding:"12px 16px",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.primary,animation:"pulse 1.2s infinite",animationDelay:`${i*0.25}s`}}/>)}</div></div>}</div><div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"flex-end"}}><textarea value={botInput} onChange={e=>setBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBot();}}} placeholder="Escribe tu consulta..." style={{flex:1,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:FONT,resize:"none",minHeight:42,maxHeight:120,outline:"none",lineHeight:1.5}} rows={1}/><button onClick={sendBot} disabled={botLoading||!botInput.trim()} style={{background:botLoading||!botInput.trim()?C.surfaceEl:C.primary,border:"none",borderRadius:8,padding:"11px 16px",cursor:"pointer",flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={botLoading||!botInput.trim()?C.textMuted:"#060c14"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div></div></div>; };

const renderEDIs = () => {
  const hC2=(h)=>h==="critico"?C.red:h==="moderado"?C.yellow:C.green;
  const hB2=(h)=>h==="critico"?C.redDim:h==="moderado"?C.yellowDim:C.greenDim;
  const q = ediSearch.trim().toLowerCase();
  const filtered = instruments.filter(inst=>{
    const h = ediHealth(inst);
    if(ediFilter==="criticos" && h!=="critico") return false;
    if(ediFilter==="moderados" && h!=="moderado") return false;
    if(ediFilter==="al_dia" && h!=="al_dia") return false;
    if(!q) return true;
    const label = (inst.title||"")+" "+(inst.project_name||inst.projects?.name||"")+" "+(inst.number||"")+" "+(inst.instrument_type||"")+" "+(inst.authority_name||"");
    return label.toLowerCase().includes(q);
  });
  const counts = {
    todos: instruments.length,
    criticos: instruments.filter(i=>ediHealth(i)==="critico").length,
    moderados: instruments.filter(i=>ediHealth(i)==="moderado").length,
    al_dia: instruments.filter(i=>ediHealth(i)==="al_dia").length,
  };
  return <div style={{padding:28,overflowY:"auto",height:"100%"}}>
    <div style={{marginBottom:20,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Mis EDIs</h1>
        <p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>Expedientes Digitales Inteligentes de {clientOrg?.name||"tu organización"} — {instruments.length} en total</p>
      </div>
      {instruments.length>0&&<button onClick={generateCompliancePDF} title="Descargar informe PDF" style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",color:C.textSec,fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:FONT,flexShrink:0}} onMouseEnter={e=>{e.currentTarget.style.borderColor=C.primary+"66";e.currentTarget.style.color=C.primary;}} onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSec;}}><Download size={11}/>PDF</button>}
    </div>
    <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
      <input value={ediSearch} onChange={e=>setEdiSearch(e.target.value)} placeholder="Buscar por nombre, radicado, autoridad..." style={{flex:"1 1 280px",minWidth:220,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:FONT,outline:"none"}}/>
      {[
        {key:"todos",label:"Todos",color:C.primary},
        {key:"criticos",label:"Críticos",color:C.red},
        {key:"moderados",label:"Próximos",color:C.yellow},
        {key:"al_dia",label:"Al día",color:C.green},
      ].map(f=>(
        <button key={f.key} onClick={()=>setEdiFilter(f.key)} style={{background:ediFilter===f.key?f.color+"22":C.surfaceEl,border:`1px solid ${ediFilter===f.key?f.color:C.border}`,borderRadius:8,padding:"9px 14px",color:ediFilter===f.key?f.color:C.textSec,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:FONT}}>{f.label} <span style={{opacity:0.7,marginLeft:4}}>{counts[f.key]}</span></button>
      ))}
    </div>
    {instruments.length===0 ? (
      <div style={{background:C.surface,border:`1px dashed ${C.border}`,borderRadius:12,padding:"48px 24px",textAlign:"center"}}>
        <Layers size={36} color={C.textMuted} style={{marginBottom:12}}/>
        <div style={{fontSize:15,fontWeight:600,color:C.text,marginBottom:6}}>Aún no tienes EDIs</div>
        <div style={{fontSize:12,color:C.textSec,marginBottom:16}}>Usa el módulo INTAKE para cargar tu primer documento regulatorio.</div>
        <button onClick={()=>setView("intake")} style={{background:C.primary,border:"none",borderRadius:8,padding:"10px 20px",color:"#060c14",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Abrir INTAKE</button>
      </div>
    ) : filtered.length===0 ? (
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"32px 20px",textAlign:"center",fontSize:13,color:C.textSec}}>Ningún EDI coincide con el filtro.</div>
    ) : (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map(inst=>{
          const h=ediHealth(inst); const obs=ediObs(inst.id);
          const color=hC2(h); const bg=hB2(h);
          const venc=obs.filter(o=>derivedStatus(o)==="vencido").length;
          const prox=obs.filter(o=>derivedStatus(o)==="proximo").length;
          const aldia=obs.filter(o=>derivedStatus(o)==="al_dia").length;
          const label = inst.title || inst.project_name || inst.projects?.name || `${(inst.instrument_type||"Instrumento").replace(/_/g," ")} ${inst.number||""}`;
          return <div key={inst.id} onClick={()=>{setSelectedEDI(inst);setView("edi-detail");}} style={{background:C.surface,border:`1px solid ${h==="critico"?C.red+"44":C.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FileText size={19} color={color}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <span style={{fontSize:14,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</span>
                <StatusDot status={h}/>
              </div>
              <div style={{fontSize:11,color:C.textSec,marginBottom:6}}>
                Radicado: {inst.number||"—"} · {inst.authority_name||"Autoridad por determinar"} {inst.location_dept?`· ${inst.location_dept}`:""}
              </div>
              <div style={{display:"flex",gap:14,fontSize:11}}>
                {venc>0 && <span style={{color:C.red,fontWeight:600}}>● {venc} vencida(s)</span>}
                {prox>0 && <span style={{color:C.yellow,fontWeight:600}}>● {prox} próxima(s)</span>}
                {aldia>0 && <span style={{color:C.green}}>● {aldia} al día</span>}
                {obs.length===0 && <span style={{color:C.textMuted}}>Sin obligaciones registradas</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,display:"flex",alignItems:"center",gap:10}}>
              <Badge label={`${inst.completeness_pct||0}% completo`} color={(inst.completeness_pct||0)<80?C.yellow:C.green} bg={(inst.completeness_pct||0)<80?C.yellowDim:C.greenDim}/>
              <ChevronRight size={16} color={C.textSec}/>
            </div>
          </div>;
        })}
      </div>
    )}
  </div>;
};

const renderConsultorENARA = () => {
  if(!isSuperAdmin) return <div style={{padding:28,color:C.red}}>Acceso restringido a SuperAdmins de ENARA.</div>;
  const overdueC = consultorObligations.filter(o=>derivedStatus(o)==="vencido").length;
  const upcomingC = consultorObligations.filter(o=>derivedStatus(o)==="proximo").length;
  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",padding:28,gap:16,overflowY:"auto"}}>
      <div>
        <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Consultor ENARA</h1>
        <p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>Asistente legal junior por cliente · análisis y compliance</p>
      </div>

      {/* Zona A — Selector de cliente */}
      {(() => {
        const clientTypeBadge = (t) => {
          if(t==="enara_consulting") return <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.blue+"22",color:C.blue,textTransform:"uppercase",letterSpacing:"0.05em"}}>Consultoría</span>;
          if(t==="both") return <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.green+"22",color:C.green,textTransform:"uppercase",letterSpacing:"0.05em"}}>Suscriptor + Consultoría</span>;
          return <span style={{fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:4,background:C.primary+"22",color:C.primary,textTransform:"uppercase",letterSpacing:"0.05em"}}>VIGÍA</span>;
        };
        const filteredList = consultorOrgList.filter(o => {
          if(consultorFilter==="all") return true;
          if(consultorFilter==="vigia_subscriber") return o.client_type==="vigia_subscriber" || o.client_type==="both" || !o.client_type;
          if(consultorFilter==="enara_consulting") return o.client_type==="enara_consulting" || o.client_type==="both";
          return true;
        });
        const counts = {
          all: consultorOrgList.length,
          vigia_subscriber: consultorOrgList.filter(o=>o.client_type==="vigia_subscriber"||o.client_type==="both"||!o.client_type).length,
          enara_consulting: consultorOrgList.filter(o=>o.client_type==="enara_consulting"||o.client_type==="both").length,
        };
        if(!consultorOrg) return (
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,flexWrap:"wrap",gap:8}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em"}}>Selecciona un cliente</div>
              <div style={{display:"flex",gap:6}}>
                {[
                  {k:"all",l:"Todos",c:C.textSec},
                  {k:"vigia_subscriber",l:"Suscriptores VIGÍA",c:C.primary},
                  {k:"enara_consulting",l:"Solo consultoría",c:C.blue},
                ].map(f => { const active = consultorFilter===f.k; return (
                  <button key={f.k} onClick={()=>setConsultorFilter(f.k)} style={{background:active?`${f.c}22`:C.surfaceEl,border:`1px solid ${active?f.c+"66":C.border}`,borderRadius:6,padding:"4px 10px",color:active?f.c:C.textSec,fontSize:10,fontWeight:active?700:500,cursor:"pointer",fontFamily:FONT}}>{f.l} ({counts[f.k]})</button>
                ); })}
              </div>
            </div>
            {consultorOrgList.length===0 ? (
              <div style={{color:C.textMuted,fontSize:12,padding:"12px 0"}}>{consultorLoading?"Cargando…":"Sin clientes cargados aún."}</div>
            ) : filteredList.length===0 ? (
              <div style={{color:C.textMuted,fontSize:12,padding:"12px 0"}}>Sin clientes en este filtro.</div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:8}}>
                {filteredList.map(o=>(
                  <button key={o.id} onClick={()=>selectConsultorOrg(o.id)} disabled={consultorLoading} style={{textAlign:"left",background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",cursor:consultorLoading?"wait":"pointer",color:C.text,fontFamily:FONT}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
                      <div style={{fontSize:12,fontWeight:600,color:C.text,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name||"(sin nombre)"}</div>
                      {clientTypeBadge(o.client_type)}
                    </div>
                    <div style={{fontSize:10,color:C.textMuted,display:"flex",gap:6,flexWrap:"wrap"}}>
                      {o.nit && <span>NIT {o.nit}</span>}
                      {o.sector && <span>· {o.sector}</span>}
                      {(o.tier||o.plan) && o.client_type!=="enara_consulting" && <span style={{color:C.primary,fontWeight:600}}>· {o.tier||o.plan}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
        return (
          <div style={{background:C.surface,border:`1px solid ${C.green}55`,borderRadius:12,padding:"14px 18px",display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{width:34,height:34,borderRadius:8,background:C.greenDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Scale size={16} color={C.green}/></div>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:11,fontWeight:700,color:C.green,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Cliente activo</div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span>{consultorOrg.name}</span>
                  {clientTypeBadge(consultorOrg.client_type)}
                </div>
                <div style={{fontSize:11,color:C.textSec,marginTop:2,display:"flex",gap:8,flexWrap:"wrap"}}>
                  {consultorOrg.nit && <span>NIT {consultorOrg.nit}</span>}
                  {consultorOrg.sector && <span>· {consultorOrg.sector}</span>}
                  {(consultorOrg.tier||consultorOrg.plan) && consultorOrg.client_type!=="enara_consulting" && <span>· {consultorOrg.tier||consultorOrg.plan}</span>}
                </div>
              </div>
              <button onClick={()=>setConsultorEditingType(v=>!v)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",color:C.blue,fontSize:11,cursor:"pointer"}}>Editar tipo</button>
              <button onClick={()=>selectConsultorOrg(null)} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"6px 12px",color:C.textSec,fontSize:11,cursor:"pointer"}}>Cambiar cliente</button>
            </div>
            {consultorEditingType && (
              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em"}}>Cambiar tipo de cliente</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  {[
                    {v:"vigia_subscriber",l:"Suscriptor VIGÍA",c:C.primary},
                    {v:"enara_consulting",l:"Consultoría",c:C.blue},
                    {v:"both",l:"Ambos",c:C.green}
                  ].map(opt => { const active = consultorOrg.client_type === opt.v; return (
                    <button key={opt.v} onClick={()=>updateConsultorClientType(opt.v)} disabled={active} style={{background:active?`${opt.c}22`:C.surfaceEl,border:`1px solid ${active?opt.c+"66":C.border}`,borderRadius:6,padding:"8px 10px",color:active?opt.c:C.textSec,fontSize:11,fontWeight:active?700:500,cursor:active?"default":"pointer",fontFamily:FONT}}>{opt.l}{active && " ✓"}</button>
                  ); })}
                </div>
                <button onClick={()=>setConsultorEditingType(false)} style={{alignSelf:"flex-start",background:"transparent",border:"none",color:C.textMuted,fontSize:10,cursor:"pointer"}}>Cancelar</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Zona B — Contexto del cliente */}
      {consultorOrg && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
          <StatCard icon={Layers} label="EDIs activos" value={consultorInstruments.length} color={C.primary}/>
          <StatCard icon={AlertTriangle} label="Vencidas" value={overdueC} color={C.red}/>
          <StatCard icon={Clock} label="Próximas" value={upcomingC} color={C.yellow}/>
          <StatCard icon={FileText} label="Documentos" value={consultorDocuments.length} color={C.blue}/>
        </div>
      )}

      {consultorOrg && consultorInstruments.length>0 && (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>EDIs del cliente ({consultorInstruments.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {consultorInstruments.slice(0,5).map(i=>(
              <div key={i.id} style={{padding:"6px 10px",background:C.surfaceEl,borderRadius:6,fontSize:11,color:C.text,display:"flex",gap:8,flexWrap:"wrap"}}>
                {i.title ? (
                  <span style={{fontWeight:600,color:C.text}}>{i.title.slice(0,80)}</span>
                ) : (
                  <>
                    <span style={{color:C.primary,fontWeight:600,textTransform:"uppercase"}}>{i.instrument_type||"EDI"}</span>
                    {i.number && <span>· {i.number}</span>}
                    {i.project_name && <span style={{color:C.textSec}}>· {i.project_name.slice(0,60)}</span>}
                  </>
                )}
                {i.edi_status && <span style={{marginLeft:"auto",color:C.textMuted}}>{i.edi_status}</span>}
              </div>
            ))}
            {consultorInstruments.length>5 && <div style={{fontSize:10,color:C.textMuted,padding:"4px 10px"}}>… y {consultorInstruments.length-5} más</div>}
          </div>
        </div>
      )}

      {/* Métricas de actividad */}
      {consultorOrg && consultorMetrics.length > 0 && (()=>{
        const total = consultorMetrics.length;
        const tokens = consultorMetrics.reduce((s,q)=>s+(q.tokens_used||0),0);
        const lastDate = consultorMetrics[0]?.created_at;
        const now = new Date();
        const thisMonth = consultorMetrics.filter(q=>{ const d=new Date(q.created_at); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).length;
        return <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px"}}>
          <div style={{fontSize:10,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Actividad</div>
          <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
            {[["Consultas totales",total],["Este mes",thisMonth],["Tokens usados",tokens.toLocaleString("es-CO")],["Última actividad",lastDate?new Date(lastDate).toLocaleDateString("es-CO",{day:"numeric",month:"short"}):"—"]].map(([l,v])=>(
              <div key={l}><div style={{fontSize:16,fontWeight:700,color:C.text}}>{v}</div><div style={{fontSize:10,color:C.textMuted}}>{l}</div></div>
            ))}
          </div>
        </div>;
      })()}

      {/* Zona C — Chat en contexto del cliente */}
      {consultorOrg && (
        <div style={{flex:1,minHeight:340,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flex:1,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
            {consultorBotMessages.map((msg,i)=>(
              <div key={i} style={{display:"flex",flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-start",gap:10}}>
                {msg.role!=="user"&&<div style={{width:26,height:26,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Scale size={12} color={C.primary}/></div>}
                <div style={{maxWidth:"80%",background:msg.role==="user"?C.primaryDim:C.surfaceEl,border:`1px solid ${msg.role==="user"?C.primary+"44":C.border}`,borderRadius:msg.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"10px 14px"}}>
                  {msg.role==="system"&&<div style={{fontSize:10,color:C.green,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>Consultor ENARA</div>}
                  {msg.role==="assistant" ? <MarkdownText text={msg.text}/> : <div style={{fontSize:13,color:C.text,lineHeight:1.6,whiteSpace:"pre-wrap"}}>{msg.text}</div>}
                  {msg.role==="assistant" && Array.isArray(msg.sources) && msg.sources.length>0 && (
                    <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.textMuted}}>
                      {msg.sources.length} fuente{msg.sources.length!==1?"s":""} · {msg.capas?.documentos_org>0 && <span style={{color:C.green,fontWeight:600}}>{msg.capas.documentos_org} documento{msg.capas.documentos_org!==1?"s":""} del cliente</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {consultorBotLoading && (
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:26,height:26,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Scale size={12} color={C.primary}/></div>
                <div style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:"4px 12px 12px 12px",padding:"10px 14px",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:C.primary,animation:"pulse 1.2s infinite",animationDelay:`${i*0.25}s`}}/>)}</div>
              </div>
            )}
          </div>
          <div style={{padding:"10px 14px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end"}}>
            <textarea value={consultorBotInput} onChange={e=>setConsultorBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendConsultorBot();}}} placeholder={`Consulta sobre ${consultorOrg.name}…`} style={{flex:1,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:13,fontFamily:FONT,resize:"none",minHeight:40,maxHeight:120,outline:"none",lineHeight:1.5}} rows={1}/>
            <button onClick={sendConsultorBot} disabled={consultorBotLoading||!consultorBotInput.trim()} style={{background:consultorBotLoading||!consultorBotInput.trim()?C.surfaceEl:C.primary,border:"none",borderRadius:8,padding:"10px 14px",cursor:"pointer"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={consultorBotLoading||!consultorBotInput.trim()?C.textMuted:"#060c14"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}

      {/* Zona D — Notas del cliente (solo ENARA) */}
      {consultorOrg && (
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"14px 18px",display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.08em"}}>Notas del cliente ({consultorNotes.length})</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {["consulta_resuelta","pendiente_revisión","alerta_vencimiento","acción_tomada","oportunidad_upsell","reunión_programada"].map(tag => {
              const active = consultorNoteTags.includes(tag);
              const tagColor = tag.startsWith("alerta")?C.red:tag.startsWith("oportunidad")?C.green:tag.startsWith("pendiente")?C.yellow:C.blue;
              return (
                <button key={tag} onClick={()=>setConsultorNoteTags(p => active ? p.filter(t=>t!==tag) : [...p,tag])} style={{background:active?`${tagColor}22`:C.surfaceEl,border:`1px solid ${active?tagColor+"66":C.border}`,borderRadius:12,padding:"3px 10px",color:active?tagColor:C.textSec,fontSize:10,fontWeight:active?700:500,cursor:"pointer",fontFamily:FONT}}>{tag}</button>
              );
            })}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            <textarea value={consultorNoteInput} onChange={e=>setConsultorNoteInput(e.target.value)} placeholder={`Escribe una nota sobre ${consultorOrg.name}…`} style={{flex:1,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",color:C.text,fontSize:12,fontFamily:FONT,resize:"vertical",minHeight:60,outline:"none",lineHeight:1.5}}/>
            <button onClick={saveConsultorNote} disabled={consultorNoteLoading || !consultorNoteInput.trim()} style={{background:consultorNoteLoading||!consultorNoteInput.trim()?C.surfaceEl:C.primary,border:"none",borderRadius:8,padding:"9px 16px",color:consultorNoteLoading||!consultorNoteInput.trim()?C.textMuted:"#060c14",fontSize:12,fontWeight:700,cursor:consultorNoteLoading||!consultorNoteInput.trim()?"not-allowed":"pointer",fontFamily:FONT}}>{consultorNoteLoading?"…":"Guardar"}</button>
          </div>
          {consultorNotes.length > 0 && (
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:10,display:"flex",flexDirection:"column",gap:8}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Historial</div>
              {consultorNotes.map(n => (
                <div key={n.id} style={{background:C.surfaceEl,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",fontSize:10,color:C.textMuted,marginBottom:4,flexWrap:"wrap"}}>
                    <span>{new Date(n.created_at).toLocaleString("es-CO",{dateStyle:"medium",timeStyle:"short"})}</span>
                    {Array.isArray(n.tags) && n.tags.map(tag => {
                      const tagColor = tag.startsWith("alerta")?C.red:tag.startsWith("oportunidad")?C.green:tag.startsWith("pendiente")?C.yellow:C.blue;
                      return <span key={tag} style={{background:`${tagColor}22`,color:tagColor,fontSize:9,fontWeight:700,padding:"1px 6px",borderRadius:3}}>{tag}</span>;
                    })}
                  </div>
                  <div style={{fontSize:12,color:C.text,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{n.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const renderView=()=>{ const intakeOrg = (isSuperAdmin && consultorOrg) ? consultorOrg : clientOrg; const intakeInstruments = (isSuperAdmin && consultorOrg) ? consultorInstruments : instruments; const intakeObligations = (isSuperAdmin && consultorOrg) ? consultorObligations : obligations; if(view==="superadmin")return <SuperAdminModule reviewerId={session?.user?.id} sessionToken={session?.access_token}/>; if(view==="myteam")return <MyTeamModule orgId={clientOrg?.id} orgName={clientOrg?.name} limiteUsuarios={clientOrg?.limite_usuarios} sessionToken={session?.access_token}/>; if(view==="orgprofile")return <OrgProfileModule clientOrg={clientOrg} sessionToken={session?.access_token} userId={session?.user?.id}/>; if(view==="intake")return <IntakeModule onNewAlert={handleNewAlert} onNewNorm={handleNewNorm} clientOrg={intakeOrg} sessionToken={session?.access_token} instruments={intakeInstruments} obligations={intakeObligations} onNewInstrument={inst=>{ if(isSuperAdmin && consultorOrg) { setConsultorInstruments(p=>[inst,...p]); } else { setInstruments(p=>[inst,...p]); setLastSync(new Date()); refreshDashboardData(); } }} onNewObligation={obs=>{ if(isSuperAdmin && consultorOrg) { setConsultorObligations(p=>[...obs,...p]); } else { setObligations(p=>[...obs,...p]); setLastSync(new Date()); refreshDashboardData(); } }} onObligationUpdate={ob=>{ if(isSuperAdmin && consultorOrg) { setConsultorObligations(p=>p.map(o=>o.id===ob.id?ob:o)); } else { setObligations(p=>p.map(o=>o.id===ob.id?ob:o)); setLastSync(new Date()); } }}/>; if(view==="edis")return renderEDIs(); if(view==="edi-detail")return renderEDIDetail(); if(view==="inteligencia")return renderInteligencia(); if(view==="consultar")return renderConsultar(); if(view==="normativa")return renderNormativa(); if(view==="oversight")return renderOversight(); if(view==="soporte")return <SupportModule clientOrg={clientOrg} session={session}/>; if(view==="consultor-enara") return renderConsultorENARA(); return renderDashboard(); };

return (
<div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:FONT,color:C.text,overflow:"hidden",paddingTop:isDemoMode?32:0}}>
{isDemoMode && <div style={{position:"fixed",top:0,left:0,right:0,zIndex:1000,background:`linear-gradient(90deg,${C.primary},#0a9e82)`,color:"#060c14",padding:"6px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:11,fontWeight:700,height:32}}>
  <span>MODO DEMO · {demoQueriesLeft > 0 ? `${demoQueriesLeft} consulta${demoQueriesLeft!==1?"s":""} real${demoQueriesLeft!==1?"es":""} restante${demoQueriesLeft!==1?"s":""}` : "Consultas agotadas"}</span>
  <div style={{display:"flex",gap:12,alignItems:"center"}}>
    <span style={{fontWeight:400,opacity:0.8}}>¿Acceso real?</span>
    <a href="mailto:info@enaraconsulting.com.co" style={{color:"#060c14",fontWeight:700,background:"rgba(0,0,0,0.15)",borderRadius:4,padding:"2px 8px",textDecoration:"none"}}>info@enaraconsulting.com.co</a>
  </div>
</div>}
<style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
{showOnboarding && !isSuperAdmin && (
<div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(6,12,20,0.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:32,maxWidth:520,width:"100%",boxShadow:"0 20px 60px rgba(0,0,0,0.5)"}}>
  <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
    <button onClick={()=>{setShowOnboarding(false);localStorage.setItem("vigia_onboarded","1");}} style={{background:"transparent",border:"none",color:C.textMuted,fontSize:11,cursor:"pointer"}}>Saltar por ahora</button>
  </div>
  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:24}}>
    {[1,2,3].map(s=>(
      <React.Fragment key={s}>
        <div style={{width:28,height:28,borderRadius:"50%",background:onboardingStep>=s?C.primary:C.surfaceEl,border:`2px solid ${onboardingStep>=s?C.primary:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:onboardingStep>=s?"#060c14":C.textMuted}}>{s}</div>
        {s<3&&<div style={{flex:1,height:2,background:onboardingStep>s?C.primary:C.border,borderRadius:1}}/>}
      </React.Fragment>
    ))}
  </div>

  {onboardingStep===1 && <>
    <div style={{width:48,height:48,borderRadius:12,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}><Shield size={24} color={C.primary}/></div>
    <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:8}}>Bienvenido a VIGÍA</div>
    <div style={{fontSize:13,color:C.textSec,marginBottom:20,lineHeight:1.6}}>Tu plataforma de inteligencia regulatoria ambiental. En 3 pasos vas a tener todo configurado.</div>
    <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:24}}>
      {[
        ["Gestionar tus Expedientes Digitales Inteligentes (EDIs)"],
        ["Monitorear obligaciones ambientales en tiempo real"],
        ["Consultar 365 normas y 147 sentencias con IA"],
        ["Recibir alertas antes de que venzan tus obligaciones"]
      ].map(([t],i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:10,fontSize:12,color:C.text}}>
          <CheckCircle size={14} color={C.green}/> {t}
        </div>
      ))}
    </div>
    <button onClick={()=>setOnboardingStep(2)} style={{width:"100%",background:C.primary,border:"none",borderRadius:8,padding:"12px",color:"#060c14",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Empezar →</button>
  </>}

  {onboardingStep===2 && <>
    <div style={{width:48,height:48,borderRadius:12,background:C.blueDim||C.surfaceEl,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}><Upload size={24} color={C.blue}/></div>
    <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:8}}>Tu primer Expediente Digital</div>
    <div style={{fontSize:13,color:C.textSec,marginBottom:16,lineHeight:1.6}}>VIGÍA gestiona tus instrumentos ambientales: licencias, permisos, concesiones y resoluciones.</div>
    <div style={{background:C.surfaceEl,borderRadius:10,padding:"14px 16px",marginBottom:20}}>
      <div style={{fontSize:11,fontWeight:700,color:C.primary,textTransform:"uppercase",marginBottom:8}}>INTAKE analiza con IA y extrae:</div>
      {["Tipo de instrumento y número de radicado","Autoridad emisora y fechas","Obligaciones y plazos detectados"].map((t,i)=>(
        <div key={i} style={{fontSize:12,color:C.text,marginBottom:4,paddingLeft:12,borderLeft:`2px solid ${C.primary}44`}}>{t}</div>
      ))}
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={()=>{setShowOnboarding(false);setView("intake");localStorage.setItem("vigia_onboarded","1");}} style={{flex:1,background:C.primary,border:"none",borderRadius:8,padding:"12px",color:"#060c14",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Ir a INTAKE →</button>
      <button onClick={()=>setOnboardingStep(3)} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",color:C.textSec,fontSize:13,cursor:"pointer",fontFamily:FONT}}>Lo hago después</button>
    </div>
  </>}

  {onboardingStep===3 && <>
    <div style={{width:48,height:48,borderRadius:12,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:16}}><MessageSquare size={24} color={C.primary}/></div>
    <div style={{fontSize:20,fontWeight:700,color:C.text,marginBottom:8}}>Consulta el corpus normativo</div>
    <div style={{fontSize:13,color:C.textSec,marginBottom:16,lineHeight:1.6}}>El motor de consulta de VIGÍA tiene acceso a 365 normas ambientales colombianas, 147 sentencias y tus propios documentos.</div>
    <div style={{background:C.surfaceEl,borderRadius:10,padding:"14px 16px",marginBottom:20,fontStyle:"italic",fontSize:13,color:C.text,lineHeight:1.5,borderLeft:`3px solid ${C.primary}`}}>
      "¿Cuáles son las obligaciones de monitoreo de una licencia ambiental de energía solar?"
    </div>
    <div style={{display:"flex",gap:10}}>
      <button onClick={()=>{setShowOnboarding(false);setView("consultar");setBotInput("¿Cuáles son mis obligaciones de monitoreo ambiental?");localStorage.setItem("vigia_onboarded","1");}} style={{flex:1,background:C.primary,border:"none",borderRadius:8,padding:"12px",color:"#060c14",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:FONT}}>Ir a Consultar →</button>
      <button onClick={()=>{setShowOnboarding(false);localStorage.setItem("vigia_onboarded","1");}} style={{flex:1,background:"transparent",border:`1px solid ${C.border}`,borderRadius:8,padding:"12px",color:C.textSec,fontSize:13,cursor:"pointer",fontFamily:FONT}}>Lo hago después</button>
    </div>
  </>}
</div>
</div>
)}
{isMobile && sidebarOpen && <div onClick={()=>setSidebarOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:199}}/>}
<div style={{width:224,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",...(isMobile?{position:"fixed",left:0,top:0,bottom:0,zIndex:200,transform:sidebarOpen?"translateX(0)":"translateX(-100%)",transition:"transform 0.25s ease",boxShadow:sidebarOpen?"4px 0 24px rgba(0,0,0,0.5)":"none"}:{})}}>
<div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`}}>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.primary},#0a9e82)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Shield size={17} color="#fff"/></div>
<div><div style={{fontSize:16,fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>VIGIA</div><div style={{fontSize:9,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.12em",marginTop:1}}>Inteligencia Regulatoria</div><div style={{fontSize:9,color:C.primary,fontWeight:700,marginTop:2}}>v3.9.45</div></div>
</div>
</div>
<nav style={{flex:1,padding:"10px 8px"}}>
{navItems.map(({key,icon:Icon,label,badge,sub})=>{ const active=view===key||(key==="edis"&&view==="edi-detail"); return <button key={key} onClick={()=>{setView(key);if(isMobile)setSidebarOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,marginBottom:2,background:active?C.primaryDim:"transparent",border:active?`1px solid ${C.primary}33`:"1px solid transparent",color:active?C.primary:C.textSec,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:active?600:400,fontFamily:FONT}}><Icon size={15}/><span style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}><span>{label}</span>{sub&&<span style={{fontSize:9,color:C.green,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sub}</span>}</span>{badge>0&&<span style={{background:C.red,color:"#fff",borderRadius:8,padding:"1px 7px",fontSize:9,fontWeight:700}}>{badge}</span>}</button>; })}
</nav>
<div style={{padding:"10px 12px",borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
<div style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",borderRadius:6,background:dbStatus==="connected"?C.greenDim:C.yellowDim}}>
<div style={{width:6,height:6,borderRadius:"50%",background:dbStatus==="connected"?C.green:C.yellow,flexShrink:0}}/>
<span style={{fontSize:10,color:dbStatus==="connected"?C.green:C.yellow,fontWeight:600}}>{dbStatus==="connected"?"Supabase conectado":"Datos de prueba reales"}</span>
</div>
</div>
<div style={{padding:"12px 14px"}}>
<div style={{display:"flex",alignItems:"center",gap:8}}>
<div style={{width:30,height:30,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><span style={{fontSize:12,fontWeight:700,color:C.primary}}>JR</span></div>
<div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.text}}>{session?.user?.email?.split("@")[0]||"Usuario"}</div><div style={{fontSize:9,color:C.textSec}}>{isSuperAdmin?"ENARA Consulting":(clientOrg?.name||"Sin organización")}</div></div>{isDemoMode ? <a href="/" style={{fontSize:10,color:C.primary,textDecoration:"none",fontWeight:600}}>← Salir demo</a> : <button onClick={handleLogout} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",color:C.textSec,fontSize:10,cursor:"pointer"}}>Salir</button>}
</div>
</div>
</div>
<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
<div style={{height:50,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",flexShrink:0,background:C.bg,position:"sticky",top:0,zIndex:10,gap:8}}>
{isMobile && <button onClick={()=>setSidebarOpen(p=>!p)} style={{background:"transparent",border:"none",cursor:"pointer",color:C.text,padding:4,flexShrink:0}}><Menu size={20}/></button>}
<div style={{position:"relative",width:isMobile?undefined:300,flex:isMobile?1:undefined}}>
<div style={{display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${globalSearchOpen?C.primary+"66":C.border}`,borderRadius:8,padding:"6px 12px"}}>
<Search size={13} color={C.textMuted}/>
<input value={globalSearch} onChange={e=>{setGlobalSearch(e.target.value);setGlobalSearchOpen(e.target.value.length>=2);}} onFocus={()=>{if(globalSearch.length>=2)setGlobalSearchOpen(true);}} onBlur={()=>setTimeout(()=>setGlobalSearchOpen(false),150)} onKeyDown={e=>{if(e.key==="Escape"){setGlobalSearch("");setGlobalSearchOpen(false);}}} placeholder="Buscar en EDIs, obligaciones, normas..." style={{border:"none",background:"transparent",outline:"none",fontSize:12,color:C.text,fontFamily:FONT,width:"100%"}}/>
{globalSearch&&<button onClick={()=>{setGlobalSearch("");setGlobalSearchOpen(false);}} style={{background:"transparent",border:"none",cursor:"pointer",color:C.textMuted,padding:0,display:"flex"}}><X size={12}/></button>}
</div>
{globalSearchOpen&&(()=>{
  const q=globalSearch.toLowerCase();
  const results=[];
  instruments.forEach(inst=>{
    const t=[inst.title,inst.project_name,inst.number,inst.instrument_type,inst.authority_name].filter(Boolean).join(" ").toLowerCase();
    if(t.includes(q)) results.push({type:"edi",label:inst.title||inst.project_name||inst.number,sub:`${(inst.instrument_type||"").replace(/_/g," ")} · ${inst.number||""}`,action:()=>{setSelectedEDI(inst);setView("edi-detail");setGlobalSearch("");setGlobalSearchOpen(false);}});
  });
  obligations.forEach(ob=>{
    const t=[ob.name,ob.description,ob.obligation_num,ob.norma_fundamento].filter(Boolean).join(" ").toLowerCase();
    if(t.includes(q)) results.push({type:"obligación",label:ob.name||ob.obligation_num,sub:`${ob.obligation_num||""} · ${ob.status||""}`,action:()=>{setView("edis");setGlobalSearch("");setGlobalSearchOpen(false);}});
  });
  if(Array.isArray(normSources)) normSources.slice(0,200).forEach(n=>{
    const t=[n.norm_title,n.norm_number,n.norm_type,n.issuing_body].filter(Boolean).join(" ").toLowerCase();
    if(t.includes(q)) results.push({type:"norma",label:n.norm_title||`${n.norm_type} ${n.norm_number}`,sub:`${n.norm_type||""} ${n.norm_number||""}/${n.norm_year||""}`,action:()=>{setSelectedNorm(n.id);setView("normativa");setGlobalSearch("");setGlobalSearchOpen(false);}});
  });
  const r=results.slice(0,8);
  return <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,boxShadow:"0 8px 32px rgba(0,0,0,0.4)",zIndex:100,overflow:"hidden"}}>
    {r.length===0?<div style={{padding:"12px 16px",fontSize:12,color:C.textMuted}}>Sin resultados para "{globalSearch}"</div>:r.map((res,i)=>(<div key={i} onClick={res.action} style={{padding:"10px 16px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12}} onMouseEnter={e=>e.currentTarget.style.background=C.surfaceEl} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <span style={{fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:4,background:res.type==="edi"?C.primary+"22":res.type==="norma"?C.blue+"22":C.yellow+"22",color:res.type==="edi"?C.primary:res.type==="norma"?C.blue:C.yellow,textTransform:"uppercase",flexShrink:0}}>{res.type}</span>
      <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:600,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{res.label}</div><div style={{fontSize:10,color:C.textMuted}}>{res.sub}</div></div>
    </div>))}
    {r.length>0&&<div style={{padding:"6px 16px",fontSize:10,color:C.textMuted,borderTop:`1px solid ${C.border}`}}>{r.length} resultado{r.length!==1?"s":""}</div>}
  </div>;
})()}
</div>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{display:"flex",alignItems:"center",gap:5,background:C.greenDim,border:`1px solid ${C.green}33`,borderRadius:6,padding:"4px 10px"}}><RefreshCw size={10} color={C.green}/><span style={{fontSize:10,color:C.green,fontWeight:600}}>{instruments.length} EDIs - {obligations.length} obligaciones - {alerts.length} alertas - {normSources.length} normas</span></div>
<button style={{background:"transparent",border:"none",cursor:"pointer",padding:4,position:"relative"}}><Bell size={16} color={C.textSec}/>{unreadAlerts>0&&<span style={{position:"absolute",top:0,right:0,width:8,height:8,background:C.red,borderRadius:"50%",border:`2px solid ${C.bg}`}}/>}</button>
</div>
</div>
<div style={{flex:1}}>{renderView()}</div>
</div>
</div>
);
}