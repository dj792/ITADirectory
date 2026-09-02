"use client";

import { useState } from "react";

/**
 * The sign-in box. Note what it does NOT do: it never tells the visitor whether
 * the address it just submitted is a member. The server always answers "check
 * your email", so this component always shows the same confirmation — the
 * enumeration protection has to hold on both sides to be worth anything.
 */
export default function SignInForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const resp = await fetch("/api/auth/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(resp.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="mt-6 rounded-md border border-hair bg-white p-4 text-[14px] leading-relaxed text-sub">
        <p className="font-medium text-fg">Check your email</p>
        <p className="mt-1">
          If <span className="text-fg">{email}</span> is on the ITA member list,
          a sign-in link is on its way. It expires in 10 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <label htmlFor="email" className="sr-only">
        Email address
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="w-full rounded-md border border-hair bg-white px-4 py-3 text-[15px] text-fg placeholder:text-sub focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-md bg-accent px-4 py-3 text-[15px] font-semibold text-white transition hover:bg-accentDark disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
      {state === "error" && (
        <p className="text-[13px] text-sub">
          Something went wrong sending that. Try again in a moment.
        </p>
      )}
    </form>
  );
}
