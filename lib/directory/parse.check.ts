/**
 * Fixture check — runs the REAL ProfileSelectorData export through the CSV
 * reader, the parser and the search matcher under bare Node:
 *
 *   node --experimental-strip-types lib/directory/parse.check.ts
 *
 * No test framework on purpose (same convention as the Aligned KPIs app's
 * *.check.ts files) — this must stay runnable with nothing installed.
 * Excluded from tsconfig, and it reads the gitignored fixture, so it simply
 * skips when the fixture isn't present.
 */
import fs from "fs";
import path from "path";
import { parseDirectory, facetsOf } from "./parse";
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

const grid = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
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

// --- Facets ----------------------------------------------------------------
check("membership levels found", facets.membershipLevel.length >= 5);
check("states found", facets.state.length >= 20);
check("no blank facet values",
  [...facets.membershipLevel, ...facets.status, ...facets.state].every(Boolean));

// --- Search ----------------------------------------------------------------
const all = applyFilters(members, EMPTY_FILTERS);
check("empty query returns everyone", all.length === members.length);

const byCity = applyFilters(members, { ...EMPTY_FILTERS, q: "atlanta" });
check("city search finds Atlanta members", byCity.length > 0, `${byCity.length} found`);

// Multi-term must be AND: "atlanta" + a name should be narrower than either.
const twoTerm = applyFilters(members, { ...EMPTY_FILTERS, q: "atlanta macdonald" });
check("multi-term search is AND, not OR", twoTerm.length < byCity.length,
  `${twoTerm.length} vs ${byCity.length}`);

const level = facets.membershipLevel[0];
const filtered = applyFilters(members, { ...EMPTY_FILTERS, membershipLevel: level });
check("level filter narrows the list",
  filtered.length > 0 && filtered.length < members.length,
  `${level}: ${filtered.length}`);
check("level filter is exact", filtered.every((m) => m.membershipLevel === level));

check("punctuation is ignored in search", normalize("O'Brien, St. Louis") === "o brien st. louis",
  normalize("O'Brien, St. Louis"));

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
