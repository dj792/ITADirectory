import type { SheetTab } from "@/lib/sheets-core";

/**
 * Minimal RFC-4180 CSV reader — quoted fields, embedded commas, doubled quotes,
 * and CRLF. It exists to read ONE local development fixture, which is why it's
 * written out rather than pulled from npm: a dependency in package.json would
 * ship to production for a file production never reads.
 *
 * It returns the same `{ headers, rows }` shape as a Sheets read, so the parser
 * downstream cannot tell the two sources apart — the fixture exercises the real
 * code path, not a parallel one.
 *
 * The case that matters: "Macdonald, Taylor" is a single quoted field with a
 * comma in it. A naive `line.split(",")` shifts every column after it by one,
 * quietly, which is exactly the kind of bug that reaches production.
 */
export function parseCsv(text: string): SheetTab {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // an escaped quote inside a quoted field
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++; // swallow the \n of a \r\n pair
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // A file that doesn't end in a newline still has one last field.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const clean = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (clean.length === 0) return { headers: [], rows: [] };
  return { headers: clean[0].map((h) => h.trim()), rows: clean.slice(1) };
}
