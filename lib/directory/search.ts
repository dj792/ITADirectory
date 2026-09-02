import type { Member } from "./types";

/**
 * Query matching — CLIENT-SAFE. This module must never import `lib/sheets-core`
 * (Node `crypto`) or anything server-only, because the search box runs in the
 * browser and filters an already-loaded list. Keeping the matcher here rather
 * than in `parse.ts` is what makes that possible.
 */

/**
 * Lowercase, strip accents, and collapse punctuation to spaces — so "O'Brien",
 * "OBrien" and "o brien" all match each other, and "st. louis" finds "St Louis".
 * `@` and `.` survive so an email still reads as one token.
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
  q: string;
  membershipLevel: string;
  status: string;
  state: string;
};

export const EMPTY_FILTERS: Filters = {
  q: "",
  membershipLevel: "",
  status: "",
  state: "",
};

/**
 * Every whitespace-separated term must appear somewhere in the record (AND, not
 * OR). "smith austin" should find Smith in Austin, not everyone named Smith
 * plus everyone in Austin — with 200 members an OR search returns most of the
 * list and reads as broken.
 */
export function matchesQuery(member: Member, query: string): boolean {
  const terms = normalize(query).split(" ").filter(Boolean);
  if (terms.length === 0) return true;
  return terms.every((t) => member.haystack.includes(t));
}

/** Apply the free-text query and every set dropdown. Blank dropdown = no filter. */
export function applyFilters(members: Member[], f: Filters): Member[] {
  return members.filter(
    (m) =>
      (!f.membershipLevel || m.membershipLevel === f.membershipLevel) &&
      (!f.status || m.status === f.status) &&
      (!f.state || m.state === f.state) &&
      matchesQuery(m, f.q)
  );
}
