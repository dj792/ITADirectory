import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";

// Middleware runs on the Edge runtime, so it uses ONLY the edge-safe config
// (no Sheets, no crypto, no mailer). This instance just reads the session
// cookie to decide redirect vs. allow; the authoritative check happened at
// sign-in in "@/auth".
const { auth } = NextAuth(authConfig);

/**
 * Gates every route. Unauthenticated visitors are redirected to /signin; API
 * routes get 401 JSON instead of a redirect (a fetch should not follow a
 * redirect into an HTML page and report it as success).
 */
export default auth((req) => {
  const isAuthed = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname.startsWith("/signin/")
  ) {
    return NextResponse.next();
  }

  if (!isAuthed) {
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
