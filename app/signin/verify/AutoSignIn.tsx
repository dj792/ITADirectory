"use client";

import { useEffect, useState, useTransition } from "react";
import { completeSignIn } from "./actions";

/**
 * Completes sign-in as soon as the page loads, with a visible button as the
 * retry / no-JS fallback. The token in the URL has already been checked for a
 * valid signature server-side; this only exchanges it for a session cookie.
 */
export default function AutoSignIn({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    setStarted(true);
    startTransition(() => {
      void completeSignIn(token);
    });
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="text-center">
      <h1 className="text-lg font-semibold text-fg">Signing you in…</h1>
      <p className="mt-2 text-[14px] text-sub">Taking you to the member directory.</p>
      <button
        type="button"
        disabled={pending || started}
        onClick={() => startTransition(() => void completeSignIn(token))}
        className="mt-6 rounded-md bg-accent px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-accentDark disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Continue"}
      </button>
    </div>
  );
}
