import type { DefaultSession } from "next-auth";

/**
 * Carry the member's ProfileID through the session. Mapped for a later SQL
 * move: memberId → members.id.
 */
declare module "next-auth" {
  interface Session {
    user: { memberId: string } & DefaultSession["user"];
  }
  interface User {
    memberId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    memberId: string;
  }
}
