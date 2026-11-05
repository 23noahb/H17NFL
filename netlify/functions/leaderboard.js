import { getStore } from "@netlify/blobs";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

// Which primetime window a kickoff falls in, by Eastern-time weekday and hour:
// Thursday / Sunday / Monday at 7pm ET or later. Anything else (Sunday
// afternoons, Thanksgiving daytime, the Wednesday season opener) is not one of
// the three slots. Done in America/New_York so daylight saving can't shift it.
const ET_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});
const SLOT_BY_DAY = { Thu: "TNF", Sun: "SNF", Mon: "MNF" };
const SLOTS = ["TNF", "SNF", "MNF"];

function primetimeSlot(kickoffIso) {
  const t = new Date(kickoffIso);
  if (Number.isNaN(t.getTime())) return null;
  const parts = Object.fromEntries(ET_PARTS.formatToParts(t).map((p) => [p.type, p.value]));
  if (parseInt(parts.hour, 10) < 19) return null;
  return SLOT_BY_DAY[parts.weekday] || null;
}

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

  // Primetime: every finished TNF / SNF / MNF game, how each person did on it,
  // and each person's record per slot. Same rule as the standings: a missed pick
  // or a tie is a loss.
  const primetimeRecords = Object.fromEntries(
    BUDDIES.map((n) => [n, Object.fromEntries(SLOTS.map((sl) => [sl, { w: 0, l: 0 }]))])
  );
  const primetimeGames = [];
  activeWeeks.forEach((w) => {
    gamesByWeek[w].forEach((g) => {
      if (g.status !== "final") return;
      const slot = primetimeSlot(g.kickoff);
      if (!slot) return;
      const picks = {};
      BUDDIES.forEach((name) => {
        const pick = picksByUserWeek[`${name}-${w}`]?.[g.id] || null;
        const win = !!pick && pick === g.winnerAbbr;
        primetimeRecords[name][slot][win ? "w" : "l"]++;
        picks[name] = { pick, win };
      });
      primetimeGames.push({
        week: w,
        slot,
        kickoff: g.kickoff,
        away: g.awayAbbr,
        home: g.homeAbbr,
        awayScore: g.awayScore,
        homeScore: g.homeScore,
        winner: g.winnerAbbr || null,
        picks,
      });
    });
  });
  primetimeGames.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const primetime = { slots: SLOTS, records: primetimeRecords, games: primetimeGames };

  return new Response(JSON.stringify({ activeWeeks, rows, teamRecords, primetime }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/.netlify/functions/leaderboard" };
