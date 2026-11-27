// Rebuild two published first-run numbers from git history and compare them with the published JSON.
//
//   npm run reproduce        (or: node eval/reproduce.mjs)
//
// 1. Held-out run 2: a temporary git worktree at f34bdd4 (the reader, rules, run.js and set of that
//    time), `node eval/run.js heldout`, compared with eval/heldout-run2.json.
// 2. Adversarial set 2, run 1: a worktree at 0ed097e (the reader that set was first run against),
//    with eval/adversarial2.jsonl copied in from commit 2c541ef, `node eval/run.js adversarial2`,
//    compared with eval/adversarial2-run1.json. The committed copy of the set has flags regenerated
//    for later rule sets, so the expected flags (and the flag recall) can differ slightly from the
//    frozen run; fields, danger visits and false alarms come from the gold records and are compared.
//
// Prints MATCH or MISMATCH per number and exits 1 on any mismatch. The worktrees are removed after.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const root = git("rev-parse", "--show-toplevel");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const parse = (out) => {
  const m = out.match(/typed\s+fields ([0-9.]+)% recall \/ ([0-9.]+)% precision .*?danger visits caught ([0-9]+)\/([0-9]+).*?false alarms ([0-9]+)\/([0-9]+)/);
  if (!m) throw new Error("could not read the run output:\n" + out);
  return { recall: +m[1], precision: +m[2], caught: +m[3], visits: +m[4], false_alarms: +m[5], normal_visits: +m[6] };
};

function inWorktree(commit, prepare, set) {
  const dir = mkdtempSync(join(tmpdir(), "ghar-bhet-reproduce-"));
  rmSync(dir, { recursive: true, force: true });
  git("worktree", "add", "--detach", dir, commit);
  try {
    if (prepare) prepare(dir);
    return parse(execFileSync(process.execPath, ["eval/run.js", set], { cwd: dir, encoding: "utf8" }));
  } finally {
    git("worktree", "remove", "--force", dir);
  }
}

const jobs = [
  { name: "Held-out run 2 (f34bdd4)", commit: "f34bdd4", set: "heldout", published: read("eval/heldout-run2.json").typed },
  {
    name: "Adversarial set 2, run 1 (0ed097e, set from 2c541ef)", commit: "0ed097e", set: "adversarial2", published: read("eval/adversarial2-run1.json").typed,
    prepare: (dir) => writeFileSync(join(dir, "eval/adversarial2.jsonl"), execFileSync("git", ["show", "2c541ef:eval/adversarial2.jsonl"])),
  },
];

let ok = true;
for (const j of jobs) {
  const got = inWorktree(j.commit, j.prepare, j.set);
  const want = { recall: j.published.fields.recall, precision: j.published.fields.precision, caught: j.published.danger.caught, visits: j.published.danger.visits, false_alarms: j.published.danger.false_alarms, normal_visits: j.published.danger.normal_visits };
  const same = Object.keys(want).every((k) => want[k] === got[k]);
  ok &&= same;
  console.log(`${same ? "MATCH   " : "MISMATCH"} ${j.name}: fields ${got.recall}% / ${got.precision}%, danger ${got.caught}/${got.visits}, false alarms ${got.false_alarms}/${got.normal_visits}` + (same ? "" : `  (published: fields ${want.recall}% / ${want.precision}%, danger ${want.caught}/${want.visits}, false alarms ${want.false_alarms}/${want.normal_visits})`));
}
process.exit(ok ? 0 : 1);
