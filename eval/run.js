// Score the extractor and rules against a labelled test set.
//   node eval/run.js                 (dev set)
//   node eval/run.js heldout         (the held-out set; run once, at the end)
//   node eval/run.js dev --misses    (print every miss)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { understand } from "../public/js/understand.js";
import { checkRecord } from "../public/js/rules.js";

const which = process.argv[2] || "dev";
const showMisses = process.argv.includes("--misses");
const dir = fileURLToPath(new URL(".", import.meta.url));
const items = readFileSync(`${dir}/${which}.jsonl`, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));

const flat = (rec) => {
  const out = {};
  for (const [k, v] of Object.entries(rec || {})) {
    if (k === "symptoms") for (const [s, b] of Object.entries(v || {})) out["symptoms." + s] = b;
    else if (k !== "type") out[k] = v;
  }
  return out;
};
// Names have many Roman spellings (Pooja, Puja; Meena, Mina): compare by sound.
const sound = (x) => String(x).toLowerCase().replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/w/g, "v").replace(/x/g, "ksh").replace(/ph/g, "f").replace(/([kgcjtdpb])h/g, "$1").replace(/(.)\1+/g, "$1").replace(/y$/, "i").replace(/(?!^)a/g, "");
const same = (a, b, k) => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.051 : k === "name" ? sound(a) === sound(b) : String(a).toLowerCase() === String(b).toLowerCase();

function score(mode) {
  let goldN = 0, predN = 0, hit = 0, typeOk = 0;
  let dangerVisits = 0, dangerCaught = 0, normalVisits = 0, falseAlarms = 0;
  let flagGold = 0, flagPred = 0, flagHit = 0, referGold = 0, referHit = 0;
  const byField = {}, byTag = {}, byLang = {}, misses = [];
  for (const it of items) {
    const hint = mode === "typed" ? it.record.type : undefined;
    const out = understand(it.said, hint);
    if (out.record.type === it.record.type) typeOk++;
    const g = flat(it.record), p = flat(out.record);
    const wrong = [];
    for (const [k, v] of Object.entries(g)) {
      goldN++;
      const f = (byField[k.startsWith("symptoms.") ? "symptoms" : k] ||= { gold: 0, hit: 0, pred: 0 });
      f.gold++;
      if (k in p && same(p[k], v, k)) { hit++; f.hit++; } else wrong.push(`${k}: want ${JSON.stringify(v)} got ${JSON.stringify(p[k])}`);
    }
    for (const [k, v] of Object.entries(p)) {
      predN++;
      const f = (byField[k.startsWith("symptoms.") ? "symptoms" : k] ||= { gold: 0, hit: 0, pred: 0 });
      f.pred++;
      if (!(k in g)) wrong.push(`${k}: extra ${JSON.stringify(v)}`);
    }
    const gf = new Set(it.flags), pfAll = checkRecord(out.record), pf = new Set(pfAll.map((x) => x.code));
    flagGold += gf.size; flagPred += pf.size; for (const c of pf) if (gf.has(c)) flagHit++;
    // refer_now flags: the ones that save lives
    const goldRefer = it.flags.filter((c) => REFER.has(c));
    referGold += goldRefer.length; for (const c of goldRefer) if (pf.has(c)) referHit++;
    const goldDanger = goldRefer.length > 0, predDanger = pfAll.some((x) => x.severity === "refer_now");
    if (goldDanger) { dangerVisits++; if (predDanger) dangerCaught++; } else { normalVisits++; if (predDanger) falseAlarms++; }
    const ok = wrong.length === 0;
    for (const t of it.tags || []) { const b = (byTag[t] ||= { n: 0, ok: 0 }); b.n++; if (ok) b.ok++; }
    const L = `${it.lang}/${it.script}`; const bl = (byLang[L] ||= { n: 0, ok: 0 }); bl.n++; if (ok) bl.ok++;
    if (!ok || [...gf].some((c) => !pf.has(c)) || [...pf].some((c) => !gf.has(c))) misses.push({ id: it.id, said: it.said, wrong, flags_want: [...gf], flags_got: [...pf] });
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  return {
    mode, items: items.length,
    fields: { gold: goldN, predicted: predN, correct: hit, recall: pct(hit, goldN), precision: pct(hit, predN) },
    type_detected: pct(typeOk, items.length),
    danger: { visits: dangerVisits, caught: dangerCaught, caught_pct: pct(dangerCaught, dangerVisits), normal_visits: normalVisits, false_alarms: falseAlarms, false_alarm_pct: pct(falseAlarms, normalVisits) },
    flags: { gold: flagGold, predicted: flagPred, correct: flagHit, recall: pct(flagHit, flagGold), precision: pct(flagHit, flagPred), refer_now_recall: pct(referHit, referGold) },
    exact_visits: pct(items.length - misses.filter((m) => m.wrong.length).length, items.length),
    by_field: Object.fromEntries(Object.entries(byField).map(([k, v]) => [k, { ...v, recall: pct(v.hit, v.gold), precision: pct(v.hit, v.pred) }])),
    by_tag: Object.fromEntries(Object.entries(byTag).map(([k, v]) => [k, { ...v, pct: pct(v.ok, v.n) }])),
    by_lang: Object.fromEntries(Object.entries(byLang).map(([k, v]) => [k, { ...v, pct: pct(v.ok, v.n) }])),
    misses,
  };
}
const REFER = new Set(["anc_imminent_eclampsia", "anc_preeclampsia", "anc_hypertension", "anc_headache_vision", "anc_severe_anaemia", "anc_bleeding", "anc_leaking", "anc_convulsions", "anc_fever", "anc_fetal_movement", "anc_swelling", "anc_breathless", "anc_abdominal_pain", "pnc_heavy_bleeding", "pnc_high_fever", "pnc_infection", "pnc_convulsions", "pnc_neuro", "pnc_breathless", "nb_not_feeding", "nb_convulsions", "nb_fast_breathing", "nb_chest_indrawing", "nb_lethargy", "nb_fever", "nb_hypothermia", "nb_jaundice_palms", "nb_jaundice_early", "nb_blood_stool", "nb_very_low_weight"]);

const typed = score("typed"), auto = score("auto");
const summary = (r) => `${r.mode.padEnd(5)} fields ${r.fields.recall}% recall / ${r.fields.precision}% precision · danger visits caught ${r.danger.caught}/${r.danger.visits} (${r.danger.caught_pct}%) · false alarms ${r.danger.false_alarms}/${r.danger.normal_visits} · flags ${r.flags.recall}% recall, ${r.flags.precision}% precision · exact visits ${r.exact_visits}% · type ${r.type_detected}%`;
console.log(`${which}: ${items.length} items`);
console.log(summary(typed));
console.log(summary(auto));
if (showMisses) for (const m of typed.misses) console.log(`\n${m.id}  ${m.said}\n   ${m.wrong.join("\n   ")}\n   flags want ${m.flags_want.join(",") || "-"} got ${m.flags_got.join(",") || "-"}`);
mkdirSync(`${dir}/../public/data`, { recursive: true });
writeFileSync(`${dir}/../public/data/eval-${which}.json`, JSON.stringify({ set: which, run_at: new Date().toISOString(), ruleset: "mohfw-2026.1", typed, auto }, null, 1));
