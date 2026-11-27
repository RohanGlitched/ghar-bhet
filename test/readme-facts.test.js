// The README must state the rule table as it is in the code: every line that describes
// public/js/rules.js (or the rule table) and names a count of rules or a rule set id must match
// RULE_TABLE.length and RULESET.id. History lines ("the first rule set ... 37 rules") are fine
// as long as they do not describe rules.js today.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULE_TABLE, RULESET } from "../public/js/rules.js";

test("README rule count and rule set id match the code", () => {
  const text = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const lines = text.split(String.fromCharCode(10)).filter((l) => /rules\.js/.test(l) && (/[0-9]+ rules/.test(l) || /mohfw-20[0-9.]+/.test(l)));
  assert.ok(lines.length > 0, "README should say how many rules rules.js holds");
  for (const l of lines) {
    for (const m of l.matchAll(/([0-9]+) rules/g)) assert.equal(+m[1], RULE_TABLE.length, `README says ${m[0]}: ${l.trim().slice(0, 120)}`);
    for (const m of l.matchAll(/mohfw-20[0-9]+\.[0-9]+/g)) assert.equal(m[0], RULESET.id, `README says ${m[0]}: ${l.trim().slice(0, 120)}`);
  }
});
