import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieValid } from "@/lib/admin-gate";
import { signOutOfAdmin } from "./actions";

/**
 * THE GATE FOR EVERY ADMIN PAGE.
 *
 * In the LAYOUT rather than in each page, so a new admin screen is protected by
 * existing rather than by remembering to add a check — the failure mode with
 * per-page guards is always the page someone added last.
 *
 * It is not in `middleware.ts` because that runs on the edge runtime, where the
 * Node `crypto` this uses isn't available. The layout runs in Node, and every
 * admin route renders through it, so the coverage is the same.
 *
 * NOT CONFIGURED ⇒ CLOSED. With no `ADMIN_ACCESS_KEY` set, the admin area
 * refuses everyone rather than opening to everyone. That is the opposite of how
 * `TESTING_MODE` behaves, and deliberately: testing mode fails open because a
 * blank directory page helps nobody, while an unprotected write surface is the
 * one thing worth failing closed over.
 */

export const metadata: Metadata = {
  title: "Admin — ITA Member Directory",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const authed = adminCookieValid(jar.get(ADMIN_COOKIE)?.value);

  /*
   * DEFENSIVE ONLY — middleware is the gate (`lib/admin-gate-edge.ts`), and it
   * redirects before any page component runs. This repeats the check because
   * the two fail differently: a matcher edit can take a path out of
   * middleware's scope, and this would still stop the render. It REDIRECTS
   * rather than rendering a prompt, because rendering anything here means the
   * page beneath already ran — which is precisely the bug that moved the gate
   * to middleware in the first place.
   */
  if (!authed) redirect("/admin-login");

  return (
    <Shell>
      <nav className="border-b border-hair bg-panel2">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-2 text-[13px] sm:px-6">
          <Link href="/admin" className="text-accent hover:underline">
            Fields
          </Link>
          <Link href="/admin/members" className="text-accent hover:underline">
            Members
          </Link>
          <Link href="/admin/options" className="text-accent hover:underline">
            Dropdown lists
          </Link>
          <Link href="/admin/forms" className="text-accent hover:underline">
            Preview
          </Link>
          <Link href="/" className="text-accent hover:underline">
            Directory
          </Link>
          <form action={signOutOfAdmin} className="ml-auto">
            <button type="submit" className="text-sub hover:text-fg">
              Sign out
            </button>
          </form>
        </div>
      </nav>
      {children}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark height={40} />
          <span className="text-[12px] text-sub">Administration</span>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter note="Administration — changes here affect what every member is asked." />
    </div>
  );
}
