"use server";

import { signIn } from "@/auth";
import { testingModeEnabled } from "@/lib/testing-mode";

/**
 * Skip sign-in and go straight to the directory. Only reachable when the server
 * has TESTING_MODE=1.
 *
 * The guard here is belt-and-braces: `authorize` in `auth.ts` re-checks the flag
 * before issuing any session, so this could not grant access even if it were
 * called with the flag off. It throws rather than returning quietly so a
 * misconfiguration is visible in the logs instead of looking like a dead button.
 *
 * `redirectTo` makes NextAuth throw a redirect on success — normal control flow
 * for a server action, so it must not be wrapped in a try/catch.
 */
export async function enterTestingMode(): Promise<void> {
  if (!testingModeEnabled()) {
    throw new Error("Testing mode is not enabled on this server (TESTING_MODE is unset).");
  }
  await signIn("credentials", { mode: "testing", redirectTo: "/" });
}
