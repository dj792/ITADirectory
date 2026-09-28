import fs from "fs";
import path from "path";
import {
  getAccessToken,
  readTab,
  resolveTab,
  useMock,
  type SheetTab,
} from "@/lib/sheets-core";
import { directorySheetId } from "@/lib/directory/config";
import {
  fieldOptionsTab,
  fieldsByTypeTab,
  fieldsTab,
  formTypesTab,
  profileFieldValuesTab,
} from "@/lib/tabs";
import { parseFieldValues, parseFormConfig, valuesByProfile } from "./parse";
import type { FieldValue, FormConfig } from "./types";

/**
 * SERVER-ONLY. Loads ITA's form configuration from the four config tabs.
 *
 * ── A MISSING CONFIG IS NOT AN ERROR ──────────────────────────────────────
 *
 * The tabs exist but are empty today, and they will be half-filled while ITA
 * seeds them. So every read degrades: an absent tab, an empty tab or a failed
 * read all produce an EMPTY configuration with the reason recorded in
 * `problems`, never an exception. The directory is the product; custom fields
 * are an addition to it, and an addition must never be able to take down the
 * member search — the same rule the relations tab follows.
 *
 * `loaded` distinguishes "read nothing" from "never looked", which the admin
 * screen needs in order to say something true.
 */

export type LoadedFormConfig = FormConfig & {
  /** False when the tabs could not be read at all. */
  loaded: boolean;
  /** Where it came from, for the admin screen and diagnostics. */
  source: "sheet" | "fixture" | "unconfigured" | "error";
  error?: string;
};

const EMPTY = (
  source: LoadedFormConfig["source"],
  error?: string
): LoadedFormConfig => ({
  levelToType: new Map(),
  levels: [],
  defaultType: "DEFAULT",
  fields: new Map(),
  options: new Map(),
  forms: new Map(),
  problems: error ? [error] : [],
  loaded: false,
  source,
  error,
});

/**
 * Short in-process cache. The config changes when a human edits a sheet —
 * minutes apart at most — while the pages that read it re-render per request,
 * against a 60-reads-per-minute budget shared with the Aligned KPIs app. Four
 * tabs per load makes that budget the binding constraint, not the latency.
 */
let cache: { at: number; data: LoadedFormConfig } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Drop the cache so an admin edit shows up immediately after saving. */
export function invalidateFormConfig(): void {
  cache = null;
}

/* ------------------------------------------------------------- fixture --
 * The SEED TSVs in `data/forms/` double as the local fixture, exactly the way
 * `ProfileView.csv` does for the directory: it is the same data that gets
 * pasted into the tabs, so the forms can be built and reviewed before — or
 * instead of — configuring a sheet.
 *
 * Used ONLY when there is no sheet to read. A configured sheet always wins, so
 * this can never quietly shadow the real configuration. Gitignored, and simply
 * absent in production.
 */

const FIXTURE_DIR = path.join(process.cwd(), "data", "forms");
const FIXTURE_FILES: Record<keyof FormTabs, string> = {
  formTypes: "FormTypes.tsv",
  fields: "Fields.tsv",
  fieldsByType: "FieldsbyType.tsv",
  fieldOptions: "FieldOptions.tsv",
};

type FormTabs = {
  formTypes: SheetTab;
  fields: SheetTab;
  fieldsByType: SheetTab;
  fieldOptions: SheetTab;
};

/** Tab-separated, because that is the form the seed is pasted in. */
function readTsv(file: string): SheetTab {
  const p = path.join(FIXTURE_DIR, file);
  if (!fs.existsSync(p)) return { headers: [], rows: [] };
  const lines = fs
    .readFileSync(p, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  return { headers: lines[0].split("\t"), rows: lines.slice(1).map((l) => l.split("\t")) };
}

function loadFixture(): LoadedFormConfig | null {
  if (!fs.existsSync(path.join(FIXTURE_DIR, FIXTURE_FILES.fields))) return null;
  const parsed = parseFormConfig({
    formTypes: readTsv(FIXTURE_FILES.formTypes),
    fields: readTsv(FIXTURE_FILES.fields),
    fieldsByType: readTsv(FIXTURE_FILES.fieldsByType),
    fieldOptions: readTsv(FIXTURE_FILES.fieldOptions),
  });
  return { ...parsed, loaded: true, source: "fixture" };
}

/** An absent tab reads as empty rather than throwing — see the note above. */
async function readOrEmpty(
  token: string,
  sheetId: string,
  name: string,
  problems: string[]
): Promise<SheetTab> {
  try {
    const resolved = await resolveTab(token, sheetId, name, `the ${name} tab`);
    return await readTab(token, sheetId, resolved);
  } catch (err) {
    problems.push(
      `Could not read the "${name}" tab: ${err instanceof Error ? err.message : String(err)}`
    );
    return { headers: [], rows: [] };
  }
}

/**
 * @param fresh Skip the cache. **The admin screens always pass this.**
 *
 * The cache lives in one server instance's memory, and Vercel runs several. So
 * a save invalidates the cache on the instance that handled the POST, and the
 * redirect that follows can land on a DIFFERENT instance still holding a
 * five-minute-old copy — the edit is in the sheet, the screen shows the old
 * value, and the natural response is to save again. Admin traffic is a handful
 * of requests from a handful of people, so paying four Google reads for a
 * correct answer is the right trade there; the member-facing directory keeps
 * the cache, where the volume is and where a few minutes of staleness in a form
 * definition costs nothing.
 */
export async function loadFormConfig(
  { fresh = false }: { fresh?: boolean } = {}
): Promise<LoadedFormConfig> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.data;

  const sheetId = directorySheetId();
  if (useMock() || !sheetId) {
    const fixture = loadFixture();
    const data =
      fixture ??
      EMPTY(
        "unconfigured",
        "The sheet isn't configured and no local seed is present, so no custom fields are loaded."
      );
    cache = { at: Date.now(), data };
    return data;
  }

  try {
    const token = await getAccessToken();
    const problems: string[] = [];
    // Sequential, not parallel: four reads at once against a shared 60/min
    // bucket is how a page load turns into a rate-limit error that reads as a
    // data problem. `readTab` caches, so the usual cost is zero anyway.
    const formTypes = await readOrEmpty(token, sheetId, formTypesTab(), problems);
    const fields = await readOrEmpty(token, sheetId, fieldsTab(), problems);
    const fieldsByType = await readOrEmpty(token, sheetId, fieldsByTypeTab(), problems);
    const fieldOptions = await readOrEmpty(token, sheetId, fieldOptionsTab(), problems);

    const parsed = parseFormConfig({ formTypes, fields, fieldsByType, fieldOptions });
    const data: LoadedFormConfig = {
      ...parsed,
      problems: [...problems, ...parsed.problems],
      loaded: true,
      source: "sheet",
    };
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    const data = EMPTY(
      "error",
      err instanceof Error ? err.message : String(err)
    );
    cache = { at: Date.now(), data };
    return data;
  }
}

/* ------------------------------------------------------------- the data -- */

let valueCache: { at: number; data: FieldValue[] } | null = null;

export function invalidateFieldValues(): void {
  valueCache = null;
}

/**
 * Every stored answer. Read whole and indexed in memory rather than queried per
 * profile: at ITA's scale this is a few thousand short rows, and a per-profile
 * read would spend the Sheets quota on exactly the page people open most.
 */
export async function loadFieldValues(): Promise<FieldValue[]> {
  if (valueCache && Date.now() - valueCache.at < TTL_MS) return valueCache.data;

  const sheetId = directorySheetId();
  if (useMock() || !sheetId) return [];

  try {
    const token = await getAccessToken();
    const problems: string[] = [];
    const tab = await readOrEmpty(token, sheetId, profileFieldValuesTab(), problems);
    const data = parseFieldValues(tab);
    valueCache = { at: Date.now(), data };
    return data;
  } catch {
    // Answers are an addition to a member's page; failing to read them must
    // not take the page down.
    return [];
  }
}

/** Answers for one profile, keyed by field id. */
export async function fieldValuesFor(
  profileId: string
): Promise<Map<string, string[]>> {
  const all = await loadFieldValues();
  return valuesByProfile(all).get(profileId) ?? new Map();
}
