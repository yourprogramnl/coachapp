/* tools/testdata-engine-check.js
   Controle dat app/testdata-engine.js (de JS-port van Michels dashboard_logic.py) exact dezelfde
   uitkomst geeft als de Python-referentie. Draai na elke wijziging aan normen of rekenregels:
     node tools/testdata-engine-check.js <athletes_input.json> <athletes_dashboard.json>
   De twee JSON-bestanden komen uit Michels export (Drive, map "Dashboard export webapp/data");
   ze bevatten echte atletendata en horen NIET in deze repo. Exitcode 0 = alles identiek. */
"use strict";
const fs = require("fs");
const path = require("path");

const ENGINE = path.join(__dirname, "..", "app", "testdata-engine.js");
const INPUT = process.argv[2], REFERENCE = process.argv[3];
if (!INPUT || !REFERENCE) { console.error("Gebruik: node tools/testdata-engine-check.js <athletes_input.json> <athletes_dashboard.json>"); process.exit(2); }

// comp_overlay is generated elsewhere; notes/flags/recent were stripped from the reference for privacy.
const IGNORE_TOP = new Set(["comp_overlay", "notes", "flags", "recent"]);
// The port must still produce these three keys (value not checked, only presence and not-undefined).
const MUST_EXIST_TOP = ["notes", "flags", "recent"];

const engine = require(ENGINE);
const input = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const reference = JSON.parse(fs.readFileSync(REFERENCE, "utf8"));

function short(v) {
  let s;
  try { s = JSON.stringify(v); } catch (e) { s = String(v); }
  if (s === undefined) s = "undefined";
  return s.length > 200 ? s.slice(0, 200) + "…(" + s.length + " chars)" : s;
}
function typeOf(v) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

// Deep compare: object key order ignored, array order significant, numbers ===, strings exact, null must be null.
function diff(p, exp, act, out) {
  if (act === undefined) { out.push({path: p, expected: short(exp), actual: "undefined"}); return; }
  const te = typeOf(exp), ta = typeOf(act);
  if (te !== ta) { out.push({path: p, expected: short(exp) + " (" + te + ")", actual: short(act) + " (" + ta + ")"}); return; }
  if (te === "null") return;
  if (te === "array") {
    if (exp.length !== act.length) out.push({path: p + ".length", expected: exp.length, actual: act.length});
    const n = Math.min(exp.length, act.length);
    for (let i = 0; i < n; i++) diff(p + "[" + i + "]", exp[i], act[i], out);
    return;
  }
  if (te === "object") {
    const ek = Object.keys(exp), ak = Object.keys(act);
    const es = new Set(ek), as = new Set(ak);
    for (const k of ek) if (!as.has(k)) out.push({path: p + "." + k, expected: short(exp[k]), actual: "<missing key>"});
    for (const k of ak) if (!es.has(k)) out.push({path: p + "." + k, expected: "<no such key>", actual: short(act[k])});
    for (const k of ek) if (as.has(k)) diff(p + "." + k, exp[k], act[k], out);
    return;
  }
  // number, string, boolean
  if (exp !== act) out.push({path: p, expected: short(exp), actual: short(act)});
}

// Walk the actual output and report any undefined value anywhere (JSON.stringify would silently drop it).
function findUndefined(p, v, out) {
  if (v === undefined) { out.push(p); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => findUndefined(p + "[" + i + "]", x, out)); return; }
  if (v !== null && typeof v === "object") { for (const k of Object.keys(v)) findUndefined(p + "." + k, v[k], out); }
}

let actualAll;
try {
  actualAll = engine.tdBuildAll(input);
} catch (e) {
  console.error("tdBuildAll threw:", e && e.stack ? e.stack : e);
  process.exit(2);
}

const names = Object.keys(reference);
let matched = 0, totalDiffs = 0;
const inputNames = new Set(Object.keys(input));
for (const name of names) {
  const exp = reference[name];
  const act = actualAll[name];
  const diffs = [];
  if (act === undefined) {
    diffs.push({path: "$", expected: "<record>", actual: "undefined (tdBuildAll produced no record)"});
  } else {
    const expTop = {}, actTop = {};
    for (const k of Object.keys(exp)) if (!IGNORE_TOP.has(k)) expTop[k] = exp[k];
    for (const k of Object.keys(act)) if (!IGNORE_TOP.has(k)) actTop[k] = act[k];
    diff("$", expTop, actTop, diffs);
    for (const k of MUST_EXIST_TOP) {
      if (!Object.prototype.hasOwnProperty.call(act, k) || act[k] === undefined) diffs.push({path: "$." + k, expected: "<key present>", actual: "<missing or undefined>"});
    }
    const undef = [];
    findUndefined("$", act, undef);
    for (const p of undef) diffs.push({path: p, expected: "<defined value>", actual: "undefined"});
  }
  if (diffs.length === 0) {
    matched++;
    console.log("OK    " + name);
  } else {
    totalDiffs += diffs.length;
    console.log("FAIL  " + name + "  (" + diffs.length + " difference" + (diffs.length === 1 ? "" : "s") + ")");
    for (const d of diffs) {
      console.log("      " + d.path);
      console.log("        expected: " + d.expected);
      console.log("        actual:   " + d.actual);
    }
  }
}
const extra = Object.keys(actualAll).filter(n => !(n in reference));
if (extra.length) { console.log("Extra athletes in actual output (not in reference): " + extra.join(", ")); totalDiffs += extra.length; }
const missingInput = names.filter(n => !inputNames.has(n));
if (missingInput.length) console.log("Reference athletes without input record: " + missingInput.join(", "));

console.log("");
console.log("Result: " + matched + "/" + names.length + " athletes match, " + totalDiffs + " difference" + (totalDiffs === 1 ? "" : "s") + ".");
process.exit(matched === names.length && totalDiffs === 0 && extra.length === 0 ? 0 : 1);
