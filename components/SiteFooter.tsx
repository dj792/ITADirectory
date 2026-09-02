import versionData from "@/version.json";
import { CONTACT, COPYRIGHT_YEAR } from "@/lib/brand";

/**
 * The one footer, on every page.
 *
 * Two jobs in one band:
 *
 *  1. ITA's published contact block — phone, email, Contact Us, Privacy Policy,
 *    copyright — matching italliance.com so a member landing here from the main
 *    site finds what they expect at the bottom of the page.
 *
 *  2. The BUILD VERSION. It is on every page deliberately: the number's only
 *    purpose is answering "is what I'm looking at actually my last deploy?", and
 *    a marker that appears on some pages and not others can't answer that — you
 *    end up checking the version on the page that has it and reasoning about the
 *    page that doesn't. `version.json` is auto-incremented by
 *    DeployITADirectory.command on every deploy.
 *
 * `note` carries page-specific small print (the directory uses it for the data
 * source) so pages don't grow second footers underneath this one.
 */
export default function SiteFooter({ note }: { note?: React.ReactNode }) {
  return (
    <footer className="mt-auto bg-accentDark py-6 text-[12px] leading-relaxed text-white/75">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        {note && <p className="mb-3 border-b border-white/15 pb-3">{note}</p>}

        <p>
          Tel: <a href={`tel:${CONTACT.telHref}`} className="hover:text-white">{CONTACT.tel}</a>
          {" | "}
          Email:{" "}
          <a href={`mailto:${CONTACT.email}`} className="hover:text-white">
            {CONTACT.email}
          </a>
        </p>

        <p className="mt-1">
          <FooterLink href={CONTACT.contactUrl}>Contact Us</FooterLink>
          {" | "}
          <FooterLink href={CONTACT.privacyUrl}>Privacy Policy</FooterLink>
        </p>

        <p className="mt-1">
          © Copyright {COPYRIGHT_YEAR}{" "}
          <FooterLink href={CONTACT.siteUrl}>{CONTACT.legalName}</FooterLink>
        </p>

        {/* Quiet on purpose: a build marker for us, not information for a member. */}
        <p className="mt-3 text-white/40">Version {versionData.version}</p>
      </div>
    </footer>
  );
}

/** External links leave the app, so they open in a new tab and drop the referrer. */
function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="underline-offset-2 hover:text-white hover:underline"
    >
      {children}
    </a>
  );
}
