import type { Metadata } from "next";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { adminGateConfigured } from "@/lib/admin-gate";
import { signInToAdmin } from "../admin/actions";

/**
 * The admin password form.
 *
 * DELIBERATELY OUTSIDE `/admin`. Middleware guards every path under `/admin`,
 * so a login form living there could not render for the very people who need
 * it. Keeping it at its own path means the gate has no exception to carve out,
 * and an exception is exactly the kind of thing that later gets widened.
 *
 * It holds nothing: no configuration is read, no member data is touched, and
 * the page is the same whether or not a key is configured — so there is nothing
 * here to protect and nothing to learn from looking at it.
 */

export const metadata: Metadata = {
  title: "Administration — ITA Member Directory",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const failed = !!params.error;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark height={40} />
          <span className="text-[12px] text-sub">Administration</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-sm flex-1 px-4 py-16">
        <h1 className="text-xl">Administration</h1>

        {adminGateConfigured() ? (
          <>
            <p className="mt-2 text-[14px] text-sub">
              Enter the access key to manage the member form fields.
            </p>
            {failed && (
              /*
               * One message for every failure. "Wrong key" and "no key is
               * configured" are different facts, and which one it is tells a
               * stranger something about the deployment.
               */
              <p
                role="alert"
                className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-900"
              >
                That key wasn’t right.
              </p>
            )}
            <form action={signInToAdmin} className="mt-5">
              <label htmlFor="key" className="sr-only">
                Access key
              </label>
              <input
                id="key"
                name="key"
                type="password"
                autoComplete="current-password"
                autoFocus
                className="w-full rounded-md border border-hair bg-white px-3 py-2.5 text-[15px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <button
                type="submit"
                className="mt-3 w-full rounded-md bg-accent px-4 py-2.5 text-[15px] font-medium text-white hover:bg-accentDark"
              >
                Continue
              </button>
            </form>
          </>
        ) : (
          <p className="mt-2 text-[14px] leading-relaxed text-sub">
            The admin area is closed because no access key is configured. Set{" "}
            <code className="rounded bg-panel2 px-1">ADMIN_ACCESS_KEY</code> in the
            environment and redeploy.
          </p>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
