// The village register: mothers, babies, their visits and open referrals.
// One JSON file, so the app needs no database and runs on a school laptop.
// Optionally the same JSON is kept in a Google Cloud Storage bucket (env
// GCS_BUCKET), so a hosted demo survives restarts. No packages and no keys:
// the access token comes from the platform's metadata server.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import * as RULES from "../public/js/rules.js";
import { FIELDS as READER_FIELDS, understand } from "../public/js/understand.js";
import { seedVillage } from "./seed.js";

const { checkRecord, RULESET } = RULES;
const DAY = 24 * 3600 * 1000;
const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";
const id = () => [...randomBytes(10)].map((b) => ID_CHARS[b % 32]).join(""); // 50 random bits, not guessable
const clean = (x, n) => String(x ?? "").replace(/[<>"'`&]/g, "").trim().slice(0, n);
const URGENT_CODES = new Set((RULES.RULE_TABLE || []).filter((r) => r.urgent).map((r) => r.code));
const isUrgent = (f) => f.severity === "refer_now" && (f.urgent === true || (f.urgent === undefined && URGENT_CODES.has(f.code)));
const flagView = ({ code, severity, urgent, title, why, action, source, from, note }) => ({ code, severity, urgent: !!urgent, title, why, action, source, ...(from ? { from, note } : {}) });
export const OUTCOMES = { reached: "Reached the facility", admitted: "Admitted", refused: "Family refused to go", not_reachable: "Could not be reached" };
const IST = 5.5 * 3600 * 1000;
const istDayStart = (t) => Math.floor((t + IST) / DAY) * DAY - IST;
const sound = (x) => String(x || "").toLowerCase().replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/w/g, "v").replace(/([kgcjtdpb])h/g, "$1").replace(/(.)\1+/g, "$1").replace(/y$/, "i").replace(/(?!^)a/g, "");
const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

// SSBSK 2026 newborn visit days; at-risk babies get nine visits
const NB_HEALTHY = [3, 7, 14, 42], NB_AT_RISK = [1, 3, 5, 7, 10, 14, 21, 28, 42];
const PNC_DAYS = [1, 3, 7, 42];
const KIND = { anc: "pregnant", pnc: "mother", newborn: "baby" };

// A public demo must not grow without bound: past these, the oldest entries
// that are not part of the sample village are dropped.
export const LIMITS = { people: Number(process.env.MAX_PEOPLE) || 300, visits: Number(process.env.MAX_VISITS) || 2000 };

// How close an age must be for a visit to join an existing person of the same name.
const AGE_FIT = { babyDays: 2, pncDays: 2, weeks: 3, months: 1 };
const MONTH = 30.4 * DAY;

const isSampleVisit = (v) => v.sample === true || (/^v\d+$/.test(v.id) && v.asha === "Sample ASHA");

export class Store {
  constructor(dir, { bucket = process.env.GCS_BUCKET, object = process.env.GCS_OBJECT || "register.json", token = process.env.GCS_TOKEN } = {}) {
    this.dir = dir; this.file = join(dir, "register.json"); this.db = null; this.timer = null;
    this.remote = bucket ? new GcsFile(bucket, object, token) : null;
    this.remoteReady = false; // true once we know what the bucket holds, so a write can't clobber it
    this.remoteTimer = null; this.remoteBusy = null; this.remoteDirty = false; this.remoteFailing = false;
    this.source = "seed";
  }

  async load() {
    let db = null;
    if (this.remote) {
      try {
        const got = await this.remote.read();
        this.remoteReady = true;
        if (got) { db = got.db; this.source = "gcs"; }
      } catch (e) { this.remoteProblem("read", e); }
    }
    if (!valid(db)) {
      db = null;
      try { db = JSON.parse(await readFile(this.file, "utf8")); this.source = "file"; } catch { db = null; }
    }
    if (!valid(db)) { db = seedVillage(Date.now()); this.source = "seed"; }
    this.db = db;
    this.prune();
    this.save();
    return this.source;
  }
  reset() { this.db = seedVillage(Date.now()); this.save(); }

  /** Write the local file soon, and the bucket a little later (one write in flight at a time). */
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.writeLocal(), 250);
    if (this.remote) {
      this.remoteDirty = true;
      clearTimeout(this.remoteTimer);
      this.remoteTimer = setTimeout(() => this.pushRemote(), Number(process.env.GCS_DEBOUNCE_MS) || 1500);
    }
  }
  async writeLocal() {
    try { await mkdir(this.dir, { recursive: true }); const tmp = this.file + ".tmp"; await writeFile(tmp, JSON.stringify(this.db)); await rename(tmp, this.file); }
    catch (e) { console.error("Could not save the register:", e.message); }
  }
  pushRemote(force = false) {
    if (!this.remote) return Promise.resolve();
    if (this.remoteBusy) return this.remoteBusy.then(() => (force && this.remoteDirty ? this.pushRemote(true) : undefined)); // the running write re-checks remoteDirty when it ends
    this.remoteBusy = (async () => {
      await null; // let remoteBusy be assigned before the finally below can clear it
      let conflicts = 0;
      try {
        while (this.remoteDirty) {
          if (!this.remoteReady) await this.catchUpRemote();
          if (!this.remoteReady) break;
          if (!force && !this.writeAllowed()) break;
          this.remoteDirty = false;
          try { await this.remote.write(this.db); this.remoteOk(); }
          catch (e) {
            if (e.status === 412 && ++conflicts <= 3) { this.remoteDirty = true; await this.catchUpRemote(true); continue; } // someone else wrote: merge and try again
            this.remoteDirty = true; this.remoteProblem("write", e); break;
          }
        }
      } finally { this.remoteBusy = null; }
      if (this.remoteDirty && this.remoteFailing && !force) { clearTimeout(this.remoteTimer); this.remoteTimer = setTimeout(() => this.pushRemote(), 30_000); }
    })();
    return this.remoteBusy;
  }
  /** Read the bucket again and fold its register into ours (after a failed first read, or a write conflict). */
  async catchUpRemote(force = false) {
    if (this.remoteReady && !force) return;
    try {
      const got = await this.remote.read();
      if (got) { this.db = mergeRegisters(got.db, this.db); this.prune(); }
      this.remoteReady = true;
    } catch (e) { this.remoteProblem("read", e); }
  }
  // At most GCS_MAX_WRITES_PER_DAY bucket writes a day (default 120), then one an hour,
  // so even a flood of visits stays well inside the free tier's 5,000 writes a month.
  writeAllowed() {
    const day = new Date().toISOString().slice(0, 10), meta = (this.db.meta ||= {});
    if (meta.day !== day) { meta.day = day; meta.writes = 0; }
    const cap = Number(process.env.GCS_MAX_WRITES_PER_DAY) || 120;
    if (meta.writes >= cap && Date.now() - (meta.lastWrite || 0) < 3600_000) {
      clearTimeout(this.remoteTimer);
      this.remoteTimer = setTimeout(() => this.pushRemote(), 3600_000 - (Date.now() - (meta.lastWrite || 0)) + 1000);
      return false;
    }
    meta.writes += 1; meta.lastWrite = Date.now();
    return true;
  }
  remoteProblem(what, e) {
    if (!this.remoteFailing) console.error(`Cloud Storage ${what} failed, working from the local file for now: ${e.message}`);
    this.remoteFailing = true;
  }
  remoteOk() { if (this.remoteFailing) console.log("Cloud Storage is reachable again; the register is saved there."); this.remoteFailing = false; }

  /** Write everything now (used on shutdown). */
  async flush() {
    clearTimeout(this.timer); clearTimeout(this.remoteTimer);
    await this.writeLocal();
    if (this.remote && (this.remoteDirty || this.remoteBusy)) await this.pushRemote(true); // shutdown writes skip the daily budget
  }

  /**
   * Find the person a visit is about, or add them to the register.
   * 1. personId from the board's "Start this visit" link, if it is a person of the right kind.
   * 2. Same-sounding name AND an age that fits (so two babies called Sunita stay apart).
   * 3. Otherwise a new person.
   */
  personFor(type, record, personId, now = Date.now()) {
    const people = this.db.people, kind = KIND[type];
    if (personId) {
      const p = people.find((x) => x.id === personId);
      if (p && p.kind === kind) return { person: p, matched: "personId" };
    }
    const name = record.name;
    if (name) {
      const same = people.filter((x) => x.kind === kind && sound(x.name) === sound(name));
      const said = spokenAge(type, record);
      if (said) {
        const fits = same.map((p) => ({ p, gap: ageGap(p, said, now) })).filter((x) => x.gap != null && x.gap <= said.tolerance).sort((a, b) => a.gap - b.gap);
        // a person with no clock yet can't be ruled out by age
        const noClock = same.filter((p) => ageGap(p, said, now) === undefined);
        if (fits.length) return { person: fits[0].p, matched: "name_age" };
        if (noClock.length === 1) return { person: noClock[0], matched: "name_age" };
      } else if (same.length === 1) {
        // no age said: only join when the name is not ambiguous
        return { person: same[0], matched: "name" };
      }
    }
    const p = { id: id(), kind, name: name || (kind === "baby" ? "Unnamed baby" : "New mother"), addedAt: now };
    people.push(p);
    return { person: p, matched: "new" };
  }

  addVisit(body) {
    const type = Object.hasOwn(KIND, body?.type) ? body.type : null;
    const rec = body?.record && typeof body.record === "object" && !Array.isArray(body.record) ? body.record : null;
    if (!type || !rec) throw badRequest("This visit needs a type (anc, pnc or newborn) and a record.");
    const record = sanitize({ ...rec, type });
    const said = Array.isArray(body.said) ? body.said.slice(0, 12).map((s) => String(s).slice(0, 600)) : [];
    const heard = readTranscript(type, said);
    const hasData = (r) => Object.keys(r).some((k) => k !== "type" && k !== "name");
    if (!hasData(record) && !hasData(heard.record)) throw badRequest("This visit has nothing in it yet. Say or type at least one reading or sign (for example the day, weight, BP or a danger sign) before saving.");
    const pid = typeof body.personId === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(body.personId) ? body.personId : null;
    const now = Date.now();
    const { person, matched } = this.personFor(type, record, pid, now);
    // keep the person's clock in step with the newest visit, so the board shows today's day
    if (type === "newborn" && Number.isFinite(record.day)) person.dob = now - record.day * DAY;
    if (type === "pnc" && Number.isFinite(record.day)) person.deliveredAt = now - record.day * DAY;
    if (type === "anc" && Number.isFinite(record.weeks)) person.lmp = now - record.weeks * 7 * DAY;
    else if (type === "anc" && Number.isFinite(record.month)) person.lmp = now - (record.month - 0.5) * MONTH;
    person.updatedAt = now;
    let flags = [];
    try { flags = (checkRecord(record) || []).map(flagView); }
    catch (e) { console.error("The rules could not check a visit:", e.message); }
    // Re-read what the ASHA said. A refer-level sign in her words that the record lacks is added
    // as a server flag (never removing what the record has), so a slip can't say "no danger
    // sign" above words that say fits.
    const extra = transcriptFlags(record, heard.record, flags);
    flags = [...flags, ...extra.flags];
    const refer = flags.some((f) => f.severity === "refer_now");
    const urgent = flags.some(isUrgent);
    let notes = [];
    try { if (typeof RULES.noted === "function") notes = (RULES.noted(record, flags) || []).slice(0, 20); } catch { notes = []; }
    const visit = {
      id: id(), at: now, type, personId: person.id, name: person.name, record, flags, ruleset: RULESET.id,
      said, lang: ["hi", "mr", "en"].includes(body.lang) ? body.lang : "hi", via: body.via === "typed" ? "typed" : "voice",
      asha: clean(body.asha, 40) || "Asha worker",
      noted: notes,
      transcript: { checked: heard.ok, added: extra.flags.map((f) => f.code), heard: extra.heard },
      referral: refer ? { status: "open", at: now, urgent } : null,
    };
    if (type === "newborn" && refer) person.atRisk = true;
    if (type === "newborn" && record.weight_g && record.weight_g < 2500) person.atRisk = true;
    this.db.visits.push(visit);
    this.prune();
    this.save();
    return { visit, person, matched };
  }

  /** Drop the oldest entries that are not sample data once the register passes LIMITS. */
  prune() {
    const db = this.db;
    if (db.visits.length > LIMITS.visits) {
      const extra = db.visits.length - LIMITS.visits;
      const drop = new Set(db.visits.filter((v) => !isSampleVisit(v)).sort((a, b) => a.at - b.at).slice(0, extra).map((v) => v.id));
      if (drop.size) {
        db.visits = db.visits.filter((v) => !drop.has(v.id));
        const used = new Set(db.visits.map((v) => v.personId));
        db.people = db.people.filter((p) => p.sample || used.has(p.id));
      }
    }
    if (db.people.length > LIMITS.people) {
      const extra = db.people.length - LIMITS.people;
      const drop = new Set(db.people.filter((p) => !p.sample).sort((a, b) => (a.updatedAt || a.addedAt || 0) - (b.updatedAt || b.addedAt || 0)).slice(0, extra).map((p) => p.id));
      if (drop.size) { db.people = db.people.filter((p) => !drop.has(p.id)); db.visits = db.visits.filter((v) => !drop.has(v.personId)); }
    }
  }

  visit(vid) { return this.db.visits.find((v) => v.id === vid) || null; }
  person(pid) { return this.db.people.find((p) => p.id === pid) || null; }

  /** The nurse has seen a referral. */
  ackReferral(vid, by) {
    const v = this.visit(vid);
    if (!v || !v.referral) return null;
    const now = Date.now();
    const who = clean(by, 40) || "ANM";
    v.referral = { ...v.referral, status: "seen", seenAt: now, seenBy: who, changedAt: now };
    delete v.referral.by;
    logChange(v, "seen", who, now);
    this.save();
    return v;
  }
  /** Undo "seen": the referral goes back on the board as open. */
  reopenReferral(vid, by) {
    const v = this.visit(vid);
    if (!v || !v.referral) return null;
    const now = Date.now();
    const { seenAt, seenBy, by: oldBy, ...rest } = v.referral;
    const who = clean(by, 40) || "ANM";
    v.referral = { ...rest, status: "open", reopenedAt: now, reopenedBy: who, changedAt: now };
    logChange(v, "reopened", who, now);
    this.save();
    return v;
  }
  /** What happened after the referral: reached / admitted / refused / not_reachable. */
  setOutcome(vid, outcome, by) {
    const v = this.visit(vid);
    if (!v || !v.referral) return null;
    if (!Object.hasOwn(OUTCOMES, outcome)) throw badRequest(`outcome must be one of: ${Object.keys(OUTCOMES).join(", ")}.`);
    const now = Date.now(), who = clean(by, 40) || "ASHA";
    v.referral = { ...v.referral, outcome, outcomeAt: now, outcomeBy: who, changedAt: now };
    logChange(v, "outcome:" + outcome, who, now);
    this.save();
    return v;
  }

  /**
   * Referrals that need another visit: refused or not reachable (due from the next day, IST),
   * or no outcome 24 hours after the referral. A newer visit to the same person closes it.
   */
  followups(now = Date.now()) {
    const out = [];
    const lastVisit = new Map();
    for (const v of this.db.visits) if ((lastVisit.get(v.personId) || 0) < v.at) lastVisit.set(v.personId, v.at);
    for (const v of this.db.visits) {
      const r = v.referral;
      if (!r) continue;
      let due, reason;
      if (r.outcome === "refused" || r.outcome === "not_reachable") {
        if ((lastVisit.get(v.personId) || 0) > r.outcomeAt) continue;
        due = istDayStart(r.outcomeAt) + DAY;
        reason = r.outcome === "refused" ? "The family refused to go. Visit again, counsel them and tell the ANM." : "The family could not be reached. Visit again.";
      } else if (!r.outcome) {
        if ((lastVisit.get(v.personId) || 0) > r.at) continue;
        due = r.at + DAY;
        if (now < due) continue;
        reason = "No outcome recorded 24 hours after the referral. Find out whether she reached the facility.";
      } else continue;
      out.push({ referralId: v.id, personId: v.personId, name: v.name, type: v.type, due, isDue: now >= due, reason, outcome: r.outcome || null, urgent: referralUrgent(v), sample: isSampleVisit(v) });
    }
    return out.sort((a, b) => a.due - b.due).slice(0, 40);
  }

  /** The register as CSV, for the ANM's monthly register. */
  exportCsv() { return toCsv(this.db); }

  state() {
    const now = Date.now();
    const visits = this.db.visits;
    const byPerson = new Map();
    for (const v of visits) { if (!byPerson.has(v.personId)) byPerson.set(v.personId, []); byPerson.get(v.personId).push(v); }
    const sampleIds = new Set(this.db.people.filter((p) => p.sample).map((p) => p.id));
    const people = this.db.people.map((p) => {
      const vs = (byPerson.get(p.id) || []).slice().sort((a, b) => a.at - b.at);
      const last = vs[vs.length - 1] || null;
      const out = { ...p, sample: !!p.sample, visits: vs.length, last: last ? { id: last.id, at: last.at, flags: last.flags.map((f) => f.code), refer: last.flags.some((f) => f.severity === "refer_now"), watch: last.flags.some((f) => f.severity === "watch") } : null };
      if (p.kind === "baby" && p.dob) {
        out.dayOfLife = Math.floor((now - p.dob) / DAY);
        const plan = p.atRisk ? NB_AT_RISK : NB_HEALTHY;
        const doneDays = new Set(vs.map((v) => Math.round((v.at - p.dob) / DAY)));
        out.plan = plan.map((d) => ({ day: d, done: [...doneDays].some((x) => Math.abs(x - d) <= 1), due: d === out.dayOfLife, overdue: d < out.dayOfLife - 1 && ![...doneDays].some((x) => Math.abs(x - d) <= 1) }));
        out.dueToday = out.plan.some((x) => x.due && !x.done);
        out.overdue = out.plan.filter((x) => x.overdue).length;
      }
      if (p.kind === "mother" && p.deliveredAt) {
        out.dayAfter = Math.floor((now - p.deliveredAt) / DAY);
        const doneDays = new Set(vs.map((v) => Math.round((v.at - p.deliveredAt) / DAY)));
        out.plan = PNC_DAYS.map((d) => ({ day: d, done: [...doneDays].some((x) => Math.abs(x - d) <= 1), due: d === out.dayAfter }));
        out.dueToday = out.plan.some((x) => x.due && !x.done);
      }
      if (p.kind === "pregnant" && p.lmp) {
        out.weeks = Math.floor((now - p.lmp) / (7 * DAY));
        out.dueToday = !last || now - last.at > 28 * DAY;
      }
      return out;
    });
    // open referrals first, urgent (go now, 108) before the rest; newest first within each group
    const order = (v) => (v.referral.status === "open" ? (referralUrgent(v) ? 0 : 1) : 2);
    const referrals = visits.filter((v) => v.referral).sort((a, b) => order(a) - order(b) || b.at - a.at).slice(0, 40).map((v) => ({
      id: v.id, at: v.at, name: v.name, type: v.type, personId: v.personId, status: v.referral.status, urgent: referralUrgent(v),
      seenAt: v.referral.seenAt || null, seenBy: v.referral.seenBy || v.referral.by || null, reopenedAt: v.referral.reopenedAt || null,
      outcome: v.referral.outcome || null, outcomeAt: v.referral.outcomeAt || null, outcomeBy: v.referral.outcomeBy || null,
      flags: v.flags.filter((f) => f.severity === "refer_now").map((f) => ({ code: f.code, urgent: isUrgent(f), title: f.title, why: f.why, action: f.action, ...(f.from ? { from: f.from, note: f.note } : {}) })),
      fromTranscript: (v.transcript?.added || []).length > 0,
      sample: sampleIds.has(v.personId) && isSampleVisit(v), samplePerson: sampleIds.has(v.personId),
    }));
    const followups = this.followups(now);
    // who changed what, so a referral cleared by mistake (or by a stranger on the demo) can be put back
    const changes = visits.flatMap((v) => (v.referral?.log || []).map((c) => ({ referralId: v.id, name: v.name, ...c }))).sort((a, b) => b.at - a.at).slice(0, 15);
    const week = visits.filter((v) => now - v.at < 7 * DAY);
    return {
      village: this.db.village, ruleset: RULESET, now, people,
      referrals, followups, changes, recent: visits.slice(-15).reverse().map((v) => ({ id: v.id, at: v.at, name: v.name, type: v.type, via: v.via, refer: v.flags.some((f) => f.severity === "refer_now"), watch: v.flags.some((f) => f.severity === "watch"), flags: v.flags.map((f) => f.title), sample: isSampleVisit(v) })),
      totals: {
        visitsThisWeek: week.length,
        openReferrals: referrals.filter((r) => r.status === "open").length,
        urgentReferrals: referrals.filter((r) => r.status === "open" && r.urgent).length,
        followupsDue: followups.filter((f) => f.isDue).length,
        highRisk: people.filter((p) => p.last?.refer).length,
        dueToday: people.filter((p) => p.dueToday).length,
      },
      limits: LIMITS,
    };
  }
}

const valid = (db) => !!(db && typeof db === "object" && Array.isArray(db.people) && Array.isArray(db.visits));
const referralUrgent = (v) => (typeof v.referral?.urgent === "boolean" ? v.referral.urgent : v.flags.some(isUrgent));
function logChange(v, action, by, at) { v.referral.log = [...(v.referral.log || []), { action, by, at }].slice(-20); }

/** Read the joined transcript with the same reader the phone uses. */
function readTranscript(type, said) {
  const text = said.join(". ").trim();
  if (!text) return { ok: false, record: { type } };
  try { return { ok: true, record: sanitize({ ...(understand(text, type)?.record || {}), type }) }; }
  catch (e) { console.error("Could not re-read a transcript:", e.message); return { ok: false, record: { type } }; }
}
/**
 * Refer-level flags that the transcript supports but the record's flags lack. The record's own
 * values win wherever it has them (an explicit "no fits" in the record is respected); only what
 * the record left out is filled in from the transcript.
 */
function transcriptFlags(record, fromWords, have) {
  const heard = {};
  for (const [k, v] of Object.entries(fromWords)) if (!["type", "name", "symptoms"].includes(k) && record[k] === undefined) heard[k] = v;
  const sym = {};
  for (const [k, v] of Object.entries(fromWords.symptoms || {})) if (v === true && record.symptoms?.[k] === undefined) sym[k] = true;
  if (!Object.keys(heard).length && !Object.keys(sym).length) return { flags: [], heard: null };
  const merged = { ...fromWords, ...record };
  if (fromWords.symptoms || record.symptoms) merged.symptoms = { ...(fromWords.symptoms || {}), ...(record.symptoms || {}) };
  const codes = new Set(have.map((f) => f.code));
  let flags = [];
  try { flags = (checkRecord(merged) || []).filter((f) => f.severity === "refer_now" && !codes.has(f.code)); } catch { flags = []; }
  if (Object.keys(sym).length) heard.symptoms = sym;
  return {
    flags: flags.map((f) => ({ ...flagView(f), from: "transcript", note: "said in the visit but not in the record" })),
    heard: flags.length ? heard : null,
  };
}

// ---------- CSV for the ANM's register ----------
const TYPE_LABEL = { anc: "ANC (pregnancy)", pnc: "PNC (mother after delivery)", newborn: "HBNC (newborn)" };
const istDate = (t) => new Date(t + IST).toISOString().slice(0, 10);
const COLUMNS = [
  ["Date of visit", (v) => istDate(v.at)],
  ["Time", (v) => new Date(v.at + IST).toISOString().slice(11, 16)],
  ["ASHA", (v) => v.asha],
  ["Visit type", (v) => TYPE_LABEL[v.type] || v.type],
  ["Name (woman, or mother of the baby)", (v) => v.name],
  ["Register id", (v) => v.personId],
  ["Weeks of pregnancy", (v) => v.record.weeks],
  ["Month of pregnancy", (v) => v.record.month],
  ["Day after delivery (PNC) or day of life (newborn)", (v) => v.record.day],
  ["BP (mmHg)", (v) => (v.record.bp_sys != null || v.record.bp_dia != null ? `${v.record.bp_sys ?? "?"}/${v.record.bp_dia ?? "?"}` : "")],
  ["Hb (g/dl)", (v) => v.record.hb],
  ["Weight of mother (kg)", (v) => v.record.weight_kg],
  ["Urine albumin", (v) => v.record.albumin],
  ["Foetal movement", (v) => v.record.fetal_movement],
  ["IFA tablets", (v) => v.record.ifa_tablets],
  ["Pads per day", (v) => v.record.pads],
  ["Temperature (C)", (v) => v.record.temp_c],
  ["Baby weight (g)", (v) => v.record.weight_g],
  ["Breaths per minute", (v) => v.record.resp_rate],
  ["Breastfeeding", (v) => v.record.feeding],
  ["Danger signs present", (v) => Object.entries(v.record.symptoms || {}).filter(([, x]) => x === true).map(([k]) => label(v.type, k)).join("; ")],
  ["Checked, not present", (v) => Object.entries(v.record.symptoms || {}).filter(([, x]) => x === false).map(([k]) => label(v.type, k)).join("; ")],
  ["Other readings", (v) => Object.entries(v.record).filter(([k]) => !SHOWN.has(k)).map(([k, x]) => `${k}=${x}`).join("; ")],
  ["Flags (rule codes)", (v) => v.flags.map((f) => f.code + (f.from === "transcript" ? " (from her words)" : "")).join("; ")],
  ["Refer", (v) => (v.referral ? "yes" : "no")],
  ["Go now (108)", (v) => (v.referral ? (referralUrgent(v) ? "yes" : "no") : "")],
  ["Referral status", (v) => v.referral?.status || ""],
  ["Referral outcome", (v) => (v.referral?.outcome ? OUTCOMES[v.referral.outcome] : "")],
  ["Outcome date", (v) => (v.referral?.outcomeAt ? istDate(v.referral.outcomeAt) : "")],
  ["Sample data", (v) => (isSampleVisit(v) ? "yes" : "no")],
  ["Visit id", (v) => v.id],
];
const SHOWN = new Set(["type", "name", "symptoms", "weeks", "month", "day", "bp_sys", "bp_dia", "hb", "weight_kg", "albumin", "fetal_movement", "ifa_tablets", "pads", "temp_c", "weight_g", "resp_rate", "feeding"]);
function label(type, code) { try { return typeof RULES.symptomLabel === "function" ? RULES.symptomLabel(type, code) : code.replace(/_/g, " "); } catch { return code; } }
function cell(x) {
  let s = x == null ? "" : String(x);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // a spreadsheet must never run a cell as a formula
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(db) {
  const lines = [
    "# Ghar Bhet village register export. Columns follow the field names of the MCP card (ANC and PNC) and the SSBSK 2026 / HBNC home-visit forms. One row per home visit, oldest first. Dates and times are IST.",
    `# Village: ${clean(db.village?.name, 60) || "?"}${db.village?.sample ? " (sample data: made-up people)" : ""}. Rules: ${RULESET.id}. Exported ${new Date(Date.now() + IST).toISOString().slice(0, 16).replace("T", " ")} IST.`,
    COLUMNS.map(([h]) => cell(h)).join(","),
  ];
  for (const v of [...db.visits].sort((a, b) => a.at - b.at)) lines.push(COLUMNS.map(([, f]) => { try { return cell(f(v)); } catch { return ""; } }).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/** The age a visit states, in the person's own unit, with how far off it may be. */
function spokenAge(type, r) {
  if (type === "newborn" && Number.isFinite(r.day)) return { unit: "babyDays", value: r.day, tolerance: AGE_FIT.babyDays };
  if (type === "pnc" && Number.isFinite(r.day)) return { unit: "pncDays", value: r.day, tolerance: AGE_FIT.pncDays };
  if (type === "anc" && Number.isFinite(r.weeks)) return { unit: "weeks", value: r.weeks, tolerance: AGE_FIT.weeks };
  if (type === "anc" && Number.isFinite(r.month)) return { unit: "months", value: r.month, tolerance: AGE_FIT.months };
  return null;
}
/** How far a person's current age is from the age said; undefined when the person has no clock. */
function ageGap(p, said, now) {
  if (said.unit === "babyDays") return p.dob ? Math.abs((now - p.dob) / DAY - said.value) : undefined;
  if (said.unit === "pncDays") return p.deliveredAt ? Math.abs((now - p.deliveredAt) / DAY - said.value) : undefined;
  if (said.unit === "weeks") return p.lmp ? Math.abs((now - p.lmp) / (7 * DAY) - said.value) : undefined;
  if (said.unit === "months") return p.lmp ? Math.abs((now - p.lmp) / MONTH + 0.5 - said.value) : undefined;
  return undefined;
}

/** Fold two registers together by id; for the same visit, the later referral change wins. */
export function mergeRegisters(a, b) {
  if (!valid(a)) return b;
  if (!valid(b)) return a;
  const people = new Map(a.people.map((p) => [p.id, p]));
  for (const p of b.people) { const o = people.get(p.id); if (!o || (p.updatedAt || 0) > (o.updatedAt || 0)) people.set(p.id, p); }
  const visits = new Map(a.visits.map((v) => [v.id, v]));
  for (const v of b.visits) { const o = visits.get(v.id); if (!o || (v.referral?.changedAt || 0) > (o.referral?.changedAt || 0)) visits.set(v.id, v); }
  return { ...a, ...b, people: [...people.values()], visits: [...visits.values()].sort((x, y) => x.at - y.at), meta: { ...(a.meta || {}), ...(b.meta || {}) } };
}

// ---------- the record: keep only fields the spec knows, with sane types and ranges ----------
const NUM = { age: [10, 60], height_cm: [100, 200], labour_hours: [0, 96], temp_f: [86, 112], birth_weight_g: [300, 7000], weeks: [1, 45], month: [1, 10], bp_sys: [50, 280], bp_dia: [30, 200], hb: [2, 20], weight_kg: [20, 200], ifa_tablets: [0, 500], day: [0, 120], pads: [0, 40], temp_c: [30, 44], weight_g: [300, 7000], resp_rate: [5, 150] };
const ENUM = { albumin: ["nil", "trace", "1", "2", "3", "4"], fetal_movement: ["normal", "reduced", "absent"], feeding: ["good", "poor", "none"] };
// Per-type fields from eval/SPEC.md (pnc also takes BP and Hb for the postnatal BP / anaemia rules).
// If rules.js exports FIELDS = { anc: [...], pnc: [...], newborn: [...] }, those are added.
const BASE_FIELDS = {
  anc: ["weeks", "month", "bp_sys", "bp_dia", "hb", "weight_kg", "albumin", "fetal_movement", "ifa_tablets"],
  pnc: ["day", "pads", "temp_c", "bp_sys", "bp_dia", "hb"],
  newborn: ["day", "weight_g", "temp_c", "resp_rate", "feeding"],
};
function fieldsFor(type) {
  const extra = RULES.FIELDS?.[type] ?? RULES.RECORD_FIELDS?.[type] ?? READER_FIELDS?.[type];
  const list = new Set(BASE_FIELDS[type] || []);
  if (Array.isArray(extra)) for (const f of extra) if (typeof f === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(f) && !["type", "name", "symptoms"].includes(f)) list.add(f);
  return list;
}
export function sanitize(r) {
  const out = { type: r.type };
  if (typeof r.name === "string" && r.name.trim()) out.name = r.name.trim().replace(/[<>"'`&]/g, "").slice(0, 30);
  if (!out.name) delete out.name;
  for (const k of fieldsFor(r.type)) {
    const v = r[k];
    if (v == null) continue;
    if (NUM[k]) { const n = Number(v); if (typeof v !== "boolean" && v !== "" && Number.isFinite(n) && n >= NUM[k][0] && n <= NUM[k][1]) out[k] = n; }
    else if (ENUM[k]) { if (ENUM[k].includes(String(v))) out[k] = String(v); }
    else if (typeof v === "boolean") out[k] = v;
    // a field the rules added that we don't know: accept a plain finite number or a short code word
    else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6) out[k] = v;
    else if (typeof v === "string" && /^[a-z0-9_.+-]{1,20}$/i.test(v)) out[k] = v;
  }
  if (r.symptoms && typeof r.symptoms === "object" && !Array.isArray(r.symptoms)) {
    const sym = {};
    for (const [k, v] of Object.entries(r.symptoms).slice(0, 60)) if (/^[a-z][a-z_]{2,30}$/.test(k) && typeof v === "boolean") sym[k] = v;
    if (Object.keys(sym).length) out.symptoms = sym;
  }
  return out;
}

// ---------- Google Cloud Storage over its JSON API, with plain fetch ----------
const META_TOKEN = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
export class GcsFile {
  constructor(bucket, object, token) { this.bucket = bucket; this.object = object; this.staticToken = token || null; this.token = null; this.expires = 0; this.generation = null; }
  async auth() {
    if (this.staticToken) return this.staticToken;
    if (this.token && Date.now() < this.expires) return this.token;
    const r = await fetch(META_TOKEN, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error(`metadata server said ${r.status}`);
    const j = await r.json();
    this.token = j.access_token; this.expires = Date.now() + Math.max(60, (j.expires_in || 300) - 120) * 1000;
    return this.token;
  }
  /** The register in the bucket, or null when there is none yet. */
  async read() {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(this.bucket)}/o/${encodeURIComponent(this.object)}?alt=media`;
    const r = await fetch(url, { headers: { authorization: `Bearer ${await this.auth()}` }, signal: AbortSignal.timeout(8000) });
    if (r.status === 404) { this.generation = "0"; return null; }
    if (!r.ok) throw Object.assign(new Error(`read ${r.status} ${(await r.text()).slice(0, 160)}`), { status: r.status });
    this.generation = r.headers.get("x-goog-generation");
    const db = JSON.parse(await r.text());
    if (!valid(db)) throw new Error("the stored register is not valid");
    return { db, generation: this.generation };
  }
  /** Upload the register; only if nobody changed it since we last read or wrote it (else a 412). */
  async write(db) {
    const q = new URLSearchParams({ uploadType: "media", name: this.object });
    if (this.generation != null) q.set("ifGenerationMatch", this.generation);
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(this.bucket)}/o?${q}`;
    const r = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${await this.auth()}`, "content-type": "application/json" }, body: JSON.stringify(db), signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw Object.assign(new Error(`write ${r.status} ${(await r.text()).slice(0, 160)}`), { status: r.status });
    const j = await r.json();
    this.generation = String(j.generation);
  }
}
