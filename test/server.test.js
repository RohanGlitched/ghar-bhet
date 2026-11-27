import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 19000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
let proc;
test.before(async () => {
  proc = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(PORT), DATA_DIR: mkdtempSync(join(tmpdir(), "gb-")) }, stdio: "pipe" });
  for (let i = 0; i < 60; i++) { try { if ((await fetch(BASE + "/api/health")).ok) return; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start");
});
test.after(() => proc && proc.kill());
const post = (p, body) => fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

test("every page opens without any keys", async () => {
  for (const p of ["/", "/visit", "/anm", "/evidence", "/how", "/robots.txt", "/js/understand.js"]) assert.equal((await fetch(BASE + p)).status, 200, p);
  assert.equal((await fetch(BASE + "/no-such-page")).status, 404);
});

test("the sample village has referrals and visits due", async () => {
  const s = await (await fetch(BASE + "/api/state")).json();
  assert.ok(s.people.length >= 10);
  assert.ok(s.referrals.length >= 1);
  assert.ok(s.people.some((p) => p.dueToday));
});

test("a saved visit is re-checked by the server and becomes a referral", async () => {
  const v = await (await post("/api/visits", { type: "newborn", record: { name: "Testbaby", day: 7, weight_g: 1600, symptoms: { chest_indrawing: true } }, said: ["test"], lang: "hi" })).json();
  assert.ok(v.flags.some((f) => f.code === "nb_very_low_weight"));
  assert.equal(v.referral.status, "open");
  const slip = await (await fetch(BASE + `/api/visits/${v.id}`)).json();
  assert.equal(slip.name, "Testbaby");
  assert.equal((await post(`/api/referrals/${v.id}/seen`, {})).status, 200);
});

test("the server ignores flags sent by a client and drops unknown fields", async () => {
  const v = await (await post("/api/visits", { type: "anc", record: { name: "X", bp_sys: 120, bp_dia: 80, evil: "<script>", symptoms: { bleeding: "yes" } }, flags: [{ code: "fake" }] })).json();
  assert.deepEqual(v.flags, []);
  assert.equal(v.record.evil, undefined);
  assert.equal(v.record.symptoms, undefined);
});

test("bad requests get a plain answer", async () => {
  assert.equal((await post("/api/visits", "{nope")).status, 400);
  assert.equal((await post("/api/visits", "{}")).status, 400);
  assert.equal((await post("/api/reset", "{}")).status, 403);
  assert.ok([403, 404].includes((await fetch(BASE + "/..%2f..%2fserver%2findex.js")).status), "no file outside public/");
});
