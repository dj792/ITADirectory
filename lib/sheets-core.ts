import crypto from "crypto";

/**
 * Server-only Google Sheets core helpers — ported from the Aligned KPIs app
 * (`lib/sheets-core.ts`), trimmed to the READ path this app needs. Same service
 * account, same conventions, so behavior can't drift between the two products.
 *
 * SECURITY: uses the service-account private key (Node `crypto`) and must NEVER
 * be imported into a Client Component or the edge runtime (middleware /
 * auth.config).
 *
 * THE RULE: resolve every column by header NAME via `headerIndex`, never by a
 * fixed position. The ITA sheet is maintained by hand; columns will move.
 */

/** True when we should serve the local fixture instead of hitting the Sheet. */
export function useMock(): boolean {
  if (process.env.USE_MOCK_DATA === "1") return true;
  return !(
    process.env.DIRECTORY_SHEET_ID &&
    process.env.GOOGLE_SA_EMAIL &&
    (process.env.GOOGLE_SA_PRIVATE_KEY || process.env.GOOGLE_SA_PRIVATE_KEY_B64)
  );
}

/** Normalize a header for tolerant matching: lowercase, strip non-alphanumerics. */
function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Column index of the first matching header candidate, or -1. */
export function headerIndex(headers: string[], ...candidates: string[]): number {
  const norm = headers.map(normHeader);
  for (const c of candidates) {
    const i = norm.indexOf(normHeader(c));
    if (i >= 0) return i;
  }
  return -1;
}

/** Loose truthiness for free-text boolean cells ("TRUE", "Yes", "1", "x"). */
export function toBool(v: string): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "yes" || s === "y" || s === "1" || s === "x";
}

/**
 * Normalize the service-account private key across the ways it gets pasted into
 * env managers (Vercel, .env). Handles surrounding quotes, escaped `\n`, and
 * a dropped BEGIN header line. A malformed key surfaces as OpenSSL
 * "DECODER routines::unsupported", which is why this exists.
 */
export function normalizePrivateKey(raw: string): string {
  let k = (raw ?? "").trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  k = k.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (!/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(k)) {
    const em = k.match(/-----END ([A-Z0-9 ]*PRIVATE KEY)-----/);
    if (em) {
      const label = em[1];
      const body = k.slice(0, k.indexOf(em[0])).replace(/^\s+|\s+$/g, "");
      k = `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
    }
  }

  const m = k.match(
    /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/
  );
  if (m) k = m[0];
  return k;
}

/** Prefers the base64 blob (no newlines to corrupt), else the plain key. */
export function resolvePrivateKey(): string {
  const b64 = process.env.GOOGLE_SA_PRIVATE_KEY_B64;
  if (b64 && b64.trim()) {
    try {
      return normalizePrivateKey(Buffer.from(b64.trim(), "base64").toString("utf8"));
    } catch {
      /* fall through to the plain key */
    }
  }
  return normalizePrivateKey(process.env.GOOGLE_SA_PRIVATE_KEY ?? "");
}

/**
 * Cached service-account token. Google issues these for an hour; we re-use one
 * for 50 minutes and refresh early, so a token can never expire mid-request.
 */
let tokenCache: { token: string; expiresAt: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const token = await mintAccessToken();
  tokenCache = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  return token;
}

async function mintAccessToken(): Promise<string> {
  const email = process.env.GOOGLE_SA_EMAIL ?? "";
  const key = resolvePrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const b64url = (obj: object) => Buffer.from(JSON.stringify(obj)).toString("base64url");

  const unsigned =
    b64url({ alg: "RS256", typ: "JWT" }) +
    "." +
    b64url({
      iss: email,
      // Read-only: this app never writes to the directory sheet.
      /*
       * READ/WRITE since 28 Sep 2026, widened from `spreadsheets.readonly` so
       * the admin screens can maintain the form-configuration tabs.
       *
       * TWO THINGS THIS DOES NOT DO, both worth knowing:
       *
       * 1. It does not grant anything on its own. The service account must also
       *    be an EDITOR on the workbook in Google's own sharing dialog; with
       *    Viewer access, writes fail with 403 no matter what scope the token
       *    carries. That share change is a manual step.
       * 2. It does not touch the Aligned KPIs app. A scope belongs to the TOKEN
       *    this app mints, not to the service account, so the other app keeps
       *    minting read-only tokens for its own sheets.
       *
       * The app still only ever writes to the configuration tabs and
       * `ProfileFieldValues` — `lib/forms/write.ts` is the one module that
       * writes at all, and it names the tabs it will touch.
       */
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    });

  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key).toString("base64url");
  const assertion = `${unsigned}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!resp.ok) throw new Error(`Token exchange ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("No access_token in token response");
  return data.access_token;
}

/* ------------------------------------------------------------------ quota --
 * Google allows 60 Sheets reads per minute per user, and the service account is
 * one user across BOTH this app and Aligned KPIs. Two defenses live here so
 * every caller gets them: retry on 429/5xx, and a short read cache.
 */

const RETRY_MS = [1_000, 3_000, 6_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Fetch with retry on 429 (rate limit) and 5xx. Honors `Retry-After`. */
export async function sheetsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  let resp = await fetch(url, { cache: "no-store", ...init });
  for (const wait of RETRY_MS) {
    if (resp.status !== 429 && resp.status < 500) return resp;
    const after = Number(resp.headers.get("retry-after"));
    // Jitter so parallel callers don't retry in lockstep.
    await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : wait + Math.random() * 400);
    resp = await fetch(url, { cache: "no-store", ...init });
  }
  return resp;
}

export function quotaMessage(tabOrLabel: string): string {
  return (
    `Google Sheets rate limit reached while reading ${tabOrLabel} ` +
    `(60 reads per minute across all of our apps). Nothing was lost — wait a minute and try again.`
  );
}

/**
 * Tab cache. The directory is edited by hand and read on every search page load,
 * so a short TTL turns a page view into ~0 Google reads most of the time.
 */
const TAB_TTL_MS = 5 * 60 * 1000;
const tabCache = new Map<string, { at: number; data: SheetTab }>();

export type SheetTab = { headers: string[]; rows: string[][] };

/**
 * Forget a cached tab so the next read is fresh. Call it after every write.
 *
 * TAKES THE SPREADSHEET ID, and that is a bug fix rather than an API choice:
 * the cache is keyed `${spreadsheetId}::${tab}` while this used to delete by
 * `tab` alone, so it never matched anything. It was harmless only because
 * nothing in this app wrote — the moment the admin screens did, an edit would
 * have appeared to save and then shown the old value for five minutes, which
 * reads as "the save didn't work" and invites saving again.
 *
 * Omit `tab` to drop every cached tab of a workbook — the right hammer after a
 * write that touched more than one.
 */
export function invalidateTab(spreadsheetId: string, tab?: string): void {
  if (tab !== undefined) {
    tabCache.delete(`${spreadsheetId}::${tab}`);
    return;
  }
  const prefix = `${spreadsheetId}::`;
  for (const key of tabCache.keys()) {
    if (key.startsWith(prefix)) tabCache.delete(key);
  }
}

/** Read an entire tab of a given spreadsheet as { headers, rows }. */
export async function readTab(
  token: string,
  spreadsheetId: string,
  tab: string
): Promise<SheetTab> {
  const cacheKey = `${spreadsheetId}::${tab}`;
  const hit = tabCache.get(cacheKey);
  if (hit && Date.now() - hit.at < TAB_TTL_MS) return hit.data;

  // A blank tab name reads the FIRST tab of the spreadsheet, which is what the
  // ITA export gives us — the tab gets renamed on every re-export.
  const range = tab ? `${tab}!A1:ZZ20000` : "A1:ZZ20000";
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${encodeURIComponent(range)}`;
  const resp = await sheetsFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.status === 429) throw new Error(quotaMessage(tab || "the directory sheet"));
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`);

  const data = (await resp.json()) as { values?: string[][] };
  const values = data.values ?? [];
  const parsed: SheetTab =
    values.length === 0
      ? { headers: [], rows: [] }
      : {
          headers: values[0].map((h) => (h ?? "").toString().trim()),
          rows: values.slice(1),
        };
  tabCache.set(cacheKey, { at: Date.now(), data: parsed });
  return parsed;
}

/**
 * The title of the spreadsheet's only tab, when no tab is configured.
 *
 * REFUSES on a multi-tab workbook rather than taking the first one. "First tab"
 * was safe while the export was a single sheet; once companion tabs arrive
 * (event registrations, renewals), dragging a tab left in Sheets would silently
 * repoint the directory at the wrong data — and the page would render, just
 * wrong. Naming the tab is one env var; guessing is a class of outage that
 * looks like a data problem.
 */
/** Every tab title in the workbook, in tab order. */
/**
 * The workbook's tab list, cached.
 *
 * WHY THIS CACHE EXISTS. `resolveTab` calls `listTabs` to validate a name, and
 * every tab the app reads goes through `resolveTab` — so the seven tabs now in
 * play (Profiles, ProfileRelations and the five form tabs) cost a metadata
 * request EACH, on top of the reads, every time. `readTab`'s cache hid the read
 * cost but not this one, so a warm page still spent seven calls proving the
 * tabs exist. On a 60-per-minute budget shared with the Aligned KPIs app, that
 * is the difference between comfortable and a rate limit that reads like a data
 * problem.
 *
 * A tab list changes when a person renames or adds a tab — minutes apart at
 * worst — so it caches on the same 5-minute TTL as a tab's contents.
 */
const metaCache = new Map<string, { at: number; data: string[] }>();

/** Forget the tab list — call after adding a tab, alongside `invalidateTab`. */
export function invalidateTabList(spreadsheetId?: string): void {
  if (spreadsheetId) metaCache.delete(spreadsheetId);
  else metaCache.clear();
}

export async function listTabs(token: string, spreadsheetId: string): Promise<string[]> {
  const hit = metaCache.get(spreadsheetId);
  if (hit && Date.now() - hit.at < TAB_TTL_MS) return hit.data;

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `?fields=sheets.properties(title,index)`;
  const resp = await sheetsFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheet metadata ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as {
    sheets?: { properties?: { title?: string; index?: number } }[];
  };
  const titles = (data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { title: string; index: number } => !!p?.title)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => p.title);
  metaCache.set(spreadsheetId, { at: Date.now(), data: titles });
  return titles;
}

/**
 * The names of this app's tab settings. Used to catch one specific, very
 * repeatable mistake — see `envNameLookalike`.
 */
const TAB_ENV_NAMES = ["DIRECTORY_TAB", "DIRECTORY_RELATIONS_TAB"];

/**
 * Has someone named the TABS after the ENVIRONMENT VARIABLES?
 *
 * This happened on the first real deploy: the workbook's two tabs were called
 * `DIRECTORY_TAB` and `DIRECTORY_RELATIONS_TAB`. The old error message was
 * factually correct — "this spreadsheet has 2 tabs (DIRECTORY_TAB,
 * DIRECTORY_RELATIONS_TAB) and DIRECTORY_TAB isn't set" — and read like a
 * contradiction, because the tab names and the setting names were the same
 * words. A true message that looks self-contradictory is a failed message.
 *
 * The variable names invite it, so the app should recognize it rather than
 * expect people not to make it.
 */
function envNameLookalike(tabs: string[]): string | null {
  const hits = tabs.filter((t) =>
    TAB_ENV_NAMES.includes(t.trim().toUpperCase().replace(/\s+/g, "_"))
  );
  if (hits.length === 0) return null;
  return (
    ` NOTE: ${hits.length === 1 ? "a tab is" : "the tabs are"} named ` +
    `${hits.map((h) => `"${h}"`).join(" and ")} — ${
      hits.length === 1 ? "that is" : "those are"
    } the name${hits.length === 1 ? "" : "s"} of the SETTING${
      hits.length === 1 ? "" : "S"
    }, not a tab name. Either rename the tab${hits.length === 1 ? "" : "s"} to ` +
    `something descriptive (e.g. "Profiles" and "ProfileRelations") and point the ` +
    `settings at those names, or set DIRECTORY_TAB to the literal text "${hits[0]}".`
  );
}

/**
 * Resolve the tab to read: the configured name when set, otherwise the only tab.
 *
 * Tolerant of case and surrounding whitespace, because a value pasted into an
 * env manager routinely arrives with a trailing space and Google's own tab
 * names are case-sensitive — a mismatch there produces an opaque 400 from the
 * values endpoint rather than anything about tabs.
 *
 * REFUSES rather than guessing on a multi-tab workbook. "First tab" was safe
 * while the export was a single sheet; once companion tabs exist, dragging one
 * left in Sheets would silently repoint the directory and the page would still
 * render — just wrong.
 */
export async function resolveTab(
  token: string,
  spreadsheetId: string,
  configured: string,
  purpose = "the members"
): Promise<string> {
  const tabs = await listTabs(token, spreadsheetId);
  if (tabs.length === 0) throw new Error("This spreadsheet has no tabs.");

  const want = configured.trim();
  if (want) {
    const exact = tabs.find((t) => t === want);
    if (exact) return exact;
    // Case- and space-insensitive second pass, so a near-miss resolves instead
    // of failing with Google's "Unable to parse range".
    const loose = tabs.find(
      (t) => t.trim().toLowerCase() === want.toLowerCase()
    );
    if (loose) return loose;

    throw new Error(
      `No tab named "${want}" in this spreadsheet. Its tabs are: ` +
        `${tabs.map((t) => `"${t}"`).join(", ")}. Check the setting for a typo, ` +
        `extra spaces, or a tab that has been renamed.` +
        (envNameLookalike(tabs) ?? "")
    );
  }

  if (tabs.length > 1) {
    throw new Error(
      `This spreadsheet has ${tabs.length} tabs (${tabs
        .map((t) => `"${t}"`)
        .join(", ")}) and DIRECTORY_TAB isn't set, so there's no way to know which ` +
        `one holds ${purpose}. Set DIRECTORY_TAB to one of those names exactly.` +
        (envNameLookalike(tabs) ?? "")
    );
  }

  return tabs[0];
}

/**
 * @deprecated Use `resolveTab`, which also validates a configured name.
 * Kept as a thin wrapper so any remaining caller keeps working.
 */
export async function firstTabTitle(token: string, spreadsheetId: string): Promise<string> {
  return resolveTab(token, spreadsheetId, "");
}

/* ============================================================== WRITING ==
 *
 * Everything below writes. Four rules hold for all of it, and they are the
 * difference between a config sheet people trust and one they stop trusting:
 *
 *  1. **NEVER DELETE A ROW.** Deleting shifts every row beneath it, which
 *     invalidates any row index another request is holding, and breaks the
 *     `max + 1` id convention by making the highest id reusable. Deactivate by
 *     setting a cell instead. (Same rule as `lib/members.ts` in Aligned KPIs.)
 *  2. **WRITE CELLS, NOT ROWS,** wherever the change is to one field. Two
 *     people editing different columns of the same row then don't clobber each
 *     other, and a partial failure leaves the rest of the row intact.
 *  3. **INVALIDATE THE CACHE** after every write, or the UI shows the old value
 *     for five minutes and the user saves again.
 *  4. **RESOLVE COLUMNS BY HEADER NAME** on the way in, exactly as reads do.
 */

/**
 * A tab name as A1 notation needs it.
 *
 * A1 ranges are `Tab!A1`, and a tab whose name contains a space, a quote or
 * punctuation has to be single-quoted with internal quotes doubled — otherwise
 * the range is parsed as something else entirely, which on a WRITE means
 * landing in the wrong place rather than failing. None of today's tabs need it
 * (`FieldsbyType`, `Profiles`); the one someone renames next year might, and
 * this is the kind of bug that is invisible until it has already overwritten
 * something.
 */
export function quoteTab(tab: string): string {
  return /^[A-Za-z0-9_]+$/.test(tab) ? tab : `'${tab.replace(/'/g, "''")}'`;
}

/** 0-based column index → A1 letter. 0 → "A", 26 → "AA". */
export function colLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** One cell to write, addressed by the row's position and a header name. */
export type CellEdit = {
  /** 0-based index into `SheetTab.rows` — NOT the spreadsheet's row number. */
  rowIndex: number;
  header: string;
  value: string;
};

/**
 * Write a set of cells in one request.
 *
 * `values.batchUpdate` rather than a call per cell: reordering a form touches
 * two cells and editing a field touches eight, and a request each would spend
 * the 60-per-minute budget on a single click. One request also means one
 * failure rather than a half-applied edit.
 *
 * Row indexes are into the parsed `rows` array, so callers work in the same
 * coordinates `readTab` hands them; the +2 converts to a spreadsheet row
 * number (1 for the header, 1 because sheets count from one).
 */
export async function writeCells(
  token: string,
  spreadsheetId: string,
  tab: string,
  headers: string[],
  edits: CellEdit[]
): Promise<void> {
  if (edits.length === 0) return;

  const data = edits.map((e) => {
    const col = headerIndex(headers, e.header);
    if (col < 0) {
      throw new Error(
        `The "${tab}" tab has no "${e.header}" column, so there is nowhere to ` +
          `write that value. Add the column, or rename it back.`
      );
    }
    const a1 = `${colLetter(col)}${e.rowIndex + 2}`;
    return { range: `${quoteTab(tab)}!${a1}`, values: [[e.value]] };
  });

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values:batchUpdate`;
  const resp = await sheetsFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
  if (!resp.ok) throw new Error(await writeError(resp, tab));
  invalidateTab(spreadsheetId, tab);
}

/**
 * Append rows to the bottom of a tab.
 *
 * `INSERT_ROWS` so an append can never overwrite something that arrived since
 * the last read, and `RAW` so a value that looks like a formula or a date is
 * stored as the text it is — a field id of `-1` or an option labelled `1/2`
 * must not become a number.
 */
export async function appendRows(
  token: string,
  spreadsheetId: string,
  tab: string,
  rows: string[][]
): Promise<void> {
  if (rows.length === 0) return;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `/values/${encodeURIComponent(`${quoteTab(tab)}!A1`)}:append` +
    `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  const resp = await sheetsFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: rows }),
  });
  if (!resp.ok) throw new Error(await writeError(resp, tab));
  invalidateTab(spreadsheetId, tab);
}

/**
 * Build a row in the tab's OWN column order from a header→value map.
 *
 * The point of going through the headers: a tab whose columns someone
 * reordered, or which has a column this app doesn't know about, still gets a
 * correctly aligned row. An unknown header in `values` is ignored rather than
 * appended, because inventing a column is not an append's job.
 */
export function rowFromValues(
  headers: string[],
  values: Record<string, string>
): string[] {
  const row = headers.map(() => "");
  for (const [header, value] of Object.entries(values)) {
    const i = headerIndex(headers, header);
    if (i >= 0) row[i] = value;
  }
  return row;
}

/** A write failure, said in terms of the thing someone was trying to do. */
async function writeError(resp: Response, tab: string): Promise<string> {
  const body = await resp.text();
  if (resp.status === 403) {
    return (
      `Google refused the write to "${tab}" (403). The service account can READ ` +
      `this workbook but not write to it — share the sheet with ` +
      `${process.env.GOOGLE_SA_EMAIL ?? "the service account"} as an EDITOR.`
    );
  }
  if (resp.status === 429) return quotaMessage(tab);
  return `Could not write to "${tab}" (${resp.status}): ${body.slice(0, 300)}`;
}

/**
 * CAN WE WRITE? — a probe that proves permission without changing anything.
 *
 * Same idea as the Aligned KPIs `secret-check` route: ask the API to do the
 * thing, in a form where success is harmless, and read the answer off the
 * status code. A `values:batchUpdate` carrying an EMPTY data array is a valid
 * request that updates zero cells — so a 200 proves the token's scope AND the
 * service account's Editor access on this specific workbook, while a 403 proves
 * one of them is missing. Nothing is written either way, so it is safe to run
 * on every page load of /diagnostics.
 *
 * This matters because the two halves fail identically from the outside: a
 * read-only SCOPE and a Viewer-level SHARE both produce 403 on the first real
 * save, after someone has typed a form and pressed the button. Better to answer
 * it before they do.
 */
export async function canWrite(
  token: string,
  spreadsheetId: string
): Promise<{ ok: boolean; status: number; detail: string }> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
  const resp = await sheetsFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ valueInputOption: "RAW", data: [] }),
  });

  if (resp.ok) {
    return { ok: true, status: resp.status, detail: "the sheet is writable" };
  }
  if (resp.status === 403) {
    return {
      ok: false,
      status: 403,
      detail:
        `Google refused (403). Share the workbook with ` +
        `${process.env.GOOGLE_SA_EMAIL ?? "the service account"} as an EDITOR — ` +
        `it can read but not write, so admin saves will fail.`,
    };
  }
  return {
    ok: false,
    status: resp.status,
    detail: `${resp.status}: ${(await resp.text()).slice(0, 200)}`,
  };
}
