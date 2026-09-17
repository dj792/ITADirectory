/**
 * Fixture check — runs the REAL ProfileSelectorData export through the CSV
 * reader, the parser and the search matcher under bare Node:
 *
 *   npm run check
 *
 * No test framework on purpose (same convention as the Aligned KPIs app's
 * *.check.ts files) — this must stay runnable with nothing installed.
 * Excluded from tsconfig, and it reads the gitignored fixture, so it simply
 * skips when the fixture isn't present.
 */
import fs from "fs";
import path from "path";
import {
  parseDirectory,
  parseDirectoryWithBasis,
  facetsOf,
  byEventRecency,
  ALWAYS_MEMBER_IDS,
} from "./parse";
import {
  applyFilters,
  hasActiveSearch,
  EMPTY_FILTERS,
  MIN_QUERY_LENGTH,
  normalize,
  type Filters,
} from "./search";
import { parseCsv } from "./csv";
import { monthYearLabel, parseYearMonth } from "./date";
import { filtersFromParams, filtersToQueryString, memberHref, searchHref } from "./url";
import { eventFilterPending, isPending } from "./pending";
import { csvField, resultsToCsv, EXPORT_DISCLAIMER } from "./export";

/**
 * Fixtures, primary first. The assertions below run against whichever is
 * present, so the same suite covers the SQL view and the older report export —
 * which is the point of one parser with candidate header names rather than two
 * parsers.
 */
const PROFILE_VIEW = path.join(process.cwd(), "data", "ProfileView.csv");
const REPORT_EXPORT = path.join(process.cwd(), "data", "ProfileSelectorData.csv");
const FIXTURE = [PROFILE_VIEW, REPORT_EXPORT].find((p) => fs.existsSync(p)) ?? "";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

if (!FIXTURE) {
  console.log("fixture not present — skipping (this is fine on a clean checkout)");
  process.exit(0);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
const grid = parseCsv(raw);
const { members, basis } = parseDirectoryWithBasis(grid);
console.log(`source: ${path.basename(FIXTURE)}`);
const facets = facetsOf(members);

const isProfileView = grid.headers.includes("Profile_ProfileId");
console.log(
  `\n${grid.rows.length} rows · ${grid.headers.length} columns → ${members.length} members\n`
);

/*
 * ── WHO COUNTS AS A MEMBER ───────────────────────────────────────────────
 * The single most consequential rule in the parser. ProfileView is the whole
 * contact database, so reading it unfiltered would publish ~2,700 prospects,
 * alumni and former members. The report export arrives pre-filtered, where the
 * flag reads True throughout and the filter is a no-op.
 *
 * Both directions are asserted, so neither source can drift into the other's
 * behavior unnoticed.
 */
if (isProfileView) {
  check("the member flag was found and applied",
    basis.memberFlagColumn === "Profile_Member" && basis.nonMembersSkipped > 0,
    `column=${basis.memberFlagColumn} skipped=${basis.nonMembersSkipped}`);
  check("the full contact database is NOT published",
    members.length < grid.rows.length / 5,
    `${members.length} members out of ${grid.rows.length} contacts`);
  check("the member count is the expected order of magnitude",
    members.length > 150 && members.length < 400, `${members.length}`);
  check("no former member slipped through",
    members.every((m) => !/^former member|^prospect\b/i.test(m.status)),
    members.filter((m) => /^former member|^prospect\b/i.test(m.status))
      .slice(0, 3).map((m) => `${m.name}: ${m.status}`).join(" · "));
} else {
  check("a pre-filtered export loses no rows",
    members.length === grid.rows.length, `${members.length} of ${grid.rows.length}`);
}

check("every member has a name", members.every((m) => m.name.length > 0));
check("ids are unique", new Set(members.map((m) => m.id)).size === members.length);
check("most members have an email",
  members.filter((m) => m.email).length / members.length > 0.9);

// A quoted field containing a comma ("Macdonald, Taylor") is the one thing a
// naive CSV split gets wrong, and it would silently shift every later column.
const taylor = members.find((m) => m.id === "629");
check('quoted comma field parsed ("Macdonald, Taylor")',
  !!taylor && taylor.sortName === "Macdonald, Taylor" && taylor.city === "Atlanta",
  taylor ? `${taylor.sortName} / ${taylor.city}` : "not found");

// --- Free-text scope is the four named fields, and ONLY those ---------------
// The box searches Profile Name, Related Organization, Main Profile Email and
// Report Name. If city or level leaked into the haystack, these two would fail.
const cityHit = applyFilters(members, { ...EMPTY_FILTERS, q: "atlanta" });
check("city is NOT searchable as free text",
  cityHit.every((m) => m.haystack.includes("atlanta")),
  `${cityHit.length} hits, all via name/org/email`);
check("membership level is NOT searchable as free text",
  applyFilters(members, { ...EMPTY_FILTERS, q: "platinum" }).length === 0);

const byOrg = applyFilters(members, { ...EMPTY_FILTERS, q: "martus" });
check("organization is searchable", byOrg.length > 0, `${byOrg.length} found`);
const byName = applyFilters(members, { ...EMPTY_FILTERS, q: "macdonald" });
check("name is searchable", byName.length > 0, `${byName.length} found`);
const byEmail = applyFilters(members, { ...EMPTY_FILTERS, q: "martussolutions.com" });
check("email is searchable", byEmail.length > 0, `${byEmail.length} found`);

// Multi-term must be AND, not OR.
const twoTerm = applyFilters(members, { ...EMPTY_FILTERS, q: "macdonald martus" });
check("multi-term search is AND, not OR",
  twoTerm.length > 0 && twoTerm.length <= byName.length,
  `${twoTerm.length} vs ${byName.length}`);

check("punctuation is ignored in search", normalize("O'Brien, St. Louis") === "o brien st. louis",
  normalize("O'Brien, St. Louis"));

// --- Dropdowns -------------------------------------------------------------
check("membership levels found", facets.membershipLevel.length >= 5,
  `${facets.membershipLevel.length}`);
check("no blank dropdown values",
  [...facets.membershipLevel, ...facets.status].every(Boolean));

/*
 * `Primary Category` is NOT read — Profile Status carries the same vocabulary
 * and is complete, while Primary Category is blank on 76 of 203 rows. This
 * asserts the column is still the sparse one, i.e. that ignoring it is still
 * the right call: if ITA ever fills it in, this fails and the decision is worth
 * revisiting rather than being invisibly inherited.
 */
if (grid.headers.includes("Primary Category")) {
  const csvBlankCategory = countBlankPrimaryCategory(raw);
  check("Primary Category is still the sparse column we're right to ignore",
    csvBlankCategory > 50,
    `${csvBlankCategory} of ${grid.rows.length} blank`);
} else {
  console.log("  ·    (no 'Primary Category' column in this export — check skipped)");
}

// --- The dropdowns AND with each other and with the text box ----------------
const techPartners = applyFilters(members, { ...EMPTY_FILTERS, status: "Technology Partner" });
const level = "Technology Partner - Gold";
const byLevel = applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [level] });
check("level filter narrows the list",
  byLevel.length > 0 && byLevel.length < members.length, `${level}: ${byLevel.length}`);

const combined = applyFilters(members, {
  ...EMPTY_FILTERS,
  membershipLevels: [level],
  status: "Technology Partner",
});
check("level AND status narrows further, never wider",
  combined.length <= byLevel.length && combined.length <= techPartners.length,
  `${combined.length} ≤ min(${byLevel.length}, ${techPartners.length})`);
check("combined filter satisfies BOTH conditions",
  combined.every((m) => m.membershipLevel === level && m.status === "Technology Partner"));

const all = applyFilters(members, EMPTY_FILTERS);
check("no filters returns everyone (the pure matcher stays pure)",
  all.length === members.length);

/*
 * ── The "search before you see anything" gate ────────────────────────────
 * `applyFilters` still matches everything on empty input — that's correct, it's
 * the pure matcher. The gate is `hasActiveSearch`, which the UI checks first.
 * These assert the RULE, so a later refactor can't quietly turn the directory
 * back into a browsable roster of 203 people's contact details.
 */
check("idle page is NOT an active search", !hasActiveSearch(EMPTY_FILTERS));
check("one or two characters is NOT enough",
  !hasActiveSearch({ ...EMPTY_FILTERS, q: "a" }) &&
  !hasActiveSearch({ ...EMPTY_FILTERS, q: "ab" }));
check(`${MIN_QUERY_LENGTH} characters IS enough`,
  hasActiveSearch({ ...EMPTY_FILTERS, q: "abc" }));
check("whitespace doesn't count toward the minimum",
  !hasActiveSearch({ ...EMPTY_FILTERS, q: "  a  " }));
check("a dropdown alone is a complete search",
  hasActiveSearch({ ...EMPTY_FILTERS, membershipLevels: ["Technology Partner - Gold"] }) &&
  hasActiveSearch({ ...EMPTY_FILTERS, status: "Technology Partner" }) &&
  hasActiveSearch({ ...EMPTY_FILTERS, lastEvent: "ITA Spring 2026 Collaborative" }));

/*
 * ── Profile Status ───────────────────────────────────────────────────────
 * Read straight from the `Profile Status` column, and the only status-like
 * field the app has. Complete coverage is what makes it usable as a filter, so
 * assert that rather than assuming it.
 */
/*
 * Every member has a Profile Status — EXCEPT the always-member overrides.
 * ITA's own record (2456) carries no `Profile_CustStatus`, which is right: the
 * association isn't a customer of itself. It's in the directory by policy, not
 * by the CRM's member lifecycle, so the field that describes that lifecycle is
 * legitimately empty. Exempting it by ID keeps the assertion strict for the 202
 * records where it genuinely means something.
 */
{
  const missing = members.filter((m) => !m.status && !ALWAYS_MEMBER_IDS.has(m.id));
  check("every member has a Profile Status (bar the always-member overrides)",
    missing.length === 0,
    missing.slice(0, 3).map((m) => `${m.id} ${m.name}`).join(" · "));
  check("the always-member override is what exempts it",
    members.filter((m) => !m.status).every((m) => ALWAYS_MEMBER_IDS.has(m.id)));
}
check("status facet covers the whole membership", facets.status.length >= 6,
  facets.status.join(" · "));
{
  const pick = "Technology Partner";
  const byStatus = applyFilters(members, { ...EMPTY_FILTERS, status: pick });
  check("status filter narrows and is exact",
    byStatus.length > 0 &&
    byStatus.length < members.length &&
    byStatus.every((m) => m.status === pick),
    `${pick}: ${byStatus.length}`);
}
check("status is NOT searchable as free text",
  applyFilters(members, { ...EMPTY_FILTERS, q: "emeritus" }).length === 0);

/*
 * ── "Member Since" ───────────────────────────────────────────────────────
 * A date cell arrives in several shapes and these assert every one, on fixed
 * inputs, so they hold whether or not the export carries the column yet.
 * The serial case is the one that matters most: a real date read from an
 * unformatted grid comes back as a bare number, and a string-only parser
 * can't see it at all — the exact bug the sibling app hit.
 */
check("US M/D/YYYY", monthYearLabel("1/15/2019") === "January 2019",
  monthYearLabel("1/15/2019"));
check("ISO YYYY-MM-DD", monthYearLabel("2019-01-15") === "January 2019",
  monthYearLabel("2019-01-15"));
check("year-month only", monthYearLabel("2019-03") === "March 2019",
  monthYearLabel("2019-03"));
check("written out", monthYearLabel("January 15, 2019") === "January 2019",
  monthYearLabel("January 15, 2019"));
check("abbreviated, no day", monthYearLabel("Sep 2021") === "September 2021",
  monthYearLabel("Sep 2021"));
check("Sheets SERIAL becomes a real date",
  monthYearLabel("43480") === "January 2019", monthYearLabel("43480"));
check("day-first is read as a day, not month 15",
  monthYearLabel("15/1/2019") === "January 2019", monthYearLabel("15/1/2019"));
check("two-digit year splits at 70",
  monthYearLabel("6/1/89") === "June 1989" && monthYearLabel("6/1/19") === "June 2019",
  `${monthYearLabel("6/1/89")} / ${monthYearLabel("6/1/19")}`);
check("a lone year keeps the year", monthYearLabel("2019") === "2019",
  monthYearLabel("2019"));
// The collision that actually bit: "2019" is a valid four-digit year AND a
// valid Sheets serial (which is July 1905). Year wins. Serials for real member
// dates are five digits, so raising the serial floor above 9999 separates them
// permanently — these pin both sides of that boundary.
check("a four-digit number is a year, never a serial",
  monthYearLabel("1998") === "1998" && monthYearLabel("2026") === "2026",
  `${monthYearLabel("1998")} / ${monthYearLabel("2026")}`);
check("a five-digit number is still a serial",
  monthYearLabel("46023") === "January 2026", monthYearLabel("46023"));
check("blank stays blank", monthYearLabel("") === "" && monthYearLabel("   ") === "");

// Refusals — small numbers are NOT dates, and unreadable text is shown as
// written rather than dropped or turned into a wrong date.
check("a small number is not a serial", parseYearMonth("5") === null);
check("unparseable text survives to the screen",
  monthYearLabel("Founding member") === "Founding member");
check("month 13 is refused, not wrapped", parseYearMonth("13/45/2019") === null);

// Whatever the export actually holds must survive the round trip.
{
  const withDate = members.filter((m) => m.memberSince);
  if (withDate.length > 0) {
    const unreadable = withDate.filter((m) => parseYearMonth(m.memberSince) === null);
    check("every Member Since value in the export parses",
      unreadable.length === 0,
      unreadable.slice(0, 3).map((m) => `${m.name}: "${m.memberSince}"`).join(" · "));
  } else {
    console.log("  ·    (export has no 'Member Since' column yet — value checks skipped)");
  }
}

/*
 * ── Last Event Signed Up for ─────────────────────────────────────────────
 * Ordering is asserted on FIXED strings, not on whatever the fixture happens
 * to contain, so these hold whether or not the export carries the column yet —
 * and keep holding after ITA adds events with new names.
 */
check("events sort newest year first",
  byEventRecency("ITA Spring 2026 Collaborative", "ITA Fall 2025 Collaborative") < 0);
check("within a year, later season first",
  byEventRecency("ITL 2026 Summer Meeting", "ITA Spring 2026 Collaborative") < 0);
check("alphabetical order would have been WRONG (the reason this exists)",
  "ITA Fall 2025 Collaborative".localeCompare("ITA Spring 2025 Collaborative") < 0 &&
  byEventRecency("ITA Fall 2025 Collaborative", "ITA Spring 2025 Collaborative") < 0);
check("a spanning label sorts by its FIRST year",
  byEventRecency("2026-27 ITA's Leadership Alliance (ILA) Program",
    "ITA Fall 2025 Collaborative") < 0);
check("labels with no year sink to the bottom",
  byEventRecency("Annual Kickoff", "ITA Fall 2024 Collaborative") > 0);

// Facet + filter, only when the export actually has the column.
if (facets.lastEvent.length > 0) {
  check("event facet is sorted newest first",
    facets.lastEvent.every((e, i) =>
      i === 0 || byEventRecency(facets.lastEvent[i - 1], e) <= 0),
    facets.lastEvent.join(" · "));

  const pick = facets.lastEvent[0];
  const byEvent = applyFilters(members, { ...EMPTY_FILTERS, lastEvent: pick });
  check("event filter narrows and is exact",
    byEvent.length > 0 &&
    byEvent.length < members.length &&
    byEvent.every((m) => m.lastEvent === pick),
    `${pick}: ${byEvent.length}`);

  check("event is NOT searchable as free text",
    applyFilters(members, { ...EMPTY_FILTERS, q: "collaborative" }).length === 0);
} else {
  console.log("  ·    (fixture has no 'Last Event Signed Up for' column — filter checks skipped)");
}

/** Count rows whose Primary Category cell is empty, straight from the CSV. */
function countBlankPrimaryCategory(csv: string): number {
  const g = parseCsv(csv);
  const i = g.headers.indexOf("Primary Category");
  if (i < 0) return 0;
  return g.rows.filter((r) => !(r[i] ?? "").trim()).length;
}

/*
 * ── Search state in the URL ──────────────────────────────────────────────
 * These params are a PUBLIC surface now: people paste these links into email.
 * Renaming one silently breaks every link already sent, so the names are
 * asserted literally, not derived from the code under test.
 */
{
  // Key order matters: the round-trip below compares JSON.stringify against
  // what `filtersFromParams` builds, so this must list fields in the same order.
  const full: Filters = {
    q: "martus",
    membershipLevels: ["Technology Partner - Gold"],
    status: "Technology Partner",
    lastEvent: "ITA Spring 2026 Collaborative",
    kind: "",
  };

  check("param names are q / level / status / event",
    filtersToQueryString(full) ===
      "q=martus&level=Technology+Partner+-+Gold&status=Technology+Partner" +
      "&event=ITA+Spring+2026+Collaborative",
    filtersToQueryString(full));

  check("filters survive the round trip",
    JSON.stringify(filtersFromParams(new URLSearchParams(filtersToQueryString(full)))) ===
      JSON.stringify(full));

  check("an empty search makes a clean URL",
    filtersToQueryString(EMPTY_FILTERS) === "" && searchHref(EMPTY_FILTERS) === "/",
    searchHref(EMPTY_FILTERS));
  check("only the set filters appear",
    filtersToQueryString({ ...EMPTY_FILTERS, q: "smith" }) === "q=smith",
    filtersToQueryString({ ...EMPTY_FILTERS, q: "smith" }));

  // Next hands a page `{ q: "x" }` while the browser gives a URLSearchParams —
  // both reach this code, so both must work.
  check("plain-object params work too (Next server pages)",
    filtersFromParams({ q: "smith", level: "Emeritus" }).q === "smith" &&
    filtersFromParams({ q: "smith", level: "Emeritus" }).membershipLevels[0] === "Emeritus");
  check("a repeated param takes the first, never joins",
    filtersFromParams({ q: ["a", "b"] }).q === "a",
    filtersFromParams({ q: ["a", "b"] }).q);
  check("missing params are empty, not undefined",
    filtersFromParams({}).q === "" && filtersFromParams({}).lastEvent === "");

  // Values carry spaces, ampersands and apostrophes ("2026-27 ITA's …").
  const tricky = { ...EMPTY_FILTERS, lastEvent: "2026-27 ITA's Leadership Alliance (ILA) Program" };
  check("awkward characters survive encoding",
    filtersFromParams(new URLSearchParams(filtersToQueryString(tricky))).lastEvent ===
      tricky.lastEvent);

  // The member link is what makes a result shareable.
  const real = members[0];
  check("member links use the stable ProfileID",
    memberHref(real.id, EMPTY_FILTERS) === `/member/${real.id}`,
    memberHref(real.id, EMPTY_FILTERS));
  check("member links carry the search back with them",
    memberHref(real.id, { ...EMPTY_FILTERS, q: "smith" }) === `/member/${real.id}?q=smith`);
  check("an id needing encoding is encoded",
    memberHref("a/b") === "/member/a%2Fb", memberHref("a/b"));

  // The detail page finds its member by that id; ids are unique (asserted
  // above), so this is the lookup the page actually performs.
  check("every member is reachable by its own id",
    members.every((m) => members.filter((x) => x.id === m.id).length === 1));
}

/* ── Membership level is MULTI-SELECT ────────────────────────────────────── */
{
  const gold = "Technology Partner - Gold";
  const silver = "Technology Partner - Silver";
  const one = applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [gold] });
  const two = applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [gold, silver] });
  const other = applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [silver] });

  /*
   * OR within the field. A member holds exactly ONE level, so AND-ing two would
   * always return nothing — the mistake that makes a multi-select look broken.
   */
  check("two levels return the UNION, not the intersection",
    two.length === one.length + other.length && two.length > one.length,
    `${one.length} + ${other.length} = ${two.length}`);
  check("every result holds one of the chosen levels",
    two.every((m) => m.membershipLevel === gold || m.membershipLevel === silver));
  check("an empty selection filters nothing",
    applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [] }).length ===
      members.length);
  check("order of selection doesn't change the result",
    applyFilters(members, { ...EMPTY_FILTERS, membershipLevels: [silver, gold] }).length ===
      two.length);
  check("one selected level still activates the search",
    hasActiveSearch({ ...EMPTY_FILTERS, membershipLevels: [gold] }));

  // Still ANDs across fields.
  const narrowed = applyFilters(members, {
    ...EMPTY_FILTERS,
    membershipLevels: [gold, silver],
    kind: "org",
  });
  check("levels OR each other but AND the other filters",
    narrowed.length <= two.length && narrowed.every((m) => m.isOrganization));

  /*
   * REPEATED params, not a comma-separated list: `?level=A&level=B`. Levels are
   * free text from the CRM, so a delimiter that can occur inside a value is a
   * parser waiting to break. Sorted on the way out so the same two choices
   * always produce the same URL and two people can compare links.
   */
  check("several levels become several params",
    filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [gold, silver] }) ===
      `level=${encodeURIComponent(gold).replace(/%20/g, "+")}` +
      `&level=${encodeURIComponent(silver).replace(/%20/g, "+")}`,
    filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [gold, silver] }));
  check("the URL is stable regardless of pick order",
    filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [silver, gold] }) ===
      filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [gold, silver] }));
  check("repeated params round-trip back to a list",
    JSON.stringify(
      filtersFromParams(
        new URLSearchParams(
          filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [gold, silver] })
        )
      ).membershipLevels
    ) === JSON.stringify([gold, silver].sort()));
  check("a duplicated level in a hand-edited URL counts once",
    filtersFromParams({ level: [gold, gold, silver] }).membershipLevels.length === 2);
  check("blank level params are dropped",
    filtersFromParams({ level: ["", gold] }).membershipLevels.length === 1);
  check("no level leaves the URL clean",
    filtersToQueryString({ ...EMPTY_FILTERS, membershipLevels: [] }) === "");
}

/* ── The CSV export ──────────────────────────────────────────────────────── */
{
  check("the disclaimer is the FIRST line of the file",
    resultsToCsv(members.slice(0, 2), "").split("\r\n")[0].includes(EXPORT_DISCLAIMER),
    "it must travel with the file, not just appear in the dialog");

  const csv = resultsToCsv(members.slice(0, 5), "search: test");
  const lines = csv.split("\r\n");
  check("the file records what the list is", lines[1].includes("search: test"));
  check("one row per result plus disclaimer, summary, blank and header",
    lines.length === 5 + 4, `${lines.length} lines`);
  check("the header row names the columns",
    lines[3].startsWith("Name,Type,Organization,Title"), lines[3].slice(0, 40));

  // Commas are REAL in this data — "Frank, Rimerman + Co. LLP".
  check("a value containing a comma is quoted",
    csvField("Frank, Rimerman + Co. LLP") === '"Frank, Rimerman + Co. LLP"',
    csvField("Frank, Rimerman + Co. LLP"));
  check("embedded quotes are doubled",
    csvField('He said "hi"') === '"He said ""hi"""', csvField('He said "hi"'));
  check("newlines are quoted, not left to break the row",
    csvField("a\nb") === '"a\nb"');

  /*
   * FORMULA INJECTION. A CRM field is free text; a title starting "=" is
   * executed by Excel and Sheets when the export is opened. This is the one
   * assertion here that's about safety rather than formatting.
   */
  for (const bad of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
    check(`a value starting "${bad[0]}" is neutralised`,
      csvField(bad).startsWith("'"), csvField(bad));
  }
  check("every row of the real export is free of live formulas",
    resultsToCsv(members, "").split("\r\n").slice(3)
      .every((l) => !/^[=+@]/.test(l) && !/,[=+@]/.test(l)));
}

/* ── Organizations / Individuals / Both ──────────────────────────────────── */
{
  const orgs = members.filter((m) => m.isOrganization);
  const people = members.filter((m) => !m.isOrganization);
  check("the org flag splits the membership, not all-or-nothing",
    orgs.length > 0 && people.length > 0 && orgs.length + people.length === members.length,
    `${orgs.length} organizations · ${people.length} individuals`);

  check("Both is the default and filters nothing",
    applyFilters(members, { ...EMPTY_FILTERS, kind: "" }).length === members.length);
  check("Organizations returns only organizations",
    applyFilters(members, { ...EMPTY_FILTERS, kind: "org" }).every((m) => m.isOrganization));
  check("Individuals returns only individuals",
    applyFilters(members, { ...EMPTY_FILTERS, kind: "individual" })
      .every((m) => !m.isOrganization));
  check("the two halves reconstruct the whole",
    applyFilters(members, { ...EMPTY_FILTERS, kind: "org" }).length +
      applyFilters(members, { ...EMPTY_FILTERS, kind: "individual" }).length ===
      members.length);

  // It REFINES a search, it does not start one — see hasActiveSearch.
  check("picking a type alone does NOT open the directory",
    !hasActiveSearch({ ...EMPTY_FILTERS, kind: "org" }) &&
    !hasActiveSearch({ ...EMPTY_FILTERS, kind: "individual" }));
  check("but it does narrow a real search",
    applyFilters(members, { ...EMPTY_FILTERS, q: "consult", kind: "individual" }).length <=
      applyFilters(members, { ...EMPTY_FILTERS, q: "consult" }).length);

  check("kind round-trips through the URL as ?type=",
    filtersToQueryString({ ...EMPTY_FILTERS, kind: "org" }) === "type=org" &&
    filtersFromParams({ type: "individual" }).kind === "individual",
    filtersToQueryString({ ...EMPTY_FILTERS, kind: "org" }));
  check("an unknown ?type= falls back to Both, never an empty page",
    filtersFromParams({ type: "banana" }).kind === "" &&
    filtersFromParams({ type: "ORG" }).kind === "");
  check("Both leaves the URL clean",
    filtersToQueryString({ ...EMPTY_FILTERS, kind: "" }) === "");
}

/* ── The two engagement columns ─────────────────────────────────────────── */
check("signed-up and attended are kept APART",
  members.every((m) => m.lastEvent === "" || m.lastEventAttended !== m.lastEvent) ||
  grid.headers.indexOf("Last Event Attended") < 0,
  "a member showing the same value for both may mean the headers got crossed");

/*
 * ── The ProfileView mapping ──────────────────────────────────────────────
 * Every one of these was verified against the two real exports across the 203
 * members they share. Asserting them here is what stops a future candidate-list
 * edit from quietly repointing a field: `email` in particular must stay the
 * MAIN CONTACT's address, not the org's sparse shared alias.
 */
if (isProfileView) {
  const filled = (pick: (m: (typeof members)[number]) => string) =>
    members.filter((m) => pick(m).trim()).length;

  check("names came from Profile_ReportName", filled((m) => m.name) === members.length);
  check("every member has a sortName", members.every((m) => m.sortName.length > 0));
  /*
   * The "Last, First" form belongs to PEOPLE — but a COMMA does not mean a
   * person. An earlier version asserted a third of all sortNames contain one
   * and failed at 53/202; the fix then mis-explained why. Both readings were
   * wrong: there are only 7 individuals, and most of those 53 commas are
   * company names ("LDH Consulting, Inc.", "Frank, Rimerman + Co. LLP").
   * `Profile_OrgInd` is the only thing that answers org-vs-person.
   */
  const individuals = members.filter((m) => !m.isOrganization);
  check("individuals carry the 'Last, First' sort form",
    individuals.length > 0 && individuals.every((m) => m.sortName.includes(",")),
    `${individuals.filter((m) => m.sortName.includes(",")).length} of ${individuals.length}`);
  check("a comma in sortName does NOT imply an individual",
    members.filter((m) => m.sortName.includes(",")).length > individuals.length,
    `${members.filter((m) => m.sortName.includes(",")).length} commas vs ${individuals.length} individuals`);
  /*
   * `Profile_ReportName` is the search field for BOTH organizations and
   * individuals — for a person it holds the full "First Last". Nothing else is
   * needed: `Profile_FirstName`/`LastName` are populated on only the 7
   * individual records, so indexing them would add nothing and invite someone
   * to "fix" search by reaching for them.
   *
   * Asserted on every individual in the export, by first name, last name and
   * full name, because this is the behavior a member notices first.
   */
  const people = members.filter((m) => !m.isOrganization);
  const finds = (q: string, id: string) =>
    applyFilters(members, { ...EMPTY_FILTERS, q }).some((m) => m.id === id);
  const nameParts = (n: string) =>
    n.split(/\s+/).filter((p) => p.length > 2 && !p.endsWith("."));

  check("individuals are findable by FIRST name",
    people.every((m) => finds(nameParts(m.name)[0] ?? m.name, m.id)),
    people.filter((m) => !finds(nameParts(m.name)[0] ?? m.name, m.id))
      .map((m) => m.name).join(" · "));
  check("individuals are findable by LAST name",
    people.every((m) => {
      const p = nameParts(m.name);
      return finds(p[p.length - 1] ?? m.name, m.id);
    }));
  check("individuals are findable by FULL name",
    people.every((m) => finds(m.name, m.id)));
  check("and by surname-first, since sortName is indexed too",
    people.every((m) => {
      const p = nameParts(m.name);
      return p.length < 2 || finds(`${p[p.length - 1]} ${p[0]}`, m.id);
    }));
  check("organizations are findable by their name",
    members.filter((m) => m.isOrganization).every((m) => finds(m.name, m.id)));

  check("email prefers the main contact, not the org alias",
    filled((m) => m.email) > members.length * 0.9, `${filled((m) => m.email)}/${members.length}`);
  check("Member_MemberSince populated memberSince",
    filled((m) => m.memberSince) > members.length * 0.9,
    `${filled((m) => m.memberSince)}/${members.length}`);
  /*
   * A DATA-QUALITY GUARD, not a parser test.
   *
   * 9 of 202 members carry a `Member_MemberSince` identical to
   * `Profile_DateCreated` down to the second — the 10 May 2024 migration
   * timestamp, backfilled where a real join date was unknown. All nine are
   * Emeritus. The other 193 are genuine dates going back to 2002, so the field
   * is worth showing; but if a future migration backfills EVERY row, the page
   * would quietly tell 202 members they joined on the same afternoon.
   *
   * Nothing is corrected here — inventing a join date would be worse than
   * showing an imperfect one. This just makes the spread visible if it grows.
   */
  const withSince = members.filter((m) => m.memberSince);
  const createdCol = grid.headers.indexOf("Profile_DateCreated");
  if (createdCol >= 0) {
    const createdByName = new Map(
      grid.rows.map((r) => [r[grid.headers.indexOf("Profile_ReportName")], r[createdCol]])
    );
    const looksBackfilled = withSince.filter(
      (m) => createdByName.get(m.name) === m.memberSince
    ).length;
    check("most Member Since dates are real, not the migration timestamp",
      looksBackfilled < withSince.length * 0.1,
      `${looksBackfilled}/${withSince.length} match Profile_DateCreated exactly ` +
        `(known: 9 Emeritus records backfilled on 10 May 2024)`);
  }

  check("every memberSince value parses to a real month",
    members.filter((m) => m.memberSince).every((m) => parseYearMonth(m.memberSince) !== null),
    members.filter((m) => m.memberSince && !parseYearMonth(m.memberSince))
      .slice(0, 3).map((m) => `${m.name}: "${m.memberSince}"`).join(" · "));
  check("the new contact fields arrived", filled((m) => m.contactName) > 150,
    `contactName ${filled((m) => m.contactName)} · phone ${filled((m) => m.phone)} · address ${filled((m) => m.address1)}`);

  // Confirms the same member reads the same in both shapes — the whole reason
  // there is one parser and not two.
  const taylor = members.find((m) => m.id === "629");
  check("a known member is identical across export shapes",
    !!taylor && taylor.name === "Taylor Macdonald" &&
    taylor.sortName === "Macdonald, Taylor" && taylor.city === "Atlanta",
    taylor ? `${taylor.name} / ${taylor.sortName} / ${taylor.city}` : "id 629 not found");

  /* ── Coming soon ──────────────────────────────────────────────────────── */
  check("the event filter reports itself PENDING, not simply absent",
    eventFilterPending({ members, facets, source: { kind: "fixture", sheetUrl: null, readAt: "" } }));
  check("pending is data-driven — it flips by itself when the column arrives",
    isPending(members, (m) => m.lastEvent) &&
    !isPending(members, (m) => m.name));

  /* ── Nothing sensitive reached the fixture ────────────────────────────── */
  for (const col of ["Profile_SSN", "Profile_TaxID", "Profile_Password", "Profile_BirthDate"]) {
    check(`${col} is not in the local fixture`, !grid.headers.includes(col));
  }
}

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
