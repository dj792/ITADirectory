/**
 * Checks for the WRITE path and the admin gate.
 *
 * These run without a network: the Sheets calls are behind `writeCells` /
 * `appendRows`, so what is testable here is the logic that decides WHAT to
 * write — which is where the bugs that matter live. A wrong API call fails
 * loudly; a wrong sort-order calculation silently reorders someone's form.
 */
import crypto from "crypto";
import { colLetter, headerIndex, rowFromValues } from "@/lib/sheets-core";
import { adminCookieValid, adminKeyCorrect, adminToken } from "@/lib/admin-gate";
import { adminCookieValidEdge, adminTokenEdge } from "@/lib/admin-gate-edge";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

/* ── A1 addressing ────────────────────────────────────────────────────── */
/*
 * Off-by-one here writes to the wrong column of the right row, which is the
 * worst kind of wrong: it looks like a save that went somewhere unexpected.
 */
check("column A is index 0", colLetter(0) === "A");
check("column Z is index 25", colLetter(25) === "Z");
check("column AA is index 26", colLetter(26) === "AA", colLetter(26));
check("column AZ is index 51", colLetter(51) === "AZ", colLetter(51));
check("column BA is index 52", colLetter(52) === "BA", colLetter(52));
// The Profiles tab is 172 columns wide, so this range is real, not theoretical.
check("column FP is index 171", colLetter(171) === "FP", colLetter(171));

/* ── Row building respects the tab's own column order ─────────────────── */
{
  const headers = ["Active", "FieldID", "Label", "Unknown To Us"];
  const row = rowFromValues(headers, {
    FieldID: "elevator_pitch",
    Label: "Elevator Pitch",
    Active: "TRUE",
  });
  check("a new row lands in the tab's column order",
    row[0] === "TRUE" && row[1] === "elevator_pitch" && row[2] === "Elevator Pitch",
    row.join(" | "));
  check("a column we don't write is left blank, not skipped",
    row.length === 4 && row[3] === "");

  const reordered = rowFromValues(["Label", "Active", "FieldID"], {
    FieldID: "x", Label: "X", Active: "TRUE",
  });
  check("reordering the sheet's columns doesn't misalign a new row",
    reordered[0] === "X" && reordered[1] === "TRUE" && reordered[2] === "x",
    reordered.join(" | "));

  const unknown = rowFromValues(["FieldID"], { FieldID: "a", Nonexistent: "b" });
  check("a value with no column is dropped rather than appended",
    unknown.length === 1 && unknown[0] === "a");
}

/* ── Header matching is tolerant, the way reads are ───────────────────── */
check("header lookup ignores case and punctuation",
  headerIndex(["Sort Order", "Field ID"], "SortOrder") === 0 &&
  headerIndex(["Sort Order", "Field ID"], "FieldID") === 1);
check("a missing header is -1, not 0",
  headerIndex(["A", "B"], "Nope") === -1);

/* ── The reorder swap ─────────────────────────────────────────────────── */
/*
 * `moveField` talks to Sheets, so the ARITHMETIC is reproduced here against the
 * same rules. Three cases, and the third is the one that bites: a hand-seeded
 * tab easily has two rows with the same SortOrder, and swapping two equal
 * numbers writes twice and moves nothing — which reads as a broken button.
 */
function swap(a: number, b: number, dir: "up" | "down"): [number, number] {
  let aNew = b;
  let bNew = a;
  if (aNew === bNew) {
    aNew = dir === "up" ? b - 1 : b + 1;
    bNew = b;
  }
  return [aNew, bNew];
}
{
  const [a1, b1] = swap(20, 10, "up");
  check("moving up takes the neighbour's lower order", a1 === 10 && b1 === 20);

  const [a2, b2] = swap(20, 30, "down");
  check("moving down takes the neighbour's higher order", a2 === 30 && b2 === 20);

  const [a3, b3] = swap(30, 30, "up");
  check("two EQUAL orders still produce a real move", a3 < b3, `${a3} vs ${b3}`);

  const [a4, b4] = swap(30, 30, "down");
  check("…in the other direction too", a4 > b4, `${a4} vs ${b4}`);
}

/* ── Ordering is stable when orders tie ──────────────────────────────── */
/*
 * `parse` sorts by SortOrder then FieldID, and `moveField` by SortOrder then
 * ROW INDEX. Both must be deterministic or a field appears to jump two places:
 * the screen shows one order and the write acts on another.
 */
{
  const rows = [
    { id: "b", sort: 10, rowIndex: 3 },
    { id: "a", sort: 10, rowIndex: 1 },
    { id: "c", sort: 5, rowIndex: 2 },
  ];
  const ordered = [...rows].sort((x, y) => x.sort - y.sort || x.rowIndex - y.rowIndex);
  check("ties break on row index, deterministically",
    ordered.map((r) => r.id).join("") === "cab",
    ordered.map((r) => r.id).join(""));
  const twice = [...rows].sort((x, y) => x.sort - y.sort || x.rowIndex - y.rowIndex);
  check("…and sorting twice gives the same answer",
    twice.map((r) => r.id).join("") === ordered.map((r) => r.id).join(""));
}

/* ── The admin gate ──────────────────────────────────────────────────── */
{
  const KEY = "a-long-enough-test-key-9f2c";
  process.env.ADMIN_ACCESS_KEY = KEY;
  process.env.AUTH_SECRET = "test-secret";

  check("the right key is accepted", adminKeyCorrect(KEY));
  check("surrounding whitespace is tolerated", adminKeyCorrect(`  ${KEY}\n`));
  check("a wrong key of the SAME LENGTH is rejected",
    !adminKeyCorrect("a-long-enough-test-key-0000"));
  check("a wrong key of a different length is rejected", !adminKeyCorrect("short"));
  check("an empty key is rejected", !adminKeyCorrect(""));

  const token = adminToken();
  check("a valid cookie is accepted", adminCookieValid(token));
  check("no cookie is rejected", !adminCookieValid(undefined));
  check("an empty cookie is rejected", !adminCookieValid(""));
  check("a truncated cookie is rejected", !adminCookieValid(token.slice(0, -1)));
  check("a same-length wrong cookie is rejected",
    !adminCookieValid("f".repeat(token.length)));

  // The cookie must not be the password, or a stolen cookie is a stolen
  // password — and this one will be sent over Slack.
  check("the cookie does not contain the key", !token.includes(KEY));

  // Salting with AUTH_SECRET means a cookie can't move between deployments.
  process.env.AUTH_SECRET = "a-different-deployment";
  check("a cookie from another deployment is rejected", !adminCookieValid(token));
  process.env.AUTH_SECRET = "test-secret";
  check("…and is accepted again once the salt matches", adminCookieValid(token));

  // With no key configured the area is CLOSED, not open.
  delete process.env.ADMIN_ACCESS_KEY;
  check("an unconfigured gate rejects a previously valid cookie",
    !adminCookieValid(token));
  check("an unconfigured gate rejects every key", !adminKeyCorrect("anything"));
  process.env.ADMIN_ACCESS_KEY = KEY;
}

/* ── Id normalization on add ─────────────────────────────────────────── */
/*
 * The id is permanent and is the join to stored answers, so what the form does
 * to it before writing matters more than it looks.
 */
{
  const norm = (s: string) =>
    s.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  check("spaces become underscores", norm("Elevator Pitch") === "elevator_pitch");
  check("punctuation is collapsed", norm("Firm / Revenue!") === "firm_revenue",
    norm("Firm / Revenue!"));
  check("leading and trailing junk is trimmed", norm("  --Awards--  ") === "awards",
    norm("  --Awards--  "));
  check("an id of only punctuation becomes empty, and is refused upstream",
    norm("!!!") === "");
  check("an already-clean id is untouched", norm("speaker_topics") === "speaker_topics");
}

/* ── THE TWO GATE IMPLEMENTATIONS MUST AGREE ─────────────────────────── */
/*
 * Sign-in mints the cookie with the NODE module; middleware verifies it with
 * the EDGE one. If they ever compute different tokens, signing in appears to
 * work and then bounces you straight back to the login page — a loop with no
 * error anywhere, because each half is behaving correctly on its own.
 */
{
  process.env.ADMIN_ACCESS_KEY = "a-long-enough-test-key-9f2c";
  process.env.AUTH_SECRET = "test-secret";

  const node = adminToken();
  const edge = await adminTokenEdge();
  check("the Node and edge gates compute the SAME token", node === edge,
    `${node.slice(0, 16)}… vs ${edge.slice(0, 16)}…`);
  check("a cookie minted by Node verifies on the edge",
    await adminCookieValidEdge(node));
  check("the edge gate rejects a wrong cookie",
    !(await adminCookieValidEdge("f".repeat(64))));
  check("the edge gate rejects an absent cookie",
    !(await adminCookieValidEdge(undefined)));

  delete process.env.ADMIN_ACCESS_KEY;
  check("an unconfigured edge gate rejects everything",
    !(await adminCookieValidEdge(node)));
  process.env.ADMIN_ACCESS_KEY = "a-long-enough-test-key-9f2c";
}

/* ── HMAC sanity ─────────────────────────────────────────────────────── */
check("the token is a hex sha256",
  /^[0-9a-f]{64}$/.test(
    crypto.createHmac("sha256", "s").update("admin:k").digest("hex")
  ));

console.log(failures === 0
  ? "\nAll write checks passed.\n"
  : `\n${failures} write check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
