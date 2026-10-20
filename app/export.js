// app/export.js — Klantgegevens exporteren (feedbackronde 5, ronde B, 20 okt 2026).
// De oude "Export PDF"-knop drukte de hele kalenderpagina af. Nu opent een venster
// (naar het voorbeeld van CoachRx): begin- en einddatum met snelkeuzes, vinkjes
// per onderdeel (workouts, scores, metrics, assessment, consults, planning,
// doelen, intake, notities) en de keuze PDF of tekstbestand. De PDF is een
// nette afdrukweergave (A4) in een onzichtbaar frame waarop het afdrukvenster
// opent; daar kiest de coach "Opslaan als PDF". Het tekstbestand downloadt direct.
// Werkt op de open klant (calClient). Leest alleen; schrijft niets.

const EXP_SECTIES=[
  ["workouts","Workouts","programmering, warming-up en cooldown, coachnotities"],
  ["scores","Scores, notities en reacties van de sporter","hoort bij Workouts: gelogde sets en tijden, opmerkingen, dagnotities, dagreacties"],
  ["metrics","Metrics & 1RM","huidige waarden, metingen in de periode, records uit de krachtlog"],
  ["assessment","Assessment (laatste)","Body, Move en Work van de laatste meting"],
  ["consults","Check-ins & consults","contactmomenten in de periode · alleen coach"],
  ["plans","Planning & periodisering","blokken die in de periode vallen · alleen coach"],
  ["goals","Doelen, trainingsschema & materiaal","zoals ze nu staan"],
  ["intake","Intakeformulier","de ingevulde antwoorden"],
  ["notes","Notities","coachnotities uit de periode · alleen coach"],
];
let EXP={sel:{workouts:true,scores:true},formaat:"pdf",bezig:false};

// ---------- Venster ----------
function ensureExpModal(){
  if(document.getElementById("expmodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="expmodal"><div class="box exp-box">'+
    '<div class="exp-kop"><h3 id="exp-titel">Gegevens exporteren</h3><span class="exp-x" onclick="expSluit()" title="Sluiten">×</span></div>'+
    '<div class="exp-datums"><div class="field"><label>Startdatum</label><input type="date" id="exp-van"></div><div class="field"><label>Einddatum</label><input type="date" id="exp-tot"></div></div>'+
    '<div class="exp-snel"><a onclick="expBereik(\'kal\')">Getoonde periode</a><a onclick="expBereik(\'maand\')">Deze maand</a><a onclick="expBereik(\'3m\')">Laatste 3 maanden</a><a onclick="expBereik(\'12m\')">Laatste 12 maanden</a><a onclick="expBereik(\'alles\')">Alles</a></div>'+
    '<div class="exp-inc-kop"><span>Opnemen</span><a onclick="expAlles()">Alles selecteren</a></div>'+
    '<div class="exp-grid">'+EXP_SECTIES.map(s=>'<label class="exp-opt'+(s[0]==="scores"?' sub':'')+'" title="'+esc(s[2])+'"><input type="checkbox" data-sec="'+s[0]+'" onchange="expVink(this)"><span>'+esc(s[1])+'</span></label>').join("")+'</div>'+
    '<div class="field" style="margin-top:14px"><label>Bestandsformaat</label><div class="seg" id="exp-formaat" style="display:inline-flex"><button class="on" onclick="expFormaat(\'pdf\',this)">PDF</button><button onclick="expFormaat(\'txt\',this)">Tekstbestand</button></div></div>'+
    '<div class="sm muted" id="exp-uitleg" style="margin-bottom:14px">Bij PDF opent het afdrukvenster van je browser; kies daar "Opslaan als PDF". Consults, planning en notities zijn alleen voor coaches: deel die export niet met de klant.</div>'+
    '<div class="exp-voet"><button class="btn" id="exp-start" onclick="expStart()">Exporteer klantgegevens</button><button class="btn ghost" onclick="expSluit()">Annuleren</button></div>'+
    '<div class="msg" id="exp-msg"></div></div></div>';
  document.body.appendChild(d.firstChild);
  document.getElementById("expmodal").addEventListener("click",e=>{if(e.target.id==="expmodal")expSluit();});
}
// opts.alleen = één onderdeel voorvinken (bijv. vanuit het Assessment-paneel).
function openExport(opts){
  if(typeof calClient==="undefined"||!calClient){toast("Open eerst een klant");return;}
  ensureExpModal();
  const p=(coachClients||[]).find(x=>x.id===calClient)||{};
  document.getElementById("exp-titel").textContent="Gegevens exporteren voor "+[p.first_name,p.last_name].filter(Boolean).join(" ");
  if(opts&&opts.alleen){EXP.sel={};EXP.sel[opts.alleen]=true;}
  else if(!Object.keys(EXP.sel).some(k=>EXP.sel[k]))EXP.sel={workouts:true,scores:true};
  document.querySelectorAll("#expmodal [data-sec]").forEach(cb=>{cb.checked=!!EXP.sel[cb.dataset.sec];});
  expVinkToon();
  expBereik("kal");
  EXP.formaat="pdf";
  document.querySelectorAll("#exp-formaat button").forEach((b,i)=>b.classList.toggle("on",i===0));
  document.getElementById("exp-msg").textContent="";
  document.getElementById("exp-start").disabled=false;
  document.getElementById("exp-start").textContent="Exporteer klantgegevens";
  document.getElementById("expmodal").classList.add("show");
}
function expSluit(){const m=document.getElementById("expmodal");if(m)m.classList.remove("show");}
function expVink(cb){EXP.sel[cb.dataset.sec]=cb.checked;if(cb.dataset.sec==="workouts"&&!cb.checked){EXP.sel.scores=false;}expVinkToon();}
// Scores horen bij Workouts: zonder workouts geen scores.
function expVinkToon(){
  const w=!!EXP.sel.workouts,sc=document.querySelector('#expmodal [data-sec="scores"]');
  if(sc){sc.disabled=!w;if(!w)sc.checked=false;sc.closest("label").classList.toggle("uit",!w);}
}
function expAlles(){
  const alle=document.querySelectorAll("#expmodal [data-sec]");
  const allesAan=[...alle].every(cb=>cb.checked);
  alle.forEach(cb=>{cb.checked=!allesAan;EXP.sel[cb.dataset.sec]=!allesAan;});
  expVinkToon();
}
function expFormaat(f,btn){EXP.formaat=f;document.querySelectorAll("#exp-formaat button").forEach(b=>b.classList.remove("on"));btn.classList.add("on");
  const u=document.getElementById("exp-uitleg");if(u)u.textContent=f==="pdf"?'Bij PDF opent het afdrukvenster van je browser; kies daar "Opslaan als PDF". Consults, planning en notities zijn alleen voor coaches: deel die export niet met de klant.':'Het tekstbestand (.txt) downloadt direct en is handig om te plakken in een mail of document. Consults, planning en notities zijn alleen voor coaches: deel die export niet met de klant.';}
// Snelkeuzes voor de periode. "Getoonde periode" volgt de kalender (maand/week/dag).
async function expBereik(k){
  const van=document.getElementById("exp-van"),tot=document.getElementById("exp-tot");
  const nu=new Date();nu.setHours(12,0,0,0);
  const zet=(a,b)=>{van.value=a;tot.value=b;};
  if(k==="maand")zet(ymd(new Date(nu.getFullYear(),nu.getMonth(),1)),ymd(new Date(nu.getFullYear(),nu.getMonth()+1,0)));
  else if(k==="3m"){const a=new Date(nu);a.setMonth(a.getMonth()-3);zet(ymd(a),ymd(nu));}
  else if(k==="12m"){const a=new Date(nu);a.setMonth(a.getMonth()-12);zet(ymd(a),ymd(nu));}
  else if(k==="alles"){
    zet("2020-01-01",ymd(nu));
    try{const{data}=await db.from("workouts").select("workout_date").eq("client_id",calClient).order("workout_date").limit(1);if(data&&data[0])van.value=data[0].workout_date;}catch(e){}
  }else{
    // de periode die nu op de kalender staat
    const ref=(typeof calRef!=="undefined"&&calRef)?new Date(calRef):nu;
    if(typeof calView!=="undefined"&&calView==="week"){const s=mondayOf(ref);zet(ymd(s),ymd(addDays(s,6)));}
    else if(typeof calView!=="undefined"&&calView==="dag")zet(ymd(ref),ymd(ref));
    else zet(ymd(new Date(ref.getFullYear(),ref.getMonth(),1)),ymd(new Date(ref.getFullYear(),ref.getMonth()+1,0)));
  }
}

// ---------- Start ----------
async function expStart(){
  if(EXP.bezig)return;
  const van=document.getElementById("exp-van").value,tot=document.getElementById("exp-tot").value;
  const msg=document.getElementById("exp-msg"),knop=document.getElementById("exp-start");
  const sel=Object.assign({},EXP.sel);
  if(!van||!tot){msg.textContent="Kies een begin- en einddatum.";return;}
  if(tot<van){msg.textContent="De einddatum ligt vóór de startdatum.";return;}
  if(!Object.keys(sel).some(k=>sel[k]&&k!=="scores")){msg.textContent="Vink minstens één onderdeel aan.";return;}
  EXP.bezig=true;knop.disabled=true;knop.textContent="Bezig met ophalen…";msg.textContent="";
  try{
    const data=await expLaad(calClient,van,tot,sel);
    if(EXP.formaat==="txt"){
      expDownload(expTekst(data),"klantgegevens-"+expBestandsnaam(data.klant)+"-"+van+"-tm-"+tot+".txt");
      toast("Tekstbestand gedownload");
    }else{
      expPrint(expHtml(data));
    }
    expSluit();
  }catch(e){
    msg.textContent="Exporteren mislukt: "+((e&&e.message)||"onbekende fout");
  }
  EXP.bezig=false;knop.disabled=false;knop.textContent="Exporteer klantgegevens";
}
function expBestandsnaam(p){return [p.first_name,p.last_name].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g,"")||"klant";}
function expDownload(tekst,naam){
  const blob=new Blob(["﻿"+tekst],{type:"text/plain;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=naam;document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},2000);
}
// Afdrukken via een onzichtbaar frame met alleen de export erin, zodat het
// afdrukvenster (en "Opslaan als PDF") precies dit document krijgt.
function expPrint(html){
  const oud=document.getElementById("exp-frame");if(oud)oud.remove();
  const f=document.createElement("iframe");f.id="exp-frame";
  f.style.cssText="position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  f.onload=()=>{setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print();}catch(e){toast("Afdrukken lukte niet in deze browser");}},150);};
  f.srcdoc=html;
}

// ---------- Gegevens ophalen ----------
// .in() in stukken van 150, anders wordt de aanvraag-URL te lang bij "Alles".
async function expIn(tabel,kolommen,kol,ids,extra){
  const uit=[];
  for(let i=0;i<ids.length;i+=150){
    let q=db.from(tabel).select(kolommen).in(kol,ids.slice(i,i+150));
    if(extra)q=extra(q);
    const{data,error}=await q;if(error)throw error;
    uit.push(...(data||[]));
  }
  return uit;
}
async function expLaad(id,van,tot,sel){
  const klant=(coachClients||[]).find(x=>x.id===id)||{id};
  const D={klant,van,tot,sel,gemaakt:new Date()};
  const taken=[];
  taken.push(db.from("companies").select("name,logo_url").eq("id",ME.profile.company_id).maybeSingle().then(r=>{D.bedrijf=r.data||{};}));
  taken.push(db.rpc("company_coaches").then(r=>{D.staf={};(r.data||[]).forEach(c=>{D.staf[c.id]=[c.first_name,c.last_name].filter(Boolean).join(" ");});}).catch(()=>{D.staf={};}));
  if(sel.workouts){
    taken.push((async()=>{
      const{data:ws,error}=await db.from("workouts").select("*, blocks(*)").eq("client_id",id).gte("workout_date",van).lte("workout_date",tot).order("workout_date").order("day_sort",{nullsFirst:false}).order("created_at");
      if(error)throw error;
      D.workouts=ws||[];
      D.results={};D.media={};D.comments={};D.dagnoten={};
      if(sel.scores&&D.workouts.length){
        const wids=D.workouts.map(w=>w.id);
        const[res,mds,wcs,dn]=await Promise.all([
          expIn("results","*","workout_id",wids,q=>q.eq("athlete_id",id)),
          expIn("result_media","block_id,storage_path","workout_id",wids,q=>q.eq("athlete_id",id)),
          expIn("workout_comments","workout_id,author_id,body,created_at","workout_id",wids,q=>q.eq("athlete_id",id).order("created_at")),
          db.from("day_notes").select("note_date,body").eq("athlete_id",id).gte("note_date",van).lte("note_date",tot).then(r=>r.data||[]),
        ]);
        res.forEach(r=>{D.results[r.block_id]=r;});
        mds.forEach(m=>{(D.media[m.block_id]=D.media[m.block_id]||[]).push(m);});
        wcs.forEach(c=>{(D.comments[c.workout_id]=D.comments[c.workout_id]||[]).push(c);});
        dn.forEach(n=>{D.dagnoten[n.note_date]=n.body;});
      }
    })());
  }
  if(sel.metrics){
    taken.push((async()=>{
      const{data,error}=await db.from("metrics").select("metric,value,value_text,unit,measured_at,note").eq("athlete_id",id).order("measured_at");
      if(error)throw error;
      D.metrics=data||[];
      try{await klLaad(id);D.records=Object.values(klRecords());D.prs=(KL.log||[]).filter(g=>g.is_pr&&g.workout_date>=van&&g.workout_date<=tot&&!g.fail);}catch(e){D.records=[];D.prs=[];}
    })());
  }
  if(sel.assessment)taken.push(db.from("assessments").select("*").eq("athlete_id",id).lte("assessed_on",tot).order("assessed_on",{ascending:false}).limit(1).then(async r=>{
    let rij=(r.data||[])[0];
    if(!rij){const r2=await db.from("assessments").select("*").eq("athlete_id",id).order("assessed_on",{ascending:false}).limit(1);rij=(r2.data||[])[0];}
    D.assessment=rij||null;
  }));
  if(sel.consults)taken.push(db.from("consults").select("consult_date,notes").eq("athlete_id",id).gte("consult_date",van).lte("consult_date",tot).order("consult_date").then(r=>{D.consults=r.data||[];}));
  if(sel.plans)taken.push(db.from("plans").select("start_date,end_date,notes").eq("athlete_id",id).order("start_date",{ascending:false,nullsFirst:false}).then(r=>{
    const alle=r.data||[];
    const inPeriode=alle.filter(p=>(!p.start_date||p.start_date<=tot)&&(!p.end_date||p.end_date>=van));
    D.plans=inPeriode.length?inPeriode:alle.slice(0,1); // niets in de periode: dan het laatste plan
  }));
  if(sel.goals)taken.push(db.from("client_info").select("data").eq("athlete_id",id).limit(1).then(r=>{D.ci=((r.data||[])[0]||{}).data||{};}));
  if(sel.intake)taken.push(db.from("intake").select("answers,notes,updated_at").eq("athlete_id",id).maybeSingle().then(r=>{D.intake=r.data||null;}));
  if(sel.notes)taken.push(db.from("notes").select("body,created_at,author_id").eq("athlete_id",id).gte("created_at",van+"T00:00:00").lte("created_at",tot+"T23:59:59").order("created_at").then(r=>{D.notes=r.data||[];}));
  await Promise.all(taken);
  return D;
}

// ---------- Hulpjes ----------
const expDatum=s=>{if(!s)return "";const d=new Date(String(s).slice(0,10)+"T12:00:00");if(isNaN(d))return String(s);return d.toLocaleDateString(typeof LOCALE!=="undefined"?LOCALE:"nl-NL",{weekday:"long",day:"numeric",month:"long",year:"numeric"});};
const expDatumKort=s=>{if(!s)return "";const d=new Date(String(s).slice(0,10)+"T12:00:00");if(isNaN(d))return String(s);return d.getDate()+" "+MAANDKORT[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?" "+d.getFullYear():"");};
const expDagKort=s=>{const d=new Date(String(s).slice(0,10)+"T12:00:00");return ["Zo","Ma","Di","Wo","Do","Vr","Za"][d.getDay()]+" "+d.getDate()+" "+MAANDKORT[d.getMonth()];};
const expTijd=iso=>{const d=new Date(iso);return pad(d.getHours())+":"+pad(d.getMinutes());};
const expNaam=p=>[p.first_name,p.last_name].filter(Boolean).join(" ")||p.email||"Klant";
function expAuteur(D,aid){if(aid===D.klant.id)return D.klant.first_name||"Sporter";return D.staf[aid]||"Coach";}
// Bloktekst: conditioning = notes, oefening = voorschrift (+ het schema als dat meer zegt).
function expBlokTekst(b){
  if(b.kind==="conditioning")return b.notes||"";
  const t=b.prescription||"";
  const s=(b.lift_scheme&&!b.lift_scheme.geen_lift&&typeof schemaTekst==="function")?schemaTekst(b.lift_scheme):"";
  return t||s;
}
// Wat de sporter logde bij een blok, als één regel + losse notitie.
function expScore(D,b){
  const r=D.results[b.id],m=D.media[b.id]||[];
  if(!r&&!m.length)return null;
  const miss=!!(r&&r.status==="missed");
  let sc=r?resultScoreVol(r):"";
  if(!sc&&r&&Array.isArray(r.sets)&&r.sets.length&&typeof setsTekst==="function")sc=setsTekst(r.sets);
  if(r&&r.rx)sc=(sc?sc+" · ":"")+(r.rx==="scaled"?"Scaled":"Rx");
  const fotos=m.filter(x=>isFotoUpload(x.storage_path)).length,videos=m.length-fotos;
  const media=[videos?videos+(videos===1?" video":" video's"):null,fotos?fotos+(fotos===1?" foto":" foto's"):null].filter(Boolean).join(", ");
  return {miss,sc:sc||(miss?"Als gemist gemarkeerd door de sporter":(r?"Voltooid zonder score":"")),note:r&&r.note||"",media,tijd:r&&r.created_at||null};
}
// Status van een dag: voltooid, gemist of niet gelogd.
function expDagStatus(D,w){
  const bl=(w.blocks||[]);const rs=bl.map(b=>D.results[b.id]).filter(Boolean);
  if(!rs.length)return {k:"open",t:"Niet gelogd"};
  const done=rs.filter(r=>r.status==="completed"),miss=rs.filter(r=>r.status==="missed");
  const laatste=rs.map(r=>r.updated_at||r.created_at).filter(Boolean).sort().pop();
  if(done.length)return {k:"ok",t:"✓ Voltooid"+(laatste?" · "+expTijd(laatste):"")};
  if(miss.length)return {k:"mis",t:"✕ Gemist"};
  return {k:"open",t:"Niet gelogd"};
}
const expIsRust=w=>!(w.blocks||[]).length&&/^rest ?day$/i.test((w.title||"").trim());
// Metrics: per metric alle metingen (oplopend), huidige waarde (kg-liften = beste ooit, anders de laatste).
function expMetricsOverzicht(rows){
  const per={};rows.forEach(m=>{(per[m.metric]=per[m.metric]||[]).push(m);});
  const groepVan=n=>{for(const g in METRICS_DEF)if(METRICS_DEF[g].includes(n))return g;return "Eigen metrics";};
  const uit={};
  Object.keys(per).forEach(n=>{
    const h=per[n],t=mxType(n);
    let cur=h[h.length-1];
    if(t==="kg")cur=h.reduce((a,b)=>(b.value!=null&&(a.value==null||+b.value>+a.value)?b:a),h[0]);
    const laatste=h[h.length-1],vorig=h.length>1?h[h.length-2]:null;
    let delta="";
    if((t==="kg"||t==="vrij")&&vorig&&laatste.value!=null&&vorig.value!=null&&laatste.value!==vorig.value){const d=Math.round((laatste.value-vorig.value)*10)/10;delta=(d>0?"+":"")+d+(laatste.unit?" "+laatste.unit:"");}
    (uit[groepVan(n)]=uit[groepVan(n)]||[]).push({naam:n,cur:mxFmtRij(cur,n),datum:cur.measured_at,delta,n:h.length});
  });
  return uit;
}

// ---------- HTML (afdrukweergave) ----------
const EXP_CSS='@page{size:A4;margin:14mm 14mm 16mm}*{box-sizing:border-box}html,body{margin:0;padding:0}'+
'body{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1b2330;font-size:10.5pt;line-height:1.45;background:#fff}'+
'.kop{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1b2330;padding-bottom:9px;margin-bottom:12px;gap:16px}.kop img{height:30px;display:block;max-width:160px;object-fit:contain}'+
'.kop .bn{font-size:11pt;font-weight:800;color:#4b5563}.kop .titel{font-size:17pt;font-weight:800;letter-spacing:-.2px;margin:4px 0 2px}.kop .sub{font-size:10pt;color:#4b5563}'+
'.kop>div:first-child{flex:1;min-width:0}.kop .rechts{text-align:right;font-size:9pt;color:#73808f;line-height:1.5;flex:none;max-width:42%}.kop .rechts b{color:#1b2330;font-weight:700}'+
'h2.sec{font-size:13pt;font-weight:800;margin:16px 0 8px;padding-bottom:4px;border-bottom:1px solid #e3e7ef;break-after:avoid}h2.sec:first-of-type{margin-top:4px}'+
'.samen{display:flex;gap:6px;margin:0 0 12px;flex-wrap:wrap}.pill{font-size:8.5pt;font-weight:700;border:1px solid #e3e7ef;border-radius:999px;padding:3px 10px;color:#4b5563;background:#f8fafc}.pill.ok{color:#15803d;background:#def4e6;border-color:#bfe7cc}.pill.mis{color:#b91c1c;background:#fbe0e0;border-color:#f3c3c5}'+
'.sessie{border:1px solid #e3e7ef;border-radius:10px;padding:0 0 4px;margin:0 0 12px}.sessie>.skop{display:flex;justify-content:space-between;align-items:baseline;gap:10px;background:#f4f6fa;border-bottom:1px solid #e3e7ef;border-radius:10px 10px 0 0;padding:8px 12px;break-after:avoid}'+
'.skop .dag{font-weight:800;font-size:11.5pt}.skop .dag span{font-weight:600;color:#4b5563;font-size:10pt;margin-left:8px}.status{font-size:9pt;font-weight:700;white-space:nowrap}.status.ok{color:#15803d}.status.mis{color:#b91c1c}.status.open{color:#73808f}'+
'.regel{padding:6px 12px;font-size:9.5pt;color:#4b5563;border-bottom:1px dashed #e9edf3;white-space:pre-line}.regel b{color:#1b2330;font-weight:700}.regel.noot{background:#fdf6e3;color:#6b5d3f;border-left:3px solid #e7a44a;border-bottom:none;margin:8px 12px 0;padding:6px 9px;border-radius:5px}'+
'.blok{display:flex;gap:10px;padding:8px 12px;border-bottom:1px solid #eef1f5;break-inside:avoid}.blok:last-of-type{border-bottom:none}.blok .lbl{flex:none;width:26px;font-weight:800;color:#2a9fce;font-size:10.5pt}.blok .lbl::after{content:")"}.blok .inh{flex:1;min-width:0}'+
'.blok .naam{font-weight:700;font-size:10.5pt}.blok .kaart{font-size:8.5pt;font-weight:700;color:#2a9fce;text-transform:uppercase;letter-spacing:.5px;margin-bottom:1px}.blok .voorschrift{color:#4b5563;white-space:pre-line;font-size:9.5pt;margin-top:1px}'+
'.blok .score{margin-top:5px;background:#eef8f2;border:1px solid #cfe8d8;border-radius:7px;padding:5px 9px;font-size:9.5pt;line-height:1.5;white-space:pre-line}.blok .score.mis{background:#fdeeee;border-color:#f3c3c5}.blok .score .sk{font-weight:800;color:#1f8a4c;font-size:8.5pt;text-transform:uppercase;letter-spacing:.4px;margin-right:6px}.blok .score.mis .sk{color:#c0392b}.blok .score .nt{color:#5d6570;font-style:italic;display:block}.blok .score .lb{color:#4b5563;display:block}'+
'.kleur{flex:none;width:5px;border-radius:3px;align-self:stretch;background:#d1d5db}'+
'.reacties{margin:6px 12px 6px;border:1px solid #e3e7ef;border-radius:8px;padding:6px 10px}.reacties .rk{font-size:8.5pt;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#73808f;margin-bottom:3px;break-after:avoid}.reacties .r{font-size:9.5pt;margin:2px 0;break-inside:avoid;white-space:pre-line}.reacties .r b{font-weight:700}.reacties .r .t{color:#9aa3ad;font-size:8.5pt;margin-left:6px}'+
'table.tb{width:100%;border-collapse:collapse;font-size:9.5pt;margin:4px 0 10px;break-inside:auto}table.tb th{text-align:left;font-size:8.5pt;text-transform:uppercase;letter-spacing:.4px;color:#73808f;border-bottom:1px solid #e3e7ef;padding:4px 6px}table.tb td{padding:5px 6px;border-bottom:1px solid #eef1f5;vertical-align:top}table.tb tr{break-inside:avoid}table.tb .r{text-align:right;white-space:nowrap}'+
'.grp{font-size:9pt;font-weight:800;color:#2a9fce;text-transform:uppercase;letter-spacing:.5px;margin:10px 0 2px;break-after:avoid}.chips span{display:inline-block;background:#f4f6fa;border:1px solid #e3e7ef;border-radius:999px;padding:1px 8px;font-size:9pt;margin:2px 4px 2px 0}'+
'.kaartje{border:1px solid #e3e7ef;border-radius:8px;padding:8px 11px;margin:0 0 8px;break-inside:avoid}.kaartje .kh{font-weight:700;font-size:10pt;margin-bottom:2px}.kaartje .kb{font-size:9.5pt;color:#374151;white-space:pre-line}.kaartje .kb.muted{color:#73808f}'+
'.leeg{font-size:9.5pt;color:#73808f;font-style:italic;margin:2px 0 8px}'+
'.legenda{display:flex;gap:14px;flex-wrap:wrap;font-size:8.5pt;color:#73808f;margin-top:6px;align-items:center}.legenda i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:4px}'+
'.voet{position:fixed;bottom:0;left:0;right:0;font-size:8pt;color:#9aa3ad;border-top:1px solid #e3e7ef;padding-top:4px;display:flex;justify-content:space-between;background:#fff}table.pag{width:100%;border-collapse:collapse}table.pag td{padding:0;vertical-align:top}.voetruimte{height:9mm}'+
'@media screen{body{max-width:190mm;margin:20px auto;padding:0 10px}.voet{position:static;margin-top:10px}.voetruimte{display:none}}';

function expHtml(D){
  const naam=expNaam(D.klant),bedrijf=(D.bedrijf&&D.bedrijf.name)||"";
  const coachNaam=D.staf[D.klant.coach_id]||"";
  const periode=expDatumKort(D.van)+(D.van!==D.tot?" t/m "+expDatumKort(D.tot):"")+(new Date(D.tot).getFullYear()===new Date().getFullYear()?" "+new Date(D.tot).getFullYear():"");
  const kort={workouts:"workouts",metrics:"metrics & 1RM",assessment:"assessment",consults:"consults",plans:"planning",goals:"doelen & profiel",intake:"intake",notes:"notities"};
  const delen=EXP_SECTIES.filter(s=>D.sel[s[0]]&&s[0]!=="scores").map(s=>kort[s[0]]||s[1].toLowerCase());
  let h='<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>'+esc("Klantgegevens "+naam+" "+D.van+" tm "+D.tot)+'</title><style>'+EXP_CSS+'</style></head><body>'+
    '<table class="pag"><tfoot><tr><td><div class="voetruimte"></div></td></tr></tfoot><tbody><tr><td>'+
    '<div class="kop"><div>'+(D.bedrijf&&D.bedrijf.logo_url?'<img src="'+esc(D.bedrijf.logo_url)+'" alt="">':(bedrijf?'<div class="bn">'+esc(bedrijf)+'</div>':''))+
    '<div class="titel">'+esc(naam)+'</div><div class="sub">'+esc(periode)+(coachNaam?' · coach '+esc(coachNaam):'')+'</div></div>'+
    '<div class="rechts">'+(D.workouts?'<div><b>'+D.workouts.length+' '+(D.workouts.length===1?'sessie':'sessies')+'</b>'+expTelling(D)+'</div>':'')+
    '<div>Inclusief: '+esc(delen.join(", "))+(D.sel.scores?' (met scores)':'')+'</div><div>Geëxporteerd '+esc(D.gemaakt.toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"}))+', '+expTijd(D.gemaakt)+'</div></div></div>';
  if(D.workouts)h+=expHtmlWorkouts(D);
  if(D.metrics)h+=expHtmlMetrics(D);
  if(D.sel.assessment)h+=expHtmlAssessment(D);
  if(D.consults)h+=expHtmlLijst("Check-ins & consults",D.consults.map(c=>({kop:expDatum(c.consult_date),body:c.notes})),"Geen consults in deze periode.");
  if(D.plans)h+=expHtmlLijst("Planning & periodisering",D.plans.map(p=>({kop:(expDatumKort(p.start_date)||"?")+" t/m "+(expDatumKort(p.end_date)||"?"),body:p.notes})),"Geen planning vastgelegd.");
  if(D.ci)h+=expHtmlDoelen(D);
  if(D.sel.intake)h+=expHtmlIntake(D);
  if(D.notes)h+=expHtmlLijst("Notities (alleen coach)",D.notes.map(n=>({kop:expDatum(n.created_at)+(D.staf[n.author_id]?" · "+D.staf[n.author_id]:""),body:n.body})),"Geen notities in deze periode.");
  h+='</td></tr></tbody></table><div class="voet"><span>'+esc(bedrijf||"Coach-dashboard")+' · '+esc(naam)+' · '+esc(periode)+'</span><span>Alleen voor coach en sporter</span></div></body></html>';
  return h;
}
function expTelling(D){
  if(!D.sel.scores)return "";
  let ok=0,mis=0;D.workouts.forEach(w=>{if(expIsRust(w))return;const s=expDagStatus(D,w).k;if(s==="ok")ok++;else if(s==="mis")mis++;});
  return (ok||mis)?' · '+ok+' voltooid · '+mis+' gemist':'';
}
function expHtmlWorkouts(D){
  let h='<h2 class="sec">Workouts</h2>';
  if(!D.workouts.length)return h+'<div class="leeg">Geen workouts in deze periode.</div>';
  if(D.sel.scores)h+='<div class="samen">'+D.workouts.filter(w=>!expIsRust(w)).map(w=>{const s=expDagStatus(D,w);return '<span class="pill '+s.k+'">'+(s.k==="ok"?"✓ ":s.k==="mis"?"✕ ":"")+esc(expDagKort(w.workout_date))+(w.title?' · '+esc(w.title):'')+'</span>';}).join("")+'</div>';
  const kleuren=new Set();
  D.workouts.forEach(w=>{
    const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
    const st=D.sel.scores&&!expIsRust(w)?expDagStatus(D,w):null;
    h+='<div class="sessie"><div class="skop"><div class="dag">'+esc(expDatum(w.workout_date))+(w.title?'<span>'+esc(w.title)+'</span>':'')+'</div>'+(st?'<div class="status '+st.k+'">'+esc(st.t)+'</div>':'')+'</div>';
    if(expIsRust(w)){h+='<div class="regel" style="border-bottom:none;color:#27b376;font-weight:700">Rustdag</div></div>';return;}
    if(w.coach_notes)h+='<div class="regel noot"><b>Notitie van de coach:</b> '+esc(w.coach_notes)+'</div>';
    if(w.warmup)h+='<div class="regel"><b>Warming-up:</b> '+esc(w.warmup)+'</div>';
    blocks.forEach(b=>{
      if(b.color)kleuren.add(b.color);
      const sc=D.sel.scores?expScore(D,b):null;
      h+='<div class="blok"><div class="kleur" style="'+(b.color&&TPLKLEUR[b.color]?'background:'+TPLKLEUR[b.color]:'')+'"></div><div class="lbl">'+esc(b.label||"")+'</div><div class="inh">'+
        (b.group_title?'<div class="kaart">Kaart: '+esc(b.group_title)+'</div>':'')+
        '<div class="naam">'+esc(b.exercise||(b.kind==="conditioning"?"Conditioning":"Oefening"))+'</div>'+
        (expBlokTekst(b)?'<div class="voorschrift">'+esc(expBlokTekst(b))+'</div>':'')+
        (sc?'<div class="score'+(sc.miss?' mis':'')+'"><span class="sk">'+(sc.miss?'Gemist':'Score')+'</span>'+esc(sc.sc)+(sc.media?'<span class="lb">'+esc(sc.media)+' van de sporter</span>':'')+(sc.note?'<span class="nt">"'+esc(sc.note)+'"</span>':'')+'</div>':'')+
        '</div></div>';
    });
    if(w.cooldown)h+='<div class="regel"><b>Cooldown:</b> '+esc(w.cooldown)+'</div>';
    if(D.sel.scores&&D.dagnoten[w.workout_date]&&!w._noot){w._noot=true;h+='<div class="regel"><b>Dagnotitie van de sporter:</b> '+esc(D.dagnoten[w.workout_date])+'</div>';}
    const cm=D.sel.scores?(D.comments[w.id]||[]):[];
    if(cm.length)h+='<div class="reacties"><div class="rk">Reacties bij deze dag</div>'+cm.map(c=>'<div class="r"><b>'+esc(expAuteur(D,c.author_id))+'</b><span class="t">'+esc(expDagKort(c.created_at).toLowerCase()+" "+expTijd(c.created_at))+'</span> · '+esc(c.body)+'</div>').join("")+'</div>';
    h+='</div>';
  });
  if(kleuren.size&&typeof LEGNAAM!=="undefined")h+='<div class="legenda"><span>Blokkleuren:</span>'+[...kleuren].filter(k=>TPLKLEUR[k]).map(k=>'<span><i style="background:'+TPLKLEUR[k]+'"></i>'+esc(LEGNAAM[k]||k)+'</span>').join("")+'</div>';
  return h;
}
function expHtmlMetrics(D){
  let h='<h2 class="sec">Metrics & 1RM</h2>';
  const ov=expMetricsOverzicht(D.metrics);
  const groepen=Object.keys(ov);
  if(!groepen.length&&!(D.records||[]).length)return h+'<div class="leeg">Nog geen metingen of records voor deze klant.</div>';
  if(groepen.length){
    h+='<div class="grp">Huidige waarden</div><table class="tb"><tr><th>Metric</th><th class="r">Huidig</th><th class="r">Gemeten</th><th class="r">T.o.v. vorige</th><th class="r">Metingen</th></tr>';
    groepen.forEach(g=>{h+='<tr><td colspan="5" style="font-weight:800;color:#4b5563;background:#f8fafc">'+esc(g)+'</td></tr>';ov[g].forEach(r=>{h+='<tr><td>'+esc(r.naam)+'</td><td class="r"><b>'+esc(r.cur)+'</b></td><td class="r">'+esc(expDatumKort(r.datum))+'</td><td class="r">'+esc(r.delta||"–")+'</td><td class="r">'+r.n+'</td></tr>';});});
    h+='</table>';
  }
  const inP=D.metrics.filter(m=>m.measured_at>=D.van&&m.measured_at<=D.tot);
  h+='<div class="grp">Metingen in deze periode</div>';
  if(!inP.length)h+='<div class="leeg">Geen metingen in deze periode.</div>';
  else{
    const per={};inP.forEach(m=>{(per[m.metric]=per[m.metric]||[]).push(m);});
    h+='<table class="tb"><tr><th>Metric</th><th>Metingen (oud → nieuw)</th></tr>'+Object.keys(per).sort().map(n=>'<tr><td style="font-weight:700">'+esc(n)+'</td><td>'+per[n].map(m=>esc(expDatumKort(m.measured_at))+": <b>"+esc(mxFmtRij(m,n))+"</b>"+(m.note?' <span style="color:#73808f">('+esc(m.note)+')</span>':'')).join(" · ")+'</td></tr>').join("")+'</table>';
  }
  const recs=(D.records||[]).slice().sort((a,b)=>a.lift.localeCompare(b.lift));
  h+='<div class="grp">Records uit de krachtlog (beste set per aantal reps)</div>';
  if(!recs.length)h+='<div class="leeg">Nog geen sets gelogd in de krachtlog.</div>';
  else h+='<table class="tb"><tr><th>Lift</th><th>Beste per reps</th></tr>'+recs.map(l=>{const reps=Object.keys(l.reps).map(Number).sort((a,b)=>a-b);return '<tr><td style="font-weight:700">'+esc(l.lift)+'</td><td class="chips">'+reps.map(r=>'<span>'+r+'× <b>'+esc(kgTxt(l.reps[r].kg))+' kg</b> <span style="color:#73808f">'+esc(expDatumKort(l.reps[r].date))+'</span></span>').join("")+'</td></tr>';}).join("")+'</table>';
  const prs=(D.prs||[]);
  if(prs.length)h+='<div class="grp">Nieuwe records in deze periode</div><div class="chips">'+prs.map(g=>'<span>'+esc(expDatumKort(g.workout_date))+' · '+esc(g.lift)+' <b>'+esc(kgTxt(g.kg))+'×'+g.reps+'</b></span>').join("")+'</div>';
  return h;
}
function expHtmlAssessment(D){
  let h='<h2 class="sec">Assessment</h2>';
  const a=D.assessment;if(!a)return h+'<div class="leeg">Nog geen assessment ingevuld.</div>';
  const d=a.data||{},b=d.body||{},mv=d.move||{},wk=d.work||{};
  const rij=(l,v)=>(v!=null&&v!=="")?'<tr><td>'+esc(l)+'</td><td class="r"><b>'+esc(v)+'</b></td></tr>':'';
  const extra=lijst=>(lijst||[]).map(x=>rij(x.n,x.v)).join("");
  h+='<div class="leeg" style="font-style:normal">Laatste meting: '+esc(expDatum(a.assessed_on))+'</div>';
  const body=rij("Lichaamsgewicht",b.gewicht)+rij("Vetpercentage",b.vet)+rij("Skeletspiermassa",b.spier)+rij("Basaal metabolisme",b.metab)+rij("Muscle fat-analyse",b.shape)+extra(b.extra);
  if(body||b.notes)h+='<div class="grp">Body</div>'+(body?'<table class="tb">'+body+'</table>':'')+(b.notes?'<div class="kaartje"><div class="kb">'+esc(b.notes)+'</div></div>':'');
  const move=ASS_MOVE.map(t=>{const v=mv[t[0]];if(!v)return "";return '<tr><td>'+esc(t[1])+(mv[t[0]+"_n"]?'<div style="color:#73808f;font-size:9pt">'+esc(mv[t[0]+"_n"])+'</div>':'')+'</td><td class="r"><b style="color:'+(v==="pass"?"#15803d":"#b91c1c")+'">'+(v==="pass"?"Pass":"Fail")+'</b></td></tr>';}).join("")+
    ASS_TIJD.map(t=>rij(t[1],mv[t[0]])).join("")+extra(mv.extra);
  if(move||mv.notes)h+='<div class="grp">Move</div>'+(move?'<table class="tb">'+move+'</table>':'')+(mv.notes?'<div class="kaartje"><div class="kb">'+esc(mv.notes)+'</div></div>':'');
  const work=rij("Airbike 10 min cals",wk.cals)+rij("Airbike weight conversion",wk.conv)+extra(wk.extra);
  if(work||wk.notes)h+='<div class="grp">Work</div>'+(work?'<table class="tb">'+work+'</table>':'')+(wk.notes?'<div class="kaartje"><div class="kb">'+esc(wk.notes)+'</div></div>':'');
  return h;
}
function expHtmlLijst(titel,items,leeg){
  let h='<h2 class="sec">'+esc(titel)+'</h2>';
  if(!items.length)return h+'<div class="leeg">'+esc(leeg)+'</div>';
  return h+items.map(i=>'<div class="kaartje"><div class="kh">'+esc(i.kop)+'</div><div class="kb'+(i.body?'':' muted')+'">'+esc(i.body||"Geen tekst")+'</div></div>').join("");
}
function expHtmlDoelen(D){
  const ci=D.ci||{},g=ci.goals||{sel:[],other:""},sch=ci.schema||{},mat=ci.materiaal||[];
  let h='<h2 class="sec">Doelen, trainingsschema & materiaal</h2>';
  const doelen=(g.sel||[]).filter(x=>x!=="Anders (zie toelichting)");
  h+='<div class="grp">Doelen</div>'+(doelen.length?'<div class="chips">'+doelen.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div>':'<div class="leeg">Nog geen doelen gekozen.</div>')+(g.other?'<div class="kaartje"><div class="kh">Toelichting</div><div class="kb">'+esc(g.other)+'</div></div>':'');
  const dagen=SCHEMA_DAGEN.filter(d=>(sch[d]||[]).length);
  h+='<div class="grp">Trainingsschema (wanneer kan de klant trainen)</div>'+(dagen.length?'<table class="tb">'+dagen.map(d=>'<tr><td style="font-weight:700;width:30%">'+esc(d)+'</td><td>'+esc((sch[d]||[]).join(", "))+'</td></tr>').join("")+'</table>':'<div class="leeg">Nog niet ingevuld.</div>');
  h+='<div class="grp">Materiaal</div>'+(mat.length?mat.map(m=>'<div class="kaartje"><div class="kh">'+esc(m.loc||"")+'</div><div class="kb">'+esc(m.items||"")+'</div></div>').join(""):'<div class="leeg">Geen materiaallijsten.</div>');
  return h;
}
function expHtmlIntake(D){
  let h='<h2 class="sec">Intakeformulier</h2>';
  const i=D.intake;const ans=(i&&i.answers)||{};
  if(!i||(!Object.keys(ans).length&&!i.notes))return h+'<div class="leeg">Nog niet ingevuld.</div>';
  INTAKE_SECTIES.forEach(sec=>{
    const vr=sec.vragen.filter(q=>ans[q[0]]);if(!vr.length)return;
    h+='<div class="grp">'+esc(sec.titel)+'</div>'+vr.map(q=>'<div class="kaartje"><div class="kh" style="font-weight:600;color:#4b5563;font-size:9.5pt">'+esc(q[1])+'</div><div class="kb">'+esc(ans[q[0]])+'</div></div>').join("");
  });
  if(i.notes)h+='<div class="grp">Overige notities</div><div class="kaartje"><div class="kb">'+esc(i.notes)+'</div></div>';
  return h;
}

// ---------- Tekstbestand ----------
function expTekst(D){
  const L=[];const kop=t=>{L.push("");L.push(t.toUpperCase());L.push("=".repeat(t.length));};
  const naam=expNaam(D.klant);
  L.push("KLANTGEGEVENS: "+naam.toUpperCase());
  L.push("Periode: "+expDatumKort(D.van)+" t/m "+expDatumKort(D.tot)+"  ·  Geëxporteerd: "+D.gemaakt.toLocaleDateString("nl-NL")+" "+expTijd(D.gemaakt)+((D.bedrijf&&D.bedrijf.name)?"  ·  "+D.bedrijf.name:""));
  if(D.workouts){
    kop("Workouts");
    if(!D.workouts.length)L.push("Geen workouts in deze periode.");
    D.workouts.forEach(w=>{
      const st=D.sel.scores&&!expIsRust(w)?"  ["+expDagStatus(D,w).t.replace(/^[✓✕] /,"")+"]":"";
      L.push("");L.push("--- "+expDatum(w.workout_date)+(w.title?" · "+w.title:"")+st+" ---");
      if(expIsRust(w)){L.push("Rustdag");return;}
      if(w.coach_notes)L.push("Notitie coach: "+w.coach_notes);
      if(w.warmup)L.push("Warming-up: "+w.warmup);
      (w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).forEach(b=>{
        L.push((b.label?b.label+") ":"")+(b.group_title?"["+b.group_title+"] ":"")+(b.exercise||""));
        const t=expBlokTekst(b);if(t)t.split("\n").forEach(r=>L.push("    "+r));
        const sc=D.sel.scores?expScore(D,b):null;
        if(sc){L.push("    "+(sc.miss?"GEMIST":"SCORE")+": "+sc.sc+(sc.media?" ("+sc.media+")":""));if(sc.note)L.push("    Notitie sporter: "+sc.note);}
      });
      if(w.cooldown)L.push("Cooldown: "+w.cooldown);
      if(D.sel.scores&&D.dagnoten[w.workout_date])L.push("Dagnotitie sporter: "+D.dagnoten[w.workout_date]);
      const cm=D.sel.scores?(D.comments[w.id]||[]):[];
      if(cm.length){L.push("Reacties:");cm.forEach(c=>L.push("  "+expAuteur(D,c.author_id)+" ("+expDagKort(c.created_at)+" "+expTijd(c.created_at)+"): "+c.body));}
    });
  }
  if(D.metrics){
    kop("Metrics & 1RM");
    const ov=expMetricsOverzicht(D.metrics);
    if(!Object.keys(ov).length)L.push("Nog geen metingen.");
    Object.keys(ov).forEach(g=>{L.push("");L.push(g+":");ov[g].forEach(r=>L.push("  "+r.naam+": "+r.cur+" ("+expDatumKort(r.datum)+(r.delta?", "+r.delta+" t.o.v. vorige":"")+", "+r.n+(r.n===1?" meting":" metingen")+")"));});
    const inP=D.metrics.filter(m=>m.measured_at>=D.van&&m.measured_at<=D.tot);
    L.push("");L.push("Metingen in deze periode:");
    if(!inP.length)L.push("  Geen.");else inP.forEach(m=>L.push("  "+expDatumKort(m.measured_at)+"  "+m.metric+": "+mxFmtRij(m,m.metric)+(m.note?" ("+m.note+")":"")));
    const recs=(D.records||[]).slice().sort((a,b)=>a.lift.localeCompare(b.lift));
    L.push("");L.push("Records uit de krachtlog (beste set per aantal reps):");
    if(!recs.length)L.push("  Nog geen sets gelogd.");else recs.forEach(l=>{const reps=Object.keys(l.reps).map(Number).sort((a,b)=>a-b);L.push("  "+l.lift+": "+reps.map(r=>r+"× "+kgTxt(l.reps[r].kg)+" kg ("+expDatumKort(l.reps[r].date)+")").join(", "));});
    if((D.prs||[]).length){L.push("");L.push("Nieuwe records in deze periode:");D.prs.forEach(g=>L.push("  "+expDatumKort(g.workout_date)+"  "+g.lift+" "+kgTxt(g.kg)+"×"+g.reps));}
  }
  if(D.sel.assessment){
    kop("Assessment");
    const a=D.assessment;
    if(!a)L.push("Nog geen assessment ingevuld.");
    else{
      const d=a.data||{},b=d.body||{},mv=d.move||{},wk=d.work||{};
      L.push("Laatste meting: "+expDatum(a.assessed_on));
      const r=(l,v)=>{if(v!=null&&v!=="")L.push("  "+l+": "+v);};
      L.push("Body:");r("Lichaamsgewicht",b.gewicht);r("Vetpercentage",b.vet);r("Skeletspiermassa",b.spier);r("Basaal metabolisme",b.metab);r("Muscle fat-analyse",b.shape);(b.extra||[]).forEach(x=>r(x.n,x.v));if(b.notes)L.push("  Notities: "+b.notes);
      L.push("Move:");ASS_MOVE.forEach(t=>{if(mv[t[0]])L.push("  "+t[1]+": "+(mv[t[0]]==="pass"?"Pass":"Fail")+(mv[t[0]+"_n"]?" ("+mv[t[0]+"_n"]+")":""));});ASS_TIJD.forEach(t=>r(t[1],mv[t[0]]));(mv.extra||[]).forEach(x=>r(x.n,x.v));if(mv.notes)L.push("  Notities: "+mv.notes);
      L.push("Work:");r("Airbike 10 min cals",wk.cals);r("Airbike weight conversion",wk.conv);(wk.extra||[]).forEach(x=>r(x.n,x.v));if(wk.notes)L.push("  Notities: "+wk.notes);
    }
  }
  if(D.consults){kop("Check-ins & consults");if(!D.consults.length)L.push("Geen consults in deze periode.");D.consults.forEach(c=>{L.push("");L.push(expDatum(c.consult_date)+":");L.push(c.notes||"(geen tekst)");});}
  if(D.plans){kop("Planning & periodisering");if(!D.plans.length)L.push("Geen planning vastgelegd.");D.plans.forEach(p=>{L.push("");L.push((expDatumKort(p.start_date)||"?")+" t/m "+(expDatumKort(p.end_date)||"?")+":");L.push(p.notes||"(geen tekst)");});}
  if(D.ci){
    kop("Doelen, trainingsschema & materiaal");
    const g=D.ci.goals||{sel:[],other:""},sch=D.ci.schema||{},mat=D.ci.materiaal||[];
    L.push("Doelen: "+((g.sel||[]).filter(x=>x!=="Anders (zie toelichting)").join(", ")||"nog niet gekozen"));if(g.other)L.push("Toelichting: "+g.other);
    L.push("Trainingsschema: "+(SCHEMA_DAGEN.filter(d=>(sch[d]||[]).length).map(d=>d+" ("+sch[d].join(", ")+")").join("; ")||"nog niet ingevuld"));
    L.push("Materiaal:");if(!mat.length)L.push("  Geen materiaallijsten.");mat.forEach(m=>{L.push("  "+(m.loc||"")+":");String(m.items||"").split("\n").forEach(x=>L.push("    "+x));});
  }
  if(D.sel.intake){
    kop("Intakeformulier");
    const i=D.intake,ans=(i&&i.answers)||{};
    if(!i||(!Object.keys(ans).length&&!i.notes))L.push("Nog niet ingevuld.");
    INTAKE_SECTIES.forEach(sec=>{const vr=sec.vragen.filter(q=>ans[q[0]]);if(!vr.length)return;L.push("");L.push(sec.titel+":");vr.forEach(q=>{L.push("  V: "+q[1]);L.push("  A: "+ans[q[0]]);});});
    if(i&&i.notes){L.push("");L.push("Overige notities: "+i.notes);}
  }
  if(D.notes){kop("Notities (alleen coach)");if(!D.notes.length)L.push("Geen notities in deze periode.");D.notes.forEach(n=>{L.push("");L.push(expDatum(n.created_at)+(D.staf[n.author_id]?" · "+D.staf[n.author_id]:"")+":");L.push(n.body||"");});}
  L.push("");L.push("Alleen voor coach en sporter.");
  return L.join("\n");
}
