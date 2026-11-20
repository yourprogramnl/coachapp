// app/showdown-plaatsen.js — een live YP Showdown in één keer bij 1-op-1 klanten zetten
// (20 nov 2026, wens Stefan: "zodat hij het snel in iedereens programma kan plaatsen").
//
// De knop "Bij klanten zetten" staat op elke live Showdown (sectie YP Showdown en de tab
// YP Showdown in de Bibliotheek). Het venster toont de klanten met per klant de dag in de
// week van de Showdown; die dag staat voor op de dag waarop de klant de Showdown de vorige
// keer deed (bij de één vrijdag, bij de ander zaterdag). Staat er op die dag al een workout,
// dan komt de Showdown daar als laatste blok onder; anders als eigen workout. Het blok
// verwijst naar de Showdown (source_blog_workout_id), dus de klant komt op het gedeelde
// leaderboard. Aanpassen per klant doet de coach daarna in de kalender van die klant; een
// aangepaste tekst telt daar vanzelf als Scaled (sdAutoScaled in klant-scherm.js).
let SDP=null;
const SDP_DAGNAAM=typeof LANG!=="undefined"&&LANG==="en"?["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]:["ma","di","wo","do","vr","za","zo"];
const sdpNorm=s=>String(s||"").replace(/\s+/g," ").trim().toLowerCase();
const sdpPlus=(ds,n)=>{const d=new Date(ds+"T12:00:00");d.setDate(d.getDate()+n);return ymd(d);};
const sdpDagTxt=ds=>{const d=new Date(ds+"T12:00:00");return SDP_DAGNAAM[(d.getDay()+6)%7]+" "+d.getDate()+" "+MAANDKORT[d.getMonth()];};
const sdpAantal=n=>n===1?"1 klant":n+" klanten";

// Het blok zoals het bij de klant komt: de tekst letterlijk uit de Showdown, met de verwijzing
// waardoor de klant met Rx/Scaled logt en op het gedeelde leaderboard komt. Zelfde vorm als
// ClaudeApi.plaatsShowdown.
function sdpBlokRij(w){
  const bl=(w.blocks||[]).slice().sort((x,y)=>(x.sort||0)-(y.sort||0));
  if(bl.length===1){
    const b=bl[0];
    return{kind:b.kind||"conditioning",linked:false,exercise:b.exercise||w.title||SHOWDOWN,prescription:b.prescription==null?null:b.prescription,notes:b.notes==null?null:b.notes,color:b.color||"purple",
      score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,
      media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:null,source_blog_workout_id:w.id,scaled_versie:false};
  }
  // Meer blokken: één blok met de hele tekst, zoals de bouwer bij een klant dat doet.
  const txt=bl.map(b=>{const pr=composePresc(b)||"";return (b.label?b.label+") ":"")+(b.exercise||"")+(pr?"\n"+pr:"");}).join("\n\n");
  const media=bl.reduce((m,b)=>m.concat(Array.isArray(b.media)?b.media:[]),[]);
  return{kind:"conditioning",linked:false,exercise:w.title||SHOWDOWN,prescription:null,notes:txt,color:"purple",
    score_type:bl[0].score_type||"text",timecap_seconds:bl[0].timecap_seconds||null,cap_score_type:bl[0].cap_score_type||"reps",oefening_id:null,
    media:media.length?media:null,lift_id:null,lift_scheme:null,group_title:null,source_blog_workout_id:w.id,scaled_versie:false};
}

function ensureSdpModal(){
  if(document.getElementById("sdpmodal"))return;
  const wrap=document.createElement("div");
  wrap.innerHTML='<div class="lmodal" id="sdpmodal" style="z-index:430"><div class="box" style="width:680px;max-width:96vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h3 style="margin:0" id="sdp-titel">Bij klanten zetten</h3><span onclick="sdpDicht()" title="Sluiten" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" id="sdp-hint"></div>'+
    '<div class="sdp-balk" id="sdp-balk"></div>'+
    '<div class="bordmeer-lijst" id="sdp-body"><div class="cempty">Klanten laden…</div></div>'+
    '<div class="sm muted" id="sdp-tel" style="margin-bottom:10px"></div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button class="btn" id="sdp-ok" onclick="sdpDoe()">Bij klanten zetten</button><button class="btn ghost" id="sdp-dicht" onclick="sdpDicht()">Annuleren</button>'+
    '<button class="btn ghost" id="sdp-terug" style="display:none" onclick="sdpOngedaan()">Ongedaan maken</button>'+
    '<a href="#" id="sdp-alles" style="margin-left:auto;font-size:12px;font-weight:700" onclick="sdpAlles();return false">Alles aan of uit</a></div>'+
    '<div class="msg" id="sdp-msg" style="min-height:0"></div></div></div>';
  document.body.appendChild(wrap.firstChild);
}
function sdpDicht(){const m=document.getElementById("sdpmodal");if(m)m.classList.remove("show");SDP=null;}

async function sdPlaats(id){
  let w=typeof wwVind==="function"?wwVind(id):null;
  if(!w||w.audience!=="blog"){toast("Deze "+SHOWDOWN+" staat nog niet live. Zet hem eerst live met Kies showdown.");return;}
  if(!(w.blocks||[]).length){toast("Deze "+SHOWDOWN+" heeft nog geen tekst.");return;}
  if(!ME.profile||!ME.profile.company_id){toast("Dit account is niet aan een bedrijf gekoppeld.");return;}
  ensureSdpModal();
  const ma=wwMaandag(w.workout_date);
  SDP={w,ma,dagen:[0,1,2,3,4,5,6].map(i=>sdpPlus(ma,i)),klanten:[],zoek:"",anderen:false,bezig:false,gedaan:null};
  const g=x=>document.getElementById(x);
  g("sdp-titel").textContent=(w.title||SHOWDOWN)+" bij klanten zetten";
  g("sdp-hint").textContent="De Showdown komt in de kalender van elke klant die je aanvinkt, op de dag die erachter staat. Staat er die dag al een workout, dan komt hij daar als laatste blok onder. De klant logt zijn score en staat op het gedeelde leaderboard. Daarna pas je hem bij een klant nog aan als dat nodig is; een aangepaste tekst telt vanzelf als Scaled.";
  g("sdp-balk").innerHTML="";g("sdp-body").innerHTML='<div class="cempty">Klanten laden…</div>';g("sdp-tel").textContent="";
  g("sdp-msg").textContent="";g("sdp-msg").className="msg";
  g("sdp-ok").style.display="";g("sdp-ok").disabled=true;g("sdp-terug").style.display="none";g("sdp-alles").style.display="";g("sdp-dicht").textContent="Annuleren";
  g("sdpmodal").classList.add("show");
  const fout=await sdpLaad(true);
  if(!SDP||SDP.w.id!==id)return; // intussen gesloten
  if(fout){g("sdp-body").innerHTML='<div class="cempty">Klanten laden mislukt. Sluit het venster en probeer het opnieuw.</div>';return;}
  sdpRender();
}
// Klanten, wat er deze week al bij ze staat en op welke dag ze de Showdown de vorige keer deden.
// eerste=true: ook de vinkjes en de dag per klant zetten; anders alleen de stand verversen.
async function sdpLaad(eerste){
  const S=SDP,ik=ME.user.id;
  if(eerste){
    const r=await alleRijen(()=>{
      let q=db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,role").eq("archived",false).eq("company_id",ME.profile.company_id).not("coach_id","is",null);
      if(myRole()==="coach")q=q.eq("coach_id",ik);
      return q.order("id");
    });
    if(r.error)return r.error;
    S.klanten=(r.data||[]).filter(p=>p.membership_type!=="free_blog")
      .map(p=>({id:p.id,naam:((p.first_name||"")+" "+(p.last_name||"")).trim()||"Klant",mijn:p.coach_id===ik,aan:false,dag:S.w.workout_date,al:null,los:null,week:[]}))
      .sort((a,b)=>a.naam.localeCompare(b.naam));
    // Wie zelf geen klanten heeft (een eigenaar die niet coacht) ziet meteen iedereen.
    S.anderen=!S.klanten.some(k=>k.mijn);
  }
  const ids=S.klanten.map(k=>k.id);
  if(!ids.length)return null;
  const wk=await inStukken(ids,s=>db.from("workouts").select("id,client_id,workout_date,status,title,created_at,source_blog_workout_id, blocks(id,kind,linked,sort,exercise,source_blog_workout_id)").eq("audience","client").in("client_id",s).gte("workout_date",S.ma).lte("workout_date",S.dagen[6]).order("id"));
  if(wk.error)return wk.error;
  const per={};(wk.data||[]).forEach(x=>{(per[x.client_id]=per[x.client_id]||[]).push(x);});
  const naam=sdpNorm(S.w.title),voor=sdpNorm(SHOWDOWN)+" ";
  S.klanten.forEach(k=>{
    k.week=(per[k.id]||[]).slice().sort((a,b)=>String(a.created_at||"")<String(b.created_at||"")?-1:1);
    const heeft=k.week.find(x=>x.source_blog_workout_id===S.w.id||(x.blocks||[]).some(b=>b.source_blog_workout_id===S.w.id));
    k.al=heeft?heeft.workout_date:null;
    // Een blok met de naam van de Showdown maar zonder koppeling: met de hand gezet, of een eigen
    // versie voor deze klant ("YP Showdown (Mick)"). Dan staat het vinkje standaard uit; de coach
    // kiest zelf of de Showdown er nog bij moet.
    const eigen=n=>!!naam&&(n===naam||(n.indexOf(voor)===0&&!/[0-9]/.test(n.slice(voor.length))));
    const los=heeft?null:k.week.find(x=>(x.blocks||[]).some(b=>!b.source_blog_workout_id&&eigen(sdpNorm(b.exercise))));
    k.los=los?los.workout_date:null;
    if(k.al)k.aan=false;
  });
  if(eerste){
    // De dag waarop de klant de Showdown de vorige keer had staan (laatste vier weken).
    try{
      const h=await inStukken(ids,s=>db.from("blocks").select("id, workouts!inner(client_id,workout_date,audience)").ilike("exercise","%showdown%").eq("workouts.audience","client").in("workouts.client_id",s).gte("workouts.workout_date",sdpPlus(S.ma,-28)).lt("workouts.workout_date",S.ma).order("id"));
      const laatst={};
      (h.data||[]).forEach(b=>{const x=b.workouts;if(!x||!x.client_id||!x.workout_date)return;if(!laatst[x.client_id]||x.workout_date>laatst[x.client_id])laatst[x.client_id]=x.workout_date;});
      S.klanten.forEach(k=>{const d=laatst[k.id];if(d){k.dag=S.dagen[(new Date(d+"T12:00:00").getDay()+6)%7];k.vorige=true;}});
    }catch(e){}
    // Niet elke klant doet de Showdown (20 nov 2026: ongeveer 40 van de 118). Vooraf aangevinkt
    // staat daarom wie hem de laatste vier weken ook kreeg; de rest zet de coach zelf aan, of
    // iedereen tegelijk met Alles aan of uit. Kreeg nog niemand hem, dan staat iedereen aan.
    S.opVorige=S.klanten.some(k=>k.mijn&&k.vorige);
    S.klanten.forEach(k=>{k.aan=k.mijn&&!k.al&&!k.los&&(!S.opVorige||!!k.vorige);});
  }
  return null;
}
// De workout van de klant op de gekozen dag waar de Showdown onder komt (de laatste van die dag).
function sdpDoel(k){const op=k.week.filter(x=>x.workout_date===k.dag);return op.length?op[op.length-1]:null;}
function sdpZichtbaar(){
  const S=SDP,z=sdpNorm(S.zoek);
  return S.klanten.filter(k=>(S.anderen||k.mijn)&&(!z||sdpNorm(k.naam).includes(z)));
}
function sdpRijHtml(k){
  const S=SDP,vast=!!k.al,doel=vast?null:sdpDoel(k);
  const waar=k.al?'<span class="cpill ok">staat er al · '+esc(sdpDagTxt(k.al))+'</span>'
    :(k.los?'<span class="cpill gray" title="Er staat deze week al een blok met de naam van de Showdown, maar zonder leaderboard. Vink je deze klant aan, dan komt de Showdown er als extra blok bij. Je kunt ook het bestaande blok aan het leaderboard hangen: open de klant en klik bij dat blok op Leaderboard aanzetten.">eigen blok zonder leaderboard · '+esc(sdpDagTxt(k.los))+'</span>':'')+
     '<span class="sdp-waar">'+(doel?'onder "'+esc(doel.title||"Workout")+'"'+(doel.status==="draft"?' (concept)':''):'eigen workout')+'</span>';
  const dagen=vast?'':'<select class="sdp-dag" title="Op welke dag komt de Showdown bij deze klant?" onclick="event.stopPropagation()" onchange="sdpDag(\''+k.id+'\',this.value)">'+S.dagen.map(d=>'<option value="'+d+'"'+(d===k.dag?' selected':'')+'>'+esc(sdpDagTxt(d))+'</option>').join("")+'</select>';
  return '<label class="bordmeer-rij sdp-rij'+(vast?' uit':'')+'" id="sdp-rij-'+k.id+'"><input type="checkbox"'+(vast?' disabled':(k.aan?' checked':''))+' onchange="sdpVink(\''+k.id+'\',this.checked)">'+
    '<span class="bordmeer-naam">'+esc(k.naam)+'</span>'+(k.mijn||myRole()==="coach"?'':'<span class="cpill gray">andere coach</span>')+waar+dagen+'</label>';
}
function sdpRender(){
  const S=SDP;if(!S)return;
  const g=x=>document.getElementById(x);
  const nAnder=S.klanten.filter(k=>!k.mijn).length,nMijn=S.klanten.length-nAnder;
  if(!S.klanten.length){
    g("sdp-balk").innerHTML="";g("sdp-body").innerHTML='<div class="cempty">Je hebt nog geen 1-op-1 klanten om de Showdown bij te zetten.</div>';
    g("sdp-ok").style.display="none";g("sdp-alles").style.display="none";g("sdp-dicht").textContent="Sluiten";return;
  }
  if(!g("sdp-zoek")){
    g("sdp-balk").innerHTML='<label class="sdp-veld">Iedereen op <select id="sdp-alledag" onchange="sdpAlleDag(this.value)"><option value="">per klant</option>'+S.dagen.map(d=>'<option value="'+d+'">'+esc(sdpDagTxt(d))+'</option>').join("")+'</select></label>'+
      '<input class="lid-in" id="sdp-zoek" placeholder="Zoek een klant…" oninput="sdpZoek(this.value)">'+
      (nAnder&&nMijn?'<label class="sdp-veld"><input type="checkbox" id="sdp-anderen"'+(S.anderen?' checked':'')+' onchange="sdpAnderen(this.checked)"> Ook klanten van andere coaches ('+nAnder+')</label>':'');
  }
  const lijst=sdpZichtbaar();
  g("sdp-body").innerHTML=lijst.map(sdpRijHtml).join("")||'<div class="cempty">Geen klant gevonden.</div>';
  sdpTel();
}
function sdpTel(){
  const S=SDP;if(!S)return;
  const kies=S.klanten.filter(k=>k.aan&&!k.al),al=S.klanten.filter(k=>(S.anderen||k.mijn)&&k.al).length;
  const ok=document.getElementById("sdp-ok");
  ok.disabled=S.bezig||!kies.length;ok.textContent=kies.length?"Bij "+sdpAantal(kies.length)+" zetten":"Bij klanten zetten";
  const verborgen=kies.filter(k=>!S.anderen&&!k.mijn).length;
  document.getElementById("sdp-tel").textContent=(kies.length?sdpAantal(kies.length)+" aangevinkt.":"Niemand aangevinkt.")+(al?" Bij "+sdpAantal(al)+" staat hij deze week al.":"")+(verborgen?" Let op: "+verborgen+" daarvan van een andere coach.":"")+
    (S.opVorige&&!S.gedaan?" Vooraf aangevinkt: wie de Showdown de afgelopen vier weken ook kreeg.":"");
}
function sdpVind(id){return SDP?SDP.klanten.find(k=>k.id===id):null;}
function sdpVink(id,aan){const k=sdpVind(id);if(!k)return;k.aan=!!aan;sdpTel();}
function sdpDag(id,dag){
  const k=sdpVind(id);if(!k||!SDP.dagen.includes(dag))return;
  k.dag=dag;const a=document.getElementById("sdp-alledag");if(a)a.value="";
  const rij=document.getElementById("sdp-rij-"+id);if(rij)rij.outerHTML=sdpRijHtml(k);
}
function sdpAlleDag(dag){
  if(!SDP||!SDP.dagen.includes(dag))return;
  SDP.klanten.forEach(k=>{k.dag=dag;});
  sdpRender();
}
function sdpZoek(v){if(!SDP)return;SDP.zoek=v||"";sdpRender();}
function sdpAnderen(aan){
  if(!SDP)return;SDP.anderen=!!aan;
  if(!aan)SDP.klanten.forEach(k=>{if(!k.mijn)k.aan=false;}); // wat je niet ziet, zet je ook niet
  sdpRender();
}
function sdpAlles(){
  if(!SDP)return;
  const kan=sdpZichtbaar().filter(k=>!k.al&&!k.los),aan=kan.some(k=>!k.aan); // een klant met een eigen blok vink je zelf aan
  kan.forEach(k=>{k.aan=aan;});
  sdpRender();
}

// Bij één klant neerzetten. Leest de dag eerst vers uit de database: een collega of de
// koppeling met Claude kan er in de tussentijd iets hebben gezet.
async function sdpZetBij(k,rij){
  const S=SDP,basis={company_id:ME.profile.company_id};
  const{data:dag,error}=await db.from("workouts").select("id,workout_date,status,title,created_at,source_blog_workout_id, blocks(id,kind,linked,sort,source_blog_workout_id)").eq("audience","client").eq("client_id",k.id).gte("workout_date",S.ma).lte("workout_date",S.dagen[6]).order("created_at");
  if(error)throw new Error(error.message||"lezen mislukt");
  const week=dag||[];
  if(week.some(x=>x.source_blog_workout_id===S.w.id||(x.blocks||[]).some(b=>b.source_blog_workout_id===S.w.id)))return{al:true};
  const op=week.filter(x=>x.workout_date===k.dag).sort((a,b)=>String(a.created_at||"")<String(b.created_at||"")?-1:1);
  const doel=op.length?op[op.length-1]:null;
  if(doel){
    const bl=(doel.blocks||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
    // Letter: het eerstvolgende vak. Een tekstblok heeft geen letter, een gekoppeld blok deelt de letter van het vorige.
    const vakken=bl.filter(b=>b.kind!=="info").reduce((n,b,i)=>n+((i>0&&b.linked)?0:1),0);
    const sort=bl.reduce((m,b)=>Math.max(m,b.sort||0),0)+1;
    const{data:nb,error:be}=await db.from("blocks").insert(Object.assign({workout_id:doel.id,label:String.fromCharCode(65+Math.min(vakken,25)),sort},rij)).select("id").single();
    if(be||!nb)throw new Error((be&&be.message)||"blok plaatsen mislukt");
    return{blok:nb.id,onder:true};
  }
  const{data:nw,error:we}=await db.from("workouts").insert(Object.assign({coach_id:ME.user.id,client_id:k.id,audience:"client",workout_date:k.dag,title:S.w.title||SHOWDOWN},basis)).select("id").single();
  if(we||!nw)throw new Error((we&&we.message)||"workout aanmaken mislukt");
  const{data:nb,error:be}=await db.from("blocks").insert(Object.assign({workout_id:nw.id,label:"A",sort:1},rij)).select("id").single();
  if(be||!nb){await db.from("workouts").delete().eq("id",nw.id);throw new Error((be&&be.message)||"blok plaatsen mislukt");}
  return{workout:nw.id,blok:nb.id};
}
async function sdpDoe(){
  const S=SDP;if(!S||S.bezig)return;
  const kies=S.klanten.filter(k=>k.aan&&!k.al);
  const g=x=>document.getElementById(x),msg=g("sdp-msg");
  if(!kies.length){msg.textContent="Vink eerst een klant aan.";msg.className="msg err";return;}
  if(!confirm("\""+(S.w.title||SHOWDOWN)+"\" bij "+sdpAantal(kies.length)+" in de kalender zetten?\n\nDe klant ziet hem meteen, behalve als hij onder een workout komt die nog concept is."))return;
  S.bezig=true;S.net=kies.map(k=>k.id);g("sdp-ok").disabled=true;g("sdp-alles").style.display="none";g("sdp-terug").style.display="none";
  msg.className="msg";msg.textContent="Bezig… 0 van "+kies.length;
  const rij=sdpBlokRij(S.w),gedaan={blokken:[],workouts:[]},mis=[];
  let klaar=0,onder=0,eigen=0,al=0;
  // Vier klanten tegelijk: snel genoeg voor veertig klanten, en de database krijgt geen golf.
  const rij_van=kies.slice();
  const werker=async()=>{
    for(;;){
      const k=rij_van.shift();if(!k)return;
      try{
        const u=await sdpZetBij(k,rij);
        if(u.al)al++;
        else{if(u.workout){gedaan.workouts.push(u.workout);eigen++;}else{gedaan.blokken.push(u.blok);onder++;}}
      }catch(e){mis.push(k.naam+" ("+String(e&&e.message||e)+")");}
      klaar++;
      if(SDP===S)msg.textContent="Bezig… "+klaar+" van "+kies.length;
    }
  };
  await Promise.all([werker(),werker(),werker(),werker()]);
  S.bezig=false;S.gedaan=(gedaan.blokken.length||gedaan.workouts.length)?gedaan:null;
  await sdpLaad(false);
  if(SDP!==S){toast("Showdown gezet bij "+sdpAantal(onder+eigen));return;}
  sdpRender();
  const n=onder+eigen;
  msg.className=mis.length?"msg err":"msg ok";
  msg.textContent=(n?"Gezet bij "+sdpAantal(n)+(onder&&eigen?": bij "+onder+" onder de workout van die dag, bij "+eigen+" als eigen workout.":onder?", onder de workout van die dag.":", als eigen workout."):"Er is niets gezet.")+
    (al?" Bij "+sdpAantal(al)+" stond hij er intussen al.":"")+(mis.length?" Niet gelukt: "+mis.join(", ")+".":"");
  g("sdp-terug").style.display=S.gedaan?"":"none";g("sdp-alles").style.display="";g("sdp-dicht").textContent="Sluiten";
  // Staat er een klantkalender open achter het venster, dan die verversen.
  try{if(typeof renderMonth==="function"&&document.getElementById("calwrap"))renderMonth();}catch(e){}
}
// Alleen wat dit venster zojuist heeft gezet: de blokken die onder een bestaande workout kwamen
// en de eigen workouts (met hun blok).
async function sdpOngedaan(){
  const S=SDP;if(!S||!S.gedaan||S.bezig)return;
  const n=S.gedaan.blokken.length+S.gedaan.workouts.length;
  if(!confirm("De Showdown weer weghalen bij de "+sdpAantal(n)+" waar je hem net hebt gezet?\n\nHeeft een klant intussen al een score ingevuld, dan gaat die score mee weg."))return;
  const g=x=>document.getElementById(x),msg=g("sdp-msg");
  S.bezig=true;g("sdp-terug").disabled=true;g("sdp-ok").disabled=true;
  let fout=null;
  const weg=async(tabel,ids)=>{for(let i=0;i<ids.length;i+=50){const{error}=await db.from(tabel).delete().in("id",ids.slice(i,i+50));if(error)fout=fout||error;}};
  await weg("blocks",S.gedaan.blokken);
  await weg("workouts",S.gedaan.workouts);
  S.bezig=false;g("sdp-terug").disabled=false;
  if(!fout)S.gedaan=null;
  await sdpLaad(false);
  if(SDP!==S)return;
  // De vinkjes van daarnet terugzetten, zodat je alleen de dag hoeft te verbeteren.
  const net=new Set(S.net||[]);
  S.klanten.forEach(k=>{if(net.has(k.id)&&!k.al)k.aan=true;});
  sdpRender();
  g("sdp-terug").style.display=S.gedaan?"":"none";
  msg.className=fout?"msg err":"msg ok";
  msg.textContent=fout?"Weghalen is niet helemaal gelukt: "+(fout.message||"onbekende fout")+". Kijk in de lijst bij wie hij nog staat.":"Weer weggehaald bij "+sdpAantal(n)+".";
  try{if(typeof renderMonth==="function"&&document.getElementById("calwrap"))renderMonth();}catch(e){}
}
