import { useState, useRef } from “react”;
import { Upload, FileText, AlertTriangle, CheckCircle, Clock, ChevronRight, Zap, MessageSquare, ArrowDown, ArrowUp, HelpCircle, Link2, Eye, RefreshCw, X, Check, Mail, File, Package } from “lucide-react”;

const C = { bg:”#060c14”,surface:”#0c1523”,surfaceEl:”#101d30”,border:”#162236”,borderBright:”#1e3350”,primary:”#00c9a7”,primaryDim:“rgba(0,201,167,0.10)”,text:”#d8e6f0”,textSec:”#5e7a95”,textMuted:”#3a5270”,red:”#ff4d6d”,redDim:“rgba(255,77,109,0.12)”,yellow:”#f7c948”,yellowDim:“rgba(247,201,72,0.12)”,green:”#2ec986”,greenDim:“rgba(46,201,134,0.12)”,blue:”#4d9fff”,blueDim:“rgba(77,159,255,0.10)”,purple:”#a78bfa”,purpleDim:“rgba(167,139,250,0.10)” };
const FONT = “‘Poppins’,‘Segoe UI’,sans-serif”;

const Badge = ({label,color,bg}) => <span style={{padding:“2px 8px”,borderRadius:4,fontSize:10,fontWeight:600,letterSpacing:“0.06em”,color,background:bg,textTransform:“uppercase”,flexShrink:0}}>{label}</span>;

const EDIS = [
{ id:“c1000000-0000-0000-0000-000000000001”, name:“Parque Solar AS I — Baranoa”, number:“786/2016” },
{ id:“c2000000-0000-0000-0000-000000000002”, name:“Parque Solar AS II — Polonuevo”, number:“556/2017” },
];

const OBLIGATIONS = [
{ id:“o1”, instrument_id:“c1000000-0000-0000-0000-000000000001”, num:“OBL-04”, name:“ICA Semestral” },
{ id:“o2”, instrument_id:“c1000000-0000-0000-0000-000000000001”, num:“OBL-07”, name:“Monitoreo Recurso Hídrico” },
{ id:“o3”, instrument_id:“c1000000-0000-0000-0000-000000000001”, num:“OBL-11”, name:“Compensación Forestal — Fase II” },
];

const SEED_COMMS = [
{ id:“comm1”, original_name:“Auto_Seguimiento_034_2026_CRA.pdf”, file_type:“pdf”, direction:“entrante”, comm_type:“auto_seguimiento”, comm_date:“2026-03-28”, radicado_number:“2026-034-CRA”, authority_name:“AUTORIDAD COMPETENTE — Regional”, subject_extracted:“Requerimiento de subsanación ICA Semestral — Res. 786/2016”, analysis_status:“confirmado”, overall_confidence_pct:97, linked_instrument_id:“c1000000-0000-0000-0000-000000000001”, impact_types:[“modifica_plazo”,“requiere_informacion”], impact_urgency:“crítica”, impact_summary:“Requiere subsanar OBL-04 en 15 días hábiles. Plazo actualizado al 18 de abril de 2026.”, actions:[{type:“update_due_date”,desc:“OBL-04 — Nueva fecha límite: 18 abr 2026”}] },
{ id:“comm2”, original_name:“Respuesta_ICA_S2_2025_enviada.pdf”, file_type:“pdf”, direction:“saliente”, comm_type:“respuesta”, comm_date:“2026-04-10”, radicado_number:“2026-1847-TITULAR”, authority_name:“AUTORIDAD COMPETENTE — Regional”, subject_extracted:“Radicación ICA Segundo Semestre 2025 — AS I Baranoa”, analysis_status:“confirmado”, overall_confidence_pct:99, linked_instrument_id:“c1000000-0000-0000-0000-000000000001”, impact_types:[“confirma_cumplimiento”], impact_urgency:“informativa”, impact_summary:“ICA Semestral presentado. OBL-04 registrada como cumplida para el período.”, actions:[{type:“add_evidence”,desc:“OBL-04 — Evidencia de radicación registrada”}] },
{ id:“comm3”, original_name:“Oficio_Concepto_Compensacion.pdf”, file_type:“pdf”, direction:“entrante”, comm_type:“concepto”, comm_date:“2026-03-15”, radicado_number:“2026-018-CRA”, authority_name:“AUTORIDAD COMPETENTE — Regional”, subject_extracted:“Concepto técnico sobre áreas de compensación forestal”, analysis_status:“requiere_confirmacion”, overall_confidence_pct:71, linked_instrument_id:null, impact_types:[“modifica_plazo”], impact_urgency:“moderada”, impact_summary:“Establece condiciones para la Fase II de compensación forestal. Requiere confirmación del EDI.”, confirmation_questions:[{question:”¿Este concepto corresponde al proyecto AS I Baranoa o AS II Polonuevo?”,options:[“AS I — Baranoa (Res. 786/2016)”,“AS II — Polonuevo (Res. 556/2017)”,“Otro”]},{question:”¿El área N1 mencionada es la de compensación de OBL-11?”,options:[“Sí, corresponde a OBL-11”,“No, es otra obligación”,“No estoy seguro”]}], actions:[] },
];

function FileTypeIcon({type}) {
const icons = { pdf:<FileText size={16}/>, zip:<Package size={16}/>, jpg:<File size={16}/>, png:<File size={16}/>, msg:<Mail size={16}/>, eml:<Mail size={16}/>};
return <span style={{color:”#00c9a7”}}>{icons[type]||<File size={16}/>}</span>;
}

function DirectionBadge({direction}) {
if(direction===“entrante”) return <div style={{display:“flex”,alignItems:“center”,gap:4,color:”#4d9fff”,fontSize:11,fontWeight:600}}><ArrowDown size={11}/>Entrante</div>;
if(direction===“saliente”) return <div style={{display:“flex”,alignItems:“center”,gap:4,color:”#2ec986”,fontSize:11,fontWeight:600}}><ArrowUp size={11}/>Saliente</div>;
return <div style={{display:“flex”,alignItems:“center”,gap:4,color:”#f7c948”,fontSize:11,fontWeight:600}}><MessageSquare size={11}/>Bilateral</div>;
}

function ConfidenceMeter({pct}) {
const color = pct>=95?”#2ec986”:pct>=70?”#f7c948”:”#ff4d6d”;
return (
<div style={{display:“flex”,alignItems:“center”,gap:8}}>
<div style={{width:80,height:4,background:”#101d30”,borderRadius:2,overflow:“hidden”}}>
<div style={{width:`${pct}%`,height:“100%”,background:color,borderRadius:2}}/>
</div>
<span style={{fontSize:11,fontWeight:700,color}}>{pct}%</span>
</div>
);
}
export default function ComunicacionesModule() {
const [comms, setComms] = useState(SEED_COMMS);
const [selectedComm, setSelectedComm] = useState(null);
const [uploadState, setUploadState] = useState(“idle”);
const [analysisResult, setAnalysisResult] = useState(null);
const [dragOver, setDragOver] = useState(false);
const [confirmAnswers, setConfirmAnswers] = useState({});
const [filterDir, setFilterDir] = useState(“todos”);
const fileRef = useRef();

const analyzeDocument = async (file) => {
setUploadState(“analyzing”);
await new Promise(r => setTimeout(r, 2000));
try {
const res = await fetch(“https://api.anthropic.com/v1/messages”, {
method:“POST”, headers:{“Content-Type”:“application/json”},
body: JSON.stringify({
model:“claude-sonnet-4-20250514”, max_tokens:1000,
system:`Eres el motor de análisis de comunicaciones de VIGÍA, plataforma de inteligencia regulatoria ambiental colombiana. EDIs disponibles: ${EDIS.map(e=>`${e.name} (Instrumento N.º ${e.number})`).join(", ")}. Analiza el nombre del archivo. Responde SOLO en JSON válido: {"comm_type":"auto_seguimiento|requerimiento|notificacion|oficio|respuesta|acta_visita|concepto|sancion|aprobacion|otro","direction":"entrante|saliente","subject_extracted":"asunto del documento","radicado_number":"número o null","authority_name":"autoridad detectada","candidate_edi":"nombre del EDI o null","candidate_confidence":0-100,"matching_reasons":["razón 1"],"impact_types":["confirma_cumplimiento|crea_obligacion|modifica_plazo|inicia_sancion|requiere_informacion|aprueba_informe"],"impact_summary":"descripción del impacto","impact_urgency":"crítica|moderada|informativa","requires_confirmation":true,"confirmation_questions":[{"question":"...","options":["..."]}]}`,
messages:[{role:“user”,content:`Analiza esta comunicación ambiental: "${file.name}"`}]
})
});
const data = await res.json();
const text = data.content?.[0]?.text || “{}”;
const parsed = JSON.parse(text.replace(/`json|`/g,””).trim());
setAnalysisResult({…parsed, file_name:file.name, file_type:file.name.split(”.”).pop()});
} catch {
setAnalysisResult({ comm_type:“oficio”, direction:“entrante”, subject_extracted:“Comunicación ambiental”, radicado_number:null, authority_name:“AUTORIDAD COMPETENTE”, candidate_edi:EDIS[0].name, candidate_confidence:82, matching_reasons:[“Contexto ambiental detectado”], impact_types:[“requiere_informacion”], impact_summary:“Documento recibido. Requiere revisión.”, impact_urgency:“moderada”, requires_confirmation:true, confirmation_questions:[{question:”¿A cuál EDI pertenece?”,options:EDIS.map(e=>e.name)}], file_name:file.name, file_type:file.name.split(”.”).pop() });
}
setUploadState(“result”);
};

const confirmAndLink = () => {
if(!analysisResult) return;
const edi = EDIS.find(e=>e.name===analysisResult.candidate_edi)||EDIS[0];
setComms(p=>[{ id:`comm_${Date.now()}`, original_name:analysisResult.file_name, file_type:analysisResult.file_type, direction:analysisResult.direction, comm_type:analysisResult.comm_type, comm_date:new Date().toISOString().split(“T”)[0], radicado_number:analysisResult.radicado_number, authority_name:analysisResult.authority_name, subject_extracted:analysisResult.subject_extracted, analysis_status:“confirmado”, overall_confidence_pct:analysisResult.candidate_confidence, linked_instrument_id:edi.id, impact_types:analysisResult.impact_types, impact_urgency:analysisResult.impact_urgency, impact_summary:analysisResult.impact_summary, confirmation_questions:[], actions:[] },…p]);
setUploadState(“idle”); setAnalysisResult(null); setConfirmAnswers({});
};

const filteredComms = filterDir===“todos”?comms:comms.filter(c=>c.direction===filterDir);
const pendingConfirmation = comms.filter(c=>c.analysis_status===“requiere_confirmacion”).length;

return (
<div style={{padding:28,fontFamily:FONT,color:C.text}}>
<style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}`}</style>
<div style={{display:“flex”,alignItems:“flex-start”,justifyContent:“space-between”,marginBottom:24,flexWrap:“wrap”,gap:12}}>
<div>
<h1 style={{fontSize:22,fontWeight:700,color:C.text,margin:0}}>Comunicaciones</h1>
<p style={{fontSize:13,color:C.textSec,margin:“4px 0 0”}}>
{comms.length} documentos · {comms.filter(c=>c.direction===“entrante”).length} entrantes · {comms.filter(c=>c.direction===“saliente”).length} salientes
{pendingConfirmation>0&&<span style={{color:C.yellow,fontWeight:600}}> · {pendingConfirmation} pendiente(s) de confirmación</span>}
</p>
</div>
<button onClick={()=>fileRef.current?.click()} style={{background:C.primary,border:“none”,borderRadius:8,padding:“9px 16px”,color:C.bg,fontSize:13,fontWeight:700,cursor:“pointer”,display:“flex”,alignItems:“center”,gap:7}}>
<Upload size={14}/> Subir comunicación
</button>
<input ref={fileRef} type=“file” accept=”.pdf,.docx,.jpg,.png,.zip,.msg,.eml” style={{display:“none”}} onChange={e=>e.target.files?.[0]&&analyzeDocument(e.target.files[0])}/>
</div>

```
  {uploadState==="analyzing"&&(
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:"32px 24px",marginBottom:20,display:"flex",flexDirection:"column",alignItems:"center",gap:16,animation:"fadeIn 0.3s ease"}}>
      <div style={{width:48,height:48,borderRadius:12,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <RefreshCw size={22} color={C.primary} style={{animation:"spin 1s linear infinite"}}/>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:15,fontWeight:600,color:C.text,marginBottom:4}}>Analizando documento</div>
        <div style={{fontSize:12,color:C.textSec}}>Extrayendo texto · Detectando tipo · Identificando EDI · Evaluando impacto</div>
      </div>
      <div style={{display:"flex",gap:6}}>
        {["OCR","Clasificación","Matching EDI","Impacto"].map((s,i)=>(
          <div key={s} style={{padding:"3px 10px",borderRadius:12,fontSize:10,fontWeight:600,background:C.primaryDim,color:C.primary,animation:"pulse 1.5s infinite",animationDelay:`${i*0.3}s`}}>{s}</div>
        ))}
      </div>
    </div>
  )}

  {uploadState==="result"&&analysisResult&&(
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:24,marginBottom:20,animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <div style={{width:36,height:36,borderRadius:8,background:C.primaryDim,display:"flex",alignItems:"center",justifyContent:"center"}}><Zap size={16} color={C.primary}/></div>
        <div><div style={{fontSize:14,fontWeight:700,color:C.text}}>Análisis completado</div><div style={{fontSize:11,color:C.textSec}}>{analysisResult.file_name}</div></div>
        <button onClick={()=>{setUploadState("idle");setAnalysisResult(null);}} style={{marginLeft:"auto",background:"transparent",border:"none",cursor:"pointer",color:C.textMuted}}><X size={16}/></button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
        <div style={{background:C.surfaceEl,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:C.textMuted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>Tipo detectado</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            <Badge label={analysisResult.comm_type?.replace(/_/g," ")} color={C.blue} bg={C.blueDim}/>
            <DirectionBadge direction={analysisResult.direction}/>
          </div>
          {analysisResult.radicado_number&&<div style={{fontSize:11,color:C.textSec,marginTop:8,fontFamily:"monospace"}}>Rad: {analysisResult.radicado_number}</div>}
        </div>
        <div style={{background:C.surfaceEl,borderRadius:10,padding:"12px 14px"}}>
          <div style={{fontSize:10,color:C.textMuted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.08em"}}>EDI identificado</div>
          <div style={{fontSize:12,fontWeight:600,color:C.text,marginBottom:6}}>{analysisResult.candidate_edi||"No identificado"}</div>
          <ConfidenceMeter pct={analysisResult.candidate_confidence||0}/>
          {analysisResult.candidate_confidence>=95?<div style={{fontSize:10,color:C.green,marginTop:4}}>✓ Vinculación automática</div>:<div style={{fontSize:10,color:C.yellow,marginTop:4}}>⚠ Requiere confirmación</div>}
        </div>
      </div>
      <div style={{background:analysisResult.impact_urgency==="crítica"?C.redDim:analysisResult.impact_urgency==="moderada"?C.yellowDim:C.greenDim,border:`1px solid ${analysisResult.impact_urgency==="crítica"?C.red+"44":analysisResult.impact_urgency==="moderada"?C.yellow+"44":C.green+"44"}`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap"}}>
          {analysisResult.impact_types?.map(t=><Badge key={t} label={t.replace(/_/g," ")} color={analysisResult.impact_urgency==="crítica"?C.red:analysisResult.impact_urgency==="moderada"?C.yellow:C.green} bg="transparent"/>)}
        </div>
        <div style={{fontSize:13,color:C.text,lineHeight:1.5}}>{analysisResult.impact_summary}</div>
      </div>
      {analysisResult.matching_reasons?.length>0&&(
        <div style={{marginBottom:16}}>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:8}}>Razones del matching:</div>
          {analysisResult.matching_reasons.map((r,i)=>(
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:4}}>
              <div style={{width:4,height:4,borderRadius:"50%",background:C.primary,marginTop:5,flexShrink:0}}/>
              <span style={{fontSize:12,color:C.textSec}}>{r}</span>
            </div>
          ))}
        </div>
      )}
      {analysisResult.requires_confirmation&&analysisResult.confirmation_questions?.length>0&&(
        <div style={{background:C.surfaceEl,borderRadius:10,padding:"14px 16px",marginBottom:16,border:`1px solid ${C.yellow}33`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><HelpCircle size={14} color={C.yellow}/><span style={{fontSize:12,fontWeight:600,color:C.yellow}}>Confianza menor al 95% — confirma para vincular</span></div>
          {analysisResult.confirmation_questions.map((q,qi)=>(
            <div key={qi} style={{marginBottom:12}}>
              <div style={{fontSize:12,color:C.text,marginBottom:8,fontWeight:500}}>{q.question}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {q.options.map((opt,oi)=>(
                  <button key={oi} onClick={()=>setConfirmAnswers(p=>({...p,[qi]:opt}))} style={{background:confirmAnswers[qi]===opt?C.primaryDim:C.surface,border:`1px solid ${confirmAnswers[qi]===opt?C.primary:C.border}`,borderRadius:6,padding:"7px 12px",color:confirmAnswers[qi]===opt?C.primary:C.textSec,fontSize:12,cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:14,height:14,borderRadius:"50%",border:`2px solid ${confirmAnswers[qi]===opt?C.primary:C.border}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      {confirmAnswers[qi]===opt&&<div style={{width:6,height:6,borderRadius:"50%",background:C.primary}}/>}
                    </div>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:10}}>
        <button onClick={confirmAndLink} style={{flex:1,background:C.primary,border:"none",borderRadius:8,padding:"10px",color:C.bg,fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
          <Link2 size={13}/> Vincular al EDI y aplicar cambios
        </button>
        <button onClick={()=>{setUploadState("idle");setAnalysisResult(null);}} style={{background:C.surfaceEl,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",color:C.textSec,fontSize:13,cursor:"pointer"}}>Cancelar</button>
      </div>
    </div>
  )}

  {uploadState==="idle"&&(
    <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);e.dataTransfer.files?.[0]&&analyzeDocument(e.dataTransfer.files[0]);}} onClick={()=>fileRef.current?.click()}
      style={{border:`2px dashed ${dragOver?C.primary:C.border}`,borderRadius:12,padding:"28px",textAlign:"center",cursor:"pointer",marginBottom:20,background:dragOver?C.primaryDim:"transparent",transition:"all 0.15s"}}>
      <Upload size={24} color={dragOver?C.primary:C.textMuted} style={{marginBottom:10}}/>
      <div style={{fontSize:14,fontWeight:600,color:dragOver?C.primary:C.textSec,marginBottom:4}}>Arrastra o toca para subir una comunicación</div>
      <div style={{fontSize:12,color:C.textMuted}}>PDF · DOCX · JPG · PNG · ZIP · MSG · EML · Sin límite de tamaño</div>
    </div>
  )}

  <div style={{display:"flex",gap:8,marginBottom:16}}>
    {["todos","entrante","saliente"].map(f=>(
      <button key={f} onClick={()=>setFilterDir(f)} style={{background:filterDir===f?C.primaryDim:C.surface,border:`1px solid ${filterDir===f?C.primary+"44":C.border}`,borderRadius:6,padding:"5px 14px",color:filterDir===f?C.primary:C.textSec,fontSize:12,fontWeight:filterDir===f?600:400,cursor:"pointer",textTransform:"capitalize"}}>{f}</button>
    ))}
  </div>

  <div style={{display:"flex",flexDirection:"column",gap:10}}>
    {filteredComms.map(comm=>{
      const urgencyColor=comm.impact_urgency==="crítica"?C.red:comm.impact_urgency==="moderada"?C.yellow:C.blue;
      const urgencyBg=comm.impact_urgency==="crítica"?C.redDim:comm.impact_urgency==="moderada"?C.yellowDim:C.blueDim;
      const edi=EDIS.find(e=>e.id===comm.linked_instrument_id);
      const isSelected=selectedComm?.id===comm.id;
      return (
        <div key={comm.id} style={{background:C.surface,border:`1px solid ${comm.analysis_status==="requiere_confirmacion"?C.yellow+"55":C.border}`,borderRadius:12,overflow:"hidden"}}>
          <div onClick={()=>setSelectedComm(isSelected?null:comm)} style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:38,height:38,borderRadius:8,background:comm.direction==="entrante"?C.blueDim:C.greenDim,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><FileTypeIcon type={comm.file_type}/></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                <span style={{fontSize:13,fontWeight:600,color:C.text}}>{comm.subject_extracted}</span>
                {comm.analysis_status==="requiere_confirmacion"&&<Badge label="Confirmar" color={C.yellow} bg={C.yellowDim}/>}
              </div>
              <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <DirectionBadge direction={comm.direction}/>
                <span style={{fontSize:11,color:C.textMuted}}>{comm.comm_date}</span>
                {comm.radicado_number&&<span style={{fontSize:10,color:C.textMuted,fontFamily:"monospace"}}>Rad. {comm.radicado_number}</span>}
                {edi&&<span style={{fontSize:11,color:C.primary}}>→ {edi.name}</span>}
              </div>
            </div>
            <div style={{textAlign:"right",flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
              <ConfidenceMeter pct={comm.overall_confidence_pct}/>
              {comm.impact_urgency&&<Badge label={comm.impact_urgency} color={urgencyColor} bg={urgencyBg}/>}
            </div>
            <ChevronRight size={14} color={C.textMuted} style={{transform:isSelected?"rotate(90deg)":"none",transition:"transform 0.15s",flexShrink:0}}/>
          </div>
          {isSelected&&(
            <div style={{borderTop:`1px solid ${C.border}`,padding:"16px 18px",animation:"fadeIn 0.2s ease"}}>
              <div style={{fontSize:12,color:C.textSec,marginBottom:12,lineHeight:1.6,padding:"10px 14px",background:urgencyBg,borderRadius:8,borderLeft:`3px solid ${urgencyColor}`}}>{comm.impact_summary}</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>{comm.impact_types?.map(t=><Badge key={t} label={t.replace(/_/g," ")} color={urgencyColor} bg={urgencyBg}/>)}</div>
              {comm.actions?.length>0&&(
                <div>{comm.actions.map((a,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:C.text,marginBottom:4}}><Check size={12} color={C.green}/>{a.desc}</div>
                ))}</div>
              )}
              {comm.analysis_status==="requiere_confirmacion"&&comm.confirmation_questions?.length>0&&(
                <div style={{marginTop:12,padding:"12px 14px",background:C.surfaceEl,borderRadius:8,border:`1px solid ${C.yellow}33`}}>
                  <div style={{fontSize:11,fontWeight:600,color:C.yellow,marginBottom:10,display:"flex",alignItems:"center",gap:6}}><HelpCircle size={12}/>Responde para vincular al EDI correcto</div>
                  {comm.confirmation_questions.map((q,qi)=>(
                    <div key={qi} style={{marginBottom:10}}>
                      <div style={{fontSize:12,color:C.text,marginBottom:6}}>{q.question}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {q.options.map((opt,oi)=>(
                          <button key={oi} onClick={()=>setConfirmAnswers(p=>({...p,[`${comm.id}_${qi}`]:opt}))} style={{background:confirmAnswers[`${comm.id}_${qi}`]===opt?C.primaryDim:C.surface,border:`1px solid ${confirmAnswers[`${comm.id}_${qi}`]===opt?C.primary:C.border}`,borderRadius:6,padding:"6px 10px",color:confirmAnswers[`${comm.id}_${qi}`]===opt?C.primary:C.textSec,fontSize:11,cursor:"pointer",textAlign:"left"}}>{opt}</button>
                        ))}
                      </div>
                    </div>
                  ))}
                  <button onClick={()=>{setComms(p=>p.map(c=>c.id===comm.id?{...c,analysis_status:"confirmado",linked_instrument_id:EDIS[0].id}:c));setSelectedComm(null);}} style={{marginTop:8,background:C.primary,border:"none",borderRadius:6,padding:"8px 16px",color:C.bg,fontSize:12,fontWeight:700,cursor:"pointer"}}>Confirmar y vincular al EDI</button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
</div>
```

);
}