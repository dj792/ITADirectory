import type { Metadata } from "next";
import BrandMark from "@/components/BrandMark";
import SiteFooter from "@/components/SiteFooter";
import versionData from "@/version.json";

/**
 * Release notes for ITA's review — served at `/releaseNotes.html`.
 *
 * WHY THE FOLDER IS NAMED WITH A DOT: an App Router segment is taken
 * literally, so `app/releaseNotes.html/page.tsx` publishes at exactly
 * `/releaseNotes.html`. That was the address asked for, and it is worth
 * keeping stable — it goes out in an email, and a link in someone's inbox
 * outlives our folder conventions. Renaming this folder changes a URL that
 * has already been sent to a customer.
 *
 * UNLISTED, NOT SECRET. Three things keep it out of search results while
 * leaving it reachable by anyone holding the link:
 *
 *  1. `robots: noindex, nofollow` below — the meta tag.
 *  2. An `X-Robots-Tag` response header for this path in `next.config.js`,
 *     which covers crawlers that take the header and never parse the HTML.
 *  3. Nothing anywhere in the app links here. It is reachable only by typing
 *     or pasting the address.
 *
 * DELIBERATELY NOT in `robots.txt`. A `Disallow` line would publish the path
 * to anyone who reads robots.txt — the opposite of unlisted — and a disallowed
 * page can't be crawled to discover its own `noindex`, so it can still surface
 * as a bare URL. The meta tag plus the header is the combination that actually
 * suppresses a page; a robots.txt entry would only advertise it.
 *
 * It is also exempt from the sign-in gate in `middleware.ts`: it holds no
 * member data, and the point of the link is that ITA can read it without an
 * account. That exemption is what keeps it working once authentication is on.
 */
export const metadata: Metadata = {
  title: "ITA Member Directory — Release Notes",
  description: "What is live in the ITA Member Directory, for review.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false, noimageindex: true },
  },
};

/** The as-of date is a constant for the same reason `COPYRIGHT_YEAR` is: this
 *  page is statically prerendered, so a computed date would freeze at build
 *  time and quietly disagree with the dynamic pages. Bump it when the notes
 *  change. */
const AS_OF = "16 September 2026";

export default function ReleaseNotesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-hair bg-panel">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <BrandMark height={44} />
          <span className="text-[12px] text-sub">Release notes</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-2xl sm:text-[30px]">Member Directory — what&rsquo;s live for review</h1>
        <p className="mt-2 text-[13px] text-sub">
          {AS_OF} · Version {versionData.version} · Prepared by 1 to 100 Advisors, Inc.
        </p>

        <Section title="The directory is live and ready for your review">
          <P>
            The ITA Member Directory is a searchable online listing of ITA&rsquo;s membership,
            built for ITA by 1 to 100 Advisors. Everything described below is deployed and
            running against your live membership data, so what you see is current rather than
            a sample.
          </P>
          <P>
            The link you have received is unadvertised. Sign-in is deliberately switched off
            for the moment so you can look around without credentials, which also means the
            link should stay inside your review group until authentication is turned on. See{" "}
            <a href="#not-yet-switched-on" className="text-accent underline underline-offset-2">
              Not yet switched on
            </a>{" "}
            at the end.
          </P>
          <P>
            One page does most of the work: a search box, a few filters, and result cards you
            can click into.
          </P>
        </Section>

        <Section title="Searching by name, company or email">
          <P>
            One box searches four fields at once, so you don&rsquo;t have to know which one
            holds what you remember:
          </P>
          <Bullets
            items={[
              "Profile name",
              "Related organization",
              "Main profile email",
              "Report name (which for a person also carries their first and last name)",
            ]}
          />
          <P>
            Typing several words narrows rather than widens. &ldquo;smith martus&rdquo; finds
            Smith at Martus, not everyone named Smith plus everyone at Martus. Punctuation and
            accents are ignored, so &ldquo;OBrien&rdquo;, &ldquo;O&rsquo;Brien&rdquo; and
            &ldquo;o brien&rdquo; all match each other, and a person can be found by first
            name, last name, or surname-first.
          </P>
          <Callout>
            <strong className="font-semibold">
              Nothing appears until you ask for something — three characters, or any filter.
            </strong>{" "}
            This is deliberate. One or two letters match most of the membership, so results at
            that point are noise; and a directory of real people should not hand a wall of
            names and email addresses to anyone who merely opens the page. Type one or two
            letters and you get a short &ldquo;keep typing&rdquo; prompt rather than silence,
            so an incomplete search never reads as &ldquo;this member is not listed.&rdquo;
          </Callout>
        </Section>

        <Section title="Narrowing a search">
          <div className="mt-4 overflow-hidden rounded-lg border border-hair">
            <table className="w-full border-collapse text-[15px]">
              <tbody>
                <Row
                  label="Membership Level"
                  body="Pick as many levels as you like — selecting Gold and Silver returns both, not neither. The menu stays open while you tick, so choosing several is one motion."
                />
                <Row
                  label="Organizations / Individuals / Both"
                  body="Both is the default. Use it to refine a search you have already made rather than to browse."
                />
                <Row
                  label="Last Event Signed Up for"
                  body="Waiting on event data; see the last section."
                  last
                />
              </tbody>
            </table>
          </div>
          <P>
            Each control narrows what the others left, and the free-text box narrows again on
            top. So &ldquo;Gold or Silver, organizations only, matching <em>consult</em>&rdquo;
            is a single search rather than three.
          </P>
          <P>
            The dropdowns are custom-built to match the rest of the page rather than the grey
            boxes a browser supplies, and they work by keyboard as well as by mouse. A filter
            only appears once your data can populate it — a menu whose one choice is
            &ldquo;all&rdquo; is a dead control, so it stays hidden until it has real values.
          </P>
        </Section>

        <Section title="Result cards, member pages and company rosters">
          <P>
            Results come back as cards showing the name, organization, membership level,
            location, <strong className="font-semibold">Member since</strong> (as a month and
            year), email and website. The whole card is clickable.
          </P>
          <P>
            Clicking through opens that member&rsquo;s own page, at its own web address, with
            the fuller record: address, phone, website, the main contact at the organization
            and their title.
          </P>
          <P>
            <strong className="font-semibold">A member company also lists its people.</strong>{" "}
            Under the company&rsquo;s details is its roster — each person&rsquo;s name and
            title on the left, email and phone on the right. The main contact is outlined and
            listed first, with the billing contact next, so the person you most likely want is
            at the top. Those badges come from the organization&rsquo;s own side of the record,
            which is the side that actually states who to contact.
          </P>
          <P>
            Each person on a roster is also their own page, and it names the member firm they
            belong to and links back to it. So you can travel in either direction: company to
            people, or person to company.
          </P>
        </Section>

        <Section title="Who appears in the directory — worth checking closely">
          <P>
            Your source data is the whole contact database, which includes prospects, former
            members and past staff. The directory publishes a deliberately narrow slice of it.{" "}
            <strong className="font-semibold">
              This is the rule we would most like you to confirm.
            </strong>
          </P>
          <P>Someone appears only if they are one of these two things:</P>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-[15px] leading-relaxed">
            <li>
              <strong className="font-semibold">An ITA member</strong> — flagged as a member in
              your data.
            </li>
            <li>
              <strong className="font-semibold">
                A person currently at a member organization
              </strong>{" "}
              — admitted through their link to that member, not on their own account.
            </li>
          </ol>
          <P>
            Everything else is left out: prospects, former members, and anyone whose only
            connection is to a non-member organization.
          </P>
          <P>Three specifics behind that rule:</P>
          <Bullets
            items={[
              "Former employees are always excluded, on every screen. Listing someone who has left as current staff sends your members to the wrong person and makes the directory look unmaintained.",
              "ITA's own record is always treated as a member, and ITA staff are listed through it — while a former ITA employee is not.",
              "A person at a member firm is never presented as a member. Their card says they are at a member organization; the membership level and join date belong to the firm, and only the firm's card shows them.",
            ]}
          />
          <Callout>
            As it currently stands the directory publishes{" "}
            <strong className="font-semibold">
              203 member records and 1,738 related individuals — 1,941 in total
            </strong>
            , out of roughly 2,900 contacts in the source data.
          </Callout>
        </Section>

        <Section title="Sharing a search, and downloading results">
          <P>
            <strong className="font-semibold">Every search has its own web address.</strong> As
            you type and filter, the address bar keeps up, so you can copy the link into an
            email and a colleague opens the same results you are looking at. Bookmarks work,
            and the Back button undoes a filter instead of leaving the directory. A
            member&rsquo;s page carries the search that found them, so &ldquo;back to
            results&rdquo; returns you to where you were rather than to a blank page.
          </P>
          <P>
            <strong className="font-semibold">
              Results can be downloaded as a spreadsheet file
            </strong>
            , which opens in Excel. The download is gated: the disclaimer
          </P>
          <blockquote className="mt-3 border-l-2 border-accent/40 pl-4 text-[15px] italic leading-relaxed text-sub">
            You agree this list is the property of ITA, and you agree NOT to share the list
          </blockquote>
          <P>
            must be ticked before the download button will work, and the same wording is
            written into the first line of the file itself, so it travels with the data rather
            than staying behind on the screen. The file contains only the results of the search
            in front of you, and records the search terms used, so a downloaded list can be
            traced back to the query that produced it.
          </P>
        </Section>

        <Section title="Look and feel">
          <P>
            Members will arrive here from italliance.com, so it is built to look like a part of
            your site rather than a separate tool. The ITA logo, typeface and blue were taken
            from the live site rather than approximated, and the directory carries no 1 to 100
            Advisors branding anywhere.
          </P>
          <P>
            Every page ends with the same footer — the one at the bottom of this page. Beneath
            it is a small version stamp. It is there so that when you report something, we can
            tell immediately whether you were looking at the current build; worth quoting in
            any feedback.
          </P>
        </Section>

        <Section title="Not yet switched on" id="not-yet-switched-on">
          <P>
            Four things are deliberately incomplete, so you are not surprised by them during
            review.
          </P>
          <P>
            <strong className="font-semibold">Sign-in is bypassed.</strong> The passwordless
            sign-in — you enter your email, we send you a link — is built but switched off, so
            that this review needs no accounts. Until it is on, anyone with the link can read
            the directory, which is why the link is unadvertised and should stay within your
            review group. Turning it on is a configuration change, not new work.
          </P>
          <P>
            <strong className="font-semibold">Event history is waiting on data.</strong>{" "}
            &ldquo;Last Event Signed Up for&rdquo; appears as <em>Soon</em>. Once we have an
            event registrations table — one row per person per event — the filter switches
            itself on, and we can also show last event attended and a count over any recent
            period. Nothing needs rebuilding; the app is already looking for it.
          </P>
          <P>
            <strong className="font-semibold">
              Member since is right for most, approximate for a few.
            </strong>{" "}
            Nine of roughly 200 member records carry a date that looks like the May 2024 data
            migration rather than a real join date, and all nine are Emeritus. We have
            deliberately not invented dates to fill the gap — an imperfect date you can see is
            better than a tidy one that is wrong. Worth a look if those nine matter to you.
          </P>
          <P>
            <strong className="font-semibold">Two records to make a decision about.</strong> A
            test record named &ldquo;Geni Testing Whitehouse&rdquo; is currently published
            through a member roster, as is one of our own profiles. Neither is a fault, but
            both are visible, and you may want them removed from the source data.
          </P>
        </Section>

        <Section title="What we would like your feedback on">
          <P>Anything at all is welcome, but these five would help us most:</P>
          <ol className="mt-3 list-decimal space-y-2 pl-6 text-[15px] leading-relaxed">
            <li>
              <strong className="font-semibold">Is the membership rule right?</strong> Members
              plus their current staff, former employees always excluded — is that who ITA
              wants listed?
            </li>
            <li>
              <strong className="font-semibold">Search the fields you actually use.</strong>{" "}
              Look up a few members the way you would naturally, and tell us anything you
              expected to find and did not.
            </li>
            <li>
              <strong className="font-semibold">Check a company&rsquo;s roster</strong> against
              what you know to be true — particularly whether the right person is marked as the
              main contact.
            </li>
            <li>
              <strong className="font-semibold">Is the download restriction strong enough?</strong>{" "}
              The wording is yours; tell us if it should be firmer, or if the download should be
              removed until sign-in is live.
            </li>
            <li>
              <strong className="font-semibold">Does it look like ITA?</strong> Logo, colors,
              type and footer were taken from italliance.com, but you know the brand better
              than we do.
            </li>
          </ol>
          <P>
            When reporting something, quoting the version stamp at the bottom of the page and
            the link from your address bar lets us reproduce exactly what you saw.
          </P>
        </Section>
      </main>

      <SiteFooter note="Release notes for review — this page is unlisted and not indexed by search engines." />
    </div>
  );
}

/* ---------------------------------------------------------------- pieces --
 * Local to this page on purpose. They are typographic helpers for one long
 * document, not directory UI — promoting them to `components/` would invite
 * a future page to inherit this page's prose rhythm by accident.
 */

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10 border-t border-hair pt-8 first:border-0">
      <h2 className="text-[20px] sm:text-[22px]">{title}</h2>
      {children}
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-relaxed">{children}</p>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-6 text-[15px] leading-relaxed">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-lg bg-panel px-4 py-3 text-[15px] leading-relaxed ring-1 ring-hair">
      {children}
    </p>
  );
}

function Row({ label, body, last }: { label: string; body: string; last?: boolean }) {
  return (
    <tr className={last ? "" : "border-b border-hair"}>
      <th
        scope="row"
        className="w-[38%] bg-panel px-4 py-3 text-left align-top font-semibold text-fg"
      >
        {label}
      </th>
      <td className="px-4 py-3 align-top text-sub">{body}</td>
    </tr>
  );
}
