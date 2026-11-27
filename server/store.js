// The village register: mothers, babies, their visits and open referrals.
// One JSON file, so the app needs no database and runs on a school laptop.
// Optionally the same JSON is kept in a Google Cloud Storage bucket (env
// GCS_BUCKET), so a hosted demo survives restarts. No packages and no keys:
// the access token comes from the platform's metadata server.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import * as RULES from "../public/js/rules.js";
import { FIELDS as READER_FIELDS } from "../public/js/understand.js";
import { seedVillage } from "./seed.js";

const { checkRecord, RULESET } = RULES;
const DAY = 24 * 3600 * 1000;
const id = () => Math.random().toString(36).slice(2, 10);
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
    if (!Object.keys(record).some((k) => k !== "type" && k !== "name")) throw badRequest("This visit has nothing in it yet. Say or type at least one reading or sign (for example the day, weight, BP or a danger sign) before saving.");
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
    try { flags = (checkRecord(record) || []).map(({ code, severity, title, why, action, source }) => ({ code, severity, title, why, action, source })); }
    catch (e) { console.error("The rules could not check a visit:", e.message); }
    const refer = flags.some((f) => f.severity === "refer_now");
    const visit = {
      id: id(), at: now, type, personId: person.id, name: person.name, record, flags, ruleset: RULESET.id,
      said: Array.isArray(body.said) ? body.said.slice(0, 12).map((s) => String(s).slice(0, 600)) : [],
      lang: ["hi", "mr", "en"].includes(body.lang) ? body.lang : "hi", via: body.via === "typed" ? "typed" : "voice",
      asha: String(body.asha || "Asha worker").slice(0, 40),
      referral: refer ? { status: "open", at: now } : null,
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
    v.referral = { ...v.referral, status: "seen", seenAt: now, seenBy: String(by || "ANM").replace(/[<>]/g, "").slice(0, 40), changedAt: now };
    delete v.referral.by;
    this.save();
    return v;
  }
  /** Undo "seen": the referral goes back on the board as open. */
  reopenReferral(vid, by) {
    const v = this.visit(vid);
    if (!v || !v.referral) return null;
    const now = Date.now();
    const { seenAt, seenBy, by: oldBy, ...rest } = v.referral;
    v.referral = { ...rest, status: "open", reopenedAt: now, reopenedBy: String(by || "ANM").replace(/[<>]/g, "").slice(0, 40), changedAt: now };
    this.save();
    return v;
  }

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
    const referrals = visits.filter((v) => v.referral).sort((a, b) => b.at - a.at).slice(0, 30).map((v) => ({
      id: v.id, at: v.at, name: v.name, type: v.type, personId: v.personId, status: v.referral.status,
      seenAt: v.referral.seenAt || null, seenBy: v.referral.seenBy || v.referral.by || null, reopenedAt: v.referral.reopenedAt || null,
      flags: v.flags.filter((f) => f.severity === "refer_now").map((f) => ({ code: f.code, title: f.title, why: f.why, action: f.action })),
      sample: sampleIds.has(v.personId) && isSampleVisit(v), samplePerson: sampleIds.has(v.personId),
    }));
    const week = visits.filter((v) => now - v.at < 7 * DAY);
    return {
      village: this.db.village, ruleset: RULESET, now, people,
      referrals, recent: visits.slice(-15).reverse().map((v) => ({ id: v.id, at: v.at, name: v.name, type: v.type, via: v.via, refer: v.flags.some((f) => f.severity === "refer_now"), watch: v.flags.some((f) => f.severity === "watch"), flags: v.flags.map((f) => f.title), sample: isSampleVisit(v) })),
      totals: {
        visitsThisWeek: week.length,
        openReferrals: referrals.filter((r) => r.status === "open").length,
        highRisk: people.filter((p) => p.last?.refer).length,
        dueToday: people.filter((p) => p.dueToday).length,
      },
      limits: LIMITS,
    };
  }
}

const valid = (db) => !!(db && typeof db === "object" && Array.isArray(db.people) && Array.isArray(db.visits));

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
