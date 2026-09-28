"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FilterSelect from "@/components/FilterSelect";
import SegmentedControl from "@/components/SegmentedControl";
import {
  applyFilters,
  hasActiveSearch,
  EMPTY_FILTERS,
  MIN_QUERY_LENGTH,
  type Filters,
} from "@/lib/directory/search";
import type { Directory, Member } from "@/lib/directory/types";

/**
 * The directory search, for staff.
 *
 * ── IT SHARES THE LOGIC, NOT THE COMPONENT ────────────────────────────────
 *
 * Every rule a member experiences comes from `lib/directory/search.ts` — the
 * same `applyFilters`, the same three-character gate, the same OR-within /
 * AND-across facet semantics, the same "a level matches your firm's level".
 * So this cannot drift from what members see, which is the point of
 * "replicate the directory search".
 *
 * What it does NOT share is `MemberSearch` itself. That component owns things
 * this screen shouldn't have — the CSV download and its property disclaimer,
 * URL syncing tuned for shareable member links, cards that open a public
 * profile — and threading "but not that bit" props through it would make the
 * member-facing directory harder to reason about in order to save a list and a
 * card here. The expensive thing to duplicate is the MATCHING, and that isn't
 * duplicated.
 *
 * The result cards lead with "Update profile" rather than being clickable
 * links, because on this screen editing is the reason you searched.
 */
export default function AdminMemberSearch({ directory }: { directory: Directory }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const active = hasActiveSearch(filters);
  const results = useMemo(
    () => (active ? applyFilters(directory.members, filters) : []),
    [active, directory.members, filters]
  );
  const typedTooShort = !active && filters.q.trim().length > 0;

  const levels = directory.facets.membershipLevel;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-hair bg-panel p-4 shadow-sm">
        {levels.length > 0 && (
          <div className="mb-3">
            <FilterSelect
              label="Membership level"
              values={filters.membershipLevels}
              options={levels}
              onChange={(vs) => set({ membershipLevels: vs })}
              multiple
            />
          </div>
        )}

        <label htmlFor="admin-q" className="sr-only">
          Search members
        </label>
        <input
          id="admin-q"
          type="search"
          value={filters.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search by name, company, or email…"
          autoComplete="off"
          className="w-full rounded-md border border-hair bg-white px-4 py-3 text-[15px] text-fg placeholder:text-sub focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />

        <div className="mt-3">
          <SegmentedControl
            label="Show organizations, individuals, or both"
            value={filters.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { value: "", label: "Both" },
              { value: "org", label: "Organizations" },
              { value: "individual", label: "Individuals" },
            ]}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-[13px] text-sub">
          <span aria-live="polite">
            {!active
              ? typedTooShort
                ? `Keep typing — ${MIN_QUERY_LENGTH} characters minimum`
                : `${directory.members.length} in the directory`
              : `${results.length} of ${directory.members.length}`}
          </span>
          {(filters.q || filters.membershipLevels.length > 0 || filters.kind) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-lg px-2 py-1 font-medium text-accent hover:bg-panel2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!active ? (
        <Empty
          heading={typedTooShort ? "Keep typing…" : "Find a member to update"}
          body={
            typedTooShort
              ? `Enter at least ${MIN_QUERY_LENGTH} characters, or pick a membership level.`
              : "Choose a membership level above, or type a name, company, or email address."
          }
        />
      ) : results.length === 0 ? (
        <Empty
          heading="No members match that search"
          body="Check the spelling, try a shorter search, or clear the filters."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((m) => (
            <Card key={m.id} member={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({ member: m }: { member: Member }) {
  const place = [m.city, m.state].filter(Boolean).join(", ");
  return (
    <li className="flex flex-col rounded-xl border border-hair bg-panel p-4">
      <p className="text-[15px] font-semibold leading-snug text-strong">{m.name}</p>
      {!m.isMember && (m.titleAtOrg || m.relatedOrgName) ? (
        <p className="mt-0.5 text-[13px] leading-snug text-sub">
          {m.titleAtOrg}
          {m.titleAtOrg && m.relatedOrgName && " · "}
          {m.relatedOrgName}
        </p>
      ) : (
        m.organization && <p className="mt-0.5 text-[13px] text-sub">{m.organization}</p>
      )}

      <p className="mt-2 flex flex-wrap gap-1.5">
        {m.isMember && m.membershipLevel ? (
          <span className="rounded-sm bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-accentDark">
            {m.membershipLevel}
          </span>
        ) : (
          <span className="rounded-sm border border-hair px-2 py-1 text-[11px] font-medium text-sub">
            At a member organization
          </span>
        )}
      </p>

      <dl className="mt-2 space-y-0.5 text-[13px] text-sub">
        {place && <dd>{place}</dd>}
        {m.email && <dd className="break-all">{m.email}</dd>}
      </dl>

      <div className="mt-3 flex items-center gap-3 pt-1">
        <Link
          href={`/admin/members/${encodeURIComponent(m.id)}`}
          className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accentDark"
        >
          Update profile
        </Link>
        <Link
          href={`/member/${encodeURIComponent(m.id)}`}
          className="text-[13px] text-accent hover:underline"
        >
          View as a member sees it
        </Link>
      </div>
    </li>
  );
}

function Empty({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-xl border border-hair bg-panel px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-strong">{heading}</p>
      <p className="mx-auto mt-1 max-w-sm text-[14px] leading-relaxed text-sub">{body}</p>
    </div>
  );
}
