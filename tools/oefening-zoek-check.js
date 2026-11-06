// Test van de oefeningenzoeker (oefZoek in app/demo-videos.js). Draai:
//   node tools/oefening-zoek-check.js                  (vaste gevallen)
//   node tools/oefening-zoek-check.js oefeningen.json  (ook de echte lijst: [{id,naam,tags}];
//     controleert dat alles wat de oude zoeker vond nog steeds gevonden wordt)
const fs=require("fs");
const src=fs.readFileSync(__dirname+"/../app/demo-videos.js","utf8");
const doc={addEventListener(){},body:{},querySelectorAll:()=>[]};
const K=new Function("document","MutationObserver","LIB","db","ME",src+"\nreturn {oefZoek,oefNorm};")(doc,class{observe(){}},{oef:[]},null,null);
let fouten=0;
function check(naam,ok,info){if(ok)console.log("ok    "+naam);else{fouten++;console.log("FOUT  "+naam+(info?"\n   "+info:""));}}
const L=["Ring row","Ring Row Hold","False Grip Ring Row","Bottom of Ring Row Hold","Mixed Grip Feet Elevated Ring Rows","Hamstring Curl","Strict Pull-Up","Kipping Pull-Up","Dumbbell Floor Press","DB Floor Press","Seated Dumbbell Press","Hip Thrust","Single Leg Hip Thrust","Cable Fly","Reverse Cable Fly","Med Ball Slam","Medicine Ball Slam","Good Morning","Handstand Push-Up","Hang Clean"].map((naam,i)=>({id:i,naam,tags:naam==="Hang Clean"?["olympisch"]:[]}));
const top=q=>(K.oefZoek(q,L)[0]||{}).naam;
const namen=q=>K.oefZoek(q,L).map(o=>o.naam);
check('"ring row": exacte naam bovenaan',top("ring row")==="Ring row",top("ring row"));
check('"Ring Rows" (meervoud, hoofdletters)',top("Ring Rows")==="Ring row",top("Ring Rows"));
check('"ring row": kortste variant boven langere',namen("ring row").indexOf("Ring Row Hold")===1,namen("ring row").join(", "));
check('"row ring": woordvolgorde maakt niet uit',namen("row ring").includes("Ring row"));
check('"ring r": halfgetypt woord',top("ring r")==="Ring row",top("ring r"));
check('"ring" zet Ring-oefeningen boven Hamstring',namen("ring")[0].startsWith("Ring")&&namen("ring").indexOf("Hamstring Curl")>namen("ring").indexOf("False Grip Ring Row"),namen("ring").join(", "));
for(const q of ["pullup","pull up","pull-ups","Pullups"])check('"'+q+'" vindt Strict Pull-Up',namen(q).includes("Strict Pull-Up"));
check('"db floor press" vindt beide schrijfwijzen',namen("db floor press").includes("Dumbbell Floor Press")&&namen("db floor press").includes("DB Floor Press"));
check('"dumbbell floor press" vindt ook DB Floor Press',namen("dumbbell floor press").includes("DB Floor Press"));
check('"dumbell" (typefout) vindt dumbbell',namen("dumbell press").includes("Seated Dumbbell Press"));
check('"hspu" vindt Handstand Push-Up',namen("hspu").includes("Handstand Push-Up"));
check('"hipthrust" vindt Hip Thrust',top("hipthrust")==="Hip Thrust",top("hipthrust"));
check('"goodmorning" vindt Good Morning',top("goodmorning")==="Good Morning",top("goodmorning"));
check('"cable flye" vindt Cable Fly',top("cable flye")==="Cable Fly",top("cable flye"));
check('"med ball" vindt beide schrijfwijzen',namen("med ball").includes("Med Ball Slam")&&namen("med ball").includes("Medicine Ball Slam"));
check('zoeken op tag',namen("olympisch").includes("Hang Clean"));
check('niets gevonden = lege lijst',K.oefZoek("xyzxyz",L).length===0);
check('lege zoekterm = hele lijst, zelfde volgorde',K.oefZoek("  ",L)===L);
check('leestekens alleen geeft geen fout',Array.isArray(K.oefZoek("?",L)));

if(process.argv[2]){
  const echt=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
  const oud=(q,l)=>l.filter(o=>(o.naam||"").toLowerCase().includes(q)||(o.tags||[]).join(" ").toLowerCase().includes(q));
  const qs=new Set();
  echt.forEach(o=>{const w=(o.naam||"").toLowerCase().split(/\s+/).filter(Boolean);w.forEach(x=>qs.add(x));for(let i=0;i+1<w.length;i++)qs.add(w[i]+" "+w[i+1]);qs.add((o.naam||"").toLowerCase());});
  let gemist=0,voorbeeld=[];const t0=Date.now();
  for(const q of qs){
    const nieuw=new Set(K.oefZoek(q,echt).map(o=>o.id));
    for(const o of oud(q.trim(),echt))if(!nieuw.has(o.id)){gemist++;if(voorbeeld.length<10)voorbeeld.push(q+" -> "+o.naam);}
  }
  console.log(qs.size+" zoektermen op "+echt.length+" oefeningen in "+(Date.now()-t0)+" ms");
  check("alles wat de oude zoeker vond wordt nog gevonden",gemist===0,gemist+" gemist: "+voorbeeld.join(" ; "));
  // Elke oefening moet bovenaan staan (of tussen gelijknamige) als je de volledige naam typt.
  let mis=[];
  echt.forEach(o=>{const r=K.oefZoek(o.naam,echt);const c=s=>K.oefNorm(s).replace(/ /g,""),n=c(o.naam);const voor=r.slice(0,r.findIndex(x=>x.id===o.id)).filter(x=>c(x.naam)!==n);if(voor.length)mis.push(o.naam+" (na "+voor[0].naam+")");});
  check("de volledige naam typen zet die oefening bovenaan",mis.length===0,mis.length+": "+mis.slice(0,8).join(" ; "));
  const t1=Date.now();for(let i=0;i<50;i++)K.oefZoek("single arm row",echt);
  console.log("snelheid: "+((Date.now()-t1)/50).toFixed(1)+" ms per zoekopdracht");
}
console.log(fouten?fouten+" fout(en)":"Alles goed.");process.exit(fouten?1:0);
