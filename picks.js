import { getStore } from "@netlify/blobs";
import { verifyOrClaimPin } from "./lib/auth.js";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("h17-nfl");

  if (req.method === "GET") {
    const week = parseInt(url.searchParams.get("week") || "0", 10);
    if (!week || week < 1 || week > 18) {
      return new Response(JSON.stringify({ error: "week required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const requester = url.searchParams.get("user") || "";

    const gamesDoc = await store.get(`games/week-${week}`, { type: "json" });
    const now = Date.now();
    const lockedGameIds = new Set(
      (gamesDoc?.games || [])
        .filter((g) => g.status === "final" || now >= new Date(g.kickoff).getTime())
        .map((g) => g.id)
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
    return new Response(JSON.stringify(result), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), { status: 400 });
    }
    const { week, user, picks, pin } = body || {};
    if (
      !Number.isInteger(week) || week < 1 || week > 18 ||
      !BUDDIES.includes(user) ||
      typeof picks !== "object" || picks === null ||
      typeof pin !== "string"
    ) {
      return new Response(JSON.stringify({ error: "invalid payload" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    const authResult = await verifyOrClaimPin(store, user, pin);
    if (!authResult.ok) {
      return new Response(JSON.stringify({ error: "wrong_pin" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    // clamp picks to plain string values only
    const cleanPicks = {};
    for (const [gid, abbr] of Object.entries(picks)) {
      if (typeof gid === "string" && typeof abbr === "string") cleanPicks[gid] = abbr;
    }
    await store.setJSON(`picks/week${week}-${user}`, {
      week,
      user,
      picks: cleanPicks,
      updatedAt: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/.netlify/functions/picks" };
