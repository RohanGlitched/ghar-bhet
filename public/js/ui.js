// Shared page furniture: top bar, phone bottom bar, footer, theme.
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || "The server didn't answer. Check the connection and try again."), { status: r.status });
  return data;
}
export function ago(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d === 1 ? "yesterday" : `${d} days ago`;
}

const LOGO = `<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 15 16 5l12 10v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="13" y="13" width="6" height="10" rx="3" fill="var(--voice)"/><path d="M10.5 19a5.5 5.5 0 0 0 11 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const MOON = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" fill="currentColor"/></svg>`;
const SUN = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></g></svg>`;
const I = {
  visit: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  anm: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  ev: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M10 19V5M15 19v-7M20 19V8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`,
  home: `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
};
/* One glossary for every page that shows health-system words. */
export const GLOSSARY = [
  ["ASHA", "Accredited Social Health Activist: the village health worker who visits homes."],
  ["ANM", "Auxiliary nurse-midwife: the nurse the ASHA reports to."],
  ["Refer today", "She or the baby must be seen at a hospital today."],
  ["Go now · 108", "Urgent: go at once. 108 is the free ambulance; 102 is free transport for pregnant women and babies."],
  ["PHC", "Primary health centre: the nearest government clinic with a doctor."],
  ["FRU", "First referral unit: a hospital that can handle emergency births and blood transfusion."],
  ["SNCU / NBSU", "Newborn care units: SNCU at the district hospital, NBSU at the block hospital."],
  ["ANC", "Antenatal care: a pregnancy check-up."],
  ["BP", "Blood pressure, written as top/bottom, for example 140/90."],
  ["Hb", "Haemoglobin, from a blood test. Low Hb means anaemia."],
  ["PPH / APH", "Heavy bleeding after / before a delivery."],
  ["PMSMA", "Free monthly pregnancy check-up by a doctor on the 9th of each month."],
  ["HBNC", "Home Based Newborn Care: the ASHA's newborn home-visit programme."],
  ["SSBSK", "Samagra Shishu Bal Swasthya Karyakram: India's 2026 newborn and child home-visit guidelines."],
  ["MCP card", "The Mother and Child Protection card every pregnant woman gets; it holds her and the baby's records."],
  ["CHO", "Community health officer at a health and wellness centre."],
  ["JSSK", "The government's free mother and child scheme, including transport."],
  ["MoHFW", "India's Ministry of Health and Family Welfare."],
];
/**
 * One referral alert body, the same on the visit page, the slip and the board:
 * the action once in big type, one "On the way" list, then each sign as a short
 * line with a "Why" toggle. Lower-level groups are context under the highest.
 * `groups` comes from groupAlerts() in ask.js.
 */
/** A random id for this browser, so the public demo board can show its own saves only. */
export function sessionId() {
  let s = store.get("gb-sid");
  if (!s || typeof s !== "string") { s = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); store.set("gb-sid", s); }
  return s;
}
const AMBULANCE = `<svg class="pict" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 22V11h15v11M18 14h6l4 5v3H3"/><circle cx="9" cy="23" r="2.5" fill="currentColor"/><circle cx="23" cy="23" r="2.5" fill="currentColor"/><path d="M10.5 13.5v5M8 16h5"/></svg>`;
const HOSPITAL = `<svg class="pict" width="28" height="28" viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 28V9h22v19M3 28h26"/><path d="M16 12v8M12 16h8"/></svg>`;
const PHONE = `<svg class="ic" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>`;
/**
 * One referral alert body, the same on the visit page, the slip and the board.
 * By default it shows only one big action line (her language when given, the
 * English under it) and a large call + "hear again" pair; "On the way" and the
 * signs that fired sit behind a "Kyun? / Why" disclosure (open on the slip, for
 * print). Lower-level groups are context under the highest. `groups` comes
 * from groupAlerts() in ask.js.
 */
export function referHTML(groups, { why = true, main = null, otw = null, open = false, hear = "", title = "", doLine = true, actions = true } = {}) {
  if (!groups || !groups.length) return "";
  const [top, ...rest] = groups;
  const cap = (x) => String(x).charAt(0).toUpperCase() + String(x).slice(1);
  // the reason without repeating the sign's own name ("Signs of sepsis: signs of sepsis: ...")
  const reasonText = (f) => { const w = String(f.why || ""), t = String(f.title || ""); return w.toLowerCase().startsWith(t.toLowerCase()) ? w.slice(t.length).replace(/^[\s:,.-]+/, "") : w; };
  const line = (f) => `<li><b>${esc(f.title)}</b>${reasonText(f) ? `: ${esc(reasonText(f))}` : ""}`
    + `${f.from === "transcript" ? ' <span class="pill watch">heard in what was said</span>' : ""}${f.conflict ? ' <span class="pill watch">said in the visit, record disagrees: nurse to check</span>' : ""}`
    + `${why && f.source ? `<span class="src" title="${esc(f.code ? `rule id ${f.code}` : "")}">Source: ${esc(f.source)}</span>` : ""}</li>`;
  const otwList = Array.isArray(otw) ? otw : otw ? String(otw).replace(/\.\s*$/, "").split(/,\s*/) : null;
  const otwHTML = otwList && otwList.length ? `<div class="otw"><b>Raste mein · On the way</b><ul>${otwList.map((x) => `<li>${esc(cap(x))}</li>`).join("")}</ul><small class="en-line">${esc(top.onTheWay.map(cap).join(". "))}</small></div>`
    : top.onTheWay && top.onTheWay.length ? `<div class="otw"><b>On the way</b><ul>${top.onTheWay.map((x) => `<li>${esc(cap(x))}</li>`).join("")}</ul></div>` : "";
  const call = top.urgent ? `<a class="btn call" href="tel:108">${PHONE}<span>Call 108<small class="en-line">free ambulance</small></span></a>` : `<a class="btn call soft" href="tel:102">${PHONE}<span>Call 102<small class="en-line">free transport</small></span></a>`;
  return (doLine ? `<p class="alert-do">${top.urgent ? AMBULANCE : HOSPITAL}<span>${main ? `${esc(main)}<small class="en-line">${esc(top.where)}</small>` : esc(top.where)}</span></p>` : "")
    + (actions ? `<div class="alert-acts">${call}${hear}</div>` : "")
    + `<details class="kyun"${open ? " open" : ""}><summary>Kyun? · Why${title ? `<small class="en-line">${esc(title)}</small>` : ""}</summary>`
    + (top.extra && top.extra.length ? `<p class="alert-extra">${esc(top.extra.join(" "))}</p>` : "")
    + otwHTML
    + `<ul class="signs">${top.flags.map(line).join("")}</ul>`
    + (rest.length ? `<p class="also-found">Also found; the referral above covers ${rest.length > 1 || rest[0].flags.length > 1 ? "them" : "it"}:</p><ul class="signs">${rest.flatMap((g) => g.flags).map(line).join("")}</ul>` : "")
    + `</details>`;
}

/** The shared "Words used here" block. With `only`, just the words that text uses (plus 102/108). */
export function glossaryHTML({ only = null, open = false } = {}) {
  const rows = only == null ? GLOSSARY : GLOSSARY.filter(([w]) => w === "Go now · 108" || w.split(" / ").some((x) => new RegExp(`\\b${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(only)));
  return `<details class="gloss-box"${open ? " open" : ""}><summary><span>Words used here<small class="gloss-hint">ASHA, ANM, SNCU, 108… tap to open</small></span></summary><dl class="gloss">${rows.map(([w, d]) => `<dt>${esc(w)}</dt><dd>${esc(d)}</dd>`).join("")}</dl></details>`;
}

const theme = () => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function mountChrome(active) {
  const forced = new URLSearchParams(location.search).get("theme");
  const saved = ["light", "dark"].includes(forced) ? forced : store.get("gb-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const link = (href, label, cls = "") => `<a href="${href}"${active === href ? ' aria-current="page"' : ""} class="${cls}">${label}</a>`;
  if (active) document.body.dataset.page = active.replace(/^\//, "") || "home";
  const main = document.querySelector("main");
  if (main && !document.querySelector(".skip")) {
    if (!main.id) main.id = "main";
    const skip = document.createElement("a");
    skip.className = "skip"; skip.href = `#${main.id}`; skip.textContent = active === "/visit" ? "Skip to the visit" : "Skip to the content";
    document.body.prepend(skip);
  }
  const top = document.getElementById("top");
  if (top) {
    top.className = "top";
    top.innerHTML = `<div class="wrap">
      <a class="mark" href="/" aria-label="Ghar Bhet home">${LOGO}<span>Ghar Bhet</span></a>
      <nav class="nav" aria-label="Main">${link("/visit", "Speak a visit", "keep")}${link("/anm", "Nurse's board")}${link("/evidence", "Test results")}${link("/how", "Rules and method", "hide-sm")}</nav>
      <button class="icon-btn" id="theme" aria-label="Switch light or dark"></button>
    </div>`;
    const btn = top.querySelector("#theme");
    const paint = () => { btn.innerHTML = theme() === "dark" ? SUN : MOON; btn.title = theme() === "dark" ? "Daylight" : "Night"; };
    paint();
    btn.addEventListener("click", () => { const n = theme() === "dark" ? "light" : "dark"; document.documentElement.setAttribute("data-theme", n); store.set("gb-theme", n); paint(); });
  }
  const bar = document.createElement("nav");
  bar.className = "bottom-bar"; bar.setAttribute("aria-label", "Sections");
  bar.innerHTML = [["/", "Home", I.home], ["/visit", "Speak a visit", I.visit], ["/anm", "Nurse's board", I.anm], ["/evidence", "Test results", I.ev]]
    .map(([h, l, ic]) => `<a href="${h}"${active === h ? ' aria-current="page"' : ""}>${ic}<span>${l}</span></a>`).join("");
  document.body.appendChild(bar);
  const foot = document.getElementById("foot");
  if (foot) {
    foot.className = "foot";
    foot.innerHTML = `<div class="wrap foot-grid">
      <div><h4>Ghar Bhet</h4><p style="margin:0 0 10px;max-width:46ch">An ASHA speaks a home visit in Hindi, Marathi or English. The official visit record fills itself, and fixed government rules flag danger signs for mothers and newborns.</p>
      <p class="faint" style="margin:0 0 8px">Ghar Bhet means "home visit" in Hindi and Marathi. An ASHA is a village health worker; the ANM (auxiliary nurse-midwife) is the nurse she reports to.</p>
      <p class="faint" style="margin:0">Built for the Scaler × Wispr Flow "India Runs on Voice" hackathon, 2026. The village on the nurse's board is a made-up sample. Not a medical device: the rules support, and never replace, the nurse's and doctor's judgement.</p></div>
      <div><h4>Use it</h4><ul><li><a href="/visit">Speak a visit</a></li><li><a href="/anm">Nurse's board</a></li><li><a href="/visit?example=1">Try an example</a></li></ul></div>
      <div><h4>Test results</h4><ul><li><a href="/evidence">Test results</a></li><li><a href="/how">Rules and method</a></li><li><a href="https://github.com/RohanGlitched/ghar-bhet">Source code</a></li></ul></div>
      <div><h4>Sources</h4><ul><li><a href="https://nurturing-care.org/files/SSBSK_Operational_Guidline_2026.pdf">SSBSK guidelines 2026</a></li><li><a href="https://nhsrcindia.org/sites/default/files/2021-12/Care%20During%20Pregnancy%20and%20Childbirth%20Training%20Manual%20for%20CHO%20at%20AB-HWC.pdf">CHO pregnancy manual</a></li><li><a href="https://pib.gov.in/PressReleasePage.aspx?PRID=2096075">10.29 lakh ASHAs (PIB)</a></li></ul></div>
    </div>`;
  }
  const t = document.createElement("button");
  t.className = "totop"; t.setAttribute("aria-label", "Back to top");
  t.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;
  t.addEventListener("click", () => scrollTo({ top: 0, behavior: "smooth" }));
  document.body.appendChild(t);
  addEventListener("scroll", () => t.classList.toggle("show", scrollY > 700), { passive: true });
}
