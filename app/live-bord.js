// app/live-bord.js — Live bord (20 nov 2026, wens Stefan): een trainingsdag op een tv of
// beamer. De coach zet hier een bord klaar (onderdelen onder elkaar: een tekst zoals de
// warming-up, of een workout met leaderboard), kiest welk onderdeel op het bord staat en
// kan een score toevoegen voor iemand zonder app. Het bord zelf is bord.html: een open link
// met een geheime code, die elke twee seconden de stand ophaalt (functie live_bord_stand).
// Scores zijn gewone leaderboard-scores (results op een workout met audience 'bord' of
// 'blog'), dus wat een atleet in de app logt staat vanzelf op het bord.
// Te vinden via het menu rechtsboven (avatar) > Live bord. Tabel: live_borden.
let LVB={lijst:null,open:null,cur:null,wo:{},rows:null,rowsVoor:null,klok:null,score:null,ond:null,pick:null,pickZoek:"",zoekNr:0,hits:[]};

const lvbId=()=>"o"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const lvbLink=b=>location.origin+location.pathname.replace(/[^/]*$/,"")+"bord.html?c="+encodeURIComponent(b.code);
const lvbOnd=()=>(LVB.cur&&Array.isArray(LVB.cur.onderdelen))?LVB.cur.onderdelen:[];
const lvbActiefNr=()=>{const n=lvbOnd().length;return n?Math.max(0,Math.min(LVB.cur.actief||0,n-1)):-1;};
const lvbActief=()=>{const i=lvbActiefNr();return i<0?null:lvbOnd()[i];};
// Het blok waarop gescoord wordt: het eerste echte blok (een tekstblok telt niet), zoals de database het ook kiest.
const lvbBlok=w=>((w&&w.blocks)||[]).filter(b=>b.kind!=="info").sort((a,b)=>(a.sort||0)-(b.sort||0))[0]||null;

async function fillLiveBord(){
  const{data,error}=await db.from("live_borden").select("*").eq("company_id",ME.profile.company_id).order("datum",{ascending:false}).order("created_at",{ascending:false}).limit(200);
  if(coachSection!=="live")return;
  const cp=document.getElementById("cpage");if(!cp)return;
  if(error){cp.innerHTML='<h1>Live bord</h1><div class="card"><div class="cempty">Live borden laden mislukt. Ververs de pagina en probeer het opnieuw.</div></div>';return;}
  LVB.lijst=data||[];
  lvbModals();
  LVB.cur=LVB.open?(LVB.lijst.find(b=>b.id===LVB.open)||null):null;
  if(!LVB.cur)LVB.open=null;
  if(LVB.cur)await lvbLaadWorkouts();
  lvbRender();lvbStartKlok();
}
// De workouts achter de onderdelen (naam, scoretype, timecap), één keer per workout opgehaald.
async function lvbLaadWorkouts(){
  const ids=[...new Set(lvbOnd().filter(o=>o.soort==="workout"&&o.workout_id&&!LVB.wo[o.workout_id]).map(o=>o.workout_id))];
  if(!ids.length)return;
  const{data}=await db.from("workouts").select("id,title,workout_date,audience, blocks(*)").in("id",ids);
  (data||[]).forEach(w=>{LVB.wo[w.id]=w;});
}
function lvbRender(){
  const cp=document.getElementById("cpage");if(!cp||coachSection!=="live")return;
  cp.innerHTML='<h1>Live bord</h1><div class="lvb-wrap">'+(LVB.cur?lvbBordHtml():lvbLijstHtml())+'</div>';
  if(LVB.cur)lvbScoresLaad();
}
function lvbLijstHtml(){
  const rijen=(LVB.lijst||[]).map(b=>{
    const n=Array.isArray(b.onderdelen)?b.onderdelen.length:0;
    return '<div class="trow click" onclick="lvbOpen(\''+b.id+'\')"><div style="flex:2.4;min-width:0"><b>'+esc(b.titel)+'</b></div>'+
      '<div style="flex:1" class="sm muted">'+esc(datumNL(b.datum))+'</div>'+
      '<div style="flex:1" class="sm muted">'+n+(n===1?" onderdeel":" onderdelen")+'</div>'+
      '<div style="width:110px;display:flex;justify-content:flex-end"><button class="btn ghost sm">Openen</button></div></div>';
  }).join("");
  return '<div class="card" style="padding:18px"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">'+
      '<div style="flex:1;min-width:240px"><h2 style="font-size:16px">Live bord</h2><div class="sm muted" style="font-size:12.5px;margin-top:3px">Zet een trainingsdag op een tv of beamer: links de workout, rechts de scores die binnenkomen zodra iemand logt. Het YourProgram-logo staat altijd bovenaan.</div></div>'+
      '<button class="btn" onclick="lvbNieuw()">Nieuw bord</button></div></div>'+
    '<div class="card">'+(rijen||'<div class="cempty">Nog geen bord. Maak er een met de knop Nieuw bord.</div>')+'</div>';
}
function lvbBordHtml(){
  const b=LVB.cur,ond=lvbOnd(),act=lvbActiefNr(),link=lvbLink(b);
  const rijen=ond.map((o,i)=>{
    const wo=o.soort==="workout",kort=String(o.tekst||"").replace(/\s*\n\s*/g," · ");
    return '<div class="lvb-ond'+(i===act?' aan':'')+'"><div class="lvb-nr">'+(i+1)+'</div>'+
      '<div style="flex:1;min-width:180px"><b>'+esc(o.titel||"Zonder naam")+'</b> <span class="cpill '+(wo?"purple":"gray")+'">'+(wo?"Workout":"Tekst")+'</span>'+
        (kort?'<div class="sm muted lvb-kort">'+esc(kort)+'</div>':'')+'</div>'+
      '<div class="lvb-knoppen">'+(i===act?'<span class="cpill teal">Nu op het bord</span>':'<button class="btn sm" onclick="lvbToon('+i+')">Toon op bord</button>')+
        '<button class="btn ghost sm" title="Omhoog" onclick="lvbSchuif('+i+',-1)"'+(i===0?" disabled":"")+'>↑</button>'+
        '<button class="btn ghost sm" title="Omlaag" onclick="lvbSchuif('+i+',1)"'+(i===ond.length-1?" disabled":"")+'>↓</button>'+
        '<button class="btn ghost sm" onclick="lvbOndBewerk('+i+')">Bewerken</button>'+
        '<button class="btn ghost sm" onclick="lvbOndWeg('+i+')">Weg</button></div></div>';
  }).join("");
  const seg=[["split","Workout en scores"],["workout","Alleen workout"],["scores","Alleen scores"]].map(s=>'<button class="'+(b.weergave===s[0]?"on":"")+'" onclick="lvbWeergave(\''+s[0]+'\')">'+s[1]+'</button>').join("");
  return '<div style="margin-bottom:10px"><button class="btn ghost sm" onclick="lvbTerug()">‹ Alle borden</button></div>'+
    '<div class="card" style="padding:18px"><div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<div class="field" style="flex:2;min-width:220px"><label>Naam van de dag</label><input id="lvb-titel" value="'+esc(b.titel)+'" onchange="lvbVeld(\'titel\',this.value)"></div>'+
        '<div class="field"><label>Datum</label><input type="date" id="lvb-datum" value="'+esc(b.datum||"")+'" onchange="lvbVeld(\'datum\',this.value)"></div></div>'+
      '<div class="field"><label>Link van het bord (open deze op de tv)</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="lvb-link" readonly value="'+esc(link)+'" style="flex:1;min-width:220px" onclick="this.select()">'+
        '<button class="btn" onclick="lvbKopieer()">Kopieer link</button><button class="btn ghost" onclick="window.open(\''+esc(link)+'\',\'_blank\')">Open bord</button></div>'+
        '<div class="sm muted" style="margin-top:5px">Wie deze link heeft ziet het bord zonder in te loggen. Op de tv: open de link in Chrome en kies Casten, of open hem in de browser van de tv.</div></div>'+
      '<label class="lvb-vink"><input type="checkbox" '+(b.volledige_namen?"checked":"")+' onchange="lvbVeld(\'volledige_namen\',this.checked)"> Hele achternaam tonen op het bord (uit = voornaam en eerste letter)</label></div>'+
    '<div class="card" style="padding:18px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px">'+
        '<h2 style="font-size:16px">Onderdelen <span class="cpill teal">'+ond.length+'</span></h2><div class="seg">'+seg+'</div></div>'+
      (rijen||'<div class="cempty" style="padding:18px 0">Nog geen onderdelen. Voeg hieronder een tekst toe (bijvoorbeeld de warming-up) of een workout met leaderboard.</div>')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" onclick="lvbPick()">+ Workout met leaderboard</button><button class="btn ghost" onclick="lvbOndNieuw()">+ Tekst (warming-up, uitleg)</button></div></div>'+
    '<div class="card" style="padding:18px" id="lvb-scores">'+lvbScoresHtml()+'</div>'+
    '<div style="margin:6px 0 30px"><button class="btn ghost sm" onclick="lvbVerwijder()">Bord verwijderen</button></div>';
}
function lvbOpen(id){LVB.open=id;LVB.cur=(LVB.lijst||[]).find(b=>b.id===id)||null;LVB.rows=null;LVB.rowsVoor=null;lvbLaadWorkouts().then(lvbRender);}
function lvbTerug(){LVB.open=null;LVB.cur=null;fillLiveBord();}
async function lvbNieuw(){
  const d=new Date(),{data,error}=await db.from("live_borden").insert({company_id:ME.profile.company_id,created_by:ME.user.id,titel:"Trainingsdag "+d.getDate()+" "+MAANDVOL[d.getMonth()],datum:todayStr()}).select().single();
  if(error||!data){toast((error&&error.message)||"Bord maken mislukt");return;}
  LVB.lijst=[data].concat(LVB.lijst||[]);lvbOpen(data.id);
}
// Eén of meer velden opslaan. De database geeft de hele rij terug; die wordt de nieuwe stand.
async function lvbBewaar(patch,stil){
  const b=LVB.cur;if(!b)return false;
  const{data,error}=await db.from("live_borden").update(patch).eq("id",b.id).select().single();
  if(error||!data){toast((error&&error.message)||"Opslaan mislukt");return false;}
  LVB.cur=data;const i=(LVB.lijst||[]).findIndex(x=>x.id===data.id);if(i>=0)LVB.lijst[i]=data;
  if(!stil){await lvbLaadWorkouts();lvbRender();}
  return true;
}
function lvbVeld(veld,waarde){
  if(veld==="titel"){waarde=String(waarde||"").trim();if(!waarde){toast("Geef de dag een naam");lvbRender();return;}}
  if(veld==="datum"&&!waarde){toast("Kies een datum");lvbRender();return;}
  lvbBewaar({[veld]:waarde},true).then(ok=>{if(ok)toast("Opgeslagen");});
}
async function lvbKopieer(){
  const link=lvbLink(LVB.cur);
  try{await navigator.clipboard.writeText(link);toast("Link gekopieerd");}
  catch(e){const el=document.getElementById("lvb-link");if(el){el.focus();el.select();}toast("Kopieer de link met Ctrl+C");}
}
function lvbWeergave(w){lvbBewaar({weergave:w});}
function lvbToon(i){LVB.rows=null;LVB.rowsVoor=null;lvbBewaar({actief:i});}
// Onderdelen opslaan en het onderdeel dat nu op het bord staat op het bord houden, ook als de volgorde wijzigt.
function lvbOndBewaar(nieuw){
  const act=lvbActief(),ai=act?nieuw.findIndex(o=>o.id===act.id):-1;
  return lvbBewaar({onderdelen:nieuw,actief:ai>=0?ai:Math.max(0,Math.min(lvbActiefNr(),nieuw.length-1))});
}
function lvbSchuif(i,d){
  const a=lvbOnd().slice(),j=i+d;if(j<0||j>=a.length)return;
  const t=a[i];a[i]=a[j];a[j]=t;lvbOndBewaar(a);
}
function lvbOndWeg(i){
  const o=lvbOnd()[i];if(!o)return;
  if(!confirm('"'+(o.titel||"Dit onderdeel")+'" van het bord halen? De workout en de scores zelf blijven bestaan.'))return;
  LVB.rows=null;LVB.rowsVoor=null;
  lvbOndBewaar(lvbOnd().filter((x,k)=>k!==i));
}
function lvbVerwijder(){
  const b=LVB.cur;if(!b)return;
  if(!confirm('Het bord "'+b.titel+'" verwijderen? De link werkt daarna niet meer. De workouts en scores blijven bestaan.'))return;
  db.from("live_borden").delete().eq("id",b.id).then(({error})=>{
    if(error){toast(error.message||"Verwijderen mislukt");return;}
    toast("Bord verwijderd");lvbTerug();
  });
}

// --- Vensters: onderdeel (tekst), workout kiezen, score toevoegen ---
function lvbModals(){
  if(document.getElementById("lvbmodals"))return;
  const d=document.createElement("div");d.id="lvbmodals";
  d.innerHTML='<div class="lmodal" id="lvbondmodal"><div class="box" style="width:560px;max-width:94vw"><h3 id="lvbond-kop">Onderdeel</h3>'+
      '<div class="field"><label>Naam</label><input id="lvbond-titel" placeholder="bijv. Warming-up"></div>'+
      '<div class="field"><label>Tekst op het bord</label><textarea id="lvbond-tekst" style="min-height:200px" placeholder="3 rondes&#10;10 air squats&#10;10 push-ups"></textarea></div>'+
      '<div class="sm muted" id="lvbond-hint" style="margin-bottom:12px"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="lvbOndOpslaan()">Opslaan</button><button class="btn ghost" onclick="lvbDicht(\'lvbondmodal\')">Annuleren</button></div>'+
      '<div class="msg" id="lvbond-msg"></div></div></div>'+
    '<div class="lmodal" id="lvbpickmodal"><div class="box" style="width:620px;max-width:96vw"><h3>Workout met leaderboard kiezen</h3>'+
      '<div class="sm muted" style="margin-bottom:10px">Kies een workout die al een leaderboard heeft (bij een klant op een blok aangezet, of een '+esc(SHOWDOWN)+'). Scores die atleten in de app loggen staan vanzelf op het bord.</div>'+
      '<div class="field"><input id="lvbpick-zoek" placeholder="Zoek op naam, beweging of datum…" oninput="lvbPickZoek(this.value)"></div>'+
      '<div id="lvbpick-lijst" style="max-height:46vh;overflow:auto;margin-bottom:10px"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn ghost" onclick="lvbDicht(\'lvbpickmodal\')">Sluiten</button></div></div></div>'+
    '<div class="lmodal" id="lvbscmodal"><div class="box" style="width:520px;max-width:96vw"><h3 id="lvbsc-kop">Score toevoegen</h3>'+
      '<div id="lvbsc-body"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="lvbsc-ok" onclick="lvbScoreOpslaan()">Opslaan</button><button class="btn ghost" onclick="lvbDicht(\'lvbscmodal\')">Annuleren</button></div>'+
      '<div class="msg" id="lvbsc-msg"></div></div></div>';
  document.body.appendChild(d);
}
function lvbDicht(id){const m=document.getElementById(id);if(m)m.classList.remove("show");if(id==="lvbscmodal")LVB.score=null;}
const lvbVensterOpen=()=>["lvbondmodal","lvbpickmodal","lvbscmodal"].some(id=>{const m=document.getElementById(id);return m&&m.classList.contains("show");});

function lvbOndNieuw(){LVB.ond={i:-1};lvbOndVenster({soort:"tekst",titel:"",tekst:""});}
function lvbOndBewerk(i){const o=lvbOnd()[i];if(!o)return;LVB.ond={i};lvbOndVenster(o);}
function lvbOndVenster(o){
  document.getElementById("lvbond-kop").textContent=LVB.ond.i<0?"Tekst toevoegen":(o.soort==="workout"?"Workout op het bord":"Tekst bewerken");
  document.getElementById("lvbond-titel").value=o.titel||"";
  document.getElementById("lvbond-tekst").value=o.tekst||"";
  document.getElementById("lvbond-hint").textContent=o.soort==="workout"?"Dit is alleen de tekst op het bord. De workout in de app van de atleten verandert niet.":"Een tekst zonder scores, bijvoorbeeld de warming-up, de indeling van de dag of uitleg.";
  document.getElementById("lvbond-msg").textContent="";
  document.getElementById("lvbondmodal").classList.add("show");
  document.getElementById("lvbond-titel").focus();
}
async function lvbOndOpslaan(){
  const titel=document.getElementById("lvbond-titel").value.trim(),tekst=document.getElementById("lvbond-tekst").value.replace(/\s+$/,"");
  if(!titel){document.getElementById("lvbond-msg").textContent="Geef het onderdeel een naam.";return;}
  const a=lvbOnd().slice(),i=LVB.ond.i;
  if(i<0)a.push({id:lvbId(),soort:"tekst",titel,tekst});
  else a[i]=Object.assign({},a[i],{titel,tekst});
  if(await lvbOndBewaar(a))lvbDicht("lvbondmodal");
}
async function lvbPick(){
  LVB.pickZoek="";document.getElementById("lvbpick-zoek").value="";
  document.getElementById("lvbpick-lijst").innerHTML='<div class="cempty">Leaderboards laden…</div>';
  document.getElementById("lvbpickmodal").classList.add("show");
  const{data,error}=await db.from("workouts").select("id,title,workout_date,audience,created_at, blocks(*)")
    .eq("company_id",ME.profile.company_id).in("audience",["bord","blog"]).is("blog_program_id",null)
    .order("workout_date",{ascending:false}).order("created_at",{ascending:false}).limit(300);
  if(error){document.getElementById("lvbpick-lijst").innerHTML='<div class="cempty">Leaderboards laden mislukt.</div>';return;}
  LVB.pick=data||[];lvbPickLijst();
}
const lvbWoTekst=w=>{const b=lvbBlok(w);return b?String(composePresc(b)||"").trim():"";};
function lvbPickZoek(v){LVB.pickZoek=(v||"").toLowerCase().trim();lvbPickLijst();}
function lvbPickLijst(){
  const host=document.getElementById("lvbpick-lijst");if(!host)return;
  const z=LVB.pickZoek,al=new Set(lvbOnd().map(o=>o.workout_id).filter(Boolean));
  const hits=(LVB.pick||[]).filter(w=>!z||(w.title||"").toLowerCase().includes(z)||(w.workout_date||"").includes(z)||datumNL(w.workout_date).toLowerCase().includes(z)||lvbWoTekst(w).toLowerCase().includes(z)).slice(0,80);
  host.innerHTML=hits.map(w=>{
    const bord=w.audience==="bord",kort=lvbWoTekst(w).replace(/\s*\n\s*/g," · ");
    return '<div class="trow'+(al.has(w.id)?'':' click')+'" style="align-items:flex-start"'+(al.has(w.id)?'':' onclick="lvbPickKies(\''+w.id+'\')"')+'>'+
      '<div style="flex:1;min-width:0"><b>'+esc(w.title||(bord?"Leaderboard-workout":SHOWDOWN))+'</b> <span class="cpill '+(bord?"purple":"teal")+'">'+(bord?"1-op-1":esc(SHOWDOWN))+'</span>'+
        '<div class="sm muted">'+esc(datumNL(w.workout_date))+'</div>'+(kort?'<div class="sm muted lvb-kort">'+esc(kort)+'</div>':'')+'</div>'+
      '<div style="flex:none">'+(al.has(w.id)?'<span class="cpill gray">Staat er al</span>':'<button class="btn ghost sm">Toevoegen</button>')+'</div></div>';
  }).join("")||'<div class="cempty">Geen leaderboard gevonden.</div>';
}
async function lvbPickKies(id){
  const w=(LVB.pick||[]).find(x=>x.id===id);if(!w)return;
  LVB.wo[w.id]=w;
  let tekst=lvbWoTekst(w);
  // Staat de workout-tekst niet op het bord zelf, dan uit de kalender van een klant (de gewone versie, niet Scaled).
  if(!tekst){
    const{data}=await db.from("blocks").select("*").eq("source_blog_workout_id",w.id).eq("scaled_versie",false).limit(1);
    if(data&&data[0])tekst=String(composePresc(data[0])||"").trim();
  }
  const a=lvbOnd().concat([{id:lvbId(),soort:"workout",titel:w.title||"Workout",tekst,workout_id:w.id}]);
  if(await lvbOndBewaar(a)){toast("Toegevoegd. Pas de tekst voor het bord aan via Bewerken.");lvbPickLijst();}
}

// --- Scores van het onderdeel dat op het bord staat ---
function lvbScoresHtml(){
  const o=lvbActief();
  if(!o)return '<div class="cempty" style="padding:10px 0">Voeg eerst een onderdeel toe.</div>';
  if(o.soort!=="workout")return '<h2 style="font-size:16px">Scores</h2><div class="sm muted" style="margin-top:4px">Op het bord staat nu een tekst ("'+esc(o.titel||"")+'"). Zet een workout op het bord om scores te zien en toe te voegen.</div>';
  const w=LVB.wo[o.workout_id],blk=lvbBlok(w),st=(blk&&blk.score_type)||"text";
  const kop='<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><div><h2 style="font-size:16px">Scores: '+esc(o.titel||"")+
    (LVB.rows&&LVB.rowsVoor===o.id?' <span class="cpill teal">'+LVB.rows.length+'</span>':'')+'</h2>'+
    '<div class="sm muted" style="margin-top:3px">Wat atleten in de app loggen komt hier vanzelf bij. Voor iemand zonder app voeg je de score zelf toe.</div></div>'+
    '<button class="btn" onclick="lvbScoreNieuw()">Score toevoegen</button></div>';
  if(!w)return kop+'<div class="cempty">Deze workout is niet (meer) te vinden. Haal het onderdeel weg en kies een andere.</div>';
  if(!LVB.rows||LVB.rowsVoor!==o.id)return kop+'<div class="cempty">Scores laden…</div>';
  if(!LVB.rows.length)return kop+'<div class="cempty">Nog geen scores.</div>';
  const rijen=LVB.rows.slice().sort((a,b)=>{
    const ga=["man","vrouw"].indexOf(a.gender),gb=["man","vrouw"].indexOf(b.gender);
    const ka=(ga<0?2:ga)*2+(a.rx==="scaled"?1:0),kb=(gb<0?2:gb)*2+(b.rx==="scaled"?1:0);
    return (ka-kb)||wwCmp(st)(a,b);
  }).map(r=>{
    const gast=r.athlete_id===r.result_id,naam=[r.first_name,r.last_name].filter(Boolean).join(" ")||"Naamloos";
    const tags=(gast?'<span class="cpill gray">losse naam</span> ':'')+(r.gender==="man"?'<span class="cpill gray">man</span> ':r.gender==="vrouw"?'<span class="cpill gray">vrouw</span> ':'')+(r.rx==="scaled"?'<span class="cpill purple">Scaled</span>':'');
    return '<div class="trow" style="flex-wrap:wrap;gap:6px"><div style="flex:2;min-width:160px"><b>'+esc(naam)+'</b> '+tags+'</div>'+
      '<div style="flex:1;min-width:90px"><b>'+esc((r.capped?"CAP · ":"")+(resultScoreTxt(r,st)||"–"))+'</b></div>'+
      '<div style="display:flex;gap:6px"><button class="btn ghost sm" onclick="lvbScoreBewerk(\''+r.result_id+'\')">Aanpassen</button><button class="btn ghost sm" onclick="lvbScoreWeg(\''+r.result_id+'\')">Weg</button></div></div>';
  }).join("");
  return kop+rijen;
}
async function lvbScoresLaad(){
  const o=lvbActief();if(!o||o.soort!=="workout"||!LVB.wo[o.workout_id])return;
  const voor=o.id,{data,error}=await db.rpc("blog_leaderboard",{p_workout_id:o.workout_id});
  if(error||!LVB.cur||!lvbActief()||lvbActief().id!==voor)return;
  const blk=lvbBlok(LVB.wo[o.workout_id]);
  const nieuw=(data||[]).filter(r=>!blk||r.block_id===blk.id);
  const zelfde=LVB.rowsVoor===voor&&JSON.stringify(nieuw)===JSON.stringify(LVB.rows);
  LVB.rows=nieuw;LVB.rowsVoor=voor;
  const host=document.getElementById("lvb-scores");
  if(host&&!zelfde)host.innerHTML=lvbScoresHtml();
}
// Zolang deze pagina open staat elke paar seconden de scores verversen (net als het bord zelf).
function lvbStartKlok(){
  if(LVB.klok)return;
  LVB.klok=setInterval(()=>{
    if(coachSection!=="live"||!document.getElementById("lvb-scores")){clearInterval(LVB.klok);LVB.klok=null;return;}
    if(document.hidden||lvbVensterOpen())return;
    lvbScoresLaad();
  },4000);
}
function lvbScoreNieuw(){
  const o=lvbActief();if(!o||o.soort!=="workout")return;
  LVB.score={ond:o.id,wid:o.workout_id,athlete:null,vast:false,rij:null};lvbScoreVenster();
}
function lvbScoreBewerk(rid){
  const o=lvbActief(),r=(LVB.rows||[]).find(x=>x.result_id===rid);if(!o||!r)return;
  const gast=r.athlete_id===r.result_id,naam=[r.first_name,r.last_name].filter(Boolean).join(" ");
  LVB.score={ond:o.id,wid:o.workout_id,athlete:gast?null:{id:r.athlete_id,naam},vast:true,rij:r,naam};lvbScoreVenster();
}
function lvbScoreVenster(){
  const s=LVB.score,w=LVB.wo[s.wid],blk=lvbBlok(w)||{},st=blk.score_type||"text",r=s.rij||{};
  s.st=st;s.cap=st==="time"&&blk.timecap_seconds?blk.timecap_seconds:0;s.capRondes=blk.cap_score_type==="rounds_reps";
  const getal=v=>v==null?"":String(v).replace(".",",");
  let velden="";
  if(st==="time"){
    velden='<div class="field" id="lvbsc-tijdveld"><label>Tijd (mm:ss)</label><input id="lvbsc-tijd" inputmode="numeric" placeholder="bijv. 7:42" value="'+(r.time_seconds!=null?Math.floor(r.time_seconds/60)+":"+pad(r.time_seconds%60):"")+'"></div>'+
      (s.cap?'<label class="lvb-vink"><input type="checkbox" id="lvbsc-cap" '+(r.capped?"checked":"")+' onchange="lvbScoreCap()"> Tijdslimiet ('+secNaarTijd(s.cap)+') niet gehaald</label>'+
        '<div id="lvbsc-capveld" style="display:flex;gap:10px;flex-wrap:wrap">'+(s.capRondes?'<div class="field" style="flex:1;min-width:120px"><label>Rondes</label><input id="lvbsc-rondes" inputmode="numeric" value="'+getal(r.capped?r.rounds:null)+'"></div>':'')+
        '<div class="field" style="flex:1;min-width:120px"><label>Reps binnen de tijd</label><input id="lvbsc-reps" inputmode="numeric" value="'+getal(r.capped?r.reps:null)+'"></div></div>':'');
  }else if(st==="rounds_reps"){
    velden='<div style="display:flex;gap:10px;flex-wrap:wrap"><div class="field" style="flex:1;min-width:120px"><label>Rondes</label><input id="lvbsc-rondes" inputmode="numeric" value="'+getal(r.rounds)+'"></div>'+
      '<div class="field" style="flex:1;min-width:120px"><label>Reps</label><input id="lvbsc-reps" inputmode="numeric" value="'+getal(r.reps)+'"></div></div>';
  }else if(st==="reps"){velden='<div class="field"><label>Reps</label><input id="lvbsc-reps" inputmode="numeric" value="'+getal(r.reps)+'"></div>';}
  else if(st==="load"){velden='<div class="field"><label>Gewicht (kg)</label><input id="lvbsc-kg" inputmode="decimal" value="'+getal(r.load_kg)+'"></div>';}
  else if(scoreIsGetal(st)){velden='<div class="field"><label>Score ('+esc(SCORE_EENHEID[st])+')</label><input id="lvbsc-waarde" inputmode="decimal" value="'+getal(r.score_value)+'"></div>';}
  else{velden='<div class="field"><label>Score</label><input id="lvbsc-tekst" value="'+esc(r.score_text||"")+'"></div>';}
  const gast=s.vast&&!s.athlete;
  document.getElementById("lvbsc-kop").textContent=s.vast?"Score aanpassen":"Score toevoegen";
  document.getElementById("lvbsc-body").innerHTML=
    (s.vast?'<div class="field"><label>Naam</label><div><b>'+esc(s.naam||"")+'</b>'+(gast?' <span class="cpill gray">losse naam</span>':'')+'</div></div>'
      :'<div class="field"><label>Naam</label><input id="lvbsc-naam" autocomplete="off" placeholder="Typ een naam" oninput="lvbNaamZoek(this.value)"><div id="lvbsc-hits"></div>'+
        '<div class="sm muted" id="lvbsc-naamhint" style="margin-top:5px">Staat de persoon in het lijstje, tik hem dan aan: de score komt op zijn of haar naam. Anders blijft het een losse naam, alleen voor dit leaderboard.</div></div>')+
    '<div style="display:flex;gap:10px;flex-wrap:wrap">'+
      ((s.vast&&s.athlete)?'':'<div class="field" id="lvbsc-gveld" style="flex:1;min-width:140px"><label>Man of vrouw</label><select id="lvbsc-gender">'+selOpts([["","Niet ingevuld"],["man","Man"],["vrouw","Vrouw"]],gast?(r.gender||""):"")+'</select></div>')+
      '<div class="field" style="flex:1;min-width:140px"><label>Rx of Scaled</label><select id="lvbsc-rx">'+selOpts([["rx","Rx"],["scaled","Scaled"]],r.rx==="scaled"?"scaled":"rx")+'</select></div></div>'+
    velden;
  document.getElementById("lvbsc-msg").textContent="";
  LVB.hits=[];
  document.getElementById("lvbscmodal").classList.add("show");
  lvbScoreCap();
  const eerste=document.getElementById(s.vast?(st==="time"?"lvbsc-tijd":"lvbsc-reps"):"lvbsc-naam");if(eerste)eerste.focus();
}
function lvbScoreCap(){
  const c=document.getElementById("lvbsc-cap"),v=document.getElementById("lvbsc-capveld"),t=document.getElementById("lvbsc-tijdveld");
  if(!v)return;
  v.style.display=c&&c.checked?"flex":"none";if(t)t.style.display=c&&c.checked?"none":"";
}
// Namen zoeken terwijl de coach typt. Een antwoord op een oudere zoekvraag wordt genegeerd.
let LVB_ZOEKKLOK=null;
function lvbNaamZoek(v){
  const s=LVB.score;if(!s||s.vast)return;
  clearTimeout(LVB_ZOEKKLOK);
  const z=String(v||"").trim(),nr=++LVB.zoekNr;
  if(z.length<2){LVB.hits=[];lvbNaamHits();return;}
  LVB_ZOEKKLOK=setTimeout(async()=>{
    const{data}=await db.rpc("live_bord_namen",{p_bord:LVB.cur.id,p_q:z});
    if(nr!==LVB.zoekNr||!LVB.score||LVB.score.athlete)return;
    LVB.hits=data||[];lvbNaamHits();
  },220);
}
function lvbNaamHits(){
  const host=document.getElementById("lvbsc-hits");if(!host)return;
  host.innerHTML=(LVB.hits||[]).map((p,i)=>'<button class="lvb-hit" onclick="lvbNaamKies('+i+')"><b>'+esc([p.first_name,p.last_name].filter(Boolean).join(" "))+'</b>'+(p.coach?'<span class="sm muted"> · coach '+esc(p.coach)+'</span>':'')+'</button>').join("");
}
function lvbNaamKies(i){
  const p=(LVB.hits||[])[i],s=LVB.score;if(!p||!s)return;
  s.athlete={id:p.id,naam:[p.first_name,p.last_name].filter(Boolean).join(" ")};LVB.hits=[];
  const inp=document.getElementById("lvbsc-naam");if(inp){inp.value=s.athlete.naam;inp.readOnly=true;}
  document.getElementById("lvbsc-hits").innerHTML='<div class="lvb-gekozen">Gekoppeld aan <b>'+esc(s.athlete.naam)+'</b>'+(p.coach?' (coach '+esc(p.coach)+')':'')+' <button class="btn ghost sm" onclick="lvbNaamLos()">Andere naam</button></div>';
  const g=document.getElementById("lvbsc-gveld");if(g)g.style.display="none";
  const h=document.getElementById("lvbsc-naamhint");if(h)h.style.display="none";
}
function lvbNaamLos(){
  const s=LVB.score;if(!s)return;s.athlete=null;
  const inp=document.getElementById("lvbsc-naam");if(inp){inp.readOnly=false;inp.value="";inp.focus();}
  document.getElementById("lvbsc-hits").innerHTML="";
  const g=document.getElementById("lvbsc-gveld");if(g)g.style.display="";
  const h=document.getElementById("lvbsc-naamhint");if(h)h.style.display="";
}
// "7:42" of "1:02:03" naar seconden; iets anders is ongeldig (null).
function lvbTijd(v){
  const m=/^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(String(v||"").trim());if(!m)return null;
  return (Number(m[1]||0)*3600)+Number(m[2])*60+Number(m[3]);
}
async function lvbScoreOpslaan(){
  const s=LVB.score;if(!s)return;
  const el=id=>document.getElementById(id),msg=t=>{el("lvbsc-msg").textContent=t;};
  const heel=id=>{const v=el(id)?el(id).value.trim():"";return /^\d+$/.test(v)?Number(v):null;};
  const kom=id=>{const v=el(id)?el(id).value.trim().replace(",","."):"";return /^\d+(\.\d+)?$/.test(v)?Number(v):null;};
  const naam=s.vast?(s.naam||""):el("lvbsc-naam").value.trim().replace(/\s+/g," ");
  if(!s.athlete&&!naam){msg("Vul een naam in.");return;}
  const sc={rx:el("lvbsc-rx").value,capped:false},st=s.st;
  if(st==="time"){
    if(el("lvbsc-cap")&&el("lvbsc-cap").checked){
      sc.capped=true;sc.reps=heel("lvbsc-reps");if(s.capRondes)sc.rounds=heel("lvbsc-rondes");
      if(sc.reps==null&&sc.rounds==null){msg("Vul in hoeveel reps binnen de tijd zijn gehaald.");return;}
    }else{sc.time_seconds=lvbTijd(el("lvbsc-tijd").value);if(sc.time_seconds==null){msg("Vul de tijd in als minuten:seconden, bijvoorbeeld 7:42.");return;}}
  }else if(st==="rounds_reps"){sc.rounds=heel("lvbsc-rondes");sc.reps=heel("lvbsc-reps")||0;if(sc.rounds==null){msg("Vul het aantal rondes in.");return;}}
  else if(st==="reps"){sc.reps=heel("lvbsc-reps");if(sc.reps==null){msg("Vul het aantal reps in.");return;}}
  else if(st==="load"){sc.load_kg=kom("lvbsc-kg");if(sc.load_kg==null){msg("Vul het gewicht in kilo's in.");return;}}
  else if(scoreIsGetal(st)){sc.score_value=kom("lvbsc-waarde");if(sc.score_value==null){msg("Vul de score in als getal.");return;}}
  else{sc.score_text=el("lvbsc-tekst").value.trim();if(!sc.score_text){msg("Vul de score in.");return;}}
  // Een losse naam die precies gelijk is aan iemand in het lijstje: bijna altijd vergeten aan te tikken.
  if(!s.vast&&!s.athlete){
    const zelfde=(LVB.hits||[]).find(p=>[p.first_name,p.last_name].filter(Boolean).join(" ").toLowerCase()===naam.toLowerCase());
    if(zelfde&&!confirm(naam+" staat ook in het systeem. Kies Annuleren en tik de naam in het lijstje aan om de score te koppelen, of OK om hem als losse naam op te slaan."))return;
  }
  const knop=el("lvbsc-ok");knop.disabled=true;
  const{error}=await db.rpc("live_bord_score",{p_bord:LVB.cur.id,p_onderdeel:s.ond,p_athlete:s.athlete?s.athlete.id:null,p_naam:s.athlete?null:naam,
    p_gender:s.athlete?null:((el("lvbsc-gender")&&el("lvbsc-gender").value)||null),p_score:sc});
  knop.disabled=false;
  if(error){msg(error.message||"Opslaan mislukt.");return;}
  lvbDicht("lvbscmodal");toast("Score staat op het bord");lvbScoresLaad();
}
async function lvbScoreWeg(rid){
  const r=(LVB.rows||[]).find(x=>x.result_id===rid);if(!r)return;
  const naam=[r.first_name,r.last_name].filter(Boolean).join(" ")||"deze persoon";
  if(!confirm("De score van "+naam+" van het bord halen?"))return;
  const{error}=await db.rpc("live_bord_score_weg",{p_bord:LVB.cur.id,p_result:rid});
  if(error){toast(error.message||"Weghalen mislukt",5000);return;}
  toast("Score weggehaald");lvbScoresLaad();
}
