import React, { useState, useEffect } from "react";
import { Bell, FileText, AlertTriangle, CheckCircle, Clock, Search, ChevronRight, Shield, MessageSquare, BookOpen, Database, TrendingUp, Eye, BarChart2, Zap, RefreshCw, Layers, Mail, X, Upload, ArrowDown, ArrowUp, Scale, Gavel, FileCheck } from "lucide-react";

const SB_URL = "https://itkbujkqjesuntgdkubt.supabase.co";
const SB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV";
const sb = async (table, params="") => {
const token = session?.access_token || SB_KEY;
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

const sbGetSession = async () => {
  // Check localStorage for existing session
  const raw = localStorage.getItem("vigia_session");
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (session.expires_at && Date.now() / 1000 > session.expires_at) {
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

const sbInsert = async (table, data) => {
await fetch(`${SB_URL}/rest/v1/${table}`, { method:"POST", headers:{ apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, "Content-Type":"application/json", Prefer:"return=minimal" }, body:JSON.stringify(data) });
};

// --- DESIGN TOKENS ------------------------------------------------------------
const C = { bg:"#060c14",surface:"#0c1523",surfaceEl:"#101d30",border:"#162236",primary:"#00c9a7",primaryDim:"rgba(0,201,167,0.10)",text:"#d8e6f0",textSec:"#5e7a95",textMuted:"#3a5270",red:"#ff4d6d",redDim:"rgba(255,77,109,0.12)",yellow:"#f7c948",yellowDim:"rgba(247,201,72,0.12)",green:"#2ec986",greenDim:"rgba(46,201,134,0.12)",blue:"#4d9fff",blueDim:"rgba(77,159,255,0.10)",purple:"#a78bfa",purpleDim:"rgba(167,139,250,0.10)" };
const FONT = "'Poppins','Segoe UI',sans-serif";

// --- HELPERS ------------------------------------------------------------------
const StatusDot = ({status,size=8}) => { const color=status==="vencido"||status==="critico"?C.red:status==="proximo"||status==="moderado"?C.yellow:C.green; return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}88`,flexShrink:0}}/>; };
const Badge = ({label,color,bg}) => <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600,letterSpacing:"0.06em",color,background:bg,textTransform:"uppercase",flexShrink:0}}>{label}</span>;
const ImpactBadge = ({impact}) => { const m={derogatoria:{c:C.red,b:C.redDim},ampliatoria:{c:C.red,b:C.redDim},prospectiva:{c:C.yellow,b:C.yellowDim},interpretativa:{c:C.blue,b:C.blueDim}}[impact]||{c:C.textSec,b:C.surfaceEl}; return <Badge label={impact} color={m.c} bg={m.b}/>; };
const StatCard = ({icon:Icon,label,value,color,sub}) => <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:10,background:`${color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={18} color={color}/></div><div><div style={{fontSize:22,fontWeight:700,color:C.text,lineHeight:1}}>{value}</div><div style={{fontSize:11,color:C.textSec,marginTop:3}}>{label}</div>{sub&&<div style={{fontSize:10,color,marginTop:1}}>{sub}</div>}</div></div>;

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

// --- SEED DATA ----------------------------------------------------------------
const SEED = {
instruments: [
{ id:"c1000000-0000-0000-0000-000000000001", number:"786/2016", instrument_type:"licencia_ambiental", domain:"ambiental", authority_level:"regional", edi_status:"activo", completeness_pct:75, projects:{ name:"Parque Solar AS I - Baranoa", location_dept:"Atlantico", location_mun:"Baranoa" } },
{ id:"c2000000-0000-0000-0000-000000000002", number:"556/2017", instrument_type:"licencia_ambiental", domain:"ambiental", authority_level:"regional", edi_status:"activo", completeness_pct:60, projects:{ name:"Parque Solar AS II - Polonuevo", location_dept:"Atlantico", location_mun:"Polonuevo" } },
],
obligations: [
{ id:"o1", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-04", name:"Informe de Cumplimiento Ambiental (ICA) Semestral", obligation_type:"reporte_periodico", frequency:"semestral", due_date:"2026-03-15", status:"vencido", confidence_level:"alta",
fuente:{ tipo:"administrativa", tipo_acto:"Licencia Ambiental", numero_acto:"786", fecha:"2016-05-12", autoridad_competente:"AUTORIDAD COMPETENTE - Regional", radicado:"2016-786-CRA", objeto:"Obligacion de reporte semestral del ICA para seguimiento de condiciones de la licencia ambiental" }
},
{ id:"o2", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-07", name:"Monitoreo Calidad del Recurso Hidrico", obligation_type:"monitoreo_ambiental", frequency:"trimestral", due_date:"2026-04-25", status:"proximo", confidence_level:"alta",
fuente:{ tipo:"normativa", tipo_norma:"Decreto", numero:"1076", articulo:"Art. 2.2.9.6.1.3", parrafo:"Parr. 2", fecha_expedicion:"2015-05-26", autoridad_emisora:"Ministerio de Ambiente y Desarrollo Sostenible", vigencia:"Vigente" }
},
{ id:"o3", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-11", name:"Compensacion Forestal - Fase II", obligation_type:"compensacion", frequency:"unica", due_date:"2026-06-30", status:"proximo", confidence_level:"media",
fuente:{ tipo:"administrativa", tipo_acto:"Auto de seguimiento", numero_acto:"034", fecha:"2026-03-28", autoridad_competente:"AUTORIDAD COMPETENTE - Regional", radicado:"2026-034-CRA", objeto:"Requerimiento de ejecucion Fase II compensacion forestal area N1, ecosistema seco tropical" }
},
{ id:"o4", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-03", name:"Pago Tasa Retributiva", obligation_type:"obligacion_financiera", frequency:"anual", due_date:"2026-04-30", status:"proximo", confidence_level:"alta",
fuente:{ tipo:"normativa", tipo_norma:"Ley", numero:"99", articulo:"Art. 42", parrafo:"Inc. 1", fecha_expedicion:"1993-12-22", autoridad_emisora:"Congreso de Colombia", vigencia:"Vigente" }
},
{ id:"o5", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-02", name:"Monitoreo Calidad del Aire", obligation_type:"monitoreo_ambiental", frequency:"trimestral", due_date:"2026-07-15", status:"al_dia", confidence_level:"alta",
fuente:{ tipo:"jurisprudencial", tribunal:"Consejo de Estado - Seccion Primera", numero_sentencia:"CE-SP-2024-0892", fecha:"2024-11-15", magistrado_ponente:"Dra. Maria Fernanda Ospina", ratio_decidendi:"Los parametros de calidad del aire del Decreto 1076/2015 son exigibles aunque el instrumento no los mencione expresamente, en virtud del principio de integralidad normativa ambiental.", aplicabilidad:"Aplica a OBL-02 - los parametros minimos del protocolo 0226/2026 son exigibles" }
},
{ id:"o6", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-08", name:"Informe de Gestion Social", obligation_type:"reporte_periodico", frequency:"anual", due_date:"2026-09-30", status:"al_dia", confidence_level:"alta",
fuente:{ tipo:"administrativa", tipo_acto:"Licencia Ambiental", numero_acto:"786", fecha:"2016-05-12", autoridad_competente:"AUTORIDAD COMPETENTE - Regional", radicado:"2016-786-CRA", objeto:"Obligacion de reporte anual de gestion social con comunidades del area de influencia directa" }
},
],
alerts: [
{ id:"a1", norm_title:"Modificacion al procedimiento de reporte periodico de cumplimiento ambiental", norm_type:"resolucion", norm_date:"2026-04-08", issuing_authority:"AUTORIDAD COMPETENTE - Nivel Nacional", impact_type:"derogatoria", urgency:"critica", summary:"El instrumento normativo modifica los plazos y formatos del reporte periodico para proyectos de energia no convencional en operacion.", detailed_analysis:"Reduce el plazo de reporte de 60 a 45 dias calendario. Aplica a proyectos de generacion electrica superior a 1 MW.", suggested_action:"Actualizar calendario OBL-04 y descargar nuevo formato.", confidence_pct:94, human_validated:false,
fuente_norma:{ tipo_norma:"Resolucion", numero:"0445", fecha_expedicion:"2026-04-08", autoridad_emisora:"Ministerio de Ambiente", vigencia:"Vigente" },
proposed_changes:[{ obligation_num:"OBL-04", field:"plazo_presentacion", before:"60 dias calendario", after:"45 dias calendario", reason:"Art. 3 Resolucion 0445/2026 modifica expresamente el plazo para proyectos de energia no convencional" }]
},
{ id:"a2", norm_title:"Proyecto normativo sobre compensaciones ambientales - En consulta publica", norm_type:"proyecto_normativo", norm_date:"2026-04-02", issuing_authority:"AUTORIDAD COMPETENTE - Nivel Nacional", impact_type:"prospectiva", urgency:"moderada", summary:"De aprobarse, modificaria los coeficientes de compensacion para proyectos con afectacion vegetal superior a 5 hectareas.", detailed_analysis:"Propone incrementar coeficiente de 1:1 a 1:1.5 para ecosistemas secos tropicales.", suggested_action:"Revisar alcance OBL-11 y presentar comentarios antes del cierre de consulta publica.", confidence_pct:78, human_validated:false,
fuente_norma:{ tipo_norma:"Proyecto de Resolucion", numero:"EN CONSULTA", fecha_expedicion:"2026-04-02", autoridad_emisora:"Ministerio de Ambiente", vigencia:"En consulta publica" },
proposed_changes:[]
},
{ id:"a3", norm_title:"Sentencia - Alcance de obligaciones de monitoreo sin parametro expreso", norm_type:"sentencia_tribunal", norm_date:"2026-03-28", issuing_authority:"Tribunal Contencioso Administrativo", impact_type:"interpretativa", urgency:"informativa", summary:"Cuando el instrumento no especifica el parametro de medicion, aplican los estandares de la norma ambiental sectorial vigente.", detailed_analysis:"Los parametros minimos del Decreto 1076/2015 son exigibles aunque el acto no los mencione expresamente.", suggested_action:"Verificar que OBL-07 y OBL-02 incluyan los minimos del Decreto 1076/2015.", confidence_pct:89, human_validated:true,
fuente_norma:{ tribunal:"Tribunal Contencioso Administrativo - Sala Ambiental", numero_sentencia:"TCA-SA-2026-0234", fecha:"2026-03-28", magistrado_ponente:"Dr. Carlos Augusto Reyes", ratio_decidendi:"Los estandares normativos sectoriales son exigibles por integracion normativa aunque el acto administrativo no los mencione expresamente." },
proposed_changes:[]
},
],
normSources: [
{ id:"n1", norm_type:"decreto", norm_number:"1076", norm_title:"Decreto Unico Reglamentario del Sector Ambiente y Desarrollo Sostenible", issuing_body:"Ministerio de Ambiente", issue_date:"2015-05-26", is_active:true },
{ id:"n2", norm_type:"ley", norm_number:"99", norm_title:"Ley 99 de 1993 - Sistema Nacional Ambiental (SINA)", issuing_body:"Congreso de Colombia", issue_date:"1993-12-22", is_active:true },
{ id:"n3", norm_type:"ley", norm_number:"2387", norm_title:"Ley de Transicion Energetica", issuing_body:"Congreso de Colombia", issue_date:"2024-07-18", is_active:true },
{ id:"n4", norm_type:"resolucion", norm_number:"0226", norm_title:"Protocolo de monitoreo de calidad del aire - 2026", issuing_body:"AUTORIDAD COMPETENTE", issue_date:"2026-01-15", is_active:true },
],
oversight: [
{ id:"ov1", severity:"critico", anomaly_type:"vencimiento_pasado", title:"Obligacion vencida sin evidencia de cumplimiento: OBL-04", description:"La obligacion ICA Semestral vencio el 2026-03-15 sin que se haya registrado evidencia de cumplimiento.", legal_reference:"Art. 8 - Instrumento N. 786/2016", suggested_action:"Verificar si el reporte fue presentado y registrar la evidencia, o presentarlo a la mayor brevedad.", confidence_pct:96, status:"activo" }
]
};

// --- INTAKE CONSTANTS ---------------------------------------------------------
const INTAKE_EDIS = [];
const INTAKE_OBLIGATIONS = [];
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
function IntakeModule({ onNewAlert, onNewNorm, clientOrg, sessionToken, onNewInstrument, onNewObligation }) {
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
  const token = sessionToken || SB_SERVICE;
  const r = await fetch(SB_URL+"/rest/v1/"+table, {
    method:"POST",
    headers:{apikey:SB_KEY, Authorization:"Bearer "+token, "Content-Type":"application/json", Prefer:"return=representation"},
    body:JSON.stringify(body)
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {error:t}; }
};

const saveToSupabase = async (analysisResult, file) => {
  if(!clientOrg?.id) return null;
  const orgId = clientOrg.id;
  const now = new Date().toISOString().split("T")[0];

  // 1. Create or find instrument
  let instrId = null;
  try {
    const instrPayload = {
      org_id: orgId,
      instrument_type: analysisResult.doc_nature === "norma" ? "Norma" : (analysisResult.candidate_edi || "Acto Administrativo"),
      number: analysisResult.radicado || "SIN-RADICADO-"+Date.now(),
      issue_date: analysisResult.doc_date || now,
      authority_name: analysisResult.sender || "Por determinar",
      domain: clientOrg.sector || "ambiental",
      edi_status: "activo",
      completeness_pct: analysisResult.candidate_confidence || 60,
      has_confidential_sections: false,
      ingested_at: new Date().toISOString()
    };
    const instrRes = await sbPost("instruments", instrPayload);
    if(Array.isArray(instrRes) && instrRes[0]?.id) {
      instrId = instrRes[0].id;
      if(onNewInstrument) onNewInstrument(instrRes[0]);
    }
  } catch(e) { console.log("instrument save error", e); }

  // 2. Save document record
  if(instrId) {
    try {
      const docPayload = {
        org_id: orgId,
        instrument_id: instrId,
        original_name: file.name,
        file_type: file.type || "application/octet-stream",
        file_size_kb: Math.round(file.size/1024),
        doc_role: analysisResult.doc_nature || "otro",
        doc_label: analysisResult.subject || file.name,
        accessibility: "restringido",
        ocr_status: "procesado",
        extracted_text: analysisResult.content_summary || ""
      };
      await sbPost("documents", docPayload);
    } catch(e) { console.log("document save error", e); }

    // 3. Save extracted obligations
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
            frequency: "unica",
            due_date: dl ? null : null,
            status: "al_dia",
            confidence_level: analysisResult.candidate_confidence > 70 ? "alta" : "media",
            ai_interpretation: "Extraída automáticamente por VIGÍA INTAKE v2.3",
            requires_human_validation: analysisResult.requires_confirmation || false,
            has_regulatory_update: analysisResult.is_norma || false
          };
          const obRes = await sbPost("obligations", obPayload);
          if(Array.isArray(obRes) && obRes[0]) newObs.push(obRes[0]);
        } catch(e) { console.log("obligation save error", e); }
      }
      if(newObs.length > 0 && onNewObligation) onNewObligation(newObs);
    }
  }
  return instrId;
};

const analyzeDocument = async (file) => {
setUploadState("analyzing");
setAnalysisStep(0);
const isPDF = file.type==="application/pdf"||file.name.toLowerCase().endsWith(".pdf");
const isImage = file.type.startsWith("image/");
const canRead = isPDF||isImage;
let base64Data = null;
if(canRead) {
try {
base64Data = await new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(r.result.split(",")[1]); r.onerror=reject; r.readAsDataURL(file); });
} catch { base64Data=null; }
}
for(let i=1;i<=5;i++){ await new Promise(r=>setTimeout(r,500)); setAnalysisStep(i); }

const SYSTEM = `Eres el motor de ingestion documental de VIGIA, plataforma de inteligencia regulatoria ambiental colombiana.

EDIs activos: ${INTAKE_EDIS.map(e=>`${e.name} (Instrumento No. ${e.number})`).join(", ")}.
Obligaciones activas: ${INTAKE_OBLIGATIONS.map(o=>`${o.num}: ${o.name}`).join(", ")}.
IMPORTANTE: Si el documento es una norma (ley, decreto, resolucion, circular, sentencia), identificalo como tal y extrae sus metadatos normativos completos. Las normas deben agregarse a la base normativa Y generar alertas regulatorias Y proponer cambios a las obligaciones afectadas.
Responde SOLO en JSON:
{"doc_nature":"norma|acto_administrativo|jurisprudencia|comunicacion|evidencia_cumplimiento|documento_tecnico|otro","is_norma":true,"sender":"emisor","receiver":"destinatario","doc_date":"YYYY-MM-DD","radicado":"numero o null","subject":"asunto exacto","content_summary":"resumen 2-3 oraciones","actions_detected":["crea_obligacion|modifica_obligacion|confirma_cumplimiento|inicia_sancion|requiere_respuesta|amplia_plazo|aprueba_tramite|agrega_a_normativa|genera_alerta|informativo"],"obligations_affected":["OBL-04|OBL-07|OBL-11|OBL-03"],"deadlines_found":["plazos detectados"],"candidate_edi":"nombre EDI o null","candidate_confidence":0-100,"matching_reasons":["razon"],"urgency":"critica|moderada|informativa","requires_confirmation":false,"confirmation_questions":[],"recommended_classification":"como clasificar","norma_data":{"tipo_norma":"Ley|Decreto|Resolucion|Circular|Sentencia|Proyecto","numero":"numero","fecha_expedicion":"YYYY-MM-DD","autoridad_emisora":"quien la expidio","vigencia":"Vigente|Derogada|En consulta publica","articulos_relevantes":["Art. X - descripcion"]},"proposed_changes":[{"obligation_num":"OBL-XX","field":"campo a cambiar","before":"valor actual","after":"nuevo valor","reason":"articulo que lo sustenta"}],"fuente":{"tipo":"normativa|jurisprudencial|administrativa","tipo_norma":"si aplica","numero":"numero","articulo":"articulo","parrafo":"parrafo","fecha_expedicion":"fecha","autoridad_emisora":"autoridad","vigencia":"vigencia","tribunal":"si es jurisprudencia","numero_sentencia":"si aplica","magistrado_ponente":"si aplica","ratio_decidendi":"si aplica","tipo_acto":"si es administrativa","numero_acto":"numero","fecha":"fecha","autoridad_competente":"autoridad","radicado":"radicado","objeto":"objeto del acto"}}`;

try {
  let content;
  if(canRead&&base64Data) {
    if(isPDF) content=[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64Data}},{type:"text",text:`Analiza este documento para VIGIA. Identifica si es una norma. Nombre: "${file.name}"`}];
    else content=[{type:"image",source:{type:"base64",media_type:file.type,data:base64Data}},{type:"text",text:`Analiza este documento para VIGIA. Nombre: "${file.name}"`}];
  } else {
    content=`Analiza por nombre: "${file.name}" (${(file.size/1024/1024).toFixed(1)} MB)`;
  }
  const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1500,system:SYSTEM,messages:[{role:"user",content}]})});
  const data=await res.json();
  const text=data.content?.[0]?.text||"{}";
  const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
  setAnalysisResult({...parsed,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:canRead&&base64Data!==null});
} catch {
  setAnalysisResult({doc_nature:"otro",is_norma:false,sender:"Por determinar",receiver:"C.I. Energia Solar S.A.S.",doc_date:null,radicado:null,subject:file.name.replace(/\.[^/.]+$/,"").replace(/_/g," "),content_summary:"No se pudo procesar el documento.",actions_detected:["informativo"],obligations_affected:[],deadlines_found:[],candidate_edi:null,candidate_confidence:30,matching_reasons:["Error de procesamiento"],urgency:"informativa",requires_confirmation:true,confirmation_questions:[{question:"Tipo de documento?",options:Object.values(DOC_TYPES).map(t=>t.label)}],recommended_classification:"Clasificar manualmente.",norma_data:null,proposed_changes:[],fuente:null,file_name:file.name,file_type:file.name.split(".").pop(),file_size:`${(file.size/1024/1024).toFixed(1)} MB`,ocr_used:false});
}
setUploadState("result");

};

const applyChange = (idx) => {
setPendingChanges(p=>p.map((c,i)=>i===idx?{...c,applied:true}:c));
};

const processAndLink = () => {
if(!analysisResult) return;
const edi=INTAKE_EDIS.find(e=>e.name===analysisResult.candidate_edi);
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
    <input ref={fileRef} type="file" accept="*/*" style={{display:"none"}} onChange={e=>e.target.files?.[0]&&analyzeDocument(e.target.files[0])}/>
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
              <span style={{color:I.textMuted}}>-></span>
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
                <span style={{color:I.textMuted}}>-></span>
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
          <CheckCircle size={14}/> {analysisResult.is_norma?"Agregar a normativa y generar alertas":"Procesar y vincular al EDI"}
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
                          <span style={{fontWeight:600}}>{ch.obligation_num}</span>: {ch.before} -> <span style={{color:I.green}}>{ch.after}</span>
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
  const [email, setEmail] = React.useState("demo@vigia.co");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const handleLogin = async () => {
    if (!email || !password) { setError("Completa todos los campos"); return; }
    setLoading(true); setError("");
    const result = await sbLogin(email, password);
    if (result.ok) {
      onLogin(result.session);
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  const L = { bg:"#060c14",surface:"#0c1523",surfaceEl:"#101d30",border:"#162236",primary:"#00c9a7",primaryDim:"rgba(0,201,167,0.10)",text:"#d8e6f0",textSec:"#5e7a95",red:"#ff4d6d" };

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

        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:L.textSec,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Correo electrónico</div>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="correo@empresa.co"
            style={{width:"100%",background:L.surfaceEl,border:`1px solid ${L.border}`,borderRadius:8,padding:"10px 14px",color:L.text,fontSize:13,fontFamily:"inherit",outline:"none"}}
          />
        </div>

        <div style={{marginBottom:24}}>
          <div style={{fontSize:11,color:L.textSec,marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>Contraseña</div>
          <input
            type="password"
            value={password}
            onChange={e=>setPassword(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&handleLogin()}
            placeholder="••••••••"
            style={{width:"100%",background:L.surfaceEl,border:`1px solid ${L.border}`,borderRadius:8,padding:"10px 14px",color:L.text,fontSize:13,fontFamily:"inherit",outline:"none"}}
          />
        </div>

        {error&&<div style={{background:"rgba(255,77,109,0.10)",border:"1px solid rgba(255,77,109,0.3)",borderRadius:8,padding:"10px 14px",fontSize:12,color:L.red,marginBottom:16}}>{error}</div>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{width:"100%",background:loading?L.surfaceEl:L.primary,border:"none",borderRadius:8,padding:"12px",color:loading?"#5e7a95":"#060c14",fontSize:14,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit"}}
        >
          {loading?"Verificando...":"Iniciar sesión"}
        </button>

        <div style={{marginTop:20,padding:"12px 14px",background:L.primaryDim,borderRadius:8,fontSize:11,color:L.primary}}>
          Demo: demo@vigia.co / Vigia2026!
        </div>
      </div>
    </div>
  );
}


// ─── SUPERADMIN v2.1.1 ───────────────────────────────────────────────────────────────
const SB_SERVICE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0a2J1amtxamVzdW50Z2RrdWJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTk1NzIyNywiZXhwIjoyMDkxNTMzMjI3fQ.0wdZfTZ0Ar-Wys99pxqMACBt7xfBwJdkFW5sNp6ka2Q";
const SB_ADMIN_URL = "https://itkbujkqjesuntgdkubt.supabase.co";
const SUPERADMIN_EMAILS = ["demo@vigia.co","admin@enara.co"];

const adminFetch = async (path, method, body, prefer) => {
  const h = {apikey:SB_SERVICE, Authorization:"Bearer "+SB_SERVICE, "Content-Type":"application/json"};
  if(prefer) h["Prefer"] = prefer;
  const opts = {method:method||"GET", headers:h};
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(SB_ADMIN_URL+path, opts);
  const t = await r.text();
  try { return JSON.parse(t); } catch { return {raw:t,status:r.status}; }
};


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

function SuperAdminModule() {
  const [tab, setTab] = React.useState("overview");
  const [users, setUsers] = React.useState([]);
  const [orgs, setOrgs] = React.useState([]);
  const [stats, setStats] = React.useState({users:0,orgs:0,obligations:0,alerts:0});
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  const [newUser, setNewUser] = React.useState({email:"",password:"",org_id:"",role:"viewer"});
  const [setupLog, setSetupLog] = React.useState([]);
  const [newOrg, setNewOrg] = React.useState({tipo_persona:"juridica",plan:"prueba",nivel_confidencialidad:"estandar",acepta_terminos:true,consentimiento_datos:true,limite_edis:5,limite_usuarios:4,limite_intake_mes:100,pais_datos:"Colombia"});
  const [newOrgMsg, setNewOrgMsg] = React.useState(null);
  const [newOrgSaving, setNewOrgSaving] = React.useState(false);
  const [newOrgCreated, setNewOrgCreated] = React.useState(null);
  const [orgUsers, setOrgUsers] = React.useState([{email:"",password:"Vigia2026!",role:"editor"}]);
  const [addingUsers, setAddingUsers] = React.useState(false);
  const [usersLog, setUsersLog] = React.useState([]);
  const [setupRunning, setSetupRunning] = React.useState(false);
  const [setupDone, setSetupDone] = React.useState(false);
  const A = C;

  const load = async () => {
    setLoading(true);
    try {
      const [ur,or2,ob,al] = await Promise.all([
        adminFetch("/auth/v1/admin/users?page=1&per_page=50"),
        adminFetch("/rest/v1/organizations?select=*"),
        adminFetch("/rest/v1/obligations?select=id"),
        adminFetch("/rest/v1/regulatory_alerts?select=id"),
      ]);
      const ul = ur.users||(Array.isArray(ur)?ur:[]);
      setUsers(ul);
      setOrgs(Array.isArray(or2)?or2:[]);
      setStats({users:ur.total||ul.length,orgs:Array.isArray(or2)?or2.length:0,obligations:Array.isArray(ob)?ob.length:0,alerts:Array.isArray(al)?al.length:0});
    } catch(e) { setMsg({t:"error",m:e.message}); }
    setLoading(false);
  };

  React.useEffect(function() { load(); }, []);

  const addLog = function(m,t) { setSetupLog(function(p) { return [...p,{m:m,t:t||"info",ts:new Date().toLocaleTimeString("es-CO")}]; }); };

  const runSetup = async function() {
    setSetupRunning(true); setSetupLog([]); setSetupDone(false);
    try {
      addLog("Creando Energia Renovable Demo S.A.S...");
      var r1 = await adminFetch("/rest/v1/organizations","POST",{id:"b1000000-0000-0000-0000-000000000001",name:"Energia Renovable Demo S.A.S.",nit:"901234567-1",tier:"free",risk_profile:"estándar",city:"Bogota",sector:"energia",ciudad:"Bogota",departamento:"Cundinamarca",tipo_persona:"juridica",representante_legal:"Ana Maria Torres Herrera",contacto_vigia:"Carlos Mendez",cargo_contacto:"Coordinador HSE",plan:"prueba",plan_estado:"activo",limite_edis:5,limite_usuarios:4,limite_intake_mes:100,acepta_terminos:true,consentimiento_datos:true,pais_datos:"Colombia"},"resolution=merge-duplicates,return=representation");
      if(r1 && !r1.error && !r1.raw) { addLog("Energia Renovable Demo - OK","success"); }
      else { addLog("Energia ERROR: "+JSON.stringify(r1).slice(0,120),"error"); }

      addLog("Creando Mineria Verde Demo Ltda...");
      var r2 = await adminFetch("/rest/v1/organizations","POST",{id:"b2000000-0000-0000-0000-000000000002",name:"Mineria Verde Demo Ltda.",nit:"800987654-2",tier:"free",risk_profile:"cauteloso",city:"Medellin",sector:"mineria",ciudad:"Medellin",departamento:"Antioquia",tipo_persona:"juridica",representante_legal:"Roberto Calderon Pinto",contacto_vigia:"Sandra Rios",cargo_contacto:"Directora Ambiental",plan:"prueba",plan_estado:"activo",limite_edis:5,limite_usuarios:4,limite_intake_mes:100,acepta_terminos:true,consentimiento_datos:true,pais_datos:"Colombia",nivel_confidencialidad:"critico"},"resolution=merge-duplicates,return=representation");
      if(r2 && !r2.error && !r2.raw) { addLog("Mineria Verde Demo - OK","success"); }
      else { addLog("Mineria ERROR: "+JSON.stringify(r2).slice(0,120),"error"); }

      var usersToCreate = [
        {email:"admin@enara.co",password:"Vigia2026!",org_id:null,role:"superadmin"},
        {email:"consulta1@demo-energia.co",password:"Vigia2026!",org_id:"b1000000-0000-0000-0000-000000000001",role:"viewer"},
        {email:"onboarding1@demo-energia.co",password:"Vigia2026!",org_id:"b1000000-0000-0000-0000-000000000001",role:"editor"},
        {email:"consulta2@demo-mineria.co",password:"Vigia2026!",org_id:"b2000000-0000-0000-0000-000000000002",role:"viewer"},
        {email:"onboarding2@demo-mineria.co",password:"Vigia2026!",org_id:"b2000000-0000-0000-0000-000000000002",role:"editor"},
      ];
      for(var i=0;i<usersToCreate.length;i++) {
        var u = usersToCreate[i];
        addLog("Creando "+u.email+"...");
        var ur = await adminFetch("/auth/v1/admin/users","POST",{email:u.email,password:u.password,email_confirm:true});
        if(!ur.id){ addLog("ERROR: "+(ur.message||JSON.stringify(ur).slice(0,60)),"error"); continue; }
        if(u.org_id && u.role !== "superadmin") {
          await adminFetch("/rest/v1/user_org_map","POST",{user_id:ur.id,org_id:u.org_id,role:u.role},"resolution=merge-duplicates,return=minimal");
        }
        addLog(u.email+" ("+u.role+") - OK","success");
      }
      addLog("SETUP COMPLETO","success");
      setSetupDone(true);
      load();
    } catch(e) { addLog("Error: "+e.message,"error"); }
    setSetupRunning(false);
  };

  const createUser = async function() {
    if(!newUser.email||!newUser.password||!newUser.org_id){ setMsg({t:"error",m:"Completa todos los campos"}); return; }
    setLoading(true); setMsg(null);
    var ur = await adminFetch("/auth/v1/admin/users","POST",{email:newUser.email,password:newUser.password,email_confirm:true});
    if(!ur.id){ setMsg({t:"error",m:ur.message||JSON.stringify(ur)}); setLoading(false); return; }
    await adminFetch("/rest/v1/user_org_map","POST",{user_id:ur.id,org_id:newUser.org_id,role:newUser.role},"resolution=merge-duplicates,return=minimal");
    setMsg({t:"success",m:"Usuario "+newUser.email+" creado OK"});
    setNewUser({email:"",password:"",org_id:"",role:"viewer"});
    load(); setLoading(false);
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
      var ur = await adminFetch("/auth/v1/admin/users","POST",{email:u.email,password:u.password,email_confirm:true});
      if(!ur.id){ log.push({m:"ERROR "+u.email+": "+(ur.message||JSON.stringify(ur).slice(0,60)),t:"error"}); setUsersLog([...log]); continue; }
      await adminFetch("/rest/v1/user_org_map","POST",{user_id:ur.id,org_id:newOrgCreated.id,role:u.role},"resolution=merge-duplicates,return=minimal");
      log.push({m:u.email+" ("+u.role+") — OK",t:"success"});
      setUsersLog([...log]);
    }
    log.push({m:"Proceso completado",t:"success"});
    setUsersLog([...log]);
    setAddingUsers(false);
    load();
  };
  const resetNewOrg = function() {
    setNewOrgCreated(null); setNewOrgMsg(null);
    setNewOrg({tipo_persona:"juridica",plan:"prueba",nivel_confidencialidad:"estandar",acepta_terminos:true,consentimiento_datos:true,limite_edis:5,limite_usuarios:4,limite_intake_mes:100,pais_datos:"Colombia"});
    setOrgUsers([{email:"",password:"Vigia2026!",role:"editor"}]);
    setUsersLog([]);
  };

  const saveNewOrg = async function() {
    if(!newOrg.name||!newOrg.nit||!newOrg.representante_legal||!newOrg.sector||!newOrg.ciudad||!newOrg.contacto_vigia){
      setNewOrgMsg({t:"error",m:"Completa los campos obligatorios (*)"});
      return;
    }
    if(!newOrg.acepta_terminos||!newOrg.consentimiento_datos){
      setNewOrgMsg({t:"error",m:"El cliente debe aceptar términos y consentimiento de datos"});
      return;
    }
    setNewOrgSaving(true); setNewOrgMsg(null);
    var payload = Object.assign({},newOrg,{
      tier:"free", risk_profile:"estándar",
      country:"CO", city:newOrg.ciudad,
      plan_estado:"activo",
      fecha_aceptacion_terminos:new Date().toISOString(),
      version_terminos:"1.0"
    });
    var r = await adminFetch("/rest/v1/organizations","POST",payload,"resolution=merge-duplicates,return=representation");
    if(r && r.error){
      var errMsg = r.error.message||JSON.stringify(r);
      if(errMsg.includes("nit_key")||errMsg.includes("unique")) errMsg = "Ya existe una organización con ese NIT. Verifícalo.";
      setNewOrgMsg({t:"error",m:errMsg});
    } else if(Array.isArray(r)&&r[0]){
      setNewOrgCreated(r[0]);
      setNewOrgMsg({t:"success",m:"Organización '"+r[0].name+"' creada exitosamente."});
      load();
    } else {
      setNewOrgMsg({t:"error",m:"Error inesperado: "+JSON.stringify(r).slice(0,100)});
    }
    setNewOrgSaving(false);
  };

    var tabs = [{k:"overview",l:"Overview"},{k:"users",l:"Usuarios"},{k:"orgs",l:"Organizaciones"},{k:"neworg",l:"+ Nueva Org"},{k:"create",l:"Crear usuario"},{k:"setup",l:"Setup Demo"}];

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

      {tab==="orgs"&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {orgs.map(function(o){ return <div key={o.id} style={{background:A.surface,border:"1px solid "+A.border,borderRadius:10,padding:"14px 18px"}}>
            <div style={{fontSize:13,fontWeight:600,color:A.text,marginBottom:4}}>{o.name}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {o.nit&&<span style={{fontSize:10,color:A.textSec}}>NIT: {o.nit}</span>}
              {o.sector&&<span style={{fontSize:10,color:A.blue}}>{o.sector}</span>}
              {o.plan&&<span style={{fontSize:10,color:A.primary,fontWeight:600}}>{o.plan}</span>}
              {o.ciudad&&<span style={{fontSize:10,color:A.textMuted}}>{o.ciudad}</span>}
            </div>
          </div>; })}
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
            {orgs.length===0?<div style={{fontSize:12,color:A.yellow,padding:"10px 14px",background:A.yellowDim,borderRadius:8}}>Ejecuta Setup Demo primero.</div>:(
              <select value={newUser.org_id} onChange={function(e){ var v=e.target.value; setNewUser(function(p){ return Object.assign({},p,{org_id:v}); }); }} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"10px 14px",color:A.text,fontSize:13,outline:"none"}}>
                <option value="">Selecciona una organizacion...</option>
                {orgs.map(function(o){ return <option key={o.id} value={o.id}>{o.name} ({o.plan||"prueba"})</option>; })}
              </select>
            )}
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

      {tab==="neworg"&&(
        <div style={{maxWidth:680}}>
          <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:28}}>
            <div style={{fontSize:16,fontWeight:700,color:A.text,marginBottom:4}}>Nueva organización cliente</div>
            <div style={{fontSize:12,color:A.textSec,marginBottom:24}}>Completa todos los campos para activar al cliente en VIGÍA.</div>

            {newOrgMsg&&<div style={{background:newOrgMsg.t==="success"?A.greenDim:A.redDim,border:"1px solid "+(newOrgMsg.t==="success"?A.green:A.red)+"44",borderRadius:8,padding:"10px 14px",fontSize:12,color:newOrgMsg.t==="success"?A.green:A.red,marginBottom:16}}>{newOrgMsg.m}</div>}

            {/* SECCIÓN 1: Datos básicos */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Datos básicos</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:20}}>
              {[["Razón social / Nombre *","name","text"],["NIT *","nit","text"],["Representante legal *","representante_legal","text"],["Email corporativo","email_corporativo","email"],["Teléfono","telefono","text"],["CIIU","ciiu","text"]].map(function(f){ return (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type={f[2]} value={newOrg[f[1]]||""} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ); })}
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Tipo persona *</div>
                <select value={newOrg.tipo_persona||"juridica"} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{tipo_persona:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
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
              <div>
                <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Plan *</div>
                <select value={newOrg.plan||"prueba"} onChange={function(e){var v=e.target.value;setNewOrg(function(p){return Object.assign({},p,{plan:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none"}}>
                  <option value="prueba">Prueba (30 días)</option>
                  <option value="basico">Básico</option>
                  <option value="profesional">Profesional</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>
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

            {/* SECCIÓN 4: Configuración */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Configuración de cuenta</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14,marginBottom:20}}>
              {[["Límite EDIs","limite_edis",5],["Límite usuarios","limite_usuarios",4],["Intake/mes","limite_intake_mes",100]].map(function(f){ return (
                <div key={f[1]}>
                  <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>{f[0]}</div>
                  <input type="number" value={newOrg[f[1]]!==undefined?newOrg[f[1]]:f[2]} onChange={function(e){var v=parseInt(e.target.value);setNewOrg(function(p){return Object.assign({},p,{[f[1]]:v});});}} style={{width:"100%",background:A.surfaceEl,border:"1px solid "+A.border,borderRadius:8,padding:"9px 12px",color:A.text,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
                </div>
              ); })}
            </div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:11,color:A.textSec,marginBottom:5,fontWeight:600}}>Nivel de confidencialidad</div>
              <div style={{display:"flex",gap:8}}>
                {["estandar","sensible","critico"].map(function(n){ return <button key={n} onClick={function(){setNewOrg(function(p){return Object.assign({},p,{nivel_confidencialidad:n});});}} style={{background:(newOrg.nivel_confidencialidad||"estandar")===n?A.primaryDim:A.surfaceEl,border:"1px solid "+((newOrg.nivel_confidencialidad||"estandar")===n?A.primary+"44":A.border),borderRadius:6,padding:"7px 18px",color:(newOrg.nivel_confidencialidad||"estandar")===n?A.primary:A.textSec,fontSize:12,cursor:"pointer"}}>{n.charAt(0).toUpperCase()+n.slice(1)}</button>; })}
              </div>
            </div>

            {/* SECCIÓN 5: Términos */}
            <div style={{fontSize:11,fontWeight:700,color:A.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12,paddingBottom:6,borderBottom:"1px solid "+A.border}}>Términos y consentimiento</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
              {[["acepta_terminos","Acepta términos y condiciones de VIGÍA"],["consentimiento_datos","Autoriza tratamiento de datos personales (Ley 1581/2012)"]].map(function(f){ return (
                <label key={f[0]} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                  <div onClick={function(){setNewOrg(function(p){return Object.assign({},p,{[f[0]]:!p[f[0]]});});}} style={{width:18,height:18,borderRadius:4,border:"2px solid "+(newOrg[f[0]]?A.primary:A.border),background:newOrg[f[0]]?A.primary:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {newOrg[f[0]]&&<svg width="10" height="8" viewBox="0 0 10 8"><polyline points="1,4 4,7 9,1" fill="none" stroke="#060c14" strokeWidth="2"/></svg>}
                  </div>
                  <span style={{fontSize:12,color:A.textSec}}>{f[1]}</span>
                </label>
              ); })}
            </div>

            {!newOrgCreated && (
              <button onClick={saveNewOrg} disabled={newOrgSaving} style={{width:"100%",background:newOrgSaving?A.surfaceEl:A.primary,border:"none",borderRadius:8,padding:"13px",color:newOrgSaving?"#5e7a95":"#060c14",fontSize:14,fontWeight:700,cursor:newOrgSaving?"not-allowed":"pointer"}}>
                {newOrgSaving?"Creando organización...":"Crear organización y activar cliente"}
              </button>
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


      {tab==="setup"&&(
        <div style={{maxWidth:520}}>
          <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:14,padding:24,marginBottom:16}}>
            <div style={{fontSize:15,fontWeight:700,color:A.text,marginBottom:8}}>Setup ambiente de prueba</div>
            <div style={{fontSize:12,color:A.textSec,lineHeight:1.6,marginBottom:16}}>Crea las 2 organizaciones y los 5 usuarios de prueba. Password para todos: Vigia2026!</div>
            <div style={{background:A.surfaceEl,borderRadius:8,padding:"10px 14px",marginBottom:16}}>
              {[["admin@enara.co","superadmin","ENARA (sin org)"],["consulta1@demo-energia.co","viewer","Energia Renovable Demo"],["onboarding1@demo-energia.co","editor","Energia Renovable Demo"],["consulta2@demo-mineria.co","viewer","Mineria Verde Demo"],["onboarding2@demo-mineria.co","editor","Mineria Verde Demo"]].map(function(item){ return <div key={item[0]} style={{display:"flex",gap:8,marginBottom:5,alignItems:"center",fontSize:11}}><span style={{padding:"1px 6px",borderRadius:3,fontSize:10,fontWeight:600,background:item[1]==="editor"?A.primaryDim:item[1]==="superadmin"?A.redDim:A.surfaceEl,color:item[1]==="editor"?A.primary:item[1]==="superadmin"?A.red:A.textSec}}>{item[1]}</span><span style={{color:A.text}}>{item[0]}</span><span style={{color:A.textMuted}}>- {item[2]}</span></div>; })}
            </div>
            <button onClick={runSetup} disabled={setupRunning||setupDone} style={{width:"100%",background:setupDone?A.greenDim:setupRunning?A.surfaceEl:A.red,border:"1px solid "+(setupDone?A.green:A.red)+"44",borderRadius:8,padding:"12px",color:setupDone?A.green:setupRunning?A.textSec:"#fff",fontSize:14,fontWeight:700,cursor:setupRunning||setupDone?"not-allowed":"pointer"}}>{setupDone?"Setup completado":setupRunning?"Ejecutando...":"Ejecutar setup demo"}</button>
          </div>
          {setupLog.length>0&&(
            <div style={{background:A.surface,border:"1px solid "+A.border,borderRadius:10,padding:"12px 16px",maxHeight:280,overflowY:"auto"}}>
              {setupLog.map(function(l,i){ return <div key={i} style={{fontSize:11,color:l.t==="success"?A.green:l.t==="error"?A.red:A.textSec,marginBottom:3,display:"flex",gap:8}}><span style={{color:A.textMuted,flexShrink:0}}>{l.ts}</span><span>{l.m}</span></div>; })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VIGIAApp() {
const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(()=>{
    sbGetSession().then(async s=>{
      setSession(s);
      setAuthLoading(false);
      if(s?.user?.id) {
        try {
          const h = {apikey:SB_SERVICE, Authorization:"Bearer "+SB_SERVICE};
          const mr = await fetch(SB_ADMIN_URL+"/rest/v1/user_org_map?user_id=eq."+s.user.id+"&select=org_id", {headers:h});
          const md = await mr.json();
          if(md?.[0]?.org_id){
            const or2 = await fetch(SB_ADMIN_URL+"/rest/v1/organizations?id=eq."+md[0].org_id+"&select=id,name,sector,plan,ciudad", {headers:h});
            const od = await or2.json();
            if(od?.[0]) setClientOrg(od[0]);
          }
        } catch(e){ console.log("org session err",e); }
      }
    });
  },[]);

  const handleLogout = () => { sbLogout(); setSession(null); };

  const [view, setView] = useState("dashboard");
const [selectedEDI, setSelectedEDI] = useState(null);
const [instruments, setInstruments] = useState([]);
const [obligations, setObligations] = useState([]);
const [alerts, setAlerts] = useState([]);
const [normSources, setNormSources] = useState([]);
const [oversight, setOversight] = useState([]);
const [dbStatus, setDbStatus] = useState("demo");
const [clientOrg, setClientOrg] = useState(null);
const [lastSync, setLastSync] = useState(null);
const [botInput, setBotInput] = useState("");
const [botMessages, setBotMessages] = useState([{role:"system",text:"VIGIA activo. Datos de C.I. Energia Solar cargados. Selecciona fuentes y escribe tu consulta."}]);
const [botLoading, setBotLoading] = useState(false);
const [sources, setSources] = useState({documentos:true,normativa:true,jurisprudencia:false,validacion:false});

useEffect(()=>{
const tryConnect = async () => {
try {
const [inst,obs,alrt,norms]=await Promise.all([sb("instruments","select=*,projects(name,location_dept,location_mun)&order=created_at.desc"),sb("obligations","select=*&order=due_date.asc"),sb("regulatory_alerts","select=*&order=norm_date.desc"),sb("normative_sources","select=*&is_active=eq.true")]);
// Load data regardless of count
          setInstruments(Array.isArray(inst)?inst:[]);
          const enriched = (Array.isArray(obs)?obs:[]).map(ob => {
            const seedOb = SEED.obligations.find(s => s.obligation_num === ob.obligation_num || s.id === ob.id);
            return seedOb?.fuente ? {...ob, fuente: seedOb.fuente} : ob;
          });
          setObligations(enriched);
          setAlerts(Array.isArray(alrt)?alrt:[]);
          setNormSources(Array.isArray(norms)?norms:[]);
          setDbStatus("connected");
          setLastSync(new Date());
          // Fetch client org (always, even with 0 EDIs)
          try {
            const uid = session?.user?.id;
            const h = {apikey:SB_SERVICE,Authorization:"Bearer "+SB_SERVICE};
            const mapR = await fetch(SB_ADMIN_URL+"/rest/v1/user_org_map?user_id=eq."+uid+"&select=org_id", {headers:h});
            const mapData = await mapR.json();
            if(mapData?.[0]?.org_id) {
              const orgR = await fetch(SB_ADMIN_URL+"/rest/v1/organizations?id=eq."+mapData[0].org_id+"&select=id,name,sector,plan,ciudad", {headers:h});
              const orgData = await orgR.json();
              if(orgData?.[0]) setClientOrg(orgData[0]);
            }
          } catch(e) { console.log("org fetch err",e); }
} catch { setDbStatus("demo"); }
};
if(session) tryConnect();
},[session]);

const overdue=obligations.filter(o=>o.status==="vencido").length;
const upcoming=obligations.filter(o=>o.status==="proximo"||o.status==="proximo").length;
const compliant=obligations.filter(o=>o.status==="al_dia"||o.status==="al_dia").length;
const unreadAlerts=alerts.filter(a=>!a.human_validated).length;
const ediHealth=(inst)=>{ const obs=obligations.filter(o=>o.instrument_id===inst.id); if(obs.some(o=>o.status==="vencido"))return"critico"; if(obs.some(o=>o.status==="proximo"||o.status==="proximo"))return"moderado"; return"al_dia"; };
const ediObs=(id)=>obligations.filter(o=>o.instrument_id===id);
const toggleSource=(k)=>setSources(p=>({...p,[k]:!p[k]}));
const conf=()=>{ const a=Object.values(sources).filter(Boolean).length; if(a===0)return{label:"Sin fuentes",color:C.red,risk:"ROJO"}; if(sources.validacion)return{label:"Maxima precision con revision humana",color:C.green,risk:"VERDE"}; if(sources.documentos&&sources.normativa&&sources.jurisprudencia)return{label:"Alta precision - riesgo bajo",color:C.green,risk:"VERDE"}; if(sources.documentos&&sources.normativa)return{label:"Precision moderada",color:C.yellow,risk:"AMARILLO"}; return{label:"Precision limitada",color:C.yellow,risk:"AMARILLO"}; };

const handleNewAlert=(analysisResult)=>{
const newAlert={id:`al_${Date.now()}`,norm_title:analysisResult.subject,norm_type:analysisResult.norma_data?.tipo_norma?.toLowerCase()||"resolucion",norm_date:analysisResult.doc_date||new Date().toISOString().split("T")[0],issuing_authority:analysisResult.sender,impact_type:analysisResult.proposed_changes?.length>0?"derogatoria":"interpretativa",urgency:analysisResult.urgency==="critica"?"critica":analysisResult.urgency==="moderada"?"moderada":"informativa",summary:analysisResult.content_summary,detailed_analysis:analysisResult.norma_data?.articulos_relevantes?.join(". ")||"",suggested_action:"Revisar los cambios propuestos y aplicar los que correspondan.",confidence_pct:analysisResult.candidate_confidence,human_validated:false,fuente_norma:analysisResult.norma_data,proposed_changes:analysisResult.proposed_changes||[]};
setAlerts(p=>[newAlert,...p]);
};

const handleNewNorm=(analysisResult)=>{
if(!analysisResult.norma_data) return;
const newNorm={id:`n_${Date.now()}`,norm_type:analysisResult.norma_data.tipo_norma?.toLowerCase()||"resolucion",norm_number:analysisResult.norma_data.numero||"",norm_title:analysisResult.subject,issuing_body:analysisResult.norma_data.autoridad_emisora||analysisResult.sender,issue_date:analysisResult.norma_data.fecha_expedicion||analysisResult.doc_date,is_active:true};
setNormSources(p=>[newNorm,...p]);
};

const sendBot=async()=>{
if(!botInput.trim()||botLoading)return;
const userMsg={role:"user",text:botInput};
setBotMessages(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
const layers=Object.entries(sources).filter(([,v])=>v).map(([k])=>({documentos:"Capa 1",normativa:"Capa 2 - Normativa",jurisprudencia:"Capa 2 - Jurisprudencia",validacion:"Capa 3 - Validacion humana"}[k])).join(", ");
const obsCtx=obligations.map(o=>`${o.obligation_num||o.num} - ${o.name} (${o.status}, vence ${o.due_date})`).join("; ");
const normCtx=normSources.map(n=>`${n.norm_type} ${n.norm_number}: ${n.norm_title}`).join("; ");
try {
const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:`Eres VIGIA, asistente de inteligencia regulatoria ambiental colombiana de C.I. Energia Solar S.A.S.\nFuentes activas: ${layers}.\nObligaciones: ${obsCtx}.\nNormativa: ${normCtx}.\nResponde en espanol colombiano formal. Cita fuentes con [Fuente: X]. No inventes normas.`,messages:[{role:"user",content:userMsg.text}]})});
const data=await res.json();
const reply=data.content?.[0]?.text||"No fue posible procesar la consulta.";
setBotMessages(p=>[...p,{role:"assistant",text:reply,layers}]);
try { await sbInsert("bot_queries",{org_id:"a1000000-0000-0000-0000-000000000001",query_text:userMsg.text,active_layers:sources,response_text:reply}); } catch{}
} catch { setBotMessages(p=>[...p,{role:"assistant",text:"Error de conexion. Intenta nuevamente.",layers:""}]); }
setBotLoading(false);
};

const isSuperAdmin=SUPERADMIN_EMAILS.includes(session?.user?.email);
  const navItems=[{key:"dashboard",icon:BarChart2,label:"Dashboard"},{key:"edis",icon:Layers,label:"Mis EDIs"},{key:"inteligencia",icon:TrendingUp,label:"Inteligencia",badge:unreadAlerts},{key:"consultar",icon:MessageSquare,label:"Consultar"},{key:"normativa",icon:BookOpen,label:"Normativa"},{key:"oversight",icon:Shield,label:"Oversight"},{key:"intake",icon:Upload,label:"INTAKE"},...(isSuperAdmin?[{key:"superadmin",icon:Shield,label:"SuperAdmin"}]:[])];

  if(authLoading) return <div style={{height:"100vh",background:"#060c14",display:"flex",alignItems:"center",justifyContent:"center",color:"#00c9a7",fontSize:14}}>Cargando VIGIA...</div>;
  if(!session) return <LoginScreen onLogin={async s => {
    setSession(s);
    try {
      const uid = s?.user?.id;
      const h = {apikey:SB_SERVICE, Authorization:"Bearer "+SB_SERVICE};
      const mr = await fetch(SB_ADMIN_URL+"/rest/v1/user_org_map?user_id=eq."+uid+"&select=org_id", {headers:h});
      const md = await mr.json();
      if(md?.[0]?.org_id){
        const or2 = await fetch(SB_ADMIN_URL+"/rest/v1/organizations?id=eq."+md[0].org_id+"&select=id,name,sector,plan,ciudad", {headers:h});
        const od = await or2.json();
        if(od?.[0]) setClientOrg(od[0]);
      }
    } catch(e){ console.log("org err",e); }
  }}/>;

  const hC=(h)=>h==="critico"?C.red:h==="moderado"?C.yellow:C.green;
const hB=(h)=>h==="critico"?C.redDim:h==="moderado"?C.yellowDim:C.greenDim;

const renderDashboard=()=>(
<div style={{padding:28}}>
<div style={{marginBottom:24}}><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Panel de cumplimiento</h1><p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>{dbStatus==="connected"?`Sincronizado con Supabase - ${lastSync?.toLocaleTimeString("es-CO")}`:clientOrg ? clientOrg.name : "Panel de cumplimiento"}</p></div>
<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
<StatCard icon={Layers} label="EDIs activos" value={instruments.length} color={C.primary}/>
<StatCard icon={AlertTriangle} label="Obligaciones vencidas" value={overdue} color={C.red} sub={overdue>0?"Requiere accion inmediata":"Sin vencimientos"}/>
<StatCard icon={Clock} label="Proximas (30 dias)" value={upcoming} color={C.yellow}/>
<StatCard icon={CheckCircle} label="Al dia" value={compliant} color={C.green}/>
</div>
<div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:16}}>
<div>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:13,fontWeight:600,color:C.text}}>Expedientes Digitales Inteligentes</span><span style={{fontSize:11,color:C.textSec}}>{instruments.length} EDIs activos</span></div>
<div style={{display:"flex",flexDirection:"column",gap:10}}>
{instruments.map(inst=>{ const h=ediHealth(inst); const obs=ediObs(inst.id); const color=hC(h); const bg=hB(h); return <div key={inst.id} onClick={()=>{setSelectedEDI(inst);setView("edi-detail");}} style={{background:C.surface,border:`1px solid ${h==="critico"?C.red+"44":C.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:14}}><div style={{width:42,height:42,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FileText size={18} color={color}/></div><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:14,fontWeight:600,color:C.text}}>{inst.projects?.name}</span><StatusDot status={h}/></div><div style={{fontSize:11,color:C.textSec,marginBottom:6}}>Instrumento N. {inst.number} - AUTORIDAD COMPETENTE - Nivel {inst.authority_level}</div><div style={{display:"flex",gap:12}}>{obs.filter(o=>o.status==="vencido").length>0&&<span style={{fontSize:11,color:C.red}}>* {obs.filter(o=>o.status==="vencido").length} vencida(s)</span>}{(obs.filter(o=>o.status==="proximo"||o.status==="proximo").length>0)&&<span style={{fontSize:11,color:C.yellow}}>* {obs.filter(o=>o.status==="proximo"||o.status==="proximo").length} proxima(s)</span>}<span style={{fontSize:11,color:C.green}}>* {obs.filter(o=>o.status==="al_dia"||o.status==="al_dia").length} al dia</span></div></div><div style={{textAlign:"right",flexShrink:0}}><Badge label={`${inst.completeness_pct}% completo`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/><div style={{marginTop:4}}><ChevronRight size={14} color={C.textSec}/></div></div></div></div>; })}
</div>
</div>
<div>
<div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}><span style={{fontSize:13,fontWeight:600,color:C.text}}>Alertas regulatorias</span>{unreadAlerts>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unreadAlerts} nuevas</span>}</div>
<div style={{display:"flex",flexDirection:"column",gap:10}}>
{alerts.slice(0,4).map(alert=>{ const color=alert.urgency==="critica"||alert.urgency==="critica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue; const bg=alert.urgency==="critica"||alert.urgency==="critica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim; return <div key={alert.id} onClick={()=>setView("inteligencia")} style={{background:C.surface,border:`1px solid ${!alert.human_validated?color+"55":C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer"}}><div style={{display:"flex",alignItems:"flex-start",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}><AlertTriangle size={13} color={color}/></div><div style={{flex:1}}>{!alert.human_validated&&<div style={{width:6,height:6,borderRadius:"50%",background:color,marginBottom:4,display:"inline-block",marginRight:4}}/>}<div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.4,marginBottom:4}}>{alert.norm_title}</div><ImpactBadge impact={alert.impact_type}/></div></div></div>; })}
</div>
</div>
</div>
</div>
);

const renderEDIDetail=()=>{
const inst=selectedEDI; if(!inst)return null;
const obs=ediObs(inst.id); const h=ediHealth(inst); const sc=hC(h);
return <div style={{padding:28}}>
<button onClick={()=>setView("dashboard")} style={{background:"transparent",border:"none",color:C.textSec,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,marginBottom:20,padding:0}}>Volver al panel</button>
<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 24px",marginBottom:20}}>
<div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
<div><div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><h2 style={{fontSize:20,fontWeight:700,color:C.text,margin:0}}>{inst.projects?.name}</h2><StatusDot status={h} size={10}/></div><div style={{fontSize:12,color:C.textSec,marginBottom:10}}>Instrumento N. {inst.number} - AUTORIDAD COMPETENTE</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Badge label={inst.domain||"ambiental"} color={C.primary} bg={C.primaryDim}/><Badge label={inst.instrument_type?.replace(/_/g," ")||""} color={C.textSec} bg={C.surfaceEl}/><Badge label={`${inst.completeness_pct}% completitud`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/></div></div>
<button onClick={()=>setView("consultar")} style={{background:C.primaryDim,border:`1px solid ${C.primary}44`,color:C.primary,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><MessageSquare size={13}/>Consultar</button>
</div>
<div style={{marginTop:16}}>
<div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:C.textSec}}>Cumplimiento general</span><span style={{fontSize:11,fontWeight:600,color:sc}}>{obs.length>0?Math.round((obs.filter(o=>o.status==="al_dia"||o.status==="al_dia").length/obs.length)*100):0}%</span></div>
<div style={{background:C.surfaceEl,borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${obs.length>0?(obs.filter(o=>o.status==="al_dia"||o.status==="al_dia").length/obs.length)*100:0}%`,height:"100%",background:`linear-gradient(90deg,${sc},${sc}88)`,borderRadius:4}}/></div>
</div>
</div>
<div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Obligaciones del expediente</div>
<div style={{display:"flex",flexDirection:"column",gap:8}}>
{obs.map(ob=>{
const color=ob.status==="vencido"?C.red:(ob.status==="proximo"||ob.status==="proximo")?C.yellow:C.green;
const bg=ob.status==="vencido"?C.redDim:(ob.status==="proximo"||ob.status==="proximo")?C.yellowDim:C.greenDim;
const days=ob.due_date?Math.ceil((new Date(ob.due_date)-new Date())/86400000):null;
return <div key={ob.id} style={{background:C.surface,border:`1px solid ${ob.status==="vencido"?C.red+"55":C.border}`,borderRadius:10,padding:"14px 18px"}}>
<div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"start",gap:14}}>
<div style={{width:38,height:38,borderRadius:8,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:2}}>
{ob.status==="vencido"?<AlertTriangle size={16} color={color}/>:(ob.status==="proximo"||ob.status==="proximo")?<Clock size={16} color={color}/>:<CheckCircle size={16} color={color}/>}
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
const color=alert.urgency==="critica"||alert.urgency==="critica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue;
const bg=alert.urgency==="critica"||alert.urgency==="critica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim;
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
<div key={i} style={{fontSize:11,color:C.text,marginBottom:4}}><span style={{fontWeight:600}}>{ch.obligation_num}</span>: {ch.before} -> <span style={{color:C.green}}>{ch.after}</span><div style={{fontSize:10,color:C.textMuted}}>{ch.reason}</div></div>
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

const renderNormativa=()=><div style={{padding:28}}>
<h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Base normativa - Capa 2</h1>
<p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>{normSources.length} normas activas - Colombia - Actualizacion continua</p>
<div style={{display:"flex",flexDirection:"column",gap:10}}>
{normSources.map(n=><div key={n.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
<div style={{width:36,height:36,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={15} color={C.primary}/></div>
<div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>{n.norm_title}</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Badge label={n.norm_type} color={C.blue} bg={C.blueDim}/>{n.norm_number&&<Badge label={`N. ${n.norm_number}`} color={C.textSec} bg={C.surfaceEl}/>}<span style={{fontSize:10,color:C.textMuted}}>{n.issue_date}</span><span style={{fontSize:10,color:C.textSec}}>{n.issuing_body}</span></div></div>
<Badge label="Vigente" color={C.green} bg={C.greenDim}/>
</div>)}
</div>

  </div>;

const renderOversight=()=><div style={{padding:28}}>
<h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Oversight legal automatico</h1>
<p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>Anomalias detectadas - {oversight.length} activas</p>
<div style={{display:"flex",flexDirection:"column",gap:12}}>
{oversight.map(ov=>{ const color=ov.severity==="critico"||ov.severity==="critico"?C.red:ov.severity==="moderado"?C.yellow:C.blue; const bg=ov.severity==="critico"||ov.severity==="critico"?C.redDim:ov.severity==="moderado"?C.yellowDim:C.blueDim; return <div key={ov.id} style={{background:C.surface,border:`1px solid ${color+"55"}`,borderRadius:12,padding:"18px 22px"}}><div style={{display:"flex",alignItems:"flex-start",gap:14}}><div style={{width:40,height:40,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><AlertTriangle size={18} color={color}/></div><div style={{flex:1}}><div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><Badge label={ov.severity} color={color} bg={bg}/><Badge label={ov.anomaly_type?.replace(/_/g," ")||""} color={C.textSec} bg={C.surfaceEl}/></div><div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>{ov.title}</div><div style={{fontSize:13,color:C.textSec,marginBottom:10,lineHeight:1.6}}>{ov.description}</div><div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Referencia legal: <span style={{color:C.text}}>{ov.legal_reference}</span></div><div style={{marginTop:12,padding:"10px 14px",background:bg,borderRadius:8,fontSize:12,color,fontWeight:600}}>Accion: {ov.suggested_action}</div></div></div></div>; })}
</div>

  </div>;

const renderConsultar=()=>{ const c=conf(); return <div style={{height:"100%",display:"flex",flexDirection:"column",padding:28,gap:16}}><div><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Motor de consulta</h1><p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>{normSources.length} normas - {obligations.length} obligaciones - trazabilidad juridica</p></div><div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}><div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.1em"}}>Fuentes de consulta</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>{[{key:"documentos",icon:Database,label:"Mis documentos",sub:"Capa 1 - EDIs propios",color:C.primary},{key:"normativa",icon:BookOpen,label:"Normativa vigente",sub:`Capa 2 - ${normSources.length} normas`,color:C.blue},{key:"jurisprudencia",icon:Scale,label:"Jurisprudencia",sub:"Capa 2 - Tribunales y cortes",color:C.purple},{key:"validacion",icon:Eye,label:"Validacion humana",sub:"Capa 3 - ENARA",color:C.yellow}].map(({key,icon:Icon,label,sub,color})=>(<div key={key} onClick={()=>toggleSource(key)} style={{background:sources[key]?`${color}12`:C.surfaceEl,border:`1px solid ${sources[key]?color+"66":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:6,background:sources[key]?`${color}22`:C.border+"44",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={13} color={sources[key]?color:C.textMuted}/></div><div><div style={{fontSize:12,fontWeight:600,color:sources[key]?C.text:C.textSec}}>{label}</div><div style={{fontSize:10,color:C.textMuted}}>{sub}</div></div></div>))}</div><div style={{padding:"8px 12px",borderRadius:8,background:c.color===C.green?C.greenDim:c.color===C.red?C.redDim:C.yellowDim,fontSize:12,color:c.color,fontWeight:500}}>{c.risk} {c.label}</div></div><div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}><div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>{botMessages.map((msg,i)=>(<div key={i} style={{display:"flex",flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-start",gap:10}}>{msg.role!=="user"&&<div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Zap size={13} color={C.primary}/></div>}<div style={{maxWidth:"78%",background:msg.role==="user"?C.primaryDim:C.surfaceEl,border:`1px solid ${msg.role==="user"?C.primary+"44":C.border}`,borderRadius:msg.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"10px 14px"}}>{msg.role==="system"&&<div style={{fontSize:10,color:C.primary,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>VIGIA</div>}<div style={{fontSize:13,color:C.text,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{msg.text}</div>{msg.layers&&msg.role==="assistant"&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.textMuted}}>Fuentes: {msg.layers}</div>}</div></div>))}{botLoading&&<div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={13} color={C.primary}/></div><div style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:"4px 12px 12px 12px",padding:"12px 16px",display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.primary,animation:"pulse 1.2s infinite",animationDelay:`${i*0.25}s`}}/>)}</div></div>}</div><div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"flex-end"}}><textarea value={botInput} onChange={e=>setBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBot();}}} placeholder="Escribe tu consulta..." style={{flex:1,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:FONT,resize:"none",minHeight:42,maxHeight:120,outline:"none",lineHeight:1.5}} rows={1}/><button onClick={sendBot} disabled={botLoading||!botInput.trim()} style={{background:botLoading||!botInput.trim()?C.surfaceEl:C.primary,border:"none",borderRadius:8,padding:"11px 16px",cursor:"pointer",flexShrink:0}}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={botLoading||!botInput.trim()?C.textMuted:"#060c14"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button></div></div></div>; };

const renderView=()=>{ if(view==="superadmin")return <SuperAdminModule/>; if(view==="intake")return <IntakeModule onNewAlert={handleNewAlert} onNewNorm={handleNewNorm} clientOrg={clientOrg} sessionToken={session?.access_token} onNewInstrument={inst=>{setInstruments(p=>[inst,...p]);}} onNewObligation={obs=>{setObligations(p=>[...obs,...p]);}}/>; if(view==="edi-detail")return renderEDIDetail(); if(view==="inteligencia")return renderInteligencia(); if(view==="consultar")return renderConsultar(); if(view==="normativa")return renderNormativa(); if(view==="oversight")return renderOversight(); return renderDashboard(); };

return (
<div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:FONT,color:C.text,overflow:"hidden"}}>
<style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
<div style={{width:224,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
<div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`}}>
<div style={{display:"flex",alignItems:"center",gap:10}}>
<div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.primary},#0a9e82)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Shield size={17} color="#fff"/></div>
<div><div style={{fontSize:16,fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>VIGIA</div><div style={{fontSize:9,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.12em",marginTop:1}}>Inteligencia Regulatoria</div><div style={{fontSize:9,color:C.primary,fontWeight:700,marginTop:2}}>v2.4.0</div></div>
</div>
</div>
<nav style={{flex:1,padding:"10px 8px"}}>
{navItems.map(({key,icon:Icon,label,badge})=>{ const active=view===key||(key==="edis"&&view==="edi-detail"); return <button key={key} onClick={()=>setView(key)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,marginBottom:2,background:active?C.primaryDim:"transparent",border:active?`1px solid ${C.primary}33`:"1px solid transparent",color:active?C.primary:C.textSec,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:active?600:400,fontFamily:FONT}}><Icon size={15}/><span style={{flex:1}}>{label}</span>{badge>0&&<span style={{background:C.red,color:"#fff",borderRadius:8,padding:"1px 7px",fontSize:9,fontWeight:700}}>{badge}</span>}</button>; })}
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
<div style={{flex:1}}><div style={{fontSize:11,fontWeight:600,color:C.text}}>{session?.user?.email?.split("@")[0]||"Usuario"}</div><div style={{fontSize:9,color:C.textSec}}>{isSuperAdmin?"ENARA Consulting":(clientOrg?.name||"Sin organización")}</div></div><button onClick={handleLogout} style={{background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px",color:C.textSec,fontSize:10,cursor:"pointer"}}>Salir</button>
</div>
</div>
</div>
<div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
<div style={{height:50,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",flexShrink:0,background:C.bg,position:"sticky",top:0,zIndex:10}}>
<div style={{display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",width:280}}><Search size={13} color={C.textMuted}/><span style={{fontSize:12,color:C.textMuted}}>Buscar en EDIs, obligaciones...</span></div>
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