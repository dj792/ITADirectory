import Link from "next/link";
import { notFound } from "next/navigation";
import BrandMark from "@/components/BrandMark";
import SignOutButton from "@/components/SignOutButton";
import Roster from "@/components/Roster";
import SiteFooter from "@/components/SiteFooter";
import TestingModeBanner from "@/components/TestingModeBanner";
import { auth } from "@/auth";
import { monthYearLabel } from "@/lib/directory/date";
import { PENDING_NOTE } from "@/lib/directory/pending";
import { loadDirectory } from "@/lib/directory/service";
import { filtersFromParams, memberHref, searchHref } from "@/lib/directory/url";
import { isTestingSession, testingModeEnabled } from "@/lib/testing-mode";
import type { Member } from "@/lib/directory/types";

/**
 * One member, at their own URL.
 *
 * Keyed on ProfileID — the source system's own key, stable across re-exports,
 * which is what makes a link someone emails still work next month. A name would
 * change and collide; a row number would move.
 *
 * It re-reads the SAME directory the results page used (a five-minute cached
 * read, so this is usually free) and finds the member in it, rather than being
 * handed data through the URL. That means the page is correct when someone
 * opens the link cold, days later, from an email.
 */
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const { members } = await loadDirectory();
  const member = members.find((m) => m.id === decodeURIComponent(id));
  return { title: member ? `${member.name} — ITA Member Directory` : "Member not found" };
}

export default async function MemberPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [session, directory] = await Promise.all([sessionOrNull(), loadDirectory()]);

  const member = directory.members.find((m) => m.id === decodeURIComponent(id));
  // A stale link — the member left, or the ID changed upstream. A real 404 is
  // the honest answer; `not-found.tsx` carries the brand and a way back.
  if (!member) notFound();

  // The search that got them here, carried in the query string so "back to
  // results" survives a reload or a forwarded link.
  const filters = filtersFromParams(sp);
  const backHref = searchHref(filters);
  const cameFromSearch = backHref !== "/";

  return (
    <div className="flex min-h-screen flex-col">
      {(testingModeEnabled() || isTestingSession(session?.user?.memberId)) && (
        <TestingModeBanner />
      )}

      <header className="border-b border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={backHref} aria-label="ITA Member Directory — back to search">
            <BrandMark height={44} />
          </Link>
          {session?.user && (
            <div className="flex items-center gap-3">
              <span className="hidden text-[12px] text-sub sm:inline">{session.user.email}</span>
              <SignOutButton />
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
        >
          <span aria-hidden="true">←</span>
          {cameFromSearch ? "Back to results" : "Back to search"}
        </Link>

        <div className="mt-4 rounded-xl border border-hair bg-panel p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl leading-tight sm:text-[28px]">{member.name}</h1>
          {member.organization && (
            <p className="mt-1 text-[16px] text-sub">{member.organization}</p>
          )}

          {/*
            A person admitted via a member firm is NOT an ITA member, and the
            page must not imply otherwise. Their membership badges are their
            employer's, so instead of showing those, say where they work and
            link to the firm whose membership actually brought them here.
          */}
          {!member.isMember && member.relatedOrgName && (
            <p className="mt-2 text-[14px] text-sub">
              {member.titleAtOrg && <>{member.titleAtOrg} · </>}
              <Link
                href={memberHref(member.relatedOrgId, filters)}
                className="text-accent hover:underline"
              >
                {member.relatedOrgName}
              </Link>
              <span className="ml-1 text-sub">(ITA member)</span>
            </p>
          )}

          {member.isMember && (member.membershipLevel || member.status) && (
            <p className="mt-3 flex flex-wrap gap-1.5">
              {member.membershipLevel && (
                <span className="inline-block rounded-sm bg-accent/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accentDark">
                  {member.membershipLevel}
                </span>
              )}
              {member.status && !member.membershipLevel.startsWith(member.status) && (
                <span className="inline-block rounded-sm border border-hair px-2.5 py-1 text-[11px] font-medium text-sub">
                  {member.status}
                </span>
              )}
            </p>
          )}

          <Details member={member} />
        </div>

        {/* A member organisation's people. Absent for individuals and for
            orgs with no recorded relations. */}
        <Roster entries={directory.rosters[member.id] ?? []} filters={filters} />
      </main>

      <SiteFooter />
    </div>
  );
}

/**
 * Every field the parser carries, in reading order — contact first, because
 * that's why people open a directory.
 *
 * Empty fields are OMITTED rather than shown blank: this export is patchy by
 * nature (only ~5% have a second email, most have no ZIP), and a column of
 * em-dashes reads as a broken page rather than an incomplete record.
 */
function Details({ member: m }: { member: Member }) {
  // Street lines first, then the city line — a postal address, not a list of
  // fields. ZIP joins the city line rather than standing alone.
  const cityLine = [[m.city, m.state].filter(Boolean).join(", "), m.zip]
    .filter(Boolean)
    .join(" ");
  const address = [m.address1, m.address2, cityLine].filter(Boolean).join("\n");

  const rows: { label: string; value: React.ReactNode; pending?: boolean }[] = [];
  const add = (label: string, value: React.ReactNode, present: boolean) => {
    if (present) rows.push({ label, value });
  };
  /**
   * A row for a field the source doesn't carry yet — shown greyed rather than
   * omitted. Same reasoning as the disabled filter: a row that simply isn't
   * there is indistinguishable from one we decided not to publish.
   */
  const addPending = (label: string, note: string) =>
    rows.push({ label, value: note, pending: true });

  add(
    "Email",
    <a href={`mailto:${m.email}`} className="break-all text-accent hover:underline">
      {m.email}
    </a>,
    !!m.email
  );
  add(
    "Website",
    <a
      href={/^https?:\/\//i.test(m.website) ? m.website : `https://${m.website}`}
      target="_blank"
      rel="noreferrer noopener"
      className="break-all text-accent hover:underline"
    >
      {m.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
    </a>,
    !!m.website
  );
  add("Phone", m.phone, !!m.phone);
  // `whitespace-pre-line` renders the newlines the address was built with.
  add("Address", <span className="whitespace-pre-line">{address}</span>, !!address);

  // The main contact at a member organisation. Their email is the directory
  // address shown above, so it isn't repeated.
  add(
    "Main contact",
    <>
      {m.contactName}
      {m.contactTitle && <span className="text-sub"> · {m.contactTitle}</span>}
    </>,
    !!m.contactName
  );
  add("Main contact phone", m.contactPhone, !!m.contactPhone && m.contactPhone !== m.phone);

  /*
   * Membership facts belong to MEMBERS. A related individual's own profile row
   * may still carry a stale level or status from the CRM, and printing it under
   * "Membership level" would assert something about their standing with ITA
   * that isn't true. Gated on `isMember`, not on whether the cell has a value.
   */
  if (m.isMember) {
    add("Member since", monthYearLabel(m.memberSince), !!monthYearLabel(m.memberSince));
    add("Membership level", m.membershipLevel, !!m.membershipLevel);
    add("Profile status", m.status, !!m.status);
  } else {
    add("Title", m.titleAtOrg, !!m.titleAtOrg);
    add("Organization", m.relatedOrgName, !!m.relatedOrgName);
  }

  // ── Coming soon ─────────────────────────────────────────────────────────
  // The SQL view has no event columns. These light up on their own once it
  // does — nothing here needs changing. See lib/directory/pending.ts.
  const anyEvent = m.lastEvent || m.lastEventAttended || m.eventCount12mo;
  if (anyEvent) {
    add("Last event signed up for", m.lastEvent, !!m.lastEvent);
    add("Last event attended", m.lastEventAttended, !!m.lastEventAttended);
    add("Events attended (past 12 months)", m.eventCount12mo, !!m.eventCount12mo);
  } else {
    addPending("Event history", PENDING_NOTE.events);
  }

  add("Listing level", m.listingLevel, !!m.listingLevel);
  add("Profile ID", <span className="font-mono text-[13px]">{m.id}</span>, !!m.id);

  if (rows.length === 0) {
    return (
      <p className="mt-6 border-t border-hair pt-6 text-[14px] text-sub">
        No further details are recorded for this member.
      </p>
    );
  }

  return (
    <dl className="mt-6 border-t border-hair pt-6 text-[14px]">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex flex-col gap-0.5 sm:flex-row sm:gap-4 ${
            i > 0 ? "mt-4 border-t border-hair pt-4" : ""
          }`}
        >
          <dt className="text-sub sm:w-56 sm:shrink-0">{r.label}</dt>
          <dd className={r.pending ? "text-sub italic" : "text-fg"}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** See app/page.tsx — an unconfigured AUTH_SECRET shouldn't take the page down. */
async function sessionOrNull() {
  try {
    return await auth();
  } catch {
    return null;
  }
}
