import type { Directory, Member } from "./types";

/**
 * Fields the app is WIRED FOR but the current source doesn't carry yet —
 * CLIENT-SAFE.
 *
 * The SQL view (`ProfileView`) is now the primary source and is richer than the
 * report export it replaced, except in one respect: it has no event data, and
 * no listing level. Those columns fed a live filter and two member-page rows.
 *
 * The naive handling is to let them vanish — every field already hides itself
 * when empty, so nothing would break. That is exactly the problem. A filter
 * that silently disappears looks like a feature we removed, or a bug; and
 * six months on, nobody remembers the page ever offered it. So a field known to
 * be coming is shown as PENDING: visible, disabled, labelled.
 *
 * ONE definition of "pending", used by the search page and the member page
 * alike — otherwise the dropdown and the detail rows drift apart, and the day
 * the data lands one of them keeps saying "coming soon".
 *
 * TO RETIRE THIS: nothing. When the source grows the columns, `parse.ts`
 * already resolves them by name, the facets fill, and `isPending` goes false on
 * its own. These entries only need deleting if a field is abandoned for good.
 */

/** Why a field isn't showing data, in words a member can read. */
export const PENDING_NOTE = {
  events:
    "Event history is being connected to the new member database — this filter " +
    "will return once it's in.",
  listingLevel: "Not currently published in the member database.",
} as const;

/**
 * True when the whole directory carries no value for a field — i.e. the source
 * doesn't have the column, or has it and it's empty throughout.
 *
 * Deliberately data-driven rather than a hard-coded list of "missing" fields:
 * the moment ITA adds events to the view, this flips without a code change, and
 * there is no flag left switched on by mistake.
 */
export function isPending(members: Member[], pick: (m: Member) => string): boolean {
  return !members.some((m) => pick(m).trim().length > 0);
}

/** The event filter's state: real options, or pending. */
export function eventFilterPending(directory: Directory): boolean {
  return (
    directory.facets.lastEvent.length === 0 &&
    isPending(directory.members, (m) => m.lastEvent)
  );
}
