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
import { parseDirectory, facetsOf, byEventRecency } from "./parse";
import { applyFilters, EMPTY_FILTERS, normalize } from "./search";
import { parseCsv } from "./csv";

const FIXTURE = path.join(process.cwd(), "data", "ProfileSelectorData.csv");

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

if (!fs.existsSync(FIXTURE)) {
  console.log("fixture not present — skipping (this is fine on a clean checkout)");
  process.exit(0);
}

const raw = fs.readFileSync(FIXTURE, "utf8");
const grid = parseCsv(raw);
const members = parseDirectory(grid);
const facets = facetsOf(members);

console.log(`\nProfileSelectorData fixture → ${members.length} members\n`);

// --- Parsing ---------------------------------------------------------------
check("every data row became a member", members.length === grid.rows.length,
  `${members.length} of ${grid.rows.length}`);
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
check("categories found", facets.category.length >= 5, `${facets.category.length}`);
check("no blank dropdown values",
  [...facets.membershipLevel, ...facets.category].every(Boolean));

/*
 * The category fallback. `Primary Category` is blank for 76 of the 203 rows;
 * `Profile Status` fills every one with the same vocabulary. Without the
 * fallback the Category dropdown silently hides a third of the directory —
 * so assert on the real numbers, not just "greater than zero".
 */
const csvBlankCategory = countBlankPrimaryCategory(raw);
check("fixture still has the blank Primary Category rows this guards against",
  csvBlankCategory > 50, `${csvBlankCategory} blank`);
check("EVERY member has a category after the fallback",
  members.every((m) => m.category.length > 0),
  `${members.filter((m) => !m.category).length} without one`);

const techPartners = applyFilters(members, { ...EMPTY_FILTERS, category: "Technology Partner" });
check("category filter counts the fallback rows too",
  techPartners.length > 40,
  `Technology Partner: ${techPartners.length} (would be ~23 without the fallback)`);
check("category filter is exact",
  techPartners.every((m) => m.category === "Technology Partner"));

// --- The two dropdowns AND with each other and with the text box ------------
const level = "Technology Partner - Gold";
const byLevel = applyFilters(members, { ...EMPTY_FILTERS, membershipLevel: level });
check("level filter narrows the list",
  byLevel.length > 0 && byLevel.length < members.length, `${level}: ${byLevel.length}`);

const combined = applyFilters(members, {
  ...EMPTY_FILTERS,
  membershipLevel: level,
  category: "Technology Partner",
});
check("level AND category narrows further, never wider",
  combined.length <= byLevel.length && combined.length <= techPartners.length,
  `${combined.length} ≤ min(${byLevel.length}, ${techPartners.length})`);
check("combined filter satisfies BOTH conditions",
  combined.every((m) => m.membershipLevel === level && m.category === "Technology Partner"));

const all = applyFilters(members, EMPTY_FILTERS);
check("no filters returns everyone", all.length === members.length);

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

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
