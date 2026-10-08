// app/kracht.js — krachtlog: liftherkenning, schema-lezer en superset-splitser.
// Dezelfde regels als de database (private.lift_norm / private.lift_match), zodat
// de bouwer hetzelfde antwoord geeft als de trigger die een blok zijn lift geeft.
// Klassiek script (geen modules); laadt vóór bibliotheek.js en klant-scherm.js.
// De functies bovenaan zijn puur (geen DOM, geen database) en worden ook met
// Node getest (FORGE/krachtlog-tests/kracht-test.js); alleen liftsLaad praat met Supabase.

const LIFTS={lijst:[],geladen:false,bezig:null};
const LIFT_CAT_NL={squats:"Squats",cleans:"Cleans",snatches:"Snatches",presses:"Presses",deadlifts:"Deadlifts",jerks:"Jerks",olympic:"Olympische liften",other:"Overig",gym:"Eigen liften"};

// Naam normaliseren: kleine letters, alles tussen haakjes weg, & wordt "and",
// alleen letters en cijfers over. "Special Strength (Back Squat / …)" wordt
// dus "special strength" en matcht bewust niets.
function liftNorm(s){
  const k=String(s==null?"":s).toLowerCase().replace(/\(.*?\)/g," ").replace(/&/g," and ").replace(/[^a-z0-9]+/g," ").trim();
  return k||null;
}
// Enkelvoud: één s aan het eind weg, behalve na een s ("press" blijft "press").
const liftEnkel=k=>k==null?null:k.replace(/([^s])s$/,"$1");

// Naam -> lift uit de geladen lijst (exacte naam of alias, meervoud mag).
// Volgorde bij meerdere treffers, gelijk aan de database: eigen lift van het
// bedrijf eerst, dan exacte naam boven alias, dan de oudste. De lijst bevat
// alleen standaardliften en de eigen liften van dit bedrijf (rechten in de database).
function liftMatch(naam){
  const k=liftNorm(naam);if(!k)return null;
  const ke=liftEnkel(k);
  let best=null,bestKey=null;
  for(const l of LIFTS.lijst){
    const n=liftNorm(l.name);
    let raak=false,exact=false;
    if(n===k){raak=true;exact=true;}
    else if(liftEnkel(n)===ke)raak=true;
    else for(const a of (l.aliases||[])){const na=liftNorm(a);if(na&&(na===k||liftEnkel(na)===ke)){raak=true;break;}}
    if(!raak)continue;
    const key=(l.company_id?"0":"1")+(exact?"0":"1")+String(l.created_at||"");
    if(bestKey===null||key<bestKey){best=l;bestKey=key;}
  }
  return best;
}
const liftVan=id=>id?(LIFTS.lijst.find(l=>l.id===id)||null):null;
const liftNaam=id=>{const l=liftVan(id);return l?l.name:"";};

// Liftenlijst één keer laden (standaardliften + eigen liften van het bedrijf;
// de rechten in de database bepalen wat je ziet).
async function liftsLaad(){
  if(LIFTS.geladen)return LIFTS.lijst;
  if(LIFTS.bezig)return LIFTS.bezig;
  LIFTS.bezig=(async()=>{
    try{
      const{data,error}=await db.from("gym_lifts").select("id,name,category,aliases,metric_name,company_id,created_at").order("name");
      if(error)throw error;
      LIFTS.lijst=data||[];LIFTS.geladen=true;
    }catch(e){LIFTS.lijst=LIFTS.lijst||[];}
    LIFTS.bezig=null;return LIFTS.lijst;
  })();
  return LIFTS.bezig;
}

// ---------- Schema-lezer: uit het voorschrift van de coach ----------
// "5 reps @95 kilo; rest 2 min. x 5 sets." -> {sets:5, reps:5, kg:95, rust:"2 min"}
// "8-12 reps @3010; rest 2 min. x 3 sets" -> {sets:3, reps:"8-12", tempo:"3010", rust:"2 min"}
// "3-2-1-1 reps; rest as needed"          -> {sets:4, reps_lijst:[3,2,1,1], rust:"as needed"}
// "5 x 3 @ 80%"                            -> {sets:5, reps:3, pct:80}
// Niets herkend = null. Tijden, minuten, seconden en tempo-codes zijn nooit reps of kilo's.
const SCHEMA_GEEN_REPS_WOORD=/^(?:sets?|rondes?|rounds?|min|minutes?|minuten|sec|seconds?|seconden|s|m|meters?|cal|kcal|kg|kilo|x|×|reps?|herhalingen|rir|rpe|rm)\b/i;
const SCHEMA_TEMPO=/@\s*([0-9][0-9xX][0-9xX][0-9])\b/;
function schemaLees(tekst){
  const t=String(tekst||"");
  if(!t.trim())return null;
  const s={};
  const mt=t.match(SCHEMA_TEMPO);if(mt)s.tempo=mt[1].toUpperCase();
  const mp=t.match(/(\d{2,3})(?:\s*-\s*(\d{2,3}))?\s*%/);if(mp){s.pct=parseInt(mp[1],10);if(mp[2])s.pct_tot=parseInt(mp[2],10);}
  const mk=t.match(/@\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(?:kg|kilo)\b/i)
        ||t.match(/\b(?:start)?gewicht\s*=\s*(\d+(?:[.,]\d+)?)(?:\s*-\s*(\d+(?:[.,]\d+)?))?\s*(?:kg|kilo)?/i);
  if(mk){s.kg=parseFloat(mk[1].replace(",","."));if(mk[2])s.kg_tot=parseFloat(mk[2].replace(",","."));}
  else{const mv=t.match(/\bvanaf\s*(\d+(?:[.,]\d+)?)\s*(?:kg|kilo)\b/i);if(mv)s.kg_start=parseFloat(mv[1].replace(",","."));}
  const mr=t.match(/\b(?:rest|rust)\s*:?\s*(\d+(?:\s*-\s*\d+)?\s*(?:min|sec)\b\.?|as needed|naar behoefte)/i);
  if(mr)s.rust=mr[1].replace(/\.$/,"").replace(/\s*-\s*/,"-").replace(/\s+/g," ").trim();
  if(/@\s*building\b|\bbuild(?:ing)?\s+to\b|\bopbouwend\b/i.test(t))s.opbouw=true;
  const msets=t.match(/[x×]\s*(\d+)\s*sets?\b/i)||t.match(/\b(\d+)\s*sets?\b/i);
  if(msets)s.sets=parseInt(msets[1],10);
  if(!s.sets){const me=t.match(/\bemom\s*(\d{1,2})\b/i);if(me)s.sets=parseInt(me[1],10);} // EMOM10 = 10 sets
  // Reps: lijst (3-2-1-1 reps), aantal of bereik ("8-12 reps", "10/10 reps"),
  // "5 x 3" (sets x reps), "Heavy 3", "Build to a 1RM", of een regel die met
  // het aantal begint ("8-12 Back Squats @3010", "15/15 Barbell Split Squats").
  // Bij een metcon (for time, AMRAP, rounds) lezen we geen reps uit losse regels.
  const metcon=/\bfor time\b|\bamrap\b|\brounds?\b|\bronden?\b/i.test(t);
  const mLijst=t.match(/\b(\d+(?:\s*-\s*\d+){2,})\s*(?:reps?|herhalingen)\b/i)||t.match(/^\s*(\d{1,2}(?:\s*-\s*\d{1,2}){2,})\s*(?:reps?)?\s*(?=@|;|$)/m); // "12-10-8-6 @20X1"
  if(mLijst){s.reps_lijst=mLijst[1].split(/\s*-\s*/).map(x=>parseInt(x,10));if(!s.sets)s.sets=s.reps_lijst.length;}
  else{
    let reps=null,perKant=false;
    let m=t.match(/\b(\d+(?:\s*-\s*\d+)?)\s*(?:\/\s*(\d+(?:\s*-\s*\d+)?))?\s*(?:reps?|herhalingen)\b/i);
    if(m){reps=m[1];if(m[2])perKant=true;}
    // "5 x 3" = sets x reps; een tempo-code achter een @ ("@ 30X0") telt niet mee.
    if(reps===null){m=t.replace(/\b\d+:\d+(?::\d+)?\b/g," ").match(/(?<!@\s{0,3})\b(\d{1,2})\s*[x×]\s*(\d{1,3})\b(?!\s*(?:kg|kilo|%|min|sec|m\b))/i);if(m&&parseInt(m[2],10)>0){reps=m[2];if(!s.sets)s.sets=parseInt(m[1],10);}}
    if(reps===null){m=t.match(/\bheavy(?:\s+\w+){0,3}?\s+(\d{1,2}|single|double|triple)\b/i);if(m)reps=({single:"1",double:"2",triple:"3"})[m[1].toLowerCase()]||m[1];}
    if(reps===null){m=t.match(/\bemom\s*\d{1,2}\b[^\n]*?:\s*(\d{1,2})\s+(?=[A-Za-z])/i);if(m)reps=m[1];} // "EMOM10: 2 Power Cleans"
    if(reps===null&&/(?:^|\n)\s*1(?:\.1)+\b/.test(t))reps="1"; // "1.1.1. Power Snatch": clusters tellen als 1 rep per set (keuze Stefan)
    if(reps===null&&/\bbuild\s+to\s+a\s+(?:1\s*rm|heavy\s+single|1rm)\b/i.test(t))reps="1";
    if(reps===null){m=t.match(/(?<!\d\s*-\s*)\b(\d{1,2})\s*rm\b/i);if(m)reps=m[1];} // "Find your 1RM", "3RM @32X0", "6RM @2010"
    if(reps===null&&!metcon){
      for(const regel of t.split(/\n/)){
        const r=regel.replace(/^\s*(?:\d+\)|[-•*])\s*/,"").trim();
        const mr3=r.match(/^(\d{1,2})\s*[x×]\s+(?=[A-Za-z])/i);if(mr3){reps=mr3[1];break;} // "2 x Power Clean"
        const mr2=r.match(/^(\d+(?:-\d+)?)(?:\/(\d+(?:-\d+)?))?\s*(?:rm\b)?\s+(?=[A-Za-z])(\S+)/i);
        if(mr2&&!SCHEMA_GEEN_REPS_WOORD.test(mr2[3])){reps=mr2[1];if(mr2[2])perKant=true;break;}
      }
    }
    if(reps!==null){
      reps=reps.replace(/\s+/g,"");
      s.reps=/^\d+$/.test(reps)?parseInt(reps,10):reps;
      if(perKant||/\bper\s+(?:kant|been|arm|zijde)\b|\beach\s+side\b|\bper\s+side\b/i.test(t))s.per_kant=true;
    }
  }
  return Object.keys(s).length?s:null;
}
// Leesbare regel voor de coach: "5 sets × 5 reps · @ 95 kg · tempo 3010 · rust 2 min"
function schemaTekst(s){
  if(!s)return "";
  const fmtKg=v=>String(v).replace(".",",");
  const delen=[];
  let sr="";
  if(s.sets)sr+=s.sets+" sets";
  if(s.reps_lijst)sr+=(sr?" × ":"")+s.reps_lijst.join("-")+" reps";
  else if(s.reps!=null)sr+=(sr?" × ":"")+s.reps+" reps"+(s.per_kant?" per kant":"");
  else if(s.maat)sr+=(sr?" × ":"")+s.maat;
  if(sr)delen.push(sr);
  if(s.kg!=null)delen.push("@ "+fmtKg(s.kg)+(s.kg_tot!=null?"-"+fmtKg(s.kg_tot):"")+" kg");
  else if(s.kg_start!=null)delen.push("vanaf "+fmtKg(s.kg_start)+" kg");
  if(s.pct!=null)delen.push("@ "+s.pct+(s.pct_tot!=null?"-"+s.pct_tot:"")+"%");
  if(s.tempo)delen.push("tempo "+s.tempo);
  if(s.rust)delen.push("rust "+s.rust);
  if(s.opbouw)delen.push("opbouwend");
  return delen.join(" · ");
}

// ---------- Superset-splitser: templates met twee of meer onderdelen ----------
// Tekstvorm van Michel: "8-12 Dumbbell Split Squats @3010;\n8-12 Dumbbell Romanian
// Deadlifts @3010;\nRest 2 min. x 3 sets.\n\nPush de gewichten…". Elke regel met
// een aantal vooraan is één onderdeel; de regel met "x N sets" en rust geldt
// voor allemaal. Ook "8-12RM bench press @ 30X0", "Belt Squat: 15 reps @3010;",
// "30m sandbag carry", "15-30 seconds Sorenson Hold", "max unbroken …" en
// "1) … 2) …" (EMOM) worden herkend; "rest 90 sec" tussen de regels ook.
// Minder dan twee onderdelen = null.
const SS_EENHEID=/^(m|meters?|sec|seconds?|seconden|min|minutes?|minuten|cal|kcal)\b/i;
function ssNaamSchoon(n){
  return String(n||"").replace(/\s*[-–]?\s*\d+(?:\s*-\s*\d+)?\s*rir\b.*$/i,"").replace(/\s*\(\s*per\s+[^)]*\)\s*$/i,"").replace(/[;:,\s]+$/,"").trim();
}
function ssOnderdelen(naam,tekst){
  const t=String(tekst||"");
  if(!t.trim())return null;
  const regels=t.split(/\n/).map(r=>r.trim()).filter(Boolean);
  const alg={};
  const ms=t.match(/[x×]\s*(\d+)\s*sets?\b/i)||t.match(/^\s*(\d+)\s*sets?\s*:/im);if(ms)alg.sets=parseInt(ms[1],10);
  const onderdelen=[];
  let laatsteRust=null;
  const perKantIn=r=>/\bper\s+(?:kant|been|arm|zijde)\b|\beach\s+side\b|\bper\s+side\b/i.test(r);
  for(const regel of regels){
    const r=regel.replace(/^\s*(?:\d+\)|[-•*])\s*/,"").replace(/[-–]\s*$/,"").trim();
    if(/^(?:rest|rust)\b/i.test(r)||/^\d+\s*sets?\s*:?\s*(?:\(.*\))?$/i.test(r)){
      const mr=r.match(/(\d+(?:\s*-\s*\d+)?\s*(?:min|sec)\b\.?|as needed)/i);
      if(mr){const rust=mr[1].replace(/\.$/,"").replace(/\s*-\s*/,"-").trim();if(!alg.rust)alg.rust=rust;laatsteRust=rust;if(onderdelen.length&&!onderdelen[onderdelen.length-1].rust)onderdelen[onderdelen.length-1].rust=rust;}
      continue;
    }
    if(/^emom\b/i.test(r)){const me=r.match(/(\d+)/);if(me&&!alg.sets)alg.sets=parseInt(me[1],10);continue;}
    if(/^(?:into|then|dan|daarna|and|en|\+|&|direct|directly)\s*$/i.test(r))continue; // verbindingsregel tussen twee onderdelen
    if(onderdelen.length>=2&&!/^(?:\d|max\b|[a-z][^:]*:\s*\d)/i.test(r))break; // tekst/tips na de onderdelen
    let od=null,m;
    if((m=r.match(/^(\d+(?:-\d+)*)(?:\/(\d+(?:-\d+)*))?(?:\s*(m|meters?|sec|seconds?|seconden|min|minutes?|minuten|cal|kcal)\b)?\s*(?:rm\b)?\s*(?:reps?\b)?\s*(\([^)]*\))?\s*(?:(?=[A-Za-z])([^@;]+?))?\s*(?:@\s*([0-9][0-9xX][0-9xX][0-9])\b)?(?:\s*@\s*([^;]*?))?\s*;?\s*$/i))){
      const getal=m[1],eenheid=m[3]||null,naamR=(m[5]||"").trim();
      if(!eenheid&&naamR&&SCHEMA_GEEN_REPS_WOORD.test(naamR)){/* "3 sets" e.d.: geen onderdeel */}
      else{
        od={naam:naamR,per_kant:!!m[2]||perKantIn(r)||/kant|side|been/i.test(m[4]||""),tempo:m[6]?m[6].toUpperCase():null,extra:(m[7]||"").trim()||null};
        if(eenheid){od.reps=null;od.maat=getal+" "+eenheid;}
        else if(/^\d+$/.test(getal))od.reps=parseInt(getal,10);
        else if(/^\d+-\d+$/.test(getal))od.reps=getal;
        else{od.reps_lijst=getal.split("-").map(x=>parseInt(x,10));od.reps=null;}
      }
    }else if((m=r.match(/^([^:@;]+?):\s*(\d+(?:-\d+)?)(?:\/(\d+(?:-\d+)?))?\s*(?:reps?)?\s*(?:@\s*([0-9][0-9xX][0-9xX][0-9])\b)?(?:\s*@\s*([^;]*?))?\s*;?\s*$/i))){
      od={naam:m[1].trim(),reps:/^\d+$/.test(m[2])?parseInt(m[2],10):m[2],per_kant:!!m[3]||perKantIn(r),tempo:m[4]?m[4].toUpperCase():null,extra:(m[5]||"").trim()||null};
    }else if((m=r.match(/^max(?:\.|imum)?\s+(?:unbroken\s+)?(?=[A-Za-z])([^@;]+?)\s*(?:@\s*([0-9][0-9xX][0-9xX][0-9])\b)?(?:\s*@\s*([^;]*?))?\s*;?\s*$/i))){
      od={naam:m[1].trim(),reps:"max",per_kant:perKantIn(r),tempo:m[2]?m[2].toUpperCase():null,extra:(m[3]||"").trim()||null};
    }else if((m=r.match(/^(?=[A-Za-z])([^@;:]+?)\s*@\s*(?:([0-9][0-9xX][0-9xX][0-9])\b)?\s*(?:@?\s*([^;]*?))?\s*;?\s*$/))&&!/^(?:push|focus|let op|noteer|voeg|tempo|start|werksets|gewicht)/i.test(r)){
      od={naam:m[1].trim(),reps:null,per_kant:perKantIn(r),tempo:m[2]?m[2].toUpperCase():null,extra:(m[3]||"").trim()||null};
    }
    if(!od){if(onderdelen.length)break;continue;}
    od.naam=ssNaamSchoon(od.naam);
    od.regel=regel.replace(/^\s*(?:\d+\)|[-•*])\s*/,"").replace(/;\s*$/,"").trim();
    onderdelen.push(od);
  }
  if(onderdelen.length<2)return null;
  // Namen uit de titel ("Special Strength (A / B)") zijn netter dan de regels
  // (enkelvoud, zonder "reps"); alleen als het aantal klopt. Zonder naam op de
  // regel én zonder titelnaam valt het onderdeel af.
  const namen=ssNamen(naam);
  if(namen.length===onderdelen.length)onderdelen.forEach((od,i)=>{od.naam=namen[i];});
  if(onderdelen.some(od=>!od.naam))return null;
  onderdelen.forEach(od=>{if(alg.sets&&!od.sets)od.sets=alg.sets;if(!od.rust)od.rust=alg.rust||laatsteRust||null;});
  return onderdelen;
}
// Kaarttitel uit de templatenaam: het stuk vóór het haakje ("Special Strength").
function ssTitel(naam){const n=String(naam||"").trim();const i=n.indexOf("(");return (i>0?n.slice(0,i):n).trim();}
// Namen tussen de haakjes van de templatenaam: "Special Strength (A / B)" -> ["A","B"]
// Van het eerste haakje tot het laatste sluithaakje (of het eind), zodat een
// haakje in een haakje mag: "(Leg Extension (Lean Back) / Glute Ham Raises)".
function ssNamen(naam){
  const n=String(naam||"").trim();const i=n.indexOf("(");if(i<0)return [];
  let binnen=n.slice(i+1).trim();if(binnen.endsWith(")"))binnen=binnen.slice(0,-1);
  return binnen.split("/").map(x=>x.trim()).filter(Boolean);
}
// Van een onderdeel naar het schema van een blok.
function schemaVanOnderdeel(od){
  const s={};
  if(od.sets)s.sets=od.sets;
  if(od.reps_lijst)s.reps_lijst=od.reps_lijst;
  else if(od.reps!=null&&od.reps!=="max")s.reps=od.reps;
  if(od.maat)s.maat=od.maat;
  if(od.per_kant)s.per_kant=true;
  if(od.tempo)s.tempo=od.tempo;
  if(od.rust)s.rust=od.rust;
  return Object.keys(s).length?s:null;
}
// Eigen regeltje voor het tweede (en verdere) blok van een superset: de eigen
// regel plus de gezamenlijke rust/sets, zodat het blok ook los leesbaar blijft.
function onderdeelTekst(od){
  const staart=[od.rust?"rest "+od.rust:null,od.sets?"x "+od.sets+" sets":null].filter(Boolean).join(" ");
  return od.regel+(staart?"; "+staart+".":"");
}

// ---------- Template -> blokken (één blok, of gekoppelde blokken bij een superset) ----------
// Geeft de velden voor blocks/program_blocks terug (zonder workout_id/label/sort).
// Splitsen gebeurt alleen bij een templatenaam met "(A / B)" of met handmatige
// onderdelen, zodat een metcon nooit per ongeluk in losse blokken uiteenvalt.
// Het eerste blok draagt de volledige tekst en de kaarttitel; de app toont de
// groep als één kaart met per blok een eigen invulbalk. Een Special Strength-
// template met één oefening tussen haakjes krijgt die oefening als bloknaam
// (zo vindt hij zijn lift) en "Special Strength" als kaarttitel.
function tplBlokken(o){
  const kleur=(typeof TPLKLEUREN!=="undefined"&&TPLKLEUREN.includes(o.kleur))?o.kleur:null;
  const media=(o.media&&o.media.length)?o.media:null;
  const tekst=o.instructies||null;
  const namen=ssNamen(o.naam);
  let od=Array.isArray(o.onderdelen)&&o.onderdelen.length>=2?o.onderdelen.map(x=>Object.assign({},x)):null;
  if(!od&&namen.length>=2)od=ssOnderdelen(o.naam,tekst);
  // Alleen onderdelen waar iets te loggen valt (reps, een bereik of "max")
  // krijgen een eigen blok en dus een eigen invulbalk. Een carry of een hold
  // ("30m sandbag carry", "15-30 seconds Sorenson Hold") voegt niets toe
  // (keuze Stefan, 8 oktober) en blijft alleen in de tekst van de kaart staan.
  let enkel=null;
  if(od){
    const logbaar=od.filter(x=>x.maat==null&&(x.reps!=null||x.reps_lijst));
    if(logbaar.length>=2)od=logbaar;
    else{enkel=logbaar.length===1?logbaar[0]:null;od=null;}
  }
  if(!od){
    let exercise=o.naam,titel=null,scheme=null;
    if(enkel){exercise=enkel.naam;titel=ssTitel(o.naam);scheme=schemaVanOnderdeel(enkel);}
    else if(namen.length===1&&/special\s*strength/i.test(ssTitel(o.naam))){exercise=namen[0];titel=ssTitel(o.naam);}
    const l=liftMatch(exercise);
    return [{kind:"exercise",exercise,prescription:tekst,color:kleur,score_type:"text",media,linked:false,lift_id:l?l.id:null,lift_scheme:scheme||schemaLees(tekst),group_title:titel}];
  }
  return od.map((x,i)=>{
    const l=x.lift_id?liftVan(x.lift_id):liftMatch(x.naam);
    return {kind:"exercise",exercise:x.naam,prescription:i===0?tekst:(x.regel?onderdeelTekst(x):null),color:kleur,score_type:"text",media:i===0?media:null,
      linked:i>0,lift_id:l?l.id:(x.lift_id||null),lift_scheme:schemaVanOnderdeel(x),group_title:i===0?ssTitel(o.naam):null};
  });
}
// Labels en volgorde erbij voor een directe insert: A of A1/A2, sort vanaf sortStart.
function blokkenMetLabels(blokken,letter,sortStart){
  return blokken.map((b,i)=>Object.assign({},b,{label:blokken.length>1?letter+(i+1):letter,sort:(sortStart||1)+i}));
}

// ---------- Sets: tekst naar sets en terug (kopie van src/kracht.js in de sporter-app; gelijk houden) ----------
// results.sets is [{set,kg,reps,fail}]; de leesbare vorm is "95×5 · 100×5 · 105×1 ✗".
// Alleen echte data: een set van 5 is een set van 5 en wordt nooit omgerekend
// naar een 1RM (keuze Stefan, 8 oktober 2026).
const kgTxt=v=>String(v).replace(".",",");
function leesKg(s){const v=parseFloat(String(s==null?"":s).trim().replace(",","."));return isNaN(v)||v<0?null:v;}
function leesReps(s){const m=String(s==null?"":s).trim().match(/^\d+$/);return m?parseInt(m[0],10):null;}
// Invulrijen ({kg,reps,fail} als tekst) naar de database-vorm; lege rijen vallen af.
function setsNaarRec(rows){
  const uit=[];
  (rows||[]).forEach(r=>{
    const kg=leesKg(r.kg),reps=leesReps(r.reps);
    if(kg==null&&reps==null)return;
    const s={set:uit.length+1};
    if(kg!=null)s.kg=kg;if(reps!=null)s.reps=reps;if(r.fail)s.fail=true;
    uit.push(s);
  });
  return uit;
}
// Database-vorm terug naar invulrijen.
function setsNaarRijen(sets){return (Array.isArray(sets)?sets:[]).map(x=>({kg:x.kg!=null?kgTxt(x.kg):"",reps:x.reps!=null?String(x.reps):"",fail:!!x.fail}));}
function setsSamenvatting(rows){
  return (rows||[]).map(r=>{
    const kg=leesKg(r.kg),reps=leesReps(r.reps);
    if(kg==null&&reps==null)return null;
    let t=kg!=null&&reps!=null?kgTxt(kg)+"×"+reps:kg!=null?kgTxt(kg)+" kg":reps+" reps";
    if(r.fail)t+=" ✗";
    return t;
  }).filter(Boolean).join(" · ");
}
const setsTekst=sets=>setsSamenvatting(setsNaarRijen(sets));
// Beste set: zwaarste gelukte set (bij gelijk gewicht de meeste reps).
function besteSet(sets){let b=null;(sets||[]).forEach(s=>{if(s.fail||s.kg==null)return;if(!b||s.kg>b.kg||(s.kg===b.kg&&(s.reps||0)>(b.reps||0)))b=s;});return b;}
// Vrije tekst naar sets: "60, 65 ging goed" = 60 en 65 met de reps uit het
// schema; "5x5 met 95" = vijf sets van 5 op 95; "3@88 2@95" = twee sets;
// "65 ging niet" = mislukte set; "17,5 kilo: 12/9" = 17,5 kg × 12. Tijden,
// percentages, minuten/seconden en tempo-codes zijn nooit gewicht.
const SETS_FAIL="ging niet|lukte niet|niet gelukt|niet gehaald|mislukt|gefaald|gemist|(?<=\\d\\s{0,2})mis\\b|\\bfailed\\b|\\bfail\\b|✗|❌";
const SETS_TOKEN=new RegExp(
  "heavy\\s+(\\d{1,2})\\s*(?:was|is|=|:)?\\s*(\\d+(?:[.,]\\d+)?)"+                                              // 1-2  "heavy 2 was 100kg" = kg × reps
  "|(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)?\\s*\\(\\s*(\\d{1,2})\\s*(?:reps?|x)?\\s*\\)"+                            // 3-4  "66(6)", "15(6reps)" = kg(reps)
  "|(\\d{1,2})\\s*\\/\\s*\\d{1,2}\\s*\\(\\s*(?:(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)?|geen gewicht|bodyweight|bw)\\s*\\)"+ // 5-6 "12/12(5kg)" = reps per kant (kg)
  "|(\\d+(?:[.,]\\d+)?)\\s*(kg|kilo)?\\s*([x×])\\s*(\\d+(?:[.,]\\d+)?)\\s*(kg|kilo)?(?!\\s*%)(\\s*(?:sets?|reps?|series)\\b)?"+ // 7-12 A x B
  "|(\\d{1,2})\\s*(?:[x×]\\s*(?:reps?|sets?|series)|sets?|series)\\b(?!\\s*[\\d:\\-–])(?:\\s*(?:van|of)\\s*(\\d{1,2})\\b)?"+ // 13-14 "3x reps", "3 sets", "3 sets van 5" (niet "35 Set 40")
  "|(\\d{1,2})(?:\\s*\\/\\s*\\d{1,2})?\\s*(?:reps?|herhalingen)\\s*(?:@|op|met|at|:|=|was|is)\\s*(\\d+(?:[.,]\\d+)?)"+ // 15-16 "5 reps @ 100", "12/12 reps@15kg"
  "|(\\d{1,2})\\s*:\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)\\b"+                                                  // 17-18 "11: 70 kilo" (reps: kg)
  "|(?<![\\d.,]\\s*-\\s*)(\\d{1,2})(?!\\d|[.,]\\d)\\s*-\\s*(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)\\b"+              // 19-20 "12 - 80KG" (reps - kg), niet "75-75 kg" in een reeks
  "|(?<![\\d.,]\\s*-\\s*)(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)?\\s*-\\s*(\\d{1,2})(?!\\d|[.,]\\d)(?!\\s*(?:-|\\/)\\s*\\d)(?!\\s*(?:kg|kilo|%|reps?|sets?|min|sec))"+ // 21-22 "35-12" (kg - reps)
  "|(\\d+(?:[.,]\\d+)?)\\s*@\\s*(\\d+(?:[.,]\\d+)?)"+                                                           // 23-24 "3@88", "14@12,5"
  "|(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kilo)\\b"+                                                                      // 25 "95 kg"
  "|(\\d{1,2})(?:[.,]5)?(?:\\s*\\/\\s*\\d{1,2})?\\s*(?:reps?|herhalingen)\\b"+                                  // 26 "10 reps", "12/12 reps", "5,5 reps", "110 - 6 reps"
  "|(\\d+(?:[.,]\\d+)?)"+                                                                                        // 27 los getal
  "|("+SETS_FAIL+")","gi");
// Woorden die zeggen dat een reps-aantal voor alle (overige) sets geldt, of alleen voor de laatste.
const SETS_ALLE=/\b(?:de\s*rest|derest|rest|alles|allemaal|overige|alle|elke|iedere)\b[^\d]{0,12}$/i;
const SETS_LAATSTE=/\blaatste\b[^\d]{0,16}$/i;
const setsSchoon=t=>String(t||"")
  .replace(/[–—]/g,"-")                                                                        // lange streepjes als gewone
  .replace(/\b\d+:\d+(?::\d+)?\b/g," ")                                                        // tijden
  .replace(/\d+(?:[.,]\d+)?\s*%/g," ")                                                         // percentages
  .replace(/@\s*\d[\dxX]{2}\d\b/g," ")                                                         // tempo-codes
  .replace(/\b\d+(?:[.,]\d+)?\s*(?:min|sec|seconden|minuten|m|meter|cal|kcal)\b/gi," ")        // tijden en afstanden
  .replace(/\b\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?\s*(?:rir|rpe)\b/gi," ")              // "2 rir", "1/2 rir"
  .replace(/\b(?:rir|rpe)\s*:?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?!\s*(?:kg|kilo|reps?|x))/gi," ") // "rpe 7,5/8" (niet "rir 110kg")
  .replace(/\b\d+\s*rm\b/gi," ")                                                               // "1 rm", "3rm"
  .replace(/(\d{1,2}\s*reps?\b\s*,?\s*)(?:\d+e|eerste|tweede|derde|vierde|vijfde|zesde)\s*(?:rep|herhaling)?\s*(?:gefaald|mislukt|fail(?:ed)?|niet gehaald|ging niet)\b/gi,"$1") // "2 reps, 3e gefaald" = set van 2 (keuze Stefan)
  .replace(/\b(?:gefaald|mislukt|fail(?:ed)?)\s+(?:op|bij)\s+(?:de\s+)?(?:\d+e|eerste|tweede|derde|vierde|vijfde|zesde|laatste)\s*(?:rep|herhaling)\b/gi," ") // "fail op 3e rep": de gelogde reps tellen
  .replace(/\b\d+(?:e|ste|de)\b(?:\s+(?:rep|reps|set|setje|serie|ronde|poging))?/gi," ")       // rangtelwoorden: 2e set, 3de, 1e rep
  .replace(/\b(?:video|filmpje)s?\s*:?\s+(?:van\s+)?\d+(?:[.,]\d+)?(?:\s*(?:kg|kilo))?(?=\s|$|[.,;)])/gi," ") // "Video 60": verwijst naar de set op video (vóór de set-regels, zodat "video Set 3 34kg" heel blijft)
  .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo)?\s*(?:ook\s+)?gefilmd\b/gi," ")                     // "49 ook gefilmd"
  .replace(/(?<![\d.,-]\s*)\b(?:[1-9]|1[0-2])(?=\s*(?:video|filmpje)\b(?!\s+van))/gi," ")         // "5 video" = set 5 op video (niet "71 Filmpje van")
  .replace(/\b(?:gerept|gedaan|gehaald)\s*x\s*(\d{1,2})\b/gi," $1 reps ")                       // "85kg gerept x 3" = 3 reps
  .replace(/\b(?:eerste|tweede|derde|vierde|vijfde|zesde|volgende)\b(?:\s+(?:set|setje|serie|ronde))?\s*:?(?=\s*\d)/gi," # ") // "Eerste set 10", "Tweede 12": # markeert "hier komt een gewicht"
  .replace(/\b(?:set|sets|serie|series|ronde|rondes|round|rounds)\s*(\d{1,2})(?!\d|[.,]\d)\s*[:\-–]?\s*(?=\d|zonder|leeg|bw\b)/gi," ") // "Set 1 32kg", "Set 2-70"
  .replace(/\b(?:set|sets|serie|series|ronde|rondes|round|rounds)\s*\d{1,2}(?!\d|[.,]\d)\s*[:\-–]/gi," ") // "Set 1:"
  .replace(/\b(?:filmpjes?|video'?s?)\s+van\s+(?:\d+(?:[.,]\d+)?(?:\s*(?:kg|kilo))?(?:\s*(?:[-&,\/]|\ben\b)\s*|\s+|$))+/gi," ") // "filmpje van 70-74-75"
  .replace(/\b\d+(?:[.,]\d+)?(?:\s*(?:kg|kilo))?(?:\s*(?:[&,\/]|\ben\b)\s*\d+(?:[.,]\d+)?(?:\s*(?:kg|kilo))?)?\s*op\s+video/gi," ") // "80&82,5 op video"
  .replace(/\+\s*blok\b/gi," ")                                                                 // "42+blok"
  .replace(/\b2\s*x\s*(?=\d+(?:[.,]\d+)?\s*(?:kg|kilo)?\s*(?:db|dbs|dumbbells?|dumbells?)\b)/gi," ") // "2x15kg dbs" = twee dumbbells van 15
  .replace(/(?<!\d\s*)\bx\s*2\b(?!\s*(?:[.,]\d|kg|kilo|reps?|sets?))/gi," ")                    // "dus x2" (maar niet "12 x 2 kg")
  .replace(/(?<=\d),(?=(\d+)(?!\d))/g,(m,b)=>(b==="5"||b==="25"||b==="75"||b==="0")?",":" ");  // "81,82,83" zijn drie getallen; "52,5" blijft
const setsNum=s=>parseFloat(String(s).replace(",","."));
const setsIsInt=s=>/^\d+$/.test(String(s));
// Setnummers vooraan ("1-90 2-95 3 100 4 - 105", "1 45 2 50"): oplopend vanaf 1, elk gevolgd door een gewicht.
// Ook aan het gewicht geplakt ("587.5" = set 5 op 87,5). Pas na twee herkende nummers geldt het.
function setsNummersWeg(t){
  const re=/(?<![\d.,])(\d{1,3}(?:[.,]\d+)?)(?!\d|[.,]\d)(\s*[-:–]?)/g;
  let verwacht=1,vorigKg=null,uit="",pos=0,n=0,m;
  while((m=re.exec(t))){
    const s=m[1],v=setsNum(s),rest=t.slice(m.index+m[0].length);
    const volgend=(rest.match(/^\s*(\d+(?:[.,]\d+)?)/)||[])[1];
    const gevolgd=/^\s*(?:\d|zonder|leeg|bw\b|zelfde)/.test(rest);
    if(gevolgd&&setsIsInt(s)&&v===verwacht&&v<=15){ // los setnummer, gevolgd door het gewicht
      uit+=t.slice(pos,m.index)+" ";pos=m.index+m[0].length;verwacht++;n++;
      if(volgend!=null)vorigKg=setsNum(volgend);
      continue;
    }
    if(n>=1&&s.length>=3&&s[0]===String(verwacht)&&!/^0/.test(s.slice(1))){ // setnummer aan het gewicht geplakt: "587.5"
      const rem=setsNum(s.slice(1));
      if(rem>=5&&rem<=400&&(vorigKg==null||(rem>=vorigKg*.5&&rem<=vorigKg*1.6))&&(v>250||(vorigKg!=null&&v>vorigKg*2))){
        uit+=t.slice(pos,m.index)+" "+s.slice(1)+m[2];pos=m.index+m[0].length;verwacht++;n++;vorigKg=rem;continue;
      }
    }
    if(n>=1&&v>15)vorigKg=v;
  }
  if(n<2)return t;
  return uit+t.slice(pos);
}
// Reps-lijsten: "5-5-5-5-4", "5,5,5,4,5 reps", "Reps gehaald: 4-4-4-4-2", "12/12-12/12-12/12", "Kg:28-30-34 Reps:8-8-"
function setsRepsLijst(t,schema){
  t=String(t||"").replace(/[–—]/g,"-");
  const uit={reps:null,kg:null,bron:""};
  let m=t.match(/\bkg\s*:\s*(\d+(?:[.,]\d+)?(?:\s*[-\/]\s*\d+(?:[.,]\d+)?)+)/i);
  if(m)uit.kg=m[1].split(/\s*[-\/]\s*/).map(setsNum);
  m=t.match(/\breps?\s*(?:gehaald|gedaan)?\s*:\s*(\d{1,2}(?:\s*[-\/,]\s*\d{1,2})+)\b/i);
  if(m){uit.reps=m[1].split(/\s*[-\/,]\s*/).map(x=>parseInt(x,10));uit.bron="reps-woord";return uit;}
  m=t.match(/^\s*(\d(?:,\d){2,})\s*(?:reps?)?\b/);
  if(m){uit.reps=m[1].split(",").map(x=>parseInt(x,10));uit.bron="komma";return uit;}
  m=t.match(/(?:^|[^\d.,-])(\d{1,2}(?:,5)?(?:\s*-\s*\d{1,2}(?:,5)?){2,})(?!\s*(?:[.,]\d|kg|kilo))/);
  if(m){
    const l=m[1].split(/\s*-\s*/).map(x=>parseInt(x,10));
    const r=schema&&typeof schema.reps==="number"?schema.reps:null;
    if(l.every(x=>x<=15)&&r!=null&&l.every(x=>x<=r+1&&x>=Math.max(1,r-4))){uit.reps=l;uit.bron="streepjes";return uit;}
  }
  const paren=[...t.matchAll(/(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*(?:kg|kilo|[.,]\d))/g)].map(x=>parseInt(x[1],10));
  if(paren.length>=2&&paren.every(x=>x<=30)){uit.reps=paren;uit.bron="paren";return uit;}
  // Twee reeksen: een kleine (reps) en een grote (kilo's): "4 sets 12-12-12-10 25-31-38-45"
  const reeksen=[...t.matchAll(/(?<![\d.,-])(\d{1,3}(?:[.,]\d+)?(?:\s*-\s*\d{1,3}(?:[.,]\d+)?){2,})(?![\d.,-])/g)].map(x=>x[1].split(/\s*-\s*/).map(setsNum));
  if(reeksen.length===2){
    const klein=reeksen.find(l=>l.every(x=>Number.isInteger(x)&&x<=20)),groot=reeksen.find(l=>l.some(x=>x>15)&&l!==klein);
    if(klein&&groot&&klein.length===groot.length){uit.reps=klein;uit.kg=groot;uit.bron="twee";return uit;}
  }
  return uit;
}
function setsUitTekst(tekst,schema){
  const ruw=String(tekst||"");
  const lijst=setsRepsLijst(ruw,schema);
  let t=setsSchoon(ruw);
  if(lijst.bron==="komma")t=t.replace(/^\s*\d(?:\s\d){2,}\s*(?:reps?)?/,""); // de kommalijst is al gelezen
  if(lijst.bron==="reps-woord")t=t.replace(/\breps?\s*(?:gehaald|gedaan)?\s*:\s*\d{1,2}(?:\s*[-\/,]\s*\d{1,2})+\b/i," ");
  if(lijst.bron==="streepjes")t=t.replace(/(?:^|[^\d.,-])\d{1,2}(?:,5)?(?:\s*-\s*\d{1,2}(?:,5)?){2,}(?!\s*(?:[.,]\d|kg|kilo))/," ");
  if(lijst.kg)t=t.replace(/\bkg\s*:\s*\d+(?:[.,]\d+)?(?:\s*[-\/]\s*\d+(?:[.,]\d+)?)+/i," ");
  // Veel verhaal in de tekst: een los klein getal is dan meestal geen gewicht ("wel 15 voor de techniek")
  const woorden=(ruw.match(/[A-Za-zÀ-ÿ]{2,}/g)||[]).filter(w=>!/^(?:kg|kilo|kilos|reps?|x|set|sets)$/i.test(w)).length;
  if(lijst.bron==="paren")t=t.replace(/(\d{1,2})\s*\/\s*(\d{1,2})(?!\s*(?:kg|kilo|[.,]\d))\s*@?/g," ");
  if(lijst.bron==="twee")t=t.replace(/(?<![\d.,-])\d{1,3}(?:[.,]\d+)?(?:\s*-\s*\d{1,3}(?:[.,]\d+)?){2,}(?![\d.,-])/g," ");
  t=t.replace(/(?<![\d.,])\d+(?:[.,]\d+)?\s*:\s*(?=[A-Za-zÀ-ÿ])/g," "); // "43: je ziet dat..." verwijst naar een set, is geen nieuwe set
  t=setsNummersWeg(t);
  // "14@12,5 7@15": staat ergens reps@kg met een halve kilo, dan is dat de stijl van de hele regel
  const atRepsKg=/\d+\s*@\s*\d+[.,]\d/.test(t);
  const repsBereik=schema&&typeof schema.reps==="string"&&/^\d+-\d+$/.test(schema.reps)?schema.reps.split("-").map(x=>parseInt(x,10)):null;
  const rows=[];
  let laatste=null,laatsteKg=null,explicietReps=false;
  let pend=null,laatsteDir=null,dirGebruikt=false; // "3×2 sets" of "3 sets": geldt voor het eerstvolgende gewicht
  const schemaKg=schema&&(schema.kg!=null?schema.kg:(schema.kg_start!=null?schema.kg_start:null));
  const schemaReps=schema&&typeof schema.reps==="number"?schema.reps:null;
  const rij=(kg,reps,opts)=>{
    const r={kg:kg==null?"":kgTxt(kg),reps:reps==null?"":String(reps),fail:false};
    // Herkansing na een mislukte set ("90 kilo ❌ 86 kilo"): zelfde reps als de mislukte poging
    if(reps==null&&!pend&&laatste&&laatste.fail&&laatste.reps){r.reps=laatste.reps;r.herkansing=true;}
    if(opts&&opts.bron)r.repsBron=opts.bron;
    rows.push(r);laatste=r;return r;
  };
  // Gewicht na een directief ("3 sets gedaan met 25 kilo"): reps uit het directief, zoveel rijen als sets
  const plaats=(r)=>{
    if(!pend)return false;
    if(!r.reps&&pend.reps!=null)r.reps=String(pend.reps);
    for(let i=1;i<Math.min(pend.sets,12);i++)rows.push(Object.assign({},r));
    pend=null;dirGebruikt=true;laatsteKg=null;return true;
  };
  const dir=(sets,reps)=>{if(sets<1||sets>10)return;pend={sets,reps};laatsteDir=pend;laatsteKg=null;};
  const zwaarGelogd=()=>rows.some(r=>(leesKg(r.kg)||0)>15);
  // "Alles gelukt / allemaal gehaald" bij een vast gewicht: het hele schema is gedaan; de tekst kan daarna nog iets aanpassen
  const grootGetal=/(?<![\d.,])(?:1[6-9]|[2-9]\d|\d{3})(?:[.,]\d+)?(?!\s*(?:reps?|rir|rpe|min|sec|%|e\b))/i.test(t);
  if(!grootGetal&&/\b(?:alles|allemaal|alle\s+sets)\s+(?:gelukt|gehaald|gedaan)\b/i.test(ruw)&&schemaKg!=null&&schema&&schema.sets>1&&(schemaReps!=null||Array.isArray(schema.reps_lijst))){
    for(let i=0;i<Math.min(schema.sets,12);i++)rij(schemaKg,schemaReps!=null?schemaReps:schema.reps_lijst[Math.min(i,schema.reps_lijst.length-1)]);
    explicietReps=true;
  }
  // "95 kg" na een rij met alleen reps ("5 reps 88 kg"): samenvoegen
  let laatsteKgEind=0; // positie in de tekst direct na de laatste "N kg"-rij (voor "17,5 kilo: 12")
  const kgRij=(kg,eind)=>{
    if(laatste&&!laatste.kg&&laatste.reps&&!laatste.fail){laatste.kg=kgTxt(kg);laatsteKg=null;return laatste;}
    const r=rij(kg,null);if(!plaats(r)){laatsteKg=r.reps?null:r;laatsteKgEind=eind||0;}return r;
  };
  // "10 reps": bij de laatste rij zonder reps; na een mislukte set een herkansing op hetzelfde gewicht;
  // met "rest/alles" ervoor voor alle rijen zonder reps; met "laatste" ervoor voor de laatste rij.
  const repsLos=(reps,voorTekst)=>{
    if(reps>30)return; // "75 rep" is geen aantal reps
    explicietReps=true;laatsteKg=null;
    if(SETS_ALLE.test(voorTekst)){let n=0;rows.forEach(r=>{if(!r.reps){r.reps=String(reps);n++;}});if(n)return;}
    if(SETS_LAATSTE.test(voorTekst)&&rows.length){rows[rows.length-1].reps=String(reps);return;}
    if(laatste&&!laatste.reps){laatste.reps=String(reps);return;}
    if(laatste&&laatste.repsBron==="dash"&&laatste.reps){laatste.reps=String(reps);delete laatste.repsBron;return;} // "8 - 95KG 7 reps"
    if(laatste&&laatste.kg&&(laatste.fail||/\b(?:redo|opnieuw|herkansing|nog een keer|nogmaals)\b/i.test(voorTekst))){const r=rij(leesKg(laatste.kg),reps);r.herkansing=true;return;} // "fail ... 3 rep gelukt", "redo: 3 rep"
    rij(null,reps);
  };
  let m;SETS_TOKEN.lastIndex=0;
  while((m=SETS_TOKEN.exec(t))){
    const voor=t.slice(Math.max(0,m.index-24),m.index);
    if(m[1]!=null){rij(setsNum(m[2]),parseInt(m[1],10));explicietReps=true;laatsteKg=null;continue;}         // "heavy 2 was 100"
    if(m[3]!=null){rij(setsNum(m[3]),parseInt(m[4],10));explicietReps=true;laatsteKg=null;continue;}         // "66(6)"
    if(m[5]!=null){rij(m[6]!=null?setsNum(m[6]):null,parseInt(m[5],10));explicietReps=true;laatsteKg=null;continue;} // "12/12(5kg)"
    if(m[7]!=null){ // A x B
      const a=setsNum(m[7]),b=setsNum(m[10]),kgVoor=!!m[8],kgNa=!!m[11],kruis=m[9]==="×",woord=!!m[12];
      if(woord&&setsIsInt(m[7])&&setsIsInt(m[10])&&a<=15&&b<=30){dir(a,b);continue;}                  // "3×2 sets", "3x 6 reps"
      if(woord&&/sets?|series/i.test(m[12])&&a>15&&setsIsInt(m[10])&&b<=15){const r=rij(a,null);for(let i=1;i<b;i++)rows.push(Object.assign({},r));laatsteKg=null;continue;} // "40x5 sets" = 5 sets van 40
      if(kruis||kgVoor){rij(a,setsIsInt(m[10])?b:null);explicietReps=true;laatsteKg=null;continue;} // "2×12", "2 kg x 12" = kg × reps
      if(kgNa){rij(b,setsIsInt(m[7])?a:null);explicietReps=true;laatsteKg=null;continue;}            // "12 x 2 kg" = reps × kg
      if(setsIsInt(m[7])&&setsIsInt(m[10])&&a<=15&&b<=15){dir(a,b);continue;}                         // "5x5" = sets x reps
      if(a<=15&&setsIsInt(m[7])&&b>15){                                                                  // "5x120" = reps x kg; bij singles "2x 117,5" = 2 sets van 1
        if(schemaReps===1&&a<=5){const r=rij(b,1);for(let i=1;i<a;i++)rows.push(Object.assign({},r));}
        else rij(b,a);
        explicietReps=true;
      }
      else{rij(a,setsIsInt(m[10])?b:null);explicietReps=true;}                                           // "120x5" = kg x reps
      laatsteKg=null;continue;
    }
    if(m[13]!=null){dir(parseInt(m[13],10),m[14]!=null?parseInt(m[14],10):null);continue;}            // "3x reps", "3 sets", "3 sets van 5"
    if(m[15]!=null){rij(setsNum(m[16]),parseInt(m[15],10));explicietReps=true;laatsteKg=null;continue;} // "5 reps @ 100"
    if(m[17]!=null){rij(setsNum(m[18]),parseInt(m[17],10));explicietReps=true;laatsteKg=null;continue;} // "11: 70 kilo"
    if(m[19]!=null){ // "12 - 80KG" = reps - kg (reps t/m 30), anders twee gewichten
      const a=parseInt(m[19],10),b=setsNum(m[20]);
      if(a<=30){rij(b,a,{bron:"dash"});explicietReps=true;laatsteKg=null;}else{kgRij(a);kgRij(b);}
      continue;
    }
    if(m[21]!=null){ // "35-12" = kg - reps (alleen los, niet in een reeks); "30-35" zijn twee gewichten
      const a=setsNum(m[21]),b=parseInt(m[22],10);
      if(a>15&&b<=30){rij(a,b,{bron:"dash"});explicietReps=true;laatsteKg=null;continue;}
      kgRij(a);kgRij(b);continue;
    }
    if(m[23]!=null){ // "3@88" (reps@kg), "88@3" (kg@reps), "14@12,5" (reps@kg bij dumbbells)
      const a=setsNum(m[23]),b=setsNum(m[24]);
      const aInt=setsIsInt(m[23]),bInt=setsIsInt(m[24]);
      const inBereik=repsBereik&&a>=repsBereik[0]-2&&a<=repsBereik[1]+1;
      if(aInt&&a<=30&&(!bInt||b>15||atRepsKg||inBereik||(schemaReps!=null&&Math.abs(a-schemaReps)<=4&&Math.abs(b-schemaReps)>4)))rij(b,a);
      else rij(a,bInt?b:null);
      explicietReps=true;laatsteKg=null;continue;
    }
    if(m[25]!=null){kgRij(setsNum(m[25]),m.index+m[0].length);continue;}                              // "95 kg"
    if(m[26]!=null){repsLos(parseInt(m[26],10),voor);continue;}                                        // "10 reps"
    if(m[27]!=null){ // los getal: reps bij een "N kg"-rij zonder reps, anders een gewicht
      const v=setsNum(m[27]);
      const naSet=/#\s*$/.test(voor); // "Eerste set 10": na het setwoord komt het gewicht
      const direct=laatsteKg&&!/[A-Za-zÀ-ÿ]/.test(t.slice(laatsteKgEind,m.index)); // "17,5 kilo: 12", niet "40 kg Opgebouwd: 25"
      if(!naSet&&direct&&(setsIsInt(m[27])||/^\d{1,2}[.,]5$/.test(m[27]))&&v<=30){laatsteKg.reps=String(Math.floor(v));laatsteKg=null;explicietReps=true;continue;}
      laatsteKg=null;
      const inReeks=/[-–]\s*$/.test(voor)||/^\s*[-–]\s*\d/.test(t.slice(m.index+m[0].length)); // "7,5-10-11": deel van een reeks
      if(!naSet&&!inReeks&&setsIsInt(m[27])&&v<=15&&zwaarGelogd())continue; // "in plaats van 5": geen set
      if(!naSet&&!inReeks&&setsIsInt(m[27])&&v<=15&&schemaKg!=null&&schemaKg>=20)continue; // klein getal bij een barbell-oefening: geen gewicht
      if(!naSet&&!inReeks&&setsIsInt(m[27])&&v<=15&&woorden>=4)continue; // klein getal midden in een verhaal: geen gewicht
      if(laatste&&!laatste.kg&&laatste.reps&&!laatste.fail){kgRij(v);continue;} // "10 reps 8,5": kilo's bij de rij met alleen reps
      plaats(rij(v,null));continue;
    }
    if(m[28]!=null&&rows.length)rows[rows.length-1].fail=true; // "ging niet"
  }
  // Opschonen vóór het koppelen: onmogelijke gewichten en kleine getallen bij een zware oefening
  const junk=r=>{const kg=leesKg(r.kg);if(kg==null)return false;if(kg>320||kg<2)return true;return schemaKg!=null&&schemaKg>=20&&kg<schemaKg/3&&kg<=15;};
  for(let i=rows.length-1;i>=0;i--)if(junk(rows[i]))rows.splice(i,1);
  if(laatste&&!rows.includes(laatste))laatste=rows[rows.length-1]||null;
  // Directief zonder gewicht erna ("5x5", "3 sets gedaan") met een vast gewicht in het voorschrift
  if(pend&&!rows.length&&schemaKg!=null){const r=rij(schemaKg,pend.reps!=null?pend.reps:null);for(let i=1;i<Math.min(pend.sets,12);i++)rows.push(Object.assign({},r));pend=null;dirGebruikt=true;}
  // Reps-lijst koppelen aan de rijen (op volgorde); zonder kilo-rijen worden het rijen met alleen reps
  if(lijst.reps){
    const kgs=lijst.kg||null;
    if(kgs&&!rows.length)kgs.forEach(k=>rij(k,null));
    const doel=rows.filter(r=>r.kg);
    if(doel.length===1&&lijst.reps.length>1&&!doel[0].reps){ // "5-5-5-5-4 97kg": één gewicht voor alle sets
      const kg=leesKg(doel[0].kg);rows.splice(rows.indexOf(doel[0]),1);
      lijst.reps.forEach(x=>rij(kg,x));
    }
    else if(doel.length){let k=0;doel.forEach(r=>{if(!r.reps&&k<lijst.reps.length)r.reps=String(lijst.reps[k++]);});}
    else{
      const enkelKg=rows.length===1&&rows[0].kg&&!rows[0].reps?leesKg(rows[0].kg):null;
      if(enkelKg!=null)rows.length=0;
      const kg=enkelKg!=null?enkelKg:schemaKg;
      lijst.reps.forEach(x=>rij(kg,x));
    }
    explicietReps=true;
  }
  // Rijen met reps maar zonder kilo's: het vaste gewicht uit het voorschrift
  if(schemaKg!=null)rows.forEach(r=>{if(!r.kg&&r.reps)r.kg=kgTxt(schemaKg);});
  // Reps voor rijen zonder reps: uit het voorschrift, anders uit het laatste directief ("5x5")
  const defReps=schemaReps!=null?schemaReps:(laatsteDir&&laatsteDir.reps!=null?laatsteDir.reps:null);
  rows.forEach(r=>{if(!r.reps&&defReps!=null)r.reps=String(defReps);});
  // Reps-lijst uit het schema (11-9-7-5): per set op volgorde; een herkansing telt niet als nieuwe set
  if(schema&&Array.isArray(schema.reps_lijst)&&schema.reps_lijst.length){
    let k=0;
    rows.forEach(r=>{if(r.herkansing)return;if(!r.reps)r.reps=String(schema.reps_lijst[Math.min(k,schema.reps_lijst.length-1)]);k++;});
  }
  // Opschonen: een enkel klein getal zonder context is geen set
  let uit=rows.filter(r=>!junk(r));
  if(uit.length===1&&!explicietReps&&leesKg(uit[0].kg)!=null&&leesKg(uit[0].kg)<=5&&!/\b(?:kg|kilo)\b/i.test(ruw))uit=[];
  uit.forEach(r=>{delete r.herkansing;delete r.repsBron;});
  // Eén gewicht voor N sets: N rijen ter bevestiging (alleen bij een korte log zonder verhaal)
  const n=(laatsteDir&&!dirGebruikt&&laatsteDir.sets)||(schema&&schema.sets)||0;
  const dirOpen=!!(laatsteDir&&!dirGebruikt&&laatsteDir.sets>1); // "15kg 6 reps x 3 sets": het directief geldt voor die ene rij
  if(uit.length===1&&n>1&&(dirOpen||(!explicietReps&&woorden===0))){const basis=uit[0];for(let i=1;i<Math.min(n,12);i++)uit.push(Object.assign({},basis));}
  return {rows:uit,gelezen:setsSamenvatting(uit)};
}

// ---------- Krachtcijfers van een klant (dashboard): log, records, echte 1RM ----------
// Eén lading per klant: de hele krachtlog (lift_log: elke set met PR-merkje) en
// de metingen die bij een lift horen (metric_name). Daaruit komen de records
// per lift en per aantal reps, de cijfers onder een lift in de bouwer en het
// lift-scherm bij Metingen & PR's. Wordt ongeldig bij een nieuwe score (live).
const KL={client:null,log:[],metrics:[],geladen:false,bezig:null};
const KL_MND=["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
function klDatum(ds){
  if(!ds)return "";
  const d=new Date(String(ds).slice(0,10)+"T12:00:00");if(isNaN(d))return String(ds);
  return d.getDate()+" "+KL_MND[d.getMonth()]+(d.getFullYear()!==new Date().getFullYear()?" "+d.getFullYear():"");
}
async function klLaad(clientId,vers){
  if(!clientId)return KL;
  if(KL.client===clientId&&KL.geladen&&!vers)return KL;
  if(KL.client===clientId&&KL.bezig)return KL.bezig;
  KL.client=clientId;KL.geladen=false;
  KL.bezig=(async()=>{
    try{
      await liftsLaad();
      const namen=[...new Set(LIFTS.lijst.map(l=>l.metric_name).filter(Boolean))];
      const[log,mx]=await Promise.all([
        db.rpc("lift_log",{p_athlete:clientId}),
        namen.length?db.from("metrics").select("metric,value,measured_at,result_id").eq("athlete_id",clientId).in("metric",namen):Promise.resolve({data:[]})
      ]);
      if(KL.client!==clientId)return KL;
      KL.log=(log&&log.data)||[];KL.metrics=(mx&&mx.data)||[];
    }catch(e){KL.log=[];KL.metrics=[];}
    KL.geladen=true;KL.bezig=null;return KL;
  })();
  return KL.bezig;
}
// Na een live wijziging (score uit de app, correctie door de coach): opnieuw laden bij de volgende vraag.
function klOngeldig(clientId){if(!clientId||KL.client===clientId)KL.geladen=false;}
// Records per lift en per aantal reps: {lift_id:{lift_id,lift,category,reps:{5:{kg,date,result_id}}}}
function klRecords(){
  const uit={};
  KL.log.forEach(g=>{
    if(g.kg==null||g.reps==null||g.fail)return;
    const kg=+g.kg;
    const l=uit[g.lift_id]||(uit[g.lift_id]={lift_id:g.lift_id,lift:g.lift,category:g.category,reps:{}});
    const r=l.reps[g.reps];
    if(!r||kg>r.kg||(kg===r.kg&&g.workout_date<r.date))l.reps[g.reps]={kg,date:g.workout_date,result_id:g.result_id};
  });
  return uit;
}
function klBeste(liftId,reps){const l=klRecords()[liftId];return l&&l.reps[reps]?l.reps[reps]:null;}
// Echte 1RM van een lift: de hoogste meting op de metric van die lift (Metingen
// & PR's, handmatig of automatisch uit een gelogde single), anders de beste
// gelukte single uit de log. Nooit een schatting.
function klEenRm(liftId){
  const l=liftVan(liftId);let best=null;
  if(l&&l.metric_name)KL.metrics.forEach(m=>{if(m.metric===l.metric_name&&m.value!=null&&(!best||+m.value>best.kg))best={kg:+m.value,date:m.measured_at,bron:"meting"};});
  const s=klBeste(liftId,1);
  if(s&&(!best||s.kg>best.kg))best={kg:s.kg,date:s.date,bron:"log"};
  return best;
}
// Vorige keer: de sets van de laatste trainingsdag met deze lift (vóór een datum, als die er is).
function klVorige(liftId,voorDatum){
  const rows=KL.log.filter(g=>g.lift_id===liftId&&(!voorDatum||g.workout_date<voorDatum));
  if(!rows.length)return null;
  const d=rows[0].workout_date; // lift_log is nieuwste eerst
  const sets=rows.filter(g=>g.workout_date===d).slice().sort((a,b)=>(a.set_nr||0)-(b.set_nr||0));
  return {date:d,sets,tekst:setsTekst(sets)};
}
