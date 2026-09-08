# The H17 Weekly NFL Challenge

A weekly NFL pick'em site for the group, built as a static frontend + Netlify Functions.

## What it does

- Shows each week's games (1–18) with logos, spread, over/under, and the last 3 meetings between the two teams, pulled from ESPN's public data.
- Click a team to pick them; the loser greys out. Picks save automatically per person (Joe / Loop / Noah / Tom, chosen from the header — no accounts/passwords).
- "Copy My Picks" copies that week's picks as a short list of team abbreviations.
- A season-long leaderboard tallies correct picks per week automatically once games go final.
- A scheduled job refreshes data daily: grades finished games and stages the next week's slate, so no one has to update anything by hand.

## Stack

- `public/index.html` — the whole frontend (vanilla HTML/CSS/JS, no build step, real team logos embedded inline)
- `netlify/functions/games.js` — read one week's games
- `netlify/functions/picks.js` — read/write a person's picks
- `netlify/functions/leaderboard.js` — compute season standings
- `netlify/functions/sync-week.js` — scheduled job (daily) that grades finished games and seeds upcoming weeks from ESPN
- Data lives in **Netlify Blobs** (`h17-nfl` store) — no external database needed

## Deploy (GitHub + Netlify)

1. Create an empty GitHub repo (no README/license, so it stays empty) and copy its URL.
2. From this folder:
   ```bash
   git remote add origin <your-repo-url>
   git branch -M main
   git push -u origin main
   ```
3. In Netlify: **Add new site → Import an existing project → GitHub**, pick this repo. Build settings are already defined in `netlify.toml` (publish = `public`, functions = `netlify/functions`) — no changes needed. Deploy.
4. Netlify auto-detects `netlify/functions/sync-week.js`'s `export const config = { schedule: "17 11 * * *" }` and registers it as a scheduled function (runs daily ~7:17am ET). No extra setup.
5. **Populate Week 1 immediately** instead of waiting for the next scheduled run: in the Netlify dashboard, go to your site → **Functions** → `sync-week` → **Trigger function**. This builds and stores Week 1 (and pre-stages Week 2) right away.
6. Open the deployed site URL, pick your name, and you're live. Share the URL with Joe, Loop, Noah, and Tom.

No API keys or accounts needed anywhere in this stack — ESPN's public scoreboard endpoints are unauthenticated, and Netlify Blobs is provisioned automatically per-site.

## Notes / limitations

- Grading and next-week setup happen once a day (~7:17am ET). Monday Night Football results are typically graded by the next morning, not instantly at final whistle.
- "Last 3 meetings" looks back up to 5 seasons for the two teams' most recent meetings; brand-new or rarely-scheduled matchups may show fewer than 3.
- There's no real authentication — anyone with the site link can submit picks under any of the 4 names. That matches the "just for us" trust model; don't share the link outside the group if that matters to you.
- If you ever want a 5th/6th player, edit the `BUDDIES` array (same list, four places: `public/index.html`, `netlify/functions/picks.js`, `netlify/functions/leaderboard.js`, and `netlify/functions/sync-week.js` does not need it, it doesn't reference names).
