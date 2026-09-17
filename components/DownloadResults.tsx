"use client";

import { useState } from "react";
import {
  EXPORT_DISCLAIMER,
  exportFilename,
  resultsToCsv,
} from "@/lib/directory/export";
import type { Member } from "@/lib/directory/types";

/**
 * Download the current results as a CSV, behind an explicit agreement.
 *
 * **The disclaimer is a GATE, not a notice.** It appears before anything is
 * downloaded and the download button doesn't exist until it's acknowledged —
 * text shown alongside a live button is something people click past. The same
 * wording is written into the file's first line (`resultsToCsv`), so the
 * obligation survives being forwarded; a dialog doesn't.
 *
 * Built in the BROWSER from the list already loaded, so the file is exactly
 * what's on screen — no second query that could return something else, and no
 * endpoint serving member data that the page didn't already have.
 */
export default function DownloadResults({
  results,
  searchSummary,
}: {
  results: Member[];
  /** e.g. "search: martus · level: Technology Partner - Gold" — goes in the file. */
  searchSummary: string;
}) {
  const [open, setOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);

  if (results.length === 0) return null;

  function download() {
    // ﻿ so Excel reads it as UTF-8 and doesn't mangle accented names.
    const blob = new Blob(["﻿" + resultsToCsv(results, searchSummary)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportFilename();
    a.click();
    // Revoke on the next tick — revoking immediately can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setOpen(false);
    setAgreed(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-accent hover:bg-panel2"
      >
        <DownloadIcon />
        Download
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Download these results"
          className="absolute right-0 z-40 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-hair bg-panel p-4 text-left shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
        >
          <p className="text-[13px] font-semibold text-strong">
            Download {results.length} {results.length === 1 ? "result" : "results"} as CSV
          </p>

          <label className="mt-3 flex cursor-pointer gap-2.5">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--c-accent))]"
            />
            <span className="text-[13px] leading-relaxed text-fg">{EXPORT_DISCLAIMER}</span>
          </label>

          <p className="mt-2 text-[12px] leading-relaxed text-sub">
            This wording is included in the downloaded file.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAgreed(false);
              }}
              className="rounded-md px-3 py-2 text-[13px] font-medium text-sub hover:bg-panel2"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!agreed}
              onClick={download}
              className="rounded-md bg-accent px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-accentDark disabled:cursor-not-allowed disabled:opacity-40"
            >
              I agree — download
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="h-3.5 w-3.5">
      <path
        d="M8 2v8m0 0L5 7m3 3 3-3M3 13h10"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
