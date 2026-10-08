// app/oude-logs.js: oude tekstlogs van krachtblokken omzetten naar sets (krachtlog stap 5).
// Venster vanuit het Metrics-paneel ("Oude logs omzetten"): per klant alle gelogde
// resultaten op een lift die nog geen sets hebben. De tekstlezer (setsUitTekst,
// dezelfde regels als de sporter-app) doet meteen een voorstel; "Lees met AI"
// laat Haiku (Edge Function oude-logs-sets) alle regels lezen met het voorschrift
// van de coach ernaast. Eens = groen en aangevinkt, verschil = oranje (nakijken),
// niets herkend = grijs. De coach corrigeert in de tekst, vinkt aan en slaat op.
// Elke opgeslagen set krijgt bron "oud": geen meldingen, en een 1RM eruit krijgt
// het label "Uit oude log". De oorspronkelijke tekst blijft altijd staan.
let OL={rows:[],client:null,bezig:false,filter:"alle"};
const OL_SLEUTEL=id=>"forge_oudelog_"+id; // AI-lezing in de browser bewaren: sluiten en later verdergaan kost niets extra
const OL_LBL={eens:"✓ eens",nakijken:"⚠ nakijken",lezer:"tekstlezer",geen:"geen sets"};
const OL_KLEUR={eens:"#27b376",nakijken:"#e5a13d",lezer:"#38bdf8",geen:"#b3b9c2"};

// Aantal oude logs van een klant (voor de knop in het Metrics-paneel).
async function olTel(clientId){
  try{
    const{count}=await db.from("results").select("id,blocks!inner(lift_id)",{count:"exact",head:true})
      .eq("athlete_id",clientId).eq("status","completed").is("sets",null).not("score_text","is",null).not("blocks.lift_id","is",null);
    return count||0;
  }catch(e){return 0;}
}
async function olKnopVernieuw(){
  const k=document.getElementById("ol-knop");if(!k||typeof calClient==="undefined"||!calClient)return;
  const n=await olTel(calClient);
  if(!document.getElementById("ol-knop"))return;
  k.style.display=n?"":"none";
  k.textContent="Oude logs omzetten ("+n+")";
}
// Alle oude logs van de klant ophalen en per regel het voorstel van de tekstlezer maken.
async function olLaad(clientId){
  const{data,error}=await db.from("results")
    .select("id,block_id,workout_id,athlete_id,company_id,score_text,created_at, blocks!inner(label,exercise,prescription,lift_id,lift_scheme), workouts(workout_date,title)")
    .eq("athlete_id",clientId).eq("status","completed").is("sets",null).not("score_text","is",null).not("blocks.lift_id","is",null)
    .order("created_at").limit(3000);
  if(error)throw error;
  const rows=(data||[]).filter(r=>r.blocks&&r.blocks.lift_id&&!(r.blocks.lift_scheme&&r.blocks.lift_scheme.geen_lift)&&String(r.score_text||"").trim()).map(r=>{
    const b=r.blocks,w=r.workouts||{};
    const schema=(b.lift_scheme&&b.lift_scheme.hand)?b.lift_scheme:(schemaLees(b.prescription||"")||b.lift_scheme||null);
    let ai=null;try{ai=JSON.parse(localStorage.getItem(OL_SLEUTEL(r.id))||"null");}catch(e){}
    const row={id:r.id,block_id:r.block_id,workout_id:r.workout_id,athlete_id:r.athlete_id,company_id:r.company_id,
      date:w.workout_date||"",titel:w.title||"",label:b.label||"",exercise:b.exercise||"",prescription:b.prescription||"",
      lift:liftNaam(b.lift_id),tekst:String(r.score_text||"").trim(),schema,lezer:setsUitTekst(r.score_text,schema).rows,
      ai:(ai&&Array.isArray(ai.sets))?ai:null,voorstel:"",status:"",reden:"",aan:false,klaar:false,bewerkt:null};
    olBepaal(row);
    return row;
  });
  // Nieuwste bovenaan in het venster (opslaan gebeurt oudste eerst, zie olOpslaan)
  rows.sort((a,b)=>(b.date||"").localeCompare(a.date||"")||a.exercise.localeCompare(b.exercise));
  return rows;
}
// Voorstel en status: AI en tekstlezer eens = groen (aangevinkt); verschil of AI leeg terwijl de lezer iets vond = oranje;
// nog geen AI = blauw (voorstel van de lezer); niets = grijs.
function olBepaal(row){
  const l=setsSamenvatting(row.lezer);
  if(row.ai){
    const a=setsSamenvatting(row.ai.sets);
    if(a){row.voorstel=a;row.status=(a===l)?"eens":"nakijken";row.reden="";}
    else{row.voorstel=l;row.status=l?"nakijken":"geen";row.reden=row.ai.reden||"";}
  }else{row.voorstel=l;row.status=l?"lezer":"geen";row.reden="";}
  row.aan=row.status==="eens";
}
function ensureOlModal(){
  if(document.getElementById("olmodal"))return;
  const w=document.createElement("div");
  w.innerHTML='<div class="lmodal" id="olmodal" style="z-index:450"><div class="box" style="width:1000px;max-width:97vw">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><h3 style="margin:0" id="ol-titel">Oude logs omzetten</h3><span onclick="closeOl()" style="cursor:pointer;color:#8a919c;font-size:22px;line-height:1">×</span></div>'+
    '<div class="sm muted" style="margin-bottom:10px;line-height:1.5">Gelogde tekst van krachtblokken die nog geen sets heeft. De tekstlezer doet een voorstel; met <b>Lees met AI</b> leest de AI alle regels met het voorschrift ernaast. Groen = AI en tekstlezer zijn het eens (staat aangevinkt). Oranje = nakijken. Je kunt elk voorstel aanpassen (bijv. "60x5 65x5 70x4"). Opslaan zet de sets bij het resultaat; de oorspronkelijke tekst blijft staan. Sets uit oude logs geven geen meldingen en krijgen het label "uit oude log".</div>'+
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">'+
      '<label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap"><input type="checkbox" id="ol-alles" style="width:auto;margin:0" onchange="olAlles(this.checked)"> Alle groene aanvinken</label>'+
      '<select id="ol-filter" onchange="olFilterZet(this.value)" style="width:auto;font-size:12px;padding:5px 8px"><option value="alle">Alles</option><option value="eens">✓ eens</option><option value="nakijken">⚠ nakijken</option><option value="lezer">tekstlezer</option><option value="geen">geen sets</option></select>'+
      '<span class="sm muted" id="ol-teller"></span>'+
      '<button class="btn ghost sm" id="ol-ai" onclick="olLeesAi()" style="margin-left:auto">🤖 Lees met AI</button>'+
      '<button class="btn ghost sm" id="ol-opnieuw" onclick="olOpnieuw()" title="Oranje regels opnieuw door de AI laten lezen (na een verbetering van de leesregels)">↻ Oranje opnieuw lezen</button></div>'+
    '<div class="sm muted" id="ol-status" style="margin-bottom:8px;min-height:16px"></div>'+
    '<div class="ol-kop"><span></span><span>Datum · blok · gelogde tekst</span><span>Sets (aanpasbaar)</span><span>Status</span></div>'+
    '<div style="max-height:56vh;overflow:auto;border:1px solid var(--line);border-radius:0 0 10px 10px;border-top:none"><div id="ol-lijst"></div></div>'+
    '<div class="mfoot" style="display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--line);padding-top:14px;margin-top:16px">'+
      '<button class="btn ghost" onclick="closeOl()">Sluiten</button>'+
      '<button class="btn" id="ol-save" onclick="olOpslaan()">Aangevinkte opslaan als sets</button></div>'+
    '</div></div>';
  document.body.appendChild(w.firstChild);
  document.getElementById("olmodal").addEventListener("click",e=>{if(e.target.id==="olmodal")closeOl();});
}
async function olOpen(){
  if(typeof calClient==="undefined"||!calClient)return;
  ensureOlModal();
  OL.client=calClient;OL.rows=[];OL.filter="alle";
  const p=(coachClients||[]).find(x=>x.id===calClient)||{};
  document.getElementById("ol-titel").textContent="Oude logs omzetten · "+naamVan(p);
  document.getElementById("ol-status").textContent="";
  const f=document.getElementById("ol-filter");if(f)f.value="alle";
  document.getElementById("ol-lijst").innerHTML='<div class="sm muted" style="padding:14px">Laden…</div>';
  document.getElementById("olmodal").classList.add("show");
  try{OL.rows=await olLaad(calClient);}
  catch(e){document.getElementById("ol-lijst").innerHTML='<div class="sm" style="padding:14px;color:#e5484d">Laden mislukt: '+esc(e.message||e)+'</div>';return;}
  olRender();
}
function closeOl(){const m=document.getElementById("olmodal");if(m)m.classList.remove("show");}
function olFilterZet(v){OL.filter=v;olRender();}
function olZichtbaar(){return OL.rows.filter(r=>!r.klaar&&(OL.filter==="alle"||r.status===OL.filter));}
function olRijHtml(r,i){
  const alt=(r.status==="nakijken"&&r.ai)
    ?'<div class="sm" style="color:#9a7b1f">AI: '+esc(r.ai.sets.length?setsSamenvatting(r.ai.sets):"leeg"+(r.reden?" · "+r.reden:""))+' · tekstlezer: '+esc(setsSamenvatting(r.lezer)||"leeg")+'</div>'
    :(r.status==="geen"&&r.reden?'<div class="sm muted">AI: '+esc(r.reden)+'</div>':'');
  const vs=(r.prescription||"").split("\n")[0].slice(0,90);
  const tekst=r.bewerkt!=null?r.bewerkt:r.voorstel;
  const gelezen=tekst?setsSamenvatting(setsUitTekst(tekst,r.schema).rows):"";
  return '<div class="ol-rij'+(r.klaar?' klaar':'')+'" data-i="'+i+'">'+
    '<input type="checkbox" class="ol-aan"'+(r.aan?" checked":"")+' onchange="olVink(this,'+i+')">'+
    '<div style="min-width:0"><div class="sm"><b>'+esc(datumNL(r.date))+'</b> · '+esc(r.label)+(r.label?") ":"")+esc(r.exercise)+(r.lift&&r.lift.toLowerCase()!==r.exercise.toLowerCase()?' <span class="muted">('+esc(r.lift)+')</span>':'')+(vs?' <span class="muted" title="'+esc(r.prescription)+'">· '+esc(vs)+'</span>':'')+'</div>'+
      '<div class="sm" style="white-space:pre-wrap;color:#1d2129">“'+esc(r.tekst)+'”</div>'+alt+'</div>'+
    '<div><input class="ol-sets" value="'+esc(tekst)+'" placeholder="bijv. 60x5 65x5" oninput="olWijzig(this,'+i+')"><div class="sm muted ol-gelezen">'+(gelezen&&gelezen!==tekst?"→ "+esc(gelezen):(tekst?"":"leeg: wordt niet opgeslagen"))+'</div></div>'+
    '<span class="ol-status" style="color:'+OL_KLEUR[r.status]+'">'+OL_LBL[r.status]+'</span></div>';
}
function olRender(){
  const host=document.getElementById("ol-lijst");if(!host)return;
  const zicht=olZichtbaar();
  host.innerHTML=zicht.length?zicht.map(r=>olRijHtml(r,OL.rows.indexOf(r))).join("")
    :'<div class="sm muted" style="padding:14px">'+(OL.rows.length?(OL.rows.every(r=>r.klaar)?"Alles is omgezet. 🎉":"Niets in deze weergave."):"Geen oude logs: alle krachtblokken van deze klant hebben al sets.")+'</div>';
  olTeller();
}
function olTeller(){
  const t=document.getElementById("ol-teller");if(!t)return;
  const open=OL.rows.filter(r=>!r.klaar);
  const n=s=>open.filter(r=>r.status===s).length;
  t.textContent=open.filter(r=>r.aan).length+" aangevinkt · "+n("eens")+" eens · "+n("nakijken")+" nakijken · "+n("lezer")+" tekstlezer · "+n("geen")+" geen sets"+(OL.rows.length-open.length?" · "+(OL.rows.length-open.length)+" omgezet":"");
}
function olVink(cb,i){const r=OL.rows[i];if(r)r.aan=cb.checked;olTeller();}
function olWijzig(inp,i){
  const r=OL.rows[i];if(!r)return;
  r.bewerkt=inp.value;r.aan=!!inp.value.trim();
  const rij=inp.closest(".ol-rij"),cb=rij&&rij.querySelector(".ol-aan");if(cb)cb.checked=r.aan;
  const g=rij&&rij.querySelector(".ol-gelezen");
  if(g){const gelezen=inp.value.trim()?setsSamenvatting(setsUitTekst(inp.value,r.schema).rows):"";g.textContent=gelezen&&gelezen!==inp.value.trim()?"→ "+gelezen:(inp.value.trim()?"":"leeg: wordt niet opgeslagen");}
  olTeller();
}
// Alle groene (eens) regels in de huidige weergave aan- of uitvinken.
function olAlles(aan){
  olZichtbaar().forEach(r=>{if(r.status==="eens")r.aan=aan;});
  olRender();
}
// AI laten lezen, in porties van 50 regels (Edge Function oude-logs-sets); de lezing wordt per regel in de browser bewaard.
async function olLeesAi(){
  if(OL.bezig)return;
  const todo=OL.rows.filter(r=>!r.ai&&!r.klaar);
  if(!todo.length){toast("Alle regels zijn al door de AI gelezen");return;}
  const knop=document.getElementById("ol-ai"),stat=document.getElementById("ol-status");
  knop.disabled=true;OL.bezig=true;
  let klaar=0,kosten=0,fout="";
  for(let i=0;i<todo.length;i+=50){
    const deel=todo.slice(i,i+50);
    stat.textContent="AI leest… "+klaar+" van "+todo.length+" regels"+(kosten?" · kosten tot nu ≈ $"+kosten.toFixed(2):"");
    const rijen=deel.map((r,j)=>({i:j,blok:r.exercise,voorschrift:(r.prescription||"").slice(0,300),log:r.tekst.slice(0,400)}));
    let data=null,error=null;
    try{({data,error}=await db.functions.invoke("oude-logs-sets",{body:{rijen}}));}catch(e){error=e;}
    if(error||!data||data.error){
      let t=(data&&data.error)||"";
      if(!t&&error&&error.context&&error.context.json){try{t=((await error.context.json())||{}).error||"";}catch(e){}}
      fout=t||(error&&error.message)||"AI-aanroep mislukt";break;
    }
    (data.rijen||[]).forEach(u=>{
      const r=deel[u.i];if(!r)return;
      r.ai={sets:(u.sets||[]).map(s=>({kg:s.kg!=null?kgTxt(s.kg):"",reps:s.reps!=null?String(s.reps):"",fail:!!s.fail})),reden:u.reden||""};
      try{localStorage.setItem(OL_SLEUTEL(r.id),JSON.stringify(r.ai));}catch(e){}
      r.bewerkt=null;olBepaal(r);
    });
    deel.forEach(r=>{if(!r.ai){r.ai={sets:[],reden:"geen antwoord van de AI"};r.bewerkt=null;olBepaal(r);}});
    klaar+=deel.length;kosten+=(data.kosten&&data.kosten.usd)||0;
    olRender();
  }
  OL.bezig=false;knop.disabled=false;
  stat.textContent=fout
    ?"Gestopt: "+fout+" · "+klaar+" van "+todo.length+" gelezen (nog een keer klikken gaat verder waar het bleef)"
    :"AI klaar: "+klaar+" regels gelezen · kosten ≈ $"+kosten.toFixed(2)+". Kijk de oranje regels na en sla op.";
}
// Oranje regels opnieuw laten lezen: de bewaarde AI-lezing weg en de AI nog een keer vragen
// (handig nadat de leesregels of de AI-instructie zijn verbeterd; kost alleen die regels).
function olOpnieuw(){
  if(OL.bezig)return;
  const oranje=OL.rows.filter(r=>r.status==="nakijken"&&!r.klaar);
  if(!oranje.length){toast("Geen oranje regels om opnieuw te lezen");return;}
  oranje.forEach(r=>{r.ai=null;r.bewerkt=null;try{localStorage.removeItem(OL_SLEUTEL(r.id));}catch(e){}olBepaal(r);});
  olLeesAi();
}
// Aangevinkte regels opslaan: sets (met bron "oud") bij het bestaande resultaat; oudste eerst zodat de
// 1RM-geschiedenis zich in de juiste volgorde opbouwt. De tekst van het resultaat blijft onaangeroerd.
async function olOpslaan(){
  const rows=OL.rows.filter(r=>r.aan&&!r.klaar);
  if(!rows.length){toast("Vink eerst één of meer regels aan");return;}
  const payload=[],leeg=[];
  rows.forEach(r=>{
    const tekst=(r.bewerkt!=null?r.bewerkt:r.voorstel)||"";
    const sets=setsNaarRec(setsUitTekst(tekst,r.schema).rows).map(s=>Object.assign(s,{bron:"oud"}));
    if(!sets.length){leeg.push(r);return;}
    payload.push({row:r,rec:{id:r.id,block_id:r.block_id,workout_id:r.workout_id,athlete_id:r.athlete_id,company_id:r.company_id,status:"completed",sets}});
  });
  if(leeg.length)toast(leeg.length+" aangevinkte regel"+(leeg.length===1?"":"s")+" zonder leesbare sets overgeslagen");
  if(!payload.length)return;
  payload.sort((a,b)=>(a.row.date||"").localeCompare(b.row.date||""));
  const knop=document.getElementById("ol-save");knop.disabled=true;
  let n=0;
  try{
    for(let i=0;i<payload.length;i+=100){
      const deel=payload.slice(i,i+100);
      const{error}=await db.from("results").upsert(deel.map(p=>p.rec),{onConflict:"id"});
      if(error)throw error;
      deel.forEach(p=>{p.row.klaar=true;p.row.aan=false;try{localStorage.removeItem(OL_SLEUTEL(p.row.id));}catch(e){}});
      n+=deel.length;
    }
    toast(n+" oude log"+(n===1?"":"s")+" omgezet naar sets");
  }catch(e){toast("Opslaan mislukt: "+(e.message||e)+(n?" · "+n+" al opgeslagen":""));}
  knop.disabled=false;
  olRender();
  // Records en cijfers verversen
  if(typeof klOngeldig==="function")klOngeldig(OL.client);
  if(typeof klLaad==="function"&&document.getElementById("kl-groep"))klLaad(OL.client,true).then(()=>{if(typeof mxRender==="function")mxRender();olKnopVernieuw();});
  else olKnopVernieuw();
}
