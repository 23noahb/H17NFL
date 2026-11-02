import { runGrade } from "./lib/grade-run.js";

// After the 1:00pm ET games: Sunday 4:30pm EST (21:30 UTC).
export default async () => runGrade();

export const config = { schedule: "30 21 * * 0" };
