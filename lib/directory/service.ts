import fs from "fs";
import path from "path";
import {
  getAccessToken,
  readTab,
  resolveTab,
  listTabs,
  useMock,
  type SheetTab,
} from "@/lib/sheets-core";
import {
  directorySheetId,
  directoryTab,
  relationsTab,
  directorySheetUrl,
} from "./config";
import { parseCsv } from "./csv";
import { facetsOf, parseProfiles } from "./parse";
import { parseRelations, linksByOrg } from "./relations";
import { admit } from "./admit";
import type { Directory, RosterEntry } from "./types";

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

/**
 * Local fixtures, PRIMARY FIRST. `ProfileView.csv` is the SQL view that is now
 * the real source; `ProfileSelectorData.csv` is the older report export, kept
 * because the parser still reads it and because it's the only local copy of the
 * event columns. Whichever exists is used, so a checkout with either one works.
 */
const FIXTURES = [
  path.join(process.cwd(), "data", "ProfileView.csv"),
  path.join(process.cwd(), "data", "ProfileSelectorData.csv"),
];

function fixturePath(): string | null {
  return FIXTURES.find((p) => fs.existsSync(p)) ?? null;
}

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
  // `resolveTab` validates a configured name against the workbook's real tabs
  // and refuses a multi-tab workbook when nothing is configured, rather than
  // guessing which tab holds the members.
  const tab = await resolveTab(token, id, directoryTab(), "the members");
  const grid = await readTab(token, id, tab);

  /*
   * The relations tab is OPTIONAL and read defensively. It is an addition to
   * the directory; a missing or malformed relations tab must never take down
   * the member list, which is what people came for. Failure here costs the
   * rosters and the related individuals, and nothing else.
   *
   * The reason IS surfaced though — see `relationsError` below. Silently
   * serving a members-only directory when someone has configured a relations
   * tab is indistinguishable from the tab being empty, and that ambiguity is
   * exactly what cost a deploy cycle on the DIRECTORY_TAB naming.
   */
  let relationGrid = null;
  let relationsError: string | undefined;
  const relTab = relationsTab();
  if (relTab) {
    try {
      const resolved = await resolveTab(token, id, relTab, "the profile relations");
      relationGrid = await readTab(token, id, resolved);
    } catch (err) {
      relationsError = err instanceof Error ? err.message : String(err);
      console.error(`Relations tab "${relTab}" could not be read:`, relationsError);
    }
  }

  return compose(
    grid,
    relationGrid,
    {
      kind: "sheet",
      sheetUrl: directorySheetUrl(),
      readAt: new Date().toISOString(),
    },
    relationsError
  );
}

/**
 * Parse → join → admit, shared by the live and fixture paths so they can't
 * diverge. The fixture exercises the same code the sheet does.
 */
function compose(
  profileGrid: SheetTab,
  relationGrid: SheetTab | null,
  source: Omit<Directory["source"], "basis">,
  relationsError?: string
): Directory {
  const { profiles, basis } = parseProfiles(profileGrid);
  const byId = new Map(profiles.map((p) => [p.id, p]));

  const relations = relationGrid ? parseRelations(relationGrid) : [];
  const allRosters = linksByOrg(relations, (pid) => byId.get(pid)?.isOrganization ?? false);

  const { members, rosters, counts } = admit(profiles, allRosters);

  // Resolve each roster to what the page displays, so the member page needs no
  // second lookup and nothing unresolvable reaches the client.
  const resolved: Directory["rosters"] = {};
  for (const [orgId, links] of rosters) {
    const entries: RosterEntry[] = [];
    for (const l of links) {
      const p = byId.get(l.personId);
      if (!p || p.isOrganization) continue;
      entries.push({
        id: p.id,
        name: p.name,
        title: l.title,
        email: p.email,
        phone: p.phone,
        mainContact: l.mainContact,
        billingContact: l.billingContact,
      });
    }
    if (entries.length > 0) resolved[orgId] = entries;
  }

  return {
    members,
    facets: facetsOf(members),
    rosters: resolved,
    source: {
      ...source,
      relationsError,
      basis: { ...basis, relatedIndividuals: counts.relatedIndividuals },
    },
  };
}

const RELATIONS_FIXTURE = path.join(process.cwd(), "data", "ProfileRelations.csv");

function loadFromFixture(): Directory {
  const FIXTURE = fixturePath();
  if (!FIXTURE) {
    return {
      members: [],
      facets: { membershipLevel: [], status: [], lastEvent: [] },
      rosters: {},
      source: { kind: "fixture", sheetUrl: null, readAt: new Date().toISOString() },
    };
  }
  const grid = parseCsv(fs.readFileSync(FIXTURE, "utf8"));
  const relationGrid = fs.existsSync(RELATIONS_FIXTURE)
    ? parseCsv(fs.readFileSync(RELATIONS_FIXTURE, "utf8"))
    : null;
  return compose(grid, relationGrid, {
    kind: "fixture",
    sheetUrl: null,
    readAt: new Date().toISOString(),
  });
}
