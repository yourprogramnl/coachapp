// app/claude-api.js — vaste commando's voor de Claude van een coach (18 nov 2026).
//
// Een coach die met Claude programmeert (Michel als eerste) liet Claude tot nu toe
// op knoppen drukken in Strivee. Hier vraagt Claude het in één keer op, vanuit de
// browser waarin de coach is ingelogd: ClaudeApi.week(...), ClaudeApi.notities(...).
// Alles loopt via dezelfde `db` als de rest van de app, dus onder de login van de
// coach zelf: de database (RLS) bepaalt wat hij mag zien, niet dit bestand.
//
// Versie 1 las alleen. Versie 2 schrijft ook, maar uitsluitend concepten: een
// workout met status 'draft' die de atleet niet ziet tot de coach hem in de app
// goedkeurt. Vaste grenzen, in elk schrijf-commando afgedwongen:
//   - nieuwe workouts krijgen altijd status 'draft';
//   - wijzigen en verwijderen kan alleen bij een workout die nog concept is;
//   - niets uit de weekworkout (YP Showdown), blog- of groepsprogramma's;
//   - er is geen commando om goed te keuren, te publiceren of iets te versturen.
// Dit verkleint de kans op fouten; het is geen slot. De echte grens blijft RLS.
//
// Elk commando geeft {ok:true, ...} of {ok:false, fout:"..."} terug en gooit geen
// fouten, zodat Claude altijd een leesbaar antwoord krijgt. Begin met ClaudeApi.hulp().
const ClaudeApi=(()=>{
  const VERSIE="2.0 (lezen en concepten schrijven)";
  const DAGKORT=["zo","ma","di","wo","do","vr","za"];
  const STAF=["coach","eigenaar","platform_admin"];
  const MAX_WORKOUTS=14,MAX_BLOKKEN=30,MAX_TEKST=6000,MAX_VIDEOS=8,MAX_DAGEN_VOORUIT=120;
  const pad2=n=>String(n).padStart(2,"0");
  const iso=d=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
  const opDag=s=>new Date(s+"T12:00:00"); // midden op de dag: veilig voor zomertijd
  const plus=(s,n)=>{const d=opDag(s);d.setDate(d.getDate()+n);return iso(d);};
  const maandagVan=s=>plus(s,-((opDag(s).getDay()+6)%7));
  const dagVan=s=>DAGKORT[opDag(s).getDay()];
  const dagenTussenIso=(a,b)=>Math.round((opDag(b)-opDag(a))/86400000);
  const isDatum=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(opDag(s).getTime())&&iso(opDag(s))===s;
  const isUuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const naam=p=>((p.first_name||"")+" "+(p.last_name||"")).trim();
  const fout=m=>({ok:false,fout:m});
  const leeg=v=>v===null||v===undefined||v==="";
  const isObject=o=>!!o&&typeof o==="object"&&!Array.isArray(o);
  // Lege velden weglaten houdt het antwoord klein en leesbaar.
  const schoon=o=>{const u={};for(const k in o){if(!leeg(o[k])&&!(Array.isArray(o[k])&&!o[k].length))u[k]=o[k];}return u;};
  // Tijdstip in de lokale tijd van de browser (de database bewaart UTC).
  const tijd=ts=>{if(!ts)return "";const d=new Date(ts);return isNaN(d.getTime())?"":iso(d)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());};
  // Een atleet is een lid, of iemand met een eigen coach (een coach die zelf bij een collega traint).
  const isAtleet=p=>p.role==="lid"||!!p.coach_id;
  const stukken=(lijst,n)=>{const u=[];for(let i=0;i<lijst.length;i+=n)u.push(lijst.slice(i,i+n));return u;};
  const isRust=t=>/^rest ?day$/i.test(String(t||"").trim());
  const titels=media=>(Array.isArray(media)?media:[]).map(m=>m&&m.titel).filter(Boolean);
  const kleurenLijst=()=>{try{return TPLKLEUREN.slice();}catch(e){return ["yellow","blue","purple","red","green","orange"];}};
  const scoreLijst=()=>{try{return SCORETYPES.map(s=>s[0]);}catch(e){return ["text","time","load","reps","rounds_reps","none"];}};
  const gelijk=(a,b)=>JSON.stringify(a===undefined?null:a)===JSON.stringify(b===undefined?null:b);

  function nietKlaar(){
    if(typeof db==="undefined"||!db||!ME||!ME.user||!ME.profile)return "Niet ingelogd. Log eerst in op de coach-app en probeer het opnieuw.";
    if(!STAF.includes(ME.profile.role))return "Deze commando's zijn alleen voor coaches.";
    return null;
  }
  // Een atleet moet bij het eigen bedrijf horen. Zo komt een sportschoollid er nooit
  // per ongeluk doorheen, ook niet bij een beheerder.
  async function atleetOphalen(id){
    if(!isUuid(id))return {fout:"Geef het id van de atleet (uit ClaudeApi.atleten), geen naam."};
    const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived,company_id,role,gender,birth_date,height_cm,weight_kg,profile_note").eq("id",id).maybeSingle();
    if(error)return {fout:error.message};
    if(!data)return {fout:"Geen atleet gevonden met dit id, of je mag hem niet zien."};
    if(!isAtleet(data)||data.company_id!==ME.profile.company_id)return {fout:"Dit id hoort niet bij een atleet van jouw bedrijf."};
    return {p:data};
  }
  // .in() met veel id's in stukken, zodat de link niet te lang wordt.
  async function haalIn(tabel,kolommen,veld,ids,extra){
    let rijen=[];
    for(const deel of stukken(ids,60)){
      let q=db.from(tabel).select(kolommen).in(veld,deel);
      if(extra)q=extra(q);
      const{data,error}=await q;
      if(error)throw new Error(tabel+": "+error.message);
      rijen=rijen.concat(data||[]);
    }
    return rijen;
  }
  const veilig=fn=>async(...a)=>{const nk=nietKlaar();if(nk)return fout(nk);try{return await fn(...a);}catch(e){return fout(String(e&&e.message||e));}};

  function resultaatUit(r,b){
    if(!r)return null;
    let score=r.score_text||"";
    try{if(typeof resultScoreVol==="function")score=resultScoreVol(r,b.score_type)||score;}catch(e){}
    let rondetijden="";
    try{if(typeof resultSplitsTxt==="function")rondetijden=resultSplitsTxt(r);}catch(e){}
    return schoon({status:r.status==="missed"?"gemist":"voltooid",score,sets:r.sets,rondetijden,notitie_atleet:r.note,rx:r.rx,
      afgekapt_op_tijdslimiet:r.capped?true:null,gelogd_op:tijd(r.updated_at||r.created_at)});
  }

  // ---------- Eén vorm voor lezen én schrijven ----------
  // Wat ClaudeApi.week teruggeeft kan, aangepast, zo weer in een schrijf-commando.
  function blokUit(b){
    const cond=b.kind==="conditioning";
    return schoon({id:b.id,letter:b.label,soort:cond?"conditioning":"oefening",naam:b.exercise,
      voorschrift:cond?null:b.prescription,omschrijving:cond?b.notes:null,coachingtips:cond?null:b.notes,
      scoretype:b.score_type,kleur:b.color,tijdslimiet_sec:b.timecap_seconds,
      superset_met_vorige:b.linked?true:null,kaarttitel:b.group_title,schema:b.lift_scheme,
      uit_weekworkout:b.source_blog_workout_id?true:null,demo_videos:titels(b.media)});
  }
  function workoutUit(w,perBlok,extra){
    const blokken=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort).map(b=>perBlok?Object.assign(blokUit(b),schoon(perBlok(b))):blokUit(b));
    return schoon(Object.assign({id:w.id,datum:w.workout_date,dag:dagVan(w.workout_date),titel:w.title,
      status:w.status==="draft"?"concept":"gepubliceerd",
      rustdag:(!blokken.length&&isRust(w.title))?true:null,
      notitie_coach:w.coach_notes,warming_up:w.warmup,cooldown:w.cooldown,
      demo_videos_warming_up:titels(w.warmup_media),demo_videos_cooldown:titels(w.cooldown_media),
      uit_weekworkout:w.source_blog_workout_id?true:null},extra||{},{blokken}));
  }
  const BLOK_SCHRIJF=["soort","naam","voorschrift","omschrijving","coachingtips","scoretype","kleur","tijdslimiet_sec","superset_met_vorige","kaarttitel","videos"];
  const BLOK_NEGEER=["id","letter","schema","resultaat","videos_van_atleet","demo_videos","uit_weekworkout"];
  const W_SCHRIJF=["datum","titel","rustdag","notitie_coach","warming_up","cooldown","videos","blokken"];
  const W_NEGEER=["id","dag","status","rpe","minuten","reacties","uit_weekworkout","demo_videos_warming_up","demo_videos_cooldown"];

  // ---------- Invoer controleren (er wordt pas geschreven als alles klopt) ----------
  function tekstVeld(o,k,max,waar,fouten){
    const v=o[k];if(leeg(v))return null;
    if(typeof v!=="string"){fouten.push(waar+": "+k+" moet tekst zijn.");return null;}
    const t=v.replace(/\r\n/g,"\n").trim();
    if(t.length>max)fouten.push(waar+": "+k+" is te lang (maximaal "+max+" tekens).");
    return t||null;
  }
  // videos: weggelaten = de app kiest zelf, "auto", "geen", "houden", of een lijst oefening-id's uit ClaudeApi.videoZoek.
  function videosLees(v,waar,fouten,magLijst){
    if(v===undefined||v===null)return undefined;
    if(v==="auto"||v==="geen"||v==="houden")return v;
    if(magLijst&&Array.isArray(v)){
      if(v.length>MAX_VIDEOS){fouten.push(waar+": maximaal "+MAX_VIDEOS+" video's per blok.");return undefined;}
      const ids=v.map(Number);
      if(ids.some(n=>!Number.isInteger(n)||n<1)){fouten.push(waar+": videos moet een lijst oefening-id's zijn (getallen uit ClaudeApi.videoZoek).");return undefined;}
      return ids;
    }
    fouten.push(waar+": videos moet \"auto\", \"geen\" of \"houden\" zijn"+(magLijst?", of een lijst oefening-id's uit ClaudeApi.videoZoek.":"."));
    return undefined;
  }
  function blokLees(b,waar,fouten){
    if(!isObject(b)){fouten.push(waar+": een blok moet een object zijn.");return null;}
    const onbekend=Object.keys(b).filter(k=>!BLOK_SCHRIJF.includes(k)&&!BLOK_NEGEER.includes(k));
    if(onbekend.length)fouten.push(waar+": onbekend veld "+onbekend.join(", ")+". Toegestaan: "+BLOK_SCHRIJF.join(", ")+".");
    if(b.uit_weekworkout)fouten.push(waar+": dit blok komt uit de weekworkout (YP Showdown). Die schrijf, wijzig of kopieer je niet.");
    const soort=leeg(b.soort)?"oefening":b.soort;
    if(soort!=="oefening"&&soort!=="conditioning")fouten.push(waar+": soort moet oefening of conditioning zijn.");
    const cond=soort==="conditioning";
    const exercise=tekstVeld(b,"naam",200,waar,fouten);
    if(!exercise)fouten.push(waar+": naam ontbreekt.");
    if(cond&&(!leeg(b.voorschrift)||!leeg(b.coachingtips)))fouten.push(waar+": een conditioning-blok heeft alleen naam en omschrijving. Zet de tekst in omschrijving.");
    if(!cond&&!leeg(b.omschrijving))fouten.push(waar+": een oefening heeft voorschrift en coachingtips, geen omschrijving.");
    const prescription=cond?null:tekstVeld(b,"voorschrift",MAX_TEKST,waar,fouten);
    const notes=cond?tekstVeld(b,"omschrijving",MAX_TEKST,waar,fouten):tekstVeld(b,"coachingtips",MAX_TEKST,waar,fouten);
    const score_type=leeg(b.scoretype)?"text":b.scoretype;
    if(!scoreLijst().includes(score_type))fouten.push(waar+": onbekend scoretype \""+score_type+"\". Kies uit: "+scoreLijst().join(", ")+".");
    let timecap_seconds=null;
    if(!leeg(b.tijdslimiet_sec)){
      timecap_seconds=Number(b.tijdslimiet_sec);
      if(!Number.isInteger(timecap_seconds)||timecap_seconds<1||timecap_seconds>14400){fouten.push(waar+": tijdslimiet_sec moet een heel aantal seconden zijn (1 t/m 14400).");timecap_seconds=null;}
      else if(score_type!=="time")fouten.push(waar+": tijdslimiet_sec kan alleen bij scoretype time.");
    }
    const color=leeg(b.kleur)?null:b.kleur;
    if(color&&!kleurenLijst().includes(color))fouten.push(waar+": onbekende kleur \""+color+"\". Kies uit: "+kleurenLijst().join(", ")+".");
    if(!leeg(b.superset_met_vorige)&&typeof b.superset_met_vorige!=="boolean")fouten.push(waar+": superset_met_vorige moet true of false zijn.");
    const group_title=tekstVeld(b,"kaarttitel",200,waar,fouten);
    const videos=videosLees(b.videos,waar,fouten,true);
    return {id:leeg(b.id)?null:b.id,raak:true,kind:cond?"conditioning":"exercise",exercise,prescription,notes,score_type,timecap_seconds,color,linked:b.superset_met_vorige===true,group_title,videos};
  }
  function blokkenLees(lijst,waar,fouten){
    if(leeg(lijst))return [];
    if(!Array.isArray(lijst)){fouten.push(waar+": blokken moet een lijst zijn.");return [];}
    if(lijst.length>MAX_BLOKKEN)fouten.push(waar+": maximaal "+MAX_BLOKKEN+" blokken per workout.");
    return lijst.map((b,i)=>blokLees(b,waar+", blok "+(i+1),fouten)).filter(Boolean);
  }
  function datumMag(d,opties,waar,fouten){
    const vandaag=iso(new Date());
    if(d<vandaag&&!(opties&&opties.verleden===true))fouten.push(waar+": "+d+" ligt in het verleden. Klopt dat echt, geef dan {verleden:true} mee.");
    if(dagenTussenIso(vandaag,d)>MAX_DAGEN_VOORUIT)fouten.push(waar+": "+d+" ligt meer dan "+MAX_DAGEN_VOORUIT+" dagen vooruit. Controleer het jaartal.");
  }
  function workoutLees(w,waar,fouten,opties){
    if(!isObject(w)){fouten.push(waar+": een workout moet een object zijn.");return null;}
    const onbekend=Object.keys(w).filter(k=>!W_SCHRIJF.includes(k)&&!W_NEGEER.includes(k));
    if(onbekend.length)fouten.push(waar+": onbekend veld "+onbekend.join(", ")+". Toegestaan: "+W_SCHRIJF.join(", ")+".");
    if(w.uit_weekworkout)fouten.push(waar+": deze workout komt uit de weekworkout (YP Showdown). Die schrijf of kopieer je niet.");
    if(!isDatum(w.datum))fouten.push(waar+": datum moet JJJJ-MM-DD zijn, bijvoorbeeld 2026-11-23.");
    else datumMag(w.datum,opties,waar,fouten);
    const rust=w.rustdag===true;
    const blokken=blokkenLees(w.blokken,waar,fouten);
    let title=tekstVeld(w,"titel",200,waar,fouten);
    if(rust){
      if(blokken.length)fouten.push(waar+": een rustdag heeft geen blokken.");
      title="Rest Day";
    }else if(!title)fouten.push(waar+": titel ontbreekt.");
    return {datum:w.datum,rust,title,coach_notes:tekstVeld(w,"notitie_coach",MAX_TEKST,waar,fouten),
      warmup:tekstVeld(w,"warming_up",MAX_TEKST,waar,fouten),cooldown:tekstVeld(w,"cooldown",MAX_TEKST,waar,fouten),
      videos:videosLees(w.videos,waar,fouten,false),blokken};
  }

  // ---------- Letters (A, B1, B2, C) en volgorde, zoals de bouwer ze zet ----------
  function letters(blokken){
    if(blokken.length)blokken[0].linked=false;
    const groepen=[];
    blokken.forEach((b,i)=>{if(i>0&&b.linked)groepen[groepen.length-1].push(b);else groepen.push([b]);});
    groepen.forEach((g,gi)=>{const L=String.fromCharCode(65+Math.min(gi,25));g.forEach((b,pos)=>{b.label=g.length>1?L+(pos+1):L;});});
    blokken.forEach((b,i)=>{b.sort=i+1;});
    return blokken;
  }

  // ---------- Demo-video's: dezelfde herkenning als "Voorstellen overnemen" ----------
  async function videosKlaar(){
    try{if(typeof vsKlaar==="function")await vsKlaar();}catch(e){}
    try{return !!(GM&&GM.index&&GM.index.length);}catch(e){return false;}
  }
  function mediaAuto(tekst){
    try{return gmHerkenTekst(tekst,new Set()).filter(v=>v.yt).slice(0,MAX_VIDEOS).map(v=>({youtube_id:v.yt,titel:v.naam,oefening_id:v.oefId,term:v.term}));}
    catch(e){return [];}
  }
  function mediaLijst(ids,waar,fouten){
    const uit=[];let bieb=[];try{bieb=LIB.oef||[];}catch(e){}
    ids.forEach(id=>{
      const o=bieb.find(x=>Number(x.id)===id);
      if(!o)fouten.push(waar+": geen oefening met id "+id+" in de bibliotheek.");
      else if(!o.youtube_id)fouten.push(waar+": oefening "+id+" ("+o.naam+") heeft geen video.");
      else if(!uit.some(m=>m.youtube_id===o.youtube_id))uit.push({youtube_id:o.youtube_id,titel:o.naam,oefening_id:o.id});
    });
    return uit;
  }
  // keuze: undefined | "auto" | "geen" | "houden" | [oefening-id's]. oud = wat er nu staat
  // (undefined bij een nieuw onderdeel). Zonder keuze: nieuw of gewijzigde tekst = automatisch,
  // ongewijzigde tekst = laten staan.
  function mediaKies(keuze,tekst,oud,gewijzigd,waar,fouten,indexOk){
    if(Array.isArray(keuze)){const m=mediaLijst(keuze,waar,fouten);return m.length?m:null;}
    if(keuze==="geen")return null;
    if(keuze==="houden"||(keuze===undefined&&oud!==undefined&&!gewijzigd))return oud||null;
    if(!indexOk)return oud||null;
    const m=mediaAuto(tekst||"");return m.length?m:null;
  }
  const blokTekst=n=>[n.exercise,n.kind==="conditioning"?n.notes:n.prescription].filter(Boolean).join("\n");

  // ---------- Van gecontroleerde invoer naar databaserij ----------
  function blokRij(n,oud){
    if(!n.raak)return {label:n.label,sort:n.sort,linked:!!n.linked}; // niet aangeraakt: alleen plek en letter
    const rij={kind:n.kind,label:n.label,linked:!!n.linked,exercise:n.exercise,prescription:n.prescription,notes:n.notes,sort:n.sort,
      color:n.color,score_type:n.score_type,timecap_seconds:n.timecap_seconds,group_title:n.group_title,media:n.media||null};
    // Krachtschema zoals de bouwer: een door de coach met de hand gezet schema blijft staan,
    // anders lezen we het uit het voorschrift. De lift zelf koppelt de database (trigger).
    let schema=null;
    if(n.kind==="exercise"){
      const os=oud&&oud.lift_scheme;
      if(os&&os.hand)schema=os;
      else{
        try{schema=typeof schemaLees==="function"?schemaLees(n.prescription||""):null;}catch(e){schema=null;}
        if(os&&os.geen_lift)schema=Object.assign(schema||{},{geen_lift:true});
      }
    }
    rij.lift_scheme=schema;
    return rij;
  }
  // Blokken van een concept bijwerken: zelfde id = bijwerken, geen id = nieuw, ontbreekt = weg.
  async function blokkenSync(w,normen){
    const oud={};(w.blocks||[]).forEach(b=>{oud[b.id]=b;});
    const blijft=new Set(normen.filter(n=>n.id).map(n=>n.id));
    const weg=Object.keys(oud).filter(id=>!blijft.has(id));
    if(weg.length){const{error}=await db.from("blocks").delete().in("id",weg);if(error)throw new Error(error.message);}
    for(const n of normen){
      if(!n.id)continue;
      const rij=blokRij(n,oud[n.id]),anders={};
      for(const k in rij){if(!gelijk(rij[k],oud[n.id][k]))anders[k]=rij[k];}
      if(Object.keys(anders).length){const{error}=await db.from("blocks").update(anders).eq("id",n.id);if(error)throw new Error(error.message);}
    }
    const nieuw=normen.filter(n=>!n.id).map(n=>Object.assign({workout_id:w.id},blokRij(n,null)));
    if(nieuw.length){const{error}=await db.from("blocks").insert(nieuw);if(error)throw new Error(error.message);}
    return {verwijderd:weg.length,nieuw:nieuw.length};
  }
  const normUitRij=b=>({id:b.id,raak:false,kind:b.kind,exercise:b.exercise,prescription:b.prescription,notes:b.notes,linked:!!b.linked,media:b.media||null});

  // ---------- Alleen concepten zijn te wijzigen ----------
  async function conceptOphalen(wid){
    if(!isUuid(wid))return {fout:"Geef het id van de workout (uit ClaudeApi.week of het antwoord van een schrijf-commando)."};
    const{data:w,error}=await db.from("workouts").select("*, blocks(*)").eq("id",wid).maybeSingle();
    if(error)return {fout:error.message};
    if(!w)return {fout:"Geen workout gevonden met dit id, of je mag hem niet zien."};
    if(w.audience!=="client"||!w.client_id)return {fout:"Dit is geen 1-op-1 workout. Weekworkouts, blog- en groepsprogramma's verander je hier nooit."};
    if(w.status!=="draft")return {fout:"Deze workout is al zichtbaar voor de atleet. Je wijzigt alleen concepten. De coach kan hem in de app zelf terugzetten op concept."};
    if(w.source_blog_workout_id||(w.blocks||[]).some(b=>b.source_blog_workout_id))return {fout:"Deze workout bevat een onderdeel uit de weekworkout (YP Showdown). Die past alleen de coach zelf aan."};
    const a=await atleetOphalen(w.client_id);if(a.fout)return {fout:a.fout};
    w.blocks=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
    return {w,p:a.p};
  }
  async function heeftLogs(wid){
    const{count,error}=await db.from("results").select("id",{count:"exact",head:true}).eq("workout_id",wid);
    if(error)throw new Error("results: "+error.message);
    return (count||0)>0;
  }
  async function leesTerug(ids){
    if(!ids.length)return [];
    const rijen=await haalIn("workouts","*, blocks(*)","id",ids);
    return rijen.sort((a,b)=>a.workout_date<b.workout_date?-1:a.workout_date>b.workout_date?1:ids.indexOf(a.id)-ids.indexOf(b.id)).map(w=>workoutUit(w));
  }
  // Mislukt het schrijven halverwege, dan halen we weg wat er net is neergezet (alleen concepten).
  async function ruimOp(ids){
    if(!ids.length)return true;
    try{const{error}=await db.from("workouts").delete().in("id",ids).eq("status","draft");return !error;}catch(e){return false;}
  }
  // Staat de kalender van deze atleet open (zonder open bouwer), dan verversen we hem.
  function ververs(atleetId){
    try{if(typeof calClient!=="undefined"&&calClient===atleetId&&document.getElementById("calwrap")&&!document.getElementById("exrows")&&typeof renderMonth==="function")renderMonth();}catch(e){}
  }
  const GOEDKEUREN="Dit zijn concepten: de atleet ziet ze niet. De coach keurt ze zelf goed in de app.";

  // Workouts als concept neerzetten: eerst de workouts één voor één (zo blijft de volgorde
  // op een dag kloppen), dan alle blokken in één keer.
  async function conceptenNeerzetten(atleet,rijen){
    const ids=[];
    try{
      for(const r of rijen){
        const{data,error}=await db.from("workouts").insert(Object.assign({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:atleet.id,status:"draft"},r.workout)).select("id,status").single();
        if(error)throw new Error(error.message);
        ids.push(data.id);
        if(data.status!=="draft")throw new Error("De workout kwam niet als concept in de database.");
      }
      const blokken=[];
      rijen.forEach((r,i)=>r.blokken.forEach(b=>blokken.push(Object.assign({workout_id:ids[i]},b))));
      for(const deel of stukken(blokken,200)){
        const{error}=await db.from("blocks").insert(deel);
        if(error)throw new Error(error.message);
      }
    }catch(e){
      const opgeruimd=await ruimOp(ids);
      throw new Error("Schrijven mislukt: "+String(e&&e.message||e)+(opgeruimd?" Er is niets blijven staan.":" Let op: mogelijk is een deel blijven staan als concept; kijk met ClaudeApi.week."));
    }
    return ids;
  }

  return {
    versie:VERSIE,

    // Uitleg van de commando's en van de vaste waarden (scoretypes, kleuren).
    hulp(){
      let scoretypes=null,kleuren=null;
      try{scoretypes=SCORETYPES.map(s=>s[0]+" = "+s[1]);}catch(e){}
      try{kleuren=TPLKLEUREN.map(k=>k+" = "+LEGNAAM[k]);}catch(e){}
      return {ok:true,versie:VERSIE,
        regels:[
          "Lezen mag altijd. Schrijven kan alleen als concept: een workout die de atleet niet ziet tot de coach hem in de app goedkeurt.",
          "Er is geen commando om goed te keuren, te publiceren of iets te versturen. Dat doet de coach zelf.",
          "Schrijf pas nadat de coach heeft gezegd dat het erin mag (\"zet erin\", \"voer in\").",
          "Een workout die al zichtbaar is voor de atleet kun je niet wijzigen of weghalen. Wil de coach dat toch, dan zet hij hem in de app zelf terug op concept.",
          "Onderdelen met uit_weekworkout:true komen uit de weekworkout (YP Showdown). Die schrijf, wijzig of kopieer je nooit.",
          "Je ziet alleen wat de ingelogde coach mag zien.",
          "Begin elke sessie met ClaudeApi.ik() en controleer dat de juiste coach is ingelogd.",
          "Zoek een atleet altijd eerst op met ClaudeApi.atleten(...) en gebruik daarna zijn id. Elk antwoord noemt de atleet bij naam: controleer die naam.",
          "Een leeg veld betekent: niet ingevuld. Reken of gok het niet zelf.",
          "Elk schrijf-commando geeft terug wat er nu staat, in dezelfde vorm als ClaudeApi.week. Lees dat na, vooral demo_videos: de herkenning zit er soms naast.",
          "Staat er ok:false, dan is er niets geschreven, tenzij de fout zelf iets anders zegt.",
          "Een groot antwoord (vier weken van een atleet die veel traint is al snel 75 kB) kan in je browsergereedschap afgekapt worden. Bewaar het dan in een variabele (window.w = await ClaudeApi.week(...)) en lees het per week of per dag uit, of vraag één week per keer op."
        ],
        lezen:{
          "ClaudeApi.ik()":"Wie is er ingelogd, welke rol, welke datum is het vandaag.",
          "ClaudeApi.atleten(zoek, alle)":"Lijst van atleten met id. zoek = deel van de naam (optioneel). Standaard alleen je eigen klanten; alle=true toont iedereen die je mag zien.",
          "ClaudeApi.week(atleetId, datum, weken)":"Het 1-op-1 programma per week, met blokken, resultaten per blok, RPE en reacties. datum = een dag in de laatste week (JJJJ-MM-DD), weken = hoeveel weken terug inclusief die week (1 t/m 8, standaard 1). Concepten staan erbij met status concept.",
          "ClaudeApi.notities(atleetId)":"Profiel, doelen, coachnotities, dagnotities en vastgelegde consults.",
          "ClaudeApi.metingen(atleetId, naam)":"Laatste waarde per meting (krachtwaarden, benchmarks). Met naam erbij: de hele geschiedenis van die ene meting.",
          "ClaudeApi.bibliotheek(zoek, soort)":"Templates uit de bibliotheek. soort = warmup, cooldown of other (optioneel).",
          "ClaudeApi.videoZoek(zoek)":"Oefeningen met een demo-video, met id. Gebruik die id's in videos:[...] als de automatische keuze niet klopt."
        },
        schrijven:{
          "ClaudeApi.schrijfConcept(atleetId, workouts, opties)":"Zet één of meer workouts als concept klaar (maximaal "+MAX_WORKOUTS+" per keer, dus een hele week in één keer). workouts = lijst in de vorm van het voorbeeld hieronder. opties (optioneel): {toch:true} als er op die dag al een concept met dezelfde titel staat en je er bewust een naast wilt; {verleden:true} voor een datum in het verleden; {videos:\"geen\"} om geen demo-video's te laten kiezen.",
          "ClaudeApi.kopieerWeek(atleetId, vanDatum, naarDatum, opties)":"Kopieert alle 1-op-1 workouts uit de week van vanDatum naar de week van naarDatum, op dezelfde weekdagen, als concept. Resultaten en reacties gaan niet mee, demo-video's wel. Onderdelen uit de weekworkout worden overgeslagen. Daarna pas je met wijzigBlok alleen aan wat verandert.",
          "ClaudeApi.wijzigBlok(blokId, velden)":"Past één blok van een concept aan. Geef alleen de velden die veranderen, bijvoorbeeld {voorschrift:\"6 reps @30X1; rest 2-3 min. x 4 sets.\"}. Verandert de naam of de tekst, dan worden de demo-video's opnieuw gekozen (videos:\"houden\" laat ze staan).",
          "ClaudeApi.vervangBlokken(workoutId, blokken)":"Zet de hele blokkenlijst van een concept in één keer: een blok met id wordt bijgewerkt, zonder id is nieuw, wat ontbreekt gaat weg. Zo voeg je een blok toe, haal je er een weg of verander je de volgorde.",
          "ClaudeApi.wijzigConcept(workoutId, velden)":"Past de workout zelf aan: datum, titel, notitie_coach, warming_up, cooldown.",
          "ClaudeApi.verwijderConcept(workoutId)":"Haalt één concept weg, met zijn blokken. Kan alleen bij een concept zonder gelogde resultaten. Doe dit alleen voor een concept dat je zelf hebt klaargezet of als de coach erom vraagt."
        },
        blok:{
          soort:"oefening (standaard) of conditioning.",
          naam:"Verplicht. De naam van de oefening of van het onderdeel.",
          voorschrift:"Alleen bij een oefening. Zoals in de uitleg: \"8 reps @30X1; rest 2-3 min. x 4 sets.\" of \"5 x 3 @ 75%\".",
          coachingtips:"Alleen bij een oefening. Losse aanwijzingen onder het voorschrift.",
          omschrijving:"Alleen bij conditioning. De hele tekst van het onderdeel.",
          scoretype:"Wat de atleet invult. Standaard text. Zie scoretypes.",
          kleur:"Zie kleuren. Leeg mag.",
          tijdslimiet_sec:"Alleen bij scoretype time.",
          superset_met_vorige:"true = hoort bij het blok erboven (B1, B2). De letters zet de app zelf.",
          kaarttitel:"Titel boven een superset, op het eerste blok van de groep.",
          videos:"Weglaten = de app kiest zelf uit de tekst. \"geen\", \"houden\" (bij wijzigen) of een lijst id's uit ClaudeApi.videoZoek."
        },
        voorbeeld:{
          aanroep:"await ClaudeApi.schrijfConcept(atleetId, workouts)",
          workouts:[
            {datum:"2026-11-23",titel:"Lower body + conditioning",notitie_coach:"Rustig opbouwen, schouder ontzien.",warming_up:"3 rounds:\n10 Air Squats\n10 Banded Good Mornings",
              blokken:[
                {naam:"Back Squat",voorschrift:"6 reps @30X1; rest 2-3 min. x 4 sets.",coachingtips:"Laat 2 reps in de tank.",kleur:"orange"},
                {naam:"Dumbbell Romanian Deadlift",voorschrift:"8-10 reps @3011; rest 60 sec. x 3 sets.",kleur:"yellow"},
                {naam:"Single Arm Dumbbell Row",voorschrift:"10/10 reps @2011; rest 60 sec. x 3 sets.",kleur:"yellow",superset_met_vorige:true},
                {soort:"conditioning",naam:"AMRAP 12",omschrijving:"12 Wall Balls\n9 Toes to Bar\n6 Burpee Box Jump Overs",scoretype:"rounds_reps",kleur:"blue"}
              ]},
            {datum:"2026-11-24",rustdag:true}
          ]
        },
        scoretypes,kleuren};
    },

    ik:veilig(async()=>{
      const vandaag=iso(new Date());
      return {ok:true,versie:VERSIE,coach:naam(ME.profile),coach_id:ME.user.id,rol:ME.profile.role,vandaag,weekdag:dagVan(vandaag),maandag_deze_week:maandagVan(vandaag)};
    }),

    atleten:veilig(async(zoek,alle)=>{
      const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived,role").eq("company_id",ME.profile.company_id).in("role",["lid","coach","eigenaar","platform_admin"]).order("first_name");
      if(error)return fout(error.message);
      const z=String(zoek||"").trim().toLowerCase();
      const lijst=(data||[]).filter(isAtleet).filter(p=>!p.archived).filter(p=>alle||p.coach_id===ME.user.id).filter(p=>!z||naam(p).toLowerCase().includes(z))
        .map(p=>schoon({id:p.id,naam:naam(p),soort:p.membership_type||"",eigen_klant:p.coach_id===ME.user.id,is_zelf_coach:p.role!=="lid"?true:null}));
      return {ok:true,aantal:lijst.length,filter:(z?"naam bevat \""+z+"\"":"geen")+(alle?", alle atleten":", alleen eigen klanten"),atleten:lijst};
    }),

    week:veilig(async(atleetId,datum,weken)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      if(leeg(datum))datum=iso(new Date());
      if(!isDatum(datum))return fout("datum moet JJJJ-MM-DD zijn, bijvoorbeeld 2026-11-16.");
      weken=leeg(weken)?1:Number(weken);
      if(!Number.isInteger(weken)||weken<1||weken>8)return fout("weken moet een heel getal van 1 t/m 8 zijn.");
      const laatsteMaandag=maandagVan(datum),van=plus(laatsteMaandag,-7*(weken-1)),tot=plus(laatsteMaandag,6);
      const{data:ws,error}=await db.from("workouts").select("*, blocks(*)").eq("client_id",a.p.id).gte("workout_date",van).lte("workout_date",tot)
        .order("workout_date").order("day_sort",{nullsFirst:false}).order("created_at");
      if(error)return fout(error.message);
      const wids=(ws||[]).map(w=>w.id);
      let res=[],eff=[],com=[],med=[];
      if(wids.length){
        [res,eff,com,med]=await Promise.all([
          haalIn("results","block_id,workout_id,status,score_text,time_seconds,load_kg,reps,rounds,rx,note,sets,splits,score_value,capped,timer,created_at,updated_at","workout_id",wids,q=>q.eq("athlete_id",a.p.id)),
          haalIn("workout_effort","workout_id,rpe,minutes","workout_id",wids,q=>q.eq("athlete_id",a.p.id)),
          haalIn("workout_comments","workout_id,author_id,body,created_at","workout_id",wids,q=>q.order("created_at")),
          haalIn("result_media","block_id,workout_id","workout_id",wids)
        ]);
      }
      const resPerBlok={};res.forEach(r=>{resPerBlok[r.block_id]=r;});
      const effPerW={};eff.forEach(e=>{effPerW[e.workout_id]=e;});
      const comPerW={};com.forEach(c=>{(comPerW[c.workout_id]=comPerW[c.workout_id]||[]).push(c);});
      const vidPerBlok={};med.forEach(m=>{vidPerBlok[m.block_id]=(vidPerBlok[m.block_id]||0)+1;});
      const perWeek={};
      for(let i=0;i<weken;i++){const m=plus(van,7*i);perWeek[m]={maandag:m,zondag:plus(m,6),workouts:[]};}
      (ws||[]).forEach(w=>{
        const e=effPerW[w.id];
        const rij=workoutUit(w,b=>({videos_van_atleet:vidPerBlok[b.id]||null,resultaat:resultaatUit(resPerBlok[b.id],b)}),
          {rpe:e?e.rpe:null,minuten:e?e.minutes:null,
           reacties:(comPerW[w.id]||[]).map(c=>({van:c.author_id===a.p.id?"atleet":"coach",op:tijd(c.created_at),tekst:c.body}))});
        const wk=perWeek[maandagVan(w.workout_date)];if(wk)wk.workouts.push(rij);
      });
      return {ok:true,atleet:{id:a.p.id,naam:naam(a.p)},periode:{van,tot,weken},
        let_op:"Alleen 1-op-1 workouts van deze atleet. Blog- en groepsprogramma's die hij daarnaast volgt staan hier niet in.",
        weken:Object.values(perWeek)};
    }),

    notities:veilig(async(atleetId)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      const id=a.p.id;
      const[nq,iq,pq,dq,cq]=await Promise.all([
        db.from("notes").select("body,created_at,updated_at").eq("athlete_id",id).order("created_at",{ascending:false}).limit(50),
        db.from("client_info").select("data,updated_at").eq("athlete_id",id).limit(1),
        db.from("client_private").select("data,updated_at").eq("athlete_id",id).limit(1),
        db.from("day_notes").select("note_date,body").eq("athlete_id",id).order("note_date",{ascending:false}).limit(60),
        db.from("consults").select("consult_date,notes").eq("athlete_id",id).order("consult_date",{ascending:false}).limit(30)
      ]);
      const mislukt=[["notes",nq],["client_info",iq],["client_private",pq],["day_notes",dq],["consults",cq]].filter(x=>x[1].error).map(x=>x[0]+": "+x[1].error.message);
      const p=a.p;
      return schoon({ok:true,atleet:{id,naam:naam(p)},
        profiel:schoon({soort:p.membership_type,geslacht:p.gender,geboortedatum:p.birth_date,lengte_cm:p.height_cm,gewicht_kg:p.weight_kg,profielnotitie:p.profile_note}),
        klantinfo:((iq.data||[])[0]||{}).data||null,
        alleen_coach:((pq.data||[])[0]||{}).data||null,
        notities:(nq.data||[]).map(n=>({op:(n.updated_at||n.created_at||"").slice(0,10),tekst:n.body})),
        dagnotities:(dq.data||[]).map(n=>({datum:n.note_date,tekst:n.body})),
        consults:(cq.data||[]).map(c=>({datum:c.consult_date,tekst:c.notes})),
        niet_gelukt:mislukt});
    }),

    metingen:veilig(async(atleetId,metingNaam)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      let q=db.from("metrics").select("metric,value,value_text,unit,measured_at,note").eq("athlete_id",a.p.id).order("measured_at",{ascending:false}).limit(1000);
      if(!leeg(metingNaam))q=q.eq("metric",String(metingNaam));
      const{data,error}=await q;if(error)return fout(error.message);
      const rij=m=>schoon({naam:m.metric,waarde:leeg(m.value)?m.value_text:m.value,eenheid:m.unit,datum:m.measured_at,notitie:m.note});
      if(!leeg(metingNaam))return {ok:true,atleet:{id:a.p.id,naam:naam(a.p)},meting:String(metingNaam),aantal:(data||[]).length,geschiedenis:(data||[]).map(rij)};
      const laatste={},aantal={};
      (data||[]).forEach(m=>{aantal[m.metric]=(aantal[m.metric]||0)+1;if(!laatste[m.metric])laatste[m.metric]=m;});
      return {ok:true,atleet:{id:a.p.id,naam:naam(a.p)},
        let_op:"Laatste waarde per meting. Een rep-max is geen 1RM: reken niets om.",
        metingen:Object.values(laatste).sort((x,y)=>x.metric.localeCompare(y.metric)).map(m=>Object.assign(rij(m),{aantal_metingen:aantal[m.metric]}))};
    }),

    bibliotheek:veilig(async(zoek,soort)=>{
      if(!leeg(soort)&&!["warmup","cooldown","other"].includes(soort))return fout("soort moet warmup, cooldown of other zijn (of leeg).");
      let q=db.from("templates").select("id,naam,type,kleur,tags,instructies").order("naam").limit(40);
      if(!leeg(soort))q=q.eq("type",soort);
      const z=String(zoek||"").trim();
      if(z)q=q.ilike("naam","%"+z.replace(/[%_]/g,"")+"%");
      const{data,error}=await q;if(error)return fout(error.message);
      return {ok:true,aantal:(data||[]).length,let_op:(data||[]).length===40?"Er zijn meer dan 40 resultaten. Zoek preciezer.":undefined,
        templates:(data||[]).map(t=>schoon({id:t.id,naam:t.naam,soort:t.type,kleur:t.kleur,tags:t.tags,tekst:t.instructies}))};
    }),

    // Oefeningen met een demo-video zoeken (zelfde zoeker als in de app).
    videoZoek:veilig(async(zoek)=>{
      const z=String(zoek||"").trim();
      if(z.length<2)return fout("Geef een zoekwoord van minstens twee letters.");
      if(!(await videosKlaar()))return fout("De oefeningenbibliotheek is nog niet geladen. Probeer het over een paar seconden opnieuw.");
      const hits=oefZoek(z).filter(o=>o.youtube_id).slice(0,15);
      return {ok:true,aantal:hits.length,oefeningen:hits.map(o=>schoon({id:o.id,naam:o.naam,eigen_video:o.bron==="eigen"?true:null}))};
    }),

    // ---------- Schrijven: altijd als concept ----------
    schrijfConcept:veilig(async(atleetId,workouts,opties)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      opties=isObject(opties)?opties:{};
      if(isObject(workouts))workouts=[workouts];
      if(!Array.isArray(workouts)||!workouts.length)return fout("Geef een lijst workouts. Zie het voorbeeld in ClaudeApi.hulp().");
      if(workouts.length>MAX_WORKOUTS)return fout("Maximaal "+MAX_WORKOUTS+" workouts per keer. Schrijf per week.");
      const fouten=[];
      const gelezen=workouts.map((w,i)=>workoutLees(w,"workout "+(i+1)+(isObject(w)&&isDatum(w.datum)?" ("+w.datum+")":""),fouten,opties)).filter(Boolean);
      if(!leeg(opties.videos)&&opties.videos!=="geen"&&opties.videos!=="auto")fouten.push("opties.videos moet \"auto\" of \"geen\" zijn.");
      if(fouten.length)return {ok:false,fout:"Er is niets geschreven. Los dit eerst op.",fouten};
      const indexOk=await videosKlaar();
      const meldingen=[];
      // Wat staat er al op die dagen?
      const datums=[...new Set(gelezen.map(w=>w.datum))];
      const bestaand=await haalIn("workouts","id,workout_date,title,status","workout_date",datums,q=>q.eq("client_id",a.p.id));
      const dubbel=gelezen.filter(w=>bestaand.some(b=>b.workout_date===w.datum&&b.status==="draft"&&(b.title||"")===(w.title||"")));
      if(dubbel.length&&opties.toch!==true)return {ok:false,fout:"Er is niets geschreven. Er staat al een concept met dezelfde titel op: "+dubbel.map(w=>w.datum+" (\""+w.title+"\")").join(", ")+". Kijk met ClaudeApi.week of dit al gelukt was. Wil je er bewust een naast, geef dan {toch:true} mee."};
      datums.forEach(d=>{const er=bestaand.filter(b=>b.workout_date===d&&b.status!=="draft");if(er.length)meldingen.push("Op "+d+" staat al een zichtbare workout ("+er.map(b=>"\""+(b.title||"zonder titel")+"\"").join(", ")+"). Het concept komt ernaast.");});
      const standaard=opties.videos==="geen"?"geen":undefined;
      const rijen=gelezen.map((w,i)=>{
        const waar="workout "+(i+1)+" ("+w.datum+")";
        const wk=w.videos===undefined?standaard:w.videos;
        letters(w.blokken);
        w.blokken.forEach((n,j)=>{n.media=mediaKies(n.videos===undefined?standaard:n.videos,blokTekst(n),undefined,true,waar+", blok "+(j+1),fouten,indexOk);});
        return {workout:{workout_date:w.datum,title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
            warmup_media:w.warmup?mediaKies(wk,w.warmup,undefined,true,waar,fouten,indexOk):null,
            cooldown_media:w.cooldown?mediaKies(wk,w.cooldown,undefined,true,waar,fouten,indexOk):null},
          blokken:w.blokken.map(n=>blokRij(n,null))};
      });
      if(fouten.length)return {ok:false,fout:"Er is niets geschreven. Los dit eerst op.",fouten};
      if(!indexOk&&standaard!=="geen")meldingen.push("De oefeningenbibliotheek was niet geladen: er zijn geen demo-video's gekozen. Zet ze later met wijzigBlok(blokId,{videos:\"auto\"}).");
      const ids=await conceptenNeerzetten(a.p,rijen);
      const terug=await leesTerug(ids);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},geschreven:ids.length,status:"concept",uitleg:GOEDKEUREN,let_op:meldingen,workouts:terug});
    }),

    kopieerWeek:veilig(async(atleetId,vanDatum,naarDatum,opties)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      opties=isObject(opties)?opties:{};
      if(!isDatum(vanDatum)||!isDatum(naarDatum))return fout("vanDatum en naarDatum moeten JJJJ-MM-DD zijn: een dag in de bronweek en een dag in de doelweek.");
      const van=maandagVan(vanDatum),naar=maandagVan(naarDatum),dagen=dagenTussenIso(van,naar);
      if(!dagen)return fout("vanDatum en naarDatum liggen in dezelfde week.");
      const fouten=[];datumMag(plus(naar,6),opties,"doelweek",fouten);
      if(fouten.length)return fout(fouten.join(" "));
      const{data:bron,error}=await db.from("workouts").select("*, blocks(*)").eq("client_id",a.p.id).gte("workout_date",van).lte("workout_date",plus(van,6))
        .order("workout_date").order("day_sort",{nullsFirst:false}).order("created_at");
      if(error)return fout(error.message);
      if(!(bron||[]).length)return fout("In de week van "+van+" staan geen 1-op-1 workouts om te kopiëren.");
      const{data:doel,error:de}=await db.from("workouts").select("id,workout_date,title,status").eq("client_id",a.p.id).gte("workout_date",naar).lte("workout_date",plus(naar,6));
      if(de)return fout(de.message);
      const concepten=(doel||[]).filter(w=>w.status==="draft"),zichtbaar=(doel||[]).filter(w=>w.status!=="draft");
      if(concepten.length&&opties.toch!==true)return fout("Er is niets gekopieerd. In de week van "+naar+" staan al "+concepten.length+" concepten. Kijk met ClaudeApi.week of het kopiëren al gelukt was. Wil je er bewust een kopie naast, geef dan {toch:true} mee.");
      const meldingen=[],overgeslagen=[],rijen=[];
      if(zichtbaar.length)meldingen.push("In de week van "+naar+" staan al "+zichtbaar.length+" zichtbare workouts. De kopie komt ernaast.");
      bron.forEach(w=>{
        if(w.source_blog_workout_id){overgeslagen.push(w.workout_date+": \""+(w.title||"")+"\" (weekworkout)");return;}
        const alle=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort),eigen=alle.filter(b=>!b.source_blog_workout_id);
        if(alle.length!==eigen.length){
          alle.filter(b=>b.source_blog_workout_id).forEach(b=>overgeslagen.push(w.workout_date+": blok \""+(b.exercise||"")+"\" (weekworkout)"));
          if(!eigen.length&&!w.warmup&&!w.cooldown)return;
        }
        const blokken=eigen.map(b=>({kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,
          score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,
          media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null}));
        if(alle.length!==eigen.length)letters(blokken); // er viel een blok tussenuit: letters en volgorde opnieuw
        rijen.push({workout:{workout_date:plus(w.workout_date,dagen),title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
            warmup_oefening_id:w.warmup_oefening_id||null,cooldown_oefening_id:w.cooldown_oefening_id||null,
            warmup_media:w.warmup_media||null,cooldown_media:w.cooldown_media||null,day_sort:leeg(w.day_sort)?null:w.day_sort},blokken});
      });
      if(!rijen.length)return fout("Er is niets gekopieerd: de week van "+van+" bevat alleen onderdelen uit de weekworkout.");
      const ids=await conceptenNeerzetten(a.p,rijen);
      const terug=await leesTerug(ids);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},van_week:van,naar_week:naar,gekopieerd:ids.length,status:"concept",uitleg:GOEDKEUREN,
        overgeslagen,let_op:meldingen,workouts:terug});
    }),

    wijzigBlok:veilig(async(blokId,velden)=>{
      if(!isUuid(blokId))return fout("Geef het id van het blok (uit ClaudeApi.week of het antwoord van een schrijf-commando).");
      if(!isObject(velden)||!Object.keys(velden).length)return fout("Geef de velden die veranderen, bijvoorbeeld {voorschrift:\"...\"}.");
      const mag=BLOK_SCHRIJF.filter(k=>k!=="soort");
      const onbekend=Object.keys(velden).filter(k=>!mag.includes(k));
      if(onbekend.length)return fout("Onbekend of niet te wijzigen veld: "+onbekend.join(", ")+". Toegestaan: "+mag.join(", ")+". Van soort wisselen kan niet: zet met vervangBlokken een nieuw blok neer.");
      const{data:b0,error}=await db.from("blocks").select("id,workout_id").eq("id",blokId).maybeSingle();
      if(error)return fout(error.message);
      if(!b0)return fout("Geen blok gevonden met dit id, of je mag het niet zien.");
      const c=await conceptOphalen(b0.workout_id);if(c.fout)return fout(c.fout);
      const oud=c.w.blocks.find(b=>b.id===blokId);
      const huidig=blokUit(oud);
      const samen={};BLOK_SCHRIJF.forEach(k=>{if(!leeg(huidig[k]))samen[k]=huidig[k];});
      Object.keys(velden).forEach(k=>{if(k!=="videos")samen[k]=velden[k];});
      if(velden.videos!==undefined)samen.videos=velden.videos;
      const fouten=[];
      const n=blokLees(samen,"blok "+(oud.label||""),fouten);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      n.id=blokId;
      const gewijzigd=blokTekst(n)!==blokTekst(normUitRij(oud));
      const indexOk=(Array.isArray(n.videos)||n.videos==="auto"||(n.videos===undefined&&gewijzigd))?await videosKlaar():false;
      n.media=mediaKies(n.videos,blokTekst(n),oud.media||null,gewijzigd,"blok "+(oud.label||""),fouten,indexOk);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const normen=letters(c.w.blocks.map(b=>b.id===blokId?n:normUitRij(b)));
      await blokkenSync(c.w,normen);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      const meldingen=[];
      if(!indexOk&&(n.videos==="auto"||(n.videos===undefined&&gewijzigd)))meldingen.push("De oefeningenbibliotheek was niet geladen: de demo-video's zijn niet opnieuw gekozen.");
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:"blok "+(n.label||"")+" van \""+(c.w.title||"")+"\" op "+c.w.workout_date,status:"concept",let_op:meldingen,workout:terug[0]});
    }),

    vervangBlokken:veilig(async(workoutId,blokken)=>{
      const c=await conceptOphalen(workoutId);if(c.fout)return fout(c.fout);
      if(!Array.isArray(blokken))return fout("Geef de volledige lijst blokken zoals hij moet worden. Een blok met id wordt bijgewerkt, zonder id is nieuw, wat ontbreekt gaat weg.");
      const fouten=[];
      const normen=blokkenLees(blokken,"\""+(c.w.title||"workout")+"\"",fouten);
      const oud={};c.w.blocks.forEach(b=>{oud[b.id]=b;});
      const gezien=new Set();
      normen.forEach((n,i)=>{
        if(!n.id)return;
        const waar="blok "+(i+1);
        if(!oud[n.id]){fouten.push(waar+": id "+n.id+" hoort niet bij deze workout. Laat het id weg voor een nieuw blok.");return;}
        if(gezien.has(n.id))fouten.push(waar+": hetzelfde id staat twee keer in de lijst.");
        gezien.add(n.id);
        if(oud[n.id].kind!==n.kind)fouten.push(waar+": van soort wisselen kan niet met hetzelfde id. Laat het id weg, dan wordt het een nieuw blok.");
      });
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const gaatWeg=c.w.blocks.filter(b=>!gezien.has(b.id));
      if(gaatWeg.length&&await heeftLogs(c.w.id))return fout("Er is niets gewijzigd. Op deze workout zijn al resultaten gelogd; een blok weghalen zou die wissen. Laat dit aan de coach.");
      const indexOk=await videosKlaar();
      letters(normen);
      normen.forEach((n,i)=>{
        const o=n.id?oud[n.id]:null;
        const gewijzigd=!o||blokTekst(n)!==blokTekst(normUitRij(o));
        n.media=mediaKies(n.videos,blokTekst(n),o?(o.media||null):undefined,gewijzigd,"blok "+(i+1),fouten,indexOk);
      });
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const uit=await blokkenSync(c.w,normen);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:"blokken van \""+(c.w.title||"")+"\" op "+c.w.workout_date,
        nieuw:uit.nieuw||null,verwijderd:uit.verwijderd||null,status:"concept",
        let_op:indexOk?null:["De oefeningenbibliotheek was niet geladen: er zijn geen demo-video's gekozen voor nieuwe of gewijzigde blokken."],workout:terug[0]});
    }),

    wijzigConcept:veilig(async(workoutId,velden,opties)=>{
      const c=await conceptOphalen(workoutId);if(c.fout)return fout(c.fout);
      opties=isObject(opties)?opties:{};
      if(!isObject(velden)||!Object.keys(velden).length)return fout("Geef de velden die veranderen: datum, titel, notitie_coach, warming_up, cooldown.");
      const mag=["datum","titel","notitie_coach","warming_up","cooldown","videos"];
      const onbekend=Object.keys(velden).filter(k=>!mag.includes(k));
      if(onbekend.length)return fout("Onbekend veld: "+onbekend.join(", ")+". Toegestaan: "+mag.join(", ")+". Blokken wijzig je met wijzigBlok of vervangBlokken.");
      const fouten=[],waar="\""+(c.w.title||"workout")+"\"",upd={};
      if("datum" in velden){
        if(!isDatum(velden.datum))fouten.push(waar+": datum moet JJJJ-MM-DD zijn.");
        else{datumMag(velden.datum,opties,waar,fouten);upd.workout_date=velden.datum;}
      }
      if("titel" in velden){const t=tekstVeld(velden,"titel",200,waar,fouten);if(!t)fouten.push(waar+": titel mag niet leeg zijn.");else upd.title=t;}
      if("notitie_coach" in velden)upd.coach_notes=tekstVeld(velden,"notitie_coach",MAX_TEKST,waar,fouten);
      if("warming_up" in velden)upd.warmup=tekstVeld(velden,"warming_up",MAX_TEKST,waar,fouten);
      if("cooldown" in velden)upd.cooldown=tekstVeld(velden,"cooldown",MAX_TEKST,waar,fouten);
      const vk=videosLees(velden.videos,waar,fouten,false);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const wuAnders="warmup" in upd&&(upd.warmup||"")!==(c.w.warmup||""),cdAnders="cooldown" in upd&&(upd.cooldown||"")!==(c.w.cooldown||"");
      if(wuAnders||cdAnders||vk!==undefined){
        const indexOk=(vk==="geen"||vk==="houden")?false:await videosKlaar();
        const wu="warmup" in upd?upd.warmup:c.w.warmup,cd="cooldown" in upd?upd.cooldown:c.w.cooldown;
        if(wuAnders||vk!==undefined)upd.warmup_media=wu?mediaKies(vk,wu,c.w.warmup_media||null,wuAnders,waar,fouten,indexOk):null;
        if(cdAnders||vk!==undefined)upd.cooldown_media=cd?mediaKies(vk,cd,c.w.cooldown_media||null,cdAnders,waar,fouten,indexOk):null;
      }
      // Alleen bijwerken zolang het nog concept is (de coach kan intussen hebben goedgekeurd).
      const{data,error}=await db.from("workouts").update(upd).eq("id",c.w.id).eq("status","draft").select("id");
      if(error)return fout(error.message);
      if(!(data||[]).length)return fout("Er is niets gewijzigd: deze workout is intussen geen concept meer.");
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:Object.keys(velden).join(", "),status:"concept",workout:terug[0]});
    }),

    verwijderConcept:veilig(async(workoutId)=>{
      const c=await conceptOphalen(workoutId);if(c.fout)return fout(c.fout);
      if(await heeftLogs(c.w.id))return fout("Er is niets verwijderd. Op deze workout zijn al resultaten gelogd. Laat dit aan de coach.");
      const{data,error}=await db.from("workouts").delete().eq("id",c.w.id).eq("status","draft").select("id");
      if(error)return fout(error.message);
      if(!(data||[]).length)return fout("Er is niets verwijderd: deze workout is intussen geen concept meer.");
      ververs(c.p.id);
      return {ok:true,atleet:{id:c.p.id,naam:naam(c.p)},verwijderd:{datum:c.w.workout_date,dag:dagVan(c.w.workout_date),titel:c.w.title||"",blokken:c.w.blocks.length}};
    })
  };
})();
