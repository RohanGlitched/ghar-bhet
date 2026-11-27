// The ASHA's visit. She speaks; the reader fills the record; the rules check it;
// the phone says the danger out loud and asks for what is missing, and she
// answers by voice; "save karo" (confirmed with "haan") saves it to the register.
// Everything on screen is English or Roman letters; what the phone says is in
// her language.
import * as U from "./understand.js";
import * as R from "./rules.js";
import { dictate, speak, hush, micMeter, support, LANGS, micState, micOpenTone, micCloseTone, tickTone, echoTone, said as spokenNow } from "./voice.js";
import { mountChrome, store, esc, api, glossaryHTML, referHTML, sessionId } from "./ui.js";
import { reason, bigLine, groupAlerts } from "./ask.js";

const { understand, romanize } = U;
const { checkRecord } = R;
mountChrome("/visit");
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
// timings can be shortened by the test harness
// Android Chrome ends a continuous session after each phrase (and beeps on every restart):
// there the mic opens for one answer at a time, after each spoken question
const ANDROID = /Android/i.test(navigator.userAgent) && /Chrome\//.test(navigator.userAgent);
const REC_MODE = ANDROID || new URLSearchParams(location.search).get("recmode") === "single" ? "single" : "continuous";
const T = Object.assign({ first: 8000, pause: 4000, quiet: 30000, answerFirst: 8000, step: 650, count: 60000, tick: 15000, typed: 1500, hold: 120000, afterSave: 8000 }, window.__GB_TIMING || {});

let TYPE = ["newborn", "anc", "pnc"].includes(params.get("type")) ? params.get("type") : store.get("gb-type") || "newborn";
let LANG = ["hi", "mr", "en"].includes(params.get("lang")) ? params.get("lang") : store.get("gb-lang") || "hi";
let utter = [];          // [{ text, via, prefix, set, offset }]
let record = { type: TYPE };
let evidence = {};       // field -> { u, start, end }
let flags = [];
let doubts = {};         // key -> { field, heard, say_en, ... }
let unread = [];         // body-related words the reader could not place: [{ u, text }]
let spoken = new Set();  // alert codes already said out loud
let asked = new Map();   // question key -> times spoken
let skipped = new Set(), notChecked = new Set();
let asking = null;       // the question the phone is waiting on: { key, field, ... }
let followUp = null;     // "which one?" after a yes to the danger list
let retries = 0;
let pending = null;      // { kind: "save" | "clear" | "correct", ... } waiting for haan / nahi
let banner = null;       // { kind, ... } a one-line notice with an action
let lastCleared = null;  // the visit cleared by "naya", for "wapas"
let saved = null;        // the saved visit, or { queued: true }
let saving = false;
let playing = false;     // an example is being replayed
let session = null, stopMeter = null, lastFilled = new Set(), lastError = null;
let personId = params.get("person") || null, personLabel = null;
let offerSave = false, switchedNow = false, toldTapToAnswer = false;
let count = null;        // the timed breath count: { key, t0, timer, lastTick, done }
let hold = null;         // "ruko": the mic waits up to 2 minutes, then asks again
let stopAsking = false, lastBas = 0; // a second "bas" stops the questions for this visit
let shownRefer = new Set(); // refer codes already brought into view
let lastEchoSay = 0, lastNotAsked = [];

/* ---------- words the phone says, in her language ---------- */
const L = (o) => (o && (o[LANG] || o.en)) || "";
const LINES = {
  reprompt: { en: "Didn't catch that, say it again.", hi: "समझ नहीं आया, फिर से बताइए।", mr: "समजलं नाही, पुन्हा सांगा." },
  which: { en: "Which one?", hi: "कौन सा?", mr: "कोणतं?" },
  number: { en: "Tell me the number.", hi: "कितना है, बताइए।", mr: "किती आहे, सांगा." },
  confirmSave: { en: "Save? Say yes or no.", hi: "सेव करूँ? हाँ या नहीं बोलिए।", mr: "जतन करू? हो किंवा नाही सांगा." },
  noName: { en: "The name is missing. Say the name, or say yes to save without it.", hi: "नाम नहीं बताया। नाम बताइए, या बिना नाम के सेव करने के लिए हाँ बोलिए।", mr: "नाव सांगितलं नाही. नाव सांगा, किंवा नावाशिवाय जतन करायला हो म्हणा." },
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
  tapToAnswer: { en: "Tap the mic to answer.", hi: "जवाब के लिए माइक दबाइए।", mr: "उत्तरासाठी माइक दाबा." },
  blocked: { en: "The microphone is blocked. Tap your keyboard's mic and speak, or type.", hi: "माइक बंद है। कीबोर्ड का माइक दबाकर बोलिए, या टाइप कीजिए।", mr: "माइक बंद आहे. कीबोर्डचा माइक दाबून बोला, किंवा टाइप करा." },
  unsupported: { en: "This browser can't listen. Tap your keyboard's mic and speak, or type.", hi: "यह ब्राउज़र सुन नहीं सकता। कीबोर्ड का माइक दबाकर बोलिए, या टाइप कीजिए।", mr: "हा ब्राउझर ऐकू शकत नाही. कीबोर्डचा माइक दाबून बोला, किंवा टाइप करा." },
  offline: { en: "No internet. Tap your keyboard's mic and speak.", hi: "इंटरनेट नहीं है। कीबोर्ड का माइक दबाकर बोलिए।", mr: "इंटरनेट नाही. कीबोर्डचा माइक दाबून बोला." },
  noMic: { en: "No microphone found. Tap your keyboard's mic and speak, or type.", hi: "माइक नहीं मिला। कीबोर्ड का माइक दबाकर बोलिए, या टाइप कीजिए।", mr: "माइक सापडला नाही. कीबोर्डचा माइक दाबून बोला, किंवा टाइप करा." },
  skipped: { en: "Skipped.", hi: "छोड़ दिया।", mr: "सोडलं." },
  notChecked: { en: "Marked not checked.", hi: "नहीं देखा, लिख लिया।", mr: "तपासलं नाही, लिहून घेतलं." },
  langNot: { en: "This browser can't listen in this language. Choose Hindi or English, or type below.", hi: "यह ब्राउज़र इस भाषा में नहीं सुन सकता। हिंदी या इंग्लिश चुनिए, या नीचे टाइप कीजिए।", mr: "हा ब्राउझर या भाषेत ऐकू शकत नाही. हिंदी किंवा इंग्लिश निवडा, किंवा खाली टाइप करा." },
  helpQ: { en: "Say the answer. Or say: skip, not checked, wait, or say again.", hi: "जवाब बोलिए। या बोलिए: 'छोड़ो', 'पता नहीं', 'रुको', या 'फिर से बोलो'।", mr: "उत्तर सांगा. किंवा म्हणा: 'सोडा', 'माहीत नाही', 'थांबा', किंवा 'पुन्हा सांगा'." },
  helpVisit: { en: "Say the visit. Then say save, read back, or bas to stop the mic.", hi: "विज़िट बोलिए। फिर 'सेव करो', 'पढ़ के सुनाओ', या माइक बंद करने के लिए 'बस' बोलिए।", mr: "भेट सांगा. मग 'जतन करा', 'वाचून दाखवा', किंवा माइक बंद करायला 'बस' म्हणा." },
  backToQ: { en: "OK, back to the questions.", hi: "ठीक है, बाकी सवाल पूछती हूँ।", mr: "ठीक आहे, बाकी प्रश्न विचारते." },
  yesNo: { en: "Please say yes or no.", hi: "हाँ या नहीं बोलिए।", mr: "हो किंवा नाही सांगा." },
  badName: { en: "That name doesn't look right. Say her name again.", hi: "यह नाम ठीक नहीं लगा। नाम फिर से बताइए।", mr: "हे नाव बरोबर वाटत नाही. नाव पुन्हा सांगा." },
  timeUp: { en: "Time up. How many breaths?", hi: "समय पूरा। कितनी साँसें?", mr: "वेळ संपली. किती श्वास?" },
  micOff: { en: "OK, mic off.", hi: "ठीक है, माइक बंद।", mr: "ठीक आहे, माइक बंद." },
  stopAsking: { en: "OK, no more questions for this visit.", hi: "ठीक है, इस विज़िट में अब और नहीं पूछूँगी।", mr: "ठीक आहे, या भेटीत आता आणखी विचारणार नाही." },
  waiting: { en: "OK, I'll wait. Tell me when you are ready.", hi: "ठीक है, मैं रुकती हूँ। तैयार हों तो बताइए।", mr: "ठीक आहे, मी थांबते. तयार झालात की सांगा." },
  nextVisit: { en: "Say new for the next visit.", hi: "अगली विज़िट के लिए 'नया' बोलिए।", mr: "पुढच्या भेटीसाठी 'नवीन' म्हणा." },
  newVisit: { en: "New visit. Go ahead.", hi: "नई विज़िट। बोलिए।", mr: "नवीन भेट. बोला." },
  ok: { en: "OK?", hi: "ठीक?", mr: "बरोबर?" },
  also: { en: "Also: ", hi: "साथ में: ", mr: "सोबत: " },
  noRecent: { en: "Say the field too, for example temperature 37.", hi: "किसका नंबर है, वह भी बोलिए, जैसे तापमान 37।", mr: "कशाचा आकडा आहे तेही सांगा, जसं तापमान 37." },
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
// a one-line spoken tip the first time the mic opens (it can be turned off)
const GUIDE = {
  newborn: { en: "Say the mother's name, the baby's age, weight, temperature and any danger sign.", hi: "माँ का नाम, बच्चे की उम्र, वज़न, तापमान, और कोई ख़तरे का लक्षण बोलिए।", mr: "आईचं नाव, बाळाचं वय, वजन, तापमान, आणि कोणतंही धोक्याचं लक्षण सांगा." },
  anc: { en: "Say her name, how many weeks, BP, Hb and any danger sign.", hi: "नाम, कितने हफ्ते, बीपी, हीमोग्लोबिन, और कोई ख़तरे का लक्षण बोलिए।", mr: "नाव, किती आठवडे, बीपी, हिमोग्लोबिन, आणि कोणतंही धोक्याचं लक्षण सांगा." },
  pnc: { en: "Say her name, days since delivery, pads a day, temperature and any danger sign.", hi: "नाम, डिलीवरी को कितने दिन, दिन में कितने पैड, तापमान, और कोई ख़तरे का लक्षण बोलिए।", mr: "नाव, प्रसूतीला किती दिवस, दिवसाला किती पॅड, तापमान, आणि कोणतंही धोक्याचं लक्षण सांगा." },
};
/* the screen's own words follow the language she picks: Roman letters only */
const UI = {
  en: { who: "Who you visited", lang: "Language", newborn: "Newborn", anc: "Pregnant", pnc: "After birth", tap: "Tap to speak", tapStop: "Tap to stop", said: "What you said", save: "Save visit", saveCmd: "save", read: "Read the record aloud", readCmd: "read back", fresh: "New visit", freshCmd: "new visit", hearQ: "Hear the question", answer: "Answer", skip: "Skip", skipCmd: "skip", unchecked: "Not checked", uncheckedCmd: "not checked", wait: "wait", hearAgain: "Hear it again", yesSave: "Yes, save", no: "No", missing: "Missing", of: "of", check: "Check this", howTo: "How to speak", typeBox: "Type instead of speaking", saved: "Saved", saving: "Saving…",
    idle: "Tap the mic and say the visit, the way you would tell the nurse.", listening: (l) => `Listening in ${l}. Say the visit; say "bas" when you are done.`, answering: "Listening for your answer…", paused: "The phone is speaking. The mic waits…", closed: "Mic off. Tap the mic to add more, or tap Save visit.", savedClosed: "Mic off. Tap the mic to start the next visit.", answerClosed: "Mic off. Tap Answer or the mic to reply.", nothing: "Didn't hear anything. Tap the mic and try again.", counting: "Counting. The mic stays on; say the number when the minute is up.", holding: "Waiting. The mic stays on; say the answer when you are ready.",
    nextVisitLine: 'Saved. Say "new" for the next visit.',
    titles: { newborn: "Newborn visit", anc: "Pregnancy visit", pnc: "Mother after birth" } },
  hi: { who: "Kiske ghar gaye", lang: "Bhasha", newborn: "Navjaat", anc: "Garbhavati", pnc: "Prasav ke baad", tap: "Mic dabaiye", tapStop: "Rokne ke liye dabaiye", said: "Aapne kya kaha", save: "Visit save karo", saveCmd: "save karo", read: "Padh ke sunao", readCmd: "padh ke sunao", fresh: "Nayi visit", freshCmd: "naya", hearQ: "Sawaal suno", answer: "Jawab do", skip: "Chhodo", skipCmd: "chhodo", unchecked: "Pata nahi", uncheckedCmd: "pata nahi", wait: "ruko", hearAgain: "Phir se suno", yesSave: "Haan, save karo", no: "Nahi", missing: "Baaki", of: "mein se", check: "Yeh dekhiye", howTo: "Kaise bolein", typeBox: "Bolne ki jagah type kijiye", saved: "Save ho gaya", saving: "Save ho raha hai…",
    idle: "Mic dabaiye aur visit boliye, jaise nurse ko batati hain.", listening: () => `Sun rahi hoon. Visit boliye; ho jaye to "bas" boliye.`, answering: "Jawab sun rahi hoon…", paused: "Phone bol raha hai. Mic ruka hai…", closed: "Mic band. Aur bolne ke liye mic dabaiye, ya Visit save karo dabaiye.", savedClosed: "Mic band. Agli visit ke liye mic dabaiye.", answerClosed: "Mic band. Jawab ke liye Jawab do ya mic dabaiye.", nothing: "Kuch sunai nahi diya. Mic dabakar phir se boliye.", counting: "Gin rahi hain. Mic chalu hai; minute pura hone par number boliye.", holding: "Ruki hoon. Mic chalu hai; tayyar hon to jawab boliye.",
    nextVisitLine: 'Save ho gaya. Agli visit ke liye "naya" boliye.',
    titles: { newborn: "Navjaat ki visit", anc: "Garbhavati ki visit", pnc: "Prasav ke baad maa" } },
  mr: { who: "Konakade gelat", lang: "Bhasha", newborn: "Navjaat bal", anc: "Garodar", pnc: "Prasutinantar", tap: "Mic daba", tapStop: "Thambavnyasathi daba", said: "Tumhi kay sangitla", save: "Bhet jatan kara", saveCmd: "jatan kara", read: "Vachun dakhva", readCmd: "vachun dakhva", fresh: "Navin bhet", freshCmd: "navin", hearQ: "Prashna aika", answer: "Uttar dya", skip: "Soda", skipCmd: "soda", unchecked: "Mahit nahi", uncheckedCmd: "mahit nahi", wait: "thamba", hearAgain: "Punha aika", yesSave: "Ho, jatan kara", no: "Nahi", missing: "Baki", of: "paiki", check: "He tapasa", howTo: "Kasa bolaycha", typeBox: "Bolnyaaivaji type kara", saved: "Jatan zali", saving: "Jatan hot aahe…",
    idle: "Mic daba ani bhet sanga, jasa nurse la sangta.", listening: () => `Aikte aahe. Bhet sanga; zala ki "bas" mhana.`, answering: "Uttar aikte aahe…", paused: "Phone bolto aahe. Mic thambla aahe…", closed: "Mic band. Aankhi bolayla mic daba, kiva Bhet jatan kara daba.", savedClosed: "Mic band. Pudhchya bhetisathi mic daba.", answerClosed: "Mic band. Uttarasathi Uttar dya kiva mic daba.", nothing: "Kahi aiku aala nahi. Mic dabun punha bola.", counting: "Mojat aahat. Mic chalu aahe; minit sampla ki aakda sanga.", holding: "Thambli aahe. Mic chalu aahe; tayar zalat ki uttar sanga.",
    nextVisitLine: 'Jatan zali. Pudhchya bhetisathi "navin" mhana.',
    titles: { newborn: "Navjaat balachi bhet", anc: "Garodar bhet", pnc: "Prasutinantar aai" } },
};
const t = (k) => (UI[LANG] && UI[LANG][k] !== undefined ? UI[LANG][k] : UI.en[k]);
const LANG_SET = { hi: "ठीक है, अब हिंदी में।", mr: "ठीक आहे, आता मराठीत.", en: "OK, English now." };

/* ---------- spoken commands ----------
   The phrase is normalised (no punctuation, no nukta, one kind of nasal mark),
   polite fillers are stripped from both ends ("theek hai", "ji", "kar dijiye",
   "karna hai", "please"), and then the command must be the whole phrase, or
   end a short phrase. Commands are checked before anything else, so a command
   word never becomes a field value or a name. */
const norm = (t) => String(t || "").normalize("NFD").replace(/़/g, "").replace(/ँ/g, "ं").normalize("NFC").toLowerCase()
  .replace(/[.,!?।;:"'()]/g, " ").replace(/\s+/g, " ").trim();
const FILL_START = /^(theek hai|thik hai|ठीक है|ठीक आहे|ok|okay|ji|jee|जी|accha|achha|अच्छा|हां तो|haan to|बरं|bara|please|अब|ab|aata|आता|to|तो)\s+/;
const FILL_END = /\s+(please|ji|जी|na|ना|kar dijiye|kar dijie|kar dijiyega|kar do|karo|karna hai|karna|kijiye|kijie|कर दीजिए|कर दीजिये|कर दो|करो|करना है|करना|कीजिए|कीजिये|करा|कर|करून टाका|kara|kar|de|दे|द्या|dya|hai|है|aahe|आहे)$/;
function strip(k) {
  let prev;
  do { prev = k; k = k.replace(FILL_START, "").replace(FILL_END, ""); } while (k !== prev && k);
  return k;
}
const W = (s) => new RegExp(`^(?:${s})$`);
const CORE = {
  save: W("save|save it|save the visit|sev|seva|सेव|सेव्ह|जतन|jatan|visit save|विजिट सेव|सेव विजिट|सेव द विजिट"),
  stop: W("bas|बस|bas itna|बस इतना|bas itna hi|बस इतना ही|bas ho gaya|बस हो गया|that's all|thats all|stop|stop listening|done|ho gaya|हो गया|झालं|jhala|zala|संपलं|स्टॉप|डन"),
  read: W("padh ke sunao|padhke sunao|padh kar sunao|padhkar sunao|पढ के सुनाओ|पढकर सुनाओ|पढ के सुनाइए|पढकर सुनाइए|पढ के सुनाइये|वाचून दाखवा|वाचून दाखव|vachun dakhva|vaachun daakhva|read back|read it back|read the record|read it out|sunao|सुनाओ|सुनाइए|फिर से सुनाओ|रीड बैक|रीड बॅक"),
  fresh: W("new visit|naya|nayi visit|naya visit|नया|नई विजिट|नया विजिट|नवीन|नवीन भेट|naveen|navin|next visit|अगली विजिट"),
  undo: W("undo|वापस|wapas|vapas|वापस लाओ|परत|parat|परत आणा|पूर्ववत"),
  repeat: W("phir se bolo|phir se boliye|phir se puchho|phir se puchhiye|phir se pucho|phir se|kya poocha|kya pucha|dobara|dobara bolo|dobara boliye|kya bola|kya kaha|punha sanga|punha bola|kay vicharla|kay mhanala|repeat|say again|again|फिर से बोलो|फिर से बोलिए|फिर से पूछो|फिर से पूछिए|फिर से|क्या पूछा|दोबारा|दोबारा बोलो|दोबारा बोलिए|क्या बोला|क्या कहा|पुन्हा सांगा|पुन्हा बोला|काय विचारलं|काय विचारले|काय म्हणाला"),
  help: W("madad|मदद|madat|मदत|kya bolun|kya bolu|क्या बोलूं|क्या बोलू|kay bolu|काय बोलू|help|help me"),
  wait: W("ruko|ruk jao|ruko zara|zara ruko|thoda ruko|ek minute|ek min|ek second|ek sec|wait|wait a minute|one minute|just a minute|hold on|रुको|रुकिए|रुक जाओ|जरा रुको|थोडा रुको|एक मिनट|एक सेकंड|थांबा|थांब|एक मिनिट|thamba|thamb|वेट|थोडं थांबा|थोडा थांबा"),
  skip: W("chhodo|chodo|chhod do|chod do|छोडो|छोड दो|छोडिए|छोड दीजिए|छोड|rehne do|rahne do|रहने दो|रहने दीजिए|baad mein|baad me|बाद में|aage|आगे|skip|next|agla|अगला|पुढे|pudhe|सोडा|soda|सोड|सोडून द्या|राहू दे|राहू द्या|rahu de|rahu dya|नंतर|nantar|later|skip it|स्किप|स्किप करो|नेक्स्ट"),
  unchecked: W("pata nahi|pata nahin|nahi pata|nahin pata|पता नहीं|पता नही|नहीं पता|नही पता|maloom nahi|malum nahi|मालूम नहीं|नहीं मालूम|माहीत नाही|माहित नाही|नाही माहीत|mahit nahi|mahiti nahi|not checked|didn't check|did not check|nahi dekha|नहीं देखा|देखा नहीं|नहीं जांचा|जांचा नहीं|तपासलं नाही|तपासले नाही|नाही तपासलं|tapasla nahi|don't know|dont know|i don't know"),
  yes: W("haan|han|haa|ha|haanji|haan ji|ji haan|ji|jee|हां|हा|हां जी|जी|जी हां|हो|होय|हो ना|ho|hoy|yes|yeah|yep|yes please|ok|okay|ok ji|okay ji|ओके|ओके जी|ठीक|ठीक है|theek|theek hai|thik hai|हां हां|haan haan|बरोबर|barobar|sahi|सही|सही है|हां सही है|हो बरोबर"),
  no: W("nahi|nahin|nai|na|nahi ji|nahi hai|nahin hai|नहीं|नही|नहीं जी|नहीं है|ना|नाही|नाही आहे|नाय|no|nope|nothing|none|kuch nahi|kuchh nahi|कुछ नहीं|कुछ भी नहीं|koi nahi|कोई नहीं|kahi nahi|काही नाही|kahich nahi|काहीच नाही|कोणतंही नाही|nahi nahi|नहीं नहीं|नाही नाही|एकही नाही|cancel|कैंसल|कॅन्सल|रद्द|रद्द करो|रद्द करा|radd karo"),
};
const TYPE_CMD = {
  anc: W("(?:pregnancy|garbhavati|garbhvati|garbhwati|गर्भवती|गरोदर|anc)(?: visit| विजिट| भेट| wali visit)?"),
  newborn: W("(?:naya janma|नया जन्म|newborn|new born|नवजात|नवजात शिशु|navjaat|navjat|नवजात बाळ)(?: visit| विजिट| भेट)?"),
  pnc: W("(?:delivery ke baad|डिलीवरी के बाद|डिलिवरी के बाद|प्रसूतीनंतर|prasuti nantar|prasutinantar|after birth|after delivery|mother after birth|pnc)(?: visit| विजिट| भेट)?"),
};
const LANG_CMD = [["mr", W("(?:marathi|मराठी)(?: mein| में| madhe| मध्ये| me| bolo| बोलो)?")], ["hi", W("(?:hindi|हिंदी|हिन्दी)(?: mein| में| madhe| मध्ये| me| bolo| बोलो)?")], ["en", W("(?:english|इंग्लिश|अंग्रेजी)(?: mein| में| madhe| मध्ये| me| bolo| बोलो)?")]];
/** Which command a phrase is, if any. Short phrases may carry extra words before the command ("sab theek hai, save kar dijiye"). */
function command(text) {
  const k0 = norm(text), k = strip(k0);
  const is = (name) => CORE[name].test(k) || CORE[name].test(k0);
  for (const name of ["save", "unchecked", "skip", "read", "stop", "fresh", "undo", "wait", "repeat", "help"]) {
    if (is(name)) return name;
    const words = k.split(" ");
    if (words.length <= 4 && ["save", "skip", "unchecked", "read"].includes(name)) {
      for (let i = 1; i < words.length; i++) if (CORE[name].test(words.slice(i).join(" "))) return name;
    }
  }
  if (is("yes") || (!k && /^(ji|jee|जी|ok|okay|theek hai|thik hai|ठीक है)$/.test(k0))) return "yes";
  if (is("no")) return "no";
  for (const [t, re] of Object.entries(TYPE_CMD)) if (re.test(k)) return "type:" + t;
  for (const [l, re] of LANG_CMD) if (re.test(k)) return "lang:" + l;
  return null;
}
// a corrected value said on its own: "nahi nahi, 37.8"
const CORRECTION = /^(nahi nahi|nahin nahin|नहीं नहीं|नही नही|नाही नाही|no no|sorry|सॉरी|maaf|galat|गलत|galti|चूक|chuk|चुकलं|chukla|wrong|not that|i mean)(?=\s|,|$)/i;
// words that say which field a number belongs to
const FIELD_WORD = /(wajan|vajan|vazan|weight|gram|kilo|\bkg\b|temp|taap|tap|bukhar|fever|degree|\bbp\b|saans|shwas|breath|\bhb\b|haemo|hemo|\bpad|\bdin\b|divas|\bday|hafte|week|mahin|month|वज|ग्राम|किलो|ताप|बुखार|डिग्री|बीपी|साँस|सांस|श्वास|हीमो|हिमो|पैड|पॅड|दिन|दिवस|हफ्त|आठवड|महिन|महीन)/i;
// a name with brackets, '=', digits or more than 3 words is not a name
const NAME_BAD = (v) => /[<>="'`{}\\/]|\d/.test(String(v)) || String(v).trim().split(/\s+/).length > 3;
const NAME_BLOCK = /^(chhodo|chodo|chhod|chod|soda|sod|bas|haan|han|nahi|nahin|nahi|save|sev|jatan|naya|navin|wapas|vapas|parat|aage|pudhe|skip|hoy|ho|ji|ok|theek|thik|rahne|rehne|rahu|baad|nantar|pata|mahit|sorry|galat|chuk)$/i;

/* ---------- icons (simple, so the screen reads without words) ---------- */
const ic = (body, w = 24) => `<svg class="ic" width="${w}" height="${w}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const CAL = `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>`;
const SCALE = `<path d="M5 20.5h14l-1.6-11H6.6z"/><circle cx="12" cy="6" r="2.4"/><path d="M12 13.5l2-2"/>`;
const THERMO = `<path d="M10 4.5a2 2 0 0 1 4 0v9.3a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>`;
const ICON = {
  name: ic(`<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>`),
  day: ic(CAL), weeks: ic(CAL), weight_g: ic(SCALE), weight_kg: ic(SCALE), temp_c: ic(THERMO), temp_f: ic(THERMO),
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
  skip: ic(`<path d="M5 12h12M13 7l5 5-5 5"/>`, 20),
  mic: ic(`<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>`, 20),
  undo: ic(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`, 20),
  question: ic(`<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2.2-2.5 3.6M12 16.8h.01"/>`, 20),
  timer: ic(`<circle cx="12" cy="13" r="7.5"/><path d="M12 13V9M10 3h4"/>`, 20),
};

/* ---------- the record's fields, per visit ---------- */
const FEED = { good: "well", poor: "less", none: "not feeding" };
const FIELD = {
  name: ["Name", (r) => r.name],
  day: ["Days since birth", (r) => r.day != null ? `${r.day} day${r.day === 1 ? "" : "s"}` : null],
  weight_g: ["Weight", (r) => r.weight_g != null ? `${r.weight_g} g` : null],
  weight_kg: ["Weight", (r) => r.weight_kg != null ? `${r.weight_kg} kg` : null],
  temp_c: ["Temperature", (r) => r.temp_c != null ? `${r.temp_c} °C${r.temp_f != null ? ` (${r.temp_f} °F)` : ""}` : r.temp_f != null ? `${r.temp_f} °F` : null],
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
// a Romanised caption under key labels when she works in Hindi or Marathi
const CAP = {
  hi: { name: "Naam", nbname: "Maa ka naam", day: "Din", nbday: "Bachche ki umar", weight_g: "Wajan", weight_kg: "Wajan", temp_c: "Taapmaan", resp_rate: "Saans / minute", feeding: "Doodh peena", weeks: "Hafte / mahina", bp_sys: "BP", hb: "Khoon (Hb)", albumin: "Peshab mein albumin", fetal_movement: "Pet mein bachcha hilna", pads: "Pad / din" },
  mr: { name: "Naav", nbname: "Aaiche naav", day: "Divas", nbday: "Balache vay", weight_g: "Vajan", weight_kg: "Vajan", temp_c: "Taapmaan", resp_rate: "Shwas / minit", feeding: "Doodh pine", weeks: "Aathavde / mahina", bp_sys: "BP", hb: "Rakt (Hb)", albumin: "Laghvit albumin", fetal_movement: "Potatil balachi halchal", pads: "Pad / divas" },
};
const caption = (k) => { const c = CAP[LANG]; if (!c) return ""; return (TYPE === "newborn" && k === "name" ? c.nbname : TYPE === "newborn" && k === "day" ? c.nbday : c[k]) || ""; };
const TILES = {
  newborn: [["name", "Mother's name"], ["day", "Baby's age"], ["weight_g"], ["temp_c"], ["resp_rate"], ["feeding"]],
  anc: [["name"], ["weeks"], ["bp_sys"], ["hb"], ["albumin"], ["fetal_movement"]],
  pnc: [["name"], ["day"], ["pads"], ["temp_c"], ["bp_sys"], ["hb"]],
};
const EXTRA = { anc: ["weight_kg", "ifa_tablets", "temp_c"], newborn: [], pnc: ["weight_kg"] };
const SKIP_GENERIC = new Set(["type", "symptoms", "bp_dia", "month", "name", "temp_f"]);
const pretty = (k) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
/** Every tile for this visit: the fixed ones, then anything else the record holds. */
function tileList(r = record, type = TYPE) {
  const out = TILES[type].map(([k, lab]) => [k, lab || FIELD[k][0], FIELD[k][1]]);
  const have = new Set(out.map(([k]) => k));
  for (const k of EXTRA[type] || []) if ((r[k] != null || (k === "temp_c" && r.temp_f != null)) && !have.has(k)) { out.push([k, FIELD[k][0], FIELD[k][1]]); have.add(k); }
  for (const [k, v] of Object.entries(r)) {
    if (have.has(k) || SKIP_GENERIC.has(k) || v == null || v === "" || typeof v === "object") continue;
    const f = FIELD[k];
    const lab = f ? f[0] : (typeof R.fieldLabel === "function" ? R.fieldLabel(k) : pretty(k));
    out.push([k, lab.replace(/^./, (c) => c.toUpperCase()), f ? f[1] : (x) => (x[k] === true ? "yes" : x[k] === false ? "no" : String(x[k]))]);
    have.add(k);
  }
  return out;
}
const TITLES = { newborn: "Newborn visit", anc: "Pregnancy visit", pnc: "Mother after birth" };
const SYM_LABEL = {
  bleeding: "bleeding", leaking_fluid: "water leaking", convulsions: "fits", severe_headache: "severe headache", blurred_vision: "blurred vision", swelling_face_hands: "swollen face or hands",
  swelling_feet: "swollen feet", fever: "fever", breathless: "breathless", abdominal_pain: "stomach pain", vomiting: "vomiting", dizziness: "giddiness (dizziness)", burning_urine: "burning urine", foul_discharge: "foul discharge",
  heavy_bleeding: "heavy bleeding", abnormal_speech: "strange speech", breast_problem: "breast problem", chest_indrawing: "chest indrawing", lethargy: "moves only when touched", jaundice: "jaundice",
  jaundice_palms_soles: "yellow palms or soles", blood_stool: "blood in stool", cord_pus: "cord infection", skin_pustules: "skin pustules", eye_discharge: "eye discharge", cold_to_touch: "cold to touch",
  hot_to_touch: "hot to touch", weak_cry: "weak cry", diarrhoea: "loose motions", difficulty_breathing: "difficulty breathing",
};
const symLabel = (k) => { let s = null; try { s = typeof R.symptomLabel === "function" ? R.symptomLabel(TYPE, k) : null; } catch {} return SYM_LABEL[k] || (s ? s.charAt(0).toLowerCase() + s.slice(1) : k.replace(/_/g, " ")); };
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
const symSay = (k) => LANG === "en" ? symLabel(k) : (SYM_SAY[k]?.[LANG === "hi" ? 0 : 1] || symLabel(k));
// which field a flag points at, so the tile turns red or amber
const FLAG_FIELD = {
  anc_imminent_eclampsia: "bp_sys", anc_preeclampsia: "bp_sys", anc_hypertension: "bp_sys", anc_severe_anaemia: "hb", anc_moderate_anaemia: "hb", anc_mild_anaemia: "hb", anc_fetal_movement: "fetal_movement",
  nb_very_low_weight: "weight_g", nb_low_weight: "weight_g", nb_fever: "temp_c", nb_hypothermia: "temp_c", nb_fast_breathing: "resp_rate", nb_not_feeding: "feeding", nb_poor_feeding: "feeding",
  pnc_heavy_bleeding: "pads", pnc_high_fever: "temp_c", pnc_fever: "temp_c", anc_high_fever: "temp_c", anc_fever: "temp_c",
};
const flagField = (code) => FLAG_FIELD[code] || (/hypertension|eclampsia|_bp/.test(code) ? "bp_sys" : /anaemia|_hb/.test(code) ? "hb" : /weight/.test(code) ? (TYPE === "newborn" ? "weight_g" : "weight_kg") : /fever|hypothermia|temp/.test(code) ? "temp_c" : null);
const isUrgent = (f) => f.severity === "refer_now" && f.urgent === true;

/* ---------- what the phone asks for when something is missing ---------- */
// [field, anchor word put in front of a short answer, question, symptoms (for the danger list), alternative fields, yes/no?, timed seconds]
const NAME_Q = {
  newborn: { en: "What is the mother's name?", hi: "माँ का नाम क्या है?", mr: "आईचं नाव काय?" },
  anc: { en: "What is her name?", hi: "उनका नाम क्या है?", mr: "त्यांचं नाव काय?" },
  pnc: { en: "What is her name?", hi: "उनका नाम क्या है?", mr: "त्यांचं नाव काय?" },
};
const ASK = {
  newborn: [
    ["name", "", NAME_Q.newborn],
    ["weight_g", "वजन", { en: "What is the baby's weight?", hi: "बच्चे का वज़न कितना है?", mr: "बाळाचं वजन किती आहे?" }],
    ["temp_c", "तापमान", { en: "What is the baby's temperature?", hi: "बच्चे का तापमान कितना है?", mr: "बाळाचं तापमान किती आहे?" }, null, ["temp_c", "temp_f"]],
    ["resp_rate", "साँस", { en: "Count the baby's breaths for one minute. I will tell you when the minute is up.", hi: "एक मिनट बच्चे की साँसें गिनिए। मिनट पूरा होने पर मैं बताऊँगी।", mr: "एक मिनिट बाळाचे श्वास मोजा. मिनिट संपल्यावर मी सांगेन." }, null, null, false, 60],
    ["feeding", "", { en: "Is the baby feeding well?", hi: "क्या बच्चा दूध ठीक से पी रहा है?", mr: "बाळ दूध नीट पितं का?" }, null, null, true],
    ["danger", "", { en: "Any fits, chest indrawing, or yellow palms?", hi: "कोई झटके, पसली चलना, या हथेली पीली?", mr: "झटके, छाती आत ओढणे, किंवा तळवे पिवळे?" }, ["convulsions", "chest_indrawing", "jaundice_palms_soles", "lethargy"], null, true],
  ],
  anc: [
    ["name", "", NAME_Q.anc],
    ["bp_sys", "बीपी", { en: "What is her blood pressure?", hi: "बीपी कितना है?", mr: "बीपी किती आहे?" }],
    ["hb", "हीमोग्लोबिन", { en: "Did you check her Hb (haemoglobin)?", hi: "हीमोग्लोबिन कितना है?", mr: "हिमोग्लोबिन किती आहे?" }],
    ["weeks", "", { en: "How many weeks, or which month?", hi: "कितने हफ्ते, या कौन सा महीना?", mr: "किती आठवडे, किंवा कितवा महिना?" }, null, ["weeks", "month"]],
    ["fetal_movement", "", { en: "Is the baby moving well?", hi: "पेट में बच्चा ठीक हिल रहा है?", mr: "पोटातलं बाळ नीट हलतं का?" }, null, null, true],
    ["danger", "", { en: "Any bleeding, severe headache, or blurred vision?", hi: "कोई खून जाना, तेज़ सिरदर्द, या धुंधला दिखना?", mr: "रक्तस्राव, खूप डोकेदुखी, किंवा धूसर दिसणे?" }, ["bleeding", "severe_headache", "blurred_vision", "convulsions"], null, true],
  ],
  pnc: [
    ["name", "", NAME_Q.pnc],
    ["day", "", { en: "How many days since the delivery?", hi: "डिलीवरी को कितने दिन हुए?", mr: "प्रसूतीला किती दिवस झाले?" }],
    ["pads", "पैड", { en: "How many pads a day?", hi: "दिन में कितने पैड?", mr: "दिवसाला किती पॅड?" }],
    ["temp_c", "तापमान", { en: "What is her temperature?", hi: "तापमान कितना है?", mr: "तापमान किती आहे?" }, null, ["temp_c", "temp_f"]],
    ["bp_sys", "बीपी", { en: "What is her blood pressure?", hi: "बीपी कितना है?", mr: "बीपी किती आहे?" }],
    ["hb", "हीमोग्लोबिन", { en: "Did you check her Hb (haemoglobin)?", hi: "हीमोग्लोबिन कितना है?", mr: "हिमोग्लोबिन किती आहे?" }],
    ["danger", "", { en: "Any fits, blurred vision, severe headache, or foul discharge?", hi: "कोई झटके, धुंधला दिखना, तेज़ सिरदर्द, या बदबूदार पानी?", mr: "झटके, धूसर दिसणे, खूप डोकेदुखी, किंवा दुर्गंधी स्राव?" }, ["convulsions", "blurred_vision", "severe_headache", "foul_discharge", "heavy_bleeding"], null, true],
  ],
};
const ANCHOR = { birth_weight_g: "janam ke samay wajan", temp: "तापमान", bp: "बीपी", weight_g: "वजन", weight_kg: "वजन", temp_c: "तापमान", temp_f: "तापमान", resp_rate: "साँस", bp_sys: "बीपी", bp_dia: "बीपी", hb: "हीमोग्लोबिन", pads: "पैड" };
const SAY_FIELD = { temp: ["तापमान", "तापमान", "temperature"], bp: ["बीपी", "बीपी", "BP"], weight_g: ["वज़न", "वजन", "weight"], weight_kg: ["वज़न", "वजन", "weight"], temp_c: ["तापमान", "तापमान", "temperature"], temp_f: ["तापमान", "तापमान", "temperature"], resp_rate: ["साँस", "श्वास", "breaths"], bp_sys: ["बीपी", "बीपी", "BP"], bp_dia: ["बीपी", "बीपी", "BP"], hb: ["हीमोग्लोबिन", "हिमोग्लोबिन", "Hb"], pads: ["पैड", "पॅड", "pads"], day: ["दिन", "दिवस", "days"], weeks: ["हफ्ते", "आठवडे", "weeks"], month: ["महीना", "महिना", "month"] };
const fieldsOf = (row) => row[4] || [row[0]];
/** This visit's questions; the danger list comes from the rules' grouped checks (ASK_CHECKS) when they exist. */
function rowsFor(type = TYPE) {
  const base = ASK[type];
  // ASK_CHECKS mixes question polarity ("feeding well?" vs "any fits?"), so a bare "nahi" cannot be
  // read as "every sign absent": the built-in danger rows stay until the checks say which answer is a danger
  const checks = USE_ASK_CHECKS ? R.ASK_CHECKS?.[type] : null;
  if (!Array.isArray(checks) || !checks.length) return base;
  const rows = base.filter((r) => r[0] !== "danger");
  checks.forEach((c, i) => rows.push(["danger", "", { en: c.en, hi: c.hi || c.en, mr: c.mr || c.en }, c.codes || [], null, true, 0, `danger:${i}`, c.roman || null]));
  return rows;
}
const USE_ASK_CHECKS = false;
const rowKey = (row) => row[7] || row[0];
function missing() {
  return rowsFor().filter((row) => {
    const [field, , , syms] = row;
    if (skipped.has(rowKey(row)) || notChecked.has(rowKey(row)) || skipped.has(field) && field !== "danger" || notChecked.has(field) && field !== "danger") return false;
    if (field === "danger") return !(syms || []).some((s) => record.symptoms && s in record.symptoms);
    return !fieldsOf(row).some((f) => record[f] != null);
  });
}
const doubtKey = (d) => (d.field === "severity" ? `severity:${d.code}` : d.field);
/** The next thing the phone needs: a half-heard value first, then a missing field. */
function nextQuestion() {
  for (const d of Object.values(doubts)) {
    const k = doubtKey(d);
    if (skipped.has("doubt:" + k)) continue;
    const say = d.say || {};
    if (d.field === "severity") {
      const lab = symSay(d.code);
      const q = { en: d.say_en || say.en || `Is the ${symLabel(d.code)} severe?`, hi: say.hi || d.say_hi || `क्या ${lab} बहुत ज़्यादा है?`, mr: say.mr || d.say_mr || `${lab} खूप जास्त आहे का?` };
      return { key: "doubt:" + k, field: "severity", code: d.code, fields: [], prefix: "", q, doubt: d, yesno: true };
    }
    const lab = SAY_FIELD[d.field];
    const hi = say.hi || d.say_hi || (lab ? `${lab[0]} ठीक से समझ नहीं आया। फिर से बताइए।` : "ठीक से समझ नहीं आया। फिर से बताइए।");
    const mr = say.mr || d.say_mr || (lab ? `${lab[1]} नीट समजलं नाही. पुन्हा सांगा.` : "नीट समजलं नाही. पुन्हा सांगा.");
    const en = d.say_en || say.en || `Say the ${(FIELD[d.field]?.[0] || pretty(d.field)).toLowerCase()} again.`;
    const fields = d.field === "temp" ? ["temp_c", "temp_f"] : d.field === "bp" ? ["bp_sys", "bp_dia"] : [d.field];
    return { key: "doubt:" + k, field: d.field, fields, prefix: ANCHOR[d.field] || "", q: { en, hi, mr }, doubt: d, yesno: /^(did|is|are|was)\b/i.test(en) };
  }
  const row = missing()[0];
  if (row) return { key: rowKey(row), field: row[0], fields: fieldsOf(row), prefix: row[1], q: row[2], syms: row[3], yesno: !!row[5], timed: row[6] || 0, roman: row[8] || null };
  // then anything extra the rules want (for a newborn: the birth weight from the MCP card)
  const e = extras()[0];
  if (!e) return null;
  return { key: "extra:" + e.field, field: e.field, fields: [e.field], prefix: ANCHOR[e.field] || "", q: { en: e.say_en, hi: e.say_hi || e.say_en, mr: e.say_mr || e.say_en }, roman: e.sayRoman || null, extra: true };
}
function extras() {
  if (typeof R.askExtra !== "function") return [];
  try { return (R.askExtra(record) || []).filter((e) => e && e.field && record[e.field] == null && !skipped.has(e.field) && !notChecked.has(e.field)); } catch { return []; }
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
    let code;
    try { code = checkRecord(probe).map((f) => f.code)[0]; } catch {}
    symCache.set(k, code);
  }
  return symCache.get(k);
}
/** Signs said present that no rule flags: these go to the nurse as "noted". */
function notedSigns() {
  if (typeof R.noted === "function") { try { return R.noted(record, flags) || []; } catch { /* fall through */ } }
  const fired = new Set(flags.map((f) => f.code));
  return Object.entries(record.symptoms || {}).filter(([k, v]) => v === true && !(symptomFlag(k) && fired.has(symptomFlag(k)))).map(([code]) => ({ code, label_en: symLabel(code) }));
}
// the one big line the alert leads with comes from the rule's own urgent field (bigLine, in ask.js)
const stampHTML = (refer, press = true) => refer.some(isUrgent) ? `<span class="stamp urgent ${press ? "press" : ""}">GO NOW · 108</span>` : `<span class="stamp ${press ? "press" : ""}">REFER TODAY</span>`;
const whyBox = (f) => `<details class="why"><summary>Why</summary><p>${esc(f.why)}${f.from === "transcript" ? " (heard in what was said; check it)" : ""} <span class="src">Source: ${esc(f.source)} · rule id: ${esc(f.code)}</span></p></details>`;
const hearBtn = (what, label = "Hear it again", en = null) => `<button class="hear" type="button" data-hear="${what}" aria-label="${esc(label)}">${ICON.speaker}<span>${esc(label)}${en && en !== label ? `<small class="en-gloss">${esc(en)}</small>` : ""}</span></button>`;
/** A screen word in her language with the English under it (hi/mr only). */
const lab = (k) => `${esc(t(k))}${LANG !== "en" && UI.en[k] && UI.en[k] !== t(k) ? `<small class="en-gloss">${esc(UI.en[k])}</small>` : ""}`;
const isPhone = () => matchMedia("(max-width: 980px)").matches;

/** "6 mein se 2 baaki (2 of 6 still missing)" */
function missingText(n, of) {
  return LANG === "hi" ? `${of} mein se ${n} baaki (${n} of ${of} still missing)` : LANG === "mr" ? `${of} paiki ${n} baki (${n} of ${of} still missing)` : `${n} of ${of} still missing`;
}
/** The alert's main line in her language, in Roman letters (from the rule when it has one, else its spoken line). */
function alertRoman(groups) {
  if (LANG === "en" || !groups.length) return {};
  const g = groups[0], f = [...g.flags].sort((a, b) => (isUrgent(b) ? 1 : 0) - (isUrgent(a) ? 1 : 0))[0] || {};
  const pick = (o) => (o && typeof o === "object" ? o[LANG] : null);
  const cap = (s) => String(s).replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const raw = pick(g.whereRoman) || pick(f.whereRoman) || pick(f.sayRoman) || pick(f.roman) || (f.say?.[LANG] ? romanize(f.say[LANG]) : null);
  const main = raw ? cap(raw) : null;
  const otwRaw = pick(g.onTheWayRoman) || pick(f.onTheWayRoman);
  const otw = Array.isArray(otwRaw) ? otwRaw.map(cap) : otwRaw ? cap(otwRaw) : null;
  return { main, otw };
}
function render() {
  // spoken words
  $("#said").innerHTML = utter.length ? utter.map(highlightUtterance).join("") : `<p class="said faint">Nothing yet. Speak, type, or try an example.</p><div class="empty-acts"><a class="btn small ghost" href="#type-box" data-open-type>Type it</a><a class="btn small ghost" href="#examples">Try an example</a></div>`;
  $("#said [data-open-type]")?.addEventListener("click", () => { $("#type-box").open = true; setTimeout(() => $("#typed").focus(), 30); });
  $("#said-note").textContent = utter.some((u) => /[ऀ-ॿ]/.test(u.text)) ? "Shown in Roman letters" : "";
  // tiles
  $("#record-title").textContent = t("titles")[TYPE];
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
    const doubt = doubts[k] || (k === "bp_sys" && (doubts.bp_dia || doubts.bp)) || (k === "temp_c" && doubts.temp);
    const cap = caption(k);
    return `<div class="tile ${has ? "filled tap" : ""} ${level[k] || ""} ${isNew ? "new" : ""} ${doubt ? "doubt" : ""}" data-f="${k}" ${has ? 'role="button" tabindex="0"' : ""} aria-label="${esc(label)}: ${esc(has ? v : state || "not said")}">
      <small>${ICON[k] || ICON.other}<span>${esc(label)}${cap ? `<i class="cap">${esc(cap)}</i>` : ""}</span></small><b class="${has ? "" : "empty"}">${esc(has ? v : state || "—")}</b></div>`;
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
    return `<span class="sym ${cls}" data-f="symptoms.${k}" role="button" tabindex="0">${esc(symLabel(k))}</span>`;
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
    // one action, said once; the signs as short lines under it (same component on the slip and the board)
    const groups = groupAlerts(flags, TYPE, R.groupFlags);
    // by default: the stamp, one big action line and a call + hear-again pair; the rest behind "Kyun? / Why"
    const title = `${refer[0].title}${refer.length > 1 ? ` and ${refer.length - 1} other danger sign${refer.length > 2 ? "s" : ""}` : ""}`;
    html += `<div class="alert refer ${refer.some(isUrgent) ? "urgent" : ""}" id="alert-refer" tabindex="-1" aria-label="${esc(title)}"><div class="alert-head"><h3 class="sr">${esc(title)}</h3>${stampHTML(refer)}</div>
      ${referHTML(groups, { ...alertRoman(groups), title, hear: hearBtn("refer", t("hearAgain"), LANG === "en" ? null : tEn("hearAgain")) })}</div>`;
  }
  if (watch.length) {
    html += `<div class="alert watch"><h3>${refer.length ? "Also watch" : "No danger sign, but watch"}</h3><ul>${watch.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.action)}${whyBox(f)}</li>`).join("")}</ul>${hearBtn("watch", t("hearAgain"))}</div>`;
  }
  if (noted.length || unread.length) {
    html += `<div class="alert noted"><h3>Noted, tell the nurse</h3>${noted.length ? `<p>${esc(noted.map((n) => n.label_en).join(", "))}. No rule here covers ${noted.length > 1 ? "these signs" : "this sign"}, so the phone can't judge ${noted.length > 1 ? "them" : "it"}. Tell the nurse (ANM) today.</p>` : ""}${unread.length ? `<p class="unread"><b>Words not understood:</b> ${unread.map((x) => `"${esc(romanize(x.text))}"`).join(", ")}. The phone could not place ${unread.length > 1 ? "these" : "this"}; tell the nurse.</p>` : ""}${hearBtn("noted")}</div>`;
  }
  if (!refer.length && !watch.length && !noted.length && !unread.length && !anyYes && enough) {
    html = `<div class="alert ok"><h3>No danger signs in what was said</h3><p>Checked against ${TYPE === "newborn" ? "the 2026 newborn danger signs" : TYPE === "anc" ? "the Health Ministry (MoHFW) pregnancy danger signs" : "the danger signs for a mother after birth"}. A sign that wasn't said can't be checked.</p></div>`;
  }
  $("#alert").innerHTML = html;
  drawReferBar(refer);
  // bring a new referral into view once, as soon as it appears (not mid-replay)
  const fresh = refer.filter((f) => !shownRefer.has(f.code));
  if (fresh.length && !playing) {
    fresh.forEach((f) => shownRefer.add(f.code));
    requestAnimationFrame(() => { const a = $("#alert-refer"); if (!a) return; a.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" }); a.focus({ preventScroll: true }); });
  }
  // the side list: what the rules found, compact, with its level and source
  const lvl = (f) => (isUrgent(f) ? "go now" : f.severity === "refer_now" ? "refer today" : "watch");
  $("#fired").innerHTML = flags.length ? `<ul class="rules-found">${flags.map((f) => `<li><span class="lvl ${lvl(f).replace(" ", "-")}">${lvl(f)}</span> <b>${esc(f.title)}</b> <span class="src-inline">${esc(String(f.source || "").split(/[;(]/)[0].trim())}</span></li>`).join("")}</ul>` : `<p class="faint">None yet.</p>`;
  // the question, or the confirm box
  const ask = $("#ask");
  const q = !saved && utter.length ? nextQuestion() : null;
  if (pending) {
    ask.hidden = false; ask.className = "v-ask confirm";
    const body = pending.kind === "save"
      ? [`Before saving`, pending.missing ? `Still missing: ${pending.missingEn}. Save anyway?` : pending.needName ? "Save without a name?" : "Save this visit?", pending.missing ? `Say "haan" to save now, or "nahi" to answer them.` : pending.needName ? `Say the name, or "haan" to save without it.` : `Say "haan" or "nahi", or tap.`, `${ICON.tick}${t("yesSave")}`, t("no")]
      : pending.kind === "confirmBack"
        ? ["Check the change", `${pending.labelEn}: is that right?`, `Say "haan", or "nahi" to say it again.`, `${ICON.tick}Yes`, "No, say again"]
      : pending.kind === "correct"
        ? ["Correction", `${FIELD[pending.field]?.[0] || pretty(pending.field)} ${pending.value}?`, `Say "haan" or "nahi".`, `${ICON.tick}Yes`, "No"]
        : ["This visit is not saved", "Clear it and start a new visit?", `Say "haan" or "nahi", or tap.`, "Yes, clear", "No, keep it"];
    ask.innerHTML = `<div class="v-ask-q"><span class="faint">${body[0]}</span><b>${esc(body[1])}</b><span class="hint">${esc(body[2])}</span></div><div class="v-ask-btns"><button class="btn small ${pending.kind === "clear" ? "refer" : "voice"}" id="yes">${body[3]}</button><button class="btn small ghost" id="no">${body[4]}</button></div>`;
    $("#yes").onclick = () => confirmPending(true);
    $("#no").onclick = () => confirmPending(false);
  } else if (q && !playing) {
    ask.hidden = false; ask.className = "v-ask";
    const rows = rowsFor();
    const left = missing();
    const missLabel = (r) => (r[0] === "name" ? "name" : r[0] === "danger" ? "danger signs" : (r[0] === "day" && TYPE === "newborn" ? "baby's age" : (FIELD[r[0]]?.[0] || pretty(r[0])).toLowerCase()));
    const words = LANG === "en" ? [`"skip"`, `"not checked"`, `"wait"`] : LANG === "mr" ? [`"soda" (skip)`, `"mahit nahi" (not checked)`, `"thamba" (wait)`] : [`"chhodo" (skip)`, `"pata nahi" (not checked)`, `"ruko" (wait)`];
    const hint = q.yesno ? `Say "${LANG === "mr" ? "hoy" : LANG === "en" ? "yes" : "haan"}" or "${LANG === "mr" ? "nahi" : LANG === "en" ? "no" : "nahi"}". Or ${words[0]}${q.field === "danger" || q.field === "severity" ? "" : `, or ${words[1]}`}.` : `Say the answer, ${words[0]}, ${words[1]}, or ${words[2]}.`;
    const timer = count && count.key === q.key ? `<span class="count" id="count" role="timer">${ICON.timer}<span id="count-s">${countLeft()}</span></span>` : "";
    ask.innerHTML = `<div class="v-ask-q"><span class="faint">${ICON.question}${q.doubt ? t("check") : q.extra ? (LANG === "hi" ? "Ek aur sawaal (one more question)" : LANG === "mr" ? "Aankhi ek prashna (one more question)" : "One more question") : `${esc(missingText(left.length, rows.length))}: ${esc([...new Set(left.map(missLabel))].join(", "))}`}</span><b>${esc(followUp ? "Which one? Say the sign." : q.q.en)}</b>${timer}<span class="hint">${esc(hint)}</span></div>
      <div class="v-ask-btns">${hearBtn("ask", t("hearQ"), LANG === "en" ? null : tEn("hearQ"))}<button class="btn small voice" id="answer">${ICON.mic}<span>${lab("answer")}</span></button><button class="btn small ghost" id="skip">${ICON.skip}<span>${lab("skip")}<small class="cmd">or say "${esc(t("skipCmd"))}"</small></span></button>${q.field !== "danger" && q.field !== "severity" ? `<button class="btn small ghost" id="unchecked"><span>${lab("unchecked")}<small class="cmd">or say "${esc(t("uncheckedCmd"))}"</small></span></button>` : ""}</div>`;
    $("#answer").onclick = () => { asking = q; startListening("answer"); };
    $("#skip").onclick = () => skipQuestion(q, false);
    if ($("#unchecked")) $("#unchecked").onclick = () => skipQuestion(q, true);
  } else { ask.hidden = true; ask.innerHTML = ""; }
  // banner: type switched, visit cleared, visit for a person
  const b = $("#banner");
  if (banner?.kind === "switch") b.innerHTML = `<div class="note"><span>This sounds like a ${esc(TITLES[TYPE].toLowerCase())}, so it switched from ${esc(TITLES[banner.from].toLowerCase())}.</span><button class="btn small ghost" id="undo-switch">Undo</button></div>`;
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
  // the mic panel shows what the phone is waiting for right now
  if (session && !spokenNow.speaking && !lastError) listeningStatus("listening");
}
/* a red bar under the header when a referral first appears, and a badge on the bottom bar */
let referObserver = null, alertInView = false;
function drawReferBar(refer) {
  const bar = $("#refer-bar");
  const tab = document.querySelector('.bottom-bar a[href="/visit"]');
  if (tab) { let badge = tab.querySelector(".badge"); if (refer.length && !saved) { if (!badge) { badge = document.createElement("span"); badge.className = "badge"; tab.appendChild(badge); } badge.textContent = refer.length; badge.setAttribute("aria-label", `${refer.length} danger sign${refer.length > 1 ? "s" : ""}`); } else badge?.remove(); }
  if (!bar) return;
  if (!refer.length || saved) { bar.hidden = true; return; }
  const urgent = refer.some(isUrgent);
  bar.className = `refer-bar ${urgent ? "urgent" : ""}`;
  bar.innerHTML = `<a href="#alert"><b>${urgent ? "GO NOW · 108" : "REFER TODAY"}</b><span>${esc(refer[0].title)}${refer.length > 1 ? ` +${refer.length - 1}` : ""}</span><span class="see">See</span></a>`;
  bar.querySelector("a").onclick = (e) => { e.preventDefault(); const a = $("#alert-refer") || $("#alert"); a.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }); a.focus?.({ preventScroll: true }); };
  if (!referObserver && "IntersectionObserver" in window) {
    referObserver = new IntersectionObserver((es) => { alertInView = es.some((e) => e.isIntersecting); $("#refer-bar").classList.toggle("off", alertInView); }, { threshold: 0.2 });
    referObserver.observe($("#alert"));
  }
  bar.classList.toggle("off", alertInView);
  bar.hidden = false;
}
/** The refer alert, said once: the most urgent sign's own line, then the other signs by name, never the same action twice. */
function referLine(list, all = flags.filter((f) => f.severity === "refer_now")) {
  if (!list.length) return "";
  const top = [...all].sort((a, b) => (isUrgent(b) ? 1 : 0) - (isUrgent(a) ? 1 : 0))[0];
  const lead = list.includes(top) ? (L(top.say) || top.title) : "";
  const others = list.filter((f) => f !== top);
  return [lead, others.length ? L(LINES.also) + others.map((f) => reason(f, LANG)).join(", ") + (LANG === "hi" ? "।" : ".") : ""].filter(Boolean).join(" ");
}
function hear(what) {
  const refer = flags.filter((f) => f.severity === "refer_now"), watch = flags.filter((f) => f.severity === "watch");
  if (what === "refer") say(referLine(refer), { now: true });
  else if (what === "watch") say(watch.map((f) => L(f.say) || f.title).join(" "), { now: true });
  else if (what === "noted") say(notedLine(notedSigns()), { now: true });
  else if (what === "ask") { const q = nextQuestion(); if (q) say(followUp ? L(LINES.which) : L(q.q), { now: true }); }
}
function notedLine(noted) {
  const names = [...noted.map((n) => (LANG === "en" ? n.label_en : symSay(n.code))), ...unread.map((x) => x.text)];
  return LANG === "hi" ? `नोट किया: ${names.join(", ")}। आज नर्स को बताइए।` : LANG === "mr" ? `नोंद केली: ${names.join(", ")}. आज नर्सला सांगा.` : `Noted: ${names.join(", ")}. Tell the nurse today.`;
}

/* ---------- reading what was said ---------- */
const check = () => { record.type = TYPE; try { return checkRecord(record); } catch { return []; } };
const okName = (v) => v && !NAME_BAD(v) && !NAME_BLOCK.test(romanize(String(v)).toLowerCase().trim());
/** Read one utterance into the record. Returns the fields it changed. */
function apply(text, via, prefix = "", set = null, display = null) {
  const u = utter.length;
  const shown = display || text;
  const offset = display ? Math.max(0, display.lastIndexOf(text)) : 0;
  utter.push({ text: shown, via, prefix, set, read: display ? text : null });
  const changed = [];
  if (set) {
    for (const [k, v] of Object.entries(set)) {
      if (k === "symptoms") { record.symptoms = { ...(record.symptoms || {}) }; for (const [s, x] of Object.entries(v)) { if (record.symptoms[s] !== true || x === true) { record.symptoms[s] = x; changed.push("symptoms." + s); evidence["symptoms." + s] = { u, start: 0, end: shown.length }; delete doubts["severity:" + s]; } } }
      else { record[k] = v; changed.push(k); evidence[k] = { u, start: 0, end: shown.length }; delete doubts[k]; }
    }
    return changed;
  }
  let res;
  try { res = understand(prefix + text, TYPE); } catch { res = { record: {}, evidence: {} }; }
  const nr = res.record || {};
  for (const [k, v] of Object.entries(nr)) {
    if (k === "symptoms" || k === "type") continue;
    if (k === "name" && (!okName(v) || (record.name && res.nameScore < 4))) { delete res.evidence?.name; continue; } // a weak guess never replaces a name already said
    if (JSON.stringify(record[k]) !== JSON.stringify(v)) changed.push(k);
    record[k] = v;
    delete doubts[k];
    if (k === "bp_sys" || k === "bp_dia") { delete doubts.bp_sys; delete doubts.bp_dia; delete doubts.bp; }
    if (k === "temp_c" || k === "temp_f") { delete doubts.temp_c; delete doubts.temp_f; delete doubts.temp; }
    if (k === "temp_c" && nr.temp_f == null) delete record.temp_f; // a new Celsius reading replaces an old Fahrenheit one
  }
  if (nr.symptoms) {
    for (const [s, v] of Object.entries(nr.symptoms)) { if (record.symptoms?.[s] !== v) changed.push("symptoms." + s); delete doubts["severity:" + s]; }
    record.symptoms = { ...(record.symptoms || {}), ...nr.symptoms };
  }
  for (const d of Array.isArray(res.doubts) ? res.doubts : []) if (d && d.field) { const k = doubtKey(d); doubts[k] = d; changed.push("doubt:" + k); }
  for (const x of Array.isArray(res.unread) ? res.unread : []) if (x && x.text && !unread.some((y) => y.text === x.text)) { unread.push({ u, text: String(x.text) }); changed.push("unread"); }
  for (const [k, e] of Object.entries(res.evidence || {})) {
    if (!e) continue;
    const start = e.start - prefix.length, end = e.end - prefix.length;
    if (end <= 0) continue;
    evidence[k] = { u, start: Math.max(0, start) + offset, end: end + offset };
  }
  return changed;
}
/** Re-read every utterance (after the visit type changed). */
function rebuild() {
  const old = utter;
  utter = []; record = { type: TYPE }; evidence = {}; doubts = {}; unread = [];
  for (const u of old) apply(u.read || u.text, u.via, u.prefix, u.set, u.read ? u.text : null);
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
/** Say each new danger once: refer-today and go-now first, then the watch ones. */
function speakNewDangers(now = true) {
  const fresh = flags.filter((f) => !spoken.has(f.code));
  const refer = fresh.filter((f) => f.severity === "refer_now"), watch = fresh.filter((f) => f.severity === "watch");
  for (const f of fresh) spoken.add(f.code);
  if (refer.length) say(referLine(refer), { now });
  if (watch.length) say(watch.map((f) => L(f.say) || f.title).join(" "), { now: now && !refer.length });
  return refer.length > 0 || watch.length > 0;
}
function answerYesNo(q, yes, text, via) {
  if (q.field === "feeding") return apply(text, via, "", { feeding: yes ? "good" : "poor" });
  if (q.field === "fetal_movement") return apply(text, via, "", { fetal_movement: yes ? "normal" : "reduced" });
  // "is the headache severe?": haan marks the sign; nahi leaves it out
  if (q.field === "severity") { const ch = yes ? apply(text, via, "", { symptoms: { [q.code]: true } }) : (utter.push({ text, via, prefix: "", set: {} }), []); delete doubts["severity:" + q.code]; return [...ch, "severity"]; }
  // "Did you say 400 grams?" / "Did you say BP 140 by 100?": haan takes the value heard, nahi asks for it again
  if (q.doubt) {
    const d = q.doubt, nums = (String(d.heard ?? "").match(/\d+(?:\.\d+)?/g) || []).map(Number);
    let set = null;
    if (yes && d.field === "bp" && nums.length >= 2) set = { bp_sys: Math.max(nums[0], nums[1]), bp_dia: Math.min(nums[0], nums[1]) };
    else if (yes && d.field === "temp" && nums.length) { const v = nums[0]; if (v >= 30 && v <= 44) set = { temp_c: v }; else if (v >= 90 && v <= 110) set = { temp_f: v, temp_c: Math.round(((v - 32) * 5 / 9) * 10) / 10 }; }
    else if (yes && nums.length && FIELD[d.field]) set = { [d.field]: nums[0] };
    if (set) { const ch = apply(text, via, "", set); delete doubts[doubtKey(d)]; return [...ch, "doubt-ok"]; }
    utter.push({ text, via, prefix: "", set: {} }); say(L(LINES.number)); return ["followup"];
  }
  if (q.field === "danger") {
    if (yes) { utter.push({ text, via, prefix: "", set: {} }); followUp = q.key; say(L(LINES.which)); return ["followup"]; }
    const set = { symptoms: {} };
    for (const s of q.syms || []) if (record.symptoms?.[s] !== true) set.symptoms[s] = false;
    return apply(text, via, "", set);
  }
  if (q.field === "name") { if (!yes) { notChecked.add("name"); utter.push({ text, via, prefix: "", set: {} }); return ["unchecked"]; } return []; }
  // a number question answered with yes / no
  if (!yes) { notChecked.add(q.field); utter.push({ text, via, prefix: "", set: {} }); return ["unchecked"]; }
  utter.push({ text, via, prefix: "", set: {} }); say(L(LINES.number)); return ["followup"];
}
/** An answer to "what is her name?": the reader's name, or the words themselves. */
function answerName(text, via) {
  let dry = {};
  try { dry = understand("नाम " + text, TYPE).record || {}; } catch {}
  if (okName(dry.name)) return apply(text, via, "नाम ");
  const words = norm(text).split(" ").filter(Boolean);
  if (words.length && words.length <= 3 && words.every((w) => /^[a-zऀ-ॿ]+$/.test(w)) && okName(words[0])) {
    const nm = romanize(words[0]).replace(/^./, (c) => c.toUpperCase());
    return apply(text, via, "", { name: nm });
  }
  return apply(text, via);
}
function skipQuestion(q, unchecked) {
  if (q.doubt) skipped.add("doubt:" + (q.code ? `severity:${q.code}` : q.field));
  else if (unchecked) notChecked.add(q.field === "danger" ? q.key : q.field); else skipped.add(q.field === "danger" ? q.key : q.field);
  if (count && count.key === q.key) stopCount();
  asking = null; followUp = null; retries = 0;
  say(L(unchecked ? LINES.notChecked : LINES.skipped));
  render();
  afterTurn();
}
/**
 * "nahi nahi, 37.8": a correction that holds only a bare number goes to the
 * field filled most recently whose range fits, never to the pending question.
 * Returns true when the phrase was handled as a correction.
 */
const INT_FIELDS = new Set(["resp_rate", "pads", "weight_g", "day", "weeks", "month", "bp_sys", "bp_dia"]);
/** Numbers the reader itself finds in a phrase (digits or number words, with real word boundaries). */
function numbersIn(s) { try { return (U.allNumbers ? U.allNumbers(U.tokenize(s), s) : []) || []; } catch { return []; } }
/**
 * "nahi nahi, 37.8": a correction that holds only a bare number goes to the
 * field filled most recently whose range fits, never to the pending question,
 * and the new value is said back. Returns { done } when handled here,
 * { plain: rest } when the rest should be read as a normal sentence, or null.
 */
function correction(text, via) {
  const m = norm(text).match(CORRECTION);
  if (!m) return null;
  const rest = String(text).replace(/^[\s\S]*?(nahi nahi|nahin nahin|नहीं नहीं|नही नही|नाही नाही|no no|sorry|सॉरी|maaf|galat|गलत|galti|चूक|chuk|चुकलं|chukla|wrong|not that|i mean)[\s,]*/i, "").trim();
  if (!rest) return null;
  const nums = numbersIn(rest);
  if (FIELD_WORD.test(rest) || !nums.length) return { plain: rest }; // the words name their own field, or hold no number
  const decimal = nums.some((n) => !Number.isInteger(n.value));
  // fields that hold a value, most recent first
  const recent = Object.keys(ANCHOR).filter((f) => record[f] != null && evidence[f] && f !== "bp_dia" && f !== "temp_f" && f !== "temp" && f !== "bp").sort((a, b) => (evidence[b].u - evidence[a].u) || (evidence[b].start - evidence[a].start));
  const fits = [];
  for (const f of recent) {
    if (decimal && INT_FIELDS.has(f)) continue; // 38.5 is never a count of breaths or pads
    let r = {};
    try { r = understand(ANCHOR[f] + " " + rest, TYPE).record || {}; } catch {}
    const v = f === "temp_c" ? (r.temp_c ?? null) : r[f];
    if (v != null && !(r.symptoms && Object.keys(r.symptoms).length)) fits.push({ field: f, value: f === "bp_sys" ? `${r.bp_sys}/${r.bp_dia ?? "?"}` : f === "temp_c" && r.temp_f != null ? r.temp_f : v, u: evidence[f].u });
  }
  if (!fits.length) { utter.push({ text, via, prefix: "", set: {} }); say(L(LINES.noRecent)); render(); return { done: true }; }
  if (fits.length > 1 && fits[0].u === fits[1].u) {
    // two fields from the same sentence fit: ask which
    pending = { kind: "correct", options: fits, field: fits[0].field, value: fits[0].value, text, rest, via };
    const lab = SAY_FIELD[fits[0].field];
    say(`${lab ? lab[LANG === "hi" ? 0 : LANG === "mr" ? 1 : 2] : fits[0].field} ${fits[0].value}?`, { now: true });
    render();
    return { done: true };
  }
  applyCorrection(fits[0].field, text, rest, via);
  return { done: true };
}
function applyCorrection(field, text, rest, via) {
  const before = JSON.stringify(record);
  const changed = apply(rest, via, ANCHOR[field] + " ", null, text);
  flags = check();
  if (JSON.stringify(record) === before) say(L(LINES.noRecent)); // nothing changed: say so, never silence
  else speakBack(changed.filter((c) => !c.startsWith("doubt") && !c.startsWith("symptoms") && c !== "unread").concat(field));
  speakNewDangers(false);
  render();
}

function take(text, via = "voice") {
  text = String(text || "").trim();
  if (!text) return;
  const cmd = command(text);
  // "phir se bolo" / "madad": say the question (or the open yes/no) again, or what she can say now; nothing changes
  if (cmd === "repeat") return repeatLine();
  if (cmd === "help") return helpLine();
  // a pending "save?", "clear?", "temperature 37?" or "…, theek?" is answered first
  if (pending) {
    if (cmd === "yes" || (pending.kind === "save" && cmd === "save")) return confirmPending(true);
    if (cmd === "no") return confirmPending(false);
    if (pending.kind === "save" && pending.needName && !cmd) {
      // she said the name in answer to "save without a name?"
      answerName(text, via); flags = check();
      if (record.name) { pending = null; return askSave(); }
    }
    // an unclear reply keeps the yes/no question open once, and asks again
    if (!cmd && !pending.reasked && pending.kind !== "confirmBack") { pending.reasked = true; say(L(LINES.yesNo), { now: true }).then(() => { if (pending) openAnswerMic(null); }); render(); return; }
    pending = null; // anything else: carry on with what she said
  }
  if (cmd === "undo") { if (banner?.kind === "switch") { const from = banner.from; banner = null; return switchType(from, { announce: false }); } return restoreCleared(); }
  if (cmd === "fresh" || (saved && cmd === "skip" && /^(agla|agli|अगला|अगली|next|पुढची|पुढचा|pudhchi)/.test(norm(text)))) return askClear();
  if (saved && !cmd) { saved = null; resetVisit(); } // she has started the next visit
  if (cmd === "save") return askSave();
  if (cmd === "read") return readBack();
  if (cmd === "stop") {
    // "bas": the mic closes and the phone does not ask more; a second "bas" stops the questions for this visit
    const again = Date.now() - lastBas < 30000; lastBas = Date.now();
    if (again) stopAsking = true;
    clearTimeout(turnTimer); stopHold(); if (count) stopCount();
    say(L(again ? LINES.stopAsking : LINES.micOff), { now: true });
    if (session) { session.byUser = true; session.noFollow = true; session.stop(); }
    return;
  }
  if (cmd === "wait") return holdOn();
  if (cmd?.startsWith("type:")) { const t = cmd.slice(5); banner = null; switchType(t, { announce: false }); say(L(TYPE_SET[t]), { now: true }); return; }
  if (cmd?.startsWith("lang:")) { const l = cmd.slice(5); setLang(l); say(LANG_SET[l], { now: true, lang: l }); if (session) restartSession(); return; }

  const q = asking || (followUp ? nextQuestion() : null);
  let changed;
  if (q && (cmd === "skip" || cmd === "unchecked")) return skipQuestion(q, cmd === "unchecked");
  if (cmd === "skip" || cmd === "unchecked") return; // nothing is being asked: a command word never becomes a value
  if (!q && (cmd === "yes" || cmd === "no")) return; // a stray yes or no with no question open
  let backFields = null;
  const corr = correction(text, via);
  if (corr?.done) return;
  // a correction with no bare number ("galat, doodh kam pee raha hai") is read as a normal sentence, without its marker
  const readText = corr?.plain || text, display = corr?.plain ? text : null;
  if (q && followUp && cmd === "no") { followUp = null; changed = answerYesNo(q, false, text, via); }
  else if (q && !followUp && (cmd === "yes" || cmd === "no")) changed = answerYesNo(q, cmd === "yes", text, via);
  else if (q && !followUp && q.field === "name") changed = answerName(text, via);
  else {
    if (!utter.length && via !== "example") {
      const t = betterType(text);
      if (t) { const from = TYPE; switchType(t, { announce: true }); banner = { kind: "switch", from }; switchedNow = true; }
    }
    // a short answer to the phone's own question is read with the question's anchor word in front,
    // but only when the words alone don't already fill that field
    const words = norm(text).split(" ").length;
    let prefix = "";
    if (q && q.prefix && words <= 5 && !corr) { let dry = {}; try { dry = understand(readText, TYPE).record || {}; } catch {} if (!q.fields.some((f) => dry[f] != null)) prefix = q.prefix + " "; }
    changed = apply(readText, via, prefix, null, display);
    if (corr?.plain) {
      const fields = changed.filter((c) => !c.startsWith("doubt") && c !== "unread");
      if (fields.length) backFields = fields; else say(L(LINES.noRecent));
    }
    if (followUp && changed.some((c) => c.startsWith("symptoms."))) followUp = null;
  }
  flags = check();
  // a correction's value is said back first, then any new danger (queued, so neither cuts the other off)
  const spokeDanger = speakNewDangers(!switchedNow && !backFields);
  if (backFields) speakBack(backFields);
  switchedNow = false;
  // did the reply answer the question?
  if (q) {
    const hit = changed.includes("followup") || changed.includes("unchecked") || changed.includes("severity") || changed.includes("doubt-ok") || (q.field === "danger" ? changed.some((c) => c.startsWith("symptoms.")) : q.fields.some((f) => changed.includes(f) || (f === "bp_sys" && changed.includes("bp_dia")))) && !changed.includes("doubt:" + q.field);
    if (hit && count && count.key === q.key) stopCount();
    if (hit && hold) stopHold();
    if (!hit && !changed.filter((c) => c !== "unread").length && !spokeDanger) {
      retries++;
      if (retries <= 2) { say(L(LINES.reprompt)); asking = q; render(); afterTurn(true); return; }
    }
    if (!hit && changed.length) asked.delete(q.key); // she said something else; ask this again later
    if (hit || retries > 2) retries = 0;
    // anything that sets no field keeps the question open
    asking = changed.includes("followup") ? q : hit ? null : changed.filter((c) => c !== "unread").length ? null : q;
    if (hit && !asking && session?.mode === "visit") { clearTimeout(turnTimer); turnTimer = setTimeout(() => maybeAsk(), 700); }
  }
  render();
  afterTurn();
}

/* ---------- the next turn: ask the next question, then listen for one answer ---------- */
let turnTimer = null;
function afterTurn(again = false) {
  if (session) return;
  if (pending) { clearTimeout(turnTimer); turnTimer = setTimeout(() => chain.then(() => { if (pending && !session) openAnswerMic(null); }), 60); return; } // an open mic asks after a pause (or the 700 ms timer set after an answer), or is listening already
  clearTimeout(turnTimer);
  turnTimer = setTimeout(() => maybeAsk(again), 60);
}
function maybeAsk(again = false) {
  if (playing || saved || pending || !utter.length || count || hold || stopAsking) return;
  const q = nextQuestion();
  if (!q) {
    if (!offerSave) { offerSave = true; say(L(LINES.allDone)).then(() => openAnswerMic(null)); }
    return;
  }
  asking = q; render();
  const n = asked.get(q.key) || 0;
  if (!again && !followUp) {
    if (n >= 1) { chain.then(() => openAnswerMic(q)); return; } // asked once already: no re-asking over her
    asked.set(q.key, 1);
    say(L(q.q)).then(() => (q.timed ? startCount(q) : openAnswerMic(q)));
  } else chain.then(() => openAnswerMic(q));
}
function openAnswerMic(q, opts) {
  if (!micState.granted || session || saved || playing || lastError) return;
  if (q && asking !== q && !(asking && asking.key === q.key)) return;
  startListening("answer", opts);
}
/* the breath count: a timed minute, a soft tick every 15 s, "time up" at 60 s, the mic open throughout */
const countLeft = () => { if (!count) return ""; const s = Math.max(0, Math.ceil((T.count - (Date.now() - count.t0)) / 1000)); return count.done ? "Time up: how many?" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`; };
function startCount(q) {
  stopCount();
  count = { key: q.key, t0: Date.now(), lastTick: 0, done: false };
  const hold = T.count + Math.max(15000, T.count / 4);
  if (session) session.extend?.(hold);
  else if (micState.granted && !lastError) startListening("answer", { firstMs: hold });
  render();
  count.timer = setInterval(() => {
    if (!count) return;
    const el = $("#count-s"); if (el) el.textContent = countLeft();
    const ms = Date.now() - count.t0;
    if (!count.done && ms >= T.count) { count.done = true; tickTone(); say(L(LINES.timeUp)); if (el) el.textContent = countLeft(); }
    else if (!count.done && Math.floor(ms / T.tick) > count.lastTick) { count.lastTick = Math.floor(ms / T.tick); tickTone(); }
  }, 200);
}
function stopCount() { if (count) clearInterval(count.timer); count = null; session?.release?.(); }
/* "ruko / ek minute / thamba": hold the mic up to 2 minutes with a soft tick, then ask the same question again */
function holdOn() {
  if (count) return; // the breath count already waits
  const q = asking || nextQuestion();
  stopHold();
  hold = { key: q?.key || null, t0: Date.now(), lastTick: 0 };
  say(L(LINES.waiting), { now: true });
  if (session) session.extend?.(T.hold + 5000);
  else if (micState.granted && !lastError) startListening("answer", { firstMs: T.hold + 5000 });
  setStatus(t("holding"), "on", LANG === "en" ? null : tEn("holding"));
  hold.timer = setInterval(() => {
    if (!hold) return;
    const ms = Date.now() - hold.t0;
    if (ms >= T.hold) {
      const key = hold.key; stopHold();
      if (key) asked.delete(key);
      asking = null;
      if (session) { session.extend?.(T.answerFirst + 4000); }
      maybeAsk();
    } else if (Math.floor(ms / T.tick) > hold.lastTick) { hold.lastTick = Math.floor(ms / T.tick); tickTone(); }
  }, 200);
}
function stopHold() { if (hold) clearInterval(hold.timer); hold = null; session?.release?.(); }

/* ---------- the microphone ---------- */
const wave = $("#wave");
wave.innerHTML = Array.from({ length: 24 }, () => "<i></i>").join("");
/** The mic panel's line, in her language (Roman letters) with English under it when she isn't using English. */
function setStatus(text, kind = "", en = null) {
  const s = $("#status");
  s.innerHTML = `<span>${esc(text)}</span>${en && en !== text ? `<small class="en-gloss">${esc(en)}</small>` : ""}`;
  s.className = `v-status ${kind}`;
}
const tEn = (k) => UI.en[k];
const ERR = {
  "not-allowed": ["The microphone is blocked. Allow it in the address bar (the lock or camera icon), or type the visit below.", "blocked"],
  "service-not-allowed": ["This browser won't let the page use speech recognition. Type the visit below, or open the page in Chrome or Edge.", "blocked"],
  "network": ["No internet, so this page can't listen. Tap the mic on your phone's keyboard and speak into the box below: it is read by itself. The visit stays on this screen and saves on this phone.", "offline"],
  "audio-capture": ["No microphone was found. Plug one in, or type the visit below.", "noMic"],
  "language-not-supported": [null, "langNot"],
  "unsupported": ["This browser can't listen. Type the visit below, or open the page in Chrome or Edge.", "unsupported"],
};
function showError(e) {
  const [msg, line] = ERR[e] || [`Couldn't hear (${e}). Tap the mic to try again.`, null];
  stopHold();
  lastError = e;
  const others = Object.keys(LANGS).filter((l) => l !== LANG && l !== "mr").map((l) => LANGS[l].label).join(" or ");
  const en = e === "language-not-supported" ? `This browser can't listen in ${LANGS[LANG].label}. Try ${others}, or type the visit below.` : msg;
  const ro = ERR_RO[e]?.[LANG];
  setStatus(ro || en, "err", ro ? en : null);
  $("#type-box").open = true;
  // every no-mic case points to the keyboard's own mic, the voice fallback
  if (["network", "not-allowed", "service-not-allowed", "audio-capture", "unsupported", "language-not-supported"].includes(e)) setTimeout(() => $("#typed").focus({ preventScroll: false }), 50);
  if (line) say(L(LINES[line]), { now: true });
}
function listeningStatus(state) {
  if (!session || state === "ended" || lastError) return;
  if (state === "paused") return setStatus(t("paused"), "wait", LANG === "en" ? null : tEn("paused"));
  // after a save the phone waits only for "naya": never show a question the visit no longer needs
  if (saved) return setStatus(t("nextVisitLine"), "on", LANG === "en" ? null : tEn("nextVisitLine"));
  // what the phone is waiting for comes first: the save yes/no, then the question
  if (pending) { const [line, en] = pendingLine(); return setStatus(line, "on", en); }
  if (count) return setStatus(t("counting"), "on", LANG === "en" ? null : tEn("counting"));
  if (hold) return setStatus(t("holding"), "on", LANG === "en" ? null : tEn("holding"));
  const q = asking || (session.mode === "answer" ? nextQuestion() : null);
  if (q) { const [line, en] = questionLine(q); return setStatus(line, "on", en); }
  setStatus(session.mode === "answer" ? t("answering") : t("listening")(LANGS[LANG].label), "on", LANG === "en" ? null : session.mode === "answer" ? tEn("answering") : tEn("listening")(LANGS[LANG].label));
}
/** The current question in Roman letters, plus what she can say: [line, English line]. */
function questionLine(q) {
  const en = `${followUp ? "Which one? Say the sign." : q.q.en} Say the answer${q.yesno ? ' ("yes" or "no")' : ""}, "skip", "not checked" or "wait".`;
  if (LANG === "en") return [en, null];
  const ro = followUp ? (LANG === "hi" ? "Kaun sa? Lakshan boliye." : "Konta? Lakshan sanga.") : ((typeof q.roman === "string" ? q.roman : q.roman?.[LANG]) ? String(typeof q.roman === "string" ? q.roman : q.roman[LANG]).replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : null) || (ROQ[`${TYPE}:${q.field}`]?.[LANG] || (q.roman?.[LANG] ? String(q.roman[LANG]).replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()) : null) || romanize(q.q[LANG] || "").replace(/^./, (c) => c.toUpperCase()));
  const say = LANG === "hi" ? `Boliye: jawab${q.yesno ? ' ("haan" ya "nahi")' : ""}, "chhodo", "pata nahi" ya "ruko".` : `Sanga: uttar${q.yesno ? ' ("ho" kiva "nahi")' : ""}, "soda", "mahit nahi" kiva "thamba".`;
  return [`${ro} ${say}`, en];
}
function pendingLine() {
  const p = pending;
  if (p.kind === "confirmBack") return LANG === "en" ? [`${p.labelEn}: is that right? Say "yes", or "no" to say it again.`, null] : [LANG === "hi" ? 'Theek hai? Boliye: "haan", ya dobara batane ke liye "nahi".' : 'Barobar? Mhana: "ho", kiva punha sangayla "nahi".', `${p.labelEn}: is that right? Say "yes" or "no".`];
  if (p.kind === "save" && p.missing) return LANG === "en" ? [`Still missing: ${p.missingEn}. Save anyway? Say "yes" or "no".`, null] : [LANG === "hi" ? `Baaki: ${p.missingEn}. Phir bhi save karun? Boliye: "haan" ya "nahi".` : `Baki: ${p.missingEn}. Tarihi jatan karu? Mhana: "ho" kiva "nahi".`, `Still missing: ${p.missingEn}. Save anyway?`];
  const en = p.kind === "save" ? (p.needName ? 'Say her name, or "yes" to save without it.' : 'Save? Say "yes" or "no".') : p.kind === "correct" ? `${FIELD[p.field]?.[0] || p.field} ${p.value}? Say "yes" or "no".` : 'Clear this visit? Say "yes" or "no".';
  if (LANG === "en") return [en, null];
  const hi = p.kind === "save" ? (p.needName ? 'Naam boliye, ya bina naam ke save karne ke liye "haan".' : 'Save karein? Boliye: "haan" ya "nahi".') : p.kind === "correct" ? `${p.value}? Boliye: "haan" ya "nahi".` : 'Yeh visit mita dein? Boliye: "haan" ya "nahi".';
  const mr = p.kind === "save" ? (p.needName ? 'Naav sanga, kiva navashivay jatan karayla "ho".' : 'Jatan karu? Mhana: "ho" kiva "nahi".') : p.kind === "correct" ? `${p.value}? Mhana: "ho" kiva "nahi".` : 'Hi bhet pusu? Mhana: "ho" kiva "nahi".';
  return [LANG === "hi" ? hi : mr, en];
}
// the phone's questions in Roman letters, for the screen
const ROQ = {
  "newborn:name": { hi: "Maa ka naam kya hai?", mr: "Aaiche naav kay aahe?" }, "newborn:weight_g": { hi: "Bachche ka wajan kitna hai?", mr: "Balache vajan kiti aahe?" }, "newborn:temp_c": { hi: "Bachche ka taapmaan kitna hai?", mr: "Balache taapmaan kiti aahe?" },
  "newborn:resp_rate": { hi: "Ek minute bachche ki saansein giniye.", mr: "Ek minit balache shwas moja." }, "newborn:feeding": { hi: "Kya bachcha doodh theek se pee raha hai?", mr: "Bal doodh neet pita ka?" }, "newborn:danger": { hi: "Koi jhatke, pasli chalna, ya hatheli peeli?", mr: "Jhatke, chhati aat odhne, kiva talve pivle?" },
  "anc:name": { hi: "Unka naam kya hai?", mr: "Tyancha naav kay aahe?" }, "anc:bp_sys": { hi: "BP kitna hai?", mr: "BP kiti aahe?" }, "anc:hb": { hi: "Hemoglobin kitna hai?", mr: "Hemoglobin kiti aahe?" }, "anc:weeks": { hi: "Kitne hafte, ya kaun sa mahina?", mr: "Kiti aathavde, kiva kitva mahina?" },
  "anc:fetal_movement": { hi: "Pet mein bachcha theek hil raha hai?", mr: "Potatla bal neet halta ka?" }, "anc:danger": { hi: "Koi khoon jaana, tez sirdard, ya dhundhla dikhna?", mr: "Raktasrav, khup dokedukhi, kiva dhusar disne?" },
  "pnc:name": { hi: "Unka naam kya hai?", mr: "Tyancha naav kay aahe?" }, "pnc:day": { hi: "Delivery ko kitne din hue?", mr: "Prasutila kiti divas zale?" }, "pnc:pads": { hi: "Din mein kitne pad?", mr: "Divasala kiti pad?" }, "pnc:temp_c": { hi: "Taapmaan kitna hai?", mr: "Taapmaan kiti aahe?" },
  "pnc:bp_sys": { hi: "BP kitna hai?", mr: "BP kiti aahe?" }, "pnc:hb": { hi: "Hemoglobin kitna hai?", mr: "Hemoglobin kiti aahe?" }, "pnc:danger": { hi: "Koi jhatke, dhundhla dikhna, tez sirdard, ya badbudaar paani?", mr: "Jhatke, dhusar disne, khup dokedukhi, kiva durgandhi srav?" },
};
// the error lines in Roman letters (English stays under them)
const ERR_RO = {
  "not-allowed": { hi: "Mic band hai. Keyboard ka mic dabakar boliye, ya type kijiye.", mr: "Mic band aahe. Keyboardcha mic dabun bola, kiva type kara." },
  "service-not-allowed": { hi: "Yeh browser sunne nahi de raha. Keyboard ka mic dabakar boliye, ya type kijiye.", mr: "Ha browser aikoo det nahi. Keyboardcha mic dabun bola, kiva type kara." },
  network: { hi: "Internet nahi hai. Keyboard ka mic dabakar neeche ke box mein boliye; visit isi phone par save hogi.", mr: "Internet nahi. Keyboardcha mic dabun khalchya box madhye bola; bhet yach phone var jatan hoil." },
  "audio-capture": { hi: "Mic nahi mila. Keyboard ka mic dabakar boliye, ya type kijiye.", mr: "Mic sapadla nahi. Keyboardcha mic dabun bola, kiva type kara." },
  unsupported: { hi: "Yeh browser sun nahi sakta. Keyboard ka mic dabakar boliye, ya Chrome kholiye.", mr: "Ha browser aiku shakat nahi. Keyboardcha mic dabun bola, kiva Chrome ughda." },
  "language-not-supported": { hi: "Yeh browser is bhasha mein nahi sun sakta. English chuniye, ya type kijiye.", mr: "Ha browser ya bhashet aiku shakat nahi. Hindi kiva English nivda." },
};
const closedStatus = (en) => { const k = saved ? "savedClosed" : utter.length ? "closed" : "idle"; return en ? tEn(k) : t(k); };
async function startListening(mode = "visit", { firstMs } = {}) {
  if (session) {
    if (mode === "visit" && session.mode === "answer") { session.byUser = true; session.noFollow = true; session.stop(); await new Promise((r) => setTimeout(r, 30)); }
    else return stopListening();
  }
  if (!support().stt) { showError("unsupported"); return; }
  lastError = null;
  if (mode === "visit") { quiet(); if (count) stopCount(); }
  $("#mic").classList.add("on"); $("#mic").setAttribute("aria-label", "Stop listening"); $("#mic").setAttribute("aria-pressed", "true"); wave.classList.add("on");
  $("#mic-label").innerHTML = lab("tapStop");
  // the first time the mic ever opens: one spoken line on what to say (can be turned off)
  if (mode === "visit" && !store.get("gb-guided") && store.get("gb-tips") !== "off") { store.set("gb-guided", true); say(L(GUIDE[TYPE]), { now: true }); }
  micOpenTone();
  let interimEl = null;
  if (mode === "visit" && !/Android|iPhone|iPad/.test(navigator.userAgent)) micMeter((v) => { $("#mic").style.setProperty("--lvl", v.toFixed(2)); const bars = wave.children; for (let k = 0; k < bars.length; k++) bars[k].style.height = `${4 + Math.max(0, v * 22 * (0.4 + 0.6 * Math.abs(Math.sin(k * 1.7 + Date.now() / 160))))}px`; }).then((s) => { if (session) stopMeter = s; else s && s(); });
  const me = dictate({
    lang: LANG, single: mode === "answer" || REC_MODE === "single",
    firstMs: firstMs || (mode === "answer" ? T.answerFirst : T.first), quietMs: T.quiet, pauseMs: mode === "visit" && REC_MODE !== "single" ? T.pause : null,
    onState: (s) => listeningStatus(s),
    onPause: () => maybeAsk(),
    keep: (t) => !!command(t), // a command is never thrown away as an echo
    onEcho: () => { echoTone(); if (Date.now() - lastEchoSay > 5000) { lastEchoSay = Date.now(); say(L(LINES.reprompt)); } },
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
  $("#mic-label").innerHTML = lab("tap");
  if (me && hold) stopHold();
  [...wave.children].forEach((b) => (b.style.height = "4px"));
  if (me) micCloseTone();
  if (count && me && !me.heard) stopCount();
  // no answer to "theek?": silence means yes, so the questions carry on
  if (me && !me.heard && pending?.kind === "confirmBack") { pending = null; afterTurn(); }
  if (lastError) { render(); return; } // keep the error on screen
  if (me && !me.heard && !me.byUser && !saved && !pending) {
    if (me.mode === "visit") { setStatus(t("nothing"), "err", LANG === "en" ? null : tEn("nothing")); say(L(LINES.nothing)); }
    else {
      setStatus(t("answerClosed"), "", LANG === "en" ? null : tEn("answerClosed"));
      if (!toldTapToAnswer) { toldTapToAnswer = true; say(L(LINES.tapToAnswer)); }
    }
  } else if (!pending) setStatus(closedStatus(), "", LANG === "en" ? null : closedStatus("en"));
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
  // read back in the unit she used
  temp_c: (r) => r.temp_f != null ? { hi: `तापमान ${r.temp_f} डिग्री फ़ारेनहाइट`, mr: `तापमान ${r.temp_f} डिग्री फॅरनहाइट`, en: `temperature ${r.temp_f} degrees Fahrenheit` } : r.temp_c != null && { hi: `तापमान ${r.temp_c} डिग्री`, mr: `तापमान ${r.temp_c} अंश`, en: `temperature ${r.temp_c} degrees` },
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
/** "No danger, but watch: low weight" in her language, or "" */
function watchTail(fl = flags) {
  const watch = fl.filter((f) => f.severity === "watch");
  if (!watch.length) return "";
  const names = watch.map((f) => reason(f, LANG)).join(", ");
  return LANG === "hi" ? `ध्यान रखें: ${names}।` : LANG === "mr" ? `लक्ष ठेवा: ${names}.` : `Watch: ${names}.`;
}
/** The record, said in her language (spoken only; the screen stays English). */
/** The record said in her language. `short` (before saving): only the name, the flagged values and the result. */
function readBackText({ short = false } = {}) {
  const parts = [];
  const flagged = new Set(flags.map((f) => flagField(f.code)).filter(Boolean));
  for (const [k] of tileList()) { if (short && k !== "name" && !flagged.has(k)) continue; const f = SP[k]; const v = f && f(record); if (v) parts.push(typeof v === "string" ? v : v[LANG] || v.en); }
  const yes = Object.entries(record.symptoms || {}).filter(([, v]) => v).map(([k]) => symSay(k));
  if (yes.length) parts.push(LANG === "hi" ? `लक्षण: ${yes.join(", ")}` : LANG === "mr" ? `लक्षणं: ${yes.join(", ")}` : `signs: ${yes.join(", ")}`);
  const refer = flags.filter((f) => f.severity === "refer_now"), watch = flags.filter((f) => f.severity === "watch");
  const names = watch.map((f) => reason(f, LANG)).join(", ");
  const end = refer.some(isUrgent) ? { hi: "ख़तरे का लक्षण है, अभी अस्पताल ले जाइए, 108 बुलाइए।", mr: "धोक्याचं लक्षण आहे, आत्ताच दवाखान्यात न्या, 108 बोलवा.", en: "Danger sign: go now, call 108." }
    : refer.length ? { hi: "ख़तरे का लक्षण है, आज ही रेफर कीजिए।", mr: "धोक्याचं लक्षण आहे, आजच रेफर करायचं.", en: "Danger sign: refer today." }
    : watch.length ? { hi: `ख़तरा नहीं, पर ध्यान रखें: ${names}।`, mr: `धोका नाही, पण लक्ष ठेवा: ${names}.`, en: `No danger, but watch: ${names}.` }
    : { hi: "ख़तरे का कोई लक्षण नहीं।", mr: "धोक्याचं लक्षण नाही.", en: "No danger signs." };
  const sep = LANG === "hi" ? "। " : ". ";
  const tail = refer.length && watch.length ? " " + watchTail() : "";
  return (parts.length ? parts.join(sep) + sep : "") + L(end) + tail;
}
function readBack() { if (!utter.length) return; say(readBackText(), { now: true }); }
$("#readback").addEventListener("click", readBack);

function askSave() {
  if (!utter.length || saved) return;
  pending = { kind: "save", needName: !record.name && !notChecked.has("name") }; asking = null;
  // fields not yet asked are said out loud first; "nahi" goes back to them
  const left = missing();
  if (left.length) {
    const labs = [...new Set(left.map((r) => missingLabel(r, LANG)))], labsEn = [...new Set(left.map((r) => missingLabel(r, "en")))];
    pending.missing = left.map(rowKey); pending.missingEn = labsEn.join(", "); pending.missingSay = missingLine(labs);
  }
  if (count) stopCount();
  render();
  { const [line, en] = pendingLine(); setStatus(line, "", en); }
  say(readBackText({ short: true }), { now: true });
  say(pending.missingSay || L(pending.needName ? LINES.noName : LINES.confirmSave)).then(() => { if (pending?.kind === "save") openAnswerMic(null); });
}
const SAY_MISSING = { name: ["नाम", "नाव", "name"], danger: ["ख़तरे के लक्षण", "धोक्याची लक्षणं", "danger signs"], feeding: ["दूध पीना", "दूध पिणे", "feeding"], fetal_movement: ["बच्चे का हिलना", "बाळाची हालचाल", "baby's movement"], birth_weight_g: ["जन्म का वज़न", "जन्माचं वजन", "birth weight"] };
function missingLabel(row, lang) {
  const i = lang === "hi" ? 0 : lang === "mr" ? 1 : 2, f = row[0];
  if (SAY_MISSING[f]) return SAY_MISSING[f][i];
  if (f === "day") return TYPE === "newborn" ? ["उम्र", "वय", "baby's age"][i] : SAY_FIELD.day[i];
  return SAY_FIELD[f]?.[i] || (lang === "en" ? (FIELD[f]?.[0] || pretty(f)).toLowerCase() : f);
}
function missingLine(labs) {
  const join = (a, and) => (a.length > 1 ? `${a.slice(0, -1).join(", ")} ${and} ${a[a.length - 1]}` : a[0]);
  return LANG === "hi" ? `${join(labs, "और")} अभी बाकी हैं। फिर भी सेव करूँ? हाँ या नहीं बोलिए।` : LANG === "mr" ? `${join(labs, "आणि")} अजून बाकी आहे. तरीही जतन करू? हो किंवा नाही सांगा.` : `${join(labs, "and")} still missing. Save anyway? Say yes or no.`;
}
/** "Phir se bolo": the current question or the open yes/no again; nothing changes. */
function repeatLine() {
  if (pending) { say(pendingSpoken(), { now: true }).then(() => { if (pending) openAnswerMic(null); }); return; }
  const q = asking || (!saved && utter.length ? nextQuestion() : null);
  if (!q) { say(L(LINES.helpVisit), { now: true }); return; }
  asking = q; render();
  say(followUp ? L(LINES.which) : L(q.q), { now: true }).then(() => openAnswerMic(q));
}
/** "Madad": three or four things she can say right now. */
function helpLine() {
  const q = asking;
  say(pending ? L(LINES.yesNo) : q ? L(LINES.helpQ) : L(LINES.helpVisit), { now: true }).then(() => { if (pending) openAnswerMic(null); else if (q) openAnswerMic(q); });
}
function pendingSpoken() {
  const p = pending;
  if (p.kind === "save") return p.missingSay || L(p.needName ? LINES.noName : LINES.confirmSave);
  if (p.kind === "clear") return L(LINES.confirmClear);
  if (p.kind === "confirmBack") return p.text;
  const lab = SAY_FIELD[p.field];
  return `${lab ? lab[LANG === "hi" ? 0 : LANG === "mr" ? 1 : 2] : p.field} ${p.value}?`;
}
/** The question that fills a field, to ask it again after "nahi". */
function questionFor(f) {
  const row = rowsFor().find((r) => fieldsOf(r).includes(f));
  if (row) return { key: rowKey(row), field: row[0], fields: fieldsOf(row), prefix: row[1], q: row[2], syms: row[3], yesno: !!row[5], timed: 0, roman: row[8] || null };
  const lab = SAY_FIELD[f] || [f, f, f];
  return { key: f, field: f, fields: [f], prefix: ANCHOR[f] || "", q: { en: `Say the ${lab[2]} again.`, hi: `${lab[0]} फिर से बताइए।`, mr: `${lab[1]} पुन्हा सांगा.` } };
}
function askClear() {
  if (!utter.length || saved) {
    const wasSaved = !!saved; saved = null; resetVisit();
    if (wasSaved) { say(L(LINES.newVisit), { now: true }); if (micState.granted) setTimeout(() => { if (!session) startListening("visit"); else { session.noFollow = true; session.byUser = true; session.stop(); setTimeout(() => startListening("visit"), 120); } }, 60); }
    return;
  }
  pending = { kind: "clear" }; asking = null; render();
  say(L(LINES.confirmClear), { now: true }).then(() => { if (pending?.kind === "clear") openAnswerMic(null); });
}
function confirmPending(yes) {
  const p = pending; pending = null;
  if (!p) return;
  if (p.kind === "save") {
    if (yes) save();
    else if (p.missing) { asked = new Map(); offerSave = false; say(L(LINES.backToQ), { now: true }); render(); maybeAsk(); } // back to the questions
    else { say(L(LINES.notSaved), { now: true }); render(); }
  }
  else if (p.kind === "confirmBack") {
    if (yes) { render(); if (session?.mode === "visit") { clearTimeout(turnTimer); turnTimer = setTimeout(() => maybeAsk(), 700); } else afterTurn(); }
    else {
      // "nahi": clear the value just said back and ask for that field again
      const f = p.fields[0];
      for (const k of p.fields.concat(f === "temp_c" ? ["temp_f"] : f === "bp_sys" ? ["bp_dia"] : [])) { delete record[k]; delete evidence[k]; }
      flags = check();
      const q = questionFor(f);
      asked.set(q.key, 1); asking = q; render();
      say(L(q.q), { now: true }).then(() => openAnswerMic(q));
    }
  }
  else if (p.kind === "clear") { if (yes) { clearVisit(); say(L(LINES.cleared), { now: true }); } else { say(L(LINES.kept), { now: true }); render(); } }
  else if (p.kind === "correct") {
    if (yes) applyCorrection(p.field, p.text, p.rest, p.via);
    else {
      const left = p.options.slice(1);
      if (left.length === 1) applyCorrection(left[0].field, p.text, p.rest, p.via);
      else if (left.length) { pending = { ...p, options: left, field: left[0].field, value: left[0].value }; const lab = SAY_FIELD[left[0].field]; say(`${lab ? lab[LANG === "hi" ? 0 : LANG === "mr" ? 1 : 2] : left[0].field} ${left[0].value}?`, { now: true }); render(); }
      else { say(L(LINES.noRecent), { now: true }); render(); }
    }
  }
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
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const yes = Object.entries(v.record.symptoms || {}).filter(([, x]) => x).map(([k]) => cap(symLabel(k)));
  const no = Object.entries(v.record.symptoms || {}).filter(([, x]) => !x).map(([k]) => symLabel(k));
  const unchecked = [...new Set([...notChecked].map((k) => FIELD[k]?.[0] || (k.startsWith("danger") ? "danger signs" : pretty(k))))];
  const notAsked = Array.isArray(v.notAsked) && v.notAsked.length ? v.notAsked : lastNotAsked;
  const heard = v.flags.filter((f) => f.from === "transcript" || f.conflict);
  return `<div class="saved-box">
    <div class="register"><div class="reg-head"><span>Village register · ${esc(TITLES[v.type])}</span><span>${new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
    <table>${rows.map(([l, x]) => `<tr><th>${esc(l)}</th><td>${esc(x)}</td></tr>`).join("")}${yes.length ? `<tr><th>Signs present</th><td>${esc(yes.join(", "))}</td></tr>` : ""}${no.length ? `<tr><th>Checked, not present</th><td>${esc(no.join(", "))}</td></tr>` : ""}${unchecked.length ? `<tr><th>Not checked</th><td>${esc(unchecked.join(", "))}</td></tr>` : ""}${notAsked.length ? `<tr><th>Not asked</th><td>${esc(notAsked.join(", "))}</td></tr>` : ""}<tr><th>Result</th><td>${refer.length ? stampHTML(refer, false).replace('class="stamp', 'class="stamp small-stamp') : v.flags.length ? "watch" : "no danger signs"}</td></tr></table></div>
    ${heard.length ? `<p class="alert watch" style="margin:0"><b>${heard.some((f) => f.conflict) ? "Said in the visit, but the record disagrees (the nurse will check):" : "Also heard in what was said:"}</b> ${esc(heard.map((f) => f.title).join(", "))}. The nurse will see this on the slip.</p>` : ""}
    <div class="saved-links">${refer.length && !queued ? `<a class="btn refer" href="/slip/${esc(v.id)}">Open the referral slip</a>` : ""}${refer.length ? `<a class="btn ghost" href="tel:108">Call 108</a>` : ""}${queued ? "" : `<a class="btn ghost" href="/anm">See it on the nurse's board</a>`}</div>
    <p class="faint" id="saved-note" style="margin:0">${queued ? "Saved on this phone. It will be sent to the nurse when there is signal." : `Saved to the register${refer.length ? " and sent to the nurse's board as an open referral" : ""}. ${v.via === "voice" ? "Recorded by voice." : "Typed."}`}</p></div>`;
}
async function save() {
  if (!utter.length || saving || saved) return;
  quiet();
  if (count) stopCount();
  if (session) { session.byUser = true; session.noFollow = true; session.stop(); }
  saving = true; pending = null;
  const btn = $("#save"); btn.disabled = true; $("#save [data-ui]").textContent = t("saving");
  record.type = TYPE;
  const body = { type: TYPE, record: JSON.parse(JSON.stringify(record)), said: utter.map((u) => u.text), lang: LANG, via: utter.every((u) => u.via !== "voice") ? "typed" : "voice" };
  if (personId) body.personId = personId;
  delete body.record.prev_weight_g; // the server sets the previous weight itself
  body.sid = sessionId(); // the demo board shows the sample village plus this browser's own saves
  if (record.name && NAME_BAD(record.name)) {
    // never send something that isn't a name to the board
    delete record.name; delete body.record.name;
    saving = false; $("#save [data-ui]").textContent = t("save");
    $("#saved").innerHTML = `<p class="alert watch" style="margin:0">That name doesn't look like a name (no brackets, signs or numbers, at most 3 words). Say or type her name again.</p>`;
    say(L(LINES.badName), { now: true });
    return askSave();
  }
  if (notChecked.size) body.notChecked = [...notChecked];
  const notAsked = [...new Set(missing().map((r) => missingLabel(r, "en")))];
  lastNotAsked = notAsked;
  if (notAsked.length) body.notAsked = notAsked;
  const tail = () => { const w = watchTail(); return w ? " " + w : ""; };
  const queue = () => {
    const it = { localId: Math.random().toString(36).slice(2), at: Date.now(), body };
    outbox.set([...outbox.get(), it]);
    const v = { ...body, at: it.at, flags: check(), id: null };
    saved = { queued: true };
    $("#saved").innerHTML = savedBox(v, { queued: true });
    say(L(LINES.queued) + tail(), { now: true });
    afterSaveMic();
    setStatus("Saved on this phone. It will be sent to the nurse when there is signal.", "wait");
  };
  try {
    if (!navigator.onLine) queue();
    else {
      const v = await api("/api/visits", body);
      saved = v;
      const refer = v.flags.some((f) => f.severity === "refer_now");
      $("#saved").innerHTML = savedBox(v);
      say(L(refer ? LINES.savedRefer : LINES.saved) + tail(), { now: true });
      afterSaveMic();
      setStatus(refer ? "Saved. The referral is on the nurse's board. Mic off." : "Saved to the village register. Mic off.");
      loadVillage();
    }
  } catch (e) {
    if (e.status && e.status < 500) {
      $("#saved").innerHTML = `<p class="alert watch" style="margin:0">${esc(e.message)} The visit is still on this screen; nothing was lost.</p>`;
      if (/name/i.test(e.message)) { say(L(LINES.badName), { now: true }); delete record.name; }
    }
    else queue();
  } finally {
    saving = false;
    $("#save [data-ui]").textContent = saved ? t("saved") : t("save");
    render();
    if (saved) $("#saved").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }
}
$("#save").addEventListener("click", save);
/* after saving: a short open mic for "naya" or "agla", so the next visit needs no tap */
function afterSaveMic() {
  say(L(LINES.nextVisit)).then(() => { if (saved && micState.granted && !session && !lastError) startListening("answer", { firstMs: T.afterSave }); });
}
/** Say corrected values back: "saans 39. Theek?" */
function speakBack(fields) {
  const sep = LANG === "hi" ? "। " : ". ";
  const keys = [...new Set(fields.map((f) => (f === "temp_f" ? "temp_c" : f === "bp_dia" ? "bp_sys" : f === "month" ? "weeks" : f)))].filter((f) => SP[f]?.(record));
  const said = keys.map((f) => { const sp = SP[f](record); return typeof sp === "string" ? sp : sp[LANG] || sp.en; });
  if (!said.length) return;
  // "theek?" is a real question: the phone waits for haan / nahi before asking anything else
  const text = said.join(sep) + sep + L(LINES.ok);
  const labelEn = keys.map((f) => { const sp = SP[f](record); return typeof sp === "string" ? sp : sp.en; }).join(", ");
  pending = { kind: "confirmBack", fields: keys, text, labelEn };
  render();
  say(text).then(() => { if (pending?.kind === "confirmBack") openAnswerMic(null); });
}
function snapshot() { return JSON.parse(JSON.stringify({ TYPE, utter, record, evidence, doubts, unread, spoken: [...spoken], skipped: [...skipped], notChecked: [...notChecked] })); }
function resetVisit() {
  clearTimeout(turnTimer); stopCount();
  utter = []; record = { type: TYPE }; evidence = {}; flags = []; doubts = {}; unread = []; spoken = new Set(); asked = new Map(); skipped = new Set(); notChecked = new Set();
  asking = null; followUp = null; pending = null; retries = 0; lastFilled = new Set(); saved = null; offerSave = false; lastError = null; toldTapToAnswer = false;
  stopHold(); stopAsking = false; lastBas = 0; shownRefer = new Set();
  if (banner?.kind !== "person") banner = null;
  $("#saved").innerHTML = ""; $("#save [data-ui]").textContent = t("save"); $("#typed").value = "";
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
  utter = s.utter; record = s.record; evidence = s.evidence; doubts = s.doubts; unread = s.unread || []; spoken = new Set(s.spoken); skipped = new Set(s.skipped); notChecked = new Set(s.notChecked);
  flags = check(); banner = null; asked = new Map();
  say(L(LINES.restored), { now: true });
  render();
}
$("#clear").addEventListener("click", () => { quiet(); if (session) stopListening(); clearVisit(); });
// the typing box: read by a tap, or by itself ~1.5 s after typing or keyboard dictation pauses
let typedTimer = null;
function readTyped() { clearTimeout(typedTimer); const t = $("#typed").value; if (t.trim()) { $("#typed").value = ""; take(t, "typed"); } }
$("#typed-go").addEventListener("click", readTyped);
$("#typed").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); readTyped(); } });
$("#typed").addEventListener("input", () => { clearTimeout(typedTimer); typedTimer = setTimeout(readTyped, T.typed); });

/* ---------- pickers ---------- */
function paintType() {
  store.set("gb-type", TYPE);
  document.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === TYPE)));
  drawExamples();
}
function switchType(t, { announce }) {
  if (!TILES[t] || t === TYPE) { render(); return; }
  TYPE = t; paintType();
  asked = new Map(); asking = null; followUp = null; skipped = new Set(); notChecked = new Set(); offerSave = false; stopCount();
  if (saved) resetVisit(); else { rebuild(); spoken = new Set(); speakNewDangersQuiet(); }
  if (announce) say(L(TYPE_SAY[t]), { now: true });
  render();
}
function speakNewDangersQuiet() { flags = check(); const fresh = flags.filter((f) => f.severity === "refer_now"); for (const f of fresh) spoken.add(f.code); if (fresh.length) say(fresh.map((f) => L(f.say) || f.title).join(" ")); }
function paintUI() {
  document.documentElement.dataset.uilang = LANG;
  // her language first, the English under it, so anyone can operate the screen
  document.querySelectorAll("[data-ui]").forEach((el) => { const v = t(el.dataset.ui); if (typeof v === "string") el.innerHTML = lab(el.dataset.ui); });
  document.querySelectorAll("[data-cmd]").forEach((el) => { const v = t(el.dataset.cmd); el.textContent = v ? `or say "${v}"` : ""; });
  const hs = document.querySelector(".how-to > summary"); if (hs) hs.setAttribute("aria-label", `${t("howTo")} (${UI.en.howTo})`);
  if (!session) $("#mic-label").innerHTML = lab("tap");
  if (!session && !lastError && !saved && !pending) setStatus(closedStatus(), "", LANG === "en" ? null : closedStatus("en"));
}
function setLang(l) {
  LANG = l; store.set("gb-lang", l);
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
  paintUI();
  render();
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
    const s = await api(`/api/state?sid=${encodeURIComponent(sessionId())}`);
    const due = s.people.filter((p) => p.dueToday);
    $("#village").innerHTML = `<div class="vil">
      <div><span>Open referrals</span><b>${s.totals.openReferrals}</b></div>
      <div><span>Visits due today</span><b>${s.totals.dueToday}</b></div>
      ${due.slice(0, 5).map((p) => `<div><a href="/visit?type=${p.kind === "baby" ? "newborn" : p.kind === "pregnant" ? "anc" : "pnc"}&person=${encodeURIComponent(p.id)}">${esc(p.name)}${p.kind === "baby" ? "'s baby" : ""}</a><span class="faint">${p.kind === "baby" ? `day ${p.dayOfLife}${p.atRisk ? ", 9-visit plan" : ""}` : p.kind === "pregnant" ? `${p.weeks} weeks pregnant` : `day ${p.dayAfter} after birth`}</span></div>`).join("")}
      <p class="faint" style="margin:6px 0 0">${esc(s.village.name)}, ${esc(s.village.block)}${s.village.sample ? " (made-up sample data)" : ""}</p></div>`;
    if (personId && !personLabel) {
      const p = s.people.find((x) => x.id === personId);
      if (p) { personLabel = p.kind === "baby" ? `${p.name}'s baby` : p.name; if (!banner) banner = { kind: "person", label: personLabel }; render(); }
      else personId = null;
    }
  } catch { $("#village").innerHTML = `<p class="faint">Couldn't reach the register. Visits still work on this screen, and save on this phone.</p>`; }
}

/* ---------- on phones, long side sections start folded ---------- */
if (isPhone()) document.querySelectorAll("details[data-fold-phone]").forEach((d) => (d.open = false));
const gl = $("#glossary"); if (gl) gl.innerHTML = glossaryHTML({ open: false });
// the spoken tip on first mic use can be switched off
const tips = $("#tips");
if (tips) { tips.checked = store.get("gb-tips") !== "off"; tips.addEventListener("change", () => { store.set("gb-tips", tips.checked ? "on" : "off"); if (tips.checked) store.set("gb-guided", false); }); }

$("#mic-mode").textContent = REC_MODE === "single" ? "Mic mode: one answer at a time (Android)" : "Mic mode: continuous";
setLang(LANG);
paintType();
render(); loadVillage(); flushOutbox();
if (!support().stt) { setStatus("This browser can't listen for speech. Type the visit below, or open this page in Chrome or Edge."); $("#type-box").open = true; }
if (params.get("example") === "1") setTimeout(() => $("#examples .ex")?.click(), 500);
// Read-only view for automated checks
window.__gb = () => ({ recMode: REC_MODE, deadlineIn: session?.deadline ? session.deadline - Date.now() : null, TYPE, LANG, record, flags: flags.map((f) => f.code), utter: utter.length, session: !!session, mode: session?.mode || null, asking: asking?.key || null, pending: pending?.kind || null, doubts: Object.keys(doubts), notChecked: [...notChecked], skipped: [...skipped], saved: saved ? (saved.queued ? "queued" : saved.id) : null, outbox: outbox.get().length, lastError, status: $("#status").textContent, banner: banner?.kind || null, counting: !!count, said: utter.map((u) => u.text) });
window.__cmd = command;
