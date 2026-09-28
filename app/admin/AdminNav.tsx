"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutOfAdmin } from "./actions";

/**
 * The admin menu.
 *
 * ── WHY THIS IS A CLIENT COMPONENT ────────────────────────────────────────
 *
 * Solely for `usePathname`, so the current section can be marked. A menu where
 * every item looks identical doesn't tell you where you are, and in an area
 * whose pages all look alike — a heading and a list — "where am I" is a real
 * question. Nothing else here needs the client.
 *
 * ── THE TWO GROUPS ARE DIFFERENT KINDS OF WORK ────────────────────────────
 *
 * **Member data** (Member Search) is about one member's answers. **Form setup**
 * (Form Fields, Dropdown Lists, Preview) is about what every member is asked.
 * Confusing them is how someone edits a field definition when they meant to
 * edit a person, so they are separated by a rule rather than sitting in one
 * undifferentiated row.
 *
 * ── "DIRECTORY" MEANS THE MEMBERS' DIRECTORY ──────────────────────────────
 *
 * DJ's call, 28 Sep: the admin search is **Member Search**; the word
 * *directory* is reserved for the thing members use. So the only item called
 * Directory is the one that LEAVES the admin area, and it is set apart on the
 * right with an arrow to say so — a menu item that navigates you out of the
 * section shouldn't sit among the ones that don't.
 */

type Item = { href: string; label: string; match?: (path: string) => boolean };

const MEMBER_DATA: Item[] = [
  {
    href: "/admin/members",
    label: "Member Search",
    match: (p) => p.startsWith("/admin/members"),
  },
];

const FORM_SETUP: Item[] = [
  // `/admin` is the fields screen, so it must match EXACTLY — otherwise it
  // lights up on every admin page, which is worse than marking nothing.
  { href: "/admin", label: "Form Fields", match: (p) => p === "/admin" },
  { href: "/admin/options", label: "Dropdown Lists" },
  { href: "/admin/forms", label: "Preview" },
];

export default function AdminNav() {
  const pathname = usePathname() ?? "";
  const isOn = (item: Item) =>
    item.match ? item.match(pathname) : pathname.startsWith(item.href);

  return (
    <nav aria-label="Administration" className="border-b border-hair bg-panel2">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-stretch gap-x-1 px-4 sm:px-6">
        {MEMBER_DATA.map((item) => (
          <Tab key={item.href} item={item} on={isOn(item)} />
        ))}

        <span aria-hidden="true" className="my-2 w-px shrink-0 bg-hair" />

        {FORM_SETUP.map((item) => (
          <Tab key={item.href} item={item} on={isOn(item)} />
        ))}

        <span className="ml-auto flex items-stretch gap-x-1">
          <a
            href="/"
            className="flex items-center gap-1 border-b-2 border-transparent px-3 py-2.5 text-[13px] text-sub hover:text-accent"
            title="Open the directory members see"
          >
            Directory
            <span aria-hidden="true" className="text-[11px]">
              ↗
            </span>
          </a>
          <form action={signOutOfAdmin} className="flex items-stretch">
            <button
              type="submit"
              className="border-b-2 border-transparent px-3 py-2.5 text-[13px] text-sub hover:text-accent"
            >
              Sign out
            </button>
          </form>
        </span>
      </div>
    </nav>
  );
}

/**
 * A tab. The active one gets an accent underline AND accent text — colour
 * alone would be the only signal for someone who can't distinguish it, and
 * `aria-current` carries it to a screen reader regardless.
 */
function Tab({ item, on }: { item: Item; on: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={on ? "page" : undefined}
      className={`border-b-2 px-3 py-2.5 text-[13px] transition-colors ${
        on
          ? "border-accent font-semibold text-accentDark"
          : "border-transparent text-sub hover:border-hair hover:text-accent"
      }`}
    >
      {item.label}
    </Link>
  );
}
