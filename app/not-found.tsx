import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";

/**
 * 404. Exists mainly so "every page carries the version" is actually true —
 * a mistyped URL is exactly the moment someone is trying to work out which
 * build they're on.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="mb-6 flex justify-center">
            <BrandMark height={48} />
          </div>
          <h1 className="text-lg font-semibold text-fg">Page not found</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-sub">
            That page doesn&rsquo;t exist here.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-md bg-accent px-4 py-2.5 text-[15px] font-semibold text-white transition hover:bg-accentDark"
          >
            Go to the directory
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
