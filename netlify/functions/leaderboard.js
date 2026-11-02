import { getStore } from "@netlify/blobs";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

export default async () => {
  const store = getStore({ name: "h17-nfl", consistency: "strong" });
  const weeks = Array.from({ length: 18 }, (_, i) => i + 1);

  const gamesByWeek = {};
  await Promise.all(
    weeks.map(async (w) => {
      const doc = await store.get(`games/week-${w}`, { type: "json" });
      gamesByWeek[w] = doc?.games || [];
    })
  );

  const picksByUserWeek = {};
  await Promise.all(
    BUDDIES.flatMap((name) =>
      weeks.map(async (w) => {
        const doc = await store.get(`picks/week${w}-${name}`, { type: "json" });
        picksByUserWeek[`${name}-${w}`] = doc?.picks || {};
      })
    )
  );

  const activeWeeks = weeks.filter((w) => gamesByWeek[w].some((g) => g.status === "final"));

  // teamRecords[TEAM][buddy] = { w, l } — how each person has done when they
  // picked that team to win. A pick counts once the game is final: a win if the
  // team won, a loss if it didn't (same rule the standings use).
  const teamRecords = {};

  const rows = BUDDIES.map((name) => {
    let total = 0;
    let graded = 0;
    const perWeek = {};
    activeWeeks.forEach((w) => {
      const games = gamesByWeek[w].filter((g) => g.status === "final");
      const picks = picksByUserWeek[`${name}-${w}`] || {};
      let correct = 0;
      games.forEach((g) => {
        const pick = picks[g.id];
        if (pick === g.winnerAbbr) correct++;
        // A game with no pick is treated as a pick on the losing team (already
        // a loss in the standings above); a tie has no loser, so nothing to assign.
        let teamPicked = null;
        if (pick && (pick === g.homeAbbr || pick === g.awayAbbr)) teamPicked = pick;
        else if (!pick && g.winnerAbbr) teamPicked = g.winnerAbbr === g.homeAbbr ? g.awayAbbr : g.homeAbbr;
        if (teamPicked) {
          const rec = ((teamRecords[teamPicked] ||= {})[name] ||= { w: 0, l: 0 });
          if (teamPicked === g.winnerAbbr) rec.w++;
          else rec.l++;
        }
      });
      perWeek[w] = { correct, of: games.length };
      total += correct;
      graded += games.length;
    });
    return { name, total, graded, perWeek };
  }).sort((a, b) => b.total - a.total);

  return new Response(JSON.stringify({ activeWeeks, rows, teamRecords }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/.netlify/functions/leaderboard" };
