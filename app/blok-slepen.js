// app/blok-slepen.js — losse blokken slepen op de kalenderkaarten (18 nov 2026)
// Wens van de coaches: één onderdeel oppakken (bijv. alleen blok B) en het
// hoger of lager in dezelfde workout zetten, of naar een andere dag slepen.
// Werkt op drie plekken met dezelfde code:
//   klant : de klantkalender            (blocks, workouts)
//   blog  : de blogkalender             (blocks, workouts met audience 'blog')
//   prog  : Template week / Template dag (program_blocks, program_workouts)
//
// Opzet: de kaarten zetten alleen wat kenmerken in de HTML (bsBlokAttr op een
// blok, bsKaartAttr op een kaart, bsDagAttr op een dagvak). Dit bestand vangt
// het slepen één keer af op het hele document; per plek staat hieronder in
// BS_CTX hoe je daar een workout vindt, een nieuwe maakt en het scherm ververst.
//
// Regels:
// - Loslaten op een blok: ervoor of erna, afhankelijk van de bovenste of
//   onderste helft. Een blauwe streep laat zien waar hij komt.
// - Loslaten elders op een kaart: onderaan die workout.
// - Loslaten op een dag: onderaan de laatste workout van die dag; is de dag
//   leeg (of alleen een rustdag), dan komt er een nieuwe workout.
// - Een superset met kaarttitel verhuist als geheel. Een los blok uit een
//   gekoppeld rijtje (B1/B2) verhuist alleen en is daarna niet meer gekoppeld.
// - Gelogde scores hangen aan het blok en gaan dus mee (eerst een vraag).
// - Staat de bron of het doel open in de bouwer, dan eerst opslaan: anders
//   schrijft de bouwer er bij het opslaan overheen.
let BS=null;      // wat er gesleept wordt: {ctx, wid, bid}
let bsMerk=null;  // element dat nu als doel gemarkeerd is

const bsRust=w=>/^rest ?day$/i.test(((w&&w.title)||"").trim());
const bsSort=bl=>(bl||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));

const BS_CTX={
  klant:{
    tabel:"blocks",fk:"workout_id",scores:true,
    workout:id=>monthWorkouts[id]||null,
    blokken:w=>bsSort(w.blocks),
    mag:()=>true,
    bouwerOp:wid=>!!editWid&&editWid===wid,
    bouwerOpen:()=>false, // de klantbouwer blijft staan bij verversen; alleen bron/doel telt
    gelogd:b=>!!monthResults[b.id],
    dag:w=>w.workout_date,
    opDag:d=>Object.values(monthWorkouts).filter(w=>w.workout_date===d&&!bsRust(w)).sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))),
    nieuw:async(d,titel)=>{
      if(!calClient)throw new Error("Open eerst een klant");
      const{data,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:calClient,workout_date:d,title:titel}).select().single();
      if(error)throw error;return data.id;
    },
    // Een leeggesleepte workout ruimen we alleen op als er echt niets meer aan hangt.
    leegWeg:async w=>{
      if(w.warmup||w.cooldown||w.coach_notes)return;
      if(w.workout_date<todayStr())return; // het verleden laten we staan
      if((monthComments||[]).some(c=>c.workout_id===w.id)||monthEffort[w.id])return;
      await db.from("workouts").delete().eq("id",w.id);
    },
    na:async()=>{await renderMonth();},
  },
  blog:{
    tabel:"blocks",fk:"workout_id",scores:true,
    workout:id=>(BLOG.workouts||[]).find(w=>w.id===id)||null,
    blokken:w=>bsSort(w.blocks),
    mag:()=>true,
    bouwerOp:()=>false,
    bouwerOpen:()=>!!BLOG.editDay,
    gelogd:()=>false, // scores van volgers zijn hier niet geladen; ze gaan wel mee met het blok
    dag:w=>w.workout_date,
    opDag:d=>(BLOG.workouts||[]).filter(w=>w.workout_date===d&&!bsRust(w)).sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||""))),
    nieuw:async(d,titel)=>{
      const{data,error}=await db.from("workouts").insert({company_id:ME.profile.company_id,coach_id:ME.user.id,client_id:null,audience:"blog",blog_program_id:BLOG.cur.id,workout_date:d,title:titel}).select().single();
      if(error)throw error;return data.id;
    },
    leegWeg:async w=>{
      if(w.warmup||w.cooldown||w.coach_notes)return;
      if(w.workout_date<todayStr())return;
      await db.from("workouts").delete().eq("id",w.id);
    },
    na:async()=>{await blogHerlaad();},
  },
  prog:{
    tabel:"program_blocks",fk:"program_workout_id",scores:false,
    workout:id=>((PROG&&PROG.workouts)||[]).find(w=>w.id===id)||null,
    blokken:w=>bsSort(w.program_blocks),
    mag:()=>progMagOfMeld(),
    bouwerOp:()=>false,
    bouwerOpen:()=>!!progEditDay,
    gelogd:()=>false,
    dag:w=>w.week+":"+w.day,
    opDag:d=>{const[wk,dg]=d.split(":").map(Number);return ((PROG&&PROG.workouts)||[]).filter(w=>w.week===wk&&w.day===dg&&!bsRust(w)).sort((a,b)=>(a.sort||0)-(b.sort||0));},
    nieuw:async(d,titel)=>{
      const[wk,dg]=d.split(":").map(Number);
      const{data,error}=await db.from("program_workouts").insert({program_id:PROG.id,company_id:ME.profile.company_id,week:wk,day:dg,title:titel}).select().single();
      if(error)throw error;return data.id;
    },
    leegWeg:async w=>{
      if(w.warmup||w.cooldown||w.coach_notes)return;
      await db.from("program_workouts").delete().eq("id",w.id);
    },
    // Na het herladen ook doorzetten naar klanten die dit programma volgen (als dat aan staat).
    na:async dagen=>{
      await progReloadWorkouts();
      const uniek=[...new Set(dagen)].map(d=>{const[wk,dg]=d.split(":").map(Number);return {week:wk,day:dg};});
      progSyncNa(uniek);
    },
  },
};

// ---------- Kenmerken voor de kaarten ----------
function bsBlokAttr(id){return id?' draggable="true" data-bid="'+esc(String(id))+'" title="Sleep dit blok hoger, lager of naar een andere dag"':'';}
function bsKaartAttr(ctx,wid){return ' data-bsctx="'+ctx+'" data-bswid="'+esc(String(wid))+'"';}
function bsDagAttr(ctx,dag){return ' data-bsctx="'+ctx+'" data-bsdag="'+esc(String(dag))+'"';}

// ---------- Rekenwerk (los van het scherm, zodat het te testen is) ----------
// Wat hoort bij elkaar als je dit blok oppakt? Een superset met kaarttitel gaat
// als geheel; al het andere is één blok.
function bsEenheid(lijst,bid){
  const groepen=[];
  lijst.forEach((b,i)=>{if(i>0&&b.linked&&groepen.length)groepen[groepen.length-1].push(b);else groepen.push([b]);});
  const g=groepen.find(x=>x.some(b=>String(b.id)===String(bid)));
  if(!g)return [];
  if(g.length>1&&(g[0].group_title||"").trim())return g;
  return g.filter(b=>String(b.id)===String(bid));
}
// Volgorde, letters (A, B1, B2, C) en koppeling voor een lijst blokken, in de
// volgorde zoals hij moet worden. Zelfde nummering als relabel() in de bouwer.
function bsNummer(lijst){
  const uit=[];let gi=-1,groep=[];
  const sluit=()=>{if(!groep.length)return;const L=String.fromCharCode(65+Math.min(gi,25));groep.forEach((r,p)=>{r.label=groep.length>1?L+(p+1):L;});groep=[];};
  lijst.forEach((b,i)=>{
    const linked=i>0&&!!b.linked;
    if(!linked){sluit();gi++;}
    const r={id:b.id,sort:i+1,linked,label:""};
    groep.push(r);uit.push(r);
  });
  sluit();
  return uit;
}
// Het plan: welke blokken krijgen welke workout, volgorde, letter en koppeling.
// bron/doel: gesorteerde lijsten (zelfde lijst als het dezelfde workout is).
// ref: het blok waarop is losgelaten (of null = onderaan), pos: "voor" of "na".
// Geeft {bronNa, doelNa, eenheid} terug, of null als er niets verandert.
function bsPlan(bron,doel,bid,refBid,pos,zelfde){
  const eenheid=bsEenheid(bron,bid);
  if(!eenheid.length)return null;
  const inE=b=>eenheid.some(e=>String(e.id)===String(b.id));
  // Kopieën, zodat we koppelingen kunnen aanpassen zonder de geladen data te raken.
  const kopie=l=>l.map(b=>Object.assign({},b));
  const bronK=kopie(bron);
  // Was het opgepakte blok het begin van een gekoppeld rijtje? Dan wordt het
  // volgende blok het nieuwe begin (anders hangt het aan het verkeerde blok).
  const i0=bronK.findIndex(b=>String(b.id)===String(eenheid[0].id));
  const volgende=bronK[i0+eenheid.length];
  if(volgende&&volgende.linked&&!bronK[i0].linked)volgende.linked=false;
  const stuk=bronK.filter(inE).map((b,i)=>Object.assign(b,{linked:i>0}));
  const bronRest=bronK.filter(b=>!inE(b));
  const basis=zelfde?bronRest:kopie(doel);
  let idx=basis.length;
  if(refBid!=null){
    const refE=bsEenheid(zelfde?bron:doel,refBid);
    if(!refE.length)return null;
    if(refE.some(inE))return null; // op zichzelf losgelaten
    const anker=pos==="voor"?refE[0]:refE[refE.length-1];
    const ai=basis.findIndex(b=>String(b.id)===String(anker.id));
    if(ai<0)return null;
    idx=pos==="voor"?ai:ai+1;
    // Niet midden in een gekoppeld rijtje landen: dan schuift hij tot erachter.
    while(basis[idx]&&basis[idx].linked)idx++;
  }
  const doelNa=basis.slice(0,idx).concat(stuk,basis.slice(idx));
  if(zelfde){
    const zelfdeVolgorde=doelNa.every((b,i)=>String(b.id)===String(bron[i].id));
    if(zelfdeVolgorde)return null;
  }
  return {eenheid:stuk,bronNa:zelfde?null:bronRest,doelNa};
}

// ---------- Uitvoeren ----------
async function bsVerplaats(sleep,doel){
  const C=BS_CTX[sleep.ctx];if(!C)return;
  if(!C.mag())return;
  if(C.bouwerOpen()){toast("Sla eerst de open workout op (of sluit hem), daarna kun je blokken slepen");return;}
  const bronW=C.workout(sleep.wid);
  if(!bronW){toast("Workout niet gevonden; ververs de pagina");return;}
  let doelWid=doel.wid||null,nieuwGemaakt=false;
  if(!doelWid){
    const opDag=C.opDag(doel.dag);
    if(opDag.length)doelWid=opDag[opDag.length-1].id;
  }
  const zelfde=!!doelWid&&String(doelWid)===String(sleep.wid);
  if(zelfde&&doel.refBid==null&&!doel.wid)return; // losgelaten op de eigen dag, naast de kaart: niets doen
  if(C.bouwerOp(sleep.wid)||(doelWid&&C.bouwerOp(doelWid))){toast("Deze workout staat open in de bouwer. Sla hem eerst op, daarna kun je blokken slepen");return;}
  const bron=C.blokken(bronW);
  const eenheid=bsEenheid(bron,sleep.bid);
  if(!eenheid.length){toast("Blok niet gevonden; ververs de pagina");return;}
  if(!zelfde&&C.scores&&eenheid.some(C.gelogd)){
    if(!confirm("Dit blok heeft al een gelogde score. Toch verplaatsen?\n\nDe score gaat mee naar de nieuwe plek."))return;
  }
  try{
    if(!doelWid){doelWid=await C.nieuw(doel.dag,bronW.title||"Training");nieuwGemaakt=true;}
    const doelW=nieuwGemaakt?null:C.workout(doelWid);
    if(!nieuwGemaakt&&!doelW){toast("Doel-workout niet gevonden; ververs de pagina");return;}
    const plan=bsPlan(bron,nieuwGemaakt?[]:C.blokken(doelW),sleep.bid,doel.refBid==null?null:doel.refBid,doel.pos,zelfde);
    if(!plan)return;
    const oud={};bron.concat(doelW&&!zelfde?C.blokken(doelW):[]).forEach(b=>{oud[b.id]=b;});
    const verhuisd=new Set(plan.eenheid.map(b=>String(b.id)));
    const schrijf=async(lijst,wid)=>{
      for(const r of bsNummer(lijst)){
        const o=oud[r.id]||{};
        const patch={};
        if(!zelfde&&verhuisd.has(String(r.id)))patch[C.fk]=wid;
        if((o.sort||0)!==r.sort)patch.sort=r.sort;
        if((o.label||"")!==r.label)patch.label=r.label;
        if(!!o.linked!==r.linked)patch.linked=r.linked;
        if(!Object.keys(patch).length)continue;
        const{error}=await db.from(C.tabel).update(patch).eq("id",r.id);
        if(error)throw error;
      }
    };
    await schrijf(plan.doelNa,doelWid);
    if(plan.bronNa)await schrijf(plan.bronNa,sleep.wid);
    // De scores en video's van het lid wijzen ook naar de workout: meeverhuizen.
    if(!zelfde&&C.scores){
      for(const id of verhuisd){
        try{
          await db.from("results").update({workout_id:doelWid}).eq("block_id",id);
          await db.from("result_media").update({workout_id:doelWid}).eq("block_id",id);
        }catch(e){}
      }
    }
    if(plan.bronNa&&!plan.bronNa.length){try{await C.leegWeg(bronW);}catch(e){}}
    toast(zelfde?"Blok verplaatst":(nieuwGemaakt?"Blok verplaatst naar een nieuwe workout":"Blok verplaatst naar \""+((doelW&&doelW.title)||"workout")+"\""));
  }catch(e){
    toast((e&&e.message)||"Verplaatsen mislukt");
  }
  await C.na([C.dag(bronW),doel.dag||(C.workout(doelWid)?C.dag(C.workout(doelWid)):C.dag(bronW))].filter(Boolean));
}

// ---------- Slepen afvangen (één keer, op het hele document) ----------
function bsWis(){
  if(bsMerk){bsMerk.classList.remove("bs-voor","bs-na","bs-doel");bsMerk=null;}
}
// Waar zou hij nu landen? Geeft {el, wid|dag, refBid, pos} of null.
function bsDoel(ev){
  if(!BS||!ev.target||!ev.target.closest)return null;
  const blok=ev.target.closest(".cblk[data-bid]");
  const kaart=ev.target.closest(".mcard[data-bswid]");
  if(kaart&&kaart.dataset.bsctx===BS.ctx){
    if(blok&&kaart.contains(blok)){
      const r=blok.getBoundingClientRect();
      return {el:blok,wid:kaart.dataset.bswid,refBid:blok.dataset.bid,pos:ev.clientY<r.top+r.height/2?"voor":"na"};
    }
    return {el:kaart,wid:kaart.dataset.bswid,refBid:null,pos:"na"};
  }
  const vak=ev.target.closest("[data-bsdag]");
  if(vak&&vak.dataset.bsctx===BS.ctx)return {el:vak,dag:vak.dataset.bsdag,refBid:null,pos:"na"};
  return null;
}
document.addEventListener("dragstart",ev=>{
  const blok=ev.target&&ev.target.closest?ev.target.closest(".cblk[data-bid]"):null;
  if(!blok||ev.target!==blok)return;
  const kaart=blok.closest(".mcard[data-bswid]");if(!kaart)return;
  BS={ctx:kaart.dataset.bsctx,wid:kaart.dataset.bswid,bid:blok.dataset.bid};
  try{ev.dataTransfer.effectAllowed="move";ev.dataTransfer.setData("text/plain","blok");}catch(e){}
  setTimeout(()=>blok.classList.add("bs-sleep"),0); // na het maken van het sleepplaatje
},true);
document.addEventListener("dragover",ev=>{
  if(!BS)return;
  const d=bsDoel(ev);
  if(!d){bsWis();return;}
  ev.preventDefault();ev.stopPropagation();
  try{ev.dataTransfer.dropEffect="move";}catch(e){}
  const klas=d.refBid!=null?(d.pos==="voor"?"bs-voor":"bs-na"):"bs-doel";
  if(bsMerk!==d.el||!d.el.classList.contains(klas)){bsWis();bsMerk=d.el;d.el.classList.add(klas);}
},true);
document.addEventListener("drop",ev=>{
  if(!BS)return;
  const d=bsDoel(ev),sleep=BS;
  BS=null;bsWis();
  document.querySelectorAll(".cblk.bs-sleep").forEach(x=>x.classList.remove("bs-sleep"));
  if(!d)return;
  ev.preventDefault();ev.stopPropagation();
  bsVerplaats(sleep,d);
},true);
document.addEventListener("dragend",()=>{
  BS=null;bsWis();
  document.querySelectorAll(".cblk.bs-sleep").forEach(x=>x.classList.remove("bs-sleep"));
},true);

// Engelse teksten (sleutel = exacte Nederlandse tekst, zie app/i18n.js).
if(typeof i18nLaad==="function")i18nLaad({
  "Sleep dit blok hoger, lager of naar een andere dag":"Drag this block up, down or to another day",
  "Sla eerst de open workout op (of sluit hem), daarna kun je blokken slepen":"Save the open workout first (or close it), then you can drag blocks",
  "Deze workout staat open in de bouwer. Sla hem eerst op, daarna kun je blokken slepen":"This workout is open in the builder. Save it first, then you can drag blocks",
  "Workout niet gevonden; ververs de pagina":"Workout not found; refresh the page",
  "Blok niet gevonden; ververs de pagina":"Block not found; refresh the page",
  "Doel-workout niet gevonden; ververs de pagina":"Target workout not found; refresh the page",
  "Blok verplaatst":"Block moved",
  "Blok verplaatst naar een nieuwe workout":"Block moved to a new workout",
  "Blok verplaatst naar \"{naam}\"":"Block moved to \"{naam}\"",
  "Verplaatsen mislukt":"Move failed",
});
