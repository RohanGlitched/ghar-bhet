import test from "node:test";
import assert from "node:assert/strict";
import { understand, readNumber, tokenize, romanize } from "../public/js/understand.js";
import { checkRecord, flagCodes, RULE_TABLE } from "../public/js/rules.js";

const num = (s) => readNumber(tokenize(s), 0)?.value;

test("reads numbers the way ASHAs say them", () => {
  const cases = { "एक सौ पचास": 150, "डेढ़ सौ": 150, "साढ़े आठ": 8.5, "सात पॉइंट दो": 7.2, "दीडशे": 150, "एकशे पन्नास": 150, "one forty": 140, "one twelve": 112, "one oh two": 102, "पौने दो": 1.75, "साडेआठ": 8.5, "सव्वाशे": 125, "teenshe": 300, "saat sau": 700, "१५०": 150 };
  for (const [k, v] of Object.entries(cases)) assert.equal(num(k), v, k);
});

test("a newborn visit in Roman Hindi", () => {
  const { record } = understand("Sunita ka baby, saat din ka hai. Wajan ek kilo saat sau gram. Doodh kam pee raha hai, aur pasli chal rahi hai.", "newborn");
  assert.deepEqual({ name: record.name, day: record.day, weight_g: record.weight_g, feeding: record.feeding, ci: record.symptoms.chest_indrawing }, { name: "Sunita", day: 7, weight_g: 1700, feeding: "poor", ci: true });
  assert.deepEqual(flagCodes(record), ["nb_chest_indrawing", "nb_poor_feeding", "nb_very_low_weight"]);
});

test("a pregnancy visit with a self-correction", () => {
  const { record } = understand("Meena, battees hafte. BP ek sau chalis by nabbe, nahi nahi, ek sau pachaas by sau. Albumin do plus. Sar mein bahut dard hai.", "anc");
  assert.equal(record.bp_sys, 150); assert.equal(record.bp_dia, 100); assert.equal(record.weeks, 32); assert.equal(record.albumin, "2");
  assert.ok(flagCodes(record).includes("anc_preeclampsia"));
});

test("Devanagari Marathi with negations", () => {
  const { record } = understand("रेखाचे बाळ सात दिवसांचे आहे, वजन दीड किलो, ताप नाही, दूध पीत नाही", "newborn");
  assert.equal(record.name, "Rekha"); assert.equal(record.weight_g, 1500); assert.equal(record.feeding, "none"); assert.equal(record.symptoms.hot_to_touch, false);
});

test("a sign said as absent never fires a rule", () => {
  const { record } = understand("Baby ko fits nahi aaye, pasli nahi chal rahi, bukhar nahi, doodh achha pee raha, 7 din, wajan 3 kilo", "newborn");
  assert.deepEqual(checkRecord(record).filter((f) => f.severity === "refer_now"), []);
});

test("Fahrenheit is converted, and a reading is not also a symptom", () => {
  const { record } = understand("Vandana cha bal, 10 divas, taap 100.4 degree", "newborn");
  assert.equal(record.temp_c, 38); assert.equal(record.symptoms?.hot_to_touch, undefined);
  assert.ok(flagCodes(record).includes("nb_fever"));
});

test("thresholds sit exactly where the manuals put them", () => {
  const f = (r) => flagCodes(r);
  assert.ok(!f({ type: "anc", bp_sys: 139, bp_dia: 89 }).includes("anc_hypertension"));
  assert.ok(f({ type: "anc", bp_sys: 140, bp_dia: 80 }).includes("anc_hypertension"));
  assert.ok(f({ type: "anc", bp_sys: 150, bp_dia: 111 }).includes("anc_imminent_eclampsia"));
  assert.ok(f({ type: "anc", hb: 6.9 }).includes("anc_severe_anaemia"));
  assert.ok(f({ type: "anc", hb: 7 }).includes("anc_moderate_anaemia"));
  assert.ok(f({ type: "newborn", resp_rate: 61 }).includes("nb_fast_breathing"));
  assert.ok(!f({ type: "newborn", resp_rate: 60 }).includes("nb_fast_breathing"));
  assert.ok(f({ type: "newborn", weight_g: 1799 }).includes("nb_very_low_weight"));
  assert.ok(f({ type: "newborn", weight_g: 1800 }).includes("nb_low_weight"));
  assert.ok(f({ type: "newborn", temp_c: 37.5 }).includes("nb_fever"));
  assert.ok(f({ type: "newborn", temp_c: 35.4 }).includes("nb_hypothermia"));
  assert.ok(f({ type: "pnc", pads: 5 }).includes("pnc_heavy_bleeding"));
  assert.ok(!f({ type: "pnc", pads: 4 }).includes("pnc_heavy_bleeding"));
});

test("every rule names its source", () => {
  assert.equal(RULE_TABLE.length, 37);
  for (const r of RULE_TABLE) { assert.ok(r.source && r.source.length > 10, r.code); assert.ok(["refer_now", "watch"].includes(r.severity)); }
});

test("Devanagari is shown in Roman letters", () => {
  assert.equal(romanize("सुनीता का बच्चा"), "sunita ka bachcha");
  assert.equal(romanize("पसली चल रही है"), "pasli chal rahi hai");
});
