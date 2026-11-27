// Ghar Bhet server. Plain Node, no packages to install, no keys.
// Serves the app, keeps the village register, re-checks every visit with the
// same rules the phone uses, and streams new referrals to the nurse's board.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Store } from "./store.js";
import { RULE_TABLE, RULESET } from "../public/js/rules.js";

const ROOT = fileURLToPath(new URL("../public/", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const store = new Store(process.env.DATA_DIR || fileURLToPath(new URL("../data/", import.meta.url)));
await store.load();

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8",
};
const PAGES = { "/": "index.html", "/visit": "visit.html", "/anm": "anm.html", "/evidence": "evidence.html", "/how": "how.html", "/slip": "slip.html" };
const SECURITY = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "permissions-policy": "microphone=(self), camera=()" };

const streams = new Set();
function broadcast(event, data) { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const res of streams) res.write(msg); }

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
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error("That request isn't valid JSON."), { status: 400 }); }
}

// A small per-visitor limit on writes, so the public demo can't be flooded.
const writes = new Map();
function allowWrite(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const now = Date.now(), win = writes.get(ip) || [];
  const recent = win.filter((t) => now - t < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now); writes.set(ip, recent);
  if (writes.size > 5000) writes.clear();
  return true;
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === "/api/health") return send(res, 200, { ok: true, ruleset: RULESET.id });
  if (p === "/api/state" && req.method === "GET") return send(res, 200, store.state());
  if (p === "/api/rules") return send(res, 200, { ruleset: RULESET, rules: RULE_TABLE });
  if (p === "/api/visits" && req.method === "POST") {
    if (!allowWrite(req)) return send(res, 429, { error: "Too many visits from this device in a minute. Wait a moment and save again." });
    const v = store.addVisit(await readBody(req));
    if (!v) return send(res, 400, { error: "This visit needs a type and at least one field." });
    broadcast("visit", { id: v.id, name: v.name, type: v.type, refer: !!v.referral, flags: v.flags.map((f) => f.title) });
    broadcast("state", store.state());
    return send(res, 200, v);
  }
  if (p.startsWith("/api/visits/") && req.method === "GET") {
    const v = store.visit(p.split("/")[3]);
    return v ? send(res, 200, { ...v, person: store.db.people.find((x) => x.id === v.personId) || null, village: store.db.village }) : send(res, 404, { error: "No visit with that id." });
  }
  if (p.startsWith("/api/referrals/") && p.endsWith("/seen") && req.method === "POST") {
    if (!allowWrite(req)) return send(res, 429, { error: "Too many changes in a minute. Try again shortly." });
    const b = await readBody(req);
    const v = store.ackReferral(p.split("/")[3], b.by);
    if (!v) return send(res, 404, { error: "No open referral with that id." });
    broadcast("state", store.state());
    return send(res, 200, { ok: true });
  }
  if (p === "/api/reset" && req.method === "POST") {
    if (process.env.ALLOW_RESET !== "1") return send(res, 403, { error: "Reset is turned off on this server." });
    store.reset(); broadcast("state", store.state()); return send(res, 200, { ok: true });
  }
  if (p === "/api/stream") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
    res.write(`event: state\ndata: ${JSON.stringify(store.state())}\n\n`);
    streams.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => { clearInterval(ping); streams.delete(res); });
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
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) return await api(req, res, url);
    const clean = url.pathname.replace(/\/$/, "") || "/";
    const page = PAGES[clean] || (clean.startsWith("/slip/") ? "slip.html" : null);
    return await serveFile(res, page || decodeURIComponent(url.pathname.slice(1)));
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : "Something went wrong on the server." });
    if (!e.status) console.error(e);
  }
});
server.listen(PORT, () => console.log(`Ghar Bhet is running on http://localhost:${PORT}`));
