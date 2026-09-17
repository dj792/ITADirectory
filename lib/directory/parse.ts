import { headerIndex, toBool, type SheetTab } from "@/lib/sheets-core";
import { normalize } from "./search";
import type { Directory, Member } from "./types";

/**
 * Turn a raw sheet grid into `Member` records.
 *
 * THE RULE (inherited from Aligned KPIs): every column is resolved by header
 * NAME, never by position. A missing column is not an error — it yields empty
 * strings and the member still lists. The only genuinely required column is a
 * name; a row with no name is a trailer or a spacer, not a member.
 *
 * ── TWO EXPORT SHAPES, ONE PARSER ───────────────────────────────────────────
 *
 * The app reads BOTH the association's report export (`ProfileSelectorData`,
 * ~20 friendly headers, pre-filtered to members) and the SQL view
 * (`ProfileView`, 172 raw `Profile_*` columns, the WHOLE contact database).
 * ProfileView is primary; the older shape is still read because nothing is
 * gained by breaking it and a reader may hold either file.
 *
 * That is done with CANDIDATE HEADER NAMES, not two parsers. A second
 * `parseDirectory` is how two sources come to disagree about who a member is
 * for a reason nobody can see — the same argument the Aligned KPIs footprint
 * job makes for its format modules ("a format declares DATA, never its own
 * engine").
 *
 * Every mapping below was verified against the two real exports row by row
 * across the 203 members they share, not inferred from column names. Where they
 * disagreed, the cause was a real change between export dates (a member dropped,
 * two companies moved offices, one changed main contact) — which is the mapping
 * proving itself rather than a mismatch.
 */

/**
 * Candidate header names per field, best first.
 *
 * ORDER IS LOAD-BEARING where the two shapes disagree about meaning:
 *  · `email` prefers the MAIN CONTACT's address (`Main Profile Email` /
 *    `MC_Email`, which agreed on 202 of 203) over the org's own
 *    `Profile_Email`, which is sparse and often a shared alias
 *    ("alliances@…"). Those two are DIFFERENT facts, so they stay in
 *    different fields rather than one list.
 *  · `sortName` takes `Profile_ASF` — the source's own alpha-sort field, which
 *    reproduced the old `Profile Name` ("Macdonald, Taylor") on all 203.
 */
const COLS = {
  id: ["ProfileID", "Profile ID", "Profile_ProfileId", "ID"],
  reportName: ["Report Name", "Profile_ReportName", "Display Name"],
  profileName: ["Profile Name", "Profile_ASF", "Name"],
  organization: ["Related Organization", "Profile_OrgName", "Organization", "Company"],
  mainEmail: ["Main Profile Email", "MC_Email", "Primary Email"],
  altEmail: ["Email", "Profile_Email", "Email Address"],
  membershipLevel: ["Membership Level", "MembershipLevel_Name", "Member Level"],
  // `Primary Category` is intentionally absent — it's a sparser copy of
  // Profile Status. See the note on `Member.status`.
  profileStatus: ["Profile Status", "Profile_CustStatus", "Status"],
  memberSince: [
    "Member Since",
    "Member_MemberSince",
    "Membership Start Date",
    "Member Since Date",
    "Date Joined",
    "Join Date",
  ],
  /**
   * Who counts as a member.
   *
   * The report export arrives PRE-FILTERED — every row is a member, so this
   * column reads True throughout and filtering changes nothing. ProfileView is
   * the entire contact database: 2,929 rows, of which 202 are members and the
   * rest are prospects, alumni and former members. Reading it unfiltered would
   * publish 2,700 people who never asked to be in a member directory.
   *
   * Verified: `Profile_Member = True` reproduces the report export's member
   * list exactly, minus one company that genuinely dropped between the two
   * export dates.
   */
  memberFlag: ["Member", "Profile_Member", "Is Member"],
  /** True ⇒ the profile is an organisation, not a person. */
  orgFlag: ["Org Indicator", "Profile_OrgInd", "Organization Indicator", "OrgInd"],
  website: ["Website", "Profile_Website", "Web Site", "URL"],
  city: ["City", "Profile_City"],
  state: ["State/Prov", "Profile_State", "State", "State/Province", "Province"],
  zip: ["Zip/Postal Code", "Profile_Zip", "Zip", "Postal Code"],
  phone: ["Profile_WorkPhone", "Work Phone", "Phone"],
  address1: ["Profile_Address1", "Address1", "Address"],
  address2: ["Profile_Address2", "Address2"],
  /**
   * The main contact — the person to actually call at a member ORGANISATION.
   * Their EMAIL is already `email` above (the two sources agree it's the
   * directory address), so this is name, relationship title and phone only;
   * repeating the address here would print it twice on the page.
   */
  contactName: ["MC_ReportName", "Main Contact"],
  contactTitle: ["MC_RelationTitle", "MC_PersonalTitle", "Main Contact Title"],
  contactPhone: ["MC_WorkPhone", "Main Contact Phone"],
  /**
   * ── NOT IN PROFILEVIEW — "coming soon" ────────────────────────────────────
   * These four came from the report export and have no equivalent in the SQL
   * view. They stay listed so they light up by themselves the day the data
   * arrives, and the UI shows them as pending rather than silently dropping a
   * filter the page used to have. `lib/directory/pending.ts` holds that state.
   *
   * "Last Event Attended" must NEVER be a candidate for `lastEvent`: signing
   * up and turning up are different facts, and substituting one for the other
   * is the kind of error nobody spots.
   */
  lastEvent: [
    "Last Event Signed Up for",
    "Last Event Signed Up",
    "Last Event Registered",
    "Last Event",
  ],
  lastEventAttended: ["Last Event Attended"],
  eventCount12mo: ["Event Count Past 12 Months", "Event Count Past 12 Mo"],
  listingLevel: ["Listing Level", "Listing_Level"],
} as const;

const cell = (row: string[], i: number): string =>
  i < 0 ? "" : (row[i] ?? "").toString().trim();

/**
 * Rows the export appends that are not members. The ITA CSV is clean today, but
 * every other CRM export we've parsed grew a "Generated on …" trailer
 * eventually, and a trailer that becomes a member is the kind of bug nobody
 * reports — it just sits at the bottom of the list.
 */
function isTrailerRow(name: string): boolean {
  return /^(count|total|totals|average|averages|generated\b)/i.test(name);
}

/**
 * Does this row belong in a MEMBER directory?
 *
 * ProfileView is the whole contact database, so this is the single most
 * consequential line in the parser: get it wrong and the app publishes 2,700
 * prospects, alumni and former members who never agreed to be listed.
 *
 * The rule: when the flag column is PRESENT it is enforced; when it is ABSENT
 * every row is kept. Absent means the report export, which the association
 * filtered before sending. Enforcing a column that isn't there would empty the
 * directory; ignoring one that is there would flood it.
 *
 * `toBool` accepts True/Yes/1/x, so a re-export that switches to 1/0 keeps
 * working. A row whose flag is present but blank is NOT a member — an unset
 * flag in a full database dump is a contact nobody has marked, not a member.
 */
function isMemberRow(row: string[], flagIdx: number): boolean {
  if (flagIdx < 0) return true;
  return toBool(cell(row, flagIdx));
}

/**
 * What the parse did, so the page can say it. Modelled on the Aligned KPIs
 * `CountBasisNote`: the strongest claim on the screen is how many members there
 * are, and a filter that silently changed that number should be visible in the
 * number's own caption rather than only in this file.
 */
export type ParseBasis = {
  /** Rows in the sheet, excluding the header. */
  rowsRead: number;
  /** Rows dropped because the member flag said they aren't one. */
  nonMembersSkipped: number;
  /** The header the member flag actually matched, or null when absent. */
  memberFlagColumn: string | null;
};

/** The directory set: members only. What every existing caller expects. */
export function parseDirectory(tab: SheetTab): Member[] {
  return parseDirectoryWithBasis(tab).members;
}

export function parseDirectoryWithBasis(tab: SheetTab): {
  members: Member[];
  basis: ParseBasis;
} {
  const { profiles, basis } = parseProfiles(tab);
  return { members: profiles.filter((p) => p.isMember), basis };
}

/**
 * EVERY row, member or not, with `isMember` set from the flag.
 *
 * Parsing and admission are separate steps now. They used to be one — the
 * member filter `continue`d mid-loop — which was fine while the directory was
 * members only. It stopped being fine once related individuals could be
 * admitted: the relations join needs to look up a person who is NOT a member,
 * and a parser that had already discarded them couldn't answer.
 *
 * Nothing is published from here. `lib/directory/admit.ts` decides who is in
 * the directory, and it is the only thing that should.
 */
export function parseProfiles(tab: SheetTab): {
  profiles: Member[];
  basis: ParseBasis;
} {
  const { headers, rows } = tab;
  const emptyBasis: ParseBasis = {
    rowsRead: rows.length,
    nonMembersSkipped: 0,
    memberFlagColumn: null,
  };
  if (headers.length === 0) return { profiles: [], basis: emptyBasis };

  const idx = Object.fromEntries(
    Object.entries(COLS).map(([field, candidates]) => [
      field,
      headerIndex(headers, ...candidates),
    ])
  ) as Record<keyof typeof COLS, number>;

  const seen = new Set<string>();
  const profiles: Member[] = [];
  let nonMembersSkipped = 0;

  for (const row of rows) {
    const reportName = cell(row, idx.reportName);
    const profileName = cell(row, idx.profileName);
    const name = reportName || profileName;
    if (!name || isTrailerRow(name)) continue;

    const isMember = isMemberRow(row, idx.memberFlag);
    if (!isMember) nonMembersSkipped++;

    const id = cell(row, idx.id) || `row-${profiles.length + 1}`;
    // A re-export that overlaps the previous one would otherwise list someone
    // twice; ProfileID is the source system's own key, so trust it.
    if (seen.has(id)) continue;
    seen.add(id);

    const member: Omit<Member, "haystack"> = {
      id,
      name,
      sortName: profileName || reportName,
      organization: cell(row, idx.organization),
      // Main Profile Email is filled for ~95% of records; `Email` covers the rest.
      email: cell(row, idx.mainEmail) || cell(row, idx.altEmail),
      membershipLevel: cell(row, idx.membershipLevel),
      status: cell(row, idx.profileStatus),
      memberSince: cell(row, idx.memberSince),
      lastEvent: cell(row, idx.lastEvent),
      lastEventAttended: cell(row, idx.lastEventAttended),
      eventCount12mo: cell(row, idx.eventCount12mo),
      website: cell(row, idx.website),
      city: cell(row, idx.city),
      state: cell(row, idx.state),
      zip: cell(row, idx.zip),
      phone: cell(row, idx.phone),
      address1: cell(row, idx.address1),
      address2: cell(row, idx.address2),
      contactName: cell(row, idx.contactName),
      contactTitle: cell(row, idx.contactTitle),
      contactPhone: cell(row, idx.contactPhone),
      isOrganization: toBool(cell(row, idx.orgFlag)),
      isMember,
      // Filled by the relations join, which runs after parsing — see admit.ts.
      relatedOrgId: "",
      relatedOrgName: "",
      titleAtOrg: "",
      listingLevel: cell(row, idx.listingLevel),
    };

    profiles.push({ ...member, haystack: buildHaystack(member) });
  }

  // Sort by the "Last, First" form so people file under their surname.
  profiles.sort((a, b) => a.sortName.localeCompare(b.sortName, "en", { sensitivity: "base" }));

  return {
    profiles,
    basis: {
      rowsRead: rows.length,
      nonMembersSkipped,
      memberFlagColumn:
        idx.memberFlag >= 0 ? headers[idx.memberFlag] : null,
    },
  };
}

/**
 * The four fields the free-text box searches: Profile Name, Related
 * Organization, Main Profile Email, Report Name. Location, level and status are
 * deliberately excluded — see the note on `Member.haystack`.
 */
function buildHaystack(m: Omit<Member, "haystack">): string {
  return normalize([m.name, m.sortName, m.organization, m.email].join(" "));
}

/** Distinct, sorted, blank-free values of one field — for the dropdowns. */
export function facetsOf(members: Member[]): Directory["facets"] {
  const distinct = (pick: (m: Member) => string): string[] =>
    Array.from(new Set(members.map(pick).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );

  return {
    membershipLevel: distinct((m) => m.membershipLevel),
    status: distinct((m) => m.status),
    // Events sort by DATE, newest first — see `byEventRecency`. Empty while the
    // column is absent, and the UI then hides the dropdown entirely.
    lastEvent: Array.from(new Set(members.map((m) => m.lastEvent).filter(Boolean))).sort(
      byEventRecency
    ),
  };
}

/**
 * Order event names newest-first rather than alphabetically.
 *
 * Alphabetical is actively wrong here. The real values are "ITA Spring 2026
 * Collaborative", "ITA Fall 2025 Collaborative", "ITA Spring 2025
 * Collaborative", "ITA Fall 2024 Collaborative", "ITL 2026 Summer Meeting",
 * "2026-27 ITA's Leadership Alliance (ILA) Program" — sorted as text that gives
 * Fall 2024, Fall 2025, Spring 2025, Spring 2026, which interleaves years and
 * seasons into nonsense. Nobody scans an event list alphabetically; they look
 * for the most recent one, and it should be at the top.
 *
 * So: pull the year and the season out of the label and sort on those. Labels
 * with no year fall to the bottom in alphabetical order — unknown, not wrong.
 * This is presentation only; the stored value is always the sheet's exact text,
 * so filtering still matches by equality.
 */
const SEASONS: [RegExp, number][] = [
  [/\bspring\b/i, 1],
  [/\bsummer\b/i, 2],
  [/\bfall\b|\bautumn\b/i, 3],
  [/\bwinter\b/i, 4],
];

function eventSortKey(label: string): { year: number; season: number } {
  // First 4-digit year in the label. "2026-27 …" yields 2026, which is right:
  // a program spanning two years belongs with the year it starts.
  const year = Number(label.match(/\b(19|20)\d{2}\b/)?.[0] ?? 0);
  const season = SEASONS.find(([re]) => re.test(label))?.[1] ?? 0;
  return { year, season };
}

export function byEventRecency(a: string, b: string): number {
  const ka = eventSortKey(a);
  const kb = eventSortKey(b);
  // No year at all sinks to the bottom, whatever it's called.
  if (!ka.year && !kb.year) return a.localeCompare(b, "en", { sensitivity: "base" });
  if (!ka.year) return 1;
  if (!kb.year) return -1;
  if (ka.year !== kb.year) return kb.year - ka.year; // newest year first
  if (ka.season !== kb.season) return kb.season - ka.season; // latest season first
  return a.localeCompare(b, "en", { sensitivity: "base" });
}
