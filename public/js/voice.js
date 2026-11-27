// Ghar Bhet: speaking and listening in the browser. No keys and no servers of
// our own: the browser's own voices and speech recognition do the work.
export const LANGS = {
  hi: { label: "Hindi", speech: "hi-IN" },
  mr: { label: "Marathi", speech: "mr-IN" },
  en: { label: "English", speech: "en-IN" },
};

const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
export const support = () => ({ tts: "speechSynthesis" in window, stt: !!SR });

let voices = [];
function loadVoices() { voices = window.speechSynthesis ? speechSynthesis.getVoices() : []; }
if (typeof window !== "undefined" && window.speechSynthesis) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }

/** The best voice for a language: Google's if there is one, then any Indian voice. */
export function pickVoice(lang) {
  if (!voices.length) loadVoices();
  const code = LANGS[lang]?.speech || "en-IN";
  const base = code.split("-")[0];
  const by = (pred) => voices.find(pred);
  return by((v) => v.lang === code && /google/i.test(v.name)) || by((v) => v.lang === code) || by((v) => v.lang?.replace("_", "-").startsWith(base))
    || (lang === "mr" ? pickVoice("hi") : null) // a Hindi voice reads Marathi well
    || (lang === "en" ? by((v) => /^en/.test(v.lang)) : null);
}
export const hasVoice = (lang) => !!pickVoice(lang) && (lang !== "mr" || !!voices.find((v) => v.lang?.startsWith("mr")));

let speakingToken = 0;
// Half-duplex: while the phone talks, the open microphone session is paused, so
// the recogniser never hears the phone's own words. `said` remembers the last
// line spoken and when it ended, so a late echo can still be thrown away.
let active = null;              // the dictation session that is open, if any
let pauseDepth = 0;
export const said = { text: "", endedAt: 0, speaking: false };
function holdMic() { pauseDepth++; said.speaking = true; if (pauseDepth === 1 && active) active.pause(); }
function freeMic() {
  pauseDepth = Math.max(0, pauseDepth - 1);
  if (pauseDepth) return;
  said.speaking = false; said.endedAt = Date.now();
  if (active) active.resume();
}
/** Say a line. Resolves when it has been spoken (or the call ended). */
export function speak(text, lang = "en", { rate = 0.9 } = {}) {
  const my = ++speakingToken;
  if (!text) return Promise.resolve();
  said.text = String(text);
  holdMic();
  return new Promise((resolve) => {
    let done = false, t = null;
    const fin = () => { if (done) return; done = true; clearTimeout(t); freeMic(); resolve(); };
    if (!window.speechSynthesis) { t = setTimeout(fin, 400 + text.length * 50); return; }
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = LANGS[lang]?.speech || "en-IN";
    u.rate = rate; u.pitch = 1.05;
    u.onend = fin; u.onerror = fin;
    t = setTimeout(fin, 3000 + text.length * 120); // some browsers never fire onend
    speechSynthesis.speak(u);
    if (my !== speakingToken) fin();
  });
}
const plainWords = (s) => String(s || "").toLowerCase().replace(/[.,!?;:।"'()\-]/g, " ").split(/\s+/).filter(Boolean);
// words that change a meaning: an answer holding one of these is never thrown away as an echo
const KEEP_WORDS = /(^|\s)(कम|नहीं|नही|नाही|ज़्यादा|ज्यादा|जास्त|कमी|बहुत|थोड़ा|थोडा|less|more|not|no|nahi|nahin|nai|kam|kami|zyada|jyada|jast|bahut|thoda|haan|हाँ|हां|होय|yes)(\s|$)/i;
/**
 * True when a heard phrase is most likely the phone's own voice coming back.
 * The mic is paused while the phone talks, so only a short tail can leak: a
 * phrase is dropped only if it comes within ~800 ms of the phone stopping AND
 * is a near word-for-word, in-order piece of the spoken line covering most of
 * it. Answers that repeat the question's words ("doodh kam pee raha hai") pass.
 */
export function isEcho(text, { windowMs = 800 } = {}) {
  if (said.speaking) return true;
  if (!said.text || Date.now() - said.endedAt > windowMs) return false;
  const a = plainWords(text), s = plainWords(said.text);
  if (a.length < 2 || !s.length || KEEP_WORDS.test(" " + a.join(" ") + " ")) return false;
  // the heard words must appear in the spoken line in the same order
  let j = 0, hits = 0;
  for (const w of a) { const k = s.indexOf(w, j); if (k >= 0) { hits++; j = k + 1; } }
  return hits / a.length >= 0.85 && hits / s.length >= 0.6;
}
export function hush() { speakingToken++; if (window.speechSynthesis) speechSynthesis.cancel(); }
/** Has the microphone worked at least once on this page? Then the app may open it by itself. */
export const micState = { granted: false };

/**
 * Listen once. Resolves with { alts: [...transcripts] } or { silent: true } or { blocked: true }.
 * onInterim(text) is called while the child is still speaking.
 */
export function listen({ lang = "en", timeout = 9000, onInterim } = {}) {
  return new Promise((resolve) => {
    if (!SR) return resolve({ unsupported: true });
    let rec, finished = false, heardAny = false;
    const finish = (v) => { if (finished) return; finished = true; clearTimeout(t); try { rec.abort(); } catch {} resolve(v); };
    try {
      rec = new SR();
      rec.lang = LANGS[lang]?.speech || "en-IN";
      rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
      rec.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        heardAny = true;
        if (res.isFinal) finish({ alts: [...res].map((a) => a.transcript.trim()).filter(Boolean) });
        else onInterim && onInterim(res[0].transcript);
      };
      rec.onerror = (e) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") finish({ blocked: true });
        else if (e.error === "no-speech") finish({ silent: true });
        else if (e.error === "aborted") finish({ silent: true });
        else if (e.error === "language-not-supported") finish({ unsupported: true });
        else if (e.error === "network") finish({ network: true });
      };
      rec.onend = () => { if (!finished) { if (heardAny) finish({ silent: true }); else try { rec.start(); } catch { finish({ silent: true }); } } };
      rec.start();
    } catch { return resolve({ unsupported: true }); }
    const t = setTimeout(() => finish({ silent: true }), timeout);
    listen.cancel = () => finish({ cancelled: true });
  });
}
listen.cancel = () => {};

/** A live microphone level, 0..1, for the "I'm listening" ring. */
export async function micMeter(onLevel) {
  if (!navigator.mediaDevices?.getUserMedia) return () => {};
  let stream, ctx, raf;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
    an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (const v of buf) { const x = (v - 128) / 128; sum += x * x; }
      onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
      raf = requestAnimationFrame(loop);
    };
    loop();
  } catch { return () => {}; }
  return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close(); };
}

/* small sounds for the phone */
let actx = null;
const ac = () => { if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} return actx; };
export function tone(freqs, dur, when = 0, vol = 0.07) {
  const a = ac(); if (!a) return;
  if (a.state === "suspended") a.resume();
  if (dur < 0.06) return; // just waking the audio up
  for (const f of freqs) {
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f; o.type = "sine";
    const t0 = a.currentTime + when;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.setValueAtTime(vol, t0 + dur - 0.03); g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
}
export const ring = () => { tone([400, 450], 0.4, 0); tone([400, 450], 0.4, 0.6); };
export const beep = () => tone([880], 0.11, 0, 0.05);
export const click = () => tone([1200], 0.035, 0, 0.03);
// the mic's own sounds, so she knows by ear when it listens
export const micOpenTone = () => { tone([660], 0.08, 0, 0.05); tone([990], 0.1, 0.09, 0.05); };
export const micCloseTone = () => { tone([880], 0.08, 0, 0.045); tone([520], 0.12, 0.09, 0.045); };
export const tickTone = () => tone([1500], 0.06, 0, 0.03);
export const echoTone = () => tone([220], 0.12, 0, 0.04);

/**
 * Dictation: keep listening while the ASHA talks, and hand back each finished
 * phrase. The silence clock starts only once she has said something:
 *  - firstMs: how long to wait for the first words (then it ends, heard = false)
 *  - quietMs: silence after a phrase that ends the session (null keeps it open
 *    until stop() or a spoken "bas")
 *  - pauseMs + onPause: a shorter silence that does not end the session; the
 *    visit page uses it to ask for the next missing field
 *  - single: end soon after the first finished phrase (one answer)
 * While the phone is speaking the recogniser is paused (half-duplex), and a
 * phrase that is the phone's own echo is dropped.
 * Returns { stop, pause, resume, done, error, heard, lastHeard, deadline }.
 */
export function dictate({ lang = "hi", onInterim, onPhrase, onError, onPause, onEcho, onState, keep, firstMs = 8000, quietMs = 4000, pauseMs = null, single = false } = {}) {
  let rec, stopped = false, paused = false, running = false, finalText = "", quiet = null, pauseT = null, resolveDone, startedAt = Date.now();
  const done = new Promise((r) => (resolveDone = r));
  const S = { stop: () => finish(), pause, resume, extend, release, done, error: null, heard: false, lastHeard: 0, deadline: 0, lang };
  const finish = () => {
    if (stopped) return; stopped = true; clearTimeout(quiet); clearTimeout(pauseT);
    if (active === S) active = null;
    try { rec && rec.abort(); } catch {}
    onState && onState("ended");
    resolveDone(finalText.trim());
  };
  const arm = (ms) => { clearTimeout(quiet); if (ms == null) { S.deadline = 0; return; } S.deadline = Date.now() + ms; quiet = setTimeout(finish, ms); };
  const armAfterSpeech = () => {
    arm(single ? 700 : quietMs);
    clearTimeout(pauseT);
    if (pauseMs && onPause) pauseT = setTimeout(() => { if (!stopped && !paused) onPause(); }, pauseMs);
  };
  let gotSincePause = true;
  function pause() {
    if (stopped || paused) return;
    paused = true; gotSincePause = false; clearTimeout(quiet); clearTimeout(pauseT); S.deadline = 0;
    try { rec && rec.abort(); } catch {}
    onState && onState("paused");
  }
  /** Keep the mic open at least this long from now (a timed count), with no pause prompt. */
  function extend(ms) {
    if (stopped) return;
    clearTimeout(pauseT);
    if (!paused) arm(ms);
    S.holdUntil = Date.now() + ms;
  }
  /** End a hold early (the answer came): back to the normal silence clock. */
  function release() { if ((S.holdUntil || 0) > Date.now()) { S.holdUntil = 0; if (!stopped && !paused && S.heard) armAfterSpeech(); } }
  function resume() {
    if (stopped || !paused) return;
    paused = false;
    // restart unless audio or a result has come since the pause; never trust the running flag alone
    if (!running || !gotSincePause) { try { rec.start(); running = true; } catch { /* still running or ending: onend restarts it */ } }
    // the silence clock restarts: she gets the full wait again after the phone spoke
    const hold = Math.max(0, (S.holdUntil || 0) - Date.now());
    if (hold > 0) arm(hold); else if (S.heard) armAfterSpeech(); else arm(firstMs);
    onState && onState("listening");
  }
  if (!SR) { S.error = "unsupported"; onError && onError("unsupported"); stopped = true; resolveDone(""); return S; }
  try {
    rec = new SR();
    rec.lang = LANGS[lang]?.speech || "hi-IN";
    rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onaudiostart = () => { micState.granted = true; gotSincePause = true; };
    // a late start after a pause or stop must not leave the mic on
    rec.onstart = () => { if (stopped || paused) { try { rec.abort(); } catch {} return; } running = true; };
    rec.onresult = (e) => {
      if (stopped || paused) return;
      micState.granted = true; gotSincePause = true;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript.trim();
        if (r.isFinal) {
          if (!t) continue;
          if (!(keep && keep(t)) && isEcho(t)) { onEcho && onEcho(t); continue; }
          S.heard = true; S.lastHeard = Date.now();
          finalText += (finalText ? " " : "") + t;
          onPhrase && onPhrase(t, finalText);
          if (stopped || paused) return;
        } else if (!isEcho(t)) interim += r[0].transcript;
      }
      if (interim) { S.lastHeard = Date.now(); onInterim && onInterim(interim, finalText); }
      if (interim || S.heard) { if ((S.holdUntil || 0) > Date.now()) arm(S.holdUntil - Date.now()); else armAfterSpeech(); }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      S.error = e.error;
      onError && onError(e.error);
      if (["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(e.error)) finish();
    };
    rec.onend = () => {
      running = false;
      if (stopped || paused) return;
      try { rec.start(); running = true; } catch { finish(); }
    };
    rec.start(); running = true;
    active = S;
    if (said.speaking) pause(); else arm(firstMs);
    onState && onState(paused ? "paused" : "listening");
  } catch { S.error = "unsupported"; onError && onError("unsupported"); finish(); }
  void startedAt;
  return S;
}
