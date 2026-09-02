"use client";

import { useTransition } from "react";
import { enterTestingMode } from "./actions";

/**
 * The bypass button. Rendered ONLY when the server passed `enabled` — and even
 * then it's just a trigger: `authorize` in auth.ts re-checks TESTING_MODE
 * before any session is issued.
 *
 * Styled as a warning rather than as a normal action, because it should never
 * look like part of the member-facing flow.
 */
export default function TestingModeButton() {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6 border-t border-hair pt-5">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => void enterTestingMode())}
        className="w-full rounded-md border-2 border-dashed border-[#B3261E] bg-[#B3261E]/5 px-4 py-3 text-[14px] font-bold uppercase tracking-wide text-[#B3261E] transition hover:bg-[#B3261E]/10 disabled:opacity-60"
      >
        {pending ? "Entering…" : "Testing mode on"}
      </button>
      <p className="mt-2 text-center text-[12px] leading-relaxed text-sub">
        Skips sign-in and opens the directory. On by default before launch — set{" "}
        <code className="font-mono">TESTING_MODE=0</code> to turn it off.
      </p>
    </div>
  );
}
