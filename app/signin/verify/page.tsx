import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { verifyLoginToken } from "@/lib/login-token";
import { findMemberByEmail } from "@/lib/access";
import AutoSignIn from "./AutoSignIn";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signing in — ITA Member Directory" };

/**
 * Landing page for the magic link. Verifies the token AND re-checks the
 * allowlist before rendering anything — `authorize` checks both again when the
 * session is actually issued, so this is a courtesy (a clear message instead of
 * a silent failure), not the gate.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const email = token ? verifyLoginToken(token) : null;
  const identity = email ? await findMemberByEmail(email) : null;

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <BrandMark height={48} />
          </div>
          <div className="rounded-xl border border-hair bg-panel p-8 shadow-sm">
            {identity ? (
              <AutoSignIn token={token} />
            ) : (
              <div className="text-center">
                <h1 className="text-lg font-semibold text-fg">
                  That link didn&rsquo;t work
                </h1>
                <p className="mt-2 text-[14px] leading-relaxed text-sub">
                  Sign-in links expire after 10 minutes. Request a new one and use
                  the most recent email.
                </p>
                <Link
                  href="/signin"
                  className="mt-6 inline-block rounded-md bg-accent px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-accentDark"
                >
                  Back to sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
