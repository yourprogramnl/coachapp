// app/klanten.js — de mensen- en bedrijfspagina's van de coach-kant:
// Klanten, Coaches en Bedrijven, plus de uitnodigingsflow (invites).
// ---------- KLANTEN-pagina (naar het ontwerp) ----------
let KDATA=null,klantPeriode=30,klantZoek="",klantCoachFilter=null,klantCoachNaam="",klantArchief=false;
// Alle klanten binnen de huidige coach-selectie (beide tabs, actief + archief).
function klantScope(){return klantCoachFilter?coachClients.filter(p=>p.coach_id===klantCoachFilter):coachClients;}
// De klanten in het actieve tabblad (Actief of Archief).
function klantLijst(){return klantScope().filter(p=>!!p.archived===klantArchief);}
function klantTab(a){klantArchief=a;klantenRender();}
async function fillKlanten(){
  const ids=klantScope().map(p=>p.id);
  const td=todayStr(),from90=ymd(addDays(new Date(),-89)),plus14=ymd(addDays(new Date(),14));
  let ws=[],rs=[],msgs=[],alleTags=[],ptags=[],cons=[];
  if(ME.profile.company_id)alleTags=(await db.from("tags").select("*").eq("company_id",ME.profile.company_id).order("name")).data||[];
  if(ids.length){
    ws=(await db.from("workouts").select("id,client_id,workout_date,title").in("client_id",ids).gte("workout_date",from90).lte("workout_date",plus14).order("workout_date")).data||[];
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("workout_id,status").in("workout_id",wids)).data||[];
    msgs=(await db.from("messages").select("athlete_id").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
    ptags=(await db.from("profile_tags").select("profile_id,tag_id").in("profile_id",ids)).data||[];
    cons=(await db.from("consults").select("athlete_id,consult_date").in("athlete_id",ids)).data||[];
  }
  const tagsByClient={};ptags.forEach(pt=>{(tagsByClient[pt.profile_id]=tagsByClient[pt.profile_id]||[]).push(pt.tag_id);});
  const lastConsult={};cons.forEach(c=>{if(c.consult_date&&(!lastConsult[c.athlete_id]||c.consult_date>lastConsult[c.athlete_id]))lastConsult[c.athlete_id]=c.consult_date;});
  KDATA={ws:ws.filter(w=>!/^rest ?day$/i.test((w.title||"").trim())),done:new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id)),msgs,alleTags,tagsByClient,cons,lastConsult};
  klantenRender();
}
function klantWorkoutChip(p){
  const td=todayStr();
  const mijn=KDATA.ws.filter(w=>w.client_id===p.id);
  const up=mijn.filter(w=>w.workout_date>=td).sort((a,b)=>a.workout_date.localeCompare(b.workout_date))[0];
  if(up){
    const d=new Date(up.workout_date+"T00:00:00");
    const diff=Math.round((d-new Date(td+"T00:00:00"))/864e5);
    const lbl=diff===0?"vandaag":(diff<=6?DAGVOL[(d.getDay()+6)%7]:DAGEN[(d.getDay()+6)%7].toLowerCase()+" "+d.getDate()+" "+MAANDKORT[d.getMonth()]);
    return '<span class="wchip ok">'+esc(lbl)+'</span>';
  }
  const late=mijn.filter(w=>w.workout_date<td&&!KDATA.done.has(w.id)).sort((a,b)=>b.workout_date.localeCompare(a.workout_date))[0];
  if(late){const d=new Date(late.workout_date+"T00:00:00");return '<span class="wchip laat">'+DAGEN[(d.getDay()+6)%7].toLowerCase()+' '+d.getDate()+' '+MAANDKORT[d.getMonth()]+'</span>';}
  return '<span class="wchip leeg">geen gepland</span>';
}
function klantComp(list){
  const td=todayStr(),fromP=ymd(addDays(new Date(),-(klantPeriode-1)));
  const sched=KDATA.ws.filter(w=>w.workout_date>=fromP&&w.workout_date<=td&&list.some(c=>c.id===w.client_id));
  if(!sched.length)return null;
  return Math.round(sched.filter(w=>KDATA.done.has(w.id)).length/sched.length*100);
}
function klantRijen(){
  const zoek=klantZoek.toLowerCase();
  const lijst=klantLijst().filter(p=>!zoek||naamVan(p).toLowerCase().includes(zoek)||(p.email||"").toLowerCase().includes(zoek)).sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  return lijst.map(p=>{
    const wp=klantComp([p]);
    return '<div class="trow click" onclick="openClient(\''+p.id+'\')">'+
      '<div style="flex:2.2;display:flex;gap:11px;align-items:center"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div><div style="font-weight:700;font-size:13px">'+naamVan(p)+'</div><div class="sm muted">Laatste consult: '+(KDATA.lastConsult[p.id]?esc(datumNL(KDATA.lastConsult[p.id])):"n.v.t.")+'</div></div></div>'+
      '<div style="flex:1.2">'+klantWorkoutChip(p)+'</div>'+
      '<div style="flex:1">'+(wp==null?'<span class="muted">–</span>':'<b style="color:'+(wp>=70?'#1d9a63':'#e5484d')+'">'+wp+'%</b>')+'</div>'+
      '<div style="flex:1.6" onclick="event.stopPropagation()">'+klantTagCel(p)+'</div>'+
      '<button class="kebab" onclick="event.stopPropagation();openKlantMenu(event,\''+p.id+'\','+(p.archived?'true':'false')+')">⋮</button></div>';
  }).join("");
}
function klantZoekF(v){klantZoek=v;const h=document.getElementById("klantrows");if(h)h.innerHTML=klantRijen()||'<div class="trow"><span class="muted">Geen klanten gevonden.</span></div>';}
function klantenRender(){
  const cp=document.getElementById("cpage");if(!cp||!KDATA)return;
  const scope=klantScope(),actief=scope.filter(p=>!p.archived),archief=scope.filter(p=>p.archived);
  const msgIds=new Set(KDATA.msgs.map(m=>m.athlete_id));
  const totaal=klantComp(actief);
  const cmTot=actief.length?Math.round(actief.filter(p=>msgIds.has(p.id)).length/actief.length*100):null;
  // Consult-rate: % actieve klanten met minstens één consult in de laatste 30 dagen.
  const consFrom=ymd(addDays(new Date(),-29));
  const consIds=new Set((KDATA.cons||[]).filter(c=>(c.consult_date||"")>=consFrom).map(c=>c.athlete_id));
  const crTot=actief.length?Math.round(actief.filter(p=>consIds.has(p.id)).length/actief.length*100):null;
  const banner=klantCoachFilter?'<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px"><a onclick="coachGo(\'coaches\')" style="color:var(--accent);cursor:pointer;font-weight:700">‹ Alle coaches</a><span class="muted">Klanten van <b style="color:var(--txt)">'+esc(klantCoachNaam)+'</b></span></div>':'';
  cp.innerHTML=banner+'<div class="statbar2">'+
    '<div><div class="n">'+actief.length+'</div><div class="l">Actieve klanten</div></div>'+
    '<div><div class="n acc">'+(totaal==null?'–':totaal+'%')+'</div><div class="l">Compliance</div><div><select onchange="klantPeriode=parseInt(this.value);klantenRender()">'+[7,30,90].map(n=>'<option value="'+n+'"'+(klantPeriode===n?' selected':'')+'>Workout: '+n+' dagen</option>').join('')+'</select></div></div>'+
    '<div><div class="n acc">'+(crTot==null?'–':crTot+'%')+'</div><div class="l">Consult-rate · 30 dagen</div></div>'+
    '<div><div class="n acc">'+(cmTot==null?'–':cmTot+'%')+'</div><div class="l">Contactmomenten</div></div></div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'+
      '<div class="search2"><svg class="i sm-i"><use href="#i-search"/></svg><input placeholder="Zoek op naam of tag…" value="'+esc(klantZoek)+'" oninput="klantZoekF(this.value)"></div>'+
      '<div style="margin-left:auto;display:flex;gap:8px"><button class="btn" onclick="openInvModal(\'lid\')">+ Klant toevoegen</button><button class="btn ghost" onclick="openTagBeheer()">Tags beheren</button><button class="btn ghost" onclick="exportKlanten()">Exporteren</button></div></div>'+
    '<div class="ctabs"><button class="'+(klantArchief?'':'on')+'" onclick="klantTab(false)">Actief <span style="font-weight:600;color:#8a919c">'+actief.length+'</span></button><button class="'+(klantArchief?'on':'')+'" onclick="klantTab(true)">Archief <span style="font-weight:600;color:#8a919c">'+archief.length+'</span></button></div>'+
    '<div class="card"><div class="thead"><div style="flex:2.2">Naam</div><div style="flex:1.2">Workout</div><div style="flex:1">Compliance</div><div style="flex:1.6">Tags</div><div style="width:30px"></div></div>'+
    '<div id="klantrows">'+(klantRijen()||'<div class="trow"><span class="muted">'+(klantArchief?'Geen gearchiveerde klanten.':'Nog geen klanten gekoppeld.')+'</span></div>')+'</div></div>';
}
// ---------- CSV-export met kolomkeuze (zoals CoachRx) ----------
// [sleutel, kop, waarde-functie(p, ctx)]. Alleen kolommen die we echt kunnen vullen.
const EXPORT_COLS=[
  ["id","Klant-ID",p=>p.id],
  ["naam","Naam",p=>naamVan(p)],
  ["email","E-mail",p=>p.email||""],
  ["coach","Coach",(p,c)=>c.coachNaam(p.coach_id)],
  ["coachmail","Coach-e-mail",(p,c)=>c.coachMail(p.coach_id)],
  ["status","Status",p=>p.archived?"Gearchiveerd":"Actief"],
  ["aangemaakt","Aangemaakt op",p=>p.created_at?String(p.created_at).slice(0,10):""],
  ["telefoon","Telefoon",p=>p.phone||""],
  ["adres","Adres",p=>p.address||""],
  ["lengte","Lengte (cm)",p=>p.height_cm!=null?p.height_cm:""],
  ["gewicht","Gewicht (kg)",p=>p.weight_kg!=null?p.weight_kg:""],
  ["geslacht","Geslacht",p=>p.gender||""],
  ["geboorte","Geboortedatum",p=>p.birth_date||""],
  ["nood","Noodcontact",p=>p.emergency_contact||""],
  ["tags","Tags",(p,c)=>c.tags(p)],
  ["workouts","Workouts gedaan",(p,c)=>c.workoutsDone(p)],
  ["compliance","Compliance %",(p,c)=>c.compliance(p)],
  ["lifts","Max lifts (1RM)",(p,c)=>c.maxLifts(p)]
];
let exportCols=null;
function exportKlanten(){openExportModal();}
function ensureExportModal(){
  if(document.getElementById("expmodal"))return;
  const w=document.createElement("div");
  w.innerHTML='<div class="lmodal" id="expmodal" style="z-index:445"><div class="box" style="width:560px;max-width:94vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h3 style="margin:0">Exporteren naar CSV</h3><span onclick="closeExport()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" id="exp-sub" style="margin-bottom:12px"></div>'+
    '<label class="pf-toggle" style="margin:0 0 10px"><input type="checkbox" id="exp-all" checked onchange="exportAlles(this.checked)"><span class="pf-sw"></span> Alles selecteren</label>'+
    '<div id="exp-cols" style="display:grid;grid-template-columns:1fr 1fr;gap:7px 18px"></div>'+
    '<div class="mfoot" style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line);padding-top:14px;margin-top:16px">'+
      '<button class="btn ghost" onclick="closeExport()">Annuleren</button><button class="btn" onclick="doExport()">Exporteren</button></div>'+
    '</div></div>';
  document.body.appendChild(w.firstChild);
  document.getElementById("expmodal").addEventListener("click",e=>{if(e.target.id==="expmodal")closeExport();});
}
function openExportModal(){
  ensureExportModal();
  exportCols=new Set(EXPORT_COLS.map(c=>c[0]));
  const n=klantLijst().length;
  document.getElementById("exp-sub").textContent="Kies de kolommen. "+n+" klant"+(n===1?" wordt":"en worden")+" geëxporteerd"+(klantCoachFilter?" (van "+klantCoachNaam+")":"")+(klantArchief?" – archief":"")+".";
  exportRender();document.getElementById("expmodal").classList.add("show");
}
function exportRender(){
  const host=document.getElementById("exp-cols");if(!host)return;
  host.innerHTML=EXPORT_COLS.map(c=>'<label class="pf-toggle" style="margin:0"><input type="checkbox"'+(exportCols.has(c[0])?" checked":"")+' onchange="exportToggle(\''+c[0]+'\',this.checked)"><span class="pf-sw"></span> '+esc(c[1])+'</label>').join("");
  const all=document.getElementById("exp-all");if(all)all.checked=exportCols.size===EXPORT_COLS.length;
}
function exportToggle(k,on){if(on)exportCols.add(k);else exportCols.delete(k);const all=document.getElementById("exp-all");if(all)all.checked=exportCols.size===EXPORT_COLS.length;}
function exportAlles(on){exportCols=on?new Set(EXPORT_COLS.map(c=>c[0])):new Set();exportRender();}
function closeExport(){const m=document.getElementById("expmodal");if(m)m.classList.remove("show");}
async function doExport(){
  const cols=EXPORT_COLS.filter(c=>exportCols.has(c[0]));
  if(!cols.length){toast("Kies minstens één kolom");return;}
  const lijst=klantLijst();const ids=lijst.map(p=>p.id);
  // Coach-namen/-mails ophalen
  const coachIds=[...new Set(lijst.map(p=>p.coach_id).filter(Boolean))];
  let coachMap={};
  if(coachIds.length&&(exportCols.has("coach")||exportCols.has("coachmail"))){
    const{data:cs}=await db.from("profiles").select("id,first_name,last_name,email").in("id",coachIds);
    (cs||[]).forEach(c=>coachMap[c.id]=c);
  }
  // Workouts gedaan (aantal voltooide workouts, all-time)
  let doneCount={};
  if(ids.length&&exportCols.has("workouts")){
    const{data:res}=await db.from("results").select("workout_id,athlete_id,status").in("athlete_id",ids).eq("status","completed");
    const per={};(res||[]).forEach(r=>{(per[r.athlete_id]=per[r.athlete_id]||new Set()).add(r.workout_id);});
    Object.keys(per).forEach(a=>doneCount[a]=per[a].size);
  }
  // Max lifts: laatste waarde per 1RM-metric
  let lifts={};
  if(ids.length&&exportCols.has("lifts")){
    const{data:ms}=await db.from("metrics").select("athlete_id,metric,value,value_text,unit,measured_at").in("athlete_id",ids).ilike("metric","%1rm%").order("measured_at",{ascending:false});
    const seen={};(ms||[]).forEach(m=>{const key=m.athlete_id+"|"+m.metric;if(seen[key])return;seen[key]=true;const val=(m.value!=null?m.value:(m.value_text||""))+(m.unit?" "+m.unit:"");(lifts[m.athlete_id]=lifts[m.athlete_id]||[]).push(m.metric+": "+val);});
  }
  const ctx={
    coachNaam:id=>{const c=coachMap[id];return c?naamVan(c):"";},
    coachMail:id=>{const c=coachMap[id];return c?(c.email||""):"";},
    tags:p=>(KDATA.tagsByClient[p.id]||[]).map(tid=>{const t=tagById(tid);return t?t.name:"";}).filter(Boolean).join(", "),
    workoutsDone:p=>doneCount[p.id]||0,
    compliance:p=>{const c=klantComp([p]);return c==null?"":c+"%";},
    maxLifts:p=>(lifts[p.id]||[]).join("; ")
  };
  const q=v=>{v=(v==null?"":String(v));return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const kop=cols.map(c=>c[1]).join(";");
  const regels=lijst.map(p=>cols.map(c=>q(c[2](p,ctx))).join(";"));
  const blob=new Blob(["﻿"+kop+"\n"+regels.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="klanten"+(klantCoachFilter?"-"+(klantCoachNaam||"coach").replace(/[^a-z0-9]+/gi,"-").toLowerCase():"")+(klantArchief?"-archief":"")+".csv";
  a.click();URL.revokeObjectURL(a.href);
  closeExport();toast(lijst.length+" klant"+(lijst.length===1?"":"en")+" geëxporteerd");
}

// ---------- Tags op klanten (herbruikbaar, met kleur) ----------
function tagById(id){return (KDATA.alleTags||[]).find(t=>t.id===id);}
function klantTagCel(p){
  const chips=(KDATA.tagsByClient[p.id]||[]).map(id=>tagById(id)).filter(Boolean)
    .map(t=>'<span class="ktag"><span class="kdot" style="background:'+(TPLKLEUR[t.color]||TPLKLEUR.blue)+'"></span>'+esc(t.name)+' <span class="x" onclick="event.stopPropagation();tagToggleKlant(\''+p.id+'\',\''+t.id+'\')">✕</span></span>').join("");
  return '<div class="ktagcel">'+chips+'<button class="plusbtn" title="Tag toevoegen" onclick="event.stopPropagation();openTagPicker(event,\''+p.id+'\')">+</button></div>';
}
function openTagPicker(ev,clientId){
  ev.stopPropagation();
  const cell=ev.target.closest(".ktagcel");if(!cell)return;
  const bestond=cell.querySelector(".tagdrop");
  document.querySelectorAll(".tagdrop").forEach(x=>x.remove());
  if(bestond)return;
  const have=new Set(KDATA.tagsByClient[clientId]||[]);
  const d=document.createElement("div");d.className="tagdrop";
  d.innerHTML='<div class="hd">Tags</div>'+
    ((KDATA.alleTags||[]).map(t=>'<button class="tagopt" onclick="event.stopPropagation();tagToggleKlant(\''+clientId+'\',\''+t.id+'\')"><span class="kdot" style="background:'+(TPLKLEUR[t.color]||TPLKLEUR.blue)+'"></span><span style="flex:1">'+esc(t.name)+'</span>'+(have.has(t.id)?'<span class="vk">✓</span>':'')+'</button>').join("")||'<div class="leeg">Nog geen tags. Maak er hieronder één.</div>')+
    '<div class="tagnieuw"><input placeholder="Nieuwe tag…" onclick="event.stopPropagation()" onkeydown="if(event.key===\'Enter\'){event.stopPropagation();tagNieuw(this,\''+clientId+'\');}"><div class="kleuren">'+TPLKLEUREN.map((k,i)=>'<span class="kc'+(i===0?' on':'')+'" data-k="'+k+'" title="'+esc(LEGNAAM[k]||k)+'" style="background:'+TPLKLEUR[k]+'" onclick="event.stopPropagation();tagKiesKleur(this)"></span>').join("")+'</div></div>';
  cell.appendChild(d);
}
function tagKiesKleur(el){el.parentNode.querySelectorAll(".kc").forEach(x=>x.classList.remove("on"));el.classList.add("on");}
async function tagToggleKlant(clientId,tagId){
  const have=new Set(KDATA.tagsByClient[clientId]||[]);
  if(have.has(tagId)){
    const{error}=await db.from("profile_tags").delete().eq("profile_id",clientId).eq("tag_id",tagId);
    if(error){toast(error.message||"Mislukt");return;}
    KDATA.tagsByClient[clientId]=(KDATA.tagsByClient[clientId]||[]).filter(x=>x!==tagId);
  }else{
    const{error}=await db.from("profile_tags").insert({company_id:ME.profile.company_id,profile_id:clientId,tag_id:tagId});
    if(error){toast(error.message||"Mislukt");return;}
    (KDATA.tagsByClient[clientId]=KDATA.tagsByClient[clientId]||[]).push(tagId);
  }
  klantenRender();
}
async function tagNieuw(inp,clientId){
  const naam=(inp.value||"").trim();if(!naam)return;
  const drop=inp.closest(".tagdrop");const kc=drop&&drop.querySelector(".kc.on");
  const kleur=kc?kc.dataset.k:"blue";
  const{data,error}=await db.from("tags").insert({company_id:ME.profile.company_id,name:naam,color:kleur}).select().single();
  if(error){toast(error.message||"Tag maken mislukt");return;}
  KDATA.alleTags.push(data);KDATA.alleTags.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  tagToggleKlant(clientId,data.id); // meteen aan deze klant koppelen
}
document.addEventListener("click",e=>{if(!e.target.closest(".tagdrop")&&!e.target.closest(".plusbtn"))document.querySelectorAll(".tagdrop").forEach(x=>x.remove());});

// ---------- Tags beheren (modal) ----------
function ensureTagModal(){
  if(document.getElementById("tagmodal"))return;
  const w=document.createElement("div");
  w.innerHTML='<div class="lmodal" id="tagmodal" style="z-index:440"><div class="box" style="width:480px;max-width:94vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Tags beheren</h3><span onclick="closeTagModal()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div id="tagbeheer-lijst"></div>'+
    '<div class="tagnieuw" style="margin-top:12px"><input id="tagnew-naam" placeholder="Nieuwe tag…" onkeydown="if(event.key===\'Enter\')tagBeheerNieuw()"><div class="kleuren" id="tagnew-kleuren"></div><button class="btn sm" onclick="tagBeheerNieuw()">Toevoegen</button></div>'+
    '</div></div>';
  document.body.appendChild(w.firstChild);
  document.getElementById("tagmodal").addEventListener("click",e=>{if(e.target.id==="tagmodal")closeTagModal();});
}
function openTagBeheer(){
  ensureTagModal();
  document.getElementById("tagnew-kleuren").innerHTML=TPLKLEUREN.map((k,i)=>'<span class="kc'+(i===0?' on':'')+'" data-k="'+k+'" title="'+esc(LEGNAAM[k]||k)+'" style="background:'+TPLKLEUR[k]+'" onclick="tagKiesKleur(this)"></span>').join("");
  document.getElementById("tagnew-naam").value="";
  tagBeheerRender();document.getElementById("tagmodal").classList.add("show");
}
function closeTagModal(){const m=document.getElementById("tagmodal");if(m)m.classList.remove("show");}
function tagBeheerRender(){
  const host=document.getElementById("tagbeheer-lijst");if(!host)return;
  const gebruikt={};Object.values(KDATA.tagsByClient||{}).forEach(arr=>arr.forEach(id=>gebruikt[id]=(gebruikt[id]||0)+1));
  host.innerHTML=(KDATA.alleTags||[]).map(t=>'<div class="tagrow"><span class="kdot" style="background:'+(TPLKLEUR[t.color]||TPLKLEUR.blue)+'"></span>'+
    '<span style="flex:1;font-weight:600">'+esc(t.name)+'</span>'+
    '<span class="kleuren">'+TPLKLEUREN.map(k=>'<span class="kc'+(t.color===k?' on':'')+'" data-k="'+k+'" style="background:'+TPLKLEUR[k]+'" onclick="tagKleurZet(\''+t.id+'\',\''+k+'\')"></span>').join("")+'</span>'+
    '<span class="sm muted" style="width:52px;text-align:right">'+(gebruikt[t.id]||0)+'x</span>'+
    '<span class="x" style="cursor:pointer;color:#e5484d;padding:0 6px" title="Verwijderen" onclick="tagVerwijder(\''+t.id+'\')">✕</span></div>').join("")||'<div class="leeg">Nog geen tags.</div>';
}
async function tagBeheerNieuw(){
  const inp=document.getElementById("tagnew-naam");const naam=(inp.value||"").trim();if(!naam)return;
  const kc=document.querySelector("#tagnew-kleuren .kc.on");const kleur=kc?kc.dataset.k:"blue";
  const{data,error}=await db.from("tags").insert({company_id:ME.profile.company_id,name:naam,color:kleur}).select().single();
  if(error){toast(error.message||"Mislukt");return;}
  KDATA.alleTags.push(data);KDATA.alleTags.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  inp.value="";tagBeheerRender();
}
async function tagKleurZet(id,kleur){
  const{error}=await db.from("tags").update({color:kleur}).eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  const t=tagById(id);if(t)t.color=kleur;tagBeheerRender();klantenRender();
}
async function tagVerwijder(id){
  if(!confirm("Deze tag verwijderen? Hij wordt bij alle klanten weggehaald."))return;
  const{error}=await db.from("tags").delete().eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  KDATA.alleTags=KDATA.alleTags.filter(t=>t.id!==id);
  Object.keys(KDATA.tagsByClient).forEach(cid=>{KDATA.tagsByClient[cid]=(KDATA.tagsByClient[cid]||[]).filter(x=>x!==id);});
  tagBeheerRender();klantenRender();
}

// ---------- ⋮-menu per klant (profiel, intake, bericht, overzetten, archiveren) ----------
function klantMenuWeg(){document.querySelectorAll(".coachmenu").forEach(x=>x.remove());}
function openKlantMenu(ev,id,archived){
  ev.stopPropagation();
  const row=ev.target.closest(".trow");if(!row)return;
  const bestond=row.querySelector(".coachmenu");
  klantMenuWeg();
  if(bestond)return;
  const staff=myRole()==="platform_admin"||myRole()==="eigenaar";
  const m=document.createElement("div");m.className="coachmenu";
  m.innerHTML=
    '<button onclick="event.stopPropagation();klantEditProfiel(\''+id+'\')">Profiel bewerken</button>'+
    '<button onclick="event.stopPropagation();klantIntake(\''+id+'\')">Intakeformulier</button>'+
    '<button onclick="event.stopPropagation();klantBericht(\''+id+'\')">Bericht sturen</button>'+
    '<button onclick="event.stopPropagation();klantResetlink(\''+id+'\')">Wachtwoordlink sturen</button>'+
    (staff?'<button onclick="event.stopPropagation();klantOverzetten(event,\''+id+'\')">Overzetten</button>':'')+
    (archived
      ? '<button onclick="event.stopPropagation();klantArchiveer(\''+id+'\',false)">Terughalen</button>'
      : '<button class="danger" onclick="event.stopPropagation();klantArchiveer(\''+id+'\',true)">Archiveren</button>');
  row.appendChild(m);
}
function klantEditProfiel(id){klantMenuWeg();openClient(id);renderClient("profiel");}
function klantIntake(id){klantMenuWeg();openClient(id);renderClient("profiel");pfSwitchTab("intake");}
function klantBericht(id){klantMenuWeg();openClient(id);if(typeof openChatPop==="function")openChatPop();}
// Stuurt de klant een wachtwoord-herstellink per e-mail (voor als hij zijn
// wachtwoord kwijt is); de link komt uit op de herstel-pagina van deze app.
async function klantResetlink(id){
  klantMenuWeg();
  const p=coachClients.find(x=>x.id===id);
  if(!p||!p.email){toast("Geen e-mailadres bekend voor deze klant");return;}
  if(!confirm("Wachtwoord-herstellink mailen naar "+p.email+"?"))return;
  const{error}=await db.auth.resetPasswordForEmail(p.email,{redirectTo:location.origin+location.pathname});
  toast(error?(error.message||"Versturen mislukt"):"Herstel-link gestuurd naar "+p.email);
}
async function klantArchiveer(id,arch){
  klantMenuWeg();
  const{error}=await db.from("profiles").update({archived:arch}).eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  const p=coachClients.find(x=>x.id===id);if(p)p.archived=arch;
  toast(arch?"Klant gearchiveerd":"Klant teruggehaald");klantenRender();
}
async function klantOverzetten(ev,id){
  ev.stopPropagation();
  const row=ev.target.closest(".trow"),menu=row&&row.querySelector(".coachmenu");if(!menu)return;
  const p=coachClients.find(x=>x.id===id)||{};
  const{data:cs}=await db.from("profiles").select("id,first_name,last_name").in("role",["coach","eigenaar"]).eq("company_id",ME.profile.company_id);
  const opts=(cs||[]).filter(c=>c.id!==p.coach_id);
  menu.innerHTML='<div style="padding:6px 10px;font-size:10px;font-weight:800;letter-spacing:.5px;color:#8a919c;text-transform:uppercase">Overzetten naar</div>'+
    (opts.map(c=>'<button onclick="event.stopPropagation();klantTransfer(\''+id+'\',\''+c.id+'\')">'+esc(naamVan(c))+'</button>').join("")||'<div style="padding:8px 10px;font-size:12px;color:#8a919c">Geen andere coach beschikbaar</div>');
}
async function klantTransfer(id,coachId){
  klantMenuWeg();
  const{error}=await db.from("profiles").update({coach_id:coachId}).eq("id",id);
  if(error){toast(error.message||"Overzetten mislukt");return;}
  const p=coachClients.find(x=>x.id===id);if(p)p.coach_id=coachId;
  toast("Klant overgezet");klantenRender();
}

async function fillCoaches(){
  let q=db.from("profiles").select("*").in("role",["coach","eigenaar"]);
  if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data:coaches}=await q;
  // Prestaties per coach: compliance (30 dagen) en contactmomenten (deze week) van zijn klanten
  const ids=coachClients.map(p=>p.id);
  const td=todayStr(),from30=ymd(addDays(new Date(),-29));
  let ws=[],rs=[],msgs=[],cons=[];
  if(ids.length){
    ws=((await db.from("workouts").select("id,client_id,workout_date,title").in("client_id",ids).gte("workout_date",from30).lte("workout_date",td)).data||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("workout_id,status").in("workout_id",wids)).data||[];
    msgs=(await db.from("messages").select("athlete_id").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
    cons=(await db.from("consults").select("athlete_id").in("athlete_id",ids).gte("consult_date",from30)).data||[];
  }
  const doneWo=new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id));
  const gesprokenIds=new Set(msgs.map(m=>m.athlete_id));
  const consultIds=new Set(cons.map(c=>c.athlete_id));
  const compVan=list=>{const sched=ws.filter(w=>list.some(c=>c.id===w.client_id));if(!sched.length)return null;return Math.round(sched.filter(w=>doneWo.has(w.id)).length/sched.length*100);};
  // Consult-rate: % klanten met minstens één consult in de laatste 30 dagen.
  const crVan=list=>list.length?Math.round(list.filter(p=>consultIds.has(p.id)).length/list.length*100):null;
  const totaalComp=compVan(coachClients);
  const totaalCm=coachClients.length?Math.round(coachClients.filter(p=>gesprokenIds.has(p.id)).length/coachClients.length*100):null;
  const totaalCr=crVan(coachClients);
  const rows=(coaches||[]).sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(c=>{
    const kl=coachClients.filter(k=>k.coach_id===c.id);
    const wp=compVan(kl);
    const cm=kl.length?Math.round(kl.filter(p=>gesprokenIds.has(p.id)).length/kl.length*100):null;
    const cr=crVan(kl);
    const rol=c.role==="eigenaar"?'<span class="cpill purple">Eigenaar</span>':'<span class="cpill teal">Coach</span>';
    const zelf=c.id===ME.user.id; // jezelf kun je niet beheren (geen ⋮)
    const menuCall="openCoachMenu(event,'"+c.id+"','"+c.role+"',"+kl.length+")";
    // Klik op de rij = de klanten van deze coach bekijken; het ⋮ opent het beheer-menu.
    return '<div class="trow crow" data-cid="'+esc(c.id)+'" data-cnaam="'+esc(naamVan(c))+'" onclick="coachKlantenRow(this)"><div style="flex:2.2;display:flex;gap:11px;align-items:center"><div class="cavc" style="'+avFotoStyle(c)+'">'+avFotoText(c)+'</div><div><div style="font-weight:700;font-size:13px">'+naamVan(c)+'</div><div class="sm muted">'+kl.length+' '+(kl.length===1?'klant':'klanten')+'</div></div></div>'+
      '<div style="flex:1">'+(wp==null?'<span class="muted">–</span>':'<b style="color:'+(wp>=70?'#1d9a63':'#e5484d')+'">'+wp+'%</b>')+'</div>'+
      '<div style="flex:1">'+(cr==null?'<span class="muted">–</span>':'<b style="color:'+(cr>=70?'#1d9a63':'#8a919c')+'">'+cr+'%</b>')+'</div>'+
      '<div style="flex:1.2">'+(cm==null?'<span class="muted">0%</span>':'<b style="color:'+(cm>=70?'#1d9a63':'#8a919c')+'">'+cm+'%</b>')+'</div>'+
      '<div style="flex:1">'+rol+'</div>'+
      (zelf?'<span style="width:30px;flex:none"></span>':'<button class="kebab" onclick="event.stopPropagation();'+menuCall+'">⋮</button>')+'</div>';
  }).join("");
  const cp=document.getElementById("cpage");
  if(!cp)return;
  cp.innerHTML='<div class="statbar2">'+
    '<div><div class="n">'+coachClients.length+'</div><div class="l">Klanten totaal</div></div>'+
    '<div><div class="n acc">'+(totaalComp==null?'–':totaalComp+'%')+'</div><div class="l">Compliance</div></div>'+
    '<div><div class="n acc">'+(totaalCr==null?'–':totaalCr+'%')+'</div><div class="l">Consult-rate · 30 dagen</div></div>'+
    '<div><div class="n acc">'+(totaalCm==null?'–':totaalCm+'%')+'</div><div class="l">Contactmomenten</div></div></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h1 style="margin:0">Coaches</h1><button class="btn" onclick="openInvModal(\'coach\')">+ Coach toevoegen</button></div>'+
    '<div class="card"><div class="thead"><div style="flex:2.2">Naam</div><div style="flex:1">Workout %</div><div style="flex:1">Consult-rate</div><div style="flex:1.2">Contactmomenten</div><div style="flex:1">Rol</div><div style="width:30px"></div></div>'+
    (rows||'<div class="trow"><span class="muted">Nog geen coaches.</span></div>')+'</div>';
}
// Doorklikken vanaf een coach-rij naar de Klanten-lijst, gefilterd op die coach.
function coachKlantenRow(el){coachKlanten(el.dataset.cid,el.dataset.cnaam||"");}
function coachKlanten(id,naam){
  klantCoachFilter=id;klantCoachNaam=naam;klantZoek="";
  coachSection="clients";setHash("clients");coachRenderSection();
}
// ---------- Coaches beheren via het ⋮-menu (rol wisselen, verwijderen) ----------
// Zichtbaar voor platform_admin en eigenaar; rol wisselt tussen coach en eigenaar.
function openCoachMenu(ev,id,rol,klanten){
  ev.stopPropagation();
  const row=ev.target.closest(".trow");if(!row)return;
  const bestond=row.querySelector(".coachmenu");
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(bestond)return; // open menu = dichtklappen
  const m=document.createElement("div");m.className="coachmenu";
  m.innerHTML=(rol==="eigenaar"
      ? '<button onclick="event.stopPropagation();coachSetRole(\''+id+'\',\'coach\')">Zet terug naar coach</button>'
      : '<button onclick="event.stopPropagation();coachSetRole(\''+id+'\',\'eigenaar\')">Maak eigenaar</button>')+
    '<button class="danger" onclick="event.stopPropagation();coachVerwijder(\''+id+'\','+klanten+')">Verwijderen</button>';
  row.appendChild(m);
}
async function coachSetRole(id,rol){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  const{error}=await db.from("profiles").update({role:rol}).eq("id",id);
  if(error){toast(error.message||"Wijzigen mislukt");return;}
  toast(rol==="eigenaar"?"Gemaakt tot eigenaar":"Teruggezet naar coach");
  fillCoaches();
}
async function coachVerwijder(id,klanten){
  document.querySelectorAll(".coachmenu").forEach(x=>x.remove());
  if(klanten>0){toast("Deze coach heeft nog "+klanten+" klant"+(klanten===1?"":"en")+". Verplaats die eerst naar een andere coach.");return;}
  if(!confirm("Deze coach definitief verwijderen? Dit kan niet ongedaan worden gemaakt."))return;
  const{error}=await db.from("profiles").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast("Coach verwijderd");
  fillCoaches();
}
document.addEventListener("click",e=>{if(!e.target.closest(".coachmenu")&&!e.target.closest(".crow")&&!e.target.closest(".kebab"))document.querySelectorAll(".coachmenu").forEach(x=>x.remove());});

// ---------- Uitnodigen (klant of coach) via de invites-tabel ----------
let invRol="lid";
async function openInvModal(rol){
  ensureLibModals();invRol=rol;
  // Vanuit een coach-klantenlijst wordt de nieuwe klant automatisch aan die coach gekoppeld (geen keuze nodig).
  const bijCoach=rol!=="coach"&&!!klantCoachFilter;
  document.getElementById("inv-titel").textContent=rol==="coach"?"Coach toevoegen":(bijCoach?"Klant toevoegen bij "+klantCoachNaam:"Klant toevoegen");
  document.getElementById("inv-coach-veld").style.display=(rol==="coach"||bijCoach)?"none":"";
  document.getElementById("inv-lid-veld").style.display=rol==="coach"?"none":"";
  ["inv-vn","inv-an","inv-email"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("inv-result").style.display="none";
  document.getElementById("inv-maak").style.display="";
  document.getElementById("inv-msg").textContent="";
  document.getElementById("invmodal").classList.add("show");
  if(rol!=="coach"&&!bijCoach){
    const{data:cs}=await db.from("profiles").select("id,first_name,last_name,email").in("role",["coach","eigenaar"]).eq("company_id",ME.profile.company_id);
    document.getElementById("inv-coach").innerHTML=(cs||[]).map(c=>'<option value="'+c.id+'"'+(c.id===ME.user.id?" selected":"")+'>'+naamVan(c)+'</option>').join("");
  }
}
async function invAanmaken(){
  const vn=document.getElementById("inv-vn").value.trim(),an=document.getElementById("inv-an").value.trim(),em=document.getElementById("inv-email").value.trim();
  const msg=document.getElementById("inv-msg");
  if(!em){msg.textContent="Vul een e-mailadres in.";return;}
  const rec={company_id:ME.profile.company_id,coach_id:invRol==="coach"?null:(klantCoachFilter||document.getElementById("inv-coach").value||null),email:em,first_name:vn||null,last_name:an||null,role:invRol,membership_type:invRol==="coach"?null:document.getElementById("inv-type").value,created_by:ME.user.id,expires_at:new Date(Date.now()+14*864e5).toISOString()};
  const{data,error}=await db.from("invites").insert(rec).select().single();
  if(error){msg.textContent=error.message||"Aanmaken mislukt";return;}
  document.getElementById("inv-link").value=location.origin+location.pathname+"?invite="+data.token;
  document.getElementById("inv-result").style.display="";
  document.getElementById("inv-maak").style.display="none";
  msg.textContent="";
}
function kopieerInvLink(){const i=document.getElementById("inv-link");i.select();navigator.clipboard.writeText(i.value).then(()=>toast("Link gekopieerd"),()=>toast("Kopiëren lukte niet, selecteer de link zelf"));}
async function fillCompanies(){
  const{data:companies}=await db.from("companies").select("*").order("created_at");
  const rows=(companies||[]).map(co=>'<div class="row"><div class="av">'+esc((co.name||"?").slice(0,2).toUpperCase())+'</div><div style="flex:1"><div class="nm">'+esc(co.name)+'</div><div class="sub">Plan: '+esc(co.plan)+'</div></div><span class="tag">'+esc(co.status)+'</span></div>').join("");
  const cp=document.getElementById("cpage");
  if(cp)cp.innerHTML='<h1>Bedrijven</h1><div class="card">'+(rows||'<div class="row"><span class="muted">Nog geen bedrijven.</span></div>')+'</div>';
}
