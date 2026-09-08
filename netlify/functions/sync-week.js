import { getStore } from "@netlify/blobs";

const YEAR = 2026;

// Regular-season week windows (UTC), from ESPN's own calendar for the 2026 season.
const WEEK_RANGES = [
  ["2026-09-06T07:00:00Z", "2026-09-16T06:59:00Z"],
  ["2026-09-16T07:00:00Z", "2026-09-23T06:59:00Z"],
  ["2026-09-23T07:00:00Z", "2026-09-30T06:59:00Z"],
  ["2026-09-30T07:00:00Z", "2026-10-07T06:59:00Z"],
  ["2026-10-07T07:00:00Z", "2026-10-14T06:59:00Z"],
  ["2026-10-14T07:00:00Z", "2026-10-21T06:59:00Z"],
  ["2026-10-21T07:00:00Z", "2026-10-28T06:59:00Z"],
  ["2026-10-28T07:00:00Z", "2026-11-04T07:59:00Z"],
  ["2026-11-04T08:00:00Z", "2026-11-11T07:59:00Z"],
  ["2026-11-11T08:00:00Z", "2026-11-18T07:59:00Z"],
  ["2026-11-18T08:00:00Z", "2026-11-25T07:59:00Z"],
  ["2026-11-25T08:00:00Z", "2026-12-02T07:59:00Z"],
  ["2026-12-02T08:00:00Z", "2026-12-09T07:59:00Z"],
  ["2026-12-09T08:00:00Z", "2026-12-16T07:59:00Z"],
  ["2026-12-16T08:00:00Z", "2026-12-23T07:59:00Z"],
  ["2026-12-23T08:00:00Z", "2026-12-30T07:59:00Z"],
  ["2026-12-30T08:00:00Z", "2027-01-06T07:59:00Z"],
  ["2027-01-06T08:00:00Z", "2027-01-13T07:59:00Z"],
];

function currentWeekIndex(now) {
  for (let i = 0; i < WEEK_RANGES.length; i++) {
    if (now < new Date(WEEK_RANGES[i][1]).getTime()) return i + 1;
  }
  return 18;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`fetch failed ${res.status} for ${url}`);
  return res.json();
}

function fetchScoreboard(week) {
  return fetchJson(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&year=${YEAR}`
  );
}

async function fetchTeamSchedule(teamId, season) {
  try {
    return await fetchJson(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/schedule?season=${season}`
    );
  } catch {
    return null;
  }
}

async function last3Meetings(teamId, oppAbbr) {
  const seasons = [YEAR - 1, YEAR - 2, YEAR - 3, YEAR - 4, YEAR - 5];
  const results = [];
  for (const season of seasons) {
    const d = await fetchTeamSchedule(teamId, season);
    if (!d?.events) continue;
    for (const e of d.events) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;
      if (home.winner === undefined && away.winner === undefined) continue;
      const other = String(home.team.id) === String(teamId) ? away : home;
      if (other.team.abbreviation !== oppAbbr) continue;
      let winner = null;
      if (home.winner === true) winner = home.team.abbreviation;
      else if (away.winner === true) winner = away.team.abbreviation;
      results.push({
        date: e.date.slice(0, 10),
        home: home.team.abbreviation,
        away: away.team.abbreviation,
        homeScore: home.score?.value != null ? Math.round(home.score.value) : null,
        awayScore: away.score?.value != null ? Math.round(away.score.value) : null,
        winner,
      });
    }
  }
  const seen = new Set();
  const uniq = [];
  for (const r of results.sort((a, b) => b.date.localeCompare(a.date))) {
    const key = `${r.date}-${r.home}-${r.away}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
    if (uniq.length === 3) break;
  }
  return uniq;
}

async function buildWeek(week) {
  const d = await fetchScoreboard(week);
  const games = [];
  for (const e of d.events || []) {
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    const odds = comp.odds?.[0];
    const link =
      e.links?.find((l) => l.rel?.includes("summary") || l.rel?.includes("event"))?.href ||
      e.links?.[0]?.href ||
      "";
    const completed = comp.status?.type?.completed || false;
    let winnerAbbr = null;
    if (home.winner === true) winnerAbbr = home.team.abbreviation;
    else if (away.winner === true) winnerAbbr = away.team.abbreviation;
    const last3 = await last3Meetings(home.team.id, away.team.abbreviation);
    games.push({
      id: e.id,
      kickoff: e.date,
      homeAbbr: home.team.abbreviation,
      awayAbbr: away.team.abbreviation,
      homeName: home.team.displayName,
      awayName: away.team.displayName,
      spreadDetails: odds?.details ?? null,
      overUnder: odds?.overUnder ?? null,
      espnLink: link,
      last3,
      status: completed ? "final" : "scheduled",
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
      winnerAbbr,
    });
  }
  games.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return { week, updatedAt: new Date().toISOString(), games };
}

async function gradeWeek(store, week) {
  const existing = await store.get(`games/week-${week}`, { type: "json" });
  if (!existing) return;
  const board = await fetchScoreboard(week);
  const byId = {};
  for (const e of board.events || []) byId[e.id] = e;

  const updatedGames = existing.games.map((g) => {
    const ev = byId[g.id];
    if (!ev) return g;
    const comp = ev.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    const completed = comp.status?.type?.completed || false;
    let winnerAbbr = null;
    if (home.winner === true) winnerAbbr = home.team.abbreviation;
    else if (away.winner === true) winnerAbbr = away.team.abbreviation;
    const odds = comp.odds?.[0];
    return {
      ...g,
      status: completed ? "final" : "scheduled",
      homeScore: completed ? Number(home.score) : null,
      awayScore: completed ? Number(away.score) : null,
      winnerAbbr,
      spreadDetails: odds?.details ?? g.spreadDetails,
      overUnder: odds?.overUnder ?? g.overUnder,
    };
  });

  await store.setJSON(`games/week-${week}`, {
    ...existing,
    games: updatedGames,
    updatedAt: new Date().toISOString(),
  });
}

async function seedWeekIfMissing(store, week) {
  const existing = await store.get(`games/week-${week}`, { type: "json" });
  if (existing) return;
  const built = await buildWeek(week);
  await store.setJSON(`games/week-${week}`, built);
}

export default async () => {
  const store = getStore("h17-nfl");
  const now = Date.now();
  const cw = currentWeekIndex(now);

  const toGrade = [cw - 1, cw].filter((w) => w >= 1 && w <= 18);
  for (const w of toGrade) {
    await gradeWeek(store, w);
  }

  const toSeed = [cw, cw + 1].filter((w) => w >= 1 && w <= 18);
  for (const w of toSeed) {
    await seedWeekIfMissing(store, w);
  }

  return new Response("ok");
};

export const config = { schedule: "17 11 * * *" };
