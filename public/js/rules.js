// Ghar Bhet: the danger-sign rules. Fixed, versioned and cited.
// A model never decides these. Each rule names the document and clause it comes from.
//
// Exports
//   RULESET                 { id, label }  the version printed on every slip
//   checkRecord(record)     -> [{ code, severity, urgent, title, why, action, where, onTheWay, source, threshold, say }]
//                           severity "refer_now" = refer today; "watch" = advise, recheck, tell the ANM.
//                           urgent true = go now (call 108): the source says immediately/urgently.
//                           Sorted: urgent first, then refer_now, then watch.
//   flagCodes(record)       -> sorted codes of the flags that fire
//   noted(record, flags?)   -> [{ code, label_en }] every symptom said PRESENT that no fired flag
//                           covers. The UI shows these as "Noted: tell the nurse" so a visit with a
//                           symptom is never shown as "No danger signs". flags defaults to checkRecord(record).
//   RULE_TABLE              one row per rule: { code, type, severity, urgent, title, threshold, action, where, onTheWay, source }
//   groupFlags(flags)       -> [{ where, urgent, severity, flags, onTheWay }]: one destination per group, most urgent
//                           first; when anything refers, all flags fold under the top destination.
//   Each flag also has `where` (a few words: "Newborn unit (SNCU) now, call 108") and `onTheWay`
//   (what to do on the way, or null). `action` stays the full sentence.
//   SYMPTOM_LABELS          { anc|pnc|newborn: { code: "English label" } }
//   FIELD_LABELS            { field: "English label" }
//   symptomLabel(type, code), fieldLabel(field)
//
// Temperatures: the record keeps temp_c to one decimal. When the ASHA said Fahrenheit the reader
// also keeps temp_f exactly as said, and the rules compare that, so "102 F" is exactly 102 F.

export const RULESET = {
  id: "mohfw-2026.4",
  label: "MoHFW CHO manuals (2021), SBA guidelines (2010), MCP card, HBNC 2014, SSBSK Operational Guidelines 2026, Anemia Mukt Bharat 2026",
};

const DOC = {
  cho_anc: "MoHFW/NHSRC, Care During Pregnancy and Childbirth, CHO training manual (2021)",
  cho_nb: "MoHFW/NHSRC, Newborn and Child Health Services, CHO training manual (2021)",
  sba: "MoHFW, Guidelines for Antenatal Care and Skilled Attendance at Birth by ANMs/LHVs/SNs (2010)",
  mnm: "MoHFW, Maternal Near Miss Review Operational Guidelines (2014)",
  mcp: "Mother and Child Protection card (MoHFW/MoWCD)",
  ssbsk: "SSBSK Operational Guidelines 2026 (MoHFW, final of 06-08-2026)",
  hbnc: "HBNC Operational Guidelines 2014, ASHA home-visit form",
  jobaid: "HBNC & HBYC job aid for ASHA (MoHFW)",
  pmsma: "PMSMA fact sheet (PIB, June 2026)",
  telemanas: "PIB/MoHFW, Advancing Mental Healthcare in India (7 Feb 2025): Tele MANAS national toll-free helpline 14416 / 1800-89-14416, 24x7",
  cho_bk: "MoHFW, CHO booklet on maternal health (direct referral to a centre with blood transfusion and a gynaecologist for PPH, eclampsia and sepsis)",
  amb: "Anemia Mukt Bharat Abhiyaan Operational Guidelines (MoHFW, June 2026)",
};

const S = (r, k) => r.symptoms?.[k] === true;
const has = (v) => v !== undefined && v !== null && v !== "";
const FtoC = (f) => ((f - 32) * 5) / 9;
const EPS = 1e-9;
// Exact temperature in °C: from temp_f when the reader kept the Fahrenheit value said
const tempC = (r) => (has(r.temp_f) ? FtoC(r.temp_f) : has(r.temp_c) ? r.temp_c : null);
const tAtLeast = (r, c) => { const t = tempC(r); return t != null && t >= c - EPS; };
const tBelow = (r, c) => { const t = tempC(r); return t != null && t < c - EPS; };
// "above 102 F": exact with temp_f; with temp_c only, above the rounded °C value
const tAboveF = (r, f) => (has(r.temp_f) ? r.temp_f > f + EPS : has(r.temp_c) ? r.temp_c > Math.round(FtoC(f) * 10) / 10 + EPS : false);
const highBP = (r) => r.bp_sys >= 140 || r.bp_dia >= 90;
const severeBP = (r) => r.bp_sys >= 160 || r.bp_dia >= 110;
const alb2 = (r) => ["2", "3", "4"].includes(String(r.albumin));
const showT = (r) => (has(r.temp_f) ? `${r.temp_f} °F (${r.temp_c ?? Math.round(FtoC(r.temp_f) * 10) / 10} °C)` : `${r.temp_c} °C`);
const bp = (r) => `BP ${r.bp_sys ?? "?"}/${r.bp_dia ?? "?"}`;

// HBNC 2014 sepsis checklist: two or more signs = sepsis, refer to SNCU immediately
const SEPSIS = [
  (r) => S(r, "lethargy"),
  (r) => r.feeding === "poor" || r.feeding === "none",
  (r) => S(r, "weak_cry"),
  (r) => S(r, "vomiting") || S(r, "abdominal_distension"),
  (r) => S(r, "cold_to_touch") || S(r, "hot_to_touch") || tBelow(r, 36) || (has(tempC(r)) && tempC(r) > FtoC(99) + EPS),
  (r) => S(r, "chest_indrawing"),
  (r) => has(r.resp_rate) && r.resp_rate > 60,
  (r) => S(r, "cord_pus"),
];
const sepsisCount = (r) => SEPSIS.filter((f) => f(r)).length;
const SEPSIS_NAMES = ["moves only when touched", "feeding less", "weak cry", "vomiting or swollen belly", "too cold or fever", "chest indrawing", "breathing over 60", "cord pus"];
const sepsisSigns = (r) => SEPSIS.map((f, k) => (f(r) ? SEPSIS_NAMES[k] : null)).filter(Boolean);

// Each rule: code, type, severity, urgent, threshold, src, covers (symptom codes it speaks for),
// when(record), title, why(record), action, say {en, hi, mr}
const RULES = [
  // ---------- pregnancy ----------
  { code: "anc_imminent_eclampsia", type: "anc", severity: "refer_now", urgent: true,
    threshold: "Diastolic BP above 110", src: `${DOC.sba}, p.18; ${DOC.cho_anc}, p.20 and p.27 (imminent eclampsia)`,
    when: (r) => has(r.bp_dia) && r.bp_dia > 110,
    title: "Imminent eclampsia (diastolic above 110)", why: (r) => `Diastolic ${r.bp_dia} is above 110: a danger sign of imminent eclampsia.`,
    action: "Go to the FRU now and go with her. Call 108.",
    say: { en: "Danger. The lower blood pressure is above one hundred and ten. Take her to the hospital now and call one zero eight.", hi: "ख़तरा। नीचे वाला बीपी एक सौ दस से ज़्यादा है। अभी अस्पताल ले जाइए और एक सौ आठ पर फ़ोन कीजिए।", mr: "धोका. खालचा बीपी एकशे दहापेक्षा जास्त आहे. आत्ताच दवाखान्यात न्या आणि एकशे आठ वर फोन करा." } },
  { code: "anc_severe_hypertension", type: "anc", severity: "refer_now", urgent: true,
    threshold: "Systolic 160 or more, or diastolic 110 or more", src: `${DOC.sba}, Table 2 p.37 (diastolic 110 or more); ${DOC.mnm}, Annexure 2 p.36 (BP over 160/110 as a severe sign). The systolic 160 line follows the MNM guideline`,
    when: (r) => severeBP(r) && !(r.bp_dia > 110),
    title: "Blood pressure in the severe range", why: (r) => `${bp(r)} is in the severe range (160 systolic or 110 diastolic).`,
    action: "Go to the FRU now. Call 108 (or 102, free transport).",
    say: { en: "Danger. Blood pressure is very high. Take her to the hospital now. Call one zero eight.", hi: "ख़तरा। बीपी बहुत ज़्यादा है। अभी अस्पताल ले जाइए। एक सौ आठ पर फ़ोन कीजिए।", mr: "धोका. बीपी खूप जास्त आहे. आत्ताच दवाखान्यात न्या. एकशे आठ वर फोन करा." } },
  { code: "anc_preeclampsia", type: "anc", severity: "refer_now", urgent: true,
    threshold: "BP 140/90 or more with urine albumin 2+ or more", src: `${DOC.cho_anc}, p.20 (albumin 2+ with high BP is pre-eclampsia: "Refer her to the PHC-MO immediately") and p.27`,
    when: (r) => highBP(r) && alb2(r),
    title: "Possible pre-eclampsia", why: (r) => `${bp(r)} with urine albumin ${r.albumin}+.`,
    action: "Take her to the PHC medical officer now. Call 108 or 102.",
    say: { en: "High blood pressure with albumin in the urine. This may be pre-eclampsia. Take her to the doctor now.", hi: "बीपी ज़्यादा है और पेशाब में एल्ब्यूमिन है। यह प्री-एक्लेम्पसिया हो सकता है। अभी डॉक्टर के पास ले जाइए।", mr: "बीपी जास्त आहे आणि लघवीत अल्ब्युमिन आहे. हे प्री-एक्लॅम्पसिया असू शकते. आत्ताच डॉक्टरकडे न्या." } },
  { code: "anc_hypertension", type: "anc", severity: "refer_now", urgent: false,
    threshold: "BP 140/90 or more", src: `${DOC.cho_anc}, p.20 (high BP without albumin: refer to the PHC medical officer) and p.27 (BP more than 140/90: refer to 24-hour PHC/FRU)`,
    when: (r) => highBP(r) && !severeBP(r) && !alb2(r),
    title: "High blood pressure", why: (r) => `${bp(r)} is 140/90 or above.`,
    action: "BP is high. Take her to the PHC today; the nurse (ANM) or medical officer will recheck it. Free transport: 102.",
    say: { en: "Blood pressure is high. Take her to the PHC today. The nurse or doctor will check it again.", hi: "बीपी ज़्यादा है। आज ही पीएचसी ले जाइए। एएनएम या डॉक्टर फिर से जाँचेंगे।", mr: "बीपी जास्त आहे. आजच पीएचसीला न्या. एएनएम किंवा डॉक्टर पुन्हा तपासतील." } },
  { code: "anc_headache_vision", type: "anc", severity: "refer_now", urgent: true, covers: ["severe_headache", "blurred_vision"],
    threshold: "Severe headache or blurred vision said", src: `${DOC.mcp}, danger signs panel ("take the pregnant woman to the hospital immediately")`,
    when: (r) => S(r, "severe_headache") || S(r, "blurred_vision"),
    title: "Severe headache or blurred vision", why: () => "A danger sign on the MCP card.",
    action: "Take her to the hospital now. Her BP must be checked.",
    say: { en: "Severe headache or blurred vision is a danger sign. Take her to the hospital now.", hi: "तेज़ सिरदर्द या धुंधला दिखना ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "खूप डोकेदुखी किंवा धूसर दिसणे हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_severe_anaemia", type: "anc", severity: "refer_now", urgent: true,
    threshold: "Hb under 7 g/dl", src: `${DOC.cho_anc}, p.27 (severe anaemia, Hb less than 7: refer) and p.35 table (Hb 5-6.9: refer urgently to FRU/DH; under 5: immediate hospitalisation); ${DOC.mcp}, danger signs panel`,
    when: (r) => has(r.hb) && r.hb < 7,
    title: "Severe anaemia", why: (r) => `Hb ${r.hb} g/dl is below 7.`,
    action: "Take her to the FRU medical officer now (Hb under 5: she needs a hospital bed). Call 102 or 108.",
    say: { en: "Hemoglobin is below seven. This is severe anaemia. Take her to the hospital now.", hi: "हीमोग्लोबिन सात से कम है। यह गंभीर खून की कमी है। अभी अस्पताल ले जाइए।", mr: "हिमोग्लोबिन सातपेक्षा कमी आहे. ही गंभीर रक्ताची कमतरता आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_anaemia_breathless", type: "anc", severity: "refer_now", urgent: true, covers: ["pallor", "breathless"],
    threshold: "Paleness with breathlessness", src: `${DOC.mcp}, danger signs panel ("Severe anaemia with or without breathlessness": hospital immediately); ${DOC.cho_anc}, p.27 (severe anaemia: Hb under 7 or paleness inside eyelids and fingernails) and p.35`,
    when: (r) => S(r, "pallor") && S(r, "breathless"),
    title: "Pale and breathless", why: () => "Paleness with breathlessness: signs of severe anaemia.",
    action: "Take her to the FRU now for an Hb test and treatment. Call 102 or 108.",
    say: { en: "She is pale and breathless. This may be severe anaemia. Take her to the hospital now.", hi: "वह पीली पड़ी है और साँस फूल रही है। यह गंभीर खून की कमी हो सकती है। अभी अस्पताल ले जाइए।", mr: "ती फिकट आहे आणि दम लागतो. ही गंभीर रक्ताची कमतरता असू शकते. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_pallor", type: "anc", severity: "refer_now", urgent: false, covers: ["pallor"],
    threshold: "Pale eyelids, palms or nails said", src: `${DOC.cho_anc}, p.27 (severe anaemia: paleness inside eyelids and fingernails, refer to 24-hour PHC/FRU)`,
    when: (r) => S(r, "pallor") && !S(r, "breathless"),
    title: "Paleness", why: () => "Pale eyelids, palms or nails can mean severe anaemia.",
    action: "Take her to the PHC today for an Hb test.",
    say: { en: "She looks pale. Take her to the PHC today for a blood test.", hi: "वह पीली दिख रही है। खून की जाँच के लिए आज ही पीएचसी ले जाइए।", mr: "ती फिकट दिसते. रक्त तपासणीसाठी आजच पीएचसीला न्या." } },
  { code: "anc_moderate_anaemia", type: "anc", severity: "watch", urgent: false,
    threshold: "Hb 7 to 9.9 g/dl", src: `${DOC.amb}, Table 1 p.40 (mild-moderate anaemia: 2 IFA tablets daily for 1 month); ${DOC.cho_anc}, p.35`,
    when: (r) => has(r.hb) && r.hb >= 7 && r.hb < 10,
    title: "Moderate anaemia", why: (r) => `Hb ${r.hb} g/dl is between 7 and 9.9.`,
    action: "Two iron (IFA) tablets a day for one month, then Hb again. Tell the nurse (ANM); the medical officer sees her if it does not rise.",
    say: { en: "Moderate anaemia. Two iron tablets every day for a month, and tell the nurse.", hi: "खून की कमी है। एक महीने तक रोज़ आयरन की दो गोलियाँ, और एएनएम को बताइए।", mr: "रक्ताची कमतरता आहे. एक महिना रोज लोहाच्या दोन गोळ्या, आणि एएनएमला कळवा." } },
  { code: "anc_mild_anaemia", type: "anc", severity: "watch", urgent: false,
    threshold: "Hb 10 to 10.9 g/dl", src: `${DOC.amb}, Table 1 p.40 (mild-moderate anaemia: 2 IFA tablets daily for 1 month)`,
    when: (r) => has(r.hb) && r.hb >= 10 && r.hb < 11,
    title: "Mild anaemia", why: (r) => `Hb ${r.hb} g/dl is between 10 and 10.9.`,
    action: "Two iron (IFA) tablets a day for one month and iron-rich food, then Hb again.",
    say: { en: "Mild anaemia. Two iron tablets every day for a month.", hi: "थोड़ी खून की कमी है। एक महीने तक रोज़ आयरन की दो गोलियाँ।", mr: "थोडी रक्ताची कमतरता आहे. एक महिना रोज लोहाच्या दोन गोळ्या." } },
  { code: "anc_bleeding", type: "anc", severity: "refer_now", urgent: true, covers: ["bleeding"],
    threshold: "Any bleeding said", src: `${DOC.mcp}, danger signs panel; ${DOC.cho_anc} (any bleeding after 20 weeks: refer to FRU with blood transfusion)`,
    when: (r) => S(r, "bleeding"),
    title: "Bleeding in pregnancy", why: () => "Any bleeding in pregnancy is a danger sign.",
    action: "Go to an FRU with blood transfusion now. Call 108.",
    say: { en: "Bleeding in pregnancy is dangerous. Take her to the hospital now.", hi: "गर्भावस्था में खून जाना ख़तरनाक है। अभी अस्पताल ले जाइए।", mr: "गरोदरपणात रक्तस्राव धोकादायक आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_leaking", type: "anc", severity: "refer_now", urgent: true, covers: ["leaking_fluid"],
    threshold: "Water leaking or bag burst said", src: `${DOC.mcp}, danger signs panel ("bursting of water bag without labour pains"); ${DOC.cho_anc}, p.17`,
    when: (r) => S(r, "leaking_fluid"),
    title: "Water leaking", why: () => "The water bag may have burst without labour pains.",
    action: "Go to the FRU now. Call 108 or 102.",
    say: { en: "Water is leaking. Take her to the hospital now.", hi: "पानी जा रहा है। अभी अस्पताल ले जाइए।", mr: "पाणी जात आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_convulsions", type: "anc", severity: "refer_now", urgent: true, covers: ["convulsions"],
    threshold: "Fits said", src: `${DOC.cho_anc} (convulsion: left lateral position, clear airway, refer and accompany to FRU); ${DOC.mcp}`,
    when: (r) => S(r, "convulsions"),
    title: "Fits", why: () => "Convulsions in pregnancy may be eclampsia.",
    action: "Lay her on her left side, keep the airway clear, call 108 and go with her to the FRU.",
    say: { en: "Fits are an emergency. Lay her on her left side and call one zero eight.", hi: "झटके आना आपातकाल है। उन्हें बाईं करवट लिटाइए और एक सौ आठ पर फ़ोन कीजिए।", mr: "झटके येणे ही आणीबाणी आहे. तिला डाव्या कुशीवर झोपवा आणि एकशे आठ वर फोन करा." } },
  { code: "anc_high_fever", type: "anc", severity: "refer_now", urgent: true, covers: ["high_fever", "fever"],
    threshold: "Above 101 °F (38.3 °C), or high fever said", src: `${DOC.mcp}, danger signs panel ("High fever during pregnancy ... take the pregnant woman to the hospital immediately"). The card gives no number; 101 °F is the line used here`,
    when: (r) => tAboveF(r, 101) || S(r, "high_fever"),
    title: "High fever in pregnancy", why: (r) => has(tempC(r)) ? `${showT(r)} is above 101 °F.` : "High fever said.",
    action: "Take her to the hospital now; test for malaria there. Call 102 or 108.",
    say: { en: "High fever in pregnancy is a danger sign. Take her to the hospital now.", hi: "गर्भावस्था में तेज़ बुखार ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "गरोदरपणात खूप ताप हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_low_fever", type: "anc", severity: "watch", urgent: false,
    threshold: "37.5 °C (99.5 °F) up to 100 °F", src: `${DOC.ssbsk} (37.5 °C is the SSBSK fever line, written for the newborn); ${DOC.cho_anc}, p.17 (fever is a symptom of complication)`,
    when: (r) => tAtLeast(r, 37.5) && !tAboveF(r, 100) && !S(r, "fever") && !S(r, "high_fever"),
    title: "Slightly raised temperature", why: (r) => `${showT(r)}.`,
    action: "Check again tomorrow and tell the nurse (ANM). Above 100 °F, or any fever she feels, means the PHC today.",
    say: { en: "Her temperature is a little high. Check again tomorrow and tell the nurse.", hi: "तापमान थोड़ा ज़्यादा है। कल फिर जाँचिए और एएनएम को बताइए।", mr: "तापमान थोडे जास्त आहे. उद्या पुन्हा तपासा आणि एएनएमला कळवा." } },
  { code: "anc_fever", type: "anc", severity: "refer_now", urgent: false, covers: ["fever"],
    threshold: "Fever said, or above 100 °F (37.8 °C)", src: `${DOC.cho_anc}, p.17 and p.27 (fever is a symptom of complication: refer to 24-hour PHC/FRU, test for malaria). 100 °F is the SSBSK Form 4 fever line`,
    when: (r) => (S(r, "fever") || tAboveF(r, 100)) && !(tAboveF(r, 101) || S(r, "high_fever")),
    title: "Fever in pregnancy", why: () => "Fever in pregnancy needs a doctor.",
    action: "Take her to the PHC today, and test for malaria.",
    say: { en: "Fever in pregnancy. Take her to the PHC today.", hi: "गर्भावस्था में बुखार है। आज ही पीएचसी ले जाइए।", mr: "गरोदरपणात ताप आहे. आजच पीएचसीला न्या." } },
  { code: "anc_fetal_movement", type: "anc", severity: "refer_now", urgent: false,
    threshold: "Baby moving less, or not at all", src: `${DOC.cho_anc}, p.17 and p.27 (decreased or absent foetal movements)`,
    when: (r) => r.fetal_movement === "reduced" || r.fetal_movement === "absent",
    title: "Baby moving less", why: (r) => r.fetal_movement === "absent" ? "No foetal movement felt." : "Foetal movement is reduced.",
    action: "Take her to the PHC or FRU today to check the baby's heartbeat.",
    say: { en: "The baby is moving less. Take her to the hospital today to check the heartbeat.", hi: "पेट में बच्चा कम हिल रहा है। धड़कन जाँचने के लिए आज ही अस्पताल ले जाइए।", mr: "पोटातील बाळाची हालचाल कमी आहे. ठोके तपासायला आजच दवाखान्यात न्या." } },
  { code: "anc_swelling", type: "anc", severity: "refer_now", urgent: false, covers: ["swelling_face_hands"],
    threshold: "Swelling of face, hands or whole body said", src: `${DOC.cho_anc}, p.27 (oedema of face, hands: refer to 24-hour PHC/FRU); ${DOC.mcp}, danger signs panel`,
    when: (r) => S(r, "swelling_face_hands"),
    title: "Swelling of face or hands", why: () => "Swelling of the face, hands or whole body is a danger sign.",
    action: "Take her to the PHC today; her BP and urine albumin must be checked.",
    say: { en: "Swelling of the face or hands is a danger sign. Take her to the PHC today.", hi: "चेहरे या हाथों पर सूजन ख़तरे का निशान है। आज ही पीएचसी ले जाइए।", mr: "चेहऱ्यावर किंवा हातांवर सूज हे धोक्याचे लक्षण आहे. आजच पीएचसीला न्या." } },
  { code: "anc_breathless", type: "anc", severity: "refer_now", urgent: false, covers: ["breathless"],
    threshold: "Breathlessness said", src: `${DOC.cho_anc}, p.17 (breathlessness at rest or on mild exertion) and p.27`,
    when: (r) => S(r, "breathless"),
    title: "Breathlessness", why: () => "Breathlessness may come with severe anaemia.",
    action: "Take her to the PHC today; her Hb must be checked.",
    say: { en: "She is breathless. Take her to the PHC today.", hi: "साँस फूल रही है। आज ही पीएचसी ले जाइए।", mr: "दम लागतो आहे. आजच पीएचसीला न्या." } },
  { code: "anc_abdominal_pain", type: "anc", severity: "refer_now", urgent: false, covers: ["abdominal_pain"],
    threshold: "Severe stomach pain said", src: `${DOC.cho_anc}, p.31 (pain in abdomen: refer the woman to the MO at the FRU)`,
    when: (r) => S(r, "abdominal_pain"),
    title: "Severe stomach pain", why: () => "Severe abdominal pain in pregnancy needs a doctor.",
    action: "Take her to the PHC today.",
    say: { en: "Severe stomach pain. Take her to the PHC today.", hi: "पेट में तेज़ दर्द है। आज ही पीएचसी ले जाइए।", mr: "पोटात खूप दुखत आहे. आजच पीएचसीला न्या." } },
  { code: "anc_burning_urine", type: "anc", severity: "refer_now", urgent: false, covers: ["burning_urine"],
    threshold: "Burning urine said", src: `${DOC.cho_anc}, p.17 (burning micturition is a symptom of complication) and p.30 (burning on urination, UTI: refer to the MO at the PHC)`,
    when: (r) => S(r, "burning_urine"),
    title: "Burning urine", why: () => "Burning urine in pregnancy may be an infection.",
    action: "Take her to the PHC today for a urine test.",
    say: { en: "Burning urine may be an infection. Take her to the PHC today.", hi: "पेशाब में जलन इन्फ़ेक्शन हो सकता है। आज ही पीएचसी ले जाइए।", mr: "लघवीला जळजळ हा संसर्ग असू शकतो. आजच पीएचसीला न्या." } },
  { code: "anc_discharge", type: "anc", severity: "refer_now", urgent: false, covers: ["foul_discharge"],
    threshold: "Foul or abnormal discharge said", src: `${DOC.cho_anc}, p.32 (abnormal vaginal discharge: refer the woman to the MO)`,
    when: (r) => S(r, "foul_discharge"),
    title: "Abnormal discharge", why: () => "Abnormal or foul-smelling discharge.",
    action: "Take her to the medical officer at the PHC today.",
    say: { en: "Abnormal discharge. Take her to the doctor at the PHC today.", hi: "असामान्य पानी या बदबू है। आज ही पीएचसी के डॉक्टर के पास ले जाइए।", mr: "असामान्य स्राव आहे. आजच पीएचसीच्या डॉक्टरकडे न्या." } },
  { code: "anc_labour_prolonged", type: "anc", severity: "refer_now", urgent: true, covers: ["labour_pain"],
    threshold: "Labour pain for more than 12 hours", src: `${DOC.mcp}, danger signs panel ("labour pain for more than 12 hours")`,
    when: (r) => has(r.labour_hours) && r.labour_hours > 12,
    title: "Labour for more than 12 hours", why: (r) => `Labour pain for ${r.labour_hours} hours.`,
    action: "Go to the FRU now. Call 108 or 102.",
    say: { en: "Labour pain for more than twelve hours is a danger sign. Take her to the hospital now.", hi: "बारह घंटे से ज़्यादा प्रसव पीड़ा ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बारा तासांपेक्षा जास्त कळा हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_preterm_labour", type: "anc", severity: "refer_now", urgent: true, covers: ["labour_pain"],
    threshold: "Labour pains before 37 weeks (or by the 8th month)", src: `${DOC.sba}, p.81 (pre-term labour, onset before 37 completed weeks: refer her to the FRU; keep the baby warm and breastfeed during transport)`,
    when: (r) => (S(r, "labour_pain") || has(r.labour_hours)) && ((has(r.weeks) && r.weeks < 37) || (!has(r.weeks) && has(r.month) && r.month <= 8)),
    title: "Labour before time", why: (r) => has(r.weeks) ? `Labour pains at ${r.weeks} weeks.` : `Labour pains in month ${r.month}.`,
    action: "Go to the FRU now; the baby may need newborn care. Call 102 or 108.",
    say: { en: "Labour has started before time. Take her to the hospital now.", hi: "समय से पहले दर्द शुरू हो गया है। अभी अस्पताल ले जाइए।", mr: "वेळेआधी कळा सुरू झाल्या आहेत. आत्ताच दवाखान्यात न्या." } },
  { code: "anc_labour", type: "anc", severity: "refer_now", urgent: false, covers: ["labour_pain"],
    threshold: "Labour pains at term", src: `PIB/MoHFW press release 22 Jul 2022 (102: free transport from home to facility for pregnant women); ${DOC.mcp}`,
    when: (r) => S(r, "labour_pain") && !((has(r.weeks) && r.weeks < 37) || (!has(r.weeks) && has(r.month) && r.month <= 8)) && !(has(r.labour_hours) && r.labour_hours > 12),
    title: "Labour has started", why: () => "Labour pains said.",
    action: "Take her to the delivery facility for the birth. Call 102 (free transport).",
    say: { en: "Labour has started. Take her to the hospital for the delivery. Call one zero two.", hi: "प्रसव पीड़ा शुरू हो गई है। डिलीवरी के लिए अस्पताल ले जाइए। एक सौ दो पर फ़ोन कीजिए।", mr: "कळा सुरू झाल्या आहेत. प्रसूतीसाठी दवाखान्यात न्या. एकशे दोन वर फोन करा." } },
  { code: "anc_malpresentation", type: "anc", severity: "refer_now", urgent: false,
    threshold: "Baby lying the wrong way (breech or across) at 36 weeks or later", src: `${DOC.cho_anc}, p.27 (breech presentation and foetal lie other than longitudinal: refer to 24-hour PHC/FRU)`,
    when: (r) => r.malpresentation === true && ((has(r.weeks) && r.weeks >= 36) || (!has(r.weeks) && has(r.month) && r.month >= 9)),
    title: "Baby not head down", why: () => "Breech or transverse lie near term.",
    action: "Take her to the PHC or FRU this week for a check; plan the delivery in a hospital.",
    say: { en: "The baby is not head down. She needs a doctor's check and a hospital delivery.", hi: "बच्चा उल्टा है। डॉक्टर से जाँच और अस्पताल में डिलीवरी ज़रूरी है।", mr: "बाळ उलटं आहे. डॉक्टरांची तपासणी आणि दवाखान्यात प्रसूती आवश्यक आहे." } },
  { code: "anc_multiple_pregnancy", type: "anc", severity: "refer_now", urgent: false,
    threshold: "Twins (or more) said", src: `${DOC.cho_anc}, p.27 (multi-foetal pregnancy: refer to 24-hour PHC/FRU for further examination); ${DOC.pmsma}, p.2-3`,
    when: (r) => r.twins === true,
    title: "Twins", why: () => "A multiple pregnancy needs a doctor's check and a hospital delivery.",
    action: "Take her to the PHC or FRU for a check-up; plan the delivery in a hospital. Tell the nurse (ANM) today.",
    say: { en: "Twins. She needs a doctor's check-up and a hospital delivery. Tell the nurse today.", hi: "जुड़वा बच्चे हैं। डॉक्टर से जाँच और अस्पताल में डिलीवरी ज़रूरी है। आज एएनएम को बताइए।", mr: "जुळी बाळं आहेत. डॉक्टरांची तपासणी आणि दवाखान्यात प्रसूती आवश्यक आहे. आज एएनएमला कळवा." } },
  { code: "anc_vomiting", type: "anc", severity: "watch", urgent: false, covers: ["vomiting"],
    threshold: "Vomiting said", src: `${DOC.cho_anc}, p.17 (persistent vomiting with dehydration is a symptom of complication)`,
    when: (r) => S(r, "vomiting"),
    title: "Vomiting", why: () => "Vomiting; persistent vomiting with dehydration needs a doctor.",
    action: "Give ORS and small frequent meals; tell the nurse (ANM) today. If she cannot keep water down, take her to the PHC today.",
    say: { en: "She is vomiting. Give her O R S. If she cannot keep water down, take her to the PHC today.", hi: "उल्टी हो रही है। ओआरएस दीजिए। पानी भी न रुके तो आज ही पीएचसी ले जाइए।", mr: "उलट्या होत आहेत. ओआरएस द्या. पाणीही टिकत नसेल तर आजच पीएचसीला न्या." } },
  { code: "anc_dizziness", type: "anc", severity: "watch", urgent: false, covers: ["dizziness"],
    threshold: "Dizziness or weakness said", src: `${DOC.cho_anc}, p.17 (palpitations, tiredness) and p.27 (severe anaemia signs)`,
    when: (r) => S(r, "dizziness"),
    title: "Dizziness or weakness", why: () => "Dizziness or weakness can be a sign of anaemia.",
    action: "Get her Hb checked; tell the nurse (ANM) today.",
    say: { en: "Dizziness can be a sign of anaemia. Get her hemoglobin checked, and tell the nurse.", hi: "चक्कर खून की कमी का निशान हो सकता है। हीमोग्लोबिन जँचवाइए, और एएनएम को बताइए।", mr: "चक्कर हे रक्ताच्या कमतरतेचे लक्षण असू शकते. हिमोग्लोबिन तपासा, आणि एएनएमला कळवा." } },
  { code: "anc_high_risk", type: "anc", severity: "watch", urgent: false,
    threshold: "Age under 18 or over 35, height under 145 cm, 4 or more births before, previous caesarean, PPH, APH, eclampsia, stillbirth or newborn death, preterm or small baby, diabetes, heart disease, Rh negative, HIV or syphilis positive",
    src: `${DOC.pmsma}, p.2-3 (High-Risk Pregnancy categories: HIV, syphilis, gestational diabetes, previous LSCS, history of stillbirth, negative blood group, teenage pregnancy, elderly primi, grand multipara, short stature); ${DOC.cho_anc}, p.18 (refer to the 24-hour PHC for ANC and delivery: stillbirth or neonatal loss, premature births, previous baby under 2500 g, Rh negative, past systemic illness) and p.21 Table 2 (under 18 years, under 145 cm). The PIB sheet gives no numbers for 'elderly' or 'grand multipara'; over 35 years and 4 or more births are used here`,
    when: (r) => (has(r.age) && (r.age < 18 || r.age > 35)) || (has(r.height_cm) && r.height_cm < 145) || (has(r.previous_births) && r.previous_births >= 4) || ["prev_caesarean", "prev_pph", "prev_aph", "prev_eclampsia", "prev_stillbirth", "prev_preterm", "diabetes", "heart_disease", "rh_negative", "hiv_syphilis"].some((k) => r[k] === true),
    title: "High-risk pregnancy", why: (r) => [has(r.age) && r.age < 18 && `age ${r.age}`, has(r.age) && r.age > 35 && `age ${r.age}`, has(r.height_cm) && r.height_cm < 145 && `height ${r.height_cm} cm`, r.prev_caesarean && "previous caesarean", r.prev_pph && "bleeding after a previous delivery", r.prev_aph && "bleeding in a previous pregnancy", r.prev_eclampsia && "fits or eclampsia before", r.prev_stillbirth && "a stillbirth or newborn death before", r.prev_preterm && "a preterm or small baby before", r.diabetes && "diabetes", r.heart_disease && "heart disease", r.rh_negative && "Rh negative", r.hiv_syphilis && "HIV or syphilis positive", has(r.previous_births) && r.previous_births >= 4 && `${r.previous_births} births before`].filter(Boolean).join(", ") + ".",
    action: "High-risk pregnancy: tell the nurse (ANM) today. Plan her ANC and the delivery at the 24-hour PHC or FRU, with the PMSMA check-up (9th of the month) and extra visits.",
    say: { en: "This is a high-risk pregnancy. Tell the nurse today, and plan the delivery in a hospital.", hi: "यह ज़्यादा जोखिम वाली गर्भावस्था है। आज एएनएम को बताइए, और डिलीवरी अस्पताल में करवाइए।", mr: "ही जास्त जोखमीची गर्भधारणा आहे. आज एएनएमला कळवा, आणि प्रसूती दवाखान्यात करा." } },

  // ---------- mother after delivery ----------
  { code: "pnc_heavy_bleeding", type: "pnc", severity: "refer_now", urgent: true, covers: ["heavy_bleeding"],
    threshold: "5 or more pads a day, or heavy bleeding said", src: `${DOC.ssbsk}, Form 4 p.115 (changing pad 5 or more a day); ${DOC.mcp}, danger signs panel (excessive bleeding after delivery)`,
    when: (r) => (has(r.pads) && r.pads >= 5) || S(r, "heavy_bleeding"),
    title: "Heavy bleeding", why: (r) => has(r.pads) && r.pads >= 5 ? `${r.pads} pads a day (5 or more is too many).` : "Heavy bleeding after delivery.",
    action: "Go to the FRU now. Call 108.",
    say: { en: "Heavy bleeding after delivery. Take her to the hospital now.", hi: "डिलीवरी के बाद बहुत खून जा रहा है। अभी अस्पताल ले जाइए।", mr: "प्रसूतीनंतर खूप रक्तस्राव होत आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_severe_hypertension", type: "pnc", severity: "refer_now", urgent: true,
    threshold: "Systolic 160 or more, or diastolic 110 or more", src: `${DOC.sba}, p.18 and Table 2 p.37 (diastolic 110 or more); ${DOC.mnm}, Annexure 2 p.36 (BP over 160/110). Written for pregnancy, used here after delivery`,
    when: (r) => severeBP(r),
    title: "Blood pressure in the severe range", why: (r) => `${bp(r)} is in the severe range (160 systolic or 110 diastolic).`,
    action: "Go to the FRU now. Call 108.",
    say: { en: "Danger. Blood pressure is very high. Take her to the hospital now. Call one zero eight.", hi: "ख़तरा। बीपी बहुत ज़्यादा है। अभी अस्पताल ले जाइए। एक सौ आठ पर फ़ोन कीजिए।", mr: "धोका. बीपी खूप जास्त आहे. आत्ताच दवाखान्यात न्या. एकशे आठ वर फोन करा." } },
  { code: "pnc_hypertension", type: "pnc", severity: "refer_now", urgent: false,
    threshold: "BP 140/90 or more", src: `${DOC.cho_anc}, p.43-44 (measure BP at every antenatal and postnatal visit; more than 140/90: refer to the 24x7 PHC/FRU)`,
    when: (r) => highBP(r) && !severeBP(r),
    title: "High blood pressure", why: (r) => `${bp(r)} is 140/90 or above.`,
    action: "BP is high. Take her to the PHC today; the nurse (ANM) or medical officer will recheck it. Free transport: 102.",
    say: { en: "Blood pressure is high after delivery. Take her to the PHC today.", hi: "डिलीवरी के बाद बीपी ज़्यादा है। आज ही पीएचसी ले जाइए।", mr: "प्रसूतीनंतर बीपी जास्त आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_severe_anaemia", type: "pnc", severity: "refer_now", urgent: true, covers: ["dizziness", "pallor"],
    threshold: "Hb under 7 g/dl", src: `${DOC.cho_anc}, p.35 table (Hb 5-6.9: refer urgently to FRU/DH; under 5: immediate hospitalisation; written for pregnancy); ${DOC.amb}, Table 2 p.42 (lactating mother, severe anaemia: refer to FRU/DH for IV iron or blood transfusion)`,
    when: (r) => has(r.hb) && r.hb < 7,
    title: "Severe anaemia", why: (r) => `Hb ${r.hb} g/dl is below 7.`,
    action: "Take her to the FRU or district hospital (with blood transfusion) now. Call 108. Hb under 5: she needs a hospital bed.",
    say: { en: "Hemoglobin is below seven. This is severe anaemia. Take her to the hospital now.", hi: "हीमोग्लोबिन सात से कम है। यह गंभीर खून की कमी है। अभी अस्पताल ले जाइए।", mr: "हिमोग्लोबिन सातपेक्षा कमी आहे. ही गंभीर रक्ताची कमतरता आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_low_hb", type: "pnc", severity: "refer_now", urgent: false, covers: ["dizziness", "pallor"],
    threshold: "Hb 7 to 7.9 g/dl", src: `${DOC.amb}, p.33-34 (women who are not pregnant: severe anaemia is under 8 g/dl) and Table 2 p.42 (lactating mother, severe anaemia: refer to FRU/DH)`,
    when: (r) => has(r.hb) && r.hb >= 7 && r.hb < 8,
    title: "Anaemia (severe for a mother after birth)", why: (r) => `Hb ${r.hb} g/dl is under 8.`,
    action: "Take her to the FRU or district hospital today for treatment (IV iron).",
    say: { en: "Her hemoglobin is low. Take her to the hospital today.", hi: "हीमोग्लोबिन कम है। आज ही अस्पताल ले जाइए।", mr: "हिमोग्लोबिन कमी आहे. आजच दवाखान्यात न्या." } },
  { code: "pnc_anaemia_signs", type: "pnc", severity: "refer_now", urgent: false, covers: ["dizziness", "pallor"],
    threshold: "Giddiness, paleness or weakness said", src: `${DOC.ssbsk}, Form 4 p.115 (severe anaemia: giddiness, paleness, weakness means referral)`,
    when: (r) => (S(r, "dizziness") || S(r, "pallor")) && !(has(r.hb) && r.hb < 8),
    title: "Signs of anaemia", why: () => "Giddiness, paleness or weakness after delivery.",
    action: "Take her to the PHC today for an Hb test and treatment.",
    say: { en: "Signs of anaemia. Take her to the PHC today for a blood test.", hi: "खून की कमी के निशान हैं। खून की जाँच के लिए आज ही पीएचसी ले जाइए।", mr: "रक्ताच्या कमतरतेची लक्षणे आहेत. रक्त तपासणीसाठी आजच पीएचसीला न्या." } },
  { code: "pnc_moderate_anaemia", type: "pnc", severity: "watch", urgent: false,
    threshold: "Hb 8 to 11.9 g/dl", src: `${DOC.amb}, p.33-34 (women who are not pregnant: mild 11-11.9, moderate 8-10.9 g/dl) and Table 2 p.42 (lactating mother, mild-moderate: 2 IFA tablets daily for 3 months)`,
    when: (r) => has(r.hb) && r.hb >= 8 && r.hb < 12,
    title: "Mild or moderate anaemia", why: (r) => `Hb ${r.hb} g/dl is under 12.`,
    action: "Two iron (IFA) tablets a day for three months, then Hb again. Tell the nurse (ANM).",
    say: { en: "Her hemoglobin is a little low. Two iron tablets every day for three months, and tell the nurse.", hi: "हीमोग्लोबिन थोड़ा कम है। तीन महीने तक रोज़ आयरन की दो गोलियाँ, और एएनएम को बताइए।", mr: "हिमोग्लोबिन थोडे कमी आहे. तीन महिने रोज लोहाच्या दोन गोळ्या, आणि एएनएमला कळवा." } },
  { code: "pnc_high_fever", type: "pnc", severity: "refer_now", urgent: true, covers: ["fever"],
    threshold: "Temperature above 102 °F (38.9 °C)", src: `${DOC.hbnc}, p.19 (above 102 F refer); ${DOC.mcp}, danger signs panel (high fever within one month of delivery); ${DOC.cho_bk}`,
    when: (r) => tAboveF(r, 102),
    title: "High fever", why: (r) => `${showT(r)} is above 102 °F.`,
    action: "Take her to the FRU (hospital) now. Call 108.",
    say: { en: "High fever after delivery. Take her to the hospital now.", hi: "डिलीवरी के बाद तेज़ बुखार है। अभी अस्पताल ले जाइए।", mr: "प्रसूतीनंतर खूप ताप आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_uti", type: "pnc", severity: "refer_now", urgent: false, covers: ["burning_urine", "fever"],
    threshold: "Burning urine said", src: `${DOC.ssbsk}, Form 4 p.115 (urinary tract infection: high fever over 102 F, burning urination)`,
    when: (r) => S(r, "burning_urine"),
    title: "Possible urine infection", why: (r) => (S(r, "fever") || tAtLeast(r, 37.5)) ? "Burning urine with fever." : "Burning urine after delivery.",
    action: "Take her to the PHC today.",
    say: { en: "Burning urine may be an infection. Take her to the PHC today.", hi: "पेशाब में जलन इन्फ़ेक्शन हो सकता है। आज ही पीएचसी ले जाइए।", mr: "लघवीला जळजळ हा संसर्ग असू शकतो. आजच पीएचसीला न्या." } },
  { code: "pnc_infection", type: "pnc", severity: "refer_now", urgent: false, covers: ["foul_discharge", "fever"],
    threshold: "Foul-smelling discharge said", src: `${DOC.ssbsk}, Form 4 p.115 (vaginal infection: foul smelling white discharge, fever over 100 F); ${DOC.hbnc}, p.19`,
    when: (r) => S(r, "foul_discharge"),
    title: "Possible infection", why: (r) => (S(r, "fever") || tAboveF(r, 100)) ? "Foul-smelling discharge with fever." : "Foul-smelling discharge.",
    action: "Take her to the PHC today.",
    say: { en: "Foul discharge may be an infection. Take her to the PHC today.", hi: "बदबूदार पानी इन्फ़ेक्शन हो सकता है। आज ही पीएचसी ले जाइए।", mr: "दुर्गंधी स्राव हा संसर्ग असू शकतो. आजच पीएचसीला न्या." } },
  { code: "pnc_fever", type: "pnc", severity: "refer_now", urgent: false, covers: ["fever"],
    threshold: "Fever said, or above 100 °F (37.8 °C)", src: `${DOC.ssbsk}, Form 4 p.115 (fever: any YES means referral; the same form uses fever above 100 °F for infection); ${DOC.hbnc}, p.19 (fever more than 100 F)`,
    when: (r) => (S(r, "fever") || tAboveF(r, 100)) && !tAboveF(r, 102) && !S(r, "burning_urine") && !S(r, "foul_discharge"),
    title: "Fever", why: (r) => has(tempC(r)) ? `${showT(r)}.` : "She has a fever.",
    action: "Take her to the PHC today.",
    say: { en: "She has a fever after delivery. Take her to the PHC today.", hi: "डिलीवरी के बाद बुखार है। आज ही पीएचसी ले जाइए।", mr: "प्रसूतीनंतर ताप आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_low_fever", type: "pnc", severity: "watch", urgent: false,
    threshold: "37.5 °C (99.5 °F) up to 100 °F", src: `${DOC.ssbsk}, Form 4 p.115 (fever lines of 100 °F and 102 °F; 37.5 °C is the SSBSK newborn line)`,
    when: (r) => tAtLeast(r, 37.5) && !tAboveF(r, 100) && !S(r, "fever"),
    title: "Slightly raised temperature", why: (r) => `${showT(r)}.`,
    action: "Check again tomorrow and tell the nurse (ANM). Above 100 °F, or any fever she feels, means the PHC today.",
    say: { en: "Her temperature is a little high. Check again tomorrow and tell the nurse.", hi: "तापमान थोड़ा ज़्यादा है। कल फिर जाँचिए और एएनएम को बताइए।", mr: "तापमान थोडे जास्त आहे. उद्या पुन्हा तपासा आणि एएनएमला कळवा." } },
  { code: "pnc_convulsions", type: "pnc", severity: "refer_now", urgent: true, covers: ["convulsions"],
    threshold: "Fits said", src: `${DOC.ssbsk}, Form 4 p.115 (neurological: convulsion); ${DOC.hbnc}, p.19`,
    when: (r) => S(r, "convulsions"),
    title: "Fits", why: () => "Convulsions after delivery are an emergency.",
    action: "Lay her on her left side, call 108 and go with her to the FRU.",
    say: { en: "Fits are an emergency. Call one zero eight now.", hi: "झटके आना आपातकाल है। अभी एक सौ आठ पर फ़ोन कीजिए।", mr: "झटके येणे ही आणीबाणी आहे. आत्ताच एकशे आठ वर फोन करा." } },
  { code: "pnc_neuro", type: "pnc", severity: "refer_now", urgent: true, covers: ["blurred_vision", "abnormal_speech"],
    threshold: "Blurred vision or strange speech said", src: `${DOC.ssbsk}, Form 4 p.115 (neurological: blurred vision, convulsion, speaking abnormally); ${DOC.mcp}, danger signs panel (headache, blurring of vision and fits: hospital immediately)`,
    when: (r) => S(r, "blurred_vision") || S(r, "abnormal_speech"),
    title: "Blurred vision or strange speech", why: () => "A neurological danger sign after delivery.",
    action: "Go to the FRU now; her BP must be checked there. Call 108.",
    say: { en: "Blurred vision or strange speech is a danger sign. Take her to the hospital now.", hi: "धुंधला दिखना या अजीब बोलना ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "धूसर दिसणे किंवा विचित्र बोलणे हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_headache", type: "pnc", severity: "refer_now", urgent: true, covers: ["severe_headache"],
    threshold: "Severe headache said", src: `${DOC.mcp}, danger signs panel (headache, blurring of vision and fits: hospital immediately; worded for pregnancy, used here after delivery); ${DOC.ssbsk}, Form 4 p.115 (neurological signs mean referral)`,
    when: (r) => S(r, "severe_headache"),
    title: "Severe headache", why: () => "A severe headache after delivery needs a BP check.",
    action: "Go to the FRU now; her BP must be checked there. Call 108.",
    say: { en: "Severe headache after delivery is a danger sign. Take her to the hospital now to check her blood pressure.", hi: "डिलीवरी के बाद तेज़ सिरदर्द ख़तरे का निशान है। बीपी जाँचने के लिए अभी अस्पताल ले जाइए।", mr: "प्रसूतीनंतर खूप डोकेदुखी हे धोक्याचे लक्षण आहे. बीपी तपासायला आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_breathless", type: "pnc", severity: "refer_now", urgent: true, covers: ["breathless"],
    threshold: "Difficulty breathing said", src: `${DOC.ssbsk}, Form 4 p.115 (difficulty in breathing means referral); ${DOC.mcp}, danger signs panel (severe anaemia with or without breathlessness: hospital immediately)`,
    when: (r) => S(r, "breathless"),
    title: "Difficulty breathing", why: () => "Breathlessness after delivery.",
    action: "Go to the FRU now. Call 108.",
    say: { en: "She has difficulty breathing. Take her to the hospital now.", hi: "साँस लेने में तकलीफ़ है। अभी अस्पताल ले जाइए।", mr: "श्वास घ्यायला त्रास होतो. आत्ताच दवाखान्यात न्या." } },
  { code: "pnc_abdominal_pain", type: "pnc", severity: "refer_now", urgent: false, covers: ["abdominal_pain"],
    threshold: "Stomach pain said", src: `${DOC.ssbsk}, Form 4 p.115 (abdominal pain)`,
    when: (r) => S(r, "abdominal_pain"),
    title: "Stomach pain", why: () => "Abdominal pain after delivery.",
    action: "Take her to the PHC today.",
    say: { en: "Stomach pain after delivery. Take her to the PHC today.", hi: "डिलीवरी के बाद पेट में दर्द है। आज ही पीएचसी ले जाइए।", mr: "प्रसूतीनंतर पोटात दुखत आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_swelling", type: "pnc", severity: "refer_now", urgent: false, covers: ["swelling_face_hands"],
    threshold: "Swelling of face or hands said", src: `${DOC.ssbsk}, Form 4 p.115 (oedema of face, hands and legs)`,
    when: (r) => S(r, "swelling_face_hands"),
    title: "Swelling of face or hands", why: () => "Swelling of the face or hands after delivery.",
    action: "Take her to the PHC today; her BP must be checked.",
    say: { en: "Swelling of the face or hands. Take her to the PHC today.", hi: "चेहरे या हाथों पर सूजन है। आज ही पीएचसी ले जाइए।", mr: "चेहऱ्यावर किंवा हातांवर सूज आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_jaundice", type: "pnc", severity: "refer_now", urgent: false, covers: ["jaundice"],
    threshold: "Yellow eyes or skin said", src: `${DOC.ssbsk}, Form 4 p.115 (jaundice)`,
    when: (r) => S(r, "jaundice"),
    title: "Jaundice", why: () => "Yellow eyes or skin after delivery.",
    action: "Take her to the PHC today.",
    say: { en: "Her eyes or skin are yellow. Take her to the PHC today.", hi: "आँखें या त्वचा पीली है। आज ही पीएचसी ले जाइए।", mr: "डोळे किंवा त्वचा पिवळी आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_incontinence", type: "pnc", severity: "refer_now", urgent: false, covers: ["incontinence"],
    threshold: "Urine or stool she cannot hold said", src: `${DOC.ssbsk}, Form 4 p.115 (incontinence of stool and urine)`,
    when: (r) => S(r, "incontinence"),
    title: "Leaking urine or stool", why: () => "She cannot hold urine or stool.",
    action: "Take her to the PHC today.",
    say: { en: "She cannot hold her urine or stool. Take her to the PHC today.", hi: "पेशाब या मल रुक नहीं रहा। आज ही पीएचसी ले जाइए।", mr: "लघवी किंवा शौच थांबत नाही. आजच पीएचसीला न्या." } },
  { code: "pnc_wound_infection", type: "pnc", severity: "refer_now", urgent: false, covers: ["wound_infection"],
    threshold: "Pus, redness or smell at the stitches said", src: `${DOC.mcp}, postpartum care table (episiotomy/tear is checked at each visit); infection at the stitches needs the medical officer (our wording)`,
    when: (r) => S(r, "wound_infection"),
    title: "Infected stitches", why: () => "Pus, redness or smell at the stitches.",
    action: "Take her to the PHC today.",
    say: { en: "The stitches look infected. Take her to the PHC today.", hi: "टांकों में इन्फ़ेक्शन लग रहा है। आज ही पीएचसी ले जाइए।", mr: "टाक्यांना संसर्ग दिसतो. आजच पीएचसीला न्या." } },
  { code: "pnc_calf_pain", type: "pnc", severity: "refer_now", urgent: false, covers: ["calf_pain"],
    threshold: "Calf pain or swelling said", src: `${DOC.ssbsk}, Form 4 p.115 (oedema of face, hands and legs means referral); a painful swollen calf can be a clot (our wording)`,
    when: (r) => S(r, "calf_pain"),
    title: "Painful or swollen calf", why: () => "Pain or swelling in the calf after delivery.",
    action: "Take her to the PHC today; she should not rub or press the leg.",
    say: { en: "Her calf is painful or swollen. Take her to the PHC today.", hi: "पिंडली में दर्द या सूजन है। आज ही पीएचसी ले जाइए।", mr: "पोटरीत दुखणे किंवा सूज आहे. आजच पीएचसीला न्या." } },
  { code: "pnc_low_mood", type: "pnc", severity: "refer_now", urgent: false, covers: ["low_mood"],
    threshold: "Sad, hopeless or no interest said", src: `${DOC.ssbsk}, Form 4 p.115 (psychological distress: two questions; if either is yes, prompt referral to the CHO/MO)`,
    when: (r) => S(r, "low_mood"),
    title: "Low mood", why: () => "She seems sad or low.",
    action: "Ask her two questions: little interest or pleasure in doing things? Feeling down, depressed or hopeless (for over two weeks)? If yes to either, the CHO or medical officer should see her this week. Tell the nurse (ANM).",
    say: { en: "She seems low. Ask her the two mood questions. The doctor should see her this week.", hi: "वह उदास लग रही है। मन के दो सवाल पूछिए। इस हफ़्ते डॉक्टर को दिखाइए।", mr: "ती उदास वाटते. मनाचे दोन प्रश्न विचारा. या आठवड्यात डॉक्टरांना दाखवा." } },
  { code: "pnc_self_harm", type: "pnc", severity: "refer_now", urgent: true, covers: ["self_harm", "low_mood"],
    threshold: "Thoughts of harming herself or the baby said", src: `${DOC.ssbsk}, Form 4 p.115 (psychological distress: prompt referral to the CHO/MO); ${DOC.telemanas}`,
    when: (r) => S(r, "self_harm"),
    title: "Thoughts of self-harm", why: () => "She spoke of harming herself or the baby.",
    action: "Do not leave her alone. Tell the nurse (ANM) or medical officer now. Call Tele-MANAS 14416 (free, 24 hours) with her.",
    say: { en: "Do not leave her alone. Tell the nurse or doctor now, and call one four four one six together.", hi: "उन्हें अकेला मत छोड़िए। अभी एएनएम या डॉक्टर को बताइए, और साथ में एक चार चार एक छह पर फ़ोन कीजिए।", mr: "तिला एकटं सोडू नका. आत्ताच एएनएम किंवा डॉक्टरांना कळवा, आणि सोबत एक चार चार एक सहा वर फोन करा." } },
  { code: "pnc_breast", type: "pnc", severity: "refer_now", urgent: false, covers: ["breast_problem"],
    threshold: "Breast pain, swelling or cracked nipple said", src: `${DOC.ssbsk}, Form 3 p.114 (breast engorgement or cracked nipple; pain or difficulty in breastfeeding: if YES, refer to health facility in consultation with ANM/CHO); ${DOC.mcp}, postpartum care table`,
    when: (r) => S(r, "breast_problem"),
    title: "Breast problem", why: () => "Breast pain, swelling or a cracked nipple.",
    action: "Call the nurse (ANM) and take her to the PHC today. Meanwhile help with attachment and frequent feeds.",
    say: { en: "Breast problem. Call the nurse and take her to the PHC today.", hi: "स्तन में तकलीफ़ है। एएनएम को फ़ोन कीजिए और आज ही पीएचसी ले जाइए।", mr: "स्तनात त्रास आहे. एएनएमला फोन करा आणि आजच पीएचसीला न्या." } },

  // ---------- newborn (SSBSK 2026: any single danger sign means immediate referral) ----------
  { code: "nb_not_feeding", type: "newborn", severity: "refer_now", urgent: true,
    threshold: "Not able to feed", src: `${DOC.ssbsk}, Table 3.3 p.22`,
    when: (r) => r.feeding === "none",
    title: "Not able to feed", why: () => "A newborn danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby is not feeding. This is a danger sign. Take the baby to the hospital now.", hi: "बच्चा दूध नहीं पी रहा। यह ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बाळ दूध पीत नाही. हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_poor_feeding", type: "newborn", severity: "watch", urgent: false,
    threshold: "Feeding less than usual", src: `${DOC.hbnc}, sepsis checklist (feeding less)`,
    when: (r) => r.feeding === "poor",
    title: "Feeding less", why: () => "The baby is feeding less than usual.",
    action: "Help with breastfeeding position; visit again tomorrow.",
    say: { en: "The baby is feeding less. Help the mother with breastfeeding, and visit again tomorrow.", hi: "बच्चा कम दूध पी रहा है। माँ को दूध पिलाने में मदद कीजिए, और कल फिर आइए।", mr: "बाळ कमी दूध पीत आहे. आईला स्तनपानात मदत करा, आणि उद्या पुन्हा या." } },
  { code: "nb_convulsions", type: "newborn", severity: "refer_now", urgent: true, covers: ["convulsions"],
    threshold: "Fits said", src: `${DOC.ssbsk}, Table 3.3 p.22`,
    when: (r) => S(r, "convulsions"),
    title: "Fits", why: () => "Convulsions are a newborn danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby is having fits. Take the baby to the hospital now and call one zero eight.", hi: "बच्चे को झटके आ रहे हैं। अभी अस्पताल ले जाइए और एक सौ आठ पर फ़ोन कीजिए।", mr: "बाळाला झटके येत आहेत. आत्ताच दवाखान्यात न्या आणि एकशे आठ वर फोन करा." } },
  { code: "nb_fast_breathing", type: "newborn", severity: "refer_now", urgent: true,
    threshold: "Breathing 60 or more a minute", src: `${DOC.cho_nb} (60 or more per minute); ${DOC.ssbsk}, Form 3 for CHO/ANM p.119 ('Fast breathing: 60 bpm or more'; Table 3.3 says more than 60)`,
    when: (r) => has(r.resp_rate) && r.resp_rate >= 60,
    title: "Fast breathing", why: (r) => `${r.resp_rate} breaths a minute is 60 or more.`,
    action: "Count again for a full minute. If still 60 or more, take the baby to the newborn unit (SNCU) now.",
    say: { en: "The baby is breathing fast. Count again for one minute. If it is sixty or more, take the baby to the hospital now.", hi: "बच्चा तेज़ साँस ले रहा है। एक मिनट फिर से गिनिए। साठ या ज़्यादा हो तो अभी अस्पताल ले जाइए।", mr: "बाळ जलद श्वास घेत आहे. एक मिनिट पुन्हा मोजा. साठ किंवा जास्त असेल तर आत्ताच दवाखान्यात न्या." } },
  { code: "nb_difficulty_breathing", type: "newborn", severity: "refer_now", urgent: true, covers: ["difficulty_breathing"],
    threshold: "Difficulty breathing said", src: `${DOC.ssbsk}, Table 3.3 p.22 (difficulty in breathing)`,
    when: (r) => S(r, "difficulty_breathing"),
    title: "Difficulty breathing", why: () => "A newborn danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby has difficulty breathing. This is a danger sign. Take the baby to the hospital now.", hi: "बच्चे को साँस लेने में तकलीफ़ है। यह ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बाळाला श्वास घ्यायला त्रास होतो. हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_cyanosis", type: "newborn", severity: "refer_now", urgent: true, covers: ["cyanosis"],
    threshold: "Blue lips or tongue said", src: `${DOC.sba}, p.64 ("Check for central cyanosis (blue tongue and lips). This is an abnormality and such cases need to be urgently referred")`,
    when: (r) => S(r, "cyanosis"),
    title: "Blue lips or tongue", why: () => "Central cyanosis.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby's lips are blue. This is a danger sign. Take the baby to the hospital now.", hi: "बच्चे के होंठ नीले हैं। यह ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बाळाचे ओठ निळे आहेत. हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_chest_indrawing", type: "newborn", severity: "refer_now", urgent: true, covers: ["chest_indrawing"],
    threshold: "Chest indrawing said", src: `${DOC.ssbsk}, Table 3.3 p.22 (severe chest indrawing)`,
    when: (r) => S(r, "chest_indrawing"),
    title: "Chest indrawing", why: () => "Severe chest indrawing is a newborn danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby's chest is pulling in. This is a danger sign. Take the baby to the hospital now.", hi: "बच्चे की पसली चल रही है। यह ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बाळाची छाती आत ओढली जात आहे. हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_lethargy", type: "newborn", severity: "refer_now", urgent: true, covers: ["lethargy"],
    threshold: "Moves only when touched, or not at all", src: `${DOC.ssbsk}, Table 3.3 p.22`,
    when: (r) => S(r, "lethargy"),
    title: "Moves only when touched", why: () => "Movement only when stimulated, or none.",
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby is not moving well. This is a danger sign. Take the baby to the hospital now.", hi: "बच्चा ठीक से हिल नहीं रहा। यह ख़तरे का निशान है। अभी अस्पताल ले जाइए।", mr: "बाळ नीट हालचाल करत नाही. हे धोक्याचे लक्षण आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_fever", type: "newborn", severity: "refer_now", urgent: true, covers: ["hot_to_touch"],
    threshold: "37.5 °C (99.5 °F) or more, or hot to touch", src: `${DOC.ssbsk}, Table 3.3 p.22`,
    when: (r) => tAtLeast(r, 37.5) || S(r, "hot_to_touch"),
    title: "Fever", why: (r) => has(tempC(r)) ? `${showT(r)} is 37.5 °C or above.` : "The baby is hot to touch.",
    action: "Take the baby to the newborn unit (SNCU) now.",
    say: { en: "The baby has a fever. Take the baby to the hospital now.", hi: "बच्चे को बुखार है। अभी अस्पताल ले जाइए।", mr: "बाळाला ताप आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_hypothermia", type: "newborn", severity: "refer_now", urgent: true, covers: ["cold_to_touch"],
    threshold: "Below 36 °C (96.8 °F), or cold to touch", src: `${DOC.ssbsk}, Table 3.3 p.22 ('less than 36 °C'; the June 2026 draft said 35.5 °C)`,
    when: (r) => tBelow(r, 36) || S(r, "cold_to_touch"),
    title: "Too cold", why: (r) => has(tempC(r)) ? `${showT(r)} is below 36 °C.` : "The baby is cold to touch.",
    action: "Skin-to-skin with the mother now, cover the head, and take the baby to the newborn unit (SNCU) now.",
    say: { en: "The baby is too cold. Keep the baby skin to skin with the mother, and take the baby to the hospital now.", hi: "बच्चा बहुत ठंडा है। माँ की छाती से लगाकर रखिए, और अभी अस्पताल ले जाइए।", mr: "बाळ खूप थंड आहे. आईच्या छातीशी लावून ठेवा, आणि आत्ताच दवाखान्यात न्या." } },
  { code: "nb_cool", type: "newborn", severity: "watch", urgent: false,
    threshold: "36 to 36.4 °C", src: `${DOC.cho_nb} (skin-to-skin if below 36.5 °C); ${DOC.hbnc} (below 97 F: advise warmth)`,
    when: (r) => tAtLeast(r, 36) && tBelow(r, 36.5),
    title: "A little cold", why: (r) => `${showT(r)} is below 36.5 °C.`,
    action: "Skin-to-skin with the mother, cover the head and feet, and visit again tomorrow.",
    say: { en: "The baby is a little cold. Keep the baby skin to skin and cover the head. I will visit again tomorrow.", hi: "बच्चा थोड़ा ठंडा है। माँ की छाती से लगाकर रखिए और सिर ढकिए। कल फिर आऊँगी।", mr: "बाळ थोडे थंड आहे. आईच्या छातीशी लावून ठेवा आणि डोके झाका. उद्या पुन्हा येईन." } },
  { code: "nb_jaundice_palms", type: "newborn", severity: "refer_now", urgent: true, covers: ["jaundice_palms_soles", "jaundice"],
    threshold: "Yellow palms or soles said", src: `${DOC.ssbsk}, Table 3.3 p.22 (yellow discolouration in palm and feet)`,
    when: (r) => S(r, "jaundice_palms_soles"),
    title: "Yellow palms or soles", why: () => "Jaundice reaching the palms and soles.",
    action: "Take the baby to the newborn unit (SNCU) now.",
    say: { en: "The palms or soles are yellow. Take the baby to the hospital now.", hi: "हथेली या तलवे पीले हैं। अभी अस्पताल ले जाइए।", mr: "तळवे पिवळे आहेत. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_jaundice_early", type: "newborn", severity: "refer_now", urgent: true, covers: ["jaundice"],
    threshold: "Jaundice on day 0 or 1", src: `${DOC.ssbsk}, Form 3 for CHO/ANM p.119 (jaundice in an infant less than 24 hours old is a danger sign); ${DOC.jobaid}`,
    when: (r) => S(r, "jaundice") && has(r.day) && r.day <= 1,
    title: "Jaundice on the first day", why: () => "Yellowness on day 1 is a danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now.",
    say: { en: "Jaundice on the first day is dangerous. Take the baby to the hospital now.", hi: "पहले दिन पीलिया ख़तरनाक है। अभी अस्पताल ले जाइए।", mr: "पहिल्या दिवशी कावीळ धोकादायक आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_jaundice_late", type: "newborn", severity: "refer_now", urgent: false, covers: ["jaundice"],
    threshold: "Jaundice after day 14", src: `${DOC.jobaid} (refer if yellowness is noticed on day 1 or after day 14); ${DOC.hbnc} (jaundice persisting beyond 14 days)`,
    when: (r) => S(r, "jaundice") && has(r.day) && r.day > 14,
    title: "Jaundice after two weeks", why: (r) => `Jaundice on day ${r.day}.`,
    action: "Take the baby to the PHC or the newborn unit (SNCU) today.",
    say: { en: "Jaundice after two weeks. Take the baby to the hospital today.", hi: "दो हफ़्ते के बाद भी पीलिया है। आज ही अस्पताल ले जाइए।", mr: "दोन आठवड्यांनंतरही कावीळ आहे. आजच दवाखान्यात न्या." } },
  { code: "nb_blood_stool", type: "newborn", severity: "refer_now", urgent: true, covers: ["blood_stool"],
    threshold: "Blood in stool said", src: `${DOC.ssbsk}, Table 3.3 p.22`,
    when: (r) => S(r, "blood_stool"),
    title: "Blood in stool", why: () => "A newborn danger sign.",
    action: "Take the baby to the newborn unit (SNCU) now.",
    say: { en: "There is blood in the stool. Take the baby to the hospital now.", hi: "मल में खून है। अभी अस्पताल ले जाइए।", mr: "शीमध्ये रक्त आहे. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_very_low_weight", type: "newborn", severity: "refer_now", urgent: true,
    threshold: "Weight under 1800 g", src: `${DOC.cho_nb} (below 1800 g: refer urgently to NBSU/SNCU); ${DOC.jobaid} (weight under 1800 g: refer)`,
    when: (r) => has(r.weight_g) && r.weight_g < 1800,
    title: "Very low weight", why: (r) => `${r.weight_g} g is below 1800 g.`,
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby weighs less than one thousand eight hundred grams. Take the baby to the hospital now and keep the baby warm.", hi: "बच्चे का वज़न अठारह सौ ग्राम से कम है। अभी अस्पताल ले जाइए और बच्चे को गरम रखिए।", mr: "बाळाचे वजन अठराशे ग्रॅमपेक्षा कमी आहे. आत्ताच दवाखान्यात न्या आणि बाळाला उबदार ठेवा." } },
  { code: "nb_low_weight", type: "newborn", severity: "watch", urgent: false,
    threshold: "Weight 1800 to 2499 g", src: `${DOC.cho_nb} (1800-2500 g: low weight, keep warm, feeding support)`,
    when: (r) => has(r.weight_g) && r.weight_g >= 1800 && r.weight_g < 2500,
    title: "Low weight", why: (r) => `${r.weight_g} g is under 2500 g.`,
    action: "Keep warm and feed often; weigh again at the next visit. If this was the birth weight, the baby is at risk under SSBSK (9 visits).",
    say: { en: "Low weight. Keep the baby warm and feed often.", hi: "वज़न कम है। बच्चे को गरम रखिए और बार-बार दूध पिलाइए।", mr: "वजन कमी आहे. बाळाला उबदार ठेवा आणि वारंवार दूध पाजा." } },
  { code: "nb_at_risk_birth_weight", type: "newborn", severity: "watch", urgent: false,
    threshold: "Birth weight under 2500 g", src: `${DOC.ssbsk}, at-risk newborn criteria and visit schedule (birth weight under 2500 g: 9 visits, joint ANM visits on days 3 and 7)`,
    when: (r) => has(r.birth_weight_g) && r.birth_weight_g < 2500,
    title: "At-risk newborn (low birth weight)", why: (r) => `Birth weight ${r.birth_weight_g} g is under 2500 g.`,
    action: "At-risk baby: 9 home visits (days 1, 3, 5, 7, 10, 14, 21, 28, 42) and joint nurse (ANM) visits on days 3 and 7. Tell the nurse (ANM).",
    say: { en: "The birth weight was low. This baby needs extra visits. Tell the nurse.", hi: "जन्म के समय वज़न कम था। इस बच्चे को ज़्यादा विज़िट चाहिए। एएनएम को बताइए।", mr: "जन्माच्या वेळी वजन कमी होते. या बाळाला जास्त भेटी लागतील. एएनएमला कळवा." } },
  { code: "nb_preterm", type: "newborn", severity: "watch", urgent: false,
    threshold: "Born before 37 weeks", src: `${DOC.ssbsk}, at-risk newborn criteria (preterm, born before 37 weeks of gestation: 9 visits; managed at home, not a danger sign)`,
    when: (r) => r.preterm === true || (has(r.weeks_at_birth) && r.weeks_at_birth < 37),
    title: "Born early (at-risk newborn)", why: (r) => has(r.weeks_at_birth) ? `Born at ${r.weeks_at_birth} weeks.` : "Born before time.",
    action: "At-risk baby: 9 home visits (days 1, 3, 5, 7, 10, 14, 21, 28, 42), joint nurse (ANM) visits on days 3 and 7. Keep warm, skin to skin, feed often.",
    say: { en: "The baby was born early. This baby needs extra visits. Keep the baby warm and tell the nurse.", hi: "बच्चा समय से पहले पैदा हुआ है। इसे ज़्यादा विज़िट चाहिए। बच्चे को गरम रखिए और एएनएम को बताइए।", mr: "बाळ वेळेआधी जन्मले आहे. याला जास्त भेटी लागतील. बाळाला उबदार ठेवा आणि एएनएमला कळवा." } },
  { code: "nb_abdominal_distension", type: "newborn", severity: "watch", urgent: false, covers: ["abdominal_distension"],
    threshold: "Swollen belly said", src: `${DOC.hbnc}, sepsis checklist ("distended abdomen or vomits often"; one sign: visit every day)`,
    when: (r) => S(r, "abdominal_distension"),
    title: "Swollen belly", why: () => "A sign on the sepsis checklist.",
    action: "Tell the nurse (ANM) today and visit every day. A second sign means the newborn unit (SNCU) now.",
    say: { en: "The baby's belly is swollen. Tell the nurse today, and I will visit every day.", hi: "बच्चे का पेट फूला है। आज एएनएम को बताइए, मैं रोज़ आऊँगी।", mr: "बाळाचे पोट फुगले आहे. आज एएनएमला कळवा, मी रोज येईन." } },
  { code: "nb_cord_infection", type: "newborn", severity: "refer_now", urgent: false, covers: ["cord_pus"],
    threshold: "Pus, redness or bleeding at the cord said", src: `${DOC.ssbsk}, Form 3 p.114 (pus or bleeding from umbilicus: if YES, refer in consultation with ANM/CHO); ${DOC.cho_nb} (umbilicus red or draining pus)`,
    when: (r) => S(r, "cord_pus"),
    title: "Cord infection", why: () => "Redness, pus or bleeding at the cord.",
    action: "Call the nurse (ANM) now and take the baby to the PHC today. Keep the cord clean and dry.",
    say: { en: "The cord looks infected. Call the nurse and take the baby to the PHC today.", hi: "नाल में इन्फ़ेक्शन लग रहा है। एएनएम को फ़ोन कीजिए और आज ही पीएचसी ले जाइए।", mr: "नाळेला संसर्ग दिसतो. एएनएमला फोन करा आणि आजच पीएचसीला न्या." } },
  { code: "nb_skin_pustules", type: "newborn", severity: "refer_now", urgent: false, covers: ["skin_pustules"],
    threshold: "Pus spots on the skin said", src: `${DOC.ssbsk}, Form 3 p.114 (skin pustules: if YES, refer in consultation with ANM/CHO)`,
    when: (r) => S(r, "skin_pustules"),
    title: "Skin pustules", why: () => "Pus spots on the skin.",
    action: "Call the nurse (ANM) now and take the baby to the PHC today.",
    say: { en: "There are pus spots on the skin. Call the nurse and take the baby to the PHC today.", hi: "त्वचा पर फुंसियां हैं। एएनएम को फ़ोन कीजिए और आज ही पीएचसी ले जाइए।", mr: "त्वचेवर पुटकुळ्या आहेत. एएनएमला फोन करा आणि आजच पीएचसीला न्या." } },
  { code: "nb_eye_discharge", type: "newborn", severity: "refer_now", urgent: false, covers: ["eye_discharge"],
    threshold: "Discharge from the eyes said", src: `${DOC.ssbsk}, Form 3 p.114 (discharge from eyes: if YES, refer in consultation with ANM/CHO)`,
    when: (r) => S(r, "eye_discharge"),
    title: "Eye discharge", why: () => "Discharge or pus from the eyes.",
    action: "Call the nurse (ANM) now and take the baby to the PHC today.",
    say: { en: "There is discharge from the eyes. Call the nurse and take the baby to the PHC today.", hi: "आँख से कीचड़ या पानी आ रहा है। एएनएम को फ़ोन कीजिए और आज ही पीएचसी ले जाइए।", mr: "डोळ्यातून स्राव येत आहे. एएनएमला फोन करा आणि आजच पीएचसीला न्या." } },
  { code: "nb_sepsis_signs", type: "newborn", severity: "refer_now", urgent: true, covers: ["weak_cry", "vomiting", "abdominal_distension"],
    threshold: "Two or more signs of the HBNC sepsis checklist", src: `${DOC.hbnc}, sepsis checklist (at least two criteria: sepsis, refer to SNCU immediately)`,
    when: (r) => sepsisCount(r) >= 2,
    title: "Signs of sepsis", why: (r) => `Signs of sepsis: ${sepsisSigns(r).join(" and ")}, ${sepsisCount(r)} signs on the sepsis checklist.`,
    action: "Take the baby to the newborn unit (SNCU) now. Call 108.",
    say: { en: "The baby has two or more signs of infection. Take the baby to the hospital now.", hi: "बच्चे में इन्फ़ेक्शन के दो या ज़्यादा निशान हैं। अभी अस्पताल ले जाइए।", mr: "बाळात संसर्गाची दोन किंवा जास्त लक्षणे आहेत. आत्ताच दवाखान्यात न्या." } },
  { code: "nb_weak_cry", type: "newborn", severity: "watch", urgent: false, covers: ["weak_cry"],
    threshold: "Weak cry said", src: `${DOC.hbnc}, sepsis checklist (cry weak; one sign: visit every day)`,
    when: (r) => S(r, "weak_cry"),
    title: "Weak cry", why: () => "A sign on the sepsis checklist.",
    action: "Tell the nurse (ANM) today and visit every day. A second sign means the newborn unit (SNCU) now.",
    say: { en: "The baby's cry is weak. Tell the nurse today, and I will visit every day.", hi: "बच्चे का रोना कमज़ोर है। आज एएनएम को बताइए, मैं रोज़ आऊँगी।", mr: "बाळाचे रडणे कमी आहे. आज एएनएमला कळवा, मी रोज येईन." } },
  { code: "nb_vomiting", type: "newborn", severity: "watch", urgent: false, covers: ["vomiting"],
    threshold: "Vomiting said", src: `${DOC.hbnc}, sepsis checklist (vomits often; one sign: visit every day)`,
    when: (r) => S(r, "vomiting"),
    title: "Vomiting", why: () => "Vomiting often is a sign on the sepsis checklist.",
    action: "Tell the nurse (ANM) today and visit every day. A second sign means the newborn unit (SNCU) now.",
    say: { en: "The baby is vomiting. Tell the nurse today, and I will visit every day.", hi: "बच्चे को उल्टी हो रही है। आज एएनएम को बताइए, मैं रोज़ आऊँगी।", mr: "बाळाला उलट्या होत आहेत. आज एएनएमला कळवा, मी रोज येईन." } },
  { code: "nb_diarrhoea", type: "newborn", severity: "watch", urgent: false, covers: ["diarrhoea"],
    threshold: "Loose stools said", src: `${DOC.ssbsk}, Form 3 for CHO/ANM p.119 (diarrhoea without dehydration: sick, not a danger sign)`,
    when: (r) => S(r, "diarrhoea"),
    title: "Loose stools", why: () => "Diarrhoea in a newborn.",
    action: "Keep breastfeeding often and tell the nurse (ANM) today. Blood in stool, sunken eyes or slow skin pinch means the newborn unit (SNCU) now.",
    say: { en: "The baby has loose stools. Keep breastfeeding, and tell the nurse today.", hi: "बच्चे को दस्त हैं। दूध पिलाते रहिए, और आज एएनएम को बताइए।", mr: "बाळाला जुलाब होत आहेत. स्तनपान चालू ठेवा, आणि आज एएनएमला कळवा." } },
];

// Where each rule sends her, in a few words. The UI groups flags by this.
const D = {
  nbNow: "Newborn unit (SNCU) now, call 108", nbToday: "PHC or newborn unit (SNCU) today", nbAnm: "Call the nurse (ANM); PHC today",
  fruNow: "FRU (hospital) now, call 108", fru102: "FRU (hospital) now, call 102 or 108", fruToday: "FRU or district hospital today",
  phcToday: "PHC today", phcNow: "PHC doctor (MO) now, call 102 or 108", moToday: "Medical officer at the PHC today", delivery: "Delivery facility, call 102",
  phcWeek: "PHC or FRU this week", choWeek: "CHO or doctor (MO) this week", selfHarm: "Stay with her; nurse or doctor now; Tele-MANAS 14416",
  anc24: "Tell the nurse (ANM); plan care at the 24-hour PHC", tellAnm: "Tell the nurse (ANM) today", iron: "Iron tablets; tell the nurse (ANM)",
  daily: "Tell the nurse (ANM); visit every day", tomorrow: "Visit again tomorrow", atRisk: "At-risk baby: extra visits; tell the nurse (ANM)",
};
const WHERE = {
  anc_imminent_eclampsia: D.fruNow, anc_severe_hypertension: D.fru102, anc_preeclampsia: D.phcNow, anc_hypertension: D.phcToday,
  anc_headache_vision: D.fru102, anc_severe_anaemia: D.fru102, anc_anaemia_breathless: D.fru102, anc_pallor: D.phcToday,
  anc_moderate_anaemia: D.iron, anc_mild_anaemia: D.iron, anc_bleeding: D.fruNow, anc_leaking: D.fru102, anc_convulsions: D.fruNow,
  anc_high_fever: D.fru102, anc_low_fever: D.tomorrow, anc_fever: D.phcToday, anc_fetal_movement: D.phcToday, anc_swelling: D.phcToday,
  anc_breathless: D.phcToday, anc_abdominal_pain: D.phcToday, anc_burning_urine: D.phcToday, anc_discharge: D.moToday,
  anc_labour_prolonged: D.fru102, anc_preterm_labour: D.fru102, anc_labour: D.delivery, anc_malpresentation: D.phcWeek,
  anc_multiple_pregnancy: D.phcWeek, anc_vomiting: D.tellAnm, anc_dizziness: D.tellAnm, anc_high_risk: D.anc24,
  pnc_heavy_bleeding: D.fruNow, pnc_severe_hypertension: D.fruNow, pnc_hypertension: D.phcToday, pnc_severe_anaemia: D.fruNow,
  pnc_low_hb: D.fruToday, pnc_anaemia_signs: D.phcToday, pnc_moderate_anaemia: D.iron, pnc_high_fever: D.fruNow, pnc_uti: D.phcToday,
  pnc_infection: D.phcToday, pnc_fever: D.phcToday, pnc_low_fever: D.tomorrow, pnc_convulsions: D.fruNow, pnc_neuro: D.fruNow,
  pnc_headache: D.fruNow, pnc_breathless: D.fruNow, pnc_abdominal_pain: D.phcToday, pnc_swelling: D.phcToday, pnc_jaundice: D.phcToday,
  pnc_incontinence: D.phcToday, pnc_wound_infection: D.phcToday, pnc_calf_pain: D.phcToday, pnc_low_mood: D.choWeek,
  pnc_self_harm: D.selfHarm, pnc_breast: D.nbAnm,
  nb_not_feeding: D.nbNow, nb_poor_feeding: D.tomorrow, nb_convulsions: D.nbNow, nb_fast_breathing: D.nbNow, nb_difficulty_breathing: D.nbNow,
  nb_cyanosis: D.nbNow, nb_chest_indrawing: D.nbNow, nb_lethargy: D.nbNow, nb_fever: D.nbNow, nb_hypothermia: D.nbNow, nb_cool: D.tomorrow,
  nb_jaundice_palms: D.nbNow, nb_jaundice_early: D.nbNow, nb_jaundice_late: D.nbToday, nb_blood_stool: D.nbNow, nb_very_low_weight: D.nbNow,
  nb_low_weight: D.tomorrow, nb_at_risk_birth_weight: D.atRisk, nb_preterm: D.atRisk, nb_abdominal_distension: D.daily,
  nb_cord_infection: D.nbAnm, nb_skin_pustules: D.nbAnm, nb_eye_discharge: D.nbAnm, nb_sepsis_signs: D.nbNow, nb_weak_cry: D.daily,
  nb_vomiting: D.daily, nb_diarrhoea: D.tellAnm,
};

// SSBSK 2026 p.22: danger signs need "pre referral stabilization, and immediate referral";
// SBA 2010 p.81 and the CHO newborn manual: keep the baby warm and breastfeed during transport.
const ON_WAY_NB = "Keep the baby skin to skin and warm, breastfeed if the baby can, and take the mother-and-child card (MCP card).";
const ON_WAY_MOTHER = "Go with her, and take the mother-and-child card (MCP card).";
const ON_WAY_FITS = "Lay her on her left side, keep the airway clear, go with her, and take the mother-and-child card (MCP card).";
for (const r of RULES) {
  if (r.type === "newborn" && r.urgent) { r.onTheWay = ON_WAY_NB; r.action += " On the way: " + ON_WAY_NB.charAt(0).toLowerCase() + ON_WAY_NB.slice(1); r.src += "; on the way: SSBSK 2026 p.22 (pre-referral stabilisation)"; }
  else if (r.urgent) r.onTheWay = r.code.endsWith("_convulsions") ? ON_WAY_FITS : ON_WAY_MOTHER;
  else r.onTheWay = null;
  r.where = WHERE[r.code];
  if (!r.where) throw new Error("rule " + r.code + " has no destination");
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const SYMPTOM_LABELS = {
  anc: {
    bleeding: "Bleeding", leaking_fluid: "Water leaking", convulsions: "Fits", severe_headache: "Severe headache", blurred_vision: "Blurred vision",
    swelling_face_hands: "Swelling of face or hands", swelling_feet: "Swelling of feet", fever: "Fever", breathless: "Breathlessness",
    abdominal_pain: "Stomach pain", vomiting: "Vomiting", dizziness: "Giddiness or weakness", burning_urine: "Burning urine", foul_discharge: "Abnormal discharge",
    high_fever: "High fever", labour_pain: "Labour pains", pallor: "Paleness",
  },
  pnc: {
    heavy_bleeding: "Heavy bleeding", fever: "Fever", foul_discharge: "Foul-smelling discharge", convulsions: "Fits", blurred_vision: "Blurred vision",
    abnormal_speech: "Strange speech", breathless: "Difficulty breathing", abdominal_pain: "Stomach pain", burning_urine: "Burning urine",
    swelling_face_hands: "Swelling of face or hands", breast_problem: "Breast problem", dizziness: "Giddiness or weakness",
    severe_headache: "Severe headache", jaundice: "Yellow eyes or skin", incontinence: "Leaking urine or stool", pallor: "Paleness",
    wound_infection: "Infected stitches", calf_pain: "Calf pain or swelling", low_mood: "Low mood", self_harm: "Thoughts of self-harm",
  },
  newborn: {
    convulsions: "Fits", chest_indrawing: "Chest indrawing", lethargy: "Moves only when touched", jaundice: "Jaundice (yellow eyes or skin)",
    jaundice_palms_soles: "Yellow palms or soles", blood_stool: "Blood in stool", cord_pus: "Cord pus or redness", skin_pustules: "Skin pustules",
    eye_discharge: "Eye discharge", cold_to_touch: "Cold to touch", hot_to_touch: "Hot to touch", weak_cry: "Weak cry", vomiting: "Vomiting",
    diarrhoea: "Loose stools", difficulty_breathing: "Difficulty breathing", abdominal_distension: "Swollen belly", cyanosis: "Blue lips or tongue",
  },
};
export const FIELD_LABELS = {
  name: "Name", day: "Days since birth", weight_g: "Weight (g)", birth_weight_g: "Birth weight (g)", temp_c: "Temperature (°C)", temp_f: "Temperature as said (°F)",
  resp_rate: "Breaths a minute", feeding: "Feeding", weeks: "Weeks pregnant", month: "Month of pregnancy", bp_sys: "BP (upper)", bp_dia: "BP (lower)",
  hb: "Hb (g/dl)", weight_kg: "Weight (kg)", albumin: "Urine albumin", fetal_movement: "Baby's movement", ifa_tablets: "Iron tablets", pads: "Pads a day",
  age: "Age (years)", height_cm: "Height (cm)", labour_hours: "Hours of labour pain", twins: "Twins", prev_caesarean: "Previous caesarean",
  prev_pph: "Bleeding after a previous delivery", prev_aph: "Bleeding in a previous pregnancy", prev_eclampsia: "Fits or eclampsia before",
  prev_stillbirth: "Stillbirth or newborn death before", prev_preterm: "Preterm or small baby before", diabetes: "Diabetes (sugar)", heart_disease: "Heart disease",
  rh_negative: "Rh negative", hiv_syphilis: "HIV or syphilis positive", previous_births: "Births before this pregnancy", malpresentation: "Baby not head down",
  td_doses: "Td injections", weeks_at_birth: "Weeks at birth", preterm: "Born early", birth_place: "Place of birth",
};
export const symptomLabel = (type, code) => SYMPTOM_LABELS[type]?.[code] || String(code).replace(/_/g, " ");
export const fieldLabel = (field) => FIELD_LABELS[field] || String(field).replace(/_/g, " ");

/* ------------------------------------------------------------------ */
/* Checking                                                            */
/* ------------------------------------------------------------------ */

const rank = (f) => (f.urgent ? 0 : f.severity === "refer_now" ? 1 : 2);

/** Every flag that fires for a record, sorted with the most urgent first. */
export function checkRecord(record) {
  if (!record || !record.type) return [];
  const out = [];
  for (const r of RULES) {
    if (r.type !== record.type) continue;
    let fires = false;
    try { fires = !!r.when(record); } catch { fires = false; }
    if (!fires) continue;
    let why = "";
    try { why = r.why(record); } catch { why = ""; }
    out.push({
      code: r.code, severity: r.severity, urgent: !!r.urgent, title: r.title,
      why, action: r.action, where: r.where, onTheWay: r.onTheWay, source: r.src, threshold: r.threshold, say: r.say,
    });
  }
  return out.sort((a, b) => rank(a) - rank(b));
}

export const flagCodes = (record) => checkRecord(record).map((f) => f.code).sort();

const COVERS = Object.fromEntries(RULES.map((r) => [r.code, r.covers || []]));
/**
 * Symptoms said PRESENT that no fired flag speaks for. Never show "No danger signs"
 * while this list is non-empty: show "Noted: tell the nurse" with these labels.
 */
export function noted(record, flags) {
  if (!record || !record.symptoms) return [];
  const fired = (flags || checkRecord(record)).map((f) => (typeof f === "string" ? f : f.code));
  const covered = new Set(fired.flatMap((c) => COVERS[c] || []));
  return Object.entries(record.symptoms)
    .filter(([code, v]) => v === true && !covered.has(code))
    .map(([code]) => ({ code, label_en: symptomLabel(record.type, code) }));
}

export const RULE_TABLE = RULES.map((r) => ({ code: r.code, type: r.type, severity: r.severity, urgent: !!r.urgent, title: r.title, threshold: r.threshold, action: r.action, where: r.where, onTheWay: r.onTheWay, source: r.src }));

/**
 * Group fired flags by what to do, so a screen or slip says each destination once.
 * Returns [{ where, urgent, severity, flags, onTheWay }], most urgent first. When any flag
 * refers, every flag (lower-level referrals and watch advice included) folds under the
 * highest-level destination; with only watch flags, they are grouped by their own advice.
 */
export function groupFlags(flags) {
  const list = [...(flags || [])].sort((a, b) => rank(a) - rank(b));
  if (!list.length) return [];
  const top = list[0];
  if (top.severity === "refer_now") {
    const way = top.onTheWay || list.find((f) => f.onTheWay)?.onTheWay || null;
    return [{ where: top.where, urgent: !!top.urgent, severity: "refer_now", flags: list, onTheWay: way }];
  }
  const groups = [];
  for (const f of list) {
    let g = groups.find((x) => x.where === f.where);
    if (!g) groups.push((g = { where: f.where, urgent: false, severity: "watch", flags: [], onTheWay: null }));
    g.flags.push(f);
  }
  return groups;
}
