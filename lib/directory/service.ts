import fs from "fs";
import path from "path";
import { getAccessToken, readTab, firstTabTitle, useMock } from "@/lib/sheets-core";
import { directorySheetId, directoryTab, directorySheetUrl } from "./config";
import { parseCsv } from "./csv";
import { facetsOf, parseDirectory } from "./parse";
import type { Directory } from "./types";

/**
 * SERVER-ONLY. Loads the directory, from Google Sheets when it's configured and
 * from the local CSV fixture when it isn't.
 *
 * The fixture is not a toy: it is the same ProfileSelectorData export the sheet
 * is built from, so the whole UI can be built and reviewed before the sheet is
 * shared with the service account — and a Google outage degrades to
 * yesterday's list rather than an error page. It is gitignored (real member
 * emails) and simply absent in production, where the sheet is configured.
 */

const FIXTURE = path.join(process.cwd(), "data", "ProfileSelectorData.csv");

/**
 * In-process cache. Next re-renders the search page on every request; without
 * this, each one is a Google round trip against a 60-per-minute budget shared
 * with the Aligned KPIs app. `readTab` caches too — this saves the token check
 * and the parse as well.
 */
let cache: { at: number; data: Directory } | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function loadDirectory(): Promise<Directory> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const data = useMock() ? loadFromFixture() : await loadFromSheetOrFallBack();
  cache = { at: Date.now(), data };
  return data;
}

/**
 * A failed sheet read must not take the page down.
 *
 * The most likely cause by far is the sheet not being shared with the service
 * account yet — Google answers that with a 404 "Requested entity was not
 * found", which is indistinguishable from a typo'd ID and says nothing about
 * permissions. Quota exhaustion and a malformed key land here too.
 *
 * So: fall back to the fixture if one is present, keep serving, and record WHY
 * on `source.error` so the footer can say the list isn't live. The page stating
 * plainly that it's showing local data beats both a 500 and — worse — silently
 * passing a stale local file off as the membership.
 *
 * The failure is NOT cached for the usual 5 minutes by the caller's clock alone:
 * it is, deliberately, so a Google outage doesn't turn every page view into
 * another failing round trip. Fix the cause and the next read after the TTL
 * picks it up; `invalidateDirectory()` forces it sooner.
 */
async function loadFromSheetOrFallBack(): Promise<Directory> {
  try {
    return await loadFromSheet();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Directory sheet read failed:", message);

    const fallback = loadFromFixture();
    return {
      ...fallback,
      source: { ...fallback.source, error: explain(message) },
    };
  }
}

/**
 * Turn Google's message into the thing to actually go and do. "Requested entity
 * was not found" is technically accurate and practically useless — it's what
 * you get for both a wrong ID and an unshared sheet, and the second is far more
 * common.
 */
function explain(message: string): string {
  if (/not found|404/i.test(message)) {
    return (
      `The directory sheet couldn't be read — most likely it hasn't been shared ` +
      `with ${process.env.GOOGLE_SA_EMAIL || "the service account"} (Viewer access), ` +
      `or DIRECTORY_SHEET_ID points somewhere else.`
    );
  }
  if (/403|permission/i.test(message)) {
    return (
      `Access to the directory sheet was refused — share it (Viewer) with ` +
      `${process.env.GOOGLE_SA_EMAIL || "the service account"}.`
    );
  }
  if (/rate limit|429|quota/i.test(message)) {
    return "Google Sheets rate limit reached. This clears on its own within a minute.";
  }
  if (/DECODER|private key|token exchange/i.test(message)) {
    return "The Google service-account key looks malformed — check GOOGLE_SA_PRIVATE_KEY.";
  }
  return `The directory sheet couldn't be read: ${message}`;
}

/** Drop the cache — for a future "refresh" button or webhook. */
export function invalidateDirectory(): void {
  cache = null;
}

async function loadFromSheet(): Promise<Directory> {
  const id = directorySheetId();
  const token = await getAccessToken();
  // Blank DIRECTORY_TAB means "whatever the first tab is called this week".
  const tab = directoryTab() || (await firstTabTitle(token, id));
  const grid = await readTab(token, id, tab);
  const members = parseDirectory(grid);
  return {
    members,
    facets: facetsOf(members),
    source: { kind: "sheet", sheetUrl: directorySheetUrl(), readAt: new Date().toISOString() },
  };
}

function loadFromFixture(): Directory {
  if (!fs.existsSync(FIXTURE)) {
    return {
      members: [],
      facets: { membershipLevel: [], category: [], lastEvent: [] },
      source: { kind: "fixture", sheetUrl: null, readAt: new Date().toISOString() },
    };
  }
  const grid = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
  const members = parseDirectory(grid);
  return {
    members,
    facets: facetsOf(members),
    source: { kind: "fixture", sheetUrl: null, readAt: new Date().toISOString() },
  };
}
