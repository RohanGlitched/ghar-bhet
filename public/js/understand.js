// Ghar Bhet: turn what an ASHA says into a visit record, with the exact words
// behind every value. Hindi, Marathi and English, in Devanagari or Roman script,
// digits or number words. No network, no model, no keys.

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

const DEV_DIGITS = "०१२३४५६७८९";
const NUKTA_PRE = { "\u0958": "\u0915\u093c", "\u0959": "\u0916\u093c", "\u095a": "\u0917\u093c", "\u095b": "\u091c\u093c", "\u095c": "\u0921\u093c", "\u095d": "\u0922\u093c", "\u095e": "\u092b\u093c", "\u095f": "\u092f\u093c" };
export function normalise(s) {
  return String(s || "")
    .replace(/[\u0958-\u095f]/g, (c) => NUKTA_PRE[c] || c)
    .replace(/\u0901/g, "\u0902")
    .replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)))
    .replace(/[‌‍]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"');
}

// English words that speech engines write in Devanagari, read as the English word
const DEV_EN = {};
for (const [d, e] of Object.entries({
  "वन": "one", "टू": "two", "थ्री": "three", "फ़ोर": "four", "फोर": "four", "फ़ाइव": "five", "फाइव": "five", "सिक्स": "six", "सेवन": "seven", "एट": "eight", "नाइन": "nine", "टेन": "ten",
  "ट्वेंटी": "twenty", "थर्टी": "thirty", "फ़ोर्टी": "forty", "फोर्टी": "forty", "फ़िफ़्टी": "fifty", "फिफ्टी": "fifty", "सिक्सटी": "sixty", "सेवेंटी": "seventy", "एटी": "eighty", "नाइंटी": "ninety", "हंड्रेड": "hundred",
  "डे": "day", "वेट": "weight", "फीडिंग": "feeding", "नो": "no", "वोमिटिंग": "vomiting", "फीवर": "fever", "बेबी": "baby", "ब्रीदिंग": "breathing",
})) DEV_EN[normalise(d)] = e;

/** Split into tokens with character offsets into the original string. */
export function tokenize(raw) {
  const s = normalise(raw);
  const out = [];
  // "2,400 grams" is 2400: a comma before exactly three digits groups thousands
  const re = /[0-9]{1,3}(?:,[0-9]{3})+(?![0-9])|[0-9]+(?:\.[0-9]+)?|[a-zA-Z]+|[ऀ-ॣ०-ॿ]+|\/|\+|°|[.,;!?।॥|]/g;
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0], lo: DEV_EN[m[0]] || (/^[0-9]/.test(m[0]) ? m[0].replace(/,/g, "") : m[0]).toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}
const BREAK = new Set([".", ",", ";", "!", "?", "।", "॥", "|"]);

/* ------------------------------------------------------------------ */
/* Numbers in three languages                                          */
/* ------------------------------------------------------------------ */

const HI = "शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानबे बानबे तिरानबे चौरानबे पंचानबे छियानबे सत्तानबे अट्ठानबे निन्यानबे".split(" ");
const MR = "शून्य एक दोन तीन चार पाच सहा सात आठ नऊ दहा अकरा बारा तेरा चौदा पंधरा सोळा सतरा अठरा एकोणीस वीस एकवीस बावीस तेवीस चोवीस पंचवीस सव्वीस सत्तावीस अठ्ठावीस एकोणतीस तीस एकतीस बत्तीस तेहतीस चौतीस पस्तीस छत्तीस सदतीस अडतीस एकोणचाळीस चाळीस एक्केचाळीस बेचाळीस त्रेचाळीस चव्वेचाळीस पंचेचाळीस सेहेचाळीस सत्तेचाळीस अठ्ठेचाळीस एकोणपन्नास पन्नास एक्कावन्न बावन्न त्रेपन्न चोपन्न पंचावन्न छप्पन्न सत्तावन्न अठ्ठावन्न एकोणसाठ साठ एकसष्ट बासष्ट त्रेसष्ट चौसष्ट पासष्ट सहासष्ट सदुसष्ट अडुसष्ट एकोणसत्तर सत्तर एक्काहत्तर बहात्तर त्र्याहत्तर चौऱ्याहत्तर पंच्याहत्तर शहात्तर सत्त्याहत्तर अठ्ठ्याहत्तर एकोणऐंशी ऐंशी एक्याऐंशी ब्याऐंशी त्र्याऐंशी चौऱ्याऐंशी पंच्याऐंशी शहाऐंशी सत्त्याऐंशी अठ्ठ्याऐंशी एकोणनव्वद नव्वद एक्याण्णव ब्याण्णव त्र्याण्णव चौऱ्याण्णव पंच्याण्णव शहाण्णव सत्त्याण्णव अठ्ठ्याण्णव नव्याण्णव".split(" ");
const K = (w) => normalise(w).toLowerCase();
// loose form for spelling drift: long and short i/u, nasal marks
const LOOSE = (w) => K(w).replace(/\u0940/g, "\u093f").replace(/\u0942/g, "\u0941").replace(/\u0908/g, "\u0907").replace(/\u090a/g, "\u0909").replace(/\u0902/g, "").replace(/\u093c/g, "");
const WORD = new Map(), WORD_LOOSE = new Map();
const addWord = (w, v) => { if (!WORD.has(K(w))) WORD.set(K(w), v); if (!WORD_LOOSE.has(LOOSE(w))) WORD_LOOSE.set(LOOSE(w), v); };
HI.forEach((w, i) => addWord(w, i));
MR.forEach((w, i) => addWord(w, i));
// common spelling variants from speech engines
for (const [w, v] of Object.entries({
  "पांच": 5, "छः": 6, "छे": 6, "सहा": 6, "नव": 9, "पन्द्रह": 15, "सत्तर": 70, "अस्सी": 80, "उन्नीस": 19, "पच्चीस": 25, "चालीस": 40, "पैंतालिस": 45,
  "बयालिस": 42, "चवालिस": 44, "छियालिस": 46, "सैंतालिस": 47, "अड़तालिस": 48, "बहात्तर": 72, "चौऱ्याहत्तर": 74, "पंचाहत्तर": 75, "एकशे": 100,
  "दहा": 10, "अठ्ठावन": 58, "चोपन": 54, "सव्वीस": 26,
})) addWord(w, v);
const EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const EN_TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ROMAN = {
  chauda: 14, choudah: 14, sola: 16, satra: 17, athra: 18, ekonis: 19, ekvees: 21, paach: 5, pach: 5, saha: 6, aath: 8, ek: 1, do: 2, don: 2, teen: 3, tin: 3, char: 4, chaar: 4, paanch: 5, panch: 5, pach: 5, chhe: 6, che: 6, chhah: 6, saha: 6, saat: 7, sat: 7, aath: 8, aat: 8, nau: 9, nav: 9,
  das: 10, daha: 10, gyarah: 11, gyara: 11, barah: 12, bara: 12, terah: 13, tera: 13, chaudah: 14, choda: 14, pandrah: 15, pandhra: 15, solah: 16, sola: 16, satrah: 17, satra: 17,
  atharah: 18, athara: 18, unnis: 19, bees: 20, bis: 20, vees: 20, pachees: 25, pachchis: 25, pachis: 25, tees: 30, tis: 30, battis: 32, battees: 32, paintis: 35, chalis: 40, chaalis: 40,
  pachas: 50, pachaas: 50, pannas: 50, saath: 60, sath: 60, sattar: 70, assi: 80, aissi: 80, nabbe: 90, navvad: 90,
  ikkis: 21, ekvis: 21, bais: 22, baais: 22, bavis: 22, teis: 23, tevis: 23, chaubis: 24, chovis: 24, chhabbis: 26, savvis: 26, sattais: 27, sattavis: 27, atthais: 28, aththavis: 28, untis: 29,
  ikattis: 31, ektis: 31, chhattis: 36, adtis: 38, chalees: 40, battis: 32, tetis: 33, chautis: 34, pentis: 35, saintis: 37, adtis2: 38, untalis: 39, shambhar: 100, ekshe: 100, didshe: 150,
  // Roman spellings speech engines write for 11-19 and the temperature tens (35-40)
  baarah: 12, baara: 12, gyaarah: 11, teraah: 13, chaudha: 14, pandra: 15, pandhrah: 15, solaah: 16, satraah: 17, athaarah: 18, unees: 19, unnees: 19,
  paintees: 35, pantis: 35, chhattees: 36, chattis: 36, chhatis: 36, saintees: 37, sentis: 37, sainthees: 37, adtees: 38, artees: 38, artis: 38, adhtis: 38, athtis: 38,
  iktalis: 41, bayalis: 42, bayalees: 42, taintalis: 43, chawalis: 44, chavalis: 44, chauvalis: 44, paintalis: 45, chhiyalis: 46, saintalis: 47, adtalis: 48, artalis: 48, unchas: 49,
  ikyavan: 51, bavan: 52, tirpan: 53, chauvan: 54, chhappan: 56, sattavan: 57, atthavan: 58, unsath: 59, iksath: 61, basath: 62, tirsath: 63, chaunsath: 64, painsath: 65,
  chhiyasath: 66, chhiyaasath: 66, sarsath: 67, adsath: 68, arsath: 68, unhattar: 69, ikhattar: 71, bahattar: 72, tihattar: 73, chauhattar: 74, pachhattar: 75, chhihattar: 76,
  sathattar: 77, athhattar: 78, unasi: 79, ikyasi: 81, bayasi: 82, tirasi: 83, chaurasi: 84, pachasi: 85, chhiyasi: 86, sattasi: 87, atthasi: 88, athasi: 88, navasi: 89,
  ikyanve: 91, banve: 92, tiranve: 93, chauranve: 94, pachanve: 95, chhiyanve: 96, chaubees: 24, chaubbis: 24, vis: 20, ekvisa: 21,
  untaalis: 39, untalees: 39, unchalis: 39, unchaalis: 39, chaalees: 40, pachpan: 55, navve: 90, satyanve: 97, athanve: 98, ninyanve: 99, nirnyanve: 99,
};
const KS = (list) => new Set(list.map(K));
const HUNDRED = KS(["सौ", "sau", "hundred", "शंभर", "shambhar", "शेकडा", "she", "शे"]); // "teen she" = 300
const THOUSAND = KS(["हज़ार", "हजार", "hazar", "hajar", "hazaar", "thousand"]);
const POINT = KS(["point", "pt", "पॉइंट", "पॉईंट", "पोइंट", "दशमलव", "पाइंट", "पॉंइट", "पूर्णांक", "purnank", "poornank"]);
const HALFWORD = { "डेढ़": 1.5, "डेढ": 1.5, "dedh": 1.5, "dhedh": 1.5, "ढाई": 2.5, "dhai": 2.5, "दीड": 1.5, "did": 1.5, "deed": 1.5, "अडीच": 2.5, "adich": 2.5 };
const MOD = { "सवा": 0.25, "sava": 0.25, "sawa": 0.25, "सव्वा": 0.25, "savva": 0.25, "साढ़े": 0.5, "साढे": 0.5, "sadhe": 0.5, "saadhe": 0.5, "saade": 0.5, "saadey": 0.5, "sadhey": 0.5, "saadhey": 0.5, "साडे": 0.5, "sade": 0.5, "पौने": -0.25, "paune": -0.25, "पावणे": -0.25, "pavne": -0.25 };

function unitWord(lo) {
  if (lo == null) return null;
  if (WORD.has(lo)) return WORD.get(lo);
  if (lo in EN) return EN[lo];
  if (lo in ROMAN) return ROMAN[lo];
  if (/[\u0900-\u097f]/.test(lo) && WORD_LOOSE.has(LOOSE(lo))) return WORD_LOOSE.get(LOOSE(lo));
  return null;
}
// Marathi "दीडशे" (150), "एकशे" (100), "दोनशे" (200), "सव्वाशे" (125)
const ROMAN_SHE = { ek: 100, don: 200, teen: 300, tin: 300, char: 400, chaar: 400, paach: 500, panch: 500, saha: 600, saat: 700, aath: 800, nau: 900, did: 150, deed: 150, adich: 250, savva: 125, sava: 125 };
function sheWord(lo) {
  const rm = lo.match(/^([a-z]+)she$/);
  if (rm && ROMAN_SHE[rm[1]]) return ROMAN_SHE[rm[1]];
  if (!lo.endsWith("शे") || lo.length < 3) return null;
  const stem = lo.slice(0, -2);
  if (stem in HALFWORD) return HALFWORD[stem] * 100;
  if (stem === "सव्वा") return 125;
  const v = unitWord(stem);
  return v != null && v > 0 && v < 20 ? v * 100 : null; // "अठराशे" = 1800
}

/** Try to read a number starting at token i. Returns { value, i0, i1 } (i1 exclusive) or null. */
export function readNumber(tok, i) {
  const start = i;
  let total = 0, cur = null, mod = 0, seen = false, decimals = null;
  const t = (k) => tok[k]?.lo;
  // digits first
  if (/^[0-9]/.test(t(i) || "")) {
    let v = parseFloat(t(i).replace(",", "."));
    let j = i + 1;
    if (POINT.has(t(j)) && /^[0-9]+$/.test(t(j + 1) || "")) { v = parseFloat(`${Math.trunc(v)}.${t(j + 1)}`); j += 2; }
    else if (POINT.has(t(j)) && unitWord(t(j + 1)) != null && unitWord(t(j + 1)) < 10) { v = Math.trunc(v) + unitWord(t(j + 1)) / 10; j += 2; }
    if (HUNDRED.has(t(j))) { v *= 100; j++; if (/^[0-9]+$/.test(t(j) || "") && +t(j) < 100) { v += +t(j); j++; } else { const u = unitWord(t(j)); if (u != null && u < 100) { v += u; j++; } } }
    if (THOUSAND.has(t(j))) { v *= 1000; j++; }
    return { value: v, i0: start, i1: j };
  }
  while (i < tok.length) {
    const lo = t(i);
    if (lo in MOD && !seen) { mod = MOD[lo]; i++; continue; }
    // glued Marathi "साडेआठ", "सव्वादोन"
    const glued = !seen && Object.keys(MOD).find((m) => /[ऀ-ॿ]/.test(m) && lo.startsWith(m) && lo.length > m.length && unitWord(lo.slice(m.length)) != null);
    if (glued) { cur = unitWord(lo.slice(glued.length)) + MOD[glued]; seen = true; i++; continue; }
    if (lo in HALFWORD) { cur = (cur || 0) + HALFWORD[lo]; seen = true; i++; continue; }
    const she = sheWord(lo);
    if (she != null) { cur = (cur || 0) + she; seen = true; i++; continue; }
    if (lo in EN_TENS) {
      // "one forty" = 140 in Indian English
      if (cur != null && cur >= 1 && cur < 10 && (t(i - 1) in EN)) cur = cur * 100 + EN_TENS[lo];
      else if (cur == null || cur >= 100) cur = (cur || 0) + EN_TENS[lo];
      else break;
      seen = true; i++; continue;
    }
    const u = unitWord(lo);
    // "one twelve" (112), "one oh two" (102) in Indian English
    if (cur != null && cur >= 1 && cur < 10 && (t(i - 1) in EN) && u != null && u >= 10 && u < 20 && (lo in EN)) { cur = cur * 100 + u; i++; continue; }
    if (cur != null && cur >= 1 && cur < 10 && (t(i - 1) in EN) && (lo === "oh" || lo === "o") && (t(i + 1) in EN) && EN[t(i + 1)] < 10) { cur = cur * 100 + EN[t(i + 1)]; i += 2; continue; }
    if (u != null) {
      // English "twenty five", Hindi words are whole numbers already
      if (cur != null && cur % 10 === 0 && cur >= 20 && u < 10 && (lo in EN)) cur += u;
      else if (cur != null && cur >= 100 && cur % 100 === 0 && u < 100) cur += u;
      else if (cur == null) cur = u;
      else break;
      seen = true; i++; continue;
    }
    if (HUNDRED.has(lo)) { if (cur != null && cur >= 100) break; cur = ((cur ?? 1) + mod) * 100; mod = 0; seen = true; i++; continue; }
    if (THOUSAND.has(lo) && seen) { total += ((cur ?? 1) + mod) * 1000; cur = null; mod = 0; i++; continue; }
    if (POINT.has(lo) && seen && cur != null) {
      const next = t(i + 1);
      const d = /^[0-9]$/.test(next || "") ? +next : unitWord(next);
      if (d != null && d < 10) { decimals = d; i += 2; }
      break;
    }
    if ((lo === "and" || lo === "aur") && seen && cur != null && cur >= 100) { i++; continue; }
    break;
  }
  if (!seen) return null;
  let value = total + (cur ?? 0) + mod;
  if (decimals != null) value = Math.trunc(value) + decimals / 10;
  return { value, i0: start, i1: i };
}

// "chaar se paanch pad", "4 ya 5", "4 to 5", "चार ते पाच", "4-5": one number with two ends
const RANGE = KS(["se", "से", "ya", "या", "to", "or", "ते", "किंवा", "kinva"]);
/**
 * Every number in the utterance, in order. A range becomes one number whose
 * value is the higher end, with { range: true, lo, hi } so a field can take the
 * more dangerous end (higher pads or temperature, lower weight or Hb).
 */
export function allNumbers(tok, raw) {
  const out = [];
  for (let i = 0; i < tok.length;) {
    const n = readNumber(tok, i);
    if (n) { out.push(n); i = Math.max(n.i1, i + 1); } else i++;
  }
  for (let k = 0; k < out.length - 1; k++) {
    const a = out[k], b = out[k + 1];
    const between = tok.slice(a.i1, b.i0);
    const hyphen = between.length === 0 && raw != null && /^\s*[-–]\s*$/.test(raw.slice(tok[a.i1 - 1].end, tok[b.i0].start));
    const word = between.length === 1 && RANGE.has(between[0].lo);
    if ((hyphen || word) && a.value > 0 && b.value > a.value && b.value <= a.value * 2 + 1) {
      out.splice(k, 2, { value: b.value, lo: a.value, hi: b.value, range: true, i0: a.i0, i1: b.i1 });
    }
  }
  return out;
}
const lowEnd = (n) => (n && n.range ? { ...n, value: n.lo } : n);

/* ------------------------------------------------------------------ */
/* Word lists. Each entry is a list of token sequences.                */
/* ------------------------------------------------------------------ */

const P = (list) => list.map((p) => normalise(p).toLowerCase().split(/\s+/));
const NEG = KS(["nahit", "nahiye", "nahin.", "naahi", "नाहीये", "नसतो", "नसते", "नहीँ", "नहीं", "नही", "nahi", "nahin", "nai", "nahee", "naheen", "नाही", "nahi.", "no", "not", "never", "नको", "न", "नहीं.", "नव्हता", "नव्हती", "नाहीत", "बिल्कुल", "none", "denies", "absent", "नसते", "नव्हते"]);
const NEG_BEFORE = KS(["na", "न", "no", "not", "without", "koi", "कोई", "कुठलाही", "कुठलीही", "never", "बिना", "bina"]);
const CORRECTION = KS(["sorry", "गलत", "galat", "माफ", "chuk", "चूक", "correction", "nahi-nahi"]);

const SYMPTOMS = {
  anc: {
    bleeding: P(["raktasrav", "raktsrav", "raktasrao", "raktsrao", "lal daag", "laal daag", "खून गया", "खून गई", "खून नहीं गया", "khoon gaya", "रक्त गेले", "रक्त गेलं", "bleeding", "bleed", "खून जा", "खून आ", "खून गिर", "ब्लीडिंग", "रक्तस्राव", "रक्त जा", "रक्त येत", "khoon ja", "khoon aa", "khoon gir", "spotting", "स्पॉटिंग", "रक्तस्त्राव"]),
    leaking_fluid: P(["पानी जा", "पानी निकल", "पानी आ रहा", "थैली फट", "पानी की थैली", "पाणी जा", "पाणी येत", "पाणी गेल", "पाण्याची पिशवी", "पिशवी फुट", "paani ja", "pani ja", "paani gel", "pani gel", "paani nikal", "pani nikal", "water leaking", "leaking", "waters broke", "water broke", "water bag", "bag burst", "thaili fat", "thaili phat", "thaili phut", "paani ki thaili", "pani ki thaili"]),
    convulsions: P(["akad gaye", "akad gayi", "akad jaata", "haath pair akad", "aankhen upar chadh", "aankh upar chadh", "aankhen palat", "आँखें ऊपर चढ़", "दाँत भींच", "dant bheench", "झटके", "झटका", "दौरा", "दौरे", "मिर्गी", "आकडी", "फिट", "jhatke", "jhatka", "daura", "daure", "fits", "fit", "convulsion", "convulsions", "seizure", "aakdi"]),
    severe_headache: P(["सिरदर्द", "सिर दर्द", "सर दर्द", "सिर में दर्द", "सर में दर्द", "डोकेदुखी", "डोकं दुख", "डोके दुख", "sirdard", "sir dard", "sar dard", "sar mein dard", "sir mein dard", "sir me dard", "sar me dard", "sir mein tez dard", "headache", "head ache", "dokedukhi"]),
    blurred_vision: P(["धुंधला", "धुँधला", "धूसर", "धूसर दिस", "dhundhla", "dhundla", "blurred", "blurring", "blurry", "vision", "dikhai nahi", "धुरकट", "अंधुक"]),
    swelling_face_hands: P(["चेहरे पर सूजन", "चेहरे पे सूजन", "चेहरे में सूजन", "हाथों में सूजन", "हाथ में सूजन", "पूरे शरीर में सूजन", "शरीर पर सूजन", "पूरे बदन", "चेहऱ्यावर सूज", "हातांना सूज", "हातावर सूज", "अंगावर सूज", "chehre par sujan", "chehre pe sujan", "chehre pe soojan", "haath mein sujan", "face swelling", "swelling on face", "face swollen", "puffy face", "swelling of face", "swelling in hands", "hands swollen", "body swelling", "whole body swelling", "facial puffiness"]),
    swelling_feet: P(["पैरों में सूजन", "पैर में सूजन", "पैरों पर सूजन", "पायांना सूज", "पायावर सूज", "पाय सुज", "pairon mein sujan", "pairon me sujan", "pair mein sujan", "pairo me soojan", "feet swelling", "swelling in feet", "swollen feet", "leg swelling", "swelling of feet", "pedal"]),
    fever: P(["बुखार", "ताप", "बदन गरम", "अंग गरम", "bukhar", "bukhaar", "fever", "taap", "tap aahe"]),
    // "tez bukhar": MCP card "high fever ... immediately"
    high_fever: P(["tez bukhar", "tej bukhar", "tez bukhaar", "bahut tez bukhar", "तेज़ बुखार", "तेज बुखार", "बहुत तेज़ बुखार", "खूप ताप", "जोराचा ताप", "joracha tap", "khup tap", "high fever", "very high fever"]),
    labour_pain: P(["labour wala", "labour vala", "labour waala", "labour pain", "labor pain", "labour pains", "labour shuru", "labor shuru", "labour start", "in labour", "dard shuru", "प्रसव पीड़ा", "प्रसव पीडा", "prasav peeda", "prasav pida", "दर्द शुरू", "कळा", "kalaa yet", "kala yet", "kala suru", "contractions"]),
    breathless: P(["breathing problem", "breathing difficulty", "difficulty in breathing", "साँस की तकलीफ", "साँस फूल", "सांस फूल", "साँस लेने में", "सांस लेने में", "दम लाग", "धाप लाग", "श्वास घ्यायला", "saans phool", "sans phool", "saans lene mein", "breathless", "breathlessness", "short of breath", "difficulty breathing", "dum lag"]),
    abdominal_pain: P(["पोटदुखी", "पेट में तेज़ दर्द", "पेट में तेज दर्द", "पेट में बहुत दर्द", "पेट दर्द", "पोटात दुख", "पोटदुखी", "पोटात खूप दुख", "pet mein dard", "pet me dard", "pet dard", "abdominal pain", "stomach pain", "tummy pain", "pain in abdomen", "pottat dukh"]),
    vomiting: P(["उल्टी", "उलटी", "ulti", "vomiting", "vomit", "omit", "उलट्या"]),
    dizziness: P(["giddy", "feels giddy", "डोळ्यासमोर अंधारी", "डोळ्यांसमोर अंधार", "dolyasamor andhari", "चक्कर", "आँखों के आगे अंधेरा", "आंखों के आगे अंधेरा", "आँखों के सामने अंधेरा", "आंखों के सामने अंधेरा", "कमज़ोरी", "कमजोरी", "अशक्तपणा", "डोळ्यांसमोर अंधारी", "chakkar", "kamzori", "kamjori", "dizzy", "dizziness", "giddiness", "weakness"]),
    burning_urine: P(["laghvila jaljal", "laghvi la jaljal", "laghvi kartana jal", "peshab me jalan", "peshab karte jalan", "jalan peshab", "पेशाब में जलन", "पेशाब करते समय जलन", "लघवीला जळजळ", "लघवी करताना जळ", "peshab mein jalan", "burning urine", "burning urination", "burning while urinating"]),
    foul_discharge: P(["वास येणारा", "वास येणारा स्राव", "vas yenara", "vaas yenara", "foul smell", "बदबू", "बदबूदार", "दुर्गंध", "वास येत", "badboo", "foul", "smelly discharge", "bad smell"]),
  },
  pnc: {},
  newborn: {
    convulsions: P(["झटके", "झटका", "दौरा", "दौरे", "आकडी", "फिट", "jhatke", "jhatka", "daura", "daure", "dore", "fits", "fit", "convulsion", "convulsions", "seizure", "aakdi",
      // a fit described in words: "akad jaata hai, aankhen upar chadh jaati hain"
      "akad", "akadta", "akadti", "akad jaata", "अकड़", "अकड", "aankhen upar", "aankh upar", "ankhen upar", "ankh upar", "aankhen palat", "aankh palat", "आँखें ऊपर", "आंखें ऊपर", "आँख ऊपर", "आँख पलट", "डोळे वर", "dole var", "eyes roll", "eyes rolling", "body stiff", "jerking"]),
    chest_indrawing: P(["chest andar", "chest ander", "chhati aat", "chati aat", "chhati andar", "chhaati andar", "chhati dhans", "pasli andar", "छाती आत", "पसली चल", "पसलियां चल", "पसली धंस", "छाती अंदर", "छाती आत", "छाती आत ओढ", "pasli chal", "pasliyan chal", "pasli dhans", "chest indrawing", "chest in-drawing", "chest going in", "chest goes in", "chest pulling in", "chhati andar"]),
    lethargy: P(["सुस्त", "ढीला", "हिल नहीं रहा", "हिलता नहीं", "हलचल नहीं", "छूने पर ही", "शिथिल", "हालचाल करत नाही", "हलत नाही", "सुस्तावले", "sust", "dheela", "dhila", "lethargic", "limp", "floppy", "not moving", "moves only when", "only when touched", "hil nahi raha", "hilta nahi"]),
    jaundice_palms_soles: P(["हात पाय पिवळे", "हातपाय पिवळे", "हात पिवळे", "पाय पिवळे", "तळपाय पिवळे", "हाताचे तळवे", "पायाचे तळवे", "हाथ पैर पीले", "हाथ-पैर पीले", "hath pay pivle", "haat paay pivle", "hat pay pivle", "haath pair peele", "hath pair peele", "talpay pivle", "हथेली पीली", "हथेलियां पीली", "तलवे पीले", "तलवे भी पीले", "पैर के तलवे", "तळवे पिवळे", "तळहात पिवळे", "hatheli peeli", "hatheliyan peeli", "talve peele", "palms yellow", "yellow palms", "soles yellow", "yellow soles", "palms and soles", "talve pivle"]),
    jaundice: P(["pivl", "pivale", "pivlepana", "पिवळेपणा", "पीलिया", "पीला", "पीली", "पीले", "कावीळ", "पिवळ", "peeliya", "piliya", "peela", "peeli", "jaundice", "yellow", "kavil", "pivla"]),
    blood_stool: P(["शौचात रक्त", "शीमध्ये रक्त", "शी मध्ये रक्त", "संडासमध्ये रक्त", "पॉटी में खून", "potty mein khoon", "मल में खून", "टट्टी में खून", "पॉटी में खून", "शौच में खून", "संडास में रक्त", "शी मध्ये रक्त", "mal mein khoon", "tatti mein khoon", "potty mein khoon", "blood in stool", "blood in potty", "bloody stool"]),
    cord_pus: P(["naabhi lal", "nabhi lal", "naabhi laal", "nabhi laal", "naabhi se pus", "nabhi se pus", "naabhi mein pus", "naabhi se mawad", "naal lal", "naal laal", "नाभि से पस", "नाभी लाल", "नाभी से मवाद", "नाभि से मवाद", "नाभि में मवाद", "नाभि से पानी", "नाभि लाल", "नाल से", "नाल में", "नाळेतून पू", "नाळ लाल", "नाळेला पू", "नाळेतून", "nabhi se mawad", "nabhi mein mawad", "naal se", "naal mein", "cord pus", "pus from cord", "cord red", "cord bleeding", "umbilical"]),
    skin_pustules: P(["daane", "dane", "pus wale daane", "phunsiyan", "funsiyan", "फुंसी", "फुंसियां", "दाने", "पुटकुळ्या", "फोड", "funsi", "phunsi", "pustules", "boils", "pus spots", "skin spots"]),
    eye_discharge: P(["dolyatun pu", "dolyatun pani", "dolyat pu", "dolyatun ghaan", "aankh se pus", "aankh mein keechad", "aankh se paani", "ankh se pani", "aankh se pani", "आंख से पानी", "डोळ्यांतून पाणी", "डोळ्यातून", "आँख से कीचड़", "आंख से कीचड़", "आँख से पानी", "आंख से मवाद", "डोळ्यातून पाणी", "डोळ्यातून पू", "aankh se keechad", "eye discharge", "sticky eyes", "pus from eyes", "eyes swollen"]),
    cold_to_touch: P(["ang thand", "thand", "cold", "ठंड", "थंड", "बदन ठंडा", "शरीर ठंडा", "ठंडा है", "ठंडा लग", "अंग थंड", "थंड लाग", "badan thanda", "thanda", "cold to touch", "feels cold", "body cold"]),
    hot_to_touch: P(["गरम", "garam", "hot", "बदन गरम", "शरीर गरम", "बुखार", "अंग गरम", "ताप", "badan garam", "bukhar", "fever", "hot to touch", "feels hot", "taap", "garam"]),
    weak_cry: P(["cry weak", "cry is weak", "rona weak", "रडणे कमी", "कमी रडत", "रडत नाही", "रोना कमज़ोर", "रोना कमजोर", "कम रो", "धीरे रो", "रडणे कमी", "कमी रडत", "rona kamzor", "weak cry", "cry is weak", "cries weakly"]),
    vomiting: P(["उल्टी", "उलटी", "ulti", "vomiting", "vomit", "उलट्या"]),
    diarrhoea: P(["julab", "julaab", "patle dast", "दस्त", "जुलाब", "पतली टट्टी", "जुलाब होत", "dast", "loose motion", "loose motions", "diarrhoea", "diarrhea"]),
    // SSBSK Table 3.3 "difficulty in breathing" (fast breathing and chest indrawing have their own codes)
    difficulty_breathing: P(["saans lene takl", "saans lene taql", "saans lene dikk", "saans lene pare", "sans lene takl", "sans lene dikk", "sans lene pare", "saans takl", "saans dikk", "saans lene mein takleef", "saans lene me takleef", "saans lene mein dikkat", "saans lene me dikkat", "sans lene mein takleef", "sans lene me takleef", "saans lene mein pareshani", "saans mein takleef", "saans ki takleef", "साँस लेने में तकलीफ", "सांस लेने में तकलीफ", "साँस लेने में दिक्कत", "सांस लेने में दिक्कत", "साँस लेने में परेशानी", "साँस में तकलीफ", "सांस में तकलीफ", "साँस की तकलीफ", "श्वास घ्यायला त्रास", "श्वास घेताना त्रास", "श्वास घेण्यास त्रास", "श्वासाचा त्रास", "shwas ghyayla tras", "shvas ghyayla tras", "shwas ghetana tras", "difficulty breathing", "difficulty in breathing", "trouble breathing", "breathing difficulty", "breathing problem", "struggling to breathe", "hard to breathe"]),
    // HBNC 2014 sepsis checklist "distended abdomen"
    abdominal_distension: P(["pet phula", "pet phool", "pet fula", "pet ful", "pet phul", "pet tight", "पेट फूला", "पेट फूल", "पेट फुला", "पेट कड़ा", "पोट फुगल", "पोट फुगलं", "पोट फुगले", "pot fugla", "pot fuglay", "swollen belly", "belly swollen", "belly is swollen", "tummy swollen", "abdomen swollen", "distended"]),
  },
};
SYMPTOMS.pnc = {
  // both word orders: "bahut khoon ja raha", "khoon zyada ja raha", "रक्त जास्त जातंय"
  heavy_bleeding: P(["khup raktasrav", "jast raktasrav", "jaast raktasrav", "raktasrav khup", "raktasrav jast", "बहुत खून", "ज़्यादा खून", "ज्यादा खून", "खूब खून", "खूप रक्तस्राव", "जास्त रक्तस्राव", "खूप रक्त", "जास्त रक्त", "bahut khoon", "zyada khoon", "jyada khoon", "khoob khoon", "khub khoon",
    "खून ज़्यादा", "खून ज्यादा", "खून बहुत", "खून खूब", "रक्त जास्त", "रक्त खूप", "रक्तस्राव जास्त", "रक्तस्त्राव जास्त", "रक्तस्राव खूप", "khoon zyada", "khoon jyada", "khoon bahut", "khoon khoob", "khoon khub", "rakt jaast", "rakt khup", "raktasrav jaast",
    "heavy bleeding", "excessive bleeding", "lot of bleeding", "too much bleeding", "bleeding a lot", "bleeding heavily", "bleeding is heavy"]),
  severe_headache: SYMPTOMS.anc.severe_headache,
  jaundice: P(["पीलिया", "कावीळ", "आँखें पीली", "आंखें पीली", "आँख पीली", "डोळे पिवळे", "त्वचा पिवळी", "peeliya", "piliya", "pilia", "jaundice", "kavil", "kaavil", "aankhein peeli", "ankhen peeli", "aankh peeli", "dole pivle", "yellow eyes", "eyes yellow", "eyes are yellow", "skin yellow", "skin is yellow"]),
  incontinence: P(["पेशाब अपने आप", "पेशाब अपने-आप", "पेशाब निकल जा", "मल अपने आप", "लघवी आपोआप", "शौच आपोआप", "peshab apne aap", "peshab apne-aap", "laghvi aapoaap", "laghvi apoaap", "laghvi aapoap", "urine leaks", "leaking urine", "urine leaking", "incontinence", "wets herself", "passes urine without", "cannot hold urine", "can't hold urine", "cannot hold her urine", "cannot control urine"]),
  // stitches: "tanke mein pus"
  wound_infection: P(["tanke mein pus", "tanke me pus", "taanke mein pus", "tanke pak", "taanke pak", "tanko mein pus", "टांके में मवाद", "टाँके में मवाद", "टांके पक", "टाक्यांना पू", "टाके पिकले", "stitches pus", "pus from stitches", "stitch infection", "wound infection", "wound pus"]),
  // calf pain or swelling (SSBSK Form 4 oedema of legs; a clot needs a doctor)
  calf_pain: P(["pindli mein dard", "pindli dard", "pindli sujan", "pindli mein sujan", "पिंडली में दर्द", "पिंडली में सूजन", "पोटरीत दुख", "पोटरी सुज", "potrit dukh", "calf pain", "calf swelling", "calf swollen", "pain in calf", "pain in the calf"]),
  // SSBSK Form 4 psychological distress
  low_mood: P(["udaas", "udas", "उदास", "nirash", "निराश", "dukhi rehti", "दुखी रहती", "roti rehti", "रोती रहती", "रडत असते", "man nahi lagta", "मन नहीं लगता", "मन लागत नाही", "sad", "depressed", "hopeless", "low mood", "no interest"]),
  pallor: P(["पांढरा पड", "pandhra pad", "pandhari padli", "फीका", "pheeka", "fika", "सफ़ेद पड़", "सफेद पड़", "फीकी", "पांढरी पड", "फिकट", "safed pad", "pheeki", "fiki", "pandhari pad", "fikat", "pale", "paleness", "pallor", "looks pale"]),
  fever: SYMPTOMS.anc.fever,
  foul_discharge: SYMPTOMS.anc.foul_discharge,
  convulsions: SYMPTOMS.anc.convulsions,
  blurred_vision: SYMPTOMS.anc.blurred_vision,
  abnormal_speech: P(["talking irrelevant", "irrelevant talk", "talks irrelevant", "not making sense", "talks nonsense", "talking nonsense", "behki behki", "बहकी बहकी", "बकवास कर", "bakwas kar", "उल्टा सीधा बोल", "उल्टा-सीधा", "बोलने में अटक", "अटक रही", "अडखळ", "बडबड", "बड़बड़", "ulta seedha bol", "atak ke bol", "अजीब बातें", "बहकी बातें", "अटपटा बोल", "बेतुका बोल", "विचित्र बोल", "असंबद्ध बोल", "ajeeb baatein", "behki baatein", "talking strangely", "abnormal speech", "speaking abnormally", "confused talk", "not talking properly"]),
  breathless: SYMPTOMS.anc.breathless,
  abdominal_pain: SYMPTOMS.anc.abdominal_pain,
  burning_urine: SYMPTOMS.anc.burning_urine,
  swelling_face_hands: SYMPTOMS.anc.swelling_face_hands,
  breast_problem: P(["स्तन", "स्तनाला सूज", "स्तनाला", "स्तनात", "breast problem", "breast", "स्तन में दर्द", "स्तन में सूजन", "स्तनात सूज", "स्तन में गांठ", "दूध नहीं उतर", "छाती में दर्द", "स्तनात दुख", "स्तनात गाठ", "stan mein dard", "stan dard", "stan sujan", "stan soojan", "stan mein sujan", "stan me sujan", "stan mein gaanth", "breast pain", "breast lump", "breast swelling", "cracked nipple", "nipple cracked", "engorged"]),
  dizziness: SYMPTOMS.anc.dizziness,
};

// Phrases whose meaning is fixed: [code, phrases, value]
const ABSENT = {
  newborn: [
    ["cord_pus", P(["naabhi sookhi", "naabhi sukhi", "naabhi saaf", "nabhi saaf", "नाभि सूखी", "नाभि साफ़", "नाभि साफ", "नाळ सुकली", "नाळ कोरडी", "नाळ स्वच्छ", "naal sookh", "naal sukh", "naal sukl", "naal sukal", "naal sukali", "naal suklee", "nabhi sookhi", "cord clean", "cord is clean", "cord dry", "cord is dry", "कोई मवाद नहीं", "मवाद नहीं", "पू नाही", "pus nahi", "no pus"]), false],
    ["weak_cry", P(["रोती ज़ोर", "रोती जोर", "रोता ज़ोर", "रोता जोर", "रोते ज़ोर", "ज़ोर से रोती", "ज़ोर से रोता", "जोरात रडतं", "जोरात रडते", "ज़ोर से रो", "जोर से रो", "रोता भी ज़ोर", "रोता भी जोर", "रोती भी ज़ोर", "जोरात रडत", "जोरात रडतं", "zor se ro", "jor se ro", "cries loudly", "crying loudly", "strong cry", "cries well", "crying well", "good cry"]), false],
    ["lethargy", P(["हातपाय हलवत", "हात पाय हलवत", "हाथ पैर चला", "हाथ-पैर चला", "haath pair chala", "active", "moving well", "moves well", "खूप हालचाल", "हालचाल चांगली"]), false],
    // "bilkul nahi hil raha": the negation is the sign
    ["lethargy", P(["bilkul nahi hil", "bilkul nahin hil", "hil hi nahi", "hilta hi nahi", "hilti hi nahi", "nahi hil raha", "nahi hil rahi", "nahi hilta", "बिल्कुल नहीं हिल", "हिल ही नहीं", "नहीं हिल रहा", "नहीं हिल रही", "हलतच नाही", "अजिबात हलत नाही", "not moving at all", "does not move", "doesn't move"]), true],
    ["weak_cry", P(["रोना तेज़", "रोना तेज", "rona tez", "rona tej", "cry is strong", "strong cry", "loud cry", "रडणं जोरात", "radna jorat"]), false],
    ["eye_discharge", P(["डोळे स्वच्छ", "आँखें साफ़", "आँखें साफ", "आंखें साफ", "eyes clean", "eyes are clean"]), false],
  ],
  anc: [
    ["blurred_vision", P(["saaf dikhta", "saaf dikh", "साफ़ दिखता", "साफ दिखता", "clear vision", "vision is clear", "vision clear", "स्पष्ट दिसत", "नीट दिसत"]), false],
    ["breathless", P(["saans theek", "saans normal", "sans theek", "साँस ठीक", "सांस ठीक", "breathing normal", "breathing is normal", "breathing fine", "श्वास नीट"]), false],
  ],
  pnc: [
    ["blurred_vision", P(["saaf dikhta", "saaf dikh", "साफ़ दिखता", "साफ दिखता", "clear vision", "vision is clear", "vision clear", "स्पष्ट दिसत", "नीट दिसत"]), false],
    ["breathless", P(["saans theek", "saans normal", "sans theek", "साँस ठीक", "सांस ठीक", "breathing normal", "breathing is normal", "breathing fine", "श्वास नीट"]), false],
    ["breast_problem", P(["breasts soft", "breast soft", "breasts are soft", "स्तन नरम", "stan naram", "स्तन मऊ"]), false],
    ["heavy_bleeding", P(["खून नॉर्मल", "नॉर्मल खून", "bleeding normal", "bleeding is normal", "bleeding kam", "bleeding is less", "रक्तस्राव कमी", "रक्तस्राव नॉर्मल", "थोडा रक्तस्राव", "रक्तस्त्राव कमी", "khoon normal", "bleeding theek"]), false],
    ["breast_problem", P(["स्तन ठीक", "स्तन नॉर्मल", "breasts are fine", "breasts fine", "breast is fine", "breasts normal", "breast fine", "स्तनात काही त्रास नाही", "स्तन में कोई दिक्कत नहीं"]), false],
    ["abnormal_speech", P(["बोलणं नीट नाही", "बोलणे नीट नाही", "ठीक से बोल नहीं", "ठीक से नहीं बोल", "theek se bol nahi", "not talking properly", "not speaking properly"]), true],
    // the negation word is part of the sign: "she cannot hold her urine"
    ["incontinence", P(["पेशाब रुकता नहीं", "पेशाब रुक नहीं", "पेशाब पर कंट्रोल नहीं", "लघवी थांबत नाही", "लघवी आवरत नाही", "लघवीवर ताबा नाही", "peshab rukta nahi", "peshab ruk nahi", "laghvi thambat nahi", "laghvi aavrat nahi", "can not hold urine", "cannot hold her urine", "no control over urine", "peshab rok nahi", "peshab rok nahin", "peshab rok na", "laghvi thambavta yet nahi", "laghvi thambavta", "लघवी थांबवता येत नाही", "thambavta yet nahi", "पेशाब रोक नहीं", "पेशाब रोक न", "latrine rok nahi", "potty rok nahi", "लघवी रोखता येत नाही", "laghvi rokhta yet nahi"]), true],
  ],
};

const ANCHOR = {
  bp: P(["bp", "बीपी", "बी पी", "blood pressure", "ब्लड प्रेशर", "ब्लडप्रेशर", "रक्तदाब", "pressure", "प्रेशर"]),
  // bare "khoon" (blood) is not Hb: "khoon aa raha" is bleeding
  hb: P(["hb", "एचबी", "hemoglobin", "haemoglobin", "हीमोग्लोबिन", "हिमोग्लोबिन", "हिमोग्लोबीन", "हीमोग्लोबीन", "खून की मात्रा", "खून की कमी", "खून की जांच", "खून की जाँच", "रक्ताचे प्रमाण", "रक्त तपासणी", "khoon ki matra", "khoon ki kami", "khoon ki jaanch", "khoon ki janch", "blood level", "blood test"]),
  weight: P(["wajan", "wazan", "vajan", "vazan", "वजन", "वज़न", "weight", "weighs", "वजन"]),
  temp: P(["tapman", "taapmaan", "tapmaan", "temprature", "टेम्परेचर", "टेंपरेचर", "टेम्प्रेचर", "तपमान", "temp", "temperature", "तापमान", "तापमान", "बुखार", "bukhar", "ताप", "taap", "degree", "डिग्री", "fever", "थर्मामीटर", "thermometer"]),
  resp: P(["shwas", "shvas", "swas", "श्वासोच्छवास", "saans", "sans", "सांस", "साँस", "श्वास", "श्वासोच्छ्वास", "breath", "breaths", "breathing", "respiratory", "rr", "breathing rate"]),
  pads: P(["pad", "pads", "पैड", "पॅड", "पैड्स", "पॅड्स", "कपड़ा", "कपडे"]),
  albumin: P(["albumin", "एल्ब्यूमिन", "अल्ब्यूमिन", "अल्ब्युमिन", "एल्बुमिन", "अल्बुमिन", "protein", "प्रोटीन", "urine protein"]),
  ifa: P(["ifa", "iron", "आयरन", "आइरन", "लोह", "लोहाच्या", "folic", "फोलिक"]),
};
const UNIT_KG = KS(["kilo", "kg", "kgs", "किलो", "kilogram", "किलोग्राम", "kilos"]);
const UNIT_G = KS(["gram", "grams", "g", "gm", "gms", "ग्राम", "ग्रॅम", "gram."]);
const UNIT_F = KS(["f", "fahrenheit", "फ़ारेनहाइट", "फारेनहाइट", "फॅरेनहाइट"]);
const UNIT_C = KS(["c", "celsius", "सेल्सियस", "सेल्सिअस", "centigrade"]);
const SEP_BP = KS(["by", "/", "बटा", "बाय", "over", "पर", "on", "ऑन", "बटे", "upon", "bata", "batta", "baata", "bataa", "bate", "slash", "bay", "बट्टा", "ओवर", "स्लॅश", "स्लैश"]);
const WEEKS = KS(["hafte", "hafta", "hafton", "हफ्ते", "हफ़्ते", "हफ्ता", "हफ़्ता", "सप्ताह", "आठवडे", "आठवड्यांची", "आठवड्यांचा", "आठवडे.", "weeks", "week", "wks", "आठवड्याची", "आठवड्यांची"]);
const MONTH = KS(["mahina", "mahine", "mahinay", "महीना", "महीने", "महिना", "महिने", "month", "months", "महिन्याची", "महिन्यांची", "महिन्याचा", "मास"]);
const DAY = KS(["din", "दिन", "दिवस", "दिवसांचे", "दिवसाचे", "दिवसांचा", "दिवसांची", "दिवशी", "day", "days", "दिनों", "दिवसांनी"]);
const TABLET = KS(["goli", "goliyan", "goliyaan", "गोली", "गोलियां", "गोलियाँ", "गोळ्या", "गोळी", "tablet", "tablets", "टैबलेट", "टॅबलेट", "टेबलेट"]);
const PLUS = KS(["plus", "+", "प्लस", "प्लस."]);
const MINUTE = KS(["minute", "min", "मिनट", "मिनिट", "मिनिटाला", "मिनट"]);

// Ordinals: "teesra din", "सातवें दिन", "सातवा महिना"
const ORD = {
  "pehla": 1, "pahla": 1, "pehle": 1, "pahle": 1, "pehli": 1, "पहला": 1, "पहले": 1, "पहिला": 1, "पहिल्या": 1, "first": 1, "dusra": 2, "doosra": 2, "दूसरा": 2, "दूसरे": 2, "दुसरा": 2, "दुसऱ्या": 2, "second": 2,
  "teesra": 3, "tisra": 3, "तीसरा": 3, "तीसरे": 3, "तिसरा": 3, "तिसऱ्या": 3, "third": 3, "chautha": 4, "चौथा": 4, "चौथे": 4, "चौथ्या": 4, "fourth": 4,
  "paanchva": 5, "पांचवां": 5, "पाँचवाँ": 5, "पाँचवें": 5, "पांचवें": 5, "पाचवा": 5, "पाचव्या": 5, "fifth": 5, "chhatha": 6, "chhathe": 6, "chhate": 6, "teesre": 3, "tisre": 3, "chauthe": 4, "doosre": 2, "dusre": 2, "doosri": 2, "छठा": 6, "छठे": 6, "सहावा": 6, "सहाव्या": 6, "sixth": 6,
  "saatva": 7, "satva": 7, "सातवां": 7, "सातवाँ": 7, "सातवें": 7, "सातवा": 7, "सातव्या": 7, "seventh": 7, "aathva": 8, "आठवां": 8, "आठवाँ": 8, "आठवें": 8, "आठवा": 8, "आठव्या": 8, "eighth": 8,
  "pahila": 1, "pahilya": 1, "dusrya": 2, "tisrya": 3, "chauthya": 4, "chautha": 4, "pachva": 5, "pachvya": 5, "sahava": 6, "sahavya": 6, "satvya": 7, "athva": 8, "athvya": 8, "nava": 9, "navvya": 9, "navva": 9, "dahava": 10, "dahavya": 10, "dasva": 10, "chhatha": 6,
  "nauva": 9, "naveva": 9, "navava": 9, "nauvan": 9, "nauvaan": 9, "नववां": 9, "नौवां": 9, "नौवाँ": 9, "नौवें": 9, "नववा": 9, "नवव्या": 9, "ninth": 9, "दसवां": 10, "दहावा": 10, "tenth": 10,
};

const ORD_SUFFIX = ["ava", "avya", "\u0935\u093e\u0902", "\u0935\u0947\u0902", "\u0935\u0940\u0902", "\u0935\u093e", "\u0935\u0947", "\u0935\u0940", "\u0935\u094d\u092f\u093e", "va", "vaan", "van", "vein", "ve", "vi", "th", "st", "nd", "rd"];
const ORDK = {};
for (const [k, v] of Object.entries(ORD)) ORDK[K(k)] = v;
function ordinalOf(lo) {
  if (lo == null) return null;
  if (ORDK[lo] != null) return ORDK[lo];
  for (const suf of ORD_SUFFIX) if (lo.endsWith(suf) && lo.length > suf.length + 1) { const v = unitWord(lo.slice(0, -suf.length)) ?? (/^[0-9]+$/.test(lo.slice(0, -suf.length)) ? +lo.slice(0, -suf.length) : null); if (v != null && v >= 1 && v <= 60) return v; }
  return null;
}

/* ------------------------------------------------------------------ */
/* Matching helpers                                                    */
/* ------------------------------------------------------------------ */

// Match a phrase at token i. A negation ("खून नहीं जा रहा") and up to two filler
// words ("सिर में बहुत तेज़ दर्द", "rona bhi kamzor") may sit inside it.
const FILLER = KS(["hi", "ही", "toh", "तो", "bas", "बस", "aaj", "आज", "bhi", "भी", "pan", "पण", "bahut", "बहुत", "खूप", "khup", "thoda", "थोड़ा", "थोडा", "हल्की", "हल्का", "halki", "halka", "zyada", "ज़्यादा", "ज्यादा", "very", "really", "too", "so", "तेज़", "तेज", "tez", "jor", "जोरात", "is", "are", "a", "the", "से", "se", "में", "me", "mein", "पे", "pe", "पर", "ki", "की", "का", "ka", "थोड़ी", "kaafi", "काफी", "जरा", "zara", "koi", "कोई", "kuch", "कुछ", "any", "kahi", "काही"]);
const eq = (a, b, single) => (single && b.length <= 3 ? a === b : a.startsWith(b));
function matchAt(tok, i, seq) {
  let j = i, neg = false, skipped = 0;
  for (let k = 0; k < seq.length; k++) {
    let a = tok[j]?.lo; if (a == null) return null;
    const single = seq.length === 1;
    while (k > 0 && !eq(a, seq[k], single) && (NEG.has(a) || FILLER.has(a)) && skipped < 2) {
      if (NEG.has(a)) neg = true;
      skipped++; j++; a = tok[j]?.lo; if (a == null) return null;
    }
    if (!eq(a, seq[k], single)) return null;
    j++;
  }
  return { i1: j, neg };
}
function findAll(tok, list) {
  const hits = [];
  for (let i = 0; i < tok.length; i++) for (const seq of list) { const m = matchAt(tok, i, seq); if (m) { hits.push({ i0: i, i1: m.i1, neg: m.neg }); break; } }
  return hits;
}
/** Clause boundaries: punctuation and joining words. */
const JOIN = KS(["aur", "और", "and", "आणि", "पण", "लेकिन", "but", "magar", "मगर", "lekin", "tatha", "तथा", "व", "also", "भी"]);
function clauseOf(tok, i) {
  let a = i, b = i;
  while (a > 0 && !BREAK.has(tok[a - 1].t) && !JOIN.has(tok[a - 1].lo)) a--;
  while (b < tok.length - 1 && !BREAK.has(tok[b + 1].t) && !JOIN.has(tok[b + 1].lo)) b++;
  return [a, b];
}
function negated(tok, hit) {
  if (hit.neg) return true;
  const [a, b] = clauseOf(tok, hit.i0);
  for (let k = hit.i1; k <= b; k++) if (NEG.has(tok[k].lo)) return true;
  for (let k = Math.max(a, hit.i0 - 3); k < hit.i0; k++) if (NEG_BEFORE.has(tok[k].lo) || tok[k].lo === "no" || tok[k].lo === "not") return true;
  // "सूजन और बुखार नहीं है": a bare symptom clause followed by a negated clause
  if (b - a + 1 <= 3 && b + 2 < tok.length && JOIN.has(tok[b + 1]?.lo)) {
    const [a2, b2] = clauseOf(tok, b + 2);
    const tail = tok.slice(a2, b2 + 1).map((x) => x.lo);
    if (tail.length <= 5 && tail.some((w) => NEG.has(w))) return true;
  }
  // "she denies bleeding", "no complaints of headache or blurring of vision": the whole list is negated
  for (let k = hit.i0 - 1, n = 0; k >= 0 && n < 14; k--, n++) {
    const t = tok[k];
    if ([".", "।", "?", "!", ";", "॥"].includes(t.t)) break;
    if (/^(denies|denied|deny|denying|without)$/.test(t.lo)) return true;
    if (/^(complaints?|history|c)$/.test(t.lo) && ["no", "not", "nil", "any"].includes(tok[k - 1]?.lo)) return true;
  }
  // "jhatke aate hain kya? nahi": a question answered with a bare no
  const asked = tok[b + 1]?.t === "?" || (QWORD.has(tok[b]?.lo) && BREAK.has(tok[b + 1]?.t ?? ""));
  if (asked) {
    let k = b + 2;
    while (tok[k] && (FILLER.has(tok[k].lo) || /^(bola|boli|bole|kaha|said|says|answer|jawab|उत्तर|बोली|बोला|कहा|म्हणाली|sangitla|she|he)$/.test(tok[k].lo))) k++;
    if (tok[k] && NEG.has(tok[k].lo) && (!tok[k + 1] || BREAK.has(tok[k + 1].t) || NEG.has(tok[k + 1].lo) || ["hai", "है", "आहे", "aaye", "aate", "aaya"].includes(tok[k + 1].lo))) return true;
  }
  return false;
}
const QWORD = KS(["kya", "क्या", "ka", "का", "kay", "काय", "na", "ना"]);
const span = (tok, i0, i1) => ({ start: tok[i0].start, end: tok[i1 - 1].end });

/** The nearest number after an anchor (within `ahead` tokens), else just before it. */
function numberNear(tok, nums, anchor, { ahead = 7, behind = 4 } = {}) {
  const after = nums.find((n) => n.i0 >= anchor.i1 && n.i0 - anchor.i1 <= ahead && !crossesBreak(tok, anchor.i1, n.i0));
  if (after) return after;
  const before = [...nums].reverse().find((n) => n.i1 <= anchor.i0 && anchor.i0 - n.i1 <= behind && !crossesBreak(tok, n.i1, anchor.i0));
  return before || null;
}
function crossesBreak(tok, a, b) { for (let k = a; k < b; k++) if (BREAK.has(tok[k].t) && tok[k].t !== ".") return true; return false; }

/* ------------------------------------------------------------------ */
/* Visit type                                                          */
/* ------------------------------------------------------------------ */

const TYPE_WORDS = {
  newborn: P(["baby", "bachcha", "bachha", "bacha", "बच्चा", "बच्चे", "बच्ची", "बाळ", "बाळाचे", "बाळाचा", "बाळाला", "नवजात", "newborn", "new born", "shishu", "शिशु", "infant", "दिन का", "दिन की", "din ka", "din ki", "दिवसांचे", "दिवसांचा", "नाल", "नाळ", "naal", "cord", "पसली", "pasli", "दूध पी", "doodh pee", "दूध पित", "दूध पीत"]),
  pnc: P(["delivery", "डिलीवरी", "डिलिवरी", "प्रसूती", "प्रसूतीनंतर", "प्रसव", "जचगी", "jachgi", "prasav", "after delivery", "postnatal", "pnc", "पैड", "पॅड", "pad", "pads", "बाळंतपण", "बाळंतीण", "जच्चा"]),
  anc: P(["pregnant", "pregnancy", "garbhwati", "गर्भवती", "गरोदर", "गर्भ", "hafte", "हफ्ते", "हफ़्ते", "सप्ताह", "आठवडे", "weeks", "mahina", "महीना", "महिना", "महीने", "bp", "बीपी", "hb", "हीमोग्लोबिन", "हिमोग्लोबिन", "अल्ब्युमिन", "albumin", "पेट में", "pet mein", "पोटात", "हलचल", "हालचाल", "movement"]),
};
export function detectType(text, hint) {
  const tok = tokenize(text);
  const score = { anc: 0, pnc: 0, newborn: 0 };
  for (const k of Object.keys(score)) score[k] = findAll(tok, TYPE_WORDS[k]).length;
  // "the baby is moving less" in pregnancy talks about the foetus
  if (/(हलचल|हालचाल|movement|hil\s|हिल\s|हिल रहा|pet mein|पेट में|पोटात)/i.test(normalise(text)) && !/(दिन का|din ka|दिवसांचे|नाळ|naal|नाल|पसली|pasli|जन्म)/i.test(normalise(text))) score.newborn -= 2;
  if (score.pnc > 0 && /(delivery|डिलीवरी|प्रसूती|प्रसव|जचगी|pnc|बाळंत)/i.test(normalise(text))) score.pnc += 1;
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  if (best[1] <= 0) return hint || null;
  if (hint && score[hint] === best[1]) return hint;
  return best[0];
}

/* ------------------------------------------------------------------ */
/* Names, shown in Roman letters                                       */
/* ------------------------------------------------------------------ */

const V = { "अ": "a", "आ": "a", "इ": "i", "ई": "i", "उ": "u", "ऊ": "u", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o", "ऍ": "e" };
const M = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ृ": "ri", "ॉ": "o", "ॅ": "e" };
const C = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "ऱ": "r", "ऴ": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h" };
const NUKTA = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
/** Devanagari to plain Roman letters, so any reader can follow (sunita, pasli chal rahi hai). */
export function romanize(s) {
  // precomposed nukta letters, Devanagari digits and joiners first (normalise keeps offsets aside)
  const chars = [...normalise(s)];
  const out = [];
  let word = []; // syllables of the current word: { c, v, inh }
  const flush = () => {
    // Hindi schwa deletion: drop the inherent "a" at the end of a word, and in V C(a) C V
    for (let k = 0; k < word.length; k++) {
      const syl = word[k];
      if (!syl.inh) continue;
      const last = k === word.length - 1;
      if (last && k > 0) { syl.v = ""; continue; }
      const prev = word[k - 1], next = word[k + 1];
      if (k > 0 && prev && prev.v && next && next.c && (next.v || next.inh) && k + 1 < word.length - 1 + (next.inh ? 0 : 1)) syl.v = "";
    }
    out.push(word.map((x) => x.c + x.v + (x.n || "")).join(""));
    word = [];
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (C[ch]) {
      let base = C[ch];
      if (chars[i + 1] === "़") { base = NUKTA[ch] || base; i++; }
      const after = chars[i + 1];
      if (after === "्") { word.push({ c: base, v: "", inh: false }); i++; continue; }
      if (M[after]) { word.push({ c: base, v: M[after], inh: false }); i++; continue; }
      word.push({ c: base, v: "a", inh: true });
      continue;
    }
    if (V[ch]) { word.push({ c: "", v: V[ch], inh: false }); continue; }
    if (ch === "ं" || ch === "ँ") { if (word.length) { const w = word[word.length - 1]; w.n = (w.n || "") + "n"; w.inh = false; } continue; }
    if (ch === "ः") { if (word.length) word[word.length - 1].n = "h"; continue; }
    if (ch === "़" || ch === "्" || ch === "ऽ" || ch === "॑" || ch === "॒") continue;
    if (ch === "ॐ") { if (word.length) flush(); out.push("om"); continue; }
    if (word.length) flush();
    out.push(ch === "।" ? "." : ch);
  }
  if (word.length) flush();
  return out.join("");
}

const NOT_NAMES = KS(["registration", "called", "from", "home", "says", "said", "told", "reports", "asks", "mahila", "वर्षे", "वर्ष", "varshe", "varsh", "झाग", "jhag", "td", "tt", "rh", "hiv", "vdrl", "gdm", "lscs", "pph", "aph", "sugar", "धुंधला", "धुंध", "dhundhla", "dhundla", "हाताला", "हाता", "हात", "हाथ", "haat", "haath", "hath", "पायाला", "पाया", "डोक्याला", "पोटाला", "pindli", "tanke", "taanke", "daure", "akad", "navel", "umbilicus", "ulta", "judwa", "in", "law", "of", "on", "at", "to", "for", "with", "आहेत", "आहे", "आहेस", "नाहीत", "होऊन", "झाले", "झाली", "झाला", "होते", "होती", "होता", "आता", "आणि", "पण", "तर", "मग", "काय", "ahet", "aahet", "aahe", "ahe", "hoon", "houn", "zale", "jhale", "hote", "hoti", "hota", "ata", "aata", "ani", "aani", "kay", "takleef", "taklif", "dikkat", "pareshani", "tras", "judwa", "jule", "twins", "operation", "umar", "umra", "age", "saal", "varsh", "ghante", "taas", "kal", "kaal", "pichli", "pehle", "janam", "baar", "lekin", "magar", "saas", "sasur", "pati", "devar", "jethani", "nanad", "padosan", "sasu", "navra", "सासू", "सासरे", "देवर", "ननद", "जेठानी", "पड़ोसन", "घंटे", "तास", "उम्र", "वय", "साल", "वर्ष", "जुड़वा", "जुळी", "ऑपरेशन", "पिछली", "मागच्या", "जन्म", "तकलीफ", "त्रास", "दिक्कत", "paani", "pani", "thaili", "chest", "stan", "stanpan", "naabhi", "laghvi", "peshab", "taapmaan", "tapmaan", "thanda", "garam", "doodh", "dudh", "wajan", "vajan", "wazan", "pasli", "saans", "sans", "shwas", "bukhar", "taap", "tapman", "temperature", "naal", "nabhi", "aaj", "kal", "abhi", "bacha", "baccha", "bachha", "bilkul", "thoda", "bahut", "khoon", "sar", "sir", "pet", "pair", "chehra", "albumin", "hemoglobin", "breathing", "weight", "cord", "eyes", "aankh", "umm", "um", "uh", "hmm", "haan", "han", "achha", "accha", "okay", "ok", "arre", "अं", "हम्म", "है", "हैं", "था", "थी", "थे", "हुए", "हुई", "हुआ", "आहे", "होते", "झाले", "आली", "आला", "hai", "hain", "tha", "thi", "hue", "hua", "ahe", "aahe", "ला", "ने", "को", "से", "में", "पर", "plus", "प्लस", "plas", "बाद", "baad", "uska", "uski", "unka", "उसका", "उसकी", "इनका", "तिला", "त्याला", "heavy", "water", "seventh", "sixth", "eighth", "ninth", "fifth", "hemoglobin", "baaki", "बाकी", "sab", "सब", "सब नॉर्मल", "normal", "नॉर्मल", "बच्चा", "बच्चे", "बच्ची", "बच्चों", "बेटा", "बेटी", "बेटे", "बाळ", "बाळा", "बाळाचं", "बाळाचे", "बाळाची", "बाळाचा", "बाळाला", "बेबी", "मुलगा", "मुलगी", "आँखों", "आंखों", "पानी", "वजन", "वज़न", "तापमान", "टेम्परेचर", "माँ", "मां", "आई", "सास", "पति", "नवरा", "नाभि", "नाळ", "नाल", "बदन", "शरीर", "दूध", "पेट", "सिर", "पैर", "पैरों", "हाथ", "चेहरे", "हीमोग्लोबिन", "बीपी", "साँस", "सांस", "श्वास", "पॉटी", "मल", "शौच", "उल्टी", "दीदी", "ताई", "हो", "हाँ", "हां", "अरे", "अच्छा", "डिलीवरी", "प्रसूती", "भाभी", "बहू", "सून", "बहन", "दवाई", "गोली", "मैडम", "baby", "bachcha", "bachche", "bacche", "beta", "beti", "bal", "bala", "balacha", "balachi", "mother", "mummy", "maa", "aai", "bebi", "ho", "arre", "are", "okay", "so", "delivery", "pregnancy", "pregnant", "temperature", "weight", "fever", "bleeding", "yesterday", "tomorrow", "morning", "evening", "breathing", "feeding", "child", "kid", "girl", "boy", "beta", "beti", "bhabhi", "aunty", "anc", "pnc", "visit", "checkup", "check", "please", "note", "write", "record", "first", "second", "third", "day", "week", "month", "blood", "urine", "albumin", "iron", "hemoglobin", "haemoglobin", "swelling", "headache", "pain", "jaundice", "cord", "skin", "eyes", "she's", "it's", "there", "they", "we", "i", "my", "our", "your", "his", "doctor", "anm", "asha", "nurse", "village", "baby", "bachcha", "bachha", "aaj", "today", "didi", "ji", "haan", "han", "ha", "accha", "achha", "matlab", "the", "she", "her", "mother", "mummy", "maa", "bp", "hb", "and", "aur", "visit", "pregnant", "patient", "woman", "lady", "bai", "tai", "ka", "ki", "ke", "ko", "is", "has", "ok", "okay", "sir", "madam", "hello", "namaste", "now", "baby's", "new", "this", "here", "so", "yes", "no", "दीदी", "आज", "हाँ", "हां", "अच्छा", "मतलब", "जी", "ताई", "बाई", "ये", "यह", "इनका", "इसका", "हे", "ही", "आता", "मग", "तर", "बाळ", "बच्चा", "बच्चे", "माँ", "मां", "आई", "नमस्ते", "नमस्कार", "मैडम", "ठीक", "तो", "ओके", "हा", "नंतर", "पेशंट", "गर्भवती", "गरोदर", "महिला"]);
const POSS = KS(["wala", "wali", "vala", "vali", "वाला", "वाली", "वाले", "ka", "ki", "ke", "ko", "chi", "che", "cha", "chya", "chi", "का", "की", "के", "को", "ची", "चे", "चा", "च्या", "चं", "s", "ji", "जी", "tai", "ताई", "bai", "बाई", "बेन", "devi", "देवी", "ला", "ला.", "ना", "ने", "ne"]);
const BABY_WORDS = KS(["लड़का", "लड़की", "लडका", "लडकी", "ladka", "ladki", "larka", "larki", "baccha", "baby", "bachcha", "bachha", "bacha", "bachche", "bacche", "बच्चा", "बच्चे", "बच्ची", "बेटा", "बेटी", "बेटे", "बाळ", "बाळाचं", "बेबी", "beta", "beti", "bal", "balacha", "मुलगा", "मुलगी", "son", "daughter", "newborn"]);
const NAME_CUE = KS(["naam", "nam", "नाम", "नाव", "naav", "naw", "name", "named", "called", "mrs", "smt", "श्रीमती", "mother"]);
function nameCase(w) { const r = /[ऀ-ॿ]/.test(w) ? romanize(w) : w; return r ? r[0].toUpperCase() + r.slice(1).toLowerCase() : null; }

function isLexicon(lo) {
  if (UNIT_KG.has(lo) || UNIT_G.has(lo) || UNIT_F.has(lo) || UNIT_C.has(lo) || TABLET.has(lo) || MINUTE.has(lo) || PLUS.has(lo)) return true;
  if (unitWord(lo) != null || DAY.has(lo) || WEEKS.has(lo) || MONTH.has(lo) || NEG.has(lo) || JOIN.has(lo) || ORD[lo] != null) return true;
  for (const list of Object.values(ANCHOR)) if (list.some((sq) => sq.length === 1 && sq[0] === lo)) return true;
  return false;
}
const LEXSTART = /^(नाळ|नाभ|डोळ|पोट|छात|दिवस|दिन|महीन|महिन|आठवड|हफ|बाळ|बच्च|बाळंत|प्रसूत|डिलीव|डिलिव|delivery|तापमान|टेम्प|हीमो|हिमो|वजन|वज़न|अल्ब्य|एल्ब)/;
function okName(w) {
  const lo = K(w);
  return w && lo.length >= 2 && !NOT_NAMES.has(lo) && !POSS.has(lo) && !FILLER.has(lo) && !NAME_CUE.has(lo) && !/^[0-9]/.test(w) && !isLexicon(lo) && !BABY_WORDS.has(lo) && !LEXSTART.test(lo) && !findAll([{ lo }], TYPE_WORDS.anc.concat(TYPE_WORDS.pnc, TYPE_WORDS.newborn)).length;
}
const MR_POSS = /^([\u0900-\u097f]{2,}?)(\u091a\u0902|\u091a\u0947|\u091a\u0940|\u091a\u093e|\u091a\u094d\u092f\u093e|\u0932\u093e)$/; // -चं -चे -ची -चा -च्या -ला

function findName(tok) {
  const cands = [];
  for (let i = 0; i < tok.length; i++) {
    const w = tok[i].t, lo = tok[i].lo;
    // "naam Sunita hai", "नाव सुनीता", "Mother Nandini"
    if (NAME_CUE.has(lo)) {
      let j = i + 1;
      while (j < tok.length && (["is", "hai", "है", "आहे", "ka", "का", "की", "ki", ":", ","].includes(tok[j].lo) || NAME_CUE.has(tok[j].lo))) j++;
      if (tok[j] && okName(tok[j].t) && /^[A-Za-z\u0900-\u097f]/.test(tok[j].t)) cands.push({ i: j, score: 5 });
    }
    // "baby of Geeta", "mother of Rani"
    if ((lo === "of" && /^(baby|child|daughter|son|mother|wife)$/.test(tok[i - 1]?.lo || "")) || (lo === "for" && /^(visit|anc|pnc|checkup|registration)$/.test(tok[i - 1]?.lo || "")) && tok[i + 1] && okName(tok[i + 1].t) && /^[A-Z]/.test(tok[i + 1].t)) cands.push({ i: i + 1, score: 5.5 });
    // "Asha naam ki mahila", "Sunita naav aahe"
    if (NAME_CUE.has(tok[i + 1]?.lo) && /^(naam|नाम|नाव|naav|name)$/.test(tok[i + 1].lo) && ["ki", "ka", "ke", "की", "का", "के", "chi", "ची", "che", "चे", "of", "hai", "है", "आहे"].includes(tok[i + 2]?.lo || "") && (okName(w) || lo === "asha") && /^[A-Z\u0900-\u097f]/.test(w)) cands.push({ i, score: 5.5 });
    // "Sunita ka baby", "सुनीता का बच्चा", "Rukhsana's baby"
    if (POSS.has(tok[i + 1]?.lo) && okName(w)) {
      const babyNext = BABY_WORDS.has(tok[i + 2]?.lo) || BABY_WORDS.has(tok[i + 3]?.lo);
      const proper = /^[A-Z\u0900-\u097f]/.test(w);
      if (proper) cands.push({ i, score: babyNext ? 6 : 3 });
    }
    // Roman Marathi "Rekhache baal", "Sarikachya"
    // "Meena nahi, Reena hai", "नाम मीना नहीं रीना है": the corrected name is a strong signal
    {
      let j = i + 1;
      if (NEG.has(tok[j]?.lo) && !["no", "not"].includes(tok[j].lo)) {
        j++;
        while (tok[j] && ([",", "।", "."].includes(tok[j].t) || NEG.has(tok[j].lo) || ["naam", "नाम", "नाव", "name"].includes(tok[j].lo))) j++;
        const named = NAME_CUE.has(tok[i - 1]?.lo) || NAME_CUE.has(tok[i - 2]?.lo);
        if (tok[j] && okName(w) && okName(tok[j].t) && /^[A-Zऀ-ॿ]/.test(tok[j].t) && (named || (/^[A-Z][a-z]/.test(w) && /^[A-Z][a-z]/.test(tok[j].t))) && readNumber(tok, j) == null) cands.push({ i: j, score: named ? 6.5 : 5 });
      }
    }
    const rmp = w.match(/^([A-Z][a-z]{2,}?)(che|chi|cha|chya|chan|chaa)$/);
    if (rmp && okName(rmp[1]) && okName(w)) cands.push({ i, score: BABY_WORDS.has(tok[i + 1]?.lo) || /^(baal|bal|baby)/.test(tok[i + 1]?.lo || "") ? 6 : 3, stem: rmp[1] });
    // Marathi "सुरेखाचं बाळ", "प्रतिभाचं"
    const m = w.match(MR_POSS);
    if (m && okName(m[1]) && okName(w) && !/(ायला|यला|ण्याला|ताना)$/.test(w)) cands.push({ i, score: BABY_WORDS.has(tok[i + 1]?.lo) ? 6 : 3, stem: m[1] });
    // "पूनम, 34 हफ्ते" / "Archana, 30 hafte" / "सुनीता सातवें महीने"
    const nxt = tok[i + 1]?.t === "," ? i + 2 : i + 1;
    if (okName(w) && /^[A-Z\u0900-\u097f]/.test(w) && (i === 0 || BREAK.has(tok[i - 1].t) || JOIN.has(tok[i - 1].lo)) && tok[nxt] && (readNumber(tok, nxt) || ORD[tok[nxt].lo] != null || ordinalOf(tok[nxt].lo) != null)) {
      const after = readNumber(tok, nxt);
      const unit = after ? tok[after.i1]?.lo : tok[nxt + 1]?.lo;
      if (WEEKS.has(unit) || MONTH.has(unit) || DAY.has(unit)) cands.push({ i, score: 4 });
    }
  }
  // A name said on its own at the end of a clause: "… दिन में छह पैड। सुधा।", "Day 9, Rubina."
  for (let i = 0; i < tok.length; i++) {
    const w = tok[i].t;
    const before = tok[i - 1], after = tok[i + 1];
    const alone = (!before || BREAK.has(before.t)) && (!after || BREAK.has(after.t));
    if (alone && okName(w) && /^[A-Z\u0900-\u097f]/.test(w) && readNumber(tok, i) == null) cands.push({ i, score: 4.5 - (i < 2 ? 1 : 0) + i / 1000 });
  }
  // A capitalised Roman word near the start
  for (let i = 0; i < Math.min(tok.length, 5); i++) {
    const w = tok[i].t;
    if (/^[A-Z][a-z]{2,}$/.test(w) && okName(w) && !(K(w) in ROMAN) && !(K(w) in EN_TENS)) { cands.push({ i, score: 1 }); break; }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || a.i - b.i);
  const c = cands[0];
  const raw = c.stem || tok[c.i].t;
  return { value: nameCase(raw), at: span(tok, c.i, c.i + 1), score: c.score };
}

/* ------------------------------------------------------------------ */
/* The extractor                                                       */
/* ------------------------------------------------------------------ */

const round1 = (x) => Math.round(x * 10) / 10;
const LAST = (arr) => arr[arr.length - 1];

// Past and present: "pichli baar 120 by 80 tha, aaj 140 by 90" keeps 140/90
const PAST = KS(["pichli", "pichhli", "pichle", "pichhle", "पिछली", "पिछले", "pehle", "pahle", "पहले", "kal", "कल", "kaal", "काल", "janam", "janm", "जन्म", "जन्माच्या", "जन्माला", "birth", "born", "tha", "thi", "था", "थी", "थे", "was", "were", "earlier", "previous", "last", "मागच्या", "मागील", "मागे", "आधी", "aadhi", "होता", "होती", "hota", "hoti"]);
const NOW = KS(["aaj", "आज", "ab", "अब", "abhi", "अभी", "now", "today", "currently", "आता", "ata", "aata", "atta", "आत्ता"]);
const BIRTH = KS(["janam", "janm", "जन्म", "जन्माच्या", "जन्माला", "birth", "born", "पैदा", "paida", "जन्मतः"]);
const SINCE = KS(["se", "से", "पासून", "pasun", "since", "from"]);

// Fields each visit type may carry (SPEC.md v2). Anything else is dropped.
export const FIELDS = {
  anc: ["name", "weeks", "month", "bp_sys", "bp_dia", "hb", "weight_kg", "albumin", "fetal_movement", "ifa_tablets", "age", "height_cm", "labour_hours", "twins", "prev_caesarean", "prev_pph", "prev_aph", "prev_eclampsia",
    "temp_c", "temp_f", "prev_stillbirth", "prev_preterm", "diabetes", "heart_disease", "rh_negative", "hiv_syphilis", "previous_births", "malpresentation", "td_doses"],
  pnc: ["name", "day", "pads", "temp_c", "temp_f", "bp_sys", "bp_dia", "hb"],
  newborn: ["name", "day", "weight_g", "birth_weight_g", "temp_c", "temp_f", "resp_rate", "feeding", "weeks_at_birth", "preterm", "birth_place"],
};

/**
 * Read a visit from one utterance.
 * Returns { type, record, evidence, tokens, nameScore, doubts } where evidence maps
 * each field (and each symptom as "symptoms.code") to { start, end } in the original
 * text, and doubts lists values heard but not filled because they look wrong:
 * [{ field, heard, say_en, say_hi, say_mr }]. The app should ask these back aloud.
 */
export function understand(text, hint) {
  const raw = String(text || "");
  text = raw;
  const tok = tokenize(raw);
  // When the ASHA has picked the visit, trust her; otherwise guess from the words.
  const type = hint || detectType(raw) || "newborn";
  const nums = allNumbers(tok, raw);
  const rec = { type };
  let nameScore = 0;
  const ev = {};
  const doubts = [];
  const set = (k, v, sp) => { rec[k] = v; ev[k] = sp; };
  const doubt = (field, heard, say) => { if (!doubts.some((d) => d.field === field && d.code === say.code)) doubts.push({ field, heard: heard == null ? null : String(heard), ...say }); };

  // A number is "past" when its clause has a past marker and no now marker
  const pastAt = (i) => {
    const [a, b] = clauseOf(tok, i);
    let past = false, now = false;
    for (let k = a; k <= b; k++) {
      const lo = tok[k].lo;
      if (NOW.has(lo)) now = true;
      else if (PAST.has(lo)) {
        if ((lo === "kal" || lo === "कल" || lo === "kaal" || lo === "काल") && SINCE.has(tok[k + 1]?.lo)) continue; // "kal se" = since yesterday, still going on
        if ((lo === "pehle" || lo === "pahle" || lo === "पहले") && (DAY.has(tok[k + 1]?.lo) || /^(din|दिन|day|दिवस)/.test(tok[k + 1]?.lo || ""))) continue; // "pehle din" = first day
        past = true;
      }
    }
    return past && !now;
  };
  // Whose words are these? The person said right before ko/ki/-ला/has is the subject of the clause.
  // A newborn visit drops the mother's and relatives' complaints; a pregnancy or after-birth visit
  // drops the baby's and relatives' ("bachche ko bukhar hai", "uski behen ko jhatke").
  const RELATIVE = /^(saas|sas|sasu|sasur|pati|navra|navryala|devar|jeth|jethani|nanad|padosan|dadi|daadi|nani|naani|aaji|behen|bahen|behan|bahan|sister|brother|bhai|papa|father|सास|सासू|सासूला|सासूबाई|सासूबाईंना|ससुर|सासरे|सासऱ्यांना|पति|नवरा|नवऱ्याला|देवर|जेठ|जेठानी|ननद|पड़ोसन|पडोसन|शेजारी|शेजारणीला|दादी|नानी|आजी|आजीला|बहन|बहीण|बहिणीला|भाई|भाऊ|पापा|husband|neighbour|neighbor)$/;
  const MOTHERW = /^(maa|mummy|mother|mom|aai|aaila|aaichya|aaiche|aaichi|माँ|मां|मम्मी|आई|आईला|आईच्या|आईचे|आईची|आईचं)$/;
  const BABYP = /^(baby|babies|bachcha|bachche|bachchi|bacche|bacha|beta|beti|बच्चा|बच्चे|बच्ची|बेबी|बेटा|बेटी|बाळ|बाळाला|बाळाचा|बाळाचं|बाळाचे|बाळाची|बाळाच्या|balala|balacha|balache|bal|bebi|infant|newborn)$/;
  const EXP_W = new Set(["ko", "को", "la", "ला", "ना", "has", "had", "is", "ne"]);
  const POSS_W = new Set(["ka", "ki", "ke", "का", "की", "के", "chi", "ची", "चा", "चे", "cha", "che", "'s", "s"]);
  const isOtherPerson = (lo) => RELATIVE.test(lo) || (type === "newborn" && MOTHERW.test(lo)) || (type !== "newborn" && BABYP.test(lo));
  const SIBLING = /^(badi|bada|bade|badey|elder|older|बड़ी|बड़ा|बडी|बडा|मोठी|मोठा|पहली|pehli)$/;
  const nameStem = (lo) => lo.replace(/(ला|ना|la|ko)$/, "");
  const isPatientName = (k) => rec.name && (nameCase(tok[k].t) === rec.name || nameCase(nameStem(tok[k].t)) === rec.name || nameCase(tok[k].t.replace(/(la|ला)$/, "")) === rec.name);
  const subjectOf = (a, b) => {
    let res = null;
    for (let k = a; k <= b; k++) {
      const lo = tok[k].lo, next = tok[k + 1]?.lo;
      const glued = /(ला|ना)$/.test(lo) && lo.length > 3;
      const gluedPoss = /(चं|चे|ची|चा|च्या)$/.test(lo);
      if (["ne", "ने", "said", "says", "told", "bataya", "बताया", "सांगितलं", "म्हणाली"].includes(next)) continue;
      if (isPatientName(k) && (EXP_W.has(next) || /(ला|la)$/.test(lo))) { res = { other: type === "newborn", strong: true }; continue; } // the named woman: the mother in a newborn visit
      const person = RELATIVE.test(lo) || MOTHERW.test(lo) || BABYP.test(lo) || (lo === "law" && tok[k - 1]?.lo === "in");
      if (!person) continue;
      if (POSS_W.has(next) && (RELATIVE.test(tok[k + 2]?.lo || "") || MOTHERW.test(tok[k + 2]?.lo || "") || BABYP.test(tok[k + 2]?.lo || ""))) continue;
      const exp = EXP_W.has(next) || glued;
      const poss = POSS_W.has(next) || gluedPoss;
      if (type === "anc" && BABYP.test(lo) && !exp && !SIBLING.test(tok[k - 1]?.lo || "")) continue; // the foetus
      if (exp || poss || k === b) res = { other: isOtherPerson(lo) || (BABYP.test(lo) && SIBLING.test(tok[k - 1]?.lo || "")) || lo === "law", strong: exp };
    }
    return res;
  };
  const otherAt = (i) => {
    const [a, b] = clauseOf(tok, i);
    const own = subjectOf(a, b);
    if (own != null) return own.other;
    // "uski badi beti ko teen din se bukhar aur ulti hai": a clause with no subject of its own
    // takes the one said with ko/को/-ला just before it, in the same sentence
    if (a >= 2 && (JOIN.has(tok[a - 1].lo) || tok[a - 1].t === ",")) { const [a2, b2] = clauseOf(tok, a - 2); const prev = subjectOf(a2, b2); if (prev != null && prev.strong) return prev.other; }
    return false;
  };
  const otherAtOld = (i) => {
    const [a, b] = clauseOf(tok, i);
    let subj = null;
    for (let k = a; k <= b; k++) {
      const lo = tok[k].lo, next = tok[k + 1]?.lo;
      const person = RELATIVE.test(lo) || MOTHERW.test(lo) || BABYP.test(lo) || (lo === "law" && tok[k - 1]?.lo === "in");
      if (!person) continue;
      if (["ne", "ने", "said", "says", "told", "bataya", "बताया", "सांगितलं", "म्हणाली"].includes(next)) continue;
      const glued = /(ला|ना)$/.test(lo) && lo.length > 3;
      // "baby ki maa ko": the possessor is not the subject when another person follows
      if (POSS_W.has(next) && (RELATIVE.test(tok[k + 2]?.lo || "") || MOTHERW.test(tok[k + 2]?.lo || "") || BABYP.test(tok[k + 2]?.lo || ""))) continue;
      if (EXP_W.has(next) || POSS_W.has(next) || glued || k === b) subj = lo === "law" ? "saas" : lo;
    }
    return subj != null && isOtherPerson(subj);
  };
  const birthAt = (i) => { const [a, b] = clauseOf(tok, i); for (let k = a; k <= b; k++) if (BIRTH.has(tok[k].lo)) return true; return false; };
  // last candidate said for now; if all are past, the last one
  const preferNow = (cands) => { const live = cands.filter((c) => !pastAt(c.i0)); return LAST(live.length ? live : cands) || null; };
  // "…, aaj 99" / "ab 2600 hai": a number right after a now-marker restates the field named just before
  const restated = (anchors, ok) => nums.filter((n) => NOW.has(tok[n.i0 - 1]?.lo) && ok(n) && anchors.some((an) => an.i1 <= n.i0 && n.i0 - an.i1 <= 12 && !tok.slice(an.i1, n.i0).some((x) => x.t === "।" || x.t === "." || x.t === "?")));

  const name = findName(tok);
  if (name) { set("name", name.value, name.at); nameScore = name.score; }

  // Blood pressure: "BP 150 by 100", "150 bata 100", "बीपी एक सौ पचास बटा सौ", a bare "150/100",
  // "upar 150 neeche 100" or "150 upar 100 neeche"
  if (type === "anc" || type === "pnc") {
    const anchors = findAll(tok, ANCHOR.bp);
    const okSys = (n) => n.value >= 70 && n.value <= 260, okDia = (n) => n.value >= 40 && n.value <= 170;
    const pairs = [];
    for (let k = 0; k < nums.length - 1; k++) {
      const a = nums[k], b = nums[k + 1];
      if (a.range || b.range) continue;
      const between = tok.slice(a.i1, b.i0).map((x) => x.lo);
      const sep = between.length <= 2 && between.some((w) => SEP_BP.has(w));
      // "BP 140 90": no separator, right after the BP word
      const bare = between.length === 0 && a.value > b.value && anchors.some((an) => an.i1 <= a.i0 && a.i0 - an.i1 <= 2);
      if ((sep || bare) && okSys(a) && okDia(b) && a.value > b.value) pairs.push({ a, b, i0: a.i0 });
      else if (sep && a.value >= 40 && b.value <= 260 && a.value <= b.value && b.value >= 70) doubt("bp", `${a.value}/${b.value}`, { say_en: `Did you say BP ${b.value} by ${a.value}?`, say_hi: `क्या बीपी ${b.value} बटा ${a.value} है?`, say_mr: `बीपी ${b.value} बाय ${a.value} आहे का?` });
    }
    const up = tok.findIndex((x) => ["upar", "ऊपर", "उपर", "oopar", "वरचा", "वरचं", "varcha", "systolic", "upper"].includes(x.lo));
    const dn = tok.findIndex((x) => ["neeche", "niche", "नीचे", "निचे", "खालचा", "खालचं", "khalcha", "diastolic", "lower"].includes(x.lo));
    const numAfter = (m) => nums.find((n) => n.i0 > m && n.i0 - m <= 3);
    const numBefore = (m) => [...nums].reverse().find((n) => n.i1 <= m && m - n.i1 <= 1);
    let ud = null;
    if (up >= 0 && dn >= 0) for (const f of [numBefore, numAfter]) {
      const s = f(up), d = f(dn);
      if (s && d && s !== d && okSys(s) && okDia(d) && s.value > d.value) { ud = { a: s, b: d, i0: Math.min(s.i0, d.i0) }; break; }
    }
    // later mentions correct earlier ones ("140 by 90, nahi nahi, 150 by 100"); past ones lose
    const pick = preferNow(ud ? [...pairs, ud].sort((x, y) => x.i0 - y.i0) : pairs);
    if (pick) { set("bp_sys", Math.round(pick.a.value), span(tok, pick.a.i0, pick.a.i1)); set("bp_dia", Math.round(pick.b.value), span(tok, pick.b.i0, pick.b.i1)); }
    else if (anchors.length) {
      const [a, b] = clauseOf(tok, anchors[0].i0);
      const fine = tok.slice(a, b + 1).some((x) => /^(normal|नॉर्मल|नार्मल|theek|thik|ठीक|sahi|सही|fine|ok|okay|चांगला|चांगलं|barobar|बरोबर|goli|गोली|गोळी|tablet)/.test(x.lo));
      if (!fine) doubt("bp", null, { say_en: "I heard BP but not the numbers. Say it again.", say_hi: "बीपी सुना, पर नंबर नहीं। फिर से बताइए।", say_mr: "बीपी ऐकलं, पण आकडे नाही. पुन्हा सांगा." });
    }
  }

  // Haemoglobin (pregnancy and after delivery). A range takes its lower end.
  if (type === "anc" || type === "pnc") {
    const UNITISH = (lo) => lo != null && (WEEKS.has(lo) || MONTH.has(lo) || DAY.has(lo) || UNIT_KG.has(lo) || UNIT_G.has(lo) || TABLET.has(lo) || ["by", "/", "बटा", "बाय"].includes(lo) || /^(हफ|आठवड|haft|week|महीन|महिन|mahin|गोळ|गोल|tablet|kilo|किलो)/.test(lo));
    const cands = [];
    for (const an of findAll(tok, ANCHOR.hb)) {
      const after = nums.filter((n) => n.i0 >= an.i1 && n.i0 - an.i1 <= 12 && n.value >= 3 && n.value <= 18 && !UNITISH(tok[n.i1]?.lo) && !tok.slice(an.i1, n.i0).some((x) => x.t === "।" || (x.t === "." && n.i0 - an.i1 > 6)));
      const n = after.length ? LAST(after) : numberNear(tok, nums, an, { ahead: 5, behind: 3 });
      if (n && n.value >= 3 && n.value <= 18) cands.push(lowEnd(n));
      else {
        // "Hb 65": the speech engine dropped the point
        const g = nums.find((x) => x.i0 >= an.i1 && x.i0 - an.i1 <= 2 && Number.isInteger(x.value) && x.value >= 30 && x.value <= 180);
        if (g) doubt("hb", g.value, { say_en: `Did you say Hb ${g.value / 10}?`, say_hi: `क्या हीमोग्लोबिन ${g.value / 10} है?`, say_mr: `हिमोग्लोबिन ${g.value / 10} आहे का?` });
      }
    }
    // Bare "khoon"/"खून" counts only with a reading-like number: "khoon saadhe das", "खून ग्यारह पॉइंट दो",
    // "khoon 9 gram". "khoon aa raha hai, teen pad" is bleeding, never Hb.
    for (let i = 0; i < tok.length; i++) {
      if (!/^(khoon|khun|खून|रक्त)$/.test(tok[i].lo)) continue;
      const [a, b] = clauseOf(tok, i);
      if (tok.slice(a, b + 1).some((x) => /^(jaa?|jata|jati|jate|aa|aaya|aayi|aata|aati|aate|gir|gira|giri|gaya|gayi|bah|beh|bahna|जा|जाता|जाती|जाते|आ|आया|आई|आता|आती|आते|गिर|गिरा|गिरी|गया|गई|बह|जात|जातंय|जातो|येत|येतंय|येतो|गेल|गेलं|गेले|zyada|ज़्यादा|ज्यादा|bahut|बहुत|jaast|जास्त|khoob|खूब)$/.test(x.lo))) continue; // a bleeding verb
      const n = nums.find((x) => x.i0 > i && x.i0 - i <= 8 && !tok.slice(i, x.i0).some((y) => y.t === "।"));
      if (!n || n.value < 3 || n.value > 18) continue;
      const unit = tok[n.i1]?.lo;
      if (n.value % 1 !== 0 || UNIT_G.has(unit) || ["dl", "gm%", "gram%"].includes(unit)) cands.push(lowEnd(n));
    }
    cands.sort((a, b) => a.i0 - b.i0);
    const hb = preferNow(cands);
    if (hb) set("hb", round1(hb.value), span(tok, hb.i0, hb.i1));
  }

  // Weight: newborn in grams, mother in kilos. "1 किलो 700 ग्राम", "1.6 kilo", "1700 gram", "2,400 grams", "डेढ़ किलो"
  {
    const anchors = findAll(tok, ANCHOR.weight);
    const tryAt = (n0) => {
      const n = lowEnd(n0);
      let j = n.i1, grams = null;
      const unit = tok[j]?.lo;
      if (UNIT_KG.has(unit)) {
        grams = n.value * 1000; j++;
        const m = readNumber(tok, j);
        if (m && m.value < 1000 && (UNIT_G.has(tok[m.i1]?.lo) || !tok[m.i1] || BREAK.has(tok[m.i1].t) || ["है", "hai", "आहे", "ahe", "aaya", "आया", "आलं", "होतं", "होता", "होती", "होते", "tha", "था", "थी", "hota", "hoti", "hotan"].includes(tok[m.i1].lo))) { grams += m.value; j = m.i1 + (UNIT_G.has(tok[m.i1]?.lo) ? 1 : 0); }
      } else if (UNIT_G.has(unit)) { grams = n.value; j++; }
      else grams = n.value < 10 ? n.value * 1000 : n.value >= 400 ? n.value : null;
      return grams != null ? { grams, i0: n.i0, i1: j } : null;
    };
    const plausible = (w) => (type === "anc" ? w.grams >= 25000 && w.grams <= 150000 : w.grams >= 100 && w.grams <= 9000);
    const cands = [];
    const add = (w) => { // "2 kilo 300 gram" is one weight: keep the wider reading
      if (!w || !plausible(w)) return;
      const k = cands.findIndex((c) => w.i0 < c.i1 && c.i0 < w.i1);
      if (k < 0) cands.push(w); else if (w.i0 <= cands[k].i0 && w.i1 >= cands[k].i1) cands[k] = w;
    };
    for (const an of anchors) { const n = numberNear(tok, nums, an, { ahead: 5, behind: 4 }); if (n) add(tryAt(n)); }
    // any later "N kilo ..." replaces it (corrections, "janam pe 2 kilo tha, aaj 1 kilo 750")
    for (const n of nums) { const u = tok[n.i1]?.lo; if (UNIT_KG.has(u) || (UNIT_G.has(u) && n.value >= 100)) add(tryAt(n)); }
    for (const n of restated(anchors, (x) => x.value >= 400 || x.value < 10)) add(tryAt(n));
    if (type === "newborn") for (const n of nums) if ((n.value >= 400 || n.value < 10) && tok.slice(Math.max(0, n.i0 - 4), n.i0).some((x) => BIRTH.has(x.lo)) && anchors.some((an) => Math.abs(an.i0 - n.i0) <= 14)) add(tryAt(n));
    cands.sort((a, b) => a.i0 - b.i0);
    if (type === "newborn") {
      // "janam ke samay vajan 1700 tha, ab 2600 hai": birth weight and weight now
      const atBirth = cands.filter((c) => birthAt(c.i0) && pastAt(c.i0));
      const now = cands.filter((c) => !atBirth.includes(c));
      const best = now.length ? preferNow(now) : null;
      const bw = LAST(atBirth);
      const fits = (w) => w.grams >= 800 && w.grams <= 6000;
      if (best) {
        if (fits(best)) set("weight_g", Math.round(best.grams), span(tok, best.i0, best.i1));
        else doubt("weight_g", Math.round(best.grams), { say_en: `Did you say ${Math.round(best.grams)} grams?`, say_hi: `क्या वज़न ${Math.round(best.grams)} ग्राम है?`, say_mr: `वजन ${Math.round(best.grams)} ग्रॅम आहे का?` });
      }
      if (bw && fits(bw)) set("birth_weight_g", Math.round(bw.grams), span(tok, bw.i0, bw.i1));
      else if (bw && !best) doubt("weight_g", Math.round(bw.grams), { say_en: `Did you say ${Math.round(bw.grams)} grams?`, say_hi: `क्या वज़न ${Math.round(bw.grams)} ग्राम है?`, say_mr: `वजन ${Math.round(bw.grams)} ग्रॅम आहे का?` });
    }
    if (type === "anc") { const best = preferNow(cands); if (best) set("weight_kg", round1(best.grams / 1000), span(tok, best.i0, best.i1)); }
  }

  // Temperature: °F if the value is above 45 or a Fahrenheit word follows. temp_f keeps the
  // Fahrenheit value as said, so 102 °F compares as 102 °F in the rules.
  {
    const okT = (n) => (n.value >= 30 && n.value <= 45) || (n.value >= 86 && n.value <= 110);
    const anchors = findAll(tok, ANCHOR.temp);
    const cands = [];
    for (const an of anchors) {
      if (otherAt(an.i0)) continue; // "baby ka temperature 38" in a mother's visit
      const n = numberNear(tok, nums, an, { ahead: 4, behind: 3 });
      if (n && okT(n) && !cands.includes(n)) cands.push(n);
      // a number after "temperature/bukhar/taap" that is not a temperature is asked back, never dropped
      else if (n && !okT(n) && n.i0 >= an.i1 && !DAY.has(tok[n.i1]?.lo) && !WEEKS.has(tok[n.i1]?.lo) && !MONTH.has(tok[n.i1]?.lo) && !/^(ghant|घंट|hour|din|दिन|दिवस|pad|पैड|पॅड|minute|मिनट|saal|साल|tablet|goli|गोली)/.test(tok[n.i1]?.lo || "") && !SINCE.has(tok[n.i1]?.lo)) doubt("temp", n.value, { say_en: `Did you say temperature ${n.value}?`, say_hi: `क्या तापमान ${n.value} है?`, say_mr: `तापमान ${n.value} आहे का?` });
    }
    for (const n of restated(anchors, okT)) if (!cands.includes(n) && !otherAt(n.i0)) cands.push(n);
    if (!cands.length) { const n = nums.find((x) => (UNIT_F.has(tok[x.i1]?.lo) || UNIT_C.has(tok[x.i1]?.lo) || tok[x.i1]?.t === "°")); if (n) cands.push(n); }
    cands.sort((a, b) => a.i0 - b.i0);
    const t = preferNow(cands);
    if (t) {
      let i1 = t.i1; let unitF = t.value > 45;
      for (let k = t.i1; k < Math.min(t.i1 + 3, tok.length); k++) { if (UNIT_F.has(tok[k].lo)) { unitF = true; i1 = k + 1; } if (UNIT_C.has(tok[k].lo)) { unitF = false; i1 = k + 1; } if (tok[k].t === "°" || ["degree", "डिग्री", "डिग्री."].includes(tok[k].lo)) i1 = k + 1; }
      const c = unitF ? (t.value - 32) * 5 / 9 : t.value;
      if (c >= 30 && c <= 43) { set("temp_c", round1(c), span(tok, t.i0, i1)); if (unitF) set("temp_f", round1(t.value), span(tok, t.i0, i1)); }
    }
  }

  // Breaths per minute
  if (type === "newborn") {
    const cands = [];
    for (const an of findAll(tok, ANCHOR.resp)) {
      const inSentence = nums.filter((n) => n.i0 >= an.i1 && n.i0 - an.i1 <= 14 && !tok.slice(an.i1, n.i0).some((x) => x.t === "।" || x.t === "." || x.t === "?"));
      const claimed = (n) => [ANCHOR.temp, ANCHOR.weight, ANCHOR.hb, ANCHOR.bp].some((list) => findAll(tok, list).some((h) => n.i0 >= h.i1 && n.i0 - h.i1 <= 2)) || UNIT_KG.has(tok[n.i1]?.lo) || UNIT_G.has(tok[n.i1]?.lo) || tok[n.i1]?.t === "°" || ["degree", "डिग्री"].includes(tok[n.i1]?.lo);
      const ok = inSentence.filter((n) => n.value >= 15 && n.value <= 120 && !claimed(n));
      let r = null;
      if (ok.length) r = LAST(ok); else { const n = numberNear(tok, nums, an, { ahead: 6, behind: 4 }); if (n && n.value >= 15 && n.value <= 120) r = n; }
      if (r && !cands.includes(r)) cands.push(r);
    }
    if (!cands.length) { const n = nums.find((x) => MINUTE.has(tok[x.i1]?.lo) || (["per", "प्रति", "पर"].includes(tok[x.i1]?.lo) && MINUTE.has(tok[x.i1 + 1]?.lo))); if (n && n.value >= 15 && n.value <= 120 && findAll(tok, ANCHOR.resp).length) cands.push(n); }
    cands.sort((a, b) => a.i0 - b.i0);
    const r = preferNow(cands);
    if (r) set("resp_rate", Math.round(r.value), span(tok, r.i0, r.i1));
  }

  // Day of life / days since delivery: "7 din ka", "सात दिन का", "तीसरा दिन", "day 7".
  // "do din se dast" is how long, not which day.
  if (type === "newborn" || type === "pnc") {
    let d = null;
    const isDay = (lo) => lo != null && (DAY.has(lo) || /^(दिवस|दिन)/.test(lo) || /^(din|dinon|divas\w*|diwas\w*|divs\w*|days?)$/.test(lo));
    for (const n of nums) if (isDay(tok[n.i1]?.lo) && n.value <= 60 && !SINCE.has(tok[n.i1 + 1]?.lo) && !/^(since|for|past|last|pichle|pichhle|पिछले)$/.test(tok[n.i0 - 1]?.lo || "") && !/^(mein|me|में|madhe|मध्ये|per|a)$/.test(tok[n.i1 + 1]?.lo || "") && !/(पासून|पासून)$/.test(tok[n.i1]?.lo || "") && !(tok[n.i1]?.lo === "days" && ["after", "ago", "since", "from", "पहले", "बाद"].includes(tok[n.i1 + 1]?.lo) && !(type === "pnc" && tok.slice(Math.max(0, n.i0 - 3), n.i0).some((x) => /^(delivery|deliveri|डिलीवरी|डिलिवरी|प्रसूत|prasav|birth)/.test(x.lo))))) d = { v: n.value, i0: n.i0, i1: n.i1 + 1 };
    for (let i = 0; i < tok.length; i++) {
      const o = ordinalOf(tok[i].lo);
      if (o && isDay(tok[i + 1]?.lo)) d = d || { v: o, i0: i, i1: i + 2 };
      if (tok[i].lo === "day") { const n = readNumber(tok, i + 1); if (n && n.value >= 0 && n.value <= 60) d = d || { v: n.value, i0: i, i1: n.i1 }; else { const o2 = ordinalOf(tok[i + 1]?.lo); if (o2) d = d || { v: o2, i0: i, i1: i + 2 }; } }
      // "7th day", "ikkisva din" handled above; "day one visit" too
    }
    if (d) set("day", Math.round(d.v), span(tok, d.i0, d.i1));
  }

  // Newborn: weeks at birth and preterm (SSBSK at-risk), place of birth
  if (type === "newborn") {
    const BORN = /^(paida|पैदा|born|janam|janm|जन्म|जन्मलं|जन्मला|जन्मली|hua|hui|हुआ|हुई|delivery|डिलीवरी|झाली|झाला|zali|jhali)$/;
    for (const n of nums) {
      if (n.value < 24 || n.value > 42 || !(WEEKS.has(tok[n.i1]?.lo) || /^(haft|hafte|हफ|आठवड|week)/.test(tok[n.i1]?.lo || ""))) continue;
      if (tok.slice(Math.max(0, n.i0 - 6), n.i1 + 6).some((x) => BORN.test(x.lo))) { set("weeks_at_birth", Math.round(n.value), span(tok, n.i0, n.i1 + 1)); set("preterm", n.value < 37, span(tok, n.i0, n.i1 + 1)); }
    }
    const early = findAll(tok, P(["premature", "preterm", "pre term", "samay se pehle", "time se pehle", "samay se pahle", "समय से पहले", "टाइम से पहले", "वेळेआधी", "वेळेच्या आधी", "velea adhi", "aathve mahine mein", "aathve mahine me", "आठवें महीने में", "athvya mahinyat", "आठव्या महिन्यात", "saatve mahine mein", "सातवें महीने में", "born early"]));
    if (early.length && rec.preterm == null) { const h = early[early.length - 1]; set("preterm", !negated(tok, h), span(tok, h.i0, h.i1)); }
    const term = findAll(tok, P(["full term", "nau mahine poore", "नौ महीने पूरे", "पूरे दिन", "poore din", "पूर्ण दिवस", "on time", "samay par"]));
    if (term.length && rec.preterm == null) { const h = term[term.length - 1]; set("preterm", false, span(tok, h.i0, h.i1)); }
    // place of birth: "ghar par hua", "hospital mein hua", "घरीच झाली", "PHC mein delivery"
    for (let i = 0; i < tok.length; i++) {
      const lo = tok[i].lo;
      const home = /^(ghar|घर|घरी|घरीच|gharpe|ghari|home)$/.test(lo), fac = /^(hospital|अस्पताल|दवाखान्यात|दवाखाना|phc|chc|पीएचसी|सीएचसी|facility|sarkari|सरकारी|rugnalay|रुग्णालय|रुग्णालयात|aspatal|aspataal)$/.test(lo);
      if (!home && !fac) continue;
      const [a, b] = clauseOf(tok, i);
      if (tok.slice(a, b + 1).some((x) => BORN.test(x.lo) || /^(delivery|डिलीवरी|प्रसूती|prasuti)$/.test(x.lo))) set("birth_place", home ? "home" : "facility", span(tok, i, i + 1));
    }
  }

  // Pregnancy: weeks and months
  if (type === "anc") {
    for (const n of nums) if ((WEEKS.has(tok[n.i1]?.lo) || /^(athavd|aathavd|\u0939\u092b|\u0906\u0920\u0935\u0921|haft|week)/.test(tok[n.i1]?.lo || "")) && n.value >= 4 && n.value <= 42) set("weeks", Math.round(n.value), span(tok, n.i0, n.i1 + 1));
    for (let i = 0; i < tok.length; i++) {
      const o = ordinalOf(tok[i].lo);
      if (o && o <= 10 && (MONTH.has(tok[i + 1]?.lo) || /^(\u092e\u0939\u0940\u0928|\u092e\u0939\u093f\u0928|mahin|month)/.test(tok[i + 1]?.lo || ""))) set("month", o, span(tok, i, i + 2));
    }
    for (const n of nums) if (MONTH.has(tok[n.i1]?.lo) && n.value >= 1 && n.value <= 10 && rec.month == null) set("month", Math.round(n.value), span(tok, n.i0, n.i1 + 1));
  }

  // Pads per day after delivery
  if (type === "pnc") {
    for (const an of findAll(tok, ANCHOR.pads)) { const n = numberNear(tok, nums, an, { ahead: 3, behind: 3 }); if (n && n.value >= 0 && n.value <= 30) set("pads", Math.round(n.value), span(tok, Math.min(n.i0, an.i0), Math.max(n.i1, an.i1))); }
  }

  // Urine albumin: "albumin 2 plus", "albumin nahi", "trace"
  if (type === "anc") {
    for (const an of findAll(tok, ANCHOR.albumin)) {
      const win = tok.slice(an.i1, an.i1 + 5);
      const n = numberNear(tok, nums, an, { ahead: 4, behind: 2 });
      // "albumin plus plus" = 2+
      let k = an.i1, plusRun = 0;
      while (tok[k] && ["is", "hai", "है", "आहे", ":"].includes(tok[k].lo)) k++;
      while (PLUS.has(tok[k]?.lo)) { plusRun++; k++; }
      if (plusRun) set("albumin", String(Math.min(plusRun, 4)), span(tok, an.i0, k));
      else if (n && n.value >= 1 && n.value <= 4 && (PLUS.has(tok[n.i1]?.lo) || n.i0 > an.i0)) set("albumin", String(Math.round(n.value)), span(tok, an.i0, Math.max(n.i1 + (PLUS.has(tok[n.i1]?.lo) ? 1 : 0), an.i1)));
      else if (win.some((x) => ["trace", "ट्रेस"].includes(x.lo))) set("albumin", "trace", span(tok, an.i0, an.i1));
      else if (win.some((x) => NEG.has(x.lo) || ["nil", "negative", "नेगेटिव", "निगेटिव"].includes(x.lo))) set("albumin", "nil", span(tok, an.i0, an.i1));
    }
  }

  // Iron tablets
  if (type === "anc") {
    for (const n of nums) {
      const near = tok.slice(Math.max(0, n.i0 - 3), n.i1 + 4).map((x) => x.lo);
      if (near.some((w) => TABLET.has(w) || /^(गोळ|गोल|tablet|goli)/.test(w)) && (near.some((w) => /^(iron|ifa|आयरन|आइरन|लोह|folic|फोलिक|आयर्न)/.test(w)) || (TABLET.has(tok[n.i1]?.lo) || /^(goli|गोली|गोळ)/.test(tok[n.i1]?.lo || "")) && tok.some((x) => /^(iron|ifa|आयरन|आइरन|लोह|आयर्न)/.test(x.lo))) && n.value >= 1 && n.value <= 400) set("ifa_tablets", Math.round(n.value), span(tok, n.i0, n.i1));
    }
  }

  // Pregnancy risk items from the MCP card and PMSMA: age, height, twins, labour hours,
  // previous caesarean, previous PPH / APH / eclampsia
  if (type === "anc") {
    const clauseNeg = (i) => { const [a, b] = clauseOf(tok, i); return tok.slice(a, b + 1).some((x) => NEG.has(x.lo)); };
    // age: "umar 17 saal", "age 38", "17 saal ki", "उम्र 36 साल", "वय 19 वर्षे", "36 years old"
    const AGE_CUE = KS(["umar", "umr", "umra", "umer", "उम्र", "उमर", "age", "aged", "वय", "vay", "vaya"]);
    const YEARS = KS(["saal", "sal", "saal.", "साल", "varsh", "varsha", "varshe", "वर्ष", "वर्षे", "वर्षांची", "वर्षाची", "years", "year", "yrs", "baras", "बरस"]);
    for (const n of nums) {
      if (n.value < 12 || n.value > 55) continue;
      const before = tok.slice(Math.max(0, n.i0 - 3), n.i0).map((x) => x.lo);
      const unit = tok[n.i1]?.lo, unit2 = tok[n.i1 + 1]?.lo;
      const yrs = unit != null && (YEARS.has(unit) || /^(वर्ष|varsh)/.test(unit));
      const cue = before.some((w) => AGE_CUE.has(w));
      const old = yrs && (["ki", "की", "ka", "का", "old", "ची", "चा", "ke", "के"].includes(unit2) || /^(वर्षांच|वर्षाच)/.test(unit));
      if ((cue && (yrs || !tok[n.i1] || BREAK.has(tok[n.i1].t) || ["hai", "है", "आहे", "ahe"].includes(unit))) || old) set("age", Math.round(n.value), span(tok, n.i0, n.i1 + (yrs ? 1 : 0)));
    }
    // height: "lambai 140 cm", "height 142 centimetre", "उंची 140 सेमी"
    const H_CUE = KS(["height", "lambai", "lambaai", "लंबाई", "ऊंचाई", "ऊँचाई", "उंचाई", "उंची", "unchai", "unchi", "kad", "कद"]);
    const CM = KS(["cm", "cms", "centimetre", "centimeter", "centimetres", "centimeters", "सेमी", "सेंटीमीटर", "सेंमी"]);
    for (const n of nums) {
      if (n.value < 110 || n.value > 200) continue;
      const cue = tok.slice(Math.max(0, n.i0 - 3), n.i0).some((x) => H_CUE.has(x.lo));
      if (cue || CM.has(tok[n.i1]?.lo)) set("height_cm", Math.round(n.value), span(tok, n.i0, n.i1 + (CM.has(tok[n.i1]?.lo) ? 1 : 0)));
    }
    for (const n of nums) {
      if (n.value < 3 || n.value > 6 || !/^(feet|foot|fut|ft|फुट|फूट|फीट)$/.test(tok[n.i1]?.lo || "")) continue;
      const m = readNumber(tok, n.i1 + 1);
      const inch = m && m.value < 12 && /^(inch|inches|in|इंच)$/.test(tok[m.i1]?.lo || "") ? m.value : 0;
      set("height_cm", Math.round((n.value * 12 + inch) * 2.54), span(tok, n.i0, inch ? m.i1 + 1 : n.i1 + 1));
    }
    // labour pain hours: "dard 14 ghante se", "चौदह घंटे हो गए" with a pain word nearby, "labour pain for 14 hours"
    const HOURS = /^(ghante|ghanta|ghanton|ghantey|घंटे|घंटा|घंटों|hours?|hrs?|taas|tas|तास)/;
    const PAIN = /^(dard|दर्द|pain|pains|labour|labor|कळा|kala|kalaa|kalaa|peeda|pida|पीड़ा|पीडा|vedna|वेदना|दुख|dukh|prasav|प्रसव)/;
    for (const n of nums) {
      if (n.value < 1 || n.value > 72 || !HOURS.test(tok[n.i1]?.lo || "")) continue;
      const win = tok.slice(Math.max(0, n.i0 - 12), n.i1 + 8);
      if (win.some((x) => PAIN.test(x.lo))) set("labour_hours", Math.round(n.value), span(tok, n.i0, n.i1 + 1));
    }
    // twins: "judwa bachche", "जुळी", "twins"
    const TWIN = /^(judwa|judwaa|judva|jodva|जुड़वा|जुड़वाँ|जुडवा|जुळी|जुळे|julee|juli|jule|twins?)$/;
    for (let i = 0; i < tok.length; i++) if (TWIN.test(tok[i].lo)) set("twins", !clauseNeg(i), span(tok, i, i + 1));
    // previous caesarean: "pichli delivery operation se hui thi", "पहले सिजेरियन हुआ था", "previous LSCS"
    const CS = /^(operation|operashan|ऑपरेशन|आपरेशन|ऑप्रेशन|सिजेरियन|सीजेरियन|सिझेरियन|सिजेरीयन|caesarean|cesarean|caesarian|cesarian|sizerian|sijerian|lscs|c-section|csection|सीझर|seezar)/;
    for (let i = 0; i < tok.length; i++) if (CS.test(tok[i].lo)) set("prev_caesarean", !clauseNeg(i), span(tok, i, i + 1));
    // previous complications, said in a clause about a past pregnancy or delivery
    const PREV = /^(pichli|pichhli|pichle|pichhle|पिछली|पिछले|pehli|pahli|पहली|previous|last|मागच्या|मागील|पहिल्या|पहिली|pahili|आधीच्या|aadhichya)$/;
    const PREG = /^(delivery|deliveri|डिलीवरी|डिलिवरी|प्रसूत|बाळंत|baalant|balant|pregnancy|प्रेगनेंसी|प्रेग्नेंसी|garbh|गर्भ|गरोदर|garodar|bachch|बच्च|baby|बाळ|jachgi|जचगी|prasav|प्रसव|baar|बार|वेळी|time)/;
    const AFTER_BIRTH = /^(delivery|deliveri|डिलीवरी|डिलिवरी|प्रसूत|बाळंत|baalant|balant|jachgi|जचगी|prasav|प्रसव|baad|बाद|नंतर|after)/;
    for (let i = 0; i < tok.length; i++) {
      if (!PREV.test(tok[i].lo) || !tok.slice(i + 1, i + 4).some((x) => PREG.test(x.lo))) continue;
      const [a, b] = clauseOf(tok, i);
      const w = tok.slice(a, b + 1);
      const neg = w.some((x) => NEG.has(x.lo));
      if (w.some((x) => /^(khoon|खून|रक्त|rakt|bleeding|bleed|ब्लीडिंग|रक्तस्)/.test(x.lo))) set(w.some((x) => AFTER_BIRTH.test(x.lo)) ? "prev_pph" : "prev_aph", !neg, span(tok, a, b + 1));
      if (w.some((x) => /^(jhatke|jhatka|झटके|झटका|दौरा|दौरे|आकडी|fits?|convuls|eclampsia|एक्लेम्पसिया|aakdi|daura)/.test(x.lo))) set("prev_eclampsia", !neg, span(tok, a, b + 1));
    }
    // "khoon chadhaya tha" (a transfusion) and "khoon ki jaanch" are not a past bleed
    for (const k of ["prev_pph", "prev_aph"]) if (rec[k] === true && ev[k] && /(chadh|चढ़|चढ|jaanch|जांच|जाँच|transfusion|test)/i.test(normalise(raw.slice(ev[k].start, ev[k].end)))) { delete rec[k]; delete ev[k]; }
    const flag = (k, i, i1 = i + 1) => set(k, !clauseNeg(i), span(tok, i, i1));
    const at = (re) => { for (let i = 0; i < tok.length; i++) if (re.test(tok[i].lo)) return i; return -1; };
    const phrase = (list) => { const h = findAll(tok, P(list)); return h.length ? h[h.length - 1] : null; };
    // previous stillbirth or newborn death (CHO p.18, PMSMA)
    { const h = phrase(["mara hua", "mara hua paida", "मरा हुआ", "मरा हुआ पैदा", "मृत बच्चा", "मृत बाळ", "मेलेलं बाळ", "मेलेले बाळ", "still born", "stillborn", "stillbirth", "still birth", "bachcha mar gaya", "baby mar gaya", "बच्चा मर गया", "बाळ दगावलं", "बाळ गेलं", "baby died", "baby had died", "neonatal death"]); if (h) set("prev_stillbirth", !negated(tok, h), span(tok, h.i0, h.i1)); }
    // previous preterm or small baby, said about a past birth
    for (let i = 0; i < tok.length; i++) {
      if (!/^(pichl|pichhl|पिछल|pehl|पहल|previous|last|मागच|मागील|पहिल|आधीच)/.test(tok[i].lo)) continue;
      const [a, b] = clauseOf(tok, i);
      const w = tok.slice(a, b + 1).map((x) => x.lo).join(" ");
      if (/(premature|preterm|samay se pehle|time se pehle|समय से पहले|वेळेआधी|velea?adhi|aathve mahine|आठवें महीने|kam wajan|kam vajan|कम वजन|कम वज़न|low birth weight|lbw|chhota|छोटा|कमी वजन)/.test(w)) set("prev_preterm", !/ नहीं| नही| नाही| nahi | not /.test(" " + w + " "), span(tok, a, b + 1));
    }
    // diabetes / sugar, heart disease, Rh negative, HIV or syphilis
    { const i = at(/^(sugar|शुगर|diabetes|diabetic|मधुमेह|madhumeh|gdm|डायबिटीज|डायबिटीज़|डायबेटीस)$/); if (i >= 0) flag("diabetes", i); }
    { const h = phrase(["dil ki bimari", "dil ki beemari", "dil ka rog", "dil ki problem", "दिल की बीमारी", "दिल का रोग", "हृदयरोग", "हृदय रोग", "hriday rog", "हृदयाचा आजार", "heart disease", "heart problem", "heart ki bimari", "heart ka problem", "heart patient"]); if (h) set("heart_disease", !negated(tok, h), span(tok, h.i0, h.i1)); }
    for (let i = 0; i < tok.length; i++) {
      if (!/^(negative|नेगेटिव|निगेटिव|निगेटिव्ह|nigetiv|negetive)$/.test(tok[i].lo)) continue;
      const before = tok.slice(Math.max(0, i - 3), i).map((x) => x.lo);
      if (before.some((x) => /^(rh|आरएच|blood|ब्लड|group|ग्रुप|a|b|o|ab|ए|बी|ओ|एबी)$/.test(x)) && !before.some((x) => /^(hiv|एचआईवी|syphilis|vdrl|albumin|एल्ब|अल्ब|sugar|शुगर|test)/.test(x))) set("rh_negative", true, span(tok, Math.max(0, i - 2), i + 1));
    }
    for (let i = 0; i < tok.length; i++) {
      if (!/^(hiv|एचआईवी|syphilis|सिफलिस|vdrl|उपदंश)$/.test(tok[i].lo)) continue;
      const after = tok.slice(i + 1, i + 4).map((x) => x.lo);
      if (after.some((x) => /^(positive|पॉजिटिव|पॉज़िटिव|पॉझिटिव्ह|reactive|positiv)/.test(x))) set("hiv_syphilis", true, span(tok, i, i + 2));
      else if (after.some((x) => /^(negative|नेगेटिव|निगेटिव|non|nonreactive)/.test(x))) set("hiv_syphilis", false, span(tok, i, i + 2));
    }
    // number of births before this pregnancy: "4 bachche pehle se", "paanchvi delivery", "fifth pregnancy"
    for (const n of nums) {
      const u = tok[n.i1]?.lo;
      if (n.value >= 1 && n.value <= 15 && /^(bachche|bacche|बच्चे|children|kids|मुलं|मुले|mule|mula|deliveries|delivery|डिलीवरी|births)$/.test(u || "") && !/^(ko|को|ka|के|ke)$/.test(tok[n.i1 + 1]?.lo || "")) set("previous_births", Math.round(n.value), span(tok, n.i0, n.i1 + 1));
    }
    for (let i = 0; i < tok.length; i++) {
      const o = ordinalOf(tok[i].lo);
      if (o && o >= 2 && o <= 15 && /^(delivery|डिलीवरी|डिलिवरी|pregnancy|प्रेगनेंसी|garbh|गर्भ|bachcha|बच्चा|baby|बाळंतपण|गरोदरपण)/.test(tok[i + 1]?.lo || "")) set("previous_births", o - 1, span(tok, i, i + 2));
    }
    // breech or transverse: "bachcha ulta hai", "breech"
    { const h = phrase(["bachcha ulta", "baby ulta", "बच्चा उल्टा", "बच्चा उलटा", "बाळ उलटं", "bal ulta", "ulta bachcha", "उल्टा बच्चा", "breech", "transverse", "tirchha", "तिरछा", "आड़ा बच्चा", "आडवं बाळ"]); if (h) set("malpresentation", !negated(tok, h), span(tok, h.i0, h.i1)); }
    // Td/TT doses: "Td ke do teeke lag gaye", "TT dono lage", "टीडी का दूसरा टीका"
    for (let i = 0; i < tok.length; i++) {
      if (!/^(td|tt|टीडी|टीटी|tetanus)$/.test(tok[i].lo)) continue;
      const win = tok.slice(Math.max(0, i - 3), i + 5);
      if (!win.some((x) => /^(teek|टीक|injection|इंजेक्शन|dose|डोस|लस|las|shot|vaccine|lag|लग)/.test(x.lo))) continue;
      let v = null, i1 = i + 1;
      for (let k = Math.max(0, i - 3); k < Math.min(tok.length, i + 5); k++) {
        const lo = tok[k].lo;
        if (/^(dono|दोनों|दोनो|both|दोन्ही|donhi)$/.test(lo)) { v = 2; i1 = Math.max(i1, k + 1); }
        const o = ordinalOf(lo); if (o && o <= 3) { v = o; i1 = Math.max(i1, k + 1); }
        const n = readNumber(tok, k); if (v == null && n && n.value >= 1 && n.value <= 3 && !/[.]/.test(String(n.value))) { v = n.value; i1 = Math.max(i1, n.i1); }
      }
      if (v != null) set("td_doses", v, span(tok, Math.min(i, i1 - 1), i1));
    }
    for (let i = 0; i < tok.length; i++) {
      const lo = tok[i].lo;
      if (lo === "pph") set("prev_pph", !clauseNeg(i), span(tok, i, i + 1));
      if (lo === "aph") set("prev_aph", !clauseNeg(i), span(tok, i, i + 1));
    }
  }

  // "paanch pad… nahi, chaar": a bare number after a correction word replaces the one just said
  {
    const CORR = KS(["nahi", "nahin", "नहीं", "नाही", "no", "sorry", "wait", "गलत", "galat", "थांबा", "matlab", "मतलब", "i", "mean"]);
    const used = new Set();
    for (const e of Object.values(ev)) if (e) for (let k = 0; k < tok.length; k++) if (tok[k].start >= e.start && tok[k].end <= e.end) used.add(k);
    for (const [field, e] of Object.entries({ ...ev })) {
      if (!e || typeof rec[field] !== "number" || field === "bp_sys" || field === "bp_dia" || field === "weight_g") continue;
      const nIdx = nums.findIndex((n) => tok[n.i0].start >= e.start && tok[n.i1 - 1].end <= e.end);
      if (nIdx < 0) continue;
      const n1 = nums[nIdx], n2 = nums[nIdx + 1];
      if (!n2 || n2.i0 - n1.i1 > 12) continue;
      const between = tok.slice(n1.i1, n2.i0).map((x) => x.lo);
      if (!between.some((w) => CORR.has(w))) continue;
      if ([...Array(n2.i1 - n2.i0).keys()].some((k) => used.has(n2.i0 + k))) continue;
      const v = n2.value, old = rec[field];
      if (old != null && v > 0 && v < old * 3 && v > old / 3) { rec[field] = field === "hb" || field === "temp_c" ? round1(v) : Math.round(v); ev[field] = span(tok, n2.i0, n2.i1); }
    }
  }

  // Feeding (newborn) and foetal movement (pregnancy): read the whole clause,
  // so "दूध नीट पितं", "doodh theek pee raha", "feeding okay" all count.
  const clauseWords = (i) => { const [a, b] = clauseOf(tok, i); return { a, b, w: tok.slice(a, b + 1).map((x) => x.lo) }; };
  const POOR = KS(["कम", "कमी", "थोड़ा", "थोडा", "थोडं", "थोड़ी", "less", "poor", "poorly", "weak", "kam", "kami", "thoda", "thodi", "slow", "reduced", "decreased", "fewer", "घट"]);
  const GOOD = KS(["present", "felt", "vyavasthit", "badhiya", "बढ़िया", "पूरा", "poora", "pura", "खूब", "khoob", "भरपूर", "अच्छा", "अच्छे", "अच्छी", "ठीक", "नीट", "छान", "चांगलं", "चांगला", "चांगली", "व्यवस्थित", "बरोबर", "changla", "chhan", "neet", "theek", "thik", "achha", "accha", "achhe", "acha", "okay", "ok", "fine", "good", "well", "properly", "normal", "normally", "नॉर्मल", "sahi"]);
  const STOP = KS(["बंद", "band", "stopped", "stop", "no", "none"]);
  if (type === "newborn") {
    const FEED = KS(["peeta", "peeti", "peete", "sucking", "sucks", "दूध", "doodh", "dudh", "doodh.", "feeding", "feed", "feeds", "breastfeeding", "breastfeed", "स्तनपान", "stanpan", "stanpaan", "stanpana", "स्तनपानं", "suck", "sucking", "पीता", "पी", "पितं", "पीत", "पित", "pitay", "pita", "pee", "pi"]);
    let pick = null;
    for (let i = 0; i < tok.length; i++) {
      if (!FEED.has(tok[i].lo)) continue;
      const { a, b, w } = clauseWords(i);
      // the mother's milk coming in is not the baby feeding
      if (w.some((x) => ["उतर", "उतरत", "येतंय", "येत", "आई", "माँ", "मां", "mother"].includes(x)) && !w.some((x) => ["पी", "पीता", "पितं", "पीत", "पित", "pee", "pita", "feeding"].includes(x))) continue;
      let v;
      const tail = (b + 2 < tok.length && JOIN.has(tok[b + 1]?.lo)) ? clauseWords(b + 2).w : [];
      if (w.some((x) => POOR.has(x)) || (tail.length <= 3 && tail.some((x) => POOR.has(x)))) v = "poor";
      else if (w.some((x) => NEG.has(x) || STOP.has(x) || x === "unable")) v = "none";
      else if (w.some((x) => GOOD.has(x)) || w.some((x) => ["पी", "पीता", "पितं", "पीत", "pitay", "pee", "पी.", "feeding", "पिते", "पितंय", "पितोय", "pita", "pitoy", "pitey", "peeta", "peeti", "peete", "sucking"].includes(x))) v = "good";
      if (v && v === "good" && w.some((x) => /^(tha|thi|था|थी|होता|होती|hota|hoti)$/.test(x)) && w.some((x) => /^(kal|कल|काल|tak|तक|पर्यंत)$/.test(x))) continue;
      if (v) pick = { v, i0: a, i1: b + 1 };
    }
    if (pick) set("feeding", pick.v, span(tok, pick.i0, pick.i1));
  }
  if (type === "anc") {
    const MOVE = /^(ghoom|ghum|घूम|घुम|फिर रहा|हिल|हलचल|हालचाल|हलत|हलतं|हलते|hil|halchal|movement|movements|moving|moves|kick|kicks|kicking|फड़क|halat|haltay)/;
    let pick = null;
    for (let i = 0; i < tok.length; i++) {
      if (!MOVE.test(tok[i].lo)) continue;
      const { a, b, w } = clauseWords(i);
      let v;
      if (w.some((x) => POOR.has(x))) v = "reduced";
      else if (w.some((x) => NEG.has(x) || STOP.has(x))) v = "absent";
      else if (w.some((x) => GOOD.has(x)) || /^(हलतं|हलते|हिल रहा|moving)/.test(tok[i].lo) || w.includes("रहा") || w.includes("आहे")) v = "normal";
      if (v) pick = { v, i0: a, i1: b + 1 };
    }
    if (pick) set("fetal_movement", pick.v, span(tok, pick.i0, pick.i1));
  }

  // Symptoms, with negation. The last mention of each one wins.
  const sym = {}, sev = {};
  const table = SYMPTOMS[type] || {};
  const taken = []; // spans already used by a longer, more specific phrase
  const MOTHER = KS(["खुद", "khud", "स्वतः", "स्वतःला", "herself", "माँ", "मां", "आई", "आईला", "आईच्या", "mother", "maa", "mummy", "मम्मी"]);
  const BABYW = KS(["बाळ", "बाळाला", "बाळाचं", "बाळाचे", "बाळाची", "बच्चा", "बच्चे", "बच्ची", "baby", "bachcha", "bachche", "bal", "balala"]);
  // Someone else's complaint: "saas ko sir dard hai", "her mother-in-law has a headache"
  const OTHER = /^(saas|sas|sasu|sasur|pati|navra|navryala|devar|jeth|jethani|nanad|padosan|सास|सासू|सासूला|सासूबाई|सासूबाईंना|ससुर|सासरे|सासऱ्यांना|पति|नवरा|नवऱ्याला|देवर|जेठ|जेठानी|ननद|पड़ोसन|पडोसन|शेजारी|शेजारणीला|husband|neighbour|neighbor)$/;
  const EXPER = KS(["ko", "को", "ka", "ki", "ke", "का", "की", "के", "la", "ला", "ना", "has", "had", "is", "chi", "ची", "चा", "चे", "ka.", "ji", "जी"]);
  const otherSubject = (hit) => {
    const { a, b } = clauseWords(hit.i0);
    for (let k = a; k <= b; k++) {
      const lo = tok[k].lo;
      const isOther = OTHER.test(lo) || (lo === "law" && tok[k - 1]?.lo === "in");
      if (!isOther) continue;
      const next = tok[k + 1]?.lo;
      if (["ne", "ने", "said", "says", "told", "bataya", "बताया", "सांगितलं", "म्हणाली"].includes(next)) continue;
      if (EXPER.has(next) || /(ला|ना|ला\.)$/.test(lo) || k === b) return true;
    }
    return false;
  };
  // A past pregnancy's complications are history, not today's danger sign
  const PREV_W = /^(pichli|pichhli|pichle|pichhle|पिछली|पिछले|pehli|pahli|पहली|previous|last|मागच्या|मागील|पहिल्या|पहिली|आधीच्या)$/;
  const PREG_W = /^(delivery|डिलीवरी|डिलिवरी|प्रसूत|बाळंत|pregnancy|प्रेगनेंसी|गर्भ|गरोदर|bachch|बच्च|baby|बाळ|jachgi|जचगी|prasav|प्रसव|baar|बार|वेळी|time)/;
  const historyAt = (i) => { const { a, b } = clauseWords(i); for (let k = a; k <= b; k++) if (PREV_W.test(tok[k].lo) && tok.slice(k + 1, k + 4).some((x) => PREG_W.test(x.lo))) return true; return false; };
  const wrongSubject = (hit) => {
    if (otherAt(hit.i0) || otherSubject(hit)) return true;
    if (type === "anc" && historyAt(hit.i0)) return true;
    const { w } = clauseWords(hit.i0);
    if (type === "pnc") return w.some((x) => BABYW.has(x)) && !w.some((x) => MOTHER.has(x));
    if (type === "newborn") return w.some((x) => MOTHER.has(x)) && !w.some((x) => BABYW.has(x));
    return false;
  };
  const MILD = /^(halka|halki|halke|हल्का|हल्की|हलका|हलकी|thoda|thodi|thoda|थोड़ा|थोड़ी|थोडा|थोडी|थोडं|mild|slight|slightly|little|जरासा|jarasa|zara|ज़रा)$/;
  const mildAt = (hit) => tok.slice(Math.max(0, hit.i0 - 3), hit.i1 + 2).some((x) => MILD.test(x.lo)) && !tok.slice(Math.max(0, hit.i0 - 3), hit.i1 + 2).some((x) => /^(tez|तेज़|तेज|bahut|बहुत|खूप|severe|very)$/.test(x.lo));
  const askSeverity = (code, hit) => {
    if (negated(tok, hit) || wrongSubject(hit)) return;
    const what = code === "severe_headache" ? ["headache", "सिरदर्द", "डोकेदुखी"] : ["stomach pain", "पेट का दर्द", "पोटदुखी"];
    doubt("severity", null, { code, say_en: `Is the ${what[0]} severe?`, say_hi: `क्या ${what[1]} बहुत तेज़ है?`, say_mr: `${what[2]} खूप आहे का?` });
  };
  const record = (code, hit, value) => {
    if (taken.some((s) => hit.i0 < s.i1 && s.i0 < hit.i1)) return;
    if (wrongSubject(hit)) return;
    sym[code] = value;
    sev["symptoms." + code] = span(tok, hit.i0, hit.i1);
    taken.push(hit);
  };
  // phrases that themselves mean "absent" or "present", whatever the negation words
  for (const [code, list, value] of (ABSENT[type] || [])) for (const hit of findAll(tok, list)) {
    if (code === "breast_problem" && /^(स्तनपान|stanpan)/.test(tok[hit.i0].lo)) continue; // "स्तनपान ठीक" is feeding
    if (code === "cord_pus" && tok.slice(hit.i0, hit.i1).some((x) => /^pustule/.test(x.lo))) continue; // "no pustules" is the skin
    record(code, hit, value);
  }
  const codes = Object.keys(table).sort((a, b) => specificity(b) - specificity(a));
  for (const code of codes) {
    for (const hit of findAll(tok, table[code])) {
      if (code === "lethargy" && ev.feeding && overlaps(ev.feeding, span(tok, hit.i0, hit.i1))) continue;
      // "taapmaan 35 degree" is a reading, not "hot to touch"
      if ((code === "hot_to_touch" || code === "fever") && /^(taapm|tapm|tapam|taapam|तापमान|तपमान)/.test(tok[hit.i0].lo)) continue;
      // "स्तनपान", "breastfeeding" is the baby feeding, not a breast problem
      if (code === "breast_problem" && (/^(स्तनपान|breastfeed|stanpan)/.test(tok[hit.i0].lo) || (tok[hit.i0].lo === "breast" && /^(milk|feed)/.test(tok[hit.i0 + 1]?.lo || "")))) continue;
      // "khoon ki jaanch", "khoon ki kami", "khoon chadhaya" are a test, a level, a transfusion: not bleeding
      if ((code === "bleeding" || code === "heavy_bleeding") && tok.slice(hit.i0, hit.i1 + 3).some((x) => /^(jaanch|janch|जांच|जाँच|test|टेस्ट|kami|कमी|matra|मात्रा|report|रिपोर्ट|chadh|चढ़|चढ|transfusion|group|ग्रुप|tapas|तपास)/.test(x.lo))) continue;
      // "sir mein halka dard": mild is not severe; ask instead of referring
      if ((code === "severe_headache" || (code === "abdominal_pain" && type === "anc")) && mildAt(hit)) { askSeverity(code, hit); continue; }
      // "पिवळे फोड" are pustules, not jaundice
      if (code === "jaundice" && tok.slice(hit.i1, hit.i1 + 2).some((x) => /^(फोड|दाने|फुंस|pustule|boil|spot|पुटकुळ|chipchip|चिपचिप|paani|pani|पानी|kichad|कीचड|discharge)/.test(x.lo))) continue;
      record(code, hit, !negated(tok, hit));
    }
  }
  // A bare "दर्द"/"pain" in pregnancy, when nothing more specific took it
  if (type === "anc") {
    for (const hit of findAll(tok, P(["दर्द", "dard", "pain", "दुखत"]))) {
      const { w } = clauseWords(hit.i0);
      if (w.some((x) => /^(सिर|सर|sir|sar|head|डोक|स्तन|breast|पीठ|kamar|कमर|back|leg|पैर|पाय)/.test(x))) continue;
      // labour pains with their hours are recorded as labour_hours, not as stomach pain
      if (rec.labour_hours != null && ev.labour_hours && Math.abs(tok[hit.i0].start - ev.labour_hours.start) < 80) continue;
      if (tok.slice(Math.max(0, hit.i0 - 6), hit.i1 + 4).some((x) => /^(labou?r|prasav|प्रसव|कळा|shuru|शुरू)/.test(x.lo))) continue; // labour pains
      if (mildAt(hit)) { askSeverity("abdominal_pain", hit); continue; }
      record("abdominal_pain", hit, !negated(tok, hit));
    }
  }
  // Swelling named by body part: "पायांना सूज आहे, चेहऱ्यावर नाही", "sujan kahin nahi"
  if (type === "anc" || type === "pnc") {
    const SWELL = /^(सूज|सुज|suj|sooj|swell|oedema|edema)/;
    const FACE = /^(चेहर|चेहऱ|हाथ|हात|face|hand|chehr|haath|hat|पूरे|पूर्ण|सारे|शरीर|अंग|body|whole)/;
    const FEET = /^(पैर|पाय|pair|pao|paon|feet|foot|leg|legs|टांग|paya)/;
    const any = tok.some((x) => SWELL.test(x.lo));
    if (any) {
      for (let i = 0; i < tok.length; i++) {
        const lo = tok[i].lo;
        const part = FACE.test(lo) ? "swelling_face_hands" : FEET.test(lo) ? "swelling_feet" : null;
        if (!part || type === "pnc" && part === "swelling_feet") continue;
        const { a, b, w } = clauseWords(i);
        const swellHere = w.some((x) => SWELL.test(x));
        // "चेहरे पर नहीं" right after a swelling clause borrows its word
        const prevSwell = a > 1 && tok.slice(Math.max(0, a - 8), a).some((x) => SWELL.test(x.lo));
        if (!swellHere && !prevSwell) continue;
        const neg = w.some((x) => NEG.has(x));
        const hit = { i0: i, i1: i + 1 };
        if (!(("symptoms." + part) in sev)) record(part, hit, !neg);
        else if (sym[part] !== undefined) { sym[part] = !neg; sev["symptoms." + part] = span(tok, i, i + 1); }
      }
      // "sujan kahin nahi", "no swelling anywhere", "कुठेही सूज नाही"
      for (let i = 0; i < tok.length; i++) {
        if (!SWELL.test(tok[i].lo)) continue;
        const { w } = clauseWords(i);
        if (w.some((x) => NEG.has(x)) && w.some((x) => ["kahin", "कहीं", "कहिं", "कुठेही", "कुठे", "anywhere", "कहीं.", "बिल्कुल"].includes(x) || x === "no")) {
          for (const part of type === "pnc" ? ["swelling_face_hands"] : ["swelling_face_hands", "swelling_feet"]) if (sym[part] === undefined) { sym[part] = false; sev["symptoms." + part] = span(tok, i, i + 1); }
        }
      }
    }
  }
  // Two words in the same clause make a sign even when other words sit between them
  const COOC = {
    newborn: [
      ["blood_stool", /^(टट्टी|पॉटी|पोटी|मल|शौच|संडास|शी|stool|stools|potty|tatti|latrine|shauch)/, /^(खून|रक्त|blood|khoon|rakt)/],
      ["jaundice_palms_soles", /^(हथेल|तलव|तळव|तळहात|hathel|talw|talv|palm|sole)/, /^(पील|पिवळ|peel|pil|yellow|pivl)/],
      ["lethargy", /^(हात|हाथ|छू|छुने|छूने|touch|chhoo|chhune|haath|haat|stimul)/, /^(हलत|हलतं|हिल|हिलता|move|moves|moving|hilta|halat|halta)/],
      ["weak_cry", /^(रोना|रोता|रोती|रडणं|रडणे|रडत|रडतं|cry|cries|crying|rona|rota|roti|radna|radta)/, /^(कमजोर|कमज़ोर|कम|कमी|धीरे|धीमा|धीमी|dheema|dheemi|dhima|halu|हळू|weak|kamzor|kam|kami|feeble|low)$/],
      ["eye_discharge", /^(aankh|ankh|आँख|आंख|डोळ|dolyat|dolyatun|eye|eyes)/, /^(paani|pani|पानी|पाणी|kichad|keechad|कीचड़|कीचड|chipchip|चिपचिप|pus|पू|मवाद|mawad|discharge|sticky|ghaan)/],
      ["cord_pus", /^(नाभि|नाभी|नाळ|नाल|naal|nabhi|naabhi|naabi|nabi|cord|umbilic|navel|bellybutton)/, /^(मवाद|पू|पीप|pus|mawad|लाली|लाल|लालसर|red|redness|bleed|lal|laal|swoll|swell|smell|smelly|ooz|discharg|सूज|sujan|soojan|वास|बदबू|badbu|badboo)/],
      ["abdominal_distension", /^(पेट|पोट|pet|pot|belly|tummy|abdomen|stomach)$/, /^(फूल|फुल|फुग|phul|phool|ful|fool|fug|swoll|swell|disten|tight|कड़|कडक|kada|kadak|bloat)/],
    ],
    anc: [
      ["abdominal_pain", /^(पेट|पोट|pet|pot|stomach|abdomen|tummy|belly)/, /^(दर्द|दुख|dard|dukh|pain|ache)/],
      ["burning_urine", /^(burn|burning|jalan|जलन|jaljal|जळजळ)/, /^(urine|urinat|peshab|peshaab|पेशाब|laghvi|लघवी|pee|passing|micturi)/],
    ],
    pnc: [
      ["abnormal_speech", /^(बोल|bol|speech|speak|talk|baat|बात)/, /^(बदल|अजीब|अटक|अडखळ|विचित्र|strange|abnormal|slurr|ulta|उल्टा|badal|irrelevant|nonsense|bakwas|बकवास|बहकी|behki|ajeeb)/],
      ["burning_urine", /^(burn|burning|jalan|जलन|jaljal|जळजळ)/, /^(urine|urinat|peshab|peshaab|पेशाब|laghvi|लघवी|pee|passing|micturi)/],
      ["abdominal_pain", /^(पेट|पोट|pet|pot|stomach|abdomen|tummy|belly)/, /^(दर्द|दुख|dard|dukh|pain|ache)/],
      ["foul_discharge", /^(वास|बदबू|smell|badbu|दुर्गंध|odour|odor|vas|vaas|badboo)$/, /^(स्राव|पाणी|पानी|discharge|srav|paani|pani|white)/],
      // "pad bheeg jaata hai ghante mein": a pad soaked within an hour
      ["heavy_bleeding", /^(pad|pads|पैड|पॅड|kapda|कपड़ा|कपडा)$/, /^(bheeg|bhig|भीग|भिज|bhij|soak|soaked|bhar|भर|full|tar)/],
      ["wound_infection", /^(tank|taank|टांक|टाँक|टाक|stitch|wound|zakhm|ज़ख्म|जख्म|जखम)/, /^(pus|पस|मवाद|mawad|पू|pak|पक|पिक|lal|laal|लाल|red|smell|बदबू|badbu|वास|ooz|sujan|सूज|swoll|swell)/],
      ["calf_pain", /^(pindl|पिंडल|पोटर|potr|calf|calves)/, /^(dard|दर्द|dukh|दुख|pain|sujan|सूज|swell|swoll|ache|lal|red|garam)/],
    ],
  };
  for (const [code, A, B] of COOC[type] || []) {
    if (sym[code] !== undefined) continue;
    for (let i = 0; i < tok.length; i++) {
      if (!A.test(tok[i].lo)) continue;
      let { a, b } = clauseWords(i);
      if (/^(भी|bhi)$/.test(tok[b + 1]?.lo || "") && b + 2 < tok.length) b = clauseOf(tok, b + 2)[1]; // "rona bhi bahut dheema": bhi does not end the thought
      for (let j = a; j <= b; j++) {
        if (j === i || !B.test(tok[j].lo)) continue;
        const hit = { i0: Math.min(i, j), i1: Math.max(i, j) + 1 };
        const neg = negated(tok, hit) || tok.slice(a, b + 1).some((x) => NEG.has(x.lo));
        if (code === "abdominal_pain" && type === "anc" && !neg && mildAt(hit)) { askSeverity(code, hit); break; }
        if (!wrongSubject(hit)) { sym[code] = !neg; sev["symptoms." + code] = span(tok, hit.i0, hit.i1); }
        break;
      }
      if (sym[code] !== undefined) break;
    }
  }
  // After birth, a bleeding word said as absent means no heavy bleeding
  if (type === "pnc" && sym.heavy_bleeding === undefined) for (const h of findAll(tok, P(["bleeding", "raktasrav", "रक्तस्राव", "रक्तस्त्राव", "khoon", "खून"]))) if (negated(tok, h) && !wrongSubject(h)) { sym.heavy_bleeding = false; sev["symptoms.heavy_bleeding"] = span(tok, h.i0, h.i1); }
  // A high fever is a fever too
  if (sym.high_fever === true && sym.fever === undefined) { sym.fever = true; sev["symptoms.fever"] = sev["symptoms.high_fever"]; }
  // Yellow palms or soles are jaundice too
  if (sym.jaundice_palms_soles === true && sym.jaundice === undefined) { sym.jaundice = true; sev["symptoms.jaundice"] = sev["symptoms.jaundice_palms_soles"]; }
  // A temperature said with "bukhar"/"taap" is a reading, not a separate symptom
  if (rec.temp_c != null && ev.temp_c) {
    for (const code of ["hot_to_touch", "fever", "cold_to_touch"]) {
      const sp = sev["symptoms." + code];
      const word = sp ? normalise(text.slice(sp.start, sp.end)).toLowerCase() : "";
      const bare = /^(बुखार|ताप|bukhar|bukhaar|taap|tap|fever|temperature)$/.test(word);
      if (sym[code] === true && sp && bare && Math.abs(sp.start - ev.temp_c.start) < 40) { delete sym[code]; delete sev["symptoms." + code]; }
    }
  }
  // Never both hot and cold: a reading decides, else the last one said
  if (sym.hot_to_touch === true && sym.cold_to_touch === true) {
    const t = rec.temp_c;
    const drop = t != null && t < 36.5 ? "hot_to_touch" : t != null && t >= 37.5 ? "cold_to_touch" : sev["symptoms.hot_to_touch"].start < sev["symptoms.cold_to_touch"].start ? "hot_to_touch" : "cold_to_touch";
    delete sym[drop]; delete sev["symptoms." + drop];
  }
  if (Object.keys(sym).length) { rec.symptoms = sym; Object.assign(ev, sev); }
  // Jaundice needs the day of life to decide (day 1 or after day 14 refer)
  if (type === "newborn" && sym.jaundice === true && sym.jaundice_palms_soles !== true && rec.day == null) doubt("day", null, { say_en: "Which day of life is the baby?", say_hi: "बच्चा कितने दिन का है?", say_mr: "बाळ किती दिवसांचं आहे?" });
  // A record never carries another visit type's fields
  for (const k of Object.keys(rec)) if (k !== "type" && k !== "symptoms" && !FIELDS[type].includes(k)) { delete rec[k]; delete ev[k]; }
  // Never silent: a clause that names a body part or complaint but filled nothing is returned in
  // `unread`, so the app can show "Noted: words not understood, tell the nurse".
  const BODY = /^(saans|sans|साँस|सांस|श्वास|shwas|pet|पेट|पोट|khoon|खून|रक्त|rakt|peshab|पेशाब|लघवी|laghvi|nabhi|naabhi|नाभि|नाभी|नाळ|naal|aankh|आँख|आंख|डोळ|tanka|tanke|टांके|टाके|chhati|छाती|pasli|पसली|sir|सिर|सर|डोक|stan|स्तन|pindli|पिंडली|bukhar|बुखार|ताप|jhatk|झटक|daur|दौर|ulti|उल्टी|dast|दस्त|potty|tatti|chest|breath|breathing|stomach|belly|blood|urine|navel|eye|eyes|head|fits|pain|dard|दर्द|dukh|दुख|sujan|सूज|swelling)/;
  const used = Object.values(ev).filter(Boolean);
  const unread = [];
  for (let i = 0; i < tok.length;) {
    const [a, b] = clauseOf(tok, i);
    const ws = tok.slice(a, b + 1);
    const cs = tok[a].start, ce = tok[b].end;
    if (ws.some((x) => BODY.test(x.lo)) && !used.some((e) => e.start < ce && cs < e.end) && !doubts.some((d) => d.field === "severity") && !ws.some((x, k) => isOtherPerson(x.lo) && k < ws.length - 1)) unread.push({ text: raw.slice(cs, ce), start: cs, end: ce });
    i = b + 1;
    while (i < tok.length && (BREAK.has(tok[i].t) || JOIN.has(tok[i].lo))) i++;
  }
  return { type, record: rec, evidence: ev, tokens: tok.length, nameScore, doubts, unread };
}

function specificity(code) {
  const order = { high_fever: 4, labour_pain: 3, wound_infection: 4, calf_pain: 4, abdominal_distension: 4, difficulty_breathing: 4, low_mood: 2, severe_headache: 4, jaundice_palms_soles: 5, swelling_face_hands: 5, swelling_feet: 5, heavy_bleeding: 4, chest_indrawing: 4, blood_stool: 4, cord_pus: 4, eye_discharge: 4, abnormal_speech: 4, burning_urine: 4, weak_cry: 4, breast_problem: 4, leaking_fluid: 3, lethargy: 3, cold_to_touch: 3, abdominal_pain: 3, dizziness: 3, blurred_vision: 3 };
  return order[code] || 1;
}
const overlaps = (a, b) => a && b && a.start < b.end && b.start < a.end;

/** Merge a new utterance into the visit so far. Later values replace earlier ones. */
export function merge(prev, next) {
  if (!prev) return next;
  const record = { ...prev.record, ...next.record, type: next.record.type || prev.record.type };
  if (prev.record.symptoms || next.record.symptoms) record.symptoms = { ...(prev.record.symptoms || {}), ...(next.record.symptoms || {}) };
  return { type: record.type, record, evidence: { ...prev.evidence, ...next.evidence }, doubts: next.doubts || [] };
}
