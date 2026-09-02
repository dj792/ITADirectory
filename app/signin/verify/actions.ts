"use server";

import { signIn } from "@/auth";

/**
 * Exchange a verified magic-link token for a session. Runs on the server so the
 * token never has to be handed to NextAuth from client JS.
 *
 * `redirectTo` makes NextAuth throw a redirect on success — that's the normal
 * control flow for a server action, so it must not be swallowed by a try/catch
 * here.
 */
export async function completeSignIn(token: string): Promise<void> {
  await signIn("credentials", { token, redirectTo: "/" });
}
