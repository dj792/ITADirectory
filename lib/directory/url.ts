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
  membershipLevel: "level",
  status: "status",
  lastEvent: "event",
  kind: "type",
};

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
    membershipLevel: read(params, PARAM.membershipLevel),
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
    // `?? ""` rather than trusting the type: this walks keys reflectively, so a
    // Filters object built somewhere that predates a new field arrives with it
    // undefined and `.trim()` throws. Types don't protect a reflective loop —
    // and this one threw for real the first time `kind` was added.
    const value = (f[key] ?? "").trim();
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
