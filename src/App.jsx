import { useState, useEffect } from "react";
import { Bell, FileText, AlertTriangle, CheckCircle, Clock, Search, ChevronRight, Shield, MessageSquare, BookOpen, Database, TrendingUp, Eye, BarChart2, Zap, RefreshCw, Layers, Mail } from "lucide-react";

const SB_URL = "https://itkbujkqjesuntgdkubt.supabase.co";
const SB_KEY = "sb_publishable_JJtvT8sbd3PKVAb7FeZekw_Z16AR0TV";
const sb = async (table, params="") => {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${params}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!res.ok) throw new Error(res.status);
  return res.json();
};
const sbInsert = async (table, data) => {
  await fetch(`${SB_URL}/rest/v1/${table}`, { method:"POST", headers:{ apikey:SB_KEY, Authorization:`Bearer ${SB_KEY}`, "Content-Type":"application/json", Prefer:"return=minimal" }, body:JSON.stringify(data) });
};

const SEED = {
  instruments: [
    { id:"c1000000-0000-0000-0000-000000000001", number:"786/2016", instrument_type:"licencia_ambiental", domain:"ambiental", authority_level:"regional", edi_status:"activo", completeness_pct:75, projects:{ name:"Parque Solar AS I — Baranoa", location_dept:"Atlántico", location_mun:"Baranoa" } },
    { id:"c2000000-0000-0000-0000-000000000002", number:"556/2017", instrument_type:"licencia_ambiental", domain:"ambiental", authority_level:"regional", edi_status:"activo", completeness_pct:60, projects:{ name:"Parque Solar AS II — Polonuevo", location_dept:"Atlántico", location_mun:"Polonuevo" } },
  ],
  obligations: [
    { id:"o1", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-04", name:"Informe de Cumplimiento Ambiental (ICA) Semestral", obligation_type:"reporte_periódico", source_article:"Art. 8, párr. 2", frequency:"semestral", due_date:"2026-03-15", status:"vencido", confidence_level:"alta", knowledge_layer:"capa_1" },
    { id:"o2", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-07", name:"Monitoreo Calidad del Recurso Hídrico", obligation_type:"monitoreo_ambiental", source_article:"Art. 12, párr. 1", frequency:"trimestral", due_date:"2026-04-25", status:"próximo", confidence_level:"alta", knowledge_layer:"capa_1" },
    { id:"o3", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-11", name:"Compensación Forestal — Fase II", obligation_type:"compensacion", source_article:"Art. 15", frequency:"única", due_date:"2026-06-30", status:"próximo", confidence_level:"media", knowledge_layer:"capa_1_2" },
    { id:"o4", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-03", name:"Pago Tasa Retributiva", obligation_type:"obligacion_financiera", source_article:"Art. 20", frequency:"anual", due_date:"2026-04-30", status:"próximo", confidence_level:"alta", knowledge_layer:"capa_2" },
    { id:"o5", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-02", name:"Monitoreo Calidad del Aire", obligation_type:"monitoreo_ambiental", source_article:"Art. 10", frequency:"trimestral", due_date:"2026-07-15", status:"al_día", confidence_level:"alta", knowledge_layer:"capa_1" },
    { id:"o6", instrument_id:"c1000000-0000-0000-0000-000000000001", obligation_num:"OBL-08", name:"Informe de Gestión Social", obligation_type:"reporte_periódico", source_article:"Art. 18", frequency:"anual", due_date:"2026-09-30", status:"al_día", confidence_level:"alta", knowledge_layer:"capa_1" },
  ],
  alerts: [
    { id:"a1", norm_title:"Modificación al procedimiento de reporte periódico de cumplimiento ambiental", norm_type:"resolucion", norm_date:"2026-04-08", issuing_authority:"AUTORIDAD COMPETENTE — Nivel Nacional", impact_type:"derogatoria", urgency:"crítica", summary:"El instrumento normativo modifica los plazos y formatos del reporte periódico para proyectos de energía no convencional en operación.", detailed_analysis:"Reduce el plazo de reporte de 60 a 45 días calendario. Aplica a proyectos de generación eléctrica superior a 1 MW.", suggested_action:"Actualizar calendario OBL-04 y descargar nuevo formato desde el portal de la AUTORIDAD COMPETENTE.", confidence_pct:94, human_validated:false },
    { id:"a2", norm_title:"Proyecto normativo sobre compensaciones ambientales — En consulta pública", norm_type:"proyecto_normativo", norm_date:"2026-04-02", issuing_authority:"AUTORIDAD COMPETENTE — Nivel Nacional", impact_type:"prospectiva", urgency:"moderada", summary:"De aprobarse, modificaría los coeficientes de compensación para proyectos con afectación vegetal superior a 5 hectáreas.", detailed_analysis:"Propone incrementar coeficiente de 1:1 a 1:1.5 para ecosistemas secos tropicales, categoría aplicable al área AS I Baranoa.", suggested_action:"Revisar alcance OBL-11 y presentar comentarios antes del cierre de consulta pública.", confidence_pct:78, human_validated:false },
    { id:"a3", norm_title:"Sentencia — Alcance de obligaciones de monitoreo sin parámetro expreso", norm_type:"sentencia_tribunal", norm_date:"2026-03-28", issuing_authority:"Tribunal Contencioso Administrativo", impact_type:"interpretativa", urgency:"informativa", summary:"Cuando el instrumento no especifica el parámetro de medición, aplican los estándares de la norma ambiental sectorial vigente.", detailed_analysis:"Los parámetros mínimos del Decreto 1076/2015 son exigibles aunque el acto no los mencione expresamente.", suggested_action:"Verificar que OBL-07 y OBL-02 incluyan los mínimos del Decreto 1076/2015.", confidence_pct:89, human_validated:true },
  ],
  normSources: [
    { id:"n1", norm_type:"decreto", norm_number:"1076", norm_title:"Decreto Único Reglamentario del Sector Ambiente y Desarrollo Sostenible", issuing_body:"Ministerio de Ambiente", issue_date:"2015-05-26", is_active:true },
    { id:"n2", norm_type:"ley", norm_number:"99", norm_title:"Ley 99 de 1993 — Sistema Nacional Ambiental (SINA)", issuing_body:"Congreso de Colombia", issue_date:"1993-12-22", is_active:true },
    { id:"n3", norm_type:"ley", norm_number:"2387", norm_title:"Ley de Transición Energética", issuing_body:"Congreso de Colombia", issue_date:"2024-07-18", is_active:true },
    { id:"n4", norm_type:"resolucion", norm_number:"0226", norm_title:"Protocolo de monitoreo de calidad del aire — 2026", issuing_body:"AUTORIDAD COMPETENTE", issue_date:"2026-01-15", is_active:true },
  ],
  oversight: [
    { id:"ov1", severity:"crítico", anomaly_type:"vencimiento_pasado", title:"Obligación vencida sin evidencia de cumplimiento: OBL-04", description:"La obligación Informe de Cumplimiento Ambiental (ICA) Semestral venció el 2026-03-15 sin que se haya registrado evidencia de cumplimiento.", legal_reference:"Art. 8, párr. 2 — Instrumento N.º 786/2016", suggested_action:"Verificar si el reporte fue presentado y registrar la evidencia, o presentarlo a la mayor brevedad.", confidence_pct:96, status:"activo" }
  ]
};

const C = { bg:"#060c14",surface:"#0c1523",surfaceEl:"#101d30",border:"#162236",borderBright:"#1e3350",primary:"#00c9a7",primaryDim:"rgba(0,201,167,0.10)",text:"#d8e6f0",textSec:"#5e7a95",textMuted:"#3a5270",red:"#ff4d6d",redDim:"rgba(255,77,109,0.12)",yellow:"#f7c948",yellowDim:"rgba(247,201,72,0.12)",green:"#2ec986",greenDim:"rgba(46,201,134,0.12)",blue:"#4d9fff",blueDim:"rgba(77,159,255,0.10)",purple:"#a78bfa",purpleDim:"rgba(167,139,250,0.10)" };
const FONT = "'Poppins','Segoe UI',sans-serif";

const StatusDot = ({status,size=8}) => { const color=status==="vencido"||status==="crítico"?C.red:status==="próximo"||status==="moderado"?C.yellow:C.green; return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:color,boxShadow:`0 0 6px ${color}88`,flexShrink:0}}/>; };
const Badge = ({label,color,bg}) => <span style={{padding:"2px 8px",borderRadius:4,fontSize:10,fontWeight:600,letterSpacing:"0.06em",color,background:bg,textTransform:"uppercase"}}>{label}</span>;
const ImpactBadge = ({impact}) => { const m={derogatoria:{c:C.red,b:C.redDim},ampliatoria:{c:C.red,b:C.redDim},prospectiva:{c:C.yellow,b:C.yellowDim},interpretativa:{c:C.blue,b:C.blueDim}}[impact]||{c:C.textSec,b:C.surfaceEl}; return <Badge label={impact} color={m.c} bg={m.b}/>; };
const StatCard = ({icon:Icon,label,value,color,sub}) => <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}><div style={{width:40,height:40,borderRadius:10,background:`${color}18`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={18} color={color}/></div><div><div style={{fontSize:22,fontWeight:700,color:C.text,lineHeight:1}}>{value}</div><div style={{fontSize:11,color:C.textSec,marginTop:3}}>{label}</div>{sub&&<div style={{fontSize:10,color,marginTop:1}}>{sub}</div>}</div></div>;

export default function VIGIAApp() {
  const [view, setView] = useState("dashboard");
  const [selectedEDI, setSelectedEDI] = useState(null);
  const [instruments, setInstruments] = useState(SEED.instruments);
  const [obligations, setObligations] = useState(SEED.obligations);
  const [alerts, setAlerts] = useState(SEED.alerts);
  const [normSources, setNormSources] = useState(SEED.normSources);
  const [oversight, setOversight] = useState(SEED.oversight);
  const [dbStatus, setDbStatus] = useState("demo");
  const [lastSync, setLastSync] = useState(null);
  const [botInput, setBotInput] = useState("");
  const [botMessages, setBotMessages] = useState([{role:"system",text:"VIGÍA activo. Datos de C.I. Energía Solar — AS I Baranoa (Res. 786/2016) y AS II Polonuevo (Res. 556/2017) cargados. Selecciona fuentes y escribe tu consulta."}]);
  const [botLoading, setBotLoading] = useState(false);
  const [sources, setSources] = useState({documentos:true,normativa:true,jurisprudencia:false,validacion:false});

  useEffect(() => {
    const tryConnect = async () => {
      try {
        const [inst, obs, alrt, norms] = await Promise.all([
          sb("instruments","select=*,projects(name,location_dept,location_mun)&order=created_at.desc"),
          sb("obligations","select=*&order=due_date.asc"),
          sb("regulatory_alerts","select=*&order=norm_date.desc"),
          sb("normative_sources","select=*&is_active=eq.true"),
        ]);
        if(Array.isArray(inst)&&inst.length>0){ setInstruments(inst); setObligations(Array.isArray(obs)?obs:[]); setAlerts(Array.isArray(alrt)?alrt:[]); setNormSources(Array.isArray(norms)?norms:[]); setDbStatus("connected"); setLastSync(new Date()); }
      } catch { setDbStatus("demo"); }
    };
    tryConnect();
  }, []);

  const overdue = obligations.filter(o=>o.status==="vencido").length;
  const upcoming = obligations.filter(o=>o.status==="próximo").length;
  const compliant = obligations.filter(o=>o.status==="al_día").length;
  const unreadAlerts = alerts.filter(a=>!a.human_validated).length;
  const ediHealth = (inst) => { const obs=obligations.filter(o=>o.instrument_id===inst.id); if(obs.some(o=>o.status==="vencido"))return"crítico"; if(obs.some(o=>o.status==="próximo"))return"moderado"; return"al_día"; };
  const ediObs = (id) => obligations.filter(o=>o.instrument_id===id);
  const toggleSource = (k) => setSources(p=>({...p,[k]:!p[k]}));
  const conf = () => { const a=Object.values(sources).filter(Boolean).length; if(a===0)return{label:"Sin fuentes",color:C.red,risk:"🔴"}; if(sources.validacion)return{label:"Máxima precisión con revisión humana",color:C.green,risk:"🟢"}; if(sources.documentos&&sources.normativa&&sources.jurisprudencia)return{label:"Alta precisión — riesgo bajo",color:C.green,risk:"🟢"}; if(sources.documentos&&sources.normativa)return{label:"Precisión moderada — posible ambigüedad en normas concurrentes",color:C.yellow,risk:"🟡"}; return{label:"Precisión limitada",color:C.yellow,risk:"🟡"}; };

  const sendBot = async () => {
    if(!botInput.trim()||botLoading)return;
    const userMsg={role:"user",text:botInput};
    setBotMessages(p=>[...p,userMsg]); setBotInput(""); setBotLoading(true);
    const layers=Object.entries(sources).filter(([,v])=>v).map(([k])=>({documentos:"Capa 1",normativa:"Capa 2 — Normativa",jurisprudencia:"Capa 2 — Jurisprudencia",validacion:"Capa 3 — Validación humana"}[k])).join(", ");
    const obsCtx=obligations.map(o=>`${o.obligation_num} — ${o.name} (${o.status}, vence ${o.due_date})`).join("; ");
    const normCtx=normSources.map(n=>`${n.norm_type} ${n.norm_number}: ${n.norm_title}`).join("; ");
    const alertCtx=alerts.map(a=>`[${a.urgency}] ${a.norm_title}: ${a.summary}`).join("; ");
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:`Eres VIGÍA, asistente de inteligencia regulatoria ambiental colombiana de C.I. Energía Solar S.A.S.\nFuentes activas: ${layers}.\nObligaciones registradas: ${obsCtx}.\nNormativa en base: ${normCtx}.\nAlertas activas: ${alertCtx}.\nResponde en español colombiano formal. Cita fuentes con [Fuente: X]. Señala [⚠ Confianza media] cuando hay ambigüedad normativa. No inventes normas ni artículos.`,messages:[{role:"user",content:userMsg.text}]})});
      const data=await res.json();
      const reply=data.content?.[0]?.text||"No fue posible procesar la consulta.";
      setBotMessages(p=>[...p,{role:"assistant",text:reply,layers}]);
      try { await sbInsert("bot_queries",{org_id:"a1000000-0000-0000-0000-000000000001",query_text:userMsg.text,active_layers:sources,response_text:reply}); } catch{}
    } catch { setBotMessages(p=>[...p,{role:"assistant",text:"⚠️ Error de conexión con el motor. Intenta nuevamente.",layers:""}]); }
    setBotLoading(false);
  };

  const navItems=[{key:"dashboard",icon:BarChart2,label:"Dashboard"},{key:"edis",icon:Layers,label:"Mis EDIs"},{key:"inteligencia",icon:TrendingUp,label:"Inteligencia",badge:unreadAlerts},{key:"consultar",icon:MessageSquare,label:"Consultar"},{key:"normativa",icon:BookOpen,label:"Normativa"},{key:"oversight",icon:Shield,label:"Oversight"},{key:"comunicaciones",icon:Mail,label:"Comunicaciones"}];
  const renderDashboard = () => (
    <div style={{padding:28}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Panel de cumplimiento</h1>
        <p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>{dbStatus==="connected"?`Sincronizado con Supabase · ${lastSync?.toLocaleTimeString("es-CO")}`:"Modo demo · Datos reales de C.I. Energía Solar — Proyecto AS I Baranoa"}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        <StatCard icon={Layers} label="EDIs activos" value={instruments.length} color={C.primary}/>
        <StatCard icon={AlertTriangle} label="Obligaciones vencidas" value={overdue} color={C.red} sub={overdue>0?"Requiere acción inmediata":"Sin vencimientos"}/>
        <StatCard icon={Clock} label="Próximas (30 días)" value={upcoming} color={C.yellow}/>
        <StatCard icon={CheckCircle} label="Al día" value={compliant} color={C.green}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 360px",gap:16}}>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:600,color:C.text}}>Expedientes Digitales Inteligentes</span>
            <span style={{fontSize:11,color:C.textSec}}>{instruments.length} EDI{instruments.length!==1?"s":""} activo{instruments.length!==1?"s":""}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {instruments.map(inst=>{
              const health=ediHealth(inst); const obs=ediObs(inst.id);
              const color=health==="crítico"?C.red:health==="moderado"?C.yellow:C.green;
              const bg=health==="crítico"?C.redDim:health==="moderado"?C.yellowDim:C.greenDim;
              return <div key={inst.id} onClick={()=>{setSelectedEDI(inst);setView("edi-detail");}} style={{background:C.surface,border:`1px solid ${health==="crítico"?C.red+"44":C.border}`,borderRadius:12,padding:"16px 18px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=color+"88"} onMouseLeave={e=>e.currentTarget.style.borderColor=health==="crítico"?C.red+"44":C.border}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:42,height:42,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FileText size={18} color={color}/></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:14,fontWeight:600,color:C.text}}>{inst.projects?.name}</span><StatusDot status={health}/></div>
                    <div style={{fontSize:11,color:C.textSec,marginBottom:6}}>Instrumento N.º {inst.number} · AUTORIDAD COMPETENTE — Nivel {inst.authority_level}</div>
                    <div style={{display:"flex",gap:12}}>
                      {obs.filter(o=>o.status==="vencido").length>0&&<span style={{fontSize:11,color:C.red}}>● {obs.filter(o=>o.status==="vencido").length} vencida(s)</span>}
                      {obs.filter(o=>o.status==="próximo").length>0&&<span style={{fontSize:11,color:C.yellow}}>● {obs.filter(o=>o.status==="próximo").length} próxima(s)</span>}
                      <span style={{fontSize:11,color:C.green}}>● {obs.filter(o=>o.status==="al_día").length} al día</span>
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{marginBottom:4}}><Badge label={`${inst.completeness_pct}% completo`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/></div>
                    <ChevronRight size={14} color={C.textSec}/>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
        <div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <span style={{fontSize:13,fontWeight:600,color:C.text}}>Alertas regulatorias</span>
            {unreadAlerts>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:700}}>{unreadAlerts} nuevas</span>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {alerts.map(alert=>{
              const color=alert.urgency==="crítica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue;
              const bg=alert.urgency==="crítica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim;
              return <div key={alert.id} onClick={()=>setView("inteligencia")} style={{background:C.surface,border:`1px solid ${!alert.human_validated?color+"55":C.border}`,borderRadius:10,padding:"14px 16px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=color+"88"} onMouseLeave={e=>e.currentTarget.style.borderColor=!alert.human_validated?color+"55":C.border}>
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{width:28,height:28,borderRadius:8,background:bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {alert.urgency==="crítica"?<AlertTriangle size={13} color={color}/>:alert.urgency==="moderada"?<Clock size={13} color={color}/>:<Eye size={13} color={color}/>}
                  </div>
                  <div style={{flex:1}}>
                    {!alert.human_validated&&<div style={{width:6,height:6,borderRadius:"50%",background:color,marginBottom:4,display:"inline-block",marginRight:4}}/>}
                    <div style={{fontSize:12,fontWeight:600,color:C.text,lineHeight:1.4,marginBottom:6}}>{alert.norm_title}</div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}><ImpactBadge impact={alert.impact_type}/><span style={{fontSize:10,color:C.textMuted}}>{alert.norm_date}</span></div>
                  </div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderEDIDetail = () => {
    const inst=selectedEDI; if(!inst)return null;
    const obs=ediObs(inst.id); const health=ediHealth(inst);
    const sc=health==="crítico"?C.red:health==="moderado"?C.yellow:C.green;
    return <div style={{padding:28}}>
      <button onClick={()=>setView("dashboard")} style={{background:"transparent",border:"none",color:C.textSec,fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:5,marginBottom:20,padding:0}}>← Volver al panel</button>
      <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"20px 24px",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><h2 style={{fontSize:20,fontWeight:700,color:C.text,margin:0}}>{inst.projects?.name}</h2><StatusDot status={health} size={10}/></div>
            <div style={{fontSize:12,color:C.textSec,marginBottom:10}}>Instrumento Ambiental N.º {inst.number} · AUTORIDAD COMPETENTE — Nivel {inst.authority_level}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <Badge label={inst.domain} color={C.primary} bg={C.primaryDim}/>
              <Badge label={inst.instrument_type?.replace(/_/g," ")} color={C.textSec} bg={C.surfaceEl}/>
              <Badge label={`${inst.completeness_pct}% completitud`} color={inst.completeness_pct<80?C.yellow:C.green} bg={inst.completeness_pct<80?C.yellowDim:C.greenDim}/>
              {inst.completeness_pct<100&&<Badge label="⚠ Expediente incompleto" color={C.yellow} bg={C.yellowDim}/>}
            </div>
          </div>
          <button onClick={()=>setView("consultar")} style={{background:C.primaryDim,border:`1px solid ${C.primary}44`,color:C.primary,borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}><MessageSquare size={13}/>Consultar sobre este EDI</button>
        </div>
        <div style={{marginTop:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:C.textSec}}>Cumplimiento general</span><span style={{fontSize:11,fontWeight:600,color:sc}}>{obs.length>0?Math.round((obs.filter(o=>o.status==="al_día").length/obs.length)*100):0}%</span></div>
          <div style={{background:C.surfaceEl,borderRadius:4,height:8,overflow:"hidden"}}><div style={{width:`${obs.length>0?(obs.filter(o=>o.status==="al_día").length/obs.length)*100:0}%`,height:"100%",background:`linear-gradient(90deg,${sc},${sc}88)`,borderRadius:4}}/></div>
          <div style={{display:"flex",gap:16,marginTop:8}}>
            <span style={{fontSize:10,color:C.red}}>● {obs.filter(o=>o.status==="vencido").length} vencida(s)</span>
            <span style={{fontSize:10,color:C.yellow}}>● {obs.filter(o=>o.status==="próximo").length} próxima(s)</span>
            <span style={{fontSize:10,color:C.green}}>● {obs.filter(o=>o.status==="al_día").length} al día</span>
          </div>
        </div>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Obligaciones del expediente</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {obs.map(ob=>{
          const color=ob.status==="vencido"?C.red:ob.status==="próximo"?C.yellow:C.green;
          const bg=ob.status==="vencido"?C.redDim:ob.status==="próximo"?C.yellowDim:C.greenDim;
          const days=ob.due_date?Math.ceil((new Date(ob.due_date)-new Date())/86400000):null;
          return <div key={ob.id} style={{background:C.surface,border:`1px solid ${ob.status==="vencido"?C.red+"55":C.border}`,borderRadius:10,padding:"14px 18px",display:"grid",gridTemplateColumns:"auto 1fr auto",alignItems:"center",gap:14}}>
            <div style={{width:38,height:38,borderRadius:8,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              {ob.status==="vencido"?<AlertTriangle size={16} color={color}/>:ob.status==="próximo"?<Clock size={16} color={color}/>:<CheckCircle size={16} color={color}/>}
            </div>
            <div>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><span style={{fontSize:13,fontWeight:600,color:C.text}}>{ob.name}</span><span style={{fontSize:10,color:C.textMuted,fontFamily:"monospace"}}>{ob.obligation_num}</span></div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <Badge label={ob.obligation_type?.replace(/_/g," ")} color={C.textSec} bg={C.surfaceEl}/>
                <Badge label={ob.frequency} color={C.blue} bg={C.blueDim}/>
                <span style={{fontSize:10,color:C.textMuted}}>{ob.source_article}</span>
                <Badge label={`${ob.confidence_level} confianza`} color={ob.confidence_level==="alta"?C.green:ob.confidence_level==="media"?C.yellow:C.red} bg={ob.confidence_level==="alta"?C.greenDim:ob.confidence_level==="media"?C.yellowDim:C.redDim}/>
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:20,fontWeight:700,color,lineHeight:1}}>{days!==null?Math.abs(days):"—"}</div>
              <div style={{fontSize:10,color:C.textMuted}}>{days!==null?(days<0?"días vencido":"días restantes"):""}</div>
              <div style={{fontSize:11,color:C.textSec,marginTop:2}}>{ob.due_date}</div>
            </div>
          </div>;
        })}
      </div>
    </div>;
  };

  const renderInteligencia = () => <div style={{padding:28}}>
    <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Inteligencia regulatoria</h1>
    <p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>Motor de monitoreo continuo · {alerts.length} alertas activas</p>
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {alerts.map(alert=>{
        const color=alert.urgency==="crítica"?C.red:alert.urgency==="moderada"?C.yellow:C.blue;
        const bg=alert.urgency==="crítica"?C.redDim:alert.urgency==="moderada"?C.yellowDim:C.blueDim;
        return <div key={alert.id} style={{background:C.surface,border:`1px solid ${!alert.human_validated?color+"55":C.border}`,borderRadius:14,padding:"20px 22px"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:16}}>
            <div style={{width:44,height:44,borderRadius:12,background:bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
              {alert.urgency==="crítica"?<AlertTriangle size={20} color={color}/>:alert.urgency==="moderada"?<Zap size={20} color={color}/>:<Eye size={20} color={color}/>}
            </div>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}><ImpactBadge impact={alert.impact_type}/>{!alert.human_validated&&<Badge label="Nueva" color={color} bg={bg}/>}<span style={{fontSize:11,color:C.textMuted}}>{alert.norm_date}</span></div>
              <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:4,lineHeight:1.4}}>{alert.norm_title}</div>
              <div style={{fontSize:12,color:C.textSec,marginBottom:12}}>{alert.issuing_authority}</div>
              <div style={{fontSize:13,color:C.text,marginBottom:10,lineHeight:1.7,padding:"12px 16px",background:C.surfaceEl,borderRadius:8,borderLeft:`3px solid ${color}`}}>{alert.summary}</div>
              {alert.detailed_analysis&&<div style={{fontSize:12,color:C.textSec,marginBottom:12,lineHeight:1.6}}>{alert.detailed_analysis}</div>}
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
                <div style={{fontSize:11,color:C.textMuted}}>Confianza: <span style={{color:(alert.confidence_pct||0)>85?C.green:C.yellow,fontWeight:700}}>{alert.confidence_pct}%</span></div>
                <button onClick={()=>setAlerts(p=>p.map(a=>a.id===alert.id?{...a,human_validated:true}:a))} style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 12px",fontSize:11,color:C.textSec,cursor:"pointer"}}>Marcar revisado</button>
              </div>
              {alert.suggested_action&&<div style={{marginTop:12,padding:"10px 16px",background:bg,borderRadius:8,fontSize:12,color,fontWeight:600}}>→ {alert.suggested_action}</div>}
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;

  const renderOversight = () => <div style={{padding:28}}>
    <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Oversight legal automático</h1>
    <p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>Anomalías detectadas · {oversight.length} activas</p>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {oversight.map(ov=>{
        const color=ov.severity==="crítico"?C.red:ov.severity==="moderado"?C.yellow:C.blue;
        const bg=ov.severity==="crítico"?C.redDim:ov.severity==="moderado"?C.yellowDim:C.blueDim;
        return <div key={ov.id} style={{background:C.surface,border:`1px solid ${color+"55"}`,borderRadius:12,padding:"18px 22px"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
            <div style={{width:40,height:40,borderRadius:10,background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><AlertTriangle size={18} color={color}/></div>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}><Badge label={ov.severity} color={color} bg={bg}/><Badge label={ov.anomaly_type?.replace(/_/g," ")} color={C.textSec} bg={C.surfaceEl}/></div>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>{ov.title}</div>
              <div style={{fontSize:13,color:C.textSec,marginBottom:10,lineHeight:1.6}}>{ov.description}</div>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>Referencia legal: <span style={{color:C.text}}>{ov.legal_reference}</span></div>
              <div style={{marginTop:12,padding:"10px 14px",background:bg,borderRadius:8,fontSize:12,color,fontWeight:600}}>→ {ov.suggested_action}</div>
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;

  const renderNormativa = () => <div style={{padding:28}}>
    <h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 6px"}}>Base normativa — Capa 2</h1>
    <p style={{fontSize:13,color:C.textSec,margin:"0 0 24px"}}>{normSources.length} normas activas · Colombia · Actualización continua</p>
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {normSources.map(n=><div key={n.id} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:36,height:36,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><BookOpen size={15} color={C.primary}/></div>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:4}}>{n.norm_title}</div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><Badge label={n.norm_type} color={C.blue} bg={C.blueDim}/>{n.norm_number&&<Badge label={`N.º ${n.norm_number}`} color={C.textSec} bg={C.surfaceEl}/>}<span style={{fontSize:10,color:C.textMuted}}>{n.issue_date}</span></div></div>
        <Badge label="Vigente" color={C.green} bg={C.greenDim}/>
      </div>)}
    </div>
  </div>;
  const renderConsultar = () => { const c=conf(); return <div style={{height:"100%",display:"flex",flexDirection:"column",padding:28,gap:16}}>
    <div><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Motor de consulta</h1><p style={{fontSize:13,color:C.textSec,margin:"4px 0 0"}}>{normSources.length} normas · {obligations.length} obligaciones · respuestas con trazabilidad jurídica</p></div>
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 18px"}}>
      <div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:12,textTransform:"uppercase",letterSpacing:"0.1em"}}>Fuentes de consulta</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[{key:"documentos",icon:Database,label:"Mis documentos",sub:"Capa 1 — EDIs propios",color:C.primary},{key:"normativa",icon:BookOpen,label:"Normativa vigente",sub:`Capa 2 · ${normSources.length} normas`,color:C.blue},{key:"jurisprudencia",icon:Shield,label:"Jurisprudencia",sub:"Capa 2 — Tribunales y cortes",color:C.purple},{key:"validacion",icon:Eye,label:"Validación humana",sub:"Capa 3 — ENARA / Firma",color:C.yellow}].map(({key,icon:Icon,label,sub,color})=>(
          <div key={key} onClick={()=>toggleSource(key)} style={{background:sources[key]?`${color}12`:C.surfaceEl,border:`1px solid ${sources[key]?color+"66":C.border}`,borderRadius:8,padding:"10px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:28,height:28,borderRadius:6,background:sources[key]?`${color}22`:C.border+"44",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={13} color={sources[key]?color:C.textMuted}/></div>
            <div><div style={{fontSize:12,fontWeight:600,color:sources[key]?C.text:C.textSec}}>{label}</div><div style={{fontSize:10,color:C.textMuted}}>{sub}</div></div>
          </div>
        ))}
      </div>
      <div style={{padding:"8px 12px",borderRadius:8,background:c.color===C.green?C.greenDim:c.color===C.red?C.redDim:C.yellowDim,fontSize:12,color:c.color,fontWeight:500}}>{c.risk} {c.label}</div>
    </div>
    <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,borderRadius:12,display:"flex",flexDirection:"column",overflow:"hidden",minHeight:0}}>
      <div style={{flex:1,overflowY:"auto",padding:"16px 18px",display:"flex",flexDirection:"column",gap:12}}>
        {botMessages.map((msg,i)=>(
          <div key={i} style={{display:"flex",flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-start",gap:10}}>
            {msg.role!=="user"&&<div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Zap size={13} color={C.primary}/></div>}
            <div style={{maxWidth:"78%",background:msg.role==="user"?C.primaryDim:C.surfaceEl,border:`1px solid ${msg.role==="user"?C.primary+"44":C.border}`,borderRadius:msg.role==="user"?"12px 4px 12px 12px":"4px 12px 12px 12px",padding:"10px 14px"}}>
              {msg.role==="system"&&<div style={{fontSize:10,color:C.primary,fontWeight:700,marginBottom:6,textTransform:"uppercase"}}>VIGÍA</div>}
              <div style={{fontSize:13,color:C.text,lineHeight:1.65,whiteSpace:"pre-wrap"}}>{msg.text}</div>
              {msg.layers&&msg.role==="assistant"&&<div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${C.border}`,fontSize:10,color:C.textMuted}}>Fuentes: {msg.layers}</div>}
            </div>
          </div>
        ))}
        {botLoading&&<div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={13} color={C.primary}/></div>
          <div style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:"4px 12px 12px 12px",padding:"12px 16px",display:"flex",gap:5}}>
            {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:C.primary,animation:"pulse 1.2s infinite",animationDelay:`${i*0.25}s`}}/>)}
          </div>
        </div>}
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"flex-end"}}>
        <textarea value={botInput} onChange={e=>setBotInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendBot();}}} placeholder="Escribe tu consulta... (Enter para enviar)" style={{flex:1,background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:13,fontFamily:FONT,resize:"none",minHeight:42,maxHeight:120,outline:"none",lineHeight:1.5}} rows={1}/>
        <button onClick={sendBot} disabled={botLoading||!botInput.trim()} style={{background:botLoading||!botInput.trim()?C.surfaceEl:C.primary,border:"none",borderRadius:8,padding:"11px 16px",cursor:"pointer",flexShrink:0}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={botLoading||!botInput.trim()?C.textMuted:"#060c14"} strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  </div>; };

  const renderView=()=>{ if(view==="comunicaciones")return <div style={{padding:28}}><h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:"0 0 8px"}}>Comunicaciones</h1><p style={{fontSize:13,color:C.textSec}}>Modulo en construccion</p></div>; if(view==="edi-detail")return renderEDIDetail(); if(view==="inteligencia")return renderInteligencia(); if(view==="consultar")return renderConsultar(); if(view==="normativa")return renderNormativa(); if(view==="oversight")return renderOversight(); return renderDashboard(); };

  return (
    <div style={{display:"flex",height:"100vh",background:C.bg,fontFamily:FONT,color:C.text,overflow:"hidden"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${C.border};border-radius:4px}@keyframes pulse{0%,100%{opacity:0.25}50%{opacity:1}}`}</style>
      <div style={{width:224,flexShrink:0,background:C.surface,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column"}}>
        <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${C.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:9,background:`linear-gradient(135deg,${C.primary},#0a9e82)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Shield size={17} color="#fff"/></div>
            <div><div style={{fontSize:16,fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>VIGÍA</div><div style={{fontSize:9,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.12em",marginTop:1}}>Inteligencia Regulatoria</div></div>
          </div>
        </div>
        <nav style={{flex:1,padding:"10px 8px"}}>
          {navItems.map(({key,icon:Icon,label,badge})=>{
            const active=view===key||(key==="edis"&&view==="edi-detail");
            return <button key={key} onClick={()=>setView(key)} style={{width:"100%",display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,marginBottom:2,background:active?C.primaryDim:"transparent",border:active?`1px solid ${C.primary}33`:"1px solid transparent",color:active?C.primary:C.textSec,cursor:"pointer",textAlign:"left",fontSize:13,fontWeight:active?600:400,fontFamily:FONT}}>
              <Icon size={15}/><span style={{flex:1}}>{label}</span>
              {badge>0&&<span style={{background:C.red,color:"#fff",borderRadius:8,padding:"1px 7px",fontSize:9,fontWeight:700}}>{badge}</span>}
            </button>;
          })}
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
            <div><div style={{fontSize:11,fontWeight:600,color:C.text}}>Javier Restrepo</div><div style={{fontSize:9,color:C.textSec}}>ENARA Consulting · Admin</div></div>
          </div>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column"}}>
        <div style={{height:50,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",flexShrink:0,background:C.bg,position:"sticky",top:0,zIndex:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"6px 12px",width:280}}><Search size={13} color={C.textMuted}/><span style={{fontSize:12,color:C.textMuted}}>Buscar en EDIs, obligaciones...</span></div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:5,background:C.greenDim,border:`1px solid ${C.green}33`,borderRadius:6,padding:"4px 10px"}}>
              <RefreshCw size={10} color={C.green}/>
              <span style={{fontSize:10,color:C.green,fontWeight:600}}>{instruments.length} EDIs · {obligations.length} obligaciones · {alerts.length} alertas · {normSources.length} normas</span>
            </div>
            <button style={{background:"transparent",border:"none",cursor:"pointer",padding:4,position:"relative"}}><Bell size={16} color={C.textSec}/>{unreadAlerts>0&&<span style={{position:"absolute",top:0,right:0,width:8,height:8,background:C.red,borderRadius:"50%",border:`2px solid ${C.bg}`}}/>}</button>
          </div>
        </div>
        <div style={{flex:1}}>{renderView()}</div>
      </div>
    </div>
  );
}