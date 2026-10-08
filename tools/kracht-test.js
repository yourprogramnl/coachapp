// Test van app/kracht.js (coachapp) met Node: schema-lezer, liftherkenning en
// superset-splitser op echte voorschriften uit de database. Draai:
//   node kracht-test.js            (alleen vaste gevallen)
//   node kracht-test.js --alle     (ook alle Special Strength-templates ophalen)
const fs=require("fs");
const src=fs.readFileSync(__dirname+"/../app/kracht.js","utf8");
const K=new Function("db","TPLKLEUREN",src+"\nreturn {liftNorm,liftEnkel,liftMatch,schemaLees,schemaTekst,ssOnderdelen,ssTitel,tplBlokken,blokkenMetLabels,LIFTS};")(null,["yellow","blue","purple","red","green","orange"]);
let fouten=0;
const gelijk=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function check(naam,kreeg,verwacht){
  const ok=gelijk(kreeg,verwacht);
  if(!ok){fouten++;console.log("FOUT  "+naam+"\n   kreeg:    "+JSON.stringify(kreeg)+"\n   verwacht: "+JSON.stringify(verwacht));}
  else console.log("ok    "+naam);
}
const NL="\n";

// ---- liftherkenning (zelfde lijst als in de database, verkort; alleen wat een YP-coach ziet) ----
K.LIFTS.lijst=[
  {id:"bs",name:"Back Squat",aliases:["back squat","backsquat","barbell back squat","back squats"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"bps",name:"Back Pause Squat",aliases:["pause back squat","paused back squat","pause squat"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"sp",name:"Shoulder Press",aliases:["strict press","press","barbell strict press"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"bor",name:"Bent Over Row",aliases:["bent-over row","bent over barbell row"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"cj",name:"Clean & Jerk",aliases:["clean and jerk","c&j"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"dss",name:"Dumbbell Split Squat",aliases:["db split squat"],company_id:"yp",created_at:"2026-10-08T10:00:00Z"},
  {id:"drdl",name:"Dumbbell Romanian Deadlift",aliases:["db rdl","staggered stance rdl"],company_id:"yp",created_at:"2026-10-08T10:00:00Z"},
  {id:"wpu_std",name:"Weighted Pull-up",aliases:["weighted pull up"],company_id:null,created_at:"2026-09-28T18:00:00Z"},
  {id:"wpu_yp",name:"Weighted Pull-Up",aliases:["weighted pull up"],company_id:"yp",created_at:"2026-10-08T10:00:00Z"},
];
const lm=n=>{const l=K.liftMatch(n);return l?l.id:null;};
check("lift: Back Squat",lm("Back Squat"),"bs");
check("lift: back squats (meervoud)",lm("back squats"),"bs");
check("lift: Paused Back Squat (alias)",lm("Paused Back Squat"),"bps");
check("lift: Barbell Strict Press -> Shoulder Press",lm("Barbell Strict Press"),"sp");
check("lift: Bent Over Barbell Rows",lm("Bent Over Barbell Rows"),"bor");
check("lift: Clean and Jerk",lm("Clean and Jerk"),"cj");
check("lift: C&J",lm("C&J"),"cj");
check("lift: Dumbbell Split Squats (eigen, meervoud)",lm("Dumbbell Split Squats"),"dss");
check("lift: Special Strength (…) = niets",lm("Special Strength (Back Squat / Dumbbell Walking Lunges)"),null);
check("lift: Accessory = niets",lm("Accessory"),null);
check("lift: eigen lift wint van standaard (Weighted Pull-Up)",lm("weighted pull-up"),"wpu_yp");
check("lift: leeg",lm(""),null);

// ---- schema-lezer ----
const S=K.schemaLees;
check("schema: 5 reps @95 kilo; rest 2 min. x 5 sets.",S("5 reps @95 kilo; rest 2 min. x 5 sets."+NL+NL+"Ik verhoog per week het gewicht."),{kg:95,rust:"2 min",sets:5,reps:5});
check("schema: 8-12 reps @3010; rest 2 min. x 3 sets + vanaf",S("8-12 reps @3010; rest 2 min. x 3 sets"+NL+"Werksets vanaf 45 kilo."),{tempo:"3010",kg_start:45,rust:"2 min",sets:3,reps:"8-12"});
check("schema: 5 x 3 @ 80%; rust 2 min.",S("5 x 3 @ 80%; rust 2 min."),{pct:80,rust:"2 min",sets:5,reps:3});
check("schema: 4 × 6 @ 70%",S("4 × 6 @ 70%"),{pct:70,sets:4,reps:6});
check("schema: 3-2-1-1 reps; rest as needed",S("3-2-1-1 reps; rest as needed in between sets."),{rust:"as needed",reps_lijst:[3,2,1,1],sets:4});
check("schema: 12-10-8-6 reps @controle",S("12-10-8-6 reps @controle; rest 2 min. in between sets."),{rust:"2 min",reps_lijst:[12,10,8,6],sets:4});
check("schema: Heavy 3 in 15 minutes",S("Heavy 3 in 15 minutes."+NL+NL+"*Noteer je behaalde gewicht;"),{reps:3});
check("schema: Heavy triple in max. 6 sets",S("Heavy triple for the day in max. 6 sets."),{sets:6,reps:3});
check("schema: Build to a 1RM",S("Build to a 1RM."+NL+NL+"*Noteer je behaalde gewicht;"),{opbouw:true,reps:1});
check("schema: 1 rep @building x 5 sets + startgewicht",S("1 rep @building; rest 3-4 min. x 5 sets."+NL+NL+"Startgewicht = 170 kilo."),{kg:170,rust:"3-4 min",opbouw:true,sets:5,reps:1});
check("schema: 5 reps pause + gewicht bereik + pct",S("5 reps @3 sec. pause @parallel; rest 2-3 min. x 5 sets."+NL+"Gewicht = 125-133 kilo (65-70% 1RM)."),{pct:65,pct_tot:70,kg:125,kg_tot:133,rust:"2-3 min",sets:5,reps:5});
check("schema: 2 reps @78-85 kilo",S("2 reps @78-85 kilo; rest 2 min. x 3 sets."),{kg:78,kg_tot:85,rust:"2 min",sets:3,reps:2});
check("schema: 10/10 reps @3010 per kant",S("10/10 reps @3010; rest 2 min. x 4 sets."),{tempo:"3010",rust:"2 min",sets:4,reps:10,per_kant:true});
check("schema: 12-15 reps per kant @2010",S("12-15 reps per kant @2010; rest 2 min. x 3 sets"),{tempo:"2010",rust:"2 min",sets:3,reps:"12-15",per_kant:true});
check("schema: regel begint met aantal (8-12 Back Squats @3010)",S("8-12 Back Squats @3010;"+NL+"24 Dumbbell Walking Lunges;"+NL+"Rest 2 min. x 3 sets."),{tempo:"3010",rust:"2 min",sets:3,reps:"8-12"});
check("schema: 8-12RM bench press",S("8-12RM bench press @ 30X0 @ 1-2 RIR (reps in reserve)"+NL+"rest 2 min x 4 sets"),{tempo:"30X0",rust:"2 min",sets:4,reps:"8-12"});
check("schema: 4 x 30 sec is geen reps",S("4 x 30 sec tegen de muur; rust 60 sec."),{rust:"60 sec"});
check("schema: 75 seconds is geen reps",S("75 seconds; rest 2 min. x 4 sets."),{rust:"2 min",sets:4});
check("schema: EMOM zonder reps-woord",S("EMOM10:"+NL+"- 2 Power Cleans."+NL+NL+"Startgewicht = 35 kilo."),{kg:35,reps:2});
check("schema: metcon = niets",S("3 rounds for time:"+NL+"400 m run"+NL+"21 kettlebell swings"),null);
check("schema: leeg = niets",S(""),null);
check("schema: 5x5",S("5x5"),{sets:5,reps:5});
check("schematekst",K.schemaTekst({sets:5,reps:5,kg:95,tempo:"3010",rust:"2 min"}),"5 sets × 5 reps · @ 95 kg · tempo 3010 · rust 2 min");
check("schematekst lijst",K.schemaTekst({sets:4,reps_lijst:[3,2,1,1],rust:"as needed"}),"4 sets × 3-2-1-1 reps · rust as needed");

// ---- superset-splitser op echte templates ----
const T=K.ssOnderdelen;
const t303=T("Special Strength (Back Squat / Dumbbell Walking Lunges)","8-12 Back Squats @3010;"+NL+"24 Dumbbell Walking Lunges;"+NL+"Rest 2 min. x 3 sets."+NL+NL+"Push de gewichten tot falen. 12 reps behaald? Verhoog het gewicht. Je wilt altijd minimaal 8 reps halen. Haal je dit niet, verlaag het gewicht."+NL+NL+"*Noteer je gebruikte gewichten per set;"+NL+"**Voeg een video toe van je laatste set.");
check("ss 303: twee onderdelen uit de titel",t303&&t303.map(o=>[o.naam,o.reps,o.tempo,o.sets,o.rust]),[["Back Squat","8-12","3010",3,"2 min"],["Dumbbell Walking Lunges",24,null,3,"2 min"]]);
const t177=T("Special Strength (Barbell Front Foot Elevated Split Squat / Stiff Legged Deadlift)","8-12/8-12 Barbell Front Foot Elevated Split Squats @3010;"+NL+"8-12 Stiff Legged Deadlifts @3010; "+NL+"Rest 2 min. x 3 sets."+NL+NL+"Push de gewichten tot falen.");
check("ss 177: per kant + twee",t177&&t177.map(o=>[o.naam,o.reps,o.per_kant,o.tempo]),[["Barbell Front Foot Elevated Split Squat","8-12",true,"3010"],["Stiff Legged Deadlift","8-12",false,"3010"]]);
const t448=T("Special Strength (Belt Squat / Staggered Stance Dumbbell Romanian Deadlift)","Belt Squat: 15 reps @3010;"+NL+"Staggered Stance Dumbbell Romanian Deadlift: 12/12 reps @3010;"+NL+"Rest 2 min. in between sets x 3 sets."+NL+NL+"Push de gewichten tot falen.");
check("ss 448: naam: reps-vorm",t448&&t448.map(o=>[o.naam,o.reps,o.per_kant,o.sets]),[["Belt Squat",15,false,3],["Staggered Stance Dumbbell Romanian Deadlift",12,true,3]]);
const t273=T("Special strength (Bulgarian Split Squat / Nordic Hamstring Curl)","3 sets:"+NL+"8-10/8-10 Bulgarian Split Squat @ 3010 @ 1-2 RIR (reps in reserve)"+NL+"-rest 90 sec-"+NL+"max unbroken banded nordic hamstring curls @ 1 RIR (reps in reserve)"+NL+"-rest 2 min-"+NL+NL+"*Noteer je gebruikte gewichten per set;");
check("ss 273: 3 sets: + rust per regel + max",t273&&t273.map(o=>[o.naam,o.reps,o.tempo,o.sets,o.rust]),[["Bulgarian Split Squat","8-10","3010",3,"90 sec"],["Nordic Hamstring Curl","max",null,3,"2 min"]]);
const t351=T("Special Strength (belt Squat / staggered Stance RDL)","8-12 belt squats @ 30X0 @ 2-3 RIR (reps in reserve)"+NL+"rest 1 min"+NL+"8-12 reps per been Staggered Stance RDL @ 30X0 @ 2-3 RIR (reps in reserve)"+NL+"rest 2 min x 3 sets");
check("ss 351: rust tussen regels, reps per been",t351&&t351.map(o=>[o.naam,o.reps,o.tempo,o.sets,o.rust,o.per_kant]),[["belt Squat","8-12","30X0",3,"1 min",false],["staggered Stance RDL","8-12","30X0",3,"2 min",true]]);
const t51=T("Special strength (bench press / bent over barbell row)","8-12RM bench press @ 30X0 @ 1-2 RIR (reps in reserve)"+NL+"rest 2 min"+NL+"8-12RM bent over barbell row @ 20X0 @ 1-2 RIR (reps in reserve)"+NL+"rest 2 min x 4 sets");
check("ss 51: 8-12RM-vorm",t51&&t51.map(o=>[o.naam,o.reps,o.tempo,o.sets,o.rust]),[["bench press","8-12","30X0",4,"2 min"],["bent over barbell row","8-12","20X0",4,"2 min"]]);
const t182=T("Special Strength (Alternating Lunge / Sorenson Hold)","24 alternating Lunges;"+NL+"15-30 seconds Sorenson Hold;"+NL+"Rest 2 min. x 3 sets.");
check("ss 182: seconden-onderdeel herkend",t182&&t182.map(o=>[o.naam,o.reps,o.maat||null,o.sets]),[["Alternating Lunge",24,null,3],["Sorenson Hold",null,"15-30 seconds",3]]);
const t438=T("special strength (barbell hip thruster / sandbag carry)","6-8 barbell hip thrusters @ 20X1 @ 1-2 RIR (reps in reserve)"+NL+"-rest 90 sec-"+NL+"30m sandbag carry @ tough sandbag"+NL+"-rest 2 min-"+NL+"x 3 sets");
check("ss 438: meters-onderdeel + rust per regel",t438&&t438.map(o=>[o.naam,o.reps,o.maat||null,o.rust,o.sets]),[["barbell hip thruster","6-8",null,"90 sec",3],["sandbag carry",null,"30 m","2 min",3]]);
const t398=T("Special strength (banded hspu / LLRC and RC / Wall walks / strict C2B)","EMOM X 16:"+NL+"1) max banded strict hspu's -2 RIR"+NL+"2) 1 LLRC + 2 rope climbs (TNG, net boven de grond)"+NL+"3) 2 wall walks"+NL+"4) 6-8 strict C2B");
check("ss 398: EMOM met 1) 2) 3) 4)",t398&&t398.map(o=>[o.naam,o.reps,o.sets]),[["banded hspu","max",16],["LLRC and RC",1,16],["Wall walks",2,16],["strict C2B","6-8",16]]);
const t285=T("Special strength (CGBP/ face pulls)","Close grip bench presses @ 20X1 @ 1-2 RIR"+NL+"-rest 1 min-"+NL+"12-15 face pulls @ 2020 @ 2-3 RIR (reps in reserve)"+NL+"-rest 2 min-"+NL+"x 4 sets");
check("ss 285: regel zonder aantal vooraan",t285&&t285.map(o=>[o.naam,o.reps,o.tempo]),[["CGBP",null,"20X1"],["face pulls","12-15","2020"]]);
const t380=T("Special strength (box pistols / RDL)","5-10 reps (per kant) Box pistol @ 30X1"+NL+"rest 1 min"+NL+"8-12 Romanian deadlifts @ 30X1"+NL+"rest 2 min x 3 sets");
check("ss 380: (per kant) vóór de naam",t380&&t380.map(o=>[o.naam,o.reps,o.per_kant]),[["box pistols","5-10",true],["RDL","8-12",false]]);
check("ss: gewone template = null",T("Back Squat","5 reps @95 kilo; rest 2 min. x 5 sets."),null);
check("ss: één onderdeel = null",T("Special Strength (Back Squat)","8-12 Back Squats @3010;"+NL+"Rest 2 min. x 3 sets."),null);

// ---- template -> blokken ----
const b=K.tplBlokken({naam:"Special Strength (Dumbbell Split Squat / Dumbbell Romanian Deadlift)",kleur:"yellow",instructies:"8-12 Dumbbell Split Squats @3010;"+NL+"8-12 Dumbbell Romanian Deadlifts @3010;"+NL+"Rest 2 min. x 3 sets."+NL+NL+"Push de gewichten tot falen.",media:[{youtube_id:"abc"}]});
check("tplBlokken: twee gekoppelde blokken",b.map(x=>[x.exercise,x.linked,x.lift_id,x.group_title,!!x.media]),[["Dumbbell Split Squat",false,"dss","Special Strength",true],["Dumbbell Romanian Deadlift",true,"drdl",null,false]]);
check("tplBlokken: eerste blok draagt de hele tekst",b[0].prescription.startsWith("8-12 Dumbbell Split Squats"),true);
check("tplBlokken: tweede blok eigen regel",b[1].prescription,"8-12 Dumbbell Romanian Deadlifts @3010; rest 2 min x 3 sets.");
check("tplBlokken: schema per blok",b.map(x=>x.lift_scheme),[{sets:3,reps:"8-12",tempo:"3010",rust:"2 min"},{sets:3,reps:"8-12",tempo:"3010",rust:"2 min"}]);
check("blokkenMetLabels",K.blokkenMetLabels(b,"B",3).map(x=>[x.label,x.sort]),[["B1",3],["B2",4]]);
const e=K.tplBlokken({naam:"Back Squat",kleur:"red",instructies:"5 reps @95 kilo; rest 2 min. x 5 sets."});
check("tplBlokken: gewone template = één blok met lift en schema",[e.length,e[0].lift_id,e[0].lift_scheme,e[0].group_title],[1,"bs",{kg:95,rust:"2 min",sets:5,reps:5},null]);
check("tplBlokken: metcon splitst niet",K.tplBlokken({naam:"Hero WOD",instructies:"3 rounds for time:"+NL+"10 pull-ups"+NL+"15 push-ups"+NL+"20 squats"}).length,1);
const enkel=K.tplBlokken({naam:"Special strength (DB Bulgarian split squat)",kleur:"yellow",instructies:"8/8 reps @ 30X0"+NL+"rest 2 min x 4 sets @ 2 RIR"});
check("tplBlokken: één oefening tussen haakjes",[enkel.length,enkel[0].exercise,enkel[0].group_title,enkel[0].lift_scheme],[1,"DB Bulgarian split squat","Special strength",{tempo:"30X0",rust:"2 min",sets:4,reps:8,per_kant:true}]);
check("tplBlokken: gewone naam met haakjes blijft heel",K.tplBlokken({naam:"Dual Dumbbell Bulgarian Split Squat (Dual DB Bulgarian Split Squat)",instructies:"12/12 reps @3010; rest 2 min. x 3 sets."})[0].exercise,"Dual Dumbbell Bulgarian Split Squat (Dual DB Bulgarian Split Squat)");
// Keuze Stefan: een carry of hold voegt niets toe en krijgt geen eigen balk
const carry=K.tplBlokken({naam:"special strength (barbell hip thruster / sandbag carry)",kleur:"yellow",instructies:"6-8 barbell hip thrusters @ 20X1 @ 1-2 RIR (reps in reserve)"+NL+"-rest 90 sec-"+NL+"30m sandbag carry @ tough sandbag"+NL+"-rest 2 min-"+NL+"x 3 sets"});
check("tplBlokken: carry krijgt geen eigen blok",[carry.length,carry[0].exercise,carry[0].group_title,carry[0].prescription.includes("sandbag carry")],[1,"barbell hip thruster","special strength",true]);
const hold=K.tplBlokken({naam:"Special Strength (Alternating Lunge / Sorenson Hold)",kleur:"yellow",instructies:"24 alternating Lunges;"+NL+"15-30 seconds Sorenson Hold;"+NL+"Rest 2 min. x 3 sets."});
check("tplBlokken: hold krijgt geen eigen blok",[hold.length,hold[0].exercise,hold[0].lift_scheme],[1,"Alternating Lunge",{sets:3,reps:24,rust:"2 min"}]);

console.log(fouten?"\n"+fouten+" FOUT(EN)":"\nalles ok");

// ---- optioneel: alle Special Strength-templates uit de database (anon-leesbaar) ----
if(process.argv.includes("--alle")){
  (async()=>{
    const url="https://ujuvbxqgnxkyjcmcrqpw.supabase.co/rest/v1/templates?select=id,naam,instructies&naam=ilike.special*strength*&order=naam";
    const key="sb_publishable_e_959eiOehMLgZzfZDFiuQ_2UVK-z_c";
    const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key}});
    const rows=await r.json();
    let twee=0,een=0;const mis=[];
    for(const t of rows){
      const bl=K.tplBlokken({naam:t.naam,instructies:t.instructies});
      if(bl.length>=2)twee++;else if(bl[0].group_title)een++;else mis.push(t.id+" "+t.naam+NL+"      "+String(t.instructies||"").split("\n").slice(0,3).join(" | "));
    }
    console.log(NL+"Special Strength-templates: "+rows.length+", gesplitst in 2+ balken: "+twee+", één balk met kaarttitel: "+een+", niet herkend: "+mis.length);
    mis.forEach(m=>console.log("  - "+m));
  })();
}
