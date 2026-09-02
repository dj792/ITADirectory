import crypto from "crypto";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { auth } from "@/auth";
import { getAccessToken, readTab, firstTabTitle, resolvePrivateKey } from "@/lib/sheets-core";
import { directorySheetId, directoryTab, directorySheetUrl } from "@/lib/directory/config";
import { parseDirectory } from "@/lib/directory/parse";
import { testingModeEnabled } from "@/lib/testing-mode";

/**
 * CONFIGURATION PROBE — the "echo a structured diagnostic to the screen"
 * technique from CLAUDE.md, as a permanent page rather than temporary
 * scaffolding, because environment variables are re-entered every time this
 * app moves.
 *
 * It reports each stage of the Google pipeline as SAFE PRIMITIVES — booleans,
 * lengths, first-and-last characters of non-secret regions — so one screenshot
 * pinpoints the failing stage. It NEVER echoes the private key, or any part of
 * it: `keyLength`, not the key. Read the code before adding a field here, and
 * keep that rule.
 *
 * Deliberately staged in dependency order, because a red row is only meaningful
 * if everything above it is green:
 *
 *   env vars present → key PARSES locally → Google issues a TOKEN →
 *   the SHEET is readable → the rows PARSE into members
 *
 * The two most common failures land in different stages and would otherwise
 * look identical from the app: a mangled key fails at "parses locally" (no
 * network involved), while a sheet not shared with the service account gets all
 * the way to "sheet readable" and fails there with Google's unhelpful
 * "Requested entity was not found".
 */
export const dynamic = "force-dynamic";
export const metadata = { title: "Diagnostics — ITA Member Directory" };

type Row = {
  label: string;
  ok: boolean | null; // null = informational, no pass/fail
  detail: string;
};

export default async function DiagnosticsPage() {
  // Visible while testing mode is on (the app is open anyway), or to a signed-in
  // user. It exposes config SHAPE, not secrets — but there's no reason to hand
  // that to the public once the directory is locked down.
  const session = await safeAuth();
  if (!testingModeEnabled() && !session?.user) {
    return (
      <Shell>
        <p className="text-[15px] text-sub">
          Sign in to view diagnostics.
        </p>
      </Shell>
    );
  }

  const rows = await probe();
  const firstFailure = rows.find((r) => r.ok === false);

  return (
    <Shell>
      <p className="mb-4 text-[14px] leading-relaxed text-sub">
        Each stage of the Google Sheets connection, in dependency order. A red row
        only matters once everything above it is green. No secret values are shown
        here — only their shape.
      </p>

      {firstFailure ? (
        <div className="mb-5 rounded-md border-l-4 border-[#B3261E] bg-[#B3261E]/5 p-4">
          <p className="text-[14px] font-semibold text-[#B3261E]">
            First failure: {firstFailure.label}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg">{firstFailure.detail}</p>
        </div>
      ) : (
        <div className="mb-5 rounded-md border-l-4 border-[#1E7B34] bg-[#1E7B34]/5 p-4">
          <p className="text-[14px] font-semibold text-[#1E7B34]">
            Everything checks out — the directory is reading the live sheet.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-hair bg-panel">
        <table className="w-full text-left text-[13px]">
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.label} className={i > 0 ? "border-t border-hair" : ""}>
                <td className="w-8 px-4 py-3 align-top text-[15px] leading-none">
                  {r.ok === null ? "·" : r.ok ? "✅" : "❌"}
                </td>
                <td className="px-2 py-3 align-top font-medium text-strong">{r.label}</td>
                <td className="px-4 py-3 align-top font-mono text-[12px] leading-relaxed text-sub">
                  {r.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

async function safeAuth() {
  try {
    return await auth();
  } catch {
    return null;
  }
}

/** Run the stages, stopping the chain once one fails. */
async function probe(): Promise<Row[]> {
  const rows: Row[] = [];
  const env = (k: string) => (process.env[k] ?? "").trim();

  // ── Stage 0: what's set ───────────────────────────────────────────────────
  const sheetIdRaw = env("DIRECTORY_SHEET_ID");
  const resolvedId = directorySheetId();
  rows.push({
    label: "DIRECTORY_SHEET_ID",
    ok: !!resolvedId,
    detail: resolvedId
      ? `set · resolves to ${resolvedId}` +
        (sheetIdRaw !== resolvedId ? " (extracted from the URL)" : "")
      : "NOT SET — add it in Vercel → Settings → Environment Variables",
  });

  const saEmail = env("GOOGLE_SA_EMAIL");
  rows.push({
    label: "GOOGLE_SA_EMAIL",
    ok: !!saEmail,
    detail: saEmail || "NOT SET",
  });

  rows.push({
    label: "DIRECTORY_TAB",
    ok: null,
    detail: directoryTab() || "(blank — reads the first tab, which is correct)",
  });

  // ── Stage 1: the key, as a STRING ─────────────────────────────────────────
  const rawKey = env("GOOGLE_SA_PRIVATE_KEY");
  const b64Key = env("GOOGLE_SA_PRIVATE_KEY_B64");
  if (!rawKey && !b64Key) {
    rows.push({
      label: "GOOGLE_SA_PRIVATE_KEY",
      ok: false,
      detail: "NOT SET — paste it from the Aligned KPIs project's Vercel env vars",
    });
    return rows;
  }
  rows.push({
    label: "GOOGLE_SA_PRIVATE_KEY",
    ok: true,
    detail:
      `set · ${rawKey.length} characters` +
      (b64Key ? ` (plus a B64 variant, ${b64Key.length} chars — that one wins)` : "") +
      ` · has BEGIN: ${/BEGIN [A-Z ]*PRIVATE KEY/.test(rawKey)}` +
      ` · has END: ${/END [A-Z ]*PRIVATE KEY/.test(rawKey)}` +
      ` · escaped \\n: ${rawKey.includes("\\n")}` +
      ` · real newlines: ${rawKey.includes("\n")}`,
  });

  // ── Stage 2: does it PARSE? No network — isolates a mangled paste ─────────
  const normalized = resolvePrivateKey();
  try {
    crypto.createPrivateKey(normalized);
    rows.push({
      label: "Key parses (OpenSSL)",
      ok: true,
      detail: `valid private key · ${normalized.split("\n").length} lines after normalizing`,
    });
  } catch (err) {
    return [
      ...rows,
      {
        label: "Key parses (OpenSSL)",
        ok: false,
        detail:
          `${msg(err)} — the value is set but isn't a usable key. Vercel usually ` +
          `mangles this on paste: re-copy it INCLUDING the BEGIN and END lines, ` +
          `or set GOOGLE_SA_PRIVATE_KEY_B64 to the base64 of the whole key instead.`,
      },
    ];
  }

  // ── Stage 3: Google issues a token — proves the key matches the account ───
  let token: string;
  try {
    token = await getAccessToken();
    rows.push({
      label: "Google issues a token",
      ok: true,
      detail: `OAuth token received (${token.length} chars) — key and service account match`,
    });
  } catch (err) {
    return [
      ...rows,
      {
        label: "Google issues a token",
        ok: false,
        detail:
          `${msg(err)} — the key parses but Google rejected it. Usually GOOGLE_SA_EMAIL ` +
          `doesn't match the key, or the key has been revoked in Google Cloud.`,
      },
    ];
  }

  // ── Stage 4: the sheet is readable — the sharing check ───────────────────
  let tabTitle = directoryTab();
  try {
    if (!tabTitle) tabTitle = await firstTabTitle(token, resolvedId);
    rows.push({
      label: "Sheet is readable",
      ok: true,
      detail: `first tab: "${tabTitle}"`,
    });
  } catch (err) {
    return [
      ...rows,
      {
        label: "Sheet is readable",
        ok: false,
        detail:
          `${msg(err)} — credentials are fine, so this is almost certainly SHARING: ` +
          `open the sheet and share it (Viewer) with ${saEmail || "the service account"}.`,
      },
    ];
  }

  // ── Stage 5: the rows parse into members ─────────────────────────────────
  try {
    const grid = await readTab(token, resolvedId, tabTitle);
    const members = parseDirectory(grid);
    rows.push({
      label: "Rows parse into members",
      ok: members.length > 0,
      detail:
        `${grid.headers.length} columns · ${grid.rows.length} data rows · ` +
        `${members.length} members` +
        (members.length === 0
          ? " — rows were read but none became members; check the header names"
          : ""),
    });
    rows.push({
      label: "Columns found",
      ok: null,
      detail: grid.headers.join(" · ") || "(none)",
    });
  } catch (err) {
    return [...rows, { label: "Rows parse into members", ok: false, detail: msg(err) }];
  }

  rows.push({
    label: "Source sheet",
    ok: null,
    detail: directorySheetUrl() ?? "—",
  });

  return rows;
}

function msg(err: unknown): string {
  const m = err instanceof Error ? err.message : String(err);
  // Google's error bodies are long JSON walls; the first line carries the point.
  return m.split("\n")[0].slice(0, 300);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hair bg-panel">
        <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
          <BrandMark height={40} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
        <h1 className="mb-1 text-2xl">Diagnostics</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
