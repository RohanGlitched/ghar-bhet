import test from "node:test";
import assert from "node:assert/strict";
import { answer } from "../public/js/ask.js";

const S = {
  people: [
    { id: "a", kind: "baby", name: "Sunita", dayOfLife: 7, atRisk: true, dueToday: true, last: { refer: true } },
    { id: "b", kind: "pregnant", name: "Meena", weeks: 32, dueToday: false, last: { watch: true } },
    { id: "c", kind: "mother", name: "Sudha", dayAfter: 3, dueToday: true, last: null },
  ],
  referrals: [
    { id: "v1", status: "open", type: "newborn", name: "Sunita", flags: [{ title: "Chest indrawing" }] },
    { id: "v0", status: "seen", type: "anc", name: "Meena", flags: [{ title: "High BP" }] },
  ],
};

test("the nurse can ask the board in Hindi, Marathi and English", () => {
  for (const q of ["Aaj kaun kaun refer hua?", "आज कौन कौन रेफर हुआ?", "आज कोणाला रेफर केलं?", "Who was referred today?"]) {
    const a = answer(q, S);
    assert.equal(a.intent, "referrals", q);
    assert.match(a.en, /^1 open referral: Sunita's baby, chest indrawing/);
  }
  for (const q of ["Aaj kiske ghar jaana hai?", "आज कोणाची भेट बाकी आहे?", "Whose visits are due today?"]) {
    const a = answer(q, S);
    assert.equal(a.intent, "due", q);
    assert.match(a.en, /2 home visits due today/);
  }
  for (const q of ["Kaun khatre mein hai?", "कोण धोक्यात आहे?", "Who is at risk?"]) assert.equal(answer(q, S).intent, "risk", q);
  assert.match(answer("How is Meena?", S).en, /^Meena: 32 weeks pregnant, to watch/);
  assert.match(answer("सुनीता का बच्चा कैसा है?", S).en, /^Sunita's baby: day 7/);
  assert.equal(answer("hello", S).intent, "help");
});

test("one definition of who to watch, for the tile and the spoken answer, listing every name", async () => {
  const { toWatch } = await import("../public/js/ask.js");
  const people = [...S.people, { id: "d", kind: "mother", name: "Laxmi", dayAfter: 2, last: { refer: false, watch: false } }];
  const a = answer("Who is at risk?", { ...S, people });
  assert.equal(toWatch(people).length, 2);
  assert.match(a.en, /^2 need follow-up after their last visit \(1 referred, 1 to watch\): Sunita's baby \(referred\), Meena \(watch\)\.$/);
  assert.equal(a.items.length, 2);
});

test("Hindi and Marathi referral answers say the reason too", () => {
  const S2 = { ...S, referrals: [{ id: "v1", status: "open", type: "newborn", name: "Sunita", flags: [{ code: "nb_chest_indrawing", title: "Chest indrawing" }] }] };
  assert.match(answer("Aaj kaun kaun refer hua?", S2).hi, /Sunita का बच्चा, पसली चलना/);
  assert.match(answer("आज कोणाला रेफर केलं?", S2).mr, /Sunita चं बाळ, छाती आत ओढणे/);
});

test("a named person's last values, and one field when asked", () => {
  const people = S.people.map((p) => p.id === "b" ? { ...p, last: { watch: true, record: { bp_sys: 150, bp_dia: 100, weight_kg: 55 } } } : p);
  const a = answer("Meena ka BP kitna tha?", { ...S, people });
  assert.match(a.en, /last visit: BP 150\/100\.$/);
  assert.match(a.hi, /बीपी 150 बटा 100/);
  assert.match(answer("How is Meena?", { ...S, people }).en, /BP 150\/100, weight 55 kg/);
});

test("'X dekh liya' marks that person's open referral as seen", () => {
  for (const q of ["Sunita dekh liya", "सुनीता का बच्चा देख लिया", "Sunita seen", "सुनीताचं बाळ पाहिलं"]) {
    const a = answer(q, S);
    assert.equal(a.intent, "seen", q);
    assert.equal(a.id, "v1", q);
  }
  assert.equal(answer("Meena dekh liya", S).id, undefined);
});

test("the alert's big line comes from each rule's urgent field: go now for urgent rules, today for the rest", async () => {
  const { bigLine } = await import("../public/js/ask.js");
  const { RULE_TABLE } = await import("../public/js/rules.js");
  const refer = RULE_TABLE.filter((r) => r.severity === "refer_now");
  assert.ok(refer.some((r) => r.urgent) && refer.some((r) => !r.urgent), "the table has both kinds");
  for (const r of refer) {
    const line = bigLine([{ ...r }], r.type);
    if (r.urgent) assert.match(line, /now\. Call 108\.$/, r.code);
    else { assert.match(line, /today\.$/, r.code); assert.doesNotMatch(line, /now|108/, r.code); }
  }
});

test("urgent referrals come first in the spoken answer; outcomes and undo are understood", () => {
  const S2 = { people: S.people, referrals: [
    { id: "v1", status: "open", type: "newborn", name: "Sunita", flags: [{ code: "nb_chest_indrawing", title: "Chest indrawing" }] },
    { id: "v2", status: "open", type: "anc", name: "Meena", urgent: true, flags: [{ code: "anc_imminent_eclampsia", title: "Very high BP", urgent: true }] }] };
  const a = answer("Aaj kaun kaun refer hua?", S2);
  assert.match(a.en, /^1 urgent\. 2 open referrals: Meena, urgent/);
  assert.match(a.hi, /Meena, तुरंत/);
  for (const [q, o] of [["Sunita PHC pahunchi", "reached"], ["Sunita gaye nahi", "refused"], ["सुनीता पहुंची नहीं", "refused"], ["Meena bharti ho gayi", "admitted"], ["Meena ka phone nahi lag raha", "not_reachable"]]) {
    const r = answer(q, S2);
    assert.equal(r.intent, "outcome", q); assert.equal(r.outcome, o, q);
  }
  assert.equal(answer("wapas", S2).intent, "undo");
  assert.equal(answer("Kal kaun refer hua tha?", S2).intent, "help");
});
