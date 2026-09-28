/**
 * Fixture check for the form configuration — runs the SEED TSVs that were
 * generated from ITA's document through the real parser:
 *
 *   npm run check
 *
 * Same convention as the other `*.check.ts` files: bare Node, no test
 * framework, skips cleanly when the fixtures aren't present.
 *
 * WHY THIS ONE MATTERS MORE THAN THE OTHERS. The directory parser reads a
 * machine-generated SQL export; these four tabs are typed by hand in Google
 * Sheets by ITA staff, so the interesting failures aren't "the format changed",
 * they're "someone typed Visible instead of Visibility", "two rows claim the
 * same FieldID", "a field points at an option set that doesn't exist". Those
 * must produce a REPORTED problem and a working config, never an exception and
 * never a silently empty form.
 */
import fs from "fs";
import path from "path";
import {
  parseFormConfig,
  parseFieldValues,
  valuesByProfile,
  formFor,
  visibleTo,
  isReservedField,
} from "./parse";
import type { SheetTab } from "@/lib/sheets-core";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const DIR = path.join(process.cwd(), "data", "forms");

/** A TSV file as a SheetTab. Tab-separated, because that's what pastes. */
function tsv(name: string): SheetTab {
  const p = path.join(DIR, name);
  if (!fs.existsSync(p)) return { headers: [], rows: [] };
  const lines = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n").split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  return {
    headers: lines[0].split("\t"),
    rows: lines.slice(1).map((l) => l.split("\t")),
  };
}

if (!fs.existsSync(path.join(DIR, "Fields.tsv"))) {
  console.log("form seed fixtures not present — skipping (fine on a clean checkout)");
  process.exit(0);
}

const tabs = {
  formTypes: tsv("FormTypes.tsv"),
  fields: tsv("Fields.tsv"),
  fieldsByType: tsv("FieldsbyType.tsv"),
  fieldOptions: tsv("FieldOptions.tsv"),
};
const config = parseFormConfig(tabs);

console.log(
  `\n${config.fields.size} fields · ${config.forms.size} forms · ` +
    `${config.options.size} option sets · ${config.problems.length} problems\n`
);
for (const p of config.problems) console.log(`  ·    ${p}`);

/* ── The seed parses cleanly ─────────────────────────────────────────── */
check("the seed configuration has NO problems", config.problems.length === 0,
  config.problems[0] ?? "");
check("every application type built a form",
  ["TP", "CR", "CAS", "ITL", "DEFAULT"].every((t) => config.forms.has(t)),
  [...config.forms.keys()].join(", "));
check("every form has fields",
  [...config.forms.values()].every((f) => f.fields.length > 0));

/* ── Every membership level reaches a form ───────────────────────────── */
/*
 * The whole point of the FormTypes tab. 21 of 203 members carry a level the
 * document defines no form for, and 12 carry no level at all — all of them must
 * still open something rather than an empty page.
 */
const LEVELS = [
  "Technology Partner - Platinum", "Technology Partner - Gold",
  "Technology Partner - Silver", "Consultants and Resellers (CR)",
  "Client Accounting Services (CAS)",
  "Internal Technology Leaders of CPA Firms (ITL)",
  "Consultants to the IT Profession (CTP)", "Members in Transition (MIT)",
  "Strategic Holding Partner (SHP)", "",
];
check("EVERY membership level resolves to a non-empty form",
  LEVELS.every((l) => formFor(config, l, true).fields.length > 0),
  LEVELS.filter((l) => formFor(config, l, true).fields.length === 0)
    .map((l) => l || "(blank)").join(" · "));
check("a level with no mapping falls back to the default form",
  formFor(config, "Something ITA Invents Next Year", true).fields.length > 0);
check("the three TP tiers share ONE form",
  new Set(["Platinum", "Gold", "Silver"].map(
    (t) => formFor(config, `Technology Partner - ${t}`, true).applicationType
  )).size === 1);

/* ── Level matching is case-insensitive, but display keeps ITA's words ─ */
check("membership level matching ignores case",
  formFor(config, "consultants and resellers (cr)", true).applicationType === "CR");
check("the displayable level list keeps ITA's own capitalization",
  config.levels.some((l) => l.label === "Consultants and Resellers (CR)"),
  config.levels.map((l) => l.label).slice(0, 3).join(" · "));
check("…and every mapped level appears in it",
  config.levels.length === config.levelToType.size,
  `${config.levels.length} vs ${config.levelToType.size}`);

/* ── AppliesTo splits org from individual ────────────────────────────── */
const orgForm = formFor(config, "Technology Partner - Gold", true);
const indForm = formFor(config, "Technology Partner - Gold", false);
check("an organization is offered more fields than an individual",
  orgForm.fields.length > indForm.fields.length,
  `${orgForm.fields.length} vs ${indForm.fields.length}`);
check("a logo upload is offered to organizations only",
  orgForm.fields.some((f) => f.id === "logo") &&
  !indForm.fields.some((f) => f.id === "logo"));

/* ── Per-type label overrides (the reason FieldsbyType exists) ────────── */
const label = (type: string, id: string) =>
  [...(config.forms.get(type)?.fields ?? [])].find((f) => f.id === id)?.label ?? "";
check('CAS relabels location_count to "Number of CAS Locations"',
  label("CAS", "location_count") === "Number of CAS Locations",
  label("CAS", "location_count"));
check('ITL relabels the same field to "Number of Offices"',
  label("ITL", "location_count") === "Number of Offices",
  label("ITL", "location_count"));
check("an un-overridden field keeps its default label",
  label("CR", "location_count") === "Number of Locations",
  label("CR", "location_count"));

/* ── THE SECURITY INVARIANT ──────────────────────────────────────────── */
/*
 * A staff-only field must never be searchable. Facet a staff field and its
 * value leaks without ever being displayed: filter on a revenue band and read
 * the answer off the result list. Forced at parse time, asserted here.
 */
const staffFields = [...config.fields.values()].filter((f) => f.visibility === "staff");
check("staff-only fields exist in the seed (so this test means something)",
  staffFields.length > 0, `${staffFields.length}`);
check("NO staff-only field is searchable",
  staffFields.every((f) => f.searchMode === "none"),
  staffFields.filter((f) => f.searchMode !== "none").map((f) => f.id).join(", "));

// And the parser FORCES it, rather than trusting the sheet.
{
  const sneaky = parseFormConfig({
    ...tabs,
    fields: {
      headers: ["FieldID", "Label", "DataType", "Visibility", "SearchMode", "Active"],
      rows: [["firm_revenue", "Firm Revenue", "text", "staff", "facet", "TRUE"]],
    },
  });
  check("a staff field marked facet is FORCED to none",
    sneaky.fields.get("firm_revenue")?.searchMode === "none");
  check("…and says so in problems",
    sneaky.problems.some((p) => /staff-only/i.test(p)));
}

/* ── Visibility filtering ────────────────────────────────────────────── */
{
  const all = orgForm.fields;
  const pub = visibleTo(all, "public");
  const mem = visibleTo(all, "members");
  const staff = visibleTo(all, "staff");
  check("public ⊆ members ⊆ staff",
    pub.length <= mem.length && mem.length <= staff.length,
    `${pub.length} / ${mem.length} / ${staff.length}`);
  check("nothing staff-only is public",
    pub.every((f) => f.visibility === "public"));
  check("firm revenue is NOT visible to members",
    !mem.some((f) => f.id === "firm_revenue"));
}

/* ── The additive-only rule is MECHANICAL ────────────────────────────── */
/*
 * ITA's document lists company name, address, phone, email and website on every
 * application form — all already supplied by the import. Seeding from that
 * document naively would create a second, editable copy of each, and the
 * directory would have two answers for one question.
 */
check("reserved column names are recognized",
  ["City", "Email Address", "Work Phone", "website", "Primary Contact Name",
   "Street Address", "Zip Code"].every((n) => isReservedField(n)));
// ITA's document writes these with a slash alternative, which is what someone
// seeding the tab would paste. Both halves have to collide.
check("a slash alternative still collides",
  ["Company / Firm Name", "Company / Firm Website"].every((n) => isReservedField(n)));
check("a genuinely new field is NOT reserved",
  !isReservedField("elevator_pitch") && !isReservedField("Speaker Topics"));
check("no seeded field duplicates an imported column",
  [...config.fields.values()].every((f) => !isReservedField(f.id) && !isReservedField(f.label)),
  [...config.fields.values()].filter((f) => isReservedField(f.id)).map((f) => f.id).join(", "));
{
  const dupe = parseFormConfig({
    ...tabs,
    fields: {
      headers: ["FieldID", "Label", "DataType", "Active"],
      rows: [["city", "City", "text", "TRUE"]],
    },
  });
  check("a field duplicating an imported column is REJECTED",
    !dupe.fields.has("city"));
  check("…and says why", dupe.problems.some((p) => /import/i.test(p)));
}

/* ── Options resolve, and conditionals point somewhere real ──────────── */
{
  const withOptions = [...config.forms.values()].flatMap((f) => f.fields)
    .filter((f) => f.dataType === "select" || f.dataType === "multiselect");
  check("every select/multiselect resolved a non-empty option list",
    withOptions.length > 0 && withOptions.every((f) => f.options.length > 0),
    withOptions.filter((f) => f.options.length === 0).map((f) => f.id).join(", "));
  const cond = [...config.forms.values()].flatMap((f) => f.fields)
    .filter((f) => f.showIfField);
  check("the conditional field from the document is wired",
    cond.some((f) => f.id === "channel_partners" && f.showIfField === "sells_via_channel"));
  check("every conditional points at a field on the SAME form",
    config.problems.every((p) => !/can never appear/.test(p)));
}

/* ── Sorting and grouping ────────────────────────────────────────────── */
check("fields come back in SortOrder",
  [...config.forms.values()].every((f) =>
    f.fields.every((x, n) => n === 0 || f.fields[n - 1].sortOrder <= x.sortOrder)));

/* ── A hand-typed sheet misbehaving must not throw ───────────────────── */
{
  const messy = parseFormConfig({
    formTypes: { headers: ["MembershipLevel", "ApplicationType"], rows: [["Gold", "TP"]] },
    fields: {
      headers: ["FieldID", "Label", "DataType", "Visibility", "SearchMode", "Active"],
      rows: [
        ["good_one", "Fine", "text", "public", "text", "TRUE"],
        ["bad_type", "Bad", "wobble", "sideways", "maybe", "TRUE"],
        ["good_one", "Duplicate", "text", "public", "none", "TRUE"],
        ["", "No id at all", "text", "public", "none", "TRUE"],
      ],
    },
    fieldsByType: {
      headers: ["ApplicationType", "FieldID", "SortOrder", "Active"],
      rows: [["TP", "good_one", "10", "TRUE"], ["TP", "ghost_field", "20", "TRUE"]],
    },
    fieldOptions: { headers: [], rows: [] },
  });
  check("a sheet full of typos still parses", messy.fields.has("good_one"));
  check("an unknown DataType falls back to text",
    messy.fields.get("bad_type")?.dataType === "text");
  check("an unknown Visibility falls back to members (not public)",
    messy.fields.get("bad_type")?.visibility === "members");
  check("a duplicate FieldID keeps the first", messy.fields.get("good_one")?.label === "Fine");
  check("a row with no FieldID is skipped", !messy.fields.has(""));
  check("a reference to a non-existent field is dropped",
    !messy.forms.get("TP")?.fields.some((f) => f.id === "ghost_field"));
  check("…and every one of those is reported", messy.problems.length >= 5,
    `${messy.problems.length} problems`);
}

/* ── Inactive rows are dropped; a blank Active is treated as active ──── */
{
  const act = parseFormConfig({
    ...tabs,
    fields: {
      headers: ["FieldID", "Label", "DataType", "Active"],
      rows: [
        ["on_explicit", "On", "text", "TRUE"],
        ["off_explicit", "Off", "text", "FALSE"],
        ["on_blank", "Blank means on", "text", ""],
      ],
    },
  });
  check("Active=FALSE drops the row", !act.fields.has("off_explicit"));
  check("a BLANK Active cell is treated as active", act.fields.has("on_blank"));
}

/* ── Stored values ───────────────────────────────────────────────────── */
{
  const values = parseFieldValues({
    headers: ["ValueID", "ProfileID", "FieldID", "Value", "SortOrder", "UpdatedAt", "UpdatedBy", "Active"],
    rows: [
      ["1", "110", "elevator_pitch", "We do things.", "0", "2026-09-28", "a@b.com", "TRUE"],
      ["2", "110", "industries_served", "Manufacturing", "20", "2026-09-28", "a@b.com", "TRUE"],
      ["3", "110", "industries_served", "Nonprofit", "10", "2026-09-28", "a@b.com", "TRUE"],
      ["4", "110", "awards", "Old award", "0", "2026-01-01", "a@b.com", "FALSE"],
      ["5", "999", "elevator_pitch", "Someone else.", "0", "2026-09-28", "a@b.com", "TRUE"],
    ],
  });
  check("inactive values are not returned", values.length === 4);
  const byProfile = valuesByProfile(values);
  const p110 = byProfile.get("110")!;
  check("values are grouped by profile", !!p110 && byProfile.has("999"));
  check("a multi-select returns several values",
    p110.get("industries_served")?.length === 2);
  check("multi-select values come back in SortOrder",
    p110.get("industries_served")?.[0] === "Nonprofit",
    (p110.get("industries_served") ?? []).join(" · "));
  check("a soft-deleted value is gone", !p110.has("awards"));
  check("one profile's answers never leak into another's",
    p110.get("elevator_pitch")?.[0] === "We do things.");
}

console.log(failures === 0
  ? "\nAll form checks passed.\n"
  : `\n${failures} form check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
