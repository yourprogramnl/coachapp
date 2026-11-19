// app/weekworkout.js — de Weekworkout-sectie: alle weekworkouts (audience='blog')
// als kaarten onder elkaar (nieuwste boven), met zoeken op naam of datum en per
// workout een uitklapbaar gedeeld leaderboard. Openbare scores komen via de
// SECURITY DEFINER-RPC blog_leaderboard (leden/coaches mogen elkaars profielen
// niet rechtstreeks lezen); fist-bumps en reacties schrijven direct, RLS bewaakt.
//
// Bouwer (19 nov 2026, verzoek Michel, naar de "YP showdown builder" in Strivee): een
// tweede weergave met alle Showdowns naast elkaar. Een Showdown die nog niet gepland is
// staat als concept (workouts.audience='blog_concept'): geen enkele leesregel, lijst of
// mail kijkt naar die waarde, dus leden zien hem nergens. "Kies showdown" zet een concept
// live: audience wordt 'blog' met de gekozen datum.
let WW={list:[],concepten:[],boards:{},open:{},zoek:"",comFor:null,comments:[],view:"lijst"};
try{if(localStorage.getItem("forge_ww_view")==="bouwer")WW.view="bouwer";}catch(e){}
const WW_CONCEPT="blog_concept";

async function fillWeekworkout(){
  // Alleen losse weekworkouts; programmering van blogprogramma's (blog_program_id) hoort in de Blog-sectie.
  const basis=(aud,velden)=>db.from("workouts").select("id,title,workout_date,coach_id,created_at,audience, blocks(*)"+(velden||"")).eq("company_id",ME.profile.company_id).eq("audience",aud).is("blog_program_id",null);
  // results(count) = aantal gelogde scores per Showdown (voor de bouwer); lukt dat niet, dan zonder.
  const live=aantal=>basis("blog",aantal?", results(count)":"").order("workout_date",{ascending:false}).limit(150);
  let[lijst,con]=await Promise.all([live(true),basis(WW_CONCEPT).order("created_at",{ascending:false}).limit(100)]);
  if(lijst.error)lijst=await live(false);
  WW.list=lijst.data||[];WW.concepten=con.data||[];
  // De nieuwste staat standaard open (dat is "de workout van de week"); de rest klap je uit.
  if(WW.list.length&&!Object.keys(WW.open).length)WW.open[WW.list[0].id]=true;
  await Promise.all(WW.list.filter(w=>WW.open[w.id]).map(w=>wwLoadBoardFor(w.id)));
  ensureWwModals();wwRender();
}
async function wwLoadBoardFor(id){
  const{data,error}=await db.rpc("blog_leaderboard",{p_workout_id:id});
  if(error){toast(error.message||"Leaderboard laden mislukt");WW.boards[id]=[];return;}
  WW.boards[id]=data||[];
}
function wwMainBlock(w){return ((w&&w.blocks)||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0))[0]||null;}
// Huisnaam van de weekworkout: nieuwe workouts heten standaard "YP Showdown <datum>"
// (aanpasbaar in het naamveld; later evt. per bedrijf instelbaar).
const WW_NAAM_PREFIX="YP Showdown";
function wwStandaardNaam(){const d=new Date();return WW_NAAM_PREFIX+" "+d.getDate()+" "+MAANDVOL[d.getMonth()];}
const WW_SCORES=[["time","tijd (For Time)"],["rounds_reps","rondes + reps (AMRAP)"],["reps","reps"],["load","gewicht (kg)"],["calories","calorieën"],["meters","meters"],["km","kilometers"],["cm","centimeters"],["watt","watt"],["rpm","rpm"],["bpm","bpm"],["spm","spm"],["text","vrije tekst"]];

const wwIsConcept=w=>!!w&&w.audience===WW_CONCEPT;
const wwVind=id=>WW.list.find(x=>x.id===id)||WW.concepten.find(x=>x.id===id)||null;
const wwMagBeheren=w=>ME.user.id===w.coach_id||["eigenaar","platform_admin"].includes((ME.profile||{}).role);
function wwTekst(w){const b=wwMainBlock(w);return b?(composePresc(b)||""):"";}
// Zoeken: in de lijst op naam of datum; in de bouwer ook in de workout-tekst, zodat je
// ziet hoe vaak een beweging al terugkwam (bijv. "sandbag").
function wwMatch(w,metTekst){
  const z=WW.zoek;if(!z)return true;
  if((w.title||"").toLowerCase().includes(z))return true;
  if(!wwIsConcept(w)&&((w.workout_date||"").includes(z)||datumNL(w.workout_date).toLowerCase().includes(z)))return true;
  return !!metTekst&&wwTekst(w).toLowerCase().includes(z);
}
function wwRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const bouwer=WW.view==="bouwer",nc=WW.concepten.length,iets=WW.list.length||nc;
  cp.innerHTML='<div class="lbwrap'+(bouwer?' sdb-breed':'')+'">'+
    '<div class="sdb-kop"><h1>'+esc(SHOWDOWN)+'</h1>'+
      '<div class="seg"><button class="'+(bouwer?'':'on')+'" onclick="wwView(\'lijst\')">Lijst</button><button class="'+(bouwer?'on':'')+'" onclick="wwView(\'bouwer\')">Bouwer</button></div></div>'+
    '<div class="sdb-knoppen"><button class="btn" onclick="wwBewerk(null)">+ Nieuwe '+esc(SHOWDOWN)+'</button>'+
      '<button class="btn ghost" onclick="wwKies()">Kies showdown'+(nc?' <b class="sdb-tel">'+nc+'</b>':'')+'</button></div>'+
    (iets?'<div style="margin:12px 0 14px"><input class="lid-in" id="ww-zoek" placeholder="'+(bouwer?"Zoek op naam, datum of beweging (bijv. sandbag)…":"Zoek op naam of datum (bijv. 15 juli)…")+'" style="width:100%;max-width:340px" oninput="wwZoek(this.value)" value="'+esc(WW.zoek)+'"></div>':'')+
    '<div id="ww-cards">'+(bouwer?wwBouwerHtml():wwCardsHtml())+'</div>'+
    (WW.list.length&&!bouwer?'<div class="sm muted" style="margin-top:16px">Eén gedeeld leaderboard voor 1-op-1 klanten én gratis blog-leden. Alleen scores die een lid op "openbaar" zet staan erop; privé-scores ziet alleen de eigen coach.</div>':'')+
  '</div>';
}
function wwView(v){
  WW.view=v==="bouwer"?"bouwer":"lijst";
  try{localStorage.setItem("forge_ww_view",WW.view);}catch(e){}
  wwRender();
}
function wwZoek(v){WW.zoek=(v||"").toLowerCase().trim();const h=document.getElementById("ww-cards");if(h)h.innerHTML=WW.view==="bouwer"?wwBouwerHtml():wwCardsHtml();}
function wwCardsHtml(){
  if(!WW.list.length)return '<div class="card" style="padding:26px;text-align:center"><div class="muted" style="margin-bottom:12px">Nog geen '+esc(SHOWDOWN)+'. Maak de eerste aan; 1-op-1 klanten én blog-leden loggen hun score en komen samen op één leaderboard.</div><button class="btn" onclick="wwBewerk(null)">+ Nieuwe '+esc(SHOWDOWN)+'</button></div>';
  const hits=WW.list.filter(w=>wwMatch(w,false));
  return hits.map(wwCard).join("")||'<div class="cempty">Geen weekworkout gevonden voor deze zoekopdracht.</div>';
}

// ---------- Bouwer: alle Showdowns naast elkaar ----------
function wwBouwerHtml(){
  const con=WW.concepten.filter(w=>wwMatch(w,true)),live=WW.list.filter(w=>wwMatch(w,true));
  const tel=(n,totaal)=>'<span>'+(WW.zoek?n+" van "+totaal:totaal)+'</span>';
  return '<div class="sdb-sec"><h2>Concepten '+tel(con.length,WW.concepten.length)+'</h2><div class="sm muted">Leden zien een concept niet. Met Kies showdown zet je er één live.</div></div>'+
    '<div class="sdb-grid">'+(WW.zoek?'':'<button class="sdb-nieuw" onclick="wwBewerk(null,true)">+ Nieuw concept</button>')+con.map(wwBouwKaart).join("")+'</div>'+
    (WW.zoek&&!con.length?'<div class="sm muted">Geen concept gevonden voor deze zoekopdracht.</div>':'')+
    '<div class="sdb-sec"><h2>Live '+tel(live.length,WW.list.length)+'</h2><div class="sm muted">Wat leden al kregen, nieuwste eerst.</div></div>'+
    (live.length?'<div class="sdb-grid">'+live.map(wwBouwKaart).join("")+'</div>':'<div class="sm muted">'+(WW.zoek?"Geen Showdown gevonden voor deze zoekopdracht.":"Nog geen Showdown live.")+'</div>');
}
function wwAantalScores(w){const r=w&&w.results;return Array.isArray(r)&&r[0]&&r[0].count!=null?Number(r[0].count):null;}
function wwBouwKaart(w){
  const blk=wwMainBlock(w),concept=wwIsConcept(w),mag=wwMagBeheren(w);
  const tekst=esc(wwTekst(w)).replace(/\n/g,"<br>");
  const soort=blk?((WW_SCORES.find(s=>s[0]===blk.score_type)||[])[1]||""):"";
  const cap=blk&&blk.score_type==="time"&&blk.timecap_seconds?secNaarTijd(blk.timecap_seconds):"";
  const n=wwAantalScores(w);
  return '<div class="sdb-card'+(concept?' concept':'')+'">'+
    '<div class="sdb-titel">'+esc(w.title||SHOWDOWN)+'</div>'+
    '<div class="sdb-sub">'+(concept?'<span class="conceptpill">Concept</span>':esc(datumNL(w.workout_date)))+'</div>'+
    '<div class="sdb-tekst">'+(tekst||'<span class="muted">Nog geen tekst.</span>')+'</div>'+
    ((soort||cap)?'<div class="sdb-pills">'+(soort?'<span class="cpill purple">'+esc(soort)+'</span>':'')+(cap?'<span class="cpill gray">timecap '+esc(cap)+'</span>':'')+'</div>':'')+
    '<div class="sdb-acties">'+
      (concept?(mag?'<button class="btn sm" onclick="wwKies(\''+w.id+'\')">Zet live</button>':''):'<button class="btn ghost sm" onclick="wwNaarBord(\''+w.id+'\')">Leaderboard'+(n!=null?' · '+n:'')+'</button>')+
      (mag?'<button class="btn ghost sm" onclick="wwBewerk(\''+w.id+'\')">Bewerken</button>':'')+
      (concept&&mag?'<button class="sdb-x" title="Concept verwijderen" onclick="wwVerwijder(\''+w.id+'\')">×</button>':'')+
    '</div></div>';
}
// Vanuit de bouwer naar het leaderboard: terug naar de lijst, met dit bord open en in beeld.
async function wwNaarBord(id){
  WW.view="lijst";try{localStorage.setItem("forge_ww_view","lijst");}catch(e){}
  WW.zoek="";WW.open[id]=true;
  if(!WW.boards[id])await wwLoadBoardFor(id);
  wwRender();
  const el=document.getElementById("ww-kaart-"+id);if(el)el.scrollIntoView({block:"start"});
}
function wwCard(w){
  const blk=wwMainBlock(w);
  const tekst=blk?esc(composePresc(blk)||"").replace(/\n/g,"<br>"):"";
  const rows=WW.boards[w.id];
  const open=!!WW.open[w.id];
  const magBeheren=wwMagBeheren(w);
  const deelnemers=rows?new Set(rows.map(r=>r.athlete_id)).size:null;
  return '<div class="lbhead" id="ww-kaart-'+w.id+'" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">'+
    '<div><h2 style="font-size:19px">'+esc(w.title||"Weekworkout")+'</h2>'+
    (tekst?'<div class="muted" style="margin-top:6px;font-size:13px;line-height:1.55">'+tekst+'</div>':'')+
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
      '<span class="cpill teal">gratis voor iedereen</span>'+
      (deelnemers!=null?'<span class="cpill ok">'+deelnemers+" deelnemer"+(deelnemers===1?"":"s")+'</span>':'')+
      '<span class="cpill gray">gepubliceerd '+datumNL(w.workout_date)+'</span></div></div>'+
    '<div style="text-align:right;display:flex;flex-direction:column;gap:8px;align-items:flex-end">'+
      '<button class="btn ghost sm2" onclick="wwDeelLink()"><svg class="i sm-i"><use href="#i-link"/></svg> Deel-link kopiëren</button>'+
      (magBeheren?'<div style="display:flex;gap:8px"><button class="btn ghost sm2" onclick="wwBewerk(\''+w.id+'\')">Bewerken</button><button class="btn ghost sm2" style="color:#e5484d;border-color:#f3b8ba" onclick="wwVerwijder(\''+w.id+'\')">Verwijderen</button></div>':'')+
    '</div></div>'+
    '<div style="margin-top:14px"><button class="btn ghost sm2" onclick="wwToggleBoard(\''+w.id+'\')">'+(open?"Leaderboard verbergen":"Leaderboard")+'</button></div>'+
    '<div id="ww-board-'+w.id+'" style="margin-top:12px'+(open?"":";display:none")+'">'+(open?wwBoardInner(w.id):"")+'</div>'+
  '</div>';
}
async function wwToggleBoard(id){
  WW.open[id]=!WW.open[id];
  if(WW.open[id]&&!WW.boards[id]){
    const el=document.getElementById("ww-board-"+id);
    if(el){el.style.display="";el.innerHTML='<div class="cempty">Leaderboard laden…</div>';}
    await wwLoadBoardFor(id);
  }
  const h=document.getElementById("ww-cards");if(h&&WW.view!=="bouwer")h.innerHTML=wwCardsHtml();
}
// Sortering volgt het scoretype van het hoofdblok.
function wwCmp(st){
  const n=(v,d)=>v==null?d:Number(v);
  return (a,b)=>{
    // Tijd met timecap: finishers eerst (snelste boven), daarna wie gecapt is
    // op rondes/reps (meeste boven).
    if(st==="time"){
      const ca=a.capped?1:0,cb=b.capped?1:0;if(ca!==cb)return ca-cb;
      if(ca)return (n(b.rounds,-1)-n(a.rounds,-1))||(n(b.reps,-1)-n(a.reps,-1));
      return n(a.time_seconds,1e15)-n(b.time_seconds,1e15);
    }
    if(st==="load")return n(b.load_kg,-1)-n(a.load_kg,-1);
    if(st==="reps")return n(b.reps,-1)-n(a.reps,-1);
    if(st==="rounds_reps")return (n(b.rounds,-1)-n(a.rounds,-1))||(n(b.reps,-1)-n(a.reps,-1));
    if(scoreIsGetal(st))return n(b.score_value,-1e9)-n(a.score_value,-1e9); // calorieën, meters, watt…: hoger = beter
    return new Date(a.created_at)-new Date(b.created_at);
  };
}
function wwBoardInner(id,hostId){
  const w=WW.list.find(x=>x.id===id)||(WW_VENSTER&&WW_VENSTER.id===id?WW_VENSTER:null),rows=WW.boards[id]||[];
  if(!rows.length)return '<div class="card" style="padding:22px;text-align:center"><span class="muted">Nog geen openbare scores. Zodra leden hun score loggen en op "openbaar" zetten, verschijnen ze hier.</span></div>';
  if(!w)return "";
  const st=(wwMainBlock(w)||{}).score_type||"text";
  const cats=[["man","Mannen"],["vrouw","Vrouwen"],["overig","Overig"]];
  let html='<div class="lb-alle">'+wwNotitiesKnop(hostId||("ww-board-"+id),rows)+'</div>';
  cats.forEach(cat=>{
    ["rx","scaled"].forEach(rx=>{
      const groep=rows.filter(r=>{
        const g=(r.gender==="man"||r.gender==="vrouw")?r.gender:"overig";
        const rrx=r.rx==="scaled"?"scaled":"rx";
        return g===cat[0]&&rrx===rx;
      }).sort(wwCmp(st));
      if(!groep.length)return;
      html+='<div class="lbcat" style="margin-top:12px">'+cat[1]+' / '+(rx==="rx"?'<span>Rx</span>':'<span style="color:var(--purple)">Scaled</span>')+'</div>'+
        '<div class="card">'+groep.map((r,i)=>wwRij(r,i+1,st)).join("")+'</div>';
    });
  });
  return html;
}
// Het leaderboard van één Showdown in een los venster, vanaf elke plek in de app (de bouwer bij
// een klant gebruikt dit voor een ingevoegde Showdown). Zelfde regels, fist bumps en reacties
// als op het Showdown-scherm; wwRefreshBoard ververst het venster mee.
let WW_VENSTER=null;
async function wwBordVenster(id){
  ensureWwModals();
  let w=wwVind(id);
  if(!w){
    const{data,error}=await db.from("workouts").select("id,title,workout_date,coach_id,created_at,audience, blocks(*)").eq("id",id).maybeSingle();
    if(error||!data){toast("Deze "+SHOWDOWN+" is niet meer te vinden");return;}
    w=data;
  }
  WW_VENSTER=w;
  const bord=w.audience==="bord";
  document.getElementById("wwbord-titel").textContent=bord?(w.title||"Leaderboard-workout"):(w.title||SHOWDOWN)+" · "+datumNL(w.workout_date);
  document.getElementById("wwbord-hint").textContent=bord?"Gedeeld leaderboard van de klanten bij wie deze workout in de kalender staat. Een klant met het vinkje Scaled-versie staat onder Scaled.":"Eén gedeeld leaderboard voor 1-op-1 klanten én gratis blog-leden. Een klant met het vinkje Scaled-versie staat onder Scaled.";
  const body=document.getElementById("wwbord-body");
  body.innerHTML='<div class="cempty">Leaderboard laden…</div>';
  document.getElementById("wwbordmodal").classList.add("show");
  await wwLoadBoardFor(id);
  if(!WW_VENSTER||WW_VENSTER.id!==id)return; // intussen gesloten of een ander bord geopend
  body.innerHTML=wwBoardInner(id,"wwbord-body");
}
function wwBordVensterDicht(){document.getElementById("wwbordmodal").classList.remove("show");document.getElementById("wwbord-body").innerHTML="";WW_VENSTER=null;}
// Eén regel op een leaderboard (Showdown én blogprogramma's). De score staat vooraan;
// de notitie van de sporter is dicht tot je op de naam klikt (verzoek Stefan 22 okt:
// "scores wil ik zien, wat ze typen is alleen handig als ik het wil uitklappen").
let LB_OPEN=new Set(); // result_id's waarvan de notitie open staat
function wwRij(r,rank,st){
  const p={first_name:r.first_name,last_name:r.last_name,avatar_url:r.avatar_url,email:""};
  const score=(r.capped?"CAP · ":"")+(resultScoreTxt(r,st)||"–"); // gecapt: reps/rondes binnen de timecap
  const lid=r.membership_type==="one_on_one"?"1-op-1 klant":(r.membership_type==="free_blog"?"blog-lid":"");
  const rest=[lid,(r.media_url?"video":"")].filter(Boolean).join(" · ");
  const open=LB_OPEN.has(r.result_id);
  const tag=r.rx==="scaled"?'<span class="rxtag sc">SC</span>':'<span class="rxtag">RX</span>';
  return '<div class="lbrow'+(open?" open":"")+'" id="lbrow-'+esc(r.result_id)+'"><span class="rank">'+rank+'</span>'+
    '<div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
    '<div style="min-width:0;flex:1"><div class="lbnm"><button class="lbnaam" title="'+(r.note?"Notitie van de sporter tonen":"Geen notitie")+'" onclick="wwRijToggle(\''+esc(r.result_id)+'\')">'+naamVan(p)+'</button> '+tag+(r.note?' <span class="lbnote-dot" title="Heeft een notitie">✎</span>':'')+'</div>'+
    '<div class="lbsc"><b class="lbscore">'+esc(score)+'</b>'+(rest?' · '+esc(rest):'')+'</div>'+
    '<div class="lbdetail"'+(open?'':' style="display:none"')+'>'+(r.note?'<div class="lbnote">'+esc(r.note)+'</div>':'<div class="muted">Geen notitie ingevuld.</div>')+
      '<div class="sm muted" style="margin-top:4px">Gelogd op '+esc(datumNL(r.created_at))+'</div></div></div>'+
    '<div class="fist">'+
      '<button class="fb wwlike'+(r.liked_by_me?" aan":"")+'" title="Goed gedaan!" onclick="wwLike(\''+r.result_id+'\','+(r.liked_by_me?"true":"false")+')"><svg class="i"><use href="#i-fist"/></svg>'+r.likes+'</button>'+
      '<button class="fb wwcom" title="Reacties" onclick="wwComments(\''+r.result_id+'\')"><svg class="i"><use href="#i-chat"/></svg>'+r.comments+'</button>'+
    '</div></div>';
}
function wwRijToggle(id){
  if(LB_OPEN.has(id))LB_OPEN.delete(id);else LB_OPEN.add(id);
  const row=document.getElementById("lbrow-"+id);if(!row)return;
  const aan=LB_OPEN.has(id);
  const d=row.querySelector(".lbdetail");if(d)d.style.display=aan?"":"none";
  row.classList.toggle("open",aan);
}
// Knop om alle notities op een bord in één keer open of dicht te zetten (verzoek
// Stefan 22 okt: "dan kan ik kiezen of ik ze per één doe, niet doe of alles in één keer").
// Alleen regels mét notitie gaan open; de knop staat alleen als er notities zijn.
function wwNotitiesKnop(hostId,rows){
  const met=(rows||[]).filter(r=>r.note);
  if(!met.length)return "";
  const alOpen=met.every(r=>LB_OPEN.has(r.result_id));
  return '<button class="btn ghost sm lb-allebtn" onclick="wwNotitiesAlle(\''+hostId+'\',this)">'+(alOpen?"Alle notities sluiten":"Alle notities openen")+'</button>';
}
function wwNotitiesAlle(hostId,knop){
  const host=document.getElementById(hostId);if(!host)return;
  const rijen=[...host.querySelectorAll(".lbrow")].filter(r=>r.querySelector(".lbnote"));
  const aan=rijen.some(r=>!r.classList.contains("open"));
  rijen.forEach(r=>{
    const id=r.id.replace("lbrow-","");
    if(aan)LB_OPEN.add(id);else LB_OPEN.delete(id);
    const d=r.querySelector(".lbdetail");if(d)d.style.display=aan?"":"none";
    r.classList.toggle("open",aan);
  });
  if(knop)knop.textContent=aan?"Alle notities sluiten":"Alle notities openen";
}
// Bij welke workout hoort dit result? (nodig om het juiste bord te verversen)
function wwFindWid(resultId){
  for(const wid in WW.boards){if((WW.boards[wid]||[]).some(r=>r.result_id===resultId))return wid;}
  return null;
}
function wwFindRow(resultId){
  for(const wid in WW.boards){const r=(WW.boards[wid]||[]).find(x=>x.result_id===resultId);if(r)return r;}
  return null;
}
async function wwRefreshBoard(wid){
  if(!wid)return;
  if(typeof blogBoardRefresh==="function"&&blogBoardRefresh(wid))return; // bord van een blogworkout (blog.js)
  await wwLoadBoardFor(wid);
  const el=document.getElementById("ww-board-"+wid);
  if(el)el.innerHTML=wwBoardInner(wid);
  // Staat dit bord ook open in het losse venster (bouwer bij een klant)? Dan dat ook verversen.
  if(WW_VENSTER&&WW_VENSTER.id===wid){const b=document.getElementById("wwbord-body");if(b)b.innerHTML=wwBoardInner(wid,"wwbord-body");}
}
async function wwLike(resultId,liked){
  const wid=wwFindWid(resultId);
  if(liked){
    const{error}=await db.from("result_likes").delete().eq("result_id",resultId).eq("profile_id",ME.user.id);
    if(error){toast(error.message||"Mislukt");return;}
  }else{
    const{error}=await db.from("result_likes").insert({result_id:resultId,profile_id:ME.user.id});
    if(error){toast(error.message||"Mislukt");return;}
  }
  await wwRefreshBoard(wid);
}
function wwDeelLink(){
  const url=location.origin+location.pathname+"#week";
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(()=>toast("Deel-link gekopieerd"),()=>toast(url));
  else toast(url);
}

// ---------- Reacties op een score ----------
async function wwComments(resultId){
  WW.comFor=resultId;
  const r=wwFindRow(resultId);
  document.getElementById("wwcom-titel").innerHTML=r?('Reacties op '+naamVan({first_name:r.first_name,last_name:r.last_name,email:""})+' <span class="muted" style="font-weight:400;font-size:12.5px">· '+esc(resultScoreTxt(r)||"")+'</span>'):"Reacties";
  document.getElementById("wwcom-lijst").innerHTML='<div class="cempty">Laden…</div>';
  document.getElementById("wwcom-input").value="";
  document.getElementById("wwcommodal").classList.add("show");
  await wwComLaad();
}
async function wwComLaad(){
  const{data,error}=await db.rpc("blog_comments",{p_result_id:WW.comFor});
  WW.comments=data||[];
  const host=document.getElementById("wwcom-lijst");
  if(error){host.innerHTML='<div class="cempty">Reacties laden mislukt.</div>';return;}
  host.innerHTML=WW.comments.length?WW.comments.map(c=>{
    const p={first_name:c.first_name,last_name:c.last_name,avatar_url:c.avatar_url,email:""};
    const eigen=c.author_id===ME.user.id;
    return '<div style="display:flex;gap:9px;padding:8px 2px;align-items:flex-start">'+
      '<div class="cavc" style="width:26px;height:26px;font-size:9px;flex:none;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div style="flex:1"><div style="font-size:12px"><b>'+naamVan(p)+'</b> <span class="muted" style="font-size:11px">'+(c.created_at?datumNL(c.created_at):"")+'</span></div>'+
      '<div style="font-size:12.5px;margin-top:1px">'+esc(c.body)+'</div></div>'+
      (eigen?'<span onclick="wwComDel(\''+c.id+'\')" style="cursor:pointer;color:#b3b9c2;font-size:15px;line-height:1" title="Verwijderen">×</span>':'')+
    '</div>';
  }).join(""):'<div class="cempty">Nog geen reacties. Wees de eerste!</div>';
}
async function wwComPost(){
  const inp=document.getElementById("wwcom-input");
  const body=(inp.value||"").trim();if(!body)return;
  const wid=wwFindWid(WW.comFor);
  const{error}=await db.from("result_comments").insert({result_id:WW.comFor,author_id:ME.user.id,body});
  if(error){toast(error.message||"Reactie plaatsen mislukt");return;}
  inp.value="";
  await wwComLaad();
  await wwRefreshBoard(wid);
}
async function wwComDel(id){
  if(!confirm("Deze reactie verwijderen?"))return;
  const wid=wwFindWid(WW.comFor);
  const{error}=await db.from("result_comments").delete().eq("id",id);
  if(error){toast(error.message||"Mislukt");return;}
  await wwComLaad();
  await wwRefreshBoard(wid);
}
function wwComDicht(){document.getElementById("wwcommodal").classList.remove("show");}

// ---------- Weekworkout aanmaken / bewerken ----------
let WW_EDIT=null,WW_EDIT_CONCEPT=false;
// Maandag (JJJJ-MM-DD) van de week waarin een datum valt.
function wwMaandag(iso){const d=new Date(iso+"T12:00:00");d.setDate(d.getDate()-((d.getDay()+6)%7));return ymd(d);}
// Datum uit een naam als "YP Showdown 27 november" of "YP showdown 29 mei 2026".
// Zonder jaartal: dit jaar, of volgend jaar als die dag al ruim voorbij is.
// Maandnamen in het Nederlands en het Engels: staat het dashboard op Engels, dan is MAANDVOL Engels
// ("November") en heet een nieuw concept ook zo.
const WW_MAANDEN=[["januari","january"],["februari","february"],["maart","march"],["april"],["mei","may"],["juni","june"],["juli","july"],["augustus","august"],["september"],["oktober","october"],["november"],["december"]];
function wwDatumUitNaam(naam){
  const m=String(naam||"").toLowerCase().match(/(\d{1,2})\s+([a-zé]+)(?:\s+(\d{4}))?/);if(!m)return null;
  const mnd=WW_MAANDEN.findIndex(l=>l.includes(m[2])),dag=parseInt(m[1],10);if(mnd<0||dag<1||dag>31)return null;
  const nu=new Date();let jaar=m[3]?parseInt(m[3],10):nu.getFullYear();
  let d=new Date(jaar,mnd,dag,12);
  if(!m[3]&&nu-d>120*864e5)d=new Date(++jaar,mnd,dag,12);
  return d.getMonth()===mnd?ymd(d):null;
}
// Voorstel voor de naam van een nieuw concept: de eerstvolgende vrijdag in een week
// waar nog geen Showdown of concept voor staat.
function wwConceptNaam(){
  const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+((5-d.getDay()+7)%7));
  const bezet=new Set(WW.list.map(w=>wwMaandag(w.workout_date)).concat(WW.concepten.map(w=>wwDatumUitNaam(w.title)).filter(Boolean).map(wwMaandag)));
  for(let i=0;i<104&&bezet.has(wwMaandag(ymd(d)));i++)d.setDate(d.getDate()+7);
  return WW_NAAM_PREFIX+" "+d.getDate()+" "+MAANDVOL[d.getMonth()];
}
function wwBewerk(id,concept){
  ensureWwModals();WW_EDIT=id||null;
  const w=id?wwVind(id):null;
  WW_EDIT_CONCEPT=w?wwIsConcept(w):!!concept;
  const blk=w?wwMainBlock(w):null;
  document.getElementById("wwmodal-titel").textContent=WW_EDIT_CONCEPT?(id?"Concept bewerken":"Nieuw concept"):(id?"Weekworkout bewerken":"Nieuwe weekworkout");
  document.getElementById("wwmodal-hint").textContent=WW_EDIT_CONCEPT?"Een concept zien leden niet. Zet hem later live met Kies showdown, of nu meteen met Opslaan en live zetten.":"De weekworkout staat na het opslaan direct live voor 1-op-1 klanten én blog-leden.";
  document.getElementById("ww-livebtn").style.display=WW_EDIT_CONCEPT&&(!w||wwMagBeheren(w))?"":"none";
  document.getElementById("ww-naam").value=w?(w.title||""):(WW_EDIT_CONCEPT?wwConceptNaam():wwStandaardNaam());
  document.getElementById("ww-score").value=(blk&&blk.score_type)||"time";
  document.getElementById("ww-cap").value=blk&&blk.timecap_seconds?secNaarTijd(blk.timecap_seconds):"";
  document.getElementById("ww-capst").value=(blk&&blk.cap_score_type)||"reps";
  wwCapToggle();
  document.getElementById("ww-tekst").value=blk?(blk.kind==="conditioning"?(blk.notes||""):(blk.prescription||"")):"";
  document.getElementById("wwmodal-msg").textContent="";
  document.getElementById("wwmodal").classList.add("show");
}
function wwModalDicht(){document.getElementById("wwmodal").classList.remove("show");WW_EDIT=null;}
function wwCapToggle(){const v=document.getElementById("ww-capveld"),s=document.getElementById("ww-score");if(v&&s)v.style.display=s.value==="time"?"":"none";}
// daarnaLive: een concept bewaren en meteen het venster Kies showdown erop openen (naam en datum
// nakijken, dan Zet live). Zo hoeft de coach een concept dat al af is niet apart op te zoeken.
async function wwOpslaan(daarnaLive){
  let klaarId=null;const alsConcept=WW_EDIT_CONCEPT;
  // Zonder bedrijf zou de workout onvindbaar zijn (alle lijsten filteren op bedrijf).
  if(!ME.profile.company_id){toast("Dit account is niet aan een bedrijf gekoppeld; de weekworkout zou onvindbaar worden. Log in met een account van het bedrijf.");return;}
  const naam=document.getElementById("ww-naam").value.trim();
  const score=document.getElementById("ww-score").value;
  const tekst=document.getElementById("ww-tekst").value.trim();
  const msg=document.getElementById("wwmodal-msg");
  if(!naam){msg.textContent="Geef de weekworkout een naam (bijv. "+wwStandaardNaam()+").";msg.className="msg err";return;}
  if(!tekst){msg.textContent="Vul de workout-tekst in (met Rx/Scaled-gewichten).";msg.className="msg err";return;}
  // Timecap (alleen bij tijd): wie de cap niet haalt logt reps of rondes+reps.
  const capTxt=document.getElementById("ww-cap").value.trim();
  const timecap_seconds=score==="time"&&capTxt?tijdNaarSec(capTxt):null;
  if(score==="time"&&capTxt&&!timecap_seconds){msg.textContent="Vul de timecap in als mm:ss (bijv. 20:00).";msg.className="msg err";return;}
  const cap_score_type=document.getElementById("ww-capst").value||"reps";
  if(WW_EDIT){
    const w=wwVind(WW_EDIT),blk=w?wwMainBlock(w):null;
    const{error}=await db.from("workouts").update({title:naam}).eq("id",WW_EDIT);
    if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
    if(blk){
      const{error:be}=await db.from("blocks").update({exercise:naam,notes:tekst,score_type:score,timecap_seconds,cap_score_type}).eq("id",blk.id);
      if(be){msg.textContent=be.message||"Opslaan mislukt";msg.className="msg err";return;}
    }else{
      const{error:be}=await db.from("blocks").insert({workout_id:WW_EDIT,kind:"conditioning",label:"A",exercise:naam,notes:tekst,sort:0,score_type:score,timecap_seconds,cap_score_type,color:"yellow"});
      if(be){msg.textContent=be.message||"Opslaan mislukt";msg.className="msg err";return;}
    }
    const wasConcept=WW_EDIT_CONCEPT;klaarId=WW_EDIT;
    wwModalDicht();toast(wasConcept?"Concept bijgewerkt":"Weekworkout bijgewerkt");
  }else{
    // Live: publicatiedatum = vandaag, de weekworkout staat direct live (de datum zit al in de naam).
    // Concept: staat alleen in de bouwer tot hij met Kies showdown een datum krijgt.
    const concept=WW_EDIT_CONCEPT;
    const{data:nw,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,workout_date:todayStr(),title:naam,audience:concept?WW_CONCEPT:"blog"}).select("id").single();
    if(error){msg.textContent=error.message||"Aanmaken mislukt";msg.className="msg err";return;}
    const{error:be}=await db.from("blocks").insert({workout_id:nw.id,kind:"conditioning",label:"A",exercise:naam,notes:tekst,sort:0,score_type:score,timecap_seconds,cap_score_type,color:"yellow"});
    if(be){msg.textContent=be.message||"Aanmaken mislukt";msg.className="msg err";return;}
    if(!concept){WW.open={};WW.open[nw.id]=true;}
    klaarId=nw.id;
    wwModalDicht();toast(concept?"Concept bewaard in de bouwer":"Weekworkout staat live");
  }
  await fillWeekworkout();
  if(daarnaLive&&alsConcept&&klaarId)wwKies(klaarId);
}
async function wwVerwijder(id){
  const concept=wwIsConcept(wwVind(id));
  const n=(WW.boards[id]||[]).length;
  if(!confirm(concept?"Dit concept verwijderen?":"Deze weekworkout verwijderen?"+(n?"\n\nAlle gelogde scores ("+n+" openbaar, plus eventuele privé-scores) gaan mee weg.":"\n\nEventueel gelogde scores gaan mee weg.")))return;
  const{error}=await db.from("workouts").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  delete WW.boards[id];delete WW.open[id];
  toast(concept?"Concept verwijderd":"Weekworkout verwijderd");
  await fillWeekworkout();
}

// ---------- Kies showdown: een concept uit de bouwer live zetten ----------
let WW_KIES=null;
function wwKies(id){
  ensureWwModals();
  const mijn=WW.concepten.filter(wwMagBeheren);
  WW_KIES=null;
  document.getElementById("wwkies-msg").textContent="";
  document.getElementById("wwkiesmodal").classList.add("show");
  if(id&&mijn.some(w=>w.id===id))wwKiesSel(id);
  else if(mijn.length===1)wwKiesSel(mijn[0].id);
  else wwKiesRender();
}
function wwKiesRender(){
  const mijn=WW.concepten.filter(wwMagBeheren);
  document.getElementById("wwkies-lijst").innerHTML=mijn.length?mijn.map(w=>
    '<div class="sdb-keuze'+(WW_KIES===w.id?' on':'')+'" onclick="wwKiesSel(\''+w.id+'\')"><b>'+esc(w.title||SHOWDOWN)+'</b>'+
    '<div class="sdb-keuzetekst">'+esc(wwTekst(w))+'</div></div>').join("")
    :'<div class="cempty">Nog geen concepten. Maak ze in de Bouwer; daar staan ze klaar tot je er één kiest.</div>';
  document.getElementById("wwkies-form").style.display=WW_KIES?"":"none";
  document.getElementById("wwkies-leeg").style.display=mijn.length?"none":"";
  document.getElementById("wwkies-ok").style.display=mijn.length?"":"none";
}
function wwKiesSel(id){
  const w=wwVind(id);if(!w)return;
  WW_KIES=id;
  document.getElementById("wwkies-msg").textContent="";
  document.getElementById("wwkies-naam").value=w.title||"";
  // Datum uit de naam als die er in staat en niet in het verleden ligt, anders vandaag.
  const uitNaam=wwDatumUitNaam(w.title);
  document.getElementById("wwkies-datum").value=uitNaam&&uitNaam>=todayStr()?uitNaam:todayStr();
  wwKiesRender();
}
function wwKiesDicht(){document.getElementById("wwkiesmodal").classList.remove("show");WW_KIES=null;}
function wwKiesNaarBouwer(){wwKiesDicht();wwView("bouwer");}
async function wwKiesLive(){
  const msg=document.getElementById("wwkies-msg");
  const fout=t=>{msg.textContent=t;msg.className="msg err";};
  const w=WW_KIES?wwVind(WW_KIES):null;
  if(!w||!wwIsConcept(w)){fout("Kies eerst een concept.");return;}
  const naam=document.getElementById("wwkies-naam").value.trim();
  const datum=document.getElementById("wwkies-datum").value;
  if(!naam){fout("Geef de Showdown een naam.");return;}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(datum)){fout("Kies een datum.");return;}
  // Twee Showdowns in één week kan, maar is bijna altijd een vergissing.
  const dubbel=WW.list.find(x=>wwMaandag(x.workout_date)===wwMaandag(datum));
  if(dubbel&&!confirm("In die week staat al \""+(dubbel.title||SHOWDOWN)+"\". Toch live zetten?"))return;
  const{data,error}=await db.from("workouts").update({audience:"blog",workout_date:datum,title:naam}).eq("id",w.id).eq("audience",WW_CONCEPT).select("id");
  if(error||!(data||[]).length){fout((error&&error.message)||"Live zetten mislukt. Ververs de pagina en probeer het opnieuw.");return;}
  const blk=wwMainBlock(w);
  if(blk&&blk.exercise!==naam){
    const{error:be}=await db.from("blocks").update({exercise:naam}).eq("id",blk.id);
    if(be)toast(be.message||"De naam in het blok bijwerken mislukt");
  }
  WW.open={};WW.open[w.id]=true;
  wwKiesDicht();toast("\""+naam+"\" staat live");
  await fillWeekworkout();
}

function ensureWwModals(){
  if(document.getElementById("wwmodals"))return;
  const d=document.createElement("div");d.id="wwmodals";
  d.innerHTML='<div class="lmodal" id="wwmodal"><div class="box"><h3 id="wwmodal-titel">Nieuwe weekworkout</h3>'+
      '<div class="field"><label>Naam</label><input id="ww-naam" placeholder="bijv. YP Showdown 25 juli"></div>'+
      '<div class="field"><label>Workout-tekst (met Rx/Scaled)</label><textarea id="ww-tekst" style="min-height:120px" placeholder="30 clean & jerks voor tijd&#10;Rx: 60/42,5 kg · Scaled: 42,5/30 kg"></textarea></div>'+
      '<div class="field"><label>Score</label><select id="ww-score" onchange="wwCapToggle()">'+WW_SCORES.map(s=>'<option value="'+s[0]+'">'+s[1]+'</option>').join("")+'</select></div>'+
      '<div class="field" id="ww-capveld"><label>Timecap (leeg = geen)</label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="ww-cap" placeholder="mm:ss, bijv. 20:00" style="width:150px"><select id="ww-capst" style="flex:1;min-width:220px"><option value="reps">wie de cap niet haalt logt reps</option><option value="rounds_reps">wie de cap niet haalt logt rondes + reps</option></select></div>'+
        '<div class="sm muted" style="margin-top:4px">Finishers staan bovenaan op tijd; wie gecapt is komt daaronder op reps/rondes (zoals Strivee).</div></div>'+
      '<div class="sm muted" id="wwmodal-hint" style="margin-bottom:12px">De weekworkout staat na het opslaan direct live voor 1-op-1 klanten én blog-leden.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" onclick="wwOpslaan()">Opslaan</button><button class="btn ghost" id="ww-livebtn" style="display:none" onclick="wwOpslaan(true)">Opslaan en live zetten</button><button class="btn ghost" onclick="wwModalDicht()">Annuleren</button></div>'+
      '<div class="msg" id="wwmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="wwkiesmodal"><div class="box" style="width:560px;max-width:94vw"><h3>Kies showdown</h3>'+
      '<div class="sm muted" style="margin-bottom:10px">Kies een concept uit de bouwer. Hij komt in de lijst en staat direct live voor 1-op-1 klanten én blog-leden.</div>'+
      '<div id="wwkies-lijst" style="max-height:38vh;overflow:auto;margin-bottom:10px"></div>'+
      '<div id="wwkies-form" style="display:none"><div style="display:flex;gap:10px;flex-wrap:wrap">'+
        '<div class="field" style="flex:1;min-width:220px"><label>Naam</label><input id="wwkies-naam"></div>'+
        '<div class="field"><label>Datum</label><input type="date" id="wwkies-datum"></div></div></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" id="wwkies-ok" onclick="wwKiesLive()">Zet live</button>'+
        '<button class="btn ghost" id="wwkies-leeg" style="display:none" onclick="wwKiesNaarBouwer()">Naar de Bouwer</button>'+
        '<button class="btn ghost" onclick="wwKiesDicht()">Annuleren</button></div>'+
      '<div class="msg" id="wwkies-msg"></div></div></div>'+
    '<div class="lmodal" id="wwbordmodal" style="z-index:396"><div class="box" style="width:680px;max-width:96vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0" id="wwbord-titel">Leaderboard</h3><span onclick="wwBordVensterDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div class="sm muted" id="wwbord-hint" style="margin-bottom:8px"></div>'+
      '<div id="wwbord-body"></div></div></div>'+
    '<div class="lmodal" id="wwcommodal" style="z-index:398"><div class="box" style="width:480px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0" id="wwcom-titel">Reacties</h3><span onclick="wwComDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div id="wwcom-lijst" style="max-height:46vh;overflow:auto;margin-bottom:10px"></div>'+
      '<div style="display:flex;gap:6px"><input id="wwcom-input" placeholder="Schrijf een reactie…" style="flex:1" onkeydown="if(event.key===\'Enter\')wwComPost()"><button class="btn sm" onclick="wwComPost()">Plaatsen</button></div></div></div>';
  document.body.appendChild(d);
}
