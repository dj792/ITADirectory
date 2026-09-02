/**
 * TESTING MODE — a switch that skips sign-in entirely.
 *
 * This exists so the directory can be clicked through without waiting on a
 * magic-link email. It is, unavoidably, a documented way past the only thing
 * protecting 203 members' contact details.
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  IT IS CURRENTLY ON BY DEFAULT (see TESTING_MODE_DEFAULT below).         │
 * │  Anyone with the URL can open the directory without signing in.          │
 * │  Flip that constant to `false` before real members get the link.         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Default-on is a pre-launch convenience and reverses the usual posture: the
 * app now fails OPEN. Three things compensate, and none should be removed while
 * the default stands:
 *
 *  1. The OFF switch is deliberately generous. With default-on, the switch that
 *     matters is the one that turns it OFF — so `0`, `false`, `off` and `no` all
 *     work, in any case. Someone reaching for the brake in a hurry should not
 *     have to guess which spelling this app happens to accept.
 *  2. `authorize` in `auth.ts` re-reads this before issuing a session, so the
 *     button on /signin is only presentation. Turning it off in Vercel takes
 *     effect on the next request — no redeploy needed for the gate itself.
 *  3. Every testing session is stamped and banner-flagged (below), so nobody is
 *     in testing mode without knowing it.
 *
 * The flag is NEVER `NEXT_PUBLIC_`: it stays server-side, so it can't be
 * toggled from a devtools console.
 */

/**
 * What an UNSET `TESTING_MODE` means.
 *
 * `true`  — pre-launch: no env var needed, the bypass button is just there.
 * `false` — launch posture: the bypass exists only where TESTING_MODE=1.
 *
 * THIS IS THE ONE LINE TO CHANGE AT LAUNCH. `DeployITADirectory.command` warns
 * on every deploy while it's `true`, so it can't quietly ride along.
 */
export const TESTING_MODE_DEFAULT = true;

/** Values that mean "off". Checked case-insensitively, whitespace trimmed. */
const OFF_VALUES = new Set(["0", "false", "off", "no"]);

/** The single source of truth. Server-side only — never read in a client component. */
export function testingModeEnabled(): boolean {
  const raw = (process.env.TESTING_MODE ?? "").trim().toLowerCase();
  if (raw === "") return TESTING_MODE_DEFAULT;
  // Explicit off wins; anything else set at all is treated as on, because with
  // default-on the failure to avoid is a typo'd value silently meaning "off"
  // when someone meant to leave it on — and vice versa the OFF list is
  // deliberately broad so the brake is hard to miss.
  return !OFF_VALUES.has(raw);
}

/**
 * The identity a testing session gets. Deliberately not a real member: it
 * carries no ProfileID from the sheet, and the address is obviously fake, so a
 * testing session is recognizable at a glance in any log or session dump.
 */
export const TESTING_IDENTITY = {
  id: "testing",
  memberId: "testing",
  email: "testing-mode@localhost",
  name: "Testing Mode",
} as const;

/** True when this session came from the bypass rather than a verified email. */
export function isTestingSession(memberId: string | undefined | null): boolean {
  return memberId === TESTING_IDENTITY.memberId;
}
