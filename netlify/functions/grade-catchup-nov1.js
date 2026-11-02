import { runGrade } from "./lib/grade-run.js";

// One-off catch-up for Sunday Nov 1: 9:00pm EST = 02:00 UTC on Nov 2.
// (Cron has no year field, so this would fire again next Nov 2 — harmless,
// it's the same grade-only run — but the file can be deleted any time.)
export default async () => runGrade();

export const config = { schedule: "0 2 2 11 *" };
