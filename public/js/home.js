// The home page replays a real visit: the same reader and rules as the app,
// fed a sample sentence phrase by phrase, so what you see is what it does.
import { understand, romanize } from "./understand.js";
import { checkRecord } from "./rules.js";
import { mountChrome, esc } from "./ui.js";

mountChrome("/");
const SAMPLE = ["Sunita ka baby, saat din ka hai.", "Wajan ek kilo saat sau gram.", "Doodh kam pee raha hai, aur pasli chal rahi hai."];
const said = document.getElementById("demo-said"), tiles = document.getElementById("demo-tiles"), alertEl = document.getElementById("demo-alert"), status = document.getElementById("demo-status");
const TL = [["day", "Baby's age", (r) => r.day != null ? `${r.day} days` : null], ["weight_g", "Weight", (r) => r.weight_g != null ? `${r.weight_g} g` : null], ["feeding", "Feeding", (r) => r.feeding ? { good: "good", poor: "poor", none: "not feeding" }[r.feeding] : null]];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

function draw(n, typed) {
  const text = SAMPLE.slice(0, n).join(" ");
  const { record, evidence } = understand(text, "newborn");
  const flags = checkRecord(record);
  // marks
  const spans = Object.values(evidence).filter(Boolean).sort((a, b) => a.start - b.start);
  let out = "", at = 0;
  for (const s of spans) { if (s.start < at) continue; out += esc(text.slice(at, s.start)) + `<mark>${esc(text.slice(s.start, s.end))}</mark>`; at = s.end; }
  out += esc(text.slice(at, typed ?? text.length));
  said.innerHTML = out || "&nbsp;";
  const danger = new Set(flags.filter((f) => f.severity === "refer_now").map((f) => f.code));
  tiles.innerHTML = TL.map(([k, l, f]) => { const v = f(record); const bad = (k === "weight_g" && danger.has("nb_very_low_weight")); return `<div class="tile ${v ? "filled" : ""} ${bad ? "danger" : ""}"><small>${l}</small><b class="${v ? "" : "empty"}">${esc(v ?? "—")}</b></div>`; }).join("")
    + (record.symptoms?.chest_indrawing ? `<div class="tile danger" style="grid-column:span 3"><small>Signs</small><b>chest indrawing</b></div>` : "");
  const refer = flags.filter((f) => f.severity === "refer_now");
  alertEl.innerHTML = refer.length && n === SAMPLE.length ? `<div class="alert"><div class="alert-head"><h3>${esc(refer[0].title)}${refer.length > 1 ? ` and ${refer.length - 1} more` : ""}</h3>${refer.some((f) => f.urgent) ? `<span class="stamp urgent press">GO NOW · 108</span>` : `<span class="stamp press">REFER TODAY</span>`}</div><p>${refer.map((f) => esc(f.why)).join(" ")}</p></div>` : "";
}
let timer;
function loop(n = 0) {
  if (n > SAMPLE.length) { status.textContent = "Saved · sent to the nurse"; timer = setTimeout(() => { status.textContent = "Listening · Hindi"; loop(0); }, 4200); return; }
  draw(n); timer = setTimeout(() => loop(n + 1), n === 0 ? 900 : 2300);
}
if (reduce) { draw(SAMPLE.length); } else loop();
document.addEventListener("visibilitychange", () => { if (document.hidden) clearTimeout(timer); else if (!reduce) { clearTimeout(timer); loop(); } });
void romanize;
