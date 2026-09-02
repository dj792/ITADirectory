import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import { testingModeEnabled } from "@/lib/testing-mode";
import SignInForm from "./SignInForm";
import TestingModeButton from "./TestingModeButton";

export const metadata = { title: "Sign in — ITA Member Directory" };

/**
 * Read the testing flag SERVER-side and pass down a boolean. The flag itself
 * never reaches the browser, so the bypass can't be revealed by editing client
 * state — and `authorize` re-checks it regardless.
 *
 * force-dynamic because of that read: a statically prerendered sign-in page
 * would bake in whatever the flag was at BUILD time, so turning testing mode
 * off in Vercel wouldn't remove the button until the next deploy.
 */
export const dynamic = "force-dynamic";

export default function SignInPage() {
  const testing = testingModeEnabled();

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <BrandMark height={48} />
          </div>
          <div className="rounded-xl border border-hair bg-panel p-8 shadow-sm">
            <h1 className="text-xl">Member Directory</h1>
            <p className="mt-2 text-[14px] leading-relaxed text-sub">
              Enter the email address on your ITA membership and we&rsquo;ll send
              you a sign-in link. No password needed.
            </p>
            <SignInForm />
            {testing && <TestingModeButton />}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
