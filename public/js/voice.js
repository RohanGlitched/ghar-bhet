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
/** Say a line. Resolves when it has been spoken (or the call ended). */
export function speak(text, lang = "en", { rate = 0.9 } = {}) {
  const my = ++speakingToken;
  return new Promise((resolve) => {
    if (!window.speechSynthesis || !text) return setTimeout(resolve, 400 + (text || "").length * 50);
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = LANGS[lang]?.speech || "en-IN";
    u.rate = rate; u.pitch = 1.05;
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(t); resolve(); };
    u.onend = fin; u.onerror = fin;
    const t = setTimeout(fin, 3000 + text.length * 120); // some browsers never fire onend
    speechSynthesis.speak(u);
    if (my !== speakingToken) fin();
  });
}
export function hush() { speakingToken++; if (window.speechSynthesis) speechSynthesis.cancel(); }

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

/**
 * Dictation: keep listening while the ASHA talks, and hand back each finished
 * phrase. Stops after `quietMs` of silence or when stop() is called.
 * Returns { stop, done } where done resolves with the full text.
 */
export function dictate({ lang = "hi", onInterim, onPhrase, onError, quietMs = 2200 } = {}) {
  let rec, stopped = false, finalText = "", quiet = null, resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const finish = () => { if (stopped) return; stopped = true; clearTimeout(quiet); try { rec && rec.stop(); } catch {} resolveDone(finalText.trim()); };
  const arm = () => { clearTimeout(quiet); quiet = setTimeout(finish, quietMs); };
  if (!SR) { onError && onError("unsupported"); resolveDone(""); return { stop() {}, done }; }
  try {
    rec = new SR();
    rec.lang = LANGS[lang]?.speech || "hi-IN";
    rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = r[0].transcript.trim(); if (t) { finalText += (finalText ? " " : "") + t; onPhrase && onPhrase(t, finalText); } }
        else interim += r[0].transcript;
      }
      onInterim && onInterim(interim, finalText);
      arm();
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") return;
      onError && onError(e.error);
      if (["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(e.error)) finish();
    };
    rec.onend = () => { if (!stopped) { try { rec.start(); } catch { finish(); } } };
    rec.start();
    arm();
  } catch { onError && onError("unsupported"); finish(); }
  return { stop: finish, done };
}
