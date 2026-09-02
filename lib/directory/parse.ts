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
  primaryCategory: ["Primary Category", "Category"],
  profileStatus: ["Profile Status", "Status"],
  // Not in the export as of the 17-column version — listed here so it starts
  // working the moment ITA adds it, with no code change. `headerIndex` already
  // ignores case and punctuation, so "Last Event Signed Up For" and
  // "last_event_signed_up_for" both resolve; the extras cover real renames.
  lastEvent: [
    "Last Event Signed Up for",
    "Last Event Signed Up",
    "Last Event Registered",
    "Last Event",
  ],
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
 * every other CRM export we've parsed grew a "Generated on …" trailer
 * eventually, and a trailer that becomes a member is the kind of bug nobody
 * reports — it just sits at the bottom of the list.
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
      category: resolveCategory(cell(row, idx.primaryCategory), cell(row, idx.profileStatus)),
      lastEvent: cell(row, idx.lastEvent),
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

/**
 * The Category dropdown reads `Primary Category`, falling back to
 * `Profile Status` when it's blank.
 *
 * This is not a guess. In the current export `Primary Category` is EMPTY for 76
 * of 203 members, `Profile Status` is filled for all 203, the two columns draw
 * on the same vocabulary, and they disagree on exactly ZERO rows where both are
 * present. Without the fallback, choosing "Technology Partner" would return 23
 * members instead of 57 — a directory quietly hiding a third of the people it
 * exists to list, with nothing on screen to suggest anything was missed.
 *
 * If the two columns ever DO diverge, `Primary Category` still wins wherever
 * it's set, so the fallback can only fill gaps, never override an answer.
 */
function resolveCategory(primaryCategory: string, profileStatus: string): string {
  return primaryCategory || profileStatus;
}

/**
 * The four fields the free-text box searches: Profile Name, Related
 * Organization, Main Profile Email, Report Name. Location, level and category
 * are deliberately excluded — see the note on `Member.haystack`.
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
    category: distinct((m) => m.category),
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
