// A sample village so the nurse's board has a day's work on first start.
// Every person here is made up and marked as a sample. Their visits were made
// the same way a real one is: a spoken sentence, read by the same extractor,
// checked by the same rules.
import { understand } from "../public/js/understand.js";
import { checkRecord, RULESET } from "../public/js/rules.js";

const DAY = 24 * 3600 * 1000, HOUR = 3600 * 1000;

const PEOPLE = [
  // babies: [name, kind, days old, at risk]
  ["Sunita", "baby", 7, true], ["Rekha", "baby", 3, false], ["Pooja", "baby", 14, false], ["Shabnam", "baby", 10, true],
  ["Kavita", "baby", 28, false], ["Anita", "baby", 1, false],
  // pregnant women: [name, kind, weeks]
  ["Meena", "pregnant", 32], ["Saroj", "pregnant", 35], ["Rajni", "pregnant", 34], ["Kiran", "pregnant", 24], ["Laxmi", "pregnant", 38], ["Farida", "pregnant", 16],
  // mothers after delivery: [name, kind, days since delivery]
  ["Sudha", "mother", 5], ["Reeta", "mother", 3], ["Madhavi", "mother", 7],
];

// [name, kind, hours ago, language, what the ASHA said]
const VISITS = [
  ["Sunita", "baby", 4 * 24 + 3, "hi", "सुनीता का बच्चा तीसरे दिन का है, वजन एक किलो नौ सौ ग्राम, दूध ठीक पी रहा है, बुखार नहीं है।"],
  ["Pooja", "baby", 7 * 24 + 2, "hi", "पूजा का बच्चा सात दिन का है, वजन दो किलो सात सौ ग्राम, दूध अच्छे से पी रहा है, नाभि सूखी है।"],
  ["Shabnam", "baby", 3 * 24 + 5, "hi", "शबनम का बच्चा सात दिन का, वजन दो किलो दो सौ, नाभि से मवाद आ रहा है, दूध ठीक पी रहा है।"],
  ["Shabnam", "baby", 26, "mr", "शबनमचं बाळ नऊ दिवसांचं, वजन दोन किलो तीनशे ग्रॅम, नाळ कोरडी आहे, दूध नीट पितं."],
  ["Kavita", "baby", 7 * 24, "en", "Kavita's baby, day 21, weight 3.1 kg, feeding well, no fever, cord is clean."],
  ["Meena", "pregnant", 25 * 24, "hi", "मीना 28 हफ्ते, बीपी 130 बटा 84, हीमोग्लोबिन दस पॉइंट पाँच, बच्चा ठीक हिल रहा है।"],
  ["Saroj", "pregnant", 46, "hi", "सरोज, 35 हफ्ते, बीपी डेढ़ सौ बाय एक सौ पाँच, एल्बुमिन दो प्लस, चेहरे पर सूजन है।"],
  ["Rajni", "pregnant", 3 * 24 + 4, "hi", "रजनी, आठवाँ महीना, हीमोग्लोबिन साढ़े छह है, साँस फूलती है।"],
  ["Kiran", "pregnant", 6 * 24, "mr", "किरण, 24 आठवडे, बीपी एकशे दहा बाय सत्तर, हिमोग्लोबिन अकरा, हालचाल चांगली आहे."],
  ["Laxmi", "pregnant", 20, "hi", "लक्ष्मी 38 हफ्ते, कल से बच्चा कम हिल रहा है, बीपी 120 बटा 80।"],
  ["Sudha", "mother", 3, "hi", "सुधा, डिलीवरी को पाँच दिन हुए, दिन में छह पैड बदल रही है, चक्कर आते हैं।"],
  ["Reeta", "mother", 30, "hi", "रीता, तीसरा दिन, बुखार नहीं, दिन में तीन पैड, स्तन में कोई दिक्कत नहीं।"],
  ["Madhavi", "mother", 5, "mr", "माधवी, सातवा दिवस, ताप आहे, बाकी काही त्रास नाही."],
];

const TYPE = { baby: "newborn", pregnant: "anc", mother: "pnc" };

export function seedVillage(now) {
  const people = PEOPLE.map(([name, kind, n, atRisk], i) => {
    const p = { id: "s" + (i + 1), kind, name, sample: true, addedAt: now - 30 * DAY };
    if (kind === "baby") { p.dob = now - n * DAY - 2 * HOUR; p.atRisk = !!atRisk; }
    if (kind === "pregnant") p.lmp = now - n * 7 * DAY;
    if (kind === "mother") p.deliveredAt = now - n * DAY - 3 * HOUR;
    return p;
  });
  const visits = VISITS.map(([name, kind, hoursAgo, lang, said], i) => {
    const person = people.find((p) => p.name === name && p.kind === kind);
    const type = TYPE[kind];
    const { record } = understand(said, type);
    const flags = checkRecord(record).map(({ code, severity, urgent, title, why, action, source }) => ({ code, severity, urgent: !!urgent, title, why, action, source }));
    const refer = flags.some((f) => f.severity === "refer_now");
    const urgent = flags.some((f) => f.severity === "refer_now" && f.urgent);
    const at = now - hoursAgo * HOUR;
    return {
      id: "v" + (i + 1), sample: true, at, type, personId: person.id, name, record, flags, ruleset: RULESET.id, said: [said], lang, via: "voice", asha: "Sample ASHA",
      referral: refer ? (hoursAgo > 40 ? { status: "seen", at, urgent, seenAt: at + 5 * HOUR, seenBy: "Nurse" } : { status: "open", at, urgent }) : null,
    };
  }).sort((a, b) => a.at - b.at);
  // a few referral outcomes, so the board shows the whole loop: reached, and a refusal to follow up
  const OUTCOME = { Saroj: ["refused", 8], Shabnam: ["reached", 6] };
  for (const [name, [outcome, hoursAfter]] of Object.entries(OUTCOME)) {
    const v = visits.find((x) => x.name === name && x.referral);
    if (v) Object.assign(v.referral, { outcome, outcomeAt: v.at + hoursAfter * HOUR, outcomeBy: "Sample ASHA", changedAt: v.at + hoursAfter * HOUR });
  }
  return { village: { name: "Sample village", block: "Pune district", sample: true, asha: "Sample ASHA", anmPhone: "" }, people, visits, seedAt: now };
}
