import { getStore } from "@netlify/blobs";

// One-time commissioner correction: Joe's Week 11 TNF pick (IND @ HOU, Houston)
// never saved. Sets only that one pick, only if it's still missing, and leaves
// every other pick untouched. POST-only so a crawler or link preview can't run it.
// Safe to delete from the repo once it has been applied.
const WEEK = 11;
const USER = "Joe";
const GAME_ID = "401873066";
const TEAM = "HOU";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const store = getStore({ name: "h17-nfl", consistency: "strong" });
  const gamesDoc = await store.get(`games/week-${WEEK}`, { type: "json" });
  const game = gamesDoc?.games?.find((g) => g.id === GAME_ID);
  if (!game || (game.homeAbbr !== TEAM && game.awayAbbr !== TEAM)) {
    return json({ error: "game not found or team mismatch — nothing changed" }, 409);
  }

  const key = `picks/week${WEEK}-${USER}`;
  const doc = await store.get(key, { type: "json" });
  const picks = { ...(doc?.picks || {}) };
  if (picks[GAME_ID]) {
    return json({ ok: true, changed: false, alreadyPicked: picks[GAME_ID] });
  }

  picks[GAME_ID] = TEAM;
  await store.setJSON(key, {
    ...(doc || {}),
    week: WEEK,
    user: USER,
    picks,
    updatedAt: new Date().toISOString(),
  });
  return json({ ok: true, changed: true, game: `${game.awayAbbr} @ ${game.homeAbbr}`, pick: TEAM, picksThisWeek: Object.keys(picks).length });
};

export const config = { path: "/.netlify/functions/fix-joe-week11-pick" };
