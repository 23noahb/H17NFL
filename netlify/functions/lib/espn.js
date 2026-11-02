const YEAR = 2026;

// Regular-season week windows (UTC), from ESPN's own calendar for the 2026 season.
const WEEK_ENDS = [
  "2026-09-16T06:59:00Z", "2026-09-23T06:59:00Z", "2026-09-30T06:59:00Z", "2026-10-07T06:59:00Z",
  "2026-10-14T06:59:00Z", "2026-10-21T06:59:00Z", "2026-10-28T06:59:00Z", "2026-11-04T07:59:00Z",
  "2026-11-11T07:59:00Z", "2026-11-18T07:59:00Z", "2026-11-25T07:59:00Z", "2026-12-02T07:59:00Z",
  "2026-12-09T07:59:00Z", "2026-12-16T07:59:00Z", "2026-12-23T07:59:00Z", "2026-12-30T07:59:00Z",
  "2027-01-06T07:59:00Z", "2027-01-13T07:59:00Z",
];

export function currentWeekIndex(now = Date.now()) {
  for (let i = 0; i < WEEK_ENDS.length; i++) {
    if (now < new Date(WEEK_ENDS[i]).getTime()) return i + 1;
  }
  return 18;
}

export async function fetchScoreboard(week) {
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&year=${YEAR}`,
    { headers: { "User-Agent": "Mozilla/5.0" } }
  );
  if (!res.ok) throw new Error(`scoreboard ${week} failed: ${res.status}`);
  return res.json();
}

// Pulls the latest spread / over-under (and kickoff, in case a game was flexed)
// for every game in a stored week that hasn't kicked off yet. Games already
// underway or final are left alone so in-game "live" lines never replace the
// pregame line people picked against.
export async function refreshLines(store, week) {
  const existing = await store.get(`games/week-${week}`, { type: "json" });
  if (!existing?.games?.length) return { week, updated: 0 };

  const board = await fetchScoreboard(week);
  const byId = {};
  for (const e of board.events || []) byId[e.id] = e;

  const now = Date.now();
  const stamp = new Date().toISOString();
  let updated = 0;

  const games = existing.games.map((g) => {
    const started = g.status === "final" || now >= new Date(g.kickoff).getTime();
    if (started) return g;
    const ev = byId[g.id];
    const comp = ev?.competitions?.[0];
    if (!comp) return g;

    const odds = comp.odds?.[0];
    const next = {
      ...g,
      kickoff: comp.date || ev.date || g.kickoff,
      spreadDetails: odds?.details ?? g.spreadDetails,
      overUnder: odds?.overUnder ?? g.overUnder,
    };
    if (
      next.kickoff !== g.kickoff ||
      next.spreadDetails !== g.spreadDetails ||
      next.overUnder !== g.overUnder
    ) {
      next.lineUpdatedAt = stamp;
      updated++;
    }
    return next;
  });

  await store.setJSON(`games/week-${week}`, {
    ...existing,
    games,
    linesUpdatedAt: stamp,
  });
  return { week, updated };
}

// Marks finished games final and records scores/winners. Leaves lines alone:
// those are refreshLines()' job (pregame only), so a live in-game line never
// replaces the one people actually picked against.
export async function gradeWeek(store, week) {
  const existing = await store.get(`games/week-${week}`, { type: "json" });
  if (!existing?.games?.length) return { week, final: 0 };
  const board = await fetchScoreboard(week);
  const byId = {};
  for (const e of board.events || []) byId[e.id] = e;

  const games = existing.games.map((g) => {
    const ev = byId[g.id];
    if (!ev) return g;
    const comp = ev.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    const completed = comp.status?.type?.completed || false;
    let winnerAbbr = null;
    if (home.winner === true) winnerAbbr = home.team.abbreviation;
    else if (away.winner === true) winnerAbbr = away.team.abbreviation;
    return {
      ...g,
      status: completed ? "final" : "scheduled",
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
      winnerAbbr,
    };
  });

  await store.setJSON(`games/week-${week}`, {
    ...existing,
    games,
    updatedAt: new Date().toISOString(),
  });
  return { week, final: games.filter((g) => g.status === "final").length };
}
