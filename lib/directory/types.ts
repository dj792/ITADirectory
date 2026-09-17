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
  /**
   * "Profile Status" — filled for all 203 rows, 8 distinct values.
   *
   * `Primary Category` is deliberately NOT read. It carries the same vocabulary
   * but is blank for 76 of 203 rows and never disagrees with Profile Status
   * where both are present, so it added a second, sparser copy of this and
   * nothing else. Read Profile Status; ignore Primary Category.
   */
  status: string;
  /**
   * "Member Since", stored EXACTLY as the sheet wrote it. The card formats it
   * for display via `monthYearLabel`; keeping the raw value here means a change
   * to how dates are shown is a display change, and the original is never lost
   * to a parse we got wrong. Blank until the column exists in the export.
   */
  memberSince: string;
  /** "Last Event Signed Up for". Blank until the column exists in the export. */
  lastEvent: string;
  /**
   * "Last Event Attended" and "Event Count Past 12 Months" — engagement, as
   * opposed to intent. Signing up and turning up are different facts, and the
   * export keeps them in different columns, so the app does too. Shown on the
   * member page; neither is a filter (yet).
   */
  lastEventAttended: string;
  eventCount12mo: string;
  /** Profile_WorkPhone — the organisation's own number. */
  phone: string;
  address1: string;
  address2: string;
  /**
   * The main contact at a member organisation (`MC_*` in ProfileView) — the
   * person to actually call. Their email is `email` above; the two sources agree
   * that IS the directory address, so it isn't repeated here.
   */
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  /**
   * TRUE when this profile is an ORGANISATION rather than a person
   * (`Profile_OrgInd` / `Org Indicator`).
   *
   * A boolean, not a string, because it's a fact about the record rather than a
   * value to display — and because the three-way Organisations / Individuals /
   * Both filter has to be able to trust it. Roughly 3 in 4 ITA members are
   * organisations, which is also why `sortName` contains a comma for only about
   * a quarter of the directory: a company has no "Last, First" form.
   */
  isOrganization: boolean;
  website: string;
  city: string;
  state: string;
  zip: string;
  listingLevel: string;
  /**
   * The four fields the free-text box searches — Profile Name, Related
   * Organization, Main Profile Email and Report Name — lowercased and joined.
   *
   * SCOPE IS DELIBERATE. City, state, membership level and status are NOT in
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
    status: string[];
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
    /**
     * How the member count was arrived at, when a filter was applied. The SQL
     * view is the whole contact database, so "202 members" is the output of a
     * rule — and the strongest claim on the page should say which rule, in the
     * number's own caption. Absent when the source was pre-filtered.
     */
    basis?: {
      rowsRead: number;
      nonMembersSkipped: number;
      memberFlagColumn: string | null;
    };
  };
};
