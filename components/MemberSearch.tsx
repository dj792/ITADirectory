"use client";

import { useMemo, useState } from "react";
import FilterSelect from "@/components/FilterSelect";
import {
  applyFilters,
  hasActiveSearch,
  EMPTY_FILTERS,
  MIN_QUERY_LENGTH,
  type Filters,
} from "@/lib/directory/search";
import type { Directory, Member } from "@/lib/directory/types";

/**
 * The search experience. Filtering happens in the BROWSER over the full list,
 * which the server sent once — 203 members is roughly 40KB of JSON, so a
 * round trip per keystroke would buy nothing and cost a visible delay. If the
 * membership ever reaches a few thousand, move `applyFilters` behind a route
 * and debounce; `search.ts` is written to run on either side for that reason.
 */
export default function MemberSearch({ directory }: { directory: Directory }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  // Nothing is shown until the reader has actually asked for something. The
  // filtering is skipped entirely rather than run and hidden, so an idle page
  // never has 203 members' details sitting in the rendered output.
  const active = hasActiveSearch(filters);
  const results = useMemo(
    () => (active ? applyFilters(directory.members, filters) : []),
    [active, directory.members, filters]
  );

  // Typed something, but not yet enough. Worth its own message: silence here
  // reads as "no matches" and sends people away thinking the name isn't listed.
  const typedTooShort = !active && filters.q.trim().length > 0;

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const isFiltered =
    !!filters.q ||
    !!filters.membershipLevel ||
    !!filters.status ||
    !!filters.lastEvent;

  // Only render a dropdown the data can actually populate. A filter whose only
  // option is "all" is a dead control that still costs a column of width — and
  // this way a column ITA hasn't added yet simply isn't there, then appears on
  // its own the first time it carries values.
  const dropdowns = [
    {
      label: "Membership level",
      value: filters.membershipLevel,
      options: directory.facets.membershipLevel,
      onChange: (v: string) => set({ membershipLevel: v }),
    },
    {
      label: "Profile status",
      value: filters.status,
      options: directory.facets.status,
      onChange: (v: string) => set({ status: v }),
    },
    {
      label: "Last event signed up for",
      value: filters.lastEvent,
      options: directory.facets.lastEvent,
      onChange: (v: string) => set({ lastEvent: v }),
    },
  ].filter((d) => d.options.length > 0);

  return (
    <div className="space-y-5">
      {/* ── Search + filters ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-hair bg-panel p-4 shadow-sm sm:p-5">
        <label htmlFor="q" className="sr-only">
          Search members
        </label>
        <div className="relative">
          <SearchIcon />
          <input
            id="q"
            type="search"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search by name, company, or email…"
            autoComplete="off"
            className="w-full rounded-md border border-hair bg-white py-3 pl-11 pr-4 text-[15px] text-fg placeholder:text-sub focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {/* Every dropdown ANDs with the others and with the text box. */}
        {dropdowns.length > 0 && (
          <div
            className={`mt-3 grid gap-3 ${
              dropdowns.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"
            }`}
          >
            {dropdowns.map((d) => (
              <FilterSelect
                key={d.label}
                label={d.label}
                value={d.value}
                options={d.options}
                onChange={d.onChange}
              />
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[13px] text-sub">
          {/* aria-live so a screen reader hears the count change as you type. */}
          <span aria-live="polite">
            {!active
              ? typedTooShort
                ? `Keep typing — ${MIN_QUERY_LENGTH} characters minimum`
                : `${directory.members.length} members in the directory`
              : results.length === directory.members.length
                ? `${directory.members.length} members`
                : `${results.length} of ${directory.members.length} members`}
          </span>
          {isFiltered && (
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

      {/* ── Results ──────────────────────────────────────────────────────── */}
      {!active ? (
        <EmptyState
          heading={typedTooShort ? "Keep typing…" : "Search the ITA membership"}
          body={
            typedTooShort
              ? `Enter at least ${MIN_QUERY_LENGTH} characters, or pick a filter above.`
              : "Type a name, company, or email address — or choose a filter above — to see members."
          }
        />
      ) : results.length === 0 ? (
        <EmptyState
          heading="No members match that search"
          body="Check the spelling, try a shorter search, or clear the filters."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((m) => (
            <MemberCard key={m.id} member={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The idle and no-match states share a shape so the page doesn't visibly
 * restructure between them — only the words change.
 */
function EmptyState({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-xl border border-hair bg-panel px-6 py-12 text-center">
      <SearchGlyph />
      <p className="mt-3 text-[15px] font-semibold text-strong">{heading}</p>
      <p className="mx-auto mt-1 max-w-sm text-[14px] leading-relaxed text-sub">{body}</p>
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="mx-auto h-8 w-8 text-hair"
    >
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function MemberCard({ member: m }: { member: Member }) {
  const place = [m.city, m.state].filter(Boolean).join(", ");
  return (
    <li className="flex flex-col rounded-xl border border-hair bg-panel p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md">
      <h2 className="text-[15px] font-semibold leading-snug text-strong">{m.name}</h2>
      {m.organization && <p className="mt-0.5 text-[13px] text-sub">{m.organization}</p>}

      {(m.membershipLevel || m.status) && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {m.membershipLevel && (
            <span className="inline-block rounded-sm bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-accentDark">
              {m.membershipLevel}
            </span>
          )}
          {/*
            Suppressed when the level already begins with it — "Technology
            Partner - Gold" alongside "Technology Partner" is noise, not
            information.
          */}
          {m.status && !m.membershipLevel.startsWith(m.status) && (
            <span className="inline-block rounded-sm border border-hair px-2 py-1 text-[11px] font-medium text-sub">
              {m.status}
            </span>
          )}
        </p>
      )}

      <dl className="mt-3 space-y-1 text-[13px]">
        {place && (
          <div className="flex gap-2">
            <dt className="sr-only">Location</dt>
            <dd className="text-sub">{place}</dd>
          </div>
        )}
        {m.email && (
          <div>
            <dt className="sr-only">Email</dt>
            <dd>
              <a
                href={`mailto:${m.email}`}
                className="break-all text-accent hover:underline"
              >
                {m.email}
              </a>
            </dd>
          </div>
        )}
        {m.website && (
          <div>
            <dt className="sr-only">Website</dt>
            <dd>
              <a
                href={href(m.website)}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all text-accent hover:underline"
              >
                {display(m.website)}
              </a>
            </dd>
          </div>
        )}
      </dl>
    </li>
  );
}

/**
 * The export stores websites three ways — "http://x.com", "www.x.com", "x.com".
 * A bare domain in an href is read as a RELATIVE path, so "www.martus.com"
 * would link to /www.martus.com on our own site. Always emit a scheme.
 */
function href(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** Show the domain without the scheme — the scheme is noise on a card. */
function display(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sub"
    >
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
      <path d="m13.5 13.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
