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

/**
 * Blank ⇒ read the spreadsheet's only tab.
 *
 * Once companion tabs exist this must be SET: `firstTabTitle` refuses a
 * multi-tab workbook rather than guessing, because dragging a tab left in
 * Sheets would otherwise repoint the directory at the wrong data and the page
 * would still render.
 */
export function directoryTab(): string {
  return (process.env.DIRECTORY_TAB ?? "").trim();
}

/**
 * The tab holding `profilerelations` — the profile-to-profile links.
 *
 * Optional by design. Absent or unreadable ⇒ the directory is members only,
 * exactly as before. A relations tab is an ADDITION; a problem reading it must
 * never take down the member list, which is the thing people came for.
 */
export function relationsTab(): string {
  return (process.env.DIRECTORY_RELATIONS_TAB ?? "").trim();
}

/** Human-facing link to the source sheet, or null when unconfigured. */
export function directorySheetUrl(): string | null {
  const id = directorySheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
