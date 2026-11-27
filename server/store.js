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
const flagView = ({ code, severity, urgent, title, why, action, source, from, note, conflict }) => ({ code, severity, urgent: !!urgent, title, why, action, source, ...(from ? { from, note } : {}), ...(conflict ? { conflict: true } : {}) });
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

// The public demo: visitors' visits are cleared after DEMO_TTL_HOURS (default 6 on Cloud Run,
// off elsewhere so a laptop's register is kept); set DEMO_TTL_HOURS=0 to turn it off.
const TTL_HOURS = process.env.DEMO_TTL_HOURS != null && process.env.DEMO_TTL_HOURS !== "" ? Number(process.env.DEMO_TTL_HOURS) : process.env.K_SERVICE ? 6 : 0;
const DEMO_TTL = Number.isFinite(TTL_HOURS) && TTL_HOURS > 0 ? TTL_HOURS * 3600 * 1000 : 0;
const SEED_REFRESH = 24 * 3600 * 1000;
const REPEAT_WINDOW = 10 * 60 * 1000;
const stable = (x) => JSON.stringify(x, (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
// Per-browser demo: each browser sends a random sid and sees the sample village plus only its own
// saves. Changes it makes to sample people or sample referrals are kept per sid (an overlay), so
// one visitor can't change what another sees. SHARED_BOARD=1 turns this off (one shared register,
// as a real village would use). Old clients without a sid see sample data plus recent no-sid saves.
const SHARED = process.env.SHARED_BOARD === "1";
export const SHARED_BOARD = SHARED;
const MAX_OVERLAYS = 500;
export const normSid = (x) => (typeof x === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(x) ? x : null);
const sidOf = (x) => x.sid || null;
const ownView = (sid) => !SHARED && !!sid; // writes to shared sample data go to this sid's overlay
const usesOverlay = (obj, sid) => ownView(sid) && !!obj.ov?.[sid];
function visibleVisit(v, sid, now) {
  if (SHARED || isSampleVisit(v)) return true;
  // without a sid: saves made without one (older clients). On the demo these are cleared after
  // DEMO_TTL (6 hours) like every visitor save, so this is "the last 6 hours" there.
  return sid ? sidOf(v) === sid : !v.sid;
}
/** A person as this sid sees it (sample people carry the sid's own clock and risk changes). */
function personAs(p, sid) {
  const { ov, touchedAt, ...base } = p;
  if (!usesOverlay(p, sid)) return base;
  const { ovAt, ...mine } = ov[sid];
  return { ...base, ...mine };
}
/** A visit's referral as this sid sees it. */
function refAs(v, sid) {
  if (!v.referral || !usesOverlay(v, sid)) return v.referral;
  const { ovAt, ...mine } = v.ov[sid];
  return mine;
}
function setOverlay(obj, sid, value, now) {
  obj.ov ||= {};
  obj.ov[sid] = { ...value, ovAt: now }; obj.touchedAt = now;
  const keys = Object.keys(obj.ov);
  if (keys.length > MAX_OVERLAYS) for (const k of keys.sort((a, b) => obj.ov[a].ovAt - obj.ov[b].ovAt).slice(0, keys.length - MAX_OVERLAYS)) delete obj.ov[k];
}
/** Drop overlays older than the TTL (they are a visitor's changes to sample data). */
function expireOverlays(list, now, ttl) {
  for (const o of list) if (o.ov) { for (const [k, x] of Object.entries(o.ov)) if (now - x.ovAt > ttl) delete o.ov[k]; if (!Object.keys(o.ov).length) delete o.ov; }
}

/** Names must look like a first name: no markup, '=', digits, at most 3 words, 30 characters. */
export const NOT_A_NAME = "That doesn't look like a name. Say or type the first name only.";
export function looksLikeName(raw) {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  return s.length <= 30 && !/[<>={}[\]\\/@#$%^*|~`]/.test(s) && !/[\d०-९]/.test(s) && s.split(/\s+/).length <= 3;
}
const cleanBy = (by, fallback) => { const s = clean(by, 40); return s && /^[\p{L}\p{M} .'-]{1,40}$/u.test(s) ? s : fallback; };

/** One word for how serious a visit's result is: go_now | refer_today | watch | fine. */
export const levelOf = (flags = []) => (flags.some(isUrgent) ? "go_now" : flags.some((f) => f.severity === "refer_now") ? "refer_today" : flags.length ? "watch" : "fine");

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
    this.dropJunkNames();
    this.prune();
    this.tidy(Date.now(), true);
    this.save();
    if (DEMO_TTL && !this.tidyTimer) { this.tidyTimer = setInterval(() => this.tidy(), 10 * 60_000); this.tidyTimer.unref?.(); }
    return this.source;
  }
  reset() { this.db = seedVillage(Date.now()); this.save(); }
  /** Remove visitors' saves whose name is not a name (test probes, markup). Idempotent; runs on load. */
  dropJunkNames() {
    const db = this.db;
    const bad = new Set(db.people.filter((p) => !p.sample && !looksLikeName(p.name)).map((p) => p.id));
    const before = db.visits.length + db.people.length;
    db.visits = db.visits.filter((v) => isSampleVisit(v) || (!bad.has(v.personId) && looksLikeName(v.name) && looksLikeName(v.record?.name)));
    const used = new Set(db.visits.map((v) => v.personId));
    db.people = db.people.filter((p) => p.sample || (!bad.has(p.id) && used.has(p.id)));
    const removed = before - db.visits.length - db.people.length;
    if (removed) console.log(`Removed ${removed} visitor entries whose names were not names.`);
    return removed;
  }

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
  personFor(type, record, personId, now = Date.now(), sid = null, create = true) {
    const kind = KIND[type];
    // only people this browser can see: the sample village and its own
    const people = this.db.people.filter((p) => SHARED || p.sample || sidOf(p) === sid);
    const age = (p) => personAs(p, sid);
    if (personId) {
      const p = people.find((x) => x.id === personId);
      if (p && p.kind === kind) return { person: p, matched: "personId" };
    }
    const name = record.name;
    if (name) {
      const same = people.filter((x) => x.kind === kind && sound(x.name) === sound(name));
      const said = spokenAge(type, record);
      if (said) {
        const fits = same.map((p) => ({ p, gap: ageGap(age(p), said, now) })).filter((x) => x.gap != null && x.gap <= said.tolerance).sort((a, b) => a.gap - b.gap);
        // a person with no clock yet can't be ruled out by age
        const noClock = same.filter((p) => ageGap(age(p), said, now) === undefined);
        if (fits.length) return { person: fits[0].p, matched: "name_age" };
        if (noClock.length === 1) return { person: noClock[0], matched: "name_age" };
      } else if (same.length === 1) {
        // no age said: only join when the name is not ambiguous
        return { person: same[0], matched: "name" };
      }
    }
    if (!create) return { person: null, matched: "new" };
    const p = { id: id(), kind, name: name || (kind === "baby" ? "Unnamed baby" : "New mother"), addedAt: now, ...(sid ? { sid } : {}) };
    this.db.people.push(p);
    return { person: p, matched: "new" };
  }

  addVisit(body) {
    const type = Object.hasOwn(KIND, body?.type) ? body.type : null;
    const rec = body?.record && typeof body.record === "object" && !Array.isArray(body.record) ? body.record : null;
    if (!type || !rec) throw badRequest("This visit needs a type (anc, pnc or newborn) and a record.");
    if (!looksLikeName(rec.name)) throw badRequest(NOT_A_NAME);
    const sid = normSid(body.sid);
    const record = sanitize({ ...rec, type });
    for (const k of SERVER_FIELDS) delete record[k]; // only the server fills these, from the register
    if (body.said != null && !Array.isArray(body.said)) throw badRequest("said must be a list of the sentences spoken.");
    const said = (body.said || []).filter((s) => typeof s === "string").slice(0, 12).map((s) => s.slice(0, 600));
    const heard = readTranscript(type, said);
    const hasData = (r) => Object.keys(r).some((k) => k !== "type" && k !== "name");
    if (!hasData(record) && !hasData(heard.record)) throw badRequest("This visit has nothing in it yet. Say or type at least one reading or sign (for example the day, weight, BP or a danger sign) before saving.");
    const pid = typeof body.personId === "string" && /^[A-Za-z0-9_-]{1,24}$/.test(body.personId) ? body.personId : null;
    const now = Date.now();
    this.tidy(now);

    // The same save again within 10 minutes (same person, type, record and words) is one visit.
    const repeat = this.findRepeat(type, record, said, pid, now, sid);
    if (repeat) {
      repeat.count = (repeat.count || 1) + 1; repeat.lastAt = now;
      this.save();
      return { visit: repeat, person: this.person(repeat.personId, sid), matched: "repeat", sid };
    }

    // Who is it about? Then bring in what the register already knows (a newborn's last weight and
    // birth weight), so the rules can tell a falling weight from a gaining one.
    let { person, matched } = this.personFor(type, record, pid, now, sid, false);
    const carried = person && type === "newborn" ? this.weightHistory(person.id, sid, now, record) : {};
    for (const [k, x] of Object.entries(carried)) record[k] = x.value;
    let flags = [];
    try { flags = (checkRecord(record) || []).map(flagView); }
    catch (e) { console.error("The rules could not check a visit:", e.message); }
    // Re-read what the ASHA said. A refer-level sign in her words is never lost: if the record
    // lacks it, it is added; if the record disagrees, the record's value is kept and the flag is
    // added marked as a conflict for the nurse to check. Nothing the record has is removed.
    const extra = transcriptFlags(record, heard.record, flags);
    flags = [...flags, ...extra.flags];

    if (!person) ({ person, matched } = this.personFor(type, record, pid, now, sid));
    // keep the person's clock in step with the newest visit, so the board shows today's day.
    // A visitor's visit to a sample person changes only that visitor's view of her.
    const mine = person.sample && ownView(sid);
    const clock = mine ? { ...(person.ov?.[sid] || {}) } : person;
    if (mine) delete clock.ovAt;
    if (type === "newborn" && Number.isFinite(record.day)) clock.dob = now - record.day * DAY;
    if (type === "pnc" && Number.isFinite(record.day)) clock.deliveredAt = now - record.day * DAY;
    if (type === "anc" && Number.isFinite(record.weeks)) clock.lmp = now - record.weeks * 7 * DAY;
    else if (type === "anc" && Number.isFinite(record.month)) clock.lmp = now - (record.month - 0.5) * MONTH;
    clock.updatedAt = now;
    const refer = flags.some((f) => f.severity === "refer_now");
    const urgent = flags.some(isUrgent);
    let notes = [];
    try { if (typeof RULES.noted === "function") notes = (RULES.noted(record, flags) || []).slice(0, 20); } catch { notes = []; }
    const visit = {
      id: id(), at: now, type, personId: person.id, name: person.name, record, flags, level: levelOf(flags), ruleset: RULESET.id,
      said, lang: ["hi", "mr", "en"].includes(body.lang) ? body.lang : "hi", via: body.via === "typed" ? "typed" : "voice",
      asha: clean(body.asha, 40) || "Asha worker",
      noted: notes, count: 1,
      ...(Array.isArray(body.notAsked) && body.notAsked.length ? { notAsked: body.notAsked.filter((x) => typeof x === "string").slice(0, 12).map((x) => clean(x, 40)).filter(Boolean) } : {}),
      ...(Object.keys(carried).length ? { carried: Object.fromEntries(Object.entries(carried).map(([k, x]) => [k, { from: x.from, at: x.at }])) } : {}),
      transcript: { checked: heard.ok, added: extra.flags.map((f) => f.code), conflicts: extra.flags.filter((f) => f.conflict).map((f) => f.code), heard: extra.heard, disagree: extra.disagree },
      referral: refer ? { status: "open", at: now, urgent } : null,
      ...(sid ? { sid } : {}),
    };
    if (type === "newborn" && refer) clock.atRisk = true;
    if (type === "newborn" && record.weight_g && record.weight_g < 2500) clock.atRisk = true;
    if (mine) setOverlay(person, sid, clock, now);
    this.db.visits.push(visit);
    this.prune();
    this.save();
    return { visit, person: personAs(person, sid), matched, sid };
  }

  /** A visitor's identical save of the same visit in the last 10 minutes, if any. */
  findRepeat(type, record, said, pid, now, sid = null) {
    const key = stable(record), words = stable(said);
    const own = (v) => { const r = { ...v.record }; for (const k of Object.keys(v.carried || {})) delete r[k]; return stable(r); };
    for (let i = this.db.visits.length - 1; i >= 0; i--) {
      const v = this.db.visits[i];
      if (now - (v.lastAt || v.at) > REPEAT_WINDOW) { if (now - v.at > REPEAT_WINDOW * 3) break; continue; }
      if (v.type !== type || isSampleVisit(v) || sidOf(v) !== sid || own(v) !== key || stable(v.said || []) !== words) continue;
      if (pid ? v.personId === pid : sound(v.record.name || "") === sound(record.name || "")) return v;
    }
    return null;
  }

  /**
   * A newborn's weight history from her saved visits (that this sid can see): prev_weight_g is the
   * last saved weight; birth_weight_g is carried from an earlier visit when this one lacks it.
   * Returns { field: { value, from (visit id), at } }.
   */
  weightHistory(personId, sid, now, record) {
    const vs = this.visibleVisits(sid, now).filter((v) => v.personId === personId && v.type === "newborn").sort((a, b) => a.at - b.at);
    const out = {};
    const lastW = [...vs].reverse().find((v) => Number.isFinite(v.record?.weight_g));
    if (lastW) out.prev_weight_g = { value: lastW.record.weight_g, from: lastW.id, at: lastW.at };
    if (!Number.isFinite(record.birth_weight_g)) {
      const b = [...vs].reverse().find((v) => Number.isFinite(v.record?.birth_weight_g));
      if (b) out.birth_weight_g = { value: b.record.birth_weight_g, from: b.id, at: b.at };
    }
    return out;
  }

  /**
   * Keep the public demo tidy (DEMO_TTL_HOURS; on by default on Cloud Run): visitors' visits, and
   * the people they added, go after the TTL; sample people and referrals that visitors changed go
   * back to how they were seeded; and the sample village is seeded afresh once a day so its
   * babies stay the same age. Runs at most once a minute, from reads, writes and a timer.
   */
  tidy(now = Date.now(), force = false) {
    if (!DEMO_TTL || (!force && now - (this.lastTidy || 0) < Math.min(60_000, DEMO_TTL / 4))) return false;
    this.lastTidy = now;
    const db = this.db, before = stable({ p: db.people, v: db.visits });
    // 1. sample data: fresh once a day, and back to the seed wherever a visitor changed it
    if (!db.seedAt || now - db.seedAt > SEED_REFRESH) this.reseedSample(now);
    else {
      const seed = seedVillage(db.seedAt);
      const old = (t) => t && t > db.seedAt && now - t > DEMO_TTL;
      db.people = db.people.map((p) => (p.sample && old(p.updatedAt) ? seed.people.find((s) => s.id === p.id) || p : p));
      db.visits = db.visits.map((v) => (isSampleVisit(v) && old(v.referral?.changedAt) ? seed.visits.find((s) => s.id === v.id) || v : v));
    }
    expireOverlays(db.people, now, DEMO_TTL);
    expireOverlays(db.visits, now, DEMO_TTL);
    // 2. visitors' visits after the TTL, and the people only they created
    db.visits = db.visits.filter((v) => isSampleVisit(v) || now - (v.lastAt || v.at) <= DEMO_TTL);
    const used = new Set(db.visits.map((v) => v.personId));
    db.people = db.people.filter((p) => p.sample || used.has(p.id));
    const changed = stable({ p: db.people, v: db.visits }) !== before;
    if (changed) this.save();
    return changed;
  }
  /** Replace the sample people and visits with a fresh seed; visitors' entries stay. */
  reseedSample(now) {
    const seed = seedVillage(now), db = this.db;
    db.people = [...seed.people, ...db.people.filter((p) => !p.sample)];
    db.visits = [...seed.visits, ...db.visits.filter((v) => !isSampleVisit(v))].sort((a, b) => a.at - b.at);
    db.village = seed.village;
    db.seedAt = now;
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
  person(pid, sid = null) { const p = this.db.people.find((x) => x.id === pid); return p ? personAs(p, sid) : null; }
  /** A visit as this sid sees it (its referral with the sid's own changes), or null. */
  visitAs(vid, sid = null) { const v = this.visit(vid); if (!v) return null; const { ov, touchedAt, ...base } = v; return { ...base, referral: refAs(v, sid) }; }
  visibleVisits(sid = null, now = Date.now()) { return this.db.visits.filter((v) => visibleVisit(v, sid, now)); }

  /** Change a referral as this sid: sample referrals get a per-sid copy; the sid's own are changed in place. */
  changeReferral(vid, sid, change) {
    const v = this.visit(vid), now = Date.now();
    if (!v || !v.referral || !visibleVisit(v, sid, now)) return null;
    const next = change({ ...refAs(v, sid) }, now);
    if (isSampleVisit(v) && ownView(sid)) setOverlay(v, sid, next, now);
    else v.referral = next;
    this.save();
    return { ...this.visitAs(vid, sid) };
  }
  /** The nurse has seen a referral. */
  ackReferral(vid, by, sid = null) {
    return this.changeReferral(vid, sid, (r, now) => {
      const who = cleanBy(by, "Nurse");
      delete r.by;
      return logged({ ...r, status: "seen", seenAt: now, seenBy: who, changedAt: now }, "seen", who, now);
    });
  }
  /** Undo "seen": the referral goes back on the board as open. */
  reopenReferral(vid, by, sid = null) {
    return this.changeReferral(vid, sid, (r, now) => {
      const { seenAt, seenBy, by: oldBy, ...rest } = r;
      const who = cleanBy(by, "Nurse");
      return logged({ ...rest, status: "open", reopenedAt: now, reopenedBy: who, changedAt: now }, "reopened", who, now);
    });
  }
  /** What happened after the referral: reached / admitted / refused / not_reachable. */
  setOutcome(vid, outcome, by, sid = null) {
    if (!Object.hasOwn(OUTCOMES, outcome)) {
      if (!this.visit(vid)?.referral) return null;
      throw badRequest(`outcome must be one of: ${Object.keys(OUTCOMES).join(", ")}.`);
    }
    return this.changeReferral(vid, sid, (r, now) => {
      const who = cleanBy(by, "ASHA");
      return logged({ ...r, outcome, outcomeAt: now, outcomeBy: who, changedAt: now }, "outcome:" + outcome, who, now);
    });
  }

  /**
   * Referrals that need another visit: refused or not reachable (due from the next day, IST),
   * or no outcome 24 hours after the referral. A newer visit to the same person closes it.
   */
  followups(now = Date.now(), sid = null) {
    const out = [];
    const visits = this.visibleVisits(sid, now);
    const lastVisit = new Map();
    for (const v of visits) if ((lastVisit.get(v.personId) || 0) < v.at) lastVisit.set(v.personId, v.at);
    for (const v of visits) {
      const r = refAs(v, sid);
      if (!r) continue;
      let due, reason;
      if (r.outcome === "refused" || r.outcome === "not_reachable") {
        if ((lastVisit.get(v.personId) || 0) > r.outcomeAt) continue;
        due = istDayStart(r.outcomeAt) + DAY;
        reason = r.outcome === "refused" ? "The family refused to go. Ask the ASHA to visit again today and talk to the family; if they still refuse, the nurse visits." : "The family could not be reached. Ask the ASHA to visit again today.";
      } else if (!r.outcome) {
        if ((lastVisit.get(v.personId) || 0) > r.at) continue;
        due = r.at + DAY;
        if (now < due) continue;
        reason = "No outcome recorded 24 hours after the referral. Ask the ASHA whether the family reached the facility.";
      } else continue;
      out.push({ referralId: v.id, personId: v.personId, name: v.name, type: v.type, due, isDue: now >= due, reason, outcome: r.outcome || null, urgent: referralUrgent(v), sample: isSampleVisit(v) });
    }
    return out.sort((a, b) => a.due - b.due).slice(0, 40);
  }

  /** The register as CSV, for the ANM's monthly register. */
  exportCsv(sid = null) { const now = Date.now(); this.tidy(now); return toCsv(this.db, this.visibleVisits(sid, now).map((v) => viewOf(v, sid))); }

  state(sid = null) {
    const now = Date.now();
    this.tidy(now);
    const visits = this.visibleVisits(sid, now).map((v) => viewOf(v, sid));
    const seen = new Set(visits.map((v) => v.personId));
    const mine = this.db.people.filter((p) => SHARED || p.sample || (sid ? sidOf(p) === sid : !p.sid && seen.has(p.id))).map((p) => personAs(p, sid));
    const byPerson = new Map();
    for (const v of visits) { if (!byPerson.has(v.personId)) byPerson.set(v.personId, []); byPerson.get(v.personId).push(v); }
    const sampleIds = new Set(mine.filter((p) => p.sample).map((p) => p.id));
    const people = mine.map((p) => {
      const vs = (byPerson.get(p.id) || []).slice().sort((a, b) => a.at - b.at);
      const last = vs[vs.length - 1] || null;
      const out = { ...p, sample: !!p.sample, visits: vs.length, last: last ? { id: last.id, at: last.at, level: levelOf(last.flags), flags: last.flags.map((f) => f.code), refer: last.flags.some((f) => f.severity === "refer_now"), watch: last.flags.some((f) => f.severity === "watch") } : null };
      if (p.kind === "baby") {
        const ws = vs.filter((v) => Number.isFinite(v.record?.weight_g));
        const lw = ws[ws.length - 1], pw = ws[ws.length - 2];
        const bw = [...vs].reverse().find((v) => Number.isFinite(v.record?.birth_weight_g));
        out.weight = lw ? { last_g: lw.record.weight_g, at: lw.at, prev_g: pw ? pw.record.weight_g : null, birth_g: bw ? bw.record.birth_weight_g : null, trend: pw ? Math.sign(lw.record.weight_g - pw.record.weight_g) : null } : null;
      }
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
      flags: v.flags.filter((f) => f.severity === "refer_now").map((f) => ({ code: f.code, urgent: isUrgent(f), title: f.title, why: f.why, action: f.action, ...(f.from ? { from: f.from, note: f.note } : {}), ...(f.conflict ? { conflict: true } : {}) })),
      fromTranscript: (v.transcript?.added || []).length > 0, conflict: (v.transcript?.conflicts || []).length > 0, count: v.count || 1, level: levelOf(v.flags),
      sample: sampleIds.has(v.personId) && isSampleVisit(v), samplePerson: sampleIds.has(v.personId),
    }));
    const followups = this.followups(now, sid);
    // who changed what, so a referral cleared by mistake (or by a stranger on the demo) can be put back
    const changes = visits.flatMap((v) => (v.referral?.log || []).map((c) => ({ referralId: v.id, name: v.name, ...c }))).sort((a, b) => b.at - a.at).slice(0, 15);
    const week = visits.filter((v) => now - v.at < 7 * DAY);
    return {
      village: this.db.village, ruleset: RULESET, now, people,
      referrals, followups, changes, recent: visits.slice(-15).reverse().map((v) => ({ id: v.id, at: v.at, lastAt: v.lastAt || v.at, count: v.count || 1, name: v.name, type: v.type, via: v.via, level: levelOf(v.flags), refer: v.flags.some((f) => f.severity === "refer_now"), watch: v.flags.some((f) => f.severity === "watch"), flags: v.flags.map((f) => f.title), sample: isSampleVisit(v) })),
      totals: {
        visitsThisWeek: week.length,
        openReferrals: referrals.filter((r) => r.status === "open").length,
        urgentReferrals: referrals.filter((r) => r.status === "open" && r.urgent).length,
        followupsDue: followups.filter((f) => f.isDue).length,
        highRisk: people.filter((p) => p.last?.refer).length,
        dueToday: people.filter((p) => p.dueToday).length,
      },
      limits: LIMITS,
      demoNote: DEMO_TTL ? `Visits saved by visitors are cleared after ${TTL_HOURS} hour${TTL_HOURS === 1 ? "" : "s"}.` : null,
    };
  }
}

const valid = (db) => !!(db && typeof db === "object" && Array.isArray(db.people) && Array.isArray(db.visits));
const referralUrgent = (v) => (typeof v.referral?.urgent === "boolean" ? v.referral.urgent : v.flags.some(isUrgent));
function logged(r, action, by, at) { r.log = [...(r.log || []), { action, by, at }].slice(-20); return r; }
/** A visit as one sid sees it, without the other sids' overlays. */
function viewOf(v, sid) { const { ov, touchedAt, ...base } = v; return { ...base, referral: refAs(v, sid) }; }

/** Read the joined transcript with the same reader the phone uses. */
function readTranscript(type, said) {
  const text = said.join(". ").trim();
  if (!text) return { ok: false, record: { type } };
  try { const r = sanitize({ ...(understand(text, type)?.record || {}), type }); for (const k of SERVER_FIELDS) delete r[k]; return { ok: true, record: r }; }
  catch (e) { console.error("Could not re-read a transcript:", e.message); return { ok: false, record: { type } }; }
}
// Readings that only make sense together: take the whole group from one side.
const GROUPS = [["temp_c", "temp_f"], ["bp_sys", "bp_dia"], ["weeks", "month"]];
const NOT_IN_RECORD = "said in the visit but not in the record";
const DISAGREES = "said in the visit, record disagrees — nurse to check";
/** a over b, field by field, keeping each group of readings whole. */
function overlay(a, b) {
  const out = { ...b };
  for (const [k, v] of Object.entries(a)) if (k !== "symptoms") out[k] = v;
  for (const g of GROUPS) if (g.some((k) => a[k] !== undefined)) for (const k of g) { if (a[k] === undefined) delete out[k]; }
  if (a.symptoms || b.symptoms) out.symptoms = { ...(b.symptoms || {}), ...(a.symptoms || {}) };
  return out;
}
const refers = (r) => { try { return (checkRecord(r) || []).filter((f) => f.severity === "refer_now"); } catch { return []; } };
/**
 * Refer-level signs in the ASHA's words that the record's flags lack. Two passes:
 * 1. what the record left out, filled from her words (the record wins where it has a value);
 * 2. her words over the record: a refer-level sign that only appears this way means the record
 *    disagrees with what she said (fits said, record "no fits"; 39 °C said, record 37). The record's
 *    value is kept, and the flag is added with conflict: true for the nurse to check.
 * Nothing is ever removed.
 */
function transcriptFlags(record, fromWords, have) {
  const words = { ...fromWords };
  delete words.name;
  if (!Object.keys(words).some((k) => k !== "type")) return { flags: [], heard: null, disagree: null };
  const codes = new Set(have.map((f) => f.code));
  const missing = refers(overlay(record, words)).filter((f) => !codes.has(f.code));
  missing.forEach((f) => codes.add(f.code));
  const conflicting = refers(overlay(words, record)).filter((f) => !codes.has(f.code));
  const flags = [
    ...missing.map((f) => ({ ...flagView(f), from: "transcript", note: NOT_IN_RECORD })),
    ...conflicting.map((f) => ({ ...flagView(f), from: "transcript", conflict: true, note: DISAGREES })),
  ];
  if (!flags.length) return { flags, heard: null, disagree: null };
  // what her words added, and where they disagree with the record
  const heard = {}, disagree = {};
  for (const [k, v] of Object.entries(words)) {
    if (k === "type" || k === "symptoms") continue;
    if (record[k] === undefined) heard[k] = v;
    else if (record[k] !== v) disagree[k] = { record: record[k], said: v };
  }
  for (const [k, v] of Object.entries(words.symptoms || {})) {
    if (v !== true) continue;
    if (record.symptoms?.[k] === undefined) (heard.symptoms ||= {})[k] = true;
    else if (record.symptoms[k] === false) disagree["symptoms." + k] = { record: false, said: true };
  }
  return { flags, heard: Object.keys(heard).length ? heard : null, disagree: Object.keys(disagree).length ? disagree : null };
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
  // a sign her words say is present while the record says absent is not "checked, not present": it is in "Nurse to check"
  ["Checked, not present", (v) => Object.entries(v.record.symptoms || {}).filter(([k, x]) => x === false && !v.transcript?.disagree?.["symptoms." + k]).map(([k]) => label(v.type, k)).join("; ")],
  ["Nurse to check (her words disagree with the record)", (v) => Object.entries(v.transcript?.disagree || {}).map(([k, d]) => (k.startsWith("symptoms.") ? `${label(v.type, k.slice(9))}: said present, record says absent` : `${k}: said ${d.said}, record ${d.record}`)).join("; ")],
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
function toCsv(db, visits = db.visits) {
  const lines = [
    "# Ghar Bhet village register export. Columns follow the field names of the MCP card (ANC and PNC) and the SSBSK 2026 / HBNC home-visit forms. One row per home visit, oldest first. Dates and times are IST.",
    `# Village: ${clean(db.village?.name, 60) || "?"}${db.village?.sample ? " (sample data: made-up people)" : ""}. Rules: ${RULESET.id}. Exported ${new Date(Date.now() + IST).toISOString().slice(0, 16).replace("T", " ")} IST.`,
    COLUMNS.map(([h]) => cell(h)).join(","),
  ];
  for (const v of [...visits].sort((a, b) => a.at - b.at)) lines.push(COLUMNS.map(([, f]) => { try { return cell(f(v)); } catch { return ""; } }).join(","));
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
  for (const p of b.people) { const o = people.get(p.id); if (!o || Math.max(p.updatedAt || 0, p.touchedAt || 0) > Math.max(o.updatedAt || 0, o.touchedAt || 0)) people.set(p.id, p); }
  const visits = new Map(a.visits.map((v) => [v.id, v]));
  for (const v of b.visits) { const o = visits.get(v.id); if (!o || Math.max(v.referral?.changedAt || 0, v.touchedAt || 0, v.lastAt || 0) > Math.max(o.referral?.changedAt || 0, o.touchedAt || 0, o.lastAt || 0)) visits.set(v.id, v); }
  return { ...a, ...b, people: [...people.values()], visits: [...visits.values()].sort((x, y) => x.at - y.at), meta: { ...(a.meta || {}), ...(b.meta || {}) } };
}

// ---------- the record: keep only fields the spec knows, with sane types and ranges ----------
// filled only by the server from the register; a client's value is ignored
const SERVER_FIELDS = ["prev_weight_g"];
const NUM = { pulse: [30, 220], prev_weight_g: [300, 7000], age: [10, 60], height_cm: [100, 200], labour_hours: [0, 96], temp_f: [86, 112], birth_weight_g: [300, 7000], weeks: [1, 45], month: [1, 10], bp_sys: [50, 280], bp_dia: [30, 200], hb: [2, 20], weight_kg: [20, 200], ifa_tablets: [0, 500], day: [0, 120], pads: [0, 40], temp_c: [30, 44], weight_g: [300, 7000], resp_rate: [5, 150] };
const ENUM = { bp_source: ["card", "today", "earlier"], hb_source: ["card", "today", "earlier"], albumin: ["nil", "trace", "1", "2", "3", "4"], fetal_movement: ["normal", "reduced", "absent"], feeding: ["good", "poor", "none"] };
// Per-type fields from eval/SPEC.md (pnc also takes BP and Hb for the postnatal BP / anaemia rules).
// If rules.js exports FIELDS = { anc: [...], pnc: [...], newborn: [...] }, those are added.
const BASE_FIELDS = {
  anc: ["weeks", "month", "bp_sys", "bp_dia", "hb", "weight_kg", "albumin", "fetal_movement", "ifa_tablets", "pulse", "bp_source", "bp_date", "hb_source", "hb_date"],
  pnc: ["day", "pads", "temp_c", "bp_sys", "bp_dia", "hb", "bp_source", "bp_date", "hb_source", "hb_date"],
  newborn: ["day", "weight_g", "temp_c", "resp_rate", "feeding"],
};
function fieldsFor(type) {
  const extra = RULES.FIELDS?.[type] ?? RULES.RECORD_FIELDS?.[type] ?? READER_FIELDS?.[type];
  const list = new Set(BASE_FIELDS[type] || []);
  if (Array.isArray(extra)) for (const f of extra) if (typeof f === "string" && /^[a-z][a-z0-9_]{0,30}$/.test(f) && !["type", "name", "symptoms"].includes(f)) list.add(f);
  return list;
}
// Only symptom codes the rules know (any visit type), so nobody can plant text on the board.
const LABELLED = new Set(Object.values(RULES.SYMPTOM_LABELS || {}).flatMap((m) => Object.keys(m || {})));
const KNOWN_SYMPTOMS = (k) => /^[a-z][a-z_]{2,30}$/.test(k) && (LABELLED.size === 0 || LABELLED.has(k));
export function sanitize(r) {
  const out = { type: r.type };
  if (typeof r.name === "string" && r.name.trim()) out.name = r.name.trim().replace(/[<>"'`&]/g, "").slice(0, 30);
  if (!out.name) delete out.name;
  for (const k of fieldsFor(r.type)) {
    const v = r[k];
    if (v == null) continue;
    if (NUM[k]) { const n = Number(v); if (typeof v !== "boolean" && v !== "" && Number.isFinite(n) && n >= NUM[k][0] && n <= NUM[k][1]) out[k] = n; }
    else if (ENUM[k]) { if (ENUM[k].includes(String(v))) out[k] = String(v); }
    // the date written on the card, as said ("20 Nov", "pichle hafte", "पिछले हफ्ते")
    else if (k.endsWith("_date")) { const d = typeof v === "string" ? v.trim() : ""; if (/^[\p{L}\p{M}\p{N} ./-]{1,30}$/u.test(d)) out[k] = d; }
    else if (typeof v === "boolean") out[k] = v;
    // a field the rules added that we don't know: accept a plain finite number or a short code word
    else if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e6) out[k] = v;
    else if (typeof v === "string" && /^[a-z0-9_.+-]{1,20}$/i.test(v)) out[k] = v;
  }
  if (r.symptoms && typeof r.symptoms === "object" && !Array.isArray(r.symptoms)) {
    const sym = {};
    for (const [k, v] of Object.entries(r.symptoms).slice(0, 60)) if (KNOWN_SYMPTOMS(k) && typeof v === "boolean") sym[k] = v;
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
