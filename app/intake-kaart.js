// app/intake-kaart.js: de intake-kaart voor het consult (Kyle-model, Michels onboarding_card.py).
// Rekent live uit de ingelezen intake van een atleet (input: self_assessment_detail,
// self_reflection, sport_reference, mental_performance, goal_setting, practical, bw,
// target_level): samenvatting, categorie-gemiddelden, benchmarks met niveau en gat, SRI,
// inzichten, hertest-lijst, zelfbeeld tegenover de cijfers, krachtverhoudingen, haalbaarheid
// van het doel, testplan, gespreksvragen en het draaiboek van tien fases.
// Regels, drempels, teksten en volgorde zijn 1-op-1 van Michel; niets is "verbeterd".
// Verschil met zijn script: hij leest de Excel zelf, wij lezen de velden die app/intake.js
// uit diezelfde Excel heeft opgeslagen. De zuivere functies raken DOM noch database
// (tools/intake-kaart-check.js gebruikt ze).

const IKK_LEVELS=["Open","Quarterfinal","Semifinal","Games"];
const IKK_CAT_LABELS={
  "BARBELL — OLYMPIC LIFTING":"Olympic lifting","BARBELL — SQUATTING":"Squatting","BARBELL — PRESSING / SHOULDER-TO-OVERHEAD":"Pressing / S2OH",
  "BARBELL — PULLING":"Deadlift","GYMNASTICS — PULLING":"Gymnastics: pulling","GYMNASTICS — HANDSTAND / PRESSING":"Gymnastics: HS / pressing",
  "GYMNASTICS — MIDLINE":"Gymnastics: midline","BASIC CROSSFIT MOVEMENTS":"Basis CrossFit","ODD OBJECT / STRONGMAN":"Odd object",
  "DUMBBELL / KETTLEBELL":"Dumbbell / KB","DUMBBELL":"Dumbbell / KB","OVERIG":"Overig",
};
const IKK_CTX_SHORT=[["zwaar","zwaar"],["matig","matig"],["licht","licht"]];
const IKK_MENTAL_SHORT={
  "Omgaan met zenuwen / spanning vóór een wedstrijd":"zenuwen vooraf",
  "Je intensiteit doseren tijdens workouts (pacen vs. redlinen)":"pacen vs. redlinen",
  "Rustig blijven als een workout niet loopt zoals gepland":"rustig blijven als het misgaat",
  "Herstellen van fouten midden in een event":"herstel na fout",
  "Omgaan met stress buiten de sport (werk, privé) en de invloed daarvan op je training":"stress buiten de sport",
  "Focus vasthouden in lange workouts (12+ min)":"focus in lange workouts",
  "Afleiding buitensluiten in een wedstrijdomgeving":"afleiding buitensluiten",
  "In het moment blijven — niet naar het leaderboard / de scores kijken tijdens een event":"leaderboard kijken",
  "Je focus vernauwen bij high-skill bewegingen onder vermoeidheid":"focus bij skill onder vermoeidheid",
  "Vertrouwen bij events met bekende zwakke punten":"vertrouwen bij zwakke punten",
  "Op wedstrijddag vertrouwen op je fitheid":"vertrouwen op fitheid",
  "Positieve self-talk onder druk":"self-talk onder druk",
  "Geloof in je ontwikkeling op de lange termijn":"geloof in lange termijn",
  "Consistent trainen als de motivatie laag is":"trainen zonder motivatie",
  "Bereidheid om zwakke punten te trainen in plaats van sterke punten":"zwaktes trainen",
  "Inzet vasthouden gedurende een heel wedstrijdweekend":"inzet heel weekend",
  "Commitment aan het proces boven resultaten op korte termijn":"proces boven resultaat",
  "In een wedstrijd een hoger niveau halen dan in training":"opschalen in wedstrijd",
  "Reactie op achterstand / verliezen":"reactie op achterstand",
  "Tegenstanders als motivatie gebruiken zonder reactief te worden":"tegenstanders als motivatie",
  "Ongemak / afzien in workouts omarmen":"afzien omarmen",
  "Openstaan voor feedback en aanpassingen door de coach":"open voor feedback",
  "Eerlijk communiceren over je training- en herstelstatus":"eerlijk over herstel",
  "Zelfinzicht in je fysieke en mentale staat":"zelfinzicht",
  "Vertrouwen in het coachingproces":"vertrouwen in coaching",
};
const IKK_PERC_MAP={"Back Squat":["Back Squat","zwaar"],"Front Squat":["Front Squat","zwaar"],"Overhead Squat":["Overhead Squat","zwaar"],"Thruster 1RM":["Thruster","zwaar"],
  "Deadlift":["Deadlift","zwaar"],"Snatch":["Snatch","zwaar"],"Squat Clean":["Clean","zwaar"],"Push Press":["Push Press",null],"Push Jerk":["Push Jerk",null],"Split Jerk":["Split Jerk",null]};
const IKK_TIER_SHORT={"Onder Open":"onder Open","Open":"Open","Quarterfinal":"QF","Semifinal":"SF","Games":"Games"};
const IKK_RATIOS=[
  ["Front squat / back squat","Front Squat","Back Squat",.83,.92,"Front rack of rechte romp beperkt, niet de benen.","Back squat blijft achter: ruimte voor algemene beenkracht."],
  ["Snatch / squat clean","Snatch","Squat Clean",.78,.85,"Snatch blijft achter op de clean: techniek of overhead-positie.","Clean blijft achter op de snatch."],
  ["OHS / snatch","Overhead Squat","Snatch",1.10,1.35,"Weinig reserve onder de snatch: de overhead-positie limiteert.","OHS ruim genoeg; de snatch is een techniekvraag."],
  ["Squat clean / front squat","Squat Clean","Front Squat",.80,.92,"Clean blijft achter op de front squat: techniek en snelheid onder de bar.","Front squat limiteert de clean: meer front squat-kracht nodig."],
  ["Power snatch / snatch","Power Snatch","Snatch",.80,.90,"Weinig trekhoogte: power-positie trainen.","Power bijna gelijk aan full: ontvangst in de squat is de beperking."],
  ["Power clean / squat clean","Power Clean","Squat Clean",.80,.90,"Weinig trekhoogte: power-positie trainen.","Power bijna gelijk aan full: ontvangst in de squat is de beperking."],
  ["Push jerk / push press","Push Jerk","Push Press",1.05,1.20,"Weinig winst uit dip-drive en ontvangst: jerk-techniek.","Push press blijft achter: strikte overhead-kracht."],
  ["Deadlift / back squat","Deadlift","Back Squat",1.15,1.35,"Trekkracht blijft achter op de squat.","Squat blijft achter op de deadlift."],
];
const IKK_ANCHORS=["1 Mile Run","2K Row","Echo Bike 10 min"];
const IKK_SRI_SET=["1 Mile Run","5K Run","10K Run","1K Row","2K Row","5K Row"];
const IKK_DAY_SHORT={Maandag:"ma",Dinsdag:"di",Woensdag:"wo",Donderdag:"do",Vrijdag:"vr",Zaterdag:"za",Zondag:"zo"};
const IKK_MAANDEN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ---------- hulpjes (Pythons s, score, to_seconds, fmt_time, num, to_date, months_ago, nice_list) ----------
function ikkS(v){return (v===null||v===undefined)?"":String(v).trim();}
function ikkScore(v){const n=Math.trunc(Number(v));if(v===null||v===undefined||v===""||isNaN(n))return null;return (n>=1&&n<=5)?n:null;}
function ikkSec(v){ // to_seconds
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="number")return v<1?Math.round(v*86400):Math.round(v);
  const m=String(v).match(/^\s*(?:(\d+):)?(\d{1,2}):(\d{2})\s*$/);
  if(m)return (parseInt(m[1]||"0",10))*3600+parseInt(m[2],10)*60+parseInt(m[3],10);
  return null;
}
function ikkFmtTijd(sec){if(sec===null||sec===undefined)return "";const h=Math.floor(sec/3600),r=sec%3600,m=Math.floor(r/60),x=r%60;return h?h+":"+String(m).padStart(2,"0")+":"+String(x).padStart(2,"0"):m+":"+String(x).padStart(2,"0");}
function ikkNum(v){if(v===null||v===undefined||v==="")return null;const f=waPyFloat(String(v).split("+").join("").split(",").join(".").trim());return f;}
function ikkG(v){return String(Number(Number(v).toPrecision(6)));} // f"{v:g}"
function ikkF0(x){return String(tdPyRound(Number(x),0));}          // f"{x:.0f}" (zonder teken)
function ikkCap(s){s=String(s);return s?s[0].toUpperCase()+s.slice(1).toLowerCase():s;} // str.capitalize()
function ikkTitle(s){return String(s).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());} // str.title()
function ikkVandaagObj(today){return {y:+today.slice(0,4),m:+today.slice(5,7),d:+today.slice(8,10)};}
function ikkMinDagen(t,n){const ms=Date.UTC(t.y,t.m-1,t.d)-n*86400000;const d=new Date(ms);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()};}
function ikkGeldig(y,m,d){if(m<1||m>12||d<1)return false;const dim=new Date(Date.UTC(y,m,0)).getUTCDate();return d<=dim;}
function ikkDatum(v,today){ // to_date: datum-tekst (ook relatief) → {y,m,d} of null
  if(v===null||v===undefined||v==="")return null;
  const T=ikkVandaagObj(today);
  let t=String(v).trim();
  if(typeof v==="number"&&v>=1990&&v<=2100)return {y:Math.trunc(v),m:12,d:31};
  if(/^~?\s*(19|20)\d{2}$/.test(t))return {y:parseInt(t.replace(/^~\s*/,""),10),m:12,d:31};
  t=t.replace(/^[~ ]+/,"").trim();
  const rel=t.toLowerCase().match(/^(\d+|een|one|a|an)\s*(day|days|dag|dagen|week|weeks|weken|month|months|maand|maanden|year|years|jaar)\s*(ago|geleden)?$/);
  if(rel){const n=["een","one","a","an"].includes(rel[1])?1:parseInt(rel[1],10);const u=rel[2];const days=n*((u.startsWith("day")||u.startsWith("dag"))?1:u.startsWith("we")?7:(u.startsWith("mon")||u.startsWith("maa"))?30:365);return ikkMinDagen(T,days);}
  const tl=t.toLowerCase();
  if(tl==="vorige week"||tl==="last week")return ikkMinDagen(T,7);
  if(tl==="vorige maand"||tl==="last month")return ikkMinDagen(T,30);
  let m;
  if((m=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))&&ikkGeldig(+m[1],+m[2],+m[3]))return {y:+m[1],m:+m[2],d:+m[3]};
  if((m=t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/))&&ikkGeldig(+m[3],+m[2],+m[1]))return {y:+m[3],m:+m[2],d:+m[1]};
  if((m=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))){if(ikkGeldig(+m[3],+m[2],+m[1]))return {y:+m[3],m:+m[2],d:+m[1]};if(ikkGeldig(+m[3],+m[1],+m[2]))return {y:+m[3],m:+m[1],d:+m[2]};}
  m=t.match(/(19|20)\d{2}/);
  return m?{y:parseInt(m[0],10),m:12,d:31}:null;
}
function ikkIso(d){return d?d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0"):"";}
function ikkMaanden(d,today){const T=ikkVandaagObj(today);return (T.y-d.y)*12+(T.m-d.m);}
function ikkLijst(items){items=(items||[]).filter(Boolean);if(items.length<=1)return items.join("");return items.slice(0,-1).join(", ")+" en "+items[items.length-1];}
function ikkRond(x,n){return tdPyRound(x,n);}

// ---------- bronnen uit de invoer (read_movement, read_benchmarks, read_mental, read_goals) ----------
function ikkItemLabel(it){const ctx=ikkS(it.context).toLowerCase();for(const [k,lab] of IKK_CTX_SHORT){if(ctx.startsWith(k))return it.movement+" "+lab;}return it.movement;}
function ikkMovement(inp){
  const cats=[],patterns=[];let cur=null;const byRaw={};
  for(const r of (inp.self_assessment_detail||[])){
    const raw=ikkS(r.category);const sc=ikkScore(r.score);
    const item={movement:ikkS(r.movement),context:ikkS(r.context),score:sc,note:ikkS(r.note)};
    if(raw.startsWith("CROSSFIT-SPECIFIEKE PATRONEN")){patterns.push({text:item.movement.split(" (")[0],detail:item.movement,score:sc,note:item.note});continue;}
    if(!byRaw[raw]){cur={name:ikkTitle(raw).split("—").join("·").split("Crossfit").join("CrossFit").trim(),raw,items:[]};byRaw[raw]=cur;cats.push(cur);}
    byRaw[raw].items.push(item);
  }
  const refl=inp.self_reflection||[];
  const open_q={limiter_patterns:refl[0]?ikkS(refl[0].antwoord):"",mixed_modal_strength:refl[1]?ikkS(refl[1].antwoord):""};
  return {cats,patterns,open_q};
}
function ikkSummarize(cats){
  const out=[];
  for(const c of cats){
    const scored=c.items.filter(i=>i.score!==null);if(!scored.length)continue;
    const avg=tdSum(scored.map(i=>i.score))/scored.length;
    const lows=tdSorted(scored.filter(i=>i.score<=2),i=>i.score);
    const highs=scored.filter(i=>i.score>=4);
    const parts=[];
    if(lows.length)parts.push(lows.map(i=>ikkItemLabel(i)+" "+i.score+(i.note?" (“"+i.note+"”)":"")).join("; "));
    if(highs.length&&highs.length<=4)parts.push(highs.map(i=>ikkItemLabel(i)+" "+i.score).join(", "));
    const notes=scored.filter(i=>i.note&&i.score>2);
    if(notes.length)parts.push(notes.map(i=>ikkItemLabel(i)+": “"+i.note+"”").join("; "));
    out.push({category:IKK_CAT_LABELS[c.raw]||c.name,avg:ikkRond(avg+1e-9,1),n:scored.length,low:lows.filter(i=>i.score===1).map(ikkItemLabel),notes:parts.join(". ")});
  }
  return out;
}
function ikkBenchmarks(inp,today){
  const meta={name:ikkS(inp.name),bodyweight:ikkNum(inp.bw),target_level:ikkS(inp.target_level)||"Quarterfinal"};
  const sr=inp.sport_reference||{};
  const rows=[];
  const doe=(items,kind)=>{
    for(const it of (items||[])){
      const name=ikkS(it.naam);if(!name)continue;
      const raw=it.jouw_waarde;
      const tested=ikkDatum(it.datum,today);
      const refs={Open:it.open,Quarterfinal:it.quarterfinal,Semifinal:it.semifinal,Games:it.games};
      const isTime=kind==="cond"&&(name.includes("Run")||name.includes("Row"));
      const unit=kind==="lift"?"kg":(isTime?"tijd":(name.includes("cals")?"cal":"W"));
      let val,ref,better,shown;
      if(isTime){val=ikkSec(raw);ref={};for(const k in refs)ref[k]=ikkSec(refs[k]);better=(v,t)=>v<=t;shown=ikkFmtTijd(val);}
      else{val=ikkNum(raw);ref={};for(const k in refs)ref[k]=ikkNum(refs[k]);better=(v,t)=>v>=t;shown=val!==null?ikkG(val):"";}
      let tier=null;
      if(val!==null){tier="Onder Open";for(const lv of IKK_LEVELS){if(ref[lv]!==null&&ref[lv]!==undefined&&better(val,ref[lv]))tier=lv;}}
      const target=meta.target_level;
      let gap=null;
      if(val!==null&&ref[target]){const t=ref[target];gap=isTime?(t-val)/t:(val-t)/t;}
      const age=tested?ikkMaanden(tested,today):null;
      rows.push({name:name.split(" (1RM)").join(" 1RM").split(" TT (cals)").join("").split(" FTP (watts)").join(" FTP"),kind,unit,value:shown,raw:val,tested:ikkIso(tested),
        tested_label:tested?((tested.m===12&&tested.d===31)?String(tested.y):IKK_MAANDEN[tested.m-1]+" "+tested.y):"",
        age_months:age,tier,target:(isTime&&ref[target])?ikkFmtTijd(ref[target]):(ref[target]?ikkG(ref[target]):""),gap:gap!==null?ikkRond(gap,3):null});
    }
  };
  doe(sr.max_lifts,"lift");doe(sr.conditioning,"cond");
  const by={};rows.forEach(r=>{by[r.name]=r;});
  const sri=(short,long,ds,dl)=>{
    const a=by[short],b=by[long];if(!a||!b||!a.raw||!b.raw)return null;
    const v=(dl*a.raw)/(ds*b.raw);
    const band=v<.82?"Power-outlier":v<.86?"Power":v<.89?"Gemengd":v<.92?"Endurance":"Endurance-outlier";
    return {value:ikkRond(v,3),band};
  };
  return {meta,rows,sris:{run:sri("1 Mile Run","5K Run",1609,5000),row:sri("2K Row","5K Row",2000,5000)}};
}
function ikkMental(inp){
  const cats={},order=[];
  for(const r of (inp.mental_performance||[])){
    const a=ikkS(r.category),b=ikkS(r.vraag),sc=ikkScore(r.score);
    if(!b||sc===null)continue;
    if(!cats[a]){cats[a]=[];order.push(a);}
    cats[a].push({q:b,short:IKK_MENTAL_SHORT[b]||b,score:sc,note:ikkS(r.toelichting)});
  }
  return order.map(a=>{const it=cats[a];const avg=tdSum(it.map(i=>i.score))/it.length;const low=it.filter(i=>i.score<=2);
    return {category:a,avg:ikkRond(avg+1e-9,1),low:low.map(i=>i.short+" "+i.score).join("; "),items:it};});
}
function ikkGoals(inp){
  const g=inp.goal_setting||{};
  const values=(g.values||[]).filter(v=>ikkS(v.value)).map(v=>({value:ikkS(v.value),why:ikkS(v.why)}));
  const outcomes=(g.outcome_goals||[]).filter(o=>ikkS(o.goal)).map(o=>({outcome:ikkS(o.goal),when:ikkS(o.timeline),obstacles:(o.obstacles||[]).map(ikkS).filter(Boolean)}));
  const alignment=(g.outcome_goals||[]).map(o=>ikkS(o.alignment)).filter(Boolean);
  const process=(g.process_goals||[]).filter(p=>ikkS(p.goal)).map(p=>({goal:ikkS(p.goal),obstacle:ikkS(p.obstacle),measure:ikkS(p.measure),freq:ikkS(p.frequency)}));
  return {values,outcomes,alignment,process};
}

// ---------- redeneerregels (insights) ----------
function ikkInsights(moveCats,bench,patterns,mental,sris){
  const out=[],retest=[];
  const items={},flat={};
  for(const c of moveCats)for(const i of c.items){if(i.score===null)continue;items[i.movement+"|"+i.context.toLowerCase().split(" ")[0]]=i.score;flat[i.movement]=i.score;}
  const by={};bench.forEach(b=>{by[b.name]=b;});
  // 1 Power vs full: ontvangstpositie
  for(const [full,power,pos,posname] of [["Snatch","Power Snatch","Overhead Squat","OHS"],["Squat Clean","Power Clean","Front Squat","front squat"]]){
    const f=by[full],p=by[power];
    if(f&&p&&f.raw&&p.raw&&p.raw>=f.raw*0.97){
      let extra="";
      if(flat[pos]!==undefined&&flat[pos]!==null&&flat[pos]<=2)extra=" Past bij de "+posname+"-score van "+flat[pos]+".";
      out.push({kind:"lift",text:power+" ("+p.value+" kg) ligt op of boven de "+full.toLowerCase()+" ("+f.value+" kg): de beperking zit in de ontvangstpositie, niet in trekkracht."+extra});
    }
  }
  // 2 Zwaar vs matig
  const gaps=[];
  for(const mv of ["Snatch","Clean","Clean & Jerk","Thruster","Deadlift"]){
    const h=items[mv+"|zwaar"],m=items[mv+"|matig"];
    if(h!==undefined&&m!==undefined&&h-m>=2)gaps.push(mv.toLowerCase()+" zwaar "+h+" / matig "+m);
  }
  if(gaps.length)out.push({kind:"engine",text:"Zwaar sterk, cyclen zwak: "+ikkLijst(gaps)+". De kracht is er; het barbell-werk valt weg onder hartslag."});
  // 3 SRI
  for(const [key,lab] of [["run","Run"],["row","Row"]]){
    const v=sris&&sris[key];if(!v)continue;
    let txt=lab+" SRI "+ikkF0(v.value*100)+"% ("+v.band+").";
    if(v.band==="Endurance-outlier")txt+=" Zo hoog is ongebruikelijk; check of beide tests recent en maximaal waren.";
    else if(v.band==="Power"||v.band==="Power-outlier")txt+=" Snelheid houdt slecht stand over afstand: aerobe basis is de hefboom.";
    out.push({kind:"engine",text:txt});
  }
  // 4 Mentaal × fysiek
  const ment={};for(const c of mental)for(const i of c.items)ment[i.short]=i.score;
  const patLow=patterns.filter(p=>p.score!==null&&p.score<=2);
  const mLow=["pacen vs. redlinen","afzien omarmen"].filter(k=>(ment[k]!==undefined?ment[k]:5)<=2);
  const hrKw=/\b(hr|heart ?rate|hartslag|conditioning|conditie|engine|adem|breath)/i;
  const hrNotes=[];for(const c of moveCats)for(const i of c.items){if(i.note&&hrKw.test(i.note))hrNotes.push(i);}
  const kop=()=>ikkLijst(mLow.map((k,i)=>i===0?ikkCap(k):k));
  if(mLow.length&&hrNotes.length&&!patLow.length){
    const verb=mLow.length===1?"scoort":"scoren";
    const quotes=ikkLijst(hrNotes.slice(0,3).map(i=>"“"+i.note+"” ("+ikkItemLabel(i).toLowerCase()+")"));
    out.push({kind:"mental",text:kop()+" "+verb+" laag en de toelichtingen noemen hartslag of conditie: "+quotes+". De engine-beperking is deels fysiek en deels hoe er met ongemak wordt omgegaan."});
  }
  if(mLow.length&&patLow.length){
    const verb=mLow.length===1?"scoort":"scoren";
    out.push({kind:"mental",text:kop()+" "+verb+" laag, net als "+ikkLijst(patLow.slice(0,2).map(p=>p.text.toLowerCase()))+": de engine-beperking is deels fysiek en deels hoe er met ongemak wordt omgegaan."});
  }
  // 5 Hertest-lijst
  for(const b of bench){if(b.kind==="cond"&&b.raw!==null&&(b.age_months===null||b.age_months>12))retest.push(b.name);}
  const stale=bench.filter(b=>b.kind==="lift"&&b.raw!==null&&b.age_months!==null&&b.age_months>24).map(b=>b.name);
  if(retest.length){
    const why=retest.every(n=>by[n].age_months===null)?"zonder testdatum":"zonder datum of ouder dan een jaar";
    out.push({kind:"retest",text:"Conditioning-scores "+why+" zijn geen betrouwbare zone-ankers. Opnieuw testen na de eerste opbouwweken (niet in week 1 als iemand uit een pauze komt): "+ikkLijst(retest)+"."});
  }
  if(stale.length)out.push({kind:"retest",text:"Lifts ouder dan twee jaar, behandel als indicatie: "+ikkLijst(stale)+"."});
  return {out,retest};
}

// ---------- samenvatting, zelfbeeld, verhoudingen, haalbaarheid, testplan ----------
function ikkSnapshot(meta,cats,patterns,mental,goals,bench){
  const parts=[];const tgt=meta.target_level;
  const lifts=bench.filter(b=>b.kind==="lift"&&b.tier),conds=bench.filter(b=>b.kind==="cond"&&b.tier);
  const main=cats.filter(c=>c.category!=="Overig");
  const top=tdSorted(main,c=>-c.avg);
  if(top.length){const best=top.slice(0,2).map(c=>c.category),worst=tdSorted(main,c=>c.avg).slice(0,2).map(c=>c.category);parts.push("Sterkst in "+ikkLijst(best)+", zwakst in "+ikkLijst(worst)+" (zelfinschatting).");}
  if(lifts.length||conds.length){
    const order=["Games","Semifinal","Quarterfinal","Open","Onder Open"],short={Games:"Games",Semifinal:"SF",Quarterfinal:"QF",Open:"Open","Onder Open":"onder Open"};
    const spread=bs=>{const cnt={};bs.forEach(b=>{cnt[b.tier]=(cnt[b.tier]||0)+1;});return order.filter(t=>cnt[t]).map(t=>cnt[t]+"× "+short[t]).join(", ");};
    const segs=[];if(lifts.length)segs.push("lifts "+spread(lifts));if(conds.length)segs.push("conditioning "+spread(conds));
    const all=lifts.concat(conds);
    const hit=all.filter(b=>b.gap!==null&&b.gap>=0);
    const near=tdSorted(all.filter(b=>b.gap!==null&&b.gap<0),b=>-b.gap).slice(0,2);
    let line="Doelniveau "+tgt+". Nu: "+segs.join("; ")+".";
    if(hit.length)line+=" Al op doelniveau: "+ikkLijst(hit.slice(0,4).map(b=>b.name))+".";
    if(near.length)line+=" Dichtst bij: "+ikkLijst(near.map(b=>b.name.toLowerCase()+" ("+(Math.abs(b.gap)<0.005?"minder dan 1%":ikkF0(Math.abs(b.gap)*100)+"%")+" eronder)"))+".";
    parts.push(line);
  }
  const patLow=patterns.filter(p=>p.score!==null&&p.score<=2).map(p=>p.text.toLowerCase());
  if(patLow.length)parts.push("In mixed-modal loopt het vast op "+ikkLijst(patLow.slice(0,3))+".");
  if(mental.length){const mlow=tdSorted(mental,c=>c.avg)[0],mhigh=tdSorted(mental,c=>-c.avg)[0];parts.push("Mentaal het sterkst in "+mhigh.category.toLowerCase()+" ("+tdFloatStr(mhigh.avg)+"), het zwakst in "+mlow.category.toLowerCase()+" ("+tdFloatStr(mlow.avg)+").");}
  if(goals.values.length)parts.push("Waarden: "+goals.values.map(v=>v.value.toLowerCase()).join(", ")+".");
  return parts.join(" ");
}
function ikkExpectedSelf(gap){return gap>=.05?5:gap>=0?4:gap>=-.08?3:gap>=-.18?2:1;}
function ikkPerception(moveCats,bench){
  const idx={};
  for(const c of moveCats)for(const i of c.items){if(i.score===null)continue;const ctx=i.context?i.context.toLowerCase().split(" ")[0]:null;idx[i.movement+"|"+ctx]=i.score;if(idx[i.movement+"|null"]===undefined)idx[i.movement+"|null"]=i.score;}
  const rows=[];
  for(const b of bench){
    const m=IKK_PERC_MAP[b.name];if(!m||b.gap===null)continue;
    const self=idx[m[0]+"|"+m[1]]!==undefined?idx[m[0]+"|"+m[1]]:idx[m[0]+"|null"];
    if(self===undefined||self===null)continue;
    const exp=ikkExpectedSelf(b.gap),d=self-exp;
    rows.push({lift:b.name,self,expected:exp,diff:d,verdict:d>=2?"blinde vlek":d<=-2?"vertrouwen":d?"licht":"klopt",value:b.value,tier:IKK_TIER_SHORT[b.tier]||b.tier,gap:b.gap});
  }
  return rows;
}
function ikkRatios(bench){
  const by={};bench.forEach(b=>{by[b.name]=b;});const out=[];
  for(const [label,a,bn,lo,hi,lowMsg,highMsg] of IKK_RATIOS){
    const x=by[a],y=by[bn];if(!x||!y||!x.raw||!y.raw)continue;
    const v=x.raw/y.raw;const status=v<lo?"laag":v>hi?"hoog":"ok";
    out.push({label,value:ikkRond(v,3),lo,hi,status,text:status==="laag"?lowMsg:status==="hoog"?highMsg:""});
  }
  return out;
}
function ikkFeasibility(bench,target,goals){
  const gaps=bench.filter(b=>b.gap!==null);if(!gaps.length)return null;
  const g=tdSorted(gaps.map(b=>b.gap),x=>x);
  const med=g.length%2?g[Math.floor(g.length/2)]:(g[g.length/2-1]+g[g.length/2])/2;
  return {target,timeline:goals.outcomes.length?goals.outcomes[0].when:"",outcome:goals.outcomes.length?goals.outcomes[0].outcome:"",median:ikkRond(med,3),
    verdict:med>=-.03?"binnen bereik":med>=-.10?"uitdagend":"ver weg",
    at:gaps.filter(b=>b.gap>=0).map(b=>b.name),near:gaps.filter(b=>b.gap>=-.08&&b.gap<0).map(b=>b.name),
    far:tdSorted(gaps,b=>b.gap).filter(b=>b.gap<-.08).map(b=>b.name+" ("+ikkF0(Math.abs(b.gap)*100)+"%)")};
}
function ikkTestPlan(bench,retest){
  const by={};bench.forEach(b=>{by[b.name]=b;});
  let week1=IKK_ANCHORS.filter(n=>retest.includes(n)||(by[n]&&!by[n].value));
  week1=week1.concat(retest.filter(n=>!week1.includes(n)&&n==="Bike Erg 20 min FTP"));
  const cycle=IKK_SRI_SET.filter(n=>!week1.includes(n)&&(retest.includes(n)||(by[n]&&!by[n].value)));
  const lifts=bench.filter(b=>b.kind==="lift"&&(!b.value||(b.age_months!==null&&b.age_months>24))).map(b=>b.name);
  return {week1,cycle,lifts};
}

// ---------- gespreksvragen en draaiboek (Kyle's consult, 24 sep 2026) ----------
function ikkQuestions(moveCats,mental,goals,perc,feas,practical,retest,target){
  const q=[];
  for(const inj of ((practical||{}).injuries||[])){if(inj.status!=="Oud, geen last meer")q.push(["Blessure","Je noemt "+inj.what+(inj.status?" ("+inj.status.toLowerCase()+")":"")+". Wat mag nu wel en niet, en wie behandelt het?"]);}
  for(const p of perc.filter(p=>p.verdict==="blinde vlek").slice(0,2))q.push(["Zelfbeeld","Je geeft je "+p.lift.toLowerCase()+" een "+p.self+", maar met "+p.value+" kg zit je op "+p.tier+", "+ikkF0(Math.abs(p.gap)*100)+"% onder je doelniveau. Waar baseer je die score op?"]);
  for(const p of perc.filter(p=>p.verdict==="vertrouwen").slice(0,1))q.push(["Zelfbeeld","Je geeft je "+p.lift.toLowerCase()+" maar een "+p.self+", terwijl "+p.value+" kg al "+p.tier+" is. Wat maakt dat het niet zo voelt?"]);
  const items=[];for(const c of moveCats)for(const i of c.items)if(i.score!==null)items.push(i);
  for(const i of tdSorted(items.filter(i=>i.note&&i.score<=2),i=>i.score).slice(0,2))q.push(["Beweging","Bij "+ikkItemLabel(i)+" ("+i.score+") schrijf je: “"+i.note+"”. Vertel daar eens meer over."]);
  for(const i of items.filter(i=>i.score===1&&!i.note).slice(0,1))q.push(["Beweging",ikkItemLabel(i)+" scoor je een 1. Wat gebeurt er als dat in een workout voorbijkomt?"]);
  const lows=tdSorted([].concat(...mental.map(c=>(c.items||[]).filter(i=>i.score<=2))),i=>i.score);
  if(lows.length)q.push(["Mentaal","“"+ikkCap(lows[0].short)+"” scoor je een "+lows[0].score+". Hoe merk je dat in een wedstrijd of zware training?"]);
  if(goals.outcomes.length&&goals.outcomes[0].obstacles.length){const o=goals.outcomes[0];q.push(["Doel","Je noemt “"+o.obstacles[0]+"” als obstakel voor “"+o.outcome+"”. Wat heb je daar tot nu toe aan gedaan?"]);}
  if(feas&&feas.verdict==="ver weg")q.push(["Doel","Je doelniveau is "+target+", en de helft van je cijfers zit meer dan "+ikkF0(Math.abs(feas.median)*100)+"% daaronder. Welke tijdlijn vind je zelf realistisch?"]);
  const pr=practical||{};
  if(!pr.n_days)q.push(["Praktisch","Hoeveel dagen per week kun je echt trainen, en hoeveel tijd heb je dan?"]);
  else if(pr.min_week&&pr.min_week<360&&(target==="Semifinal"||target==="Games"))q.push(["Praktisch","Je hebt "+pr.n_days+" dagen en "+pr.min_week+" minuten per week. Past dat bij je doel, of kan er ergens nog tijd bij?"]);
  if(retest.length)q.push(["Testen","Wanneer heb je je "+ikkLijst(retest.slice(0,3).map(r=>r.toLowerCase()))+" voor het laatst echt getest?"]);
  return q.slice(0,8).map(x=>({topic:x[0],q:x[1]}));
}
function ikkPlaybook(moveCats,mental,goals,perc,feas,practical,retest,target,ratios,patterns,bodyweight,strengths){
  const V="vraag",A="actie",C="check";const ph=[];
  const it=(kind,text,hint)=>({kind,text,hint:hint||""});
  const phase=(key,title,minutes,items)=>{items=items.filter(Boolean);if(items.length)ph.push({key,title,minutes,items});};
  phase("open","Opening",2,[it(C,"Toestemming gevraagd om het gesprek op te nemen (alleen als je opneemt)"),it(A,"Deel het tabblad met de deelweergave: dit is wat we al weten. Kom met antwoorden, niet met vragen.")]);
  const outs=goals.outcomes||[],vals=goals.values||[];const g=[];
  if(outs.length){const o=outs[0];g.push(it(V,"Vertel eens over je doel: “"+o.outcome+"”"+(o.when?" ("+o.when+")":"")+". Waarom juist nu?"));}
  else g.push(it(V,"Wat wil je dit seizoen bereiken, en waarom juist nu?"));
  if(vals.length)g.push(it(V,"Je noemt “"+vals[0].value+"” als belangrijkste waarde. Wat betekent dat voor jou in training?"));
  if(outs.length>1)g.push(it(V,"Je tweede doel: “"+outs[1].outcome+"”. Waaraan merk je dat je dat gehaald hebt?"));
  phase("doel","Waarom en doel",5,g);
  const r=[it(V,"Als de Open over twee weken was: waar zou je eindigen in je divisie?")];
  if(feas&&feas.verdict!=="binnen bereik")r.push(it(V,"Je doelniveau is "+target+", en de helft van je cijfers zit "+ikkF0(Math.abs(feas.median)*100)+"% of meer daaronder. Welke tijdlijn vind je zelf realistisch?"));
  r.push(it(V,"Welke fase is je grootste struggle: de Open, de Quarterfinal of de Semifinal?"));
  r.push(it(C,"Check vóór het plan: welk niveau is nodig om je doel te halen in je eigen divisie (bijv. leidt top 5 tot de semifinals)?"));
  phase("realiteit","Realiteit en tijdlijn",3,r);
  phase("samen","Samenwerking",1,[it(A,"Zeg dat je een plan en een seizoensopbouw neerlegt, en dat de atleet het moet zeggen als iets niet klopt of als het te veel wordt.")]);
  const b=[];const injuries=(practical||{}).injuries||[];
  for(const inj of injuries){
    if(inj.status==="Oud, geen last meer")b.push(it(V,inj.what+" staat als oud: speelt het nog op bij vermoeidheid of zware blokken?"));
    else b.push(it(V,inj.what+": is er een diagnose? Wat maakt het beter, wat maakt het erger?",inj.note||""));
  }
  if(injuries.some(i=>i.status!=="Oud, geen last meer"))b.push(it(V,"Wat mag nu wel en niet, en wanneer ben je weer bij de behandelaar? Stuur daarna een update."));
  if(!injuries.length)b.push(it(V,"Heb je nu of vroeger blessures gehad die we moeten kennen? Wat maakt het beter of erger?"));
  for(const o of outs.slice(0,1))for(const ob of o.obstacles.slice(0,1))b.push(it(V,"Je noemt “"+ob+"” als obstakel. Wat heb je daar tot nu toe aan gedaan?"));
  phase("blessures","Blessures en beperkingen",10,b);
  const s=[];
  const wap=(strengths||[]).slice(0,3).concat(patterns.filter(p=>p.score===5).map(p=>p.text).slice(0,2));
  s.push(it(V,"Wat is volgens jou je grootste wapen?",wap.length?"Volgens de sheet: "+wap.join(", "):""));
  const items=[];for(const c of moveCats)for(const i of c.items)if(i.score!==null)items.push(i);
  for(const i of tdSorted(items.filter(i=>i.note&&i.score<=2),i=>i.score).slice(0,2))s.push(it(V,"Bij "+ikkItemLabel(i)+" ("+i.score+") schrijf je: “"+i.note+"”. Vertel daar eens meer over."));
  for(const i of items.filter(i=>i.score===1&&!i.note).slice(0,1))s.push(it(V,ikkItemLabel(i)+" scoor je een 1. Wat gebeurt er als dat in een workout voorbijkomt?"));
  const lows=tdSorted([].concat(...mental.map(c=>(c.items||[]).filter(i=>i.score<=2))),i=>i.score);
  if(lows.length)s.push(it(V,"“"+ikkCap(lows[0].short)+"” scoor je een "+lows[0].score+". Hoe merk je dat in een wedstrijd of zware training?"));
  s.push(it(V,"Over zes weken: waaraan zien we dat we de goede kant op gaan?"));
  phase("sterk","Sterktes en zwaktes",5,s);
  const k=[it(V,"Hoe vers zijn deze cijfers? Hoever zit je er nu vanaf in training?",retest.length?"Oud of zonder datum: "+retest.join(", "):"")];
  if(!bodyweight)k.push(it(V,"Wat is je lichaamsgewicht nu, en wat is je wedstrijdgewicht?"));
  for(const p of perc.filter(p=>p.verdict==="blinde vlek").slice(0,2))k.push(it(V,"Je geeft je "+p.lift.toLowerCase()+" een "+p.self+", maar met "+p.value+" kg zit je op "+p.tier+", "+ikkF0(Math.abs(p.gap)*100)+"% onder je doelniveau. Waar baseer je die score op?"));
  for(const p of perc.filter(p=>p.verdict==="vertrouwen").slice(0,1))k.push(it(V,"Je geeft je "+p.lift.toLowerCase()+" maar een "+p.self+", terwijl "+p.value+" kg al "+p.tier+" is. Wat maakt dat het niet zo voelt?"));
  for(const r_ of (ratios||[]).filter(x=>x.status!=="ok").slice(0,2))k.push(it(A,"Bespreek: "+r_.label.toLowerCase()+" "+ikkF0(r_.value*100)+"%. "+r_.text));
  phase("cijfers","Cijfers",8,k);
  const e=[it(V,"Train je nu regelmatig? Zo niet: eerst twee à drie weken opbouwen, dan pas testen.")];
  if(retest.length)e.push(it(A,"Leg uit welke tests eerst komen en waarom: "+ikkLijst(retest.slice(0,3))+". Die worden de ankers voor de trainingszones."));
  e.push(it(V,"Wat voel je als eerste als het zwaar wordt op de bike of roeier: benen, ademhaling of hartslag?"));
  phase("engine","Engine en testen",5,e);
  const pr=practical||{};const w=[];
  if(pr.n_days){
    const days=(pr.days||[]).map(d=>IKK_DAY_SHORT[d.day]||d.day).join(", ");
    w.push(it(V,"Je traint "+pr.n_days+" dagen ("+days+")"+(pr.min_week?", "+pr.min_week+" minuten per week":"")+". Klopt dat nog?"));
    if((pr.doubles||[]).length)w.push(it(A,"Op "+pr.doubles.map(d=>IKK_DAY_SHORT[d]||d).join(", ")+" kan een tweede sessie: dan splitsen we kracht en conditie."));
  }else w.push(it(V,"Op welke dagen kun je trainen, hoeveel tijd heb je dan, en kan er soms een tweede sessie bij?"));
  w.push(it(V,"Welke wedstrijden wil je dit seizoen doen, naast de Open?"));
  if(pr.wearable&&pr.wearable!=="Geen")w.push(it(V,"Draag je je "+pr.wearable+" ook 's nachts? Dan volgen we slaap en HRV om deloads te plannen."));
  else w.push(it(V,"Heb je een horloge of ring om slaap en herstel te meten?"));
  if((pr.equipment_missing||[]).length)w.push(it(V,"Heb je ergens toegang tot "+ikkLijst(pr.equipment_missing.slice(0,4).map(x=>x.toLowerCase()))+"?"));
  else if(!(pr.equipment||[]).length)w.push(it(C,"Materiaallijst ontbreekt: laat die nasturen."));
  phase("week","Week, kalender en herstel",4,w);
  const activeInj=injuries.filter(i=>i.status!=="Oud, geen last meer");
  phase("afsluiten","Afsluiten en afspraken",5,[
    it(V,"Wat moet ik nog weten voordat we beginnen?"),
    it(C,"Startdatum afgesproken"),
    activeInj.length?it(C,"Regel voor week 1 rond "+activeInj[0].what.toLowerCase()):null,
    it(C,"Kanalen uitgelegd: vragen via WhatsApp, resultaten en video's in de trainingsapp"),
    it(C,"Account voor de trainingsapp aangemaakt"),
    it(C,"Samenwerkingsovereenkomst verstuurd"),
    it(A,"Zeg dat de atleet nooit stoort: klachten meteen melden, niet pas na twee weken."),
  ]);
  return ph;
}

// ---------- de kaart (build) ----------
function ikkHeeftIntake(inp){
  inp=inp||{};
  return !!((inp.self_assessment_detail&&inp.self_assessment_detail.length)||(inp.sport_reference&&(((inp.sport_reference.max_lifts||[]).some(x=>x.jouw_waarde!=null))||((inp.sport_reference.conditioning||[]).some(x=>x.jouw_waarde!=null))))||(inp.mental_performance&&inp.mental_performance.length));
}
function ikkBuild(inp,today){
  inp=inp||{};
  const {cats:moveRaw,patterns,open_q}=ikkMovement(inp);
  const {meta,rows:bench,sris}=ikkBenchmarks(inp,today);
  const mental=ikkMental(inp);
  const goals=ikkGoals(inp);
  const cats=ikkSummarize(moveRaw);
  const name=meta.name||"Onbekende atleet";
  const allItems=[];for(const c of moveRaw)for(const i of c.items)if(i.score!==null)allItems.push(i);
  const strengths=allItems.filter(i=>i.score===5).map(ikkItemLabel),limiters=allItems.filter(i=>i.score===1).map(ikkItemLabel);
  const patStrong=patterns.filter(p=>p.score===5).map(p=>p.text),patWeak=patterns.filter(p=>p.score!==null&&p.score<=2).map(p=>p.text);
  const {out:ins,retest}=ikkInsights(moveRaw,bench,patterns,mental,sris);
  const filled=allItems.length+bench.filter(b=>b.raw!==null).length;
  const practical=inp.practical||null;
  const perc=ikkPerception(moveRaw,bench);
  const feas=ikkFeasibility(bench,meta.target_level,goals);
  const flags=((practical||{}).injuries||[]).filter(i=>i.status!=="Oud, geen last meer").map(i=>i.what+(i.status?" ("+i.status.toLowerCase()+")":"")+(i.note?": "+i.note:""));
  const ratios=ikkRatios(bench);
  return {
    name,gender:inp.gender||"",bodyweight:meta.bodyweight,target_level:meta.target_level,built:today,filled_fields:filled,
    snapshot:ikkSnapshot(meta,cats,patterns,mental,goals,bench),
    goals,movement:cats,patterns:patterns.filter(p=>p.score!==null).map(p=>({text:p.text,score:p.score})),open_questions:open_q,
    strengths,limiters,pattern_strengths:patStrong,pattern_limiters:patWeak,
    benchmarks:bench.map(b=>{const o=Object.assign({},b);delete o.raw;return o;}),sri:sris,
    mental:mental.map(c=>({category:c.category,avg:c.avg,low:c.low})),
    insights:ins,retest,practical,flags,perception:perc,ratios,feasibility:feas,test_plan:ikkTestPlan(bench,retest),
    questions:ikkQuestions(moveRaw,mental,goals,perc,feas,practical,retest,meta.target_level),
    playbook:ikkPlaybook(moveRaw,mental,goals,perc,feas,practical,retest,meta.target_level,ratios,patterns,meta.bodyweight,strengths),
  };
}

// ======================= weergave op de atletenkaart =======================
function ikkKindLabel(k){return k==="vraag"?"V":k==="actie"?"A":k==="check"?"✓":k;}
function ikkHtml(card){
  const E=esc;
  const tag=(t,cls)=>'<span class="td-pct '+(cls||"")+'">'+E(t)+'</span>';
  const verdictCls={"binnen bereik":"td-pct-green","uitdagend":"td-pct-orange","ver weg":"td-pct-red"};
  const feas=card.feasibility;
  const blok=(titel,inhoud)=>inhoud?'<div class="ikk-blok"><div class="ikk-h">'+titel+'</div>'+inhoud+'</div>':"";
  const lijst=(arr,fn)=>arr&&arr.length?'<ul class="ikk-lijst">'+arr.map(x=>'<li>'+(fn?fn(x):E(x))+'</li>').join("")+'</ul>':"";
  let html='<div class="ikk">';
  html+='<div class="ikk-snapshot">'+E(card.snapshot||"Nog te weinig intake-gegevens voor een samenvatting.")+'</div>';
  if(feas)html+=blok("Haalbaarheid van het doel",'<div class="td-p-text">'+tag(feas.verdict,verdictCls[feas.verdict])+' Doelniveau '+E(feas.target)+(feas.outcome?' · doel: '+E(feas.outcome)+(feas.timeline?' ('+E(feas.timeline)+')':""):"")+' · mediaan van de gaten '+E(ikkF0(feas.median*100))+'%</div>'+
    (feas.at.length?'<div class="td-p-text"><b class="td-sublabel">Al op niveau:</b> '+E(feas.at.join(", "))+'</div>':"")+(feas.near.length?'<div class="td-p-text"><b class="td-sublabel">Dichtbij:</b> '+E(feas.near.join(", "))+'</div>':"")+(feas.far.length?'<div class="td-p-text"><b class="td-sublabel">Ver weg:</b> '+E(feas.far.join(", "))+'</div>':""));
  html+=blok("Inzichten",lijst(card.insights,x=>'<b class="ikk-kind">'+E(x.kind)+'</b> '+E(x.text)));
  if(card.flags&&card.flags.length)html+=blok("Blessures en beperkingen",'<div class="td-flags">'+card.flags.map(E).join("<br>")+'</div>');
  if(card.benchmarks&&card.benchmarks.some(b=>b.value)){
    const rows=card.benchmarks.filter(b=>b.value).map(b=>'<tr><td>'+E(b.name)+'</td><td><b>'+E(b.value)+(b.unit==="tijd"?"":" "+E(b.unit))+'</b></td><td>'+E(b.tier||"–")+'</td><td>'+E(b.target||"–")+'</td><td>'+(b.gap!==null&&b.gap!==undefined?tdsPct(ikkRond(b.gap*100,1)):"–")+'</td><td class="muted">'+E(b.tested_label||"–")+'</td></tr>').join("");
    html+=blok("Benchmarks tegenover het doelniveau",'<table class="td-table"><thead><tr><th>Onderdeel</th><th>Eigen</th><th>Niveau</th><th>Doel</th><th>Gat</th><th>Getest</th></tr></thead><tbody>'+rows+'</tbody></table>'+
      ((card.sri&&(card.sri.run||card.sri.row))?'<div class="td-hint">SRI: '+["run","row"].filter(k=>card.sri[k]).map(k=>(k==="run"?"run 1 mile→5K ":"row 2K→5K ")+ikkF0(card.sri[k].value*100)+"% ("+card.sri[k].band+")").join(" · ")+'</div>':""));
  }
  if(card.perception&&card.perception.length){
    const vCls={"blinde vlek":"td-pct-red","vertrouwen":"td-pct-orange","licht":"","klopt":"td-pct-green"};
    html+=blok("Zelfbeeld tegenover de cijfers",'<table class="td-table"><thead><tr><th>Lift</th><th>Eigen</th><th>Zelf</th><th>Verwacht</th><th>Oordeel</th></tr></thead><tbody>'+card.perception.map(p=>'<tr><td>'+E(p.lift)+'</td><td>'+E(p.value)+' kg ('+E(p.tier)+')</td><td>'+E(p.self)+'/5</td><td>'+E(p.expected)+'/5</td><td>'+tag(p.verdict,vCls[p.verdict])+'</td></tr>').join("")+'</tbody></table>');
  }
  if(card.ratios&&card.ratios.length){
    const rCls={laag:"td-pct-orange",hoog:"td-pct-orange",ok:"td-pct-green"};
    html+=blok("Krachtverhoudingen",'<table class="td-table"><thead><tr><th>Verhouding</th><th>Waarde</th><th>Band</th><th>Oordeel</th></tr></thead><tbody>'+card.ratios.map(r=>'<tr><td>'+E(r.label)+'</td><td><b>'+E(ikkF0(r.value*100))+'%</b></td><td class="muted">'+E(ikkF0(r.lo*100))+'–'+E(ikkF0(r.hi*100))+'%</td><td>'+tag(r.status,rCls[r.status])+(r.text?' <span class="td-norm-basis">'+E(r.text)+'</span>':"")+'</td></tr>').join("")+'</tbody></table>');
  }
  if(card.movement&&card.movement.length)html+=blok("Zelfinschatting per categorie",'<table class="td-table"><thead><tr><th>Categorie</th><th>Gem.</th><th>n</th><th>Toelichting</th></tr></thead><tbody>'+card.movement.map(c=>'<tr><td>'+E(c.category)+'</td><td><b>'+E(tdFloatStr(c.avg))+'</b></td><td class="muted">'+E(c.n)+'</td><td class="muted">'+E(c.notes||"")+'</td></tr>').join("")+'</tbody></table>'+
    ((card.strengths.length||card.limiters.length||card.pattern_strengths.length||card.pattern_limiters.length)?'<div class="td-hint">'+(card.strengths.length?"Wapens (5): "+E(card.strengths.join(", "))+". ":"")+(card.limiters.length?"Beperkingen (1): "+E(card.limiters.join(", "))+". ":"")+(card.pattern_strengths.length?"Sterke patronen: "+E(card.pattern_strengths.join(", "))+". ":"")+(card.pattern_limiters.length?"Zwakke patronen: "+E(card.pattern_limiters.join(", "))+".":"")+'</div>':""));
  if(card.mental&&card.mental.length)html+=blok("Mentaal per categorie",'<table class="td-table"><thead><tr><th>Categorie</th><th>Gem.</th><th>Laag</th></tr></thead><tbody>'+card.mental.map(c=>'<tr><td>'+E(c.category)+'</td><td><b>'+E(tdFloatStr(c.avg))+'</b></td><td class="muted">'+E(c.low||"")+'</td></tr>').join("")+'</tbody></table>');
  const tp=card.test_plan;
  if(tp&&(tp.week1.length||tp.cycle.length||tp.lifts.length))html+=blok("Testplan eerste cyclus",(tp.week1.length?'<div class="td-p-text"><b class="td-sublabel">Week 1:</b> '+E(tp.week1.join(", "))+'</div>':"")+(tp.cycle.length?'<div class="td-p-text"><b class="td-sublabel">In de cyclus:</b> '+E(tp.cycle.join(", "))+'</div>':"")+(tp.lifts.length?'<div class="td-p-text"><b class="td-sublabel">Lifts:</b> '+E(tp.lifts.join(", "))+'</div>':""));
  if(card.practical){const pr=card.practical;html+=blok("Praktisch",'<div class="td-p-text">'+(pr.n_days?E(pr.n_days)+' dagen ('+E((pr.days||[]).map(d=>IKK_DAY_SHORT[d.day]||d.day).join(", "))+')'+(pr.min_week?', '+E(pr.min_week)+' min per week':"")+(pr.doubles&&pr.doubles.length?', dubbel op '+E(pr.doubles.map(d=>IKK_DAY_SHORT[d]||d).join(", ")):""):"Trainingsdagen onbekend")+(pr.where?' · '+E(pr.where):"")+(pr.wearable?' · wearable: '+E(pr.wearable):"")+(pr.sleep?' · slaap '+E(pr.sleep)+' u':"")+(pr.work?' · werk: '+E(pr.work):"")+'</div>'+(pr.equipment&&pr.equipment.length?'<div class="td-p-text"><b class="td-sublabel">Materiaal:</b> '+E(pr.equipment.join(", "))+(pr.equipment_missing&&pr.equipment_missing.length?' · <b class="td-sublabel">Mist:</b> '+E(pr.equipment_missing.join(", ")):"")+(pr.equipment_note?' ('+E(pr.equipment_note)+')':"")+'</div>':""));}
  if(card.open_questions&&(card.open_questions.limiter_patterns||card.open_questions.mixed_modal_strength))html+=blok("In eigen woorden",(card.open_questions.limiter_patterns?'<div class="td-p-text"><b class="td-sublabel">Beperking:</b> '+E(card.open_questions.limiter_patterns)+'</div>':"")+(card.open_questions.mixed_modal_strength?'<div class="td-p-text"><b class="td-sublabel">Kracht:</b> '+E(card.open_questions.mixed_modal_strength)+'</div>':""));
  if(card.goals&&(card.goals.values.length||card.goals.outcomes.length||card.goals.process.length))html+=blok("Doelen",(card.goals.values.length?'<div class="td-p-text"><b class="td-sublabel">Waarden:</b> '+E(card.goals.values.map(v=>v.value+(v.why?" ("+v.why+")":"")).join("; "))+'</div>':"")+card.goals.outcomes.map((o,i)=>'<div class="td-p-text"><b class="td-sublabel">Doel '+(i+1)+':</b> '+E(o.outcome)+(o.when?' ('+E(o.when)+')':"")+(o.obstacles.length?' · obstakels: '+E(o.obstacles.join(", ")):"")+'</div>').join("")+(card.goals.alignment.length?'<div class="td-p-text"><b class="td-sublabel">Verbinding met waarden:</b> '+E(card.goals.alignment.join(" | "))+'</div>':"")+card.goals.process.map((p,i)=>'<div class="td-p-text"><b class="td-sublabel">Procesdoel '+(i+1)+':</b> '+E(p.goal)+(p.obstacle?' · pakt aan: '+E(p.obstacle):"")+(p.measure?' · meten: '+E(p.measure):"")+(p.freq?' · '+E(p.freq):"")+'</div>').join(""));
  html+=blok("Gespreksvragen",lijst(card.questions,x=>'<b class="ikk-kind">'+E(x.topic)+'</b> '+E(x.q)));
  if(card.playbook&&card.playbook.length)html+=blok("Draaiboek consult ("+card.playbook.reduce((a,p)=>a+p.minutes,0)+" min)",card.playbook.map(p=>'<div class="ikk-fase"><div class="ikk-fase-kop">'+E(p.title)+' <span class="muted">'+E(p.minutes)+' min</span></div><ul class="ikk-lijst">'+p.items.map(i=>'<li><span class="ikk-kind ikk-'+E(i.kind)+'">'+ikkKindLabel(i.kind)+'</span> '+E(i.text)+(i.hint?' <span class="td-norm-basis">'+E(i.hint)+'</span>':"")+'</li>').join("")+'</ul></div>').join(""));
  html+='<div class="td-ovl-meta">Intake-kaart naar Michels onboarding_card.py (Kyle-model) · '+E(card.filled_fields)+' ingevulde velden · berekend '+E(card.built)+'</div>';
  html+='</div>';
  return html;
}
// Sectie op de atletenkaart (app/testdata.js roept dit aan).
function ikkSectie(a){
  if(!a||!a.input||!ikkHeeftIntake(a.input))return "";
  let card;
  try{card=ikkBuild(Object.assign({name:a.name},a.input),tdsVandaag());}catch(e){console.error("ikkBuild",a.name,e);return "";}
  const note=card.feasibility?card.feasibility.verdict+" · "+card.filled_fields+" velden":card.filled_fields+" velden";
  return tdsSec("intake","Intake-kaart (consult)",note,ikkHtml(card),"td-sec-intake");
}
