/**
 * City and State as SEARCH FILTERS — client-safe (runs in the browser with
 * `search.ts`; imports nothing server-only).
 *
 * Added 29 Sep 2026 at DJ's request. Note what this is NOT: city and state are
 * still NOT in the free-text index (`buildHaystack`) — typing "Atlanta" should
 * find a person, not every Atlanta member. They are dropdowns, which is the
 * form that can't be confused with a name search.
 *
 * ── THE DATA IS TYPED BY HAND IN THE CRM, SO IT IS NORMALIZED HERE ───────
 *
 * Measured on the live export (1,941 published): 57 distinct state values,
 * including "OH" and "Ohio", "NY" and "New York", "MI" and "mi"; 358 cities
 * with case variants ("Cleveland" / "CLEVELAND"). Filtering on the raw strings
 * would split Ohio in two. Display and matching both go through the functions
 * below; the stored value is never changed.
 *
 * ── A CITY ALWAYS CARRIES ITS STATE ───────────────────────────────────────
 *
 * The export has Springfield in MO and IL, Birmingham in AL and MI, Aurora in
 * IL and CO. A bare "Springfield" option would silently merge two places, so
 * the option — and the URL value — is "Springfield, MO".
 */

const US: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI",
  minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT",
  vermont: "VT", virginia: "VA", washington: "WA", "west virginia": "WV",
  wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
  // Canada — members in ON, AB, QC, BC, MB, NS today.
  alberta: "AB", "british columbia": "BC", manitoba: "MB",
  "new brunswick": "NB", "newfoundland and labrador": "NL",
  "nova scotia": "NS", ontario: "ON", "prince edward island": "PE",
  quebec: "QC", "québec": "QC", saskatchewan: "SK",
};

/**
 * One spelling per state: a full name becomes its postal code, a code is
 * upper-cased. Anything else ("Outside US/Canada") is kept as written, just
 * trimmed — shown honestly rather than guessed at.
 */
export function stateCode(raw: string): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const named = US[s.toLowerCase()];
  if (named) return named;
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return s;
}

/**
 * "CLEVELAND" and "cleveland" read as "Cleveland". Only an ALL-caps or
 * all-lower value is re-cased; mixed case is left alone, because it was typed
 * deliberately ("McLean", "DeKalb") and title-casing would break it.
 */
export function cityName(raw: string): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-.'/])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

/** The city option / URL value: "Chicago, IL". "" when there is no city. */
export function cityLabel(city: string, state: string): string {
  const c = cityName(city);
  if (!c) return "";
  const st = stateCode(state);
  return st ? `${c}, ${st}` : c;
}

/** The state a city option belongs to — the part after the last ", ". */
export function stateOfCity(label: string): string {
  const i = label.lastIndexOf(", ");
  return i >= 0 ? label.slice(i + 2) : "";
}

type Located = { city: string; state: string; orgCity: string; orgState: string };

/**
 * Does this record answer a State filter?
 *
 * SAME RULE AS MEMBERSHIP LEVEL (DJ, 29 Sep: "same results behavior showing
 * related-to-a-member profiles"): a person admitted through a member firm
 * matches on their OWN location OR their FIRM's. 517 of 1,738 staff live in a
 * different state from their firm — mostly remote staff — and 52 have no
 * state of their own at all; without the firm's location, "Ohio" would miss
 * people who work for an Ohio member. Members and organizations have no firm
 * location, so they match on their own.
 *
 * OR within the field (Ohio or Michigan), like levels. A blank never matches.
 */
export function matchesStates(m: Located, states: string[]): boolean {
  if (states.length === 0) return true;
  const own = stateCode(m.state);
  const firm = stateCode(m.orgState);
  return (!!own && states.includes(own)) || (!!firm && states.includes(firm));
}

export function matchesCities(m: Located, cities: string[]): boolean {
  if (cities.length === 0) return true;
  const own = cityLabel(m.city, m.state);
  const firm = cityLabel(m.orgCity, m.orgState);
  return (!!own && cities.includes(own)) || (!!firm && cities.includes(firm));
}

/**
 * The dropdown options, built from everyone's OWN location. (A firm's location
 * is its own record's location, so it's already in the set.) States sort by
 * their code; cities by name, then state.
 */
export function locationFacets(members: { city: string; state: string }[]): {
  state: string[];
  city: string[];
} {
  const states = new Set<string>();
  const cities = new Set<string>();
  for (const m of members) {
    const st = stateCode(m.state);
    if (st) states.add(st);
    const c = cityLabel(m.city, m.state);
    if (c) cities.add(c);
  }
  const byText = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base" });
  return { state: [...states].sort(byText), city: [...cities].sort(byText) };
}

/**
 * With states chosen, the City list shows only cities in those states — 358
 * cities is a lot to scroll, and a city outside the chosen states can only
 * ever return nothing.
 */
export function citiesFor(allCities: string[], states: string[]): string[] {
  if (states.length === 0) return allCities;
  return allCities.filter((c) => states.includes(stateOfCity(c)));
}

/**
 * When the state selection changes, drop any chosen city that is no longer in
 * the list. Otherwise it stays selected but invisible, ANDs against the new
 * states, and empties the results with nothing on screen to explain why.
 */
export function pruneCities(cities: string[], states: string[]): string[] {
  if (states.length === 0) return cities;
  return cities.filter((c) => states.includes(stateOfCity(c)));
}
