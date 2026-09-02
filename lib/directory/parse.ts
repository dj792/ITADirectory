import { headerIndex, type SheetTab } from "@/lib/sheets-core";
import { normalize } from "./search";
import type { Directory, Member } from "./types";

/**
 * Turn a raw sheet grid into `Member` records.
 *
 * THE RULE (inherited from Aligned KPIs): every column is resolved by header
 * NAME, never by position. Each field lists several candidate headers, because
 * the ITA export has already shipped under more than one label ("State/Prov"
 * vs. "State") and a re-export must not blank a column.
 *
 * A missing column is not an error — it yields empty strings and the member
 * still lists. The only genuinely required column is a name; a row with no name
 * is a trailer or a spacer, not a member.
 */

/** Candidate header names per field, best first. */
const COLS = {
  id: ["ProfileID", "Profile ID", "ID"],
  reportName: ["Report Name", "Display Name"],
  profileName: ["Profile Name", "Name"],
  organization: ["Related Organization", "Organization", "Company"],
  mainEmail: ["Main Profile Email", "Primary Email"],
  altEmail: ["Email", "Email Address"],
  membershipLevel: ["Membership Level", "Member Level"],
  status: ["Profile Status", "Status"],
  category: ["Primary Category", "Category"],
  website: ["Website", "Web Site", "URL"],
  city: ["City"],
  state: ["State/Prov", "State", "State/Province", "Province"],
  zip: ["Zip/Postal Code", "Zip", "Postal Code"],
  listingLevel: ["Listing Level"],
} as const;

const cell = (row: string[], i: number): string =>
  i < 0 ? "" : (row[i] ?? "").toString().trim();

/**
 * Rows the export appends that are not members. The ITA CSV is clean today, but
 * every other QuickBooks/CRM export we've parsed grew a "Generated on …"
 * trailer eventually, and a trailer that becomes a member is the kind of bug
 * nobody reports — it just sits at the bottom of the list.
 */
function isTrailerRow(name: string): boolean {
  return /^(count|total|totals|average|averages|generated\b)/i.test(name);
}

export function parseDirectory(tab: SheetTab): Member[] {
  const { headers, rows } = tab;
  if (headers.length === 0) return [];

  const idx = Object.fromEntries(
    Object.entries(COLS).map(([field, candidates]) => [
      field,
      headerIndex(headers, ...candidates),
    ])
  ) as Record<keyof typeof COLS, number>;

  const seen = new Set<string>();
  const members: Member[] = [];

  for (const row of rows) {
    const reportName = cell(row, idx.reportName);
    const profileName = cell(row, idx.profileName);
    const name = reportName || profileName;
    if (!name || isTrailerRow(name)) continue;

    const id = cell(row, idx.id) || `row-${members.length + 1}`;
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
      status: cell(row, idx.status),
      category: cell(row, idx.category),
      website: cell(row, idx.website),
      city: cell(row, idx.city),
      state: cell(row, idx.state),
      zip: cell(row, idx.zip),
      listingLevel: cell(row, idx.listingLevel),
    };

    members.push({ ...member, haystack: buildHaystack(member) });
  }

  // Sort by the "Last, First" form so people file under their surname.
  members.sort((a, b) => a.sortName.localeCompare(b.sortName, "en", { sensitivity: "base" }));
  return members;
}

function buildHaystack(m: Omit<Member, "haystack">): string {
  return normalize(
    [
      m.name,
      m.sortName,
      m.organization,
      m.email,
      m.membershipLevel,
      m.status,
      m.category,
      m.website,
      m.city,
      m.state,
      m.zip,
    ].join(" ")
  );
}

/** Distinct, sorted, blank-free values of one field — for the filter dropdowns. */
export function facetsOf(members: Member[]): Directory["facets"] {
  const distinct = (pick: (m: Member) => string): string[] =>
    Array.from(new Set(members.map(pick).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );

  return {
    membershipLevel: distinct((m) => m.membershipLevel),
    status: distinct((m) => m.status),
    state: distinct((m) => m.state),
  };
}
