// Score the reader (understand.js) and the rules (rules.js) against labelled sets.
//
//   node eval/run.js dev|dev2|dev3|dev4|dev5|heldout|adversarial|adversarial2 [--misses] [--publish]
//       Field recall/precision, danger visits caught, false alarms, flag recall.
//       "typed" = the visit type is given (the ASHA picked it); "auto" = guessed.
//   node eval/run.js vignettes [--misses] [--publish]
//       40 clinical vignettes labelled only should_refer / urgent from the
//       guideline texts (not from rules.js). Reports sensitivity and specificity.
//   node eval/run.js realspeech <results.json> [--misses] [--out=DIR]
//       Results from public/dictation.html: {engine, results:[{id, lang, heard}]}.
//       Scores the reader on what the speech engine heard, side by side with the
//       written sentence, for the same held-out items. Always writes
//       public/data/eval-realspeech-<engine>.json.
//
// Results go to public/data/eval-<set>.json only with --publish, so running the
// tests does not change tracked files. The published run-1 / run-2 files
// (eval/heldout-run*.json, public/data/eval-heldout-run*.json) are history and
// are never written by this script.
//
// The rule set id is printed with every result (now mohfw-2026.4; RULESET in public/js/rules.js).
//
// FIELD COUNTING RULE (since ruleset mohfw-2026.2). Some record fields were added after
// a set was written (pnc BP and Hb, pregnancy risk items, new symptom codes). A
// sentence in an old set may say such a value, but its gold record cannot hold
// it. So a predicted field counts (towards precision, or as "extra") only when
// that set's gold records use the same field for the same visit type somewhere,
// or this item's gold record has it. Every gold field always counts towards
// recall. Flags are not filtered: expected flags come from the gold record.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { understand } from "../public/js/understand.js";
import { checkRecord, RULESET, RULE_TABLE } from "../public/js/rules.js";

const args = process.argv.slice(2);
const which = args.find((a) => !a.startsWith("--")) || "dev";
const showMisses = args.includes("--misses");
const publish = args.includes("--publish");
const dir = fileURLToPath(new URL(".", import.meta.url));
const readJsonl = (name) => readFileSync(`${dir}/${name}.jsonl`, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
// --out=DIR writes results somewhere else (the tests use a temp folder)
const outDir = (args.find((a) => a.startsWith("--out=")) || "").slice(6) || `${dir}/../public/data`;
const out = (name, data) => { mkdirSync(outDir, { recursive: true }); writeFileSync(`${outDir}/${name}.json`, JSON.stringify(data, null, 1)); };

const flat = (rec) => {
  const o = {};
  for (const [k, v] of Object.entries(rec || {})) {
    if (k === "symptoms") for (const [s, b] of Object.entries(v || {})) o["symptoms." + s] = b;
    else if (k !== "type") o[k] = v;
  }
  return o;
};
// Names have many Roman spellings (Pooja, Puja; Meena, Mina): compare by sound.
const sound = (x) => String(x).toLowerCase().replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/w/g, "v").replace(/x/g, "ksh").replace(/ph/g, "f").replace(/([kgcjtdpb])h/g, "$1").replace(/(.)\1+/g, "$1").replace(/y$/, "i").replace(/(?!^)a/g, "");
const same = (a, b, k) => typeof a === "number" && typeof b === "number" ? Math.abs(a - b) < 0.051 : k === "name" ? sound(a) === sound(b) : String(a).toLowerCase() === String(b).toLowerCase();
const SEVERITY = new Map(RULE_TABLE.map((r) => [r.code, r.severity]));
const isRefer = (code) => SEVERITY.get(code) === "refer_now";

/** The fields a set's gold records use, per visit type ("newborn:weight_g"). */
const fieldsUsed = (items) => new Set(items.flatMap((it) => Object.keys(flat(it.record)).map((k) => `${it.record.type}:${k}`)));

/**
 * Score a list of gold items. textOf(it) gives the sentence to read.
 * `used` is the field set from the whole set (see FIELD COUNTING RULE).
 */
function score(mode, items, used, textOf = (it) => it.said) {
  let goldN = 0, predN = 0, hit = 0, typeOk = 0;
  let dangerVisits = 0, dangerCaught = 0, normalVisits = 0, falseAlarms = 0;
  let flagGold = 0, flagPred = 0, flagHit = 0, referGold = 0, referHit = 0;
  const byField = {}, byTag = {}, byLang = {}, misses = [], rows = [];
  for (const it of items) {
    const hint = mode === "auto" ? undefined : it.record.type;
    const res = understand(textOf(it), hint);
    if (res.record.type === it.record.type) typeOk++;
    const g = flat(it.record), p = flat(res.record);
    const wrong = [];
    for (const [k, v] of Object.entries(g)) {
      goldN++;
      const f = (byField[k.startsWith("symptoms.") ? "symptoms" : k] ||= { gold: 0, hit: 0, pred: 0 });
      f.gold++;
      if (k in p && same(p[k], v, k)) { hit++; f.hit++; } else wrong.push(`${k}: want ${JSON.stringify(v)} got ${JSON.stringify(p[k])}`);
    }
    for (const [k, v] of Object.entries(p)) {
      if (!(k in g) && !used.has(`${it.record.type}:${k}`)) continue; // a field this set never labels
      predN++;
      const f = (byField[k.startsWith("symptoms.") ? "symptoms" : k] ||= { gold: 0, hit: 0, pred: 0 });
      f.pred++;
      if (!(k in g)) wrong.push(`${k}: extra ${JSON.stringify(v)}`);
    }
    const gf = new Set(it.flags), pfAll = checkRecord(res.record), pf = new Set(pfAll.map((x) => x.code));
    flagGold += gf.size; flagPred += pf.size; for (const c of pf) if (gf.has(c)) flagHit++;
    const goldRefer = it.flags.filter(isRefer);
    referGold += goldRefer.length; for (const c of goldRefer) if (pf.has(c)) referHit++;
    const goldDanger = goldRefer.length > 0, predDanger = pfAll.some((x) => x.severity === "refer_now");
    if (goldDanger) { dangerVisits++; if (predDanger) dangerCaught++; } else { normalVisits++; if (predDanger) falseAlarms++; }
    const ok = wrong.length === 0;
    for (const t of it.tags || []) { const b = (byTag[t] ||= { n: 0, ok: 0 }); b.n++; if (ok) b.ok++; }
    const L = `${it.lang}/${it.script}`; const bl = (byLang[L] ||= { n: 0, ok: 0 }); bl.n++; if (ok) bl.ok++;
    const flagMiss = [...gf].some((c) => !pf.has(c)) || [...pf].some((c) => !gf.has(c));
    if (!ok || flagMiss) misses.push({ id: it.id, said: textOf(it), wrong, flags_want: [...gf], flags_got: [...pf] });
    rows.push({ id: it.id, text: textOf(it), record: res.record, flags: [...pf], misses: wrong, flags_want: [...gf] });
  }
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
    misses, rows,
  };
}
const summary = (r) => `${r.mode.padEnd(5)} fields ${r.fields.recall}% recall / ${r.fields.precision}% precision · danger visits caught ${r.danger.caught}/${r.danger.visits} (${r.danger.caught_pct}%) · false alarms ${r.danger.false_alarms}/${r.danger.normal_visits} · flags ${r.flags.recall}% recall, ${r.flags.precision}% precision · exact visits ${r.exact_visits}% · type ${r.type_detected}%`;
const printMisses = (r) => { for (const m of r.misses) console.log(`\n${m.id}  ${m.said}\n   ${m.wrong.join("\n   ")}\n   flags want ${m.flags_want.join(",") || "-"} got ${m.flags_got.join(",") || "-"}`); };
const strip = ({ rows, ...r }) => r;

/* ---------------- clinical vignettes ---------------- */
function vignettes() {
  const items = readJsonl("vignettes");
  let tp = 0, fn = 0, tn = 0, fp = 0, uGold = 0, uHit = 0, uPred = 0, uPredOk = 0;
  const rows = [];
  for (const v of items) {
    const res = understand(v.said, v.type);
    const flags = checkRecord(res.record);
    const refer = flags.some((f) => f.severity === "refer_now");
    const urgent = flags.some((f) => f.urgent);
    if (v.should_refer) { if (refer) tp++; else fn++; } else { if (refer) fp++; else tn++; }
    if (v.urgent) { uGold++; if (urgent) uHit++; }
    if (urgent) { uPred++; if (v.urgent) uPredOk++; }
    const agree = refer === v.should_refer && urgent === v.urgent;
    rows.push({ id: v.id, type: v.type, said: v.said, should_refer: v.should_refer, urgent: v.urgent, got_refer: refer, got_urgent: urgent, flags: flags.map((f) => f.code), record: res.record, agree });
  }
  const r = {
    set: "vignettes", ruleset: RULESET.id, items: items.length,
    refer: { positives: tp + fn, negatives: tn + fp, tp, fn, tn, fp, sensitivity: pct(tp, tp + fn), specificity: pct(tn, tn + fp) },
    urgent: { gold: uGold, caught: uHit, recall: pct(uHit, uGold), predicted: uPred, precision: pct(uPredOk, uPred) },
    rows,
  };
  console.log(`vignettes: ${items.length} items, labels from guideline text (ruleset ${RULESET.id})`);
  console.log(`should refer: sensitivity ${r.refer.sensitivity}% (${tp}/${tp + fn}) · specificity ${r.refer.specificity}% (${tn}/${tn + fp})`);
  console.log(`urgent      : ${uHit}/${uGold} urgent vignettes got an urgent flag (${r.urgent.recall}%) · ${uPredOk}/${uPred} urgent flags were labelled urgent`);
  for (const x of rows.filter((x) => !x.agree)) console.log(`  ${x.id} want refer=${x.should_refer} urgent=${x.urgent}, got refer=${x.got_refer} urgent=${x.got_urgent} [${x.flags.join(",") || "-"}]${showMisses ? "\n     " + x.said + "\n     " + JSON.stringify(x.record) : ""}`);
  if (publish) out("eval-vignettes", { run_at: new Date().toISOString(), ...r });
}

/* ---------------- real speech (dictation page) ---------------- */
function realspeech(path) {
  if (!path) { console.error("usage: node eval/run.js realspeech <results.json>"); process.exit(2); }
  const input = JSON.parse(readFileSync(path, "utf8"));
  const engine = String(input.engine || "unknown").replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "unknown";
  const gold = readJsonl("heldout");
  const byId = new Map(gold.map((it) => [it.id, it]));
  const heard = new Map();
  for (const r of input.results || []) if (r && r.heard != null && String(r.heard).trim() && byId.has(r.id)) heard.set(r.id, String(r.heard));
  const subset = gold.filter((it) => heard.has(it.id));
  const used = fieldsUsed(gold);
  const spoken = score("spoken", subset, used, (it) => heard.get(it.id));
  const written = score("written", subset, used, (it) => it.said);
  const skipped = (input.results || []).filter((r) => r && (r.heard == null || !String(r.heard).trim())).length;
  const unknown = (input.results || []).filter((r) => r && r.heard != null && !byId.has(r.id)).map((r) => r.id);
  console.log(`realspeech (${engine}): ${subset.length} heard, ${skipped} skipped${unknown.length ? `, ${unknown.length} unknown ids` : ""} (ruleset ${RULESET.id})`);
  console.log(summary(spoken));
  console.log(summary(written));
  if (showMisses) printMisses(spoken);
  const rows = spoken.rows.map((r) => ({ id: r.id, heard: r.text, record: r.record, flags: r.flags, flags_want: r.flags_want, misses: r.misses, written_misses: written.rows.find((w) => w.id === r.id)?.misses || [] }));
  out(`eval-realspeech-${engine}`, { set: "realspeech", engine, run_at: new Date().toISOString(), ruleset: RULESET.id, heard: subset.length, skipped, spoken: strip(spoken), written: strip(written), rows });
}

/* ---------------- labelled sets ---------------- */
function sets() {
  const items = readJsonl(which);
  const used = fieldsUsed(items);
  const typed = score("typed", items, used), auto = score("auto", items, used);
  console.log(`${which}: ${items.length} items (ruleset ${RULESET.id})`);
  console.log(summary(typed));
  console.log(summary(auto));
  if (showMisses) printMisses(typed);
  if (publish) out(`eval-${which}`, { set: which, run_at: new Date().toISOString(), ruleset: RULESET.id, typed: strip(typed), auto: strip(auto) });
}

if (which === "vignettes") vignettes();
else if (which === "realspeech") realspeech(args.filter((a) => !a.startsWith("--"))[1]);
else sets();
