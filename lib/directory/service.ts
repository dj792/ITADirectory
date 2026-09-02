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

  const data = useMock() ? loadFromFixture() : await loadFromSheet();
  cache = { at: Date.now(), data };
  return data;
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
      facets: { membershipLevel: [], category: [] },
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
