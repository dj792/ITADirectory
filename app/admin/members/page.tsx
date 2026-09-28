import { Suspense } from "react";
import AdminMemberSearch from "@/components/AdminMemberSearch";
import { loadDirectory } from "@/lib/directory/service";

/**
 * Find a member, then edit their custom fields.
 *
 * Staff-facing, and for now the ONLY way profile answers can be edited at all:
 * ITA editing on a member's behalf is a feature they want permanently, and it
 * lets the whole flow — search, form, save — be built and reviewed without an
 * unauthenticated write surface waiting on sign-in work that is deliberately
 * parked. When members can sign in, the same form renders for them scoped to
 * their own ProfileID; nothing here needs rebuilding.
 */

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const directory = await loadDirectory();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl">Member Search</h1>
      <p className="mt-1 text-[14px] text-sub">
        Search the directory, then update a member’s custom fields on their
        behalf. Same search the members themselves use.
      </p>

      {directory.source.error && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          Not showing live data. {directory.source.error}
        </p>
      )}

      <div className="mt-6">
        {/* The search reads no URL params, but Suspense keeps it safe if it
            ever starts to — the same boundary the member-facing page has. */}
        <Suspense fallback={<p className="text-[14px] text-sub">Loading…</p>}>
          <AdminMemberSearch directory={directory} />
        </Suspense>
      </div>
    </main>
  );
}
