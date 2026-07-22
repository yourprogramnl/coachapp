// app/ai-coach.js — AI-coach-testpaneel (alleen platform_admin, verzoek Stefan
// 22 juli): sparren met Claude over programmering, gevoed door het
// geanonimiseerde trainingsarchief (tabel ai_archief, Edge Function ai-coach).
// Coaches zien deze sectie bewust nog niet; dit is de proef vóór de uitrol.
let AI={gesprek:[],bezig:false};

function fillAiCoach(){
  const cp=document.getElementById("cpage");if(!cp)return;
  if(myRole()!=="platform_admin"){cp.innerHTML='<div class="cempty">Deze sectie is alleen voor platform-admins.</div>';return;}
  cp.innerHTML='<div class="aiwrap" style="max-width:860px">'+
    '<div class="hrow"><h1>AI-coach <span class="cpill teal" style="text-transform:none">test</span></h1>'+
    '<button class="btn ghost" onclick="aiNieuw()">Nieuw gesprek</button></div>'+
    '<div class="sm muted" style="margin-bottom:14px">Sparringpartner op basis van 2 jaar geanonimiseerde programmering (73 atleten, 60.617 blokken). De AI zoekt zelf in het archief. Vraag bijv.: "Schrijf een trainingsweek voor een gevorderde CrossFitter met schouderklachten, 4 dagen, in onze stijl."</div>'+
    '<div id="ai-gesprek" style="display:flex;flex-direction:column;gap:12px;margin-bottom:14px"></div>'+
    '<div class="card" style="padding:12px;display:flex;gap:8px;align-items:flex-end">'+
      '<textarea id="ai-in" placeholder="Stel je vraag aan de AI-coach…" style="flex:1;min-height:52px;max-height:200px;border:none;resize:vertical;outline:none;font-family:inherit;font-size:13.5px" onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();aiVerstuur();}"></textarea>'+
      '<button class="btn" id="ai-knop" onclick="aiVerstuur()">Verstuur</button>'+
    '</div>'+
    '<div class="sm muted" style="margin-top:8px;font-size:11.5px">Antwoorden kunnen 1 tot 2 minuten duren (de AI leest eerst het archief). Kosten worden per antwoord getoond. Enter = versturen, Shift+Enter = nieuwe regel.</div>'+
  '</div>';
  aiRender();
}
function aiNieuw(){
  if(AI.bezig)return;
  AI.gesprek=[];
  aiRender();
  const inp=document.getElementById("ai-in");if(inp){inp.value="";inp.focus();}
}
// Nette weergave van het AI-antwoord: veilig escapen en daarna de opmaak die
// Claude vaak gebruikt omzetten: **vet**, ## kopjes, |tabellen| en lijstjes.
function aiTekstHtml(t){
  const vet=s=>s.replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>");
  const lines=esc(t).split("\n");
  let html="",i=0;
  while(i<lines.length){
    const l=lines[i];
    // Tabelblok: opeenvolgende |cel|cel|-regels; de ---scheidingsregel valt weg.
    if(/^\s*\|.*\|\s*$/.test(l)){
      const blok=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){blok.push(lines[i]);i++;}
      const rijen=blok.map(r=>r.trim().replace(/^\|/,"").replace(/\|$/,"").split("|").map(c=>c.trim()))
        .filter(cells=>!cells.every(c=>c===""||/^:?-{2,}:?$/.test(c)));
      html+='<table class="ai-tab">'+rijen.map((cells,ri)=>'<tr>'+cells.map(c=>(ri===0?'<th>':'<td>')+vet(c)+(ri===0?'</th>':'</td>')).join("")+'</tr>').join("")+'</table>';
      continue;
    }
    const kop=l.match(/^(#{1,4})\s+(.*)$/);
    if(kop){html+='<div style="font-weight:800;font-size:'+(kop[1].length<=2?'14.5':'13.5')+'px;margin:10px 0 4px">'+vet(kop[2])+'</div>';i++;continue;}
    if(/^\s*[-*]\s+/.test(l)){
      const items=[];
      while(i<lines.length&&/^\s*[-*]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*[-*]\s+/,""));i++;}
      html+='<ul style="margin:4px 0 8px 18px;padding:0">'+items.map(x=>'<li style="margin:2px 0">'+vet(x)+'</li>').join("")+'</ul>';
      continue;
    }
    if(/^\s*\d+[.)]\s+/.test(l)){
      const items=[];
      while(i<lines.length&&/^\s*\d+[.)]\s+/.test(lines[i])){items.push(lines[i].replace(/^\s*\d+[.)]\s+/,""));i++;}
      html+='<ol style="margin:4px 0 8px 18px;padding:0">'+items.map(x=>'<li style="margin:2px 0">'+vet(x)+'</li>').join("")+'</ol>';
      continue;
    }
    html+=l.trim()===""?'<div style="height:8px"></div>':'<div>'+vet(l)+'</div>';
    i++;
  }
  return html;
}
function aiRender(){
  const host=document.getElementById("ai-gesprek");if(!host)return;
  host.innerHTML=AI.gesprek.map(m=>{
    if(m.role==="user")return '<div style="align-self:flex-end;max-width:82%;background:#e8f4fb;border:1px solid #cfe7f5;border-radius:14px 14px 4px 14px;padding:10px 14px;font-size:13.5px;white-space:pre-wrap">'+esc(m.content)+'</div>';
    return '<div style="align-self:flex-start;max-width:92%;background:#fff;border:1px solid #e7e9ec;border-radius:14px 14px 14px 4px;padding:12px 16px;font-size:13.5px;line-height:1.6">'+aiTekstHtml(m.content)+
      (m.info?'<div class="sm muted" style="margin-top:10px;padding-top:8px;border-top:1px solid #f0f1f3;font-size:11px">'+esc(m.info)+'</div>':'')+'</div>';
  }).join("")+(AI.bezig?'<div style="align-self:flex-start" class="sm muted">De AI-coach leest het archief en schrijft een antwoord…</div>':'');
  host.scrollTop=host.scrollHeight;
}
async function aiVerstuur(){
  if(AI.bezig)return;
  const inp=document.getElementById("ai-in");
  const vraag=(inp&&inp.value||"").trim();
  if(!vraag)return;
  inp.value="";
  AI.gesprek.push({role:"user",content:vraag});
  AI.bezig=true;
  const knop=document.getElementById("ai-knop");if(knop)knop.disabled=true;
  aiRender();
  try{
    const{data:s}=await db.auth.getSession();
    const token=s&&s.session&&s.session.access_token;
    const r=await fetch(SUPABASE_URL+"/functions/v1/ai-coach",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token,"apikey":SUPABASE_KEY},
      body:JSON.stringify({messages:AI.gesprek.map(m=>({role:m.role,content:m.content}))}),
    });
    const uit=await r.json();
    if(uit.error==="geen_sleutel"){
      AI.gesprek.push({role:"assistant",content:"Er is nog geen Anthropic API-sleutel ingesteld. Maak er een aan op console.anthropic.com en zet hem als secret ANTHROPIC_API_KEY in het Supabase-dashboard (Edge Functions > Secrets). Daarna werkt dit paneel direct."});
    }else if(uit.error){
      AI.gesprek.push({role:"assistant",content:"Er ging iets mis: "+(uit.detail||uit.error)+". Probeer het nog eens."});
    }else{
      const info="≈ $"+(uit.usd!=null?uit.usd.toFixed(2):"?")+" · "+(uit.usage?Math.round((uit.usage.in+uit.usage.cacheSchrijf+uit.usage.cacheLees)/1000)+"k in / "+Math.round(uit.usage.uit/1000*10)/10+"k uit":"")+" · "+uit.rondes+" ronde"+(uit.rondes===1?"":"s")+(uit.afgekapt?" · gestopt op de zoeklimiet, stel de vraag evt. scherper":"");
      AI.gesprek.push({role:"assistant",content:uit.antwoord,info});
    }
  }catch(e){
    AI.gesprek.push({role:"assistant",content:"Verbinding mislukt: "+(e.message||e)+". Controleer je internet en probeer opnieuw."});
  }
  AI.bezig=false;
  if(knop)knop.disabled=false;
  aiRender();
}
