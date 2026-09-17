import { monthYearLabel } from "./date";
import type { Member } from "./types";

/**
 * Turning search results into a CSV — CLIENT-SAFE, so the file is built from
 * the list already in the browser and matches exactly what's on screen.
 *
 * The obligation TRAVELS WITH THE FILE. The disclaimer is the first line of the
 * CSV, not only a checkbox someone clicked and forgot. A spreadsheet that gets
 * forwarded arrives with its terms attached; a consent dialog doesn't survive
 * the download folder.
 */

/**
 * Shown before the download and written into the file. One definition, so the
 * two can't drift — the wording someone agreed to must be the wording they
 * received.
 */
export const EXPORT_DISCLAIMER =
  "You agree this list is the property of ITA, and you agree NOT to share the list.";

/**
 * Escape one CSV field.
 *
 * Two separate problems, both handled here:
 *
 * 1. **CSV structure** — quotes, commas and newlines. Company names in this
 *    data contain commas ("Frank, Rimerman + Co. LLP") and titles contain them
 *    too, so this isn't hypothetical.
 * 2. **SPREADSHEET FORMULA INJECTION** — a value starting `=`, `+`, `-` or `@`
 *    is executed as a formula by Excel and Sheets. A CRM field is free text
 *    that people type into, so a title beginning "=" would run on the machine
 *    of whoever opens the export. Prefixing with an apostrophe makes it text;
 *    the cell still reads correctly to a human.
 */
export function csvField(value: string): string {
  let v = (value ?? "").toString();
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/["\n\r,]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** The columns, in reading order. One place, so header and row can't diverge. */
const COLUMNS: { header: string; value: (m: Member) => string }[] = [
  { header: "Name", value: (m) => m.name },
  {
    header: "Type",
    value: (m) => (m.isMember ? "ITA member" : "At a member organization"),
  },
  {
    header: "Organization",
    value: (m) => (m.isMember ? m.organization : m.relatedOrgName || m.organization),
  },
  { header: "Title", value: (m) => m.titleAtOrg },
  { header: "Membership level", value: (m) => (m.isMember ? m.membershipLevel : "") },
  { header: "Profile status", value: (m) => (m.isMember ? m.status : "") },
  { header: "Member since", value: (m) => (m.isMember ? monthYearLabel(m.memberSince) : "") },
  { header: "Email", value: (m) => m.email },
  { header: "Phone", value: (m) => m.phone },
  { header: "Website", value: (m) => m.website },
  { header: "City", value: (m) => m.city },
  { header: "State", value: (m) => m.state },
  { header: "ProfileID", value: (m) => m.id },
];

/**
 * The whole file. `\r\n` line endings because that's what RFC 4180 specifies
 * and what Excel on Windows expects; the caller adds a BOM so Excel reads the
 * accented names as UTF-8 rather than mangling them.
 */
export function resultsToCsv(members: Member[], searchSummary: string): string {
  const lines: string[] = [];

  // Row 1: the terms. Row 2: what this file is and when. Then the table.
  lines.push(csvField(EXPORT_DISCLAIMER));
  lines.push(
    csvField(
      `ITA Member Directory · ${members.length} ${
        members.length === 1 ? "result" : "results"
      }` +
        (searchSummary ? ` · ${searchSummary}` : "") +
        ` · downloaded ${new Date().toISOString().slice(0, 10)}`
    )
  );
  lines.push("");
  lines.push(COLUMNS.map((c) => csvField(c.header)).join(","));
  for (const m of members) {
    lines.push(COLUMNS.map((c) => csvField(c.value(m))).join(","));
  }
  return lines.join("\r\n");
}

/** A filename that sorts and says what it is. */
export function exportFilename(): string {
  return `ITA-member-directory-${new Date().toISOString().slice(0, 10)}.csv`;
}
