// app/meekijken.js: Rechten coaches en meekijken (verzoek Stefan, 20 nov 2026).
// Een beheerder kiest per coach bij welke collega's hij mag meekijken
// (Instellingen > Rechten coaches). Die coach krijgt op de Klanten-pagina een
// tabblad Meekijken en opent daar een kalender waarin alleen het gepubliceerde
// programma staat. Geen scores, berichten, reacties, metingen of notities, en
// geen enkele knop om iets te wijzigen.
//
// De database dwingt dit af: er zijn GEEN leesregels bijgekomen op profiles,
// workouts of blocks. Alles hier loopt via twee afgeschermde functies
// (kijk_klanten en kijk_programma) die alleen programmavelden teruggeven. Dit
// bestand is dus de bediening, niet de beveiliging.
// Zie supabase/migrations/20261120_coach_kijkrechten.sql.
let KIJK={klanten:null,van:null,klant:null,ref:new Date(),view:"maand",nr:0,oef:{},naarVandaag:false};
let klantKijk=false; // tabblad Meekijken op de Klanten-pagina staat open
let RC=null;         // stand van de pagina Rechten coaches

const kijkBeheerder=()=>myRole()==="eigenaar"||myRole()==="platform_admin";
const kijkNaam=p=>esc([p.first_name,p.last_name].filter(Boolean).join(" ")||"Klant");
const kijkCoachNaam=p=>esc([p.coach_first_name,p.coach_last_name].filter(Boolean).join(" ")||"coach");

// De klanten bij wie ik mag meekijken (naam, foto en bij welke coach).
// Onthouden per ingelogde gebruiker; na uit- en inloggen opnieuw ophalen.
async function kijkLaad(opnieuw){
  const ik=ME&&ME.user?ME.user.id:null;
  if(KIJK.klanten&&KIJK.van===ik&&!opnieuw)return KIJK.klanten;
  let lijst=[];
  try{const{data,error}=await db.rpc("kijk_klanten");if(!error)lijst=data||[];}catch(e){}
  // email leeg meegeven: de avatar-helpers vallen anders terug op een mailadres dat er niet is.
  KIJK.klanten=lijst.map(p=>Object.assign({email:""},p));KIJK.van=ik;
  return KIJK.klanten;
}

// ---------- Klanten-pagina: tabblad Meekijken ----------
const kijkTabAan=()=>myRole()==="coach"&&!!(KIJK.klanten&&KIJK.klanten.length&&KIJK.van===ME.user.id);
const kijkTabOpen=()=>klantKijk&&kijkTabAan();
function kijkTabHtml(){
  if(!kijkTabAan())return "";
  return '<button class="'+(klantKijk?'on':'')+'" onclick="kijkTab()">Meekijken <span style="font-weight:600;color:#8a919c">'+KIJK.klanten.length+'</span></button>';
}
function kijkTab(){klantKijk=true;klantenRender();}
function kijkRijen(){
  const zoek=(typeof klantZoek==="string"?klantZoek:"").toLowerCase();
  let uit="",vorige=null;
  (KIJK.klanten||[]).filter(p=>!zoek||[p.first_name,p.last_name].filter(Boolean).join(" ").toLowerCase().includes(zoek)).forEach(p=>{
    if(p.coach_id!==vorige){vorige=p.coach_id;uit+='<div class="kijkkop">Klanten van <b>'+kijkCoachNaam(p)+'</b></div>';}
    uit+='<div class="trow click" onclick="kijkOpen(\''+esc(p.id)+'\')">'+
      '<div style="flex:1;display:flex;gap:11px;align-items:center"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div style="font-weight:700;font-size:13px">'+kijkNaam(p)+'</div></div>'+
      '<span class="kijkpil"><svg class="i sm-i"><use href="#i-eye"/></svg> Alleen kijken</span></div>';
  });
  return uit;
}
function kijkLijstHtml(){
  return '<div class="sm muted" style="margin:-2px 0 12px;max-width:760px;line-height:1.55">Bij deze klanten mag je meekijken met het programma van hun coach. Je ziet de gepubliceerde workouts. Scores, berichten en notities blijven bij de eigen coach, en aanpassen kan niet.</div>'+
    '<div class="card"><div class="thead"><div style="flex:1">Naam</div></div>'+
    '<div id="klantrows">'+(kijkRijen()||'<div class="trow"><span class="muted">Geen klanten gevonden.</span></div>')+'</div></div>';
}

// ---------- Het kijkscherm ----------
async function kijkOpen(id){
  const lijst=await kijkLaad();
  const p=lijst.find(x=>x.id===id);
  if(!p){
    // Geen recht (meer), of een link van iemand anders: terug naar de eigen klanten.
    toast("Bij deze klant mag je niet meekijken");
    klantKijk=false;setHash("clients");renderCoach("clients");return;
  }
  KIJK.klant=p;KIJK.ref=new Date();KIJK.naarVandaag=true;
  setHash("meekijken/"+id);
  kijkScherm();
}
function kijkScherm(){
  if(!KIJK.klant)return;
  const tb=document.querySelector(".topbar");if(tb)tb.style.display="none";
  coachSection="clients"; // Klanten blijft actief in de balk
  document.getElementById("content").innerHTML=coachShellHtml(
    '<div class="kijkscherm"><div class="calhead" id="kijkhead"></div><div id="kijkcal"><div class="spin">Laden…</div></div></div>');
  const pg=document.getElementById("cpage");if(pg)pg.classList.add("fullbleed");
  kijkTeken();
}
function kijkTerug(){klantKijk=true;setHash("clients");renderCoach("clients");}
function kijkStap(richting){
  const r=KIJK.ref;
  KIJK.ref=KIJK.view==="week"?addDays(r,7*richting):new Date(r.getFullYear(),r.getMonth()+richting,1);
  kijkTeken();
}
function kijkVandaag(){KIJK.ref=new Date();KIJK.naarVandaag=true;kijkTeken();}
function kijkView(v){KIJK.view=v;KIJK.naarVandaag=true;kijkTeken();}

// Welke dagen staan er in beeld?
function kijkBereik(){
  const ref=KIJK.ref;
  if(KIJK.view==="week"){const start=mondayOf(ref);return{start,weken:1};}
  const start=mondayOf(new Date(ref.getFullYear(),ref.getMonth(),1));
  const laatste=mondayOf(new Date(ref.getFullYear(),ref.getMonth()+1,0));
  return{start,weken:Math.round((laatste-start)/864e5/7)+1};
}
function kijkKopHtml(label){
  const p=KIJK.klant;
  let opts="",vorige=null;
  (KIJK.klanten||[]).forEach(k=>{
    if(k.coach_id!==vorige){if(vorige!==null)opts+='</optgroup>';vorige=k.coach_id;opts+='<optgroup label="'+kijkCoachNaam(k)+'">';}
    opts+='<option value="'+esc(k.id)+'"'+(k.id===p.id?' selected':'')+'>'+kijkNaam(k)+'</option>';
  });
  if(vorige!==null)opts+='</optgroup>';
  const seg=[["week","Week"],["maand","Maand"]].map(v=>'<button class="'+(KIJK.view===v[0]?"on":"")+'" onclick="kijkView(\''+v[0]+'\')">'+v[1]+'</button>').join("");
  return '<button class="btn ghost sm" onclick="kijkTerug()">‹ Klanten</button>'+
    '<span class="month">'+label+'</span>'+
    '<div class="navarrows"><button onclick="kijkStap(-1)">‹</button><button onclick="kijkStap(1)">›</button></div>'+
    '<button class="btn ghost sm" onclick="kijkVandaag()">Vandaag</button>'+
    '<div class="seg">'+seg+'</div>'+
    '<div class="kijkwie"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div><select class="kijksel" title="Andere klant kiezen" onchange="kijkOpen(this.value)">'+opts+'</select>'+
      '<div class="sm muted" style="padding-left:2px">Klant van <b>'+kijkCoachNaam(p)+'</b></div></div>'+
      '<span class="kijkpil"><svg class="i sm-i"><use href="#i-eye"/></svg> Alleen kijken</span></div>'+
    '<div class="kijkinfo">Je kijkt mee met het programma van deze klant. Scores, berichten en notities blijven bij de eigen coach, en aanpassen kan hier niet.</div>';
}
async function kijkTeken(){
  const p=KIJK.klant;if(!p)return;
  const nr=++KIJK.nr;
  const{start,weken}=kijkBereik(),eind=addDays(start,weken*7-1),ref=KIJK.ref;
  const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const label=KIJK.view==="week"
    ?start.getDate()+" "+MAANDKORT[start.getMonth()]+" – "+eind.getDate()+" "+MAANDKORT[eind.getMonth()]+" "+eind.getFullYear()
    :cap(MAANDVOL[ref.getMonth()])+" "+ref.getFullYear();
  const kop=document.getElementById("kijkhead"),host=document.getElementById("kijkcal");
  if(!kop||!host)return;
  kop.innerHTML=kijkKopHtml(label);
  // De dagenbalk plakt onder de kop; die is hier hoger dan bij een eigen klant.
  const pg=document.getElementById("cpage");
  if(pg)pg.style.setProperty("--calh",Math.round(kop.getBoundingClientRect().height)+"px");
  host.innerHTML='<div class="spin">Laden…</div>';
  let ws=[],fout=null;
  try{
    const{data,error}=await db.rpc("kijk_programma",{p_client:p.id,p_van:ymd(start),p_tot:ymd(eind)});
    if(error)fout=error;else ws=Array.isArray(data)?data:[];
  }catch(e){fout=e;}
  if(nr!==KIJK.nr||!document.getElementById("kijkcal"))return; // intussen verder geklikt
  if(fout){
    const geenRecht=fout.code==="42501";
    if(geenRecht)KIJK.klanten=null; // recht ingetrokken: lijst de volgende keer vers ophalen
    host.innerHTML='<div class="kijkleeg">'+(geenRecht?'Je mag bij deze klant niet meer meekijken.':'Het programma kon niet laden. Ververs de pagina of probeer het opnieuw.')+'</div>';
    return;
  }
  await kijkOefLaad(ws);
  if(nr!==KIJK.nr||!document.getElementById("kijkcal"))return;
  const perDag={};
  ws.forEach(w=>{(perDag[w.workout_date]=perDag[w.workout_date]||[]).push(w);});
  const vandaag=todayStr();
  let html='<div class="mhead7">'+DAGEN.map(d=>'<div>'+d+'</div>').join("")+'</div>';
  for(let wk=0;wk<weken;wk++){
    let cellen="";
    for(let i=0;i<7;i++){
      const d=addDays(start,wk*7+i),ds=ymd(d),isVandaag=ds===vandaag;
      const dim=KIJK.view==="maand"&&d.getMonth()!==ref.getMonth();
      const dnum=(d.getDate()===1?MAANDKORT[d.getMonth()]+" ":"")+d.getDate();
      cellen+='<div class="mday'+(KIJK.view==="week"?" tall":"")+(isVandaag?" today-cell":"")+(dim?" dim2":"")+'" data-d="'+ds+'">'+
        '<div class="mday-top"><span class="dnum2'+(isVandaag?" today":"")+'">'+dnum+'</span></div>'+
        (perDag[ds]||[]).map(kijkKaartHtml).join("")+'</div>';
    }
    html+='<div class="mrow">'+cellen+'</div>';
  }
  if(!ws.length)html='<div class="kijkleeg">In deze periode staan geen gepubliceerde workouts.</div>'+html;
  host.innerHTML=html;
  if(KIJK.naarVandaag){
    KIJK.naarVandaag=false;
    const cel=host.querySelector(".mday.today-cell");
    if(cel&&KIJK.view==="maand")cel.scrollIntoView({block:"center"});else window.scrollTo(0,0);
  }
}
// Demo-video's van blokken die alleen de oude koppeling (oefening_id) hebben:
// titel en YouTube-id uit de openbare videobibliotheek halen.
async function kijkOefLaad(ws){
  const nodig=new Set();
  const wil=(media,id)=>{if(id&&!(Array.isArray(media)&&media.length)&&!(id in KIJK.oef))nodig.add(id);};
  ws.forEach(w=>{
    wil(w.warmup_media,w.warmup_oefening_id);wil(w.cooldown_media,w.cooldown_oefening_id);
    (w.blocks||[]).forEach(b=>wil(b.media,b.oefening_id));
  });
  const ids=[...nodig];
  for(let i=0;i<ids.length;i+=150){
    const stuk=ids.slice(i,i+150);
    try{
      const{data}=await db.from("oefeningen").select("id,naam,youtube_id").in("id",stuk);
      stuk.forEach(id=>{KIJK.oef[id]=null;});
      (data||[]).forEach(o=>{KIJK.oef[o.id]=o;});
    }catch(e){}
  }
}
function kijkVids(media,oefId){
  let lijst=(Array.isArray(media)?media:[]).filter(m=>m&&m.youtube_id).map(m=>({yt:String(m.youtube_id),titel:m.titel||"Demo-video"}));
  const o=oefId?KIJK.oef[oefId]:null;
  if(!lijst.length&&o&&o.youtube_id)lijst=[{yt:String(o.youtube_id),titel:o.naam||"Demo-video"}];
  lijst=lijst.filter(v=>/^[\w-]{5,20}$/.test(v.yt)); // alleen een echt YouTube-id komt in de klikactie
  if(!lijst.length)return "";
  return '<div class="kijkvids">'+lijst.map(v=>'<span class="kijkvid" title="Demo-video afspelen" onclick="ytSpeel(\''+v.yt+'\')">▶ '+esc(v.titel)+'</span>').join("")+'</div>';
}
function kijkBlokHtml(b){
  const pr=composePresc(b),vids=kijkVids(b.media,b.oefening_id);
  if(b.kind==="info"){
    return '<div class="cblk k-info'+(b.color?' k-'+esc(b.color):' k-grijs')+'"><div class="n">'+esc(b.exercise||"Tekst")+'</div>'+
      (pr?'<div class="pr">'+esc(pr)+'</div>':'')+vids+'</div>';
  }
  return '<div class="cblk'+(b.color?' k-'+esc(b.color):'')+(b.linked?' linked2':'')+'"><div class="n">'+(b.label?esc(b.label)+') ':'')+esc(b.exercise||"")+'</div>'+
    (pr?'<div class="pr">'+esc(pr)+'</div>':'')+
    ((b.kind!=="conditioning"&&b.notes)?'<div class="pr" style="font-style:italic" title="Coachingtips">💡 '+esc(b.notes)+'</div>':'')+vids+'</div>';
}
// Superset met kaarttitel: één blokje met per oefening een regel, net als in de app.
function kijkSupersetHtml(g){
  const b0=g[0],letter=String(b0.label||"").replace(/\d+$/,""),pr=composePresc(b0);
  let h='<div class="cblk'+(b0.color?' k-'+esc(b0.color):'')+' ssblok"><div class="n">'+esc(letter)+') '+esc((b0.group_title||"").trim())+'</div>';
  if(pr)h+='<div class="pr">'+esc(pr)+'</div>';
  if(b0.notes)h+='<div class="pr" style="font-style:italic" title="Coachingtips">💡 '+esc(b0.notes)+'</div>';
  g.forEach(b=>{h+='<div class="ssrij"><span class="ssnaam">'+esc(b.label||"")+' '+esc(b.exercise||"")+'</span></div>'+kijkVids(b.media,b.oefening_id);});
  return h+'</div>';
}
function kijkKaartHtml(w){
  const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
  if(!blocks.length&&/^rest ?day$/i.test((w.title||"").trim()))
    return '<div class="mcard planned"><div class="msc"><span style="color:#27b376">Rustdag</span></div></div>';
  let inner="";
  if(w.warmup)inner+='<div class="cblk k-grijs"><div class="n">Warmup</div><div class="pr">'+esc(w.warmup)+'</div>'+kijkVids(w.warmup_media,w.warmup_oefening_id)+'</div>';
  blokGroepen(blocks).forEach(g=>{
    if(g.length>1&&(g[0].group_title||"").trim())inner+=kijkSupersetHtml(g);
    else g.forEach(b=>{inner+=kijkBlokHtml(b);});
  });
  if(w.cooldown)inner+='<div class="cblk k-grijs"><div class="n">Cooldown</div><div class="pr">'+esc(w.cooldown)+'</div>'+kijkVids(w.cooldown_media,w.cooldown_oefening_id)+'</div>';
  return '<div class="mcard planned"><div class="msc"><span class="wtitle">'+esc(w.title||"Workout")+'</span></div>'+inner+'</div>';
}

// ---------- Instellingen > Rechten coaches (alleen beheerders) ----------
async function rcPaneel(host){
  if(!kijkBeheerder()){host.innerHTML='<div class="csoon">Deze pagina is alleen voor beheerders.</div>';return;}
  host.innerHTML='<div class="spin">Laden…</div>';
  const cid=ME.profile.company_id;
  await ensureClients();
  const[rs,rk]=await Promise.all([
    db.from("profiles").select("id,first_name,last_name,email,role,avatar_url,archived").in("role",["coach","eigenaar","platform_admin"]).eq("company_id",cid),
    db.from("coach_kijkrechten").select("viewer_id,coach_id").eq("company_id",cid)
  ]);
  if(instTab!=="rechten"||!document.getElementById("inst-paneel"))return; // tab is intussen gewisseld
  if(rs.error||rk.error){host.innerHTML='<div class="msg err">De rechten konden niet laden. Ververs de pagina of probeer het opnieuw.</div>';return;}
  const staf=(rs.data||[]).filter(p=>!p.archived).sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  RC={staf,set:new Set((rk.data||[]).map(r=>r.viewer_id+">"+r.coach_id)),aantal:{}};
  actieveKlanten().forEach(k=>{if(k.coach_id)RC.aantal[k.coach_id]=(RC.aantal[k.coach_id]||0)+1;});
  rcRender();
}
const rcKlantenTxt=n=>n?(n+" "+(n===1?"klant":"klanten")):"geen klanten";
function rcTelTxt(viewerId){
  const n=RC.staf.filter(c=>RC.set.has(viewerId+">"+c.id)).length;
  return n?("Kijkt mee bij "+n+" "+(n===1?"coach":"coaches")):"Kijkt nergens mee";
}
function rcRender(){
  const host=document.getElementById("inst-paneel");if(!host||!RC)return;
  const coaches=RC.staf.filter(p=>p.role==="coach"),beheer=RC.staf.filter(p=>p.role!=="coach");
  const kaarten=coaches.map(v=>{
    // Bij wie kan deze coach meekijken: iedereen met klanten (en wie al aangevinkt staat).
    const doelen=RC.staf.filter(c=>c.id!==v.id&&(RC.aantal[c.id]||RC.set.has(v.id+">"+c.id)));
    const vinkjes=doelen.map(c=>'<label class="rcvink"><input type="checkbox"'+(RC.set.has(v.id+">"+c.id)?" checked":"")+
      ' onchange="rcZet(this,\''+esc(v.id)+'\',\''+esc(c.id)+'\')"><span class="rcnaam">'+naamVan(c)+'</span>'+
      '<span class="rcaantal">'+rcKlantenTxt(RC.aantal[c.id]||0)+'</span></label>').join("");
    return '<div class="rckaart"><div class="rckop"><div class="cavc" style="'+avFotoStyle(v)+'">'+avFotoText(v)+'</div>'+
      '<div style="flex:1;min-width:0"><b style="font-size:14px">'+naamVan(v)+'</b><div class="sm muted">'+esc(v.email||"")+'</div></div>'+
      '<span class="rctel" id="rctel-'+esc(v.id)+'">'+rcTelTxt(v.id)+'</span></div>'+
      '<div class="rclabel">Mag meekijken bij de klanten van</div>'+
      (vinkjes?'<div class="rcrij">'+vinkjes+'</div>':'<div class="sm muted">Er zijn nog geen andere coaches met klanten.</div>')+'</div>';
  }).join("");
  host.innerHTML='<h2 style="margin:0 0 4px">Rechten coaches</h2>'+
    '<div class="sm muted" style="margin-bottom:16px;max-width:720px;line-height:1.6">Kies per coach bij welke collega\'s hij mag meekijken. Meekijken is alleen lezen: de coach ziet de gepubliceerde workouts in de kalender van die klanten. Scores, berichten, reacties, metingen, notities en klantgegevens blijven bij de eigen coach, en aanpassen kan niet. Een vinkje werkt meteen.</div>'+
    (kaarten||'<div class="sm muted">Er zijn nog geen coaches. Voeg er een toe op de pagina Coaches.</div>')+
    (beheer.length?'<div class="rcbeheer"><b>Beheerders zien altijd alles</b><div class="sm muted" style="margin-top:3px">'+beheer.map(naamVan).join(", ")+'</div></div>':'');
}
async function rcZet(cb,viewerId,coachId){
  if(!RC)return;
  const aan=cb.checked,sleutel=viewerId+">"+coachId;
  cb.disabled=true;
  let fout=null;
  try{
    const r=aan
      ?await db.from("coach_kijkrechten").insert({company_id:ME.profile.company_id,viewer_id:viewerId,coach_id:coachId})
      :await db.from("coach_kijkrechten").delete().eq("viewer_id",viewerId).eq("coach_id",coachId);
    fout=r.error;
    if(fout&&fout.code==="23505")fout=null; // stond al aan (dubbelklik of een tweede beheerder)
  }catch(e){fout=e;}
  cb.disabled=false;
  if(fout){cb.checked=!aan;toast("Opslaan mislukt: "+((fout&&fout.message)||"onbekende fout"));return;}
  if(aan)RC.set.add(sleutel);else RC.set.delete(sleutel);
  const tel=document.getElementById("rctel-"+viewerId);if(tel)tel.textContent=rcTelTxt(viewerId);
  toast("Opgeslagen");
}
