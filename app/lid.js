// app/lid.js — het scherm voor de sporter (rol 'lid'): de workout van vandaag
// met loggen per blok (score + voltooid/gemist), plus de weekworkout met score
// loggen (Rx/Scaled, privé/openbaar) en het gedeelde leaderboard (hergebruikt
// WW/wwBoardInner uit weekworkout.js).
let LID={blog:null,eigen:null,rx:"rx",openbaar:true,dagWs:[],dagRes:{},progNamen:{}};

async function renderLid(){
  document.body.classList.remove("coachmode");
  const c=document.getElementById("content");c.innerHTML='<div class="spin">Laden…</div>';
  // We halen de hele week op (ma t/m zo): vandaag voor de workout-kaarten,
  // de rest voor de weekstrip bovenaan (puntje/vinkje/kruis per dag).
  const maandag=mondayOf(new Date()),zondag=addDays(maandag,6);
  const{data:eigenWk}=await db.from("workouts").select("*, blocks(*)").eq("client_id",ME.user.id).gte("workout_date",ymd(maandag)).lte("workout_date",ymd(zondag)).order("workout_date");
  // Gevolgde blogprogramma's (sinds 22 juli meerdere mogelijk, en ook voor
  // 1-op-1 klanten): koppelingen staan in blog_program_members.
  let progWk=[];LID.progNamen={};
  try{
    const{data:mems}=await db.from("blog_program_members").select("blog_program_id").eq("athlete_id",ME.user.id);
    const ids=[...new Set((mems||[]).map(m=>m.blog_program_id))];
    if(ids.length){
      const[{data:pws},{data:progs}]=await Promise.all([
        db.from("workouts").select("*, blocks(*)").in("blog_program_id",ids).gte("workout_date",ymd(maandag)).lte("workout_date",ymd(zondag)).order("workout_date"),
        db.from("blog_programs").select("id,name").in("id",ids)
      ]);
      progWk=pws||[];
      (progs||[]).forEach(p=>{LID.progNamen[p.id]=p.name;});
    }
  }catch(e){progWk=[];}
  const weekWs=[...(eigenWk||[]),...progWk];
  const w=(eigenWk||[]).find(x=>x.workout_date===todayStr())||null;
  const wProgs=progWk.filter(x=>x.workout_date===todayStr());
  LID.dagWs=[w,...wProgs].filter(Boolean);LID.dagRes={};
  const metBlokken=weekWs.filter(x=>(x.blocks||[]).length);
  if(metBlokken.length){
    // Eigen resultaten van deze week: weekstrip + voorvullen + status per blok
    try{
      const{data:rs}=await db.from("results").select("*").in("workout_id",metBlokken.map(x=>x.id)).eq("athlete_id",ME.user.id);
      (rs||[]).forEach(r=>{if(r.block_id)LID.dagRes[r.block_id]=r;});
    }catch(e){}
  }
  let body=lidWeekstrip(weekWs);
  if(w)body+=lidWorkoutKaart(w,"vandaag");
  wProgs.forEach(pw=>{body+=lidWorkoutKaart(pw,"programma · "+esc(LID.progNamen[pw.blog_program_id]||""));});
  if(!w&&!wProgs.length)body+='<div class="card" style="padding:20px"><div class="muted">Geen workout voor vandaag. Geniet van je rustdag! 💪</div></div>';
  // Weekworkout van het bedrijf (audience='blog'), voor 1-op-1 én blog-leden.
  let wwHtml="";LID.blog=null;
  // Weekworkout alleen tonen als de coach hem niet heeft verborgen voor dit lid.
  if(!ME.profile.hide_weekworkout)try{
    const{data:blogs}=await db.from("workouts").select("id,title,workout_date,coach_id,created_at, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null).order("workout_date",{ascending:false}).limit(1);
    LID.blog=(blogs||[])[0]||null;
  }catch(e){LID.blog=null;}
  if(LID.blog){
    WW.list=[LID.blog];
    ensureWwModals();
    await Promise.all([wwLoadBoardFor(LID.blog.id),lidEigenLaad()]);
    wwHtml=lidWeekHtml();
  }
  c.innerHTML='<div class="cwrap" style="max-width:860px;margin:0 auto">'+header("Welkom, "+(ME.profile.first_name||ME.user.email),"Jouw workout van vandaag")+body+wwHtml+'</div>';
  lidFormVul();
  lidDagVul();
  // Chat met je coach: zwevende knop rechtsonder (alleen als er een coach gekoppeld is)
  if(ME.profile.coach_id){
    let unread=0;
    try{
      const{data:un}=await db.from("messages").select("id").eq("athlete_id",ME.user.id).neq("sender_id",ME.user.id).is("read_at",null);
      unread=(un||[]).length;
    }catch(e){}
    lidChatKnop(unread);
  }
}

// ---------- Chat met je coach (hergebruikt de chat-popup uit chat.js) ----------
let lidCoach=null;
function lidChatKnop(unread){
  let btn=document.getElementById("lidchat-btn");
  if(!btn){
    btn=document.createElement("button");btn.id="lidchat-btn";btn.title="Chat met je coach";
    btn.style.cssText="position:fixed;right:18px;bottom:18px;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;border:none;box-shadow:0 6px 18px rgba(30,60,120,.35);cursor:pointer;z-index:60;display:flex;align-items:center;justify-content:center";
    btn.innerHTML='<svg class="i" style="width:22px;height:22px;color:#fff"><use href="#i-chat"/></svg><span id="lidchat-badge" style="position:absolute;top:-4px;right:-4px;background:#e5484d;color:#fff;border-radius:10px;min-width:18px;height:18px;font-size:11px;font-weight:800;display:none;align-items:center;justify-content:center;padding:0 5px">0</span>';
    btn.onclick=lidChatOpen;
    document.body.appendChild(btn);
  }
  lidChatBadge(unread);
}
function lidChatBadge(n){
  const b=document.getElementById("lidchat-badge");if(!b)return;
  b.textContent=n;b.style.display=n>0?"flex":"none";
}
async function lidChatOpen(){
  let pop=document.getElementById("chatpop");
  if(pop){
    pop.classList.toggle("show");
    if(pop.classList.contains("show")){await chatLaad();lidChatBadge(0);}
    return;
  }
  chatSluitKanaal();
  chatAthlete=ME.user.id; // de eigen draad; chatLaad/chatStuur uit chat.js werken hierop
  if(!lidCoach){try{const{data}=await db.rpc("my_coach");lidCoach=(data||[])[0]||null;}catch(e){}}
  const p=lidCoach||{first_name:"Coach"};
  // Berichten alleen-lezen als de coach dat zo heeft ingesteld (profiel-instelling)
  const invoer=ME.profile.messages_readonly
    ?'<div class="sm muted" style="padding:10px 12px;text-align:center;border-top:1px solid #eef0f3">Meelezen kan; berichten sturen staat voor jou uit.</div>'
    :'<div class="cin"><input id="chat-inp" placeholder="Schrijf een bericht…" onkeydown="if(event.key===\'Enter\')chatStuur()"><div class="cinrow"><button class="send" onclick="chatStuur()">Stuur</button></div></div>';
  pop=document.createElement("div");pop.id="chatpop";pop.className="chatpop show";
  pop.innerHTML='<div class="ch"><div class="cavc" style="width:24px;height:24px;font-size:9px;'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><b>'+(lidCoach?naamVan(lidCoach):"Je coach")+'</b>'+
    '<svg class="i" onclick="chatSluit()"><use href="#i-x"/></svg></div>'+
    '<div class="msgs2" id="chat-msgs"><div class="sm muted" style="text-align:center;padding:14px">Laden…</div></div>'+invoer;
  document.body.appendChild(pop);
  await chatLaad();
  lidChatBadge(0);
  // realtime: nieuw bericht van de coach verschijnt direct (of telt op als de popup dicht is)
  try{
    chatKanaal=db.channel("chat-"+ME.user.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"athlete_id=eq."+ME.user.id},payload=>{
        if(!payload.new||payload.new.sender_id===ME.user.id)return;
        const open=document.getElementById("chatpop"),zichtbaar=open&&open.classList.contains("show");
        if(zichtbaar)chatToon(payload.new,true);
        else{const b=document.getElementById("lidchat-badge");lidChatBadge((parseInt(b&&b.textContent||"0",10)||0)+1);}
      }).subscribe();
  }catch(e){}
}

// ---------- Weekstrip (zoals CoachRx) ----------
// Per dag: puntje = workout gepland, vinkje = alle blokken voltooid,
// kruis = verstreken dag met blokken die niet (allemaal) gedaan zijn,
// ring = vandaag. Rustdagen (geen blokken) blijven leeg.
function lidWeekstrip(weekWs){
  const maandag=mondayOf(new Date());
  let cells="";
  for(let i=0;i<7;i++){
    const d=addDays(maandag,i),dsr=ymd(d),isToday=dsr===todayStr();
    const blokken=weekWs.filter(x=>x.workout_date===dsr).flatMap(x=>x.blocks||[]);
    const klaar=blokken.length>0&&blokken.every(b=>{const r=LID.dagRes[b.id];return r&&r.status==="completed";});
    let mark="";
    if(blokken.length){
      if(klaar)mark='<span style="color:#25a56a;font-weight:800;font-size:11px">✓</span>';
      else if(dsr<todayStr())mark='<span style="color:#e5484d;font-weight:800;font-size:11px">×</span>';
      else mark='<span style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block"></span>';
    }
    cells+='<div style="flex:1;text-align:center">'+
      '<div class="sm muted" style="font-size:10px;font-weight:700;letter-spacing:.4px">'+DAGEN[i]+'</div>'+
      '<div style="width:36px;height:36px;margin:4px auto 0;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;'+(isToday?'border:2px solid var(--accent)':'border:2px solid transparent')+'">'+
        '<div style="font-size:12px;font-weight:700">'+d.getDate()+'</div>'+
        '<div style="height:11px;line-height:11px;display:flex;align-items:center">'+mark+'</div>'+
      '</div></div>';
  }
  return '<div class="card" style="padding:10px 6px;margin-bottom:14px;display:flex;align-items:flex-start">'+cells+'</div>';
}

// ---------- Dagworkout loggen per blok ----------
// Eén kaart per workout (persoonlijk of blogprogramma), met de workout-tekst
// en onder elk blok een altijd-open logblokje.
function lidWorkoutKaart(w,tag){
  if(w.title==="Rest Day"&&!(w.blocks||[]).length){
    return '<div class="card" style="padding:20px;margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px"><div class="muted">Vandaag staat er een rustdag gepland. Geniet ervan! 💪</div><span class="tag">'+tag+'</span></div></div>';
  }
  let parts="";
  if(w.warmup)parts+='<div class="block"><div class="bh"><span class="badge" style="background:#3a4a6b">WU</span><b>Warming-up</b></div><div class="presc">'+esc(w.warmup)+'</div></div>';
  parts+=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>{const pr=composePresc(b);return '<div class="block"><div class="bh"><span class="badge">'+esc(b.label||"")+'</span><b>'+esc(b.exercise||"")+'</b></div>'+(pr?'<div class="presc">'+esc(pr)+'</div>':'')+lidBlokLogHtml(b)+'</div>';}).join("");
  if(w.cooldown)parts+='<div class="block"><div class="bh"><span class="badge" style="background:#3a4a6b">CD</span><b>Cooldown</b></div><div class="presc">'+esc(w.cooldown)+'</div></div>';
  return '<div class="card" style="padding:16px;margin-bottom:14px"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><b>'+esc(w.title||"Workout")+'</b><span class="tag">'+tag+'</span></div>'+(w.coach_notes?'<div class="note" style="margin:0 0 10px">📝 '+esc(w.coach_notes)+'</div>':'')+(parts||'<div class="muted">Geen blokken.</div>')+'</div>';
}
// Het logblokje staat altijd open onder de workout-tekst (geen apart scherm).
// Het invoerveld volgt blocks.score_type; vrijwel alles is 'text' (één tekstveld).
function lidBlokLogHtml(b){
  const r=LID.dagRes[b.id];
  const pill=r?(r.status==="missed"?'<span class="cpill" style="background:#fdeaea;color:#c62f34">gemist</span>':'<span class="cpill ok">voltooid</span>'):"";
  return '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px dashed #e4e6ea">'+
    lidVeldHtml(b.score_type||"text","bl-"+esc(b.id))+
    '<button class="btn sm" onclick="lidBlokOpslaan(\''+esc(b.id)+'\')">'+(r&&r.status==="completed"?"Bijwerken":"Opslaan")+'</button>'+
    '<button class="btn ghost sm" title="Niet gedaan? Markeer dit blok als gemist" onclick="lidBlokGemist(\''+esc(b.id)+'\')">Gemist</button>'+
    pill+
    '<div class="msg" id="bl-'+esc(b.id)+'-msg" style="flex-basis:100%;margin:0"></div></div>';
}
// Invoerveld(en) per scoretype; prefix bepaalt de element-id's (gedeeld met de weekworkout).
function lidVeldHtml(st,prefix){
  if(st==="time")return '<input class="lid-in" id="'+prefix+'-tijd" placeholder="mm:ss (bijv. 3:12)" style="width:150px">';
  if(st==="rounds_reps")return '<input class="lid-in" id="'+prefix+'-rondes" type="number" min="0" placeholder="rondes" style="width:95px"><input class="lid-in" id="'+prefix+'-reps" type="number" min="0" placeholder="+ reps" style="width:95px">';
  if(st==="reps")return '<input class="lid-in" id="'+prefix+'-reps" type="number" min="0" placeholder="reps" style="width:110px">';
  if(st==="load")return '<input class="lid-in" id="'+prefix+'-kg" type="number" min="0" step="0.5" placeholder="kg" style="width:110px">';
  if(st==="none")return "";
  return '<input class="lid-in" id="'+prefix+'-tekst" placeholder="jouw score" style="width:220px">';
}
// Leest en valideert de invoer voor een scoretype; vult rec en geeft een foutmelding terug (of null).
function lidLeesScore(st,prefix,rec){
  const val=suffix=>{const el=document.getElementById(prefix+"-"+suffix);return el?el.value:"";};
  if(st==="time"){const t=lidParseTijd(val("tijd"));if(t==null)return "Vul je tijd in als mm:ss (bijv. 3:12).";rec.time_seconds=t;}
  else if(st==="rounds_reps"){const ro=parseInt(val("rondes"),10),re=parseInt(val("reps")||"0",10);if(isNaN(ro))return "Vul het aantal rondes in.";rec.rounds=ro;rec.reps=isNaN(re)?0:re;}
  else if(st==="reps"){const re=parseInt(val("reps"),10);if(isNaN(re))return "Vul het aantal reps in.";rec.reps=re;}
  else if(st==="load"){const kg=parseFloat(String(val("kg")).replace(",","."));if(isNaN(kg))return "Vul het gewicht in kg in.";rec.load_kg=kg;}
  else if(st==="none"){/* geen score, alleen voltooid */}
  else{const s=(val("tekst")||"").trim();if(!s)return "Vul je score in.";rec.score_text=s;}
  return null;
}
// Zoek een blok terug in de dagworkouts (persoonlijk of blogprogramma).
function lidVindBlok(bid){
  for(const w of LID.dagWs){
    const b=(w.blocks||[]).find(x=>String(x.id)===String(bid));
    if(b)return{w,b};
  }
  return null;
}
function lidDagRec(w,b,status){
  const oud=LID.dagRes[b.id];
  return {block_id:b.id,workout_id:w.id,athlete_id:ME.user.id,company_id:ME.profile.company_id,status,rx:null,is_public:false,note:(oud&&oud.note)||null,score_text:null,time_seconds:null,load_kg:null,reps:null,rounds:null};
}
async function lidBlokOpslaan(bid){
  const vondst=lidVindBlok(bid);if(!vondst)return;
  const{w,b}=vondst;
  const msg=document.getElementById("bl-"+bid+"-msg");if(msg){msg.textContent="";msg.className="msg";}
  const rec=lidDagRec(w,b,"completed");
  const err=lidLeesScore(b.score_type||"text","bl-"+bid,rec);
  if(err){if(msg){msg.textContent=err;msg.className="msg err";}return;}
  const{error}=await db.from("results").upsert(rec,{onConflict:"block_id,athlete_id"});
  if(error){if(msg){msg.textContent=error.message||"Opslaan mislukt. Probeer het opnieuw.";msg.className="msg err";}return;}
  toast("Score opgeslagen");
  await renderLid();
}
async function lidBlokGemist(bid){
  const vondst=lidVindBlok(bid);if(!vondst)return;
  const rec=lidDagRec(vondst.w,vondst.b,"missed"); // gemist wist de score
  const{error}=await db.from("results").upsert(rec,{onConflict:"block_id,athlete_id"});
  if(error){toast(error.message||"Markeren mislukt");return;}
  toast("Blok op gemist gezet");
  await renderLid();
}
// Voorvullen van de logvelden met de eerder gelogde scores van vandaag.
function lidDagVul(){
  Object.entries(LID.dagRes).forEach(([bid,r])=>{
    const set=(suffix,v)=>{const el=document.getElementById("bl-"+bid+"-"+suffix);if(el&&v!=null)el.value=v;};
    if(r.time_seconds!=null)set("tijd",Math.floor(r.time_seconds/60)+":"+pad(r.time_seconds%60));
    set("rondes",r.rounds);set("reps",r.reps);set("kg",r.load_kg);set("tekst",r.score_text);
  });
}
async function lidEigenLaad(){
  LID.eigen=null;
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const{data}=await db.from("results").select("*").eq("block_id",blk.id).eq("athlete_id",ME.user.id);
  LID.eigen=(data||[])[0]||null;
  if(LID.eigen){LID.rx=LID.eigen.rx==="scaled"?"scaled":"rx";LID.openbaar=!!LID.eigen.is_public;}
  else{LID.rx="rx";LID.openbaar=true;}
}
function lidWeekHtml(){
  const w=LID.blog,blk=wwMainBlock(w);
  const tekst=blk?esc(composePresc(blk)||"").replace(/\n/g,"<br>"):"";
  const deelnemers=new Set((WW.boards[w.id]||[]).map(r=>r.athlete_id)).size;
  return '<div class="lbhead" style="margin-top:24px"><h2 style="font-size:18px">Workout van de week · '+esc(w.title||"")+'</h2>'+
    (tekst?'<div class="muted" style="margin-top:6px;font-size:13px;line-height:1.55">'+tekst+'</div>':'')+
    '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'+
      '<span class="cpill ok">'+deelnemers+" deelnemer"+(deelnemers===1?"":"s")+'</span>'+
      '<span class="cpill gray">gepubliceerd '+datumNL(w.workout_date)+'</span></div></div>'+
    (blk?lidLogHtml(blk):'')+
    '<div class="hrow" style="margin:20px 0 10px"><h2>Leaderboard <span class="muted" style="font-weight:400;font-size:13px">· openbare scores</span></h2></div>'+
    '<div id="ww-board-'+w.id+'">'+wwBoardInner(w.id)+'</div>';
}
function lidLogHtml(blk){
  const eigen=LID.eigen;
  const veld=lidVeldHtml(blk.score_type||"text","lid");
  return '<div class="card" style="padding:16px;margin-top:14px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><b>Jouw score</b>'+
      (eigen?'<span class="cpill '+(eigen.is_public?"ok":"gray")+'">'+(eigen.is_public?"staat op het leaderboard":"privé · alleen jij en je coach")+'</span>':'<span class="cpill gray">nog niet gelogd</span>')+'</div>'+
    '<div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">'+
      '<div class="seg" id="lid-rxseg"><button class="'+(LID.rx==="rx"?"on":"")+'" onclick="lidRx(\'rx\')">Rx</button><button class="'+(LID.rx==="scaled"?"on":"")+'" onclick="lidRx(\'scaled\')">Scaled</button></div>'+
      veld+
      '<input class="lid-in" id="lid-note" placeholder="notitie (optioneel)" style="flex:1;min-width:170px">'+
    '</div>'+
    '<div style="display:flex;gap:12px;align-items:center;margin-top:13px;flex-wrap:wrap">'+
      '<button class="tgl'+(LID.openbaar?" on":"")+'" onclick="this.classList.toggle(\'on\');LID.openbaar=this.classList.contains(\'on\')"><span class="sw"></span> Openbaar op het leaderboard</button>'+
      '<span style="margin-left:auto;display:flex;gap:8px">'+
        (eigen?'<button class="btn ghost sm" style="color:#e5484d;border-color:#f3b8ba" onclick="lidVerwijder()">Score verwijderen</button>':'')+
        '<button class="btn sm" onclick="lidOpslaan()">'+(eigen?"Score bijwerken":"Score opslaan")+'</button></span>'+
    '</div>'+
    '<div class="msg" id="lid-msg"></div></div>';
}
function lidFormVul(){
  const e=LID.eigen;if(!e)return;
  const set=(id,v)=>{const el=document.getElementById(id);if(el&&v!=null)el.value=v;};
  if(e.time_seconds!=null)set("lid-tijd",Math.floor(e.time_seconds/60)+":"+pad(e.time_seconds%60));
  set("lid-rondes",e.rounds);set("lid-reps",e.reps);set("lid-kg",e.load_kg);set("lid-tekst",e.score_text);set("lid-note",e.note);
}
function lidRx(v){LID.rx=v;document.querySelectorAll("#lid-rxseg button").forEach((b,i)=>b.classList.toggle("on",(i===0)===(v==="rx")));}
function lidParseTijd(s){
  s=(s||"").trim();if(!s)return null;
  const m=s.match(/^(\d+):([0-5]?\d)$/);if(m)return parseInt(m[1],10)*60+parseInt(m[2],10);
  if(/^\d+$/.test(s))return parseInt(s,10); // losse seconden mag ook
  return null;
}
async function lidOpslaan(){
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const st=blk.score_type||"text";
  const msg=document.getElementById("lid-msg");msg.textContent="";
  const val=id=>{const el=document.getElementById(id);return el?el.value:"";};
  const rec={block_id:blk.id,workout_id:LID.blog.id,athlete_id:ME.user.id,company_id:ME.profile.company_id,status:"completed",rx:LID.rx,is_public:LID.openbaar,note:(val("lid-note")||"").trim()||null,score_text:null,time_seconds:null,load_kg:null,reps:null,rounds:null};
  const fout=lidLeesScore(st,"lid",rec);
  if(fout){msg.textContent=fout;msg.className="msg err";return;}
  const{error}=await db.from("results").upsert(rec,{onConflict:"block_id,athlete_id"});
  if(error){msg.textContent=error.message||"Opslaan mislukt. Probeer het opnieuw.";msg.className="msg err";return;}
  toast(LID.openbaar?"Je score staat op het leaderboard 💪":"Score opgeslagen (privé)");
  await renderLid();
}
async function lidVerwijder(){
  if(!confirm("Je score verwijderen? Hij verdwijnt ook van het leaderboard."))return;
  const blk=wwMainBlock(LID.blog);if(!blk)return;
  const{error}=await db.from("results").delete().eq("block_id",blk.id).eq("athlete_id",ME.user.id);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast("Score verwijderd");
  await renderLid();
}
