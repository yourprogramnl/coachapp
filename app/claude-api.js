// app/claude-api.js — vaste lees-commando's voor de Claude van een coach (18 nov 2026).
//
// Een coach die met Claude programmeert (Michel als eerste) liet Claude tot nu toe
// op knoppen drukken in Strivee. Hier vraagt Claude het in één keer op, vanuit de
// browser waarin de coach is ingelogd: ClaudeApi.week(...), ClaudeApi.notities(...).
// Alles loopt via dezelfde `db` als de rest van de app, dus onder de login van de
// coach zelf: de database (RLS) bepaalt wat hij mag zien, niet dit bestand.
//
// Versie 1 leest alleen. In dit bestand staat bewust geen enkele insert, update of
// delete; schrijven (altijd als concept) komt in een volgende versie.
//
// Elk commando geeft {ok:true, ...} of {ok:false, fout:"..."} terug en gooit geen
// fouten, zodat Claude altijd een leesbaar antwoord krijgt. Begin met ClaudeApi.hulp().
const ClaudeApi=(()=>{
  const VERSIE="1 (alleen lezen)";
  const DAGKORT=["zo","ma","di","wo","do","vr","za"];
  const STAF=["coach","eigenaar","platform_admin"];
  const pad2=n=>String(n).padStart(2,"0");
  const iso=d=>d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());
  const opDag=s=>new Date(s+"T12:00:00"); // midden op de dag: veilig voor zomertijd
  const plus=(s,n)=>{const d=opDag(s);d.setDate(d.getDate()+n);return iso(d);};
  const maandagVan=s=>plus(s,-((opDag(s).getDay()+6)%7));
  const dagVan=s=>DAGKORT[opDag(s).getDay()];
  const isDatum=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(opDag(s).getTime())&&iso(opDag(s))===s;
  const isUuid=s=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
  const naam=p=>((p.first_name||"")+" "+(p.last_name||"")).trim();
  const fout=m=>({ok:false,fout:m});
  const leeg=v=>v===null||v===undefined||v==="";
  // Lege velden weglaten houdt het antwoord klein en leesbaar.
  const schoon=o=>{const u={};for(const k in o){if(!leeg(o[k])&&!(Array.isArray(o[k])&&!o[k].length))u[k]=o[k];}return u;};
  // Tijdstip in de lokale tijd van de browser (de database bewaart UTC).
  const tijd=ts=>{if(!ts)return "";const d=new Date(ts);return isNaN(d.getTime())?"":iso(d)+" "+pad2(d.getHours())+":"+pad2(d.getMinutes());};
  const stukken=(lijst,n)=>{const u=[];for(let i=0;i<lijst.length;i+=n)u.push(lijst.slice(i,i+n));return u;};

  function nietKlaar(){
    if(typeof db==="undefined"||!db||!ME||!ME.user||!ME.profile)return "Niet ingelogd. Log eerst in op de coach-app en probeer het opnieuw.";
    if(!STAF.includes(ME.profile.role))return "Deze commando's zijn alleen voor coaches.";
    return null;
  }
  // Een atleet moet een lid van het eigen bedrijf zijn. Zo komt een sportschoollid of
  // een collega-coach er nooit per ongeluk doorheen, ook niet bij een beheerder.
  async function atleetOphalen(id){
    if(!isUuid(id))return {fout:"Geef het id van de atleet (uit ClaudeApi.atleten), geen naam."};
    const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived,company_id,role,gender,birth_date,height_cm,weight_kg,profile_note").eq("id",id).maybeSingle();
    if(error)return {fout:error.message};
    if(!data)return {fout:"Geen atleet gevonden met dit id, of je mag hem niet zien."};
    if(data.role!=="lid"||data.company_id!==ME.profile.company_id)return {fout:"Dit id hoort niet bij een atleet van jouw bedrijf."};
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

  return {
    versie:VERSIE,

    // Uitleg van de commando's en van de vaste waarden (scoretypes, kleuren).
    hulp(){
      let scoretypes=null,kleuren=null;
      try{scoretypes=SCORETYPES.map(s=>s[0]+" = "+s[1]);}catch(e){}
      try{kleuren=TPLKLEUREN.map(k=>k+" = "+LEGNAAM[k]);}catch(e){}
      return {ok:true,versie:VERSIE,
        regels:[
          "Deze versie leest alleen. Er wordt niets gewijzigd, niets verstuurd en niets goedgekeurd.",
          "Je ziet alleen wat de ingelogde coach mag zien.",
          "Begin elke sessie met ClaudeApi.ik() en controleer dat de juiste coach is ingelogd.",
          "Zoek een atleet altijd eerst op met ClaudeApi.atleten(...) en gebruik daarna zijn id. Elk antwoord noemt de atleet bij naam: controleer die naam.",
          "Een leeg veld betekent: niet ingevuld. Reken of gok het niet zelf.",
          "Blokken met uit_weekworkout:true komen uit de weekworkout (YP Showdown). Die verander je nooit."
        ],
        commandos:{
          "ClaudeApi.ik()":"Wie is er ingelogd, welke rol, welke datum is het vandaag.",
          "ClaudeApi.atleten(zoek, alle)":"Lijst van atleten met id. zoek = deel van de naam (optioneel). Standaard alleen je eigen klanten; alle=true toont iedereen die je mag zien.",
          "ClaudeApi.week(atleetId, datum, weken)":"Het 1-op-1 programma per week, met blokken, resultaten per blok, RPE en reacties. datum = een dag in de laatste week (JJJJ-MM-DD), weken = hoeveel weken terug inclusief die week (1 t/m 8, standaard 1).",
          "ClaudeApi.notities(atleetId)":"Profiel, doelen, coachnotities, dagnotities en vastgelegde consults.",
          "ClaudeApi.metingen(atleetId, naam)":"Laatste waarde per meting (krachtwaarden, benchmarks). Met naam erbij: de hele geschiedenis van die ene meting.",
          "ClaudeApi.bibliotheek(zoek, soort)":"Templates uit de bibliotheek. soort = warmup, cooldown of other (optioneel)."
        },
        scoretypes,kleuren};
    },

    ik:veilig(async()=>{
      const vandaag=iso(new Date());
      return {ok:true,versie:VERSIE,coach:naam(ME.profile),coach_id:ME.user.id,rol:ME.profile.role,vandaag,weekdag:dagVan(vandaag),maandag_deze_week:maandagVan(vandaag)};
    }),

    atleten:veilig(async(zoek,alle)=>{
      const{data,error}=await db.from("profiles").select("id,first_name,last_name,coach_id,membership_type,archived").eq("company_id",ME.profile.company_id).eq("role","lid").order("first_name");
      if(error)return fout(error.message);
      const z=String(zoek||"").trim().toLowerCase();
      const lijst=(data||[]).filter(p=>!p.archived).filter(p=>alle||p.coach_id===ME.user.id).filter(p=>!z||naam(p).toLowerCase().includes(z))
        .map(p=>({id:p.id,naam:naam(p),soort:p.membership_type||"",eigen_klant:p.coach_id===ME.user.id}));
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
        const blokken=(w.blocks||[]).slice().sort((x,y)=>x.sort-y.sort).map(b=>{
          const cond=b.kind==="conditioning";
          return schoon({id:b.id,letter:b.label,soort:cond?"conditioning":"oefening",naam:b.exercise,
            voorschrift:cond?null:b.prescription,omschrijving:cond?b.notes:null,coachingtips:cond?null:b.notes,
            scoretype:b.score_type,kleur:b.color,tijdslimiet_sec:b.timecap_seconds,
            superset_met_vorige:b.linked?true:null,kaarttitel:b.group_title,schema:b.lift_scheme,
            uit_weekworkout:b.source_blog_workout_id?true:null,
            videos_van_atleet:vidPerBlok[b.id]||null,resultaat:resultaatUit(resPerBlok[b.id],b)});
        });
        const e=effPerW[w.id];
        const rij=schoon({id:w.id,datum:w.workout_date,dag:dagVan(w.workout_date),titel:w.title,
          status:w.status==="draft"?"concept":"gepubliceerd",
          rustdag:(!blokken.length&&/^rest ?day$/i.test((w.title||"").trim()))?true:null,
          notitie_coach:w.coach_notes,warming_up:w.warmup,cooldown:w.cooldown,
          uit_weekworkout:w.source_blog_workout_id?true:null,
          rpe:e?e.rpe:null,minuten:e?e.minutes:null,
          reacties:(comPerW[w.id]||[]).map(c=>({van:c.author_id===a.p.id?"atleet":"coach",op:tijd(c.created_at),tekst:c.body})),
          blokken});
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
    })
  };
})();
