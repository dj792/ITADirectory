/**
 * Turning whatever the export puts in a date cell into "January 2019".
 *
 * CLIENT-SAFE — imports nothing. The card renders the label in the browser.
 *
 * A date cell is not one shape. Across exports of this kind we've seen the same
 * column arrive as US "1/15/2019", ISO "2019-01-15", written "January 15, 2019",
 * and — the one that bites — a bare SHEETS SERIAL like "43480", which is what
 * Google returns for a real date when a grid is read unformatted. The sibling
 * Aligned KPIs app lost an afternoon to exactly that: a parser that only knew
 * strings couldn't see a serial at all and reported the column as missing.
 *
 * So this handles all of them, and refuses rather than guesses when a value is
 * genuinely ambiguous.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Sheets' day 0 is 1899-12-30 (its leap-year bug is baked into the epoch). */
const SHEETS_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * Serial range: 10000 (1927-05-18) to 80000 (2119).
 *
 * The floor is 10000 to keep serials and YEARS from colliding. "2019" is both a
 * valid four-digit year and a valid serial (which would be July 1905) — and a
 * lone "2019" in a Member Since column is obviously the year. Any real member
 * date is a five-digit serial: 1970 is 25569, 2026 is 46023. So five digits or
 * more is a serial, four digits is a year, and the two can never be confused.
 *
 * The cost is that a genuine serial below 10000 — a date before May 1927 —
 * won't parse. That's the right trade: this is an IT association founded well
 * after that, and a wrong date shown confidently is worse than a raw value
 * shown honestly (unparseable text falls through to the screen as written).
 */
const SERIAL_MIN = 10000;
const SERIAL_MAX = 80000;

export type YearMonth = { year: number; month: number }; // month is 1-12

/**
 * Parse a date cell to year + month, or null when it can't be read confidently.
 * The DAY is deliberately discarded — the directory shows month and year, and
 * carrying a day invites someone to render a precision the source may not have.
 */
export function parseYearMonth(raw: string): YearMonth | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // 1. A lone four-digit year. MUST be tested before the serial branch: "2019"
  //    satisfies both, and it is a year every time in a column like this.
  const yearOnly = s.match(/^((?:19|20)\d{2})$/);
  if (yearOnly) return { year: Number(yearOnly[1]), month: 0 };

  // 2. Any other bare number is a Sheets serial (five digits or more, per
  //    SERIAL_MIN — so it can't collide with the year case above).
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n < SERIAL_MIN || n > SERIAL_MAX) return null;
    const d = new Date(SHEETS_EPOCH_UTC + Math.floor(n) * 86_400_000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  // 3. ISO-ish: 2019-01-15, 2019/01/15, or just 2019-01.
  const iso = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    return validMonth(month) ? { year, month } : null;
  }

  // 4. Month name anywhere, with a 4-digit year: "January 15, 2019", "Jan 2019".
  const named = s.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b[^0-9]*(\d{1,2})?[^0-9]*\b((?:19|20)\d{2})\b/i
  );
  if (named) {
    const month =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
        .indexOf(named[1].toLowerCase()) + 1;
    return { year: Number(named[3]), month };
  }

  // 5. Slash/dash order: 1/15/2019 or 15/1/2019.
  const parts = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (parts) {
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const year = fourDigitYear(Number(parts[3]));
    // US M/D is the default because that's what this CRM exports — but a first
    // number above 12 can only be a day, so read it as D/M rather than
    // producing a nonsense month. 3/4/2019 stays ambiguous and is read as
    // March, which is the documented assumption, not a coin flip.
    if (a > 12 && validMonth(b)) return { year, month: b };
    if (validMonth(a)) return { year, month: a };
    return null;
  }

  return null;
}

function validMonth(m: number): boolean {
  return Number.isInteger(m) && m >= 1 && m <= 12;
}

/** "19" → 2019, "89" → 1989. Two-digit years split at 70, the usual convention. */
function fourDigitYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

/**
 * The display string: "January 2019", or just "2019" when only a year is known.
 *
 * When the value can't be parsed at all it is returned AS WRITTEN rather than
 * dropped. The source is a hand-maintained sheet; a cell reading "Founding
 * member" is information, and silently hiding it would make a data problem
 * invisible. Only a genuinely empty cell produces an empty label.
 */
export function monthYearLabel(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const ym = parseYearMonth(s);
  if (!ym) return s;
  if (!ym.month) return String(ym.year);
  return `${MONTHS[ym.month - 1]} ${ym.year}`;
}
