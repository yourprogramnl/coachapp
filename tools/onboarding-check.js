#!/usr/bin/env node
// Controle van de intake-inlezer (app/intake.js) buiten de browser: leest een ingevulde
// YourProgram-intake (xlsx) met dezelfde code als de app en drukt het record af in de vorm
// van Michels athletes_input.json. Leg de uitkomst naast `python3 parse_onboarding.py <xlsx> <M|F>`
// uit zijn pipeline-map; de velden horen gelijk te zijn (op `_template`/`_gender_hint` na,
// dat zijn hulpvelden van de app).
// Gebruik:  node tools/onboarding-check.js "<intake.xlsx>" [--kort]
// Vereist de Excel-lezer SheetJS: `npm install xlsx@0.18.5` in een losse map en dan
// `set NODE_PATH=<die map>\node_modules` (Windows) of `NODE_PATH=<map>/node_modules` (Mac/Linux).
const fs=require("fs"),path=require("path"),vm=require("vm");
let XLSX;try{XLSX=require("xlsx");}catch(e){console.error("SheetJS niet gevonden: npm install xlsx@0.18.5 en NODE_PATH zetten (zie bovenin dit script).");process.exit(2);}
const [pad,opt]=process.argv.slice(2);
if(!pad){console.error("Gebruik: node tools/onboarding-check.js <intake.xlsx> [--kort]");process.exit(2);}
const sandbox={console,XLSX,db:{},esc:x=>String(x),toast(){},ME:{},TDS:{rows:[],athletes:{},magAlles:true},TDS_DAGEN:[],document:undefined};
vm.createContext(sandbox);
for(const f of ["app/testdata-engine.js","app/intake.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,"..",f),"utf8"),sandbox,{filename:f});
const wb=XLSX.read(fs.readFileSync(pad),{type:"buffer",cellNF:true,cellDates:false});
const rec=sandbox.ikParse(wb);
if(opt==="--kort"){
  const TEST_KEYS=vm.runInContext("IK_TEST_KEYS",sandbox); // top-level const staat niet op het sandbox-object
  const tests=Object.keys(rec).filter(k=>TEST_KEYS.includes(k)&&rec[k]!==null&&rec[k]!==undefined);
  console.log("template:",rec._template,"| geslacht-hint:",rec._gender_hint||"-","| naam in blad:",rec.name_in_sheet||"-");
  console.log("bw:",rec.bw,"| doelniveau:",rec.target_level);
  console.log("tests:",tests.map(k=>k+"="+rec[k]).join(", ")||"-");
  console.log("self-assessment:",(rec.self_assessment_detail||[]).length,"bewegingen | gemiddelden:",JSON.stringify(rec.self_assessment||{}));
  console.log("zelfreflectie:",(rec.self_reflection||[]).length,"| mentaal:",(rec.mental_performance||[]).length,"| sport-referentie eigen waarden:",rec.sport_reference?((rec.sport_reference.max_lifts||[]).filter(x=>x.jouw_waarde!=null).length+(rec.sport_reference.conditioning||[]).filter(x=>x.jouw_waarde!=null).length):0,"| doelen:",rec.goal_setting?"ja":"nee","| testbatterij_full:",(rec.testbatterij_full||[]).length);
  console.log("waarschuwingen:",rec.time_warnings.length?rec.time_warnings.join(" || "):"-");
}else console.log(JSON.stringify(rec,null,1));
