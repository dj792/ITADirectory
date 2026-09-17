import type { Member } from "./types";

/**
 * Query matching — CLIENT-SAFE. This module must never import `lib/sheets-core`
 * (Node `crypto`) or anything server-only, because the search box runs in the
 * browser and filters an already-loaded list. Keeping the matcher here rather
 * than in `parse.ts` is what makes that possible.
 */

/**
 * Lowercase, strip accents, and collapse punctuation to spaces — so "O'Brien",
 * "OBrien" and "o brien" all match each other. `@` and `.` survive so an email
 * still reads as one token.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@.]+/g, " ")
    .trim();
}

/**
 * Organisations, individuals, or both. `""` IS "both" and is the default —
 * a named default rather than a third enum value, so every place that asks
 * "is this filter set?" gets the right answer without special-casing.
 */
export type ProfileKind = "" | "org" | "individual";

export type Filters = {
  /** Free text, matched against name / organization / email only. */
  q: string;
  /**
   * Membership levels, MULTI-SELECT. Empty = no restriction.
   *
   * Within this field the values are OR-ed — "Gold or Platinum" — because
   * choosing two levels can only mean "either of these"; AND-ing them would
   * always return nothing, since a member holds exactly one level. Across
   * fields everything still ANDs. That is the standard faceted-search rule, and
   * getting it backwards produces a filter that silently empties the page.
   */
  membershipLevels: string[];
  status: string;
  lastEvent: string;
  /** "" = both (default) · "org" · "individual" */
  kind: ProfileKind;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  membershipLevels: [],
  status: "",
  lastEvent: "",
  kind: "",
};

/**
 * Every whitespace-separated term must appear somewhere in the record (AND, not
 * OR). "smith martus" should find Smith at Martus, not everyone named Smith
 * plus everyone at Martus — with 200 members an OR search returns most of the
 * list and reads as broken.
 */
export function matchesQuery(member: Member, query: string): boolean {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((t) => member.haystack.includes(t));
}

/**
 * How many characters the free-text box needs before it searches.
 *
 * One or two letters match most of the membership, so results at that point are
 * noise that happens to arrive fast — and on a directory of real people, a
 * wall of everyone is also the least private default. Three is the usual floor:
 * enough to be a real prefix, short enough for "Amy" or "IBM".
 */
export const MIN_QUERY_LENGTH = 3;

/**
 * Has the reader actually asked for something?
 *
 * The directory shows NOTHING until this is true — no results, not even a
 * truncated list. It is a lookup tool, not a browsable roster: someone opening
 * the page should be prompted to search rather than handed 203 members' names
 * and email addresses they didn't ask for.
 *
 * Any dropdown alone counts, because picking "Technology Partner" is a complete
 * request on its own. Raw length is used rather than the normalized form so
 * "3 characters" means what the person typed, not what survived normalizing.
 *
 * `kind` IS DELIBERATELY EXCLUDED. Organisations / Individuals / Both is a
 * REFINEMENT, not a request: "Organisations" on its own is three quarters of
 * the membership, which is the wall-of-everyone this gate exists to prevent —
 * and it would arrive without anyone having typed a thing. It narrows a search
 * someone has already made. Selecting it while idle leaves the prompt up, and
 * the prompt says so.
 */
export function hasActiveSearch(f: Filters): boolean {
  return (
    f.q.trim().length >= MIN_QUERY_LENGTH ||
    f.membershipLevels.length > 0 ||
    !!f.status ||
    !!f.lastEvent
  );
}

/**
 * The text box and the dropdowns combine with AND: each one narrows what the
 * others left. A blank dropdown is "all", not a filter on the empty string.
 *
 * This is the pure matcher and deliberately does NOT know about
 * `hasActiveSearch` — callers gate on that first, because "nothing searched
 * yet" and "searched, no matches" need different words on screen and are the
 * same empty array here.
 */
export function applyFilters(members: Member[], f: Filters): Member[] {
  return members.filter(
    (m) =>
      // OR within the field, AND across fields — see `Filters.membershipLevels`.
      (f.membershipLevels.length === 0 ||
        f.membershipLevels.includes(m.membershipLevel)) &&
      (!f.status || m.status === f.status) &&
      (!f.lastEvent || m.lastEvent === f.lastEvent) &&
      (!f.kind || (f.kind === "org") === m.isOrganization) &&
      matchesQuery(m, f.q)
  );
}
