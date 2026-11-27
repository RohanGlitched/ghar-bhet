// The reader must not get worse on the sets it was tuned on, and the eval modes must work.
// Results go to a temp folder (--out), so the tests never change tracked files.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "gharbhet-eval-"));
const run = (...a) => execFileSync(process.execPath, ["eval/run.js", ...a, `--out=${tmp}`], { encoding: "utf8" });
const result = (name) => JSON.parse(readFileSync(join(tmp, `${name}.json`), "utf8"));

for (const set of ["dev", "dev2", "dev3", "dev4", "dev5"]) {
  test(`no regression on the ${set} set`, () => {
    run(set, "--publish");
    const { typed } = result(`eval-${set}`);
    assert.ok(typed.fields.recall >= 98, `field recall ${typed.fields.recall}%`);
    assert.equal(typed.danger.caught, typed.danger.visits, "every danger visit caught");
    assert.equal(typed.danger.false_alarms, 0, "no false alarms");
  });
}

test("held-out set stays at or above run 2 (99.3% fields, every danger visit, no false alarm)", () => {
  run("heldout", "--publish");
  const { typed } = result("eval-heldout");
  assert.ok(typed.fields.recall >= 99.3, `field recall ${typed.fields.recall}%`);
  assert.equal(typed.danger.caught, typed.danger.visits);
  assert.equal(typed.danger.false_alarms, 0);
});

for (const set of ["adversarial", "adversarial2"]) test(`${set} set stays at or above its run 2 (every danger visit, no false alarm)`, () => {
  run(set, "--publish");
  const { typed } = result(`eval-${set}`);
  assert.ok(typed.fields.recall >= 98, `field recall ${typed.fields.recall}%`);
  assert.equal(typed.danger.caught, typed.danger.visits);
  assert.equal(typed.danger.false_alarms, 0);
});

test("clinical vignettes: no visit that the guidelines refer is missed", () => {
  run("vignettes", "--publish");
  const r = result("eval-vignettes");
  assert.equal(r.items, 52);
  assert.equal(r.refer.sensitivity, 100);
  assert.ok(r.refer.specificity >= 80, `specificity ${r.refer.specificity}%`);
});

test("second vignette set (independent writer): the after-fix level holds", () => {
  run("vignettes2", "--publish");
  const r = result("eval-vignettes2");
  assert.equal(r.set, "vignettes2"); assert.equal(r.items, 40);
  assert.equal(r.refer.sensitivity, 100);
  assert.equal(r.urgent.recall, 100);
  assert.ok(r.refer.specificity >= 90, `specificity ${r.refer.specificity}%`);
});

test("realspeech mode scores heard text against the held-out gold, written vs spoken", () => {
  const cards = JSON.parse(readFileSync(new URL("../public/data/realspeech-cards.json", import.meta.url), "utf8")).cards;
  const first = cards[0];
  const file = join(tmp, "fixture-results.json");
  writeFileSync(file, JSON.stringify({ engine: "fixture", results: [
    { id: first.id, lang: first.lang, heard: first.read },
    { id: cards[1].id, lang: cards[1].lang, heard: null },
    { id: "no-such-id", lang: "hi", heard: "kuch bhi" },
  ] }));
  const outText = run("realspeech", file);
  assert.match(outText, /realspeech \(fixture\): 1 heard, 1 skipped, 1 unknown ids/);
  const r = result("eval-realspeech-fixture");
  assert.equal(r.engine, "fixture");
  assert.equal(r.heard, 1);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].id, first.id);
  assert.equal(r.rows[0].heard, first.read);
  assert.ok(Array.isArray(r.rows[0].flags) && Array.isArray(r.rows[0].misses));
  assert.equal(r.spoken.items, 1);
  assert.equal(r.written.items, 1);
  assert.ok(r.spoken.fields.gold > 0 && r.spoken.fields.gold === r.written.fields.gold);
});
