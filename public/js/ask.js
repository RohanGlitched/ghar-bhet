// The nurse asks the board out loud. A spoken question becomes one of four
// answers, read from the same register the board shows. No model: fixed words.
import { normalise, romanize } from "./understand.js";

const has = (q, re) => re.test(q);
const INTENTS = [
  ["referrals", /refer|referral|रेफर|रेफ़र|रेफरल|bheja|भेजा|भेजना|पाठव|paathav|hospital|अस्पताल|दवाखान/],
  ["risk", /risk|khatr|खतर|धोक|dhok|danger|serious|गंभीर|gambhir/],
  ["due", /due|baaki|baki|बाकी|बाक़ी|jaana|jana|जाना|जायचं|ghar|घर|visit|विज़िट|विजिट|भेट|bhet|today'?s? visits|kahan|कहाँ|कहां|कुठे|kuthe/],
];

function plain(s) { return normalise(String(s || "")).toLowerCase(); }

function whoEn(p) { return p.kind === "baby" ? `${p.name}'s baby` : p.name; }
function whoHi(p) { return p.kind === "baby" ? `${p.name} का बच्चा` : p.name; }
function whoMr(p) { return p.kind === "baby" ? `${p.name} चं बाळ` : p.name; }
const refWho = (r, f) => f({ kind: r.type === "newborn" ? "baby" : "x", name: r.name });
const statusEn = (p) => p.kind === "baby" ? `day ${p.dayOfLife ?? "?"}${p.atRisk ? ", at risk" : ""}` : p.kind === "pregnant" ? `${p.weeks ?? "?"} weeks pregnant` : `day ${p.dayAfter ?? "?"} after birth`;
const list = (xs, sep = ", ") => xs.join(sep);

/** Which person, if any, the question names. Works on Devanagari or Roman speech. */
export function findPerson(question, people) {
  const q = " " + romanize(plain(question)).toLowerCase().replace(/[^a-z ]/g, " ") + " ";
  const key = (s) => s.toLowerCase().replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u").replace(/w/g, "v").replace(/(.)\1/g, "$1");
  const words = q.split(/\s+/).filter(Boolean).map(key);
  return people.find((p) => words.includes(key(p.name))) || null;
}

/** Answer a spoken question from the register. Returns { intent, en, hi, mr }. */
export function answer(question, S) {
  const q = plain(question);
  const person = findPerson(question, S.people || []);
  const intent = (INTENTS.find(([, re]) => has(q, re)) || [person ? "person" : "help"])[0];
  const open = (S.referrals || []).filter((r) => r.status === "open");
  if (intent === "referrals" && !(person && !/aaj|today|आज|kaun|कौन|कोण|kon|who/.test(q))) {
    if (!open.length) return { intent, en: "No open referrals right now.", hi: "अभी कोई रेफरल बाकी नहीं है।", mr: "आत्ता कोणताही रेफरल बाकी नाही." };
    return {
      intent, items: open.map((r) => ({ id: r.id, text: `${refWho(r, whoEn)}: ${r.flags[0]?.title || "danger sign"}` })),
      en: `${open.length} open referral${open.length > 1 ? "s" : ""}: ${list(open.map((r) => `${refWho(r, whoEn)}, ${(r.flags[0]?.title || "danger sign").toLowerCase()}`), "; ")}.`,
      hi: `${open.length} रेफरल बाकी हैं: ${list(open.map((r) => refWho(r, whoHi)))}।`,
      mr: `${open.length} रेफरल बाकी आहेत: ${list(open.map((r) => refWho(r, whoMr)))}.`,
    };
  }
  if (intent === "risk") {
    const risk = (S.people || []).filter((p) => p.last?.refer || p.atRisk);
    if (!risk.length) return { intent, en: "Nobody is at risk after their last visit.", hi: "पिछली विज़िट के बाद कोई खतरे में नहीं है।", mr: "शेवटच्या भेटीनंतर कोणीही धोक्यात नाही." };
    return { intent, items: risk.map((p) => ({ text: `${whoEn(p)}: ${statusEn(p)}` })),
      en: `${risk.length} at risk: ${list(risk.map(whoEn))}.`, hi: `${risk.length} लोग खतरे में हैं: ${list(risk.map(whoHi))}।`, mr: `${risk.length} जण धोक्यात आहेत: ${list(risk.map(whoMr))}.` };
  }
  if (intent === "due" && !person) {
    const due = (S.people || []).filter((p) => p.dueToday).sort((a, b) => (b.atRisk ? 1 : 0) - (a.atRisk ? 1 : 0));
    if (!due.length) return { intent, en: "No home visits are due today.", hi: "आज कोई घर की विज़िट बाकी नहीं है।", mr: "आज कोणतीही गृहभेट बाकी नाही." };
    return { intent, items: due.map((p) => ({ text: `${whoEn(p)}: ${statusEn(p)}` })),
      en: `${due.length} home visit${due.length > 1 ? "s" : ""} due today: ${list(due.map((p) => `${whoEn(p)}, ${statusEn(p)}`), "; ")}.`,
      hi: `आज ${due.length} घरों में विज़िट बाकी है: ${list(due.map(whoHi))}।`, mr: `आज ${due.length} घरी भेट द्यायची आहे: ${list(due.map(whoMr))}.` };
  }
  if (person) {
    const p = person, l = p.last;
    const res = !l ? "no visit yet" : l.refer ? "referred after the last visit" : l.watch ? "to watch after the last visit" : "fine at the last visit";
    const resHi = !l ? "अभी कोई विज़िट नहीं हुई" : l.refer ? "पिछली विज़िट के बाद रेफर किया गया" : l.watch ? "पिछली विज़िट के बाद ध्यान रखना है" : "पिछली विज़िट में ठीक थे";
    const resMr = !l ? "अजून भेट झाली नाही" : l.refer ? "शेवटच्या भेटीनंतर रेफर केलं" : l.watch ? "शेवटच्या भेटीनंतर लक्ष ठेवायचं आहे" : "शेवटच्या भेटीत ठीक होते";
    return { intent: "person", items: [{ text: `${whoEn(p)}: ${statusEn(p)}, ${res}${p.dueToday ? ", visit due today" : ""}` }],
      en: `${whoEn(p)}: ${statusEn(p)}, ${res}.${p.dueToday ? " A visit is due today." : ""}`,
      hi: `${whoHi(p)}: ${resHi}।${p.dueToday ? " आज विज़िट बाकी है।" : ""}`,
      mr: `${whoMr(p)}: ${resMr}.${p.dueToday ? " आज भेट बाकी आहे." : ""}` };
  }
  return { intent: "help", en: "Ask who was referred, whose visits are due today, who is at risk, or about one person by name.",
    hi: "पूछिए: किसे रेफर किया, आज किसकी विज़िट बाकी है, कौन खतरे में है, या किसी एक का नाम।",
    mr: "विचारा: कोणाला रेफर केलं, आज कोणाची भेट बाकी आहे, कोण धोक्यात आहे, किंवा एखाद्याचं नाव." };
}
