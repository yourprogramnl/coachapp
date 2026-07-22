// app/foto-crop.js — klein bijsnij-venster voor foto-uploads (verzoek Stefan
// 22 juli): inzoomen met het schuifje en slepen met de muis, zodat een foto of
// logo goed in het rondje/vak past. Gebruik: const uit = await fotoCrop(file,
// {rond:true}); uit is {blob, ext, type} of null bij annuleren.
let FC = { resolve: null, img: null, zoom: 1, s0: 1, ox: 0, oy: 0, drag: null, type: "image/jpeg" };
const FC_VIEW = 300, FC_UIT = 640;

function fcEnsure() {
  if (document.getElementById("fcmodal")) return;
  document.body.insertAdjacentHTML("beforeend",
    '<div class="lmodal" id="fcmodal"><div class="box" style="max-width:360px">' +
      '<h3 style="margin:0 0 10px">Passend maken</h3>' +
      '<div id="fc-vlak" style="position:relative;width:' + FC_VIEW + 'px;height:' + FC_VIEW + 'px;margin:0 auto;overflow:hidden;border-radius:12px;background:#111214;cursor:grab;touch-action:none;max-width:100%">' +
        '<canvas id="fc-canvas" width="' + FC_VIEW + '" height="' + FC_VIEW + '" style="display:block"></canvas>' +
        '<div id="fc-mask" style="position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 9999px rgba(17,18,20,.45);pointer-events:none"></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:10px;margin:14px 2px 4px">' +
        '<span class="sm muted" style="font-size:11px">−</span>' +
        '<input type="range" id="fc-zoom" min="40" max="400" value="100" style="flex:1;accent-color:var(--accent);padding:0" oninput="fcZoom(this.value)">' +
        '<span class="sm muted" style="font-size:14px">+</span>' +
      '</div>' +
      '<div class="sm muted" style="text-align:center;font-size:11.5px;margin-bottom:10px">Sleep om te verschuiven, schuif om in te zoomen.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" onclick="fcKlaar(false)">Annuleren</button><button class="btn" onclick="fcKlaar(true)">Gebruiken</button></div>' +
    '</div></div>');
  const vlak = document.getElementById("fc-vlak");
  vlak.addEventListener("pointerdown", e => {
    FC.drag = { x: e.clientX, y: e.clientY, ox: FC.ox, oy: FC.oy };
    vlak.setPointerCapture(e.pointerId);
    vlak.style.cursor = "grabbing";
  });
  vlak.addEventListener("pointermove", e => {
    if (!FC.drag) return;
    FC.ox = FC.drag.ox + (e.clientX - FC.drag.x);
    FC.oy = FC.drag.oy + (e.clientY - FC.drag.y);
    fcKlem(); fcTeken();
  });
  const los = () => { FC.drag = null; vlak.style.cursor = "grab"; };
  vlak.addEventListener("pointerup", los);
  vlak.addEventListener("pointercancel", los);
}
function fcSchaal() { return FC.s0 * FC.zoom; }
// Groter dan het vlak: het vlak blijft bedekt. Kleiner (uitgezoomd): de
// afbeelding blijft binnen het vlak, met rand eromheen.
function fcKlemAs(pos, maat) {
  if (maat >= FC_VIEW) return Math.min(0, Math.max(FC_VIEW - maat, pos));
  return Math.max(0, Math.min(FC_VIEW - maat, pos));
}
function fcKlem() {
  const s = fcSchaal();
  FC.ox = fcKlemAs(FC.ox, FC.img.width * s);
  FC.oy = fcKlemAs(FC.oy, FC.img.height * s);
}
function fcPng() { return FC.type === "image/png" || FC.type === "image/webp" || FC.type === "image/svg+xml"; }
function fcTeken() {
  const c = document.getElementById("fc-canvas"); if (!c || !FC.img) return;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, FC_VIEW, FC_VIEW);
  // Bij uitzoomen krijgt een foto (JPEG) een witte rand; PNG blijft doorzichtig
  if (!fcPng()) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, FC_VIEW, FC_VIEW); }
  const s = fcSchaal();
  ctx.drawImage(FC.img, FC.ox, FC.oy, FC.img.width * s, FC.img.height * s);
}
function fcZoom(v) {
  const nieuw = parseInt(v, 10) / 100;
  // Zoom rond het midden van het vlak
  const mid = FC_VIEW / 2, s = fcSchaal();
  const beeldX = (mid - FC.ox) / s, beeldY = (mid - FC.oy) / s;
  FC.zoom = nieuw;
  const s2 = fcSchaal();
  FC.ox = mid - beeldX * s2;
  FC.oy = mid - beeldY * s2;
  fcKlem(); fcTeken();
}
function fcKlaar(gebruik) {
  const m = document.getElementById("fcmodal");
  if (m) m.classList.remove("show");
  const done = FC.resolve; FC.resolve = null;
  if (!done) return;
  if (!gebruik || !FC.img) { done(null); return; }
  const uitC = document.createElement("canvas");
  uitC.width = FC_UIT; uitC.height = FC_UIT;
  const ctx = uitC.getContext("2d");
  // PNG behoudt doorzichtigheid (logo's); foto's worden compacte JPEG met
  // een witte rand als er is uitgezoomd
  const png = fcPng();
  if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, FC_UIT, FC_UIT); }
  const f = FC_UIT / FC_VIEW, s = fcSchaal() * f;
  try {
    ctx.drawImage(FC.img, FC.ox * f, FC.oy * f, FC.img.width * s, FC.img.height * s);
  } catch (e) { done(null); return; }
  uitC.toBlob(blob => {
    if (!blob) { toast("Bijsnijden mislukt, probeer de foto opnieuw te uploaden"); done(null); return; }
    done({ blob, ext: png ? "png" : "jpg", type: png ? "image/png" : "image/jpeg" });
  }, png ? "image/png" : "image/jpeg", 0.9);
}
function fcOpen(img, type, opts, resolve) {
  fcEnsure();
  FC.img = img; FC.type = type || "image/jpeg"; FC.zoom = 1;
  FC.s0 = Math.max(FC_VIEW / img.width, FC_VIEW / img.height);
  FC.ox = (FC_VIEW - img.width * FC.s0) / 2;
  FC.oy = (FC_VIEW - img.height * FC.s0) / 2;
  FC.resolve = resolve;
  document.getElementById("fc-zoom").value = 100;
  document.getElementById("fc-mask").style.borderRadius = opts.rond === false ? "12px" : "50%";
  document.getElementById("fc-mask").style.boxShadow = opts.rond === false ? "none" : "0 0 0 9999px rgba(17,18,20,.45)";
  fcTeken();
  document.getElementById("fcmodal").classList.add("show");
}
function fotoCrop(file, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); fcOpen(img, file.type, opts, resolve); };
    img.onerror = () => { URL.revokeObjectURL(url); toast("Kon de afbeelding niet openen"); resolve(null); };
    img.src = url;
  });
}
// Zelfde venster, maar met de huidige (al geüploade) foto als startpunt, zodat
// je hem kunt bijstellen zonder opnieuw te uploaden.
function fotoCropVanUrl(url, opts) {
  opts = opts || {};
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // nodig om de canvas-uitsnede te mogen opslaan
    img.onload = () => {
      const type = /\.png(\?|$)/i.test(url) ? "image/png" : "image/jpeg";
      fcOpen(img, type, opts, resolve);
    };
    img.onerror = () => { toast("Kon de huidige foto niet openen; upload hem opnieuw"); resolve(null); };
    img.src = url;
  });
}
