// app/klanten.js — de mensen- en bedrijfspagina's van de coach-kant:
// Klanten, Coaches en Bedrijven, plus de uitnodigingsflow (invites).
// ---------- KLANTEN-pagina (naar het ontwerp) ----------
let KDATA=null,klantPeriode=30,klantZoek="";
async function fillKlanten(){
  const ids=coachClients.map(p=>p.id);
  const td=todayStr(),from90=ymd(addDays(new Date(),-89)),plus14=ymd(addDays(new Date(),14));
  let ws=[],rs=[],msgs=[];
  if(ids.length){
    ws=(await db.from("workouts").select("id,client_id,workout_date,title").in("client_id",ids).gte("workout_date",from90).lte("workout_date",plus14).order("workout_date")).data||[];
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("workout_id,status").in("workout_id",wids)).data||[];
    msgs=(await db.from("messages").select("athlete_id").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
  }
  KDATA={ws:ws.filter(w=>!/^rest ?day$/i.test((w.title||"").trim())),done:new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id)),msgs};
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
  const lijst=coachClients.filter(p=>!zoek||naamVan(p).toLowerCase().includes(zoek)||(p.email||"").toLowerCase().includes(zoek)).sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  return lijst.map(p=>{
    const wp=klantComp([p]);
    return '<div class="trow click" onclick="openClient(\''+p.id+'\')">'+
      '<div style="flex:2.2;display:flex;gap:11px;align-items:center"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div><div style="font-weight:700;font-size:13px">'+naamVan(p)+'</div><div class="sm muted">Laatste consult: n.v.t.</div></div></div>'+
      '<div style="flex:1.2">'+klantWorkoutChip(p)+'</div>'+
      '<div style="flex:1.2"><span class="wchip leeg">niet ingesteld</span></div>'+
      '<div style="flex:1">'+(wp==null?'<span class="muted">–</span>':'<b style="color:'+(wp>=70?'#1d9a63':'#e5484d')+'">'+wp+'%</b>')+'</div>'+
      '<div style="flex:1.6" onclick="event.stopPropagation()"><button class="plusbtn" onclick="toast(\'Tags komen in een volgende stap\')">+</button></div>'+
      '<button class="kebab" onclick="event.stopPropagation();toast(\'Opties komen later\')">⋮</button></div>';
  }).join("");
}
function klantZoekF(v){klantZoek=v;const h=document.getElementById("klantrows");if(h)h.innerHTML=klantRijen()||'<div class="trow"><span class="muted">Geen klanten gevonden.</span></div>';}
function klantenRender(){
  const cp=document.getElementById("cpage");if(!cp||!KDATA)return;
  const msgIds=new Set(KDATA.msgs.map(m=>m.athlete_id));
  const totaal=klantComp(coachClients);
  const cmTot=coachClients.length?Math.round(coachClients.filter(p=>msgIds.has(p.id)).length/coachClients.length*100):null;
  cp.innerHTML='<div class="statbar2">'+
    '<div><div class="n">'+coachClients.length+'</div><div class="l">Actieve klanten</div></div>'+
    '<div><div class="n acc">'+(totaal==null?'–':totaal+'%')+'</div><div class="l">Compliance</div><div><select onchange="klantPeriode=parseInt(this.value);klantenRender()">'+[7,30,90].map(n=>'<option value="'+n+'"'+(klantPeriode===n?' selected':'')+'>Workout: '+n+' dagen</option>').join('')+'</select></div></div>'+
    '<div><div class="n">–</div><div class="l">Consult-rate</div></div>'+
    '<div><div class="n acc">'+(cmTot==null?'–':cmTot+'%')+'</div><div class="l">Contactmomenten</div></div></div>'+
    '<div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap">'+
      '<div class="search2"><svg class="i sm-i"><use href="#i-search"/></svg><input placeholder="Zoek op naam of tag…" value="'+esc(klantZoek)+'" oninput="klantZoekF(this.value)"></div>'+
      '<div style="margin-left:auto;display:flex;gap:8px"><button class="btn" onclick="openInvModal(\'lid\')">+ Klant toevoegen</button><button class="btn ghost" onclick="toast(\'Tags beheren komt in een volgende stap\')">Tags beheren</button><button class="btn ghost" onclick="exportKlanten()">Exporteren</button></div></div>'+
    '<div class="ctabs"><button class="on">Actief <span style="font-weight:600;color:#8a919c">'+coachClients.length+'</span></button><button onclick="toast(\'Archief komt in een volgende stap\')">Archief <span style="font-weight:600;color:#8a919c">0</span></button></div>'+
    '<div class="card"><div class="thead"><div style="flex:2.2">Naam</div><div style="flex:1.2">Workout</div><div style="flex:1.2">Lifestyle</div><div style="flex:1">Compliance</div><div style="flex:1.6">Tags</div><div style="width:30px"></div></div>'+
    '<div id="klantrows">'+(klantRijen()||'<div class="trow"><span class="muted">Nog geen klanten gekoppeld.</span></div>')+'</div></div>';
}
function exportKlanten(){
  const td=todayStr();
  const kop="Naam;E-mail;Volgende workout;Compliance ("+klantPeriode+" dagen)";
  const regels=coachClients.map(p=>{
    const wp=klantComp([p]);
    const up=KDATA.ws.filter(w=>w.client_id===p.id&&w.workout_date>=td).sort((a,b)=>a.workout_date.localeCompare(b.workout_date))[0];
    return [naamVan(p).replace(/;/g,","),p.email||"",up?up.workout_date:"-",wp==null?"-":wp+"%"].join(";");
  });
  const blob=new Blob(["﻿"+kop+"\n"+regels.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="klanten.csv";a.click();URL.revokeObjectURL(a.href);
  toast("klanten.csv gedownload");
}
async function fillCoaches(){
  let q=db.from("profiles").select("*").in("role",["coach","eigenaar"]);
  if(ME.profile.company_id)q=q.eq("company_id",ME.profile.company_id);
  const{data:coaches}=await q;
  // Prestaties per coach: compliance (30 dagen) en contactmomenten (deze week) van zijn klanten
  const ids=coachClients.map(p=>p.id);
  const td=todayStr(),from30=ymd(addDays(new Date(),-29));
  let ws=[],rs=[],msgs=[];
  if(ids.length){
    ws=((await db.from("workouts").select("id,client_id,workout_date,title").in("client_id",ids).gte("workout_date",from30).lte("workout_date",td)).data||[]).filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("workout_id,status").in("workout_id",wids)).data||[];
    msgs=(await db.from("messages").select("athlete_id").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
  }
  const doneWo=new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id));
  const gesprokenIds=new Set(msgs.map(m=>m.athlete_id));
  const compVan=list=>{const sched=ws.filter(w=>list.some(c=>c.id===w.client_id));if(!sched.length)return null;return Math.round(sched.filter(w=>doneWo.has(w.id)).length/sched.length*100);};
  const totaalComp=compVan(coachClients);
  const totaalCm=coachClients.length?Math.round(coachClients.filter(p=>gesprokenIds.has(p.id)).length/coachClients.length*100):null;
  const rows=(coaches||[]).sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(c=>{
    const kl=coachClients.filter(k=>k.coach_id===c.id);
    const wp=compVan(kl);
    const cm=kl.length?Math.round(kl.filter(p=>gesprokenIds.has(p.id)).length/kl.length*100):null;
    const rol=c.role==="eigenaar"?'<span class="cpill purple">Eigenaar</span>':'<span class="cpill teal">Coach</span>';
    return '<div class="trow"><div style="flex:2.2;display:flex;gap:11px;align-items:center"><div class="cavc" style="'+avFotoStyle(c)+'">'+avFotoText(c)+'</div><div><div style="font-weight:700;font-size:13px">'+naamVan(c)+'</div><div class="sm muted">'+kl.length+' '+(kl.length===1?'klant':'klanten')+'</div></div></div>'+
      '<div style="flex:1">'+(wp==null?'<span class="muted">–</span>':'<b style="color:'+(wp>=70?'#1d9a63':'#e5484d')+'">'+wp+'%</b>')+'</div>'+
      '<div style="flex:1" class="muted">–</div>'+
      '<div style="flex:1.2">'+(cm==null?'<span class="muted">0%</span>':'<b style="color:'+(cm>=70?'#1d9a63':'#8a919c')+'">'+cm+'%</b>')+'</div>'+
      '<div style="flex:1">'+rol+'</div>'+
      '<button class="kebab" onclick="toast(\'Opties komen later\')">⋮</button></div>';
  }).join("");
  const cp=document.getElementById("cpage");
  if(!cp)return;
  cp.innerHTML='<div class="statbar2">'+
    '<div><div class="n">'+coachClients.length+'</div><div class="l">Klanten totaal</div></div>'+
    '<div><div class="n acc">'+(totaalComp==null?'–':totaalComp+'%')+'</div><div class="l">Compliance</div></div>'+
    '<div><div class="n">–</div><div class="l">Consult-rate</div></div>'+
    '<div><div class="n acc">'+(totaalCm==null?'–':totaalCm+'%')+'</div><div class="l">Contactmomenten</div></div></div>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h1 style="margin:0">Coaches</h1><button class="btn" onclick="openInvModal(\'coach\')">+ Coach toevoegen</button></div>'+
    '<div class="card"><div class="thead"><div style="flex:2.2">Naam</div><div style="flex:1">Workout %</div><div style="flex:1">Consult-rate</div><div style="flex:1.2">Contactmomenten</div><div style="flex:1">Rol</div><div style="width:30px"></div></div>'+
    (rows||'<div class="trow"><span class="muted">Nog geen coaches.</span></div>')+'</div>';
}
// ---------- Uitnodigen (klant of coach) via de invites-tabel ----------
let invRol="lid";
async function openInvModal(rol){
  ensureLibModals();invRol=rol;
  document.getElementById("inv-titel").textContent=rol==="coach"?"Coach toevoegen":"Klant toevoegen";
  document.getElementById("inv-coach-veld").style.display=rol==="coach"?"none":"";
  document.getElementById("inv-lid-veld").style.display=rol==="coach"?"none":"";
  ["inv-vn","inv-an","inv-email"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("inv-result").style.display="none";
  document.getElementById("inv-maak").style.display="";
  document.getElementById("inv-msg").textContent="";
  document.getElementById("invmodal").classList.add("show");
  if(rol!=="coach"){
    const{data:cs}=await db.from("profiles").select("id,first_name,last_name,email").in("role",["coach","eigenaar"]).eq("company_id",ME.profile.company_id);
    document.getElementById("inv-coach").innerHTML=(cs||[]).map(c=>'<option value="'+c.id+'"'+(c.id===ME.user.id?" selected":"")+'>'+naamVan(c)+'</option>').join("");
  }
}
async function invAanmaken(){
  const vn=document.getElementById("inv-vn").value.trim(),an=document.getElementById("inv-an").value.trim(),em=document.getElementById("inv-email").value.trim();
  const msg=document.getElementById("inv-msg");
  if(!em){msg.textContent="Vul een e-mailadres in.";return;}
  const rec={company_id:ME.profile.company_id,coach_id:invRol==="coach"?null:document.getElementById("inv-coach").value||null,email:em,first_name:vn||null,last_name:an||null,role:invRol,membership_type:invRol==="coach"?null:document.getElementById("inv-type").value,created_by:ME.user.id,expires_at:new Date(Date.now()+14*864e5).toISOString()};
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
