// Every reader/rule failure the round-1 judges found (work/judges-r1.json) is a test here.
// Keys: adversarial (adv), india-health-impact (health), build, voice-first (voice).
import test from "node:test";
import assert from "node:assert/strict";
import { understand } from "../public/js/understand.js";
import { flagCodes, checkRecord, noted } from "../public/js/rules.js";

const read = (s, t) => understand(s, t);
const rec = (s, t) => understand(s, t).record;
const flags = (s, t) => flagCodes(rec(s, t));
const refers = (s, t) => checkRecord(rec(s, t)).some((f) => f.severity === "refer_now");

test("adv P0: thousands written with a comma", () => {
  assert.equal(rec("weight 2,400 grams", "newborn").weight_g, 2400);
  assert.equal(rec("2,600 gram", "newborn").weight_g, 2600);
  assert.equal(rec("1,700 grams", "newborn").weight_g, 1700);
  assert.ok(!refers("Baby weight 2,400 grams, feeding well", "newborn"), "no false REFER TODAY");
});

test("adv P0: a newborn weight under 800 g is asked back, not flagged", () => {
  const r = read("Baby weight 400 grams, feeding well", "newborn");
  assert.equal(r.record.weight_g, undefined);
  assert.deepEqual(r.doubts.map((d) => [d.field, d.heard]), [["weight_g", "400"]]);
  assert.match(r.doubts[0].say_en, /400 grams/);
  assert.equal(read("weight 7 kilo 500 gram", "newborn").doubts[0].field, "weight_g");
  assert.deepEqual(read("wajan do kilo", "newborn").doubts, []);
});

test("adv P0: BP said with bata / batta / slash / upar-neeche", () => {
  const bp = (s) => { const r = rec(s, "anc"); return [r.bp_sys, r.bp_dia]; };
  assert.deepEqual(bp("BP ek sau chalis bata nabbe"), [140, 90]);
  assert.deepEqual(bp("BP ek sau chaalis batta nabbe"), [140, 90]);
  assert.deepEqual(bp("bp 120 bata 80"), [120, 80]);
  assert.deepEqual(bp("BP sau bata saath"), [100, 60]);
  assert.deepEqual(bp("bp 140 slash 90"), [140, 90]);
  assert.deepEqual(bp("BP 150 upar, 100 neeche"), [150, 100]);
  assert.deepEqual(bp("BP upar 150 neeche 100"), [150, 100]);
  assert.deepEqual(bp("BP one sixty over one ten"), [160, 110]);
  assert.deepEqual(bp("BP 140 90"), [140, 90]);
  assert.ok(flags("BP ek sau chalis bata nabbe", "anc").includes("anc_hypertension"));
});

test("adv P0: BP heard but no numbers is asked back", () => {
  assert.equal(read("BP 15090", "anc").doubts[0].field, "bp");
  assert.equal(read("BP check kiya", "pnc").doubts[0].field, "bp");
  assert.deepEqual(read("BP normal hai", "anc").doubts, []);
});

test("adv/build P1: bare khoon is not Hb, and heavy bleeding in both word orders", () => {
  const g = rec("Geeta ko teen din se khoon aa raha hai, 30 hafte", "anc");
  assert.equal(g.hb, undefined); assert.equal(g.symptoms.bleeding, true);
  assert.ok(!flagCodes(g).includes("anc_severe_anaemia"));
  const p1 = rec("bahut khoon ja raha hai, paanch pad badle", "pnc");
  assert.equal(p1.hb, undefined); assert.equal(p1.pads, 5);
  const p2 = rec("khoon zyada ja raha hai, teen pad", "pnc");
  assert.equal(p2.hb, undefined); assert.equal(p2.symptoms.heavy_bleeding, true);
  assert.ok(flagCodes(p2).includes("pnc_heavy_bleeding"));
  assert.equal(rec("usko bahut khoon ja raha hai, 7 pad", "pnc").hb, undefined);
  const p3 = rec("khoon zyada nahi ja raha, 3 pad", "pnc");
  assert.equal(p3.hb, undefined); assert.equal(p3.symptoms.heavy_bleeding, false);
  assert.equal(rec("सीमाची प्रसूती होऊन चार दिवस झाले, रक्त जास्त जातंय.", "pnc").symptoms.heavy_bleeding, true);
  // Hb still read when it is really a reading
  assert.equal(rec("khoon ki kami, hb saadhe aath", "anc").hb, 8.5);
  assert.equal(rec("खून साढ़े दस है", "anc").hb, 10.5);
});

test("build P1: a record never carries another visit type's fields", () => {
  const nb = rec("baby 5 din ka, BP 120 by 80, Hb 9, albumin 2 plus, 6 pad", "newborn");
  for (const k of ["bp_sys", "bp_dia", "hb", "albumin", "pads"]) assert.equal(nb[k], undefined, k);
  const anc = rec("Sunita, 30 hafte, temperature 101, saans 50", "anc");
  for (const k of ["temp_c", "resp_rate", "day"]) assert.equal(anc[k], undefined, k);
});

test("adv P1: past values lose to values said for now", () => {
  const a = rec("BP 140 by 90 hai, lekin pichli baar 120 by 80 tha", "anc");
  assert.deepEqual([a.bp_sys, a.bp_dia], [140, 90]);
  assert.ok(flagCodes(a).includes("anc_hypertension"));
  const b = rec("janam ke samay vajan 1700 tha, ab 2600 hai", "newborn");
  assert.equal(b.weight_g, 2600); assert.equal(b.birth_weight_g, 1700);
  assert.ok(!flagCodes(b).includes("nb_very_low_weight"));
  assert.equal(rec("bukhar 101 tha kal, aaj 99", "newborn").temp_c, 37.2);
  // a self-correction still wins
  assert.equal(rec("BP 140 by 90, nahi nahi, 150 by 100", "anc").bp_sys, 150);
});

test("adv P1: ranges take the more dangerous end", () => {
  assert.equal(rec("pad chaar se paanch", "pnc").pads, 5);
  assert.ok(flags("pad chaar se paanch", "pnc").includes("pnc_heavy_bleeding"));
  assert.equal(rec("4 ya 5 pad roz", "pnc").pads, 5);
  assert.equal(rec("4 to 5 pads a day", "pnc").pads, 5);
  assert.equal(rec("4-5 pads a day", "pnc").pads, 5);
  assert.equal(rec("Hb 7 ya 8", "anc").hb, 7);
  assert.equal(rec("wajan do ya dhai kilo", "newborn").weight_g, 2000);
});

test("adv P1: missing danger-sign phrasings", () => {
  assert.equal(rec("paani ki thaili phat gayi", "anc").symptoms.leaking_fluid, true);
  assert.equal(rec("पाणी गेलं आहे", "anc").symptoms.leaking_fluid, true);
  assert.equal(rec("chest andar ja raha hai saans lete waqt", "newborn").symptoms.chest_indrawing, true);
  assert.equal(rec("stanpan nahi kar raha", "newborn").feeding, "none");
  const j = rec("बाळाला कावीळ आहे, हात पाय पिवळे आहेत", "newborn");
  assert.equal(j.symptoms.jaundice_palms_soles, true); assert.equal(j.name, undefined, "no invented name Ahet");
  assert.equal(rec("naabhi lal hai, pus aa raha", "newborn").symptoms.cord_pus, true);
  const al = rec("BP 150 by 100, albumin plus plus", "anc");
  assert.equal(al.albumin, "2"); assert.ok(flagCodes(al).includes("anc_preeclampsia"));
  assert.equal(rec("temperature saintees point paanch", "newborn").temp_c, 37.5);
  assert.equal(rec("stan mein sujan aur dard", "pnc").symptoms.breast_problem, true);
  assert.equal(rec("सहा पूर्णांक पाच हिमोग्लोबिन", "anc").hb, 6.5);
  assert.equal(rec("naveva mahina", "anc").month, 9);
  assert.equal(rec("स्तनपान ठीक है, बुखार नहीं", "pnc").symptoms.breast_problem, undefined);
});

test("health P1: newborn difficulty breathing is its own sign and refers", () => {
  for (const s of ["saans lene mein takleef hai", "बाळाला श्वास घ्यायला त्रास होतोय", "the baby has difficulty breathing"]) {
    assert.equal(rec(s, "newborn").symptoms.difficulty_breathing, true, s);
    assert.ok(flags(s, "newborn").includes("nb_difficulty_breathing"), s);
  }
  assert.equal(rec("saans lene mein koi takleef nahi", "newborn").symptoms.difficulty_breathing, false);
});

test("adv P1: someone else's symptoms are dropped", () => {
  assert.deepEqual(flags("saas ko sir dard hai", "anc"), []);
  assert.deepEqual(flags("Usha, 28 weeks, her mother-in-law has fever, Usha is fine", "anc"), []);
  assert.equal(rec("Usha, 28 weeks, her mother-in-law has fever", "anc").name, "Usha");
  assert.deepEqual(flags("maa ko bukhar hai, baby theek hai, doodh pee raha", "newborn"), []);
  assert.deepEqual(flags("delivery ko 7 din, baby ko bukhar hai, 2 pad", "pnc"), []);
  // her own complaint is kept
  assert.ok(flags("sir mein bahut dard hai, saas ne bataya", "anc").includes("anc_headache_vision"));
});

test("adv P1: hot and cold never both; taapmaan is a reading, not hot to touch", () => {
  const r = rec("Bachche ka taapmaan 35 degree hai, bahut thanda", "newborn");
  assert.equal(r.temp_c, 35); assert.equal(r.symptoms.hot_to_touch, undefined); assert.equal(r.symptoms.cold_to_touch, true);
  assert.equal(r.name, undefined, "no invented name Bach");
  assert.deepEqual(flagCodes(r), ["nb_hypothermia"]);
  const both = rec("baby garam bhi hai aur thanda bhi lagta hai", "newborn");
  assert.ok(!(both.symptoms.hot_to_touch === true && both.symptoms.cold_to_touch === true));
});

test("adv P1: a question answered with a bare no", () => {
  assert.equal(rec("baby ko jhatke aate hain kya? nahi", "newborn").symptoms.convulsions, false);
  assert.ok(!refers("baby ko jhatke aate hain kya? nahi", "newborn"));
  assert.equal(rec("Any fits? No. Feeding well.", "newborn").symptoms.convulsions, false);
  assert.equal(rec("jhatke aate hain kya? haan", "newborn").symptoms.convulsions, true);
});

test("voice P2: a spoken name correction is a strong signal", () => {
  for (const [s, name] of [["नाम मीना नहीं रीना है", "Rina"], ["naam Meena nahi Reena hai", "Reena"], ["naav Sunita, satva mahina", "Sunita"], ["her name is Sunita, 30 weeks", "Sunita"], ["नाव सुनीता आहे", "Sunita"]]) {
    const r = read(s, "anc");
    assert.equal(r.record.name, name, s); assert.ok(r.nameScore >= 4, `${s}: score ${r.nameScore}`);
  }
});

test("adv P1: 102 F compares as exactly 102 F", () => {
  const r = rec("bukhar 102 F hai, delivery ko 4 din", "pnc");
  assert.equal(r.temp_c, 38.9); assert.equal(r.temp_f, 102);
  assert.ok(!flagCodes(r).includes("pnc_high_fever"), "above 102 F refers now, 102 itself does not");
  assert.ok(flagCodes(r).includes("pnc_fever"), "but SSBSK Form 4 fever still refers today");
  assert.ok(flagCodes({ type: "pnc", temp_c: 38.9, temp_f: 102.1 }).includes("pnc_high_fever"));
  assert.ok(flagCodes({ type: "newborn", temp_c: 37.5, temp_f: 99.5 }).includes("nb_fever"));
  assert.ok(!flagCodes({ type: "newborn", temp_c: 36, temp_f: 96.8 }).includes("nb_hypothermia"));
});

test("health P0: Sudha, postpartum BP 160/110 with headache and stomach pain, refers now", () => {
  const r = rec("Sudha, delivery ko das din hue, BP ek sau saath by ek sau das, sar mein dard, pet mein dard", "pnc");
  assert.deepEqual([r.bp_sys, r.bp_dia], [160, 110]);
  const f = checkRecord(r);
  assert.deepEqual(f.map((x) => x.code).sort(), ["pnc_abdominal_pain", "pnc_headache", "pnc_severe_hypertension"]);
  assert.equal(f[0].code, "pnc_severe_hypertension"); assert.equal(f[0].urgent, true);
  assert.deepEqual(noted(r, f), []);
});

test("adv P1: PNC BP and Hb rules", () => {
  assert.ok(flags("PNC day 5, BP 150 by 100", "pnc").includes("pnc_hypertension"));
  assert.ok(flags("PNC Hb 6, chakkar", "pnc").includes("pnc_severe_anaemia"));
  assert.equal(rec("delivery ko 5 din, Hb 10", "pnc").hb, 10);
});

test("health P1: severe-range BP in pregnancy refers now, 140/90 refers today", () => {
  const sev = (r) => checkRecord(r)[0];
  assert.equal(sev({ type: "anc", bp_sys: 170, bp_dia: 110 }).code, "anc_severe_hypertension");
  assert.equal(sev({ type: "anc", bp_sys: 160, bp_dia: 105, albumin: "1" }).code, "anc_severe_hypertension");
  assert.equal(sev({ type: "anc", bp_sys: 160, bp_dia: 105 }).urgent, true);
  assert.equal(sev({ type: "anc", bp_sys: 150, bp_dia: 112 }).code, "anc_imminent_eclampsia");
  const h = sev({ type: "anc", bp_sys: 145, bp_dia: 92 });
  assert.equal(h.code, "anc_hypertension"); assert.equal(h.urgent, false);
  assert.ok(!/4 hours/.test(h.action), "no recheck-after-4-hours for the ASHA");
  assert.ok(!flagCodes({ type: "anc", bp_sys: 159, bp_dia: 109 }).includes("anc_severe_hypertension"));
});

test("health P1: after-birth fever refers as SSBSK Form 4 says; with burning urine it is a UTI", () => {
  const f = checkRecord({ type: "pnc", temp_c: 38.5, day: 3 });
  assert.deepEqual(f.map((x) => [x.code, x.severity]), [["pnc_fever", "refer_now"]]);
  assert.deepEqual(flags("taap 101 hai, peshab mein jalan", "pnc"), ["pnc_uti"]);
  assert.deepEqual(flagCodes({ type: "pnc", symptoms: { foul_discharge: true } }), ["pnc_infection"]);
});

test("health P1: pregnancy high-risk items", () => {
  const r = rec("Lata, 36 weeks, twins, previous caesarean, age 17", "anc");
  assert.equal(r.twins, true); assert.equal(r.prev_caesarean, true); assert.equal(r.age, 17);
  assert.deepEqual(flagCodes(r), ["anc_high_risk", "anc_multiple_pregnancy"]);
  assert.equal(rec("pichli delivery mein bahut khoon gaya tha, abhi aathva mahina", "anc").prev_pph, true);
  assert.equal(rec("pichli delivery mein bahut khoon gaya tha, abhi aathva mahina", "anc").symptoms, undefined, "past bleeding is not bleeding now");
  assert.equal(rec("पिछली डिलीवरी में झटके आए थे", "anc").prev_eclampsia, true);
  assert.equal(rec("umar 38 saal, lambai 142 cm", "anc").height_cm, 142);
  assert.ok(flags("Sunita, nauva mahina, kal shaam se dard ho raha hai, chaudah ghante ho gaye", "anc").includes("anc_labour_prolonged"));
  assert.ok(flags("Joan, 33 weeks, smelly discharge", "anc").includes("anc_discharge"));
  assert.ok(flags("Varsha, saatva mahina, laghvila jaljal hote", "anc").includes("anc_burning_urine"));
  assert.ok(flags("ulti bahut ho rahi hai", "anc").includes("anc_vomiting"));
});

test("health P1: newborn diarrhoea, vomiting, weak cry and eye discharge are never silent", () => {
  const r = rec("teesra din, dast hai aur ulti bhi", "newborn");
  assert.deepEqual(flagCodes(r), ["nb_diarrhoea", "nb_vomiting"]);
  assert.ok(flags("Baby ko do din se ulti ho rahi hai aur rona kamzor hai, saatva din", "newborn").includes("nb_sepsis_signs"));
  assert.equal(rec("Baby ko do din se ulti ho rahi hai, saatva din", "newborn").day, 7, "'do din se' is how long, not the day");
  assert.ok(flags("मंगलचं बाळ बारा दिवसांचं, डोळ्यातून पू येतोय", "newborn").includes("nb_eye_discharge"));
});

test("health P2: fast breathing at exactly 60, a cool baby, late jaundice", () => {
  assert.ok(flags("breathing 60 per minute", "newborn").includes("nb_fast_breathing"));
  assert.deepEqual(flags("temperature 36 degree celsius", "newborn"), ["nb_cool"]);
  assert.deepEqual(flags("baby 20 din ka, peeliya hai", "newborn"), ["nb_jaundice_late"]);
  assert.equal(read("baby ko peeliya hai", "newborn").doubts[0].field, "day", "asks which day of life");
});

test("never silent: a symptom said present without a rule is noted", () => {
  const r = { type: "anc", symptoms: { swelling_feet: true, bleeding: false } };
  assert.deepEqual(flagCodes(r), []);
  assert.deepEqual(noted(r), [{ code: "swelling_feet", label_en: "Swelling of feet" }]);
  const j = { type: "newborn", day: 5, symptoms: { jaundice: true } };
  assert.deepEqual(noted(j).map((x) => x.code), ["jaundice"]);
  assert.deepEqual(noted({ type: "newborn", day: 1, symptoms: { jaundice: true } }), []);
  // every symptom code a rule can see is either covered by its flag or listed as noted
  for (const type of ["anc", "pnc", "newborn"]) {
    const codes = { anc: ["bleeding", "leaking_fluid", "convulsions", "severe_headache", "blurred_vision", "swelling_face_hands", "fever", "breathless", "abdominal_pain", "vomiting", "dizziness", "burning_urine", "foul_discharge"], pnc: ["heavy_bleeding", "fever", "foul_discharge", "convulsions", "blurred_vision", "abnormal_speech", "breathless", "abdominal_pain", "burning_urine", "swelling_face_hands", "breast_problem", "dizziness", "severe_headache", "jaundice", "incontinence", "pallor"], newborn: ["convulsions", "chest_indrawing", "lethargy", "jaundice_palms_soles", "blood_stool", "cord_pus", "skin_pustules", "eye_discharge", "cold_to_touch", "hot_to_touch", "weak_cry", "vomiting", "diarrhoea", "difficulty_breathing"] }[type];
    for (const c of codes) { const one = { type, symptoms: { [c]: true } }; assert.ok(checkRecord(one).length > 0 && noted(one).length === 0, `${type}.${c} fires a flag`); }
  }
});
