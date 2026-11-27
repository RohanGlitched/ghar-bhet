// The reader must not get worse on the sets it was tuned on.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

for (const set of ["dev", "dev2"]) {
  test(`no regression on the ${set} set`, () => {
    const out = execFileSync(process.execPath, ["eval/run.js", set], { encoding: "utf8" });
    const m = out.match(/typed fields ([\d.]+)% recall .* danger visits caught (\d+)\/(\d+)/);
    assert.ok(m, out);
    assert.ok(+m[1] >= 97, `field recall ${m[1]}%`);
    assert.equal(m[2], m[3], "every danger visit caught");
  });
}
