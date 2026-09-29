"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import FilterSelect from "@/components/FilterSelect";
import { citiesFor, pruneCities } from "@/lib/directory/location";
import SegmentedControl from "@/components/SegmentedControl";
import {
  applyFilters,
  hasActiveSearch,
  EMPTY_FILTERS,
  MIN_QUERY_LENGTH,
  type Filters,
} from "@/lib/directory/search";
import { filtersFromParams, filtersToQueryString } from "@/lib/directory/url";
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
  /*
   * THE SEARCH LIVES IN THE URL, for the same reason it does on the member
   * directory — and here it fixes a specific annoyance: without it, clicking
   * "Update profile" and coming back landed you on an empty search, so every
   * edit cost you retyping the query that found the person.
   *
   * `window.history.replaceState` rather than `router.replace`: this page is
   * force-dynamic, so a Next navigation would re-run the server component and
   * refetch the whole directory on every keystroke. REPLACE rather than push,
   * so typing eight letters doesn't bury the previous page under eight history
   * entries — while the link into the editor is a real navigation, so Back from
   * there returns here with the search intact.
   *
   * It reuses `lib/directory/url.ts`, so an admin search URL and a member
   * search URL use the same parameters and can be pasted between them.
   */
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));

  const queryString = filtersToQueryString(filters);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const next = `${window.location.pathname}${queryString ? `?${queryString}` : ""}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [queryString]);

  const active = hasActiveSearch(filters);
  const results = useMemo(
    () => (active ? applyFilters(directory.members, filters) : []),
    [active, directory.members, filters]
  );
  const typedTooShort = !active && filters.q.trim().length > 0;

  const levels = directory.facets.membershipLevel;
  // Same State/City filters as the members' directory, same matching rules.
  const states = directory.facets.state;
  const cities = citiesFor(directory.facets.city, filters.states);

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

        {(states.length > 0 || cities.length > 0) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {states.length > 0 && (
              <FilterSelect
                label="State"
                values={filters.states}
                options={states}
                onChange={(vs) =>
                  set({ states: vs, cities: pruneCities(filters.cities, vs) })
                }
                multiple
              />
            )}
            {cities.length > 0 && (
              <FilterSelect
                label="City"
                values={filters.cities}
                options={cities}
                onChange={(vs) => set({ cities: vs })}
                multiple
              />
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[13px] text-sub">
          <span aria-live="polite">
            {!active
              ? typedTooShort
                ? `Keep typing — ${MIN_QUERY_LENGTH} characters minimum`
                : `${directory.members.length} in the directory`
              : `${results.length} of ${directory.members.length}`}
          </span>
          {(filters.q ||
            filters.membershipLevels.length > 0 ||
            filters.states.length > 0 ||
            filters.cities.length > 0 ||
            filters.kind) && (
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
            <Card key={m.id} member={m} search={queryString} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Card({ member: m, search }: { member: Member; search: string }) {
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
          href={`/admin/members/${encodeURIComponent(m.id)}${search ? `?from=${encodeURIComponent(search)}` : ""}`}
          className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accentDark"
        >
          Update profile
        </Link>
        {/*
          LEAVES THE ADMIN AREA, so it opens a NEW TAB — a plain <a>, not
          `next/link`, because this is a different section of the site rather
          than a route within this one.

          Following it in place cost DJ his place twice over: the destination is
          a member's public profile, which looks enough like an admin detail
          page to be mistaken for one, and Back then landed him in the members'
          directory with the admin history gone. A new tab makes "this takes you
          somewhere else" true rather than merely stated, and leaves the search
          results exactly as they were.

          The label names the DESTINATION ("the directory") rather than
          describing a viewpoint — "View as a member sees it" reads like a
          preview mode, which is not what it is.
        */}
        <a
          href={`/member/${encodeURIComponent(m.id)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"
          title="Opens this member's page in the members' directory, in a new tab"
        >
          Open in the directory
          <span aria-hidden="true" className="text-[11px]">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
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
