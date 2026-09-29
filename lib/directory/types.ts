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
  /** Profile_WorkPhone — the organization's own number. */
  phone: string;
  address1: string;
  address2: string;
  /**
   * The main contact at a member organization (`MC_*` in ProfileView) — the
   * person to actually call. Their email is `email` above; the two sources agree
   * that IS the directory address, so it isn't repeated here.
   */
  contactName: string;
  contactTitle: string;
  contactPhone: string;
  /**
   * TRUE when this profile is an ORGANIZATION rather than a person
   * (`Profile_OrgInd` / `Org Indicator`).
   *
   * A boolean, not a string, because it's a fact about the record rather than a
   * value to display — and because the three-way Organizations / Individuals /
   * Both filter has to be able to trust it. Roughly 3 in 4 ITA members are
   * organizations, which is also why `sortName` contains a comma for only about
   * a quarter of the directory: a company has no "Last, First" form.
   */
  isOrganization: boolean;
  /**
   * TRUE for an ITA member. FALSE for someone admitted because they are
   * CURRENTLY LINKED to a member organization — typically an employee.
   *
   * The directory is members plus their people, so `Member` is now a slight
   * misnomer for the record type; the flag is what keeps the distinction
   * honest. A card must never present a member firm's employee as an ITA
   * member, so every surface that shows membership reads this, not presence.
   */
  isMember: boolean;
  /**
   * For a related individual: the member organization they're linked to, and
   * their title there (`Title` on the relation — their role AT that org, not
   * their own job title). Empty for members themselves.
   */
  relatedOrgId: string;
  relatedOrgName: string;
  titleAtOrg: string;
  /**
   * The membership level of the firm that admitted this person — **a FILTER
   * KEY, not a display value.** Empty for members themselves and for anyone
   * admitted on their own account.
   *
   * It exists because staff carry no level of their own (0 of 1,738 in the live
   * export — a level belongs to the firm), so filtering by level with
   * "Individuals" selected returned nothing, which reads as a broken control
   * rather than as a fact about the data. With this, "Gold + Individuals"
   * returns the people who work at Gold member firms, which is what the
   * combination is asking.
   *
   * **Never render it as this person's level, and never copy it into
   * `membershipLevel`.** Doing either badges an employee as an ITA member,
   * which is the factual error `isMember` exists to prevent. `search.ts` reads
   * it; the card and the member page deliberately do not.
   */
  orgMembershipLevel: string;
  /**
   * The admitting firm's city and state — FILTER KEYS, like
   * `orgMembershipLevel`, set by `admit.ts` and "" for everyone else. They let
   * a State/City filter find staff who work for a firm there but live
   * elsewhere (`lib/directory/location.ts`). Never displayed as this person's
   * location; the card shows their own.
   */
  orgCity: string;
  orgState: string;
  website: string;
  city: string;
  state: string;
  zip: string;
  listingLevel: string;
  /**
   * The organization's public listing category
   * (`Listing_PrimaryListingCategory`). Shown on the member page for
   * ORGANIZATIONS only; no individual carries one (0 of 2,362 in the live
   * export). Set on 126 of the 196 published member organizations.
   *
   * **It RESTATES the membership level rather than adding to it**: 6 distinct
   * values, and in all 121 organizations carrying both, the level starts with
   * the category ("Consultants and Resellers" → "Consultants and Resellers
   * (CR)") — zero genuine differences. Shown because ITA asked for it, but it
   * is not new information, and `parse.check.ts` asserts the relationship
   * holds. If that check ever fails the field has gained its own meaning, and
   * whether to show both rows is worth revisiting.
   *
   * The sibling sub-category and description columns are deliberately NOT read
   * — see the note in `parse.ts`.
   */
  listingCategory: string;
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

/**
 * One person on a member organization's roster, resolved for display.
 *
 * A plain record rather than a `Member` reference because it crosses the
 * server→client boundary and only needs what the roster shows. `title` is the
 * person's role AT THIS ORG, from the relation — not their own job title.
 */
export type RosterEntry = {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  mainContact: boolean;
  billingContact: boolean;
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
    /** Normalized state codes ("OH", not "Ohio") — see location.ts. */
    state: string[];
    /** "City, ST" — a city always carries its state. */
    city: string[];
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
     * Why the RELATIONS tab couldn't be read, when one was configured. The
     * member list is unaffected — but a directory silently missing every
     * roster looks identical to one whose relations tab is empty, and that
     * ambiguity is what makes a misconfiguration expensive to find.
     */
    relationsError?: string;
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
      /** Individuals admitted via a current link to a member organization. */
      relatedIndividuals?: number;
    };
  };
  /**
   * Roster per member-organization id: its people, with titles and contact
   * flags. Empty when there's no relations tab, which is the members-only
   * behavior the app had before.
   */
  rosters: Record<string, RosterEntry[]>;
};
