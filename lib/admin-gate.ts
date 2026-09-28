import crypto from "crypto";

/**
 * A PASSWORD ON /admin — deliberately small, and deliberately temporary.
 *
 * The admin screens write to ITA's configuration. Testing mode currently lets
 * everyone past middleware, so without this, every visitor to the deployed URL
 * could add, rename and reorder fields on ITA's membership forms. Sheets keeps
 * version history so that is recoverable, but "recoverable" is not the bar for
 * a live write endpoint on the open internet.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *
 * Not a user system. One shared secret, no accounts, no roles, no audit trail
 * of who changed what. It is a lock on a door that currently has none, sized to
 * the fact that the only people with the URL are DJ and ITA's staff.
 *
 * **It comes out when real sign-in lands.** At that point `/admin` goes behind
 * the staff check the way the Aligned KPIs app does it (email domain AND an
 * allowlist), this module is deleted, and `ADMIN_ACCESS_KEY` is removed from
 * Vercel. Nothing else imports it, so that is a clean removal.
 *
 * ── WHY A SIGNED COOKIE RATHER THAN THE PASSWORD IN A COOKIE ──────────────
 *
 * The cookie holds an HMAC of the key, not the key. So a cookie stolen from one
 * browser proves someone once knew the password, but cannot be read back into
 * the password itself — which matters because people reuse passwords, and this
 * one will be sent over Slack.
 *
 * The comparison is `timingSafeEqual`, which is close to pointless against a
 * remote attacker over HTTP jitter and costs one line. The real protection is
 * that the key is long and not guessable; this just avoids writing the version
 * of the code that is obviously wrong.
 */

export const ADMIN_COOKIE = "ita_admin";

/** Configured only when a key is set. Unset ⇒ the admin area is CLOSED. */
export function adminGateConfigured(): boolean {
  return (process.env.ADMIN_ACCESS_KEY ?? "").trim().length > 0;
}

/**
 * The cookie value for the configured key.
 *
 * Salted with `AUTH_SECRET` so the token is specific to this deployment: the
 * same admin key on a staging copy produces a different cookie, and a cookie
 * cannot be carried between them. `AUTH_SECRET` is set in Vercel; it falls back
 * to the key itself so local development works without one.
 */
export function adminToken(): string {
  const key = (process.env.ADMIN_ACCESS_KEY ?? "").trim();
  const salt = (process.env.AUTH_SECRET ?? "").trim() || key;
  return crypto.createHmac("sha256", salt).update(`admin:${key}`).digest("hex");
}

/** Does this cookie value prove the holder knew the key? */
export function adminCookieValid(value: string | undefined): boolean {
  if (!adminGateConfigured() || !value) return false;
  const expected = adminToken();
  if (value.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Is this the configured key? Trimmed, because a pasted password picks up spaces. */
export function adminKeyCorrect(submitted: string): boolean {
  if (!adminGateConfigured()) return false;
  const expected = (process.env.ADMIN_ACCESS_KEY ?? "").trim();
  const given = submitted.trim();
  if (given.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  } catch {
    return false;
  }
}

/* ------------------------------------------------------ where you land -- */

/**
 * Where signing in lands you.
 *
 * **Member Search, not the fields screen** (DJ, 28 Sep): once ITA has settled
 * the forms, looking a member up is the daily job and editing field definitions
 * is the occasional one, so the default is the thing people came for.
 */
export const ADMIN_HOME = "/admin/members";

/**
 * A safe return path for `?next=`.
 *
 * It arrives from a query string, so it is attacker-controlled, and handing it
 * to `redirect` unchecked is a textbook open redirect — a link to OUR login
 * page that lands on someone else's site, wearing our domain in the address bar
 * the whole way.
 *
 * It must be a path INSIDE `/admin`, and must not start with `//` or `/\`,
 * which browsers read as protocol-relative URLs (`//evil.test` is a HOST, not a
 * path — the case people miss). `/adminevil` is rejected too: starting with the
 * letters is not the same as being inside the section. Anything unrecognized
 * falls back rather than being sanitized into something nearby.
 *
 * **Lives here, not in the server-action module**, so it can be checked under
 * bare Node — importing a `"use server"` file into a fixture pulls in
 * `next/headers` and the suite simply stops running.
 */
export function safeNext(raw: string): string {
  const value = raw.trim();
  if (!value.startsWith("/admin")) return ADMIN_HOME;
  if (value.startsWith("//") || value.startsWith("/\\")) return ADMIN_HOME;
  if (value.length > "/admin".length && !"/?#".includes(value["/admin".length])) {
    return ADMIN_HOME;
  }
  return value;
}
