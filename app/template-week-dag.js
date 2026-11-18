// app/template-week-dag.js — Template week en Template dag (18 nov 2026,
// verzoek Stefan en Michel, naar de Template builder van Strivee).
//
// Wat vroeger "Programma's" heette, heet nu Template week: een of meer
// genummerde weken zonder datums. Template dag is hetzelfde, maar dan één dag
// (bijvoorbeeld een testdag). Beide staan in program_templates; het verschil
// zit in de kolom type ("standard" = week, "dag" = dag). De editor met het
// weekraster staat in app/bibliotheek.js; dit bestand voegt toe:
//   - een dag of week uit de kalender van een klant opslaan als template;
//   - een template (of een deel van de weken) op de kalender van een klant zetten;
//   - de kaarten in het bibliotheek-venster en het loslaten op een dag;
//   - "Templates" in het coach-menu, met een wisselmenu in de kop van de editor.
// Een template heeft geen klant, dus een klant ziet niets tot de coach hem
// bewust bij die klant zet. Zo kan een coach in alle rust een nieuwe cyclus
// uitwerken.
const progIsDag=p=>!!p&&p.type==="dag";
const progSoortNaam=p=>progIsDag(p)?"Template dag":"Template week";
const progBlokVelden=b=>({kind:b.kind||"exercise",label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,sort:b.sort,color:b.color||null,score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null});
const progSorteer=(a,b)=>(a.week-b.week)||(a.day-b.day)||((a.sort||0)-(b.sort||0))||String(a.created_at||"").localeCompare(String(b.created_at||""));

// Alle workouts van één template, met blokken. In stukken van 1000, want een
// werkblad met tientallen weken kan boven de standaardgrens van één aanroep komen.
async function progWorkoutsLaad(pid){
  let alles=[];
  for(let van=0;van<20000;van+=1000){
    const{data,error}=await db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",pid).order("week").order("day").order("sort").order("id").range(van,van+999);
    if(error||!data)break;
    alles=alles.concat(data);
    if(data.length<1000)break;
  }
  // Een nep- of oude database die range negeert kan dubbelen geven: ontdubbelen op id.
  const gezien=new Set();
  return alles.filter(w=>!gezien.has(w.id)&&gezien.add(w.id));
}

// ---------- Een template (of een deel van de weken) bij een klant zetten ----------
// o: {prog, workouts, client:{id,company_id,coach_id}, start, weekVan, weekTot}
// Maakt één toewijzing aan (zodat "Beheer toewijzingen" en ongedaan maken
// werken) en zet de workouts als gewone workouts op de kalender. week_from
// onthoudt welke week van de template op de startdatum landt.
async function progZetBijKlant(o){
  const max=Math.max(1,o.prog.weeks||1);
  const van=Math.min(max,Math.max(1,o.weekVan||1)),tot=Math.min(max,Math.max(van,o.weekTot||max));
  const wos=(o.workouts||[]).filter(w=>w.week>=van&&w.week<=tot).sort(progSorteer);
  const{data:asg,error:ae}=await db.from("program_assignments").insert({company_id:ME.profile.company_id,program_id:o.prog.id,athlete_id:o.client.id,start_date:o.start,weeks:tot-van+1,week_from:van,created_by:ME.user.id}).select().single();
  if(ae)throw ae;
  const blocksAll=[];
  for(const pw of wos){
    const datum=ymdPlus(o.start,(pw.week-van)*7+(pw.day-1));
    const{data:nw,error:we}=await db.from("workouts").insert({company_id:o.client.company_id||ME.profile.company_id,coach_id:o.client.coach_id||ME.user.id,client_id:o.client.id,workout_date:datum,title:pw.title,coach_notes:pw.coach_notes,warmup:pw.warmup,cooldown:pw.cooldown,warmup_media:pw.warmup_media||null,cooldown_media:pw.cooldown_media||null,audience:"client",assignment_id:asg.id}).select("id").single();
    if(we)throw we;
    (pw.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort).forEach(b=>blocksAll.push(Object.assign({workout_id:nw.id},progBlokVelden(b))));
  }
  if(blocksAll.length){const{error:be}=await db.from("blocks").insert(blocksAll);if(be)throw be;}
  return{asg,aantal:wos.length};
}

// ---------- Kopiëren uit een template (dag of hele week) naar het klembord ----------
// Zelfde klembord als de klantkalender: daarna bij een klant (of in een andere
// week) op een dag Plakken. De onderlinge dagafstand blijft bewaard.
function progKopieer(week,day){
  if(!PROG)return;
  const wos=(PROG.workouts||[]).filter(w=>w.week===week&&(day==null||w.day===day)).sort(progSorteer);
  if(!wos.length){toast(day==null?"Week "+week+" is nog leeg":"Geen workout op deze dag om te kopiëren");return;}
  const basis="2001-01-01"; // een maandag; bij plakken telt alleen de afstand tussen de dagen
  klembordZet(wos.map(w=>({date:ymdPlus(basis,(w.week-1)*7+(w.day-1)),title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,warmup_media:w.warmup_media||null,cooldown_media:w.cooldown_media||null,
    blocks:(w.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(progBlokVelden)})));
  toast(day==null?"Week "+week+" gekopieerd ("+wos.length+" workout"+(wos.length===1?"":"s")+"). Kies Plakken op de dag waar de eerste workout moet komen."
    :(wos.length>1?wos.length+" workouts":"Workout")+" gekopieerd, ga naar een dag en kies Plakken");
}

// ---------- Opslaan als template vanuit de kalender van een klant ----------
let TPLO={ds:null,soort:"dag"};
function tplOpslaanModal(){
  if(document.getElementById("tplomodal"))return;
  const d=document.createElement("div");
  d.innerHTML='<div class="lmodal" id="tplomodal" style="z-index:398"><div class="box">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">Opslaan als template</h3><span onclick="tplOpslaanDicht()" title="Sluiten" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="seg" id="tplo-seg" style="display:inline-flex;margin-bottom:10px"><button onclick="tplOpslaanSoort(\'dag\')">Deze dag</button><button onclick="tplOpslaanSoort(\'week\')">Deze week</button></div>'+
    '<div class="sm muted" id="tplo-info" style="margin-bottom:12px;line-height:1.5"></div>'+
    '<div class="field"><label>Naam</label><input id="tplo-naam"></div>'+
    '<div class="field"><label>Omschrijving (mag leeg blijven)</label><input id="tplo-desc"></div>'+
    '<div style="display:flex;gap:8px"><button class="btn" id="tplo-btn" onclick="tplOpslaanDoen()">Opslaan</button><button class="btn ghost" onclick="tplOpslaanDicht()">Annuleren</button></div>'+
    '<div class="msg" id="tplo-msg"></div></div></div>';
  document.body.appendChild(d.firstChild);
}
function tplOpslaanDicht(){const m=document.getElementById("tplomodal");if(m)m.classList.remove("show");}
// De workouts die meegaan: [{w, day}] met day 1 = maandag bij een week, en altijd 1 bij een dag.
function tplOpslaanBron(){
  if(TPLO.soort==="dag")return (monthByDate[TPLO.ds]||[]).map(w=>({w,day:1}));
  const ma=mondayOf(new Date(TPLO.ds+"T12:00:00")),uit=[];
  for(let i=0;i<7;i++)(monthByDate[ymd(addDays(ma,i))]||[]).forEach(w=>uit.push({w,day:i+1}));
  return uit;
}
function tplOpslaanOpen(ds){
  tplOpslaanModal();
  TPLO={ds,soort:"dag"};
  const eerste=(monthByDate[ds]||[]).find(w=>!/^rest ?day$/i.test((w.title||"").trim()));
  TPLO.voorstel=eerste&&eerste.title?eerste.title:""; // naam van de dag als voorstel; bij "Deze week" halen we die weer weg
  document.getElementById("tplo-naam").value=TPLO.voorstel;
  document.getElementById("tplo-desc").value="";
  document.getElementById("tplo-msg").textContent="";
  document.getElementById("tplo-btn").disabled=false;
  tplOpslaanSoort("dag");
  document.getElementById("tplomodal").classList.add("show");
}
function tplOpslaanSoort(s){
  TPLO.soort=s;
  document.querySelectorAll("#tplo-seg button").forEach((b,i)=>b.classList.toggle("on",(i===0)===(s==="dag")));
  const bron=tplOpslaanBron(),n=bron.length,info=document.getElementById("tplo-info"),naam=document.getElementById("tplo-naam");
  const wo=n+" workout"+(n===1?"":"s");
  if(s==="week"&&TPLO.voorstel&&naam.value===TPLO.voorstel)naam.value="";
  else if(s==="dag"&&!naam.value.trim()&&TPLO.voorstel)naam.value=TPLO.voorstel;
  if(s==="dag"){
    info.textContent=biebDagLabel(TPLO.ds)+" · "+wo+". Komt in de bibliotheek onder Template dag. Scores en reacties van de klant gaan niet mee.";
    naam.placeholder="bijv. Testdag 1";
  }else{
    const ma=mondayOf(new Date(TPLO.ds+"T12:00:00")),dagen=new Set(bron.map(x=>x.day)).size;
    info.textContent=biebDagLabel(ymd(ma))+" t/m "+biebDagLabel(ymd(addDays(ma,6)))+" · "+wo+" op "+dagen+(dagen===1?" dag":" dagen")+". Komt in de bibliotheek onder Template week, met maandag als dag 1. Scores en reacties van de klant gaan niet mee.";
    naam.placeholder="bijv. Testweek, of Off season week 1";
  }
}
async function tplOpslaanDoen(){
  const msg=document.getElementById("tplo-msg"),btn=document.getElementById("tplo-btn");
  const fout=t=>{msg.textContent=t;msg.className="msg err";btn.disabled=false;};
  const naam=document.getElementById("tplo-naam").value.trim();
  if(!naam){fout("Geef de template een naam.");return;}
  const bron=tplOpslaanBron();
  if(!bron.length){fout("Er staat niets om op te slaan.");return;}
  btn.disabled=true;
  const dag=TPLO.soort==="dag";
  try{
    const{data:prog,error}=await db.from("program_templates").insert({company_id:ME.profile.company_id,created_by:ME.user.id,name:naam,description:document.getElementById("tplo-desc").value.trim()||null,type:dag?"dag":"standard",weeks:1}).select("*, creator:created_by(id,first_name,last_name,avatar_url)").single();
    if(error)throw error;
    const teller={};
    for(const x of bron){
      const t=wTemplate(x.w);teller[x.day]=(teller[x.day]||0)+1;
      const{data:pw,error:we}=await db.from("program_workouts").insert({program_id:prog.id,company_id:ME.profile.company_id,week:1,day:x.day,title:t.title||null,coach_notes:t.coach_notes||null,warmup:t.warmup||null,cooldown:t.cooldown||null,warmup_media:t.warmup_media||null,cooldown_media:t.cooldown_media||null,sort:teller[x.day]}).select().single();
      if(we)throw we;
      if(t.blocks.length){const{error:be}=await db.from("program_blocks").insert(progBlokRijen(pw.id,t.blocks));if(be)throw be;}
    }
    // Lijsten bijwerken: de bibliotheek in dit venster en het losse bibliotheek-venster.
    if(LIB.geladen){LIB.programs=(LIB.programs||[]).concat([prog]).sort((a,b)=>(a.name||"").localeCompare(b.name||""));}
    TPLKORT=null;
    const k=typeof biebKanaal==="function"?biebKanaal():null;if(k)k.postMessage({type:"progs"});
    tplOpslaanDicht();
    toast("Opgeslagen als "+(dag?"Template dag":"Template week")+'. Je vindt "'+naam+'" in de Bibliotheek.',4200);
  }catch(e){fout(e.message||"Opslaan mislukt");}
}

// ---------- Bibliotheek-venster: tabs Template week en Template dag ----------
const biebIsProg=()=>BIEB.tab==="tplweek"||BIEB.tab==="tpldag";
// Lichte lijst van alle workouts in templates (voor de tekst op de kaart);
// de blokken halen we alleen op voor template dagen, daar staat de hele dag op de kaart.
async function biebProgLaad(){
  if(BIEB.progW||!ME.profile.company_id)return;
  const per={};
  for(let van=0;van<20000;van+=1000){
    const{data,error}=await db.from("program_workouts").select("id,program_id,week,day,sort,title,warmup,cooldown,created_at").eq("company_id",ME.profile.company_id).order("program_id").order("week").order("day").order("sort").order("id").range(van,van+999);
    if(error||!data)break;
    data.forEach(w=>{const l=(per[w.program_id]=per[w.program_id]||[]);if(!l.some(x=>x.id===w.id))l.push(w);});
    if(data.length<1000)break;
  }
  const dagIds=(LIB.programs||[]).filter(progIsDag).map(p=>p.id);
  if(dagIds.length){
    const{data}=await db.from("program_workouts").select("*, program_blocks(*)").in("program_id",dagIds).order("day").order("sort");
    const metBlok={};(data||[]).forEach(w=>{(metBlok[w.program_id]=metBlok[w.program_id]||[]).push(w);});
    Object.keys(metBlok).forEach(pid=>{per[pid]=metBlok[pid];});
  }
  BIEB.progW=per;
}
// Het hoofdvenster meldt dat er een template is bijgekomen: lijst opnieuw ophalen.
async function biebProgVers(){
  const{data}=await db.from("program_templates").select("*, creator:created_by(id,first_name,last_name,avatar_url)").order("name");
  if(data)LIB.programs=data;
  BIEB.progW=null;await biebProgLaad();
  if(biebIsProg())biebRender(true);
}
function biebProgTekst(p,wos){
  wos=(wos||[]).slice().sort(progSorteer);
  if(progIsDag(p))return wos.map(w=>[w.title||"Workout",w.warmup?"Warming-up\n"+w.warmup:null]
    .concat((w.program_blocks||[]).slice().sort((a,b)=>a.sort-b.sort).map(b=>{const pr=composePresc(b);return (b.label?b.label+") ":"")+(b.exercise||"")+(pr?"\n"+pr:"");}))
    .concat([w.cooldown?"Cooldown\n"+w.cooldown:null]).filter(Boolean).join("\n")).join("\n\n");
  const weeks=Math.max(1,p.weeks||1),regels=[];
  for(let wk=1;wk<=weeks;wk++){
    const start=regels.length;
    for(let d=1;d<=7;d++){
      const t=wos.filter(w=>w.week===wk&&w.day===d).map(w=>/^rest ?day$/i.test((w.title||"").trim())?"Rustdag":(w.title||"Workout"));
      if(t.length)regels.push("Dag "+((wk-1)*7+d)+": "+t.join(" + "));
    }
    if(weeks>1&&regels.length>start)regels.splice(start,0,(start?"\n":"")+"Week "+wk);
  }
  return regels.join("\n");
}
function biebProgKaarten(v){
  const dag=BIEB.tab==="tpldag";
  const lijst=(LIB.programs||[]).filter(p=>progIsDag(p)===dag);
  const hits=lijst.map(p=>({p,wos:(BIEB.progW||{})[p.id]||[]})).map(x=>Object.assign(x,{tekst:biebProgTekst(x.p,x.wos)}))
    .filter(x=>!v||(x.p.name||"").toLowerCase().includes(v)||(x.p.description||"").toLowerCase().includes(v)||x.tekst.toLowerCase().includes(v));
  const kaarten=hits.map(x=>{
    const n=x.wos.length,wk=Math.max(1,x.p.weeks||1),wo=n+" workout"+(n===1?"":"s");
    const sub=dag?"template dag · "+wo:"template week · "+(wk===1?"1 week":wk+" weken")+" · "+wo;
    return biebKaart("progtpl",x.p.id,dag?TPLKLEUR.green:TPLKLEUR.orange,esc(x.p.name),esc(sub)+(x.p.description?"<br>"+esc(x.p.description):""),x.tekst);
  });
  let hint='<div class="cempty" style="padding:4px 10px 10px;text-align:left">'+(dag?"Sleep een template dag naar een dag bij je klant: alle workouts van die dag komen daar te staan.":"Sleep een template week naar een dag bij je klant: hij komt in die week te staan, met dag 1 op maandag.")+'</div>';
  if(!lijst.length)hint='<div class="cempty">'+(dag?"Nog geen template dagen.":"Nog geen template weken.")+" Sla bij een klant een dag of week op als template (het bladwijzertje naast + Toevoegen), of maak er een in de Bibliotheek.</div>";
  return{kaarten:lijst.length&&!kaarten.length?[]:(kaarten.length?kaarten:[" "]),totaal:hits.length,hint};
}

// Een kaart uit het bibliotheek-venster losgelaten op een dag van de klant.
// Geeft false terug als er niets is geplaatst (bijvoorbeeld bij Annuleren).
async function progTplOpDag(item,ds){
  if(typeof autoSaveBouwer==="function"&&!(await autoSaveBouwer()))return false;
  const client=(coachClients||[]).find(x=>x.id===calClient);
  if(!client){toast("Open eerst een klant");return false;}
  const{data:prog}=await db.from("program_templates").select("*").eq("id",item.id).single();
  if(!prog){toast("Template niet gevonden");return false;}
  const wos=await progWorkoutsLaad(prog.id);
  if(!wos.length){toast("Deze template is nog leeg");return false;}
  const dag=progIsDag(prog),klantNaam=[client.first_name,client.last_name].filter(Boolean).join(" ")||"deze klant";
  let start=ds;
  if(!dag){
    start=ymd(mondayOf(new Date(ds+"T12:00:00")));
    const wk=Math.max(1,prog.weeks||1);
    if(!confirm('Template week "'+prog.name+'" bij '+klantNaam+' zetten?\n\n'+wos.length+" workout"+(wos.length===1?"":"s")+", "+(wk===1?"1 week":wk+" weken")+", vanaf "+biebDagLabel(start)+". Wat er al op de kalender staat, blijft staan."))return false;
  }
  try{await progZetBijKlant({prog,workouts:wos,client,start});}
  catch(e){toast(e.message||"Toevoegen mislukt");return false;}
  toast((dag?"Template dag":"Template week")+' "'+prog.name+'" op de kalender van '+klantNaam+" gezet"+(dag?"":" vanaf "+biebDagLabel(start)),4200);
  renderMonth();
  return true;
}

// ---------- Templates in het coach-menu + wisselmenu in de kop van de editor ----------
let TPLKORT=null;
async function laadTplKort(){
  if(LIB.geladen||TPLKORT)return;
  const{data}=await db.from("program_templates").select("id,name,type,weeks").eq("company_id",ME.profile.company_id).order("name");
  TPLKORT=data||[];
}
function tplLijstKort(){return (LIB.geladen?LIB.programs:TPLKORT)||[];}
function opTplScherm(){return !!(typeof PROG!=="undefined"&&PROG&&document.querySelector(".pe-bar"));}
// De regel onder Blog in het coach-menu.
function tplMenuRij(actief){
  const n=tplLijstKort().length;
  return '<div class="pd-row'+(actief?' actief':'')+'" onclick="kiesCoach(\'tpl\')"><div class="pd-badge" style="background:linear-gradient(135deg,#b8860b,#d9b44a)">T</div><div class="pd-naam">Templates <span class="muted" style="font-weight:500">('+n+')</span></div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>';
}
async function naarTemplatesVanuitMenu(){
  if(opTplScherm())return;
  if(typeof autoSaveBouwer==="function"&&!(await autoSaveBouwer()))return; // open bouwer eerst netjes opslaan
  await laadTplKort();
  const lijst=tplLijstKort();
  let pid=null;try{pid=localStorage.getItem("forge_tpl_laatst");}catch(e){}
  if(!lijst.some(p=>p.id===pid)){const eerste=lijst.find(p=>!progIsDag(p))||lijst[0];pid=eerste?eerste.id:null;}
  LIB.mode=(pid&&progIsDag(lijst.find(p=>p.id===pid)))?"progdag":"programs";
  coachGo("library");
  if(pid)await openProgramEditor(pid);
  else toast("Nog geen templates. Maak er hier een aan, of sla bij een klant een dag of week op als template.",4200);
}
function tplDropRij(p){
  const wk=Math.max(1,p.weeks||1);
  return '<div class="pd-row'+(PROG&&p.id===PROG.id?' actief':'')+'" data-n="'+esc((p.name||"").toLowerCase())+'" onclick="tplSwitch(\''+p.id+'\')"><div class="pd-badge" style="'+avStijl(p.name)+'">'+esc((p.name||"?").slice(0,1).toUpperCase())+'</div><div class="pd-naam">'+esc(p.name)+(progIsDag(p)?'':' <span class="muted" style="font-weight:500">· '+(wk===1?"1 week":wk+" weken")+'</span>')+'</div><span class="pd-vink"><svg class="i sm-i"><use href="#i-check"/></svg></span></div>';
}
function tplDropHtml(){
  const l=tplLijstKort().slice().sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const wk=l.filter(p=>!progIsDag(p)),dg=l.filter(progIsDag);
  return (wk.length?'<div class="pd-kop">Template week</div>'+wk.map(tplDropRij).join(""):"")+(dg.length?'<div class="pd-kop">Template dag</div>'+dg.map(tplDropRij).join(""):"");
}
function tplDropFilter(v){
  const z=(v||"").toLowerCase().trim();
  document.querySelectorAll("#td-lijst .pd-row").forEach(r=>{r.style.display=(r.dataset.n||"").includes(z)?"":"none";});
  document.querySelectorAll("#td-lijst .pd-kop").forEach(k=>{k.style.display=z?"none":"";});
}
function tplSwitchMenu(ev){
  ev.stopPropagation();
  const d=document.getElementById("tpldrop");if(!d)return;
  const openNu=!d.classList.contains("show");
  document.querySelectorAll(".progdrop.show").forEach(x=>x.classList.remove("show"));
  if(!openNu)return;
  d.classList.add("show");
  const z=d.querySelector("input");if(z){z.value="";tplDropFilter("");z.focus();}
}
async function tplSwitch(id){
  document.querySelectorAll(".progdrop.show").forEach(x=>x.classList.remove("show"));
  if(PROG&&PROG.id===id)return;
  if(typeof progAutoSave==="function"&&!(await progAutoSave()))return;
  await openProgramEditor(id);
}
// De twee menu's rechts in de kop van de editor: coach-menu (staat op Templates)
// en alle templates met een zoekveld.
function tplKopChips(){
  if(!PROG)return "";
  const n=tplLijstKort().length,wk=Math.max(1,PROG.weeks||1);
  const coachChip=myRole()!=="coach"?
    '<div class="progsel" id="coachsel" onclick="toggleCoachDrop(event)"><div class="pav" style="background:linear-gradient(135deg,#b8860b,#d9b44a)">T</div><div><div class="pn">Templates</div><div class="pt">'+n+(n===1?' template':' templates')+'</div></div><span class="car">▾</span>'+
      '<div class="progdrop" id="coachdrop" style="width:260px;left:auto;right:0" onclick="event.stopPropagation()"><div class="pd-lijst" id="cd-lijst"><div class="cempty" style="padding:10px">Coaches laden…</div></div></div></div>'
    :'';
  return coachChip+
    '<div class="progsel" id="tplsel" onclick="tplSwitchMenu(event)"><div class="pav" style="'+avStijl(PROG.name)+'">'+esc((PROG.name||"?").slice(0,1).toUpperCase())+'</div><div><div class="pn">'+esc(PROG.name)+'</div><div class="pt">'+(progIsDag(PROG)?"Template dag":"Template week · "+(wk===1?"1 week":wk+" weken"))+'</div></div><span class="car">▾</span>'+
      '<div class="progdrop" id="tpldrop" style="left:auto;right:0" onclick="event.stopPropagation()"><div class="pd-search"><svg class="i sm-i"><use href="#i-search"/></svg><input placeholder="Zoek een template…" oninput="tplDropFilter(this.value)"></div><div class="pd-lijst" id="td-lijst">'+tplDropHtml()+'</div></div></div>';
}
