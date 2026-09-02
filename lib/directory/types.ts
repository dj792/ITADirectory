/**
 * The shape the UI works in. Deliberately NOT the sheet's shape: the export's
 * column names ("Report Name", "State/Prov", "Org Indicator") are artifacts of
 * the association's CRM, and renaming one there must not ripple through the
 * app. `parse.ts` is the one place the two vocabularies meet.
 */
export type Member = {
  /** ProfileID from the source system — stable across re-exports. */
  id: string;
  /** Best display name: "Report Name" if present, else "Profile Name". */
  name: string;
  /** "Profile Name" when it differs from `name` — e.g. "Macdonald, Taylor". */
  sortName: string;
  organization: string;
  email: string;
  membershipLevel: string;
  /** Primary Category, falling back to Profile Status — see parse.ts. */
  category: string;
  /** "Last Event Signed Up for". Blank until the column exists in the export. */
  lastEvent: string;
  website: string;
  city: string;
  state: string;
  zip: string;
  listingLevel: string;
  /**
   * The four fields the free-text box searches — Profile Name, Related
   * Organization, Main Profile Email and Report Name — lowercased and joined.
   *
   * SCOPE IS DELIBERATE. City, state, membership level and category are NOT in
   * here: typing "Atlanta" should not return every Atlanta member when the
   * reader meant a person, and a level typed as free text would collide with
   * the dropdown that already filters it. Precomputed once at parse time
   * rather than rebuilt per keystroke per row.
   */
  haystack: string;
};

export type Directory = {
  members: Member[];
  /**
   * Distinct values for the dropdowns, each sorted, blanks dropped.
   *
   * An EMPTY array is meaningful: the UI hides that dropdown entirely rather
   * than offering a control whose only choice is "all". So a column the export
   * doesn't carry yet costs nothing on screen, and the filter appears by itself
   * the first time real values show up.
   */
  facets: {
    membershipLevel: string[];
    category: string[];
    lastEvent: string[];
  };
  /** Where this data came from — shown in the page footer. */
  source: {
    kind: "sheet" | "fixture";
    sheetUrl: string | null;
    /** When this snapshot was read (ISO). */
    readAt: string;
    /**
     * Set when a live sheet read was attempted and FAILED. The list then came
     * from the fixture (or is empty), and the footer says so — a directory
     * quietly serving stale local data while looking live is worse than one
     * that admits it.
     */
    error?: string;
  };
};
