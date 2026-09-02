import { loadDirectory } from "./directory/service";

/**
 * The ONLY module the auth route calls to answer "may this email sign in?".
 * Everything else in the app treats a session as already-authorized.
 *
 * The allowlist IS the directory: if you're in the member sheet, you can sign
 * in. There is no separate users tab to keep in sync — a second list would
 * drift, and the drift is always in the direction of a member who can't get in.
 *
 * Two additions on top of the sheet:
 *   · STAFF_EMAIL_DOMAINS — 1 to 100 Advisors staff, who support the app but are
 *     not ITA members and so appear nowhere in the export.
 *   · EXTRA_ALLOWED_EMAILS — an escape hatch for an ITA officer or a member
 *     whose sign-in address differs from the one in the CRM. Comma-separated.
 *
 * Shaped like a SQL query (findMemberByEmail) so a later move to Postgres is a
 * rename rather than a rewrite.
 */

export type Identity = {
  email: string;
  name: string;
  /** ProfileID when they're in the sheet; "staff" for our own team. */
  memberId: string;
};

const norm = (s: string) => s.trim().toLowerCase();

function listFromEnv(name: string): string[] {
  return (process.env[name] ?? "")
    .split(/[,\n]/)
    .map(norm)
    .filter(Boolean);
}

function staffDomains(): string[] {
  const configured = listFromEnv("STAFF_EMAIL_DOMAINS");
  return configured.length > 0 ? configured : ["1to100advisors.com"];
}

/**
 * Exact domain match only. A substring test would let "1to100advisors.com.evil.co"
 * and "notreally1to100advisors.com" through — the same look-alike holes the
 * Aligned KPIs admin gate is tested against.
 */
function isStaffEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return staffDomains().includes(domain);
}

/** Resolve an email to an identity, or null when they may not sign in. */
export async function findMemberByEmail(rawEmail: string): Promise<Identity | null> {
  const email = norm(rawEmail);
  if (!email || !email.includes("@")) return null;

  if (isStaffEmail(email)) {
    return { email, name: email.split("@")[0], memberId: "staff" };
  }

  if (listFromEnv("EXTRA_ALLOWED_EMAILS").includes(email)) {
    return { email, name: email.split("@")[0], memberId: "guest" };
  }

  const { members } = await loadDirectory();
  const hit = members.find((m) => norm(m.email) === email);
  return hit ? { email, name: hit.name, memberId: hit.id } : null;
}
