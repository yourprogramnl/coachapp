#!/usr/bin/env node
// Controle van de wedstrijd-overlay (app/wedstrijdanalyse.js) tegen Michels eigen overlay.
// Leest een demands-analyse (markdown), Michels athletes_dashboard.json en optioneel zijn
// benchmarks.csv, rekent de overlay voor één atleet uit met dezelfde datum als Michels
// "generated" en vergelijkt per bucket (tier, label, niveau, score, stijl, programmeer, vloer,
// bewijs als verzameling), plus cutoff-rijen, workout-vormen en rode pen.
// Gebruik:  node tools/overlay-check.js "<analyse.md>" "<athletes_dashboard.json>" "<naam>" ["<benchmarks.csv>"]
// De JSON- en md-bestanden bevatten echte atletendata en horen niet in de repo.
const fs=require("fs"),path=require("path"),vm=require("vm");
const [mdPad,dashPad,naam,csvPad]=process.argv.slice(2);
if(!mdPad||!dashPad||!naam){console.error("Gebruik: node tools/overlay-check.js <analyse.md> <athletes_dashboard.json> <naam> [benchmarks.csv]");process.exit(2);}
const sandbox={console,db:{},esc:x=>String(x),toast(){},ME:{},WD:{},confirm:()=>true};
vm.createContext(sandbox);
for(const f of ["app/testdata-engine.js","app/wedstrijdanalyse.js"]){
  vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),sandbox,{filename:f});
}
const md=fs.readFileSync(mdPad,"utf8");
const dash=JSON.parse(fs.readFileSync(dashPad,"utf8"));
const athlete=dash[naam]||Object.values(dash).find(a=>a.name===naam);
if(!athlete){console.error("Atleet niet gevonden in "+dashPad);process.exit(2);}
const stored=athlete.comp_overlay;
if(!stored){console.error("Deze atleet heeft geen comp_overlay om tegen te controleren.");process.exit(2);}
const u=sandbox.waUitMd(md);
const compName=stored.competition.replace(/\s+\d{4}$/,"");
const edition=(stored.competition.match(/(\d{4})$/)||[])[1]||"";
const analysis={competition:u.competition||compName,edition,division:u.division,source_name:stored.demands_file,buckets:u.buckets,program:u.program,styles:u.styles,omit:u.omit,
  cutoff:csvPad?sandbox.waCutoffUitCsv(fs.readFileSync(csvPad,"utf8"),u.competition||compName):[]};
const live=sandbox.waOverlay(athlete,analysis,{division:stored.division,date:stored.date,role:stored.role,next:stored.next,note:stored.note},stored.generated);
const diffs=[];
const same=(label,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b))diffs.push(label+": eigen="+JSON.stringify(a)+" michel="+JSON.stringify(b));};
for(const k of ["competition","division","role","date","weeks_to_go","next","demands_file","styles","omit","note","current_priorities","generated"])same(k,live[k],stored[k]);
const byName=arr=>Object.fromEntries((arr||[]).map(b=>[b.bucket,b]));
const L=byName(live.buckets),M=byName(stored.buckets);
same("bucketnamen",Object.keys(L).sort(),Object.keys(M).sort());
same("bucketvolgorde",live.buckets.map(b=>b.bucket),stored.buckets.map(b=>b.bucket));
for(const n of Object.keys(M)){
  const a=L[n],b=M[n];if(!a)continue;
  for(const k of ["tier","count","load","volume","level","label","score","style","program","floor"])same(n+" › "+k,a[k],b[k]);
  const parts=s=>String(s||"").split(";").map(x=>x.trim()).filter(Boolean).sort();
  same(n+" › evidence (als verzameling)",parts(a.evidence),parts(b.evidence));
}
same("cutoff",live.cutoff,stored.cutoff||[]);
console.log("Atleet: "+naam+" | analyse: "+analysis.competition+" "+analysis.edition+" ("+analysis.division+") | buckets eigen/michel: "+live.buckets.length+"/"+stored.buckets.length+" | cutoff eigen/michel: "+live.cutoff.length+"/"+(stored.cutoff||[]).length);
if(diffs.length){console.log(diffs.length+" verschillen:");diffs.forEach(d=>console.log(" - "+d));process.exit(1);}
console.log("0 verschillen: de overlay is gelijk aan die van Michel.");
