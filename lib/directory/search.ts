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

export type Filters = {
  /** Free text, matched against name / organization / email only. */
  q: string;
  membershipLevel: string;
  category: string;
  lastEvent: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  membershipLevel: "",
  category: "",
  lastEvent: "",
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
 * The text box and both dropdowns combine with AND: each one narrows what the
 * others left. A blank dropdown is "all", not a filter on the empty string.
 */
export function applyFilters(members: Member[], f: Filters): Member[] {
  return members.filter(
    (m) =>
      (!f.membershipLevel || m.membershipLevel === f.membershipLevel) &&
      (!f.category || m.category === f.category) &&
      (!f.lastEvent || m.lastEvent === f.lastEvent) &&
      matchesQuery(m, f.q)
  );
}
