import { runGrade } from "./lib/grade-run.js";

// After the ~4:25pm ET games: Sunday 7:30pm EST (00:30 UTC, which is already
// Monday in UTC — hence weekday 1). SNF is picked up by the daily morning sync.
export default async () => runGrade();

export const config = { schedule: "30 0 * * 1" };
