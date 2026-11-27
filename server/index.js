// Ghar Bhet server. Plain Node, no packages to install, no keys.
// Serves the app, keeps the village register, re-checks every visit with the
// same rules the phone uses, and streams new referrals to the nurse's board.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, levelOf } from "./store.js";
import { RULE_TABLE, RULESET } from "../public/js/rules.js";

const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const store = new Store(process.env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url)));
const source = await store.load();
console.log(`Register loaded from ${source}${process.env.GCS_BUCKET ? ` (bucket ${process.env.GCS_BUCKET})` : ""}.`);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};
const PAGES = { "/": "index.html", "/visit": "visit.html", "/anm": "anm.html", "/evidence": "evidence.html", "/how": "how.html", "/slip": "slip.html" };
const SECURITY = {
  "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY",
  "permissions-policy": "microphone=(self), camera=()",
  // only directives that can't break the pages' own inline scripts
  "content-security-policy": "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
};
const MINUTE = 60_000;
const num = (k, d) => Number(process.env[k]) || d;

// ---------- who is asking ----------
// Behind Cloud Run (K_SERVICE is set) Google's front end appends the caller's
// address as the LAST X-Forwarded-For entry; anything before it is whatever the
// client sent. Elsewhere there is no trusted proxy, so use the socket address.
const BEHIND_PROXY = !!process.env.K_SERVICE || process.env.TRUST_PROXY === "1";
const PROXY_HOPS = Math.max(1, num("PROXY_HOPS", 1)); // entries Google adds after the client's (1 for a plain run.app URL)
function clientKey(req) {
  let ip = req.socket.remoteAddress || "";
  if (BEHIND_PROXY && req.headers["x-forwarded-for"]) {
    const hops = String(req.headers["x-forwarded-for"]).split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) ip = hops[Math.max(0, hops.length - PROXY_HOPS)];
  }
  ip = ip.replace(/^::ffff:/, "");
  // one IPv6 home gets a whole /64, so count it as one visitor
  if (ip.includes(":")) ip = expand6(ip).slice(0, 4).join(":") + "::/64";
  return ip || "unknown";
}
function expand6(ip) {
  const [head, tail = ""] = ip.split("%")[0].split("::");
  const a = head ? head.split(":") : [], b = tail ? tail.split(":") : [];
  const fill = ip.includes("::") ? Array(Math.max(0, 8 - a.length - b.length)).fill("0") : [];
  return [...a, ...fill, ...b].map((x) => x.toLowerCase());
}

// ---------- limits: per visitor, and for everyone together ----------
const MAX_KEYS = 5000;
function limiter(perVisitor, global) {
  const seen = new Map(); // key -> recent timestamps; Map order = least recently used first
  let everyone = [];
  return (req) => {
    const key = clientKey(req), now = Date.now();
    everyone = everyone.filter((t) => now - t < MINUTE);
    const recent = (seen.get(key) || []).filter((t) => now - t < MINUTE);
    seen.delete(key);
    if (recent.length >= perVisitor) { seen.set(key, recent); return "visitor"; }
    if (everyone.length >= global) { seen.set(key, recent); return "global"; }
    recent.push(now); everyone.push(now); seen.set(key, recent);
    while (seen.size > MAX_KEYS) seen.delete(seen.keys().next().value); // forget the oldest visitors, not everyone
    return null;
  };
}
const allowWrite = limiter(num("RATE_PER_MIN", 20), num("RATE_GLOBAL_PER_MIN", 300));
// reads are cheap but not free: a board polling every 5 s uses 12 a minute
const allowRead = limiter(num("READ_RATE_PER_MIN", 300), num("READ_RATE_GLOBAL_PER_MIN", 6000));
function limited(res, why, what) {
  res.setHeader("retry-after", "60");
  return send(res, 429, { error: why === "global" ? "The demo register is very busy right now. Wait a minute and try again; nothing on your screen is lost." : `Too many ${what} from this device in a minute. Wait a moment and try again.` });
}

// ---------- the live stream to the nurse's board ----------
const SSE_MAX = num("SSE_MAX", 200), SSE_PER_VISITOR = num("SSE_PER_IP", 30); // a judging room shares one address
const streams = new Map(); // res -> key
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams.keys()) {
    if (res.writableLength > 1_000_000) { res.destroy(); continue; } // a board that stopped reading
    res.write(msg);
  }
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", ...SECURITY });
  res.end(data);
}
async function readBody(req, limit = 100_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("That request is too large."), { status: 413 }); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  let body;
  try { body = JSON.parse(raw); } catch { throw Object.assign(new Error("That request isn't valid JSON."), { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw Object.assign(new Error("That request should be a JSON object."), { status: 400 });
  return body;
}
const personView = (p) => p && { id: p.id, kind: p.kind, name: p.name, sample: !!p.sample };

async function api(req, res, url) {
  const p = url.pathname;
  if (p === "/api/health") return send(res, 200, { ok: true, ruleset: RULESET.id });
  if (req.method === "GET" && p !== "/api/stream") {
    const why = allowRead(req);
    if (why) return limited(res, why, "requests");
  }
  if (p === "/api/state" && req.method === "GET") return send(res, 200, store.state());
  if (p === "/api/rules") return send(res, 200, { ruleset: RULESET, rules: RULE_TABLE });
  if (p === "/api/export.csv" && req.method === "GET") {
    const day = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    res.writeHead(200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ghar-bhet-register-${day}.csv"`, "cache-control": "no-store", ...SECURITY });
    return res.end(store.exportCsv());
  }
  if (p === "/api/visits" && req.method === "POST") {
    const why = allowWrite(req);
    if (why) return limited(res, why, "visits");
    const { visit: v, person, matched } = store.addVisit(await readBody(req));
    broadcast("visit", { id: v.id, name: v.name, type: v.type, refer: !!v.referral, urgent: !!v.referral?.urgent, flags: v.flags.map((f) => f.title) });
    broadcast("state", store.state());
    return send(res, 200, { ...v, person: personView(person), matched });
  }
  if (p.startsWith("/api/visits/") && req.method === "GET") {
    const v = store.visit(p.split("/")[3]);
    return v ? send(res, 200, { ...v, level: levelOf(v.flags), count: v.count || 1, person: store.person(v.personId), village: store.db.village }) : send(res, 404, { error: "No visit with that id." });
  }
  const ref = p.match(/^\/api\/referrals\/([^/]+)\/(seen|open|outcome)$/);
  if (ref && req.method === "POST") {
    const why = allowWrite(req);
    if (why) return limited(res, why, "changes");
    const b = await readBody(req);
    const v = ref[2] === "seen" ? store.ackReferral(ref[1], b.by) : ref[2] === "open" ? store.reopenReferral(ref[1], b.by) : store.setOutcome(ref[1], b.outcome, b.by);
    if (!v) return send(res, 404, { error: "No referral with that id." });
    broadcast("state", store.state());
    const r = v.referral;
    return send(res, 200, {
      ok: true, id: v.id, status: r.status, urgent: !!r.urgent, seenAt: r.seenAt || null, seenBy: r.seenBy || null, reopenedAt: r.reopenedAt || null,
      outcome: r.outcome || null, outcomeAt: r.outcomeAt || null, outcomeBy: r.outcomeBy || null,
    });
  }
  if (p === "/api/reset" && req.method === "POST") {
    if (process.env.ALLOW_RESET !== "1") return send(res, 403, { error: "Reset is turned off on this server." });
    store.reset(); broadcast("state", store.state()); return send(res, 200, { ok: true });
  }
  if (p === "/api/stream" && req.method === "GET") {
    const key = clientKey(req);
    let mine = 0; for (const k of streams.values()) if (k === key) mine++;
    if (streams.size >= SSE_MAX || mine >= SSE_PER_VISITOR) {
      res.setHeader("retry-after", "30");
      return send(res, streams.size >= SSE_MAX ? 503 : 429, { error: "Too many live boards are open. Close one, or refresh in a little while." });
    }
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no", ...SECURITY });
    res.write(`retry: 5000\nevent: state\ndata: ${JSON.stringify(store.state())}\n\n`);
    streams.set(res, key);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    res.on("close", () => { clearInterval(ping); streams.delete(res); });
    return;
  }
  return send(res, 404, { error: "Not found" });
}

async function serveFile(res, rel, status = 200) {
  const path = normalize(join(ROOT, rel));
  if (!path.startsWith(normalize(ROOT))) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const s = await stat(path);
    if (!s.isFile()) throw new Error("not a file");
    const ext = extname(path);
    res.writeHead(status, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": [".html", ".js", ".css", ".json", ".webmanifest"].includes(ext) ? "no-cache" : "public, max-age=3600", ...SECURITY });
    res.end(await readFile(path));
  } catch {
    if (rel !== "404.html") return serveFile(res, "404.html", 404);
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    let url;
    try { url = new URL(req.url, "http://localhost"); } catch { return send(res, 400, { error: "That address isn't valid." }); }
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const clean = url.pathname.replace(/\/$/, "") || "/";
    const page = PAGES[clean] || (clean.startsWith("/slip/") ? "slip.html" : null);
    if (page) return await serveFile(res, page);
    let rel;
    try { rel = decodeURIComponent(url.pathname.slice(1)); } catch { return send(res, 400, "That address isn't valid.", "text/plain; charset=utf-8"); }
    if (rel.includes("\0")) return send(res, 400, "That address isn't valid.", "text/plain; charset=utf-8");
    return await serveFile(res, rel);
  } catch (e) {
    if (res.headersSent) return res.destroy();
    send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong on the server." });
    if (!e.status) console.error(e);
  }
});
server.listen(PORT, () => console.log(`Ghar Bhet is running on http://localhost:${PORT}`));

// Cloud Run and docker send SIGTERM before stopping: save the register first.
let stopping = false;
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, async () => {
  if (stopping) return; stopping = true;
  for (const res of streams.keys()) res.end();
  server.close();
  const t = setTimeout(() => process.exit(0), 8000);
  try { await store.flush(); } catch (e) { console.error("Could not save on shutdown:", e.message); }
  clearTimeout(t); process.exit(0);
});
