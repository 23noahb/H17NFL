import { getStore } from "@netlify/blobs";
import { verifyOrClaimPin } from "./lib/auth.js";

const BUDDIES = ["Joe", "Loop", "Noah", "Tom"];

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const { user, pin } = body || {};
  if (!BUDDIES.includes(user) || typeof pin !== "string" || pin.length < 4 || pin.length > 20) {
    return new Response(JSON.stringify({ error: "PIN must be 4-20 characters" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const store = getStore("h17-nfl");
  const result = await verifyOrClaimPin(store, user, pin);
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 401,
    headers: { "content-type": "application/json" },
  });
};

export const config = { path: "/.netlify/functions/auth" };
