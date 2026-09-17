/**
 * COLUMN-ORDER SAFETY — the check that lets you edit the source sheet without
 * asking whether the app will survive it.
 *
 *   npm run check
 *
 * THE RULE this enforces: every column is resolved by header NAME, never by
 * position. Positional access is the failure mode where nothing throws, nothing
 * logs, and the directory just starts showing the wrong values in the right
 * boxes — a ZIP code under "Membership Level" — for however long it takes
 * someone to notice.
 *
 * The method is differential: rebuild the fixture with the columns rearranged,
 * parse both, and require the two results to be IDENTICAL field for field. An
 * assertion on "does it still parse" would pass even if every value shifted one
 * column left, which is exactly the bug being guarded against.
 *
 * Four rearrangements, each a thing that actually happens to a live sheet:
 *   1. columns REVERSED           — the extreme case; nothing keeps its index
 *   2. new columns APPENDED       — the common one (adding fields at the end)
 *   3. new columns INSERTED FIRST — the dangerous one (every index shifts)
 *   4. new columns INTERLEAVED    — a column added between two we read
 */
import fs from "fs";
import path from "path";
import { parseDirectory } from "./parse";
import { parseCsv } from "./csv";
import type { SheetTab } from "@/lib/sheets-core";
import type { Member } from "./types";

const FIXTURE = [
  path.join(process.cwd(), "data", "ProfileView.csv"),
  path.join(process.cwd(), "data", "ProfileSelectorData.csv"),
].find((p) => fs.existsSync(p)) ?? "";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

if (!FIXTURE) {
  console.log("fixture not present — skipping (this is fine on a clean checkout)");
  process.exit(0);
}

const original = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
const baseline = parseDirectory(original);

console.log(`\nColumn-order safety — baseline ${baseline.length} members, ` +
  `${original.headers.length} columns\n`);

/**
 * A deterministic shuffle of `0..n-1` that is a REAL permutation at any width.
 *
 * This replaces a `(i * 7) % n` stride, which is only a permutation when 7 is
 * coprime with n. That held at 19 columns and silently stopped holding at 168
 * (7 divides 168), so the "shuffled" grid repeated some columns and dropped
 * others — and the check failed with "member count 202 vs 0", reading exactly
 * like a positional-access bug in the app. It wasn't; the test had broken.
 *
 * Fisher–Yates with a fixed-seed LCG: reproducible, and correct for every n.
 */
function shuffledOrder(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let seed = 20260916;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Reorder a grid's columns by a permutation of its column indexes. */
function permute(tab: SheetTab, order: number[]): SheetTab {
  return {
    headers: order.map((i) => tab.headers[i]),
    rows: tab.rows.map((r) => order.map((i) => r[i] ?? "")),
  };
}

/** Splice brand-new columns into a grid at `at`, filled with plausible junk. */
function addColumns(tab: SheetTab, names: string[], at: number): SheetTab {
  const filler = names.map((_, k) => `new-value-${k}`);
  return {
    headers: [...tab.headers.slice(0, at), ...names, ...tab.headers.slice(at)],
    rows: tab.rows.map((r) => [...r.slice(0, at), ...filler, ...r.slice(at)]),
  };
}

/** Every field of Member, so a comparison can't silently skip one. */
const FIELDS: (keyof Member)[] = [
  "id", "name", "sortName", "organization", "email", "membershipLevel",
  "status", "memberSince", "lastEvent", "lastEventAttended", "eventCount12mo",
  "website", "city", "state", "zip", "phone", "address1", "address2",
  "contactName", "contactTitle", "contactPhone", "isOrganization",
  "listingLevel", "haystack",
];

/** First field-level disagreement between two parses, or null if identical. */
function firstDifference(a: Member[], b: Member[]): string | null {
  if (a.length !== b.length) return `member count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    for (const f of FIELDS) {
      if (a[i][f] !== b[i][f]) {
        return `member ${i} (${a[i].name}) field "${f}": ${JSON.stringify(a[i][f])} vs ${JSON.stringify(b[i][f])}`;
      }
    }
  }
  return null;
}

function identical(label: string, rearranged: SheetTab) {
  const diff = firstDifference(baseline, parseDirectory(rearranged));
  check(label, diff === null, diff ?? "");
}

const n = original.headers.length;

// 1. Reversed — the strongest form of the test. If ANY field were read by
//    position, "Report Name" at index 9 would come back as "Membership Level".
identical(
  "columns REVERSED → identical output",
  permute(original, Array.from({ length: n }, (_, i) => n - 1 - i))
);

// 2. Appended — what you're about to do. Indexes of existing columns are
//    unchanged, so this passes even for positional code; it's here to prove new
//    columns are ignored rather than mistaken for ones we read.
identical(
  "new columns APPENDED → identical output",
  addColumns(original, ["LinkedIn URL", "Bio", "Headshot"], n)
);

// 3. Inserted FIRST — the dangerous one. Every existing column shifts right by
//    three. Positional code fails here loudly and obviously.
identical(
  "new columns INSERTED FIRST → identical output",
  addColumns(original, ["Sync ID", "Last Modified", "Notes"], 0)
);

// 4. Interleaved — a column added in the middle of ones we read, then the whole
//    thing shuffled. The realistic messy case.
{
  // "Tags"/"Notes" rather than "Phone": a filler column must be a name the
  // parser does NOT look for, or the test is checking its own filler instead of
  // the real data. `Phone` became a real candidate when the SQL view landed.
  const withMiddle = addColumns(original, ["Tags", "Notes"], 5);
  identical(
    "new columns INTERLEAVED and all columns SHUFFLED → identical output",
    permute(withMiddle, shuffledOrder(withMiddle.headers.length))
  );
}

// 5. A column we DO read, removed. Not about order — about the promise that a
//    missing column degrades to blank rather than throwing or shifting.
{
  /*
   * Find the website column BY SEARCHING the headers, never by hard-coding one
   * name. The old export calls it "Website" and the SQL view "Profile_Website",
   * so `indexOf("Website")` silently matched nothing on the new fixture,
   * removed no column, and then failed for "website isn't blank" — a test
   * failure that looked like a parser failure. This is the same trap the
   * Aligned KPIs footprint job documents for its drill-down columns: a
   * hard-coded source header resolves to NOTHING on another export.
   */
  const i = original.headers.findIndex((h) => /website|web site/i.test(h));
  check("found a website column to remove (test pre-condition)", i >= 0,
    `headers searched: ${original.headers.length}`);
  const without = permute(
    original,
    Array.from({ length: n }, (_, k) => k).filter((k) => k !== i)
  );
  const parsed = parseDirectory(without);
  check("a column we read, REMOVED → still parses, that field blank",
    parsed.length === baseline.length && parsed.every((m) => m.website === ""),
    `${parsed.length} members, ${parsed.filter((m) => m.website).length} still have a website`);
  check("removing one column doesn't disturb the others",
    parsed.every((m, k) =>
      m.name === baseline[k].name &&
      m.email === baseline[k].email &&
      m.membershipLevel === baseline[k].membershipLevel &&
      m.status === baseline[k].status));
}

// 6. Header text the sheet might drift to. `headerIndex` normalizes case,
//    spaces and punctuation, so these must all still resolve.
{
  const renamed: SheetTab = {
    headers: original.headers.map((h) =>
      h === "Report Name" ? "  REPORT_NAME  "
      : h === "Membership Level" ? "membership level"
      : h === "Primary Category" ? "Primary-Category"
      : h),
    rows: original.rows,
  };
  identical("header case / spacing / punctuation drift → identical output", renamed);
}

console.log(failures === 0
  ? "\nAll column-order checks passed — columns are resolved by NAME.\n"
  : `\n${failures} check(s) FAILED — something is reading a column by POSITION.\n`);
process.exit(failures === 0 ? 0 : 1);
