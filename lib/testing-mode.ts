/**
 * TESTING MODE — a switch that skips sign-in entirely.
 *
 * This exists so the directory can be clicked through without waiting on a
 * magic-link email. It is, unavoidably, a documented way past the only thing
 * protecting 203 members' contact details. So it is built to fail CLOSED and to
 * be impossible to leave on by accident:
 *
 *  1. OFF unless `TESTING_MODE=1` is set on the server. Not a code constant
 *     someone flips and forgets, and not a `NEXT_PUBLIC_` value — the flag is
 *     never shipped to the browser, so it can't be toggled from a devtools
 *     console.
 *  2. Checked TWICE, and the second check is the real one. The button only
 *     renders when the flag is on, but `authorize` in `auth.ts` re-reads the
 *     flag before issuing a session — so a stale client bundle, a cached page,
 *     or a hand-crafted POST to the callback gets nothing.
 *  3. LOUD once used. The session is stamped with a `testing` memberId, and
 *     every page renders a red banner for the whole session. You cannot be in
 *     testing mode and not know it.
 *
 * REMOVE THE FLAG BEFORE REAL MEMBERS GET THE URL. Unsetting `TESTING_MODE` in
 * Vercel is enough to disable it everywhere — no redeploy needed for the gate
 * itself, though existing testing sessions survive until they're signed out.
 */

/** The single source of truth. Server-side only — never read this in a client component. */
export function testingModeEnabled(): boolean {
  return process.env.TESTING_MODE === "1";
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
