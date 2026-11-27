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

/** Split into tokens with character offsets into the original string. */
export function tokenize(raw) {
  const s = normalise(raw);
  const out = [];
  const re = /[0-9]+(?:\.[0-9]+)?|[a-zA-Z]+|[ऀ-ॣ०-ॿ]+|\/|\+|°|[.,;!?।॥|]/g;
  let m;
  while ((m = re.exec(s))) out.push({ t: m[0], lo: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
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
};
const KS = (list) => new Set(list.map(K));
const HUNDRED = KS(["सौ", "sau", "hundred", "शंभर", "shambhar", "शेकडा"]);
const THOUSAND = KS(["हज़ार", "हजार", "hazar", "hajar", "hazaar", "thousand"]);
const POINT = KS(["point", "पॉइंट", "पॉईंट", "पोइंट", "दशमलव", "पाइंट", "पॉंइट"]);
const HALFWORD = { "डेढ़": 1.5, "डेढ": 1.5, "dedh": 1.5, "dhedh": 1.5, "ढाई": 2.5, "dhai": 2.5, "दीड": 1.5, "did": 1.5, "deed": 1.5, "अडीच": 2.5, "adich": 2.5 };
const MOD = { "सवा": 0.25, "sava": 0.25, "sawa": 0.25, "सव्वा": 0.25, "savva": 0.25, "साढ़े": 0.5, "साढे": 0.5, "sadhe": 0.5, "saadhe": 0.5, "साडे": 0.5, "sade": 0.5, "पौने": -0.25, "paune": -0.25, "पावणे": -0.25, "pavne": -0.25 };

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
  return v != null && v > 0 && v < 10 ? v * 100 : null;
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

/** Every number in the utterance, in order. */
export function allNumbers(tok) {
  const out = [];
  for (let i = 0; i < tok.length;) {
    const n = readNumber(tok, i);
    if (n) { out.push(n); i = Math.max(n.i1, i + 1); } else i++;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Word lists. Each entry is a list of token sequences.                */
/* ------------------------------------------------------------------ */

const P = (list) => list.map((p) => normalise(p).toLowerCase().split(/\s+/));
const NEG = KS(["nahit", "nahiye", "nahin.", "naahi", "नाहीये", "नसतो", "नसते", "नहीँ", "नहीं", "नही", "nahi", "nahin", "nai", "nahee", "naheen", "नाही", "nahi.", "no", "not", "never", "नको", "न", "नहीं.", "नव्हता", "नव्हती", "नाहीत", "बिल्कुल", "none", "denies", "absent", "नसते", "नव्हते"]);
const NEG_BEFORE = KS(["na", "न", "no", "not", "without", "koi", "कोई", "कुठलाही", "कुठलीही", "never", "बिना", "bina"]);
const CORRECTION = KS(["sorry", "गलत", "galat", "माफ", "chuk", "चूक", "correction", "nahi-nahi"]);

const SYMPTOMS = {
  anc: {
    bleeding: P(["खून गया", "खून गई", "खून नहीं गया", "khoon gaya", "रक्त गेले", "रक्त गेलं", "bleeding", "bleed", "खून जा", "खून आ", "खून गिर", "ब्लीडिंग", "रक्तस्राव", "रक्त जा", "रक्त येत", "khoon ja", "khoon aa", "khoon gir", "spotting", "स्पॉटिंग", "रक्तस्त्राव"]),
    leaking_fluid: P(["पानी जा", "पानी निकल", "पानी आ रहा", "थैली फट", "पाणी जा", "पाणी येत", "पिशवी फुट", "paani ja", "pani ja", "paani nikal", "pani nikal", "water leaking", "leaking", "waters broke", "water broke", "bag burst", "thaili fat"]),
    convulsions: P(["झटके", "झटका", "दौरा", "दौरे", "मिर्गी", "आकडी", "फिट", "jhatke", "jhatka", "daura", "daure", "fits", "fit", "convulsion", "convulsions", "seizure", "aakdi"]),
    severe_headache: P(["सिरदर्द", "सिर दर्द", "सर दर्द", "सिर में दर्द", "सर में दर्द", "डोकेदुखी", "डोकं दुख", "डोके दुख", "sirdard", "sir dard", "sar dard", "sar mein dard", "headache", "head ache", "dokedukhi"]),
    blurred_vision: P(["धुंधला", "धुँधला", "धूसर", "धूसर दिस", "dhundhla", "dhundla", "blurred", "blurring", "blurry", "vision", "dikhai nahi", "धुरकट", "अंधुक"]),
    swelling_face_hands: P(["चेहरे पर सूजन", "चेहरे पे सूजन", "चेहरे में सूजन", "हाथों में सूजन", "हाथ में सूजन", "पूरे शरीर में सूजन", "शरीर पर सूजन", "पूरे बदन", "चेहऱ्यावर सूज", "हातांना सूज", "हातावर सूज", "अंगावर सूज", "chehre par sujan", "chehre pe sujan", "chehre pe soojan", "haath mein sujan", "face swelling", "swelling on face", "face swollen", "puffy face", "swelling of face", "swelling in hands", "hands swollen", "body swelling", "whole body swelling", "facial puffiness"]),
    swelling_feet: P(["पैरों में सूजन", "पैर में सूजन", "पैरों पर सूजन", "पायांना सूज", "पायावर सूज", "पाय सुज", "pairon mein sujan", "pairon me sujan", "pair mein sujan", "pairo me soojan", "feet swelling", "swelling in feet", "swollen feet", "leg swelling", "swelling of feet", "pedal"]),
    fever: P(["बुखार", "ताप", "बदन गरम", "अंग गरम", "bukhar", "bukhaar", "fever", "taap", "tap aahe"]),
    breathless: P(["breathing problem", "breathing difficulty", "difficulty in breathing", "साँस की तकलीफ", "साँस फूल", "सांस फूल", "साँस लेने में", "सांस लेने में", "दम लाग", "धाप लाग", "श्वास घ्यायला", "saans phool", "sans phool", "saans lene mein", "breathless", "breathlessness", "short of breath", "difficulty breathing", "dum lag"]),
    abdominal_pain: P(["पोटदुखी", "पेट में तेज़ दर्द", "पेट में तेज दर्द", "पेट में बहुत दर्द", "पेट दर्द", "पोटात दुख", "पोटदुखी", "पोटात खूप दुख", "pet mein dard", "pet me dard", "pet dard", "abdominal pain", "stomach pain", "tummy pain", "pain in abdomen", "pottat dukh"]),
    vomiting: P(["उल्टी", "उलटी", "ulti", "vomiting", "vomit", "omit", "उलट्या"]),
    dizziness: P(["चक्कर", "आँखों के आगे अंधेरा", "आंखों के आगे अंधेरा", "आँखों के सामने अंधेरा", "आंखों के सामने अंधेरा", "कमज़ोरी", "कमजोरी", "अशक्तपणा", "डोळ्यांसमोर अंधारी", "chakkar", "kamzori", "kamjori", "dizzy", "dizziness", "giddiness", "weakness"]),
    burning_urine: P(["पेशाब में जलन", "पेशाब करते समय जलन", "लघवीला जळजळ", "लघवी करताना जळ", "peshab mein jalan", "burning urine", "burning urination", "burning while urinating"]),
    foul_discharge: P(["वास येणारा", "वास येणारा स्राव", "vas yenara", "vaas yenara", "foul smell", "बदबू", "बदबूदार", "दुर्गंध", "वास येत", "badboo", "foul", "smelly discharge", "bad smell"]),
  },
  pnc: {},
  newborn: {
    convulsions: P(["झटके", "झटका", "दौरा", "दौरे", "आकडी", "फिट", "jhatke", "jhatka", "daura", "fits", "fit", "convulsion", "convulsions", "seizure", "aakdi"]),
    chest_indrawing: P(["chhati aat", "chati aat", "chhati andar", "छाती आत", "पसली चल", "पसलियां चल", "पसली धंस", "छाती अंदर", "छाती आत", "छाती आत ओढ", "pasli chal", "pasliyan chal", "pasli dhans", "chest indrawing", "chest in-drawing", "chest going in", "chest goes in", "chest pulling in", "chhati andar"]),
    lethargy: P(["सुस्त", "ढीला", "हिल नहीं रहा", "हिलता नहीं", "हलचल नहीं", "छूने पर ही", "शिथिल", "हालचाल करत नाही", "हलत नाही", "सुस्तावले", "sust", "dheela", "dhila", "lethargic", "limp", "floppy", "not moving", "moves only when", "only when touched", "hil nahi raha", "hilta nahi"]),
    jaundice_palms_soles: P(["हथेली पीली", "हथेलियां पीली", "तलवे पीले", "तलवे भी पीले", "पैर के तलवे", "तळवे पिवळे", "तळहात पिवळे", "hatheli peeli", "hatheliyan peeli", "talve peele", "palms yellow", "yellow palms", "soles yellow", "yellow soles", "palms and soles", "talve pivle"]),
    jaundice: P(["पीलिया", "पीला", "पीली", "पीले", "कावीळ", "पिवळ", "peeliya", "piliya", "peela", "peeli", "jaundice", "yellow", "kavil", "pivla"]),
    blood_stool: P(["शौचात रक्त", "शीमध्ये रक्त", "शी मध्ये रक्त", "संडासमध्ये रक्त", "पॉटी में खून", "potty mein khoon", "मल में खून", "टट्टी में खून", "पॉटी में खून", "शौच में खून", "संडास में रक्त", "शी मध्ये रक्त", "mal mein khoon", "tatti mein khoon", "potty mein khoon", "blood in stool", "blood in potty", "bloody stool"]),
    cord_pus: P(["नाभि से मवाद", "नाभि में मवाद", "नाभि से पानी", "नाभि लाल", "नाल से", "नाल में", "नाळेतून पू", "नाळ लाल", "नाळेला पू", "नाळेतून", "nabhi se mawad", "nabhi mein mawad", "naal se", "naal mein", "cord pus", "pus from cord", "cord red", "cord bleeding", "umbilical"]),
    skin_pustules: P(["फुंसी", "फुंसियां", "दाने", "पुटकुळ्या", "फोड", "funsi", "phunsi", "pustules", "boils", "pus spots", "skin spots"]),
    eye_discharge: P(["aankh se paani", "ankh se pani", "aankh se pani", "आंख से पानी", "डोळ्यांतून पाणी", "डोळ्यातून", "आँख से कीचड़", "आंख से कीचड़", "आँख से पानी", "आंख से मवाद", "डोळ्यातून पाणी", "डोळ्यातून पू", "aankh se keechad", "eye discharge", "sticky eyes", "pus from eyes", "eyes swollen"]),
    cold_to_touch: P(["ang thand", "thand", "cold", "ठंड", "थंड", "बदन ठंडा", "शरीर ठंडा", "ठंडा है", "ठंडा लग", "अंग थंड", "थंड लाग", "badan thanda", "thanda", "cold to touch", "feels cold", "body cold"]),
    hot_to_touch: P(["गरम", "garam", "hot", "बदन गरम", "शरीर गरम", "बुखार", "अंग गरम", "ताप", "badan garam", "bukhar", "fever", "hot to touch", "feels hot", "taap", "garam"]),
    weak_cry: P(["cry weak", "cry is weak", "rona weak", "रडणे कमी", "कमी रडत", "रडत नाही", "रोना कमज़ोर", "रोना कमजोर", "कम रो", "धीरे रो", "रडणे कमी", "कमी रडत", "rona kamzor", "weak cry", "cry is weak", "cries weakly"]),
    vomiting: P(["उल्टी", "उलटी", "ulti", "vomiting", "vomit", "उलट्या"]),
    diarrhoea: P(["दस्त", "जुलाब", "पतली टट्टी", "जुलाब होत", "dast", "loose motion", "loose motions", "diarrhoea", "diarrhea"]),
  },
};
SYMPTOMS.pnc = {
  heavy_bleeding: P(["बहुत खून", "ज़्यादा खून", "ज्यादा खून", "खूब खून", "खूप रक्तस्राव", "जास्त रक्तस्राव", "खूप रक्त", "bahut khoon", "zyada khoon", "jyada khoon", "heavy bleeding", "excessive bleeding", "lot of bleeding", "too much bleeding", "bleeding a lot"]),
  fever: SYMPTOMS.anc.fever,
  foul_discharge: SYMPTOMS.anc.foul_discharge,
  convulsions: SYMPTOMS.anc.convulsions,
  blurred_vision: SYMPTOMS.anc.blurred_vision,
  abnormal_speech: P(["उल्टा सीधा बोल", "उल्टा-सीधा", "बोलने में अटक", "अटक रही", "अडखळ", "बडबड", "बड़बड़", "ulta seedha bol", "atak ke bol", "अजीब बातें", "बहकी बातें", "अटपटा बोल", "बेतुका बोल", "विचित्र बोल", "असंबद्ध बोल", "ajeeb baatein", "behki baatein", "talking strangely", "abnormal speech", "speaking abnormally", "confused talk", "not talking properly"]),
  breathless: SYMPTOMS.anc.breathless,
  abdominal_pain: SYMPTOMS.anc.abdominal_pain,
  burning_urine: SYMPTOMS.anc.burning_urine,
  swelling_face_hands: SYMPTOMS.anc.swelling_face_hands,
  breast_problem: P(["स्तन", "स्तनाला सूज", "स्तनाला", "स्तनात", "breast problem", "breast", "स्तन में दर्द", "स्तन में गांठ", "दूध नहीं उतर", "छाती में दर्द", "स्तनात दुख", "स्तनात गाठ", "stan mein dard", "breast pain", "breast lump", "breast swelling", "cracked nipple", "nipple cracked", "engorged"]),
  dizziness: SYMPTOMS.anc.dizziness,
};

// Phrases whose meaning is fixed: [code, phrases, value]
const ABSENT = {
  newborn: [
    ["cord_pus", P(["नाभि सूखी", "नाभि साफ़", "नाभि साफ", "नाळ सुकली", "नाळ कोरडी", "नाळ स्वच्छ", "naal sookh", "naal sukh", "naal sukl", "naal sukal", "naal sukali", "naal suklee", "nabhi sookhi", "cord clean", "cord is clean", "cord dry", "cord is dry", "कोई मवाद नहीं", "मवाद नहीं", "पू नाही", "pus nahi", "no pus"]), false],
    ["weak_cry", P(["रोती ज़ोर", "रोती जोर", "रोता ज़ोर", "रोता जोर", "रोते ज़ोर", "ज़ोर से रोती", "ज़ोर से रोता", "जोरात रडतं", "जोरात रडते", "ज़ोर से रो", "जोर से रो", "रोता भी ज़ोर", "रोता भी जोर", "रोती भी ज़ोर", "जोरात रडत", "जोरात रडतं", "zor se ro", "jor se ro", "cries loudly", "crying loudly", "strong cry", "cries well", "crying well", "good cry"]), false],
    ["lethargy", P(["हातपाय हलवत", "हात पाय हलवत", "हाथ पैर चला", "हाथ-पैर चला", "haath pair chala", "active", "moving well", "moves well", "खूप हालचाल", "हालचाल चांगली"]), false],
    ["eye_discharge", P(["डोळे स्वच्छ", "आँखें साफ़", "आँखें साफ", "आंखें साफ", "eyes clean", "eyes are clean"]), false],
  ],
  anc: [],
  pnc: [
    ["heavy_bleeding", P(["खून नॉर्मल", "नॉर्मल खून", "bleeding normal", "bleeding is normal", "bleeding kam", "bleeding is less", "रक्तस्राव कमी", "रक्तस्राव नॉर्मल", "थोडा रक्तस्राव", "रक्तस्त्राव कमी", "khoon normal", "bleeding theek"]), false],
    ["breast_problem", P(["स्तन ठीक", "स्तन नॉर्मल", "breasts are fine", "breasts fine", "breast is fine", "breasts normal", "breast fine", "स्तनात काही त्रास नाही", "स्तन में कोई दिक्कत नहीं"]), false],
    ["abnormal_speech", P(["बोलणं नीट नाही", "बोलणे नीट नाही", "ठीक से बोल नहीं", "ठीक से नहीं बोल", "theek se bol nahi", "not talking properly", "not speaking properly"]), true],
  ],
};

const ANCHOR = {
  bp: P(["bp", "बीपी", "बी पी", "blood pressure", "ब्लड प्रेशर", "ब्लडप्रेशर", "रक्तदाब", "pressure", "प्रेशर"]),
  hb: P(["खून", "khoon", "hb", "एचबी", "hemoglobin", "haemoglobin", "हीमोग्लोबिन", "हिमोग्लोबिन", "हिमोग्लोबीन", "हीमोग्लोबीन", "hemoglobin", "हिमोग्लोबीन", "खून की मात्रा"]),
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
const SEP_BP = KS(["by", "/", "बटा", "बाय", "over", "पर", "on", "ऑन", "बटे", "upon"]);
const WEEKS = KS(["hafte", "hafta", "hafton", "हफ्ते", "हफ़्ते", "हफ्ता", "हफ़्ता", "सप्ताह", "आठवडे", "आठवड्यांची", "आठवड्यांचा", "आठवडे.", "weeks", "week", "wks", "आठवड्याची", "आठवड्यांची"]);
const MONTH = KS(["mahina", "mahine", "mahinay", "महीना", "महीने", "महिना", "महिने", "month", "months", "महिन्याची", "महिन्यांची", "महिन्याचा", "मास"]);
const DAY = KS(["din", "दिन", "दिवस", "दिवसांचे", "दिवसाचे", "दिवसांचा", "दिवसांची", "दिवशी", "day", "days", "दिनों", "दिवसांनी"]);
const TABLET = KS(["goli", "goliyan", "goliyaan", "गोली", "गोलियां", "गोलियाँ", "गोळ्या", "गोळी", "tablet", "tablets", "टैबलेट", "टॅबलेट", "टेबलेट"]);
const PLUS = KS(["plus", "+", "प्लस", "प्लस."]);
const MINUTE = KS(["minute", "min", "मिनट", "मिनिट", "मिनिटाला", "मिनट"]);

// Ordinals: "teesra din", "सातवें दिन", "सातवा महिना"
const ORD = {
  "pehla": 1, "pahla": 1, "पहला": 1, "पहले": 1, "पहिला": 1, "पहिल्या": 1, "first": 1, "dusra": 2, "doosra": 2, "दूसरा": 2, "दूसरे": 2, "दुसरा": 2, "दुसऱ्या": 2, "second": 2,
  "teesra": 3, "tisra": 3, "तीसरा": 3, "तीसरे": 3, "तिसरा": 3, "तिसऱ्या": 3, "third": 3, "chautha": 4, "चौथा": 4, "चौथे": 4, "चौथ्या": 4, "fourth": 4,
  "paanchva": 5, "पांचवां": 5, "पाँचवाँ": 5, "पाँचवें": 5, "पांचवें": 5, "पाचवा": 5, "पाचव्या": 5, "fifth": 5, "chhatha": 6, "छठा": 6, "छठे": 6, "सहावा": 6, "सहाव्या": 6, "sixth": 6,
  "saatva": 7, "satva": 7, "सातवां": 7, "सातवाँ": 7, "सातवें": 7, "सातवा": 7, "सातव्या": 7, "seventh": 7, "aathva": 8, "आठवां": 8, "आठवाँ": 8, "आठवें": 8, "आठवा": 8, "आठव्या": 8, "eighth": 8,
  "pahila": 1, "pahilya": 1, "dusrya": 2, "tisrya": 3, "chauthya": 4, "chautha": 4, "pachva": 5, "pachvya": 5, "sahava": 6, "sahavya": 6, "satvya": 7, "athva": 8, "athvya": 8, "nava": 9, "navvya": 9, "navva": 9, "dahava": 10, "dahavya": 10, "dasva": 10, "chhatha": 6,
  "nauva": 9, "नौवां": 9, "नौवाँ": 9, "नौवें": 9, "नववा": 9, "नवव्या": 9, "ninth": 9, "दसवां": 10, "दहावा": 10, "tenth": 10,
};

const ORD_SUFFIX = ["\u0935\u093e\u0902", "\u0935\u0947\u0902", "\u0935\u0940\u0902", "\u0935\u093e", "\u0935\u0947", "\u0935\u0940", "\u0935\u094d\u092f\u093e", "va", "vaan", "van", "vein", "ve", "vi", "th", "st", "nd", "rd"];
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
const FILLER = KS(["hi", "ही", "toh", "तो", "bas", "बस", "aaj", "आज", "bhi", "भी", "pan", "पण", "bahut", "बहुत", "खूप", "khup", "thoda", "थोड़ा", "थोडा", "हल्की", "हल्का", "halki", "halka", "zyada", "ज़्यादा", "ज्यादा", "very", "really", "too", "so", "तेज़", "तेज", "tez", "jor", "जोरात", "is", "are", "a", "the", "से", "se", "में", "me", "mein", "पे", "pe", "पर", "ki", "की", "का", "ka", "थोड़ी", "kaafi", "काफी", "जरा", "zara"]);
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
  return false;
}
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
const C = { "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m", "य": "y", "र": "r", "ल": "l", "ळ": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h" };
const NUKTA = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
/** Devanagari to plain Roman letters, so any reader can follow (sunita, pasli chal rahi hai). */
export function romanize(s) {
  const chars = [...String(s || "")];
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
    if (ch === "़" || ch === "्") continue;
    if (word.length) flush();
    out.push(ch === "।" ? "." : ch);
  }
  if (word.length) flush();
  return out.join("");
}

const NOT_NAMES = KS(["doodh", "dudh", "wajan", "vajan", "wazan", "pasli", "saans", "sans", "shwas", "bukhar", "taap", "tapman", "temperature", "naal", "nabhi", "aaj", "kal", "abhi", "bacha", "baccha", "bachha", "bilkul", "thoda", "bahut", "khoon", "sar", "sir", "pet", "pair", "chehra", "albumin", "hemoglobin", "breathing", "weight", "cord", "eyes", "aankh", "umm", "um", "uh", "hmm", "haan", "han", "achha", "accha", "okay", "ok", "arre", "अं", "हम्म", "है", "हैं", "था", "थी", "थे", "हुए", "हुई", "हुआ", "आहे", "होते", "झाले", "आली", "आला", "hai", "hain", "tha", "thi", "hue", "hua", "ahe", "aahe", "ला", "ने", "को", "से", "में", "पर", "plus", "प्लस", "plas", "बाद", "baad", "uska", "uski", "unka", "उसका", "उसकी", "इनका", "तिला", "त्याला", "heavy", "water", "seventh", "sixth", "eighth", "ninth", "fifth", "hemoglobin", "baaki", "बाकी", "sab", "सब", "सब नॉर्मल", "normal", "नॉर्मल", "बच्चा", "बच्चे", "बच्ची", "बच्चों", "बेटा", "बेटी", "बेटे", "बाळ", "बाळा", "बाळाचं", "बाळाचे", "बाळाची", "बाळाचा", "बाळाला", "बेबी", "मुलगा", "मुलगी", "आँखों", "आंखों", "पानी", "वजन", "वज़न", "तापमान", "टेम्परेचर", "माँ", "मां", "आई", "सास", "पति", "नवरा", "नाभि", "नाळ", "नाल", "बदन", "शरीर", "दूध", "पेट", "सिर", "पैर", "पैरों", "हाथ", "चेहरे", "हीमोग्लोबिन", "बीपी", "साँस", "सांस", "श्वास", "पॉटी", "मल", "शौच", "उल्टी", "दीदी", "ताई", "हो", "हाँ", "हां", "अरे", "अच्छा", "डिलीवरी", "प्रसूती", "भाभी", "बहू", "सून", "बहन", "दवाई", "गोली", "मैडम", "baby", "bachcha", "bachche", "bacche", "beta", "beti", "bal", "bala", "balacha", "balachi", "mother", "mummy", "maa", "aai", "bebi", "ho", "arre", "are", "okay", "so", "delivery", "pregnancy", "pregnant", "temperature", "weight", "fever", "bleeding", "yesterday", "tomorrow", "morning", "evening", "breathing", "feeding", "child", "kid", "girl", "boy", "beta", "beti", "bhabhi", "aunty", "anc", "pnc", "visit", "checkup", "check", "please", "note", "write", "record", "first", "second", "third", "day", "week", "month", "blood", "urine", "albumin", "iron", "hemoglobin", "haemoglobin", "swelling", "headache", "pain", "jaundice", "cord", "skin", "eyes", "she's", "it's", "there", "they", "we", "i", "my", "our", "your", "his", "doctor", "anm", "asha", "nurse", "village", "baby", "bachcha", "bachha", "aaj", "today", "didi", "ji", "haan", "han", "ha", "accha", "achha", "matlab", "the", "she", "her", "mother", "mummy", "maa", "bp", "hb", "and", "aur", "visit", "pregnant", "patient", "woman", "lady", "bai", "tai", "ka", "ki", "ke", "ko", "is", "has", "ok", "okay", "sir", "madam", "hello", "namaste", "now", "baby's", "new", "this", "here", "so", "yes", "no", "दीदी", "आज", "हाँ", "हां", "अच्छा", "मतलब", "जी", "ताई", "बाई", "ये", "यह", "इनका", "इसका", "हे", "ही", "आता", "मग", "तर", "बाळ", "बच्चा", "बच्चे", "माँ", "मां", "आई", "नमस्ते", "नमस्कार", "मैडम", "ठीक", "तो", "ओके", "हा", "नंतर", "पेशंट", "गर्भवती", "गरोदर", "महिला"]);
const POSS = KS(["wala", "wali", "vala", "vali", "वाला", "वाली", "वाले", "ka", "ki", "ke", "ko", "chi", "che", "cha", "chya", "chi", "का", "की", "के", "को", "ची", "चे", "चा", "च्या", "चं", "s", "ji", "जी", "tai", "ताई", "bai", "बाई", "बेन", "devi", "देवी", "ला", "ला.", "ना", "ने", "ne"]);
const BABY_WORDS = KS(["लड़का", "लड़की", "लडका", "लडकी", "ladka", "ladki", "larka", "larki", "baccha", "baby", "bachcha", "bachha", "bacha", "bachche", "bacche", "बच्चा", "बच्चे", "बच्ची", "बेटा", "बेटी", "बेटे", "बाळ", "बाळाचं", "बेबी", "beta", "beti", "bal", "balacha", "मुलगा", "मुलगी", "son", "daughter", "newborn"]);
const NAME_CUE = KS(["naam", "नाम", "नाव", "name", "named", "called", "mrs", "smt", "श्रीमती", "mother"]);
function nameCase(w) { const r = /[ऀ-ॿ]/.test(w) ? romanize(w) : w; return r ? r[0].toUpperCase() + r.slice(1).toLowerCase() : null; }

function isLexicon(lo) {
  if (UNIT_KG.has(lo) || UNIT_G.has(lo) || UNIT_F.has(lo) || UNIT_C.has(lo) || TABLET.has(lo) || MINUTE.has(lo) || PLUS.has(lo)) return true;
  if (unitWord(lo) != null || DAY.has(lo) || WEEKS.has(lo) || MONTH.has(lo) || NEG.has(lo) || JOIN.has(lo) || ORD[lo] != null) return true;
  for (const list of Object.values(ANCHOR)) if (list.some((sq) => sq.length === 1 && sq[0] === lo)) return true;
  return false;
}
const LEXSTART = /^(दिवस|दिन|महीन|महिन|आठवड|हफ|बाळ|बच्च|बाळंत|प्रसूत|डिलीव|डिलिव|delivery|तापमान|टेम्प|हीमो|हिमो|वजन|वज़न|अल्ब्य|एल्ब)/;
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
    // "Sunita ka baby", "सुनीता का बच्चा", "Rukhsana's baby"
    if (POSS.has(tok[i + 1]?.lo) && okName(w)) {
      const babyNext = BABY_WORDS.has(tok[i + 2]?.lo) || BABY_WORDS.has(tok[i + 3]?.lo);
      const proper = /^[A-Z\u0900-\u097f]/.test(w);
      if (proper) cands.push({ i, score: babyNext ? 6 : 3 });
    }
    // Roman Marathi "Rekhache baal", "Sarikachya"
    const rmp = w.match(/^([A-Z][a-z]{2,}?)(che|chi|cha|chya|chan|chaa)$/);
    if (rmp && okName(rmp[1])) cands.push({ i, score: BABY_WORDS.has(tok[i + 1]?.lo) || /^(baal|bal|baby)/.test(tok[i + 1]?.lo || "") ? 6 : 3, stem: rmp[1] });
    // Marathi "सुरेखाचं बाळ", "प्रतिभाचं"
    const m = w.match(MR_POSS);
    if (m && okName(m[1]) && okName(w)) cands.push({ i, score: BABY_WORDS.has(tok[i + 1]?.lo) ? 6 : 3, stem: m[1] });
    // "पूनम, 34 हफ्ते" / "Archana, 30 hafte" / "सुनीता सातवें महीने"
    const nxt = tok[i + 1]?.t === "," ? i + 2 : i + 1;
    if (okName(w) && /^[A-Z\u0900-\u097f]/.test(w) && tok[nxt] && (readNumber(tok, nxt) || ORD[tok[nxt].lo] != null || ordinalOf(tok[nxt].lo) != null)) {
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

/**
 * Read a visit from one utterance.
 * Returns { type, record, evidence } where evidence maps each field (and each
 * symptom as "symptoms.code") to { start, end } in the original text.
 */
export function understand(text, hint) {
  const raw = String(text || "");
  text = raw;
  const tok = tokenize(raw);
  // When the ASHA has picked the visit, trust her; otherwise guess from the words.
  const type = hint || detectType(raw) || "newborn";
  const nums = allNumbers(tok);
  const rec = { type };
  let nameScore = 0;
  const ev = {};
  const set = (k, v, sp) => { rec[k] = v; ev[k] = sp; };

  const name = findName(tok);
  if (name) { set("name", name.value, name.at); nameScore = name.score; }

  // Blood pressure: "BP 150 by 100", "बीपी एक सौ पचास बटा सौ", or a bare "150/100"
  if (type === "anc" || type === "pnc") {
    const pairs = [];
    for (let k = 0; k < nums.length - 1; k++) {
      const a = nums[k], b = nums[k + 1];
      const between = tok.slice(a.i1, b.i0).map((x) => x.lo);
      if (between.length <= 2 && between.some((w) => SEP_BP.has(w)) && a.value >= 70 && a.value <= 260 && b.value >= 40 && b.value <= 170) pairs.push({ a, b });
    }
    const anchors = findAll(tok, ANCHOR.bp);
    let pick = null;
    if (anchors.length) {
      // later mentions correct earlier ones ("140 by 90, nahi nahi, 150 by 100")
      pick = LAST(pairs) || null;
      // "upar 150 neeche 100" / "ऊपर वाला 150 नीचे वाला 100"
      if (!pick) {
        const up = tok.findIndex((x) => ["upar", "ऊपर", "उपर", "वरचा", "systolic"].includes(x.lo));
        const dn = tok.findIndex((x) => ["neeche", "niche", "नीचे", "निचे", "खालचा", "diastolic"].includes(x.lo));
        if (up >= 0 && dn > up) {
          const s = nums.find((n) => n.i0 > up && n.i0 < dn), d = nums.find((n) => n.i0 > dn);
          if (s && d) pick = { a: s, b: d };
        }
      }
    }
    if (!pick && pairs.length) pick = LAST(pairs);
    if (pick) { set("bp_sys", Math.round(pick.a.value), span(tok, pick.a.i0, pick.a.i1)); set("bp_dia", Math.round(pick.b.value), span(tok, pick.b.i0, pick.b.i1)); }
  }

  // Haemoglobin
  if (type === "anc" || type === "pnc") {
    let hb = null;
    const UNITISH = (lo) => lo != null && (WEEKS.has(lo) || MONTH.has(lo) || DAY.has(lo) || UNIT_KG.has(lo) || UNIT_G.has(lo) || TABLET.has(lo) || ["by", "/", "बटा", "बाय"].includes(lo) || /^(हफ|आठवड|haft|week|महीन|महिन|mahin|गोळ|गोल|tablet|kilo|किलो)/.test(lo));
    for (const an of findAll(tok, ANCHOR.hb)) {
      const after = nums.filter((n) => n.i0 >= an.i1 && n.i0 - an.i1 <= 12 && n.value >= 3 && n.value <= 18 && !UNITISH(tok[n.i1]?.lo) && !tok.slice(an.i1, n.i0).some((x) => x.t === "\u0964" || (x.t === "." && n.i0 - an.i1 > 6)));
      const n = after.length ? LAST(after) : numberNear(tok, nums, an, { ahead: 5, behind: 3 });
      if (n && n.value >= 3 && n.value <= 18) hb = n;
    }
    if (hb) set("hb", round1(hb.value), span(tok, hb.i0, hb.i1));
  }

  // Weight: newborn in grams, mother in kilos. "1 किलो 700 ग्राम", "1.6 kilo", "1700 gram", "डेढ़ किलो"
  {
    let best = null;
    const anchors = findAll(tok, ANCHOR.weight);
    const tryAt = (n) => {
      let j = n.i1, grams = null;
      const unit = tok[j]?.lo;
      if (UNIT_KG.has(unit)) {
        grams = n.value * 1000; j++;
        const m = readNumber(tok, j);
        if (m && m.value < 1000 && (UNIT_G.has(tok[m.i1]?.lo) || !tok[m.i1] || BREAK.has(tok[m.i1].t) || ["है", "hai", "आहे", "ahe", "aaya", "आया", "आलं"].includes(tok[m.i1].lo))) { grams += m.value; j = m.i1 + (UNIT_G.has(tok[m.i1]?.lo) ? 1 : 0); }
      } else if (UNIT_G.has(unit)) { grams = n.value; j++; }
      else grams = n.value < 10 ? n.value * 1000 : n.value >= 400 ? n.value : null;
      return grams != null ? { grams, i0: n.i0, i1: j } : null;
    };
    for (const an of anchors) {
      const n = numberNear(tok, nums, an, { ahead: 5, behind: 4 });
      if (n) { const w = tryAt(n); if (w) best = w; }
    }
    // any later "N kilo ..." replaces it (corrections, "janam pe 2 kilo tha, aaj 1 kilo 750")
    for (const n of nums) { const u = tok[n.i1]?.lo; if ((UNIT_KG.has(u) || (UNIT_G.has(u) && n.value >= 400)) && (!best || n.i0 >= best.i1)) { const w = tryAt(n); if (w) best = w; } }
    if (best) {
      if (type === "newborn" && best.grams >= 400 && best.grams <= 6000) set("weight_g", Math.round(best.grams), span(tok, best.i0, best.i1));
      if (type === "anc" && best.grams >= 25000 && best.grams <= 150000) set("weight_kg", round1(best.grams / 1000), span(tok, best.i0, best.i1));
    }
  }

  // Temperature: °F if the value is above 45 or a Fahrenheit word follows
  if (type === "newborn" || type === "pnc") {
    let t = null;
    for (const an of findAll(tok, ANCHOR.temp)) { const n = numberNear(tok, nums, an, { ahead: 4, behind: 3 }); if (n && ((n.value >= 30 && n.value <= 45) || (n.value >= 86 && n.value <= 110))) t = n; }
    if (!t) t = nums.find((n) => (UNIT_F.has(tok[n.i1]?.lo) || UNIT_C.has(tok[n.i1]?.lo) || tok[n.i1]?.t === "°")) || null;
    if (t) {
      let i1 = t.i1; let unitF = t.value > 45;
      for (let k = t.i1; k < Math.min(t.i1 + 3, tok.length); k++) { if (UNIT_F.has(tok[k].lo)) { unitF = true; i1 = k + 1; } if (UNIT_C.has(tok[k].lo)) { unitF = false; i1 = k + 1; } if (tok[k].t === "°" || ["degree", "डिग्री", "डिग्री."].includes(tok[k].lo)) i1 = k + 1; }
      const c = unitF ? (t.value - 32) * 5 / 9 : t.value;
      if (c >= 30 && c <= 43) set("temp_c", round1(c), span(tok, t.i0, i1));
    }
  }

  // Breaths per minute
  if (type === "newborn") {
    let r = null;
    for (const an of findAll(tok, ANCHOR.resp)) {
      const inSentence = nums.filter((n) => n.i0 >= an.i1 && n.i0 - an.i1 <= 14 && !tok.slice(an.i1, n.i0).some((x) => x.t === "\u0964" || x.t === "." || x.t === "?"));
      const claimed = (n) => [ANCHOR.temp, ANCHOR.weight, ANCHOR.hb, ANCHOR.bp].some((list) => findAll(tok, list).some((h) => n.i0 >= h.i1 && n.i0 - h.i1 <= 2)) || UNIT_KG.has(tok[n.i1]?.lo) || UNIT_G.has(tok[n.i1]?.lo) || tok[n.i1]?.t === "\u00b0" || ["degree", "डिग्री"].includes(tok[n.i1]?.lo);
      const ok = inSentence.filter((n) => n.value >= 15 && n.value <= 120 && !claimed(n));
      if (ok.length) r = LAST(ok); else { const n = numberNear(tok, nums, an, { ahead: 6, behind: 4 }); if (n && n.value >= 15 && n.value <= 120) r = n; }
    }
    if (!r) { const n = nums.find((x) => MINUTE.has(tok[x.i1]?.lo) || (["per", "प्रति", "पर"].includes(tok[x.i1]?.lo) && MINUTE.has(tok[x.i1 + 1]?.lo))); if (n && n.value >= 15 && n.value <= 120 && findAll(tok, ANCHOR.resp).length) r = n; }
    if (r) set("resp_rate", Math.round(r.value), span(tok, r.i0, r.i1));
  }

  // Day of life / days since delivery: "7 din ka", "सात दिन का", "तीसरा दिन", "day 7"
  if (type === "newborn" || type === "pnc") {
    let d = null;
    const isDay = (lo) => lo != null && (DAY.has(lo) || /^(\u0926\u093f\u0935\u0938|\u0926\u093f\u0928)/.test(lo) || /^(din|divas|diwas|days?)$/.test(lo));
    for (const n of nums) if (isDay(tok[n.i1]?.lo) && n.value <= 60 && !(tok[n.i1]?.lo === "days" && ["after", "ago", "since", "from", "पहले", "बाद"].includes(tok[n.i1 + 1]?.lo))) d = { v: n.value, i0: n.i0, i1: n.i1 + 1 };
    for (let i = 0; i < tok.length; i++) {
      const o = ordinalOf(tok[i].lo);
      if (o && isDay(tok[i + 1]?.lo)) d = d || { v: o, i0: i, i1: i + 2 };
      if (tok[i].lo === "day") { const n = readNumber(tok, i + 1); if (n && n.value >= 0 && n.value <= 60) d = d || { v: n.value, i0: i, i1: n.i1 }; else { const o2 = ordinalOf(tok[i + 1]?.lo); if (o2) d = d || { v: o2, i0: i, i1: i + 2 }; } }
      // "7th day", "ikkisva din" handled above; "day one visit" too
    }
    if (d) set("day", Math.round(d.v), span(tok, d.i0, d.i1));
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
      if (n && n.value >= 1 && n.value <= 4 && (PLUS.has(tok[n.i1]?.lo) || n.i0 > an.i0)) set("albumin", String(Math.round(n.value)), span(tok, an.i0, Math.max(n.i1 + (PLUS.has(tok[n.i1]?.lo) ? 1 : 0), an.i1)));
      else if (win.some((x) => ["trace", "ट्रेस"].includes(x.lo))) set("albumin", "trace", span(tok, an.i0, an.i1));
      else if (win.some((x) => NEG.has(x.lo) || ["nil", "negative", "नेगेटिव", "निगेटिव"].includes(x.lo))) set("albumin", "nil", span(tok, an.i0, an.i1));
    }
  }

  // Iron tablets
  if (type === "anc") {
    for (const n of nums) {
      const near = tok.slice(Math.max(0, n.i0 - 3), n.i1 + 4).map((x) => x.lo);
      if (near.some((w) => TABLET.has(w) || /^(गोळ|गोल|tablet|goli)/.test(w)) && near.some((w) => /^(iron|ifa|आयरन|आइरन|लोह|folic|फोलिक|आयर्न)/.test(w)) && n.value >= 1 && n.value <= 400) set("ifa_tablets", Math.round(n.value), span(tok, n.i0, n.i1));
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
  const GOOD = KS(["vyavasthit", "badhiya", "बढ़िया", "पूरा", "poora", "pura", "खूब", "khoob", "भरपूर", "अच्छा", "अच्छे", "अच्छी", "ठीक", "नीट", "छान", "चांगलं", "चांगला", "चांगली", "व्यवस्थित", "बरोबर", "changla", "chhan", "neet", "theek", "thik", "achha", "accha", "achhe", "acha", "okay", "ok", "fine", "good", "well", "properly", "normal", "normally", "नॉर्मल", "sahi"]);
  const STOP = KS(["बंद", "band", "stopped", "stop", "no", "none"]);
  if (type === "newborn") {
    const FEED = KS(["दूध", "doodh", "dudh", "doodh.", "feeding", "feed", "feeds", "breastfeeding", "breastfeed", "स्तनपान", "suck", "sucking", "पीता", "पी", "पितं", "पीत", "पित", "pitay", "pita", "pee", "pi"]);
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
      else if (w.some((x) => GOOD.has(x)) || w.some((x) => ["पी", "पीता", "पितं", "पीत", "pitay", "pee", "पी.", "feeding", "पिते", "पितंय", "पितोय", "pita", "pitoy", "pitey"].includes(x))) v = "good";
      if (v) pick = { v, i0: a, i1: b + 1 };
    }
    if (pick) set("feeding", pick.v, span(tok, pick.i0, pick.i1));
  }
  if (type === "anc") {
    const MOVE = /^(हिल|हलचल|हालचाल|हलत|हलतं|हलते|hil|halchal|movement|movements|moving|moves|kick|kicks|kicking|फड़क|halat|haltay)/;
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
  const wrongSubject = (hit) => {
    const { w } = clauseWords(hit.i0);
    if (type === "pnc") return w.some((x) => BABYW.has(x)) && !w.some((x) => MOTHER.has(x));
    if (type === "newborn") return w.some((x) => MOTHER.has(x)) && !w.some((x) => BABYW.has(x));
    return false;
  };
  const record = (code, hit, value) => {
    if (taken.some((s) => hit.i0 < s.i1 && s.i0 < hit.i1)) return;
    if (wrongSubject(hit)) return;
    sym[code] = value;
    sev["symptoms." + code] = span(tok, hit.i0, hit.i1);
    taken.push(hit);
  };
  // phrases that themselves mean "absent" or "present", whatever the negation words
  for (const [code, list, value] of (ABSENT[type] || [])) for (const hit of findAll(tok, list)) record(code, hit, value);
  const codes = Object.keys(table).sort((a, b) => specificity(b) - specificity(a));
  for (const code of codes) {
    for (const hit of findAll(tok, table[code])) {
      if (code === "lethargy" && ev.feeding && overlaps(ev.feeding, span(tok, hit.i0, hit.i1))) continue;
      // "पिवळे फोड" are pustules, not jaundice
      if (code === "jaundice" && tok.slice(hit.i1, hit.i1 + 2).some((x) => /^(फोड|दाने|फुंस|pustule|boil|spot|पुटकुळ)/.test(x.lo))) continue;
      record(code, hit, !negated(tok, hit));
    }
  }
  // A bare "दर्द"/"pain" in pregnancy, when nothing more specific took it
  if (type === "anc") {
    for (const hit of findAll(tok, P(["दर्द", "dard", "pain", "दुखत"]))) {
      const { w } = clauseWords(hit.i0);
      if (w.some((x) => /^(सिर|सर|sir|sar|head|डोक|स्तन|breast|पीठ|kamar|कमर|back|leg|पैर|पाय)/.test(x))) continue;
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
      ["weak_cry", /^(रोना|रोता|रोती|रडणं|रडणे|रडत|रडतं|cry|cries|crying|rona|rota|roti|radna|radta)/, /^(कमजोर|कमज़ोर|कम|कमी|धीरे|weak|kamzor|kam|kami|feeble|low)$/],
      ["cord_pus", /^(नाभि|नाभी|नाळ|नाल|naal|nabhi|cord|umbilic)/, /^(मवाद|पू|पीप|pus|mawad|लाली|लाल|लालसर|red|redness|bleed)/],
    ],
    anc: [
      ["abdominal_pain", /^(पेट|पोट|pet|pot|stomach|abdomen|tummy|belly)/, /^(दर्द|दुख|dard|dukh|pain|ache)/],
    ],
    pnc: [
      ["abnormal_speech", /^(बोल|bol|speech|speak|talk)/, /^(बदल|अजीब|अटक|अडखळ|विचित्र|strange|abnormal|slurr|ulta|उल्टा|badal)/],
      ["abdominal_pain", /^(पेट|पोट|pet|pot|stomach|abdomen|tummy|belly)/, /^(दर्द|दुख|dard|dukh|pain|ache)/],
      ["foul_discharge", /^(वास|बदबू|smell|badbu|दुर्गंध|odour|odor|vas|vaas|badboo)$/, /^(स्राव|पाणी|पानी|discharge|srav|paani|pani|white)/],
    ],
  };
  for (const [code, A, B] of COOC[type] || []) {
    if (sym[code] !== undefined) continue;
    for (let i = 0; i < tok.length; i++) {
      if (!A.test(tok[i].lo)) continue;
      const { a, b } = clauseWords(i);
      for (let j = a; j <= b; j++) {
        if (j === i || !B.test(tok[j].lo)) continue;
        const hit = { i0: Math.min(i, j), i1: Math.max(i, j) + 1 };
        const neg = negated(tok, hit) || tok.slice(a, b + 1).some((x) => NEG.has(x.lo));
        if (!wrongSubject(hit)) { sym[code] = !neg; sev["symptoms." + code] = span(tok, hit.i0, hit.i1); }
        break;
      }
      if (sym[code] !== undefined) break;
    }
  }
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
  if (Object.keys(sym).length) { rec.symptoms = sym; Object.assign(ev, sev); }
  return { type, record: rec, evidence: ev, tokens: tok.length, nameScore };
}

function specificity(code) {
  const order = { severe_headache: 4, jaundice_palms_soles: 5, swelling_face_hands: 5, swelling_feet: 5, heavy_bleeding: 4, chest_indrawing: 4, blood_stool: 4, cord_pus: 4, eye_discharge: 4, abnormal_speech: 4, burning_urine: 4, weak_cry: 4, breast_problem: 4, leaking_fluid: 3, lethargy: 3, cold_to_touch: 3, abdominal_pain: 3, dizziness: 3, blurred_vision: 3 };
  return order[code] || 1;
}
const overlaps = (a, b) => a && b && a.start < b.end && b.start < a.end;

/** Merge a new utterance into the visit so far. Later values replace earlier ones. */
export function merge(prev, next) {
  if (!prev) return next;
  const record = { ...prev.record, ...next.record, type: next.record.type || prev.record.type };
  if (prev.record.symptoms || next.record.symptoms) record.symptoms = { ...(prev.record.symptoms || {}), ...(next.record.symptoms || {}) };
  return { type: record.type, record, evidence: { ...prev.evidence, ...next.evidence } };
}
