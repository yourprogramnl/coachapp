// app/leaderboards.js — de sectie Leaderboards (20 nov 2026, verzoek Michel): alle
// leaderboards op één plek, als lijst onder elkaar in de stijl van Template week.
// Twee soorten: een leaderboard bij een 1-op-1 workout (workouts.audience 'bord') en de
// YP Showdown (audience 'blog' zonder blogprogramma). De borden van blogprogramma's staan
// hier niet: die horen bij het programma zelf (Blog). Een klik opent het bord in het
// bestaande venster (wwBordVenster), met dezelfde fist bumps en reacties.
let LBS={lijst:null,coaches:{},zoek:"",soort:"alle"};
try{const s=localStorage.getItem("forge_lbs_soort");if(["alle","bord","blog"].includes(s))LBS.soort=s;}catch(e){}

async function fillLeaderboards(){
  // results(count) = aantal scores op het bord: alleen openbare, want een score die de atleet
  // op alleen-coach zet staat er niet op. Lukt het tellen niet, dan de lijst zonder aantallen.
  const haal=metAantal=>{const q=haalBasis(metAantal);return metAantal?q.eq("results.is_public",true):q;};
  const haalBasis=metAantal=>db.from("workouts").select("id,title,workout_date,coach_id,created_at,audience, blocks(*)"+(metAantal?", results(count)":""))
    .eq("company_id",ME.profile.company_id).in("audience",["bord","blog"]).is("blog_program_id",null)
    .order("workout_date",{ascending:false}).limit(600);
  let r=await haal(true);
  if(r.error)r=await haal(false);
  if(r.error){const cp=document.getElementById("cpage");if(cp)cp.innerHTML='<h1>Leaderboards</h1><div class="card"><div class="cempty">Leaderboards laden mislukt. Ververs de pagina en probeer het opnieuw.</div></div>';return;}
  // Nieuwste datum boven; op dezelfde dag op naam, zodat wod 1, wod 2, wod 3 onder elkaar staan.
  LBS.lijst=(r.data||[]).slice().sort((a,b)=>String(b.workout_date||"").localeCompare(String(a.workout_date||""))||String(a.title||"").localeCompare(String(b.title||""),"nl",{numeric:true,sensitivity:"base"}));
  const ids=[...new Set(LBS.lijst.map(w=>w.coach_id).filter(Boolean))].filter(id=>!LBS.coaches[id]);
  if(ids.length){
    const{data}=await db.from("profiles").select("id,first_name,last_name,avatar_url,email").in("id",ids);
    (data||[]).forEach(p=>{LBS.coaches[p.id]=p;});
  }
  if(coachSection!=="boards")return; // intussen naar een andere pagina gegaan
  ensureWwModals();lbsRender();
}
function lbsTekst(w){const b=wwMainBlock(w);return b?(composePresc(b)||""):"";}
// Zoeken op naam, datum of iets uit de workout zelf (een beweging, bijv. "thruster").
function lbsMatch(w){
  if(LBS.soort!=="alle"&&w.audience!==LBS.soort)return false;
  const z=LBS.zoek;if(!z)return true;
  return (w.title||"").toLowerCase().includes(z)||(w.workout_date||"").includes(z)||datumNL(w.workout_date).toLowerCase().includes(z)||lbsTekst(w).toLowerCase().includes(z);
}
function lbsRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  const seg=[["alle","Alle"],["bord","1-op-1"],["blog",SHOWDOWN]].map(s=>'<button class="'+(LBS.soort===s[0]?"on":"")+'" onclick="lbsSoort(\''+s[0]+'\')">'+esc(s[1])+'</button>').join("");
  cp.innerHTML='<h1>Leaderboards</h1><div class="lbs-wrap">'+
    '<div class="card" style="padding:18px 18px 0;border-radius:10px 10px 0 0">'+
      '<div style="margin-bottom:14px"><h2 style="font-size:16px">Leaderboards <span class="cpill teal" id="lbs-aantal">…</span></h2>'+
      '<div class="sm muted" style="font-size:12.5px;margin-top:3px">Alle workouts met een leaderboard onder elkaar: bij 1-op-1 klanten en de '+esc(SHOWDOWN)+'. Klik op een workout om het bord te openen.</div></div>'+
      '<div style="display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;align-items:center">'+
        '<div class="search2"><input id="lbs-zoek" placeholder="Zoek op workout, beweging of datum…" oninput="lbsZoek(this.value)" value="'+esc(LBS.zoek)+'"></div>'+
        '<div class="seg">'+seg+'</div>'+
      '</div>'+
    '</div>'+
    '<div class="card" style="border-radius:0 0 10px 10px;border-top:none">'+
      '<div class="thead"><div style="flex:2.6">Workout</div><div style="flex:.9">Soort</div><div style="flex:1">Datum</div><div style="flex:.7">Scores</div><div style="flex:.5">Van</div><div style="width:130px"></div></div>'+
      '<div id="lbs-lijst"></div>'+
    '</div></div>';
  lbsLijst();
}
function lbsLijst(){
  const host=document.getElementById("lbs-lijst");if(!host)return;
  const alle=LBS.lijst||[],hits=alle.filter(lbsMatch);
  const cnt=document.getElementById("lbs-aantal");
  if(cnt)cnt.textContent=hits.length+(hits.length===1?" leaderboard":" leaderboards");
  host.innerHTML=hits.map(w=>{
    const c=LBS.coaches[w.coach_id];
    const av=c?'<div class="cavc" style="width:28px;height:28px;font-size:10px;'+avFotoStyle(c)+'" title="'+esc(naamVan(c))+'">'+avFotoText(c)+'</div>':'<div class="cavc" style="width:28px;height:28px;font-size:10px;background:#c9cdd4">·</div>';
    const n=wwAantalScores(w);
    const tekst=lbsTekst(w).replace(/\s*\n\s*/g," · ");
    const bord=w.audience==="bord";
    return '<div class="trow click" style="align-items:flex-start" onclick="wwBordVenster(\''+w.id+'\')">'+
      '<div style="flex:2.6;min-width:0"><b>'+esc(w.title||(bord?"Leaderboard-workout":SHOWDOWN))+'</b>'+(tekst?'<div class="sm muted lbs-tekst">'+esc(tekst)+'</div>':'')+'</div>'+
      '<div style="flex:.9"><span class="cpill '+(bord?"purple":"teal")+'">'+(bord?"1-op-1":esc(SHOWDOWN))+'</span></div>'+
      '<div style="flex:1" class="sm muted">'+esc(datumNL(w.workout_date))+'</div>'+
      '<div style="flex:.7" class="sm muted">'+(n==null?"–":n+(n===1?" score":" scores"))+'</div>'+
      '<div style="flex:.5">'+av+'</div>'+
      '<div style="width:130px;display:flex;justify-content:flex-end" onclick="event.stopPropagation()"><button class="btn ghost sm" onclick="wwBordVenster(\''+w.id+'\')">Leaderboard</button></div></div>';
  }).join("")||'<div class="cempty">'+(alle.length?"Geen leaderboard gevonden voor deze zoekopdracht.":'Nog geen leaderboards. Zet bij een klant op een blok "Leaderboard aanzetten", of maak een '+esc(SHOWDOWN)+'.')+'</div>';
}
function lbsZoek(v){LBS.zoek=(v||"").toLowerCase().trim();lbsLijst();}
function lbsSoort(s){
  LBS.soort=s;try{localStorage.setItem("forge_lbs_soort",s);}catch(e){}
  document.querySelectorAll(".lbs-wrap .seg button").forEach((b,i)=>b.classList.toggle("on",["alle","bord","blog"][i]===s));
  lbsLijst();
}
