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
//   - een workout die al zichtbaar is wordt alleen gewijzigd als de aanroeper {zichtbaar:true}
//     meegeeft (de coach vroeg er uitdrukkelijk om; besluit Stefan, 19 nov 2026). Weghalen van
//     een zichtbare workout kan nooit, en een blok waarop al gelogd is blijft staan;
//   - blog- en groepsprogramma's blijven dicht; de YP Showdown kan alleen als
//     ongewijzigde kopie van de weekworkout zelf worden geplaatst (plaatsShowdown),
//     de tekst ervan is nooit te wijzigen;
//   - er is geen commando om goed te keuren, te publiceren of iets te versturen.
// Dit verkleint de kans op fouten; het is geen slot. De echte grens blijft RLS.
//
// Elk commando geeft {ok:true, ...} of {ok:false, fout:"..."} terug en gooit geen
// fouten, zodat Claude altijd een leesbaar antwoord krijgt. Begin met ClaudeApi.hulp().
const ClaudeApi=(()=>{
  const VERSIE="2.11 (lezen en concepten schrijven)";
  const DAGKORT=["zo","ma","di","wo","do","vr","za"];
  const STAF=["coach","eigenaar","platform_admin"];
  const MAX_WORKOUTS=14,MAX_BLOKKEN=30,MAX_TEKST=6000,MAX_VIDEOS=12,MAX_DAGEN_VOORUIT=120;
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
  // Eén id per video, in dezelfde volgorde als de titels: het oefening-id uit de bibliotheek,
  // of "yt:<youtube-id>" voor een video die niet aan een bibliotheek-oefening hangt.
  const videoIds=media=>(Array.isArray(media)?media:[]).filter(m=>m&&m.titel).map(m=>m.oefening_id?m.oefening_id:"yt:"+(m.youtube_id||""));
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
    const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived,company_id,role,gender,birth_date,height_cm,weight_kg,profile_note,effort_rating").eq("id",id).maybeSingle();
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
  // Leaderboard-workouts (workouts.audience 'bord', sinds 19 nov 2026): een 1-op-1 workout met een
  // gedeeld leaderboard. Een blok wijst ernaar via source_blog_workout_id, net als bij een
  // ingevoegde Showdown; aan deze lijst zien we welke van de twee het is. Vers bij elk commando.
  let BORD_IDS=new Set();
  const isBord=id=>!!id&&BORD_IDS.has(id);
  async function bordVers(){
    try{
      const{data,error}=await db.from("workouts").select("id").eq("company_id",ME.profile.company_id).eq("audience","bord").limit(1000);
      if(!error&&data)BORD_IDS=new Set(data.map(w=>w.id));
    }catch(e){}
  }
  const veilig=fn=>async(...a)=>{const nk=nietKlaar();if(nk)return fout(nk);try{await bordVers();return await fn(...a);}catch(e){return fout(String(e&&e.message||e));}};

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
    // Tekstblok: uitleg of warming-up als eigen blok. Geen letter, geen score, niets te loggen.
    if(b.kind==="info")return schoon({id:b.id,soort:"tekst",naam:b.exercise,omschrijving:b.prescription||b.notes,kleur:b.color,
      demo_videos:titels(b.media),demo_video_ids:videoIds(b.media)});
    return schoon({id:b.id,letter:b.label,soort:cond?"conditioning":"oefening",naam:b.exercise,
      voorschrift:cond?null:b.prescription,omschrijving:cond?b.notes:null,coachingtips:cond?null:b.notes,
      scoretype:b.score_type,kleur:b.color,tijdslimiet_sec:b.timecap_seconds,
      superset_met_vorige:b.linked?true:null,kaarttitel:b.group_title,schema:b.lift_scheme,
      uit_weekworkout:b.source_blog_workout_id&&!isBord(b.source_blog_workout_id)?true:null,
      leaderboard_workout:isBord(b.source_blog_workout_id)?b.source_blog_workout_id:null,scaled_versie:b.scaled_versie?true:null,
      demo_videos:titels(b.media),demo_video_ids:videoIds(b.media)});
  }
  function workoutUit(w,perBlok,extra){
    const blokken=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort).map(b=>perBlok?Object.assign(blokUit(b),schoon(perBlok(b))):blokUit(b));
    return schoon(Object.assign({id:w.id,datum:w.workout_date,dag:dagVan(w.workout_date),titel:w.title,
      status:w.status==="draft"?"concept":"gepubliceerd",
      rustdag:(!blokken.length&&isRust(w.title))?true:null,
      notitie_coach:w.coach_notes,warming_up:w.warmup,cooldown:w.cooldown,
      demo_videos_warming_up:titels(w.warmup_media),demo_videos_cooldown:titels(w.cooldown_media),
      demo_video_ids_warming_up:videoIds(w.warmup_media),demo_video_ids_cooldown:videoIds(w.cooldown_media),
      uit_weekworkout:w.source_blog_workout_id&&!isBord(w.source_blog_workout_id)?true:null,
      leaderboard_workout:isBord(w.source_blog_workout_id)?w.source_blog_workout_id:null},extra||{},{blokken}));
  }
  const BLOK_SCHRIJF=["soort","naam","voorschrift","omschrijving","coachingtips","scoretype","kleur","tijdslimiet_sec","superset_met_vorige","kaarttitel","videos"];
  const BLOK_NEGEER=["id","letter","schema","resultaat","videos_van_atleet","demo_videos","demo_video_ids","videos_uitgezet","uit_weekworkout","leaderboard_workout","scaled_versie"];
  const W_SCHRIJF=["datum","titel","rustdag","notitie_coach","warming_up","cooldown","videos","videos_warming_up","videos_cooldown","blokken"];
  const W_NEGEER=["id","dag","status","rpe","minuten","rpe_ingevuld_op","reacties","wacht_op_reactie","uit_weekworkout","leaderboard_workout","demo_videos_warming_up","demo_videos_cooldown","demo_video_ids_warming_up","demo_video_ids_cooldown"];

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
    if(v==="auto"||v==="geen"||v==="houden"||v==="aanvullen")return v;
    if(magLijst&&Array.isArray(v)){
      if(v.length>MAX_VIDEOS){fouten.push(waar+": maximaal "+MAX_VIDEOS+" video's per lijst.");return undefined;}
      // Een getal is een oefening-id; "yt:..." is een video zoals week() hem in demo_video_ids geeft.
      const ids=v.map(x=>(typeof x==="string"&&/^yt:[\w-]{5,20}$/.test(x))?x:Number(x));
      if(ids.some(n=>typeof n!=="string"&&(!Number.isInteger(n)||n<1))){fouten.push(waar+": videos moet een lijst id's zijn: getallen uit ClaudeApi.videoZoek, of de waarden uit demo_video_ids van week().");return undefined;}
      return ids;
    }
    fouten.push(waar+": videos moet \"auto\", \"aanvullen\", \"houden\" of \"geen\" zijn"+(magLijst?", of een lijst oefening-id's uit ClaudeApi.videoZoek.":"."));
    return undefined;
  }
  function blokLees(b,waar,fouten){
    if(!isObject(b)){fouten.push(waar+": een blok moet een object zijn.");return null;}
    const onbekend=Object.keys(b).filter(k=>!BLOK_SCHRIJF.includes(k)&&!BLOK_NEGEER.includes(k));
    if(onbekend.length)fouten.push(waar+": onbekend veld "+onbekend.join(", ")+". Toegestaan: "+BLOK_SCHRIJF.join(", ")+".");
    // Een Showdown-blok lezen we niet als invoer: de aanroeper beslist wat ermee gebeurt.
    if(b.uit_weekworkout||b.leaderboard_workout)return {id:leeg(b.id)?null:b.id,showdown:true};
    const soort=leeg(b.soort)?"oefening":b.soort;
    if(soort!=="oefening"&&soort!=="conditioning"&&soort!=="tekst")fouten.push(waar+": soort moet oefening, conditioning of tekst zijn.");
    const cond=soort==="conditioning";
    const exercise=tekstVeld(b,"naam",200,waar,fouten);
    if(!exercise)fouten.push(waar+": naam ontbreekt.");
    if(soort==="tekst"){
      // Een tekstblok heeft alleen een titel, tekst, kleur en video's.
      const teveel=["voorschrift","coachingtips","tijdslimiet_sec","kaarttitel"].filter(k=>!leeg(b[k]));
      if(teveel.length)fouten.push(waar+": een tekstblok heeft alleen naam, omschrijving, kleur en videos (niet "+teveel.join(", ")+"). Zet de tekst in omschrijving.");
      if(!leeg(b.scoretype)&&b.scoretype!=="none")fouten.push(waar+": een tekstblok heeft geen score. Laat scoretype weg.");
      if(b.superset_met_vorige===true)fouten.push(waar+": een tekstblok kan niet in een superset.");
      const kleurT=leeg(b.kleur)?null:b.kleur;
      if(kleurT&&!kleurenLijst().includes(kleurT))fouten.push(waar+": onbekende kleur \""+kleurT+"\". Kies uit: "+kleurenLijst().join(", ")+".");
      return {id:leeg(b.id)?null:b.id,raak:true,kind:"info",exercise,prescription:tekstVeld(b,"omschrijving",MAX_TEKST,waar,fouten),notes:null,
        score_type:"none",timecap_seconds:null,color:kleurT,linked:false,group_title:null,videos:videosLees(b.videos,waar,fouten,true)};
    }
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
    if(w.uit_weekworkout||w.leaderboard_workout)fouten.push(waar+": deze workout komt uit de weekworkout (YP Showdown). Die schrijf of kopieer je niet.");
    if(!isDatum(w.datum))fouten.push(waar+": datum moet JJJJ-MM-DD zijn, bijvoorbeeld 2026-11-23.");
    else datumMag(w.datum,opties,waar,fouten);
    const rust=w.rustdag===true;
    const blokken=blokkenLees(w.blokken,waar,fouten);
    if(blokken.some(b=>b.showdown))fouten.push(waar+": een blok uit de YP Showdown schrijf je niet zelf. Laat het weg en gebruik daarna ClaudeApi.plaatsShowdown.");
    let title=tekstVeld(w,"titel",200,waar,fouten);
    if(rust){
      if(blokken.length)fouten.push(waar+": een rustdag heeft geen blokken.");
      title="Rest Day";
    }else if(!title)fouten.push(waar+": titel ontbreekt.");
    const warmup=tekstVeld(w,"warming_up",MAX_TEKST,waar,fouten),cooldown=tekstVeld(w,"cooldown",MAX_TEKST,waar,fouten);
    // Eigen lijst per vak: videos_warming_up en videos_cooldown gaan voor op videos.
    const videosWu=videosLees(w.videos_warming_up,waar+", videos_warming_up",fouten,true),videosCd=videosLees(w.videos_cooldown,waar+", videos_cooldown",fouten,true);
    if(Array.isArray(videosWu)&&videosWu.length&&!warmup)fouten.push(waar+": videos_warming_up kan alleen als er ook een warming_up-tekst is.");
    if(Array.isArray(videosCd)&&videosCd.length&&!cooldown)fouten.push(waar+": videos_cooldown kan alleen als er ook een cooldown-tekst is.");
    return {datum:w.datum,rust,title,coach_notes:tekstVeld(w,"notitie_coach",MAX_TEKST,waar,fouten),warmup,cooldown,
      videos:videosLees(w.videos,waar,fouten,false),videosWu,videosCd,blokken};
  }

  // ---------- Letters (A, B1, B2, C) en volgorde, zoals de bouwer ze zet ----------
  function letters(blokken){
    // Een tekstblok heeft geen letter en hoort nooit bij een superset; het blok erna niet bij het tekstblok.
    blokken.forEach((b,i)=>{if(i===0||b.kind==="info"||blokken[i-1].kind==="info")b.linked=false;});
    const groepen=[];
    blokken.forEach((b,i)=>{
      if(b.kind==="info"){b.label=null;return;}
      if(i>0&&b.linked)groepen[groepen.length-1].push(b);else groepen.push([b]);
    });
    groepen.forEach((g,gi)=>{const L=String.fromCharCode(65+Math.min(gi,25));g.forEach((b,pos)=>{b.label=g.length>1?L+(pos+1):L;});});
    blokken.forEach((b,i)=>{b.sort=i+1;});
    return blokken;
  }

  // ---------- Demo-video's: dezelfde herkenning als "Voorstellen overnemen" ----------
  async function videosKlaar(){
    try{if(typeof vsKlaar==="function")await vsKlaar();}catch(e){}
    try{return !!(GM&&GM.index&&GM.index.length);}catch(e){return false;}
  }
  // Per regel herkennen, en binnen een regel wint de meest specifieke naam: bij
  // "Barbell Strict Press" niet ook nog de video van "Strict Press" erbij. Daarna
  // elke oefening en elke video hooguit één keer.
  // bron = losse tekst (warming-up, cooldown) of een blok {naam, tekst}.
  // Bij een blok gaat de naam voor: zijn video's staan vooraan, en wat de naam al preciezer
  // zegt komt niet nog eens uit de tekst (naam "Kipping Handstand Push-Up", tekst
  // "3 Handstand Push-Ups": geen losse Push-Up-video erbij). De rest van de tekst telt wel
  // mee, want een warming-up of een complex staat vaak als gewoon blok in het programma.
  function mediaAuto(bron){
    try{
      const uit=[];
      const in_=(a,b)=>b.term.length>a.term.length&&(" "+b.term+" ").includes(" "+a.term+" ");
      // Staat a ook nog los in de regel, buiten de preciezere namen? "power clean + hang power
      // clean" zijn twee bewegingen; in "dumbbell seal row" staat "seal row" niet los.
      // Elk woord krijgt zijn eigen spaties, zodat twee namen achter elkaar allebei gevonden worden.
      const wijd=t=>" "+String(t).split(" ").join("  ")+" ";
      const los=(a,preciezer,norm)=>{let r=wijd(norm);preciezer.slice().sort((x,y)=>y.term.length-x.term.length).forEach(b=>{r=r.split(wijd(b.term)).join(" | ");});return r.includes(wijd(a.term));};
      const valtWeg=(a,hits,norm)=>{const p=hits.filter(b=>b!==a&&in_(a,b));return p.length>0&&!los(a,p,norm);};
      const lees=(tekst,naam)=>{
        const alle=[];
        String(tekst||"").split(/\n/).map(r=>r.trim()).filter(Boolean).forEach(regel=>{
          const hits=gmHerkenRegel(regel,new Set()).filter(h=>h.o&&h.o.youtube_id),norm=gmNorm(regel);
          hits.forEach(h=>alle.push(h));
          hits.filter(a=>!valtWeg(a,hits,norm)&&!(naam&&valtWeg(a,naam.hits,naam.norm))).forEach(h=>{
            if(uit.some(m=>m.oefening_id===h.o.id||m.youtube_id===h.o.youtube_id))return;
            uit.push({youtube_id:h.o.youtube_id,titel:h.o.naam,oefening_id:h.o.id,term:h.term});
          });
        });
        return alle;
      };
      if(bron&&typeof bron==="object")lees(bron.tekst,{hits:lees(bron.naam),norm:gmNorm(bron.naam||"")});
      else lees(bron);
      return uit.slice(0,MAX_VIDEOS);
    }catch(e){return [];}
  }
  // Oefeningen die wel in de tekst staan, maar waarvan de video door coaches is uitgezet
  // (twee keer weggehaald of afgewezen). Die kiezen we niet vanzelf; we melden ze wel,
  // tenzij er voor dezelfde term al een andere video bij staat.
  function mediaUitgezet(tekst,media){
    try{
      const weg=(GM.aliassen||[]).filter(a=>a.score<=-2);
      if(!weg.length||!GM.index)return [];
      const gekozen=(Array.isArray(media)?media:[]);
      const uit=[];
      String(tekst||"").split(/\n/).forEach(regel=>{
        const n=" "+gmNorm(regel)+" ";
        weg.forEach(a=>{
          if(!n.includes(" "+a.term+" "))return;
          if(gekozen.some(m=>m&&(m.oefening_id===a.oefening_id||(m.term&&(" "+m.term+" ").includes(" "+a.term+" ")))))return;
          const e=GM.index.find(x=>x.o.id===a.oefening_id);
          if(e&&!uit.includes(e.o.naam))uit.push(e.o.naam);
        });
      });
      return uit;
    }catch(e){return [];}
  }
  const heeftIndex=()=>{try{return !!(GM&&GM.index&&GM.index.length);}catch(e){return false;}};
  // Een video die al bij het blok staat blijft precies zoals hij is (ook als er in de
  // bibliotheek intussen iets veranderd is); een nieuwe komt uit de bibliotheek.
  function mediaLijst(ids,waar,fouten,oud){
    const uit=[];let bieb=[];try{bieb=LIB.oef||[];}catch(e){}
    const had=(Array.isArray(oud)?oud:[]).filter(m=>m&&m.youtube_id);
    const erbij=m=>{if(!uit.some(x=>x.youtube_id===m.youtube_id))uit.push(m);};
    ids.forEach(id=>{
      if(typeof id==="string"){
        const yt=id.slice(3);
        const al=had.find(m=>m.youtube_id===yt);
        if(al){erbij(al);return;}
        const o=bieb.find(x=>x.youtube_id===yt);
        if(o)erbij({youtube_id:o.youtube_id,titel:o.naam,oefening_id:o.id});
        else fouten.push(waar+": video "+id+" staat niet bij dit blok en niet in de bibliotheek.");
        return;
      }
      const al=had.find(m=>Number(m.oefening_id)===id);
      if(al){erbij(al);return;}
      const o=bieb.find(x=>Number(x.id)===id);
      if(!o)fouten.push(waar+": geen oefening met id "+id+" in de bibliotheek.");
      else if(!o.youtube_id)fouten.push(waar+": oefening "+id+" ("+o.naam+") heeft geen video.");
      else erbij({youtube_id:o.youtube_id,titel:o.naam,oefening_id:o.id});
    });
    return uit;
  }
  // keuze: undefined | "auto" | "geen" | "houden" | [oefening-id's]. oud = wat er nu staat
  // (undefined bij een nieuw onderdeel). Zonder keuze: nieuw of gewijzigde tekst = automatisch,
  // ongewijzigde tekst = laten staan.
  function mediaKies(keuze,tekst,oud,gewijzigd,waar,fouten,indexOk){
    if(Array.isArray(keuze)){const m=mediaLijst(keuze,waar,fouten,oud);return m.length?m:null;}
    if(keuze==="geen")return null;
    if(keuze==="aanvullen"){
      // Wat er staat blijft staan; herkende oefeningen die nog geen video hebben komen erbij.
      const basis=(Array.isArray(oud)?oud:[]).filter(m=>m&&m.youtube_id);
      if(indexOk)mediaAuto(tekst||"").forEach(m=>{
        if(basis.length<MAX_VIDEOS&&!basis.some(x=>x.youtube_id===m.youtube_id||(x.oefening_id&&x.oefening_id===m.oefening_id)))basis.push(m);
      });
      return basis.length?basis:null;
    }
    if(keuze==="houden"||(keuze===undefined&&oud!==undefined&&!gewijzigd))return oud||null;
    if(!indexOk)return oud||null;
    const m=mediaAuto(tekst||"");return m.length?m:null;
  }
  const blokTekst=n=>[n.exercise,n.kind==="conditioning"?n.notes:n.prescription].filter(Boolean).join("\n");
  // Voor het kiezen van demo-video's: naam en tekst apart, zodat de naam voor kan gaan.
  const blokBron=n=>({naam:n.exercise,tekst:n.kind==="conditioning"?n.notes:n.prescription});

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
      // Voorschrift niet veranderd: het schema blijft precies zoals het was (ook als dat leeg is).
      if(oud&&oud.kind===n.kind&&(oud.prescription||null)===(n.prescription||null))schema=os||null;
      else if(os&&os.hand)schema=os;
      else{
        try{schema=typeof schemaLees==="function"?schemaLees(n.prescription||""):null;}catch(e){schema=null;}
        if(os&&os.geen_lift)schema=Object.assign(schema||{},{geen_lift:true});
      }
    }
    // Een tekstblok krijgt nooit een lift: geen_lift houdt de koppeling op naam in de database tegen.
    if(n.kind==="info")schema={geen_lift:true};
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
  async function conceptOphalen(wid,magZichtbaar){
    if(!isUuid(wid))return {fout:"Geef het id van de workout (uit ClaudeApi.week of het antwoord van een schrijf-commando)."};
    const{data:w,error}=await db.from("workouts").select("*, blocks(*)").eq("id",wid).maybeSingle();
    if(error)return {fout:error.message};
    if(!w)return {fout:"Geen workout gevonden met dit id, of je mag hem niet zien."};
    if(w.audience!=="client"||!w.client_id)return {fout:"Dit is geen 1-op-1 workout. Weekworkouts, blog- en groepsprogramma's verander je hier nooit."};
    if(w.status!=="draft"&&!magZichtbaar)return {fout:"Deze workout is al zichtbaar voor de atleet. Vraagt de coach er uitdrukkelijk om, geef dan {zichtbaar:true} mee als laatste argument; de atleet ziet de wijziging dan meteen. Een zichtbare workout weghalen kan niet."};
    if(w.source_blog_workout_id)return {fout:"Deze workout is een kopie van de weekworkout (YP Showdown). Die past alleen de coach zelf aan."};
    const a=await atleetOphalen(w.client_id);if(a.fout)return {fout:a.fout};
    w.blocks=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
    return {w,p:a.p};
  }
  async function heeftLogs(wid){
    const{count,error}=await db.from("results").select("id",{count:"exact",head:true}).eq("workout_id",wid);
    if(error)throw new Error("results: "+error.message);
    return (count||0)>0;
  }
  // Op welke blokken van deze workout is al gelogd?
  async function logBlokken(wid){
    const{data,error}=await db.from("results").select("block_id").eq("workout_id",wid);
    if(error)throw new Error("results: "+error.message);
    return new Set((data||[]).map(r=>r.block_id));
  }
  const ZICHTBAAR="Deze workout is zichtbaar: de atleet ziet de wijziging meteen.";
  const statusNaam=w=>w.status==="draft"?"concept":"gepubliceerd";
  const scoreAnders=(n,o)=>n.score_type!==(o.score_type||"text")||(n.timecap_seconds||null)!==(o.timecap_seconds||null);
  async function leesTerug(ids){
    if(!ids.length)return [];
    const rijen=await haalIn("workouts","*, blocks(*)","id",ids);
    return rijen.sort((a,b)=>a.workout_date<b.workout_date?-1:a.workout_date>b.workout_date?1:ids.indexOf(a.id)-ids.indexOf(b.id))
      .map(w=>workoutUit(w,heeftIndex()?b=>({videos_uitgezet:b.source_blog_workout_id?null:mediaUitgezet(blokTekst(b),b.media)}):null));
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

  // ---------- YP Showdown: alleen als ongewijzigde kopie van de weekworkout zelf ----------
  // De weekworkouts van het bedrijf in één week (maandag t/m zondag). Normaal is dat er één.
  async function showdownVanWeek(maandag){
    const{data,error}=await db.from("workouts").select("*, blocks(*)").eq("company_id",ME.profile.company_id).eq("audience","blog").is("blog_program_id",null)
      .gte("workout_date",maandag).lte("workout_date",plus(maandag,6)).order("workout_date");
    if(error)throw new Error(error.message);
    return (data||[]).filter(w=>(w.blocks||[]).length);
  }
  // De blokken zoals ze bij de atleet komen te staan: de tekst komt letterlijk uit de
  // weekworkout, het blok verwijst ernaar (source_blog_workout_id), zodat de atleet met
  // Rx/Scaled logt en op het gedeelde leaderboard komt.
  function showdownRijen(ww){
    const bl=(ww.blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
    if(bl.length===1){
      const b=bl[0];
      return [{kind:b.kind,linked:false,exercise:b.exercise||ww.title||"YP Showdown",prescription:b.prescription==null?null:b.prescription,notes:b.notes==null?null:b.notes,color:b.color||"purple",
        score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,
        media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:null,source_blog_workout_id:ww.id}];
    }
    // Meer blokken: één blok met de hele tekst, zoals de bouwer dat doet.
    const txt=bl.map(b=>{
      let pr="";try{pr=composePresc(b)||"";}catch(e){pr=(b.kind==="conditioning"?b.notes:b.prescription)||"";}
      return (b.label?b.label+") ":"")+(b.exercise||"")+(pr?"\n"+pr:"");
    }).join("\n\n");
    const media=bl.reduce((m,b)=>m.concat(Array.isArray(b.media)?b.media:[]),[]);
    return [{kind:"conditioning",linked:false,exercise:ww.title||"YP Showdown",prescription:null,notes:txt,color:"purple",
      score_type:bl[0].score_type||"text",timecap_seconds:bl[0].timecap_seconds||null,cap_score_type:bl[0].cap_score_type||"reps",oefening_id:null,
      media:media.length?media:null,lift_id:null,lift_scheme:null,group_title:null,source_blog_workout_id:ww.id}];
  }
  const groepen=blokken=>blokken.reduce((n,b,i)=>n+((i>0&&b.linked)?0:1),0);

  // ---------- Template week en Template dag (de Template builder) ----------
  const TPLDAG=["ma","di","wo","do","vr","za","zo"];
  const tplSoort=t=>t.type==="dag"?"dag":"week";
  async function templateOphalen(id){
    if(!isUuid(id))return {fout:"Geef het id van de template (uit ClaudeApi.templates)."};
    const{data,error}=await db.from("program_templates").select("id,name,type,description,company_id,weeks,sync_changes").eq("id",id).maybeSingle();
    if(error)return {fout:error.message};
    if(!data||data.company_id!==ME.profile.company_id)return {fout:"Geen template gevonden met dit id."};
    return {t:data};
  }
  // Alles ophalen in stukken van 1000 (de database geeft er nooit meer per keer).
  async function haalAlles(maak){
    let alles=[];
    for(let van=0;van<20000;van+=1000){
      const{data,error}=await maak().range(van,van+999);
      if(error)throw new Error(error.message);
      alles=alles.concat(data||[]);
      if((data||[]).length<1000)break;
    }
    const gezien=new Set();
    return alles.filter(r=>{if(gezien.has(r.id))return false;gezien.add(r.id);return true;});
  }
  const tplBlokRijen=pw=>(pw.program_blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
  function tplWorkoutUit(pw){
    return schoon({id:pw.id,titel:pw.title,notitie_coach:pw.coach_notes,warming_up:pw.warmup,cooldown:pw.cooldown,
      demo_videos_warming_up:titels(pw.warmup_media),demo_videos_cooldown:titels(pw.cooldown_media),
      demo_video_ids_warming_up:videoIds(pw.warmup_media),demo_video_ids_cooldown:videoIds(pw.cooldown_media),blokken:tplBlokRijen(pw).map(blokUit)});
  }
  // ---------- Template week en dag schrijven ----------
  const MAX_TPL_PER_DAG=4,MAX_TPL_WORKOUTS=21;
  const TPL_GEEN_RECHT="Je hebt geen rechten om deze template te wijzigen. Vraag een beheerder.";
  const rlsFout=m=>/row-level security/i.test(String(m||""))?TPL_GEEN_RECHT:m;
  // Wie mag een template wijzigen: beheerders, en coaches die bij de template als bewerker staan.
  // De database bewaakt dat zelf ook; hier vangen we het af met een duidelijke melding.
  async function templateSchrijfbaar(id){
    const t=await templateOphalen(id);if(t.fout)return t;
    if(!["platform_admin","eigenaar"].includes(ME.profile.role)){
      const{data,error}=await db.from("program_editors").select("id").eq("program_id",t.t.id).eq("profile_id",ME.user.id).limit(1);
      if(error)return {fout:error.message};
      if(!(data||[]).length)return {fout:TPL_GEEN_RECHT};
    }
    const{data:asg,error:ae}=await db.from("program_assignments").select("id").eq("program_id",t.t.id);
    if(ae)return {fout:ae.message};
    t.toegewezen=(asg||[]).length;
    return t;
  }
  // Een workout voor een template is een workout zonder datum; de rest van de controle is gelijk.
  function templateWorkoutLees(w,waar,fouten){
    if(!isObject(w)){fouten.push(waar+": een workout moet een object zijn.");return null;}
    const kopie=Object.assign({},w,{datum:iso(new Date())});
    const bord=b=>isObject(b)&&(b.uit_weekworkout||b.leaderboard_workout);
    if(Array.isArray(w.blokken)&&w.blokken.some(bord)){
      fouten.push(waar+": een YP Showdown of leaderboard-workout zet je niet via de koppeling in een template. Laat dat blok weg; de coach plaatst het zelf in de Template builder.");
      kopie.blokken=w.blokken.filter(b=>!bord(b));
    }
    return workoutLees(kopie,waar,fouten,{});
  }
  async function templateWeekTerug(pid,week){
    const rijen=await haalAlles(()=>db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",pid).eq("week",week).order("day").order("sort").order("id"));
    const dagen={};
    rijen.forEach(pw=>{(dagen[pw.day]=dagen[pw.day]||[]).push(tplWorkoutUit(pw));});
    return Object.keys(dagen).map(Number).sort((x,y)=>x-y).map(d=>({dag:d,dagnaam:TPLDAG[d-1],workouts:dagen[d]}));
  }
  // Staat de bibliotheek open, dan laden we de lijst met templates opnieuw.
  function tplVerversen(){try{if(typeof programLaad==="function"){const r=programLaad();if(r&&r.catch)r.catch(()=>{});}}catch(e){}}
  // Blokrij voor een kopie (uit een week van de atleet of uit een template): alles gaat mee zoals het er staat.
  const kopieBlok=b=>({kind:b.kind,label:b.label,linked:!!b.linked,exercise:b.exercise,prescription:b.prescription,notes:b.notes,sort:b.sort,color:b.color,
    score_type:b.score_type||"text",timecap_seconds:b.timecap_seconds||null,cap_score_type:b.cap_score_type||"reps",oefening_id:b.oefening_id||null,
    media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null,source_blog_workout_id:null});
  // Na het kopiëren de video's laten staan (standaard), aanvullen of opnieuw kiezen.
  async function kopieVideos(rijen,keuze,meldingen){
    if(keuze!=="aanvullen"&&keuze!=="auto")return;
    if(!(await videosKlaar())){meldingen.push("De oefeningenbibliotheek was niet geladen: de demo-video's zijn gekopieerd zoals ze waren.");return;}
    const f=[];
    rijen.forEach(r=>{
      r.blokken.forEach(b=>{if(!b.source_blog_workout_id)b.media=mediaKies(keuze,blokBron(b),b.media||null,true,"",f,true);});
      if(r.workout.warmup)r.workout.warmup_media=mediaKies(keuze,r.workout.warmup,r.workout.warmup_media||null,true,"",f,true);
      if(r.workout.cooldown)r.workout.cooldown_media=mediaKies(keuze,r.workout.cooldown,r.workout.cooldown_media||null,true,"",f,true);
    });
  }
  const kopieVideosFout=o=>(!leeg(o.videos)&&!["houden","aanvullen","auto"].includes(o.videos))?"opties.videos moet \"houden\", \"aanvullen\" of \"auto\" zijn.":null;

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
          "Nieuw werk komt altijd als concept. Wat al zichtbaar is voor de atleet pas je alleen aan als de coach daar in dit gesprek uitdrukkelijk om vraagt. Geef dan {zichtbaar:true} mee als laatste argument van wijzigBlok, vervangBlokken of wijzigConcept. De atleet ziet de wijziging meteen: zeg vooraf wat je gaat veranderen en meld daarna wat er staat.",
          "Ook met {zichtbaar:true} kan niet: een zichtbare workout weghalen, een blok weghalen waarop al gelogd is, het scoretype of de tijdslimiet veranderen van een blok waarop al gelogd is, en alles met de YP Showdown.",
          "Alleen video's erbij zetten kan zonder {zichtbaar:true}, met ClaudeApi.videosToevoegen of videosToevoegenWeek. Video's weghalen of vervangen bij een zichtbaar blok doe je met wijzigBlok(blokId, {videos:[id's]}, {zichtbaar:true}).",
          "Onderdelen met uit_weekworkout:true zijn de YP Showdown. De tekst daarvan verander je nooit en je schrijft hem nooit zelf. Plaatsen kan alleen met ClaudeApi.plaatsShowdown, dat de tekst letterlijk uit de weekworkout van die week haalt. In een concept mag je het blok verplaatsen of weghalen met vervangBlokken.",
          "Een week kopiëren neemt de Showdown van de bronweek nooit mee: dat is de workout van die ene week. Met {showdown:true} komt op dezelfde plek de Showdown van de doelweek, als die al in de app staat.",
          "ClaudeApi.showdowns leest de Showdowns en de concepten uit de bouwer, bijvoorbeeld om te zien welke bewegingen en vormen al vaak terugkwamen. Een nieuwe Showdown of een concept schrijf je niet zelf in de app: leg je voorstel aan de coach voor, hij zet het in de bouwer.",
          "Onderdelen met leaderboard_workout zijn een leaderboard-workout: een 1-op-1 workout met een gedeeld leaderboard voor de atleten die hem in hun kalender hebben. De tekst schrijf je niet zelf over: plaatsen gaat met ClaudeApi.plaatsLeaderboardWorkout, dat de tekst uit de leaderboard-workout haalt. Een week kopiëren neemt zo'n blok wel mee, met zijn koppeling.",
          "Een geschaalde versie voor één atleet (bijvoorbeeld ring rows in plaats van pull-ups) maak je met ClaudeApi.schaalBlok, bij een leaderboard-workout en bij een ingevoegde YP Showdown. Alleen het blok van die atleet verandert; hij staat dan onder Scaled op het gedeelde leaderboard. Doe dit alleen als de coach erom vraagt en zeg vooraf wat je aanpast.",
          "Een leaderboard aanzetten (ClaudeApi.leaderboardAan) maakt scores van atleten zichtbaar voor elkaar. Doe dat alleen als de coach er uitdrukkelijk om vraagt.",
          "Staat dezelfde workout al bij meer atleten en moet er achteraf een leaderboard op, zet het dan bij één atleet aan met leaderboardAan en hang de blokken van de anderen eraan met ClaudeApi.koppelLeaderboard. Gebruik leaderboardAan niet per atleet: dan krijgt elke atleet een eigen bord met één naam. Losse kopieën van de YP Showdown hang je op dezelfde manier aan de Showdown van die week.",
          "Een Template week of dag kan een YP Showdown of leaderboard-workout bevatten (uit_weekworkout of leaderboard_workout bij het blok in templateWeek). kopieerTemplate zet dat blok bij de atleet met zijn gedeelde leaderboard, precies zoals het in de template staat.",
          "Templates (Template week en Template dag) zijn van het hele bedrijf en hebben geen conceptstatus: wat je schrijft staat er meteen voor alle coaches. Maak of overschrijf een template alleen als de coach erom vraagt, zeg vooraf welke template en welke week, en overschrijf (met {overschrijf:true}) alleen dagen die je eerst met templateWeek hebt gelezen. Een atleet ziet een template niet; pas met kopieerTemplate komt er een concept bij een atleet. Een YP Showdown of leaderboard-workout zet je niet zelf in een template.",
          "Uitleg bij een week of dag, en een warming-up die je als eigen onderdeel wilt tonen, zet je in een tekstblok (soort:\"tekst\"), niet in een oefening met scoretype none. Zo krijgt het echte werk de letters A, B, C. De vakken warming_up en cooldown van de workout bestaan ook nog; gebruik wat de coach gewend is.",
          "Je ziet alleen wat de ingelogde coach mag zien.",
          "Begin elke sessie met ClaudeApi.ik() en controleer dat de juiste coach is ingelogd. Staat er verouderd:true, dan is er een nieuwere versie live: voer location.reload() uit en begin opnieuw. Naar hetzelfde adres navigeren herlaadt de pagina niet.",
          "Zoek een atleet altijd eerst op met ClaudeApi.atleten(...) en gebruik daarna zijn id. Elk antwoord noemt de atleet bij naam: controleer die naam.",
          "Een leeg veld betekent: niet ingevuld. Reken of gok het niet zelf.",
          "RPE en trainingstijd: de app vraagt daar alleen om als de coach dat voor die atleet heeft aangezet. week() zegt bovenaan bij rpe_vraag of dat aan of uit staat, en atleten() toont het per atleet. Staat het uit, dan komt er geen RPE binnen en moet je dat aan de coach melden.",
          "De chat lees je met ClaudeApi.berichten. Je kunt geen berichten versturen en niets als gelezen markeren; dat doet de coach zelf.",
          "Elk schrijf-commando geeft terug wat er nu staat, in dezelfde vorm als ClaudeApi.week. Lees dat na, vooral demo_videos: de herkenning zit er soms naast.",
          "Demo-video's: een nieuw blok krijgt ze vanzelf, een gekopieerd blok houdt de video's die het had. Mist er een, gebruik dan videos:\"aanvullen\" (laat staan wat er staat en voegt herkende oefeningen toe). Staat er bij een blok videos_uitgezet, dan hebben coaches die video eerder bewust weggehaald: kies hem alleen als de coach het vraagt, met videos:[id] uit videoZoek. Bestaat er voor een beweging geen video in de bibliotheek (bijvoorbeeld Echo Bike), dan kan er ook niets gekozen worden: meld dat aan de coach.",
          "Hoe de app zelf kiest: de naam van het blok gaat voor, die video's staan vooraan. Daarna komt elke beweging die in het voorschrift of de omschrijving staat, behalve wat de naam al preciezer zegt. Een beweging die je alleen noemt als verwijzing (\"zelfde gewicht als de back squat\") krijgt dus ook een video: lees demo_videos na en geef in dat geval videos:[...] mee. Per blok, warming-up of cooldown passen er hooguit "+MAX_VIDEOS+" video's.",
          "Een tweede sessie op dezelfde dag is een tweede workout met dezelfde datum en een eigen titel, bijvoorbeeld \"Sessie 2 (optioneel)\". De volgorde in de lijst van schrijfConcept is de volgorde op de dag. Een vinkje optioneel of prio bestaat nog niet: zet het in de titel.",
          "Staat er ok:false, dan is er niets geschreven, tenzij de fout zelf iets anders zegt.",
          "Een groot antwoord (vier weken van een atleet die veel traint is al snel 75 kB) kan in je browsergereedschap afgekapt worden. Bewaar het dan in een variabele (window.w = await ClaudeApi.week(...)) en lees het per week of per dag uit, of vraag één week per keer op."
        ],
        lezen:{
          "ClaudeApi.ik()":"Wie is er ingelogd, welke rol, welke datum is het vandaag.",
          "ClaudeApi.atleten(zoek, alle)":"Lijst van atleten met id. zoek = deel van de naam (optioneel). Standaard alleen je eigen klanten; alle=true toont iedereen die je mag zien.",
          "ClaudeApi.week(atleetId, datum, weken)":"Het 1-op-1 programma per week, met blokken, resultaten per blok, RPE met trainingstijd en het moment van invullen, en de reacties van atleet en coach (met bij_blok als de reactie bij één blok hoort). datum = een dag in de laatste week (JJJJ-MM-DD), weken = hoeveel weken terug inclusief die week (1 t/m 8, standaard 1). Concepten staan erbij met status concept.",
          "ClaudeApi.notities(atleetId)":"Profiel, doelen, coachnotities, dagnotities en vastgelegde consults.",
          "ClaudeApi.berichten(atleetId, aantal)":"De chat tussen de atleet en zijn coach in de app, oudste eerst. aantal = hoeveel van de laatste berichten (1 t/m 200, standaard 30). Met wacht_op_antwoord als het laatste bericht van de atleet is.",
          "ClaudeApi.berichtenOpen(alle, dagen)":"Bij welke atleten is het laatste chatbericht van de atleet zelf, dus wacht er iets op antwoord. Standaard je eigen klanten en de laatste 14 dagen (dagen = 1 t/m 60).",
          "ClaudeApi.metingen(atleetId, naam)":"Laatste waarde per meting (krachtwaarden, benchmarks). Met naam erbij: de hele geschiedenis van die ene meting.",
          "ClaudeApi.bibliotheek(zoek, soort)":"Templates uit de bibliotheek, met id en de demo-video's die erbij horen. soort = warmup, cooldown of other (optioneel). Plaatsen doe je met ClaudeApi.voegTemplateIn.",
          "ClaudeApi.videoZoek(zoek)":"Oefeningen met een demo-video, met id. Gebruik die id's in videos:[...] als de automatische keuze niet klopt.",
          "ClaudeApi.showdowns(zoek, opties)":"Alle YP Showdowns, nieuwste eerst, met datum, scoretype, tijdslimiet, het aantal gelogde scores dat de coach mag zien en de volledige tekst. Concepten uit de bouwer staan erbij met status concept. zoek = woord dat in de naam of de tekst moet staan, bijvoorbeeld \"sandbag\" (optioneel): aantal_live tegenover totaal_live zegt dan hoe vaak het al voorkwam. opties (optioneel): {vanaf:\"JJJJ-MM-DD\", tot:\"JJJJ-MM-DD\"} voor een periode, {tekst:false} voor alleen het overzicht, {concepten:false} zonder concepten. Alleen lezen.",
          "ClaudeApi.leaderboardWorkouts(zoek, opties)":"De leaderboard-workouts van het bedrijf, nieuwste eerst, met id, scoretype, tijdslimiet, het aantal gelogde scores dat de coach mag zien en de tekst. zoek = woord in de naam of de tekst (optioneel). opties: {tekst:false} voor alleen het overzicht.",
          "ClaudeApi.templates(zoek)":"De Template weken en Template dagen van het bedrijf (de Template builder staat hier ook in), met id, aantal weken en dagen.",
          "ClaudeApi.templateWeek(templateId, week, weken)":"Zonder week: een overzicht van de hele template (per week en dag de titel en de namen van de blokken). Met week: de volledige tekst van die week, in dezelfde vorm als week(). weken = hoeveel weken vanaf die week (1 t/m 4). Dag 1 is maandag."
        },
        schrijven:{
          "ClaudeApi.schrijfConcept(atleetId, workouts, opties)":"Zet één of meer workouts als concept klaar (maximaal "+MAX_WORKOUTS+" per keer, dus een hele week in één keer). workouts = lijst in de vorm van het voorbeeld hieronder. opties (optioneel): {toch:true} als er op die dag al een concept met dezelfde titel staat en je er bewust een naast wilt; {verleden:true} voor een datum in het verleden; {videos:\"geen\"} om geen demo-video's te laten kiezen.",
          "ClaudeApi.kopieerWeek(atleetId, vanDatum, naarDatum, opties)":"Kopieert alle 1-op-1 workouts uit de week van vanDatum naar de week van naarDatum, op dezelfde weekdagen, als concept. Resultaten en reacties gaan niet mee, demo-video's wel. Daarna pas je met wijzigBlok alleen aan wat verandert. opties (optioneel): {showdown:true} zet de YP Showdown van de doelweek op de plek waar hij in de bronweek stond (zonder die optie wordt hij overgeslagen en gemeld); {videos:\"aanvullen\"} voegt ontbrekende demo-video's toe, {videos:\"auto\"} kiest ze allemaal opnieuw.",
          "ClaudeApi.kopieerTemplate(atleetId, templateId, week, datum, opties)":"Zet een week uit een Template week bij de atleet als concept: dag 1 op de maandag van de week van datum. Met {dag:n} alleen die ene templatedag, precies op datum. Alles gaat mee zoals het in de template staat, ook de demo-video's. Het is een losse kopie zonder koppeling met de template. Zelfde opties voor videos als kopieerWeek.",
          "ClaudeApi.maakTemplate(naam, opties)":"Maakt een lege Template week (standaard) of Template dag aan. opties (optioneel): {soort:\"dag\"}, {omschrijving:\"...\"}, {toch:true} als er al een template met die naam is en je er bewust een tweede naast wilt. Geeft het id terug.",
          "ClaudeApi.schrijfTemplateWeek(templateId, week, dagen, opties)":"Zet dagen in één week van een template. dagen = lijst in de vorm van template_voorbeeld: per dag (1 = maandag) een lijst workouts, elk zoals een workout in schrijfConcept maar zonder datum. Dagen die je niet noemt blijven staan. Staat er op een dag al iets, dan gebeurt er niets, tenzij je {overschrijf:true} meegeeft: die dagen worden dan vervangen (een dag met workouts:[] wordt leeg). Wat templateWeek teruggeeft kun je zo weer meegeven. week mag een bestaande week zijn of de eerstvolgende nieuwe.",
          "ClaudeApi.wijzigTemplate(templateId, velden)":"Past de naam of de omschrijving van een template aan: {naam:\"...\"} en/of {omschrijving:\"...\"}.",
          "ClaudeApi.verwijderTemplate(templateId, opties)":"Verwijdert een hele template met alle weken. Kan niet worden teruggedraaid. Alleen op uitdrukkelijk verzoek van de coach, met ter controle de exacte naam: {naam:\"...\"}. Een template die aan een klant is toegewezen kun je niet verwijderen.",
          "ClaudeApi.plaatsShowdown(atleetId, datum, opties)":"Zet de YP Showdown van de week van datum als concept bij de atleet, op datum. De tekst komt letterlijk uit de weekworkout; je kunt hem niet meegeven of wijzigen. Staat de Showdown van die week nog niet in de app, dan krijg je een melding en gebeurt er niets. Met {workoutId:\"...\"} komt hij als laatste blok in een bestaand concept van die atleet in dezelfde week.",
          "ClaudeApi.plaatsLeaderboardWorkout(atleetId, leaderboardWorkoutId, datum, opties)":"Zet een bestaande leaderboard-workout als concept bij de atleet, op datum. De tekst komt letterlijk uit de leaderboard-workout. Staat hij die week al bij de atleet, dan gebeurt er niets (met {toch:true} toch). Met {workoutId:\"...\"} komt hij als laatste blok in een bestaand concept van die atleet in dezelfde week.",
          "ClaudeApi.schaalBlok(blokId, tekst, opties)":"Maakt van een ingevoegde YP Showdown of leaderboard-workout een geschaalde versie voor deze ene atleet: het blok krijgt de tekst die je meegeeft en het vinkje Scaled-versie, zodat de atleet onder Scaled op het gedeelde leaderboard staat. De workout zelf verandert niet. Met {terug:true} (tekst mag dan leeg) komt de oorspronkelijke tekst terug en gaat het vinkje uit. Bij een zichtbare workout alleen met {zichtbaar:true}.",
          "ClaudeApi.leaderboardAan(blokId, opties)":"Zet een gedeeld leaderboard aan op een gewoon blok: er komt een leaderboard-workout met de naam en de tekst van het blok, en het blok wordt eraan gekoppeld. Kan niet op een blok in een superset, een blok met een lift of een blok zonder scoretype. Bij een zichtbare workout alleen met {zichtbaar:true}. Het antwoord geeft het id waarmee je hem bij andere atleten plaatst.",
          "ClaudeApi.koppelLeaderboard(leaderboardId, blokIds, opties)":"Zet een leaderboard alsnog aan op blokken die al bij atleten in de kalender staan. leaderboardId = het id van een leaderboard-workout (leaderboard_workout bij een blok, of uit leaderboardWorkouts) of van de YP Showdown van die week (uit showdowns). blokIds = lijst met de id's van de blokken, één per atleet (uit week). De tekst van de blokken verandert niet. Een score die al was ingevuld blijft staan en komt meteen op het bord. Blokken met een ander scoretype dan het leaderboard worden geweigerd. Bij zichtbare workouts alleen met {zichtbaar:true}. Het antwoord zegt per blok of het gelukt is en zo niet waarom.",
          "ClaudeApi.wijzigBlok(blokId, velden, opties)":"Past één blok aan (bij een zichtbare workout alleen met opties {zichtbaar:true}). Geef alleen de velden die veranderen, bijvoorbeeld {voorschrift:\"6 reps @30X1; rest 2-3 min. x 4 sets.\"}. Verandert de naam of de tekst, dan worden de demo-video's opnieuw gekozen (videos:\"houden\" laat ze staan).",
          "ClaudeApi.vervangBlokken(workoutId, blokken, opties)":"Zet de hele blokkenlijst in één keer (bij een zichtbare workout alleen met opties {zichtbaar:true}): een blok met id wordt bijgewerkt, zonder id is nieuw, wat ontbreekt gaat weg. Zo voeg je een blok toe, haal je er een weg of verander je de volgorde.",
          "ClaudeApi.wijzigConcept(workoutId, velden, opties)":"Past de workout zelf aan: datum, titel, notitie_coach, warming_up, cooldown, en de demo-video's van die twee vakken met videos_warming_up en videos_cooldown (zie workout in deze uitleg). Bij een zichtbare workout alleen met opties {zichtbaar:true}.",
          "ClaudeApi.verwijderConcept(workoutId)":"Haalt één concept weg, met zijn blokken. Kan alleen bij een concept zonder gelogde resultaten. Doe dit alleen voor een concept dat je zelf hebt klaargezet of als de coach erom vraagt.",
          "ClaudeApi.voegTemplateIn(workoutId, templateId, opties)":"Zet een template uit de bibliotheek in één keer in een workout, precies zoals de knop in de app dat doet: tekst, kleur en de demo-video's van de template gaan mee, en een template met meerdere liften wordt een superset. Een warming-up- of cooldown-template komt in dat vak te staan (achter wat er al staat); elke andere template komt als laatste blok. opties (optioneel): {plek:\"blok\"} om een warming-up-template toch als blok te zetten, {plek:\"warming_up\"} of {plek:\"cooldown\"} om het vak te kiezen, {zichtbaar:true} voor een workout die al zichtbaar is. Verplaatsen doe je daarna met vervangBlokken.",
          "ClaudeApi.videosToevoegen(blokId, videos)":"Zet demo-video's bij één blok, ook als de workout al zichtbaar is. videos = \"aanvullen\" (standaard: de herkende bewegingen die nog geen video hebben) of een lijst id's uit videoZoek. Er komt alleen iets bij; wat er staat blijft staan. Werkt niet op de YP Showdown.",
          "ClaudeApi.videosToevoegenWeek(atleetId, datum)":"Hetzelfde voor alle blokken van één week van een atleet, met de herkende bewegingen. Geeft per blok terug wat erbij is gekomen."
        },
        blok:{
          soort:"oefening (standaard), conditioning of tekst. Een tekstblok (soort:\"tekst\") is uitleg of een warming-up als eigen blok: alleen naam (de titel), omschrijving (de tekst), kleur en videos. Het heeft geen letter en geen score, de atleet hoeft er niets bij in te vullen en het telt niet mee als onderdeel. Het kan op elke plek in de workout staan en zo vaak als nodig, maar niet in een superset.",
          naam:"Verplicht. De naam van de oefening of van het onderdeel.",
          voorschrift:"Alleen bij een oefening. Zoals in de uitleg: \"8 reps @30X1; rest 2-3 min. x 4 sets.\" of \"5 x 3 @ 75%\".",
          coachingtips:"Alleen bij een oefening. Losse aanwijzingen onder het voorschrift.",
          omschrijving:"Bij conditioning en bij een tekstblok. De hele tekst van het onderdeel.",
          scoretype:"Wat de atleet invult. Standaard text. Zie scoretypes.",
          kleur:"Zie kleuren. Leeg mag.",
          tijdslimiet_sec:"Alleen bij scoretype time.",
          superset_met_vorige:"true = hoort bij het blok erboven (B1, B2). De letters zet de app zelf.",
          kaarttitel:"Titel boven een superset, op het eerste blok van de groep.",
          videos:"Weglaten = de app kiest zelf uit de tekst (bij een bestaand blok alleen als naam of tekst verandert). \"aanvullen\" = laten staan en ontbrekende toevoegen, \"auto\" = opnieuw kiezen, \"houden\", \"geen\", of een exacte lijst id's. Een id is een getal uit ClaudeApi.videoZoek of een waarde uit demo_video_ids van week() (die staan in dezelfde volgorde als demo_videos, dus zo houd je video's met dezelfde naam uit elkaar)."
        },
        workout:{
          datum:"Verplicht, JJJJ-MM-DD.",
          titel:"Verplicht, behalve bij rustdag:true.",
          notitie_coach:"Tekst boven de workout.",
          warming_up:"Tekst van het vak Warming-up.",
          cooldown:"Tekst van het vak Cooldown.",
          videos_warming_up:"Demo-video's bij de warming-up. Weglaten = de app kiest zelf uit de tekst. \"aanvullen\", \"auto\", \"houden\", \"geen\", of een exacte lijst id's (getallen uit ClaudeApi.videoZoek of waarden uit demo_video_ids_warming_up van week()). Kan alleen als er een warming_up-tekst is.",
          videos_cooldown:"Hetzelfde voor de cooldown (demo_video_ids_cooldown).",
          videos:"Eén keuze voor warming-up en cooldown samen: \"auto\", \"aanvullen\", \"houden\" of \"geen\". Een lijst geef je per vak.",
          blokken:"Lijst blokken, zie blok."
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
        template_voorbeeld:{
          aanroep:"const t = await ClaudeApi.maakTemplate(\"Testweek kracht\"); await ClaudeApi.schrijfTemplateWeek(t.template.id, 1, dagen)",
          dagen:[
            {dag:1,workouts:[
              {titel:"Sessie 1: back squat tester",warming_up:"3 rounds:\n10 Air Squats\n10 Banded Good Mornings",
                blokken:[{naam:"Back Squat",voorschrift:"Build to 1RM; rest 3 min.",scoretype:"load",kleur:"orange"}]},
              {titel:"Sessie 2 (optioneel)",blokken:[{soort:"conditioning",naam:"Easy flush",omschrijving:"20 min Air Bike @ praattempo",kleur:"blue"}]}
            ]},
            {dag:2,workouts:[{rustdag:true}]}
          ]
        },
        scoretypes,kleuren};
    },

    ik:veilig(async()=>{
      const vandaag=iso(new Date());
      // Draait deze pagina nog de nieuwste versie? Een pagina die open blijft staan krijgt
      // een update pas na echt herladen; naar hetzelfde adres navigeren herlaadt niet.
      let live=null;
      try{
        if(typeof fetch==="function"){
          const r=await fetch("app/claude-api.js?nu="+Date.now(),{cache:"no-store"});
          const m=r.ok?(await r.text()).match(/const VERSIE="([^"]+)"/):null;
          live=m?m[1]:null;
        }
      }catch(e){live=null;}
      const oud=!!live&&live!==VERSIE;
      // verouderd staat er altijd in (true of false), zodat te zien is dat de controle werkt;
      // lukte het ophalen niet, dan zegt versiecontrole dat.
      return schoon({ok:true,versie:VERSIE,
        verouderd:oud,versie_live:live,versiecontrole:live?"gelukt":"niet gelukt: kon de live versie niet ophalen",
        let_op:oud?"Live staat versie "+live+", deze pagina draait "+VERSIE+". Herlaad de pagina echt voordat je verdergaat: voer location.reload() uit en draai daarna ClaudeApi.ik() opnieuw.":null,
        coach:naam(ME.profile),coach_id:ME.user.id,rol:ME.profile.role,vandaag,weekdag:dagVan(vandaag),maandag_deze_week:maandagVan(vandaag)});
    }),

    atleten:veilig(async(zoek,alle)=>{
      const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived,role,effort_rating").eq("company_id",ME.profile.company_id).in("role",["lid","coach","eigenaar","platform_admin"]).order("first_name");
      if(error)return fout(error.message);
      const z=String(zoek||"").trim().toLowerCase();
      const lijst=(data||[]).filter(isAtleet).filter(p=>!p.archived).filter(p=>alle||p.coach_id===ME.user.id).filter(p=>!z||naam(p).toLowerCase().includes(z))
        .map(p=>schoon({id:p.id,naam:naam(p),soort:p.membership_type||(p.coach_id?"one_on_one":""),eigen_klant:p.coach_id===ME.user.id,is_zelf_coach:p.role!=="lid"?true:null,rpe_vraag:p.effort_rating?"aan":"uit"}));
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
          haalIn("workout_effort","workout_id,rpe,minutes,created_at,updated_at","workout_id",wids,q=>q.eq("athlete_id",a.p.id)),
          haalIn("workout_comments","workout_id,author_id,body,created_at,block_id","workout_id",wids,q=>q.order("created_at")),
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
          {rpe:e?e.rpe:null,minuten:e?e.minutes:null,rpe_ingevuld_op:e?tijd(e.updated_at||e.created_at):null,
           reacties:(comPerW[w.id]||[]).map(c=>{
             // Een reactie kan bij één blok horen (bijvoorbeeld bij een gelogd resultaat).
             const b=c.block_id?(w.blocks||[]).find(x=>x.id===c.block_id):null;
             return schoon({van:c.author_id===a.p.id?"atleet":"coach",op:tijd(c.created_at),bij_blok:b?((b.label||"")+" "+(b.exercise||"")).trim():null,tekst:c.body});
           }),
           wacht_op_reactie:((comPerW[w.id]||[]).length&&comPerW[w.id][comPerW[w.id].length-1].author_id===a.p.id)?true:null});
        const wk=perWeek[maandagVan(w.workout_date)];if(wk)wk.workouts.push(rij);
      });
      return {ok:true,atleet:{id:a.p.id,naam:naam(a.p)},periode:{van,tot,weken},
        rpe_vraag:a.p.effort_rating?"aan: de app vraagt na elke training om RPE en trainingstijd; die staan per workout in rpe en minuten":"uit: de app vraagt deze atleet niet om RPE en trainingstijd, dus rpe en minuten blijven leeg. De coach zet dit aan in het profiel van de klant.",
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

    // De chat lezen. Er is geen commando om een bericht te sturen of als gelezen te markeren.
    berichten:veilig(async(atleetId,aantal)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      aantal=leeg(aantal)?30:Number(aantal);
      if(!Number.isInteger(aantal)||aantal<1||aantal>200)return fout("aantal moet een heel getal van 1 t/m 200 zijn.");
      const{data,error}=await db.from("messages").select("id,sender_id,body,read_at,created_at,media").eq("athlete_id",a.p.id).order("created_at",{ascending:false}).limit(aantal);
      if(error)return fout(error.message);
      const rijen=(data||[]).slice().reverse();
      const van=m=>m.sender_id===a.p.id?"atleet":"coach";
      const laatste=rijen[rijen.length-1];
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},aantal:rijen.length,
        wacht_op_antwoord:laatste?van(laatste)==="atleet":false,laatste_bericht_op:laatste?tijd(laatste.created_at):null,
        let_op:rijen.length===aantal?"Dit zijn alleen de laatste "+aantal+" berichten. Vraag er meer op als je verder terug wilt.":null,
        berichten:rijen.map(m=>schoon({van:van(m),op:tijd(m.created_at),tekst:m.body,bijlage:(Array.isArray(m.media)?m.media.length:m.media)?true:null,gelezen:m.read_at?true:null}))});
    }),

    berichtenOpen:veilig(async(alle,dagen)=>{
      dagen=leeg(dagen)?14:Number(dagen);
      if(!Number.isInteger(dagen)||dagen<1||dagen>60)return fout("dagen moet een heel getal van 1 t/m 60 zijn.");
      const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,archived,role").eq("company_id",ME.profile.company_id).in("role",["lid","coach","eigenaar","platform_admin"]);
      if(error)return fout(error.message);
      const klanten=(data||[]).filter(isAtleet).filter(p=>!p.archived).filter(p=>alle||p.coach_id===ME.user.id);
      const perId={};klanten.forEach(p=>{perId[p.id]=p;});
      const sinds=new Date(Date.now()-dagen*86400000).toISOString();
      const laatste={};
      for(const deel of stukken(klanten.map(p=>p.id),15)){
        const rijen=await haalAlles(()=>db.from("messages").select("id,athlete_id,sender_id,body,created_at").in("athlete_id",deel).gte("created_at",sinds).order("created_at"));
        rijen.forEach(m=>{const l=laatste[m.athlete_id];if(!l||m.created_at>l.created_at)laatste[m.athlete_id]=m;});
      }
      const open=Object.values(laatste).filter(m=>m.sender_id===m.athlete_id).sort((x,y)=>x.created_at<y.created_at?-1:1)
        .map(m=>({atleet:naam(perId[m.athlete_id]),id:m.athlete_id,op:tijd(m.created_at),begin:String(m.body||"").slice(0,160)}));
      return {ok:true,periode_dagen:dagen,filter:alle?"alle atleten":"alleen eigen klanten",atleten_met_chat:Object.keys(laatste).length,wacht_op_antwoord:open.length,open};
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
      let q=db.from("templates").select("id,naam,type,kleur,tags,instructies,media").order("naam").limit(40);
      if(!leeg(soort))q=q.eq("type",soort);
      const z=String(zoek||"").trim();
      if(z)q=q.ilike("naam","%"+z.replace(/[%_]/g,"")+"%");
      const{data,error}=await q;if(error)return fout(error.message);
      return {ok:true,aantal:(data||[]).length,let_op:(data||[]).length===40?"Er zijn meer dan 40 resultaten. Zoek preciezer.":undefined,
        templates:(data||[]).map(t=>schoon({id:t.id,naam:t.naam,soort:t.type,kleur:t.kleur,tags:t.tags,tekst:t.instructies,demo_videos:titels(t.media)}))};
    }),

    // Oefeningen met een demo-video zoeken (zelfde zoeker als in de app).
    videoZoek:veilig(async(zoek)=>{
      const z=String(zoek||"").trim();
      if(z.length<2)return fout("Geef een zoekwoord van minstens twee letters.");
      if(!(await videosKlaar()))return fout("De oefeningenbibliotheek is nog niet geladen. Probeer het over een paar seconden opnieuw.");
      const hits=oefZoek(z).filter(o=>o.youtube_id).slice(0,15);
      return {ok:true,aantal:hits.length,oefeningen:hits.map(o=>schoon({id:o.id,naam:o.naam,eigen_video:o.bron==="eigen"?true:null}))};
    }),

    // ---------- YP Showdowns lezen ----------
    // Alle Showdowns van het bedrijf (nieuwste eerst) met de volledige tekst, zodat te zien is
    // wat al vaak terugkwam. Concepten uit de bouwer (audience 'blog_concept') staan erbij.
    // Alleen lezen: een Showdown of concept maakt of wijzigt de coach zelf in de app.
    showdowns:veilig(async(zoek,opties)=>{
      opties=leeg(opties)?{}:opties;
      if(!isObject(opties))return fout("opties moet een object zijn, bijvoorbeeld {vanaf:\"2026-09-01\"}.");
      for(const k of ["vanaf","tot"])if(!leeg(opties[k])&&!isDatum(opties[k]))return fout(k+" moet JJJJ-MM-DD zijn, bijvoorbeeld 2026-09-01.");
      if(!leeg(zoek)&&typeof zoek!=="string")return fout("zoek moet tekst zijn, bijvoorbeeld \"sandbag\". Opties geef je als tweede argument.");
      const basis=(aud,extra)=>db.from("workouts").select("id,title,workout_date,audience,created_at, blocks(*)"+(extra||"")).eq("company_id",ME.profile.company_id).eq("audience",aud).is("blog_program_id",null);
      const live=metAantal=>{
        let q=basis("blog",metAantal?", results(count)":"");
        if(!leeg(opties.vanaf))q=q.gte("workout_date",opties.vanaf);
        if(!leeg(opties.tot))q=q.lte("workout_date",opties.tot);
        return q.order("workout_date",{ascending:false}).limit(300);
      };
      let[l,c]=await Promise.all([live(true),opties.concepten===false?Promise.resolve({data:[]}):basis("blog_concept").order("created_at",{ascending:false}).limit(100)]);
      if(l.error)l=await live(false); // zonder het aantal scores, als dat niet op te vragen is
      if(l.error)return fout(l.error.message);
      if(c.error)return fout(c.error.message);
      const blokken=w=>(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
      const tekstVan=w=>{
        const bl=blokken(w);
        return bl.map(b=>{
          const t=b.kind==="conditioning"?(b.notes||""):[b.prescription,b.notes].filter(Boolean).join("\n");
          return bl.length>1?[(b.label?b.label+") ":"")+(b.exercise||""),t].filter(Boolean).join("\n"):t;
        }).join("\n\n");
      };
      const z=String(zoek||"").trim().toLowerCase();
      const past=w=>!z||String(w.title||"").toLowerCase().includes(z)||tekstVan(w).toLowerCase().includes(z);
      const rij=concept=>w=>{
        const b=blokken(w)[0]||{},n=w.results&&w.results[0]?w.results[0].count:null;
        return schoon({id:w.id,naam:w.title,status:concept?"concept":"live",datum:concept?null:w.workout_date,dag:concept?null:dagVan(w.workout_date),
          scoretype:b.score_type,tijdslimiet_sec:b.score_type==="time"?b.timecap_seconds:null,
          aantal_scores:concept||n==null?null:Number(n),
          tekst:opties.tekst===false?null:tekstVan(w),
          demo_videos:titels(blokken(w).reduce((m,x)=>m.concat(Array.isArray(x.media)?x.media:[]),[]))});
      };
      const alleLive=l.data||[],alleCon=c.data||[];
      const lijst=alleLive.filter(past),con=alleCon.filter(past);
      const periode=[!leeg(opties.vanaf)?"vanaf "+opties.vanaf:"",!leeg(opties.tot)?"tot en met "+opties.tot:""].filter(Boolean).join(" ");
      return schoon({ok:true,
        filter:[z?"naam of tekst bevat \""+z+"\"":"",periode].filter(Boolean).join(", ")||"geen",
        aantal_live:lijst.length,totaal_live:alleLive.length,aantal_concepten:con.length,totaal_concepten:alleCon.length,
        let_op:"Alleen lezen. Een Showdown of concept maak of wijzig je niet zelf: dat doet de coach in de app onder YP Showdown, weergave Bouwer."
          +(alleCon.length?" Een concept is nog niet zichtbaar voor leden en heeft nog geen datum.":"")
          +(alleLive.length===300?" Er zijn meer dan 300 Showdowns: beperk de periode met {vanaf, tot}.":""),
        concepten:con.map(rij(true)),
        showdowns:lijst.map(rij(false))});
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
        w.blokken.forEach((n,j)=>{n.media=mediaKies(n.videos===undefined?standaard:n.videos,blokBron(n),undefined,true,waar+", blok "+(j+1),fouten,indexOk);});
        return {workout:{workout_date:w.datum,title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
            warmup_media:w.warmup?mediaKies(w.videosWu===undefined?wk:w.videosWu,w.warmup,undefined,true,waar+", videos_warming_up",fouten,indexOk):null,
            cooldown_media:w.cooldown?mediaKies(w.videosCd===undefined?wk:w.videosCd,w.cooldown,undefined,true,waar+", videos_cooldown",fouten,indexOk):null},
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
      const vf=kopieVideosFout(opties);if(vf)return fout(vf);
      const meldingen=[],overgeslagen=[],rijen=[];
      if(zichtbaar.length)meldingen.push("In de week van "+naar+" staan al "+zichtbaar.length+" zichtbare workouts. De kopie komt ernaast.");
      // De Showdown uit de bronweek gaat nooit mee: dat is de workout van díé week. Met
      // {showdown:true} komt op dezelfde plek de Showdown van de doelweek, als die er al is.
      const isSd=id=>!!id&&!isBord(id);
      const heeftSd=bron.some(w=>isSd(w.source_blog_workout_id)||(w.blocks||[]).some(b=>isSd(b.source_blog_workout_id)));
      let sd=null,sdGeplaatst=0;
      if(heeftSd&&opties.showdown===true){
        const lijst=await showdownVanWeek(naar);
        if(lijst.length===1)sd=lijst[0];
        else meldingen.push(lijst.length?"In de week van "+naar+" staan "+lijst.length+" weekworkouts. De Showdown is niet meegenomen; plaats de juiste met plaatsShowdown.":"De YP Showdown voor de week van "+naar+" staat nog niet in de app. Plaats hem later met plaatsShowdown.");
      }
      bron.forEach(w=>{
        if(w.source_blog_workout_id){
          if(sd){rijen.push({workout:{workout_date:plus(w.workout_date,dagen),title:sd.title||"YP Showdown"},blokken:letters(showdownRijen(sd))});sdGeplaatst++;}
          else overgeslagen.push(w.workout_date+": \""+(w.title||"")+"\" (weekworkout)");
          return;
        }
        const alle=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort);
        const blokken=[];let sdHier=false,anders=false;
        alle.forEach(b=>{
          if(!b.source_blog_workout_id){blokken.push(kopieBlok(b));return;}
          // Leaderboard-workout: gaat mee met zijn koppeling (en met de geschaalde versie van deze atleet).
          if(isBord(b.source_blog_workout_id)){blokken.push(Object.assign(kopieBlok(b),{source_blog_workout_id:b.source_blog_workout_id,scaled_versie:!!b.scaled_versie}));return;}
          anders=true;
          if(sd){if(!sdHier){showdownRijen(sd).forEach(r=>blokken.push(r));sdHier=true;sdGeplaatst++;}}
          else overgeslagen.push(w.workout_date+": blok \""+(b.exercise||"")+"\" (weekworkout)");
        });
        if(anders){
          if(!blokken.length&&!w.warmup&&!w.cooldown)return;
          letters(blokken); // er viel een blok tussenuit of er kwam een ander voor in de plaats: letters en volgorde opnieuw
        }
        rijen.push({workout:{workout_date:plus(w.workout_date,dagen),title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
            warmup_oefening_id:w.warmup_oefening_id||null,cooldown_oefening_id:w.cooldown_oefening_id||null,
            warmup_media:w.warmup_media||null,cooldown_media:w.cooldown_media||null,day_sort:leeg(w.day_sort)?null:w.day_sort},blokken});
      });
      if(!rijen.length)return fout("Er is niets gekopieerd: de week van "+van+" bevat alleen onderdelen uit de weekworkout.");
      if(sdGeplaatst)meldingen.push("De YP Showdown van de week van "+naar+" (\""+(sd.title||"")+"\") is meegenomen, ongewijzigd.");
      await kopieVideos(rijen,opties.videos,meldingen);
      const ids=await conceptenNeerzetten(a.p,rijen);
      const terug=await leesTerug(ids);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},van_week:van,naar_week:naar,gekopieerd:ids.length,status:"concept",uitleg:GOEDKEUREN,
        overgeslagen,let_op:meldingen,workouts:terug});
    }),

    wijzigBlok:veilig(async(blokId,velden,opties)=>{
      opties=isObject(opties)?opties:{};
      if(!isUuid(blokId))return fout("Geef het id van het blok (uit ClaudeApi.week of het antwoord van een schrijf-commando).");
      if(!isObject(velden)||!Object.keys(velden).length)return fout("Geef de velden die veranderen, bijvoorbeeld {voorschrift:\"...\"}.");
      const mag=BLOK_SCHRIJF.filter(k=>k!=="soort");
      const onbekend=Object.keys(velden).filter(k=>!mag.includes(k));
      if(onbekend.length)return fout("Onbekend of niet te wijzigen veld: "+onbekend.join(", ")+". Toegestaan: "+mag.join(", ")+". Van soort wisselen kan niet: zet met vervangBlokken een nieuw blok neer.");
      const{data:b0,error}=await db.from("blocks").select("id,workout_id").eq("id",blokId).maybeSingle();
      if(error)return fout(error.message);
      if(!b0)return fout("Geen blok gevonden met dit id, of je mag het niet zien.");
      const c=await conceptOphalen(b0.workout_id,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      const oud=c.w.blocks.find(b=>b.id===blokId);
      if(oud.source_blog_workout_id)return fout(isBord(oud.source_blog_workout_id)
        ?"Dit blok hoort bij een leaderboard-workout. De tekst pas je alleen aan als geschaalde versie voor deze atleet, met ClaudeApi.schaalBlok. Verplaatsen of weghalen kan met vervangBlokken."
        :"Dit blok is de YP Showdown. De tekst verander je nooit met wijzigBlok. Een geschaalde versie voor deze atleet maak je met ClaudeApi.schaalBlok; verplaatsen of weghalen kan met vervangBlokken.");
      const huidig=blokUit(oud);
      const samen={};BLOK_SCHRIJF.forEach(k=>{if(!leeg(huidig[k]))samen[k]=huidig[k];});
      Object.keys(velden).forEach(k=>{if(k!=="videos")samen[k]=velden[k];});
      if(velden.videos!==undefined)samen.videos=velden.videos;
      const fouten=[];
      const n=blokLees(samen,"blok "+(oud.label||""),fouten);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      n.id=blokId;
      const zb=c.w.status!=="draft";
      if(zb&&scoreAnders(n,oud)&&(await logBlokken(c.w.id)).has(blokId))return fout("Er is niets gewijzigd. Op dit blok zijn al resultaten gelogd; het scoretype of de tijdslimiet veranderen zou die score onleesbaar maken. Laat dit aan de coach.");
      const gewijzigd=blokTekst(n)!==blokTekst(normUitRij(oud));
      const wilAuto=n.videos==="auto"||n.videos==="aanvullen"||(n.videos===undefined&&gewijzigd);
      const indexOk=(Array.isArray(n.videos)||wilAuto)?await videosKlaar():false;
      n.media=mediaKies(n.videos,blokBron(n),oud.media||null,gewijzigd,"blok "+(oud.label||""),fouten,indexOk);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const normen=letters(c.w.blocks.map(b=>b.id===blokId?n:normUitRij(b)));
      await blokkenSync(c.w,normen);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      const meldingen=[];
      if(!indexOk&&wilAuto)meldingen.push("De oefeningenbibliotheek was niet geladen: de demo-video's zijn niet opnieuw gekozen.");
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:"blok "+(n.label||"")+" van \""+(c.w.title||"")+"\" op "+c.w.workout_date,status:statusNaam(c.w),let_op:meldingen.concat(zb?[ZICHTBAAR]:[]),workout:terug[0]});
    }),

    vervangBlokken:veilig(async(workoutId,blokken,opties)=>{
      opties=isObject(opties)?opties:{};
      const c=await conceptOphalen(workoutId,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      if(!Array.isArray(blokken))return fout("Geef de volledige lijst blokken zoals hij moet worden. Een blok met id wordt bijgewerkt, zonder id is nieuw, wat ontbreekt gaat weg.");
      const fouten=[];
      let normen=blokkenLees(blokken,"\""+(c.w.title||"workout")+"\"",fouten);
      const oud={};c.w.blocks.forEach(b=>{oud[b.id]=b;});
      // Een Showdown-blok dat al in dit concept staat mag mee in de lijst (om het te laten
      // staan of te verplaatsen); er verandert dan niets aan het blok zelf.
      normen=normen.map((n,i)=>{
        if(!n.showdown)return n;
        if(!n.id||!oud[n.id]||!oud[n.id].source_blog_workout_id){fouten.push("blok "+(i+1)+": een blok uit de YP Showdown schrijf je niet zelf. Laat het weg en gebruik daarna ClaudeApi.plaatsShowdown.");return n;}
        return normUitRij(oud[n.id]);
      });
      const gezien=new Set();
      normen.forEach((n,i)=>{
        if(!n.id)return;
        const waar="blok "+(i+1);
        if(!oud[n.id]){fouten.push(waar+": id "+n.id+" hoort niet bij deze workout. Laat het id weg voor een nieuw blok.");return;}
        if(gezien.has(n.id))fouten.push(waar+": hetzelfde id staat twee keer in de lijst.");
        gezien.add(n.id);
        if(oud[n.id].source_blog_workout_id&&n.raak){fouten.push(waar+": dit blok is de YP Showdown. De tekst verander je nooit. Geef het blok terug zoals week() het gaf, met uit_weekworkout erbij.");return;}
        if(oud[n.id].kind!==n.kind)fouten.push(waar+": van soort wisselen kan niet met hetzelfde id. Laat het id weg, dan wordt het een nieuw blok.");
      });
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const gaatWeg=c.w.blocks.filter(b=>!gezien.has(b.id));
      const zb=c.w.status!=="draft";
      const gelogd=(gaatWeg.length||zb)?await logBlokken(c.w.id):new Set();
      if(gaatWeg.some(b=>gelogd.has(b.id)))return fout("Er is niets gewijzigd. Op een blok dat je weghaalt zijn al resultaten gelogd; weghalen zou die wissen. Laat dit aan de coach.");
      const stFout=normen.find(n=>n.id&&n.raak&&gelogd.has(n.id)&&scoreAnders(n,oud[n.id]));
      if(stFout)return fout("Er is niets gewijzigd. Op blok \""+(stFout.exercise||"")+"\" zijn al resultaten gelogd; het scoretype of de tijdslimiet veranderen kan dan niet. Laat dit aan de coach.");
      const indexOk=await videosKlaar();
      letters(normen);
      normen.forEach((n,i)=>{
        const o=n.id?oud[n.id]:null;
        const gewijzigd=!o||blokTekst(n)!==blokTekst(normUitRij(o));
        n.media=mediaKies(n.videos,blokBron(n),o?(o.media||null):undefined,gewijzigd,"blok "+(i+1),fouten,indexOk);
      });
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const uit=await blokkenSync(c.w,normen);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:"blokken van \""+(c.w.title||"")+"\" op "+c.w.workout_date,
        nieuw:uit.nieuw||null,verwijderd:uit.verwijderd||null,status:statusNaam(c.w),
        let_op:(indexOk?[]:["De oefeningenbibliotheek was niet geladen: er zijn geen demo-video's gekozen voor nieuwe of gewijzigde blokken."]).concat(zb?[ZICHTBAAR]:[]),workout:terug[0]});
    }),

    wijzigConcept:veilig(async(workoutId,velden,opties)=>{
      opties=isObject(opties)?opties:{};
      const c=await conceptOphalen(workoutId,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      if(!isObject(velden)||!Object.keys(velden).length)return fout("Geef de velden die veranderen: datum, titel, notitie_coach, warming_up, cooldown, videos_warming_up, videos_cooldown.");
      const mag=["datum","titel","notitie_coach","warming_up","cooldown","videos","videos_warming_up","videos_cooldown"];
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
      const vkW=videosLees(velden.videos_warming_up,waar+", videos_warming_up",fouten,true),vkC=videosLees(velden.videos_cooldown,waar+", videos_cooldown",fouten,true);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      // Eigen lijst per vak gaat voor op videos (dat voor allebei geldt).
      const wuK=vkW===undefined?vk:vkW,cdK=vkC===undefined?vk:vkC;
      const wuAnders="warmup" in upd&&(upd.warmup||"")!==(c.w.warmup||""),cdAnders="cooldown" in upd&&(upd.cooldown||"")!==(c.w.cooldown||"");
      if(wuAnders||cdAnders||wuK!==undefined||cdK!==undefined){
        const zonder=k=>k==="geen"||k==="houden";
        const indexOk=(zonder(wuK)&&zonder(cdK))?false:await videosKlaar();
        const wu="warmup" in upd?upd.warmup:c.w.warmup,cd="cooldown" in upd?upd.cooldown:c.w.cooldown;
        if(Array.isArray(wuK)&&wuK.length&&!wu)fouten.push(waar+": videos_warming_up kan alleen als er een warming_up-tekst staat.");
        if(Array.isArray(cdK)&&cdK.length&&!cd)fouten.push(waar+": videos_cooldown kan alleen als er een cooldown-tekst staat.");
        if(wuAnders||wuK!==undefined)upd.warmup_media=wu?mediaKies(wuK,wu,c.w.warmup_media||null,wuAnders,waar+", videos_warming_up",fouten,indexOk):null;
        if(cdAnders||cdK!==undefined)upd.cooldown_media=cd?mediaKies(cdK,cd,c.w.cooldown_media||null,cdAnders,waar+", videos_cooldown",fouten,indexOk):null;
        if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      }
      // Alleen bijwerken zolang de status nog is wat we lazen (de coach kan intussen hebben goedgekeurd).
      const{data,error}=await db.from("workouts").update(upd).eq("id",c.w.id).eq("status",c.w.status).select("id");
      if(error)return fout(error.message);
      if(!(data||[]).length)return fout("Er is niets gewijzigd: de status van deze workout is intussen veranderd. Lees hem opnieuw met ClaudeApi.week.");
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},gewijzigd:Object.keys(velden).join(", "),status:statusNaam(c.w),let_op:c.w.status!=="draft"?[ZICHTBAAR]:null,workout:terug[0]});
    }),

    verwijderConcept:veilig(async(workoutId)=>{
      const c=await conceptOphalen(workoutId);if(c.fout)return fout(c.fout);
      if(await heeftLogs(c.w.id))return fout("Er is niets verwijderd. Op deze workout zijn al resultaten gelogd. Laat dit aan de coach.");
      const{data,error}=await db.from("workouts").delete().eq("id",c.w.id).eq("status","draft").select("id");
      if(error)return fout(error.message);
      if(!(data||[]).length)return fout("Er is niets verwijderd: deze workout is intussen geen concept meer.");
      ververs(c.p.id);
      return {ok:true,atleet:{id:c.p.id,naam:naam(c.p)},verwijderd:{datum:c.w.workout_date,dag:dagVan(c.w.workout_date),titel:c.w.title||"",blokken:c.w.blocks.length}};
    }),

    // ---------- Template week en Template dag ----------
    templates:veilig(async(zoek)=>{
      const{data,error}=await db.from("program_templates").select("id,name,type,description").eq("company_id",ME.profile.company_id).order("name");
      if(error)return fout(error.message);
      const z=String(zoek||"").trim().toLowerCase();
      const lijst=(data||[]).filter(t=>!z||(t.name||"").toLowerCase().includes(z));
      const tel={};
      for(const deel of stukken(lijst.map(t=>t.id),10)){
        const rijen=await haalAlles(()=>db.from("program_workouts").select("id,program_id,week,day").in("program_id",deel).order("id"));
        rijen.forEach(r=>{const t=tel[r.program_id]=tel[r.program_id]||{weken:0,dagen:new Set()};t.weken=Math.max(t.weken,r.week||0);t.dagen.add(r.week+"-"+r.day);});
      }
      return {ok:true,aantal:lijst.length,
        templates:lijst.map(t=>schoon({id:t.id,naam:t.name,soort:tplSoort(t),omschrijving:t.description,weken:(tel[t.id]||{}).weken||null,dagen:tel[t.id]?tel[t.id].dagen.size:null}))};
    }),

    templateWeek:veilig(async(templateId,week,weken)=>{
      const t=await templateOphalen(templateId);if(t.fout)return fout(t.fout);
      const kop={id:t.t.id,naam:t.t.name,soort:tplSoort(t.t)};
      if(leeg(week)){
        // Overzicht: per week en dag alleen de titel en de namen van de blokken.
        const rijen=await haalAlles(()=>db.from("program_workouts").select("id,week,day,title,sort, program_blocks(label,exercise,sort)").eq("program_id",t.t.id).order("week").order("day").order("sort").order("id"));
        const perWeek={};
        rijen.forEach(pw=>{(perWeek[pw.week]=perWeek[pw.week]||[]).push(schoon({dag:pw.day,dagnaam:TPLDAG[(pw.day||1)-1],titel:pw.title,
          blokken:tplBlokRijen(pw).map(b=>((b.label?b.label+" ":"")+(b.exercise||"")).trim())}));});
        return {ok:true,template:kop,overzicht:true,uitleg:"Dit is alleen het overzicht. Vraag de volledige tekst op met ClaudeApi.templateWeek(id, week).",
          weken:Object.keys(perWeek).map(Number).sort((x,y)=>x-y).map(w=>({week:w,dagen:perWeek[w]}))};
      }
      week=Number(week);weken=leeg(weken)?1:Number(weken);
      if(!Number.isInteger(week)||week<1)return fout("week moet een heel getal vanaf 1 zijn.");
      if(!Number.isInteger(weken)||weken<1||weken>4)return fout("weken moet een heel getal van 1 t/m 4 zijn.");
      const rijen=await haalAlles(()=>db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",t.t.id).gte("week",week).lte("week",week+weken-1).order("week").order("day").order("sort").order("id"));
      const uit=[];
      for(let w=week;w<week+weken;w++){
        const dagen={};
        rijen.filter(pw=>pw.week===w).forEach(pw=>{(dagen[pw.day]=dagen[pw.day]||[]).push(tplWorkoutUit(pw));});
        uit.push({week:w,dagen:Object.keys(dagen).map(Number).sort((x,y)=>x-y).map(d=>({dag:d,dagnaam:TPLDAG[d-1],workouts:dagen[d]}))});
      }
      return {ok:true,template:kop,let_op:"Dag 1 is maandag. Een template is geen programma van een atleet: zet hem bij een atleet met ClaudeApi.kopieerTemplate.",weken:uit};
    }),

    maakTemplate:veilig(async(naamT,opties)=>{
      opties=isObject(opties)?opties:{};
      const fouten=[];
      const name=tekstVeld({naam:naamT},"naam",120,"template",fouten);
      const description=tekstVeld(opties,"omschrijving",2000,"template",fouten);
      const soort=leeg(opties.soort)?"week":opties.soort;
      if(soort!=="week"&&soort!=="dag")fouten.push("template: soort moet week of dag zijn.");
      if(!name)fouten.push("template: naam ontbreekt.");
      if(fouten.length)return {ok:false,fout:"Er is niets gemaakt. Los dit eerst op.",fouten};
      const{data:al,error:e1}=await db.from("program_templates").select("id,name").eq("company_id",ME.profile.company_id);
      if(e1)return fout(e1.message);
      const zelfde=(al||[]).filter(t=>(t.name||"").trim().toLowerCase()===name.toLowerCase());
      if(zelfde.length&&opties.toch!==true)return fout("Er is niets gemaakt. Er bestaat al een template met de naam \""+name+"\" (id "+zelfde[0].id+"). Schrijf daarin met ClaudeApi.schrijfTemplateWeek, of geef {toch:true} mee als je er bewust een tweede naast wilt.");
      const{data,error}=await db.from("program_templates").insert({company_id:ME.profile.company_id,created_by:ME.user.id,name,description,type:soort==="dag"?"dag":"standard",weeks:1}).select("id,name,type,description").single();
      if(error)return fout(rlsFout(error.message));
      tplVerversen();
      return {ok:true,template:schoon({id:data.id,naam:data.name,soort:tplSoort(data),omschrijving:data.description}),
        uitleg:"De template is leeg. Vul hem met ClaudeApi.schrijfTemplateWeek(id, 1, dagen)."};
    }),

    wijzigTemplate:veilig(async(templateId,velden)=>{
      const t=await templateSchrijfbaar(templateId);if(t.fout)return fout(t.fout);
      const mag=["naam","omschrijving"];
      if(!isObject(velden)||!Object.keys(velden).length)return fout("Geef de velden die veranderen: naam, omschrijving.");
      const onbekend=Object.keys(velden).filter(k=>!mag.includes(k));
      if(onbekend.length)return fout("Onbekend veld: "+onbekend.join(", ")+". Toegestaan: "+mag.join(", ")+". De dagen wijzig je met ClaudeApi.schrijfTemplateWeek.");
      const fouten=[],upd={};
      if("naam" in velden){const n=tekstVeld(velden,"naam",120,"template",fouten);if(!n)fouten.push("template: naam mag niet leeg zijn.");else upd.name=n;}
      if("omschrijving" in velden)upd.description=tekstVeld(velden,"omschrijving",2000,"template",fouten);
      if(fouten.length)return {ok:false,fout:"Er is niets gewijzigd. Los dit eerst op.",fouten};
      const{data,error}=await db.from("program_templates").update(upd).eq("id",t.t.id).select("id,name,type,description");
      if(error)return fout(rlsFout(error.message));
      if(!(data||[]).length)return fout(TPL_GEEN_RECHT);
      tplVerversen();
      return {ok:true,gewijzigd:Object.keys(velden).join(", "),template:schoon({id:data[0].id,naam:data[0].name,soort:tplSoort(data[0]),omschrijving:data[0].description})};
    }),

    schrijfTemplateWeek:veilig(async(templateId,week,dagen,opties)=>{
      opties=isObject(opties)?opties:{};
      const t=await templateSchrijfbaar(templateId);if(t.fout)return fout(t.fout);
      const kop={id:t.t.id,naam:t.t.name,soort:tplSoort(t.t)};
      const weken=Math.max(1,t.t.weeks||1);
      week=Number(week);
      if(!Number.isInteger(week)||week<1)return fout("week moet een heel getal vanaf 1 zijn.");
      if(tplSoort(t.t)==="dag"&&week!==1)return fout("Een Template dag heeft alleen week 1.");
      if(week>weken+1)return fout("Deze template heeft "+weken+(weken===1?" week":" weken")+". Je kunt een bestaande week schrijven of week "+(weken+1)+" erbij zetten, geen week overslaan.");
      if(isObject(dagen))dagen=[dagen];
      if(!Array.isArray(dagen)||!dagen.length)return fout("Geef een lijst dagen in de vorm [{dag:1, workouts:[...]}]. Zie template_voorbeeld in ClaudeApi.hulp().");
      const fouten=[],gelezen=[],gezien=new Set();
      dagen.forEach((d,i)=>{
        if(!isObject(d)){fouten.push("dag "+(i+1)+": een dag moet een object zijn: {dag:1, workouts:[...]}.");return;}
        const dag=Number(d.dag),waar=Number.isInteger(dag)&&dag>=1&&dag<=7?TPLDAG[dag-1]+" (dag "+dag+")":"dag "+(i+1);
        const onbekend=Object.keys(d).filter(k=>!["dag","dagnaam","workouts"].includes(k));
        if(onbekend.length)fouten.push(waar+": onbekend veld "+onbekend.join(", ")+". Een dag heeft dag en workouts; titel en blokken horen in een workout.");
        if(!Number.isInteger(dag)||dag<1||dag>7){fouten.push(waar+": dag moet 1 t/m 7 zijn (1 = maandag).");return;}
        if(gezien.has(dag)){fouten.push(waar+": deze dag staat twee keer in de lijst. Zet meer sessies op één dag in dezelfde workouts-lijst.");return;}
        gezien.add(dag);
        let ws=d.workouts;
        if(leeg(ws))ws=[];
        if(isObject(ws))ws=[ws];
        if(!Array.isArray(ws)){fouten.push(waar+": workouts moet een lijst zijn.");return;}
        if(ws.length>MAX_TPL_PER_DAG)fouten.push(waar+": maximaal "+MAX_TPL_PER_DAG+" workouts op één dag.");
        gelezen.push({dag,waar,normen:ws.map((w,j)=>templateWorkoutLees(w,waar+(ws.length>1?", workout "+(j+1):""),fouten)).filter(Boolean)});
      });
      if(gelezen.reduce((n,g)=>n+g.normen.length,0)>MAX_TPL_WORKOUTS)fouten.push("Maximaal "+MAX_TPL_WORKOUTS+" workouts per keer.");
      if(fouten.length)return {ok:false,fout:"Er is niets geschreven. Los dit eerst op.",fouten};
      // Wat staat er al in deze week?
      const bestaand=await haalAlles(()=>db.from("program_workouts").select("id,day,title,sort, program_blocks(id,source_blog_workout_id)").eq("program_id",t.t.id).eq("week",week).order("id"));
      const opDag=d=>bestaand.filter(b=>b.day===d);
      const bezet=gelezen.filter(g=>opDag(g.dag).length);
      if(bezet.length&&opties.overschrijf!==true)return fout("Er is niets geschreven. In week "+week+" van \""+t.t.name+"\" staat al iets op "+bezet.map(g=>TPLDAG[g.dag-1]+" ("+opDag(g.dag).map(b=>"\""+(b.title||"zonder titel")+"\"").join(", ")+")").join(", ")+". Lees de week met ClaudeApi.templateWeek. Wil je die dagen vervangen, geef dan {overschrijf:true} mee: wat er op die dagen staat gaat dan weg.");
      const bord=bezet.filter(g=>opDag(g.dag).some(b=>(b.program_blocks||[]).some(x=>x.source_blog_workout_id)));
      if(bord.length)return fout("Er is niets geschreven. Op "+bord.map(g=>TPLDAG[g.dag-1]).join(", ")+" staat een YP Showdown of leaderboard-workout in de template. Die dag vervang je niet via de koppeling; laat hem aan de coach.");
      if(!gelezen.some(g=>g.normen.length)&&!bezet.length)return fout("Er valt niets te schrijven: de dagen zijn leeg en er stond nog niets.");
      const indexOk=await videosKlaar();
      const rijen=[];
      gelezen.forEach(g=>g.normen.forEach((w,j)=>{
        const waar=g.waar+(g.normen.length>1?", workout "+(j+1):"");
        letters(w.blokken);
        w.blokken.forEach((n,k)=>{n.media=mediaKies(n.videos,blokBron(n),undefined,true,waar+", blok "+(k+1),fouten,indexOk);});
        rijen.push({workout:{program_id:t.t.id,company_id:ME.profile.company_id,week,day:g.dag,title:w.title,coach_notes:w.coach_notes,warmup:w.warmup,cooldown:w.cooldown,
            warmup_media:w.warmup?mediaKies(w.videosWu===undefined?w.videos:w.videosWu,w.warmup,undefined,true,waar+", videos_warming_up",fouten,indexOk):null,
            cooldown_media:w.cooldown?mediaKies(w.videosCd===undefined?w.videos:w.videosCd,w.cooldown,undefined,true,waar+", videos_cooldown",fouten,indexOk):null,sort:j+1},
          blokken:w.blokken.map(n=>blokRij(n,null))});
      }));
      if(fouten.length)return {ok:false,fout:"Er is niets geschreven. Los dit eerst op.",fouten};
      // Eerst het nieuwe neerzetten, dan pas het oude weghalen: gaat er iets mis, dan staat het oude er nog.
      const nieuw=[];
      const opruimen=async()=>{if(nieuw.length)try{await db.from("program_workouts").delete().in("id",nieuw);}catch(e){}};
      try{
        for(const r of rijen){
          const{data,error}=await db.from("program_workouts").insert(r.workout).select("id").single();
          if(error)throw new Error(rlsFout(error.message));
          nieuw.push(data.id);
          for(const deel of stukken(r.blokken.map(b=>Object.assign({program_workout_id:data.id,company_id:ME.profile.company_id},b)),200)){
            const{error:be}=await db.from("program_blocks").insert(deel);
            if(be)throw new Error(rlsFout(be.message));
          }
        }
      }catch(e){
        await opruimen();
        return fout("Er is niets gewijzigd: "+(e&&e.message||"onbekende fout")+".");
      }
      const let_op=["Dit is een template: een atleet ziet er niets van tot hij wordt toegewezen of je ClaudeApi.kopieerTemplate gebruikt."];
      const oud=bezet.reduce((u,g)=>u.concat(opDag(g.dag).map(b=>b.id)),[]);
      if(oud.length){
        // Lukt het weghalen van het oude niet, dan halen we het nieuwe weer weg: liever niets gewijzigd dan dubbel.
        const{data:weg,error}=await db.from("program_workouts").delete().in("id",oud).select("id");
        if(error||(weg||[]).length!==oud.length){
          if(!(weg||[]).length){await opruimen();return fout("Er is niets gewijzigd: de oude dagen konden niet worden weggehaald"+(error?" ("+rlsFout(error.message)+")":"")+".");}
          let_op.push("Niet alle oude workouts op deze dagen konden worden weggehaald. Lees de week na met ClaudeApi.templateWeek en meld het aan de coach.");
        }
      }
      // Vanaf hier staat het nieuwe er. Wat nu nog misgaat is een melding, geen reden om iets terug te draaien.
      if(week>weken){const{error}=await db.from("program_templates").update({weeks:week}).eq("id",t.t.id);if(error)let_op.push("Het aantal weken van de template kon niet worden bijgewerkt ("+rlsFout(error.message)+"). Meld dat aan de coach.");}
      let terug=null;
      try{terug=await templateWeekTerug(t.t.id,week);}catch(e){let_op.push("De week is geschreven, maar teruglezen lukte niet. Lees hem met ClaudeApi.templateWeek.");}
      tplVerversen();
      if(!indexOk)let_op.push("De oefeningenbibliotheek was niet geladen: er zijn geen demo-video's gekozen.");
      if(t.t.sync_changes&&t.toegewezen)let_op.push("Bij deze template staat Doorzetten aan en hij is aan "+t.toegewezen+(t.toegewezen===1?" klant":" klanten")+" toegewezen. Deze wijziging is NIET doorgezet naar hun kalender. Meld dat aan de coach; hij zet door in de Template builder.");
      return schoon({ok:true,template:kop,week,geschreven:rijen.length,vervangen:oud.length||null,let_op,dagen:terug});
    }),

    verwijderTemplate:veilig(async(templateId,opties)=>{
      opties=isObject(opties)?opties:{};
      const t=await templateSchrijfbaar(templateId);if(t.fout)return fout(t.fout);
      if(typeof opties.naam!=="string"||opties.naam.trim()!==(t.t.name||"").trim())return fout("Er is niets verwijderd. Geef ter controle de exacte naam van de template mee: {naam:\"...\"}. Die staat in ClaudeApi.templates.");
      if(t.toegewezen)return fout("Er is niets verwijderd. Deze template is aan "+t.toegewezen+(t.toegewezen===1?" klant":" klanten")+" toegewezen. Verwijderen kan alleen de coach zelf, in de app.");
      const rijen=await haalAlles(()=>db.from("program_workouts").select("id,week,day, program_blocks(id,source_blog_workout_id)").eq("program_id",t.t.id).order("id"));
      const{data,error}=await db.from("program_templates").delete().eq("id",t.t.id).select("id");
      if(error)return fout(rlsFout(error.message));
      if(!(data||[]).length)return fout(TPL_GEEN_RECHT);
      tplVerversen();
      return {ok:true,verwijderd:{naam:t.t.name,soort:tplSoort(t.t),weken:rijen.reduce((m,r)=>Math.max(m,r.week||0),0),workouts:rijen.length,blokken:rijen.reduce((n,r)=>n+(r.program_blocks||[]).length,0)}};
    }),

    kopieerTemplate:veilig(async(atleetId,templateId,week,datum,opties)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      const t=await templateOphalen(templateId);if(t.fout)return fout(t.fout);
      opties=isObject(opties)?opties:{};
      week=leeg(week)?1:Number(week);
      if(!Number.isInteger(week)||week<1)return fout("week moet een heel getal vanaf 1 zijn.");
      if(!isDatum(datum))return fout("datum moet JJJJ-MM-DD zijn: een dag in de doelweek, of bij {dag:n} de dag zelf.");
      const eenDag=!leeg(opties.dag);
      const dag=eenDag?Number(opties.dag):null;
      if(eenDag&&(!Number.isInteger(dag)||dag<1||dag>7))return fout("opties.dag moet 1 t/m 7 zijn (1 = maandag in de template).");
      const vf=kopieVideosFout(opties);if(vf)return fout(vf);
      const maandag=maandagVan(datum),fouten=[];
      datumMag(eenDag?datum:plus(maandag,6),opties,eenDag?"datum":"doelweek",fouten);
      if(fouten.length)return fout(fouten.join(" "));
      let bron=await haalAlles(()=>db.from("program_workouts").select("*, program_blocks(*)").eq("program_id",t.t.id).eq("week",week).order("day").order("sort").order("id"));
      if(eenDag)bron=bron.filter(pw=>pw.day===dag);
      if(!bron.length)return fout("In \""+t.t.name+"\" staat niets in week "+week+(eenDag?", dag "+dag:"")+". Kijk met ClaudeApi.templateWeek(id) wat er is.");
      const van=eenDag?datum:maandag,tot=eenDag?datum:plus(maandag,6);
      const{data:doel,error:de}=await db.from("workouts").select("id,workout_date,title,status").eq("client_id",a.p.id).gte("workout_date",van).lte("workout_date",tot);
      if(de)return fout(de.message);
      const concepten=(doel||[]).filter(w=>w.status==="draft"),zichtbaar=(doel||[]).filter(w=>w.status!=="draft");
      if(concepten.length&&opties.toch!==true)return fout("Er is niets gekopieerd. "+(eenDag?"Op "+datum:"In de week van "+maandag)+" staan al "+concepten.length+" concepten. Kijk met ClaudeApi.week of het al gelukt was. Wil je er bewust een kopie naast, geef dan {toch:true} mee.");
      const meldingen=[];
      if(zichtbaar.length)meldingen.push((eenDag?"Op "+datum:"In de week van "+maandag)+" staan al "+zichtbaar.length+" zichtbare workouts. De kopie komt ernaast.");
      const rijen=bron.map(pw=>({workout:{workout_date:eenDag?datum:plus(maandag,(pw.day||1)-1),title:pw.title||null,coach_notes:pw.coach_notes||null,warmup:pw.warmup||null,cooldown:pw.cooldown||null,
          warmup_media:pw.warmup_media||null,cooldown_media:pw.cooldown_media||null},blokken:tplBlokRijen(pw).map(b=>Object.assign(kopieBlok(b),{source_blog_workout_id:b.source_blog_workout_id||null}))}));
      await kopieVideos(rijen,opties.videos,meldingen);
      const ids=await conceptenNeerzetten(a.p,rijen);
      const terug=await leesTerug(ids);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},template:{id:t.t.id,naam:t.t.name},week,dag,gekopieerd:ids.length,status:"concept",uitleg:GOEDKEUREN,
        let_op:meldingen.concat(["Dit is een losse kopie: latere wijzigingen in de template komen niet vanzelf bij deze atleet."]),workouts:terug});
    }),

    // ---------- YP Showdown plaatsen ----------
    plaatsShowdown:veilig(async(atleetId,datum,opties)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      opties=isObject(opties)?opties:{};
      if(!isDatum(datum))return fout("datum moet JJJJ-MM-DD zijn: de dag waarop de Showdown bij de atleet komt.");
      const fouten=[];datumMag(datum,opties,"datum",fouten);
      if(fouten.length)return fout(fouten.join(" "));
      const maandag=maandagVan(datum);
      const lijst=await showdownVanWeek(maandag);
      if(!lijst.length)return fout("De YP Showdown voor de week van "+maandag+" staat nog niet in de app. Plaats hem zodra hij er is.");
      if(lijst.length>1)return fout("In de week van "+maandag+" staan "+lijst.length+" weekworkouts ("+lijst.map(w=>w.workout_date+" \""+(w.title||"")+"\"").join(", ")+"). Laat de coach de juiste zelf plaatsen.");
      const sd=lijst[0];
      // Staat hij deze week al bij de atleet?
      const{data:week,error}=await db.from("workouts").select("id,workout_date,title,status,source_blog_workout_id, blocks(id,source_blog_workout_id)").eq("client_id",a.p.id).gte("workout_date",maandag).lte("workout_date",plus(maandag,6));
      if(error)return fout(error.message);
      const al=(week||[]).filter(w=>w.source_blog_workout_id===sd.id||(w.blocks||[]).some(b=>b.source_blog_workout_id===sd.id));
      if(al.length&&opties.toch!==true)return fout("Er is niets geplaatst. Deze Showdown staat al bij "+naam(a.p)+" op "+al.map(w=>w.workout_date+" ("+(w.status==="draft"?"concept":"zichtbaar")+")").join(", ")+".");
      const rijen=showdownRijen(sd);
      let wid;
      if(!leeg(opties.workoutId)){
        // Onderaan een bestaand concept van deze atleet in dezelfde week.
        const c=await conceptOphalen(opties.workoutId);if(c.fout)return fout(c.fout);
        if(c.p.id!==a.p.id)return fout("Dit concept is van een andere atleet.");
        if(maandagVan(c.w.workout_date)!==maandag)return fout("Dit concept staat in een andere week dan de datum.");
        const g=groepen(c.w.blocks),max=c.w.blocks.reduce((m,b)=>Math.max(m,b.sort||0),0);
        const nieuw=rijen.map((r,i)=>Object.assign({workout_id:c.w.id,label:String.fromCharCode(65+Math.min(g+i,25)),sort:max+1+i},r));
        const{error:be}=await db.from("blocks").insert(nieuw);
        if(be)return fout(be.message);
        wid=c.w.id;
      }else{
        const ids=await conceptenNeerzetten(a.p,[{workout:{workout_date:datum,title:sd.title||"YP Showdown"},blokken:letters(rijen)}]);
        wid=ids[0];
      }
      const terug=await leesTerug([wid]);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},geplaatst:"\""+(sd.title||"YP Showdown")+"\" (weekworkout van "+sd.workout_date+")",status:"concept",uitleg:GOEDKEUREN,
        let_op:["De tekst komt letterlijk uit de weekworkout en is niet te wijzigen."],workout:terug[0]});
    }),

    // ---------- Leaderboard-workouts (1-op-1): lezen, plaatsen, schalen, aanzetten ----------
    leaderboardWorkouts:veilig(async(zoek,opties)=>{
      opties=leeg(opties)?{}:opties;
      if(!isObject(opties))return fout("opties moet een object zijn, bijvoorbeeld {tekst:false}.");
      if(!leeg(zoek)&&typeof zoek!=="string")return fout("zoek moet tekst zijn, bijvoorbeeld \"fran\". Opties geef je als tweede argument.");
      const haal=metAantal=>db.from("workouts").select("id,title,created_at,audience, blocks(*)"+(metAantal?", results(count)":"")).eq("company_id",ME.profile.company_id).eq("audience","bord").order("created_at",{ascending:false}).limit(300);
      let r=await haal(true);if(r.error)r=await haal(false);
      if(r.error)return fout(r.error.message);
      const z=String(zoek||"").trim().toLowerCase();
      const rijen=(r.data||[]).map(w=>{
        const b=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort)[0]||{},n=w.results&&w.results[0]?w.results[0].count:null;
        const tekst=(b.kind==="conditioning"?b.notes:[b.prescription,b.notes].filter(Boolean).join("\n"))||"";
        return {zoek:(String(w.title||"")+"\n"+tekst).toLowerCase(),
          uit:schoon({id:w.id,naam:w.title,scoretype:b.score_type,tijdslimiet_sec:b.score_type==="time"?b.timecap_seconds:null,aantal_scores:n==null?null:Number(n),
            tekst:opties.tekst===false?null:tekst,demo_videos:titels(b.media),aangemaakt:tijd(w.created_at)})};
      });
      const hits=rijen.filter(x=>!z||x.zoek.includes(z));
      return schoon({ok:true,filter:z?"naam of tekst bevat \""+z+"\"":"geen",aantal:hits.length,totaal:rijen.length,
        uitleg:"Een leaderboard-workout is een 1-op-1 workout met een gedeeld leaderboard. Alleen de atleten bij wie hij goedgekeurd in de kalender staat zien het bord, en de coaches. Plaatsen doe je met ClaudeApi.plaatsLeaderboardWorkout.",
        leaderboard_workouts:hits.map(x=>x.uit)});
    }),

    plaatsLeaderboardWorkout:veilig(async(atleetId,leaderboardWorkoutId,datum,opties)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      opties=isObject(opties)?opties:{};
      if(!isUuid(leaderboardWorkoutId))return fout("Geef het id van de leaderboard-workout (uit ClaudeApi.leaderboardWorkouts, of leaderboard_workout bij een blok in ClaudeApi.week).");
      if(!isDatum(datum))return fout("datum moet JJJJ-MM-DD zijn: de dag waarop de workout bij de atleet komt.");
      const fouten=[];datumMag(datum,opties,"datum",fouten);
      if(fouten.length)return fout(fouten.join(" "));
      const{data:bron,error:be0}=await db.from("workouts").select("*, blocks(*)").eq("id",leaderboardWorkoutId).eq("audience","bord").maybeSingle();
      if(be0)return fout(be0.message);
      if(!bron||!(bron.blocks||[]).length)return fout("Geen leaderboard-workout gevonden met dit id. Kijk in ClaudeApi.leaderboardWorkouts.");
      const maandag=maandagVan(datum);
      const{data:week,error}=await db.from("workouts").select("id,workout_date,title,status,source_blog_workout_id, blocks(id,source_blog_workout_id)").eq("client_id",a.p.id).gte("workout_date",maandag).lte("workout_date",plus(maandag,6));
      if(error)return fout(error.message);
      const al=(week||[]).filter(w=>w.source_blog_workout_id===bron.id||(w.blocks||[]).some(b=>b.source_blog_workout_id===bron.id));
      if(al.length&&opties.toch!==true)return fout("Er is niets geplaatst. Deze leaderboard-workout staat die week al bij "+naam(a.p)+" op "+al.map(w=>w.workout_date+" ("+(w.status==="draft"?"concept":"zichtbaar")+")").join(", ")+".");
      const rijen=showdownRijen(bron);
      let wid;
      if(!leeg(opties.workoutId)){
        // Onderaan een bestaand concept van deze atleet in dezelfde week.
        const c=await conceptOphalen(opties.workoutId);if(c.fout)return fout(c.fout);
        if(c.p.id!==a.p.id)return fout("Dit concept is van een andere atleet.");
        if(maandagVan(c.w.workout_date)!==maandag)return fout("Dit concept staat in een andere week dan de datum.");
        const g=groepen(c.w.blocks),max=c.w.blocks.reduce((m,b)=>Math.max(m,b.sort||0),0);
        const nieuw=rijen.map((r,i)=>Object.assign({workout_id:c.w.id,label:String.fromCharCode(65+Math.min(g+i,25)),sort:max+1+i},r));
        const{error:be}=await db.from("blocks").insert(nieuw);
        if(be)return fout(be.message);
        wid=c.w.id;
      }else{
        const ids=await conceptenNeerzetten(a.p,[{workout:{workout_date:datum,title:bron.title||"Leaderboard-workout"},blokken:letters(rijen)}]);
        wid=ids[0];
      }
      const terug=await leesTerug([wid]);
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},geplaatst:"\""+(bron.title||"Leaderboard-workout")+"\" (leaderboard-workout)",status:"concept",uitleg:GOEDKEUREN,
        let_op:["De tekst komt letterlijk uit de leaderboard-workout. Een aangepaste versie voor deze atleet maak je daarna met ClaudeApi.schaalBlok.",
          "Na goedkeuren ziet de atleet het gedeelde leaderboard en staat hij er met zijn score standaard op. Hij kan dat in de app zelf uitzetten."],workout:terug[0]});
    }),

    // Geschaalde versie voor één atleet van een ingevoegde Showdown of leaderboard-workout: alleen
    // het blok van deze atleet krijgt de nieuwe tekst en het vinkje Scaled-versie. De workout zelf
    // (de bron) en de blokken van andere atleten veranderen niet.
    schaalBlok:veilig(async(blokId,tekst,opties)=>{
      opties=isObject(opties)?opties:{};
      if(!isUuid(blokId))return fout("Geef het id van het blok (uit ClaudeApi.week of het antwoord van een schrijf-commando).");
      const terugzetten=opties.terug===true;
      if(!terugzetten&&(typeof tekst!=="string"||!tekst.trim()))return fout("Geef de aangepaste tekst van de workout voor deze atleet, of {terug:true} om de oorspronkelijke tekst terug te zetten.");
      if(typeof tekst==="string"&&tekst.length>MAX_TEKST)return fout("De tekst is te lang (maximaal "+MAX_TEKST+" tekens).");
      const{data:b0,error}=await db.from("blocks").select("id,workout_id").eq("id",blokId).maybeSingle();
      if(error)return fout(error.message);
      if(!b0)return fout("Geen blok gevonden met dit id, of je mag het niet zien.");
      const c=await conceptOphalen(b0.workout_id,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      const oud=c.w.blocks.find(b=>b.id===blokId);
      if(!oud.source_blog_workout_id)return fout("Dit blok hoort niet bij de YP Showdown of een leaderboard-workout. Een gewoon blok pas je aan met wijzigBlok.");
      let nieuw;
      if(terugzetten){
        const{data:bron,error:be}=await db.from("workouts").select("*, blocks(*)").eq("id",oud.source_blog_workout_id).maybeSingle();
        if(be)return fout(be.message);
        if(!bron||!(bron.blocks||[]).length)return fout("De oorspronkelijke workout is niet meer te vinden.");
        const r=showdownRijen(bron)[0];
        nieuw=oud.kind==="conditioning"?{notes:r.kind==="conditioning"?r.notes:r.prescription,scaled_versie:false}:{prescription:r.kind==="conditioning"?r.notes:r.prescription,scaled_versie:false};
      }else nieuw=oud.kind==="conditioning"?{notes:tekst.trim(),scaled_versie:true}:{prescription:tekst.trim(),scaled_versie:true};
      const{error:ue}=await db.from("blocks").update(nieuw).eq("id",blokId);
      if(ue)return fout(ue.message);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},status:statusNaam(c.w),
        let_op:[terugzetten?"De oorspronkelijke tekst staat terug; de atleet staat weer onder zijn eigen keuze Rx of Scaled."
          :"Alleen de versie van deze atleet is aangepast. De workout zelf en wat andere atleten zien veranderen niet. Deze atleet staat op het gedeelde leaderboard onder Scaled.",
          c.w.status!=="draft"?ZICHTBAAR:null].filter(Boolean),workout:terug[0]});
    }),

    // Leaderboard alsnog aanzetten op blokken die al bij atleten in de kalender staan (20 nov 2026):
    // bestaande blokken aan een bestaande leaderboard-workout of aan de YP Showdown hangen. De
    // database-functie bord_koppel_blokken doet het werk; een score die al was ingevuld blijft op
    // het eigen blok staan en komt als kopie op het bord.
    koppelLeaderboard:veilig(async(bronId,blokIds,opties)=>{
      opties=isObject(opties)?opties:{};
      if(!isUuid(bronId))return fout("Geef het id van de leaderboard-workout (leaderboard_workout bij een blok, of uit ClaudeApi.leaderboardWorkouts) of van de YP Showdown (uit ClaudeApi.showdowns).");
      if(!Array.isArray(blokIds)||!blokIds.length||!blokIds.every(isUuid))return fout("Geef een lijst met blok-id's (uit ClaudeApi.week).");
      blokIds=[...new Set(blokIds)];
      if(blokIds.length>200)return fout("Maximaal 200 blokken per keer.");
      const{data:bron,error:be}=await db.from("workouts").select("id,title,audience,blog_program_id,workout_date, blocks(id,score_type,sort)").eq("id",bronId).maybeSingle();
      if(be)return fout(be.message);
      if(!bron||!(bron.audience==="bord"||(bron.audience==="blog"&&!bron.blog_program_id)))return fout("Geen leaderboard-workout of YP Showdown gevonden met dit id.");
      const bb=(bron.blocks||[]).slice().sort((x,y)=>x.sort-y.sort)[0];
      if(!bb)return fout("Deze leaderboard-workout heeft geen blok.");
      let rijen=[];const wo={};
      for(const s of stukken(blokIds,50)){
        const{data,error}=await db.from("blocks").select("id,exercise,score_type,workout_id").in("id",s);
        if(error)return fout(error.message);
        rijen=rijen.concat(data||[]);
      }
      for(const s of stukken([...new Set(rijen.map(b=>b.workout_id))],50)){
        const{data,error}=await db.from("workouts").select("id,client_id,workout_date,status,audience").in("id",s);
        if(error)return fout(error.message);
        (data||[]).forEach(w=>{wo[w.id]=w;});
      }
      rijen=rijen.filter(b=>wo[b.workout_id]);rijen.forEach(b=>{b.workouts=wo[b.workout_id];});
      const cids=[...new Set(rijen.map(b=>b.workouts.client_id).filter(Boolean))],namen={};
      for(const s of stukken(cids,50)){
        const{data}=await db.from("profiles").select("id,first_name,last_name").in("id",s);
        (data||[]).forEach(p=>{namen[p.id]=naam(p);});
      }
      const wie=id=>{const b=rijen.find(x=>x.id===id);return b?{blok:id,atleet:namen[b.workouts.client_id]||null,datum:b.workouts.workout_date}:{blok:id};};
      const anders=rijen.filter(b=>(b.score_type||"text")!==(bb.score_type||"text"));
      if(anders.length)return Object.assign(fout("Het leaderboard heeft scoretype "+(bb.score_type||"text")+", maar "+anders.length+" van deze blokken niet. Zet het scoretype eerst gelijk met wijzigBlok of laat die blokken weg; er is niets gekoppeld."),{blokken:anders.map(b=>Object.assign(wie(b.id),{scoretype:b.score_type||"text"}))});
      const zichtbaar=rijen.filter(b=>b.workouts.status!=="draft");
      if(zichtbaar.length&&opties.zichtbaar!==true)return fout(zichtbaar.length+" van deze blokken staan in een workout die de atleet al ziet. Vraagt de coach er uitdrukkelijk om, geef dan {zichtbaar:true} mee als laatste argument; er is niets gekoppeld.");
      const{data,error:re}=await db.rpc("bord_koppel_blokken",{p_bron:bronId,p_blokken:blokIds});
      if(re)return fout(re.message);
      if(!data||data.fout)return fout((data&&data.fout)||"Koppelen mislukt.");
      cids.forEach(ververs);
      return schoon({ok:true,leaderboard:{id:bron.id,naam:bron.title,soort:bron.audience==="bord"?"leaderboard_workout":"yp_showdown"},
        gekoppeld:data.gekoppeld||0,scores_op_bord_gezet:data.scores_op_bord_gezet||0,
        atleten:(data.blokken||[]).map(wie),
        overgeslagen:(data.overgeslagen||[]).map(x=>Object.assign(wie(x.blok),{reden:x.reden})),
        niet_gevonden_of_niet_van_jou:data.geen_rechten_of_niet_gevonden||null,
        let_op:["Deze atleten zien elkaars score op dit leaderboard. Een score die al was ingevuld staat er meteen op; een atleet kan dat in de app zelf uitzetten.",
          bron.audience==="blog"?"Dit is het leaderboard van de YP Showdown: ook de blog-leden zien deze scores.":null,
          "Heeft een atleet een aangepaste versie, zet dan met schaalBlok het vinkje Scaled-versie, anders staat hij standaard onder Rx."].filter(Boolean)});
    }),

    // Leaderboard aanzetten op een gewoon blok (zoals de knop "Leaderboard aan" in de app): maakt
    // de leaderboard-workout aan als kopie van het blok en koppelt het blok eraan.
    leaderboardAan:veilig(async(blokId,opties)=>{
      opties=isObject(opties)?opties:{};
      if(!isUuid(blokId))return fout("Geef het id van het blok (uit ClaudeApi.week of het antwoord van een schrijf-commando).");
      const{data:b0,error}=await db.from("blocks").select("id,workout_id").eq("id",blokId).maybeSingle();
      if(error)return fout(error.message);
      if(!b0)return fout("Geen blok gevonden met dit id, of je mag het niet zien.");
      const c=await conceptOphalen(b0.workout_id,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      const i=c.w.blocks.findIndex(b=>b.id===blokId),oud=c.w.blocks[i],volgende=c.w.blocks[i+1];
      if(oud.source_blog_workout_id)return fout(isBord(oud.source_blog_workout_id)?"Op dit blok staat al een leaderboard. Zet dezelfde workout bij een andere atleet met ClaudeApi.plaatsLeaderboardWorkout.":"Dit blok is de YP Showdown; die heeft al een gedeeld leaderboard.");
      if(oud.linked||(volgende&&volgende.linked))return fout("Een leaderboard kan niet op een blok in een superset.");
      if(oud.lift_id)return fout("Dit blok is aan een lift gekoppeld; daar is de PR-lijst voor. Een leaderboard zet je op een workout met één score.");
      const tekst=oud.kind==="conditioning"?oud.notes:oud.prescription;
      if(leeg(oud.exercise)||leeg(tekst))return fout("Het blok heeft een naam en een tekst nodig; die horen bij het leaderboard.");
      if((oud.score_type||"text")==="none")return fout("Dit blok heeft scoretype none. Zonder score is er geen leaderboard: kies eerst een scoretype met wijzigBlok.");
      const{data:nw,error:we}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,workout_date:iso(new Date()),title:oud.exercise,audience:"bord"}).select("id").single();
      if(we||!nw)return fout((we&&we.message)||"Leaderboard aanzetten mislukt.");
      const weg=async m=>{try{await db.from("workouts").delete().eq("id",nw.id);}catch(e){}return fout(m);};
      const{error:be}=await db.from("blocks").insert({workout_id:nw.id,kind:oud.kind,label:"A",linked:false,exercise:oud.exercise,prescription:oud.kind==="conditioning"?null:(oud.prescription||null),notes:oud.notes||null,sort:1,color:"purple",
        score_type:oud.score_type||"text",timecap_seconds:oud.timecap_seconds||null,cap_score_type:oud.cap_score_type||"reps",media:oud.media||null});
      if(be)return weg(be.message);
      const{error:ue}=await db.from("blocks").update({source_blog_workout_id:nw.id}).eq("id",blokId);
      if(ue)return weg(ue.message);
      BORD_IDS.add(nw.id);
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},status:statusNaam(c.w),leaderboard_workout:{id:nw.id,naam:oud.exercise},
        let_op:["Zet dezelfde workout bij andere atleten met ClaudeApi.plaatsLeaderboardWorkout(atleetId, \""+nw.id+"\", datum). Typ je de tekst opnieuw, dan krijgt die atleet een los blok zonder leaderboard.",
          "Een atleet ziet het bord zodra de workout bij hem zichtbaar is, en staat er met zijn score standaard op. Hij kan dat in de app zelf uitzetten.",
          c.w.status!=="draft"?ZICHTBAAR:null].filter(Boolean),workout:terug[0]});
    }),

    // ---------- Een template uit de bibliotheek in één keer plaatsen ----------
    voegTemplateIn:veilig(async(workoutId,templateId,opties)=>{
      opties=isObject(opties)?opties:{};
      const c=await conceptOphalen(workoutId,opties.zichtbaar===true);if(c.fout)return fout(c.fout);
      const tid=Number(templateId);
      if(!Number.isInteger(tid)||tid<1)return fout("Geef het id van de template (een getal uit ClaudeApi.bibliotheek).");
      const{data:t,error}=await db.from("templates").select("id,naam,instructies,type,kleur,media,onderdelen").eq("id",tid).maybeSingle();
      if(error)return fout(error.message);
      if(!t)return fout("Geen template gevonden met id "+tid+".");
      let plek=opties.plek;
      if(leeg(plek))plek=t.type==="warmup"?"warming_up":(t.type==="cooldown"?"cooldown":"blok");
      if(!["blok","warming_up","cooldown"].includes(plek))return fout("opties.plek moet \"blok\", \"warming_up\" of \"cooldown\" zijn.");
      const zb=c.w.status!=="draft";
      const media=(Array.isArray(t.media)?t.media:[]).filter(m=>m&&m.youtube_id);
      if(plek==="blok"){
        // Dezelfde omzetting als de app (superset bij meerdere liften, liftkoppeling, schema).
        let nieuw=null;
        try{if(typeof tplBlokken==="function")nieuw=tplBlokken({naam:t.naam,instructies:t.instructies,kleur:t.kleur,media:t.media,onderdelen:t.onderdelen});}catch(e){nieuw=null;}
        if(!nieuw||!nieuw.length)nieuw=[{kind:"exercise",exercise:t.naam,prescription:t.instructies||null,color:kleurenLijst().includes(t.kleur)?t.kleur:null,score_type:"text",media:media.length?media:null,linked:false,lift_id:null,lift_scheme:null,group_title:null}];
        if(c.w.blocks.length+nieuw.length>MAX_BLOKKEN)return fout("Er is niets toegevoegd: een workout heeft maximaal "+MAX_BLOKKEN+" blokken.");
        const g=groepen(c.w.blocks),max=c.w.blocks.reduce((m,b)=>Math.max(m,b.sort||0),0),L=String.fromCharCode(65+Math.min(g,25));
        const rijen=nieuw.map((b,i)=>({workout_id:c.w.id,kind:b.kind||"exercise",label:nieuw.length>1?L+(i+1):L,sort:max+1+i,linked:i>0&&!!b.linked,
          exercise:b.exercise,prescription:b.prescription||null,notes:b.notes||null,color:b.color||null,score_type:b.score_type||"text",timecap_seconds:null,cap_score_type:"reps",
          oefening_id:null,media:b.media||null,lift_id:b.lift_id||null,lift_scheme:b.lift_scheme||null,group_title:b.group_title||null,source_blog_workout_id:null}));
        const{error:be}=await db.from("blocks").insert(rijen);
        if(be)return fout(be.message);
      }else{
        const veld=plek==="warming_up"?"warmup":"cooldown",mveld=veld+"_media";
        const tekst=(t.instructies||t.naam||"").replace(/\r\n/g,"\n").trim();
        const oudTekst=(c.w[veld]||"").replace(/\s+$/,"");
        if(oudTekst&&oudTekst.includes(tekst)&&opties.toch!==true)return fout("Er is niets toegevoegd: deze tekst staat al in de "+(plek==="warming_up"?"warming-up":"cooldown")+".");
        const cur=(Array.isArray(c.w[mveld])?c.w[mveld]:[]).filter(m=>m&&m.youtube_id);
        media.forEach(m=>{if(!cur.some(x=>x.youtube_id===m.youtube_id))cur.push(m);});
        const upd={};upd[veld]=(oudTekst?oudTekst+"\n\n":"")+tekst;upd[mveld]=cur.length?cur:null;
        if((upd[veld]||"").length>MAX_TEKST)return fout("Er is niets toegevoegd: de "+(plek==="warming_up"?"warming-up":"cooldown")+" wordt dan te lang.");
        const{data:rij,error:ue}=await db.from("workouts").update(upd).eq("id",c.w.id).eq("status",c.w.status).select("id");
        if(ue)return fout(ue.message);
        if(!(rij||[]).length)return fout("Er is niets toegevoegd: de status van deze workout is intussen veranderd. Lees hem opnieuw met ClaudeApi.week.");
      }
      const terug=await leesTerug([c.w.id]);
      ververs(c.p.id);
      return schoon({ok:true,atleet:{id:c.p.id,naam:naam(c.p)},ingevoegd:"\""+(t.naam||"")+"\" als "+(plek==="blok"?"blok":(plek==="warming_up"?"warming-up":"cooldown")),
        status:statusNaam(c.w),let_op:zb?[ZICHTBAAR]:null,workout:terug[0]});
    }),

    // ---------- Demo-video's toevoegen, ook bij een zichtbare workout ----------
    // De enige plek waar iets verandert dat de atleet meteen ziet. Daarom smal gehouden:
    // er wordt alleen het veld media van een blok bijgewerkt, en er komt alleen iets bij.
    videosToevoegen:veilig(async(blokId,videos)=>{
      if(!isUuid(blokId))return fout("Geef het id van het blok (uit ClaudeApi.week).");
      const lijst=Array.isArray(videos);
      if(!lijst&&!leeg(videos)&&videos!=="aanvullen")return fout("videos moet \"aanvullen\" zijn of een lijst id's uit ClaudeApi.videoZoek. Weghalen of vervangen kan hier niet.");
      const{data:b,error}=await db.from("blocks").select("*").eq("id",blokId).maybeSingle();
      if(error)return fout(error.message);
      if(!b)return fout("Geen blok gevonden met dit id, of je mag het niet zien.");
      const{data:w,error:we}=await db.from("workouts").select("id,client_id,audience,status,workout_date,title,source_blog_workout_id").eq("id",b.workout_id).maybeSingle();
      if(we)return fout(we.message);
      if(!w||w.audience!=="client"||!w.client_id)return fout("Dit blok hoort niet bij een 1-op-1 workout. Weekworkouts, blog- en groepsprogramma's verander je hier nooit.");
      if(w.source_blog_workout_id||b.source_blog_workout_id)return fout("Dit is de YP Showdown. Daar verander je niets aan, ook geen video's.");
      const a=await atleetOphalen(w.client_id);if(a.fout)return fout(a.fout);
      if(!(await videosKlaar()))return fout("De oefeningenbibliotheek is nog niet geladen. Probeer het over een paar seconden opnieuw.");
      const fouten=[];
      let ids=null;
      if(lijst){ids=videosLees(videos,"videos",fouten,true);if(fouten.length)return fout(fouten.join(" "));}
      const nieuw=lijst?mediaLijst(ids,"videos",fouten,b.media):mediaAuto(blokBron(b));
      if(fouten.length)return fout(fouten.join(" "));
      const basis=(Array.isArray(b.media)?b.media:[]).filter(m=>m&&m.youtube_id),bij=[];
      nieuw.forEach(m=>{if(basis.length+bij.length<MAX_VIDEOS&&!basis.concat(bij).some(x=>x.youtube_id===m.youtube_id||(x.oefening_id&&x.oefening_id===m.oefening_id)))bij.push(m);});
      const kop={ok:true,atleet:{id:a.p.id,naam:naam(a.p)},workout:{datum:w.workout_date,titel:w.title||"",status:w.status==="draft"?"concept":"gepubliceerd"},blok:((b.label||"")+" "+(b.exercise||"")).trim()};
      if(!bij.length)return schoon(Object.assign(kop,{toegevoegd:0,uitleg:"Er is niets toegevoegd: er was niets nieuws te herkennen of de video stond er al.",demo_videos:titels(basis),videos_uitgezet:mediaUitgezet(blokTekst(b),basis)}));
      const alles=basis.concat(bij);
      const{error:ue}=await db.from("blocks").update({media:alles}).eq("id",b.id);
      if(ue)return fout(ue.message);
      ververs(a.p.id);
      return schoon(Object.assign(kop,{toegevoegd:bij.length,erbij:titels(bij),demo_videos:titels(alles),videos_uitgezet:mediaUitgezet(blokTekst(b),alles),
        let_op:w.status==="draft"?null:"Deze workout is zichtbaar: de atleet ziet de nieuwe video meteen."}));
    }),

    videosToevoegenWeek:veilig(async(atleetId,datum)=>{
      const a=await atleetOphalen(atleetId);if(a.fout)return fout(a.fout);
      if(leeg(datum))datum=iso(new Date());
      if(!isDatum(datum))return fout("datum moet JJJJ-MM-DD zijn: een dag in de week die je wilt nalopen.");
      const maandag=maandagVan(datum);
      const{data:ws,error}=await db.from("workouts").select("id,workout_date,title,status,source_blog_workout_id, blocks(*)").eq("client_id",a.p.id).gte("workout_date",maandag).lte("workout_date",plus(maandag,6))
        .order("workout_date").order("day_sort",{nullsFirst:false}).order("created_at");
      if(error)return fout(error.message);
      if(!(ws||[]).length)return fout("In de week van "+maandag+" staan geen 1-op-1 workouts bij "+naam(a.p)+".");
      if(!(await videosKlaar()))return fout("De oefeningenbibliotheek is nog niet geladen. Probeer het over een paar seconden opnieuw.");
      const erbij=[],uitgezet=new Set();let blokken=0,zichtbaar=0;
      for(const w of ws){
        if(w.source_blog_workout_id)continue;
        for(const b of (w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort)){
          if(b.source_blog_workout_id)continue;
          blokken++;
          const basis=(Array.isArray(b.media)?b.media:[]).filter(m=>m&&m.youtube_id),bij=[];
          mediaAuto(blokBron(b)).forEach(m=>{if(basis.length+bij.length<MAX_VIDEOS&&!basis.concat(bij).some(x=>x.youtube_id===m.youtube_id||(x.oefening_id&&x.oefening_id===m.oefening_id)))bij.push(m);});
          mediaUitgezet(blokTekst(b),basis.concat(bij)).forEach(n=>uitgezet.add(n));
          if(!bij.length)continue;
          const{error:ue}=await db.from("blocks").update({media:basis.concat(bij)}).eq("id",b.id);
          if(ue)return {ok:false,fout:"Bijwerken stopte halverwege: "+ue.message,al_toegevoegd:erbij};
          if(w.status!=="draft")zichtbaar++;
          erbij.push({datum:w.workout_date,dag:dagVan(w.workout_date),status:w.status==="draft"?"concept":"gepubliceerd",blok:((b.label||"")+" "+(b.exercise||"")).trim(),erbij:titels(bij)});
        }
      }
      ververs(a.p.id);
      return schoon({ok:true,atleet:{id:a.p.id,naam:naam(a.p)},week:maandag,blokken_nagelopen:blokken,blokken_bijgewerkt:erbij.length,
        let_op:zichtbaar?zichtbaar+" van deze blokken staan in een zichtbare workout: de atleet ziet die video's meteen.":null,
        videos_uitgezet:[...uitgezet],toegevoegd:erbij});
    })
  };
})();
