#!/usr/bin/env node
// Controle van de intake-kaart (app/intake-kaart.js) buiten de browser: leest een ingevulde
// intake (xlsx) met app/intake.js, bouwt de kaart met dezelfde code als de app en drukt de JSON
// af. Leg de uitkomst naast `python3 onboarding_card.py <xlsx> <M|V> uit.json` uit Michels
// pipeline-map. Verwachte verschillen: `built` (datum van vandaag), `slug` (niet in de app) en
// alles wat van de datum afhangt (age_months, hertest-lijst) als je op een andere dag draait.
// Gebruik:  node tools/intake-kaart-check.js "<intake.xlsx>" <M|F> ["<naam>"] [--kort]
// Vereist SheetJS: `npm install xlsx@0.18.5` in een losse map en NODE_PATH naar die node_modules.
const fs=require("fs"),path=require("path"),vm=require("vm");
let XLSX;try{XLSX=require("xlsx");}catch(e){console.error("SheetJS niet gevonden: npm install xlsx@0.18.5 en NODE_PATH zetten.");process.exit(2);}
const args=process.argv.slice(2);const kort=args.includes("--kort");const rest=args.filter(a=>a!=="--kort");
const [pad,gender,naam]=rest;
if(!pad||!gender){console.error("Gebruik: node tools/intake-kaart-check.js <intake.xlsx> <M|F> [naam] [--kort]");process.exit(2);}
const sandbox={console,XLSX,db:{},esc:x=>String(x),toast(){},ME:{},TDS:{rows:[],athletes:{},magAlles:true},TDS_DAGEN:[],document:undefined,tdsVandaag:()=>new Date().toISOString().slice(0,10),tdsSec:()=>"",tdsPct:()=>""};
vm.createContext(sandbox);
for(const f of ["app/testdata-engine.js","app/wedstrijdanalyse.js","app/intake.js","app/intake-kaart.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),sandbox,{filename:f});
const wb=XLSX.read(fs.readFileSync(pad),{type:"buffer",cellNF:true,cellDates:false});
const rec=sandbox.ikParse(wb);
const inp=Object.assign({},rec,{gender:gender.toUpperCase()==="M"?"M":"F",name:naam||rec.name_in_sheet||"Onbekende atleet"});
const today=new Date().toISOString().slice(0,10);
const card=sandbox.ikkBuild(inp,today);
if(kort){
  console.log("naam:",card.name,"| doel:",card.target_level,"| bw:",card.bodyweight,"| velden:",card.filled_fields);
  console.log("snapshot:",card.snapshot);
  console.log("benchmarks:",card.benchmarks.filter(b=>b.value).map(b=>b.name+"="+b.value+" ["+b.tier+"] gap "+b.gap+(b.tested_label?" ("+b.tested_label+")":"")).join(" | "));
  console.log("sri:",JSON.stringify(card.sri));
  console.log("inzichten:");card.insights.forEach(i=>console.log("  ["+i.kind+"] "+i.text));
  console.log("hertest:",card.retest.join(", ")||"-");
  console.log("zelfbeeld:",card.perception.map(p=>p.lift+" zelf "+p.self+" verwacht "+p.expected+" → "+p.verdict).join(" | ")||"-");
  console.log("verhoudingen:",card.ratios.map(r=>r.label+" "+r.value+" "+r.status).join(" | ")||"-");
  console.log("haalbaarheid:",JSON.stringify(card.feasibility));
  console.log("testplan:",JSON.stringify(card.test_plan));
  console.log("vragen:");card.questions.forEach(q=>console.log("  ["+q.topic+"] "+q.q));
  console.log("draaiboek:",card.playbook.map(p=>p.title+" ("+p.minutes+" min, "+p.items.length+" items)").join(" | "));
  console.log("praktisch:",card.practical?JSON.stringify(card.practical).slice(0,200):"-","| flags:",JSON.stringify(card.flags));
}else console.log(JSON.stringify(card,null,1));
