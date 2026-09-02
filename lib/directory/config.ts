/**
 * Where the directory data lives. Two env vars, both server-side.
 *
 * DIRECTORY_SHEET_ID accepts either a bare spreadsheet ID or a full Google
 * Sheets URL, because the value people actually have to hand is the URL from
 * the address bar — asking them to slice the ID out of it is one more chance to
 * paste the wrong 44 characters.
 *
 * DIRECTORY_TAB is optional: blank means "the first tab", which is what the ITA
 * export produces (its tab is renamed on every re-export, so pinning a name
 * would break on the next one).
 */

/** Pull the spreadsheet ID out of a full Sheets URL, or pass an ID through. */
export function sheetIdFrom(value: string | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  const m = v.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : v;
}

export function directorySheetId(): string {
  return sheetIdFrom(process.env.DIRECTORY_SHEET_ID);
}

/** Blank ⇒ read the spreadsheet's first tab. */
export function directoryTab(): string {
  return (process.env.DIRECTORY_TAB ?? "").trim();
}

/** Human-facing link to the source sheet, or null when unconfigured. */
export function directorySheetUrl(): string | null {
  const id = directorySheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
