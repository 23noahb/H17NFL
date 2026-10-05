import { getStore } from "@netlify/blobs";
import { verifyOrClaimPin, verifyPinReadOnly } from "./lib/auth.js";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extra },
  });

const isLocked = (g, now) => g.status === "final" || now >= new Date(g.kickoff).getTime();

export default async (req) => {
  const url = new URL(req.url);
  // Strong consistency: a pick saved a moment ago must be what the next read sees.
  const store = getStore({ name: "h17-nfl", consistency: "strong" });

  if (req.method === "GET") {
    const week = parseInt(url.searchParams.get("week") || "0", 10);
    if (!week || week < 1 || week > 18) {
      return json({ error: "week required" }, 400);
    }
    const requesterName = url.searchParams.get("user") || "";
    const requesterPin = url.searchParams.get("pin") || "";
    const requesterVerified =
      BUDDIES.includes(requesterName) && (await verifyPinReadOnly(store, requesterName, requesterPin));
    const requester = requesterVerified ? requesterName : "";

    const gamesDoc = await store.get(`games/week-${week}`, { type: "json" });
    const now = Date.now();
    const lockedGameIds = new Set(
      (gamesDoc?.games || []).filter((g) => isLocked(g, now)).map((g) => g.id)
    );

    const result = {};
    await Promise.all(
      BUDDIES.map(async (name) => {
        const doc = await store.get(`picks/week${week}-${name}`, { type: "json" });
        const picks = doc?.picks || {};
        if (name === requester) {
          // you can always see your own picks, including future games
          result[name] = picks;
        } else {
          // everyone else's picks stay hidden per-game until that game locks
          const visible = {};
          for (const [gid, abbr] of Object.entries(picks)) {
            if (lockedGameIds.has(gid)) visible[gid] = abbr;
          }
          result[name] = visible;
        }
      })
    );
    return json(result, 200, { "cache-control": "no-store" });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const { week, user, picks, changes, pin } = body || {};
    const hasChanges = changes && typeof changes === "object";
    const hasFull = picks && typeof picks === "object";
    if (
      !Number.isInteger(week) || week < 1 || week > 18 ||
      !BUDDIES.includes(user) ||
      typeof pin !== "string" ||
      (!hasChanges && !hasFull)
    ) {
      return json({ error: "invalid payload" }, 400);
    }
    const authResult = await verifyOrClaimPin(store, user, pin);
    if (!authResult.ok) {
      return json({ error: "wrong_pin" }, 401);
    }

    const gamesDoc = await store.get(`games/week-${week}`, { type: "json" });
    const byId = new Map((gamesDoc?.games || []).map((g) => [g.id, g]));
    const existing = await store.get(`picks/week${week}-${user}`, { type: "json" });
    const current = { ...(existing?.picks || {}) };
    const now = Date.now();
    const rejected = [];

    const validTeam = (g, v) => typeof v === "string" && (v === g.homeAbbr || v === g.awayAbbr);

    if (hasChanges) {
      // Per-pick changes ({gameId: "DET"} to set, {gameId: null} to clear),
      // merged into what's already saved so two quick taps can't clobber each other.
      for (const [gid, val] of Object.entries(changes)) {
        const g = byId.get(gid);
        if (!g || isLocked(g, now)) { rejected.push(gid); continue; }
        if (val === null) delete current[gid];
        else if (validTeam(g, val)) current[gid] = val;
        else rejected.push(gid);
      }
    } else {
      // Older cached pages send the whole pick set. Still honor locks.
      for (const g of byId.values()) {
        if (isLocked(g, now)) continue;
        const v = picks[g.id];
        if (validTeam(g, v)) current[g.id] = v;
        else delete current[g.id];
      }
    }

    await store.setJSON(`picks/week${week}-${user}`, {
      week,
      user,
      picks: current,
      updatedAt: new Date().toISOString(),
    });
    return json({ ok: true, picks: current, rejected });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/.netlify/functions/picks" };
