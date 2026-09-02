import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";
import { testingModeEnabled } from "@/lib/testing-mode";

// Middleware runs on the Edge runtime, so it uses ONLY the edge-safe config
// (no Sheets, no crypto, no mailer). `lib/testing-mode` is edge-safe too — it
// reads one env var and imports nothing.
const { auth } = NextAuth(authConfig);

/**
 * Gates every route. Unauthenticated visitors are redirected to /signin; API
 * routes get 401 JSON instead of a redirect (a fetch should not follow a
 * redirect into an HTML page and report it as success).
 *
 * TESTING MODE OPENS EVERYTHING. While it's on, the gate is lifted before
 * NextAuth is consulted at all — no session, no cookie, no sign-in round trip.
 * That is the point: the directory has to be reachable while authentication is
 * still being set up, and it must not depend on the very thing that isn't
 * working yet (an unset AUTH_SECRET makes every auth route return
 * "There was a problem with the server configuration", including the bypass
 * button). Going through NextAuth to skip NextAuth was the flaw in the first
 * version of this.
 *
 * The page still shows the red TESTING MODE banner, so an open directory can't
 * be mistaken for a secured one.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname.startsWith("/signin/")
  ) {
    return NextResponse.next();
  }

  if (testingModeEnabled()) return NextResponse.next();

  if (!req.auth?.user) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  // Everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
