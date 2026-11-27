// The ASHA's visit. She speaks; the reader fills the record; the rules check it;
// the phone says the danger out loud; one tap saves it to the village register.
import { understand, romanize } from "./understand.js";
import { checkRecord } from "./rules.js";
import { dictate, speak, hush, micMeter, support, LANGS, pickVoice } from "./voice.js";
import { mountChrome, store, esc, api, ago } from "./ui.js";

mountChrome("/visit");
const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);

let TYPE = ["newborn", "anc", "pnc"].includes(params.get("type")) ? params.get("type") : store.get("gb-type") || "newborn";
let LANG = ["hi", "mr", "en"].includes(params.get("lang")) ? params.get("lang") : store.get("gb-lang") || "hi";
let utter = [];        // [{ text, via, prefix }]
let record = { type: TYPE };
let evidence = {};      // field -> { u, start, end }
let flags = [];
let spoken = new Set(); // alert codes already said out loud
let asked = new Set();  // fields already asked for
let asking = null;      // field the app just asked about
let session = null, stopMeter = null, lastFilled = new Set();

/* ---------- the record's fields, per visit ---------- */
const TILES = {
  newborn: [
    ["name", "Mother", (r) => r.name], ["day", "Day of life", (r) => r.day != null ? `day ${r.day}` : null],
    ["weight_g", "Weight", (r) => r.weight_g != null ? `${r.weight_g} g` : null], ["temp_c", "Temperature", (r) => r.temp_c != null ? `${r.temp_c} °C` : null],
    ["resp_rate", "Breaths a minute", (r) => r.resp_rate], ["feeding", "Feeding", (r) => r.feeding ? { good: "good", poor: "less", none: "not feeding" }[r.feeding] : null],
  ],
  anc: [
    ["name", "Name", (r) => r.name], ["weeks", "Pregnancy", (r) => r.weeks != null ? `${r.weeks} weeks` : r.month != null ? `month ${r.month}` : null],
    ["bp_sys", "Blood pressure", (r) => r.bp_sys != null ? `${r.bp_sys}/${r.bp_dia ?? "?"}` : null], ["hb", "Hb (g/dl)", (r) => r.hb],
    ["albumin", "Urine albumin", (r) => r.albumin ? (/\d/.test(r.albumin) ? `${r.albumin}+` : r.albumin) : null], ["fetal_movement", "Baby moving", (r) => r.fetal_movement],
  ],
  pnc: [
    ["name", "Name", (r) => r.name], ["day", "Days since birth", (r) => r.day != null ? `day ${r.day}` : null],
    ["pads", "Pads a day", (r) => r.pads], ["temp_c", "Temperature", (r) => r.temp_c != null ? `${r.temp_c} °C` : null],
  ],
};
const EXTRA = { anc: [["weight_kg", "Weight", (r) => r.weight_kg != null ? `${r.weight_kg} kg` : null], ["ifa_tablets", "Iron tablets", (r) => r.ifa_tablets]] };
const TITLES = { newborn: "Newborn visit", anc: "Pregnancy visit", pnc: "Mother after birth" };
const SYM_LABEL = {
  bleeding: "bleeding", leaking_fluid: "water leaking", convulsions: "fits", severe_headache: "severe headache", blurred_vision: "blurred vision", swelling_face_hands: "swollen face or hands",
  swelling_feet: "swollen feet", fever: "fever", breathless: "breathless", abdominal_pain: "stomach pain", vomiting: "vomiting", dizziness: "dizziness", burning_urine: "burning urine", foul_discharge: "foul discharge",
  heavy_bleeding: "heavy bleeding", abnormal_speech: "strange speech", breast_problem: "breast problem", chest_indrawing: "chest indrawing", lethargy: "moves only when touched", jaundice: "jaundice",
  jaundice_palms_soles: "yellow palms or soles", blood_stool: "blood in stool", cord_pus: "cord infection", skin_pustules: "skin pustules", eye_discharge: "eye discharge", cold_to_touch: "cold to touch",
  hot_to_touch: "hot to touch", weak_cry: "weak cry", diarrhoea: "loose motions",
};
// which fields a flag points at, so the tile turns red or amber
const FLAG_FIELD = {
  anc_imminent_eclampsia: "bp_sys", anc_preeclampsia: "bp_sys", anc_hypertension: "bp_sys", anc_severe_anaemia: "hb", anc_moderate_anaemia: "hb", anc_mild_anaemia: "hb", anc_fetal_movement: "fetal_movement",
  nb_very_low_weight: "weight_g", nb_low_weight: "weight_g", nb_fever: "temp_c", nb_hypothermia: "temp_c", nb_fast_breathing: "resp_rate", nb_not_feeding: "feeding", nb_poor_feeding: "feeding",
  pnc_heavy_bleeding: "pads", pnc_high_fever: "temp_c", pnc_fever: "temp_c",
};

/* ---------- what the app asks for when something is missing ---------- */
const ASK = {
  newborn: [
    ["weight_g", "वजन", { en: "What is the baby's weight?", hi: "बच्चे का वज़न कितना है?", mr: "बाळाचं वजन किती आहे?" }],
    ["temp_c", "तापमान", { en: "What is the baby's temperature?", hi: "बच्चे का तापमान कितना है?", mr: "बाळाचं तापमान किती आहे?" }],
    ["resp_rate", "साँस", { en: "Count the breaths for one minute. How many?", hi: "एक मिनट साँस गिनिए। कितनी हैं?", mr: "एक मिनिट श्वास मोजा. किती आहेत?" }],
    ["feeding", "", { en: "Is the baby feeding well?", hi: "क्या बच्चा दूध ठीक से पी रहा है?", mr: "बाळ दूध नीट पितं का?" }],
    ["danger", "", { en: "Any fits, chest indrawing, or yellow palms?", hi: "कोई झटके, पसली चलना, या हथेली पीली?", mr: "झटके, छाती आत ओढणे, किंवा तळवे पिवळे?" }, ["convulsions", "chest_indrawing", "jaundice_palms_soles", "lethargy"]],
  ],
  anc: [
    ["bp_sys", "बीपी", { en: "What is her blood pressure?", hi: "बीपी कितना है?", mr: "बीपी किती आहे?" }],
    ["hb", "हीमोग्लोबिन", { en: "Did you check her Hb?", hi: "हीमोग्लोबिन कितना है?", mr: "हिमोग्लोबिन किती आहे?" }],
    ["weeks", "", { en: "How many weeks, or which month?", hi: "कितने हफ्ते, या कौन सा महीना?", mr: "किती आठवडे, किंवा कितवा महिना?" }, null, ["weeks", "month"]],
    ["fetal_movement", "", { en: "Is the baby moving well?", hi: "पेट में बच्चा ठीक हिल रहा है?", mr: "पोटातलं बाळ नीट हलतं का?" }],
    ["danger", "", { en: "Any bleeding, severe headache, or blurred vision?", hi: "कोई खून जाना, तेज़ सिरदर्द, या धुंधला दिखना?", mr: "रक्तस्राव, खूप डोकेदुखी, किंवा धूसर दिसणे?" }, ["bleeding", "severe_headache", "blurred_vision", "convulsions"]],
  ],
  pnc: [
    ["day", "", { en: "How many days since the delivery?", hi: "डिलीवरी को कितने दिन हुए?", mr: "प्रसूतीला किती दिवस झाले?" }],
    ["pads", "पैड", { en: "How many pads a day?", hi: "दिन में कितने पैड?", mr: "दिवसाला किती पॅड?" }],
    ["temp_c", "तापमान", { en: "What is her temperature?", hi: "तापमान कितना है?", mr: "तापमान किती आहे?" }],
    ["danger", "", { en: "Any fits, blurred vision, or foul discharge?", hi: "कोई झटके, धुंधला दिखना, या बदबूदार पानी?", mr: "झटके, धूसर दिसणे, किंवा दुर्गंधी स्राव?" }, ["convulsions", "blurred_vision", "foul_discharge", "heavy_bleeding"]],
  ],
};
function missing() {
  return ASK[TYPE].filter(([field, , , syms, alts]) => {
    if (field === "danger") return !(syms || []).some((s) => record.symptoms && s in record.symptoms);
    return !(alts || [field]).some((f) => record[f] != null);
  });
}

/* ---------- examples (in Roman letters; the reader takes Devanagari too) ---------- */
const EXAMPLES = {
  newborn: [
    ["Hindi", "hi", "Sunita ka baby, saat din ka hai. Wajan ek kilo saat sau gram. Doodh kam pee raha hai, aur pasli chal rahi hai."],
    ["Marathi", "mr", "Rekhache baal, tisra divas. Vajan don kilo teenshe gram. Doodh neet pitay, taap nahi. Naal suklee aahe."],
    ["English", "en", "Meera's baby, day five, temperature 38.2, breathing 66 a minute, not able to feed."],
  ],
  anc: [
    ["Hindi", "hi", "Meena, battees hafte. BP ek sau chalis by nabbe, nahi nahi, ek sau pachaas by sau. Albumin do plus. Sar mein bahut dard hai."],
    ["Hindi", "hi", "Rajni, aathva mahina, Hb saadhe chhe hai, saans phoolti hai, bachcha theek hil raha hai."],
    ["English", "en", "Lalita, 38 weeks, water leaking since last night, baby moving less, BP 118 by 76."],
  ],
  pnc: [
    ["Hindi", "hi", "Sudha, delivery ko paanch din hue, din mein chhe pad badal rahi hai, chakkar aate hain."],
    ["English", "en", "Hema, day 3 after delivery, temperature 98.6, two pads a day, no fever, no foul smell, no fits."],
  ],
};

/* ---------- drawing ---------- */
function highlightUtterance(u, i) {
  const spans = Object.entries(evidence).filter(([, e]) => e.u === i).map(([f, e]) => ({ f, ...e })).sort((a, b) => a.start - b.start);
  let out = "", at = 0;
  const text = u.text;
  const dangerFields = new Set(flags.filter((x) => x.severity === "refer_now").map((x) => FLAG_FIELD[x.code]).filter(Boolean));
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
function symptomFlag(sym) {
  const probe = { type: TYPE, symptoms: { [sym]: true } };
  if (sym === "jaundice") probe.day = 0;
  return checkRecord(probe).map((f) => f.code)[0];
}

function render() {
  // spoken words
  $("#said").innerHTML = utter.length ? utter.map(highlightUtterance).join("") : `<p class="said faint">Nothing yet. Speak, type below, or try an example.</p>`;
  $("#said-note").textContent = utter.some((u) => /[ऀ-ॿ]/.test(u.text)) ? "Shown in Roman letters" : "";
  // tiles
  $("#record-title").textContent = TITLES[TYPE];
  const tiles = [...TILES[TYPE], ...(EXTRA[TYPE] || []).filter(([k]) => record[k] != null)];
  const level = {};
  for (const f of flags) { const fld = FLAG_FIELD[f.code]; if (fld) level[fld] = level[fld] === "danger" || f.severity === "refer_now" ? "danger" : "watch"; }
  let filled = 0;
  $("#tiles").innerHTML = tiles.map(([k, label, fmt]) => {
    const v = fmt(record);
    if (v != null && v !== "") filled++;
    const isNew = v != null && !lastFilled.has(k + ":" + v);
    return `<div class="tile ${v != null ? "filled tap" : ""} ${level[k] || ""} ${isNew ? "new" : ""}" data-f="${k}" ${v != null ? 'role="button" tabindex="0"' : ""} aria-label="${esc(label)}: ${esc(v ?? "not said")}"><small>${esc(label)}</small><b class="${v == null ? "empty" : ""}">${esc(v ?? "—")}</b></div>`;
  }).join("");
  lastFilled = new Set(tiles.map(([k, , fmt]) => k + ":" + fmt(record)));
  $("#filled-count").textContent = `${filled} of ${tiles.length} filled`;
  // symptoms
  const sy = Object.entries(record.symptoms || {});
  const refSyms = new Set(flags.filter((f) => f.severity === "refer_now").map((f) => f.code));
  $("#syms").innerHTML = sy.map(([k, v]) => {
    const code = v ? symptomFlag(k) : null;
    const cls = v ? (code && refSyms.has(code) ? "yes" : "yes watch") : "no";
    return `<span class="sym ${cls}" data-f="symptoms.${k}" role="button" tabindex="0">${esc(SYM_LABEL[k] || k.replace(/_/g, " "))}</span>`;
  }).join("");
  // tap a tile to light its words
  document.querySelectorAll("[data-f].tap, .sym[data-f]").forEach((el) => {
    const go = () => { const f = el.dataset.f; document.querySelectorAll(`mark[data-f="${f}"], mark[data-f="${f === "bp_sys" ? "bp_dia" : f}"]`).forEach((m) => { m.classList.add("flash"); setTimeout(() => m.classList.remove("flash"), 1200); }); };
    el.addEventListener("click", go); el.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), go()));
  });
  // alert
  const refer = flags.filter((f) => f.severity === "refer_now"), watch = flags.filter((f) => f.severity === "watch");
  const enough = filled >= 3 || Object.keys(record.symptoms || {}).length >= 2;
  let html = "";
  if (refer.length) {
    html = `<div class="alert"><span class="stamp press">REFER TODAY</span><h3>${esc(refer[0].title)}${refer.length > 1 ? `, and ${refer.length - 1} more` : ""}</h3><ul>${refer.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.why)} ${esc(f.action)} <span class="src">(${esc(f.source)})</span></li>`).join("")}</ul></div>`;
    if (watch.length) html += `<div class="alert watch" style="margin-top:10px"><h3>Also watch</h3><ul>${watch.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.why)} ${esc(f.action)}</li>`).join("")}</ul></div>`;
  } else if (watch.length) {
    html = `<div class="alert watch"><h3>No danger sign, but watch</h3><ul>${watch.map((f) => `<li><b>${esc(f.title)}.</b> ${esc(f.why)} ${esc(f.action)} <span class="src">(${esc(f.source)})</span></li>`).join("")}</ul></div>`;
  } else if (enough) {
    html = `<div class="alert ok"><h3>No danger signs in what was said</h3><p style="margin:0">Checked against ${TYPE === "newborn" ? "the 2026 newborn danger signs" : TYPE === "anc" ? "the MoHFW pregnancy danger signs" : "the post-delivery danger signs"}. A sign that wasn't said can't be checked.</p></div>`;
  }
  $("#alert").innerHTML = html;
  $("#fired").innerHTML = flags.length ? `<div class="fired">${flags.map((f) => `<div class="${f.severity === "watch" ? "watch" : ""}"><b>${esc(f.title)}</b>${esc(f.why)}<br><span class="faint">${esc(f.source)} · rule ${esc(f.code)}</span></div>`).join("")}</div>` : `<p class="faint">None yet.</p>`;
  // ask
  const miss = missing();
  const ask = $("#ask");
  if (utter.length && miss.length && !session) {
    const [field, , q] = miss[0];
    ask.hidden = false;
    ask.innerHTML = `<div style="flex:1"><span class="faint">Still to check</span><b>${esc(q.en)}</b></div><button class="btn small voice" id="answer">Answer</button><button class="btn small ghost" id="skip">Skip</button>`;
    $("#answer").onclick = () => { asking = field; startListening(); };
    $("#skip").onclick = () => { asked.add(field); if (field === "danger") { /* leave as not checked */ } render(); };
    if (!asked.has(field)) { asked.add(field); asking = field; speak(q[LANG] || q.en, LANG); }
  } else ask.hidden = true;
  $("#save").disabled = !utter.length;
  $("#readback").disabled = !utter.length;
}

/* ---------- reading what was said ---------- */
function take(text, via = "voice") {
  text = String(text || "").trim();
  if (!text) return;
  // voice commands
  const cmd = text.toLowerCase();
  if (/^(save|save karo|save it|सेव|सेव करो|सेव कीजिए|जतन करा|सेव्ह करा)\.?$/.test(cmd)) return save();
  if (/^(new visit|naya|नया|नवीन)\.?$/.test(cmd)) return reset();
  // an answer to the app's own question is read with the question's anchor word in front
  const q = asking && ASK[TYPE].find(([f]) => f === asking);
  const prefix = q && q[1] && !/[0-9]/.test(q[1]) ? q[1] + " " : "";
  asking = null;
  const res = understand(prefix + text, TYPE);
  const u = utter.length;
  utter.push({ text, via });
  // merge: later values replace earlier ones; evidence points into this utterance
  const nr = res.record;
  for (const [k, v] of Object.entries(nr)) {
    if (k === "symptoms" || k === "type") continue;
    if (k === "name" && record.name && res.nameScore < 4) { delete res.evidence.name; continue; } // a weak guess never replaces a name already said
    record[k] = v;
  }
  if (nr.symptoms) record.symptoms = { ...(record.symptoms || {}), ...nr.symptoms };
  for (const [k, e] of Object.entries(res.evidence)) {
    const start = e.start - prefix.length, end = e.end - prefix.length;
    if (end <= 0) continue;
    evidence[k] = { u, start: Math.max(0, start), end };
  }
  record.type = TYPE;
  flags = checkRecord(record);
  // say each new danger once, in the ASHA's language
  const fresh = flags.filter((f) => f.severity === "refer_now" && !spoken.has(f.code));
  for (const f of fresh) spoken.add(f.code);
  if (fresh.length) { hush(); speak(fresh.map((f) => f.say[LANG] || f.say.en).join(" "), LANG); }
  render();
  if (/(save|सेव|जतन|refer karo|रेफर करो|रेफर करा)/i.test(cmd) && cmd.length < 40) save();
}

/* ---------- the microphone ---------- */
const wave = $("#wave");
wave.innerHTML = Array.from({ length: 24 }, () => "<i></i>").join("");
function setStatus(t) { $("#status").textContent = t; }
async function startListening() {
  if (session) return stopListening();
  if (!support().stt) { setStatus("This browser can't listen. Type the visit below instead, or use Chrome or Edge."); $("#type-box").open = true; return; }
  hush();
  $("#mic").classList.add("on"); $("#mic").setAttribute("aria-label", "Stop listening"); wave.classList.add("on");
  setStatus(`Listening in ${LANGS[LANG].label}… speak the visit, then pause.`);
  let interimEl = null;
  if (!/Android|iPhone|iPad/.test(navigator.userAgent)) micMeter((v) => { $("#mic").style.setProperty("--lvl", v.toFixed(2)); const bars = wave.children; for (let k = 0; k < bars.length; k++) bars[k].style.height = `${4 + Math.max(0, v * 22 * (0.4 + 0.6 * Math.abs(Math.sin(k * 1.7 + Date.now() / 160))))}px`; }).then((s) => { stopMeter = s; });
  session = dictate({
    lang: LANG,
    onInterim: (t) => {
      if (!interimEl) { interimEl = document.createElement("p"); interimEl.className = "said interim"; $("#said").appendChild(interimEl); document.querySelector("#said .faint")?.remove(); }
      interimEl.textContent = romanize(t);
    },
    onPhrase: (t) => { interimEl?.remove(); interimEl = null; take(t, "voice"); },
    onError: (e) => setStatus(e === "not-allowed" || e === "service-not-allowed" ? "The microphone is blocked. Allow it in the address bar, or type the visit below." : e === "network" ? "Speech recognition needs the internet in this browser. Type the visit below instead." : e === "language-not-supported" ? `This browser can't listen in ${LANGS[LANG].label}. Try Hindi or English, or type below.` : `Couldn't hear (${e}). Tap the mic to try again.`),
  });
  await session.done;
  interimEl?.remove();
  stopListening(true);
}
function stopListening(fromDone) {
  if (session && !fromDone) session.stop();
  session = null;
  stopMeter && stopMeter(); stopMeter = null;
  $("#mic").classList.remove("on"); $("#mic").setAttribute("aria-label", "Start speaking the visit"); wave.classList.remove("on");
  [...wave.children].forEach((b) => (b.style.height = "4px"));
  setStatus(utter.length ? "Tap the mic to add more, or save the visit." : "Tap the mic and say the visit, the way you would tell the ANM.");
  render();
}
$("#mic").addEventListener("click", () => { asking = asking || null; startListening(); });

/* ---------- read back, save, reset ---------- */
function readBack() {
  const parts = [];
  for (const [k, label, fmt] of [...TILES[TYPE], ...(EXTRA[TYPE] || [])]) { const v = fmt(record); if (v != null) parts.push(`${label}: ${v}`); }
  const yes = Object.entries(record.symptoms || {}).filter(([, v]) => v).map(([k]) => SYM_LABEL[k] || k);
  if (yes.length) parts.push(`signs: ${yes.join(", ")}`);
  const r = flags.filter((f) => f.severity === "refer_now");
  hush();
  speak(parts.join(". ") + "." + (r.length ? ` Refer today: ${r.map((f) => f.title).join(", ")}.` : " No danger signs."), "en");
}
$("#readback").addEventListener("click", readBack);

async function save() {
  if (!utter.length) return;
  const btn = $("#save"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    const v = await api("/api/visits", { type: TYPE, record, said: utter.map((u) => u.text), lang: LANG, via: utter.every((u) => u.via === "typed") ? "typed" : "voice" });
    const refer = v.flags.filter((f) => f.severity === "refer_now");
    const rows = [...TILES[TYPE], ...(EXTRA[TYPE] || [])].map(([k, label, fmt]) => [label, fmt(v.record)]).filter(([, x]) => x != null);
    const yes = Object.entries(v.record.symptoms || {}).filter(([, x]) => x).map(([k]) => SYM_LABEL[k] || k);
    const no = Object.entries(v.record.symptoms || {}).filter(([, x]) => !x).map(([k]) => SYM_LABEL[k] || k);
    $("#saved").innerHTML = `<div class="saved-box">
      <div class="register"><div class="reg-head"><span>Village register · ${esc(TITLES[TYPE])}</span><span>${new Date(v.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
      <table>${rows.map(([l, x]) => `<tr><th>${esc(l)}</th><td>${esc(x)}</td></tr>`).join("")}${yes.length ? `<tr><th>Signs present</th><td>${esc(yes.join(", "))}</td></tr>` : ""}${no.length ? `<tr><th>Checked, not present</th><td>${esc(no.join(", "))}</td></tr>` : ""}<tr><th>Result</th><td>${refer.length ? `<span class="stamp" style="font-family:var(--sans);font-size:14px">REFER TODAY</span>` : v.flags.length ? "watch" : "no danger signs"}</td></tr></table></div>
      <div class="saved-links">${refer.length ? `<a class="btn refer" href="/slip/${v.id}">Open the referral slip</a><a class="btn ghost" href="tel:108">Call 108</a>` : ""}<a class="btn ghost" href="/anm">See it on the nurse's board</a></div>
      <p class="faint" style="margin:0">Saved to the register${refer.length ? " and sent to the nurse's board as an open referral" : ""}. ${v.via === "voice" ? "Recorded by voice." : "Typed."}</p></div>`;
    btn.textContent = "Saved";
    $("#saved").scrollIntoView({ behavior: "smooth", block: "nearest" });
    loadVillage();
  } catch (e) {
    btn.disabled = false; btn.textContent = "Save visit";
    $("#saved").innerHTML = `<p class="alert watch" style="margin:0">${esc(e.message)} The visit is still on this screen; nothing was lost.</p>`;
  }
}
$("#save").addEventListener("click", save);
function reset() {
  hush(); if (session) stopListening();
  utter = []; record = { type: TYPE }; evidence = {}; flags = []; spoken = new Set(); asked = new Set(); asking = null; lastFilled = new Set();
  $("#saved").innerHTML = ""; $("#save").textContent = "Save visit"; $("#typed").value = "";
  render();
}
$("#clear").addEventListener("click", reset);
$("#typed-go").addEventListener("click", () => { const t = $("#typed").value; if (t.trim()) { take(t, "typed"); $("#typed").value = ""; } });
$("#typed").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#typed-go").click(); } });

/* ---------- pickers ---------- */
function setType(t) {
  TYPE = t; store.set("gb-type", t);
  document.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === t)));
  drawExamples(); reset();
}
function setLang(l) {
  LANG = l; store.set("gb-lang", l);
  document.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === l)));
}
document.querySelectorAll("[data-type]").forEach((b) => b.addEventListener("click", () => setType(b.dataset.type)));
document.querySelectorAll("[data-lang]").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
function drawExamples() {
  $("#examples").innerHTML = EXAMPLES[TYPE].map(([lab, lg, t], i) => `<button class="ex" data-i="${i}"><small>${esc(lab)}</small>${esc(t)}</button>`).join("");
  $("#examples").querySelectorAll(".ex").forEach((b) => b.addEventListener("click", () => {
    const [, lg, t] = EXAMPLES[TYPE][+b.dataset.i];
    reset(); setLang(lg); playExample(t);
  }));
}
// An example arrives the way speech does: phrase by phrase
async function playExample(t) {
  const parts = t.split(/(?<=[.?!।])\s+/);
  for (const p of parts) { take(p, "typed"); await new Promise((r) => setTimeout(r, 650)); }
}

/* ---------- the village panel ---------- */
async function loadVillage() {
  try {
    const s = await api("/api/state");
    const due = s.people.filter((p) => p.dueToday);
    $("#village").innerHTML = `<div class="vil">
      <div><span>Open referrals</span><b>${s.totals.openReferrals}</b></div>
      <div><span>Visits due today</span><b>${s.totals.dueToday}</b></div>
      ${due.slice(0, 5).map((p) => `<div><span>${esc(p.name)}${p.kind === "baby" ? "'s baby" : ""}</span><span class="faint">${p.kind === "baby" ? `day ${p.dayOfLife}${p.atRisk ? ", at risk" : ""}` : p.kind === "pregnant" ? `${p.weeks} weeks` : `day ${p.dayAfter} after birth`}</span></div>`).join("")}
      <p class="faint" style="margin:6px 0 0">${esc(s.village.name)}, ${esc(s.village.block)}${s.village.sample ? " (sample data)" : ""}</p></div>`;
  } catch { $("#village").innerHTML = `<p class="faint">Couldn't reach the register. Visits still work on this screen.</p>`; }
}

setLang(LANG);
document.querySelectorAll("[data-type]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.type === TYPE)));
drawExamples(); render(); loadVillage();
if (!support().stt) setStatus("This browser can't listen for speech. Type the visit below, or open this page in Chrome or Edge.");
if (params.get("example") === "1") setTimeout(() => $("#examples .ex")?.click(), 500);
// Read-only view for automated checks
window.__gb = () => ({ TYPE, LANG, record, flags: flags.map((f) => f.code), utter: utter.length, session: !!session });
