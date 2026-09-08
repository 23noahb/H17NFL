import { getStore } from "@netlify/blobs";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

export default async () => {
  const store = getStore("h17-nfl");
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

  const rows = BUDDIES.map((name) => {
    let total = 0;
    let graded = 0;
    const perWeek = {};
    activeWeeks.forEach((w) => {
      const games = gamesByWeek[w].filter((g) => g.status === "final");
      const picks = picksByUserWeek[`${name}-${w}`] || {};
      let correct = 0;
      games.forEach((g) => {
        if (picks[g.id] === g.winnerAbbr) correct++;
      });
      perWeek[w] = { correct, of: games.length };
      total += correct;
      graded += games.length;
    });
    return { name, total, graded, perWeek };
  }).sort((a, b) => b.total - a.total);

  return new Response(JSON.stringify({ activeWeeks, rows }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/.netlify/functions/leaderboard" };
