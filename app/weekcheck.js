// app/weekcheck.js — Weekcheck per trainingsdag (18 nov 2026, wens Stefan na de coachronde)
// Coaches programmeren per weekdag: op maandag voor de klanten met de dagtag
// Maandag, op dinsdag voor Dinsdag, enzovoort (dagtags: app/dag-tags.js). Voor
// ze gaan programmeren willen ze per atleet zien hoe de week ging: wat is er
// gedaan, gemist, gelogd, gezegd (reacties en chat) en waar klinkt een blessure.
// Daarna afvinken; de afgevinkte week met de notitie van de coach blijft in het
// dossier van de atleet staan (tabel week_checks, alleen voor coaches).
//
// Het scherm is een tabblad van Meldingen (app/notificaties.js roept wcVul aan).
// Periode bij een dag: de zeven dagen ervoor. Op maandag 16 nov dus maandag 9
// t/m zondag 15 nov. Zo sluiten de weken op elkaar aan: wat een atleet op de
// programmeerdag zelf logt, valt in de week erna en raakt nooit tussen wal en schip.
const WC={dag:null,terug:0,coach:"",open:new Set(),notities:{},afgOpen:false,gen:0,data:null,coaches:null,fout:""};
const WC_DAG=["Maandag","Dinsdag","Woensdag","Donderdag","Vrijdag","Zaterdag","Zondag"];
const WC_DAGK=["ma","di","wo","do","vr","za","zo"];
const WC_ZONDER=-1; // de knop "Zonder dag"

// ---------- Datums ----------
const wcVandaagIdx=()=>(new Date().getDay()+6)%7;
// De programmeerdag: de laatste keer dat het deze weekdag was (vandaag telt mee), n weken terug.
function wcProgDag(dagIdx,terug){
  const t=new Date();t.setHours(12,0,0,0);
  return addDays(t,-((wcVandaagIdx()-dagIdx+7)%7)-7*(terug||0));
}
function wcPeriode(dagIdx,terug){
  const d=wcProgDag(dagIdx,terug);
  return {van:ymd(addDays(d,-7)),tot:ymd(addDays(d,-1)),na:ymd(d)};
}
function wcDatum(ds){const d=new Date(String(ds).slice(0,10)+"T12:00:00");return isNaN(d)?"":WC_DAGK[(d.getDay()+6)%7]+" "+d.getDate()+" "+MAANDKORT[d.getMonth()];}
const wcDatumVan=ts=>{const d=new Date(ts);return isNaN(d)?"":ymd(d);};

// ---------- Signaalwoorden ----------
// Zelfde lijst als "Deze week per klant" (SIGNAALWOORDEN in notificaties.js),
// maar korte woorden tellen alleen als los woord: "moe" mag niet afgaan op
// "moet" of "moeilijk", "rug" niet op "terug".
function wcSignalen(tekst){
  const s=String(tekst||"").toLowerCase();if(!s)return [];
  return SIGNAALWOORDEN.filter(w=>{
    if(w.length>3)return s.includes(w);
    return new RegExp("(^|[^a-zà-ÿ])"+w+"($|[^a-zà-ÿ])").test(s);
  });
}
function wcMarkeer(tekst){
  let uit=esc(tekst||"");
  wcSignalen(tekst).sort((a,b)=>b.length-a.length).forEach(w=>{
    const kern=w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const re=w.length>3?new RegExp("("+kern+")(?![^<]*>)","gi"):new RegExp("(^|[^a-zà-ÿ<>])("+kern+")(?=$|[^a-zà-ÿ])(?![^<]*>)","gi");
    uit=w.length>3?uit.replace(re,'<b class="wc-sig">$1</b>'):uit.replace(re,'$1<b class="wc-sig">$2</b>');
  });
  return uit;
}

// ---------- Wie hoort bij welke dag ----------
const wcTag=i=>KSTAG.tags.find(t=>dagTagIndex(t)===i)||null;
function wcBasisKlanten(){
  const alle=actieveKlanten();
  return (myRole()!=="coach"&&WC.coach)?alle.filter(p=>p.coach_id===WC.coach):alle;
}
function wcKlantenVan(dagIdx){
  if(dagIdx===WC_ZONDER)return wcBasisKlanten().filter(p=>!ksHeeftDag(p));
  const t=wcTag(dagIdx);if(!t)return [];
  return wcBasisKlanten().filter(p=>ksHeeftTag(p,t.id));
}
const wcCheckVan=(aid,tot)=>((WC.data&&WC.data.checks)||[]).find(c=>c.athlete_id===aid&&c.period_to===tot)||null;

// ---------- Laden ----------
async function wcIn(tabel,kolommen,veld,ids,extra){
  let uit=[];
  for(let i=0;i<ids.length;i+=150){
    let q=db.from(tabel).select(kolommen).in(veld,ids.slice(i,i+150));
    if(extra)q=extra(q);
    const{data,error}=await q;
    if(error)throw error;
    uit=uit.concat(data||[]);
  }
  return uit;
}
async function wcVul(){
  const host=document.getElementById("nc-body");if(!host)return;
  const gen=++WC.gen;
  host.innerHTML='<div class="spin">Laden…</div>';
  WC.fout="";
  try{
    await ksTagsLaad();
    if(KSTAG.fout)throw new Error("Tags laden mislukt");
    if(WC.dag==null){const v=wcVandaagIdx();WC.dag=wcTag(v)?v:(WC_DAG.map((_,i)=>i).find(i=>wcTag(i))??v);}
    if(myRole()!=="coach"&&!WC.coaches){try{const{data}=await db.rpc("company_coaches");WC.coaches=data||[];}catch(e){WC.coaches=[];}}
    const alleIds=wcBasisKlanten().map(p=>p.id);
    const D={workouts:[],results:[],effort:[],media:[],comments:[],msgs:[],metrics:[],prs:null,checks:[]};
    // Afgevinkte weken: voor de tellers op de dagknoppen en voor de gekozen periode.
    if(alleIds.length){
      const oudste=ymd(addDays(new Date(),-9-7*WC.terug));
      D.checks=await wcIn("week_checks","*","athlete_id",alleIds,q=>q.gte("period_to",oudste));
    }
    const klanten=wcKlantenVan(WC.dag);
    const ids=klanten.map(p=>p.id);
    if(WC.dag!==WC_ZONDER&&ids.length){
      const per=wcPeriode(WC.dag,WC.terug);
      const[wos,com,msgs,mets]=await Promise.all([
        wcIn("workouts","id,client_id,workout_date,title,created_at, blocks(id,label,exercise,kind,score_type,sort,linked,group_title)","client_id",ids,q=>q.gte("workout_date",per.van).lte("workout_date",per.tot).order("workout_date")),
        wcIn("workout_comments","id,workout_id,athlete_id,author_id,body,created_at","athlete_id",ids,q=>q.gte("created_at",per.van).lt("created_at",per.na).order("created_at")),
        wcIn("messages","id,athlete_id,sender_id,body,created_at","athlete_id",ids,q=>q.gte("created_at",per.van).lt("created_at",per.na).order("created_at")),
        wcIn("metrics","athlete_id,metric,value,unit,measured_at,result_id","athlete_id",ids,q=>q.gte("measured_at",per.van).lte("measured_at",per.tot)),
      ]);
      D.workouts=wos;D.comments=com;D.msgs=msgs;D.metrics=mets;
      const wids=wos.map(w=>w.id);
      if(wids.length){
        const[rs,ef,md]=await Promise.all([
          wcIn("results","*","workout_id",wids),
          wcIn("workout_effort","workout_id,athlete_id,rpe,minutes","workout_id",wids),
          wcIn("result_media","block_id,workout_id,athlete_id,storage_path","workout_id",wids).catch(()=>[]),
        ]);
        D.results=rs;D.effort=ef;D.media=md;
      }
      // Records uit de krachtlog rekenen over de hele historie en duren even:
      // het scherm tekent eerst, de records komen erbij zodra ze er zijn.
      db.rpc("lift_prs",{p_athletes:ids,p_from:per.van,p_to:per.tot}).then(r=>{
        if(gen!==WC.gen||!WC.data)return;
        WC.data.prs=(r&&r.data)||[];wcTeken();
      },()=>{if(gen===WC.gen&&WC.data){WC.data.prs=[];}});
    }
    if(gen!==WC.gen)return;
    WC.data=D;
  }catch(e){
    if(gen!==WC.gen)return;
    WC.data=null;WC.fout=(e&&e.message)||"Laden mislukt";
  }
  wcTeken();
}

// ---------- Samenvatting per atleet ----------
function wcSamenvat(p){
  const D=WC.data;
  const wos=D.workouts.filter(w=>w.client_id===p.id);
  const echte=wos.filter(w=>(w.blocks||[]).length);
  const resVan=wid=>D.results.filter(r=>r.workout_id===wid&&r.athlete_id===p.id);
  const gedaan=echte.filter(w=>resVan(w.id).some(r=>r.status==="completed")).length;
  const mijn=D.results.filter(r=>r.athlete_id===p.id);
  const gemist=mijn.filter(r=>r.status==="missed").length;
  const notities=mijn.filter(r=>(r.note||"").trim());
  const reactiesLid=D.comments.filter(c=>c.athlete_id===p.id&&c.author_id===p.id);
  const chatLid=D.msgs.filter(m=>m.athlete_id===p.id&&m.sender_id===p.id);
  const prs=((D.prs||[]).filter(x=>x.athlete_id===p.id).length)+D.metrics.filter(m=>m.athlete_id===p.id&&!m.result_id).length;
  const sig=new Set();
  notities.forEach(r=>wcSignalen(r.note).forEach(w=>sig.add(w)));
  mijn.forEach(r=>wcSignalen(r.score_text).forEach(w=>sig.add(w)));
  reactiesLid.forEach(c=>wcSignalen(c.body).forEach(w=>sig.add(w)));
  chatLid.forEach(m=>wcSignalen(m.body).forEach(w=>sig.add(w)));
  return {gepland:echte.length,gedaan,gemist,prs,reacties:reactiesLid.length+notities.length,chat:chatLid.length,signalen:[...sig]};
}
function wcSamenvatTekst(s){
  if(!s)return "";
  const d=[];
  d.push(s.gepland?(s.gedaan+" van "+s.gepland+" sessies"):"geen sessies gepland");
  if(s.gemist)d.push(s.gemist+(s.gemist===1?" onderdeel":" onderdelen")+" gemist");
  if(s.prs)d.push(s.prs+(s.prs===1?" PR":" PR's"));
  if(s.reacties)d.push(s.reacties+(s.reacties===1?" reactie":" reacties"));
  if(s.chat)d.push(s.chat+(s.chat===1?" chatbericht":" chatberichten"));
  if(s.gepland&&s.gedaan===s.gepland&&d.length===1)d.push("geen bijzonderheden");
  return d.join(" · ");
}
const wcSigChips=s=>(s&&s.signalen&&s.signalen.length)?s.signalen.slice(0,4).map(w=>'<span class="wc-sigchip" title="Dit woord staat in een notitie, reactie of chatbericht van deze week">'+esc(w)+'</span>').join(""):"";

// ---------- Tekenen ----------
function wcTeken(){
  const host=document.getElementById("nc-body");if(!host||ncTab!=="check")return;
  if(WC.fout){host.innerHTML='<div class="cempty">'+esc(WC.fout)+' <a href="#" onclick="wcVul();return false">Opnieuw proberen</a></div>';return;}
  if(!WC.data){host.innerHTML='<div class="spin">Laden…</div>';return;}
  if(!ksDagTagsBestaan()){
    host.innerHTML='<div class="cempty">Er zijn nog geen dagtags. Maak op de Klanten-pagina via Tags beheren de tags Maandag tot en met Zondag aan en geef elke klant zijn dag.</div>';
    return;
  }
  // Dagknoppen met tellers
  const knop=i=>{
    const t=wcTag(i);if(!t)return "";
    const ks=wcKlantenVan(i),tot=wcPeriode(i,0).tot;
    const open=ks.filter(p=>!wcCheckVan(p.id,tot)).length;
    const lbl=!ks.length?"0":(WC.terug?String(ks.length):(open?open+" open":"klaar"));
    return '<button class="wc-dagknop'+(WC.dag===i?" on":"")+(i===wcVandaagIdx()?" vandaag":"")+(!WC.terug&&ks.length&&!open?" klaar":"")+'" onclick="wcKiesDag('+i+')">'+WC_DAG[i]+' <span>'+lbl+'</span></button>';
  };
  const zonder=wcKlantenVan(WC_ZONDER);
  const knoppen=WC_DAG.map((_,i)=>knop(i)).join("")+
    (zonder.length?'<button class="wc-dagknop zonder'+(WC.dag===WC_ZONDER?" on":"")+'" onclick="wcKiesDag('+WC_ZONDER+')">Zonder dag <span>'+zonder.length+'</span></button>':'');
  // Coachkiezer voor eigenaar en beheerder
  let coachSel="";
  if(myRole()!=="coach"){
    const metKlant=new Set(actieveKlanten().map(p=>p.coach_id).filter(Boolean));
    const cs=(WC.coaches||[]).filter(c=>metKlant.has(c.id)).sort((a,b)=>String(a.first_name||"").localeCompare(String(b.first_name||"")));
    if(cs.length>1)coachSel='<select onchange="wcKiesCoach(this.value)" style="width:auto;font-size:12px;padding:5px 8px"><option value="">Alle coaches</option>'+
      cs.map(c=>'<option value="'+esc(c.id)+'"'+(WC.coach===c.id?" selected":"")+'>'+esc([c.first_name,c.last_name].filter(Boolean).join(" "))+'</option>').join("")+'</select>';
  }
  let kop='<div class="wc-knoppen">'+knoppen+'</div>';
  if(WC.dag===WC_ZONDER){
    host.innerHTML=kop+(coachSel?'<div class="wc-balk">'+coachSel+'</div>':'')+
      '<div class="sm muted" style="margin-bottom:10px">Deze klanten hebben nog geen dagtag en komen daarom in geen enkele weekcheck voor. Geef ze een dag op de Klanten-pagina.</div>'+
      '<div class="attn-card">'+(zonder.map(p=>'<div class="wc-rij"><div class="wc-kop" onclick="openClient(\''+p.id+'\')"><div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div><div class="wc-naam"><b>'+naamVan(p)+'</b></div></div></div>').join("")||'<div class="cempty">Iedereen heeft een dag.</div>')+'</div>'+
      '<div style="margin-top:12px"><button class="btn ghost sm" onclick="renderCoach(\'clients\')">Naar de Klanten-pagina</button></div>';
    return;
  }
  const per=wcPeriode(WC.dag,WC.terug);
  const klanten=wcKlantenVan(WC.dag).slice().sort((a,b)=>naamVan(a).localeCompare(naamVan(b)));
  const rijen=klanten.map(p=>({p,s:wcSamenvat(p),check:wcCheckVan(p.id,per.tot)}));
  const open=rijen.filter(r=>!r.check),klaar=rijen.filter(r=>r.check);
  // Signalen bovenaan, daarna wie iets miste, daarna de rest
  open.sort((a,b)=>(b.s.signalen.length?1:0)-(a.s.signalen.length?1:0)||(b.s.gemist?1:0)-(a.s.gemist?1:0));
  const balk='<div class="wc-balk">'+
    '<button class="sqbtn" title="Een week eerder" onclick="wcWeek(1)">‹</button>'+
    '<b>'+wcDatum(per.van)+' t/m '+wcDatum(per.tot)+'</b>'+
    '<button class="sqbtn" title="Een week later"'+(WC.terug?'':' disabled')+' onclick="wcWeek(-1)">›</button>'+
    '<span class="sm muted">'+klanten.length+(klanten.length===1?" atleet":" atleten")+' met '+WC_DAG[WC.dag]+' · '+klaar.length+' afgevinkt</span>'+
    coachSel+'</div>';
  let body;
  if(!klanten.length)body='<div class="cempty">Geen klanten met de dagtag '+WC_DAG[WC.dag]+'. Geef klanten hun dag op de Klanten-pagina.</div>';
  else body=(open.length?'<div class="attn-card">'+open.map(wcRijHtml).join("")+'</div>':'<div class="cempty">Alles afgevinkt voor '+WC_DAG[WC.dag]+'.</div>')+
    (klaar.length?'<div class="wc-afgkop" onclick="wcAfgToggle()">'+(WC.afgOpen?"▾":"▸")+' Afgevinkt ('+klaar.length+')</div>'+
      (WC.afgOpen?'<div class="attn-card">'+klaar.map(wcRijHtml).join("")+'</div>':''):'');
  host.innerHTML=kop+balk+body;
}
function wcRijHtml(r){
  const p=r.p,id=p.id,isOpen=WC.open.has(id);
  const sub=r.check?('Afgevinkt op '+wcDatum(wcDatumVan(r.check.created_at))+' · '+wcSamenvatTekst(r.check.summary||r.s)):wcSamenvatTekst(r.s);
  return '<div class="wc-rij'+(isOpen?" open":"")+(r.check?" klaar":"")+'" data-wc="'+id+'">'+
    '<div class="wc-kop" onclick="wcToggle(\''+id+'\')"><span class="wc-pijl">'+(isOpen?"▾":"▸")+'</span>'+
      '<div class="cavc" style="'+avFotoStyle(p)+'">'+avFotoText(p)+'</div>'+
      '<div class="wc-naam"><b>'+naamVan(p)+'</b>'+wcSigChips(r.s)+'<div class="sm muted">'+esc(sub)+'</div></div>'+
      (r.check?'<button class="btn ghost sm" title="Zet deze atleet terug in de lijst" onclick="event.stopPropagation();wcTerugzetten(\''+r.check.id+'\')">Terugzetten</button>'
        :'<button class="btn ghost sm" title="Afvinken zonder notitie" onclick="event.stopPropagation();wcVink(\''+id+'\')">✓ Afvinken</button>')+
    '</div>'+(isOpen?wcDetailHtml(r):'')+'</div>';
}
function wcDetailHtml(r){
  const D=WC.data,p=r.p,id=p.id,per=wcPeriode(WC.dag,WC.terug);
  const voornaam=esc(p.first_name||"de atleet");
  const wieIs=aid=>aid===id?voornaam:(aid===ME.user.id?"Jij":"Coach");
  const dagen=[];
  for(let d=new Date(per.van+"T12:00:00");ymd(d)<=per.tot;d=addDays(d,1)){
    const ds=ymd(d);
    const wos=D.workouts.filter(w=>w.client_id===id&&w.workout_date===ds);
    if(!wos.length)continue;
    const inhoud=wos.map(w=>{
      const blokken=(w.blocks||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
      if(!blokken.length)return '<div class="wc-wo"><b>'+(/^rest ?day$/i.test((w.title||"").trim())?"Rustdag":esc(w.title||"Workout"))+'</b></div>';
      const ef=D.effort.find(e=>e.workout_id===w.id&&e.athlete_id===id);
      const efTxt=ef&&(ef.rpe!=null||ef.minutes)?' <span class="wc-eff">'+(ef.rpe!=null?"inspanning "+ef.rpe+"/10":"")+(ef.rpe!=null&&ef.minutes?" · ":"")+(ef.minutes?ef.minutes+" min":"")+'</span>':'';
      const regels=blokken.map(b=>{
        const res=D.results.find(x=>x.block_id===b.id&&x.athlete_id===id);
        const sc=res?resultScoreVol(res,b.score_type):"";
        const vids=D.media.filter(m=>m.block_id===b.id&&m.athlete_id===id);
        const padLijst=vids.map(v=>v.storage_path).join("|");
        const stand=!res?'<span class="wc-niet">niet gelogd</span>':(res.status==="missed"?'<span class="wc-mis">gemist</span>':(sc?'<span class="wc-score">'+esc(sc)+'</span>':'<span class="wc-ok">gedaan</span>'));
        return '<div class="wc-blok"><span class="wc-lbl">'+esc(b.label||"")+') '+esc(b.exercise||"")+'</span>'+stand+
          vids.map(v=>'<span class="vidtile" title="'+(isFotoUpload(v.storage_path)?"Foto":"Video")+' van het lid" onclick="vidSpeel(\''+esc(v.storage_path)+'\',\''+esc(padLijst)+'\')">'+(isFotoUpload(v.storage_path)?"📷":"▶")+'</span>').join("")+
          ((res&&(res.note||"").trim())?'<div class="wc-noot">“'+wcMarkeer(res.note.trim())+'”</div>':'')+'</div>';
      }).join("");
      const reacties=D.comments.filter(c=>c.workout_id===w.id).map(c=>'<div class="wc-reactie"><b>'+wieIs(c.author_id)+':</b> '+wcMarkeer(c.body)+'</div>').join("");
      return '<div class="wc-wo"><b>'+esc(w.title||"Workout")+'</b>'+efTxt+regels+reacties+'</div>';
    }).join("");
    dagen.push('<div class="wc-dag"><div class="wc-datum">'+wcDatum(ds)+'</div><div class="wc-inhoud">'+inhoud+'</div></div>');
  }
  const prs=((D.prs||[]).filter(x=>x.athlete_id===id).map(x=>'Nieuw record: <b>'+esc(x.lift)+'</b> · '+esc(kgTxt(x.kg))+' kg × '+esc(String(x.reps))+' <span class="muted">('+wcDatum(x.workout_date)+')</span>'))
    .concat(D.metrics.filter(m=>m.athlete_id===id&&!m.result_id).map(m=>'Nieuwe meting: <b>'+esc(m.metric)+'</b> · '+esc(String(m.value==null?"":m.value).replace(".",","))+' '+esc(m.unit||"kg")));
  const msgs=D.msgs.filter(m=>m.athlete_id===id);
  const chat=msgs.slice(-12).map(m=>'<div class="wc-reactie"><span class="muted">'+wcDatum(wcDatumVan(m.created_at))+'</span> <b>'+wieIs(m.sender_id)+':</b> '+wcMarkeer(wkKort(m.body,400))+'</div>').join("");
  const noot=r.check?(r.check.note||""):(WC.notities[id]||"");
  return '<div class="wc-detail">'+
    (dagen.join("")||'<div class="sm muted">Geen workouts in deze periode.</div>')+
    (prs.length?'<div class="wc-sub">Records en metingen</div>'+prs.map(x=>'<div class="wc-reactie">'+x+'</div>').join(""):(D.prs==null?'<div class="sm muted" style="margin-top:8px">Records laden…</div>':''))+
    (chat?'<div class="wc-sub">Chat in deze periode'+(msgs.length>12?' (laatste 12 van '+msgs.length+')':'')+'</div>'+chat:'')+
    (r.check
      ?(noot?'<div class="wc-sub">Jouw notitie</div><div class="wc-reactie">'+esc(noot)+'</div>':'')
      :'<textarea class="wc-ta" rows="2" placeholder="Jouw notitie bij deze week (komt in het dossier van '+voornaam+')" oninput="WC.notities[\''+id+'\']=this.value">'+esc(noot)+'</textarea>')+
    '<div class="wc-acties">'+
      (r.check?'':'<button class="btn sm" onclick="wcVink(\''+id+'\')">✓ Afvinken en bewaren</button>')+
      '<button class="btn ghost sm" onclick="openClient(\''+id+'\')">Naar de kalender</button>'+
      '<button class="btn ghost sm" onclick="wcChat(\''+id+'\')">Chat openen</button>'+
    '</div></div>';
}

// ---------- Bediening ----------
function wcKiesDag(i){WC.dag=i;WC.open.clear();wcVul();}
function wcWeek(n){WC.terug=Math.max(0,Math.min(26,WC.terug+n));WC.open.clear();wcVul();}
function wcKiesCoach(v){WC.coach=v||"";WC.open.clear();wcVul();}
function wcToggle(id){if(WC.open.has(id))WC.open.delete(id);else WC.open.add(id);wcTeken();}
function wcAfgToggle(){WC.afgOpen=!WC.afgOpen;wcTeken();}
async function wcChat(id){await openClient(id);if(typeof openChatPop==="function")openChatPop();}
async function wcVink(id){
  const p=actieveKlanten().find(x=>x.id===id);if(!p||!WC.data||WC.dag===WC_ZONDER)return;
  const per=wcPeriode(WC.dag,WC.terug);
  const s=wcSamenvat(p);s.dag=WC_DAG[WC.dag];
  const rec={company_id:p.company_id||ME.profile.company_id,athlete_id:id,checked_by:ME.user.id,period_from:per.van,period_to:per.tot,note:(WC.notities[id]||"").trim()||null,summary:s};
  const{data,error}=await db.from("week_checks").upsert(rec,{onConflict:"athlete_id,period_to"}).select().single();
  if(error){toast(error.message||"Afvinken mislukt");return;}
  WC.data.checks=WC.data.checks.filter(c=>!(c.athlete_id===id&&c.period_to===per.tot)).concat([data||rec]);
  delete WC.notities[id];WC.open.delete(id);
  toast("Afgevinkt en bewaard in het dossier");
  wcTeken();
}
async function wcTerugzetten(checkId){
  const{error}=await db.from("week_checks").delete().eq("id",checkId);
  if(error){toast(error.message||"Terugzetten mislukt");return;}
  const c=WC.data.checks.find(x=>x.id===checkId);
  if(c&&c.note)WC.notities[c.athlete_id]=c.note; // de notitie niet kwijtraken
  WC.data.checks=WC.data.checks.filter(x=>x.id!==checkId);
  toast("Teruggezet in de lijst");
  wcTeken();
}

// ---------- In het dossier: paneel Check-ins & consults op het klant-scherm ----------
async function wcDossierLaad(){
  const host=document.getElementById("weekcheck-lijst");if(!host||!calClient)return;
  const voor=calClient;
  const{data,error}=await db.from("week_checks").select("*").eq("athlete_id",voor).order("period_to",{ascending:false}).limit(80);
  if(voor!==calClient||!document.getElementById("weekcheck-lijst"))return;
  if(error){host.innerHTML='<div class="sm" style="color:#8b919b">Weekchecks laden mislukt.</div>';return;}
  host.innerHTML=(data||[]).map(c=>'<div class="sp-note"><div class="nh">'+esc(wcDatum(c.period_from)+" t/m "+wcDatum(c.period_to))+
    ' <span>'+esc("afgevinkt "+wcDatum(wcDatumVan(c.created_at)))+'</span></div>'+
    '<div class="nb">'+esc(wcSamenvatTekst(c.summary))+((c.summary&&c.summary.signalen&&c.summary.signalen.length)?'<br>Signaalwoorden: '+esc(c.summary.signalen.join(", ")):'')+
    (c.note?'<br><br>'+esc(c.note).replace(/\n/g,"<br>"):'')+'</div></div>').join("")||'<div class="sm" style="color:#8b919b">Nog geen weken afgevinkt.</div>';
}

// Engelse teksten (sleutel = exacte Nederlandse tekst, zie app/i18n.js).
if(typeof i18nLaad==="function")i18nLaad({
  "Weekcheck":"Week check",
  "Weekchecks":"Week checks",
  "Maandag":"Monday","Dinsdag":"Tuesday","Woensdag":"Wednesday","Donderdag":"Thursday","Vrijdag":"Friday","Zaterdag":"Saturday","Zondag":"Sunday",
  "klaar":"done","{n} open":"{n} open",
  "Zonder dag":"No day",
  "Alle coaches":"All coaches",
  "Een week eerder":"One week earlier","Een week later":"One week later",
  "✓ Afvinken":"✓ Check off",
  "✓ Afvinken en bewaren":"✓ Check off and save",
  "Afvinken zonder notitie":"Check off without a note",
  "Terugzetten":"Put back",
  "Zet deze atleet terug in de lijst":"Put this athlete back in the list",
  "Naar de kalender":"Go to calendar",
  "Chat openen":"Open chat",
  "Naar de Klanten-pagina":"Go to the Clients page",
  "Afgevinkt ({n})":"Checked off ({n})",
  "▸ Afgevinkt ({n})":"▸ Checked off ({n})","▾ Afgevinkt ({n})":"▾ Checked off ({n})",
  "niet gelogd":"not logged","gemist":"missed","gedaan":"done",
  "Rustdag":"Rest day",
  "Records en metingen":"Records and measurements",
  "Records laden…":"Loading records…",
  "Chat in deze periode":"Chat in this period",
  "Jouw notitie":"Your note",
  "Geen workouts in deze periode.":"No workouts in this period.",
  "Afgevinkt en bewaard in het dossier":"Checked off and saved to the file",
  "Teruggezet in de lijst":"Put back in the list",
  "Afvinken mislukt":"Checking off failed","Terugzetten mislukt":"Putting back failed",
  "Iedereen heeft een dag.":"Everyone has a day.",
  "Deze klanten hebben nog geen dagtag en komen daarom in geen enkele weekcheck voor. Geef ze een dag op de Klanten-pagina.":"These clients don't have a day tag yet, so they don't show up in any week check. Give them a day on the Clients page.",
  "Er zijn nog geen dagtags. Maak op de Klanten-pagina via Tags beheren de tags Maandag tot en met Zondag aan en geef elke klant zijn dag.":"There are no day tags yet. On the Clients page, use Manage tags to create the tags Monday to Sunday and give every client a day.",
  "Dit woord staat in een notitie, reactie of chatbericht van deze week":"This word appears in a note, comment or chat message from this week",
  "Nog geen weken afgevinkt.":"No weeks checked off yet.",
  "Weekchecks laden mislukt.":"Loading week checks failed.",
  "Opnieuw proberen":"Try again",
  "Wat er per week is afgevinkt in de Weekcheck (Meldingen), met de notitie van de coach.":"What was checked off per week in the Week check (Notifications), with the coach's note.",
});
