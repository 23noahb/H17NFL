# The H17 Weekly NFL Challenge

A weekly NFL pick'em site for the group, built as a static frontend + Netlify Functions.

## What it does

- Shows each week's games (1–18) with logos, spread, over/under, and the last 3 meetings between the two teams, pulled from ESPN's public data.
- Click a team to pick them; the loser greys out. Picks save automatically per person (Joe / Loop / Noah / Tom, chosen from the header). Each name is protected by a PIN you set the first time you use it — no full account system, just enough to stop someone else editing your picks.
- Other people's picks for a given game stay hidden — server-side, not just visually — until that game's kickoff time passes, so nobody can copy off someone else before locking in their own pick. Your own picks are always visible to you.
- "Copy My Picks" copies that week's picks as a short list of team abbreviations.
- A season-long leaderboard tallies correct picks per week automatically once games go final.
- A scheduled job refreshes data daily: grades finished games and stages the next week's slate, so no one has to update anything by hand.

## Stack

- `index.html` — the whole frontend (vanilla HTML/CSS/JS, no build step, real team logos embedded inline)
- `og-image.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon-32.png` — link-preview image and app icons
- `netlify/functions/games.js` — read one week's games
- `netlify/functions/picks.js` — read/write a person's picks
- `netlify/functions/leaderboard.js` — compute season standings
- `netlify/functions/sync-week.js` — scheduled job (daily) that grades finished games and seeds upcoming weeks from ESPN
- Data lives in **Netlify Blobs** (`h17-nfl` store) — no external database needed

Everything at the repo's top level (`index.html`, the `.png` files, `netlify.toml`, etc.) gets served as-is — `netlify.toml` sets `publish = "."`. The one folder that has to stay exactly where it is is `netlify/functions/`.

## Updating the site (no git needed)

This repo is managed by dragging files into GitHub's web upload, not git commands:

1. Go to the repo on GitHub → **Add file → Upload files**
2. Drag in whichever files changed, keeping them at the same path they already have (top-level files stay top-level; anything under `netlify/functions/` goes into that same folder)
3. Commit changes → Netlify redeploys automatically in under a minute

## Deploy from scratch (GitHub + Netlify)

1. Create a GitHub repo and upload everything in this folder, preserving the `netlify/functions/` folder structure.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo. Build settings come from `netlify.toml` — no changes needed. Deploy.
3. Netlify auto-detects `netlify/functions/sync-week.js`'s `export const config = { schedule: "17 11 * * *" }` and registers it as a scheduled function (runs daily ~7:17am ET). No extra setup.
4. **Populate Week 1 immediately** instead of waiting for the next scheduled run: in the Netlify dashboard, find `sync-week` under Functions/Logs & metrics and trigger it manually. This builds and stores Week 1 (and pre-stages Week 2) right away.
5. Open the deployed site URL, pick your name, and you're live. Share the URL with Joe, Loop, Noah, and Tom.

No API keys or accounts needed anywhere in this stack — ESPN's public scoreboard endpoints are unauthenticated, and Netlify Blobs is provisioned automatically per-site.

## Notes / limitations

- Grading and next-week setup happen once a day (~7:17am ET). Monday Night Football results are typically graded by the next morning, not instantly at final whistle.
- "Last 3 meetings" looks back up to 5 seasons for the two teams' most recent meetings; brand-new or rarely-scheduled matchups may show fewer than 3.
- The PIN system is lightweight by design (hashed server-side, but no password reset flow, no email/SMS recovery). If someone forgets theirs, the fix today is manually clearing `auth/<name>` from the Netlify Blobs store so they can re-claim it. Since PINs were added after the group had already been picking without one, whoever first opens a given name after this update effectively claims its PIN — have everyone claim their own name promptly after deploying this.
- Because `publish = "."`, the `netlify/functions/*.js` source files are also reachable as plain static files if someone knows the path. Nothing secret lives in them (no API keys), so this is a cosmetic tradeoff for a simpler upload workflow, not a security issue.
- If you ever want a 5th/6th player, edit the `BUDDIES` array (same list, three places: `index.html`, `netlify/functions/picks.js`, `netlify/functions/leaderboard.js`).
