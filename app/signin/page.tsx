import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import SignInForm from "./SignInForm";

export const metadata = { title: "Sign in — ITA Member Directory" };

export default function SignInPage() {
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
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
