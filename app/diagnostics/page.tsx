import crypto from "crypto";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { auth } from "@/auth";
import {
  getAccessToken,
  readTab,
  listTabs,
  resolveTab,
  resolvePrivateKey,
} from "@/lib/sheets-core";
import {
  directorySheetId,
  directoryTab,
  relationsTab,
  directorySheetUrl,
} from "@/lib/directory/config";
import { parseDirectory } from "@/lib/directory/parse";
import { loadFormConfig, loadFieldValues } from "@/lib/forms/service";
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

  // DIRECTORY_TAB and DIRECTORY_RELATIONS_TAB are reported in stage 4b, once
  // the workbook's real tab names are known — a configured value means nothing
  // on its own, and the mismatch is the thing worth seeing.

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
  /*
   * Report the key that is ACTUALLY IN USE, and describe the plain variable's
   * shape only when there is a plain variable to describe.
   *
   * The old version printed "set · 0 characters · has BEGIN: false" once
   * `GOOGLE_SA_PRIVATE_KEY` was deleted, which reads as a broken key sitting
   * next to four green rows. The shape breakdown exists to diagnose a MANGLED
   * PASTE — it is noise when the plain variable is absent and B64 is doing the
   * work, and actively misleading when it describes an empty string.
   */
  rows.push({
    label: "GOOGLE_SA_PRIVATE_KEY",
    ok: true,
    detail: !rawKey
      ? `using GOOGLE_SA_PRIVATE_KEY_B64 (${b64Key.length} chars) · ` +
        `the plain variable isn't set, which is the tidy state`
      : `set · ${rawKey.length} characters` +
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
  let allTabs: string[];
  try {
    allTabs = await listTabs(token, resolvedId);
    rows.push({
      label: "Sheet is readable",
      ok: true,
      detail: `${allTabs.length} tab${allTabs.length === 1 ? "" : "s"}`,
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

  /*
   * ── Stage 4b: the TABS ─────────────────────────────────────────────────
   * Added after a deploy was lost to it. The workbook's tabs had been named
   * after the env vars themselves ("DIRECTORY_TAB", "DIRECTORY_RELATIONS_TAB"),
   * so the error — accurate — read as a contradiction. Printing the actual tab
   * names beside the configured values makes the mismatch obvious at a glance,
   * which is the whole point of this page.
   */
  rows.push({
    label: "Tabs in the workbook",
    ok: null,
    detail: allTabs.map((t) => `"${t}"`).join(" · "),
  });

  /*
   * Tab names are HARD-CODED now (`lib/tabs.ts`) with an env override, so the
   * useful thing to report is which name was used and whether it came from a
   * variable or from code — an env var left over from an older tab naming is
   * exactly the failure this stage exists to catch.
   */
  const source = (envVar: string) =>
    (process.env[envVar] ?? "").trim() ? `env ${envVar}` : "hard-coded";

  let tabTitle: string;
  try {
    tabTitle = await resolveTab(token, resolvedId, directoryTab(), "the members");
    rows.push({
      label: "Directory tab",
      ok: true,
      detail: `"${directoryTab()}" (${source("DIRECTORY_TAB")}) → resolves to "${tabTitle}"`,
    });
  } catch (err) {
    return [
      ...rows,
      {
        label: "Directory tab",
        ok: false,
        detail:
          `${msg(err)} — looking for "${directoryTab()}" ` +
          `(${source("DIRECTORY_TAB")}). If that came from an env var, it is ` +
          `probably left over from an older tab name; clear it and the ` +
          `hard-coded name is used.`,
      },
    ];
  }

  // The relations tab is optional; report all three states distinctly.
  const relTab = relationsTab();
  if (!relTab) {
    rows.push({
      label: "Relations tab",
      ok: null,
      detail:
        "no name configured — the directory is members only, with no rosters " +
        "and no related individuals.",
    });
  } else {
    try {
      const resolvedRel = await resolveTab(token, resolvedId, relTab, "the relations");
      rows.push({
        label: "Relations tab",
        ok: true,
        detail:
          `"${relTab}" (${source("DIRECTORY_RELATIONS_TAB")}) → resolves to "${resolvedRel}"`,
      });
    } catch (err) {
      rows.push({
        label: "Relations tab",
        ok: false,
        detail:
          `${msg(err)} — looking for "${relTab}" ` +
          `(${source("DIRECTORY_RELATIONS_TAB")}). The member list still works ` +
          `without it.`,
      });
    }
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

  /*
   * ── Stage 6: the CUSTOM FIELD configuration ──────────────────────────────
   *
   * Four tabs ITA maintains by hand, so the useful report is not "did it read"
   * but "did it read what they meant": row counts per tab, what those became,
   * and every problem the parser found. A field pointing at a missing option
   * set renders as an empty dropdown and looks like our bug — printed here it
   * is a two-second fix in a spreadsheet.
   *
   * Reads via the real service, so this proves the path the app uses, not a
   * second one that happens to work.
   */
  try {
    const config = await loadFormConfig();
    const counts =
      `${config.fields.size} fields · ${config.forms.size} forms · ` +
      `${config.options.size} option sets · ${config.levels.length} levels mapped`;

    if (config.source === "sheet" && config.fields.size > 0) {
      rows.push({ label: "Custom field config", ok: true, detail: counts });
    } else if (config.source === "sheet") {
      rows.push({
        label: "Custom field config",
        ok: false,
        detail:
          "the config tabs were read but produced no fields — check that the " +
          "header row matches (FieldID, Label, DataType, …) and that Active " +
          "isn't set to FALSE",
      });
    } else if (config.source === "fixture") {
      rows.push({
        label: "Custom field config",
        ok: null,
        detail: `read from the LOCAL SEED, not the sheet · ${counts}`,
      });
    } else {
      rows.push({
        label: "Custom field config",
        ok: false,
        detail: config.error ?? "not loaded",
      });
    }

    // Per-form field counts: the fastest way to see a whole form went missing.
    if (config.forms.size > 0) {
      rows.push({
        label: "Fields per form",
        ok: null,
        detail: [...config.forms.entries()]
          .map(([t, f]) => `${t}: ${f.fields.length}`)
          .join(" · "),
      });
    }

    rows.push({
      label: "Config problems",
      ok: config.problems.length === 0,
      detail:
        config.problems.length === 0
          ? "none — every row parsed cleanly"
          : config.problems.slice(0, 8).join(" | ") +
            (config.problems.length > 8
              ? ` | …and ${config.problems.length - 8} more`
              : ""),
    });

    // The answers tab. Empty is the expected state until editing ships.
    const values = await loadFieldValues();
    rows.push({
      label: "Stored answers",
      ok: null,
      detail:
        values.length === 0
          ? "none yet — expected until profile editing is switched on"
          : `${values.length} values across ` +
            `${new Set(values.map((v) => v.profileId)).size} profiles`,
    });
  } catch (err) {
    rows.push({ label: "Custom field config", ok: false, detail: msg(err) });
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
