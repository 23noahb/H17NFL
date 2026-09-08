import { getStore } from "@netlify/blobs";

export default async (req) => {
  const url = new URL(req.url);
  const week = parseInt(url.searchParams.get("week") || "1", 10);
  if (!Number.isInteger(week) || week < 1 || week > 18) {
    return new Response(JSON.stringify({ error: "invalid week" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const store = getStore("h17-nfl");
  const data = await store.get(`games/week-${week}`, { type: "json" });
  return new Response(JSON.stringify(data || { week, games: [] }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};

export const config = { path: "/.netlify/functions/games" };
