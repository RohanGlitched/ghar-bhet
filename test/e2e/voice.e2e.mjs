// Voice-loop checks in a real browser, with no microphone: a fake
// SpeechRecognition lets the test "say" phrases and fire errors, and a stub
// speechSynthesis records every line the phone speaks (and whether the
// recogniser was running at that moment, which must never happen).
//
//   node test/e2e/voice.e2e.mjs [baseUrl] [--shots outDir] [--only name,name]
//
// Run it against a local server started with ALLOW_RESET=1 so the register can
// be reset first, for example:
//   PORT=8091 ALLOW_RESET=1 DATA_DIR=/tmp/gb node server/index.js
import { createRequire } from "module";
import fs from "fs";
// `npm test` (node --test) picks up every file under test/; this one needs a
// browser and a running server, so it only runs when called directly.
if (process.env.NODE_TEST_CONTEXT) { console.log("voice.e2e.mjs: run it directly with node; skipped under node --test"); process.exit(0); }
const require = createRequire("I:/Programs/ListofHackathon/hackathons/27-midnight-buildathon/tell/package.json");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const BASE = (args.find((a) => /^https?:/.test(a)) || "http://localhost:8091").replace(/\/$/, "");
const SHOTS = args.includes("--shots") ? args[args.indexOf("--shots") + 1] : null;
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const FAST = { first: 2500, pause: 1500, quiet: 8000, answerFirst: 3000, step: 120 };

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

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
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
  const readBack = sp.some((t) => /बीपी 120 बटा 80/.test(t));
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
  // a phrase right after the phone stops is dropped (echo window)
  await page.waitForFunction(() => !window.speechSynthesis.speaking && window.__sr.current?.running, null, { timeout: 8000 });
  const before = (await gb(page)).utter;
  await page.evaluate(() => window.__say("Rekha ka baby wajan do kilo"));
  await sleep(200);
  const mid = (await gb(page)).utter;
  // the phone's own Marathi line coming back later is dropped too
  await ready(page);
  await page.evaluate((t) => window.__say(t), sp[sp.length - 1].text);
  await sleep(200);
  const mid2 = (await gb(page)).utter;
  await say(page, "taapmaan saintees");
  const after = (await gb(page)).utter;
  ok("half-duplex: mic off while the phone speaks, restarts after", dangerSpoken && micOffWhileSpeaking && (await page.evaluate(() => window.__sr.starts)) >= 2, `spoken=${sp.length} recRunningAtSpeak=${sp.map((x) => x.recRunning)}`);
  ok("half-duplex: phrase within 1 s of TTS end and own-voice echo are ignored; real speech still counts", mid === before && mid2 === before && after === before + 1, `utter ${before} -> ${mid} -> ${mid2} -> ${after}`);
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
  ok("quiet: mic waits ~8 s for first words, then says it heard nothing", still && !s.session && /Didn't hear anything/.test(s.status) && (await spoken(page)).some((t) => /कुछ सुनाई नहीं दिया/.test(t)), `at4s=${still} status=${s.status}`);
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
  await say(page, "bas");
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
  const m = ans.match(/^(\d+) to watch/);
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
  const undo = await page.$(`[data-open="${r0.id}"]`);
  if (undo) { await undo.click(); await sleep(600); }
  const re = (await (await fetch(BASE + "/api/state")).json()).referrals.find((r) => r.id === r0.id);
  ok("board: Undo re-opens a referral seen by mistake", re?.status === "open", re?.status);
  // a new referral arriving live is said out loud
  await fetch(BASE + "/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: "newborn", record: { type: "newborn", name: "Kavita", day: 4, weight_g: 1500 }, said: ["Kavita ka baby, wajan 1500"], lang: "hi", via: "typed" }) });
  const live = await until(page, () => window.__spoken.some((x) => /नया रेफरल: Kavita का बच्चा/.test(x.text)), null, 8000);
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
      if (path.startsWith("/visit")) { await page.waitForFunction(() => window.__gb().utter >= 4, null, { timeout: 15000 }).catch(() => {}); await sleep(1500); }
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
