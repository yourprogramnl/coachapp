// app/dashboard.js — het coach-dashboard: aandacht nodig, contactmomenten,
// activiteit-feed, mijn cijfers, mijn taken en workout van de week.
let dashPeriode=30,dashFilter="alles",dashTaken="open",DASH=null,dashFeedClient="all",dashStatIdx=0,dashShowHidden=false,dashFeedLimit=6;
async function fillDashboard(){
  const ids=coachClients.map(p=>p.id);
  const td=todayStr(),from90=ymd(addDays(new Date(),-89));
  let ws=[],rs=[],md=[],wc=[],msgs=[],blog=null,blogRes=[];
  if(ids.length){
    ws=(await db.from("workouts").select("*, blocks(*)").in("client_id",ids).gte("workout_date",from90).lte("workout_date",td).order("workout_date",{ascending:false})).data||[];
    const wids=ws.map(w=>w.id);
    if(wids.length)rs=(await db.from("results").select("*").in("workout_id",wids)).data||[];
    if(wids.length)md=(await db.from("result_media").select("*").in("workout_id",wids)).data||[];
    if(wids.length)wc=(await db.from("workout_comments").select("*").in("workout_id",wids).order("created_at")).data||[];
    msgs=(await db.from("messages").select("athlete_id,created_at").in("athlete_id",ids).gte("created_at",ymd(mondayOf(new Date())))).data||[];
  }
  const tasks=(await db.from("tasks").select("*").eq("owner_id",ME.user.id).order("created_at",{ascending:false})).data||[];
  const snoozeRows=(await db.from("attention_snooze").select("athlete_id,snoozed_until").eq("coach_id",ME.user.id)).data||[];
  const snoozeMap={};snoozeRows.forEach(s=>snoozeMap[s.athlete_id]=s.snoozed_until);
  if(ME.profile.company_id){
    blog=((await db.from("workouts").select("id,title,workout_date, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null).order("workout_date",{ascending:false}).limit(1)).data||[])[0]||null;
    if(blog)blogRes=(await db.from("results").select("athlete_id,created_at").eq("workout_id",blog.id)).data||[];
  }
  DASH={ws,rs,md,wc,msgs,tasks,blog,blogRes,snoozeMap};
  dashRender();
}
function dashSetFilter(f){dashFilter=f;dashRender();}
function dashSetPeriode(n){dashPeriode=n;dashRender();}
function dashSetTaken(t){dashTaken=t;dashRender();}
function dashSetFeedClient(v){dashFeedClient=v;dashFeedLimit=6;dashRender();}
function dashMeer(){dashFeedLimit+=6;dashRender();}
function dashStat(i){dashStatIdx=i;dashRender();}
function dashToggleHidden(){dashShowHidden=!dashShowHidden;dashRender();}
// Snooze: coach verbergt een klant tijdelijk uit 'Aandacht nodig'
function dashIsSnoozed(pid){const u=DASH&&DASH.snoozeMap&&DASH.snoozeMap[pid];return !!(u&&u>=todayStr());}
function snoozeDatum(k){if(k==="morgen")return ymd(addDays(new Date(),1));if(k==="maand")return ymd(addDays(new Date(),30));return ymd(mondayOf(addDays(new Date(),7)));}
async function dashSnooze(pid,k){
  const until=snoozeDatum(k);
  const{error}=await db.from("attention_snooze").upsert({company_id:ME.profile.company_id,coach_id:ME.user.id,athlete_id:pid,snoozed_until:until},{onConflict:"coach_id,athlete_id"});
  if(error){toast(error.message||"Verbergen mislukt");return;}
  DASH.snoozeMap[pid]=until;document.querySelectorAll(".attnmenu").forEach(x=>x.remove());
  dashRender();toast("Klant verborgen tot "+datumNL(until));
}
async function dashUnsnooze(pid){
  const{error}=await db.from("attention_snooze").delete().eq("coach_id",ME.user.id).eq("athlete_id",pid);
  if(error){toast(error.message||"Mislukt");return;}
  delete DASH.snoozeMap[pid];document.querySelectorAll(".attnmenu").forEach(x=>x.remove());
  dashRender();toast("Klant weer zichtbaar");
}
function dashKebab(ev,pid){
  ev.stopPropagation();
  const row=ev.target.closest(".attn-row"),bestond=row.querySelector(".attnmenu");
  document.querySelectorAll(".attnmenu").forEach(x=>x.remove());
  if(bestond)return; // openstaand menu = dichtklappen
  const snoozed=dashIsSnoozed(pid);
  const m=document.createElement("div");m.className="attnmenu";
  m.innerHTML='<button onclick="event.stopPropagation();openClient(\''+pid+'\')">Open klant</button>'+
    (snoozed?'<button onclick="event.stopPropagation();dashUnsnooze(\''+pid+'\')">Weer tonen</button>'
      :'<button onclick="event.stopPropagation();dashSnooze(\''+pid+'\',\'morgen\')">Verberg tot morgen</button>'+
       '<button onclick="event.stopPropagation();dashSnooze(\''+pid+'\',\'week\')">Verberg tot volgende week</button>'+
       '<button onclick="event.stopPropagation();dashSnooze(\''+pid+'\',\'maand\')">Verberg tot volgende maand</button>');
  row.appendChild(m);
}
document.addEventListener("click",e=>{if(!e.target.closest(".attnmenu")&&!e.target.closest(".attn-kebab"))document.querySelectorAll(".attnmenu").forEach(x=>x.remove());});
function dashRender(){
  const cp=document.getElementById("cpage");if(!cp||!DASH)return;
  const{ws,rs,md,wc,msgs,tasks,blog,blogRes}=DASH;
  const td=todayStr(),from7=ymd(addDays(new Date(),-6));
  const byId={};coachClients.forEach(p=>byId[p.id]=p);
  const echte=ws.filter(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  const doneWo=new Set(rs.filter(r=>r.status==="completed").map(r=>r.workout_id));
  const resByBlock={};rs.forEach(r=>resByBlock[r.block_id]=r);
  // Compliance per klant (laatste 30 dagen; alleen bij genoeg geplande workouts)
  const from30=ymd(addDays(new Date(),-29));
  const compVanKlant=pid=>{const s=echte.filter(w=>w.client_id===pid&&w.workout_date>=from30&&w.workout_date<=td);if(s.length<3)return null;return Math.round(s.filter(w=>doneWo.has(w.id)).length/s.length*100);};
  // Aandacht nodig
  const attn=[];let nTeDoen=0,nLaag=0;
  coachClients.forEach(p=>{
    const wos=echte.filter(w=>w.client_id===p.id);
    const teDoen=wos.some(w=>w.workout_date>=from7&&w.workout_date<=td&&!doneWo.has(w.id));
    const past=wos.filter(w=>w.workout_date<td).sort((a,b)=>b.workout_date.localeCompare(a.workout_date));
    let miss=0;for(const w of past){if(doneWo.has(w.id))break;miss++;}
    const comp=compVanKlant(p.id),laag=comp!=null&&comp<50;
    if(teDoen)nTeDoen++;
    if(laag)nLaag++;
    if(teDoen||miss>=2||laag){
      const pills=[];
      if(teDoen)pills.push('<span class="cpill teal">Workout te doen</span>');
      if(miss>=2)pills.push('<span class="cpill bad">'+miss+'x gemist op rij</span>');
      if(laag)pills.push('<span class="cpill bad">'+comp+'% compliance</span>');
      attn.push({p,pills,teDoen,laag});
    }
  });
  const nVerborgen=attn.filter(a=>dashIsSnoozed(a.p.id)).length;
  let attnZicht=dashShowHidden?attn:attn.filter(a=>!dashIsSnoozed(a.p.id));
  attnZicht=attnZicht.filter(a=>dashFilter==="alles"||(dashFilter==="tedoen"&&a.teDoen)||(dashFilter==="laag"&&a.laag));
  const attnRij=a=>{
    const s=dashIsSnoozed(a.p.id);
    return '<div class="attn-row'+(s?' snoozed':'')+'"><div class="cavc click" onclick="openClient(\''+a.p.id+'\')" style="'+avFotoStyle(a.p)+'">'+avFotoText(a.p)+'</div><div class="nm click" style="cursor:pointer" onclick="openClient(\''+a.p.id+'\')">'+naamVan(a.p)+'</div><div class="pills">'+a.pills.join("")+'</div>'+
      '<div class="rowicons"><svg class="i sm-i" title="Bericht" onclick="event.stopPropagation();dashBericht(\''+a.p.id+'\')"><use href="#i-chat"/></svg>'+
      '<svg class="i sm-i" title="'+(s?"Weer tonen":"Verberg tot volgende week")+'" onclick="event.stopPropagation();'+(s?"dashUnsnooze(\'"+a.p.id+"\')":"dashSnooze(\'"+a.p.id+"\',\'week\')")+'"><use href="#i-eye"/></svg>'+
      '<svg class="i sm-i" title="Open programma" onclick="event.stopPropagation();openClient(\''+a.p.id+'\')"><use href="#i-cal"/></svg>'+
      '<span class="attn-kebab" onclick="dashKebab(event,\''+a.p.id+'\')" style="cursor:pointer;font-weight:800;color:#8a919c;padding:0 4px">⋮</span></div></div>';
  };
  const verborgenLink=nVerborgen?'<div class="sm muted" style="padding:9px 14px;text-align:right;border-top:1px solid var(--line2)"><a style="color:var(--accent);cursor:pointer;font-weight:700" onclick="dashToggleHidden()">'+(dashShowHidden?"Verborgen klanten weer verbergen":nVerborgen+" verborgen · toon")+'</a></div>':'';
  const attnHtml='<div class="attn-card">'+(attnZicht.length?attnZicht.map(attnRij).join(""):'<div class="cempty">Niets dat nu je aandacht vraagt. 👍<br>Zodra een klant een workout mist, nog moet doen of laag scoort, zie je het hier.</div>')+verborgenLink+'</div>';
  const chips='<div style="display:flex;gap:8px;margin:10px 0 12px;flex-wrap:wrap">'+
    '<span class="fchip'+(dashFilter==="alles"?" on":"")+'" onclick="dashSetFilter(\'alles\')">Alles</span>'+
    '<span class="fchip'+(dashFilter==="tedoen"?" on":"")+'" onclick="dashSetFilter(\'tedoen\')">Workout te doen ('+nTeDoen+')</span>'+
    '<span class="fchip'+(dashFilter==="laag"?" on":"")+'" onclick="dashSetFilter(\'laag\')">Lage compliance ('+nLaag+')</span></div>';
  // Contactmomenten: chat-berichten deze week per klant
  const msgCount={};msgs.forEach(m=>msgCount[m.athlete_id]=(msgCount[m.athlete_id]||0)+1);
  const gesproken=coachClients.filter(p=>msgCount[p.id]).length;
  const cmPct=coachClients.length?Math.round(gesproken/coachClients.length*100):0;
  const mon=mondayOf(new Date());
  const monLbl=("0"+mon.getDate()).slice(-2)+"-"+("0"+(mon.getMonth()+1)).slice(-2)+"-"+mon.getFullYear();
  const cmHtml='<h2 style="margin:22px 0 4px">Contactmomenten <span class="muted" style="font-weight:600">('+cmPct+'%)</span></h2>'+
    '<div class="sm muted" style="margin-bottom:12px"><b>'+gesproken+' van '+coachClients.length+'</b> klanten deze week gesproken · week van maandag <b>'+monLbl+'</b></div>'+
    '<div style="display:flex;gap:26px;flex-wrap:wrap">'+coachClients.map(p=>'<div class="cmav click" onclick="openClient(\''+p.id+'\')" style="cursor:pointer"><span class="bol" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</span>'+esc(p.first_name||naamVan(p))+' ('+(msgCount[p.id]||0)+')</div>').join("")+'</div>';
  // Activiteit: recente workouts met gelogde resultaten, als volledige kaarten (optioneel op één klant gefilterd)
  let metAll=echte.filter(w=>rs.some(r=>r.workout_id===w.id));
  if(dashFeedClient!=="all")metAll=metAll.filter(w=>w.client_id===dashFeedClient);
  const met=metAll.slice(0,dashFeedLimit);
  const meerLink=metAll.length>dashFeedLimit?'<div style="text-align:center;margin-top:12px"><button class="btn ghost sm" onclick="dashMeer()">Meer laden ('+(metAll.length-dashFeedLimit)+')</button></div>':'';
  const feedHtml=met.length?met.map(w=>{
    const p=byId[w.client_id]||{};
    const blocks=(w.blocks||[]).slice().sort((a,b)=>a.sort-b.sort);
    let done=0;
    const rij=(badge,titel,tekst,r,vids)=>{
      const sc=resultScoreTxt(r);
      // Video-uploads van het lid bij dit blok (result_media): klik = bekijken via signed URL
      const vidHtml=(vids&&vids.length)?'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">'+vids.map((v,i)=>'<button class="btn ghost sm" style="padding:3px 10px;font-size:11px" onclick="dashVideoOpen(\''+esc(v.storage_path)+'\')">🎥 Video '+(i+1)+'</button>').join("")+'</div>':'';
      // Vinkje/kruisje: klikbaar om tussen voltooid en gemist te wisselen (coach corrigeert de status)
      const statusBtn=r?'<span class="okc2'+(r.status==="missed"?" miss":"")+'" style="cursor:pointer" title="'+(r.status==="missed"?"Gemist — klik om op voltooid te zetten":"Voltooid — klik om op gemist te zetten")+'" onclick="dashToggleStatus(\''+r.id+'\',\''+r.status+'\')"><svg class="i sm-i"><use href="#'+(r.status==="missed"?"i-x":"i-check")+'"/></svg></span>':'';
      // Geschiedenis-knop: opent de geschiedenis-zoeker voor deze klant + oefening (niet bij de warming-up)
      const histBtn=badge!=="W"?'<svg class="i sm-i" title="Zoek in geschiedenis" style="cursor:pointer" data-aid="'+esc(w.client_id)+'" data-ex="'+esc(titel)+'" onclick="dashHistory(this)"><use href="#i-hist"/></svg>':'';
      const noot=(r&&r.note)?'<div class="pr2" style="font-style:italic;color:#8a919c">💬 '+esc(r.note)+'</div>':'';
      return '<div class="fbrow"><span class="fbadge">'+esc(badge)+'</span><div class="fbody"><b>'+esc(titel)+'</b>'+(tekst?'<div class="pr2">'+esc(tekst)+'</div>':'')+(sc?'<div class="loginp">'+esc(sc)+'</div>':'')+noot+vidHtml+'</div>'+
        '<div class="fside">'+statusBtn+histBtn+'</div></div>';
    };
    let rows="";
    if(w.warmup)rows+=rij("W","Warmup",w.warmup,null);
    blocks.forEach(b=>{
      const r=resByBlock[b.id];if(r&&r.status==="completed")done++;
      const vids=(md||[]).filter(m=>m.block_id===b.id&&m.athlete_id===w.client_id);
      rows+=rij(b.label||"•",b.exercise||"Onderdeel",composePresc(b),r,vids);
    });
    return '<div class="feedcard"><div class="fh"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div style="flex:1"><b>'+naamVan(p)+'</b><div class="sm muted">Gedaan op '+esc(datumNL(w.workout_date))+'</div></div></div>'+
      '<div class="fscore">'+done+'/'+blocks.length+'</div>'+rows+
      '<div class="notesend" style="display:flex;gap:6px;margin-top:10px;border-top:1px solid #f0f1f3;padding-top:10px">'+wcKnopHtml(w)+'<input placeholder="Note" style="flex:1;padding:7px 10px;font-size:12px" onkeydown="if(event.key===\'Enter\')stuurNote(\''+w.client_id+'\',this)"><button class="btn sm" onclick="stuurNote(\''+w.client_id+'\',this)">Send</button></div></div>';
  }).join(""):'<div class="feedcard"><div class="cempty">Nog geen gelogde workouts.<br>Zodra je sporters in de app resultaten invullen, verschijnen ze hier.</div></div>';
  // Mijn cijfers als carrousel (compliance + contactmomenten + aandacht), 7/30/90 dagen voor compliance
  const fromP=ymd(addDays(new Date(),-(dashPeriode-1)));
  const sched=echte.filter(w=>w.workout_date>=fromP&&w.workout_date<=td);
  const done=sched.filter(w=>doneWo.has(w.id)).length;
  const pct=sched.length?Math.round(done/sched.length*100):null;
  const perSel='<select onchange="dashSetPeriode(parseInt(this.value))" style="width:auto;font-size:12px;padding:5px 8px">'+[7,30,90].map(n=>'<option value="'+n+'"'+(dashPeriode===n?" selected":"")+'>'+n+' dagen</option>').join("")+'</select>';
  const ringCss=(val,kleur)=>val==null?'background:#e5e8eb':'background:conic-gradient('+(kleur||'var(--accent)')+' 0 '+val+'%, #e5e8eb '+val+'% 100%)';
  const cardCompliance='<div class="statecard"><div class="ring" style="'+ringCss(pct)+'"><i>'+(pct==null?'–':pct+'%')+'</i></div>'+
    '<div><b>Compliance klanten</b><div class="sm muted" style="margin-top:3px">'+(pct==null?'Geen geplande workouts in deze periode.':'Percentage van de voorgeschreven workouts dat je klanten echt gedaan hebben.')+'</div></div></div>';
  const cardTouch='<div class="statecard"><div class="ring" style="'+ringCss(cmPct,'#8b5cf6')+'"><i>'+cmPct+'%</i></div>'+
    '<div><b>Contactmomenten</b><div class="sm muted" style="margin-top:3px">'+gesproken+' van '+coachClients.length+' klanten deze week gesproken.</div></div></div>';
  const cardAandacht='<div class="statecard"><div class="statbig">'+(nTeDoen+nLaag)+'</div>'+
    '<div><b>Vraagt aandacht</b><div class="sm muted" style="margin-top:3px">'+nTeDoen+' met workout te doen · '+nLaag+' met lage compliance.</div></div></div>';
  const statCards=[cardCompliance,cardTouch,cardAandacht];
  if(dashStatIdx>=statCards.length)dashStatIdx=0;
  const statDots=statCards.map((_,i)=>'<span class="statdot'+(i===dashStatIdx?" on":"")+'" onclick="dashStat('+i+')" title="Cijfer '+(i+1)+'"></span>').join("");
  const ringHtml=statCards[dashStatIdx]+'<div class="statdots">'+statDots+'</div>';
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
      '<div class="ctabs"><button class="on">Aandacht nodig</button></div>'+
      chips+attnHtml+cmHtml+
      '<div style="display:flex;align-items:center;gap:14px;margin:26px 0 8px;flex-wrap:wrap"><h2 style="margin:0">Activiteit</h2>'+
        '<select onchange="dashSetFeedClient(this.value)" style="width:auto;font-size:12px;padding:5px 8px"><option value="all">Alle klanten</option>'+coachClients.slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b))).map(p=>'<option value="'+p.id+'"'+(dashFeedClient===p.id?" selected":"")+'>'+esc(naamVan(p))+'</option>').join("")+'</select>'+
        '<div class="ctabs" style="margin:0"><button class="on">Workouts</button><button onclick="toast(\'Lifestyle komt later\')">Lifestyle</button><button onclick="toast(\'Check-ins komen later\')">Check-ins</button></div></div>'+
      feedHtml+meerLink+
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
// ---------- Dag-reacties (workout_comments): feedback per workout-dag, los van de chat ----------
let wcWid=null,wcAid=null,WCC=[]; // WCC = de open draad (vers uit de database)
// Knop op de feedkaart: teller + rood bolletje bij ongelezen reacties van het lid.
function wcKnopHtml(w){
  const items=(DASH.wc||[]).filter(m=>m.workout_id===w.id&&m.athlete_id===w.client_id);
  const ongelezen=items.filter(m=>m.author_id===m.athlete_id&&!m.read_at).length;
  const dot=ongelezen?'<span style="display:inline-block;min-width:15px;height:15px;border-radius:999px;background:#e11d48;color:#fff;font-size:10px;font-weight:800;line-height:15px;text-align:center;padding:0 3px;margin-left:4px">'+ongelezen+'</span>':'';
  return '<button class="btn ghost sm" onclick="dashComments(\''+w.id+'\',\''+w.client_id+'\')"><svg class="i sm-i"><use href="#i-chat"/></svg> Reacties'+(items.length?' ('+items.length+')':'')+dot+'</button>';
}
function ensureWcModal(){
  if(document.getElementById("wcmodal"))return;
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal" id="wcmodal" style="z-index:430"><div class="box" style="width:520px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:4px"><div><h3 style="margin:0">Reacties</h3><div class="sm muted" id="wc-sub" style="margin-top:2px"></div></div>'+
    '<span onclick="closeWc()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin:6px 0 8px">Feedback bij deze workout-dag. De klant ziet dit in de app bij die dag, los van de chat.</div>'+
    '<div id="wc-body" style="max-height:48vh;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:4px 0;background:#f6f7f9;border-radius:10px;padding:10px"></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px"><input id="wc-inp" placeholder="Schrijf een reactie…" style="flex:1" onkeydown="if(event.key===\'Enter\')wcStuur()"><button class="btn" onclick="wcStuur()">Stuur</button></div>'+
    '</div></div>';
  document.body.appendChild(wrap.firstChild);
  document.getElementById("wcmodal").addEventListener("click",e=>{if(e.target.id==="wcmodal")closeWc();});
}
function closeWc(){const m=document.getElementById("wcmodal");if(m)m.classList.remove("show");wcWid=null;wcAid=null;WCC=[];}
function wcRender(){
  const host=document.getElementById("wc-body");if(!host)return;
  host.innerHTML=WCC.map(m=>{
    const mij=m.author_id===ME.user.id;
    const naam=m.author_id===m.athlete_id?naamVan(coachClients.find(x=>x.id===m.athlete_id)||{}):(mij?"Jij":"Coach");
    return '<div class="bub '+(mij?"me":"them")+'">'+esc(m.body)+'<div class="meta">'+esc(naam)+' · '+tijdNL(m.created_at)+'</div></div>';
  }).join("")||'<div class="sm muted" style="text-align:center;padding:10px">Nog geen reacties op deze dag. Schrijf de eerste.</div>';
  host.scrollTop=host.scrollHeight;
}
// Ververs de tellers op het scherm dat open staat (dashboard-feed of klant-kalender).
function wcVerversUI(){
  if(document.querySelector(".client-layout")){if(typeof renderMonth==="function")renderMonth({skipFetch:true});}
  else if(DASH&&coachSection==="dash")dashRender();
}
// Gedeeld: opent het reacties-venster voor een workout-dag (haalt de draad vers op).
async function openDayComments(wid,aid){
  ensureWcModal();
  wcWid=wid;wcAid=aid;
  const p=coachClients.find(x=>x.id===aid)||{};
  const{data:rows}=await db.from("workout_comments").select("*").eq("workout_id",wid).eq("athlete_id",aid).order("created_at");
  WCC=rows||[];
  const w=(DASH&&(DASH.ws||[]).find(x=>x.id===wid))||(typeof monthWorkouts!=="undefined"&&monthWorkouts[wid])||{};
  document.getElementById("wc-sub").textContent=naamVan(p)+(w.workout_date?" · "+datumNL(w.workout_date):"");
  document.getElementById("wc-inp").value="";
  wcRender();
  document.getElementById("wcmodal").classList.add("show");
  // Reacties van het lid op gelezen zetten (alleen de eigen coach mag dat)
  if(p.coach_id===ME.user.id){
    const ids=WCC.filter(m=>m.author_id===m.athlete_id&&!m.read_at).map(m=>m.id);
    if(ids.length){
      try{
        await db.from("workout_comments").update({read_at:new Date().toISOString()}).in("id",ids);
        const nu=new Date().toISOString();
        const zet=m=>{if(ids.includes(m.id))m.read_at=nu;};
        WCC.forEach(zet);
        if(DASH&&DASH.wc)DASH.wc.forEach(zet);
        if(typeof monthComments!=="undefined")monthComments.forEach(zet);
        wcVerversUI();
      }catch(e){}
    }
  }
}
function dashComments(wid,aid){return openDayComments(wid,aid);} // oude naam blijft werken
async function wcStuur(){
  const inp=document.getElementById("wc-inp");
  const tekst=(inp.value||"").trim();if(!tekst||!wcWid)return;
  const{data,error}=await db.from("workout_comments").insert({
    workout_id:wcWid,athlete_id:wcAid,company_id:ME.profile.company_id,author_id:ME.user.id,body:tekst
  }).select().single();
  if(error){toast(error.message||"Versturen mislukt");return;}
  inp.value="";
  const rij=data||{workout_id:wcWid,athlete_id:wcAid,author_id:ME.user.id,body:tekst,created_at:new Date().toISOString()};
  WCC.push(rij);
  if(DASH&&DASH.wc)DASH.wc.push(rij);
  if(typeof monthComments!=="undefined")monthComments.push(rij);
  wcRender();
  wcVerversUI(); // teller op de kaart bijwerken
}
// Video van een lid afspelen: groot in het midden van het scherm (signed URL uit de private media-bucket).
async function vidSpeel(pad){
  const{data,error}=await db.storage.from("media").createSignedUrl(pad,3600);
  if(error||!data||!data.signedUrl){toast("Video openen mislukt");return;}
  let ov=document.getElementById("vidoverlay");
  if(!ov){
    ov=document.createElement("div");ov.id="vidoverlay";
    ov.addEventListener("click",e=>{if(e.target.id==="vidoverlay"||e.target.classList.contains("vx"))vidSluit();});
    document.body.appendChild(ov);
  }
  ov.innerHTML='<span class="vx" title="Sluiten">×</span><video src="'+esc(data.signedUrl)+'" controls autoplay playsinline></video>';
  ov.style.display="flex";
}
function vidSluit(){const ov=document.getElementById("vidoverlay");if(ov){ov.style.display="none";ov.innerHTML="";}}
function dashVideoOpen(pad){return vidSpeel(pad);} // oude naam blijft werken
// Vinkje/kruisje in de feed: wissel de status van een gelogd blok (voltooid <-> gemist).
async function dashToggleStatus(resId,huidig){
  const nieuw=huidig==="completed"?"missed":"completed";
  const patch=nieuw==="missed"?{status:"missed",score_text:null,time_seconds:null,load_kg:null,reps:null,rounds:null}:{status:"completed"};
  const{error}=await db.from("results").update(patch).eq("id",resId);
  if(error){toast(error.message||"Bijwerken mislukt");return;}
  (DASH.rs||[]).forEach(r=>{if(r.id===resId)Object.assign(r,patch);});
  dashRender();
  toast(nieuw==="completed"?"Op voltooid gezet":"Op gemist gezet");
}
// Bericht-icoon in Aandacht nodig: open de Berichten-sectie met het gesprek van deze klant.
function dashBericht(aid){
  BER.cur=aid; // fillBerichten laat de selectie staan als de klant in de lijst zit
  coachGo("msgs");
}
// Geschiedenis-knop in de feed: open de geschiedenis-zoeker voor deze klant + oefening.
function dashHistory(el){
  const aid=el.getAttribute("data-aid"),ex=el.getAttribute("data-ex");
  if(aid)calClient=aid; // de geschiedenis-zoeker (histZoek) filtert op calClient
  openHistory(ex||"");
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
