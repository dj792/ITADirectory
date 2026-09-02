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
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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
 * one user across BOTH this app and Aligned KPIs. Two defences live here so
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

export function invalidateTab(tab: string): void {
  tabCache.delete(tab);
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

/** The title of the spreadsheet's FIRST tab — used when no tab is configured. */
export async function firstTabTitle(token: string, spreadsheetId: string): Promise<string> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}` +
    `?fields=sheets.properties(title,index)`;
  const resp = await sheetsFetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheet metadata ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as {
    sheets?: { properties?: { title?: string; index?: number } }[];
  };
  const first = (data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is { title: string; index: number } => !!p?.title)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))[0];
  if (!first) throw new Error("Directory spreadsheet has no tabs");
  return first.title;
}
