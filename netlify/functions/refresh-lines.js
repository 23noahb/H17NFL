import { getStore } from "@netlify/blobs";
import { currentWeekIndex, refreshLines } from "./lib/espn.js";

// Thursday and Sunday mornings: 12:00 UTC = 8:00am EDT (7:00am EST after the
// clocks change), ahead of the Thursday-night game and the Sunday slate.
export default async () => {
  const store = getStore({ name: "h17-nfl", consistency: "strong" });
  const cw = currentWeekIndex();
  const weeks = [cw, cw + 1].filter((w) => w >= 1 && w <= 18);
  const results = [];
  for (const w of weeks) {
    try {
      results.push(await refreshLines(store, w));
    } catch (err) {
      results.push({ week: w, error: String(err) });
    }
  }
  return new Response(JSON.stringify(results), {
    headers: { "content-type": "application/json" },
  });
};

export const config = { schedule: "0 12 * * 4,0" };
