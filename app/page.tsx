import BrandMark from "@/components/BrandMark";
import MemberSearch from "@/components/MemberSearch";
import SignOutButton from "@/components/SignOutButton";
import { auth } from "@/auth";
import { loadDirectory } from "@/lib/directory/service";

/**
 * The directory page. Reads the sheet SERVER-side and hands the browser a
 * ready-to-filter list, so no Google credential and no member-data endpoint is
 * ever exposed to the client.
 */
export const dynamic = "force-dynamic";

export default async function DirectoryPage() {
  // Middleware already redirected anyone unauthenticated; this read is for the
  // greeting, not the gate.
  const [session, directory] = await Promise.all([auth(), loadDirectory()]);

  return (
    <div className="min-h-screen">
      {/* White band under the logo, as on italliance.com. */}
      <header className="border-b border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark height={44} />
          {session?.user && (
            <div className="flex items-center gap-3 text-right">
              <span className="hidden text-[12px] text-sub sm:inline">
                {session.user.email}
              </span>
              <SignOutButton />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h1 className="text-2xl sm:text-[28px]">Member Directory</h1>
        <p className="mt-1 text-[15px] text-sub">
          Search the ITA membership by name, company, location, or email.
        </p>

        <div className="mt-6">
          <MemberSearch directory={directory} />
        </div>
      </main>

      <footer className="mt-6 bg-accentDark py-6 text-[12px] text-white/80">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          {directory.source.kind === "sheet" ? (
            <p>
              Source: the ITA member sheet
              {directory.source.sheetUrl && (
                <>
                  {" · "}
                  <a
                    href={directory.source.sheetUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-white underline-offset-2 hover:underline"
                  >
                    open in Google Sheets
                  </a>
                </>
              )}
            </p>
          ) : (
            // Says so plainly rather than pretending the list is live — the
            // whole point of the fixture is to build before the sheet is shared.
            <p>
              Source: local development fixture (ProfileSelectorData.csv). Set
              DIRECTORY_SHEET_ID and share the sheet with the service account to
              read live data.
            </p>
          )}
          <p className="mt-2">
            © {new Date().getFullYear()} Information Technology Alliance
          </p>
        </div>
      </footer>
    </div>
  );
}
