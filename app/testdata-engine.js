/* testdata-engine.js
   1-to-1 port of Michel's dashboard_logic.py (export of 8 Oct 2026) to a classic browser script.
   Behaviour must stay byte-identical to the Python (verified by engine-check/check.js against
   athletes_dashboard.json). Norms are changed in the Python and in this file together.
   No DOM access, no ES modules. Every top-level identifier is prefixed td (functions) / TD_ (constants).
   Entry points: tdBuild(name, d) for one raw athlete record, tdBuildAll(obj) for all. */

// run_5k 20:00 -> 21:30 on 16 Sep 2026: Kyle's current KRC onboarding (men QF 5K = 21:30), decision Michel.
const TD_NORMS_MALE = {strict_hspu: 30, strict_hspu_amrap: 60, llrc: 20, rmu: 20, row_2k: "6:40", run_5k: "21:30",
  fran_5rft: "3:40", diane_amrap: 137, row_burpee_ttb: "8:26",
  // Added 28 Aug 2026: Kyle Ruth's Quarterfinal level (same QF convention as row_2k/run_5k).
  row_1k: "3:10", row_5k: "17:30", run_10k: "43:00", run_1_mile: "5:50"};
const TD_NORMS_FEMALE = {strict_hspu: 20, strict_hspu_amrap: 60, llrc: 15, rmu: 15, row_2k: "7:50", run_5k: "22:00",
  fran_5rft: "3:40", diane_amrap: 137, row_burpee_ttb: "9:16",
  // Added 28 Aug 2026 (women's QF table). run_5k fixed 28 Aug 2026: was 20:00 (men's norm), now 22:00 — confirmed with Michel.
  row_1k: "3:40", row_5k: "20:00", run_10k: "47:00", run_1_mile: "6:30"};

/* ---------------------------------------------------------------------------
   Python-semantics helpers (truthiness, dict.get, round, float repr, sorted)
   --------------------------------------------------------------------------- */
function tdTruthy(v) { // Python truthiness: None/False/0/""/[]/{} are falsy
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
function tdHas(obj, key) { // `key in dict` (own keys only, so "constructor" etc. never match)
  return obj !== null && obj !== undefined && key !== null && key !== undefined &&
    Object.prototype.hasOwnProperty.call(obj, key);
}
function tdGet(obj, key, dflt) { // dict.get(key, default); never returns undefined
  if (dflt === undefined) dflt = null;
  if (!tdHas(obj, key)) return dflt;
  const v = obj[key];
  return v === undefined ? dflt : v;
}
function tdReq(obj, key) { // dict[key]: KeyError when missing
  if (!tdHas(obj, key)) throw new Error("KeyError: " + key);
  return obj[key];
}
function tdOr(a, b) { return tdTruthy(a) ? a : b; } // Python `a or b`
function tdSum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); } // left-to-right like sum()
function tdIsNumber(v) { return typeof v === "number" || typeof v === "boolean"; } // isinstance(v, (int, float)); bool is an int in Python
function tdDeepCopy(v) { // copy.deepcopy for JSON-like data
  if (Array.isArray(v)) return v.map(tdDeepCopy);
  if (v !== null && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = tdDeepCopy(v[k]); return o; }
  return v;
}
function tdFloatStr(x) { // Python repr of a float inside an f-string: integer-valued floats print with ".0"
  if (typeof x !== "number") return String(x);
  if (Object.is(x, -0)) return "-0.0";
  if (Number.isInteger(x) && Math.abs(x) < 1e16) return x + ".0";
  return String(x);
}
function tdPyRound(x, n) { // Python round(x, n): rounds the EXACT binary value, ties to even. n=0 -> integer-valued.
  n = n || 0;
  if (typeof x !== "number") x = Number(x);
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const ax = Math.abs(x);
  const exact = ax.toFixed(100); // exact decimal expansion of a double for |x| >= ~1e-14 (ties below that are impossible for n <= 3)
  const dot = exact.indexOf(".");
  let r;
  if (dot < 0) {
    r = Number(ax.toFixed(n));
  } else {
    const intPart = exact.slice(0, dot), frac = exact.slice(dot + 1);
    const tie = frac.charAt(n) === "5" && /^0*$/.test(frac.slice(n + 1));
    if (tie) {
      const kept = intPart + frac.slice(0, n);
      const lastDigit = Number(kept.charAt(kept.length - 1));
      const lo = Number(n > 0 ? intPart + "." + frac.slice(0, n) : intPart); // truncated
      const hi = Number(ax.toFixed(n)); // toFixed rounds an exact tie up (on |x|)
      r = (lastDigit % 2 === 0) ? lo : hi;
    } else {
      r = Number(ax.toFixed(n)); // toFixed rounds the exact value; only exact ties differ from Python
    }
  }
  return neg ? -r : r;
}
function tdCmpStr(a, b) { // Python str ordering = by code point
  const ia = a[Symbol.iterator](), ib = b[Symbol.iterator]();
  for (;;) {
    const x = ia.next(), y = ib.next();
    if (x.done && y.done) return 0;
    if (x.done) return -1;
    if (y.done) return 1;
    const cx = x.value.codePointAt(0), cy = y.value.codePointAt(0);
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}
function tdCmp(a, b) { // Python comparison of numbers, strings and tuples (arrays, element-wise)
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) { const c = tdCmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  if (typeof a === "string" && typeof b === "string") return tdCmpStr(a, b);
  return a < b ? -1 : (a > b ? 1 : 0);
}
function tdSorted(arr, keyFn, reverse) { // Python sorted(): stable, reverse keeps equal elements in original order
  const idx = arr.map(function (v, i) { return {k: keyFn ? keyFn(v) : v, i: i, v: v}; });
  idx.sort(function (p, q) { let c = tdCmp(p.k, q.k); if (reverse) c = -c; return c || (p.i - q.i); });
  return idx.map(function (p) { return p.v; });
}

/* ---------------------------------------------------------------------------
   Small utilities from the Python module
   --------------------------------------------------------------------------- */
function tdT2s(t) { // "m:ss" -> seconds
  if (t === null || t === undefined) return null;
  if (typeof t !== "string") throw new Error("tdT2s: expected a time string, got " + typeof t);
  const parts = t.split(":").map(function (p) {
    if (!/^\s*[+-]?\d+\s*$/.test(p)) throw new Error("tdT2s: invalid time '" + t + "'");
    return parseInt(p, 10);
  });
  if (parts.length < 2) throw new Error("tdT2s: invalid time '" + t + "'");
  return parts[0] * 60 + parts[1];
}
function tdS2t(s) { // seconds -> "m:ss"
  if (s === null || s === undefined) return null;
  const m = Math.trunc(Math.floor(s / 60));
  const sec = Math.trunc(tdPyRound(((s % 60) + 60) % 60, 0));
  return m + ":" + String(sec).padStart(2, "0");
}
function tdStatus(score) {
  if (score === null || score === undefined) return null;
  if (score < 0.90) return "Developing";
  if (score < 1.00) return "Approaching";
  if (score < 1.10) return "At standard";
  return "Above standard";
}

/* tests dict -> the same list form as an Excel-onboarding testbatterij_full (rollout 14 Aug 2026).
   Always contains all fields, also unfilled ones (score null), so the dashboard table stays editable.
   "power_clean" and "snatch" are added to Olympic here only (they do not count in cat_scores). */
function tdTestsToTestbatterijFull(tests, categories) {
  const cats = {};
  for (const c of Object.keys(categories)) cats[c] = categories[c];
  cats["Olympic"] = tdGet(cats, "Olympic", []).slice().concat(["power_clean", "snatch"]);
  const out = [];
  for (const cat of Object.keys(cats)) {
    for (const key of cats[cat]) {
      const t = tdGet(tests, key);
      if (!tdTruthy(t)) continue;
      const isTime = t.unit === "tijd";
      const result = tdGet(t, "result"), norm = tdGet(t, "norm");
      let scoreDisp, doelDisp, pct;
      if (result === null) scoreDisp = null;
      else if (isTime) scoreDisp = tdOr(tdGet(t, "result_display"), tdS2t(result));
      else scoreDisp = result;
      if (norm === null) doelDisp = null;
      else if (isTime) doelDisp = tdS2t(norm);
      else doelDisp = tdPyRound(norm, 1);
      if (result !== null && tdTruthy(norm)) pct = tdPyRound(isTime ? ((norm - result) / norm * 100) : ((result - norm) / norm * 100), 1);
      else pct = null;
      out.push({section: cat, naam: t.label, beschrijving: t.norm_label, score: scoreDisp, doel: doelDisp, percentage: pct, key: key});
    }
  }
  return out;
}

/* Sport reference synced with the canonical test battery (Michel, 30 Aug 2026): for every test that is
   also in the battery, the battery value always wins. Fields without a battery equivalent keep the
   intake value. Never mutates the input (deep copy). */
const TD_SR_NAME_TO_TEST = {
  "Back Squat": "back_squat", "Front Squat": "front_squat", "Deadlift": "deadlift",
  "Overhead Squat": "ohs",
  "Snatch": "snatch", "Squat Clean": "clean", "Split Jerk": "jerk",
  "1 Mile Run": "run_1_mile", "5K Run": "run_5k", "10K Run": "run_10k",
  "1K Row": "row_1k", "2K Row": "row_2k", "5K Row": "row_5k",
  "Echo Bike 10 min TT (cals)": "echo_bike", "Bike Erg 20 min FTP (watts)": "c2_20min"
};
function tdBackfillSportReference(sr, tests) {
  if (!tdTruthy(sr)) return sr === undefined ? null : sr;
  sr = tdDeepCopy(sr);
  for (const sec of ["max_lifts", "conditioning"]) {
    for (const row of tdOr(tdGet(sr, sec), [])) {
      const key = tdGet(TD_SR_NAME_TO_TEST, tdGet(row, "naam"));
      const t = tdTruthy(key) ? tdGet(tdOr(tests, {}), key) : null;
      if (!tdTruthy(t)) continue;
      const val = tdOr(tdGet(t, "result_display"), tdGet(t, "result"));
      if (val !== null && val !== "") row["jouw_waarde"] = val;
    }
  }
  return sr;
}

/* ---------------------------------------------------------------------------
   Priorities (one short synthesis sentence per theme; agreed with Michel 5 Aug 2026)
   --------------------------------------------------------------------------- */
const TD_PRIORITY_THRESHOLD = 0.8; // same limit as the green status in the UI
const TD_STRONG_THRESHOLD = 1.0;   // at/above norm counts as "already in good shape"

const TD_STRENGTH_PATTERNS = [ // name, test keys, movement description, quality when weak
  ["Squat", ["back_squat", "front_squat"], "squatting", "lower absolute strength"],
  ["Hinge", ["deadlift"], "hinging", "lower absolute strength"],
  ["Press", ["strict_press", "cgbp"], "pressing", "upper absolute strength"],
  ["Pull", ["seal_row"], "pulling", "upper pulling strength-endurance"]
];
const TD_GYM_TOPIC = {strict_hspu: "Gymnastic strength", strict_hspu_amrap: "Gymnastic strength", // (unused, kept from the Python)
  weighted_pullup: "Gymnastic strength", rmu: "Gymnastic strength", llrc: "Capacity/volume"};
const TD_ENGINE_TOPIC = {row_2k: "Anaerobic power", echo_bike: "Threshold", run_5k: "Aerobic base/LSD", c2_20min: "Aerobic base/LSD"};
// Separate from TD_ENGINE_TOPIC because "LSD" is an acronym and must not be lowercased in a sentence.
const TD_ENGINE_TOPIC_PHRASE = {row_2k: "anaerobic power", echo_bike: "threshold", run_5k: "aerobic base/LSD", c2_20min: "aerobic base/LSD"};

function tdTestedSummary(pairs) { // pairs = [[name, score]] of tested, non-weak parts; split at the 1.0 limit (Michel 30 Aug 2026)
  const atStd = pairs.filter(function (p) { return p[1] >= TD_STRONG_THRESHOLD; }).map(function (p) { return p[0]; });
  const close = pairs.filter(function (p) { return p[1] < TD_STRONG_THRESHOLD; }).map(function (p) { return p[0]; });
  const parts = [];
  if (atStd.length) parts.push(atStd.join(", ") + " at or above standard");
  if (close.length) parts.push(close.join(", ") + " approaching standard");
  return parts.join("; ");
}

function tdPatternScore(tests, keys) { // weakest of the filled tests within one movement pattern (null when none filled)
  const avail = [];
  for (const k of keys) { const t = tdGet(tests, k); if (tdTruthy(t) && tdGet(t, "score") !== null) avail.push(t.score); }
  return avail.length ? Math.min.apply(null, avail) : null;
}

function tdStrengthTheme(tests, catScores) {
  const scored = TD_STRENGTH_PATTERNS.map(function (p) { return [p[0], tdPatternScore(tests, p[1])]; });
  const tested = scored.filter(function (p) { return p[1] !== null; });
  const testedMap = new Map(tested);
  if (!tested.length) return "No strength tests on file yet.";
  const weak = tdSorted(tested.filter(function (p) { return p[1] < TD_PRIORITY_THRESHOLD; }).map(function (p) { return p[0]; }),
    function (k) { return testedMap.get(k); });
  const strong = tdSorted(tested.filter(function (p) { return p[1] >= TD_STRONG_THRESHOLD; }).map(function (p) { return p[0]; }),
    function (k) { return -testedMap.get(k); });
  const verb = strong.length === 1 ? "is" : "are";
  const prefix = strong.length ? strong.join(" and ") + " " + verb + " already in good shape" : null;
  let action;
  if (weak.length) {
    const worst = weak[0];
    const quality = TD_STRENGTH_PATTERNS.find(function (p) { return p[0] === worst; })[3];
    action = worst.toLowerCase() + " is the limiter — build " + quality;
  } else {
    // Rule Michel 30 Aug 2026: priority blocks only talk about data that is really there.
    action = "tested: " + tdTestedSummary(tdSorted(tested.map(function (p) { return [p[0].toLowerCase(), p[1]]; }))) + " — maintain, no measured limiter";
  }
  return prefix ? prefix + ", but " + action + "." : action.charAt(0).toUpperCase() + action.slice(1) + ".";
}

function tdWeightliftingTheme(tests, catScores) {
  // Since 6 Aug 2026: clean (vs front squat / 1.1) and jerk (vs 105% of the clean norm) have real norms, but the
  // snatch/back-squat ratio stays the primary signal; clean and jerk are sub-targets.
  const ratio = tdGet(tests, "ratio"), clean = tdGet(tests, "clean"), jerk = tdGet(tests, "jerk");
  const sc = function (t) { return (tdTruthy(t) && tdGet(t, "score") !== null) ? t.score : null; };
  const ratioScore = sc(ratio), cleanScore = sc(clean), jerkScore = sc(jerk);
  const tested = new Map([["snatch", ratioScore], ["clean", cleanScore], ["jerk", jerkScore]].filter(function (p) { return p[1] !== null; }));
  if (!tested.size) return "No weightlifting tests on file yet.";

  const strengthScore = tdGet(catScores, "Strength");
  const strengthOk = strengthScore !== null && strengthScore >= TD_PRIORITY_THRESHOLD;
  const strengthLight = strengthScore !== null && strengthScore < TD_PRIORITY_THRESHOLD;

  // Always name the actual ratio (Michel, 6 Aug 2026): e.g. 75% is above the norm but the snatch in kg can still be light.
  let ratioPrefix = "";
  if (tdTruthy(ratio) && tdGet(ratio, "result") !== null) ratioPrefix = "Snatch/back squat ratio: " + tdFloatStr(ratio.result) + "% (standard 65%). ";

  if (ratioScore !== null && ratioScore < TD_PRIORITY_THRESHOLD) {
    const subWeak = ["clean", "jerk"].filter(function (k) { return tested.has(k) && tested.get(k) !== null && tested.get(k) < TD_PRIORITY_THRESHOLD; });
    const labels = {clean: "the clean", jerk: "the jerk"};
    const subTxt = subWeak.length ? " " + subWeak.map(function (k) { return labels[k]; }).join(" and ") + " also lags behind as a sub-target." : "";
    if (strengthOk) {
      return ratioPrefix + "Strength is sufficient but the snatch ratio lags — that points to positions/skill, not strength. " +
        "Work on overhead stability and position, e.g. OHS, snatch balance and halting snatch deadlifts." + subTxt;
    }
    return ratioPrefix + "Snatch ratio is low and the underlying strength is not at level either — build absolute " +
      "strength (squat/hinge) first before adding much extra snatch skill volume." + subTxt;
  }

  // Ratio at/above 0.8x norm (52%+) is not the same as actually at/above 65%: say so explicitly (Michel, 6 Aug 2026).
  const ratioAtNorm = ratioScore !== null && ratioScore >= TD_STRONG_THRESHOLD;
  const ratioLabel = ratioAtNorm ? "at or above the standard" : "close to the standard (not past 65% yet)";

  if (ratioScore !== null && strengthLight) {
    return ratioPrefix + "The ratio itself is " + ratioLabel + " — so position/efficiency is good. But the underlying " +
      "strength (squat/hinge/press) is still light, so the snatch in kg stays capped by absolute strength, not " +
      "by technique. Build base strength — the skill is already good enough to convert it directly.";
  }

  // Snatch ratio at/near norm (or untested) -> look at clean/jerk as sub-targets.
  const sub = new Map(["clean", "jerk"].filter(function (k) { return tested.has(k); }).map(function (k) { return [k, tested.get(k)]; }));
  const subWeak = tdSorted(Array.from(sub.keys()).filter(function (k) { return sub.get(k) < TD_PRIORITY_THRESHOLD; }), function (k) { return sub.get(k); });
  if (!subWeak.length) {
    if (ratioScore !== null) return ratioPrefix + "Ratio is " + ratioLabel + " and the underlying strength is at level too — technique and strength are balanced, maintain via technical/positional work.";
    return "Clean and jerk are at or above their (sub)standard — no weightlifting main priority based on the available data.";
  }
  const worst = subWeak[0];
  if (worst === "clean") {
    return ratioPrefix + "Ratio is " + ratioLabel + ", but the clean (sub-target) lags behind front squat strength — that points to " +
      "the receiving position/speed under the bar, not strength. Work on receiving position, speed under the bar and " +
      "front squat confidence out of the catch (e.g. tempo front squats, clean pulls, drop-and-catch).";
  }
  return ratioPrefix + "Ratio is " + ratioLabel + ", but the jerk (sub-target) lags behind the clean standard — there is too little margin " +
    "above the clean to put it overhead confidently. Work on dip/drive speed, overhead stability " +
    "and jerk-specific confidence (e.g. jerk from blocks/rack, push press speed, overhead squat stability).";
}

function tdGymnasticsTheme(tests, catScores) {
  const press = tdPatternScore(tests, ["strict_press", "cgbp"]);
  const pull = tdPatternScore(tests, ["seal_row"]);
  const hspu = tdGet(tests, "strict_hspu"), hspuAmrap = tdGet(tests, "strict_hspu_amrap");
  const pullup = tdGet(tests, "weighted_pullup"), rmu = tdGet(tests, "rmu"), llrc = tdGet(tests, "llrc");
  const repeatState = function (t) {
    if (t === null || tdGet(t, "score") === null) return ["untested", null];
    return [(t.score < TD_PRIORITY_THRESHOLD ? "weak" : "ok"), t.score];
  };
  // "any weak wins": max unbroken and the 5-min AMRAP measure the same pressing repeatability.
  const pushStates = [repeatState(hspu), repeatState(hspuAmrap)];
  const pushState = pushStates.some(function (s) { return s[0] === "weak"; }) ? "weak" :
    (pushStates.every(function (s) { return s[0] === "ok"; }) ? "ok" : "untested");
  const pullStates = [repeatState(pullup), repeatState(rmu)];
  const pullState = pullStates.some(function (s) { return s[0] === "weak"; }) ? "weak" :
    (pullStates.every(function (s) { return s[0] === "ok"; }) ? "ok" : "untested");
  const llrcState = repeatState(llrc)[0];

  // A measured weakness always outweighs a missing test; within "weak" a strength-vs-repeatability mismatch goes first.
  if (pushState === "weak" && press !== null && press >= TD_PRIORITY_THRESHOLD) {
    return "Pressing strength is there (strict press/CGBP at level), but strict HSPU repeatability lags " +
      "behind — that is a muscular endurance pressing issue, not a strength deficit.";
  }
  if (pullState === "weak" && pull !== null && pull >= TD_PRIORITY_THRESHOLD) {
    return "Pulling strength (seal row) is there, but weighted pull-up/RMU repeatability lags behind — that is " +
      "a muscular endurance pulling issue (GST: from strict to volume), not a strength deficit.";
  }
  if (pushState === "weak") return "Strict HSPU is still weak — build strict pressing strength via GST before adding volume/kipping.";
  if (pullState === "weak") return "Weighted pull-up/RMU are still weak — build strict pulling strength via GST before adding volume/kipping.";
  if (llrcState === "weak") return "LLRC (capacity/volume under fatigue) lags behind — work on repeatability, not on a new max test.";
  // Rule Michel 30 Aug 2026: no "not tested yet" in the priority blocks.
  const minOk = function (states) {
    const vals = states.filter(function (s) { return s[0] === "ok" && s[1] !== null; }).map(function (s) { return s[1]; });
    return vals.length ? Math.min.apply(null, vals) : null;
  };
  const pairs = [["pushing", minOk(pushStates)], ["pulling", minOk(pullStates)],
    ["LLRC", (tdTruthy(llrc) && llrcState === "ok") ? tdGet(llrc, "score") : null]].filter(function (p) { return p[1] !== null; });
  if (pairs.length) return "Tested: " + tdTestedSummary(pairs) + " — maintain, no measured limiter.";
  return "No gymnastics tests on file yet.";
}

function tdConditioningTheme(tests, catScores) {
  const scored = new Map();
  for (const k of Object.keys(TD_ENGINE_TOPIC)) { const t = tdGet(tests, k); if (tdTruthy(t) && tdGet(t, "score") !== null) scored.set(k, t.score); }
  if (!scored.size) return "No conditioning tests on file yet.";
  const weak = tdSorted(Array.from(scored.keys()).filter(function (k) { return scored.get(k) < TD_PRIORITY_THRESHOLD; }), function (k) { return scored.get(k); });
  if (weak.length) {
    const k = weak[0];
    const label = tests[k].label.split(" (")[0];
    return label + " lags behind — work on " + TD_ENGINE_TOPIC_PHRASE[k] + ".";
  }
  // Rule Michel 30 Aug 2026: no "not tested yet" in the priority blocks.
  const best = new Map();
  scored.forEach(function (s, k) { const t = TD_ENGINE_TOPIC_PHRASE[k]; best.set(t, Math.max(best.has(t) ? best.get(t) : 0, s)); });
  return "Tested: " + tdTestedSummary(tdSorted(Array.from(best.entries()))) + " — maintain, no measured limiter.";
}

function tdComputePriorities(tests, catScores) {
  return {
    "Strength": tdStrengthTheme(tests, catScores),
    "Weightlifting": tdWeightliftingTheme(tests, catScores),
    "Gymnastics": tdGymnasticsTheme(tests, catScores),
    "Conditioning": tdConditioningTheme(tests, catScores)
  };
}

/* ---------------------------------------------------------------------------
   Athlete input per theme block (30 Aug 2026, Michel): self-assessment + perception signals.
   Only real data: weak <= 2 and strong >= 4 from the intake, plus strong perception signals.
   Confidence <= 2 is added as a caveat (low confidence pulls self-ratings down; Kyle Ruth).
   --------------------------------------------------------------------------- */
const TD_MM_CONDITIONING = new Set(["Sprint-capaciteit", "Lange chippers/grinders",
  "Herstel tussen sets/rondes", "Mentale weerstand bij hoge intensiteit"]);
const TD_MM_CROSSFIT = new Set(["Barbell cycling onder vermoeidheid",
  "Barbell cycling gecombineerd met gymnastics aan het rek",
  "Gymnastics onder vermoeidheid", "Transities tussen stations", "Pacing/strategie"]);
const TD_WL_PRESS_MOVES = new Set(["Push Press", "Push Jerk", "Split Jerk", "Shoulder-to-Overhead"]);
const TD_PERC_THEME = {back_squat: "Strength", front_squat: "Strength", deadlift: "Strength",
  strict_press: "Strength", snatch: "Weightlifting", clean: "Weightlifting",
  jerk: "Weightlifting", strict_hspu: "Gymnastics", strict_hspu_amrap: "Gymnastics",
  weighted_pullup: "Gymnastics", llrc: "Gymnastics", rmu: "Gymnastics"};
const TD_MIXED_MODAL_CAT = "CROSSFIT-SPECIFIEKE PATRONEN";

function tdSaTheme(row) { // filters on the Dutch intake category/movement names (raw data, translated only for display)
  const cat = tdOr(tdGet(row, "category"), ""), mov = tdOr(tdGet(row, "movement"), "");
  if (cat.includes(TD_MIXED_MODAL_CAT)) {
    if (TD_MM_CONDITIONING.has(mov)) return "Conditioning";
    if (TD_MM_CROSSFIT.has(mov)) return "CrossFit";
    return null;
  }
  if (cat === "BARBELL — OLYMPIC LIFTING" || TD_WL_PRESS_MOVES.has(mov)) return "Weightlifting";
  if (cat === "BARBELL — SQUATTING" || cat === "BARBELL — PULLING" || cat === "ODD OBJECT / STRONGMAN" || mov === "Strict Press") return "Strength";
  if (cat.startsWith("GYMNASTICS")) return "Gymnastics";
  if (cat === "BASIC CROSSFIT MOVEMENTS") return "CrossFit";
  return null;
}

function tdComputeAthleteInput(saDetail, gaps, mental) { // theme -> one "Athlete input" sentence (only themes with real data)
  if (!tdTruthy(saDetail)) return {};
  // min score per movement per theme (Heavy/Moderate/Light rows of the same movement collapse)
  const per = new Map();
  for (const row of saDetail) {
    if (tdGet(row, "score") === null) continue;
    const theme = tdSaTheme(row);
    if (!tdTruthy(theme)) continue;
    const mov = tdReq(row, "movement");
    const k = theme + "\u0000" + mov;
    const cur = per.has(k) ? per.get(k).score : 6;
    per.set(k, {theme: theme, mov: mov, score: Math.min(cur, row.score)});
  }
  const themes = new Map();
  per.forEach(function (e) {
    if (!themes.has(e.theme)) themes.set(e.theme, {weak: [], strong: []});
    if (e.score <= 2) themes.get(e.theme).weak.push([e.score, tdEn(e.mov)]);
    else if (e.score >= 4) themes.get(e.theme).strong.push([e.score, tdEn(e.mov)]);
  });
  const mentalList = tdOr(mental, []);
  let lowConf = mentalList.some(function (m) { return tdGet(m, "category") === "Confidence / self-belief" && tdOr(tdGet(m, "score"), 5) <= 2; });
  // English YourProgram template (16 Sep 2026): 4 questions per category -> the average counts.
  const conf = mentalList.filter(function (m) {
    const c = tdGet(m, "category");
    return (c === "Confidence & Self-Belief" || c === "Zelfvertrouwen") && tdIsNumber(tdGet(m, "score"));
  }).map(function (m) { return tdGet(m, "score"); });
  if (conf.length && tdSum(conf) / conf.length <= 2) lowConf = true;
  const perc = new Map();
  for (const g of tdOr(gaps, [])) {
    if (Math.abs(g.delta) < 2) continue;
    const t = tdGet(TD_PERC_THEME, g.key);
    if (tdTruthy(t)) {
      if (!perc.has(t)) perc.set(t, []);
      perc.get(t).push((g.delta > 0 ? "blind spot" : "confidence gap") + ": " + g.label);
    }
  }
  const out = {};
  themes.forEach(function (dd, theme) {
    const parts = [];
    const weak = tdSorted(dd.weak).map(function (p) { return p[1]; }).slice(0, 5);
    const strong = tdSorted(dd.strong, null, true).map(function (p) { return p[1]; }).slice(0, 3);
    if (weak.length) parts.push("weak (≤2/5): " + weak.join(", "));
    if (strong.length) parts.push("strong (≥4/5): " + strong.join(", "));
    for (const p of (perc.get(theme) || [])) parts.push(p);
    if (!parts.length) return;
    let sent = "Athlete input: " + parts.join(" · ") + ".";
    if (weak.length && lowConf) sent += " (Confidence 2/5 — ratings may skew low.)";
    out[theme] = sent;
  });
  perc.forEach(function (sig, theme) {
    if (!tdHas(out, theme)) out[theme] = "Athlete input: " + sig.join("; ") + ".";
  });
  return out;
}

/* ---------------------------------------------------------------------------
   Diagnostic layer (30 Aug 2026, Michel): per symptom a decision tree that isolates the CAUSE via
   ratios between existing tests; when the data cannot separate a branch, it yields the one
   follow-up micro-test that makes the difference.
   --------------------------------------------------------------------------- */
function tdComputeDiagnostics(tests, saDetail, raw) {
  const sc = function (k) { const t = tdGet(tests, k); return tdTruthy(t) ? tdGet(t, "score") : null; };
  const res = function (k) { const t = tdGet(tests, k); return tdTruthy(t) ? tdGet(t, "result") : null; };
  const sa = new Map();
  for (const r of tdOr(saDetail, [])) {
    if (tdGet(r, "score") !== null) { const m = tdReq(r, "movement"); sa.set(m, Math.min(sa.has(m) ? sa.get(m) : 6, r.score)); }
  }
  const saGet = function (m) { return sa.has(m) ? sa.get(m) : null; };
  const out = [];

  // --- PRESSING (HSPU) ---
  const ubS = sc("strict_hspu"), ubR = res("strict_hspu"), amR = res("strict_hspu_amrap");
  const pressVals = [sc("strict_press"), sc("cgbp")].filter(function (s) { return s !== null; });
  const pressS = pressVals.length ? Math.min.apply(null, pressVals) : null;
  if (ubS !== null) {
    if (ubS < TD_PRIORITY_THRESHOLD) {
      if (pressS === null) {
        out.push({domain: "Pressing (HSPU)", verdict: "Max set weak (" + Math.trunc(ubR) + ").",
          followup: "Test strict press/CGBP: strength ceiling vs muscular endurance."});
      } else if (pressS < TD_PRIORITY_THRESHOLD) {
        out.push({domain: "Pressing (HSPU)", verdict: "Strength ceiling (press " + tdFloatStr(tdPyRound(pressS, 2)) + ") — GST before volume/kipping.", followup: null});
      } else {
        out.push({domain: "Pressing (HSPU)", verdict: "Muscular endurance (press " + tdFloatStr(tdPyRound(pressS, 2)) + " ✓, max set not) — build rep volume.", followup: null});
      }
    } else {
      const parts = ["max set " + Math.trunc(ubR) + " ✓"];
      let followup = null;
      if (tdTruthy(amR) && tdTruthy(ubR)) {
        const ratio = tdPyRound(amR / ubR, 2);
        if (ratio >= 2.2) parts.push("repeatability " + tdFloatStr(ratio) + "x (strong)");
        else if (ratio >= 1.6) parts.push("repeatability " + tdFloatStr(ratio) + "x (moderate — density work)");
        else parts.push("repeatability " + tdFloatStr(ratio) + "x (first-set athlete — short-rest density)");
      } else {
        followup = "Run the 5-min AMRAP for repeatability.";
      }
      const fat = saGet("Gymnastics onder vermoeidheid");
      if (fat !== null && fat <= 2) parts.push("breaks down in combos (2/5) — pair with breathing pieces");
      const kip = saGet("Kipping HSPU"), strict = saGet("Strict HSPU");
      if (kip !== null && strict !== null && strict - kip >= 2) parts.push("kipping lags strict — timing, not strength");
      out.push({domain: "Pressing (HSPU)", verdict: parts.join("; ") + ".", followup: followup});
    }
  }

  // --- PULLING (pull-up/RMU/rope) ---
  const wp = sc("weighted_pullup"), rmuS = sc("rmu"), rmuR = res("rmu"), llrcS = sc("llrc");
  if ([wp, rmuS, llrcS].some(function (v) { return v !== null; })) {
    const parts = [];
    let followup = null;
    if (rmuS !== null && rmuS < TD_PRIORITY_THRESHOLD) {
      if (wp === null) {
        parts.push("RMU max weak (" + Math.trunc(rmuR) + ")");
        followup = "Test weighted pull-up: strength vs skill/endurance.";
      } else if (wp >= TD_PRIORITY_THRESHOLD) {
        parts.push("pull " + tdFloatStr(tdPyRound(wp, 2)) + " ✓ but RMU max not — endurance/technique, not strength");
      } else {
        parts.push("pull AND RMU weak — GST first");
      }
    } else {
      if (wp !== null) parts.push("pull " + tdFloatStr(tdPyRound(wp, 2)) + " ✓");
      if (rmuS !== null) {
        parts.push("RMU max " + Math.trunc(rmuR) + " ✓");
        followup = "RMU repeatability: max set, 2 min rest, max set (2nd <50% = gap).";
      }
    }
    if (llrcS !== null && llrcS < TD_STRONG_THRESHOLD) {
      parts.push("LLRC " + tdFloatStr(tdPyRound(llrcS, 2)) + " (" + (llrcS < TD_PRIORITY_THRESHOLD ? "weak" : "approaching") + ") — fatigue volume, not max work");
    }
    out.push({domain: "Pulling", verdict: parts.join("; ") + ".", followup: followup});
  }

  // --- ENGINE: Speed Retention Index (Kyle Ruth, 30 Aug 2026). SRI = pace of the long test as % of the short.
  // Bands: <82 power outlier / 82-86 power / 86-89 mixed / 89-92 endurance / >=92 endurance outlier.
  const sri = function (ts, ds, tl, dl) { return tdPyRound((dl / tl) / (ds / ts) * 100, 1); };
  const sriBand = function (x) {
    if (x < 82) return "power outlier — build sustained speed/pacing";
    if (x < 86) return "power-biased — bias longer intervals";
    if (x < 89) return "mixed — demands decide";
    if (x < 92) return "endurance-biased — raise top-end speed";
    return "endurance outlier — flat curve, ceiling is the cap";
  };
  const miT = res("run_1_mile"), r5kT = res("run_5k");
  const w2kT = res("row_2k"), w5kT = res("row_5k");
  const sriParts = [];
  if (tdTruthy(miT) && tdTruthy(r5kT)) { const v = sri(miT, 1609, r5kT, 5000); sriParts.push("run " + tdFloatStr(v) + "% (" + sriBand(v) + ")"); }
  if (tdTruthy(w2kT) && tdTruthy(w5kT)) { const v = sri(w2kT, 2000, w5kT, 5000); sriParts.push("row " + tdFloatStr(v) + "% (" + sriBand(v) + ")"); }
  if (sriParts.length) out.push({domain: "Speed retention (SRI)", verdict: sriParts.join(" · ") + ".", followup: null}); // short: definition is in the badge tooltip

  // --- ENGINE --- first separate modalities (run vs erg), then short-vs-long within the mixed set.
  const runs = [sc("run_1_mile"), sc("run_5k"), sc("run_10k")].filter(function (s) { return s !== null; });
  const ergs = [sc("echo_bike"), sc("row_1k"), sc("row_2k"), sc("row_5k"), sc("c2_20min")].filter(function (s) { return s !== null; });
  if (runs.length && ergs.length && (tdSum(ergs) / ergs.length - tdSum(runs) / runs.length) >= 0.08) {
    const rAvg = tdPyRound(tdSum(runs) / runs.length, 2), eAvg = tdPyRound(tdSum(ergs) / ergs.length, 2);
    out.push({domain: "Engine",
      verdict: "Modality gap: runs ~" + tdFloatStr(rAvg) + " vs ergs ~" + tdFloatStr(eAvg) + " — running economy is the limiter, not the engine.",
      followup: null});
  } else {
    const short = [sc("echo_bike"), sc("row_2k"), sc("row_1k")].filter(function (s) { return s !== null; });
    const long_ = [sc("run_5k"), sc("c2_20min"), sc("row_5k"), sc("run_10k")].filter(function (s) { return s !== null; });
    if (short.length) {
      const sMin = Math.min.apply(null, short);
      if (long_.length) {
        const lMin = Math.min.apply(null, long_);
        const gap = tdPyRound(sMin - lMin, 2);
        if (lMin < 0.9 && gap >= 0.08) {
          out.push({domain: "Engine",
            verdict: "Short " + tdFloatStr(tdPyRound(sMin, 2)) + " ✓, long drops to " + tdFloatStr(tdPyRound(lMin, 2)) + " — sustained output is the limiter; long continuous work.",
            followup: null});
        } else if (sMin < 0.9 && (lMin - sMin) >= 0.08) {
          out.push({domain: "Engine",
            verdict: "Long " + tdFloatStr(tdPyRound(lMin, 2)) + " ✓, short lags at " + tdFloatStr(tdPyRound(sMin, 2)) + " — power ceiling; top-end intervals.",
            followup: null});
        } else {
          out.push({domain: "Engine",
            verdict: "Short " + tdFloatStr(tdPyRound(sMin, 2)) + " and long " + tdFloatStr(tdPyRound(lMin, 2)) + " in balance.",
            followup: null});
        }
      } else {
        out.push({domain: "Engine",
          verdict: "Short " + tdFloatStr(tdPyRound(sMin, 2)) + " measured; no long test.",
          followup: "C2 20-min watts: separates power from aerobic base + anchors pacing."});
      }
    }
  }

  // --- WEIGHTLIFTING (clean chain) --- the clean norm is derived from the front squat (/1.1), so a weak
  // front squat lowers the bar and the clean can look "at level" while lagging absolutely (Michel, 30 Aug 2026).
  raw = tdOr(raw, {});
  const sqCl = tdOr(tdGet(raw, "squat_clean"), res("clean"));
  const pwCl = tdGet(raw, "power_clean");
  const sn = tdOr(tdGet(raw, "snatch"), res("snatch")), pwSn = tdGet(raw, "power_snatch");
  const jerkR = res("jerk"), fsR = res("front_squat");
  const fsS = sc("front_squat");
  const wlParts = [];
  let wlNext = null;
  if (tdTruthy(sqCl) && tdTruthy(pwCl) && sqCl <= pwCl) {
    wlParts.push("squat clean " + Math.trunc(sqCl) + " ≤ power clean " + Math.trunc(pwCl) + " — not sitting under the bar");
    wlNext = "Receiving work: drop-and-catch, tempo FS, cleans from blocks.";
  }
  if (tdTruthy(sn) && tdTruthy(pwSn) && pwSn / sn >= 0.90) wlParts.push("power snatch " + tdPyRound(pwSn / sn * 100, 0) + "% of snatch (exp. 80-88) — same pattern");
  if (tdTruthy(sqCl) && tdTruthy(jerkR) && jerkR / sqCl >= 1.10) wlParts.push("jerk " + tdPyRound(jerkR / sqCl * 100, 0) + "% of clean — overhead not the limiter");
  if (tdTruthy(sqCl) && tdTruthy(fsR) && sqCl / fsR >= 0.97) wlParts.push("cleans ~" + tdPyRound(sqCl / fsR * 100, 0) + "% of front squat — FS is the ceiling");
  if (wlParts.length) {
    wlParts.push("all ratios → front-rack strength + receiving position");
    out.push({domain: "Weightlifting ratios", verdict: wlParts.join("; ") + ".", followup: wlNext});
  } else if (tdTruthy(sqCl) && fsS !== null && fsS < TD_STRONG_THRESHOLD && sc("clean") !== null && sc("clean") >= TD_STRONG_THRESHOLD) {
    out.push({domain: "Weightlifting ratios",
      verdict: "Clean 'at level' vs a below-standard front squat — the bar moved down with it; check against the absolute tier standard.",
      followup: null});
  }

  // --- SQUAT PATTERN ---
  const fs = res("front_squat"), bs = res("back_squat");
  if (tdTruthy(fs) && tdTruthy(bs)) {
    const ratio = tdPyRound(fs / bs * 100, 1);
    if (ratio < 82) {
      out.push({domain: "Squat pattern",
        verdict: "FS " + tdFloatStr(ratio) + "% of BS (exp. ~85%) — front-rack lags the legs.",
        followup: "Zombie FS + double-KB rack hold: position vs trunk strength."});
    }
  }
  return out.length ? out : null;
}

/* ---------------------------------------------------------------------------
   Perception gap (30 Aug 2026): tested score next to the athlete's own rating. delta > 0 = blind spot,
   delta < 0 = confidence issue (Kyle Ruth, Will Skipp call 2).
   --------------------------------------------------------------------------- */
const TD_PERCEPTION_MAP = [ // test key -> movement in the self-assessment, context hint (or null)
  ["back_squat", "Back Squat", null],
  ["front_squat", "Front Squat", null],
  ["deadlift", "Deadlift", "Zwaar"],
  ["strict_press", "Strict Press", null],
  ["snatch", "Snatch", "Zwaar"],
  ["clean", "Clean", "Zwaar"],
  ["jerk", "Split Jerk", null],
  ["strict_hspu", "Strict HSPU", null],
  ["strict_hspu_amrap", "Strict HSPU", null],
  ["weighted_pullup", "Strict Pull-up", null],
  ["llrc", "Legless Rope Climb", null],
  ["rmu", "Ring Muscle-Up", null]
];

function tdExpectedSelf(score) { // test score (1.0 = at norm) -> the self-rating you would expect; "At norm" == 3
  if (score === null) return null;
  if (score < 0.85) return 1;
  if (score < 0.95) return 2;
  if (score < 1.05) return 3;
  if (score < 1.15) return 4;
  return 5;
}

function tdComputePerceptionGap(tests, saDetail) {
  if (!tdTruthy(saDetail)) return null;
  const byMove = new Map();
  for (const x of saDetail) {
    if (tdGet(x, "score") === null) continue;
    const m = tdReq(x, "movement");
    if (!byMove.has(m)) byMove.set(m, []);
    byMove.get(m).push(x);
  }
  const out = [];
  for (const entry of TD_PERCEPTION_MAP) {
    const key = entry[0], movement = entry[1], ctxHint = entry[2];
    const t = tdGet(tests, key);
    if (!tdTruthy(t) || tdGet(t, "score") === null) continue;
    const rows = byMove.get(movement);
    if (!tdTruthy(rows)) continue;
    let row = rows.find(function (r) { return tdTruthy(ctxHint) && tdOr(tdGet(r, "context"), "").includes(ctxHint); });
    if (row === undefined) row = rows[0];
    const expected = tdExpectedSelf(t.score);
    const delta = tdReq(row, "score") - expected;
    out.push({
      key: key, label: t.label, movement: movement,
      context: tdEn(tdGet(row, "context")), test_score: tdPyRound(t.score, 2),
      self_score: row.score, expected_self: expected, delta: delta,
      signal: (delta >= 2 ? "blind spot" : delta <= -2 ? "confidence" : Math.abs(delta) === 1 ? "minor gap" : "matches")
    });
  }
  return out.length ? tdSorted(out, function (x) { return -Math.abs(x.delta); }) : null;
}

function tdPerceptionSynthesis(gaps) { // one sentence per strong signal (|delta| >= 2)
  if (!tdTruthy(gaps)) return null;
  const blind = gaps.filter(function (g) { return g.delta >= 2; });
  const trust = gaps.filter(function (g) { return g.delta <= -2; });
  const fmt = function (g) { return g.label + " (tested " + tdFloatStr(g.test_score) + ", self " + String(g.self_score) + "/5)"; };
  const zinnen = [];
  if (blind.length) zinnen.push("Blind spot: " + blind.map(fmt).join(", ") + " — rates themselves higher than the test supports.");
  if (trust.length) zinnen.push("Confidence, not capacity: " + trust.map(fmt).join(", ") + " — above standard but does not feel that way.");
  return zinnen.join(" ") || null;
}

/* ---------------------------------------------------------------------------
   Mixed-modal patterns (30 Aug 2026) + NL -> EN display translation (dashboard is English so it can be
   discussed with Kyle Ruth; the source data stays Dutch, unknown keys fall back to the original text).
   --------------------------------------------------------------------------- */
const TD_NL_EN = {
  // mixed-modal patterns
  "Barbell cycling onder vermoeidheid": "Barbell cycling under fatigue",
  "Barbell cycling gecombineerd met gymnastics aan het rek": "Barbell cycling combined with gymnastics on the rig",
  "Barbell cycling + gymnastics aan het rek": "Barbell cycling + gymnastics on the rig",
  "Gymnastics onder vermoeidheid": "Gymnastics under fatigue",
  "Sprint-capaciteit": "Sprint capacity",
  "Lange chippers/grinders": "Long chippers/grinders",
  "Pacing/strategie": "Pacing/strategy",
  "Transities tussen stations": "Transitions between stations",
  "Herstel tussen sets/rondes": "Recovery between sets/rounds",
  "Mentale weerstand bij hoge intensiteit": "Mental resilience at high intensity",
  // contexts
  "Zwaar": "Heavy", "Matig": "Moderate", "Licht": "Light",
  "Zwaar | 1RM / near-max": "Heavy | 1RM / near-max",
  "Zwaar / matig in workouts": "Heavy / moderate in workouts",
  "Matig | workout cycling": "Moderate | workout cycling",
  "Matig | workoutgewicht, cycling": "Moderate | workout weight, cycling",
  "Licht | high-rep": "Light | high-rep",
  "Licht | high-rep, KB/DB snatch": "Light | high-rep, KB/DB snatch",
  "Licht | high-rep, lichte barbell of KB": "Light | high-rep, light barbell or KB",
  "Capaciteit": "Capacity",
  "Standaard": "Standard",
  "Workout-efficiëntie": "Workout efficiency",
  "Algemeen / workoutcontext": "General / workout context",
  "Carry / Clean / Load": "Carry / Clean / Load",
  "<5 min all-out effort": "<5 min all-out effort",
  ">15 min aaneengesloten werk": ">15 min continuous work",
  "touch-and-go thrusters/cleans/snatches laat in een metcon": "touch-and-go thrusters/cleans/snatches late in a metcon",
  "bijv. thrusters+pull-ups, cleans+bar muscle-ups": "e.g. thrusters+pull-ups, cleans+bar muscle-ups",
  "kipping HSPU/T2B/muscle-ups als je al buiten adem bent": "kipping HSPU/T2B/muscle-ups when already out of breath",
  "kun je een even of negative split volhouden in een lange WOD": "can you hold an even or negative split in a long WOD",
  "even of negative split volhouden in een lange WOD": "holding an even or negative split in a long WOD",
  "hoe snel/efficiënt wissel je van beweging": "how fast/efficiently you switch movements",
  "hoe snel daalt je hartslag": "how quickly your heart rate drops",
  "redlining": "redlining", '"redlining"': '"redlining"',
  // categories
  "CROSSFIT-SPECIFIEKE PATRONEN": "CROSSFIT-SPECIFIC PATTERNS",
  "CROSSFIT-SPECIFIEKE PATRONEN (mixed-modal, niet per beweging)": "CROSSFIT-SPECIFIC PATTERNS (mixed-modal, not per movement)",
  "OVERIG": "OTHER",
  // fixed mental performance questions (7) + self-reflection questions (2)
  "Hoe goed kun je je energie en spanning reguleren vlak vóór en tijdens een wedstrijd of zware training?":
    "How well can you regulate your energy and arousal right before and during a competition or hard session?",
  "Hoe goed ga je om met stress buiten de sport (werk, privé) en de invloed daarvan op je training?":
    "How well do you handle stress outside the sport (work, personal life) and its impact on your training?",
  "Hoe goed blijf je geconcentreerd op de taak tijdens een workout, ondanks afleiding of vermoeidheid?":
    "How well do you stay focused on the task during a workout, despite distraction or fatigue?",
  "Hoe sterk is je vertrouwen in je eigen vermogen om je doelen te behalen?":
    "How strong is your belief in your own ability to reach your goals?",
  "Hoe consistent is je motivatie om te trainen, ook op de moeilijke dagen?":
    "How consistent is your motivation to train, even on the hard days?",
  "Hoe belangrijk is het voor jou om te winnen of te presteren t.o.v. anderen of jezelf?":
    "How important is it for you to win or perform relative to others or yourself?",
  "Hoe open sta je voor feedback en hoe goed communiceer je met je coach?":
    "How open are you to feedback and how well do you communicate with your coach?",
  "Welke patronen zie je vaak terugkomen als jouw beperking in workouts?":
    "Which patterns do you often see recurring as your limitation in workouts?",
  "Wat is je grootste kracht in mixed-modal workouts (bijv. barbell cycling combo's, gymnastics onder vermoeidheid, pacing)?":
    "What is your biggest strength in mixed-modal workouts (e.g. barbell cycling combos, gymnastics under fatigue, pacing)?"
};

function tdEn(s) { // translate an intake label to English; unknown = unchanged. Strips a "(context)" suffix for the lookup.
  if (!tdTruthy(s)) return s === undefined ? null : s;
  if (tdHas(TD_NL_EN, s)) return TD_NL_EN[s];
  const base = String(s).split(" (")[0];
  return tdHas(TD_NL_EN, base) ? TD_NL_EN[base] : s;
}

function tdComputeMixedModal(saDetail) {
  if (!tdTruthy(saDetail)) return null;
  const rows = saDetail.filter(function (x) { return tdOr(tdGet(x, "category"), "").includes(TD_MIXED_MODAL_CAT) && tdGet(x, "score") !== null; });
  if (!rows.length) return null;
  const sterk = rows.filter(function (r) { return r.score >= 4; }).map(function (r) { return tdEn(tdReq(r, "movement")); });
  const zwak = rows.filter(function (r) { return r.score <= 2; }).map(function (r) { return tdEn(tdReq(r, "movement")); });
  const delen = [];
  if (zwak.length) delen.push("Weak: " + zwak.join(", ") + ".");
  if (sterk.length) delen.push("Strong: " + sterk.join(", ") + ".");
  return {
    rows: rows.map(function (r) { return {patroon: tdEn(tdReq(r, "movement")), context: tdEn(tdGet(r, "context")), score: r.score}; }),
    sterk: sterk, zwak: zwak,
    synthese: delen.join(" ") || null
  };
}

function tdComputeCrossfitProfile(catScores) { // balance the profile: maintain what is strong, point to the untested/weak side
  const S = tdGet(catScores, "Strength");
  const E = tdGet(catScores, "Engine");
  const G = tdGet(catScores, "Gymnastics");
  if (S === null || E === null) return "Strength and/or Engine score still missing — not enough data for a CrossFit/mixed profile.";
  const diff = S - E;
  let strong, weakSide;
  if (diff > 0.1) { strong = "heavy/short (strength-driven)"; weakSide = "longer, engine-driven workouts with less load"; }
  else if (diff < -0.1) { strong = "long/high-volume (engine-driven)"; weakSide = "short, heavy strength-driven pieces"; }
  else { strong = "balanced across duration and load"; weakSide = null; }
  if (G !== null && G < 0.6 && tdTruthy(weakSide)) {
    return "Strong in " + strong + "; balance the profile with more " + weakSide + " and more skill volume (gymnastics is the limiting factor right now).";
  }
  if (G !== null && G < 0.6) return "Duration/load are balanced, but skill density (gymnastics) is the limiting factor — programme more mixed skill-under-fatigue work.";
  if (tdTruthy(weakSide)) return "Strong in " + strong + " — balance the profile with more " + weakSide + ".";
  return "Profile is already reasonably balanced across duration/load — maintain, keep varying skill density.";
}

/* ---------------------------------------------------------------------------
   SRI -> training direction behind the badge (16 Sep 2026, Michel). Kyle's own bands/statements with source
   label; our own translation is labelled "YP interpretation". Reading instruction only, does not steer ranking.
   --------------------------------------------------------------------------- */
const TD_BAND_ORDER = ["Power outlier", "Power-biased", "Mixed", "Endurance-biased", "Endurance outlier"];
const TD_SRI_TRAIN = {
  "Power outlier": {
    curve: "Very fast short, steepest drop-off.",
    direction: [["Sustained speed, threshold, pacing and economy; maintain short power.", "Kyle · SRI bands (Skool, 29 Aug)"],
      ["Inherently powerful: go longer and slower to build the aerobic system. The further outside the middle band, the more strength you can afford to sacrifice for it.", "Kyle · Harley call 6"]],
    sessions: [["The SRI outlier is who actually deserves significant zone-two time (Sydney Smith: 3×90' zone two/week + threshold-biased FTP progressions).", "Kyle · Harley call 6"],
      ["Speed work at the END of the session: the goal is a finishing kick.", "Kyle · Kenneth call 5"],
      ["Heavy power athlete: swap one zone-two run for bike to limit pounding.", "Kyle · Bob Yuill call 2"],
      ["Race plan: can sit in and punch at the end.", "YP interpretation · Harley call 1"]]
  },
  "Power-biased": {
    curve: "Short speed exceeds the ability to hold it.",
    direction: [["Longer intervals and sustained work; maintain short quality.", "Kyle · SRI bands (Skool, 29 Aug)"],
      ["Elite CrossFitters cluster around 86%, some as low as 82 — this is a Games-typical profile, not a flaw.", "Kyle · Harley call 6"]],
    sessions: [["Speed work at the END of the session: the goal is a finishing kick.", "Kyle · Kenneth call 5"],
      ["Main conditioning lever = threshold / extensive intervals; zone two stays maintenance unless one modality is an outlier.", "YP interpretation"]]
  },
  "Mixed": {
    curve: "No clear bias — the ratio alone gives no direction.",
    direction: [["Let the gaps, the run-vs-row comparison and the competition demands decide.", "Kyle · SRI bands (Skool, 29 Aug)"]],
    sessions: [["Mid-band athlete: zone-two volume is not the lever; economy and skill get the time.", "YP interpretation · Harley call 6"],
      ["Pick the accent from the weakest raw score vs the norm, not from the SRI.", "Kyle · decision tree (Noah call 5)"]]
  },
  "Endurance-biased": {
    curve: "Speed held well; the short ceiling limits.",
    direction: [["Raise mile/2K speed and aerobic power; maintain threshold.", "Kyle · SRI bands (Skool, 29 Aug)"],
      ["Not powerful enough to run the mile hard: develop top-end speed and trust the aerobic base to support it.", "Kyle · Harley call 6"]],
    sessions: [["Speed work FIRST in the session, neurologically fresh.", "Kyle · Kenneth call 5"],
      ["Flat curve → template biased to neuromuscular speed and power (e.g. row at 1K pace, strides).", "Kyle · Bob Yuill call 2"],
      ["Race plan: no big end-punch — stay with the leaders and win through attrition.", "YP interpretation · Harley call 1"]]
  },
  "Endurance outlier": {
    curve: "Exceptionally flat — or a weak short anchor, or a test mismatch.",
    direction: [["Validate the tests first; if valid, prioritise the short ceiling.", "Kyle · SRI bands (Skool, 29 Aug)"],
      ["Develop top-end speed and trust the aerobic base to support it.", "Kyle · Harley call 6"]],
    sessions: [["Speed work FIRST in the session, neurologically fresh.", "Kyle · Kenneth call 5"],
      ["Flat curve → template biased to neuromuscular speed and power (e.g. row at 1K pace, strides).", "Kyle · Bob Yuill call 2"]]
  }
};
const TD_PAIR_DEF = {row: ["row 2K→5K", "row_2k", "row_5k"], run: ["run 1mi→5K", "run_1_mile", "run_5k"]};
// Option A (1 Sep 2026): the SRI band writes its own "Why (SRI)" line under Conditioning, unless Michel wrote a
// Conditioning priority_context himself (his text always wins). Ranking stays coach judgement.
const TD_SRI_WHY = {
  "Power outlier": "verliest veel snelheid over de lange test -- bouw duurzame snelheid en pacing",
  "Power-biased": "houdt de lange test matig vast -- verschuif naar langere intervallen",
  "Mixed": "geen uitgesproken bias -- de wedstrijdeisen beslissen",
  "Endurance-biased": "houdt de lange test goed vast -- het plafond is top-end speed, niet de duur",
  "Endurance outlier": "vrijwel vlakke curve -- het korte-duur-plafond begrenst alles, verhoog top-end speed"
};
const TD_DIAG_THEME = {"Pressing (HSPU)": "Gymnastics", "Pulling": "Gymnastics",
  "Engine": "Conditioning", "Squat pattern": "Strength",
  "Weightlifting ratios": "Weightlifting", "Speed retention (SRI)": "Conditioning"};
const TD_SRI_TESTS = {run: [["run_1_mile", "1 mile run"], ["run_5k", "5K run"], ["run_10k", "10K run"]],
  row: [["row_2k", "2K row"], ["row_5k", "5K row"]]};
const TD_CATEGORIES = {
  "Strength": ["deadlift", "back_squat", "front_squat", "ohs", "strict_press", "cgbp", "seal_row"],
  "Olympic": ["ratio", "clean", "jerk"],
  "Gymnastics": ["strict_hspu", "strict_hspu_amrap", "weighted_pullup", "llrc", "rmu"],
  "Engine": ["echo_bike", "row_2k", "run_5k", "c2_20min", "row_1k", "row_5k", "run_10k", "run_1_mile"],
  "CrossFit": ["fran_5rft", "diane_amrap", "row_burpee_ttb"]
};

/* ---------------------------------------------------------------------------
   build(name, d): one raw athlete input record -> one dashboard record
   --------------------------------------------------------------------------- */
function tdBuild(name, d) {
  const bw = tdGet(d, "bw"); // may be null (athlete not tested yet) -> all *bw norms below are null too
  const gender = tdReq(d, "gender");
  const norms = gender === "M" ? TD_NORMS_MALE : TD_NORMS_FEMALE;
  const tests = {}; // key -> {label, result, unit, norm, norm_label, score, status}; insertion order matters (sums, testbatterij)

  function add(key, label, result, unit, normVal, normLabel, higherIsBetter, cap) {
    if (higherIsBetter === undefined) higherIsBetter = true;
    if (cap === undefined) cap = 1.2;
    let score;
    if (result === null || normVal === null) {
      score = null;
    } else {
      score = higherIsBetter ? result / normVal : normVal / result;
      score = Math.min(score, cap);
    }
    tests[key] = {label: label, result: result, unit: unit, norm: normVal, norm_label: normLabel, score: score, status: tdStatus(score)};
  }
  function addTime(key, label, inputKey) { // time tests: lower is better, plus result_display
    const r = tdT2s(tdGet(d, inputKey));
    add(key, label, r, "tijd", tdT2s(norms[inputKey]), norms[inputKey], false);
    tests[key].result_display = tdS2t(r);
  }

  // STRENGTH
  add("deadlift", "Deadlift", tdGet(d, "deadlift"), "kg", tdTruthy(bw) ? 2.5 * bw : null, "2.5× BW");
  add("back_squat", "Back squat", tdGet(d, "back_squat"), "kg", tdTruthy(bw) ? 2.0 * bw : null, "2× BW");
  const bs = tdGet(d, "back_squat");
  const fs = tdOr(tdGet(d, "front_squat"), tdGet(d, "front_squat_estimate"));
  add("front_squat", "Front squat" + ((tdTruthy(tdGet(d, "front_squat_estimate")) && !tdTruthy(tdGet(d, "front_squat"))) ? " (geschat)" : ""),
    fs, "kg", tdTruthy(bs) ? 0.9 * bs : null, "90% back squat");
  // Overhead squat added 1 Sep 2026 (Michel). Norm 90% of the front squat = formula from Michel's own test battery template.
  add("ohs", "Overhead squat", tdGet(d, "ohs"), "kg", tdTruthy(fs) ? 0.9 * fs : null, "90% front squat");
  add("strict_press", "Strict press", tdGet(d, "strict_press"), "kg", tdTruthy(bw) ? 0.9 * bw : null, "90% BW");
  const pc = tdGet(d, "power_clean");
  add("cgbp", "CGBP", tdGet(d, "cgbp"), "kg", pc, "1:1 power clean");
  const dl = tdGet(d, "deadlift");
  add("seal_row", "Seal row 8RM", tdGet(d, "seal_row_8rm"), "kg", tdTruthy(dl) ? 0.5 * dl : null, "50% 1RM deadlift");

  // OLYMPIC
  // Clean norm: front squat 1RM -> 3RM equivalent via Epley (front squat / 1.1), agreed with Michel 6 Aug 2026.
  const cleanNorm = tdTruthy(fs) ? tdPyRound(fs / 1.1, 1) : null;
  add("clean", "Clean (squat clean)", tdGet(d, "squat_clean"), "kg", cleanNorm, "front squat ÷ 1.1 (≈3RM)");
  // Power clean own row (13 Sep 2026, Michel), norm 70% back squat; does NOT count in cat_scores/Olympic (like "snatch").
  add("power_clean", "Power clean", pc, "kg", tdTruthy(bs) ? tdPyRound(0.7 * bs, 1) : null, "70% back squat");
  // Jerk norm: 105% of the clean norm (Michel, 6 Aug 2026).
  const jerkNorm = tdTruthy(cleanNorm) ? tdPyRound(cleanNorm * 1.05, 1) : null;
  add("jerk", "Jerk (split jerk)", tdGet(d, "jerk"), "kg", jerkNorm, "105% van clean-norm");
  const sn = tdGet(d, "snatch");
  // Norm 1.3x BW, same as Testbatterij!D17 in the Excel.
  add("snatch", "Snatch", sn, "kg", tdTruthy(bw) ? 1.3 * bw : null, "1.3× BW");
  const ratioVal = (tdTruthy(sn) && tdTruthy(bs)) ? tdPyRound(sn / bs * 100, 1) : null;
  add("ratio", "Snatch / back squat ratio", ratioVal, "%", 65, "65%");

  // GYMNASTICS
  const hspu = tdGet(d, "strict_hspu_unbroken");
  add("strict_hspu", "Strict HSPU (max unbroken)", hspu, "reps", norms.strict_hspu, norms.strict_hspu + " unbroken");
  // 5 min AMRAP max strict HSPU, first set is a mandatory max unbroken set (Michel, 17 Aug 2026).
  add("strict_hspu_amrap", "Strict HSPU 5min AMRAP", tdGet(d, "strict_hspu_amrap"), "reps", norms.strict_hspu_amrap, norms.strict_hspu_amrap + " reps");
  add("weighted_pullup", "Weighted strict pull-up (extra)", tdGet(d, "weighted_pullup_extra"), "kg", tdTruthy(bw) ? 0.5 * bw : null, "50% BW extra");
  const llrcVal = tdGet(d, "llrc");
  add("llrc", "LLRC (10 min)", llrcVal, "reps", norms.llrc, norms.llrc + " reps/10min");
  add("rmu", "RMU (max unbroken)", tdGet(d, "rmu"), "reps", norms.rmu, norms.rmu + " unbroken");

  // ENGINE
  add("echo_bike", "Echo bike 10 min", tdGet(d, "echo_bike"), "cal", tdTruthy(bw) ? 2.2 * bw : null, "2.2× BW");
  addTime("row_2k", "2K row", "row_2k");
  addTime("run_5k", "5K run", "run_5k");
  add("c2_20min", "Bike erg 20 min FTP (C2)", tdGet(d, "c2_20min"), "watt", tdTruthy(bw) ? 3 * bw : null, "3× BW");
  // Added 28 Aug 2026 (Michel): one canonical field per sport_reference conditioning test.
  addTime("row_1k", "1K row", "row_1k");
  addTime("row_5k", "5K row", "row_5k");
  addTime("run_10k", "10K run", "run_10k");
  addTime("run_1_mile", "1 mile run", "run_1_mile");

  // CROSSFIT (mixed-modal benchmarks, agreed with Michel 11 Aug 2026)
  addTime("fran_5rft", "Thruster/pull-up 5RFT (43/30kg)", "fran_5rft");
  add("diane_amrap", "Deadlift/HSPU 5min AMRAP (100/70kg)", tdGet(d, "diane_amrap"), "reps", norms.diane_amrap, norms.diane_amrap + " reps");
  addTime("row_burpee_ttb", "Row/Burpee/TTB 30-20-10", "row_burpee_ttb");

  const categories = TD_CATEGORIES;
  const catScores = {};
  for (const cat of Object.keys(categories)) {
    const scores = categories[cat].map(function (k) { return tests[k].score; }).filter(function (s) { return s !== null; });
    catScores[cat] = scores.length ? tdPyRound(tdSum(scores) / scores.length, 3) : null;
  }
  const allScores = Object.keys(tests).map(function (k) { return tests[k].score; }).filter(function (s) { return s !== null && s !== 999; });
  const overall = allScores.length ? tdPyRound(tdSum(allScores) / allScores.length, 3) : null;
  const filled = Object.keys(tests).filter(function (k) { return tests[k].result !== null; }).length;
  const total = Object.keys(tests).length;

  const priorities = tdComputePriorities(tests, catScores);
  let crossfitProfile = tdComputeCrossfitProfile(catScores);
  // Layered structure next to the flat string (Michel 30 Aug 2026: bullets per source layer).
  const prioLayers = {};
  for (const cat of Object.keys(priorities)) prioLayers[cat] = [{label: "Measured", text: priorities[cat]}];
  const cfLayers = [{label: "Measured", text: crossfitProfile}];

  // Layer order per block: measured -> diagnosis -> athlete -> competition -> why (approved by Michel 30 Aug 2026).
  const diag = tdComputeDiagnostics(tests, tdGet(d, "self_assessment_detail"), d);
  if (tdTruthy(diag)) {
    for (const x of diag) {
      const theme = tdGet(TD_DIAG_THEME, x.domain);
      if (!tdTruthy(theme) || !tdHas(priorities, theme)) continue;
      let sent = "Diagnosis — " + x.domain + ": " + x.verdict;
      if (tdTruthy(tdGet(x, "followup"))) sent += " → Next: " + x.followup;
      priorities[theme] = (priorities[theme] + " " + sent).trim();
      prioLayers[theme].push({label: "Diagnosis — " + x.domain, text: x.verdict, next: tdGet(x, "followup")});
    }
  }

  // Athlete input (intake/self-scores/perception) as a layer before the competition notes.
  const ai = tdComputeAthleteInput(tdGet(d, "self_assessment_detail"),
    tdComputePerceptionGap(tests, tdGet(d, "self_assessment_detail")),
    tdGet(d, "mental_performance"));
  for (const cat of Object.keys(ai)) {
    const sent = ai[cat];
    const txt = sent.startsWith("Athlete input: ") ? sent.slice("Athlete input: ".length) : sent;
    if (cat === "CrossFit") {
      crossfitProfile = (crossfitProfile + " " + sent).trim();
      cfLayers.push({label: "Athlete input", text: txt});
    } else if (tdHas(priorities, cat)) {
      priorities[cat] = (priorities[cat] + " " + sent).trim();
      prioLayers[cat].push({label: "Athlete input", text: txt});
    }
  }

  const compNotes = tdGet(d, "comp_priority_notes");
  if (tdTruthy(compNotes)) {
    for (const cat of Object.keys(compNotes)) {
      const note = compNotes[cat];
      if (cat === "Profile") {
        crossfitProfile = (crossfitProfile + " " + note).trim();
        cfLayers.push({label: "Competition", text: note});
      } else if (tdHas(priorities, cat)) {
        priorities[cat] = (priorities[cat] + " " + note).trim();
        prioLayers[cat].push({label: "Competition", text: note});
      }
    }
  }

  // priority_context: same append mechanism, not competition-bound (Michel 10 Aug 2026).
  const prioContext = tdGet(d, "priority_context");
  if (tdTruthy(prioContext)) {
    for (const cat of Object.keys(prioContext)) {
      const note = prioContext[cat];
      if (cat === "Profile") {
        crossfitProfile = (crossfitProfile + " " + note).trim();
        cfLayers.push({label: "Why", text: note});
      } else if (tdHas(priorities, cat)) {
        priorities[cat] = (priorities[cat] + " " + note).trim();
        // Strip a "Why priority #1: ..." prefix — the bullet label is already "Why".
        const w = note.replace(/^Why [^:]{0,30}: /, "");
        prioLayers[cat].push({label: "Why", text: w});
      }
    }
  }

  // SRI typing for the card header (30 Aug 2026). Row goes before run (Kyle's primary pair).
  const sriPair = function (ts, ds, tl, dl) {
    const tS = tdGet(tdOr(tdGet(tests, ts), {}), "result"), tL = tdGet(tdOr(tdGet(tests, tl), {}), "result");
    if (!tdTruthy(tS) || !tdTruthy(tL)) return null;
    return tdPyRound((dl / tL) / (ds / tS) * 100, 1);
  };
  const runSri = sriPair("run_1_mile", 1609, "run_5k", 5000);
  const rowSri = sriPair("row_2k", 2000, "row_5k", 5000);
  // 10K added (Michel, 4 Sep 2026): two extra indexes as a second lens on the curve shape; they do not steer the band.
  const run10Sri = sriPair("run_1_mile", 1609, "run_10k", 10000);
  const run510Sri = sriPair("run_5k", 5000, "run_10k", 10000);
  const sriLabel = function (x) {
    if (x < 82) return "Power outlier";
    if (x < 86) return "Power-biased";
    if (x < 89) return "Mixed";
    if (x < 92) return "Endurance-biased";
    return "Endurance outlier";
  };
  const primary = rowSri !== null ? rowSri : runSri;
  const sriProfile = primary !== null ? {label: sriLabel(primary), run: runSri, row: rowSri, run10: run10Sri, run_5_10: run510Sri} : null;

  // SRI status badge for EVERY athlete (1 Sep 2026, Michel); sri_profile stays null without a complete pair.
  const sriMissing = function (pair) {
    return TD_SRI_TESTS[pair].filter(function (p) { return !tdTruthy(tdGet(tdOr(tdGet(tests, p[0]), {}), "result")); }).map(function (p) { return p[1]; });
  };
  const missRun = sriMissing("run"), missRow = sriMissing("row");
  let sriStatus;
  if (primary !== null) {
    // Complete pair: show the band; "missing" = everything still open over run (mile/5K/10K) and row (2K/5K).
    const other = missRun.concat(missRow);
    sriStatus = {state: "complete", label: sriLabel(primary),
      run: runSri, row: rowSri, run10: run10Sri, run_5_10: run510Sri,
      missing: other, estimate: tdGet(d, "sri_estimate")};
  } else {
    // No complete pair: show the CLOSEST pair (1 test to go beats 2); for run only the primary pair (mile + 5K) counts.
    const missRunPair = TD_SRI_TESTS.run.slice(0, 2).filter(function (p) { return !tdTruthy(tdGet(tdOr(tdGet(tests, p[0]), {}), "result")); }).map(function (p) { return p[1]; });
    const best = missRunPair.length <= missRow.length ? missRunPair : missRow; // min(..., key=len): first wins a tie
    sriStatus = {state: (best.length === 1 ? "partial" : "none"),
      label: (best.length === 1 ? "SRI: nog " + best[0] : "SRI: niet getest"),
      run: null, row: null, run10: null, run_5_10: null,
      missing: (best.length === 1 ? best : missRun.concat(missRow))};
  }

  if (primary !== null) {
    const pkey = rowSri !== null ? "row" : "run";
    const plabel = TD_PAIR_DEF[pkey][0], ks = TD_PAIR_DEF[pkey][1], kl = TD_PAIR_DEF[pkey][2];
    const band = sriLabel(primary);
    const t = TD_SRI_TRAIN[band];
    const checks = [];
    for (const pair of [["row 2K→5K", rowSri], ["run 1mi→5K", runSri]]) {
      const nm = pair[0], v = pair[1];
      if (v === null) continue;
      if (v >= 92) {
        checks.push([nm + " " + tdFloatStr(v) + "% ≥92: a flat curve usually means the short test (" + (nm.startsWith("row") ? "2K" : "mile") + ") wasn't all-out — retest before programming off it.",
          "Kyle · SRI bands (Skool, 29 Aug)"]);
      } else if (v < 82) {
        checks.push([nm + " " + tdFloatStr(v) + "% <82: check the long test first (full distance per GPS, all-out, recent) — Kyle caught a '5K' that was 4.5K.",
          "YP interpretation · Noah call 5"]);
      }
    }
    if (runSri !== null && rowSri !== null) {
      const gap = Math.abs(TD_BAND_ORDER.indexOf(sriLabel(runSri)) - TD_BAND_ORDER.indexOf(sriLabel(rowSri)));
      if (gap >= 2) {
        checks.push(["Run (" + sriLabel(runSri) + ") and row (" + sriLabel(rowSri) + ") disagree: compare the modalities — a gap is usually running economy, not the engine. Never compare a run test with an erg test.",
          "Kyle · row-vs-run cross-check (Noah call 4)"]);
      }
    }
    const rawRows = [];
    for (const k of [ks, kl]) {
      const tt = tdOr(tdGet(tests, k), {});
      if (tdTruthy(tdGet(tt, "result"))) {
        rawRows.push({label: tdGet(tt, "label"), value: tdGet(tt, "result_display"), norm: tdGet(tt, "norm_label"), status: tdGet(tt, "status")});
      }
    }
    if (tdTruthy(tdGet(d, "sri_estimate"))) checks.unshift([d.sri_estimate, "Athlete's own entry in Strivee"]);
    const slow = rawRows.length === 2 && rawRows.every(function (r) { return r.status === "Developing"; });
    if (slow) {
      checks.push(["Both times are Developing vs the norm: 'just slow' — raise both before trusting the profile.",
        "Kyle · decision tree, cohort weighs most (Noah call 5)"]);
    }
    sriStatus.training = {band: band, pair: plabel, value: primary, curve: t.curve,
      checks: checks, raw: rawRows, direction: tdDeepCopy(t.direction), sessions: tdDeepCopy(t.sessions)};
  } else {
    sriStatus.training = null;
  }

  // "Why (SRI)" under Conditioning (Option A, 1 Sep 2026) — only when Michel wrote no Conditioning context himself.
  if (tdTruthy(sriProfile) && tdHas(priorities, "Conditioning") && !tdTruthy(tdGet(tdOr(prioContext, {}), "Conditioning"))) {
    let rank = null;
    const tp = tdOr(tdGet(d, "top_priorities"), []);
    for (let i = 0; i < tp.length; i++) { if (tdGet(tp[i], "cat") === "Conditioning") { rank = i + 1; break; } }
    const vals = [["run 1mi→5K", runSri], ["run 1mi→10K", run10Sri], ["row 2K→5K", rowSri]]
      .filter(function (p) { return p[1] !== null; })
      .map(function (p) { return p[0] + " " + tdFloatStr(p[1]) + "%"; }).join(" / ");
    let why = "SRI " + vals + ": " + TD_SRI_WHY[sriProfile.label] + ".";
    if (tdTruthy(rank)) why = "Conditioning staat op #" + rank + ". " + why;
    priorities["Conditioning"] = (priorities["Conditioning"] + " " + why).trim();
    prioLayers["Conditioning"].push({label: "Why (SRI)", text: why});
  }

  // Self-assessment (1-5) normalised to 0-1 for the radar (Michel 13 Aug 2026: display only).
  const rawSelf = tdGet(d, "self_assessment");
  let selfAssessmentScores = null;
  if (tdTruthy(rawSelf)) {
    selfAssessmentScores = {};
    for (const cat of Object.keys(rawSelf)) selfAssessmentScores[cat] = tdPyRound(rawSelf[cat] / 5, 3);
  }

  // Perception gap + mixed-modal run on the RAW (Dutch) data; display is translated afterwards.
  const saRaw = tdGet(d, "self_assessment_detail");
  const perceptionGap = tdComputePerceptionGap(tests, saRaw);
  const mixedModal = tdComputeMixedModal(saRaw);
  const saDetail = tdTruthy(saRaw)
    ? saRaw.map(function (x) { return Object.assign({}, x, {category: tdEn(tdGet(x, "category")), movement: tdEn(tdGet(x, "movement")), context: tdEn(tdGet(x, "context"))}); })
    : null;

  const tbf = tdGet(d, "testbatterij_full");
  const selfReflection = tdGet(d, "self_reflection");
  const mentalPerformance = tdGet(d, "mental_performance");

  return {
    name: name, day: tdReq(d, "day"), gender: gender, bw: bw, age: tdGet(d, "age"), updated: tdReq(d, "updated"),
    tests: tests, cat_scores: catScores, overall: overall, filled: filled, total: total,
    notes: tdGet(d, "notes", []), flags: tdGet(d, "flags", []),
    priorities: priorities, crossfit_profile: crossfitProfile,
    priorities_layers: prioLayers, crossfit_layers: cfLayers,
    sri_profile: sriProfile,
    sri_status: sriStatus,
    // Target level from the intake (30 Aug 2026); missing -> rendering falls back to Quarterfinal.
    target_level: tdGet(d, "target_level"),
    top_priorities: tdGet(d, "top_priorities"), accessory_focus: tdGet(d, "accessory_focus"),
    recent: tdGet(d, "recent"), comp: tdGet(d, "comp"),
    // Full raw onboarding data for the detail buttons; athletes without an Excel onboarding get their
    // 21 tracked fields in the same Testbatterij form (rollout 14 Aug 2026).
    testbatterij_full: tdTruthy(tbf) ? tbf : tdTestsToTestbatterijFull(tests, categories),
    self_assessment_detail: saDetail,
    // Self-reflection: the 2 open questions (literal athlete text), Michel 17 Aug 2026.
    self_reflection: tdTruthy(selfReflection)
      ? selfReflection.map(function (x) { return Object.assign({}, x, {vraag: tdEn(tdGet(x, "vraag"))}); })
      : null,
    sport_reference: tdBackfillSportReference(tdGet(d, "sport_reference"), tests),
    self_assessment_scores: selfAssessmentScores,
    // Mental performance (Kyle Ruth framework, 1-5): raw 7-row list plus hand-written synthesis (Michel 17 Aug 2026).
    mental_performance: tdTruthy(mentalPerformance)
      ? mentalPerformance.map(function (x) { return Object.assign({}, x, {vraag: tdEn(tdGet(x, "vraag"))}); })
      : null,
    mental_performance_synthesis: tdGet(d, "mental_performance_synthesis"),
    diagnostics: diag,
    perception_gap: perceptionGap,
    perception_synthesis: tdPerceptionSynthesis(perceptionGap),
    mixed_modal: mixedModal,
    intake_source: tdGet(d, "intake_source")
  };
}

function tdBuildAll(athletesRaw) {
  const out = {};
  for (const name of Object.keys(athletesRaw)) out[name] = tdBuild(name, athletesRaw[name]);
  return out;
}

if (typeof module !== "undefined" && module.exports) { module.exports = {tdBuild, tdBuildAll, tdT2s, tdS2t, tdStatus, tdEn, TD_NORMS_MALE, TD_NORMS_FEMALE, TD_CATEGORIES}; }
