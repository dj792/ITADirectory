import BrandMark from "@/components/BrandMark";
import MemberSearch from "@/components/MemberSearch";
import SignOutButton from "@/components/SignOutButton";
import SiteFooter from "@/components/SiteFooter";
import TestingModeBanner from "@/components/TestingModeBanner";
import { auth } from "@/auth";
import { isTestingSession, testingModeEnabled } from "@/lib/testing-mode";
import { loadDirectory } from "@/lib/directory/service";

/**
 * The directory page. Reads the sheet SERVER-side and hands the browser a
 * ready-to-filter list, so no Google credential and no member-data endpoint is
 * ever exposed to the client.
 */
export const dynamic = "force-dynamic";

/**
 * Read the session without letting it take the page down.
 *
 * `auth()` THROWS when AUTH_SECRET is unset — the same misconfiguration that
 * makes the auth routes return "There was a problem with the server
 * configuration". Here it's only used for the greeting in the header, so an
 * unconfigured server should cost you the email address in the corner, not the
 * whole directory. The gate is middleware's job, not this call's.
 */
async function sessionOrNull() {
  try {
    return await auth();
  } catch {
    return null;
  }
}

export default async function DirectoryPage() {
  const [session, directory] = await Promise.all([sessionOrNull(), loadDirectory()]);

  return (
    // min-h-screen + flex-col, with `mt-auto` on the footer: on a search that
    // returns two results the footer sits at the bottom of the window rather
    // than floating halfway up it.
    <div className="flex min-h-screen flex-col">
      {/*
        Either condition shows it. The FLAG catches the open-directory case
        (middleware is letting everyone through, session or not). The SESSION
        catches the other direction: turning the flag off doesn't end sessions
        already issued through the bypass, and those still need to announce
        themselves.
      */}
      {(testingModeEnabled() || isTestingSession(session?.user?.memberId)) && (
        <TestingModeBanner />
      )}

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
          Search the ITA membership by name, company, or email.
        </p>

        <div className="mt-6">
          <MemberSearch directory={directory} />
        </div>
      </main>

      <SiteFooter note={<SourceNote directory={directory} />} />
    </div>
  );
}

/**
 * Where the list came from. The fixture case says so plainly rather than
 * letting a development list pass for the live membership.
 */
function SourceNote({ directory }: { directory: Awaited<ReturnType<typeof loadDirectory>> }) {
  // A live read was attempted and failed. Say so, and say what to do — this
  // list is local data wearing a live directory's clothes.
  if (directory.source.error) {
    return (
      <>
        <strong className="text-white">Not showing live data.</strong>{" "}
        {directory.source.error} Showing the local copy meanwhile
        {directory.members.length > 0 ? ` (${directory.members.length} members).` : "."}
      </>
    );
  }

  if (directory.source.kind !== "sheet") {
    return (
      <>
        Source: local development fixture (ProfileSelectorData.csv). Set
        DIRECTORY_SHEET_ID and share the sheet with the service account to read
        live data.
      </>
    );
  }
  return (
    <>
      Source: the ITA member sheet
      {directory.source.sheetUrl && (
        <>
          {" · "}
          <a
            href={directory.source.sheetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline-offset-2 hover:text-white hover:underline"
          >
            open in Google Sheets
          </a>
        </>
      )}
    </>
  );
}
