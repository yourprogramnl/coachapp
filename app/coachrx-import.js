// app/coachrx-import.js — CoachRx-geschiedenis importeren op het klant-scherm
// (zijbalk > CoachRx-import). De coach kiest de kalender-PDF van CoachRx; de
// browser leest hem lokaal uit (pdf.js via CDN, het bestand verlaat de computer
// niet), toont eerst een controle-overzicht en schrijft daarna workouts +
// blokken + resultaten voor deze klant. Alles krijgt coach_notes
// "Geïmporteerd uit CoachRx" (herkenbaar en gericht terug te draaien).
// PR-kandidaten (1RM-testblokken met resultaat) zijn een aanvinklijst en gaan
// als metrics-rijen naar Metingen & PR's. Jaartallen staan niet in de export;
// die worden afgeleid uit de doorlopende datums en gecheckt op de weekdag.
const CRX_MERK="Geïmporteerd uit CoachRx";
let crxData=null; // {dagen, prs} van de laatst gekozen PDF

async function openCoachRx(){
  const lay=document.querySelector(".client-layout");if(!lay)return;
  let sp=document.getElementById("sp-coachrx");
  if(sp&&sp.classList.contains("show")){sp.classList.remove("show");return;}
  sluitPanelen();
  if(sp){sp.classList.add("show");return;}
  sp=document.createElement("div");sp.id="sp-coachrx";sp.className="sidepanel show";
  sp.innerHTML='<div class="sp-head"><h3>CoachRx-import</h3><span class="sp-x" onclick="document.getElementById(\'sp-coachrx\').classList.remove(\'show\')"><svg class="i"><use href="#i-x"/></svg></span></div>'+
    '<div class="sm" style="color:#8b919b;line-height:1.5;margin-bottom:12px">Kies de kalender-export (PDF) van deze klant uit CoachRx. De PDF wordt hier in je browser uitgelezen en verlaat je computer niet. Je ziet eerst een controle-overzicht; daarna importeer je de geschiedenis met één klik.</div>'+
    '<input type="file" id="crx-file" accept="application/pdf" style="display:none" onchange="crxGekozen(this)">'+
    '<button class="sp-btn" onclick="document.getElementById(\'crx-file\').click()">PDF kiezen…</button>'+
    '<div id="crx-uit" style="margin-top:14px"></div>';
  lay.insertBefore(sp,lay.querySelector(".cmain"));
  crxBestaandeCheck();
}

// Eerdere import voor deze klant? Dan een waarschuwing + opruimknop tonen.
async function crxBestaandeCheck(){
  const host=document.getElementById("crx-uit");if(!host)return;
  const{count}=await db.from("workouts").select("id",{count:"exact",head:true}).eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  if(count>0){
    host.innerHTML='<div class="sp-dark" style="display:block;line-height:1.5">⚠️ Er staan al <b>'+count+'</b> geïmporteerde CoachRx-workouts bij deze klant. Nog een keer importeren geeft dubbele geschiedenis.'+
      '<br><button class="sp-btn ghost" style="width:auto;padding:8px 14px;margin-top:8px" onclick="crxEerdereWeg()">Eerdere import verwijderen</button></div>';
  }
}
async function crxEerdereWeg(){
  if(!confirm("Alle eerder geïmporteerde CoachRx-workouts (en de scores daarop) van deze klant verwijderen?"))return;
  const{error}=await db.from("workouts").delete().eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  if(error){toast(error.message||"Verwijderen mislukt");return;}
  toast("Eerdere import verwijderd");
  const host=document.getElementById("crx-uit");if(host)host.innerHTML="";
  renderMonth();
}

// pdf.js één keer laden (CDN); UMD-build zet window.pdfjsLib klaar.
function crxPdfJs(){
  if(window.pdfjsLib)return Promise.resolve();
  return new Promise((ok,nee)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
    s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";ok();};
    s.onerror=()=>nee(new Error("pdf.js kon niet laden (internet?)"));
    document.head.appendChild(s);
  });
}

// PDF -> tekstregels: items per pagina groeperen op regelhoogte (y), binnen
// een regel op x sorteren; zelfde aanpak als de eerdere losse import-scripts.
async function crxTekstUitPdf(file){
  await crxPdfJs();
  const doc=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const regels=[];
  for(let p=1;p<=doc.numPages;p++){
    const tc=await (await doc.getPage(p)).getTextContent();
    const rijen={};
    tc.items.forEach(it=>{const y=Math.round(it.transform[5]);(rijen[y]=rijen[y]||[]).push(it);});
    Object.keys(rijen).map(Number).sort((a,b)=>b-a)
      .forEach(y=>regels.push(rijen[y].sort((a,b)=>a.transform[4]-b.transform[4]).map(i=>i.str).join("")));
    const el=document.getElementById("crx-uit");
    if(el&&p%25===0)el.innerHTML='<div class="sm" style="color:#8b919b">PDF lezen… pagina '+p+"/"+doc.numPages+"</div>";
  }
  return regels.join("\n");
}

// ---------- Parser (zelfde logica als coachrx-import/parse-coachrx.js) ----------
const CRX_WD={SUN:0,MON:1,TUE:2,WED:3,THU:4,FRI:5,SAT:6};
function crxParse(ruw){
  const NOISE=[/^CALENDAR: /i,/^COACH /i,/^EXERCISE RX:/i];
  const regels=ruw.split(/\r?\n/).map(r=>r.trim()).filter(r=>r&&!NOISE.some(p=>p.test(r)));
  const DAG_RE=/^(MON|TUE|WED|THU|FRI|SAT|SUN)\s+(\d{1,2})\/(\d{1,2})\s*(.*)$/;
  const BLOK_RE=/^([A-K]\d?)\.\s+(.+)$/;
  const dagen=[];let dag=null;
  for(const regel of regels){
    const dm=regel.match(DAG_RE);
    if(dm){dag={wd:dm[1],maand:+dm[2],dagnr:+dm[3],titel:(dm[4]||"").trim(),regels:[]};dagen.push(dag);continue;}
    if(dag)dag.regels.push(regel);
  }
  // Jaartallen: datums lopen op (maand omlaag = jaarwissel); kies het startjaar
  // waarbij de weekdagen het vaakst kloppen.
  const metJaren=(sj)=>{
    let jaar=sj,vorige=null,goed=0;const uit=[];
    for(const d of dagen){
      if(vorige!=null&&d.maand<vorige)jaar+=1;
      vorige=d.maand;
      if(new Date(Date.UTC(jaar,d.maand-1,d.dagnr)).getUTCDay()===CRX_WD[d.wd])goed+=1;
      uit.push({...d,jaar});
    }
    return{uit,goed};
  };
  let beste=null;
  for(let sj=2020;sj<=2027;sj++){const k=metJaren(sj);if(!beste||k.goed>beste.goed)beste=k;}
  const STERK=/^(Complete|\d{1,2}:\d{2}(\s*min\.?)?|\d+([.,]\d+)?(\s*(kg|reps|rondes|rounds|cal))?)$/i;
  const uit=beste.uit.map(d=>{
    const blokken=[];const warmup=[];let blok=null;
    for(const regel of d.regels){
      const bm=regel.match(BLOK_RE);
      if(bm){blok={label:bm[1],naam:bm[2].trim(),regels:[]};blokken.push(blok);continue;}
      if(!blok){warmup.push(regel.replace(/^WARMUP:\s*/i,""));continue;}
      blok.regels.push(regel);
    }
    const nette=blokken.map(b=>{
      let ster=-1;b.regels.forEach((r,i)=>{if(r.startsWith("*"))ster=i;});
      let voorschrift,resultaat;
      if(ster>=0){voorschrift=b.regels.slice(0,ster+1);resultaat=b.regels.slice(ster+1);}
      else{
        voorschrift=[...b.regels];resultaat=[];
        while(voorschrift.length&&STERK.test(voorschrift[voorschrift.length-1]))resultaat.unshift(voorschrift.pop());
      }
      return{label:b.label,naam:b.naam,voorschrift:voorschrift.join("\n").trim(),resultaat:resultaat.join("\n").trim()};
    });
    const datum=d.jaar+"-"+String(d.maand).padStart(2,"0")+"-"+String(d.dagnr).padStart(2,"0");
    return{datum,wdKlopt:new Date(datum+"T12:00:00Z").getUTCDay()===CRX_WD[d.wd],titel:d.titel,warmup:warmup.join("\n").trim(),blokken:nette};
  });
  const prs=[];
  uit.forEach(d=>d.blokken.forEach(b=>{
    if(/\b\d?\s?RM\b|1RM/i.test(b.voorschrift+" "+b.naam)&&b.resultaat)prs.push({datum:d.datum,naam:b.naam,resultaat:b.resultaat});
  }));
  return{dagen:uit,prs};
}

// Beste catalogus-meting bij een bloknaam (voor de PR-aanvinklijst)
function crxMetingVoor(naam){
  const alle=Object.values(METRICS_DEF).flat();
  const norm=s=>String(s||"").toLowerCase().replace(/\(.*?\)/g," ").replace(/\b\d+\s*rm\b/g," ").replace(/[^a-z]+/g," ").trim();
  const n=norm(naam);
  if(!n)return"";
  let hit=alle.find(m=>norm(m)===n);
  if(!hit)hit=alle.find(m=>norm(m)===n+" ");
  if(!hit)hit=alle.find(m=>norm(m).startsWith(n)||n.startsWith(norm(m)));
  return hit||"";
}
// Eerste bruikbare kilogetal uit een resultaat (voorzetje; coach kan het aanpassen)
function crxKgUit(res){
  let beste=null;
  for(const m of String(res||"").replace(/\b\d+:\d+\b/g," ").matchAll(/(\d+(?:[.,]\d+)?)\s*(%?)/g)){
    if(m[2]==="%")continue;
    const v=parseFloat(m[1].replace(",","."));
    if(!isNaN(v)&&v>=20&&v<=400&&(beste==null||v>beste))beste=v;
  }
  return beste==null?"":String(beste).replace(".",",");
}

async function crxGekozen(inp){
  const file=inp.files&&inp.files[0];if(!file)return;
  const host=document.getElementById("crx-uit");
  host.innerHTML='<div class="sm" style="color:#8b919b">PDF lezen…</div>';
  try{
    const tekst=await crxTekstUitPdf(file);
    crxData=crxParse(tekst);
  }catch(e){
    host.innerHTML='<div class="sp-dark" style="display:block">PDF lezen mislukt: '+esc(e.message||e)+'</div>';
    return;
  }
  const d=crxData.dagen;
  if(!d.length){host.innerHTML='<div class="sp-dark" style="display:block">Geen trainingsdagen gevonden. Is dit wel een CoachRx-kalenderexport?</div>';return;}
  const blokken=d.reduce((n,x)=>n+x.blokken.length,0);
  const metRes=d.reduce((n,x)=>n+x.blokken.filter(b=>b.resultaat).length,0);
  const wdFout=d.filter(x=>!x.wdKlopt).length;
  const proef=d.find(x=>x.blokken.some(b=>b.resultaat))||d[0];
  host.innerHTML=
    '<div class="sp-dark" style="display:block;line-height:1.6"><b>Gevonden in de PDF:</b><br>'+
    d.length+' trainingsdagen · '+d[0].datum+' t/m '+d[d.length-1].datum+'<br>'+
    blokken+' onderdelen, waarvan '+metRes+' met een gelogd resultaat<br>'+
    (wdFout===0?'✅ Alle datums kloppen tot op de weekdag':'⚠️ '+wdFout+' datums kloppen niet met de weekdag — importeer pas na controle')+
    '</div>'+
    '<div class="sm" style="color:#8b919b;margin:10px 0 4px">Steekproef · '+esc(proef.datum)+' · '+esc(proef.titel||"")+'</div>'+
    '<div class="sp-list">'+proef.blokken.slice(0,3).map(b=>'<b>'+esc(b.label)+') '+esc(b.naam)+'</b>'+(b.resultaat?'<br><span style="color:#27b376">'+esc(b.resultaat.split("\n")[0])+'</span>':'')).join("<br>")+'</div>'+
    '<button class="sp-btn" style="margin-top:12px" id="crx-go" onclick="crxImporteer()">Geschiedenis importeren ('+d.length+' dagen)</button>'+
    '<div id="crx-voortgang" class="sm" style="color:#8b919b;margin-top:8px"></div>'+
    crxPrHtml();
  crxBestaandeVooraan();
}
// Waarschuwing over een eerdere import bovenaan het resultaat houden
async function crxBestaandeVooraan(){
  const{count}=await db.from("workouts").select("id",{count:"exact",head:true}).eq("client_id",calClient).eq("coach_notes",CRX_MERK);
  const host=document.getElementById("crx-uit");
  if(count>0&&host)host.insertAdjacentHTML("afterbegin",
    '<div class="sp-dark" style="display:block;line-height:1.5">⚠️ Er staan al <b>'+count+'</b> geïmporteerde workouts bij deze klant. <button class="sp-btn ghost" style="width:auto;padding:6px 12px;margin-top:6px" onclick="crxEerdereWeg()">Eerdere import verwijderen</button></div>');
}

function crxPrHtml(){
  const prs=crxData.prs||[];
  if(!prs.length)return"";
  return '<div class="sp-head" style="margin-top:18px"><h3>PR-kandidaten ('+prs.length+')</h3></div>'+
    '<div class="sm" style="color:#8b919b;line-height:1.5;margin-bottom:8px">Testblokken met een 1RM/RM en een resultaat. Vink aan wat er als meting bij Metingen & PR\'s moet komen; controleer meting en gewicht per regel.</div>'+
    prs.map((p,i)=>{
      const meting=crxMetingVoor(p.naam);
      return '<div class="sp-dark" style="display:block;line-height:1.5">'+
        '<label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" class="crx-pr" data-i="'+i+'" style="margin-top:3px">'+
        '<span style="flex:1"><b>'+esc(p.datum)+' · '+esc(p.naam)+'</b><br><span class="sm" style="color:#8b919b">'+esc(p.resultaat.split("\n").slice(0,2).join(" · ")).slice(0,140)+'</span></span></label>'+
        '<div style="display:flex;gap:8px;margin-top:6px;align-items:center">'+
        '<input class="crx-pr-m" data-i="'+i+'" list="crx-metingen" value="'+esc(meting)+'" placeholder="meting…" style="flex:1">'+
        '<input class="crx-pr-kg" data-i="'+i+'" value="'+esc(crxKgUit(p.resultaat))+'" placeholder="kg" style="width:70px;text-align:center"></div></div>';
    }).join("")+
    '<datalist id="crx-metingen">'+Object.values(METRICS_DEF).flat().map(m=>'<option value="'+esc(m)+'">').join("")+'</datalist>'+
    '<button class="sp-btn" style="margin-top:10px" onclick="crxPrsBoeken()">Aangevinkte PR\'s opslaan als metingen</button>';
}

async function crxPrsBoeken(){
  const vinken=[...document.querySelectorAll(".crx-pr:checked")];
  if(!vinken.length){toast("Vink eerst één of meer PR's aan");return;}
  const rows=[];
  for(const v of vinken){
    const i=v.dataset.i;
    const meting=(document.querySelector('.crx-pr-m[data-i="'+i+'"]').value||"").trim();
    const kg=parseFloat((document.querySelector('.crx-pr-kg[data-i="'+i+'"]').value||"").replace(",","."));
    if(!meting||isNaN(kg)||kg<=0){toast("Regel "+(+i+1)+": vul een meting én een geldig gewicht in");return;}
    const p=crxData.prs[i];
    rows.push({athlete_id:calClient,company_id:ME.profile.company_id,metric:meting,value:kg,unit:"kg",measured_at:p.datum,created_by:ME.user.id,note:CRX_MERK});
  }
  const{error}=await db.from("metrics").insert(rows);
  if(error){toast(error.message||"Opslaan mislukt");return;}
  toast(rows.length+" meting"+(rows.length===1?"":"en")+" opgeslagen bij Metingen & PR's");
  vinken.forEach(v=>{v.checked=false;});
}

async function crxImporteer(){
  if(!crxData)return;
  const knop=document.getElementById("crx-go");
  const vg=document.getElementById("crx-voortgang");
  knop.disabled=true;knop.textContent="Bezig met importeren…";
  const dagen=crxData.dagen;
  const BATCH=40;
  try{
    for(let i=0;i<dagen.length;i+=BATCH){
      const deel=dagen.slice(i,i+BATCH);
      // 1) workouts (PostgREST geeft de rijen terug in de volgorde van invoer)
      const wRows=deel.map(d=>({company_id:ME.profile.company_id,coach_id:coachClients.find(k=>k.id===calClient)?.coach_id||ME.user.id,client_id:calClient,workout_date:d.datum,title:d.titel||"Training",coach_notes:CRX_MERK,warmup:d.warmup||null}));
      const{data:ws,error:we}=await db.from("workouts").insert(wRows).select("id");
      if(we)throw we;
      // 2) blokken
      const bRows=[];
      deel.forEach((d,di)=>d.blokken.forEach((b,bi)=>bRows.push({workout_id:ws[di].id,kind:"exercise",label:b.label,exercise:b.naam,prescription:b.voorschrift||null,sort:bi+1,score_type:"text",_res:b.resultaat})));
      const kaal=bRows.map(({_res,...r})=>r);
      const{data:bs,error:be}=await db.from("blocks").insert(kaal).select("id,workout_id");
      if(be)throw be;
      // 3) resultaten (zelfde volgorde als de blokken)
      const rRows=[];
      bRows.forEach((b,bi)=>{
        if(b._res)rRows.push({block_id:bs[bi].id,workout_id:bs[bi].workout_id,athlete_id:calClient,company_id:ME.profile.company_id,status:"completed",score_text:b._res,is_public:false});
      });
      if(rRows.length){const{error:re}=await db.from("results").insert(rRows);if(re)throw re;}
      vg.textContent="Geïmporteerd: "+Math.min(i+BATCH,dagen.length)+" van "+dagen.length+" dagen…";
    }
    vg.textContent="";
    knop.textContent="Import klaar ✓";
    toast(dagen.length+" dagen geschiedenis geïmporteerd");
    renderMonth();
  }catch(e){
    knop.disabled=false;knop.textContent="Geschiedenis importeren ("+dagen.length+" dagen)";
    vg.textContent="Mislukt: "+(e.message||e)+" — al geïmporteerde dagen kun je opruimen met 'Eerdere import verwijderen' en dan opnieuw proberen.";
  }
}
