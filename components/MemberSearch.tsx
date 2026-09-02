"use client";

import { useMemo, useState } from "react";
import { applyFilters, EMPTY_FILTERS, type Filters } from "@/lib/directory/search";
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

  const results = useMemo(
    () => applyFilters(directory.members, filters),
    [directory.members, filters]
  );

  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const isFiltered =
    !!filters.q || !!filters.membershipLevel || !!filters.status || !!filters.state;

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
            placeholder="Search by name, company, city, email…"
            autoComplete="off"
            className="w-full rounded-md border border-hair bg-white py-3 pl-11 pr-4 text-[15px] text-fg placeholder:text-sub focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select
            label="Membership level"
            value={filters.membershipLevel}
            options={directory.facets.membershipLevel}
            onChange={(v) => set({ membershipLevel: v })}
          />
          <Select
            label="Category"
            value={filters.status}
            options={directory.facets.status}
            onChange={(v) => set({ status: v })}
          />
          <Select
            label="State"
            value={filters.state}
            options={directory.facets.state}
            onChange={(v) => set({ state: v })}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-[13px] text-sub">
          <span aria-live="polite">
            {results.length === directory.members.length
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
      {results.length === 0 ? (
        <p className="rounded-xl border border-hair bg-panel p-8 text-center text-[15px] text-sub">
          No members match that search.
        </p>
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

function MemberCard({ member: m }: { member: Member }) {
  const place = [m.city, m.state].filter(Boolean).join(", ");
  return (
    <li className="flex flex-col rounded-xl border border-hair bg-panel p-4 shadow-sm transition hover:border-accent/40 hover:shadow-md">
      <h2 className="text-[15px] font-semibold leading-snug text-strong">{m.name}</h2>
      {m.organization && <p className="mt-0.5 text-[13px] text-sub">{m.organization}</p>}

      {m.membershipLevel && (
        <p className="mt-2">
          <span className="inline-block rounded-sm bg-accent/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-accentDark">
            {m.membershipLevel}
          </span>
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

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-hair bg-white px-3 py-2.5 text-[14px] text-fg focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <option value="">{label}: all</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
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
