// The ASHA's visit. She speaks; the reader fills the record; the rules check it;
// the phone says the danger out loud and asks for what is missing, and she
// answers by voice; "save karo" (confirmed with "haan") saves it to the register.
// Everything on screen is English or Roman letters; what the phone says is in
// her language.
import * as U from "./understand.js";
import * as R from "./rules.js";
import { dictate, speak, hush, micMeter, support, LANGS, micState } from "./voice.js";
import { mountChrome, store, esc, api } from "./ui.js";

const { understand, romanize } = U;
const { checkRecord } = R;
mountChrome("/visit");
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// timings can be shortened by the test harness
const T = Object.assign({ first: 8000, pause: 4000, quiet: 30000, answerFirst: 8000, step: 650 }, window.__GB_TIMING || {});

let TYPE = ["newborn", "anc", "pnc"].includes(params.get("type")) ? params.get("type") : store.get("gb-type") || "newborn";
let LANG = ["hi", "mr", "en"].includes(params.get("lang")) ? params.get("lang") : store.get("gb-lang") || "hi";
let utter = [];          // [{ text, via, prefix, set }]
let record = { type: TYPE };
let evidence = {};       // field -> { u, start, end }
let flags = [];
let doubts = {};         // field -> { field, heard, say_en }
let spoken = new Set();  // alert codes already said out loud
let asked = new Map();   // question key -> times spoken
let skipped = new Set(), notChecked = new Set();
let asking = null;       // the question the app is waiting on: { key, field, ... }
let followUp = null;     // "which one?" after a yes to the danger list
let retries = 0;
let pending = null;      // { kind: "save" | "clear" } waiting for haan / nahi
let banner = null;       // { kind, ... } a one-line notice with an action
let lastCleared = null;  // the visit cleared by "naya", for "wapas"
let saved = null;        // the saved visit, or { queued: true }
let saving = false;
let playing = false;     // an example is being replayed
let session = null, stopMeter = null, lastFilled = new Set(), lastError = null;
let personId = params.get("person") || null, personLabel = null;
let offerSave = false, switchedNow = false;

/* ---------- words the phone says, in her language ---------- */
const L = (o) => o[LANG] || o.en;
const LINES = {
  reprompt: { en: "Didn't catch that, say it again.", hi: "समझ नहीं आया, फिर से बताइए।", mr: "समजलं नाही, पुन्हा सांगा." },
  which: { en: "Which one?", hi: "कौन सा?", mr: "कोणतं?" },
  number: { en: "Tell me the number.", hi: "कितना है, बताइए।", mr: "किती आहे, सांगा." },
  confirmSave: { en: "Save? Say yes or no.", hi: "सेव करूँ? हाँ या नहीं बोलिए।", mr: "जतन करू? हो किंवा नाही सांगा." },
  notSaved: { en: "OK, not saved.", hi: "ठीक है, सेव नहीं किया।", mr: "ठीक आहे, जतन केलं नाही." },
  confirmClear: { en: "This visit is not saved. Clear it? Say yes or no.", hi: "यह विज़िट सेव नहीं हुई। मिटा दूँ? हाँ या नहीं बोलिए।", mr: "ही भेट जतन झाली नाही. पुसू का? हो किंवा नाही सांगा." },
  kept: { en: "OK, the visit is kept.", hi: "ठीक है, विज़िट रखी है।", mr: "ठीक आहे, भेट ठेवली आहे." },
  cleared: { en: "Cleared. Say undo to bring it back.", hi: "मिटा दिया। वापस लाने के लिए 'वापस' बोलिए।", mr: "पुसली. परत आणण्यासाठी 'परत' म्हणा." },
  restored: { en: "The visit is back.", hi: "विज़िट वापस आ गई।", mr: "भेट परत आली." },
  savedRefer: { en: "Visit saved. Referral sent to the nurse.", hi: "विज़िट सेव हो गई। नर्स को रेफरल भेज दिया।", mr: "भेट जतन झाली. नर्सला रेफरल पाठवला." },
  saved: { en: "Visit saved.", hi: "विज़िट सेव हो गई।", mr: "भेट जतन झाली." },
  queued: { en: "Saved on this phone. It will be sent to the nurse when there is signal.", hi: "फ़ोन में सेव हो गई। सिग्नल आने पर नर्स को भेज देंगे।", mr: "फोनमध्ये जतन झाली. सिग्नल आल्यावर नर्सला पाठवू." },
  allDone: { en: "All filled. Say save to save the visit.", hi: "सब भर गया। सेव करने के लिए 'सेव करो' बोलिए।", mr: "सगळं भरलं. जतन करण्यासाठी 'जतन करा' म्हणा." },
  nothing: { en: "Didn't hear anything. Tap the mic and try again.", hi: "कुछ सुनाई नहीं दिया। माइक दबाकर फिर से बोलिए।", mr: "काही ऐकू आलं नाही. माइक दाबून पुन्हा बोला." },
  blocked: { en: "The microphone is blocked. Type the visit below.", hi: "माइक बंद है। नीचे टाइप कीजिए।", mr: "माइक बंद आहे. खाली टाइप करा." },
  offline: { en: "No internet, so the phone can't listen. Type the visit below.", hi: "इंटरनेट नहीं है, इसलिए फ़ोन सुन नहीं सकता। नीचे टाइप कीजिए।", mr: "इंटरनेट नाही, त्यामुळे फोन ऐकू शकत नाही. खाली टाइप करा." },
  noMic: { en: "No microphone found. Type the visit below.", hi: "माइक नहीं मिला। नीचे टाइप कीजिए।", mr: "माइक सापडला नाही. खाली टाइप करा." },
  skipped: { en: "Skipped.", hi: "छोड़ दिया।", mr: "सोडलं." },
  notChecked: { en: "Marked not checked.", hi: "नहीं देखा, लिख लिया।", mr: "तपासलं नाही, लिहून घेतलं." },
};
const TYPE_SAY = {
  anc: { en: "This sounds like a pregnancy visit; switched.", hi: "यह गर्भवती की विज़िट लगती है, बदल दिया।", mr: "ही गरोदरपणाची भेट वाटते, बदलली." },
  newborn: { en: "This sounds like a newborn visit; switched.", hi: "यह नवजात बच्चे की विज़िट लगती है, बदल दिया।", mr: "ही नवजात बाळाची भेट वाटते, बदलली." },
  pnc: { en: "This sounds like a visit to a mother after birth; switched.", hi: "यह डिलीवरी के बाद माँ की विज़िट लगती है, बदल दिया।", mr: "ही प्रसूतीनंतर आईची भेट वाटते, बदलली." },
};
const TYPE_SET = {
  anc: { en: "Pregnancy visit.", hi: "गर्भवती की विज़िट।", mr: "गरोदरपणाची भेट." },
  newborn: { en: "Newborn visit.", hi: "नवजात बच्चे की विज़िट।", mr: "नवजात बाळाची भेट." },
  pnc: { en: "Visit to a mother after birth.", hi: "डिलीवरी के बाद माँ की विज़िट।", mr: "प्रसूतीनंतर आईची भेट." },
};
const LANG_SET = { hi: "ठीक है, अब हिंदी में।", mr: "ठीक आहे, आता मराठीत.", en: "OK, English now." };

/* ---------- spoken commands: only the whole phrase counts ---------- */
const key = (t) => String(t || "").toLowerCase().replace(/[.,!?।;:"']/g, " ").replace(/\s+/g, " ").trim();
const CMD = {
  save: /^(save|save karo|save kar do|save it|सेव करो|सेव कर दो|सेव कीजिए|सेव्ह करा|जतन करा)$/i,
  stop: /^(bas|बस|bas karo|बस करो|bas itna|बस इतना|that's all|thats all|stop|stop listening|done)$/i,
  read: /^(padh ke sunao|padhke sunao|padh kar sunao|padhkar sunao|पढ़ के सुनाओ|पढ़कर सुनाओ|पढ़ के सुनाइए|पढ़कर सुनाइए|पढ़ के सुनाओ|वाचून दाखवा|वाचून दाखव|vachun dakhva|vaachun daakhva|read back|read it back|read the record|read it out)$/i,
  fresh: /^(new visit|naya|nayi visit|naya visit|नया|नई विज़िट|नया विज़िट|नवीन|नवीन भेट|naveen|navin)$/i,
  undo: /^(undo|वापस|wapas|vapas|wapas karo|वापस करो|वापस लाओ|परत|parat|परत आणा)$/i,
  skip: /^(chhodo|chodo|छोड़ो|छोड़ो|छोड़िए|छोड़िए|aage|आगे|skip|पुढे|pudhe|next|agla|अगला)$/i,
  unchecked: /^(pata nahi|pata nahin|पता नहीं|maloom nahi|मालूम नहीं|माहीत नाही|माहित नाही|mahit nahi|not checked|didn't check|did not check|nahi dekha|नहीं देखा|नहीं जाँचा|नहीं जांचा|तपासलं नाही|तपासले नाही|tapasla nahi|don't know|dont know)$/i,
  yes: /^(haan|han|haa|haan ji|haanji|ji haan|ji|jee|हाँ|हां|हाँ जी|हां जी|जी|जी हाँ|जी हां|हो|होय|हो ना|ho|hoy|yes|yeah|yep|yes please|ok|okay|ठीक है|theek hai|बरोबर|barobar)$/i,
  no: /^(nahi|nahin|nai|na|nahi ji|nahi hai|nahin hai|नहीं|नही|नहीं जी|नहीं है|ना|नाही|नाही आहे|नाय|no|nope|nothing|none|kuch nahi|kuchh nahi|कुछ नहीं|कुछ भी नहीं|koi nahi|कोई नहीं|kahi nahi|काही नाही|kahich nahi|काहीच नाही|कोणतंही नाही|nahi nahi|नहीं नहीं|नाही नाही)$/i,
};
const TYPE_CMD = {
  anc: /^(pregnancy|pregnancy visit|garbhavati|garbhvati|garbhwati|गर्भवती|गरोदर|anc)( visit| विज़िट| विजिट| भेट| wali visit)?$/i,
  newborn: /^(naya janma|नया जन्म|newborn|new born|नवजात|नवजात शिशु|navjaat|navjat|नवजात बाळ)( visit| विज़िट| विजिट| भेट)?$/i,
  pnc: /^(delivery ke baad|डिलीवरी के बाद|डिलिवरी के बाद|प्रसूतीनंतर|prasuti nantar|prasutinantar|after birth|after delivery|mother after birth|pnc)( visit| विज़िट| विजिट| भेट)?$/i,
};
const LANG_CMD = [["mr", /^(marathi|मराठी)( mein| में| madhe| मध्ये| me| please)?$/i], ["hi", /^(hindi|हिंदी|हिन्दी)( mein| में| madhe| मध्ये| me| please)?$/i], ["en", /^(english|इंग्लिश|अंग्रेज़ी|अंग्रेजी)( mein| में| madhe| मध्ये| me| please)?$/i]];

/* ---------- icons (simple, so the screen reads without words) ---------- */
const ic = (body, w = 22) => `<svg class="ic" width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICON = {
  name: ic(`<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>`),
  day: ic(`<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>`),
  weeks: ic(`<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>`),
  weight_g: ic(`<path d="M5 20.5h14l-1.6-11H6.6z"/><circle cx="12" cy="6" r="2.4"/><path d="M12 13.5l2-2"/>`),
  weight_kg: ic(`<path d="M5 20.5h14l-1.6-11H6.6z"/><circle cx="12" cy="6" r="2.4"/><path d="M12 13.5l2-2"/>`),
  temp_c: ic(`<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>`),
  resp_rate: ic(`<path d="M12 4v8M12 9c-1.5 1-2.5 1.5-3.5 1.5"/><path d="M8.5 7.5C6 8 4 11.5 4 16.5c0 2 1 3 2.5 3 2.5 0 4-1.5 4-4.5v-5"/><path d="M12 9c1.5 1 2.5 1.5 3.5 1.5"/><path d="M15.5 7.5C18 8 20 11.5 20 16.5c0 2-1 3-2.5 3-2.5 0-4-1.5-4-4.5v-5"/>`),
  feeding: ic(`<path d="M10 2.5h4M10.5 2.5v3l-2 2.5v11a2.5 2.5 0 0 0 2.5 2.5h2a2.5 2.5 0 0 0 2.5-2.5V8l-2-2.5v-3"/><path d="M8.5 12h7"/>`),
  bp_sys: ic(`<circle cx="12" cy="13" r="7.5"/><path d="M12 13l3.5-3"/><path d="M12 5.5V3.5M7 7.8 5.8 6.6M17 7.8l1.2-1.2"/>`),
  hb: ic(`<path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>`),
  albumin: ic(`<path d="M9 3h6M10 3v12.5a2 2 0 0 0 4 0V3"/><path d="M10 10h4"/>`),
  fetal_movement: ic(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="11" r="2.6"/><path d="M8.6 16.5c1-1.4 2.1-2 3.4-2s2.4.6 3.4 2"/>`),
  pads: ic(`<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 8.5c1.2 1.6 2 2.7 2 3.7a2 2 0 0 1-4 0c0-1 .8-2.1 2-3.7z"/>`),
  ifa_tablets: ic(`<rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="M9.5 8.5l5 7"/>`),
  other: ic(`<circle cx="12" cy="12" r="7.5"/><path d="M12 8v5M12 16h.01"/>`),
  speaker: ic(`<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`, 20),
  tick: ic(`<path d="M5 12.5l4.5 4.5L19 7.5"/>`, 20),
  plus: ic(`<path d="M12 5v14M5 12h14"/>`, 20),
  skip: ic(`<path d="M5 12h12M13 7l5 5-5 5"/>`, 20),
  mic: ic(`<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>`, 20),
  undo: ic(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`, 20),
  question: ic(`<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.2-2.5 3.6M12 16.8h.01"/>`, 20),
};

/* ---------- the record's fields, per visit ---------- */
const FEED = { good: "good", poor: "poor", none: "not feeding" };
const FIELD = {
  name: ["Name", (r) => r.name],
  day: ["Days since birth", (r) => r.day != null ? `${r.day} day${r.day === 1 ? "" : "s"}` : null],
  weight_g: ["Weight", (r) => r.weight_g != null ? `${r.weight_g} g` : null],
  weight_kg: ["Weight", (r) => r.weight_kg != null ? `${r.weight_kg} kg` : null],
  temp_c: ["Temperature", (r) => r.temp_c != null ? `${r.temp_c} °C` : null],
  resp_rate: ["Breaths a minute", (r) => r.resp_rate],
  feeding: ["Feeding", (r) => r.feeding ? FEED[r.feeding] || r.feeding : null],
  weeks: ["Pregnancy", (r) => r.weeks != null ? `${r.weeks} weeks` : r.month != null ? `month ${r.month}` : null],
  bp_sys: ["Blood pressure", (r) => r.bp_sys != null ? `${r.bp_sys}/${r.bp_dia ?? "?"}` : null],
  hb: ["Hb (g/dl)", (r) => r.hb],
  albumin: ["Urine albumin", (r) => r.albumin ? (/\d/.test(r.albumin) ? `${r.albumin}+` : r.albumin) : null],
  fetal_movement: ["Baby moving", (r) => r.fetal_movement],
  pads: ["Pads a day", (r) => r.pads],
  ifa_tablets: ["Iron tablets", (r) => r.ifa_tablets],
};
const TILES = {
  newborn: [["name", "Mother's name"], ["day", "Baby's age"], ["weight_g"], ["temp_c"], ["resp_rate"], ["feeding"]],
  anc: [["name"], ["weeks"], ["bp_sys"], ["hb"], ["albumin"], ["fetal_movement"]],
  pnc: [["name"], ["day"], ["pads"], ["temp_c"], ["bp_sys"], ["hb"]],
};
const EXTRA = { anc: ["weight_kg", "ifa_tablets"], newborn: [], pnc: ["weight_kg"] };
const SKIP_GENERIC = new Set(["type", "symptoms", "bp_dia", "month", "name"]);
const pretty = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
/** Every tile for this visit: the fixed ones, then anything else the record holds. */
function tileList(r = record, type = TYPE) {
  const out = TILES[type].map(([k, lab]) => [k, lab || FIELD[k][0], FIELD[k][1]]);
  const have = new Set(out.map(([k]) => k));
  for (const k of EXTRA[type] || []) if (r[k] != null && !have.has(k)) { out.push([k, FIELD[k][0], FIELD[k][1]]); have.add(k); }
  for (const [k, v] of Object.entries(r)) {
    if (have.has(k) || SKIP_GENERIC.has(k) || v == null || v === "" || typeof v === "object") continue;
    const f = FIELD[k];
    out.push([k, f ? f[0] : pretty(k), f ? f[1] : (x) => (x[k] === true ? "yes" : x[k] === false ? "no" : String(x[k]))]);
    have.add(k);
  }
  return out;
}
const TITLES = { newborn: "Newborn visit", anc: "Pregnancy visit", pnc: "Mother after birth" };
const SYM_LABEL = {
  bleeding: "bleeding", leaking_fluid: "water leaking", convulsions: "fits", severe_headache: "severe headache", blurred_vision: "blurred vision", swelling_face_hands: "swollen face or hands",
  swelling_feet: "swollen feet", fever: "fever", breathless: "breathless", abdominal_pain: "stomach pain", vomiting: "vomiting", dizziness: "dizziness", burning_urine: "burning urine", foul_discharge: "foul discharge",
  heavy_bleeding: "heavy bleeding", abnormal_speech: "strange speech", breast_problem: "breast problem", chest_indrawing: "chest indrawing", lethargy: "moves only when touched", jaundice: "jaundice",
  jaundice_palms_soles: "yellow palms or soles", blood_stool: "blood in stool", cord_pus: "cord infection", skin_pustules: "skin pustules", eye_discharge: "eye discharge", cold_to_touch: "cold to touch",
  hot_to_touch: "hot to touch", weak_cry: "weak cry", diarrhoea: "loose motions", difficulty_breathing: "difficulty breathing",
};
// spoken names of signs: [Hindi, Marathi]
const SYM_SAY = {
  bleeding: ["खून जाना", "रक्तस्राव"], leaking_fluid: ["पानी जाना", "पाणी जाणे"], convulsions: ["झटके", "झटके"], severe_headache: ["तेज़ सिरदर्द", "खूप डोकेदुखी"], blurred_vision: ["धुंधला दिखना", "धूसर दिसणे"],
  swelling_face_hands: ["चेहरे या हाथ पर सूजन", "चेहऱ्यावर किंवा हातावर सूज"], swelling_feet: ["पैरों में सूजन", "पायावर सूज"], fever: ["बुखार", "ताप"], breathless: ["साँस फूलना", "धाप लागणे"],
  abdominal_pain: ["पेट दर्द", "पोटदुखी"], vomiting: ["उल्टी", "उलटी"], dizziness: ["चक्कर", "चक्कर"], burning_urine: ["पेशाब में जलन", "लघवीला जळजळ"], foul_discharge: ["बदबूदार पानी", "दुर्गंधी स्राव"],
  heavy_bleeding: ["बहुत खून जाना", "जास्त रक्तस्राव"], abnormal_speech: ["अजीब बोलना", "विचित्र बोलणे"], breast_problem: ["स्तन में तकलीफ़", "स्तनाचा त्रास"], chest_indrawing: ["पसली चलना", "छाती आत ओढणे"],
  lethargy: ["छूने पर ही हिलना", "स्पर्श केल्यावरच हालचाल"], jaundice: ["पीलिया", "कावीळ"], jaundice_palms_soles: ["हथेली तलवे पीले", "तळवे पिवळे"], blood_stool: ["मल में खून", "शौचात रक्त"],
  cord_pus: ["नाल में मवाद", "नाळेला पू"], skin_pustules: ["फुंसियाँ", "पुटकुळ्या"], eye_discharge: ["आँख से पानी", "डोळ्यातून स्राव"], cold_to_touch: ["छूने पर ठंडा", "स्पर्शाला थंड"],
  hot_to_touch: ["छूने पर गरम", "स्पर्शाला गरम"], weak_cry: ["कमज़ोर रोना", "क्षीण रडणे"], diarrhoea: ["दस्त", "जुलाब"], difficulty_breathing: ["साँस लेने में तकलीफ़", "श्वास घ्यायला त्रास"],
};
const symSay = (k) => LANG === "en" ? (SYM_LABEL[k] || k.replace(/_/g, " ")) : (SYM_SAY[k]?.[LANG === "hi" ? 0 : 1] || SYM_LABEL[k] || k.replace(/_/g, " "));
// which field a flag points at, so the tile turns red or amber
const FLAG_FIELD = {
  anc_imminent_eclampsia: "bp_sys", anc_preeclampsia: "bp_sys", anc_hypertension: "bp_sys", anc_severe_anaemia: "hb", anc_moderate_anaemia: "hb", anc_mild_anaemia: "hb", anc_fetal_movement: "fetal_movement",
  nb_very_low_weight: "weight_g", nb_low_weight: "weight_g", nb_fever: "temp_c", nb_hypothermia: "temp_c", nb_fast_breathing: "resp_rate", nb_not_feeding: "feeding", nb_poor_feeding: "feeding",
  pnc_heavy_bleeding: "pads", pnc_high_fever: "temp_c", pnc_fever: "temp_c",
};
const flagField = (code) => FLAG_FIELD[code] || (/hypertension|eclampsia|_bp/.test(code) ? "bp_sys" : /anaemia|_hb/.test(code) ? "hb" : /weight/.test(code) ? (TYPE === "newborn" ? "weight_g" : "weight_kg") : /fever|hypothermia|temp/.test(code) ? "temp_c" : null);

/* ---------- what the app asks for when something is missing ---------- */
// [field, anchor word put in front of a short answer, question, symptoms (for the danger list), alternative fields, yes/no?]
const ASK = {
  newborn: [
    ["weight_g", "वजन", { en: "What is the baby's weight?", hi: "बच्चे का वज़न कितना है?", mr: "बाळाचं वजन किती आहे?" }],
    ["temp_c", "तापमान", { en: "What is the baby's temperature?", hi: "बच्चे का तापमान कितना है?", mr: "बाळाचं तापमान किती आहे?" }],
    ["resp_rate", "साँस", { en: "Count the breaths for one minute. How many?", hi: "एक मिनट साँस गिनिए। कितनी हैं?", mr: "एक मिनिट श्वास मोजा. किती आहेत?" }],
    ["feeding", "", { en: "Is the baby feeding well?", hi: "क्या बच्चा दूध ठीक से पी रहा है?", mr: "बाळ दूध नीट पितं का?" }, null, null, true],
    ["danger", "", { en: "Any fits, chest indrawing, or yellow palms?", hi: "कोई झटके, पसली चलना, या हथेली पीली?", mr: "झटके, छाती आत ओढणे, किंवा तळवे पिवळे?" }, ["convulsions", "chest_indrawing", "jaundice_palms_soles", "lethargy"], null, true],
  ],
  anc: [
    ["bp_sys", "बीपी", { en: "What is her blood pressure?", hi: "बीपी कितना है?", mr: "बीपी किती आहे?" }],
    ["hb", "हीमोग्लोबिन", { en: "Did you check her Hb (haemoglobin)?", hi: "हीमोग्लोबिन कितना है?", mr: "हिमोग्लोबिन किती आहे?" }],
    ["weeks", "", { en: "How many weeks, or which month?", hi: "कितने हफ्ते, या कौन सा महीना?", mr: "किती आठवडे, किंवा कितवा महिना?" }, null, ["weeks", "month"]],
    ["fetal_movement", "", { en: "Is the baby moving well?", hi: "पेट में बच्चा ठीक हिल रहा है?", mr: "पोटातलं बाळ नीट हलतं का?" }, null, null, true],
    ["danger", "", { en: "Any bleeding, severe headache, or blurred vision?", hi: "कोई खून जाना, तेज़ सिरदर्द, या धुंधला दिखना?", mr: "रक्तस्राव, खूप डोकेदुखी, किंवा धूसर दिसणे?" }, ["bleeding", "severe_headache", "blurred_vision", "convulsions"], null, true],
  ],
  pnc: [
    ["day", "", { en: "How many days since the delivery?", hi: "डिलीवरी को कितने दिन हुए?", mr: "प्रसूतीला किती दिवस झाले?" }],
    ["pads", "पैड", { en: "How many pads a day?", hi: "दिन में कितने पैड?", mr: "दिवसाला किती पॅड?" }],
    ["temp_c", "तापमान", { en: "What is her temperature?", hi: "तापमान कितना है?", mr: "तापमान किती आहे?" }],
    ["bp_sys", "बीपी", { en: "What is her blood pressure?", hi: "बीपी कितना है?", mr: "बीपी किती आहे?" }],
    ["hb", "हीमोग्लोबिन", { en: "Did you check her Hb (haemoglobin)?", hi: "हीमोग्लोबिन कितना है?", mr: "हिमोग्लोबिन किती आहे?" }],
    ["danger", "", { en: "Any fits, blurred vision, severe headache, or foul discharge?", hi: "कोई झटके, धुंधला दिखना, तेज़ सिरदर्द, या बदबूदार पानी?", mr: "झटके, धूसर दिसणे, खूप डोकेदुखी, किंवा दुर्गंधी स्राव?" }, ["convulsions", "blurred_vision", "severe_headache", "foul_discharge", "heavy_bleeding"], null, true],
  ],
};
const ANCHOR = { weight_g: "वजन", weight_kg: "वजन", temp_c: "तापमान", resp_rate: "साँस", bp_sys: "बीपी", bp_dia: "बीपी", hb: "हीमोग्लोबिन", pads: "पैड" };
const SAY_FIELD = { weight_g: ["वज़न", "वजन"], weight_kg: ["वज़न", "वजन"], temp_c: ["तापमान", "तापमान"], resp_rate: ["साँस", "श्वास"], bp_sys: ["बीपी", "बीपी"], bp_dia: ["बीपी", "बीपी"], hb: ["हीमोग्लोबिन", "हिमोग्लोबिन"], pads: ["पैड", "पॅड"], day: ["दिन", "दिवस"], weeks: ["हफ्ते", "आठवडे"], month: ["महीना", "महिना"] };
const fieldsOf = (row) => row[4] || [row[0]];
function missing() {
  return ASK[TYPE].filter((row) => {
    const [field, , , syms] = row;
    if (skipped.has(field) || notChecked.has(field)) return false;
    if (field === "danger") return !(syms || []).some((s) => record.symptoms && s in record.symptoms);
    return !fieldsOf(row).some((f) => record[f] != null);
  });
}
/** The next thing the app needs: a half-heard value first, then a missing field. */
function nextQuestion() {
  for (const d of Object.values(doubts)) {
    if (skipped.has("doubt:" + d.field)) continue;
    const lab = SAY_FIELD[d.field];
    const say = d.say || {};
    const hi = say.hi || d.say_hi || (lab ? `${lab[0]} ठीक से समझ नहीं आया। फिर से बताइए।` : "ठीक से समझ नहीं आया। फिर से बताइए।");
    const mr = say.mr || d.say_mr || (lab ? `${lab[1]} नीट समजलं नाही. पुन्हा सांगा.` : "नीट समजलं नाही. पुन्हा सांगा.");
    const en = d.say_en || say.en || `Say the ${(FIELD[d.field]?.[0] || pretty(d.field)).toLowerCase()} again.`;
    return { key: "doubt:" + d.field, field: d.field, fields: [d.field], prefix: ANCHOR[d.field] || "", q: { en, hi, mr }, doubt: d };
  }
  const row = missing()[0];
  if (!row) return null;
  return { key: row[0], field: row[0], fields: fieldsOf(row), prefix: row[1], q: row[2], syms: row[3], yesno: !!row[5] };
}

/* ---------- examples (in Roman letters; the reader takes Devanagari too) ---------- */
const EXAMPLES = {
  newborn: [
    ["Hindi", "hi", "Sunita ka baby, saat din ka hai. Wajan ek kilo saat sau gram. Doodh kam pee raha hai, aur pasli chal rahi hai.", "Sunita's baby, 7 days old. Weight 1 kg 700 g. Feeding less, and the chest pulls in."],
    ["Marathi", "mr", "Rekhache baal, tisra divas. Vajan don kilo teenshe gram. Doodh neet pitay, taap nahi. Naal suklee aahe.", "Rekha's baby, day 3. Weight 2.3 kg. Feeding well, no fever. The cord is dry."],
    ["English", "en", "Meera's baby, day five, temperature 38.2, breathing 66 a minute, not able to feed.", ""],
  ],
  anc: [
    ["Hindi", "hi", "Meena, battees hafte. BP ek sau chalis by nabbe, nahi nahi, ek sau pachaas by sau. Albumin do plus. Sar mein bahut dard hai.", "Meena, 32 weeks. BP 140 over 90, no no, 150 over 100. Albumin 2+. Bad headache."],
    ["Hindi", "hi", "Rajni, aathva mahina, Hb saadhe chhe hai, saans phoolti hai, bachcha theek hil raha hai.", "Rajni, 8th month, Hb 6.5, gets breathless, the baby is moving well."],
    ["English", "en", "Lalita, 38 weeks, water leaking since last night, baby moving less, BP 118 by 76.", ""],
  ],
  pnc: [
    ["Hindi", "hi", "Sudha, delivery ko paanch din hue, din mein chhe pad badal rahi hai, chakkar aate hain.", "Sudha, 5 days since delivery, changing 6 pads a day, feels dizzy."],
    ["English", "en", "Hema, day 3 after delivery, temperature 98.6, two pads a day, no fever, no foul smell, no fits.", ""],
  ],
};

/* ---------- speaking: one line after another, the mic paused meanwhile ---------- */
let chain = Promise.resolve(), gen = 0;
function say(text, { now = false, lang = LANG } = {}) {
  if (!text) return chain;
  if (now) { gen++; hush(); chain = Promise.resolve(); }
  const my = gen;
  chain = chain.then(() => (my === gen ? speak(text, lang) : null));
  return chain;
}
function quiet() { gen++; hush(); chain = Promise.resolve(); }

/* ---------- drawing ---------- */
function highlightUtterance(u, i) {
  const spans = Object.entries(evidence).filter(([, e]) => e.u === i).map(([f, e]) => ({ f, ...e })).sort((a, b) => a.start - b.start);
  let out = "", at = 0;
  const text = u.text;
  const dangerFields = new Set(flags.filter((x) => x.severity === "refer_now").map((x) => flagField(x.code)).filter(Boolean));
  const dangerSyms = new Set(flags.filter((x) => x.severity === "refer_now").flatMap((x) => Object.keys(record.symptoms || {}).filter((s) => record.symptoms[s] === true && symptomFlag(s) === x.code)));
  for (const sp of spans) {
    if (sp.start < at) continue;
    out += esc(romanize(text.slice(at, sp.start)));
    const sym = sp.f.startsWith("symptoms.") ? sp.f.slice(9) : null;
    const neg = sym && record.symptoms?.[sym] === false;
    const danger = dangerFields.has(sp.f) || (sp.f === "bp_dia" && dangerFields.has("bp_sys")) || (sym && dangerSyms.has(sym));
    out += `<mark data-f="${esc(sp.f)}" class="${neg ? "neg" : ""} ${danger ? "danger" : ""}">${esc(romanize(text.slice(sp.start, sp.end)))}</mark>`;
    at = sp.end;
  }
  out += esc(romanize(text.slice(at)));
  return `<p class="said">${out}</p>`;
}
const symCache = new Map();
function symptomFlag(sym) {
  const k = TYPE + ":" + sym;
  if (!symCache.has(k)) {
    const probe = { type: TYPE, symptoms: { [sym]: true } };
    if (sym === "jaundice") probe.day = 0;
    symCache.set(k, checkRecord(probe).map((f) => f.code)[0]);
  }
  return symCache.get(k);
}
/** Signs said present that no rule flags: these go to the nurse as "noted". */
function notedSigns() {
  if (typeof R.noted === "function") { try { return R.noted(record, flags) || []; } catch { /* fall through */ } }
  const fired = new Set(flags.map((f) => f.code));
  return Object.entries(record.symptoms || {}).filter(([k, v]) => v === true && !(symptomFlag(k) && fired.has(symptomFlag(k)))).map(([code]) => ({ code, label_en: SYM_LABEL[code] || code.replace(/_/g, " ") }));
}
const BIG = {
  newborn: ["Take the baby to the newborn care unit today.", "Take the baby to the hospital now. Call 108."],
  anc: ["Take her to the hospital today.", "Take her to the hospital now. Call 108."],
  pnc: ["Take her to the hospital today.", "Take her to the hospital now. Call 108."],
};
const bigLine = (refer, type = TYPE) => BIG[type][refer.some((f) => /\bnow\b|108/i.test(f.action || "")) ? 1 : 0];
const whyBox = (f) => `<details class="why"><summary>Why</summary><p>${esc(f.why)} <span class="src">Source: ${esc(f.source)} · rule ${esc(f.code)}</span></p></details>`;
const hearBtn = (what, label = "Hear it again") => `<button class="hear" type="button" data-hear="${what}" aria-label="${esc(label)}">${ICON.speaker}<span>${esc(label)}</span></button>`;

function render() {
  // spoken words
  $("#said").innerHTML = utter.length ? utter.map(highlightUtterance).join("") : `<p class="said faint">Nothing yet. Speak, type below, or try an example.</p>`;
  $("#said-note").textContent = utter.some((u) => /[ऀ-ॿ]/.test(u.text)) ? "Shown in Roman letters" : "";
  // tiles
  $("#record-title").textContent = TITLES[TYPE];
  const tiles = tileList();
  const level = {};
  for (const f of flags) { const fld = flagField(f.code); if (fld) level[fld] = level[fld] === "danger" || f.severity === "refer_now" ? "danger" : "watch"; }
  let filled = 0;
  $("#tiles").innerHTML = tiles.map(([k, label, fmt]) => {
    const v = fmt(record);
    const has = v != null && v !== "";
    if (has) filled++;
    const isNew = has && !lastFilled.has(k + ":" + v);
    const state = has ? "" : notChecked.has(k) ? "not checked" : skipped.has(k) ? "skipped" : "";
    const doubt = doubts[k] || (k === "bp_sys" && doubts.bp_dia);
    return `<div class="tile ${has ? "filled tap" : ""} ${level[k] || ""} ${isNew ? "new" : ""} ${doubt ? "doubt" : ""}" data-f="${k}" ${has ? 'role="button" tabindex="0"' : ""} aria-label="${esc(label)}: ${esc(has ? v : state || "not said")}">
      <small>${ICON[k] || ICON.other}<span>${esc(label)}</span></small><b class="${has ? "" : "empty"}">${esc(has ? v : state || "—")}</b></div>`;
  }).join("");
  lastFilled = new Set(tiles.map(([k, , fmt]) => k + ":" + fmt(record)));
  $("#filled-count").textContent = `${filled} of ${tiles.length} filled`;
  // symptoms
  const sy = Object.entries(record.symptoms || {});
  const refSyms = new Set(flags.filter((f) => f.severity === "refer_now").map((f) => f.code));
  const watchSyms = new Set(flags.filter((f) => f.severity === "watch").map((f) => f.code));
  $("#syms").innerHTML = sy.map(([k, v]) => {
    const code = v ? symptomFlag(k) : null;
    const cls = v ? (code && refSyms.has(code) ? "yes" : code && watchSyms.has(code) ? "yes watch" : "yes noted") : "no";
    return `<span class="sym ${cls}" data-f="symptoms.${k}" role="button" tabindex="0">${esc(SYM_LABEL[k] || k.replace(/_/g, " "))}</span>`;
  }).join("");
  // tap a tile to light its words
  document.querySelectorAll("[data-f].tap, .sym[data-f]").forEach((el) => {
    const go = () => { const f = el.dataset.f; document.querySelectorAll(`mark[data-f="${f}"], mark[data-f="${f === "bp_sys" ? "bp_dia" : f}"]`).forEach((m) => { m.classList.add("flash"); setTimeout(() => m.classList.remove("flash"), 1200); }); };
    el.addEventListener("click", go); el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
  });
  // alert
  const refer = flags.filter((f) => f.severity === "refer_now"), watch = flags.filter((f) => f.severity === "watch");
  const noted = notedSigns();
  const anyYes = sy.some(([, v]) => v === true);
  const enough = filled >= 3 || sy.length >= 2;
  let html = "";
  if (refer.length) {
    html += `<div class="alert refer"><div class="alert-head"><h3>${esc(refer[0].title)}${refer.length > 1 ? `, and ${refer.length - 1} more` : ""}</h3><span class="stamp press">REFER TODAY</span></div>
      <p class="alert-do">${esc(bigLine(refer))}</p>
      <ul>${refer.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.action)}${whyBox(f)}</li>`).join("")}</ul>${hearBtn("refer")}</div>`;
  }
  if (watch.length) {
    html += `<div class="alert watch"><h3>${refer.length ? "Also watch" : "No danger sign, but watch"}</h3><ul>${watch.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.action)}${whyBox(f)}</li>`).join("")}</ul>${hearBtn("watch")}</div>`;
  }
  if (noted.length) {
    html += `<div class="alert noted"><h3>Noted, tell the nurse</h3><p>${esc(noted.map((n) => n.label_en).join(", "))}. No rule here covers ${noted.length > 1 ? "these signs" : "this sign"}, so the app can't judge ${noted.length > 1 ? "them" : "it"}. Tell the nurse (ANM) today.</p>${hearBtn("noted")}</div>`;
  }
  if (!refer.length && !watch.length && !noted.length && !anyYes && enough) {
    html = `<div class="alert ok"><h3>No danger signs in what was said</h3><p>Checked against ${TYPE === "newborn" ? "the 2026 newborn danger signs" : TYPE === "anc" ? "the Health Ministry (MoHFW) pregnancy danger signs" : "the danger signs for a mother after birth"}. A sign that wasn't said can't be checked.</p></div>`;
  }
  $("#alert").innerHTML = html;
  $("#fired").innerHTML = flags.length ? `<div class="fired">${flags.map((f) => `<div class="${f.severity === "watch" ? "watch" : ""}"><b>${esc(f.title)}</b>${esc(f.why)}<br><span class="faint">${esc(f.source)} · rule ${esc(f.code)}</span></div>`).join("")}</div>` : `<p class="faint">None yet.</p>`;
  // the question, or the confirm box
  const ask = $("#ask");
  const q = !saved && utter.length ? nextQuestion() : null;
  if (pending) {
    ask.hidden = false; ask.className = "v-ask confirm";
    ask.innerHTML = pending.kind === "save"
      ? `<div class="v-ask-q"><span class="faint">Before saving</span><b>Save this visit?</b><span class="hint">Say "haan" or "nahi", or tap.</span></div><div class="v-ask-btns"><button class="btn small voice" id="yes">${ICON.tick}Yes, save</button><button class="btn small ghost" id="no">No</button></div>`
      : `<div class="v-ask-q"><span class="faint">This visit is not saved</span><b>Clear it and start a new visit?</b><span class="hint">Say "haan" or "nahi", or tap.</span></div><div class="v-ask-btns"><button class="btn small refer" id="yes">Yes, clear</button><button class="btn small ghost" id="no">No, keep it</button></div>`;
    $("#yes").onclick = () => confirmPending(true);
    $("#no").onclick = () => confirmPending(false);
  } else if (q && !playing) {
    ask.hidden = false; ask.className = "v-ask";
    const n = ASK[TYPE].length, i = ASK[TYPE].findIndex((r) => r[0] === q.field);
    const hint = q.yesno ? `Say "haan" or "nahi". Or "skip", or "not checked".` : `Say the answer, "skip", or "not checked".`;
    ask.innerHTML = `<div class="v-ask-q"><span class="faint">${ICON.question}${q.doubt ? "Check this" : `Still to check${i >= 0 ? ` · ${i + 1} of ${n}` : ""}`}</span><b>${esc(followUp ? "Which one? Say the sign." : q.q.en)}</b><span class="hint">${hint}</span></div>
      <div class="v-ask-btns">${hearBtn("ask", "Hear the question")}<button class="btn small voice" id="answer">${ICON.mic}Answer</button><button class="btn small ghost" id="skip">${ICON.skip}Skip</button>${q.field !== "danger" ? `<button class="btn small ghost" id="unchecked">Not checked</button>` : ""}</div>`;
    $("#answer").onclick = () => { asking = q; startListening("answer"); };
    $("#skip").onclick = () => skipQuestion(q, false);
    if ($("#unchecked")) $("#unchecked").onclick = () => skipQuestion(q, true);
  } else { ask.hidden = true; ask.innerHTML = ""; }
  // banner: type switched, visit cleared, saved offline
  const b = $("#banner");
  if (banner?.kind === "switch") b.innerHTML = `<div class="note">${ICON.undo.replace('class="ic"', 'class="ic faint"')}<span>This sounds like a ${esc(TITLES[TYPE].toLowerCase())}, so it switched from ${esc(TITLES[banner.from].toLowerCase())}.</span><button class="btn small ghost" id="undo-switch">Undo</button></div>`;
  else if (banner?.kind === "cleared") b.innerHTML = `<div class="note"><span>The last visit was cleared. Say "wapas" or tap Undo to bring it back.</span><button class="btn small ghost" id="undo-clear">${ICON.undo}Undo</button></div>`;
  else if (banner?.kind === "person") b.innerHTML = `<div class="note"><span>Visit for <b>${esc(banner.label)}</b>, from the nurse's board.</span><button class="btn small ghost" id="drop-person">Not this person</button></div>`;
  else b.innerHTML = "";
  if ($("#undo-switch")) $("#undo-switch").onclick = () => { const from = banner.from; banner = null; switchType(from, { announce: false }); };
  if ($("#undo-clear")) $("#undo-clear").onclick = restoreCleared;
  if ($("#drop-person")) $("#drop-person").onclick = () => { personId = null; banner = null; render(); };
  document.querySelectorAll("[data-hear]").forEach((el) => el.addEventListener("click", () => hear(el.dataset.hear)));
  $("#save").disabled = !utter.length || !!saved || saving;
  $("#readback").disabled = !utter.length;
  drawOutbox();
}
function hear(what) {
  const refer = flags.filter((f) => f.severity === "refer_now"), watch = flags.filter((f) => f.severity === "watch");
  if (what === "refer") say(refer.map((f) => L(f.say || {}) || f.title).join(" "), { now: true });
  else if (what === "watch") say(watch.map((f) => L(f.say || {}) || f.title).join(" "), { now: true });
  else if (what === "noted") say(notedLine(notedSigns()), { now: true });
  else if (what === "ask") { const q = nextQuestion(); if (q) say(followUp ? L(LINES.which) : L(q.q), { now: true }); }
}
function notedLine(noted) {
  const names = noted.map((n) => (LANG === "en" ? n.label_en : symSay(n.code)));
  return LANG === "hi" ? `नोट किया: ${names.join(", ")}। आज नर्स को बताइए।` : LANG === "mr" ? `नोंद केली: ${names.join(", ")}. आज नर्सला सांगा.` : `Noted: ${names.join(", ")}. Tell the nurse today.`;
}

/* ---------- reading what was said ---------- */
const check = () => { record.type = TYPE; return checkRecord(record); };
/** Read one utterance into the record. Returns the fields it changed. */
function apply(text, via, prefix = "", set = null) {
  const u = utter.length;
  utter.push({ text, via, prefix, set });
  const before = JSON.stringify(record);
  const changed = [];
  if (set) {
    for (const [k, v] of Object.entries(set)) {
      if (k === "symptoms") { record.symptoms = { ...(record.symptoms || {}) }; for (const [s, x] of Object.entries(v)) { if (record.symptoms[s] !== true || x === true) { record.symptoms[s] = x; changed.push("symptoms." + s); evidence["symptoms." + s] = { u, start: 0, end: text.length }; } } }
      else { record[k] = v; changed.push(k); evidence[k] = { u, start: 0, end: text.length }; }
    }
    return changed;
  }
  const res = understand(prefix + text, TYPE);
  const nr = res.record || {};
  for (const [k, v] of Object.entries(nr)) {
    if (k === "symptoms" || k === "type") continue;
    if (k === "name" && record.name && res.nameScore < 4) { delete res.evidence?.name; continue; } // a weak guess never replaces a name already said
    if (JSON.stringify(record[k]) !== JSON.stringify(v)) changed.push(k);
    record[k] = v;
    delete doubts[k]; if (k === "bp_sys" || k === "bp_dia") { delete doubts.bp_sys; delete doubts.bp_dia; delete doubts.bp; }
  }
  if (nr.symptoms) {
    for (const [s, v] of Object.entries(nr.symptoms)) if (record.symptoms?.[s] !== v) changed.push("symptoms." + s);
    record.symptoms = { ...(record.symptoms || {}), ...nr.symptoms };
  }
  for (const d of Array.isArray(res.doubts) ? res.doubts : []) if (d && d.field) { doubts[d.field] = d; changed.push("doubt:" + d.field); }
  for (const [k, e] of Object.entries(res.evidence || {})) {
    if (!e) continue;
    const start = e.start - prefix.length, end = e.end - prefix.length;
    if (end <= 0) continue;
    evidence[k] = { u, start: Math.max(0, start), end };
  }
  void before;
  return changed;
}
/** Re-read every utterance (after the visit type changed). */
function rebuild() {
  const old = utter;
  utter = []; record = { type: TYPE }; evidence = {}; doubts = {};
  for (const u of old) apply(u.text, u.via, u.prefix, u.set);
  flags = check();
}
const countFields = (r) => Object.keys(r).filter((k) => !["type", "name", "symptoms"].includes(k)).length + Object.keys(r.symptoms || {}).length;
/** On the first words: does another visit type clearly fit better? */
function betterType(text) {
  if (typeof U.detectType !== "function") return null;
  let guess = null;
  try { guess = U.detectType(text); } catch { return null; }
  if (!guess || guess === TYPE || !TILES[guess]) return null;
  return countFields(understand(text, guess).record || {}) > countFields(understand(text, TYPE).record || {}) ? guess : null;
}
function speakNewDangers(now = true) {
  const fresh = flags.filter((f) => f.severity === "refer_now" && !spoken.has(f.code));
  for (const f of fresh) spoken.add(f.code);
  if (fresh.length) say(fresh.map((f) => L(f.say || {}) || f.title).join(" "), { now });
  return fresh.length > 0;
}
function answerYesNo(q, yes, text, via) {
  if (q.field === "feeding") return apply(text, via, "", { feeding: yes ? "good" : "poor" });
  if (q.field === "fetal_movement") return apply(text, via, "", { fetal_movement: yes ? "normal" : "reduced" });
  if (q.field === "danger") {
    if (yes) { utter.push({ text, via, prefix: "", set: {} }); followUp = q.key; say(L(LINES.which)); return ["followup"]; }
    const set = { symptoms: {} };
    for (const s of q.syms || []) if (record.symptoms?.[s] !== true) set.symptoms[s] = false;
    return apply(text, via, "", set);
  }
  // a number question answered with yes / no
  if (!yes) { notChecked.add(q.field); utter.push({ text, via, prefix: "", set: {} }); return ["unchecked"]; }
  utter.push({ text, via, prefix: "", set: {} }); say(L(LINES.number)); return ["followup"];
}
function skipQuestion(q, unchecked) {
  if (q.doubt) skipped.add("doubt:" + q.field);
  else if (unchecked) notChecked.add(q.field); else skipped.add(q.field);
  asking = null; followUp = null; retries = 0;
  say(L(unchecked ? LINES.notChecked : LINES.skipped));
  render();
  afterTurn();
}

function take(text, via = "voice") {
  text = String(text || "").trim();
  if (!text) return;
  const k = key(text);
  // a pending "save?" or "clear?" is answered first
  if (pending) {
    if (CMD.yes.test(k) || (pending.kind === "save" && CMD.save.test(k))) return confirmPending(true);
    if (CMD.no.test(k)) return confirmPending(false);
    pending = null; // anything else: carry on with what she said
  }
  if (CMD.undo.test(k)) { if (banner?.kind === "switch") { const from = banner.from; banner = null; return switchType(from, { announce: false }); } return restoreCleared(); }
  if (CMD.fresh.test(k)) return askClear();
  if (saved) { saved = null; resetVisit(); } // she has started the next visit
  if (CMD.save.test(k)) return askSave();
  if (CMD.read.test(k)) return readBack();
  if (CMD.stop.test(k)) { if (session) { session.byUser = true; session.stop(); } return; }
  for (const [t, re] of Object.entries(TYPE_CMD)) if (re.test(k)) { banner = null; switchType(t, { announce: false }); say(L(TYPE_SET[t]), { now: true }); return; }
  for (const [l, re] of LANG_CMD) if (re.test(k)) { setLang(l); say(LANG_SET[l], { now: true, lang: l }); if (session) restartSession(); return; }

  const q = asking || (followUp ? nextQuestion() : null);
  let changed;
  if (q && (CMD.skip.test(k) || CMD.unchecked.test(k))) return skipQuestion(q, CMD.unchecked.test(k));
  if (q && followUp && CMD.no.test(k)) { followUp = null; changed = answerYesNo(q, false, text, via); }
  else if (q && !followUp && q.yesno && (CMD.yes.test(k) || CMD.no.test(k))) changed = answerYesNo(q, CMD.yes.test(k), text, via);
  else if (q && !followUp && !q.yesno && q.field !== "danger" && (CMD.yes.test(k) || CMD.no.test(k))) changed = answerYesNo(q, CMD.yes.test(k), text, via);
  else {
    if (!utter.length && via !== "example") {
      const t = betterType(text);
      if (t) { const from = TYPE; switchType(t, { announce: true }); banner = { kind: "switch", from }; switchedNow = true; }
    }
    // a short answer to the app's own question is read with the question's anchor word in front,
    // but only when the words alone don't already fill that field
    const words = k.split(" ").length;
    let prefix = "";
    if (q && q.prefix && words <= 5) { const dry = understand(text, TYPE).record || {}; if (!q.fields.some((f) => dry[f] != null)) prefix = q.prefix + " "; }
    changed = apply(text, via, prefix);
    if (followUp && changed.some((c) => c.startsWith("symptoms."))) followUp = null;
  }
  flags = check();
  const spokeDanger = speakNewDangers(!switchedNow);
  switchedNow = false;
  // did the reply answer the question?
  if (q) {
    const hit = changed.includes("followup") || changed.includes("unchecked") || (q.field === "danger" ? changed.some((c) => c.startsWith("symptoms.")) : q.fields.some((f) => changed.includes(f) || (f === "bp_sys" && changed.includes("bp_dia")))) && !changed.includes("doubt:" + q.field);
    if (!hit && !changed.length && !spokeDanger) {
      retries++;
      if (retries <= 2) { say(L(LINES.reprompt)); asking = q; render(); afterTurn(true); return; }
    }
    if (!hit && changed.length) asked.delete(q.key); // she said something else; ask this again later
    if (hit || retries > 2) { retries = 0; }
    asking = changed.includes("followup") ? q : null;
    if (hit && !asking && session?.mode === "visit") { clearTimeout(turnTimer); turnTimer = setTimeout(() => maybeAsk(), 700); }
  }
  render();
  afterTurn();
}

/* ---------- the next turn: ask the next question, then listen for one answer ---------- */
let turnTimer = null;
function afterTurn(again = false) {
  clearTimeout(turnTimer);
  if (session && session.mode === "visit") return; // the open mic asks after a pause instead
  if (session && session.mode === "answer") return; // listening already
  turnTimer = setTimeout(() => maybeAsk(again), 60);
}
function maybeAsk(again = false) {
  if (playing || saved || pending || !utter.length) return;
  const q = nextQuestion();
  if (!q) {
    if (!offerSave) { offerSave = true; say(L(LINES.allDone)).then(() => openAnswerMic(null)); }
    return;
  }
  asking = q; render();
  const n = asked.get(q.key) || 0;
  if (!again && !followUp) {
    if (n >= 2) return; // asked twice already; leave it on screen
    asked.set(q.key, n + 1);
    say(L(q.q)).then(() => openAnswerMic(q));
  } else chain.then(() => openAnswerMic(q));
}
function openAnswerMic(q) {
  if (!micState.granted || session || saved || playing || lastError) return;
  if (q && asking !== q && !(asking && asking.key === q.key)) return;
  startListening("answer");
}

/* ---------- the microphone ---------- */
const wave = $("#wave");
wave.innerHTML = Array.from({ length: 24 }, () => "<i></i>").join("");
function setStatus(t, kind = "") { const s = $("#status"); s.textContent = t; s.className = `v-status ${kind}`; }
const ERR = {
  "not-allowed": ["The microphone is blocked. Allow it in the address bar (the lock or camera icon), or type the visit below.", "blocked"],
  "service-not-allowed": ["This browser won't let the page use speech recognition. Type the visit below, or open the page in Chrome or Edge.", "blocked"],
  "network": ["No internet, so this browser can't listen. Type the visit below; it stays on this screen and saves on this phone.", "offline"],
  "audio-capture": ["No microphone was found. Plug one in, or type the visit below.", "noMic"],
  "language-not-supported": [null, null],
  "unsupported": ["This browser can't listen. Type the visit below, or use Chrome or Edge.", "blocked"],
};
function showError(e) {
  const [msg, line] = ERR[e] || [`Couldn't hear (${e}). Tap the mic to try again.`, null];
  lastError = e;
  const others = Object.keys(LANGS).filter((l) => l !== LANG && l !== "mr").map((l) => LANGS[l].label).join(" or ");
  setStatus(e === "language-not-supported" ? `This browser can't listen in ${LANGS[LANG].label}. Try ${others}, or type the visit below.` : msg, "err");
  $("#type-box").open = true;
  if (line && ERR[e]) say(L(LINES[line]), { now: true });
}
function listeningStatus(state) {
  if (!session || state === "ended" || lastError) return;
  if (state === "paused") return setStatus("The phone is speaking. The mic waits…", "wait");
  setStatus(session.mode === "answer" ? `Listening for your answer in ${LANGS[LANG].label}…` : `Listening in ${LANGS[LANG].label}. Say the visit; say "bas" when you are done.`, "on");
}
async function startListening(mode = "visit") {
  if (session) {
    if (mode === "visit" && session.mode === "answer") { session.byUser = true; session.noFollow = true; session.stop(); await new Promise((r) => setTimeout(r, 30)); }
    else return stopListening();
  }
  if (!support().stt) { showError("unsupported"); return; }
  lastError = null;
  if (mode === "visit") quiet();
  $("#mic").classList.add("on"); $("#mic").setAttribute("aria-label", "Stop listening"); $("#mic").setAttribute("aria-pressed", "true"); wave.classList.add("on");
  $("#mic-label").textContent = "Tap to stop";
  let interimEl = null;
  if (mode === "visit" && !/Android|iPhone|iPad/.test(navigator.userAgent)) micMeter((v) => { $("#mic").style.setProperty("--lvl", v.toFixed(2)); const bars = wave.children; for (let k = 0; k < bars.length; k++) bars[k].style.height = `${4 + Math.max(0, v * 22 * (0.4 + 0.6 * Math.abs(Math.sin(k * 1.7 + Date.now() / 160))))}px`; }).then((s) => { if (session) stopMeter = s; else s && s(); });
  const me = dictate({
    lang: LANG, single: mode === "answer",
    firstMs: mode === "answer" ? T.answerFirst : T.first, quietMs: T.quiet, pauseMs: mode === "visit" ? T.pause : null,
    onState: (s) => listeningStatus(s),
    onPause: () => maybeAsk(),
    onInterim: (t) => {
      if (!t) return;
      if (!interimEl) { interimEl = document.createElement("p"); interimEl.className = "said interim"; $("#said").appendChild(interimEl); document.querySelector("#said .faint")?.remove(); }
      interimEl.textContent = romanize(t);
    },
    onPhrase: (t) => { interimEl?.remove(); interimEl = null; take(t, "voice"); },
    onError: (e) => showError(e),
  });
  me.mode = mode;
  session = me;
  listeningStatus("listening");
  await me.done;
  interimEl?.remove();
  if (session === me) stopListening(true);
}
function stopListening(fromDone) {
  const me = session;
  if (me && !fromDone) { me.byUser = true; me.stop(); }
  session = null;
  stopMeter && stopMeter(); stopMeter = null;
  $("#mic").classList.remove("on"); $("#mic").setAttribute("aria-label", "Start speaking the visit"); $("#mic").setAttribute("aria-pressed", "false"); wave.classList.remove("on");
  $("#mic-label").textContent = "Tap to speak";
  [...wave.children].forEach((b) => (b.style.height = "4px"));
  if (lastError) { render(); return; } // keep the error on screen
  if (me && !me.heard && !me.byUser && !saved && !pending) {
    if (me.mode === "visit") { setStatus(LINES.nothing.en, "err"); say(L(LINES.nothing)); }
    else setStatus("Tap Answer to reply, or the mic to say more.");
  } else if (!pending) setStatus(saved ? "Saved. Tap the mic to start the next visit." : utter.length ? "Tap the mic to add more, or say \"save karo\"." : "Tap the mic and say the visit, the way you would tell the nurse.");
  render();
  // she is done talking: ask for whatever is still missing
  if (me && me.heard && !me.noFollow) afterTurn();
}
function restartSession() {
  const mode = session?.mode || "visit";
  if (session) { session.byUser = true; session.noFollow = true; session.stop(); }
  setTimeout(() => startListening(mode), 80);
}
$("#mic").addEventListener("click", () => startListening("visit"));

/* ---------- read back, save, clear ---------- */
const SP = {
  name: (r) => r.name,
  day: (r) => r.day == null ? null : TYPE === "pnc" ? { hi: `डिलीवरी को ${r.day} दिन`, mr: `प्रसूतीला ${r.day} दिवस`, en: `${r.day} days since the birth` } : { hi: `उम्र ${r.day} दिन`, mr: `वय ${r.day} दिवस`, en: `${r.day} days old` },
  weight_g: (r) => r.weight_g != null && { hi: `वज़न ${r.weight_g} ग्राम`, mr: `वजन ${r.weight_g} ग्रॅम`, en: `weight ${r.weight_g} grams` },
  weight_kg: (r) => r.weight_kg != null && { hi: `वज़न ${r.weight_kg} किलो`, mr: `वजन ${r.weight_kg} किलो`, en: `weight ${r.weight_kg} kilos` },
  temp_c: (r) => r.temp_c != null && { hi: `तापमान ${r.temp_c} डिग्री`, mr: `तापमान ${r.temp_c} अंश`, en: `temperature ${r.temp_c} degrees` },
  resp_rate: (r) => r.resp_rate != null && { hi: `साँस ${r.resp_rate} प्रति मिनट`, mr: `श्वास ${r.resp_rate} प्रति मिनिट`, en: `${r.resp_rate} breaths a minute` },
  feeding: (r) => r.feeding && { hi: { good: "दूध ठीक पी रहा है", poor: "दूध कम पी रहा है", none: "दूध नहीं पी रहा" }[r.feeding], mr: { good: "दूध नीट पितं", poor: "दूध कमी पितं", none: "दूध पित नाही" }[r.feeding], en: { good: "feeding well", poor: "feeding poorly", none: "not feeding" }[r.feeding] },
  weeks: (r) => r.weeks != null ? { hi: `${r.weeks} हफ्ते`, mr: `${r.weeks} आठवडे`, en: `${r.weeks} weeks` } : r.month != null && { hi: `महीना ${r.month}`, mr: `महिना ${r.month}`, en: `month ${r.month}` },
  bp_sys: (r) => r.bp_sys != null && { hi: `बीपी ${r.bp_sys} बटा ${r.bp_dia ?? ""}`, mr: `बीपी ${r.bp_sys} बाय ${r.bp_dia ?? ""}`, en: `BP ${r.bp_sys} over ${r.bp_dia ?? "unknown"}` },
  hb: (r) => r.hb != null && { hi: `हीमोग्लोबिन ${r.hb}`, mr: `हिमोग्लोबिन ${r.hb}`, en: `Hb ${r.hb}` },
  albumin: (r) => r.albumin && (r.albumin === "nil" ? { hi: "एल्ब्यूमिन नहीं", mr: "अल्ब्युमिन नाही", en: "albumin nil" } : r.albumin === "trace" ? { hi: "एल्ब्यूमिन थोड़ा", mr: "अल्ब्युमिन थोडं", en: "albumin trace" } : { hi: `एल्ब्यूमिन ${r.albumin} प्लस`, mr: `अल्ब्युमिन ${r.albumin} प्लस`, en: `albumin ${r.albumin} plus` }),
  fetal_movement: (r) => r.fetal_movement && { hi: { normal: "बच्चा ठीक हिल रहा है", reduced: "बच्चा कम हिल रहा है", absent: "बच्चा हिल नहीं रहा" }[r.fetal_movement], mr: { normal: "बाळ नीट हलतं", reduced: "बाळ कमी हलतं", absent: "बाळ हलत नाही" }[r.fetal_movement], en: { normal: "baby moving well", reduced: "baby moving less", absent: "baby not moving" }[r.fetal_movement] },
  pads: (r) => r.pads != null && { hi: `दिन में ${r.pads} पैड`, mr: `दिवसाला ${r.pads} पॅड`, en: `${r.pads} pads a day` },
  ifa_tablets: (r) => r.ifa_tablets != null && { hi: `आयरन की ${r.ifa_tablets} गोलियाँ`, mr: `लोहाच्या ${r.ifa_tablets} गोळ्या`, en: `${r.ifa_tablets} iron tablets` },
};
/** The record, said in her language (spoken only; the screen stays English). */
function readBackText() {
  const parts = [];
  for (const [k] of tileList()) { const f = SP[k]; const v = f && f(record); if (v) parts.push(typeof v === "string" ? v : v[LANG] || v.en); }
  const yes = Object.entries(record.symptoms || {}).filter(([, v]) => v).map(([k]) => symSay(k));
  if (yes.length) parts.push(LANG === "hi" ? `लक्षण: ${yes.join(", ")}` : LANG === "mr" ? `लक्षणं: ${yes.join(", ")}` : `signs: ${yes.join(", ")}`);
  const refer = flags.some((f) => f.severity === "refer_now");
  const end = refer ? { hi: "ख़तरे का लक्षण है, आज ही रेफर कीजिए।", mr: "धोक्याचं लक्षण आहे, आजच रेफर करायचं.", en: "Danger sign: refer today." } : { hi: "ख़तरे का कोई लक्षण नहीं।", mr: "धोक्याचं लक्षण नाही.", en: "No danger signs." };
  const sep = LANG === "hi" ? "। " : ". ";
  return parts.join(sep) + sep + L(end);
}
function readBack() { if (!utter.length) return; say(readBackText(), { now: true }); }
$("#readback").addEventListener("click", readBack);

function askSave() {
  if (!utter.length || saved) return;
  pending = { kind: "save" }; asking = null;
  render();
  setStatus("Say \"haan\" to save, or \"nahi\".");
  say(readBackText(), { now: true });
  say(L(LINES.confirmSave)).then(() => { if (pending?.kind === "save") openAnswerMic(null); });
}
function askClear() {
  if (!utter.length || saved) { saved = null; return resetVisit(); }
  pending = { kind: "clear" }; asking = null; render();
  say(L(LINES.confirmClear), { now: true }).then(() => { if (pending?.kind === "clear") openAnswerMic(null); });
}
function confirmPending(yes) {
  const p = pending; pending = null;
  if (!p) return;
  if (p.kind === "save") { if (yes) save(); else { say(L(LINES.notSaved), { now: true }); render(); } }
  else if (p.kind === "clear") { if (yes) { clearVisit(); say(L(LINES.cleared), { now: true }); } else { say(L(LINES.kept), { now: true }); render(); } }
}

/* offline: a visit that can't reach the server waits on the phone */
const OUTBOX = "gb-outbox";
const outbox = { get() { try { return JSON.parse(localStorage.getItem(OUTBOX)) || []; } catch { return []; } }, set(v) { try { localStorage.setItem(OUTBOX, JSON.stringify(v)); } catch {} } };
function drawOutbox() {
  const n = outbox.get().length, el = $("#outbox");
  el.hidden = !n;
  el.textContent = n ? `${n} visit${n > 1 ? "s" : ""} waiting to send` : "";
}
let flushing = false;
async function flushOutbox() {
  if (flushing || !navigator.onLine) return;
  const items = outbox.get();
  if (!items.length) return;
  flushing = true; let sent = 0;
  try {
    for (const it of items) {
      try { await api("/api/visits", it.body); sent++; outbox.set(outbox.get().filter((x) => x.localId !== it.localId)); }
      catch (e) { if (e.status && e.status < 500) { outbox.set(outbox.get().filter((x) => x.localId !== it.localId)); } else break; }
    }
  } finally { flushing = false; }
  drawOutbox();
  if (sent) { setStatus(`Sent ${sent} waiting visit${sent > 1 ? "s" : ""} to the nurse.`); if (saved?.queued) $("#saved-note").textContent = "Sent to the nurse's board."; loadVillage(); }
}
addEventListener("online", flushOutbox);

function savedBox(v, { queued = false } = {}) {
  const refer = v.flags.filter((f) => f.severity === "refer_now");
  const rows = tileList(v.record, v.type).map(([, label, fmt]) => [label, fmt(v.record)]).filter(([, x]) => x != null && x !== "");
  const yes = Object.entries(v.record.symptoms || {}).filter(([, x]) => x).map(([k]) => SYM_LABEL[k] || k.replace(/_/g, " "));
  const no = Object.entries(v.record.symptoms || {}).filter(([, x]) => !x).map(([k]) => SYM_LABEL[k] || k.replace(/_/g, " "));
  const unchecked = [...notChecked].map((k) => FIELD[k]?.[0] || (k === "danger" ? "danger signs" : pretty(k)));
  return `<div class="saved-box">
    <div class="register"><div class="reg-head"><span>Village register · ${esc(TITLES[v.type])}</span><span>${new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
    <table>${rows.map(([l, x]) => `<tr><th>${esc(l)}</th><td>${esc(x)}</td></tr>`).join("")}${yes.length ? `<tr><th>Signs present</th><td>${esc(yes.join(", "))}</td></tr>` : ""}${no.length ? `<tr><th>Checked, not present</th><td>${esc(no.join(", "))}</td></tr>` : ""}${unchecked.length ? `<tr><th>Not checked</th><td>${esc(unchecked.join(", "))}</td></tr>` : ""}<tr><th>Result</th><td>${refer.length ? `<span class="stamp small-stamp">REFER TODAY</span>` : v.flags.length ? "watch" : "no danger signs"}</td></tr></table></div>
    <div class="saved-links">${refer.length && !queued ? `<a class="btn refer" href="/slip/${esc(v.id)}">Open the referral slip</a>` : ""}${refer.length ? `<a class="btn ghost" href="tel:108">Call 108</a>` : ""}${queued ? "" : `<a class="btn ghost" href="/anm">See it on the nurse's board</a>`}</div>
    <p class="faint" id="saved-note" style="margin:0">${queued ? "Saved on this phone. It will be sent to the nurse when there is signal." : `Saved to the register${refer.length ? " and sent to the nurse's board as an open referral" : ""}. ${v.via === "voice" ? "Recorded by voice." : "Typed."}`}</p></div>`;
}
async function save() {
  if (!utter.length || saving || saved) return;
  quiet();
  if (session) { session.byUser = true; session.noFollow = true; session.stop(); }
  saving = true; pending = null;
  const btn = $("#save"); btn.disabled = true; btn.lastChild.textContent = "Saving…";
  record.type = TYPE;
  const body = { type: TYPE, record: JSON.parse(JSON.stringify(record)), said: utter.map((u) => u.text), lang: LANG, via: utter.every((u) => u.via !== "voice") ? "typed" : "voice" };
  if (personId) body.personId = personId;
  if (notChecked.size) body.notChecked = [...notChecked];
  const queue = () => {
    const it = { localId: Math.random().toString(36).slice(2), at: Date.now(), body };
    outbox.set([...outbox.get(), it]);
    const v = { ...body, at: it.at, flags: check(), id: null };
    saved = { queued: true };
    $("#saved").innerHTML = savedBox(v, { queued: true });
    say(L(LINES.queued), { now: true });
    setStatus("Saved on this phone. It will be sent to the nurse when there is signal.", "wait");
  };
  try {
    if (!navigator.onLine) queue();
    else {
      const v = await api("/api/visits", body);
      saved = v;
      const refer = v.flags.some((f) => f.severity === "refer_now");
      $("#saved").innerHTML = savedBox(v);
      say(L(refer ? LINES.savedRefer : LINES.saved), { now: true });
      setStatus(refer ? "Saved. The referral is on the nurse's board." : "Saved to the village register.");
      loadVillage();
    }
  } catch (e) {
    if (e.status && e.status < 500) { $("#saved").innerHTML = `<p class="alert watch" style="margin:0">${esc(e.message)} The visit is still on this screen; nothing was lost.</p>`; }
    else queue();
  } finally {
    saving = false;
    btn.lastChild.textContent = saved ? "Saved" : "Save visit";
    render();
    if (saved) $("#saved").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }
}
$("#save").addEventListener("click", save);
function snapshot() { return JSON.parse(JSON.stringify({ TYPE, utter, record, evidence, doubts, spoken: [...spoken], skipped: [...skipped], notChecked: [...notChecked] })); }
function resetVisit() {
  clearTimeout(turnTimer);
  utter = []; record = { type: TYPE }; evidence = {}; flags = []; doubts = {}; spoken = new Set(); asked = new Map(); skipped = new Set(); notChecked = new Set();
  asking = null; followUp = null; pending = null; retries = 0; lastFilled = new Set(); saved = null; offerSave = false; lastError = null;
  if (banner?.kind !== "person") banner = null;
  $("#saved").innerHTML = ""; $("#save").lastChild.textContent = "Save visit"; $("#typed").value = "";
  render();
}
function clearVisit() {
  if (utter.length && !saved) { lastCleared = snapshot(); }
  resetVisit();
  if (lastCleared) banner = { kind: "cleared" };
  render();
}
function restoreCleared() {
  if (!lastCleared) return;
  const s = lastCleared; lastCleared = null;
  if (s.TYPE !== TYPE) { TYPE = s.TYPE; paintType(); }
  utter = s.utter; record = s.record; evidence = s.evidence; doubts = s.doubts; spoken = new Set(s.spoken); skipped = new Set(s.skipped); notChecked = new Set(s.notChecked);
  flags = check(); banner = null; asked = new Map();
  say(L(LINES.restored), { now: true });
  render();
}
$("#clear").addEventListener("click", () => { quiet(); if (session) stopListening(); clearVisit(); });
$("#typed-go").addEventListener("click", () => { const t = $("#typed").value; if (t.trim()) { take(t, "typed"); $("#typed").value = ""; } });
$("#typed").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#typed-go").click(); } });

/* ---------- pickers ---------- */
function paintType() {
  store.set("gb-type", TYPE);
  document.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === TYPE)));
  drawExamples();
}
function switchType(t, { announce }) {
  if (!TILES[t] || t === TYPE) { render(); return; }
  TYPE = t; paintType();
  asked = new Map(); asking = null; followUp = null; skipped = new Set(); notChecked = new Set(); offerSave = false;
  if (saved) resetVisit(); else { rebuild(); spoken = new Set(); speakNewDangersQuiet(); }
  if (announce) say(L(TYPE_SAY[t]), { now: true });
  render();
}
function speakNewDangersQuiet() { flags = check(); const fresh = flags.filter((f) => f.severity === "refer_now"); for (const f of fresh) spoken.add(f.code); if (fresh.length) say(fresh.map((f) => L(f.say || {}) || f.title).join(" ")); }
function setLang(l) {
  LANG = l; store.set("gb-lang", l);
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
}
document.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => { banner = banner?.kind === "person" ? banner : null; switchType(b.dataset.type, { announce: false }); }));
document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => { setLang(b.dataset.lang); if (session) restartSession(); }));
function drawExamples() {
  $("#examples").innerHTML = EXAMPLES[TYPE].map(([lab, , t, en], i) => `<button class="ex" data-i="${i}"><small>${esc(lab)}</small>${esc(t)}${en ? `<span class="ex-en">${esc(en)}</span>` : ""}</button>`).join("");
  $("#examples").querySelectorAll(".ex").forEach((b) => b.addEventListener("click", () => {
    const [, lg, t] = EXAMPLES[TYPE][+b.dataset.i];
    quiet(); if (session) stopListening();
    saved = null; resetVisit(); setLang(lg); playExample(t);
  }));
}
// An example arrives the way speech does: phrase by phrase
async function playExample(t) {
  const parts = t.split(/(?<=[.?!।])\s+/);
  playing = true;
  for (const p of parts) { take(p, "example"); await new Promise((r) => setTimeout(r, T.step)); }
  playing = false;
  render();
  maybeAsk();
}

/* ---------- the village panel ---------- */
async function loadVillage() {
  try {
    const s = await api("/api/state");
    const due = s.people.filter((p) => p.dueToday);
    $("#village").innerHTML = `<div class="vil">
      <div><span>Open referrals</span><b>${s.totals.openReferrals}</b></div>
      <div><span>Visits due today</span><b>${s.totals.dueToday}</b></div>
      ${due.slice(0, 5).map((p) => `<div><a href="/visit?type=${p.kind === "baby" ? "newborn" : p.kind === "pregnant" ? "anc" : "pnc"}&person=${encodeURIComponent(p.id)}">${esc(p.name)}${p.kind === "baby" ? "'s baby" : ""}</a><span class="faint">${p.kind === "baby" ? `day ${p.dayOfLife}${p.atRisk ? ", 9-visit plan" : ""}` : p.kind === "pregnant" ? `${p.weeks} weeks` : `day ${p.dayAfter} after birth`}</span></div>`).join("")}
      <p class="faint" style="margin:6px 0 0">${esc(s.village.name)}, ${esc(s.village.block)}${s.village.sample ? " (made-up sample data)" : ""}</p></div>`;
    if (personId && !personLabel) {
      const p = s.people.find((x) => x.id === personId);
      if (p) { personLabel = p.kind === "baby" ? `${p.name}'s baby` : p.name; if (!banner) banner = { kind: "person", label: personLabel }; render(); }
      else personId = null;
    }
  } catch { $("#village").innerHTML = `<p class="faint">Couldn't reach the register. Visits still work on this screen, and save on this phone.</p>`; }
}

setLang(LANG);
paintType();
render(); loadVillage(); flushOutbox();
if (!support().stt) { setStatus("This browser can't listen for speech. Type the visit below, or open this page in Chrome or Edge."); $("#type-box").open = true; }
if (params.get("example") === "1") setTimeout(() => $("#examples .ex")?.click(), 500);
// Read-only view for automated checks
window.__gb = () => ({ TYPE, LANG, record, flags: flags.map((f) => f.code), utter: utter.length, session: !!session, mode: session?.mode || null, asking: asking?.key || null, pending: pending?.kind || null, doubts: Object.keys(doubts), notChecked: [...notChecked], skipped: [...skipped], saved: saved ? (saved.queued ? "queued" : saved.id) : null, outbox: outbox.get().length, lastError, status: $("#status").textContent, banner: banner?.kind || null });
