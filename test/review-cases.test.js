// Known failure cases from two rounds of internal review of the reader and the rules.
// Each sentence that once failed is a test. Labels: adv (adversarial phrasing), health
// (guideline coverage), build, voice (spoken-flow details); "r2" marks the second round.
import test from "node:test";
import assert from "node:assert/strict";
import { understand, merge } from "../public/js/understand.js";
import { flagCodes, checkRecord, noted, RULE_TABLE, groupFlags, askExtra, ASK_PROMPTS } from "../public/js/rules.js";

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
  const anc = rec("Sunita, 30 hafte, saans 50, 5 din ka", "anc");
  for (const k of ["resp_rate", "day", "weight_g"]) assert.equal(anc[k], undefined, k);
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

/* ---------------- second round ---------------- */

test("r2 health P1: after-birth headache, blurred vision and breathlessness are urgent", () => {
  for (const [s, code] of [["Day 4 after delivery, she has a severe headache", "pnc_headache"], ["delivery ko 3 din, aankhon ke aage dhundhla dikhta hai", "pnc_neuro"], ["delivery ko 5 din, saans phool rahi hai", "pnc_breathless"]]) {
    const f = checkRecord(rec(s, "pnc")).find((x) => x.code === code);
    assert.ok(f, `${s}: ${code}`); assert.equal(f.urgent, true, code); assert.match(f.action, /108/);
  }
});

test("r2 health P1: a temperature in pregnancy is read; high fever is urgent, lower fever refers today", () => {
  const r = rec("Sunita saat mahine ki, temperature 103", "anc");
  assert.equal(r.temp_f, 103); assert.equal(r.temp_c, 39.4);
  const hi = checkRecord(r)[0]; assert.equal(hi.code, "anc_high_fever"); assert.equal(hi.urgent, true);
  assert.deepEqual(flags("aathva mahina, tez bukhar hai", "anc"), ["anc_high_fever"]);
  const mid = checkRecord(rec("aathva mahina, bukhar 100.5 hai", "anc"));
  assert.deepEqual(mid.map((x) => [x.code, x.urgent]), [["anc_fever", false]]);
  assert.deepEqual(flags("aathva mahina, temperature 99.6", "anc"), ["anc_low_fever"]);
});

test("r2 health P1: a number after temperature/bukhar/taap is never silently dropped, for any visit type", () => {
  for (const type of ["anc", "pnc", "newborn"]) {
    assert.equal(rec("temperature 101", type).temp_f, 101, type);
    assert.equal(rec("taap 38.6", type).temp_c, 38.6, type);
    const odd = read("temperature 120 hai", type);
    assert.equal(odd.record.temp_c, undefined, type);
    assert.equal(odd.doubts.find((d) => d.field === "temp")?.heard, "120", type);
  }
  assert.deepEqual(read("bukhar 3 din se hai", "pnc").doubts, [], "how long, not a reading");
});

test("r2 health P1: more high-risk pregnancy items", () => {
  const r = rec("pichli baar bachcha mara hua paida hua tha, sugar hai", "anc");
  assert.equal(r.prev_stillbirth, true); assert.equal(r.diabetes, true);
  assert.deepEqual(flagCodes(r), ["anc_high_risk"]);
  const h = rec("Rh negative hai, HIV negative, dil ki bimari hai", "anc");
  assert.equal(h.rh_negative, true); assert.equal(h.hiv_syphilis, false); assert.equal(h.heart_disease, true);
  assert.equal(rec("HIV positive hai", "anc").hiv_syphilis, true);
  assert.equal(rec("albumin negative", "anc").rh_negative, undefined);
  assert.equal(rec("5 bachche pehle se hain", "anc").previous_births, 5);
  assert.ok(flags("5 bachche pehle se hain", "anc").includes("anc_high_risk"));
  assert.equal(rec("chautha bachcha hai", "anc").previous_births, 3);
  assert.equal(rec("pichla bachcha samay se pehle hua tha", "anc").prev_preterm, true);
  assert.ok(flags("9 mahina, bachcha ulta hai", "anc").includes("anc_malpresentation"));
  assert.ok(!flags("6 mahina, bachcha ulta hai", "anc").includes("anc_malpresentation"));
  assert.equal(rec("Td ke dono teeke lag gaye", "anc").td_doses, 2);
  assert.equal(rec("Td ke dono teeke lag gaye", "anc").name, undefined);
  assert.equal(rec("height 4 feet 8 inch", "anc").height_cm, 142);
});

test("r2 health P1: labour pains before 37 weeks are urgent", () => {
  const f = checkRecord(rec("aathva mahina, labour pain shuru ho gaya", "anc"));
  assert.equal(f[0].code, "anc_preterm_labour"); assert.equal(f[0].urgent, true);
  assert.deepEqual(flags("39 hafte, labour pain shuru ho gaya", "anc"), ["anc_labour"]);
  assert.ok(!flags("aathva mahina, labour pain shuru ho gaya", "anc").includes("anc_abdominal_pain"));
});

test("r2 health P1: preterm newborn, swollen belly, calf pain, low mood, infected stitches", () => {
  const p = rec("34 hafte mein paida hua, paanch din ka", "newborn");
  assert.equal(p.weeks_at_birth, 34); assert.equal(p.preterm, true); assert.deepEqual(flagCodes(p), ["nb_preterm"]);
  assert.equal(rec("samay se pehle paida hua, teen din", "newborn").preterm, true);
  assert.deepEqual(flags("pet phula hua hai", "newborn"), ["nb_abdominal_distension"]);
  const two = checkRecord(rec("Baby chhatha din, pet phula hua hai aur doodh kam pee raha hai", "newborn"));
  assert.equal(two[0].code, "nb_sepsis_signs"); assert.match(two[0].why, /feeding less and vomiting or swollen belly/);
  assert.deepEqual(flags("pindli mein dard aur sujan", "pnc"), ["pnc_calf_pain"]);
  assert.deepEqual(flags("bahut udaas rehti hai", "pnc"), ["pnc_low_mood"]);
  assert.deepEqual(flags("tanke mein pus hai", "pnc"), ["pnc_wound_infection"]);
  assert.equal(rec("ghar par delivery hui thi, 2 din ka", "newborn").birth_place, "home");
});

test("r2 adv P1: everyday phrasings of danger signs", () => {
  const cases = [
    ["baby ko daure pad rahe hain", "newborn", "nb_convulsions"],
    ["baby akad jaata hai, aankhen upar chadh jaati hain", "newborn", "nb_convulsions"],
    ["baby ko saans lene mein taklif hai", "newborn", "nb_difficulty_breathing"],
    ["saans lene mein dikkat ho rahi hai", "newborn", "nb_difficulty_breathing"],
    ["baby bilkul nahi hil raha", "newborn", "nb_lethargy"],
    ["baby hil hi nahi raha", "newborn", "nb_lethargy"],
    ["navel is red and swollen with pus", "newborn", "nb_cord_infection"],
    ["the umbilicus smells", "newborn", "nb_cord_infection"],
    ["bachcha ghoom nahi raha pet mein", "anc", "anc_fetal_movement"],
    ["pad bheeg jaata hai ghante mein", "pnc", "pnc_heavy_bleeding"],
    ["peshab rok nahi paati", "pnc", "pnc_incontinence"],
  ];
  for (const [s, t, code] of cases) assert.ok(flags(s, t).includes(code), `${s} -> ${code}`);
});

test("r2 adv P1: the subject depends on the visit type", () => {
  assert.deepEqual(flags("baby ki maa ko bukhar hai, baby theek hai", "newborn"), []);
  assert.deepEqual(flags("baby ki dadi ko bukhar hai", "newborn"), []);
  assert.deepEqual(flags("uski behen ko jhatke aate hain", "anc"), []);
  assert.deepEqual(flags("bachche ko bukhar hai", "anc"), []);
  const r = rec("baby ka temperature 38, maa theek", "pnc");
  assert.equal(r.temp_c, undefined); assert.deepEqual(flagCodes(r), []);
  // the patient's own complaints are kept
  assert.ok(flags("baby ki maa ko bukhar hai", "pnc").includes("pnc_fever"));
  assert.ok(flags("baby ko bukhar hai", "newborn").includes("nb_fever"));
});

test("r2 adv P1: denials, tests and transfusions are not bleeding; lists are negated", () => {
  assert.deepEqual(flags("khoon ki jaanch hui, Hb 11", "anc"), []);
  assert.deepEqual(flags("she denies bleeding", "anc"), []);
  const r = rec("Patient has no complaints of headache or blurring of vision", "anc");
  assert.equal(r.symptoms.blurred_vision, false); assert.equal(r.symptoms.severe_headache, false);
  assert.equal(rec("pichli delivery mein khoon chadhaya tha", "anc").prev_aph, undefined);
  assert.equal(rec("pichli delivery mein khoon chadhaya tha", "anc").prev_pph, undefined);
});

test("r2 adv P1: mild pain is asked about, not referred", () => {
  for (const [s, code, q] of [["sir mein halka dard", "severe_headache", /headache severe/], ["pet mein halka dard", "abdominal_pain", /stomach pain severe/]]) {
    const r = read(s, "anc");
    assert.deepEqual(flagCodes(r.record), [], s);
    const d = r.doubts.find((x) => x.field === "severity");
    assert.equal(d.code, code); assert.match(d.say_en, q);
  }
  assert.ok(flags("sir mein bahut tez dard", "anc").includes("anc_headache_vision"));
});

test("r2 adv P1: diastolic at or above systolic is asked back", () => {
  const r = read("BP 100/140", "anc");
  assert.equal(r.record.bp_sys, undefined);
  assert.deepEqual([r.doubts[0].field, r.doubts[0].heard], ["bp", "100/140"]);
});

test("r2 adv P2: numbers, units and names", () => {
  assert.equal(rec("बाळाचे वजन अठराशे ग्रॅम", "newborn").weight_g, 1800);
  assert.equal(rec("hemoglobin saade chhe", "anc").hb, 6.5);
  assert.equal(rec("डोळ्यासमोर अंधारी येते", "anc").symptoms.dizziness, true);
  assert.equal(rec("धुंधला दिखता है", "anc").name, undefined);
  assert.equal(rec("हाताला सूज आहे", "anc").name, undefined);
});

test("r2: a clause about the body that filled nothing is returned as unread", () => {
  const u = read("baby ki naabhi kuch ajeeb si hai", "newborn").unread;
  assert.equal(u.length, 1); assert.match(u[0].text, /naabhi/);
  assert.deepEqual(read("Sunita ka baby, saat din ka, doodh achha pee raha", "newborn").unread, []);
});

test("r2 copy: one name for the newborn unit, and every urgent newborn action says what to do on the way", () => {
  for (const r of RULE_TABLE.filter((x) => x.type === "newborn")) {
    if (/newborn unit/.test(r.action)) assert.match(r.action, /newborn unit \(SNCU\)/, r.code);
    if (r.urgent) assert.match(r.action, /skin to skin and warm/, r.code);
    assert.ok(!/NBSU or SNCU|the SNCU now/.test(r.action), r.code);
  }
  assert.equal(RULE_TABLE.find((r) => r.code === "nb_fast_breathing").threshold, "Breathing 60 or more a minute");
  assert.match(RULE_TABLE.find((r) => r.code === "nb_sepsis_signs").action, /^Take the baby to the newborn unit \(SNCU\) now. Call 108./);
});

/* ---------------- gaps found by the independent adversarial set (run 1) ---------------- */

test("adv-set: the named mother's own complaint is not the baby's, in Hindi and Marathi", () => {
  assert.deepEqual(flags("मीना के बच्चे का तीसरा दिन है। मीना को कल रात से बुखार है, बच्चा ठीक है।", "newborn"), []);
  assert.deepEqual(flags("Jyoti chya balachi bhet, pachva divas. Jyotila khup taap ahe, pan bal theek ahe.", "newborn"), []);
  // in her own visit the named woman is the patient
  assert.equal(rec("रेशमा, पाँचवाँ महीना। उसके बच्चे को कल से बुखार है, रेशमा को बुखार नहीं।", "anc").symptoms.fever, false);
});

test("adv-set: a sibling's or relative's illness carries over 'aur', the patient's own clause does not", () => {
  assert.deepEqual(flags("Uski badi beti ko teen din se bukhar aur ulti hai. Naye baby ko koi dikkat nahi.", "newborn"), []);
  assert.deepEqual(flags("तिच्या बहिणीला पण फिट येतात", "anc"), []);
  assert.ok(flags("आईला ताप नाही, बाळाला थोडा ताप आहे, आईच्या स्तनाला सूज आहे", "pnc").includes("pnc_breast"));
  assert.ok(flags("दीदी, बच्चे की हलचल बिल्कुल बंद है सुबह से, पेट में तेज़ दर्द भी है", "anc").includes("anc_abdominal_pain"));
});

test("adv-set: English said in Devanagari letters", () => {
  const r = rec("सरिता का बेबी, डे सेवन। वेट दो पॉइंट दो किलो, टेम्परेचर नाइंटी सेवन पॉइंट फ़ाइव फ़ारेनहाइट। फीडिंग ठीक है, नो वोमिटिंग।", "newborn");
  assert.deepEqual([r.day, r.weight_g, r.temp_f, r.feeding, r.symptoms.vomiting], [7, 2200, 97.5, "good", false]);
  const p = rec("प्रिया, PNC डे फ़ोर्टी, बीपी वन थर्टी बाय एटी फ़ाइव, एचबी टेन पॉइंट टू।", "pnc");
  assert.deepEqual([p.day, p.bp_sys, p.bp_dia, p.hb], [40, 130, 85, 10.2]);
});

test("adv-set: more number words and units", () => {
  assert.equal(rec("ek minute mein chhiyasath saans", "newborn").resp_rate, 66);
  assert.deepEqual([rec("BP ek sau bayalis by atthasi", "pnc").bp_sys, rec("BP ek sau bayalis by atthasi", "pnc").bp_dia], [142, 88]);
  assert.equal(rec("BP ekshe saath bay navvad", "anc").bp_dia, 90);
  assert.equal(rec("Vajan teen kilo teen she gram", "newborn").weight_g, 3300);
  assert.equal(rec("Ek kilo saadhe saat sau gram vajan", "newborn").weight_g, 1750);
  assert.equal(rec("Laxmi ka bachcha chhathe din ka hai", "newborn").day, 6);
  assert.equal(rec("Dhanashri cha bal, ekvisava divas", "newborn").day, 21);
  assert.equal(rec("Baby of Nisha, 12 days old. Loose motions since two days.", "newborn").day, 12);
  assert.equal(rec("राधा, डिलीवरी को नौ दिन, एक दिन में चार पैड", "pnc").day, 9);
  assert.equal(rec("Vajan pandrah sau gram hai, janam ke samay satrah sau tha", "newborn").birth_weight_g, 1700);
});

test("adv-set: everyday phrasings, round 3", () => {
  assert.equal(rec("Rona bahut dheema hai", "newborn").symptoms.weak_cry, true);
  assert.equal(rec("radna halu ahe", "newborn").symptoms.weak_cry, true);
  assert.equal(rec("रोना तेज़ है, कमज़ोर नहीं", "newborn").symptoms.weak_cry, false);
  assert.equal(rec("Aankh se peela chipchipa paani aa raha hai", "newborn").symptoms.eye_discharge, true);
  assert.equal(rec("Aankh se peela chipchipa paani aa raha hai", "newborn").symptoms.jaundice, undefined);
  assert.equal(rec("pet pe chhote chhote pus wale daane hain", "newborn").symptoms.skin_pustules, true);
  assert.equal(rec("No jaundice, no pustules on skin", "newborn").symptoms.skin_pustules, false);
  assert.equal(rec("Tichya dolyat ani angavar pivlepana disto", "newborn").symptoms.jaundice, true);
  assert.equal(rec("Maine poocha jhatke aate hain? Bola nahi.", "newborn").symptoms.convulsions, false);
  assert.equal(rec("Thoda thoda raktasrav hotoy", "anc").symptoms.bleeding, true);
  assert.equal(rec("complains of burning while passing urine", "anc").symptoms.burning_urine, true);
  assert.equal(rec("urine pass kartana burning hote", "pnc").symptoms.burning_urine, true);
  assert.equal(rec("aankhon se saaf dikhta hai", "anc").symptoms.blurred_vision, false);
  assert.equal(rec("Breasts soft, no pain", "pnc").symptoms.breast_problem, false);
  assert.equal(rec("delivery ke doosre din aankhen upar chadh gayi aur haath pair akad gaye", "pnc").symptoms.convulsions, true);
  assert.equal(rec("talking irrelevant, not making sense since morning", "pnc").symptoms.abnormal_speech, true);
  assert.equal(rec("laghvi thambavta yet nahi", "pnc").symptoms.incontinence, true);
  assert.equal(rec("No complaints of fever, bleeding or burning urine", "pnc").symptoms.heavy_bleeding, false);
  assert.equal(rec("Feels a bit giddy sometimes", "anc").symptoms.dizziness, true);
  assert.equal(rec("Fetal movements present and normal", "anc").fetal_movement, "normal");
});

test("adv-set: names from cue phrases", () => {
  assert.equal(rec("Day 3 visit for baby of Geeta", "newborn").name, "Geeta");
  assert.equal(rec("Registration visit for Mariam, 14 weeks", "anc").name, "Mariam");
  assert.equal(rec("Asha naam ki mahila hai, chhatha mahina", "anc").name, "Asha");
  assert.equal(rec("सोनाली, वय सतरा वर्षे, सातवा महिना", "anc").name, "Sonali");
  assert.equal(rec("Called from home: Neha, full term", "anc").name, "Neha");
  assert.equal(rec("Baby of Archana, day 5. Mother says baby is struggling to breathe", "newborn").name, "Archana");
  assert.equal(rec("तारा को अभी दौरा पड़ा, मुँह से झाग, नौवाँ महीना है", "anc").name, "Tara");
});

/* ---------------- fourth review round and the second independent set ---------------- */

test("r4 P0: English negation before feeding, and sleepy babies", () => {
  const r = rec("baby doesn't feed well and is very sleepy", "newborn");
  assert.equal(r.feeding, "poor"); assert.equal(r.symptoms.lethargy, true);
  assert.equal(rec("baby doesnt feed well", "newborn").feeding, "poor");
  assert.equal(rec("baby does not feed at all", "newborn").feeding, "none");
  assert.equal(rec("baby can't suck", "newborn").feeding, "none");
  assert.equal(rec("baby is not feeding well", "newborn").feeding, "poor");
  assert.equal(rec("baby feeding theek nahi hai", "newborn").feeding, "poor");
  for (const s of ["baby unconscious hai", "now sleeping a lot", "baby uthta nahi", "hard to wake", "बच्चा बेहोश है"]) assert.equal(rec(s, "newborn").symptoms?.lethargy, true, s);
});

test("r4: a fever said with a reading still refers", () => {
  for (const [s, t, code] of [["bukhar hai, 100 degree", "pnc", "pnc_fever"], ["ताप आहे, शंभर डिग्री", "pnc", "pnc_fever"], ["bukhar hai, 100 degree", "anc", "anc_fever"], ["bukhar hai 99", "anc", "anc_fever"], ["she has fever of 100 F", "pnc", "pnc_fever"]]) {
    const f = flags(s, t);
    assert.ok(f.includes(code), `${s} -> ${f}`); assert.ok(!f.some((x) => x.endsWith("low_fever")), s);
  }
  // for the baby a normal reading beats "garam"
  assert.deepEqual(flags("baby garam hai lekin temperature 36.8", "newborn"), []);
});

test("r4: Fahrenheit corrections keep the unit; a correction is not a denial", () => {
  const a = rec("temperature 99 F, nahi 101", "pnc"); assert.deepEqual([a.temp_f, a.temp_c], [101, 38.3]);
  const b = rec("temperature 98.6 F nahi nahi 100.6 F", "pnc"); assert.deepEqual([b.temp_f, b.temp_c], [100.6, 38.1]);
  const c = rec("bukhar 100, nahi nahi 101.4", "anc"); assert.equal(c.temp_f, 101.4); assert.ok(flagCodes(c).includes("anc_high_fever"));
  const d = rec("bukhar 101 nahi nahi 102.4", "pnc"); assert.equal(d.symptoms.fever, true); assert.ok(flagCodes(d).includes("pnc_high_fever"));
});

test("r4: general patterns", () => {
  assert.equal(rec("bachcha peela pad gaya hai, haath pair tak", "newborn").symptoms.jaundice_palms_soles, true);
  assert.equal(rec("yellow upto the palms n soles", "newborn").symptoms.jaundice_palms_soles, true);
  const sw = rec("legs swollen, sees spots", "anc"); assert.equal(sw.symptoms.swelling_feet, true); assert.equal(sw.symptoms.blurred_vision, true);
  assert.equal(rec("baby has fast breathing and grunting", "newborn").symptoms.difficulty_breathing, true);
  assert.equal(rec("saans tez chal rahi hai", "newborn").symptoms.difficulty_breathing, true);
  assert.equal(rec("breathing fast counted 72 in one min", "newborn").symptoms?.difficulty_breathing, undefined, "a count is the sign");
  assert.equal(rec("baby ki naabhi se khoon aa raha hai", "newborn").symptoms.cord_pus, true);
  assert.equal(rec("khoon ke thakke aa rahe hain", "pnc").symptoms.heavy_bleeding, true);
  assert.equal(rec("she fainted twice", "pnc").symptoms.dizziness, true);
  assert.equal(rec("baby's lips are blue", "newborn").symptoms.cyanosis, true);
  assert.equal(rec("honth neele se lag rahe", "newborn").symptoms.cyanosis, true);
  assert.equal(rec("उसे बोलने में दिक्कत है", "pnc").symptoms.abnormal_speech, true);
  assert.equal(rec("zubaan ladkhadaa rahi", "pnc").symptoms.abnormal_speech, true);
  assert.equal(rec("badbudaar safed paani aa raha hai", "pnc").symptoms.foul_discharge, true);
});

test("r4: never silent - a clause that filled nothing is unread", () => {
  assert.deepEqual(read("baby ki dhadkan nahi mil rahi", "anc").unread.map((u) => u.text), ["baby ki dhadkan nahi mil rahi"]);
  assert.deepEqual(read("Rekha ke ghar gayi thi, sab theek hai", "newborn").unread, []);
  for (const [s, t] of [["baby's lips are blue", "newborn"], ["baby is grunting", "newborn"], ["badbudaar safed paani aa raha hai", "pnc"]]) {
    const r = read(s, t);
    assert.ok(checkRecord(r.record).length + noted(r.record).length + r.unread.length > 0, s);
  }
});

test("r4 clinical: anaemia after birth, mood, self-harm, pallor in pregnancy, blue lips", () => {
  const sev = checkRecord({ type: "pnc", hb: 5 })[0]; assert.equal(sev.code, "pnc_severe_anaemia"); assert.equal(sev.urgent, true);
  assert.deepEqual(flagCodes({ type: "pnc", hb: 7.5 }), ["pnc_low_hb"]);
  assert.deepEqual(flagCodes({ type: "pnc", hb: 8 }), ["pnc_moderate_anaemia"]);
  assert.deepEqual(flagCodes({ type: "pnc", hb: 12 }), []);
  assert.deepEqual(flagCodes({ type: "pnc", symptoms: { dizziness: true } }), ["pnc_anaemia_signs"]);
  assert.equal(checkRecord({ type: "pnc", symptoms: { low_mood: true } })[0].severity, "refer_now");
  const sh = checkRecord(rec("khud ko nuksan pahunchane ki baat karti hai", "pnc"))[0];
  assert.equal(sh.code, "pnc_self_harm"); assert.equal(sh.urgent, true); assert.match(sh.action, /14416/);
  assert.equal(rec("jeena nahi chahti", "pnc").symptoms.self_harm, true);
  assert.equal(rec("baby ko nuksan pahuncha degi aisa bolti hai", "pnc").symptoms.self_harm, true, "about the baby, still her own words");
  assert.deepEqual(flagCodes({ type: "anc", symptoms: { pallor: true } }), ["anc_pallor"]);
  const pb = checkRecord(rec("aankhon ki palak safed hai, saans phoolti hai", "anc"))[0]; assert.equal(pb.code, "anc_anaemia_breathless"); assert.equal(pb.urgent, true);
  assert.equal(checkRecord({ type: "newborn", symptoms: { cyanosis: true } })[0].urgent, true);
});

test("r4: where / onTheWay / groupFlags", () => {
  for (const r of RULE_TABLE) { assert.ok(r.where && r.where.length > 3, r.code); assert.ok(r.onTheWay === null || r.onTheWay.length > 10, r.code); assert.ok(!/\bANM\b(?! )/.test(r.action.replace(/nurse \(ANM\)/g, "")), `${r.code}: say "nurse (ANM)"`); }
  const g = groupFlags(checkRecord({ type: "newborn", weight_g: 1700, feeding: "poor", symptoms: { chest_indrawing: true } }));
  assert.equal(g.length, 1); assert.equal(g[0].where, "Newborn unit (SNCU) now, call 108"); assert.equal(g[0].urgent, true);
  assert.match(g[0].onTheWay, /mother-and-child card \(MCP card\)/);
  assert.deepEqual(g[0].flags.map((f) => f.code), ["nb_chest_indrawing", "nb_very_low_weight", "nb_sepsis_signs", "nb_poor_feeding"]);
  const w = groupFlags(checkRecord({ type: "anc", hb: 9, symptoms: { vomiting: true } }));
  assert.deepEqual(w.map((x) => [x.where, x.urgent, x.flags.length]), [["Iron tablets; tell the nurse (ANM)", false, 1], ["Tell the nurse (ANM) today", false, 1]]);
  assert.deepEqual(groupFlags([]), []);
});

test("adv2 set: unpunctuated clinical English", () => {
  const a = rec("day 3 visit kavitas baby wt 2.1kg today birth wt was 2.4kg baby doesnt feed well sucks for a minute and lets go temp 36.9C no chest indrawing", "newborn");
  assert.deepEqual([a.name, a.weight_g, a.birth_weight_g, a.feeding, a.temp_c, a.symptoms.chest_indrawing], ["Kavita", 2100, 2400, "poor", 36.9, false]);
  const b = rec("day 1 baby born at PHC premature at 34 wks birth weight 1.75kg mother has fever 101F baby temp 36.2C", "newborn");
  assert.equal(b.temp_c, 36.2, "the mother's 101F is not the baby's");
  assert.equal(rec("baby day 10 no complaints of loose motions or vomiting no blood in stool sucking well temp 37.1", "newborn").feeding, "good");
  const c = rec("Lakshmi 32 wks c/o severe headache x 2 days denies blurring of vision", "anc");
  assert.equal(c.symptoms.severe_headache, true); assert.equal(c.symptoms.blurred_vision, false);
  assert.equal(rec("8th month, patient denies headache but complains of blurring of vision", "anc").symptoms.blurred_vision, true);
  assert.equal(rec("39 wks labour pains since 15 hrs water not broken yet", "anc").symptoms.labour_pain, true);
  assert.equal(rec("35 weeks c/o clear watery fluid leaking PV since morning wetting her clothes no pains", "anc").symptoms.leaking_fluid, true);
  const d = rec("20 wks known diabetic on insulin Rh negative vomiting 4-5 times daily cant keep food down", "anc");
  assert.equal(d.diabetes, true); assert.equal(d.symptoms.vomiting, true);
  const e = rec("ANC visit Shabana 24 weeks BP 110/70 Hb 11.6 wt 61kg FM good no h/o fits in previous pregnancy no bleeding PV IFA 30 tabs given both TT done", "anc");
  assert.deepEqual([e.fetal_movement, e.ifa_tablets, e.td_doses, e.symptoms.bleeding, e.symptoms.convulsions], ["normal", 30, 2, false, false]);
  assert.equal(rec("Saroj 28 hafte khoon ki jaanch mein Hb 11.2 baby ki halchal theek pairon me sujan nahi", "anc").fetal_movement, "normal");
  const f = rec("bachhe ko 38.2 bukhar hai maa ko koi taklif nahi maa ka BP 130/84 15va din", "pnc");
  assert.equal(f.temp_c, undefined); assert.equal(f.day, 15); assert.deepEqual(flagCodes(f), []);
  assert.equal(rec("day 20 she feels low crying all the time no interest in the baby. baby has jaundice", "pnc").symptoms.low_mood, true);
  assert.equal(rec("Geeta 38 yrs G5 with 4 children already 36 weeks breech", "anc").age, 38);
  assert.equal(rec("Pinki 17 saal ki hai pehla bacha paanchva mahina", "anc").previous_births, 0);
  assert.equal(rec("9va mahina dard shuru ho gaye 5 ghante se bachha ulta hai", "anc").month, 9);
  assert.equal(rec("Sushma baalantpanache 14 divas Hb 11.4 divsatun 2 pad", "pnc").day, 14);
  assert.equal(rec("day 10 she fainted twice", "pnc").day, 10, "English 'she' is not Marathi 'she' (hundred)");
});

/* ---------------- sixth review round ---------------- */

test("r6 P0: a present 'not feeding' beats an earlier 'used to feed', also across sentences", () => {
  for (const s of ["bachcha doodh nahi pee raha, pehle peeta tha", "doodh nahi pee raha, pehle theek peeta tha", "doodh nahi pee raha. pehle peeta tha."]) assert.equal(rec(s, "newborn").feeding, "none", s);
  const m = merge(read("Rekha ka baby doodh nahi pee raha", "newborn"), read("pehle theek peeta tha", "newborn"));
  assert.equal(m.record.feeding, "none"); assert.ok(flagCodes(m.record).includes("nb_not_feeding"));
});

test("r6: today's pads and fever beat yesterday's", () => {
  assert.equal(rec("pad 5 tha kal, aaj 2", "pnc").pads, 2);
  assert.equal(rec("pad kal 6 the, aaj 3", "pnc").pads, 3);
  assert.deepEqual(flags("pad 5 tha kal, aaj 2", "pnc"), []);
  const r = rec("baby ko bukhar tha kal, aaj nahi hai", "newborn");
  assert.notEqual(r.symptoms?.hot_to_touch, true); assert.deepEqual(flagCodes(r), []);
});

test("r6 P0: self-harm in everyday Hindi and Marathi", () => {
  for (const s of ["usne kaha ki khud ko khatam kar legi", "khudkushi ki baat karti hai", "marne ki baat karti hai", "आत्महत्येचे विचार येतात", "usko lagta hai mar jaaun, bahut udaas rehti hai", "kehti hai jaan de degi", "फाशी घेईन असं म्हणते", "she says she wants to end her life"]) {
    const r = rec(s, "pnc");
    assert.equal(r.symptoms?.self_harm, true, s); assert.ok(flagCodes(r).includes("pnc_self_harm"), s);
    assert.equal(r.name, undefined, `${s}: no name from the words`);
  }
  assert.equal(rec("आत्महत्या करण्याचे विचार", "pnc").name, undefined);
});

test("r6: a relative's reading is not the patient's", () => {
  assert.deepEqual(flags("uski saas ko BP hai 170/110", "anc"), []);
  const r = rec("BP 120/80, uski saas ka BP 170/110", "anc"); assert.deepEqual([r.bp_sys, r.bp_dia], [120, 80]);
  assert.deepEqual([rec("BP 120/80. Saas ka BP 170/110.", "anc").bp_sys], [120]);
  const m = merge(read("BP 120 by 80", "anc"), read("uski saas ka BP 170 by 110 hai", "anc"));
  assert.equal(m.record.bp_sys, 120);
  assert.equal(rec("maa ka temperature 38.5 hai, baby ka 37", "newborn").temp_c, 37);
  assert.equal(rec("Saasu maa ko bukhar hai, baby theek hai, 6 din ka", "newborn").name, undefined);
});

test("r6: bare khoon in pregnancy is bleeding; high fever words; a bare 103 after bukhar", () => {
  assert.ok(flags("पेट में तेज़ दर्द और खून", "anc").includes("anc_bleeding"));
  assert.ok(flags("dard aur khoon", "anc").includes("anc_bleeding"));
  assert.ok(!flags("khoon ki jaanch hui, Hb 11", "anc").includes("anc_bleeding"));
  assert.ok(!flags("पूनम, छत्तीस हफ्ते, खून साढ़े आठ है", "anc").includes("anc_bleeding"));
  const f = rec("kal raat se tez bukhar, 103", "pnc"); assert.equal(f.temp_f, 103); assert.ok(flagCodes(f).includes("pnc_high_fever"));
  assert.ok(flags("tez bukhar hai", "pnc").includes("pnc_high_fever"));
  assert.equal(rec("bukhar hai kya? haan, 101", "pnc").temp_f, 101);
  assert.equal(rec("pad do teen badalti hai", "pnc").pads, 3);
  assert.equal(rec("BP eksau chalis by nabbe", "anc").bp_sys, 140);
  assert.ok(flags("Meena aathva mahina, paani gir gaya kal raat se", "anc").includes("anc_leaking"));
});

test("r6: after birth a bare khoon asks whether the bleeding is heavy", () => {
  const ask = (s) => read(s, "pnc").doubts.filter((d) => d.field === "severity").map((d) => d.code);
  assert.deepEqual(ask("dard aur khoon aa raha hai"), ["heavy_bleeding"]);
  assert.deepEqual(flags("dard aur khoon aa raha hai", "pnc"), []);
  for (const s of ["khoon nahi ja raha", "khoon aa raha hai, teen pad", "saas ko khoon aa raha hai", "Hb 9, khoon ki kami"]) assert.deepEqual(ask(s), [], s);
});

test("r6 clinical: newborn weight trend", () => {
  const stable = checkRecord({ type: "newborn", day: 21, birth_weight_g: 1600, weight_g: 1750, feeding: "good" });
  assert.deepEqual(stable.map((f) => [f.code, f.urgent]), [["nb_very_low_weight_gaining", false], ["nb_at_risk_birth_weight", false], ["nb_low_weight", false]].filter(([c]) => stable.some((x) => x.code === c)));
  assert.ok(!stable.some((f) => f.urgent), "a gaining KMC baby is not sent by 108");
  assert.equal(checkRecord({ type: "newborn", weight_g: 1700 })[0].code, "nb_very_low_weight");
  assert.equal(checkRecord({ type: "newborn", weight_g: 1650, prev_weight_g: 1700 })[0].urgent, true, "falling");
  assert.ok(flagCodes({ type: "newborn", day: 14, birth_weight_g: 3000, weight_g: 2600 }).includes("nb_not_regained"));
  assert.ok(flagCodes({ type: "newborn", day: 5, birth_weight_g: 3000, weight_g: 2600 }).includes("nb_weight_loss"));
  assert.deepEqual(askExtra({ type: "newborn", weight_g: 2600, day: 5 }).map((a) => a.field), ["birth_weight_g"]);
});

test("r6 clinical: pregnancy stomach pain, jaundice, upper-stomach pain with BP, pulse", () => {
  const ab = checkRecord({ type: "anc", symptoms: { abdominal_pain: true } })[0];
  assert.equal(ab.urgent, true); assert.match(ab.where, /FRU/);
  assert.deepEqual(flags("aankhein peeli hain, saatva mahina", "anc"), ["anc_jaundice"]);
  assert.ok(flags("upar pet mein dard hai, BP 150/100", "anc").includes("anc_headache_vision"));
  assert.ok(flags("pulse 104 hai", "anc").includes("anc_pulse"));
  assert.deepEqual(flagCodes({ type: "pnc", hb: 11.5 }), ["pnc_mild_anaemia"]);
  assert.deepEqual(flagCodes({ type: "pnc", hb: 9 }), ["pnc_moderate_anaemia"]);
});

test("r6: a BP read off the card asks whether she was seen instead of sending her by 108", () => {
  const r = rec("BP 160/110 card par likha hai, 15 tarikh ka", "anc");
  assert.equal(r.bp_source, "card"); assert.equal(r.bp_date, "15 tarikh");
  const f = checkRecord(r)[0];
  assert.equal(f.urgent, false); assert.equal(f.fromCard, true); assert.match(f.action, /card shows severe BP from 15 tarikh: has she been seen/);
  const t = rec("ANM ne aaj BP liya 160/110", "anc"); assert.equal(t.bp_source, "today"); assert.equal(checkRecord(t)[0].urgent, true);
  assert.equal(checkRecord(rec("BP 160/110", "anc"))[0].urgent, true, "unspecified stays as before");
  assert.match(ASK_PROMPTS.anc.bp.en, /card/);
});

test("r6: Roman-script spoken lines for every rule", () => {
  const DEV = new RegExp("[" + String.fromCharCode(0x900) + "-" + String.fromCharCode(0x97f) + "]");
  for (const r of RULE_TABLE) {
    for (const l of ["hi", "mr"]) { assert.ok(r.sayRoman[l].length > 5, r.code); assert.ok(!DEV.test(r.sayRoman[l]), `${r.code} ${l}: ${r.sayRoman[l]}`); }
    if (r.onTheWay) for (const l of ["hi", "mr"]) assert.ok(r.onTheWayRoman[l] && !DEV.test(r.onTheWayRoman[l]), r.code);
    else assert.equal(r.onTheWayRoman, null, r.code);
  }
});
