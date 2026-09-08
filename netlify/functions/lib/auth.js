import { createHash } from "node:crypto";

export function hashPin(name, pin) {
  return createHash("sha256").update(`${name}:${pin}:h17-salt-v1`).digest("hex");
}

// First use for a name claims the PIN; every later call verifies against it.
export async function verifyOrClaimPin(store, user, pin) {
  const existing = await store.get(`auth/${user}`, { type: "json" });
  const hash = hashPin(user, pin);
  if (!existing) {
    await store.setJSON(`auth/${user}`, { hash, createdAt: new Date().toISOString() });
    return { ok: true, claimed: true };
  }
  return { ok: existing.hash === hash, claimed: false };
}

// Read-only check for GET requests: never claims/creates a PIN, just confirms
// a caller genuinely holds the one already on file (or says false if there
// isn't one yet — an unclaimed name has nothing to verify against).
export async function verifyPinReadOnly(store, user, pin) {
  if (!pin) return false;
  const existing = await store.get(`auth/${user}`, { type: "json" });
  if (!existing) return false;
  return existing.hash === hashPin(user, pin);
}
