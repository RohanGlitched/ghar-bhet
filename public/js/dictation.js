// Real speech test: a person reads each card aloud through Wispr Flow (typed
// into the box) or the browser's own speech recognition. The raw words are
// kept exactly as the engine wrote them and downloaded for scoring.
import { mountChrome, esc, store } from "/js/ui.js";
import { dictate, support } from "/js/voice.js";
mountChrome("/dictation");

const $ = (s) => document.querySelector(s);
const KEY = "gb-realspeech";
const LANG = { hi: "Hindi", mr: "Marathi", en: "English" };
const TYPE = { newborn: "Newborn visit", anc: "Pregnancy visit", pnc: "Mother after birth" };
let cards = [], engine = "wispr", session = null;
let saved = store.get(KEY) || { wispr: {}, browser: {} };

function setEngine(e) {
  engine = e;
  document.querySelectorAll("[data-eng]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.eng === e)));
  draw();
}
document.querySelectorAll("[data-eng]").forEach((b) => b.addEventListener("click", () => setEngine(b.dataset.eng)));

const nextIndex = () => cards.findIndex((c) => !(c.id in saved[engine]));

function draw() {
  const i = nextIndex();
  const done = cards.length - (i < 0 ? 0 : cards.filter((c) => !(c.id in saved[engine])).length);
  const bar = `<div class="d-bar" aria-hidden="true"><i style="width:${(100 * done) / cards.length}%"></i></div>`;
  if (i < 0) {
    const out = JSON.stringify({ test: "ghar-bhet real speech", engine, at: new Date().toISOString(), userAgent: navigator.userAgent, results: cards.map((c) => ({ id: c.id, lang: c.lang, heard: saved[engine][c.id] })) }, null, 1);
    $("#stage").innerHTML = `${bar}<div class="card d-done" style="margin-top:12px"><b>All ${cards.length} read with ${engine === "wispr" ? "Wispr Flow" : "the browser mic"}.</b>
      <div class="d-row"><button class="btn" id="dl">Download results</button><button class="btn ghost" id="copy">Copy results</button><button class="btn ghost" id="again">Start this engine again</button></div>
      <pre>${esc(out)}</pre></div>`;
    $("#dl").addEventListener("click", () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "application/json" })); a.download = `ghar-bhet-realspeech-${engine}.json`; a.click(); });
    $("#copy").addEventListener("click", async () => { try { await navigator.clipboard.writeText(out); $("#copy").textContent = "Copied"; } catch { $("#copy").textContent = "Select the text below and copy it"; } });
    $("#again").addEventListener("click", () => { saved[engine] = {}; store.set(KEY, saved); draw(); });
    return;
  }
  const c = cards[i];
  $("#stage").innerHTML = `${bar}<div class="d-card" style="margin-top:12px">
    <div class="d-top"><span class="d-meta">Card ${i + 1} of ${cards.length} · ${TYPE[c.type]} · read in ${LANG[c.lang]}</span>
      ${engine === "browser" ? `<button class="btn small" id="mic" aria-label="Start the browser microphone">Tap to speak</button>` : ""}</div>
    <p class="d-read">${esc(c.read)}</p>
    <label class="sr" for="heard">What the speech engine wrote</label>
    <textarea id="heard" placeholder="${engine === "wispr" ? "Click here, then dictate with Wispr Flow" : "The browser's words appear here"}"></textarea>
    <div class="d-row"><button class="btn" id="next">Next</button><button class="btn ghost" id="skip">Skip this card</button><span class="faint" id="note"></span></div></div>`;
  const ta = $("#heard");
  if (engine === "wispr") ta.focus();
  $("#next").addEventListener("click", () => { if (!ta.value.trim()) { $("#note").textContent = "Nothing written yet. Read the sentence, or skip."; return; } keep(c, ta.value.trim()); });
  $("#skip").addEventListener("click", () => keep(c, null));
  const mic = $("#mic");
  if (mic) {
    if (!support().stt) { mic.disabled = true; $("#note").textContent = "This browser can't listen. Use Chrome or Edge, or switch to Wispr Flow."; }
    mic.addEventListener("click", async () => {
      if (session) { session.stop(); return; }
      mic.textContent = "Listening… tap to stop";
      session = dictate({ lang: c.lang, quietMs: 3500, onInterim: (it, fin) => { ta.value = (fin + " " + it).trim(); },
        onError: (e) => { $("#note").textContent = e === "not-allowed" ? "The microphone is blocked. Allow it in the address bar." : `Speech error: ${e}`; } });
      const text = await session.done; session = null;
      mic.textContent = "Tap to speak";
      if (text) ta.value = text;
    });
  }
}
function keep(c, text) { saved[engine][c.id] = text; store.set(KEY, saved); draw(); }

fetch("/data/realspeech-cards.json").then((r) => r.json()).then((d) => { cards = d.cards; draw(); })
  .catch(() => { $("#stage").innerHTML = `<p class="alert watch">Couldn't load the cards. Reload the page.</p>`; });
