import { getStore } from "@netlify/blobs";
import { currentWeekIndex, gradeWeek } from "./espn.js";

// Grade-only run for mid-day checkpoints: no seeding, no line changes.
export async function runGrade() {
  const store = getStore({ name: "h17-nfl", consistency: "strong" });
  const week = currentWeekIndex();
  let result;
  try {
    result = await gradeWeek(store, week);
  } catch (err) {
    console.error("gradeWeek failed", week, err);
    result = { week, error: String(err) };
  }
  return new Response(JSON.stringify(result), {
    headers: { "content-type": "application/json" },
  });
}
