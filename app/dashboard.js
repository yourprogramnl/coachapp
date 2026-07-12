// app/dashboard.js — het coach-dashboard: aandacht nodig, contactmomenten,
// activiteit-feed, mijn cijfers, mijn taken en workout van de week.
let dashPeriode=30,dashFilter="alles",dashTaken="open",DASH=null;
async function fillDashboard(){
  const ids=coachClients.map(p=>p.id);
  const td=todayStr(),from90=ymd(addDays(new Date(),-89));
  let ws=[],rs=[],msgs=[],blog=null,blogRes=[];
  if(ids.length){
    ws=(await db.from("workouts").select("*, blocks(*)").in("client_id",ids).gte("workout_date",from90).lte("workout_date",td).order("workout_date",{ascending:false})).data||[];
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("*").in("workout_id",wids)).data||[];
    msgs=(await db.from("messages").select("athlete_id,created_at").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
  }
  const tasks=(await db.from("tasks").select("*").eq("owner_id",ME.user.id).order("created_at",{ascending:false})).data||[];
  if(ME.profile.company_id){
    blog=((await db.from("workouts").select("id,title,workout_date, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").order("workout_date",{ascending:false}).limit(1)).data||[])[0]||null;
    if(blog)blogRes=(await db.from("results").select("athlete_id,created_at").eq("workout_id",blog.id)).data||[];
  }
  DASH={ws,rs,msgs,tasks,blog,blogRes};
  dashRender();
}
function dashSetFilter(f){if(f==="lifestyle"||f==="consult"){toast("Lifestyle en consults komen later");return;}dashFilter=f;dashRender();}
function dashSetPeriode(n){dashPeriode=n;dashRender();}
function dashSetTaken(t){dashTaken=t;dashRender();}
function dashRender(){
  const cp=document.getElementById("cpage");if(!cp||!DASH)return;
  const{ws,rs,msgs,tasks,blog,blogRes}=DASH;
  const td=todayStr(),from7=ymd(addDays(new Date(),-6));
  const byId={};coachClients.forEach(p=>byId[p.id]=p);
  const echte=ws.filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  const doneWo=new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id));
  const resByBlock={};rs.forEach(r=>resByBlock[r.block_id]=r);
  // Aandacht nodig
  const attn=[];let nTeDoen=0;
  coachClients.forEach(p=>{
    const wos=echte.filter(w=>w.client_id===p.id);
    const teDoen=wos.some(w=>w.workout_date>=from7&&w.workout_date<=td&&!doneWo.has(w.id));
    const past=wos.filter(w=>w.workout_date<td).sort((a,b)=>b.workout_date.localeCompare(a.workout_date));
    let miss=0;for(const w of past){if(doneWo.has(w.id))break;miss++;}
    if(teDoen)nTeDoen++;
    if(teDoen||miss>=2){
      const pills=[];
      if(teDoen)pills.push('<span class="cpill teal">Workout te doen</span>');
      if(miss>=2)pills.push('<span class="cpill bad">'+miss+'x gemist op rij</span>');
      attn.push({p,pills,teDoen});
    }
  });
  const attnRows=attn.filter(a=>dashFilter==="alles"||(dashFilter==="tedoen"&&a.teDoen));
  const attnHtml=attnRows.length?'<div class="attn-card">'+attnRows.map(a=>'<div class="attn-row click" onclick="openClient(\''+a.p.id+'\')"><div class="cavc" style="'+avFotoStyle(a.p)+'">'+avFotoText(a.p)+'</div><div class="nm">'+naamVan(a.p)+'</div><div class="pills">'+a.pills.join("")+'</div><div class="rowicons"><svg class="i sm-i" onclick="event.stopPropagation();toast(\'Berichten komen later\')"><use href="#i-chat"/></svg><svg class="i sm-i"><use href="#i-eye"/></svg><svg class="i sm-i"><use href="#i-cal"/></svg></div></div>').join("")+'</div>'
    :'<div class="attn-card"><div class="cempty">Niets dat nu je aandacht vraagt. 👍<br>Zodra een klant een workout mist of nog moet doen, zie je het hier.</div></div>';
  const chips='<div style="display:flex;gap:8px;margin:10px 0 12px;flex-wrap:wrap">'+
    '<span class="fchip'+(dashFilter==="alles"?" on":"")+'" onclick="dashSetFilter(\'alles\')">Alles</span>'+
    '<span class="fchip'+(dashFilter==="tedoen"?" on":"")+'" onclick="dashSetFilter(\'tedoen\')">Workout te doen ('+nTeDoen+')</span>'+
    '<span class="fchip" onclick="dashSetFilter(\'lifestyle\')">Lifestyle (0)</span>'+
    '<span class="fchip" onclick="dashSetFilter(\'consult\')">Consult (0)</span></div>';
  // Contactmomenten: chat-berichten deze week per klant
  const msgCount={};msgs.forEach(m=>msgCount[m.athlete_id]=(msgCount[m.athlete_id]||0)+1);
  const gesproken=coachClients.filter(p=>msgCount[p.id]).length;
  const cmPct=coachClients.length?Math.round(gesproken/coachClients.length*100):0;
  const mon=mondayOf(new Date());
  const monLbl=("0"+mon.getDate()).slice(-2)+"-"+("0"+(mon.getMonth()+1)).slice(-2)+"-"+mon.getFullYear();
  const cmHtml='<h2 style="margin:22px 0 4px">Contactmomenten <span class="muted" style="font-weight:600">('+cmPct+'%)</span></h2>'+
    '<div class="sm muted" style="margin-bottom:12px"><b>'+gesproken+' van '+coachClients.length+'</b> klanten deze week gesproken · week van maandag <b>'+monLbl+'</b></div>'+
    '<div style="display:flex;gap:26px;flex-wrap:wrap">'+coachClients.map(p=>'<div class="cmav click" onclick="openClient(\''+p.id+'\')" style="cursor:pointer"><span class="bol" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</span>'+esc(p.first_name||naamVan(p))+' ('+(msgCount[p.id]||0)+')</div>').join("")+'</div>';
  // Activiteit: recente workouts met gelogde resultaten, als volledige kaarten
  const met=echte.filter(w=>rs.some(r=>r.workout_id===w.id)).slice(0,6);
  const feedHtml=met.length?met.map(w=>{
    const p=byId[w.client_id]||{};
    const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
    let done=0;
    const rij=(badge,titel,tekst,r)=>{
      const sc=resultScoreTxt(r);
      return '<div class="fbrow"><span class="fbadge">'+esc(badge)+'</span><div class="fbody"><b>'+esc(titel)+'</b>'+(tekst?'<div class="pr2">'+esc(tekst)+'</div>':'')+(sc?'<div class="loginp">'+esc(sc)+'</div>':'')+'</div>'+
        '<div class="fside">'+(r?'<span class="okc2'+(r.status==="missed"?" miss":"")+'"><svg class="i sm-i"><use href="#'+(r.status==="missed"?"i-x":"i-check")+'"/></svg></span>':'')+'<svg class="i sm-i" onclick="toast(\'History komt in een volgende stap\')" style="cursor:pointer"><use href="#i-hist"/></svg></div></div>';
    };
    let rows="";
    if(w.warmup)rows+=rij("W","Warmup",w.warmup,null);
    blocks.forEach(b=>{
      const r=resByBlock[b.id];if(r&&r.status==="completed")done++;
      rows+=rij(b.label||"•",b.exercise||"Onderdeel",composePresc(b),r);
    });
    return '<div class="feedcard"><div class="fh"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div style="flex:1"><b>'+naamVan(p)+'</b><div class="sm muted">Due '+esc(w.workout_date)+'</div></div></div>'+
      '<div class="fscore">'+done+'/'+blocks.length+'</div>'+rows+
      '<div class="notesend" style="display:flex;gap:6px;margin-top:10px;border-top:1px solid #f0f1f3;padding-top:10px"><button class="btn ghost sm" onclick="toast(\'Comments komen samen met de sporter-app\')"><svg class="i sm-i"><use href="#i-chat"/></svg> Comments</button><input placeholder="Note" style="flex:1;padding:7px 10px;font-size:12px" onkeydown="if(event.key===\'Enter\')stuurNote(\''+w.client_id+'\',this)"><button class="btn sm" onclick="stuurNote(\''+w.client_id+'\',this)">Send</button></div></div>';
  }).join(""):'<div class="feedcard"><div class="cempty">Nog geen gelogde workouts.<br>Zodra je sporters in de app resultaten invullen, verschijnen ze hier.</div></div>';
  // Mijn cijfers met 7/30/90 dagen (dropdown zoals het ontwerp)
  const fromP=ymd(addDays(new Date(),-(dashPeriode-1)));
  const sched=echte.filter(w=>w.workout_date>=fromP&&w.workout_date<=td);
  const done=sched.filter(w=>doneWo.has(w.id)).length;
  const pct=sched.length?Math.round(done/sched.length*100):null;
  const ringStyle=pct==null?'background:#e5e8eb':'background:conic-gradient(var(--accent) 0 '+pct+'%, #e5e8eb '+pct+'% 100%)';
  const perSel='<select onchange="dashSetPeriode(parseInt(this.value))" style="width:auto;font-size:12px;padding:5px 8px">'+[7,30,90].map(n=>'<option value="'+n+'"'+(dashPeriode===n?" selected":"")+'>'+n+' dagen</option>').join("")+'</select>';
  const ringHtml='<div class="statecard"><div class="ring" style="'+ringStyle+'"><i>'+(pct==null?'–':pct+'%')+'</i></div>'+
    '<div><b>Compliance klanten</b><div class="sm muted" style="margin-top:3px">'+(pct==null?'Geen geplande workouts in deze periode.':'Percentage van de voorgeschreven workouts dat je klanten echt gedaan hebben.')+'</div></div></div>';
  // Mijn taken (echt, uit de database)
  const open=tasks.filter(t=>!t.done),af=tasks.filter(t=>t.done);
  const lijst=dashTaken==="open"?open:af;
  const taakRows=lijst.map(t=>'<div style="display:flex;align-items:center;gap:9px;padding:7px 4px;border-bottom:1px solid #f0f1f3"><input type="checkbox" '+(t.done?"checked":"")+' onchange="taakToggle(\''+t.id+'\',this.checked)" style="width:15px;height:15px;flex:none"><span style="flex:1;font-size:12.5px;'+(t.done?"text-decoration:line-through;color:#8a919c":"")+'">'+esc(t.body)+'</span><span style="color:#b3b9c2;cursor:pointer;padding:0 4px" onclick="taakWeg(\''+t.id+'\')">×</span></div>').join("");
  const takenHtml='<div style="display:flex;gap:8px;margin-bottom:9px"><span class="fchip'+(dashTaken==="open"?" on":"")+'" onclick="dashSetTaken(\'open\')">Open'+(open.length?' ('+open.length+')':'')+'</span><span class="fchip'+(dashTaken==="af"?" on":"")+'" onclick="dashSetTaken(\'af\')">Afgerond'+(af.length?' ('+af.length+')':'')+'</span></div>'+
    '<div id="taak-row" style="display:none;gap:6px;margin-bottom:9px"><input id="taak-inp" placeholder="Nieuwe taak…" style="flex:1;padding:8px 10px;font-size:12.5px" onkeydown="if(event.key===\'Enter\')taakToevoegen()"><button class="btn sm" onclick="taakToevoegen()">Opslaan</button></div>'+
    '<div class="statecard" style="display:block;padding:6px 12px">'+(taakRows||'<div class="cempty" style="padding:16px 4px">'+(dashTaken==="open"?'Alles afgerond.<br><a style="color:var(--accent);cursor:pointer;font-weight:700" onclick="taakInvoer()">Klik hier</a> om een nieuwe taak te maken.':'Nog geen afgeronde taken.')+'</div>')+'</div>';
  // Workout van de week
  const deelnemers=new Set(blogRes.map(r=>r.athlete_id)).size;
  const vandaagN=blogRes.filter(r=>(r.created_at||"").slice(0,10)===td).length;
  const blogB=((blog||{}).blocks||[]).slice().sort((a,b)=>a.sort-b.sort)[0]||null;
  const blogSub=(blogB?(blogB.prescription||blogB.exercise||"").split("\n")[0]+" · ":"")+deelnemers+" deelnemers · "+vandaagN+" scores vandaag";
  const weekHtml=blog?'<div class="statecard" style="display:block"><div style="font-weight:800;font-size:14px">"'+esc(blog.title||"Weekworkout")+'"</div><div class="sm muted" style="margin:4px 0 12px">'+esc(blogSub)+'</div><button class="btn sm" onclick="coachGo(\'week\')">Bekijk leaderboard</button></div>'
    :'<div class="statecard" style="display:block"><div class="cempty" style="padding:8px 4px">Nog geen weekworkout ingepland.</div></div>';
  cp.innerHTML='<h1>Dashboard</h1><div class="dashgrid">'+
    '<div class="panel">'+
      '<div class="ctabs"><button class="on">Aandacht nodig</button><button onclick="toast(\'Inzichten komen later\')">Inzichten</button></div>'+
      chips+attnHtml+cmHtml+
      '<div style="display:flex;align-items:center;gap:14px;margin:26px 0 8px"><h2 style="margin:0">Activiteit</h2><div class="ctabs" style="margin:0"><button class="on">Workouts</button><button onclick="toast(\'Lifestyle komt later\')">Lifestyle</button><button onclick="toast(\'Check-ins komen later\')">Check-ins</button></div></div>'+
      feedHtml+
    '</div>'+
    '<div>'+
      '<div class="sideblock"><div class="shead"><h2>Mijn cijfers</h2>'+perSel+'</div>'+ringHtml+'</div>'+
      '<div class="sideblock"><div class="shead"><h2>Mijn taken</h2><button class="btn sm" onclick="taakInvoer()">+ Taak</button></div>'+takenHtml+'</div>'+
      '<div class="sideblock"><div class="shead"><h2>Workout van de week</h2>'+(blog?'<span class="cpill ok">live</span>':'')+'</div>'+weekHtml+'</div>'+
    '</div>'+
  '</div>';
}
function taakInvoer(){const r=document.getElementById("taak-row");if(!r)return;r.style.display="flex";const i=document.getElementById("taak-inp");if(i)i.focus();}
async function taakToevoegen(){
  const inp=document.getElementById("taak-inp");const v=(inp.value||"").trim();if(!v)return;
  const{data,error}=await db.from("tasks").insert({company_id:ME.profile.company_id,owner_id:ME.user.id,body:v}).select().single();
  if(error){toast(error.message||"Opslaan mislukt");return;}
  DASH.tasks.unshift(data);dashTaken="open";dashRender();
}
async function taakToggle(id,done){
  const{error}=await db.from("tasks").update({done}).eq("id",id);
  if(error){toast(error.message);return;}
  DASH.tasks.forEach(t=>{if(t.id===id)t.done=done;});dashRender();
}
async function taakWeg(id){
  const{error}=await db.from("tasks").delete().eq("id",id);
  if(error){toast(error.message);return;}
  DASH.tasks=DASH.tasks.filter(t=>t.id!==id);dashRender();
}
// Note op een activiteit = chatbericht naar de sporter (messages-tabel)
async function stuurNote(aid,el){
  const row=el.closest(".notesend");const inp=row.querySelector("input");
  const v=(inp.value||"").trim();if(!v)return;
  const p=coachClients.find(x=>x.id===aid)||{};
  const{error}=await db.from("messages").insert({company_id:ME.profile.company_id,athlete_id:aid,sender_id:ME.user.id,body:v});
  if(error){toast(error.message||"Versturen mislukt");return;}
  inp.value="";
  toast("Berichtje verstuurd naar "+(p.first_name||"de sporter")+", komt in de chat");
  DASH.msgs.push({athlete_id:aid,created_at:new Date().toISOString()});
  dashRender();
}
