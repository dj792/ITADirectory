import { EMPTY_FILTERS, type Filters } from "./search";

/**
 * The search, expressed as a URL — CLIENT-SAFE (imports nothing server-only).
 *
 * Why the URL holds the search at all: without it a member can find someone and
 * has no way to send that result to a colleague, and the Back button leaves the
 * directory instead of undoing a filter. It is also what lets a member page
 * offer a real "back to results" — the detail page carries the same params and
 * rebuilds the link from them, rather than guessing or relying on history.
 *
 * Short param names because these get pasted into emails: `?q=martus&level=…`.
 * They are part of the app's public surface now — renaming one breaks links
 * people have already sent, so treat them like a schema, not an implementation
 * detail.
 */

/** Filters ⇄ query params. One map, so the two directions can't drift. */
const PARAM: Record<keyof Filters, string> = {
  q: "q",
  membershipLevels: "level",
  status: "status",
  lastEvent: "event",
  kind: "type",
};

/** The params that may appear more than once. Everything else is single-valued. */
const MULTI = new Set<keyof Filters>(["membershipLevels"]);

/** Anything a Next.js page hands to a component as its search params. */
export type ParamInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function read(params: ParamInput, key: string): string {
  if (params instanceof URLSearchParams) return params.get(key) ?? "";
  const v = params[key];
  // A repeated param ("?q=a&q=b") arrives as an array. Take the first rather
  // than joining — a hand-edited URL shouldn't produce a search for "a,b".
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/**
 * All values of a repeatable param: `?level=A&level=B`.
 *
 * REPEATED PARAMS, not a comma-separated list. Membership levels are free text
 * from the CRM — "Consultants and Resellers (CR)" today, and nothing stops one
 * containing a comma tomorrow. A delimiter that can appear inside a value is a
 * parser that breaks on real data; repetition has no such collision.
 */
function readAll(params: ParamInput, key: string): string[] {
  const raw =
    params instanceof URLSearchParams
      ? params.getAll(key)
      : Array.isArray(params[key])
        ? (params[key] as string[])
        : params[key]
          ? [params[key] as string]
          : [];
  // Trim, drop blanks, de-duplicate — a hand-edited URL shouldn't be able to
  // make the same level count twice or add an empty option.
  return Array.from(new Set(raw.map((v) => v.trim()).filter(Boolean)));
}

/**
 * Build filters from a URL. Every value is treated as free text: a `level` that
 * matches no member simply finds nothing, which is the honest outcome for a
 * mistyped or stale link. Deliberately NOT validated against the current facets
 * — an event that has since been removed from the sheet should return no
 * results, not silently widen to everything.
 */
export function filtersFromParams(params: ParamInput): Filters {
  const kind = read(params, PARAM.kind);
  return {
    q: read(params, PARAM.q).trim(),
    membershipLevels: readAll(params, PARAM.membershipLevels),
    status: read(params, PARAM.status),
    lastEvent: read(params, PARAM.lastEvent),
    // A closed set, so an unrecognised value falls back to "both" rather than
    // filtering on a string no member can match and showing an empty page.
    kind: kind === "org" || kind === "individual" ? kind : "",
  };
}

/**
 * The query string for a set of filters — empty values omitted, so an idle page
 * has a clean `/` rather than `/?q=&level=&status=&event=`.
 *
 * Returns WITHOUT the leading "?" so callers can decide; `searchHref` below is
 * the one that adds it.
 */
export function filtersToQueryString(f: Filters): string {
  const params = new URLSearchParams();
  (Object.keys(PARAM) as (keyof Filters)[]).forEach((key) => {
    if (MULTI.has(key)) {
      // `append`, so several values become several params. Sorted, so the same
      // selection always produces the same URL — two people picking the same
      // two levels in a different order should be able to compare links.
      const values = (f[key] as string[] | undefined) ?? [];
      [...values].sort().forEach((v) => {
        if (v.trim()) params.append(PARAM[key], v.trim());
      });
      return;
    }
    // `?? ""` rather than trusting the type: this walks keys reflectively, so a
    // Filters object built somewhere that predates a new field arrives with it
    // undefined and `.trim()` throws. Types don't protect a reflective loop —
    // and this one threw for real the first time `kind` was added.
    const value = ((f[key] as string | undefined) ?? "").trim();
    if (value) params.set(PARAM[key], value);
  });
  return params.toString();
}

/** A link to the results page for these filters — "/" when nothing is set. */
export function searchHref(f: Filters): string {
  const qs = filtersToQueryString(f);
  return qs ? `/?${qs}` : "/";
}

/**
 * A link to one member, carrying the current search so the detail page can
 * offer a working "back to results". Passing it in the URL rather than reading
 * `document.referrer` means the back link survives a reload, a bookmark, and
 * arriving from someone else's pasted link.
 */
export function memberHref(id: string, f: Filters = EMPTY_FILTERS): string {
  const qs = filtersToQueryString(f);
  return `/member/${encodeURIComponent(id)}${qs ? `?${qs}` : ""}`;
}
