/**
 * Checks for the answer reconcile — the logic that decides what happens to a
 * member's stored data when they press Save.
 *
 * This is the highest-stakes pure function in the app: get it wrong and
 * someone's answers are quietly lost or duplicated, and nobody notices until
 * ITA reports it months later. So the cases below are deliberately the nasty
 * ones — clearing, un-ticking, re-ticking, reordering, fields that aren't on
 * the form — rather than the happy path.
 */
import { reconcile, summarize, type Answers } from "./values";
import type { FieldValue, FormField } from "./types";
import type { SheetTab } from "@/lib/sheets-core";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const HEADERS = [
  "ValueID", "ProfileID", "FieldID", "Value", "SortOrder",
  "UpdatedAt", "UpdatedBy", "Active",
];
const grid: SheetTab = { headers: HEADERS, rows: [] };
const NOW = "2026-09-28T12:00:00.000Z";
const BY = "tester";

type Row = FieldValue & { rowIndex: number; active: boolean };
let nextRow = 0;
function row(
  profileId: string, fieldId: string, value: string,
  { active = true, sortOrder = 0, valueId = "" } = {}
): Row {
  return {
    rowIndex: nextRow++, valueId: valueId || String(nextRow),
    profileId, fieldId, value, sortOrder,
    updatedAt: "", updatedBy: "", active,
  };
}
function field(id: string, dataType: FormField["dataType"] = "text"): FormField {
  return {
    id, label: id, dataType, optionSet: "", appliesTo: "both",
    visibility: "members", searchMode: "none", group: "", helpText: "",
    maxRepeat: 4, maxLength: 0, applicationType: "TP", required: false,
    sortOrder: 10, showIfField: "", showIfValue: "", options: [],
  };
}
const answers = (o: Record<string, string[]>): Answers => new Map(Object.entries(o));
const run = (rows: Row[], fields: FormField[], a: Answers) =>
  reconcile(grid, rows, "110", fields, a, NOW, BY);

/* ── Nothing at all ──────────────────────────────────────────────────── */
{
  const r = run([], [field("pitch")], answers({ pitch: [""] }));
  check("an empty answer on an empty record writes nothing",
    r.edits.length === 0 && r.appends.length === 0, JSON.stringify(r.summary));
  check("…and says so", summarize(r.summary) === "No changes.");
}

/* ── First answer ────────────────────────────────────────────────────── */
{
  const r = run([], [field("pitch")], answers({ pitch: ["We do things."] }));
  check("a first answer is appended", r.appends.length === 1 && r.edits.length === 0);
  check("…with the profile, field and value",
    r.appends[0].ProfileID === "110" && r.appends[0].FieldID === "pitch" &&
    r.appends[0].Value === "We do things.");
  check("…marked active and stamped",
    r.appends[0].Active === "TRUE" && r.appends[0].UpdatedAt === NOW &&
    r.appends[0].UpdatedBy === BY);
}

/* ── Changing an answer edits IN PLACE ───────────────────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "pitch", "Old text")];
  const r = run(rows, [field("pitch")], answers({ pitch: ["New text"] }));
  check("a changed answer is an edit, not a new row",
    r.appends.length === 0 && r.edits.some((e) => e.header === "Value" && e.value === "New text"),
    `${r.edits.length} edits, ${r.appends.length} appends`);
  check("…and re-stamps who changed it",
    r.edits.some((e) => e.header === "UpdatedBy" && e.value === BY));
  check("…counted as changed, not added",
    r.summary.changed === 1 && r.summary.added === 0);
}

/* ── An unchanged answer writes NOTHING ──────────────────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "pitch", "Same")];
  const r = run(rows, [field("pitch")], answers({ pitch: ["Same"] }));
  check("re-saving an unchanged answer is a no-op",
    r.edits.length === 0 && r.appends.length === 0);
}

/* ── Clearing RETIRES, never deletes ─────────────────────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "pitch", "Something")];
  const r = run(rows, [field("pitch")], answers({ pitch: [""] }));
  check("clearing sets Active=FALSE",
    r.edits.some((e) => e.header === "Active" && e.value === "FALSE"));
  check("…and never appends or deletes", r.appends.length === 0);
  check("…counted as cleared", r.summary.removed === 1);
}

/* ── Re-answering REUSES the retired row ─────────────────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "pitch", "Something", { active: false })];
  const r = run(rows, [field("pitch")], answers({ pitch: ["Something"] }));
  check("re-entering the same answer reactivates its row",
    r.appends.length === 0 &&
    r.edits.some((e) => e.header === "Active" && e.value === "TRUE"));
  check("…counted as restored", r.summary.restored === 1);
}
{
  nextRow = 0;
  const rows = [row("110", "pitch", "Old", { active: false })];
  const r = run(rows, [field("pitch")], answers({ pitch: ["Different"] }));
  check("a DIFFERENT answer reuses the retired row rather than growing the tab",
    r.appends.length === 0 &&
    r.edits.some((e) => e.header === "Value" && e.value === "Different") &&
    r.edits.some((e) => e.header === "Active" && e.value === "TRUE"));
}

/* ── Multi-select is a SET ───────────────────────────────────────────── */
{
  nextRow = 0;
  const rows = [
    row("110", "industries", "Manufacturing"),
    row("110", "industries", "Nonprofit"),
  ];
  const f = [field("industries", "multiselect")];
  const r = run(rows, f, answers({ industries: ["Manufacturing", "Retail"] }));
  check("an unticked choice is retired",
    r.edits.some((e) => e.header === "Active" && e.value === "FALSE"));
  check("a newly ticked choice is appended",
    r.appends.length === 1 && r.appends[0].Value === "Retail");
  check("a choice that stayed ticked is untouched",
    !r.edits.some((e) => e.rowIndex === 0 && e.header === "Value"));
  check("counts are right", r.summary.added === 1 && r.summary.removed === 1,
    JSON.stringify(r.summary));
}

/* ── Multi-select order is recorded ──────────────────────────────────── */
{
  nextRow = 0;
  const rows = [
    row("110", "industries", "A", { sortOrder: 0 }),
    row("110", "industries", "B", { sortOrder: 10 }),
  ];
  const r = run(rows, [field("industries", "multiselect")],
    answers({ industries: ["B", "A"] }));
  check("reordering rewrites SortOrder only",
    r.appends.length === 0 &&
    r.edits.filter((e) => e.header === "SortOrder").length === 2,
    `${r.edits.filter((e) => e.header === "SortOrder").length} sort edits`);
}

/* ── Clearing a whole multi-select ───────────────────────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "industries", "A"), row("110", "industries", "B")];
  const r = run(rows, [field("industries", "multiselect")], answers({ industries: [] }));
  check("unticking everything retires every row, deletes none",
    r.appends.length === 0 &&
    r.edits.filter((e) => e.header === "Active" && e.value === "FALSE").length === 2);
}

/* ── FIELDS NOT ON THIS FORM ARE NOT TOUCHED ─────────────────────────── */
/*
 * The one that would be silent and awful: a member's answer to a field that has
 * since moved to another form must survive a save here. "Absent from the
 * payload" must never mean "cleared".
 */
{
  nextRow = 0;
  const rows = [
    row("110", "pitch", "Keep me"),
    row("110", "retired_field", "Keep me too"),
  ];
  const r = run(rows, [field("pitch")], answers({ pitch: ["Keep me"] }));
  check("an answer to a field NOT on this form is left alone",
    r.edits.length === 0 && r.appends.length === 0,
    JSON.stringify(r.edits));
}

/* ── ANOTHER MEMBER'S ANSWERS ARE NOT TOUCHED ────────────────────────── */
{
  nextRow = 0;
  const rows = [row("999", "pitch", "Someone else's")];
  const r = run(rows, [field("pitch")], answers({ pitch: ["Mine"] }));
  check("another profile's row is never edited",
    r.edits.length === 0 && r.appends.length === 1 &&
    r.appends[0].ProfileID === "110");
}

/* ── ValueID allocation ──────────────────────────────────────────────── */
{
  nextRow = 0;
  const rows = [
    row("999", "x", "a", { valueId: "7" }),
    row("110", "y", "b", { valueId: "3" }),
  ];
  const r = run(rows, [field("p1"), field("p2")],
    answers({ p1: ["one"], p2: ["two"] }));
  check("new ids continue from the highest in the WHOLE tab",
    r.appends.map((a) => a.ValueID).join(",") === "8,9",
    r.appends.map((a) => a.ValueID).join(","));
}

/* ── File fields: untouched unless the action says so ────────────────── */
{
  nextRow = 0;
  const rows = [row("110", "logo", "https://x.blob.vercel-storage.com/old.png")];
  const r = run(rows, [field("logo", "file")], answers({}));
  check("a file field ABSENT from the answers is never written or cleared",
    r.edits.length === 0 && r.appends.length === 0);
}
{
  nextRow = 0;
  const rows = [row("110", "logo", "https://x.blob.vercel-storage.com/old.png")];
  const r = run(rows, [field("logo", "file")], answers({ logo: ["https://x.blob.vercel-storage.com/new.png"] }));
  check("a new upload overwrites the logo row in place",
    r.appends.length === 0 &&
    r.edits.some((e) => e.header === "Value" && e.value.endsWith("/new.png")));
}
{
  nextRow = 0;
  const rows = [row("110", "logo", "https://x.blob.vercel-storage.com/old.png")];
  const r = run(rows, [field("logo", "file")], answers({ logo: [] }));
  check("Remove retires the logo row rather than deleting it",
    r.appends.length === 0 &&
    r.edits.some((e) => e.header === "Active" && e.value === "FALSE"));
}
{
  nextRow = 0;
  const r = run([], [field("logo", "file")], answers({ logo: ["https://x.blob.vercel-storage.com/a.png"] }));
  check("a first upload appends one row", r.appends.length === 1);
}

/* ── Whitespace ──────────────────────────────────────────────────────── */
{
  nextRow = 0;
  const r = run([], [field("pitch")], answers({ pitch: ["   "] }));
  check("a whitespace-only answer counts as empty",
    r.appends.length === 0 && r.edits.length === 0);
  nextRow = 0;
  const r2 = run([], [field("pitch")], answers({ pitch: ["  hello  "] }));
  check("a real answer is trimmed", r2.appends[0]?.Value === "hello");
}

/* ── A single field with stray extra rows (after a type change) ──────── */
{
  nextRow = 0;
  const rows = [row("110", "pitch", "A"), row("110", "pitch", "B")];
  const r = run(rows, [field("pitch")], answers({ pitch: ["A"] }));
  check("extra active rows on a single-value field are retired",
    r.edits.some((e) => e.rowIndex === 1 && e.header === "Active" && e.value === "FALSE"));
}

/* ── The summary sentence ────────────────────────────────────────────── */
check("summary reads naturally",
  summarize({ added: 2, changed: 1, removed: 0, restored: 0 }) === "2 added, 1 changed.",
  summarize({ added: 2, changed: 1, removed: 0, restored: 0 }));

console.log(failures === 0
  ? "\nAll value checks passed.\n"
  : `\n${failures} value check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
