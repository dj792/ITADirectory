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
  status: string;
  category: string;
  website: string;
  city: string;
  state: string;
  zip: string;
  listingLevel: string;
  /**
   * Everything above, lowercased and joined — the haystack a query is tested
   * against. Precomputed once at parse time rather than rebuilt per keystroke
   * per row; with 200 members that's invisible, at 5,000 it isn't.
   */
  haystack: string;
};

export type Directory = {
  members: Member[];
  /** Distinct values for the filter dropdowns, each sorted, blanks dropped. */
  facets: {
    membershipLevel: string[];
    status: string[];
    state: string[];
  };
  /** Where this data came from — shown in the page footer. */
  source: {
    kind: "sheet" | "fixture";
    sheetUrl: string | null;
    /** When this snapshot was read (ISO). */
    readAt: string;
  };
};
