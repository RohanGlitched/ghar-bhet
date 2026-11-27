// The village register: mothers, babies, their visits and open referrals.
// One JSON file, so the app needs no database and runs on a school laptop.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { checkRecord, RULESET } from "../public/js/rules.js";
import { seedVillage } from "./seed.js";

const DAY = 24 * 3600 * 1000;
const id = () => Math.random().toString(36).slice(2, 10);
const sound = (x) => String(x || "").toLowerCase().replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/w/g, "v").replace(/([kgcjtdpb])h/g, "$1").replace(/(.)\1+/g, "$1").replace(/y$/, "i").replace(/(?!^)a/g, "");

// SSBSK 2026 newborn visit days; at-risk babies get nine visits
const NB_HEALTHY = [3, 7, 14, 42], NB_AT_RISK = [1, 3, 5, 7, 10, 14, 21, 28, 42];
const PNC_DAYS = [1, 3, 7, 42];

export class Store {
  constructor(dir) { this.dir = dir; this.file = join(dir, "register.json"); this.db = null; this.timer = null; }

  async load() {
    try { this.db = JSON.parse(await readFile(this.file, "utf8")); } catch { this.db = null; }
    if (!this.db || !this.db.people) this.db = seedVillage(Date.now());
    this.save();
  }
  reset() { this.db = seedVillage(Date.now()); this.save(); }
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => {
      try { await mkdir(this.dir, { recursive: true }); const tmp = this.file + ".tmp"; await writeFile(tmp, JSON.stringify(this.db)); await rename(tmp, this.file); }
      catch (e) { console.error("Could not save the register:", e.message); }
    }, 250);
  }

  /** Find the person a visit is about, or add them to the register. */
  personFor(type, name, personId) {
    const people = this.db.people;
    if (personId) { const p = people.find((x) => x.id === personId); if (p) return p; }
    const kind = type === "anc" ? "pregnant" : type === "pnc" ? "mother" : "baby";
    if (name) {
      const p = people.find((x) => x.kind === kind && sound(x.name) === sound(name));
      if (p) return p;
    }
    const p = { id: id(), kind, name: name || (kind === "baby" ? "Unnamed baby" : "New mother"), addedAt: Date.now() };
    people.push(p);
    return p;
  }

  addVisit(body) {
    const type = ["anc", "pnc", "newborn"].includes(body?.type) ? body.type : null;
    const rec = body?.record && typeof body.record === "object" ? body.record : null;
    if (!type || !rec) return null;
    const record = sanitize({ ...rec, type });
    const person = this.personFor(type, record.name, body.personId);
    // keep the person's clock in step with what the ASHA said
    if (type === "newborn" && Number.isFinite(record.day) && !person.dob) person.dob = Date.now() - record.day * DAY;
    if (type === "pnc" && Number.isFinite(record.day) && !person.deliveredAt) person.deliveredAt = Date.now() - record.day * DAY;
    if (type === "anc" && Number.isFinite(record.weeks) && !person.lmp) person.lmp = Date.now() - record.weeks * 7 * DAY;
    if (type === "anc" && Number.isFinite(record.month) && !person.lmp) person.lmp = Date.now() - (record.month - 0.5) * 30.4 * DAY;
    const flags = checkRecord(record).map(({ code, severity, title, why, action, source }) => ({ code, severity, title, why, action, source }));
    const refer = flags.some((f) => f.severity === "refer_now");
    const visit = {
      id: id(), at: Date.now(), type, personId: person.id, name: person.name, record, flags, ruleset: RULESET.id,
      said: Array.isArray(body.said) ? body.said.slice(0, 12).map((s) => String(s).slice(0, 600)) : [],
      lang: ["hi", "mr", "en"].includes(body.lang) ? body.lang : "hi", via: body.via === "typed" ? "typed" : "voice",
      asha: String(body.asha || "Asha worker").slice(0, 40),
      referral: refer ? { status: "open", at: Date.now() } : null,
    };
    if (type === "newborn" && refer) person.atRisk = true;
    if (type === "newborn" && record.weight_g && record.weight_g < 2500) person.atRisk = true;
    this.db.visits.push(visit);
    if (this.db.visits.length > 4000) this.db.visits.splice(0, this.db.visits.length - 4000);
    this.save();
    return visit;
  }

  visit(vid) { return this.db.visits.find((v) => v.id === vid) || null; }

  ackReferral(vid, by) {
    const v = this.visit(vid);
    if (!v || !v.referral) return null;
    v.referral = { ...v.referral, status: "seen", seenAt: Date.now(), by: String(by || "ANM").slice(0, 40) };
    this.save();
    return v;
  }

  state() {
    const now = Date.now();
    const visits = this.db.visits;
    const people = this.db.people.map((p) => {
      const vs = visits.filter((v) => v.personId === p.id).sort((a, b) => a.at - b.at);
      const last = vs[vs.length - 1] || null;
      const out = { ...p, visits: vs.length, last: last ? { id: last.id, at: last.at, flags: last.flags.map((f) => f.code), refer: last.flags.some((f) => f.severity === "refer_now"), watch: last.flags.some((f) => f.severity === "watch") } : null };
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
    const referrals = visits.filter((v) => v.referral).sort((a, b) => b.at - a.at).slice(0, 30).map((v) => ({ id: v.id, at: v.at, name: v.name, type: v.type, personId: v.personId, status: v.referral.status, seenAt: v.referral.seenAt || null, flags: v.flags.filter((f) => f.severity === "refer_now").map((f) => ({ code: f.code, title: f.title, why: f.why, action: f.action })), sample: !!this.db.people.find((p) => p.id === v.personId)?.sample }));
    const week = visits.filter((v) => now - v.at < 7 * DAY);
    return {
      village: this.db.village, ruleset: RULESET, now, people,
      referrals, recent: visits.slice(-15).reverse().map((v) => ({ id: v.id, at: v.at, name: v.name, type: v.type, via: v.via, refer: v.flags.some((f) => f.severity === "refer_now"), watch: v.flags.some((f) => f.severity === "watch"), flags: v.flags.map((f) => f.title) })),
      totals: {
        visitsThisWeek: week.length,
        openReferrals: referrals.filter((r) => r.status === "open").length,
        highRisk: people.filter((p) => p.last?.refer).length,
        dueToday: people.filter((p) => p.dueToday).length,
      },
    };
  }
}

// Keep only fields the spec knows, with sane types and ranges.
const NUM = { weeks: [1, 45], month: [1, 10], bp_sys: [50, 280], bp_dia: [30, 200], hb: [2, 20], weight_kg: [20, 200], ifa_tablets: [0, 500], day: [0, 120], pads: [0, 40], temp_c: [30, 44], weight_g: [300, 7000], resp_rate: [5, 150] };
const ENUM = { albumin: ["nil", "trace", "1", "2", "3", "4"], fetal_movement: ["normal", "reduced", "absent"], feeding: ["good", "poor", "none"] };
function sanitize(r) {
  const out = { type: r.type };
  if (typeof r.name === "string" && r.name.trim()) out.name = r.name.trim().replace(/[<>]/g, "").slice(0, 30);
  for (const [k, [lo, hi]] of Object.entries(NUM)) { const v = Number(r[k]); if (r[k] != null && Number.isFinite(v) && v >= lo && v <= hi) out[k] = v; }
  for (const [k, vals] of Object.entries(ENUM)) if (vals.includes(String(r[k]))) out[k] = String(r[k]);
  if (r.symptoms && typeof r.symptoms === "object") {
    const sym = {};
    for (const [k, v] of Object.entries(r.symptoms)) if (/^[a-z_]{3,30}$/.test(k) && typeof v === "boolean") sym[k] = v;
    if (Object.keys(sym).length) out.symptoms = sym;
  }
  return out;
}
