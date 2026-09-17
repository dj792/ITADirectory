import Link from "next/link";
import { memberHref } from "@/lib/directory/url";
import type { Filters } from "@/lib/directory/search";
import type { RosterEntry } from "@/lib/directory/types";

/**
 * The people at a member organization.
 *
 * Laid out as in the reference design: name and title on the left, email and
 * phone on the right, and a badge in the bottom-right corner for the main or
 * billing contact — the main contact's row outlined in ITA blue, because "who
 * do I call" is the question a roster exists to answer.
 *
 * The ORDER is meaningful and set upstream in `relations.linksByOrg`: main
 * contact, then billing contact, then by title. Don't re-sort here — the badge
 * and the position should agree, and the data layer is where "who is the main
 * contact" is decided (from the ORG-side relation row, not the person's).
 */
export default function Roster({
  entries,
  filters,
}: {
  entries: RosterEntry[];
  /** Carried into each person's link so "back to results" still works. */
  filters: Filters;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold text-strong">
        People at this organization
        <span className="ml-2 font-normal text-sub">{entries.length}</span>
      </h2>

      <ul className="mt-3 space-y-2">
        {entries.map((p) => (
          <li
            key={p.id}
            className={[
              "relative rounded-lg border p-4 pr-28 transition",
              p.mainContact
                ? "border-accent bg-panel2/40"
                : "border-hair bg-panel2/25 hover:border-sub/30",
            ].join(" ")}
          >
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <div className="min-w-0">
                {/*
                  A related person has their own profile page — they were
                  admitted to the directory by this very link, so it always
                  resolves.
                */}
                <Link
                  href={memberHref(p.id, filters)}
                  className="text-[15px] font-medium text-accent hover:underline"
                >
                  {p.name}
                </Link>
                {p.title && (
                  <p className="mt-0.5 text-[13px] leading-snug text-sub">{p.title}</p>
                )}
              </div>

              <div className="min-w-0 text-[13px]">
                {p.email && (
                  <p>
                    <a
                      href={`mailto:${p.email}`}
                      className="break-all text-accent hover:underline"
                    >
                      {p.email}
                    </a>
                  </p>
                )}
                {p.phone && <p className="mt-0.5 text-fg">{p.phone}</p>}
              </div>
            </div>

            {/* One badge only — main outranks billing, as the sort does. */}
            {(p.mainContact || p.billingContact) && (
              <span
                className={[
                  "absolute bottom-0 right-0 rounded-tl-md px-2 py-1 text-[11px] font-semibold",
                  p.mainContact ? "bg-accent text-white" : "bg-hair text-sub",
                ].join(" ")}
              >
                {p.mainContact ? "Main Contact" : "Billing Contact"}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
