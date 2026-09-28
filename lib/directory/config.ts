/**
 * Where the directory data lives.
 *
 * ONE env var now: `DIRECTORY_SHEET_ID`. It accepts either a bare spreadsheet
 * ID or a full Google Sheets URL, because the value people actually have to
 * hand is the URL from the address bar — asking them to slice the ID out of it
 * is one more chance to paste the wrong 44 characters.
 *
 * Tab names moved to `lib/tabs.ts` on 28 Sep 2026 and are hard-coded there.
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

/*
 * Tab names now live in `lib/tabs.ts`, hard-coded with an env override — see
 * the long note there for why. These two re-exports keep the directory modules
 * importing from their own config, so nothing outside had to change.
 *
 * The relations tab stays OPTIONAL in behavior: absent or unreadable ⇒ the
 * directory is members only, exactly as before. A relations tab is an ADDITION;
 * a problem reading it must never take down the member list.
 */
export { profilesTab as directoryTab, relationsTab } from "@/lib/tabs";

/** Human-facing link to the source sheet, or null when unconfigured. */
export function directorySheetUrl(): string | null {
  const id = directorySheetId();
  return id ? `https://docs.google.com/spreadsheets/d/${id}/edit` : null;
}
