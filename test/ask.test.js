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
