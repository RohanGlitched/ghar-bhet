import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const servers = [];
let nextPort = 19000 + Math.floor(Math.random() * 800);
async function start(env = {}) {
  const port = nextPort++;
  const base = `http://127.0.0.1:${port}`;
  const clean = { ...process.env };
  for (const k of ["K_SERVICE", "GCS_BUCKET", "GCS_TOKEN", "GCS_OBJECT", "ALLOW_RESET", "TRUST_PROXY"]) delete clean[k];
  const proc = spawn(process.execPath, ["server/index.js"], { env: { ...clean, PORT: String(port), DATA_DIR: mkdtempSync(join(tmpdir(), "gb-")), ...env }, stdio: "pipe" });
  let log = ""; proc.stdout.on("data", (d) => (log += d)); proc.stderr.on("data", (d) => (log += d));
  servers.push(proc);
  for (let i = 0; i < 80; i++) { try { if ((await fetch(base + "/api/health")).ok) return { base, proc, log: () => log }; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("server did not start: " + log);
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (base, p, body, headers = {}) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const state = async (base) => (await fetch(base + "/api/state")).json();

let BASE;
test.before(async () => { BASE = (await start({ RATE_PER_MIN: "1000" })).base; });
test.after(() => { for (const p of servers) p.kill(); });

test("every page opens without any keys", async () => {
  for (const p of ["/", "/visit", "/anm", "/evidence", "/how", "/robots.txt", "/js/understand.js"]) assert.equal((await fetch(BASE + p)).status, 200, p);
  assert.equal((await fetch(BASE + "/no-such-page")).status, 404);
  const h = (await fetch(BASE + "/")).headers;
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.match(h.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("the sample village has referrals and visits due, marked as sample", async () => {
  const s = await state(BASE);
  assert.ok(s.people.length >= 10);
  assert.ok(s.referrals.length >= 1);
  assert.ok(s.people.some((p) => p.dueToday));
  assert.equal(s.village.sample, true);
  assert.ok(s.people.every((p) => p.sample === true));
  assert.ok(s.referrals.every((r) => r.sample === true));
  assert.ok(s.referrals.some((r) => r.status === "seen" && r.seenBy === "ANM" && r.seenAt));
});

test("a saved visit is re-checked by the server and becomes a referral", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Testbaby", day: 7, weight_g: 1600, symptoms: { chest_indrawing: true } }, said: ["test"], lang: "hi" })).json();
  assert.ok(v.flags.some((f) => f.code === "nb_very_low_weight"));
  assert.equal(v.referral.status, "open");
  assert.equal(v.matched, "new");
  assert.equal(v.person.name, "Testbaby");
  const slip = await (await fetch(BASE + `/api/visits/${v.id}`)).json();
  assert.equal(slip.name, "Testbaby");
  assert.equal(slip.person.id, v.personId);
  const r = await post(BASE, `/api/referrals/${v.id}/seen`, { by: "ANM Kale" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "seen");
});

test("a referral marked seen by mistake can be opened again", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Reopenme", weeks: 30, bp_sys: 150, bp_dia: 100 } })).json();
  assert.equal(v.referral.status, "open");
  await post(BASE, `/api/referrals/${v.id}/seen`, { by: "Someone" });
  let r = (await state(BASE)).referrals.find((x) => x.id === v.id);
  assert.equal(r.status, "seen"); assert.equal(r.seenBy, "Someone"); assert.ok(r.seenAt); assert.equal(r.sample, false);
  const res = await post(BASE, `/api/referrals/${v.id}/open`, { by: "ANM" });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(await res.json()).sort(), ["id", "ok", "reopenedAt", "seenAt", "seenBy", "status"]);
  r = (await state(BASE)).referrals.find((x) => x.id === v.id);
  assert.equal(r.status, "open"); assert.equal(r.seenAt, null); assert.equal(r.seenBy, null); assert.ok(r.reopenedAt);
  assert.equal((await post(BASE, "/api/referrals/nope/open", {})).status, 404);
});

test("the server ignores flags sent by a client and drops unknown fields", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "X", bp_sys: 120, bp_dia: 80, evil: "<script>", symptoms: { bleeding: "yes" } }, flags: [{ code: "fake" }] })).json();
  assert.deepEqual(v.flags, []);
  assert.equal(v.record.evil, undefined);
  assert.equal(v.record.symptoms, undefined);
  // fields from another visit type are dropped too (a newborn has no BP)
  const nb = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Y", day: 4, bp_sys: 150, weeks: 30 } })).json();
  assert.equal(nb.record.bp_sys, undefined); assert.equal(nb.record.weeks, undefined); assert.equal(nb.record.day, 4);
  // postnatal BP and Hb are kept for the mother's rules
  const pnc = await (await post(BASE, "/api/visits", { type: "pnc", record: { name: "Zed", day: 2, bp_sys: 150, bp_dia: 100, hb: 6.5 } })).json();
  assert.equal(pnc.record.bp_sys, 150); assert.equal(pnc.record.hb, 6.5);
});

test("an empty visit is refused with a clear message", async () => {
  for (const record of [{}, { name: "Sunita" }, { name: "Sunita", evil: 1 }, { symptoms: { "BAD KEY": true } }]) {
    const r = await post(BASE, "/api/visits", { type: "anc", record });
    assert.equal(r.status, 400, JSON.stringify(record));
    assert.match((await r.json()).error, /nothing in it/);
  }
  const before = (await state(BASE)).people.length;
  await post(BASE, "/api/visits", { type: "pnc", record: {} });
  assert.equal((await state(BASE)).people.length, before, "no 'New mother' row from an empty visit");
});

test("bad requests get a plain answer", async () => {
  assert.equal((await post(BASE, "/api/visits", "{nope")).status, 400);
  assert.equal((await post(BASE, "/api/visits", "{}")).status, 400);
  assert.equal((await post(BASE, "/api/visits", "[1,2]")).status, 400);
  assert.equal((await post(BASE, "/api/reset", "{}")).status, 403);
  assert.ok([403, 404].includes((await fetch(BASE + "/..%2f..%2fserver%2findex.js")).status), "no file outside public/");
  assert.equal((await fetch(BASE + "/%E0%A4%A")).status, 400, "malformed %-encoding is a 400, not a 500");
  assert.equal((await fetch(BASE + "/js/%ZZ.js")).status, 400);
});

// ---------- who is this visit about? ----------
const baby = (s, name) => s.people.find((p) => p.kind === "baby" && p.name === name && p.sample);

test("a new baby with a sample baby's name, but a different age, is a new person", async () => {
  const s0 = await state(BASE);
  const sample = baby(s0, "Sunita");
  assert.equal(sample.dayOfLife, 7);
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Sunita", day: 3, weight_g: 2800 } })).json();
  assert.equal(v.matched, "new");
  assert.notEqual(v.personId, sample.id);
  const s1 = await state(BASE);
  assert.equal(s1.people.find((p) => p.id === v.personId).dayOfLife, 3);
  assert.equal(baby(s1, "Sunita").dayOfLife, 7, "the sample Sunita's baby is untouched");
});

test("same name and an age within two days joins the same baby, and the board shows the newest day", async () => {
  const sample = baby(await state(BASE), "Pooja"); // day 14
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Pooja", day: 13, weight_g: 2900, feeding: "good" } })).json();
  assert.equal(v.matched, "name_age");
  assert.equal(v.personId, sample.id);
  assert.equal((await state(BASE)).people.find((p) => p.id === sample.id).dayOfLife, 13);
});

test("a personId from the board's link picks the person even when the name differs, and updates the day", async () => {
  const sample = baby(await state(BASE), "Rekha"); // day 3
  const v = await (await post(BASE, "/api/visits", { type: "newborn", personId: sample.id, record: { name: "Rekhaa", day: 5, weight_g: 2700 } })).json();
  assert.equal(v.matched, "personId");
  assert.equal(v.personId, sample.id);
  assert.equal((await state(BASE)).people.find((p) => p.id === sample.id).dayOfLife, 5);
  // a personId of the wrong kind (a pregnant woman for a newborn visit) is not used
  const meena = (await state(BASE)).people.find((p) => p.name === "Meena");
  const w = await (await post(BASE, "/api/visits", { type: "newborn", personId: meena.id, record: { name: "Meena", day: 2 } })).json();
  assert.notEqual(w.personId, meena.id);
  // an unknown personId falls back to the name and age
  const u = await (await post(BASE, "/api/visits", { type: "newborn", personId: "zzzz", record: { name: "Kavita", day: 28 } })).json();
  assert.equal(u.matched, "name_age");
});

test("pregnancies match by weeks within three, or month within one", async () => {
  const meena = (await state(BASE)).people.find((p) => p.name === "Meena" && p.sample); // 32 weeks
  const a = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Meena", weeks: 30, hb: 11.5 } })).json();
  assert.equal(a.personId, meena.id);
  assert.equal((await state(BASE)).people.find((p) => p.id === meena.id).weeks, 30);
  const b = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Meena", weeks: 18, hb: 11.5 } })).json();
  assert.equal(b.matched, "new");
  const saroj = (await state(BASE)).people.find((p) => p.name === "Saroj" && p.sample); // 35 weeks, about the 8th/9th month
  const c = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Saroj", month: 9, hb: 11 } })).json();
  assert.equal(c.personId, saroj.id);
  const d = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Saroj", month: 4, hb: 11 } })).json();
  assert.equal(d.matched, "new");
});

test("mothers after delivery match by day within two", async () => {
  const sudha = (await state(BASE)).people.find((p) => p.name === "Sudha" && p.sample); // day 5
  const a = await (await post(BASE, "/api/visits", { type: "pnc", record: { name: "Sudha", day: 6, pads: 2 } })).json();
  assert.equal(a.personId, sudha.id);
  const b = await (await post(BASE, "/api/visits", { type: "pnc", record: { name: "Sudha", day: 20, pads: 2 } })).json();
  assert.equal(b.matched, "new");
});

test("with no age said, a name joins only when exactly one person has it", async () => {
  const shabnam = baby(await state(BASE), "Shabnam");
  const a = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Shabnam", feeding: "good" } })).json();
  assert.equal(a.matched, "name"); assert.equal(a.personId, shabnam.id);
  // there are two Sunita babies now (sample day 7 and the new day 3): ambiguous, so a new row
  const b = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Sunita", feeding: "good" } })).json();
  assert.equal(b.matched, "new");
});

// ---------- abuse limits ----------
test("made-up X-Forwarded-For headers do not get round the write limit", async () => {
  const { base } = await start(); // not behind a proxy: the socket address counts
  let last;
  for (let i = 0; i < 22; i++) last = await post(base, "/api/referrals/none/seen", {}, { "x-forwarded-for": `10.0.0.${i}` });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
});

test("behind Cloud Run the last X-Forwarded-For entry is the visitor; there is a cap for everyone and on live boards", async () => {
  const { base } = await start({ K_SERVICE: "ghar-bhet", RATE_GLOBAL_PER_MIN: "30", SSE_PER_IP: "2" });
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await post(base, "/api/referrals/none/seen", {}, { "x-forwarded-for": `1.2.3.${i}, 9.9.9.9` })).status);
  assert.deepEqual(codes.slice(0, 20), Array(20).fill(404));
  assert.equal(codes[20], 429, "spoofed first entries, same real address: limited");
  assert.equal((await post(base, "/api/referrals/none/seen", {}, { "x-forwarded-for": "9.9.9.9, 8.8.8.8" })).status, 404, "another real address is not limited");
  // global cap: 21 counted so far; distinct visitors run into the cap of 30
  const more = [];
  for (let i = 0; i < 12; i++) more.push((await post(base, "/api/referrals/none/seen", {}, { "x-forwarded-for": `7.7.7.${i}` })).status);
  assert.ok(more.slice(0, 9).every((c) => c === 404), more.join());
  assert.equal(more[11], 429, "everyone together is capped");
  // live boards: two per visitor
  const ac = [new AbortController(), new AbortController(), new AbortController()];
  const h = { "x-forwarded-for": "5.5.5.5" };
  const s1 = await fetch(base + "/api/stream", { headers: h, signal: ac[0].signal });
  const s2 = await fetch(base + "/api/stream", { headers: h, signal: ac[1].signal });
  assert.equal(s1.status, 200); assert.equal(s2.status, 200);
  const s3 = await fetch(base + "/api/stream", { headers: h, signal: ac[2].signal });
  assert.equal(s3.status, 429);
  assert.equal((await fetch(base + "/api/stream", { headers: { "x-forwarded-for": "6.6.6.6" }, signal: ac[2].signal })).status, 200);
  ac[0].abort(); await wait(300);
  const s4 = await fetch(base + "/api/stream", { headers: h, signal: ac[1].signal });
  assert.equal(s4.status, 200, "a closed board frees its slot");
  for (const c of ac) c.abort();
});

test("the public register can't grow without bound: oldest non-sample entries go first", async () => {
  const { base } = await start({ RATE_PER_MIN: "1000", MAX_PEOPLE: "18", MAX_VISITS: "20" });
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push((await (await post(base, "/api/visits", { type: "anc", record: { name: `Grow${"abcdefgh"[i]}`, weeks: 20, hb: 12 } })).json()).personId);
  const s = await state(base);
  assert.ok(s.people.length <= 18, `people ${s.people.length}`);
  assert.equal(s.people.filter((p) => p.sample).length, 15, "every sample person is kept");
  assert.ok(!s.people.some((p) => p.id === ids[0]), "the oldest new person was dropped");
  assert.ok(s.people.some((p) => p.id === ids[7]), "the newest is kept");
  for (let i = 0; i < 6; i++) await post(base, "/api/visits", { type: "anc", record: { name: "Growh", weeks: 20, hb: 12 } });
  const s2 = await state(base);
  assert.equal(s2.people.filter((p) => p.sample).length, 15);
  assert.ok(s2.recent.length <= 15);
  const all = await (await fetch(base + "/api/state")).json();
  assert.ok(all.limits.visits === 20);
});

// ---------- optional: the Cloud Storage copy, against a real bucket ----------
// Runs only with GCS_TEST_BUCKET and GCS_TOKEN set, e.g.
//   GCS_TEST_BUCKET=my-bucket GCS_TOKEN=$(gcloud auth print-access-token) node --test test/server.test.js
const GB = process.env.GCS_TEST_BUCKET, GT = process.env.GCS_TOKEN;
test("the register survives a restart through Cloud Storage", { skip: !(GB && GT) && "set GCS_TEST_BUCKET and GCS_TOKEN to run" }, async () => {
  const object = `test/register-${Date.now()}.json`;
  const env = { GCS_BUCKET: GB, GCS_TOKEN: GT, GCS_OBJECT: object, GCS_DEBOUNCE_MS: "200", RATE_PER_MIN: "1000" };
  const objUrl = `https://storage.googleapis.com/storage/v1/b/${GB}/o/${encodeURIComponent(object)}`;
  const auth = { authorization: `Bearer ${GT}` };
  try {
    const one = await start(env);
    assert.match(one.log(), /loaded from seed/);
    const v = await (await post(one.base, "/api/visits", { type: "newborn", record: { name: "Cloudbaby", day: 2, weight_g: 2600 } })).json();
    let stored = null;
    for (let i = 0; i < 50 && !stored?.visits?.some((x) => x.id === v.id); i++) { await wait(200); const r = await fetch(objUrl + "?alt=media", { headers: auth }); stored = r.ok ? await r.json() : null; }
    assert.ok(stored?.visits?.some((x) => x.id === v.id), "the visit reached the bucket");
    one.proc.kill(); await wait(300);
    const two = await start(env); // fresh DATA_DIR: only the bucket has the visit
    assert.match(two.log(), /loaded from gcs/);
    assert.ok((await state(two.base)).people.some((p) => p.name === "Cloudbaby"));
  } finally {
    await fetch(objUrl, { method: "DELETE", headers: auth }).catch(() => {});
  }
});
