// Shared page furniture: top bar, phone bottom bar, footer, theme.
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export async function api(path, body) {
  const r = await fetch(path, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "The server didn't answer. Check the connection and try again.");
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
const theme = () => document.documentElement.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

export function mountChrome(active) {
  const forced = new URLSearchParams(location.search).get("theme");
  const saved = ["light", "dark"].includes(forced) ? forced : store.get("gb-theme");
  if (saved) document.documentElement.setAttribute("data-theme", saved);
  const link = (href, label, cls = "") => `<a href="${href}"${active === href ? ' aria-current="page"' : ""} class="${cls}">${label}</a>`;
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
  bar.innerHTML = [["/", "Home", I.home], ["/visit", "Visit", I.visit], ["/anm", "Nurse", I.anm], ["/evidence", "Results", I.ev]]
    .map(([h, l, ic]) => `<a href="${h}"${active === h ? ' aria-current="page"' : ""}>${ic}<span>${l}</span></a>`).join("");
  document.body.appendChild(bar);
  const foot = document.getElementById("foot");
  if (foot) {
    foot.className = "foot";
    foot.innerHTML = `<div class="wrap foot-grid">
      <div><h4>Ghar Bhet</h4><p style="margin:0 0 10px;max-width:46ch">An ASHA speaks a home visit in Hindi, Marathi or English. The official visit record fills itself, and fixed government rules flag danger signs for mothers and newborns.</p>
      <p class="faint" style="margin:0">Built for the Scaler × Wispr Flow "India Runs on Voice" hackathon, 2026. The village on the nurse's board is a made-up sample. Not a medical device: the rules support, and never replace, the ANM's and doctor's judgement.</p></div>
      <div><h4>Use it</h4><ul><li><a href="/visit">Speak a visit</a></li><li><a href="/anm">Nurse's board</a></li><li><a href="/visit?example=1">Try an example</a></li></ul></div>
      <div><h4>Proof</h4><ul><li><a href="/evidence">Test results</a></li><li><a href="/how">Rules and method</a></li><li><a href="https://github.com/RohanGlitched/ghar-bhet">Source code</a></li></ul></div>
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
