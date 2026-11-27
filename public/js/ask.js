// The nurse asks the board out loud. A spoken question becomes one of a few
// answers, read from the same register the board shows. No model: fixed words.
import { normalise, romanize } from "./understand.js";

const has = (q, re) => re.test(q);
const SEEN = /dekh liya|dekh li\b|dekh lia|dekha hai|देख लिया|देख ली|देखा है|देख लिए|seen|mark (it |her |him )?as seen|पाहिलं|पाहिले|पाहिला|pahila|pahile|baghitla|baghitle|बघितलं|बघितले|बघितला/;
// what happened after a referral, said by the ASHA or the nurse: "Sunita PHC pahunchi", "gaye nahi"
const NEG = "(?:nahi|nahin|नहीं|नही|नाही)";
const WENT = "(?:gaye|gayi|gaya|gai|गए|गई|गया|गेले|गेली|gele|geli|pahunch\\S*|pahuch\\S*|पहुंच\\S*|पहुँच\\S*|पोहोच\\S*|pohoch\\S*)";
const OUTCOMES = [
  ["refused", new RegExp(`${WENT} ${NEG}|${NEG} ${WENT}|mana kar|मना कर|refus|नकार|nakar|did not go|didn't go`)],
  ["not_reachable", /not reachable|sampark nahi|संपर्क नहीं|संपर्क नाही|phone nahi lag|फोन नहीं लग|फ़ोन नहीं लग|mil nahi rahe|मिल नहीं रहे|सापडत नाही|sapdat nahi|could not reach|couldn't reach/],
  ["admitted", /admit|bharti|bhartee|भर्ती|दाखल|dakhal/],
  ["reached", new RegExp(`${WENT}|reached|gaye the|गए थे|गई थी|गेले होते`)],
];
export const OUTCOME_LABEL = { reached: "reached the hospital", admitted: "admitted", refused: "did not go", not_reachable: "could not be reached" };
const OUTCOME_SAY = { reached: ["अस्पताल पहुँच गए", "दवाखान्यात पोहोचले"], admitted: ["भर्ती हो गए", "दाखल झाले"], refused: ["नहीं गए", "गेले नाहीत"], not_reachable: ["संपर्क नहीं हुआ", "संपर्क झाला नाही"] };
const PAST = /(^|\s)(kal|kalka|yesterday|last week|hafte|week|pichhle|pichle|कल|पिछले|हफ्ते|काल|आठवड्या)(\s|$|\?)/;
const INTENTS = [
  ["undo", /^(wapas|vapas|वापस|undo|परत|parat)(\s|$)/],
  ["seen", SEEN],
  ["referrals", /refer|referral|रेफर|रेफ़र|रेफरल|bheja|भेजा|भेजना|पाठव|paathav|hospital|अस्पताल|दवाखान/],
  ["risk", /risk|khatr|खतर|ख़तर|धोक|dhok|danger|serious|गंभीर|gambhir|watch|dhyan|ध्यान|लक्ष|laksh/],
  ["due", /due|baaki|baki|बाकी|बाक़ी|jaana|jana|जाना|जायचं|ghar|घर|visit|विज़िट|विजिट|भेट|bhet|today'?s? visits|kahan|कहाँ|कहां|कुठे|kuthe/],
];
const FIELD_Q = [
  ["bp", /\bbp\b|बीपी|blood pressure|दबाव|pressure/],
  ["weight", /vajan|wajan|vazan|वज़न|वजन|weight/],
  ["temp", /bukhar|बुखार|\btaap\b|ताप|तापमान|taapmaan|tapman|temperature|\btemp\b|fever/],
  ["hb", /\bhb\b|हीमोग्लोबिन|हिमोग्लोबिन|haemoglobin|hemoglobin|khoon ki/],
];

function plain(s) { return normalise(String(s || "")).toLowerCase(); }

function whoEn(p) { return p.kind === "baby" ? `${p.name}'s baby` : p.name; }
function whoHi(p) { return p.kind === "baby" ? `${p.name} का बच्चा` : p.name; }
function whoMr(p) { return p.kind === "baby" ? `${p.name} चं बाळ` : p.name; }
const refWho = (r, f) => f({ kind: r.type === "newborn" ? "baby" : "x", name: r.name });
/** The board's short status line for a person. */
export const statusEn = (p) => p.kind === "baby" ? `day ${p.dayOfLife ?? "?"}${p.atRisk ? ", low weight or sick (9 visits)" : ""}` : p.kind === "pregnant" ? `${p.weeks ?? "?"} weeks pregnant` : `day ${p.dayAfter ?? "?"} after birth`;
const list = (xs, sep = ", ") => xs.join(sep);

/** One definition, used by the board's tile and by the spoken answer: whose last visit found a sign to refer or watch. */
export const toWatch = (people) => (people || []).filter((p) => p.last && (p.last.refer || p.last.watch));

// short reasons, said in Hindi and Marathi
const WHY = {
  anc_imminent_eclampsia: ["बहुत ज़्यादा बीपी", "खूप जास्त बीपी"], anc_preeclampsia: ["बीपी और एल्ब्यूमिन", "बीपी आणि अल्ब्युमिन"], anc_hypertension: ["बीपी ज़्यादा", "बीपी जास्त"],
  anc_headache_vision: ["तेज़ सिरदर्द या धुंधला दिखना", "डोकेदुखी किंवा धूसर दिसणे"], anc_severe_anaemia: ["खून की बहुत कमी", "रक्ताची खूप कमतरता"], anc_moderate_anaemia: ["खून की कमी", "रक्ताची कमतरता"],
  anc_mild_anaemia: ["थोड़ी खून की कमी", "थोडी रक्ताची कमतरता"], anc_bleeding: ["खून जाना", "रक्तस्राव"], anc_leaking: ["पानी जाना", "पाणी जाणे"], anc_convulsions: ["झटके", "झटके"],
  anc_fever: ["बुखार", "ताप"], anc_fetal_movement: ["बच्चे का कम हिलना", "बाळाची हालचाल कमी"], anc_swelling: ["चेहरे या हाथ पर सूजन", "चेहऱ्यावर सूज"], anc_breathless: ["साँस फूलना", "धाप लागणे"],
  anc_abdominal_pain: ["तेज़ पेट दर्द", "खूप पोटदुखी"], pnc_heavy_bleeding: ["बहुत खून जाना", "जास्त रक्तस्राव"], pnc_high_fever: ["तेज़ बुखार", "जास्त ताप"], pnc_infection: ["इन्फ़ेक्शन", "संसर्ग"],
  pnc_fever: ["बुखार", "ताप"], pnc_convulsions: ["झटके", "झटके"], pnc_neuro: ["धुंधला दिखना या अजीब बोलना", "धूसर दिसणे किंवा विचित्र बोलणे"], pnc_breathless: ["साँस की तकलीफ़", "श्वासाचा त्रास"],
  pnc_hypertension: ["बीपी ज़्यादा", "बीपी जास्त"], pnc_severe_anaemia: ["खून की बहुत कमी", "रक्ताची खूप कमतरता"], pnc_headache: ["तेज़ सिरदर्द", "खूप डोकेदुखी"],
  nb_not_feeding: ["दूध नहीं पी रहा", "दूध पित नाही"], nb_poor_feeding: ["दूध कम पी रहा", "दूध कमी पितं"], nb_convulsions: ["झटके", "झटके"], nb_fast_breathing: ["तेज़ साँस", "जलद श्वास"],
  nb_chest_indrawing: ["पसली चलना", "छाती आत ओढणे"], nb_lethargy: ["छूने पर ही हिलता है", "स्पर्श केल्यावरच हालचाल"], nb_fever: ["बुखार", "ताप"], nb_hypothermia: ["बहुत ठंडा", "खूप थंड"],
  nb_jaundice_palms: ["हथेली तलवे पीले", "तळवे पिवळे"], nb_jaundice_early: ["पहले दिन पीलिया", "पहिल्या दिवशी कावीळ"], nb_blood_stool: ["मल में खून", "शौचात रक्त"],
  nb_very_low_weight: ["वज़न बहुत कम", "वजन खूप कमी"], nb_low_weight: ["वज़न कम", "वजन कमी"], nb_cord_infection: ["नाल में इन्फ़ेक्शन", "नाळेला संसर्ग"], nb_skin_pustules: ["फुंसियाँ", "पुटकुळ्या"],
  nb_difficulty_breathing: ["साँस लेने में तकलीफ़", "श्वास घ्यायला त्रास"],
};
/** A flag's reason in a language; English falls back to the rule's own title. */
/** The one big line a refer alert leads with, from the rule's own urgent field (never from its wording). */
const BIG = {
  newborn: ["Take the baby to the newborn care unit today.", "Take the baby to the newborn unit (SNCU) now. Call 108."],
  anc: ["Take her to the hospital today.", "Take her to the hospital now. Call 108."],
  pnc: ["Take her to the hospital today.", "Take her to the hospital now. Call 108."],
};
export const bigLine = (refer, type) => (BIG[type] || BIG.anc)[(refer || []).some((f) => f.severity !== "watch" && f.urgent === true) ? 1 : 0];
export const isUrgentRef = (r) => r.urgent === true || (r.flags || []).some((f) => f.urgent === true);

export function reason(f, lang = "en") {
  if (!f) return lang === "hi" ? "ख़तरे का लक्षण" : lang === "mr" ? "धोक्याचं लक्षण" : "danger sign";
  if (lang === "en") return (f.title || "danger sign").toLowerCase();
  const w = WHY[f.code] || (f.title_hi || f.title_mr ? [f.title_hi, f.title_mr] : null);
  return (w && w[lang === "hi" ? 0 : 1]) || (f.title || "").toLowerCase();
}

const key = (s) => String(s || "").toLowerCase().replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u").replace(/w/g, "v").replace(/(.)\1/g, "$1");
// Marathi joins endings to names (Sunitacha, Sunitala): a short ending still counts
const nameIn = (words, name) => { const k = key(name); return k.length > 2 && words.some((w) => w === k || (w.startsWith(k) && w.length - k.length <= 4)); };
const wordsOf = (question) => (" " + romanize(plain(question)).toLowerCase().replace(/[^a-z ]/g, " ") + " ").split(/\s+/).filter(Boolean).map(key);
/** Which person, if any, the question names. Works on Devanagari or Roman speech. */
export function findPerson(question, people) {
  const words = wordsOf(question);
  const q = plain(question);
  const named = (people || []).filter((p) => nameIn(words, p.name));
  if (named.length < 2) return named[0] || null;
  // "Sunita ka baby" vs Sunita herself
  const baby = /baby|bachch|bacha|बच्च|बाळ|bal\b|baal/.test(q);
  return named.find((p) => (p.kind === "baby") === baby) || named[0];
}

/** The last visit's values, if the board knows them (p.last.record). */
function values(p, want) {
  const r = p.last?.record;
  if (!r) return null;
  const en = [], hi = [], mr = [];
  const add = (k, e, h, m) => { if (!want || want === k) { en.push(e); hi.push(h); mr.push(m); } };
  if (r.bp_sys != null) add("bp", `BP ${r.bp_sys}/${r.bp_dia ?? "?"}`, `बीपी ${r.bp_sys} बटा ${r.bp_dia ?? ""}`, `बीपी ${r.bp_sys} बाय ${r.bp_dia ?? ""}`);
  if (r.weight_g != null) add("weight", `weight ${r.weight_g} g`, `वज़न ${r.weight_g} ग्राम`, `वजन ${r.weight_g} ग्रॅम`);
  if (r.weight_kg != null) add("weight", `weight ${r.weight_kg} kg`, `वज़न ${r.weight_kg} किलो`, `वजन ${r.weight_kg} किलो`);
  if (r.temp_c != null) add("temp", `temperature ${r.temp_c} °C`, `तापमान ${r.temp_c} डिग्री`, `तापमान ${r.temp_c} अंश`);
  if (r.hb != null) add("hb", `Hb ${r.hb}`, `हीमोग्लोबिन ${r.hb}`, `हिमोग्लोबिन ${r.hb}`);
  if (!want && r.resp_rate != null) add(null, `${r.resp_rate} breaths a minute`, `साँस ${r.resp_rate} प्रति मिनट`, `श्वास ${r.resp_rate} प्रति मिनिट`);
  if (!want && r.pads != null) add(null, `${r.pads} pads a day`, `दिन में ${r.pads} पैड`, `दिवसाला ${r.pads} पॅड`);
  if (!en.length) return { en: want ? `no ${{ bp: "BP", weight: "weight", temp: "temperature", hb: "Hb" }[want]} at the last visit` : "", hi: want ? "पिछली विज़िट में यह नहीं लिखा गया" : "", mr: want ? "शेवटच्या भेटीत हे नोंदवलं नाही" : "" };
  return { en: `last visit: ${en.join(", ")}`, hi: `पिछली विज़िट: ${hi.join(", ")}`, mr: `शेवटची भेट: ${mr.join(", ")}` };
}

/** Answer a spoken question from the register. Returns { intent, en, hi, mr, items?, id? }. */
export function answer(question, S) {
  const q = plain(question);
  const people = S.people || [];
  const person = findPerson(question, people);
  const intent = (INTENTS.find(([, re]) => has(q, re)) || [person ? "person" : "help"])[0];
  const refs = S.referrals || [];
  const open = refs.filter((r) => r.status === "open").sort((a, b) => (isUrgentRef(b) ? 1 : 0) - (isUrgentRef(a) ? 1 : 0));
  const outcome = (OUTCOMES.find(([, re]) => re.test(q)) || [null])[0];

  if (intent === "undo") return { intent: "undo", en: "Undone.", hi: "वापस कर दिया।", mr: "परत केलं." };
  if (outcome && intent !== "seen") {
    const words = wordsOf(question);
    const mine = refs.filter((x) => nameIn(words, x.name) && (!person || x.personId == null || x.personId === person.id));
    const r = mine.find((x) => x.status === "open") || mine[0];
    if (!r) return { intent: "outcome", en: person ? `${whoEn(person)} has no referral to update.` : "Say whose referral, for example \"Sunita PHC pahunchi\".", hi: person ? `${whoHi(person)} का कोई रेफरल नहीं है।` : "किसका रेफरल, नाम बताइए।", mr: person ? `${whoMr(person)} चा कोणताही रेफरल नाही.` : "कोणाचा रेफरल, नाव सांगा." };
    const s = OUTCOME_SAY[outcome];
    return { intent: "outcome", id: r.id, outcome, en: `${refWho(r, whoEn)}: ${OUTCOME_LABEL[outcome]}. Noted.`, hi: `${refWho(r, whoHi)}: ${s[0]}, लिख लिया।`, mr: `${refWho(r, whoMr)}: ${s[1]}, नोंद केली.` };
  }
  if ((intent === "due" || intent === "referrals") && PAST.test(q) && !person) {
    return { intent: "help", en: "The board answers about today: open referrals and visits due today. Older visits are in the register below.", hi: "बोर्ड आज के बारे में बताता है: बाकी रेफरल और आज की विज़िट। पुरानी विज़िट नीचे रजिस्टर में हैं।", mr: "बोर्ड आजचं सांगतो: बाकी रेफरल आणि आजच्या भेटी. जुन्या भेटी खाली रजिस्टरमध्ये आहेत." };
  }

  if (intent === "seen") {
    const words = wordsOf(question);
    const r = open.find((x) => nameIn(words, x.name) && (!person || x.personId == null || x.personId === person.id)) || open.find((x) => nameIn(words, x.name));
    if (!r) {
      const who = person ? whoEn(person) : null;
      return { intent: "seen", en: who ? `${who} has no open referral to mark as seen.` : "Say whose referral you saw, for example \"Sunita dekh liya\".",
        hi: who ? `${whoHi(person)} का कोई रेफरल बाकी नहीं है।` : "किसका रेफरल देखा, नाम बताइए।", mr: who ? `${whoMr(person)} चा कोणताही रेफरल बाकी नाही.` : "कोणाचा रेफरल पाहिला, नाव सांगा." };
    }
    return { intent: "seen", id: r.id, en: `Marked ${refWho(r, whoEn)} as seen.`, hi: `${refWho(r, whoHi)} का रेफरल देख लिया, लिख दिया।`, mr: `${refWho(r, whoMr)} चा रेफरल पाहिला, नोंद केली.` };
  }
  if (intent === "referrals" && !(person && !/aaj|today|आज|kaun|कौन|कोण|kon|who/.test(q))) {
    if (!open.length) return { intent, en: "No open referrals right now.", hi: "अभी कोई रेफरल बाकी नहीं है।", mr: "आत्ता कोणताही रेफरल बाकी नाही." };
    // urgent cases first, and said as urgent
    const nU = open.filter(isUrgentRef).length;
    const tag = { en: (r) => (isUrgentRef(r) ? "urgent, " : ""), hi: (r) => (isUrgentRef(r) ? "तुरंत, " : ""), mr: (r) => (isUrgentRef(r) ? "तातडीने, " : "") };
    const lead = { en: nU ? `${nU} urgent. ` : "", hi: nU ? `${nU} तुरंत वाले। ` : "", mr: nU ? `${nU} तातडीचे. ` : "" };
    return {
      intent, items: open.map((r) => ({ id: r.id, text: `${isUrgentRef(r) ? "GO NOW · " : ""}${refWho(r, whoEn)}: ${r.flags[0]?.title || "danger sign"}` })),
      en: `${lead.en}${open.length} open referral${open.length > 1 ? "s" : ""}: ${list(open.map((r) => `${refWho(r, whoEn)}, ${tag.en(r)}${reason(r.flags[0], "en")}`), "; ")}.`,
      hi: `${lead.hi}${open.length} रेफरल बाकी ${open.length > 1 ? "हैं" : "है"}: ${list(open.map((r) => `${refWho(r, whoHi)}, ${tag.hi(r)}${reason(r.flags[0], "hi")}`), "; ")}।`,
      mr: `${lead.mr}${open.length} रेफरल बाकी ${open.length > 1 ? "आहेत" : "आहे"}: ${list(open.map((r) => `${refWho(r, whoMr)}, ${tag.mr(r)}${reason(r.flags[0], "mr")}`), "; ")}.`,
    };
  }
  if (intent === "risk") {
    const risk = toWatch(people);
    if (!risk.length) return { intent, en: "Nobody needs watching after their last visit.", hi: "पिछली विज़िट के बाद किसी पर ख़ास ध्यान की ज़रूरत नहीं है।", mr: "शेवटच्या भेटीनंतर कोणाकडेही विशेष लक्ष द्यायची गरज नाही." };
    const tag = (p) => (p.last.refer ? "referred" : "watch");
    return { intent, items: risk.map((p) => ({ text: `${whoEn(p)}: ${tag(p)} after the last visit` })),
      en: `${risk.length} to keep an eye on (${risk.filter((p) => p.last.refer).length} referred, ${risk.filter((p) => !p.last.refer).length} to watch): ${list(risk.map((p) => `${whoEn(p)} (${tag(p)})`))}.`,
      hi: `${risk.length} लोगों पर ध्यान रखना है: ${list(risk.map(whoHi))}।`, mr: `${risk.length} जणांकडे लक्ष ठेवायचं आहे: ${list(risk.map(whoMr))}.` };
  }
  if (intent === "due" && !person) {
    const due = people.filter((p) => p.dueToday).sort((a, b) => (b.atRisk ? 1 : 0) - (a.atRisk ? 1 : 0));
    if (!due.length) return { intent, en: "No home visits are due today.", hi: "आज कोई घर की विज़िट बाकी नहीं है।", mr: "आज कोणतीही गृहभेट बाकी नाही." };
    return { intent, items: due.map((p) => ({ text: `${whoEn(p)}: ${statusEn(p)}` })),
      en: `${due.length} home visit${due.length > 1 ? "s" : ""} due today: ${list(due.map((p) => `${whoEn(p)}, ${statusEn(p)}`), "; ")}.`,
      hi: `आज ${due.length} घरों में विज़िट बाकी है: ${list(due.map(whoHi))}।`, mr: `आज ${due.length} घरी भेट द्यायची आहे: ${list(due.map(whoMr))}.` };
  }
  if (person) {
    const p = person, l = p.last;
    const want = (FIELD_Q.find(([, re]) => re.test(q)) || [null])[0];
    const vals = values(p, want);
    const res = !l ? "no visit yet" : l.refer ? "referred after the last visit" : l.watch ? "to watch after the last visit" : "fine at the last visit";
    const resHi = !l ? "अभी कोई विज़िट नहीं हुई" : l.refer ? "पिछली विज़िट के बाद रेफर किया गया" : l.watch ? "पिछली विज़िट के बाद ध्यान रखना है" : "पिछली विज़िट में ठीक थे";
    const resMr = !l ? "अजून भेट झाली नाही" : l.refer ? "शेवटच्या भेटीनंतर रेफर केलं" : l.watch ? "शेवटच्या भेटीनंतर लक्ष ठेवायचं आहे" : "शेवटच्या भेटीत ठीक होते";
    const v = (lang) => (vals && vals[lang] ? `, ${vals[lang]}` : "");
    return { intent: "person", person: p.id, wants: want, items: [{ text: `${whoEn(p)}: ${statusEn(p)}, ${res}${vals?.en ? `; ${vals.en}` : ""}${p.dueToday ? ", visit due today" : ""}` }],
      en: `${whoEn(p)}: ${statusEn(p)}, ${res}${v("en")}.${p.dueToday ? " A visit is due today." : ""}`,
      hi: `${whoHi(p)}: ${resHi}${v("hi")}।${p.dueToday ? " आज विज़िट बाकी है।" : ""}`,
      mr: `${whoMr(p)}: ${resMr}${v("mr")}.${p.dueToday ? " आज भेट बाकी आहे." : ""}` };
  }
  return { intent: "help", en: "Ask who was referred, whose visits are due today, who to watch, or about one person by name. Say \"Sunita dekh liya\" to mark a referral seen.",
    hi: "पूछिए: किसे रेफर किया, आज किसकी विज़िट बाकी है, किस पर ध्यान रखना है, या किसी एक का नाम।",
    mr: "विचारा: कोणाला रेफर केलं, आज कोणाची भेट बाकी आहे, कोणाकडे लक्ष ठेवायचं, किंवा एखाद्याचं नाव." };
}

/* ---------- one action per alert: group danger signs by what to do ----------
   Uses rules.js groupFlags() when it exists; otherwise groups flags whose action
   starts with the same destination sentence. The highest level comes first and
   wins; lower groups are shown only as context under it. */
const sentencesOf = (s) => String(s || "").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
const wordSet = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2));
const otwItems = (s) => String(s || "").replace(/\.\s*$/, "").split(/,\s*/).map((x) => x.replace(/^and\s+/i, "").trim()).filter(Boolean);
function splitAction(action) {
  const a = String(action || ""), i = a.search(/on the way:/i);
  return { main: (i >= 0 ? a.slice(0, i) : a).trim(), otw: i >= 0 ? a.slice(i).replace(/^on the way:\s*/i, "").trim() : "" };
}
export function groupAlerts(flags, type, groupFlags) {
  const refer = (flags || []).filter((f) => f.severity === "refer_now");
  if (!refer.length) return [];
  if (typeof groupFlags === "function") {
    try {
      const g = groupFlags(refer);
      if (Array.isArray(g) && g.length) {
        return g.filter((x) => (x.flags || []).some((f) => f.severity !== "watch")).map((x) => ({
          where: x.where || bigLine(x.flags || [], type), urgent: !!x.urgent, flags: (x.flags || []).filter((f) => f.severity !== "watch"), extra: [],
          onTheWay: Array.isArray(x.onTheWay) ? x.onTheWay : x.onTheWay ? otwItems(x.onTheWay) : [],
        }));
      }
    } catch { /* fall back */ }
  }
  const sorted = [...refer].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0));
  const groups = [];
  for (const f of sorted) {
    const { main, otw } = splitAction(f.action);
    const s = sentencesOf(main), head = f.where || s[0] || bigLine([f], type);
    const key = head.toLowerCase().replace(/[^a-z ]/g, "").trim();
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, where: head, urgent: false, flags: [], onTheWay: [], extra: [] }; groups.push(g); }
    g.flags.push(f); g.urgent = g.urgent || !!f.urgent;
    const items = Array.isArray(f.onTheWay) ? f.onTheWay : otwItems(f.onTheWay || otw);
    for (const it of items) if (!g.onTheWay.some((x) => x.toLowerCase() === it.toLowerCase())) g.onTheWay.push(it);
    for (const x of f.where ? [] : s.slice(1)) g.extra.push(x);
  }
  for (const g of groups) {
    const otwW = wordSet(g.onTheWay.join(" ")), keep = [];
    for (const x of g.extra) {
      if (/^call (108|102)/i.test(x)) { if (!/108|102/.test(g.where)) g.where += " " + x; continue; }
      const w = [...wordSet(x)];
      if (w.length && w.filter((y) => otwW.has(y)).length / w.length >= 0.6) continue; // says the same as "on the way"
      if (!keep.some((k) => k.toLowerCase() === x.toLowerCase())) keep.push(x);
    }
    g.extra = keep;
    if (g.urgent && !/108/.test(g.where)) g.where += " Call 108.";
  }
  return groups;
}
