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
  assert.ok(s.referrals.some((r) => r.status === "seen" && r.seenBy === "Nurse" && r.seenAt));
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
  assert.deepEqual(Object.keys(await res.json()).sort(), ["id", "ok", "outcome", "outcomeAt", "outcomeBy", "reopenedAt", "seenAt", "seenBy", "status", "urgent"]);
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

// ---------- the server re-reads what the ASHA said ----------
const FITS = "Sunita ka baby 5 din ka, wajan 3 kilo, jhatke aa rahe hain, bukhar 103";

test("a danger sign in the ASHA's words but not in the record is added as a server flag and refers", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Trans", day: 5, weight_g: 3000 }, said: [FITS] })).json();
  const added = v.flags.filter((f) => f.from === "transcript");
  assert.deepEqual(added.map((f) => f.code).sort(), ["nb_convulsions", "nb_fever"]);
  assert.ok(added.every((f) => f.note === "said in the visit but not in the record" && f.severity === "refer_now"));
  assert.equal(v.referral.status, "open");
  assert.equal(v.referral.urgent, true);
  assert.deepEqual(v.transcript.added.sort(), ["nb_convulsions", "nb_fever"]);
  assert.equal(v.transcript.heard.symptoms.convulsions, true);
  assert.equal(v.record.symptoms, undefined, "the record itself is kept as the ASHA saved it");
  const r = (await state(BASE)).referrals.find((x) => x.id === v.id);
  assert.equal(r.fromTranscript, true);
  assert.ok(r.flags.some((f) => f.code === "nb_convulsions" && f.from === "transcript" && f.urgent));
  const slip = await (await fetch(BASE + `/api/visits/${v.id}`)).json();
  assert.ok(slip.flags.some((f) => f.from === "transcript"));
});

const DISAGREES = "said in the visit, record disagrees — nurse to check";

test("a record that disagrees with the ASHA's words can't erase a spoken danger sign", async () => {
  // record says no fits; she said fits: the record's value is kept, the flag is added as a conflict
  const a = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Conflicta", day: 5, weight_g: 3000, symptoms: { convulsions: false } }, said: ["baby ko jhatke aa rahe hain"] })).json();
  const fits = a.flags.find((f) => f.code === "nb_convulsions");
  assert.ok(fits && fits.from === "transcript" && fits.conflict === true && fits.note === DISAGREES);
  assert.equal(a.record.symptoms.convulsions, false, "the record is kept as saved");
  assert.equal(a.referral.status, "open");
  assert.deepEqual(a.transcript.conflicts, ["nb_convulsions"]);
  assert.deepEqual(a.transcript.disagree["symptoms.convulsions"], { record: false, said: true });
  // record 37 °C; she said 39
  const b = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Conflictb", day: 4, temp_c: 37 }, said: ["baby ka temperature 39 hai"] })).json();
  const fever = b.flags.find((f) => f.code === "nb_fever");
  assert.ok(fever && fever.conflict && fever.note === DISAGREES);
  assert.equal(b.record.temp_c, 37);
  assert.deepEqual(b.transcript.disagree.temp_c, { record: 37, said: 39 });
  assert.equal(b.referral.status, "open");
  // record BP 120/80; she said 170/115 and fits: fits added (not in record), severe BP added as a conflict
  const c = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Conflictc", weeks: 32, bp_sys: 120, bp_dia: 80 }, said: ["BP 170 by 115, jhatke aaye"] })).json();
  assert.ok(c.flags.some((f) => f.code === "anc_convulsions" && f.from === "transcript" && !f.conflict && f.note === "said in the visit but not in the record"));
  const bp = c.flags.filter((f) => f.conflict && /^anc_(imminent_eclampsia|severe_hypertension)/.test(f.code));
  assert.ok(bp.length >= 1, c.flags.map((f) => f.code).join());
  assert.ok(bp.every((f) => f.urgent));
  assert.deepEqual(c.transcript.disagree.bp_dia, { record: 80, said: 115 });
  assert.equal(c.referral.urgent, true);
  assert.equal(c.record.bp_sys, 120);
  const r = (await state(BASE)).referrals.find((x) => x.id === c.id);
  assert.equal(r.conflict, true);
  assert.ok(r.flags.some((f) => f.conflict && f.note === DISAGREES));
  // a correction across sentences is not a conflict: the words end on the value the record has
  const d = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Conflictd", day: 5, weight_g: 2800, temp_c: 37 }, said: ["Sunita ka baby 5 din ka, wajan 2800 gram, temperature 38", "nahi nahi, 37"] })).json();
  assert.deepEqual(d.flags, []);
});

test("the transcript never removes the record's flags", async () => {
  // a record flag stays even when the words are calm
  const b = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Trans", day: 5, weight_g: 1600 }, said: ["baby theek hai, doodh pee raha hai"] })).json();
  assert.ok(b.flags.some((f) => f.code === "nb_very_low_weight" && !f.from));
  assert.deepEqual(b.transcript.added, []);
  // nothing extra when the record already has it
  const c = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Meena", weeks: 30, bp_sys: 160, bp_dia: 112 }, said: ["Meena 30 hafte, BP 160 by 112"] })).json();
  assert.ok(!c.flags.some((f) => f.from === "transcript"));
  // an empty record with words that say something is read from the words
  const d = await (await post(BASE, "/api/visits", { type: "pnc", record: { name: "Wordsonly" }, said: ["Sudha teesra din, bahut khoon ja raha hai, 6 pad"] })).json();
  assert.ok(d.flags.some((f) => f.code === "pnc_heavy_bleeding" && f.from === "transcript"));
});

test("urgent referrals are marked and come first among open referrals", async () => {
  const u = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Urgentone", weeks: 30, bp_sys: 160, bp_dia: 115 } })).json();
  assert.equal(u.referral.urgent, true);
  assert.ok(u.flags[0].urgent);
  const n = await (await post(BASE, "/api/visits", { type: "anc", record: { name: "Calmone", weeks: 30, bp_sys: 142, bp_dia: 92 } })).json();
  assert.equal(n.referral.status, "open");
  assert.equal(n.referral.urgent, false);
  const s = await state(BASE);
  const open = s.referrals.filter((r) => r.status === "open");
  const firstCalm = open.findIndex((r) => !r.urgent);
  assert.ok(firstCalm > 0 && open.slice(firstCalm).every((r) => !r.urgent), "every urgent open referral is above every non-urgent one");
  assert.ok(open.findIndex((r) => r.id === u.id) < open.findIndex((r) => r.id === n.id));
  assert.equal(s.totals.urgentReferrals, open.filter((r) => r.urgent).length);
});

test("a referral's outcome is stored; refused and unreachable become follow-ups", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Outcomebaby", day: 9, weight_g: 1500 } })).json();
  assert.equal((await post(BASE, `/api/referrals/${v.id}/outcome`, { outcome: "went home" })).status, 400);
  const r = await (await post(BASE, `/api/referrals/${v.id}/outcome`, { outcome: "refused", by: "ASHA Sunanda" })).json();
  assert.equal(r.outcome, "refused"); assert.equal(r.outcomeBy, "ASHA Sunanda"); assert.ok(r.outcomeAt);
  let s = await state(BASE);
  const f = s.followups.find((x) => x.referralId === v.id);
  assert.ok(f, "a follow-up exists");
  assert.equal(f.isDue, false, "due from the next day");
  assert.ok(f.due > Date.now() && f.due - Date.now() <= 24 * 3600e3);
  assert.match(f.reason, /refused/);
  assert.equal(s.referrals.find((x) => x.id === v.id).outcome, "refused");
  assert.ok(s.changes.some((c) => c.referralId === v.id && c.action === "outcome:refused" && c.by === "ASHA Sunanda"));
  await post(BASE, `/api/referrals/${v.id}/outcome`, { outcome: "admitted" });
  s = await state(BASE);
  assert.ok(!s.followups.some((x) => x.referralId === v.id), "admitted closes the follow-up");
  assert.equal((await post(BASE, "/api/referrals/nope/outcome", { outcome: "reached" })).status, 404);
});

test("follow-up timing: no outcome after 24 hours, next day after a refusal, closed by a newer visit", async () => {
  const { Store } = await import("../server/store.js");
  const st = new Store(mkdtempSync(join(tmpdir(), "gbf-")), { bucket: "" });
  await st.load();
  const { visit: v } = st.addVisit({ type: "anc", record: { name: "Timing", weeks: 30, bp_sys: 150, bp_dia: 100 } });
  const H = 3600e3;
  assert.ok(!st.followups(Date.now() + 23 * H).some((f) => f.referralId === v.id), "not before 24 h");
  const late = st.followups(Date.now() + 25 * H).find((f) => f.referralId === v.id);
  assert.ok(late && late.isDue && /No outcome/.test(late.reason));
  st.setOutcome(v.id, "not_reachable", "ASHA");
  const nr = st.followups(Date.now()).find((f) => f.referralId === v.id);
  assert.ok(nr && !nr.isDue && /could not be reached/.test(nr.reason));
  assert.ok(st.followups(nr.due + 1).find((f) => f.referralId === v.id).isDue, "due on the next day");
  await new Promise((r) => setTimeout(r, 5));
  st.addVisit({ type: "anc", personId: v.personId, record: { name: "Timing", weeks: 30, bp_sys: 130, bp_dia: 80 } });
  assert.ok(!st.followups(nr.due + 1).some((f) => f.referralId === v.id), "a newer visit closes it");
  clearTimeout(st.timer);
});

test("the register exports as CSV for the ANM's monthly register", async () => {
  await post(BASE, "/api/visits", { type: "anc", asha: "=HYPERLINK(evil)", record: { name: "Csvwoman", weeks: 28, bp_sys: 150, bp_dia: 100, hb: 9.5, symptoms: { severe_headache: true, bleeding: false } } });
  const r = await fetch(BASE + "/api/export.csv");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/csv/);
  assert.match(r.headers.get("content-disposition"), /attachment; filename="ghar-bhet-register-\d{4}-\d{2}-\d{2}\.csv"/);
  const text = await r.text();
  const lines = text.replace(/^﻿/, "").split("\r\n");
  assert.match(lines[0], /^# Ghar Bhet village register export/);
  assert.match(lines[0], /MCP card/); assert.match(lines[0], /SSBSK/);
  assert.match(lines[1], /sample data/);
  const head = lines[2].split(",");
  for (const h of ["Date of visit", "ASHA", "Visit type", "BP (mmHg)", "Hb (g/dl)", "Danger signs present", "Flags (rule codes)", "Referral status", "Referral outcome"]) assert.ok(head.includes(h), h);
  const row = lines.find((l) => l.includes("Csvwoman"));
  assert.ok(row.includes("150/100") && row.includes("9.5") && row.includes("ANC (pregnancy)"));
  assert.ok(row.includes("'=HYPERLINK(evil)"), "a cell that looks like a formula is defused");
  assert.ok(/anc_/.test(row) && row.includes(",open,"));
  assert.ok(lines.filter((l) => l && !l.startsWith("#")).length >= 14);
});

test("said must be a list of strings; anything else is ignored or refused, never a 500", async () => {
  const a = await post(BASE, "/api/visits", { type: "newborn", record: { name: "Saidbaby", day: 4 }, said: [{ toString: 1 }, 5, "baby theek hai"] });
  assert.equal(a.status, 200);
  assert.deepEqual((await a.json()).said, ["baby theek hai"]);
  assert.equal((await post(BASE, "/api/visits", { type: "newborn", record: { day: 4 }, said: "text" })).status, 400);
});

test("only symptom codes the rules know are kept", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "newborn", record: { name: "Symbaby", day: 6, symptoms: { call_helpline_now_pay_upi: true, convulsions: true } } })).json();
  assert.deepEqual(v.record.symptoms, { convulsions: true });
  assert.ok(!v.noted.some((n) => /helpline/.test(n.code)));
});

test("the same save again within 10 minutes is one visit with a count", async () => {
  const body = { type: "newborn", record: { name: "Repeatbaby", day: 6, weight_g: 1700 }, said: ["Repeatbaby 6 din, wajan 1700 gram"] };
  const a = await (await post(BASE, "/api/visits", body)).json();
  const b = await (await post(BASE, "/api/visits", body)).json();
  assert.equal(a.matched, "new"); assert.equal(a.count, 1);
  assert.equal(b.id, a.id); assert.equal(b.matched, "repeat"); assert.equal(b.count, 2); assert.ok(b.lastAt >= a.at);
  const s = await state(BASE);
  assert.equal(s.people.filter((p) => p.name === "Repeatbaby").length, 1);
  assert.equal(s.people.find((p) => p.name === "Repeatbaby").visits, 1);
  assert.equal(s.recent.find((r) => r.id === a.id).count, 2);
  assert.equal(s.referrals.filter((r) => r.name === "Repeatbaby").length, 1);
  // a different reading is a new visit
  const c = await (await post(BASE, "/api/visits", { ...body, record: { ...body.record, weight_g: 1750 } })).json();
  assert.notEqual(c.id, a.id);
});

test("every person's last result has one of four levels", async () => {
  const mk = async (name, rec) => (await (await post(BASE, "/api/visits", { type: "anc", record: { name, weeks: 26, ...rec } })).json()).personId;
  const ids = { go_now: await mk("Levelgo", { bp_sys: 165, bp_dia: 115 }), refer_today: await mk("Levelrefer", { bp_sys: 142, bp_dia: 92 }), watch: await mk("Levelwatch", { hb: 9.5 }), fine: await mk("Levelfine", { hb: 12.5 }) };
  const s = await state(BASE);
  for (const [level, pid] of Object.entries(ids)) assert.equal(s.people.find((p) => p.id === pid).last.level, level, level);
  assert.ok(s.people.every((p) => !p.last || ["go_now", "refer_today", "watch", "fine"].includes(p.last.level)));
  assert.ok(s.recent.every((r) => ["go_now", "refer_today", "watch", "fine"].includes(r.level)));
  assert.equal(s.demoNote, null, "no clearing on a laptop unless asked");
});

test("server text says nurse, and Saroj's refusal asks the ASHA to go again today", async () => {
  const { Store } = await import("../server/store.js"); // a fresh sample village (an earlier test visited Saroj, which closes her follow-up)
  const st = new Store(mkdtempSync(join(tmpdir(), "gbn-")), { bucket: "" });
  await st.load(); clearTimeout(st.timer);
  const s = st.state();
  const saroj = s.followups.find((f) => f.name === "Saroj");
  assert.equal(saroj.reason, "The family refused to go. Ask the ASHA to visit again today and talk to the family; if they still refuse, the nurse visits.");
  assert.ok(!JSON.stringify({ f: s.followups, r: s.referrals.map((r) => r.seenBy) }).includes("ANM"));
});

test("on the public demo, visitors' visits are cleared after the TTL and the sample village is restored", async () => {
  const { base } = await start({ DEMO_TTL_HOURS: "0.0008", RATE_PER_MIN: "1000" }); // about 3 seconds
  let s = await state(base);
  assert.equal(s.demoNote, "Visits saved by visitors are cleared after 0.0008 hours.");
  const sunita = s.people.find((p) => p.name === "Sunita" && p.kind === "baby");
  const sudhaRef = s.referrals.find((r) => r.name === "Sudha" && r.status === "open");
  const v = await (await post(base, "/api/visits", { type: "newborn", personId: sunita.id, record: { name: "Sunita", day: 3, weight_g: 2900 } })).json();
  await post(base, "/api/visits", { type: "anc", record: { name: "Visitorwoman", weeks: 20, hb: 12 } });
  await post(base, `/api/referrals/${sudhaRef.id}/seen`, { by: "Stranger" });
  s = await state(base);
  assert.equal(s.people.find((p) => p.id === sunita.id).dayOfLife, 3);
  assert.equal(s.referrals.find((r) => r.id === sudhaRef.id).status, "seen");
  assert.ok(s.people.some((p) => p.name === "Visitorwoman"));
  await wait(3500);
  s = await state(base);
  assert.ok(!s.recent.some((r) => r.id === v.id), "the visitor's visit is gone");
  assert.ok(!s.people.some((p) => p.name === "Visitorwoman"), "and the person it created");
  assert.equal(s.people.length, 15);
  assert.equal(s.people.find((p) => p.id === sunita.id).dayOfLife, 7, "the sample baby is back to her seeded age");
  assert.equal(s.referrals.find((r) => r.id === sudhaRef.id).status, "open", "the sample referral is open again");
});

test("the ASHA name is cleaned and ids are random", async () => {
  const v = await (await post(BASE, "/api/visits", { type: "newborn", asha: "<img src=x onerror=alert(1)>", record: { name: "Idbaby", day: 3, weight_g: 2800 } })).json();
  assert.ok(!/[<>"'`]/.test(v.asha));
  assert.match(v.id, /^[a-z2-9]{10}$/);
});

// ---------- abuse limits ----------
test("made-up X-Forwarded-For headers do not get round the write limit; reads are limited too", async () => {
  const { base } = await start({ READ_RATE_PER_MIN: "5" }); // not behind a proxy: the socket address counts
  let last;
  for (let i = 0; i < 22; i++) last = await post(base, "/api/referrals/none/seen", {}, { "x-forwarded-for": `10.0.0.${i}` });
  assert.equal(last.status, 429);
  assert.ok(last.headers.get("retry-after"));
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await fetch(base + (i % 2 ? "/api/export.csv" : "/api/state"))).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await fetch(base + "/api/health")).status, 200, "the healthcheck is never limited");
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
