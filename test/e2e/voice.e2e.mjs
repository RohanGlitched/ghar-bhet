// Voice-loop checks in a real browser, with no microphone: a fake
// SpeechRecognition lets the test "say" phrases and fire errors, and a stub
// speechSynthesis records every line the phone speaks (and whether the
// recogniser was running at that moment, which must never happen).
//
//   npm run e2e -- [baseUrl] [--shots outDir] [--only name,name]
//
// Setup, once: npm i --no-save playwright && npx playwright install chromium
// (or set GB_PLAYWRIGHT to the path of an installed playwright package).
// Run it against a local server started with ALLOW_RESET=1 so the register can
// be reset first, for example:
//   PORT=8091 ALLOW_RESET=1 DATA_DIR=/tmp/gb node server/index.js
import fs from "fs";
import { pathToFileURL } from "url";
// `npm test` (node --test) picks up every file under test/; this one needs a
// browser and a running server, so it only runs when called directly.
if (process.env.NODE_TEST_CONTEXT) { console.log("voice.e2e.mjs: run it directly with node; skipped under node --test"); process.exit(0); }
const pw = await import("playwright").catch(async () => {
  if (process.env.GB_PLAYWRIGHT) return import(pathToFileURL(process.env.GB_PLAYWRIGHT).href);
  console.error("Playwright is not installed. Run: npm i --no-save playwright && npx playwright install chromium");
  process.exit(1);
});
const { chromium } = pw.default || pw;
// system Chrome when it is there (closest to what an ASHA uses), else Playwright's Chromium
const CHANNEL = process.env.GB_CHANNEL ?? "chrome";

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || "http://localhost:8091").replace(/\/$/, "");
const SHOTS = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const FAST = { first: 2500, pause: 1500, quiet: 8000, answerFirst: 3000, step: 120, count: 3000, tick: 1000, typed: 600 };

const INIT = ({ timing }) => {
  if (timing) window.__GB_TIMING = timing;
  const sr = (window.__sr = { instances: [], starts: 0, aborts: 0, current: null });
  class FakeSR {
    constructor() { this.lang = ""; this.continuous = false; this.interimResults = false; this.running = false; this._results = []; sr.instances.push(this); }
    start() {
      if (this.running) throw new DOMException("already started", "InvalidStateError");
      this.running = true; sr.starts++; sr.current = this; this._results = [];
      setTimeout(() => { this.onstart && this.onstart(); this.onaudiostart && this.onaudiostart(); }, 5);
    }
    stop() { this._end(); }
    abort() { sr.aborts++; this._end(); }
    _end() { if (!this.running) return; this.running = false; if (sr.current === this) sr.current = null; setTimeout(() => this.onend && this.onend(), 5); }
  }
  window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  window.__say = (text, final = true) => {
    const r = sr.current; if (!r || !r.running) return false;
    const res = [{ transcript: text, confidence: 0.9 }]; res.isFinal = final;
    r._results.push(res);
    r.onresult && r.onresult({ resultIndex: r._results.length - 1, results: r._results });
    return true;
  };
  window.__srError = (error) => { const r = sr.current; if (!r) return false; r.onerror && r.onerror({ error }); r._end(); return true; };
  // count the phone's own tones (mic open/close, ticks)
  window.__osc = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) { const orig = AC.prototype.createOscillator; AC.prototype.createOscillator = function () { window.__osc++; return orig.call(this); }; }
  window.__spoken = []; window.__ttsEnd = 0;
  const ss = {
    speaking: false, pending: false, _cur: null, _t: null, onvoiceschanged: null,
    getVoices: () => [{ name: "Google हिन्दी", lang: "hi-IN" }, { name: "Google English India", lang: "en-IN" }, { name: "Marathi", lang: "mr-IN" }],
    speak(u) {
      window.__spoken.push({ text: u.text, lang: u.lang, recRunning: !!(sr.current && sr.current.running), at: Date.now() });
      if (this._cur) this.cancel();
      this.speaking = true; this._cur = u;
      this._t = setTimeout(() => { this.speaking = false; this._cur = null; window.__ttsEnd = Date.now(); u.onend && u.onend(); }, window.__ttsMs ?? 250);
    },
    cancel() { if (!this._cur) return; clearTimeout(this._t); const u = this._cur; this._cur = null; this.speaking = false; window.__ttsEnd = Date.now(); u.onerror && u.onerror({ error: "interrupted" }); },
  };
  Object.defineProperty(window, "speechSynthesis", { value: ss, configurable: true });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
};

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: CHANNEL || undefined, headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
async function open(path, { timing = FAST, width = 390, height = 844, scheme = "light" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: scheme, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT, { timing });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push(m.text()); });
  await page.goto(BASE + path, { waitUntil: "load" });
  if (!/^\/($|slip)/.test(path)) await page.waitForFunction(() => typeof window.__gb === "function" || typeof window.__ask === "function");
  return { ctx, page };
}
const gb = (page) => page.evaluate(() => window.__gb());
const spoken = (page) => page.evaluate(() => window.__spoken.map((s) => s.text));
const lastSpoken = async (page) => (await spoken(page)).slice(-1)[0] || "";
// wait until the recogniser is listening, the phone is quiet and the echo window has passed
async function ready(page, timeout = 8000) {
  await page.waitForFunction(() => window.__sr.current?.running && !window.speechSynthesis.speaking && Date.now() - window.__ttsEnd > 1150, null, { timeout });
}
async function say(page, text) { await ready(page); const r = await page.evaluate((t) => window.__say(t), text); await sleep(80); return r; }
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
async function tapMic(page) { await page.click("#mic"); await page.waitForFunction(() => window.__sr.current?.running, null, { timeout: 4000 }); }
// stop the mic by tap (she is done talking): the phone then asks for what is missing
async function stopMic(page) { await ready(page); await page.click("#mic"); await page.waitForFunction(() => !window.__gb().session || window.__gb().mode === "answer", null, { timeout: 4000 }); }
const run = async (name, fn) => {
  if (ONLY && !ONLY.some((o) => name.includes(o))) return;
  try { await fn(); } catch (e) { ok(name, false, "threw: " + e.message.split("\n")[0]); }
};

await fetch(BASE + "/api/reset", { method: "POST" }).catch(() => {});

/* 1. P0: only the exact command saves */
await run("loose save regex is gone (sevan, own Marathi alert)", async () => {
  const { ctx, page } = await open("/visit?type=anc&lang=hi");
  await tapMic(page);
  await say(page, "Sunita, saatva mahina, BP 120 by 80");
  await say(page, "आयरन की गोली का सेवन कर रही है");
  await sleep(400);
  let s = await gb(page);
  const a = !s.saved && !s.pending;
  await say(page, "आजच रेफर करा.");
  await sleep(400);
  s = await gb(page);
  ok("loose save regex is gone (sevan, own Marathi alert)", a && !s.saved && !s.pending, `saved=${s.saved} pending=${s.pending}`);
  // 2. exact command, read back, confirm with haan
  await say(page, "save karo");
  const asked = await until(page, () => window.__gb().pending === "save");
  await until(page, () => window.__gb().mode === "answer" && window.__sr.current?.running);
  const sp = await spoken(page);
  const readBack = sp.some((t) => /Sunita/.test(t) && /ख़तरे का कोई लक्षण नहीं/.test(t) && !/बीपी 120/.test(t)); // short read-back before saving
  const confirm = sp.some((t) => /सेव करूँ/.test(t));
  await say(page, "हाँ");
  const saved = await until(page, () => window.__gb().saved && window.__gb().saved !== "queued");
  await sleep(400);
  const after = await spoken(page);
  ok("'save karo' reads back in Hindi, asks, saves on haan, says it saved", asked && readBack && confirm && saved && after.some((t) => /विज़िट सेव हो गई/.test(t)), `readBack=${readBack} confirm=${confirm} saved=${saved}`);
  const st = await (await fetch(BASE + "/api/state")).json();
  ok("the saved visit reached the register", st.people.some((p) => /sunita/i.test(p.name) && p.kind === "pregnant" && p.visits > 0));
  await ctx.close();
});

await run("nahi cancels a voice save", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Rekha ka baby, teen din ka, wajan do kilo");
  await say(page, "सेव करो");
  await until(page, () => window.__gb().pending === "save");
  await until(page, () => window.__sr.current?.running);
  await say(page, "नहीं");
  await sleep(300);
  const s = await gb(page);
  ok("nahi cancels a voice save", !s.pending && !s.saved && (await spoken(page)).some((t) => /सेव नहीं किया/.test(t)), JSON.stringify({ pending: s.pending, saved: s.saved }));
  await ctx.close();
});

/* 3. half-duplex */
await run("half-duplex", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=mr", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka, wajan ek kilo saat sau gram, pasli chal rahi hai");
  await until(page, () => window.__spoken.length > 0);
  const sp = await page.evaluate(() => window.__spoken);
  const dangerSpoken = sp.length > 0;
  const micOffWhileSpeaking = sp.every((x) => !x.recRunning);
  // a quick reply right after the phone stops counts: only a phrase overlapping the phone's own line is dropped
  await page.waitForFunction(() => !window.speechSynthesis.speaking && window.__sr.current?.running, null, { timeout: 8000 });
  await sleep(300);
  await page.waitForFunction(() => !window.speechSynthesis.speaking && window.__sr.current?.running, null, { timeout: 8000 });
  const before = (await gb(page)).utter;
  const quick = await page.evaluate(() => { const ms = Date.now() - window.__ttsEnd; window.__say("saans chalis"); return ms; });
  await sleep(200);
  const mid = (await gb(page)).utter;
  // the phone's own Marathi line coming back is dropped, and a low tone plays
  await page.waitForFunction(() => !window.speechSynthesis.speaking && window.__sr.current?.running, null, { timeout: 8000 });
  const last = await lastSpoken(page);
  const osc0 = await page.evaluate(() => window.__osc);
  await page.evaluate((t) => window.__say(t), last);
  await sleep(200);
  const mid2 = (await gb(page)).utter;
  const osc1 = await page.evaluate(() => window.__osc);
  await say(page, "taapmaan saintees");
  const after = (await gb(page)).utter;
  ok("half-duplex: mic off while the phone speaks, restarts after", dangerSpoken && micOffWhileSpeaking && (await page.evaluate(() => window.__sr.starts)) >= 2, `spoken=${sp.length} recRunningAtSpeak=${sp.map((x) => x.recRunning)}`);
  ok("echo: a quick reply within 1 s of the phone stopping counts; the phone's own line is dropped with a low tone", quick < 1000 && mid === before + 1 && mid2 === mid && osc1 > osc0 && after === mid + 1, `quick=${quick}ms utter ${before} -> ${mid} -> ${mid2} -> ${after}, tones ${osc0} -> ${osc1}`);
  await ctx.close();
});

/* 4. mic errors stay on screen */
for (const [err, re, spokenRe] of [["not-allowed", /microphone is blocked/i, /माइक बंद है/], ["service-not-allowed", /won't let the page use speech/i, /माइक बंद है/], ["network", /No internet/i, /इंटरनेट नहीं/], ["audio-capture", /No microphone was found/i, /माइक नहीं मिला/], ["language-not-supported", /can.t listen in Hindi. Try English/i, null]]) {
  await run(`mic error ${err}`, async () => {
    const { ctx, page } = await open("/visit?type=newborn&lang=hi");
    await tapMic(page);
    await page.evaluate((e) => window.__srError(e), err);
    await sleep(700);
    const s = await gb(page);
    const typeOpen = await page.evaluate(() => document.querySelector("#type-box").open);
    const sp = await spoken(page);
    ok(`mic error ${err}: message stays, typing box opens${spokenRe ? ", spoken in Hindi" : ""}`, re.test(s.status) && typeOpen && !s.session && (!spokenRe || sp.some((t) => spokenRe.test(t))), s.status);
    await ctx.close();
  });
}

/* 5. quiet timing (real defaults) */
await run("quiet timing", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: null });
  await tapMic(page);
  await sleep(4000);
  const still = (await gb(page)).session;
  await page.waitForFunction(() => !window.__gb().session, null, { timeout: 7000 }).catch(() => {});
  await sleep(300);
  const s = await gb(page);
  ok("quiet: mic waits ~8 s for first words, then says it heard nothing", still && !s.session && /Didn't hear anything|Kuch sunai nahi/.test(s.status) && (await spoken(page)).some((t) => /कुछ सुनाई नहीं दिया/.test(t)), `at4s=${still} status=${s.status}`);
  // keeps listening across a 5 s pause mid-visit
  await tapMic(page);
  await say(page, "Sunita ka baby saat din ka");
  await sleep(5200);
  const open1 = (await gb(page)).session;
  await page.evaluate(() => window.__say("wajan do kilo"));
  await sleep(200);
  ok("quiet: a 5 s pause between phrases does not end the session", open1 && (await gb(page)).record.weight_g === 2000, `open=${open1}`);
  await ctx.close();
});

/* 6. yes / no answers to the app's own questions */
await run("yes/no Hindi newborn", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka, wajan do kilo, temperature 37, saans chalis");
  const q1 = await until(page, () => window.__gb().asking === "feeding" && window.__spoken.some((s) => /दूध ठीक से/.test(s.text)));
  await say(page, "हाँ");
  const fed = (await gb(page)).record.feeding;
  const q2 = await until(page, () => window.__gb().asking === "danger");
  await say(page, "नहीं");
  await sleep(300);
  const s = await gb(page);
  const syms = s.record.symptoms || {};
  ok("yes/no: haan to feeding = good (Hindi)", q1 && fed === "good", `asked=${q1} feeding=${fed}`);
  ok("yes/no: nahi to the danger list sets every sign in it to no and closes it", q2 && ["convulsions", "chest_indrawing", "jaundice_palms_soles", "lethargy"].every((k) => syms[k] === false) && s.asking !== "danger", JSON.stringify(syms));
  ok("all filled: the phone says 'say save'", await until(page, () => window.__spoken.some((x) => /सेव करो' बोलिए/.test(x.text))));
  await ctx.close();
});
await run("yes/no Marathi", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=mr");
  await tapMic(page);
  await say(page, "Rekhache baal, tisra divas, vajan don kilo, temperature 37, shwas chalis");
  await until(page, () => window.__gb().asking === "feeding");
  await say(page, "होय");
  const fed = (await gb(page)).record.feeding;
  await until(page, () => window.__gb().asking === "danger");
  await say(page, "नाही");
  await sleep(300);
  const syms = (await gb(page)).record.symptoms || {};
  ok("yes/no: Marathi hoy / nahi", fed === "good" && syms.convulsions === false, `feeding=${fed} syms=${JSON.stringify(syms)}`);
  await ctx.close();
});
await run("yes/no fetal movement + re-prompt", async () => {
  const { ctx, page } = await open("/visit?type=anc&lang=hi");
  await tapMic(page);
  await say(page, "Meena, battees hafte, BP ek sau bees by assi, Hb gyarah");
  await until(page, () => window.__gb().asking === "fetal_movement");
  await say(page, "kela");
  const re = await until(page, () => window.__spoken.some((x) => /समझ नहीं आया/.test(x.text)));
  await say(page, "हाँ");
  await sleep(200);
  ok("yes/no: haan to 'baby moving well?' = normal; unclear reply gets a spoken re-prompt", re && (await gb(page)).record.fetal_movement === "normal", `reprompt=${re} fm=${(await gb(page)).record.fetal_movement}`);
  await ctx.close();
});

/* 7. hands-free answers, skip and not checked */
await run("hands-free", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka");
  await stopMic(page);
  await until(page, () => !window.__gb().session);
  // the phone asks the next question, then opens the mic by itself
  const auto = await until(page, () => window.__gb().mode === "answer" && window.__gb().asking === "weight_g" && window.__sr.current?.running);
  await say(page, "do kilo do sau gram");
  const w = await until(page, () => window.__gb().record.weight_g === 2200);
  const auto2 = await until(page, () => window.__gb().mode === "answer" && window.__gb().asking === "temp_c" && window.__sr.current?.running);
  ok("hands-free: after a question the mic opens for one answer, then the next question", auto && w && auto2, `auto=${auto} weight=${w} next=${auto2}`);
  await say(page, "छोड़ो");
  const skipped = await until(page, () => window.__gb().skipped.includes("temp_c") && window.__gb().asking === "resp_rate");
  await until(page, () => window.__gb().mode === "answer" && window.__sr.current?.running);
  await say(page, "पता नहीं");
  const unchecked = await until(page, () => window.__gb().notChecked.includes("resp_rate"));
  ok("voice skip ('chhodo') and 'pata nahi' (not checked)", skipped && unchecked, JSON.stringify(await gb(page).then((s) => ({ skipped: s.skipped, notChecked: s.notChecked }))));
  // read back by voice, in Hindi; the screen stays Roman
  await until(page, () => window.__sr.current?.running);
  await say(page, "padh ke sunao");
  const rb = await until(page, () => window.__spoken.some((x) => /वज़न 2200 ग्राम/.test(x.text)));
  const dev = await page.evaluate(() => /[\u0900-\u097F]/.test(document.body.innerText));
  ok("'padh ke sunao' reads the record back in Hindi", rb);
  ok("no Devanagari on screen", !dev);
  await ctx.close();
});

/* 8. visit type and language by voice */
await run("type switch", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "मीना बत्तीस हफ्ते की गर्भवती है, बीपी एक सौ साठ बाय एक सौ बारह, सिर में बहुत दर्द है");
  await sleep(400);
  let s = await gb(page);
  const sw = s.TYPE === "anc" && s.banner === "switch" && s.flags.some((f) => f.startsWith("anc_")) && (await spoken(page)).some((t) => /गर्भवती की विज़िट लगती है/.test(t));
  ok("first words fit another visit type: switches and says so", sw, JSON.stringify({ TYPE: s.TYPE, flags: s.flags, banner: s.banner }));
  await page.click("#undo-switch");
  s = await gb(page);
  ok("switch has an undo", s.TYPE === "newborn");
  await say(page, "pregnancy visit");
  const t1 = (await gb(page)).TYPE;
  await say(page, "Marathi");
  await sleep(300);
  await page.waitForFunction(() => window.__sr.current?.running, null, { timeout: 4000 }).catch(() => {});
  const langRec = await page.evaluate(() => window.__sr.current?.lang);
  ok("voice commands set the visit type and the language (recogniser restarts in mr-IN)", t1 === "anc" && (await gb(page)).LANG === "mr" && langRec === "mr-IN", `type=${t1} lang=${(await gb(page)).LANG} rec=${langRec}`);
  await ctx.close();
});

/* 9. naya with an unsaved visit, and wapas */
await run("naya + wapas", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka, wajan do kilo");
  await say(page, "naya");
  const asked = await until(page, () => window.__gb().pending === "clear" && window.__spoken.some((x) => /मिटा दूँ/.test(x.text)));
  await until(page, () => window.__sr.current?.running);
  await say(page, "हाँ");
  const cleared = await until(page, () => window.__gb().utter === 0 && window.__gb().banner === "cleared");
  await until(page, () => window.__sr.current?.running);
  await say(page, "वापस");
  const back = await until(page, () => window.__gb().utter > 0 && window.__gb().record.weight_g === 2000);
  ok("'naya' on an unsaved visit asks first; 'wapas' brings it back", asked && cleared && back, `asked=${asked} cleared=${cleared} back=${back}`);
  await ctx.close();
});

/* 9b. a sign no rule covers is "noted", never "no danger signs"; pnc shows BP and Hb tiles */
await run("noted", async () => {
  const { ctx, page } = await open("/visit?type=anc&lang=en");
  await page.evaluate(() => (document.querySelector("#type-box").open = true));
  await page.fill("#typed", "Kiran, 24 weeks, BP 110 by 70, Hb 12, baby moving well, pairon mein sujan hai");
  await page.click("#typed-go");
  await sleep(400);
  const r = await page.evaluate(() => ({ noted: document.querySelector(".alert.noted")?.innerText || "", ok: !!document.querySelector(".alert.ok"), syms: window.__gb().record.symptoms }));
  ok("a sign said present that no rule flags shows 'Noted, tell the nurse', never the green box", /Noted, tell the nurse/.test(r.noted) && !r.ok, JSON.stringify(r));
  await page.click('[data-type="pnc"]');
  const tiles = await page.evaluate(() => [...document.querySelectorAll("#tiles .tile small span")].map((s) => s.textContent));
  ok("after-birth visit has BP and Hb tiles", tiles.includes("Blood pressure") && tiles.includes("Hb (g/dl)"), tiles.join(", "));
  await ctx.close();
});

/* ---------- round 2 ---------- */
await run("commands", async () => {
  const { ctx, page } = await open("/visit?type=anc&lang=hi");
  const cases = [["छोड़ दो", "skip"], ["रहने दो", "skip"], ["बाद में", "skip"], ["नहीं पता", "unchecked"], ["pata nahi", "unchecked"], ["nahi pata", "unchecked"], ["सेव कर दीजिए", "save"], ["सेव करना है", "save"], ["ठीक है सेव करो", "save"],
    ["सोडा", "skip"], ["राहू दे", "skip"], ["छोडो", "skip"], ["छोड़ो", "skip"], ["सेव्ह कर", "save"], ["नंतर", "skip"], ["सेव्ह करा", "save"], ["save karo please", "save"], ["sab theek hai, save kar dijiye", "save"], ["haan ji", "yes"], ["होय", "yes"], ["नहीं", "no"],
    ["सेवन", "null"], ["आजच रेफर करा", "null"], ["आयरन की गोली का सेवन कर रही है", "null"], ["Sunita ka baby", "null"], ["पढ़ के सुनाओ", "read"], ["वाचून दाखवा", "read"]];
  const got = await page.evaluate((c) => c.map(([t]) => String(window.__cmd(t))), cases);
  const bad = cases.map(([t, e], i) => [t, e, got[i]]).filter(([, e, g]) => e !== g);
  ok("commands: fillers stripped, both word orders, Marathi forms, no false command on content", !bad.length, bad.map(([t, e, g]) => `${t}: want ${e} got ${g}`).join(" | "));
  // during the BP question, "chhod do" skips; it never becomes a BP doubt
  await tapMic(page);
  await say(page, "Sunita, saatva mahina");
  await stopMic(page);
  const atBp = await until(page, () => window.__gb().asking === "bp_sys" && window.__gb().mode === "answer" && window.__sr.current?.running);
  await say(page, "छोड़ दो");
  await sleep(300);
  const s = await gb(page);
  ok("commands: 'chhod do' during the BP question skips it, with no BP doubt", atBp && s.skipped.includes("bp_sys") && !s.doubts.some((d) => /bp/.test(d)), JSON.stringify({ atBp, skipped: s.skipped, doubts: s.doubts }));
  await ctx.close();
  // a command word said with no question open never becomes a name
  const p2 = await open("/visit?type=anc&lang=hi");
  await tapMic(p2.page);
  await say(p2.page, "छोडो");
  await sleep(200);
  const s2 = await gb(p2.page);
  ok("commands: 'chhodo' with no question open is not taken as a name", !s2.record.name && s2.utter === 0, JSON.stringify({ name: s2.record.name, utter: s2.utter }));
  await p2.ctx.close();
});

await run("breath count", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  const osc0 = await page.evaluate(() => window.__osc);
  await tapMic(page);
  const openTone = (await page.evaluate(() => window.__osc)) > osc0;
  await say(page, "Sunita ka baby, saat din ka, wajan do kilo, temperature 37");
  await stopMic(page);
  const counting = await until(page, () => window.__gb().counting && window.__gb().mode === "answer" && window.__sr.current?.running);
  const hold = (await gb(page)).deadlineIn;
  const osc1 = await page.evaluate(() => window.__osc);
  await sleep(2300);
  const osc2 = await page.evaluate(() => window.__osc);
  const timeUp = await until(page, () => window.__spoken.some((x) => /समय पूरा/.test(x.text)), null, 4000);
  const askedOnce = (await spoken(page)).filter((t) => /साँसें गिनिए/.test(t)).length === 1;
  const stillOpen = (await gb(page)).session;
  await say(page, "pachaas");
  const got = await until(page, () => window.__gb().record.resp_rate === 50 && !window.__gb().counting);
  ok("breath count: timed minute, asked once, ticks, 'time up', mic open through it, answer taken", openTone && counting && hold >= 3000 && osc2 - osc1 >= 2 && timeUp && askedOnce && stillOpen && got, JSON.stringify({ openTone, counting, hold, ticks: osc2 - osc1, timeUp, askedOnce, stillOpen, got }));
  await ctx.close();
  // with the real timings the mic is held at least 75 s
  const p2 = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, count: 60000, tick: 15000 } });
  await tapMic(p2.page);
  await say(p2.page, "Sunita ka baby, saat din ka, wajan do kilo, temperature 37");
  await stopMic(p2.page);
  await until(p2.page, () => window.__gb().counting && window.__gb().mode === "answer");
  const hold2 = (await gb(p2.page)).deadlineIn;
  ok("breath count: with the real minute the mic is held at least 75 s", hold2 >= 74000, `held ${hold2} ms`);
  await p2.ctx.close();
});

await run("silent close", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka");
  await stopMic(page);
  await until(page, () => window.__gb().mode === "answer" && window.__gb().asking === "weight_g");
  const osc0 = await page.evaluate(() => window.__osc);
  const closed = await until(page, () => !window.__gb().session, null, 8000);
  await sleep(600);
  const s = await gb(page);
  const said = (await spoken(page)).filter((t) => /जवाब के लिए माइक दबाइए/.test(t)).length;
  ok("silent close in answer mode: closing tone, says 'tap the mic to answer' once, status says the mic is off", closed && said === 1 && /Mic off|Mic band/.test(s.status) && (await page.evaluate(() => window.__osc)) > osc0, JSON.stringify({ closed, said, status: s.status }));
  await ctx.close();
});

await run("watch spoken", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Rekha ka baby, saat din ka, wajan do kilo teen sau gram");
  await until(page, () => window.__spoken.length > 0);
  const watchSaid = (await gb(page)).flags.includes("nb_low_weight") && (await spoken(page)).length > 0;
  await page.waitForFunction(() => !window.speechSynthesis.speaking, null, { timeout: 8000 });
  await say(page, "padh ke sunao");
  const rb = await until(page, () => window.__spoken.some((x) => /ख़तरा नहीं, पर ध्यान रखें/.test(x.text)));
  ok("watch flags are spoken, and the read-back ends 'no danger, but watch: ...'", watchSaid && rb, await lastSpoken(page));
  await ctx.close();
});

await run("name", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "saat din ka baby, wajan do kilo");
  await stopMic(page);
  const asked = await until(page, () => window.__gb().asking === "name" && window.__spoken.some((x) => /माँ का नाम क्या है/.test(x.text)) && window.__gb().mode === "answer" && window.__sr.current?.running);
  await say(page, "सुनीता");
  const got = await until(page, () => window.__gb().record.name === "Sunita");
  ok("name is asked first when missing, and a bare spoken name fills it", asked && got, JSON.stringify((await gb(page)).record));
  await ctx.close();
  const p2 = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(p2.page);
  await say(p2.page, "saat din ka baby, wajan do kilo");
  await say(p2.page, "save karo");
  const askName = await until(p2.page, () => window.__gb().pending === "save" && window.__spoken.some((x) => /नाम नहीं बताया/.test(x.text)) && window.__sr.current?.running);
  await say(p2.page, "Rekha");
  const named = await until(p2.page, () => window.__gb().record.name === "Rekha" && window.__gb().pending === "save");
  await until(p2.page, () => window.__sr.current?.running);
  await say(p2.page, "हाँ");
  const savedOk = await until(p2.page, () => window.__gb().saved && window.__gb().saved !== "queued");
  ok("save with no name asks for it in the confirmation, takes the name, then saves on haan", askName && named && savedOk, JSON.stringify({ askName, named, savedOk }));
  await p2.ctx.close();
});

await run("keyboard dictation", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await ready(page);
  await page.evaluate(() => window.__srError("network"));
  await sleep(300);
  const said = (await spoken(page)).some((t) => /कीबोर्ड का माइक दबाकर बोलिए/.test(t));
  const focused = await page.evaluate(() => document.activeElement?.id === "typed");
  await page.type("#typed", "Sunita ka baby, saat din ka");
  const read = await until(page, () => window.__gb().utter === 1 && document.querySelector("#typed").value === "", null, 4000);
  ok("no internet: says 'tap your keyboard's mic', focuses the box, and reads it by itself when dictation pauses", said && focused && read, JSON.stringify({ said, focused, read }));
  await ctx.close();
});

await run("urgent", async () => {
  const { ctx, page } = await open("/visit?type=anc&lang=en");
  const rules = await page.evaluate(async () => (await import("/js/rules.js")).RULE_TABLE.map((r) => [r.code, !!r.urgent]));
  const urgentCodes = new Set(rules.filter(([, u]) => u).map(([c]) => c));
  const check = async (type, text) => {
    await page.evaluate((t) => document.querySelector(`[data-type="${t}"]`).click(), type);
    await page.evaluate(() => (document.querySelector("#type-box").open = true));
    await page.fill("#typed", text); await page.click("#typed-go"); await sleep(300);
    const r = await page.evaluate(() => ({ stamp: document.querySelector(".alert.refer .stamp")?.textContent, line: document.querySelector(".alert-do")?.textContent, flags: window.__gb().flags }));
    await page.click("#clear");
    return r;
  };
  const a = await check("anc", "Meena, battees hafte, BP 160 by 115");
  const b = await check("newborn", "Rekha ka baby, saat din ka, naal mein pus hai");
  const consistent = (r) => { const u = r.flags.some((c) => urgentCodes.has(c)); return u ? r.stamp === "GO NOW · 108" && /\b108\b/.test(r.line) : !r.stamp || (r.stamp === "REFER TODAY" && /today/i.test(r.line) && !/108/.test(r.line)); };
  ok("urgent rules show GO NOW · 108 and 'now, call 108'; non-urgent ones REFER TODAY and 'today' (from the rule's urgent field)", a.stamp === "GO NOW · 108" && consistent(a) && consistent(b), JSON.stringify({ a, b, ca: consistent(a), cb: consistent(b), nUrgent: urgentCodes.size }));
  await ctx.close();
  // the board puts it first with the same stamp; so does the slip
  const v = await (await fetch(BASE + "/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "anc", record: { type: "anc", name: "Urmila", weeks: 34, bp_sys: 168, bp_dia: 116 }, said: ["Urmila, 34 hafte, BP 168 by 116"], lang: "hi", via: "typed" }) })).json();
  const p2 = await open("/anm", { width: 1440, height: 900 });
  await p2.page.waitForSelector("#refs .ref");
  const first = await p2.page.evaluate(() => ({ name: document.querySelector("#refs .ref h3")?.textContent, stamp: document.querySelector("#refs .ref .stamp")?.textContent }));
  await p2.page.evaluate(() => window.__ask("Aaj kaun kaun refer hua?"));
  const spokenFirst = await lastSpoken(p2.page);
  await p2.ctx.close();
  const p3 = await open(`/slip/${v.id}`, { width: 390 });
  await p3.page.waitForSelector(".slip-head");
  const slip = await p3.page.evaluate(() => ({ stamp: document.querySelector(".slip .stamp")?.textContent, line: document.querySelector(".slip .do")?.textContent, gloss: !!document.querySelector(".slip .gloss-box") }));
  await p3.ctx.close();
  ok("urgent referral: first on the board with GO NOW · 108, said first and as urgent, and the slip agrees", first.stamp === "GO NOW · 108" && /तुरंत/.test(spokenFirst) && slip.stamp === "GO NOW · 108" && /108/.test(slip.line) && slip.gloss, JSON.stringify({ first, spokenFirst, slip }));
});

await run("correction", async () => {
  // the deck's example: "... temperature 38", then "nahi nahi, 37.8"
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Sunita ka baby 5 din ka, wajan 2800 gram, temperature 38");
  await say(page, "nahi nahi, 37.8");
  await sleep(300);
  let s = await gb(page);
  ok("correction (deck example): 'nahi nahi, 37.8' replaces the temperature 38 said before", s.record.temp_c === 37.8 && s.record.resp_rate == null && s.record.weight_g === 2800, JSON.stringify({ temp: s.record.temp_c, resp: s.record.resp_rate, flags: s.flags }));
  await ctx.close();
  // never into the pending question
  const p2 = await open("/visit?type=pnc&lang=hi");
  await tapMic(p2.page);
  await say(p2.page, "Sudha, delivery ko paanch din, temperature 38.5");
  await stopMic(p2.page);
  await until(p2.page, () => window.__gb().asking === "pads" && window.__gb().mode === "answer" && window.__sr.current?.running);
  await say(p2.page, "nahi nahi, 37.5");
  await sleep(300);
  s = await gb(p2.page);
  ok("correction while another question is pending goes to the last-said field, never to the question", s.record.temp_c === 37.5 && s.record.pads == null, JSON.stringify({ temp: s.record.temp_c, pads: s.record.pads }));
  await p2.ctx.close();
  // two fields from the same sentence fit: ask which
  const p3 = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(p3.page);
  await say(p3.page, "Rekha ka baby, saans 40, temperature 38");
  await say(p3.page, "nahi nahi, 39");
  const asked = await until(p3.page, () => window.__gb().pending === "correct" && window.__spoken.some((x) => /तापमान 39\?/.test(x.text)));
  await until(p3.page, () => window.__sr.current?.running);
  await say(p3.page, "हाँ");
  await sleep(300);
  s = await gb(p3.page);
  ok("ambiguous correction asks 'temperature 39?' and applies it on haan", asked && s.record.temp_c === 39 && s.record.resp_rate === 40, JSON.stringify({ asked, temp: s.record.temp_c, resp: s.record.resp_rate }));
  await p3.ctx.close();
});

await run("phone layout", async () => {
  const { ctx, page } = await open("/visit?example=1", { width: 390, height: 844, timing: { ...FAST } });
  await page.waitForFunction(() => window.__gb().utter >= 3 && window.__gb().flags.length, null, { timeout: 15000 });
  await sleep(400);
  await page.evaluate(() => scrollTo(0, 0));
  await sleep(300);
  const bar = await page.evaluate(() => { const b = document.querySelector("#refer-bar"); const r = b.getBoundingClientRect(); return { hidden: b.hidden, off: b.classList.contains("off"), text: b.innerText, top: r.top, h: r.height }; });
  const badge = await page.evaluate(() => document.querySelector('.bottom-bar a[href="/visit"] .badge')?.textContent);
  await page.click("#refer-bar a");
  await sleep(900);
  const inView = await page.evaluate(() => { const r = (document.querySelector("#alert-refer") || document.querySelector("#alert")).getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; });
  const intro = await page.evaluate(() => ({ lines: Math.round(document.querySelector(".v-intro p").getBoundingClientRect().height / 24), how: !document.querySelector(".how-to").open, side: !document.querySelector(".side-d").open, src: [...document.querySelectorAll(".src-d")].every((d) => !d.open) }));
  ok("phone: sticky refer bar under the header jumps to the alert; red badge on the visit tab", !bar.hidden && !bar.off && /REFER TODAY|GO NOW/.test(bar.text) && bar.top >= 55 && bar.top < 80 && +badge >= 1 && inView, JSON.stringify({ bar, badge, inView }));
  ok("phone: one-line intro, 'How to speak', side sections and sources folded", intro.lines <= 2 && intro.how && intro.side && intro.src, JSON.stringify(intro));
  // captions and the light danger tile
  const tiles = await page.evaluate(() => ({ cap: document.querySelector('.tile[data-f="weight_g"] .cap')?.textContent, bg: getComputedStyle(document.querySelector(".tile.danger")).backgroundColor, icon: document.querySelector(".tile .ic").getAttribute("width") }));
  await page.click('[data-lang="en"]');
  const capEn = await page.evaluate(() => document.querySelectorAll(".tile .cap").length);
  ok("tiles: Romanised caption in Hindi (none in English), 24 px icons, light danger tile on refer-soft", tiles.cap === "Wajan" && capEn === 0 && tiles.icon === "24" && tiles.bg === "rgb(251, 227, 222)", JSON.stringify({ ...tiles, capEn }));
  await ctx.close();
  const p2 = await open("/", { width: 390, height: 844 });
  const order = await p2.page.evaluate(() => { const t = (s) => document.querySelector(s).getBoundingClientRect().top; return t(".hero h1") < t(".hero .lead") && t(".hero .lead") < t(".hero .cta") && t(".hero .cta") < t(".hero-demo"); });
  ok("home: on a phone the headline, short lead and buttons come first, then the replay card", order);
  await p2.ctx.close();
});

await run("board r2", async () => {
  await fetch(BASE + "/api/reset", { method: "POST" }).catch(() => {});
  const { ctx, page } = await open("/anm", { width: 1440, height: 900 });
  await page.waitForSelector("#refs .ref .outcome button");
  const id = await page.evaluate(() => document.querySelector("#refs .ref").dataset.ref);
  await page.click(`#refs .ref[data-ref="${id}"] [data-outcome="reached"]`);
  await sleep(700);
  let st = await (await fetch(BASE + "/api/state")).json();
  const tapOk = st.referrals.find((r) => r.id === id)?.outcome === "reached";
  const other = st.referrals.find((r) => r.status === "open" && r.id !== id && !r.outcome) || st.referrals.find((r) => r.id !== id);
  await page.evaluate((n) => window.__ask(`${n} gaye nahi`), other.name);
  st = await (await fetch(BASE + "/api/state")).json();
  const voiceOk = st.referrals.find((r) => r.id === other.id)?.outcome === "refused";
  ok("board: referral outcome by tap (Reached) and by voice ('X gaye nahi' = refused)", tapOk && voiceOk, JSON.stringify({ tapOk, voiceOk }));
  // seen by voice, then a spoken "wapas" undoes it
  const open1 = st.referrals.find((r) => r.status === "open");
  await page.evaluate((n) => window.__ask(`${n} dekh liya`), open1.name);
  const seen = (await (await fetch(BASE + "/api/state")).json()).referrals.find((r) => r.id === open1.id)?.status;
  await page.evaluate(() => window.__ask("wapas"));
  const back = (await (await fetch(BASE + "/api/state")).json()).referrals.find((r) => r.id === open1.id)?.status;
  ok("board: 'X dekh liya' then 'wapas' undoes it", seen === "seen" && back === "open", `${seen} -> ${back}`);
  const misc = await page.evaluate(() => ({ csv: document.querySelector('a[href="/api/export.csv"]')?.textContent, gloss: !!document.querySelector("#glossary .gloss-box"), chip: [...document.querySelectorAll("#ask-chips button")].map((b) => b.dataset.q) }));
  const csv = await fetch(BASE + "/api/export.csv").then((r) => r.ok && r.headers.get("content-type")?.includes("csv"));
  ok("board: CSV export link works, glossary present, seen chip uses an open referral's name", /Export for the register/.test(misc.csv || "") && csv && misc.gloss && misc.chip.some((c) => c === `${st.referrals.find((r) => r.status === "open")?.name} dekh liya` || /dekh liya$/.test(c)), JSON.stringify({ ...misc, csv }));
  ok("board r2: no console errors", !page.errors.length, page.errors.join(" | "));
  await ctx.close();
  const p2 = await open("/visit", { width: 1440, height: 900 });
  ok("visit page has the shared glossary", await p2.page.evaluate(() => !!document.querySelector("#glossary .gloss-box")));
  await p2.ctx.close();
});

await run("doubts", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Rekha ka baby, saat din ka, wajan 400 gram");
  await stopMic(page);
  const asked = await until(page, () => window.__gb().asking === "doubt:weight_g" && window.__spoken.some((x) => /वज़न 400 ग्राम है/.test(x.text)) && window.__sr.current?.running);
  await say(page, "नहीं");
  const reask = await until(page, () => window.__spoken.some((x) => /कितना है, बताइए/.test(x.text)) && window.__sr.current?.running);
  await say(page, "do kilo");
  const fixed = await until(page, () => window.__gb().record.weight_g === 2000 && !window.__gb().doubts.length);
  ok("a half-heard weight is asked back ('400 grams?'); nahi asks again; the new value fills it", asked && reask && fixed, JSON.stringify({ asked, reask, fixed, rec: (await gb(page)).record }));
  await ctx.close();
  const p2 = await open("/visit?type=anc&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(p2.page);
  await say(p2.page, "Meena, battees hafte, BP 100 by 140");
  await stopMic(p2.page);
  const asked2 = await until(p2.page, () => window.__gb().asking === "doubt:bp" && window.__sr.current?.running);
  await say(p2.page, "हाँ");
  const bp = await until(p2.page, () => window.__gb().record.bp_sys === 140 && window.__gb().record.bp_dia === 100);
  ok("'Did you say BP 140 by 100?' then haan sets 140/100", asked2 && bp, JSON.stringify((await gb(p2.page)).record));
  await p2.ctx.close();
});

/* ---------- round 4 ---------- */
await run("turn timing", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka");
  await until(page, () => window.__gb().asking === "weight_g" && window.__spoken.some((x) => /वज़न कितना है/.test(x.text)), null, 8000);
  await ready(page);
  const t0 = await page.evaluate(() => { window.__say("do kilo aath sau gram"); return Date.now(); });
  const next = await until(page, () => window.__spoken.some((x) => /तापमान कितना है/.test(x.text)), null, 6000);
  const gap = await page.evaluate((t) => (window.__spoken.find((x) => /तापमान कितना है/.test(x.text))?.at || 0) - t, t0);
  ok("turn timing: in an open mic the next question comes < 1.2 s after an answer", next && gap > 0 && gap < 1200, `gap ${gap} ms`);
  await ctx.close();
});

await run("correction r4", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  await say(page, "Sunita ka baby saat din ka, doodh theek pee raha hai, saans pachaas, temperature 37");
  await say(page, "galat, doodh kam pee raha hai");
  await sleep(300);
  let s = await gb(page);
  const words = s.record.feeding === "poor" && (await spoken(page)).some((t) => /दूध कम पी रहा है। ठीक\?/.test(t));
  await say(page, "nahi nahi, 38.5");
  await sleep(300);
  s = await gb(page);
  const dec = s.record.temp_c === 38.5 && s.record.resp_rate === 50 && (await spoken(page)).some((t) => /तापमान 38.5 डिग्री। ठीक\?/.test(t));
  await say(page, "sorry, saadhe chhattees");
  await sleep(300);
  s = await gb(page);
  const saadhe = s.record.temp_c === 36.5;
  const n0 = (await spoken(page)).length;
  await say(page, "nahi nahi, saadhe chhattees");
  await sleep(300);
  const nothing = (await spoken(page)).slice(n0).some((t) => /किसका नंबर है/.test(t));
  ok("corrections: a non-number correction ('galat, doodh kam...') is read normally; 38.5 goes to temperature not breaths; saadhe works; each value is said back; no change gets a re-prompt", words && dec && saadhe && nothing, JSON.stringify({ words, dec, saadhe, nothing, rec: s.record }));
  await ctx.close();
});

await run("bas and ruko", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka");
  await say(page, "bas");
  const off = await until(page, () => !window.__gb().session && window.__spoken.some((x) => /ठीक है, माइक बंद/.test(x.text)));
  await sleep(1500);
  const noAsk = !(await spoken(page)).some((t) => /वज़न कितना है/.test(t));
  await tapMic(page);
  await say(page, "bas");
  const stopAsk = await until(page, () => window.__spoken.some((x) => /अब और नहीं पूछूँगी/.test(x.text)));
  await sleep(1200);
  const stillNoAsk = !(await spoken(page)).some((t) => /वज़न कितना है/.test(t));
  ok("'bas' closes the mic and the phone does not ask more; a second 'bas' stops the questions for this visit", off && noAsk && stopAsk && stillNoAsk, JSON.stringify({ off, noAsk, stopAsk, stillNoAsk }));
  await ctx.close();
  // "ruko": the answer mic waits (soft ticks), then the same question is asked again
  const p2 = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, hold: 3000, tick: 1000 } });
  await tapMic(p2.page);
  await say(p2.page, "Sunita ka baby, saat din ka");
  await stopMic(p2.page);
  await until(p2.page, () => window.__gb().asking === "weight_g" && window.__gb().mode === "answer" && window.__sr.current?.running);
  await say(p2.page, "ek minute");
  const waiting = await until(p2.page, () => window.__spoken.some((x) => /मैं रुकती हूँ/.test(x.text)));
  const osc0 = await p2.page.evaluate(() => window.__osc);
  await sleep(2200);
  const open2 = (await gb(p2.page)).session;
  const ticks = (await p2.page.evaluate(() => window.__osc)) - osc0;
  const reasked = await until(p2.page, () => window.__spoken.filter((x) => /वज़न कितना है/.test(x.text)).length === 2, null, 5000);
  await until(p2.page, () => window.__sr.current?.running);
  await say(p2.page, "do kilo aath sau gram");
  const got = await until(p2.page, () => window.__gb().record.weight_g === 2800);
  ok("'ek minute' holds the mic past the normal wait with soft ticks, then asks the same question again", waiting && open2 && ticks >= 1 && reasked && got, JSON.stringify({ waiting, open2, ticks, reasked, got }));
  await p2.ctx.close();
});

await run("save flow r4", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi", { timing: { ...FAST, pause: 60000 } });
  await tapMic(page);
  const guide = await until(page, () => window.__spoken.some((x) => /माँ का नाम, बच्चे की उम्र/.test(x.text)));
  await say(page, "Sunita ka baby saat din ka, wajan do kilo aath sau gram, temperature 37, saans chalis");
  await say(page, "save karo");
  await until(page, () => window.__gb().pending === "save" && window.__spoken.some((x) => /सेव करूँ/.test(x.text)));
  const rb = (await spoken(page)).find((t) => /Sunita/.test(t) && /लक्षण/.test(t)) || "";
  const short = /Sunita/.test(rb) && !/वज़न 2800/.test(rb);
  await until(page, () => window.__sr.current?.running);
  await say(page, "हाँ");
  await until(page, () => window.__gb().saved && window.__gb().saved !== "queued");
  const nextMic = await until(page, () => window.__spoken.some((x) => /अगली विज़िट के लिए/.test(x.text)) && window.__gb().session && window.__sr.current?.running);
  await say(page, "naya");
  const fresh = await until(page, () => !window.__gb().saved && window.__gb().utter === 0 && window.__spoken.some((x) => /नई विज़िट/.test(x.text)));
  const visitMic = await until(page, () => window.__gb().mode === "visit" && window.__sr.current?.running);
  ok("first mic open speaks a one-line guide; save reads back only the name and the result; after saving the mic listens for 'naya', which starts the next visit by voice", guide && short && nextMic && fresh && visitMic, JSON.stringify({ guide, rb, nextMic, fresh, visitMic }));
  await ctx.close();
  const p2 = await open("/visit?type=newborn&lang=hi");
  await p2.page.evaluate(() => { document.querySelector("#tips").click(); });
  await tapMic(p2.page);
  await sleep(400);
  ok("the spoken tip can be switched off", !(await spoken(p2.page)).some((t) => /माँ का नाम, बच्चे की उम्र/.test(t)));
  await p2.ctx.close();
});

await run("grouped alert", async () => {
  const { ctx, page } = await open("/visit?example=1", { width: 375, height: 812, timing: { ...FAST } });
  await page.waitForFunction(() => window.__gb().utter >= 3 && document.querySelector("#alert-refer"), null, { timeout: 15000 });
  await sleep(800);
  const r = await page.evaluate(() => {
    const a = document.querySelector("#alert-refer"), txt = a.innerText, count = (re) => (txt.match(re) || []).length;
    const ask = document.querySelector("#ask"), ar = a.getBoundingClientRect();
    return { doLines: a.querySelectorAll(".alert-do").length, otw: a.querySelectorAll(".otw li").length, onTheWay: count(/On the way/gi), skin: count(/skin to skin/gi), place: (txt.split(a.querySelector(".alert-do").textContent).length - 1),
      aboveQuestion: ask.hidden || ar.top < ask.getBoundingClientRect().top, inView: ar.top < innerHeight && ar.bottom > 0, focused: document.activeElement === a,
      rulesFound: document.querySelector(".v-side h2:not(.x)") && [...document.querySelectorAll(".v-side h2")].some((h) => h.textContent === "What the rules found"), watchTag: !!document.querySelector(".rules-found .lvl.watch"), glossClosed: !document.querySelector("#glossary details").open };
  });
  ok("grouped alert: one action line, one 'On the way' list, no repeated sentences", r.doLines === 1 && r.otw === 3 && r.onTheWay === 1 && r.skin === 1 && r.place === 1, JSON.stringify(r));
  ok("375: the red card sits under the transcript above the question, is scrolled into view and focused; side list is 'What the rules found' with watch tagged; glossary folded", r.aboveQuestion && r.inView && r.focused && r.rulesFound && r.watchTag && r.glossClosed, JSON.stringify(r));
  // the Romanised screen words follow the language
  const hi = await page.evaluate(() => { document.querySelector('[data-lang="hi"]').click(); return { save: document.querySelector("#save [data-ui]").textContent, cmd: document.querySelector("#save .cmd").textContent, who: document.querySelector("#lab-type").textContent, dev: /[ऀ-ॿ]/.test(document.body.innerText) }; });
  const en = await page.evaluate(() => { document.querySelector('[data-lang="en"]').click(); return document.querySelector("#save [data-ui]").textContent; });
  ok("language switch changes screen words to Romanised Hindi (with the voice command), English stays default, no Devanagari", hi.save === "Visit save karo" && hi.cmd === '"save karo"' && hi.who === "Kiske ghar gaye" && !hi.dev && en === "Save visit", JSON.stringify({ ...hi, en }));
  await ctx.close();
  // the slip: one destination; lower-level signs are context, never a second instruction
  const v = await (await fetch(BASE + "/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "anc", record: { type: "anc", name: "Rajni", month: 8, hb: 4.5, symptoms: { breathless: true } }, said: ["Rajni, aathva mahina, Hb saadhe chaar, saans phoolti hai"], lang: "hi", via: "typed" }) })).json();
  const p2 = await open(`/slip/${v.id}`, { width: 390 });
  await p2.page.waitForSelector(".slip-head");
  const slip = await p2.page.evaluate(() => { const t = document.querySelector("#slip").innerText; return { doLines: document.querySelectorAll(".slip .do").length, phcToday: /PHC today/i.test(t), also: /Also found/.test(t), flags: document.querySelectorAll(".slip-alert .signs li").length }; });
  await p2.ctx.close();
  ok("slip: one destination when two levels fire; the lower one is context only", slip.doLines === 1 && !slip.phcToday && slip.flags >= 2, JSON.stringify(slip));
  // the board: open cards show the first line with Show all; seen ones are one line per person, at most 3
  const p3 = await open("/anm", { width: 1440, height: 900 });
  await p3.page.waitForSelector("#refs .ref");
  const b = await p3.page.evaluate(() => ({ firstLine: !!document.querySelector("#refs .ref .ref-do")?.textContent, showAll: !!document.querySelector("#refs .ref details.show-all"), seen: [...document.querySelectorAll("#seen .seen-line")].map((d) => d.dataset.person), stat: document.querySelectorAll("#stats .stat span")[0].textContent, stat2: document.querySelectorAll("#stats .stat span")[1].textContent, chip: [...document.querySelectorAll("#ask-chips button small")].map((x) => x.textContent) }));
  ok("board: first instruction line + Show all; Seen recently one line per person (max 3); new labels; one translation for the referral question", b.firstLine && b.showAll && b.seen.length <= 3 && new Set(b.seen).size === b.seen.length && /not yet read/.test(b.stat) && /to keep an eye on/.test(b.stat2) && b.chip[0] === "Who was referred today?", JSON.stringify(b));
  await p3.ctx.close();
});

/* 10. offline */
await run("offline", async () => {
  const { ctx, page } = await open("/visit?type=newborn&lang=hi");
  await ctx.setOffline(true);
  // speech recognition needs the network in Chrome: it fails with "network"
  await tapMic(page);
  await say(page, "Sunita ka baby, saat din ka, wajan ek kilo saat sau gram");
  await ready(page);
  await page.evaluate(() => window.__srError("network"));
  await sleep(400);
  let s = await gb(page);
  const netMsg = /No internet/.test(s.status) && s.utter === 1 && (await page.evaluate(() => document.querySelector("#type-box").open));
  await page.evaluate(() => (document.querySelector("#type-box").open = true));
  await page.fill("#typed", "pasli chal rahi hai");
  await page.click("#typed-go");
  await page.click("#save");
  const queued = await until(page, () => window.__gb().saved === "queued" && window.__gb().outbox === 1);
  const pill = await page.evaluate(() => !document.querySelector("#outbox").hidden && document.querySelector("#outbox").textContent);
  const said = (await spoken(page)).some((t) => /फ़ोन में सेव हो गई/.test(t));
  const shown = await page.evaluate(() => /Saved on this phone/.test(document.querySelector("#saved").innerText));
  await ctx.setOffline(false);
  await page.evaluate(() => dispatchEvent(new Event("online")));
  const sent = await until(page, () => window.__gb().outbox === 0, null, 10000);
  ok("offline: network error from the recogniser is explained and the visit stays", netMsg, s.status);
  ok("offline: save keeps the visit on the phone, says so, shows the waiting pill, sends when back online", queued && pill === "1 visit waiting to send" && said && shown && sent, JSON.stringify({ queued, pill, said, shown, sent }));
  await ctx.close();
});

/* 11. the nurse's board */
await run("board", async () => {
  await fetch(BASE + "/api/reset", { method: "POST" }).catch(() => {});
  const { ctx, page } = await open("/anm", { width: 1440, height: 900 });
  await page.waitForFunction(() => document.querySelectorAll("#stats .stat").length === 4);
  const st = await (await fetch(BASE + "/api/state")).json();
  // thinking (while a person's last visit is fetched), then the answer
  const p0 = page.evaluate(() => { const p = window.__ask("Meena ka BP kitna tha?"); window.__thinking = document.querySelector("#ask-out").innerText; return p; });
  await p0;
  const thinking = await page.evaluate(() => window.__thinking);
  await page.evaluate(() => window.__ask("Aaj kaun kaun refer hua?"));
  const hi = await lastSpoken(page);
  const openRefs = st.referrals.filter((r) => r.status === "open");
  ok("board: shows Thinking, and the Hindi referral answer gives each reason", /Thinking/.test(thinking) && openRefs.length > 0 && /[\u0900-\u097F]+.*,/.test(hi) && openRefs.every((r) => hi.includes(r.name)), hi);
  // one definition for the tile and the answer
  await page.evaluate(() => window.__ask("Who is at risk?"));
  const tile = await page.evaluate(() => { const s = document.querySelectorAll("#stats .stat")[1]; return { n: +s.querySelector("b").textContent, names: s.querySelector("small")?.textContent || "" }; });
  const ans = await page.evaluate(() => document.querySelector("#ask-out p").textContent);
  const m = ans.match(/^(\d+) to keep an eye on/);
  ok("board: the 'to watch' tile and 'Who is at risk?' agree and list every name", m && +m[1] === tile.n && tile.names.split(", ").every((nm) => ans.includes(nm)), `tile=${tile.n} [${tile.names}] answer=${ans}`);
  // a person's last values
  const withBp = st.people.find((p) => p.kind === "pregnant" && p.last);
  if (withBp) {
    await page.evaluate((n) => window.__ask(`${n} ka BP kitna tha?`), withBp.name);
    const a = await page.evaluate(() => document.querySelector("#ask-out p").textContent);
    ok("board: a named person's last BP", new RegExp(`^${withBp.name}`).test(a) && /BP \d+\/\d+|no BP at the last visit/.test(a), a);
  }
  // "X dekh liya" marks it seen; Undo re-opens it
  await page.click("h1"); // the nurse has interacted, so sound is allowed
  const r0 = openRefs[0];
  await page.evaluate((n) => window.__ask(`${n} dekh liya`), r0.name);
  const seen = (await (await fetch(BASE + "/api/state")).json()).referrals.find((r) => r.id === r0.id);
  ok("board: 'X dekh liya' marks the referral seen", seen?.status === "seen", seen?.status);
  await page.waitForSelector(`[data-open="${r0.id}"]`, { timeout: 5000 }).catch(() => {});
  await page.evaluate((id) => document.querySelector(`[data-open="${id}"]`)?.closest("details")?.setAttribute("open", ""), r0.id);
  const undo = await page.$(`[data-open="${r0.id}"]`);
  if (undo) { await undo.click(); await sleep(600); }
  const re = (await (await fetch(BASE + "/api/state")).json()).referrals.find((r) => r.id === r0.id);
  ok("board: Undo re-opens a referral seen by mistake", re?.status === "open", re?.status);
  // a new referral arriving live is said out loud
  await fetch(BASE + "/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "newborn", record: { type: "newborn", name: "Kavita", day: 4, weight_g: 1500 }, said: ["Kavita ka baby, wajan 1500"], lang: "hi", via: "typed" }) });
  const live = await until(page, () => window.__spoken.some((x) => /नया (तुरंत )?रेफरल: Kavita का बच्चा/.test(x.text)), null, 8000);
  ok("board: a new live referral is spoken after the nurse has tapped", live, await lastSpoken(page));
  ok("board: no console errors", !page.errors.length, page.errors.join(" | "));
  await ctx.close();
});

/* 12. the stamp never covers text */
await run("stamp layout", async () => {
  const bad = [];
  for (const w of [375, 480, 560, 700, 1024, 1440]) {
    for (const path of ["/visit?type=newborn&lang=en", "/"]) {
      const { ctx, page } = await open(path, { width: w, height: 900, timing: { ...FAST, step: 60 } });
      if (path.startsWith("/visit")) { await page.evaluate(() => (document.querySelector("#type-box").open = true)); await page.fill("#typed", "Sunita ka baby, saat din ka hai. Wajan ek kilo saat sau gram. Doodh kam pee raha hai, aur pasli chal rahi hai."); await page.click("#typed-go"); }
      const found = await page.waitForSelector(".alert .stamp", { timeout: 15000 }).then(() => true, () => false);
      await sleep(900);
      const hits = await page.evaluate(() => {
        const out = [];
        for (const st of document.querySelectorAll(".alert .stamp")) {
          const a = st.getBoundingClientRect();
          for (const el of st.closest(".alert").querySelectorAll("h3, li, p, .alert-do")) {
            for (const b of el.getClientRects ? [...el.getClientRects()] : []) {
              if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(el.tagName + ":" + el.textContent.slice(0, 30));
            }
          }
        }
        return out;
      });
      if (!found || hits.length) bad.push(`${path}@${w}: ${found ? hits.join("; ") : "no stamp"}`);
      await ctx.close();
    }
  }
  ok("REFER TODAY stamp overlaps no text at 375/480/560/700/1024/1440 (visit + home hero)", !bad.length, bad.join(" | "));
});

/* 13. contrast, computed in the page */
await run("contrast", async () => {
  const rows = [];
  for (const scheme of ["light", "dark"]) {
    const { ctx, page } = await open("/visit?type=newborn&lang=en", { width: 390, scheme, timing: { ...FAST, step: 60 } });
    await page.evaluate(() => (document.querySelector("#type-box").open = true));
    await page.fill("#typed", "Sunita ka baby, saat din ka hai. Wajan ek kilo saat sau gram. Doodh kam pee raha hai, aur pasli chal rahi hai.");
    await page.click("#typed-go");
    await page.waitForSelector(".tile.danger");
    const r = await page.evaluate(() => {
      const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const cr = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
      const bg = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; el = el.parentElement; } return "rgb(255,255,255)"; };
      const pair = (sel) => { const el = document.querySelector(sel); return el ? cr(getComputedStyle(el).color, bg(el)) : null; };
      return { alertText: pair(".alert.refer li"), alertDo: pair(".alert-do"), alertSrc: pair(".alert.refer .why summary"), tileDangerValue: pair(".tile.danger b"), tileDangerLabel: pair(".tile.danger small span"), micStatus: pair("#status"), symYes: pair(".sym.yes"), tileValue: pair(".tile.filled:not(.danger) b"), micBg: getComputedStyle(document.querySelector(".v-mic")).backgroundColor };
    });
    rows.push({ scheme, ...r });
    await ctx.close();
  }
  console.table(rows);
  const light = rows[0], dark = rows[1];
  ok("contrast: dark alert >= 7:1, danger tile values >= 4.5:1 in both, mic panel dark in dark mode",
    dark.alertText >= 7 && dark.alertDo >= 7 && light.alertText >= 4.5 && light.tileDangerValue >= 4.5 && dark.tileDangerValue >= 4.5 && light.symYes >= 4.5 && dark.symYes >= 4.5 && /rgb\(11, 13, 16\)/.test(dark.micBg),
    JSON.stringify(rows));
});

/* 14. screenshots */
if (SHOTS) {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const [w, h, scheme] of [[1440, 900, "light"], [390, 844, "light"], [390, 844, "dark"], [375, 812, "light"]]) {
    for (const path of ["/visit?example=1", "/anm"]) {
      const { ctx, page } = await open(path, { width: w, height: h, scheme, timing: null });
      if (path.startsWith("/visit")) { await page.waitForFunction(() => window.__gb().utter >= 3, null, { timeout: 15000 }).catch(() => {}); await sleep(1500); }
      else await sleep(1200);
      const name = `${path.startsWith("/visit") ? "visit" : "anm"}-${w}-${scheme}.png`;
      await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: true });
      await ctx.close();
    }
  }
  const st = await (await fetch(BASE + "/api/state")).json();
  const rid = st.referrals[0]?.id;
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    for (const [path, name] of [[`/slip/${rid}`, "slip"], ["/slip/doesnotexist", "slip-missing"], ["/", "home"]]) {
      const { ctx, page } = await open(path, { width: w, height: h, timing: null });
      await sleep(name === "home" ? 8000 : 1500);
      await page.screenshot({ path: `${SHOTS}/${name}-${w}-light.png`, fullPage: name !== "home" });
      await ctx.close();
    }
  }
  console.log("screenshots in", SHOTS);
}

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
