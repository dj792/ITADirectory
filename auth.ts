import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import authConfig from "@/auth.config";
import { verifyLoginToken } from "@/lib/login-token";
import { findMemberByEmail } from "@/lib/access";
import { TESTING_IDENTITY, testingModeEnabled } from "@/lib/testing-mode";

/**
 * Full auth setup used by the API route, server components, and sign-out. It
 * spreads the edge-safe `authConfig` and adds the Node-only Credentials
 * provider, which needs crypto (token verify) and the Sheets layer (allowlist).
 * The middleware imports `authConfig` directly, so this Node code never reaches
 * the edge bundle.
 *
 * The "credentials" here are not typed by a user — they are the token from the
 * verified magic link. `authorize` is the authoritative gate: it re-checks BOTH
 * the signature and the allowlist before any session is issued.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        token: { label: "Token", type: "text" },
        mode: { label: "Mode", type: "text" },
      },
      async authorize(credentials) {
        /*
         * TESTING MODE — the authoritative gate. The button on /signin is only
         * rendered when the flag is on, but that's presentation; THIS is the
         * check that matters. A stale client bundle, a cached page, or a
         * hand-written POST straight to the credentials callback all land here,
         * and all get null unless the server itself has TESTING_MODE=1.
         */
        if ((credentials?.mode ?? "").toString() === "testing") {
          if (!testingModeEnabled()) return null;
          return { ...TESTING_IDENTITY };
        }

        const token = (credentials?.token ?? "").toString();
        if (!token) return null;

        // 1. The link proves control of the email.
        const email = verifyLoginToken(token);
        if (!email) return null;

        // 2. The email must still be in the directory (or be staff).
        const identity = await findMemberByEmail(email);
        if (!identity) return null;

        return {
          id: identity.memberId,
          email: identity.email,
          name: identity.name,
          memberId: identity.memberId,
        };
      },
    }),
  ],
});
