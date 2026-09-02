import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — the ONLY piece the middleware imports, so it must
 * never pull in Node-only code (no crypto, no Google Sheets, no mailer). The
 * real authorization lives in the Credentials `authorize` in `auth.ts`, which
 * runs in the Node auth route.
 *
 * `providers: []` keeps the edge bundle clean; `auth.ts` spreads this config and
 * adds the Node-heavy provider. The callbacks below are pure JS.
 */
const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.memberId = String(user.memberId ?? "");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.memberId = String(token.memberId ?? "");
      }
      return session;
    },
  },
};

export default authConfig;
