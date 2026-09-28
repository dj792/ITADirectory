import NextAuth from "next-auth";
import authConfig from "@/auth.config";
import { NextResponse } from "next/server";
import { testingModeEnabled } from "@/lib/testing-mode";
import { ADMIN_COOKIE, adminCookieValidEdge } from "@/lib/admin-gate-edge";

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
export default auth(async (req) => {
  const { pathname } = req.nextUrl;

  /*
   * ── THE ADMIN GATE, BEFORE ANYTHING RENDERS ──────────────────────────────
   *
   * First, and deliberately ahead of the testing-mode bypass below: testing
   * mode opens the DIRECTORY, which is a read surface. The admin screens write
   * to ITA's configuration, and nothing about "let people look at the
   * directory without signing in" implies "let people edit the forms".
   *
   * It must be HERE rather than in the admin layout. The first version checked
   * in the layout and rendered a password prompt, which looked right and was
   * not: Next renders layout and page in parallel, so the page still ran, still
   * read the configuration, and still serialized it into the RSC payload inside
   * the HTML. The prompt was visible; the data was one `curl` away. Middleware
   * redirects before any page component executes, so there is nothing to leak.
   *
   * `/admin-login` is deliberately OUTSIDE `/admin` so the form itself is
   * reachable without passing the gate that guards everything else.
   */
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const ok = await adminCookieValidEdge(req.cookies.get(ADMIN_COOKIE)?.value);
    if (!ok) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin-login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname.startsWith("/signin/") ||
    // The release notes are for ITA to read while reviewing, so they must not
    // require an account. Safe to leave open because the page is STATIC PROSE
    // — no sheet read, no member names, no email addresses, nothing derived
    // from the directory. It is unlisted rather than secret (see the page for
    // how), and exempting it here is what keeps the link we emailed working
    // once sign-in is switched on. Do NOT extend this exemption to a page that
    // renders member data.
    pathname === "/releaseNotes.html"
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
