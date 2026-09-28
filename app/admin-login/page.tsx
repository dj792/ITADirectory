import type { Metadata } from "next";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { adminGateConfigured } from "@/lib/admin-gate";
import { signInToAdmin } from "../admin/actions";

/**
 * The admin sign-in page.
 *
 * DELIBERATELY OUTSIDE `/admin`. Middleware guards every path under `/admin`,
 * so a login form living there could not render for the very people who need
 * it. Keeping it at its own path means the gate has no exception to carve out,
 * and an exception is exactly the kind of thing that later gets widened.
 *
 * It holds nothing: no configuration is read, no member data is touched, and
 * the page is identical whether or not a key is configured — so there is
 * nothing here to protect and nothing to learn from looking at it.
 *
 * `next` carries the page someone was trying to reach before they were bounced
 * here. It is VALIDATED in the action, not trusted — see the note there.
 */

export const metadata: Metadata = {
  title: "Administrative login — ITA Member Directory",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const failed = !!one("error");

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          {/* The mark sits ABOVE the card, as a sign-in page usually does —
              it identifies whose system this is before anything is asked. */}
          <div className="flex justify-center">
            <BrandMark height={52} />
          </div>

          <div className="mt-8 rounded-xl border border-hair bg-panel px-6 py-7 shadow-sm">
            <div className="text-center">
              <h1 className="text-[22px] leading-tight">Administrative Login Only</h1>
              <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-relaxed text-sub">
                This area manages the member directory’s forms and profile
                information. It isn’t part of the member experience.
              </p>
            </div>

            {adminGateConfigured() ? (
              <form action={signInToAdmin} className="mt-6">
                <input type="hidden" name="next" value={one("next")} />

                <label
                  htmlFor="key"
                  className="block text-[12px] font-medium uppercase tracking-wide text-sub"
                >
                  Access key
                </label>
                <input
                  id="key"
                  name="key"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  aria-invalid={failed || undefined}
                  aria-describedby={failed ? "key-error" : undefined}
                  className={`mt-1.5 w-full rounded-md border bg-white px-3 py-2.5 text-[15px] focus:outline-none focus:ring-2 ${
                    failed
                      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
                      : "border-hair focus:border-accent focus:ring-accent/30"
                  }`}
                />

                {failed && (
                  /*
                   * ONE message for every failure. "Wrong key" and "no key is
                   * configured" are different facts, and which one it is tells a
                   * stranger something about the deployment.
                   */
                  <p
                    id="key-error"
                    role="alert"
                    className="mt-2 text-[13px] text-red-700"
                  >
                    That key wasn’t right. Try again.
                  </p>
                )}

                <button
                  type="submit"
                  className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accentDark"
                >
                  Sign in
                </button>
              </form>
            ) : (
              <p className="mt-6 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-[13px] leading-relaxed text-amber-900">
                The admin area is closed because no access key is configured. Set{" "}
                <code className="rounded bg-white/70 px-1">ADMIN_ACCESS_KEY</code>{" "}
                in the environment and redeploy.
              </p>
            )}
          </div>

          <p className="mt-5 text-center text-[13px] text-sub">
            Looking for the directory?{" "}
            <a href="/" className="text-accent hover:underline">
              Member directory
            </a>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
