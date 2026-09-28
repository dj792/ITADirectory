/**
 * The admin gate, EDGE-SAFE — the same check as `lib/admin-gate.ts`, written
 * against Web Crypto so it can run in `middleware.ts`.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────
 *
 * The gate started as a check in `app/admin/layout.tsx`, which rendered a
 * password prompt instead of the page. That is not a gate, and the way it
 * failed is worth recording: **Next renders the layout and the page in
 * parallel**, so a layout returning different JSX does not stop the page
 * component from running. The page still executed, still read the whole form
 * configuration, and its output was still serialized into the RSC flight
 * payload embedded in the HTML. The browser showed a password box; `curl`
 * showed every field, including the ITA-staff-only ones. Verified, not
 * theorized — it is what the first version actually served.
 *
 * Middleware runs BEFORE any of that. The request is redirected and no page
 * component executes, so there is nothing to leak. It also covers every admin
 * route by PATH, present and future, which is stronger than each page
 * remembering to check — the guard that gets forgotten is always the one on the
 * page someone added last.
 *
 * The layout keeps a check too, and the server actions each keep theirs. Three
 * layers for one door is not belt-and-braces here: they fail differently.
 * Middleware can be mis-scoped by a matcher edit; a layout can be bypassed by a
 * route that doesn't use it; an action is reachable by POST without either.
 *
 * ── KEEPING THE TWO IMPLEMENTATIONS HONEST ────────────────────────────────
 *
 * This and the Node version must produce the SAME token or a cookie minted at
 * sign-in won't verify here. Both are HMAC-SHA256 over `admin:<key>` salted
 * with `AUTH_SECRET`, hex-encoded. `write.check.ts` asserts they agree.
 */

export const ADMIN_COOKIE = "ita_admin";

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function adminGateConfiguredEdge(): boolean {
  return (process.env.ADMIN_ACCESS_KEY ?? "").trim().length > 0;
}

/** The expected cookie value. Must match `adminToken()` in the Node module. */
export async function adminTokenEdge(): Promise<string> {
  const key = (process.env.ADMIN_ACCESS_KEY ?? "").trim();
  const salt = (process.env.AUTH_SECRET ?? "").trim() || key;
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(salt),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`admin:${key}`)));
}

/**
 * Is this cookie value valid?
 *
 * Constant-time-ish comparison by XOR accumulation — `timingSafeEqual` is a
 * Node API and has no edge equivalent. As in the Node module this is close to
 * irrelevant against a remote attacker; the protection is a long unguessable
 * key, and this only avoids writing the obviously-wrong version.
 */
export async function adminCookieValidEdge(value: string | undefined): Promise<boolean> {
  if (!adminGateConfiguredEdge() || !value) return false;
  const expected = await adminTokenEdge();
  if (value.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
