// app/weekworkout.js — de Weekworkout-sectie: alle weekworkouts (audience='blog')
// als kaarten onder elkaar (nieuwste boven), met zoeken op naam of datum en per
// workout een uitklapbaar gedeeld leaderboard. Openbare scores komen via de
// SECURITY DEFINER-RPC blog_leaderboard (leden/coaches mogen elkaars profielen
// niet rechtstreeks lezen); fist-bumps en reacties schrijven direct, RLS bewaakt.
let WW={list:[],boards:{},open:{},zoek:"",comFor:null,comments:[]};

async function fillWeekworkout(){
  // Alleen losse weekworkouts; programmering van blogprogramma's (blog_program_id) hoort in de Blog-sectie.
  const{data:list}=await db.from("workouts").select("id,title,workout_date,coach_id,created_at, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null).order("workout_date",{ascending:false}).limit(52);
  WW.list=list||[];
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
const WW_SCORES=[["time","tijd (For Time)"],["rounds_reps","rondes + reps (AMRAP)"],["reps","reps"],["load","gewicht (kg)"],["text","vrije tekst"]];

function wwRender(){
  const cp=document.getElementById("cpage");if(!cp)return;
  cp.innerHTML='<div class="lbwrap">'+
    '<div class="hrow"><h1>Workout van de week</h1><button class="btn" onclick="wwBewerk(null)">+ Nieuwe weekworkout</button></div>'+
    (WW.list.length?'<div style="margin-bottom:14px"><input class="lid-in" id="ww-zoek" placeholder="Zoek op naam of datum (bijv. 15 juli)…" style="width:100%;max-width:340px" oninput="wwZoek(this.value)" value="'+esc(WW.zoek)+'"></div>':'')+
    '<div id="ww-cards">'+wwCardsHtml()+'</div>'+
    (WW.list.length?'<div class="sm muted" style="margin-top:16px">Eén gedeeld leaderboard voor 1-op-1 klanten én gratis blog-leden. Alleen scores die een lid op "openbaar" zet staan erop; privé-scores ziet alleen de eigen coach.</div>':'')+
  '</div>';
}
function wwZoek(v){WW.zoek=(v||"").toLowerCase().trim();const h=document.getElementById("ww-cards");if(h)h.innerHTML=wwCardsHtml();}
function wwCardsHtml(){
  if(!WW.list.length)return '<div class="card" style="padding:26px;text-align:center"><div class="muted" style="margin-bottom:12px">Nog geen weekworkout. Maak de eerste aan; 1-op-1 klanten én blog-leden loggen hun score en komen samen op één leaderboard.</div><button class="btn" onclick="wwBewerk(null)">+ Nieuwe weekworkout</button></div>';
  const hits=WW.list.filter(w=>{
    if(!WW.zoek)return true;
    return (w.title||"").toLowerCase().includes(WW.zoek)||(w.workout_date||"").includes(WW.zoek)||datumNL(w.workout_date).toLowerCase().includes(WW.zoek);
  });
  return hits.map(wwCard).join("")||'<div class="cempty">Geen weekworkout gevonden voor deze zoekopdracht.</div>';
}
function wwCard(w){
  const blk=wwMainBlock(w);
  const tekst=blk?esc(composePresc(blk)||"").replace(/\n/g,"<br>"):"";
  const rows=WW.boards[w.id];
  const open=!!WW.open[w.id];
  const magBeheren=ME.user.id===w.coach_id||["eigenaar","platform_admin"].includes((ME.profile||{}).role);
  const deelnemers=rows?new Set(rows.map(r=>r.athlete_id)).size:null;
  return '<div class="lbhead" style="margin-bottom:16px"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap">'+
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
  const h=document.getElementById("ww-cards");if(h)h.innerHTML=wwCardsHtml();
}
// Sortering volgt het scoretype van het hoofdblok.
function wwCmp(st){
  const n=(v,d)=>v==null?d:Number(v);
  return (a,b)=>{
    if(st==="time")return n(a.time_seconds,1e15)-n(b.time_seconds,1e15);
    if(st==="load")return n(b.load_kg,-1)-n(a.load_kg,-1);
    if(st==="reps")return n(b.reps,-1)-n(a.reps,-1);
    if(st==="rounds_reps")return (n(b.rounds,-1)-n(a.rounds,-1))||(n(b.reps,-1)-n(a.reps,-1));
    return new Date(a.created_at)-new Date(b.created_at);
  };
}
function wwBoardInner(id){
  const w=WW.list.find(x=>x.id===id),rows=WW.boards[id]||[];
  if(!rows.length)return '<div class="card" style="padding:22px;text-align:center"><span class="muted">Nog geen openbare scores. Zodra leden hun score loggen en op "openbaar" zetten, verschijnen ze hier.</span></div>';
  const st=(wwMainBlock(w)||{}).score_type||"text";
  const cats=[["man","Mannen"],["vrouw","Vrouwen"],["overig","Overig"]];
  let html="";
  cats.forEach(cat=>{
    ["rx","scaled"].forEach(rx=>{
      const groep=rows.filter(r=>{
        const g=(r.gender==="man"||r.gender==="vrouw")?r.gender:"overig";
        const rrx=r.rx==="scaled"?"scaled":"rx";
        return g===cat[0]&&rrx===rx;
      }).sort(wwCmp(st));
      if(!groep.length)return;
      html+='<div class="lbcat" style="margin-top:12px">'+cat[1]+' / '+(rx==="rx"?'<span>Rx</span>':'<span style="color:var(--purple)">Scaled</span>')+'</div>'+
        '<div class="card">'+groep.map((r,i)=>wwRij(r,i+1)).join("")+'</div>';
    });
  });
  return html;
}
function wwRij(r,rank){
  const p={first_name:r.first_name,last_name:r.last_name,avatar_url:r.avatar_url,email:""};
  const score=resultScoreTxt(r)||"–";
  const lid=r.membership_type==="one_on_one"?"1-op-1 klant":(r.membership_type==="free_blog"?"blog-lid":"");
  const sub=[score,lid,(r.media_url?"video":"")].filter(Boolean).join(" · ");
  const tag=r.rx==="scaled"?'<span class="rxtag sc">SC</span>':'<span class="rxtag">RX</span>';
  return '<div class="lbrow"><span class="rank">'+rank+'</span>'+
    '<div class="cavc" style="width:34px;height:34px;font-size:11px;flex:none;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
    '<div><div class="lbnm">'+naamVan(p)+' '+tag+'</div><div class="lbsc">'+esc(sub)+(r.note?'<span class="muted"> · "'+esc(r.note)+'"</span>':'')+'</div></div>'+
    '<div class="fist">'+
      '<button class="fb wwlike'+(r.liked_by_me?" aan":"")+'" title="Goed gedaan!" onclick="wwLike(\''+r.result_id+'\','+(r.liked_by_me?"true":"false")+')"><svg class="i"><use href="#i-fist"/></svg>'+r.likes+'</button>'+
      '<button class="fb wwcom" title="Reacties" onclick="wwComments(\''+r.result_id+'\')"><svg class="i"><use href="#i-chat"/></svg>'+r.comments+'</button>'+
    '</div></div>';
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
  await wwLoadBoardFor(wid);
  const el=document.getElementById("ww-board-"+wid);
  if(el)el.innerHTML=wwBoardInner(wid);
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
let WW_EDIT=null;
function wwBewerk(id){
  ensureWwModals();WW_EDIT=id||null;
  const w=id?WW.list.find(x=>x.id===id):null;
  const blk=w?wwMainBlock(w):null;
  document.getElementById("wwmodal-titel").textContent=id?"Weekworkout bewerken":"Nieuwe weekworkout";
  document.getElementById("ww-naam").value=w?(w.title||""):"";
  document.getElementById("ww-datum").value=w?w.workout_date:todayStr();
  document.getElementById("ww-score").value=(blk&&blk.score_type)||"time";
  document.getElementById("ww-tekst").value=blk?(blk.kind==="conditioning"?(blk.notes||""):(blk.prescription||"")):"";
  document.getElementById("wwmodal-msg").textContent="";
  document.getElementById("wwmodal").classList.add("show");
}
function wwModalDicht(){document.getElementById("wwmodal").classList.remove("show");WW_EDIT=null;}
async function wwOpslaan(){
  const naam=document.getElementById("ww-naam").value.trim();
  const datum=document.getElementById("ww-datum").value;
  const score=document.getElementById("ww-score").value;
  const tekst=document.getElementById("ww-tekst").value.trim();
  const msg=document.getElementById("wwmodal-msg");
  if(!naam){msg.textContent="Geef de weekworkout een naam (bijv. Week 29 · \"Grace\").";msg.className="msg err";return;}
  if(!datum){msg.textContent="Kies een publicatiedatum.";msg.className="msg err";return;}
  if(!tekst){msg.textContent="Vul de workout-tekst in (met Rx/Scaled-gewichten).";msg.className="msg err";return;}
  if(WW_EDIT){
    const w=WW.list.find(x=>x.id===WW_EDIT),blk=w?wwMainBlock(w):null;
    const{error}=await db.from("workouts").update({title:naam,workout_date:datum}).eq("id",WW_EDIT);
    if(error){msg.textContent=error.message||"Opslaan mislukt";msg.className="msg err";return;}
    if(blk){
      const{error:be}=await db.from("blocks").update({exercise:naam,notes:tekst,score_type:score}).eq("id",blk.id);
      if(be){msg.textContent=be.message||"Opslaan mislukt";msg.className="msg err";return;}
    }else{
      const{error:be}=await db.from("blocks").insert({workout_id:WW_EDIT,kind:"conditioning",label:"A",exercise:naam,notes:tekst,sort:0,score_type:score,color:"yellow"});
      if(be){msg.textContent=be.message||"Opslaan mislukt";msg.className="msg err";return;}
    }
    wwModalDicht();toast("Weekworkout bijgewerkt");
  }else{
    const{data:nw,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,workout_date:datum,title:naam,audience:"blog"}).select("id").single();
    if(error){msg.textContent=error.message||"Aanmaken mislukt";msg.className="msg err";return;}
    const{error:be}=await db.from("blocks").insert({workout_id:nw.id,kind:"conditioning",label:"A",exercise:naam,notes:tekst,sort:0,score_type:score,color:"yellow"});
    if(be){msg.textContent=be.message||"Aanmaken mislukt";msg.className="msg err";return;}
    WW.open={};WW.open[nw.id]=true;
    wwModalDicht();toast("Weekworkout staat live");
  }
  await fillWeekworkout();
}
async function wwVerwijder(id){
  const n=(WW.boards[id]||[]).length;
  if(!confirm("Deze weekworkout verwijderen?"+(n?"\n\nAlle gelogde scores ("+n+" openbaar, plus eventuele privé-scores) gaan mee weg.":"\n\nEventueel gelogde scores gaan mee weg.")))return;
  const{error}=await db.from("workouts").delete().eq("id",id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  delete WW.boards[id];delete WW.open[id];
  toast("Weekworkout verwijderd");
  await fillWeekworkout();
}

function ensureWwModals(){
  if(document.getElementById("wwmodals"))return;
  const d=document.createElement("div");d.id="wwmodals";
  d.innerHTML='<div class="lmodal" id="wwmodal"><div class="box"><h3 id="wwmodal-titel">Nieuwe weekworkout</h3>'+
      '<div class="field"><label>Naam</label><input id="ww-naam" placeholder="bijv. Week 29 · &quot;Grace&quot;"></div>'+
      '<div class="field"><label>Workout-tekst (met Rx/Scaled)</label><textarea id="ww-tekst" style="min-height:120px" placeholder="30 clean & jerks voor tijd&#10;Rx: 60/42,5 kg · Scaled: 42,5/30 kg"></textarea></div>'+
      '<div class="field"><label>Score</label><select id="ww-score">'+WW_SCORES.map(s=>'<option value="'+s[0]+'">'+s[1]+'</option>').join("")+'</select></div>'+
      '<div class="field"><label>Publicatiedatum</label><input type="date" id="ww-datum"></div>'+
      '<div style="display:flex;gap:8px"><button class="btn" onclick="wwOpslaan()">Opslaan</button><button class="btn ghost" onclick="wwModalDicht()">Annuleren</button></div>'+
      '<div class="msg" id="wwmodal-msg"></div></div></div>'+
    '<div class="lmodal" id="wwcommodal" style="z-index:398"><div class="box" style="width:480px;max-width:94vw">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px"><h3 style="margin:0" id="wwcom-titel">Reacties</h3><span onclick="wwComDicht()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
      '<div id="wwcom-lijst" style="max-height:46vh;overflow:auto;margin-bottom:10px"></div>'+
      '<div style="display:flex;gap:6px"><input id="wwcom-input" placeholder="Schrijf een reactie…" style="flex:1" onkeydown="if(event.key===\'Enter\')wwComPost()"><button class="btn sm" onclick="wwComPost()">Plaatsen</button></div></div></div>';
  document.body.appendChild(d);
}
