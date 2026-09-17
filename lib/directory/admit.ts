import type { Link } from "./relations";
import type { Member } from "./types";

/**
 * WHO IS IN THE DIRECTORY. The one place that decides.
 *
 * Two kinds of profile are admitted:
 *   1. ITA MEMBERS — `Profile_Member = True` (202 of 2,929 contacts).
 *   2. INDIVIDUALS CURRENTLY LINKED TO A MEMBER — an employee of a member firm,
 *      via `profilerelations`. ~1,731 people, and almost none of them are
 *      members in their own right.
 *
 * Everyone else — prospects, alumni, former members, staff of former members,
 * unrelated contacts — is NOT admitted. That is the whole job of this module,
 * and it's why it exists separately from parsing: the parser reads every row,
 * this decides what may be published, and nothing else gets a vote.
 *
 * ── THE TWO RULES THAT KEEP IT HONEST ─────────────────────────────────────
 *
 * **A person is admitted through a CURRENT link to a MEMBER.** Not to any
 * organization — 2,929 contacts include staff of former members and prospects,
 * and admitting those would publish people whose firm has no relationship with
 * ITA at all. `linksByOrg` has already dropped Former Employer/Employee.
 *
 * **An admitted individual is NOT a member** (`isMember` stays false). Every
 * surface that says anything about membership reads that flag rather than
 * inferring it from presence in the directory. A card that presented a member
 * firm's employee as an ITA member would be a factual error about someone's
 * relationship to the association.
 */

export type AdmitResult = {
  /** Members plus admitted individuals, ready to search. */
  members: Member[];
  /** Roster per organization id, for the member page. */
  rosters: Map<string, Link[]>;
  counts: {
    members: number;
    relatedIndividuals: number;
    /** Profiles the source held that are not published. */
    notAdmitted: number;
  };
};

export function admit(profiles: Member[], rosters: Map<string, Link[]>): AdmitResult {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const memberIds = new Set(profiles.filter((p) => p.isMember).map((p) => p.id));

  // Keep only rosters belonging to a MEMBER organization. A former member's
  // staff list is real data and still must not be published.
  const memberRosters = new Map<string, Link[]>();
  for (const [orgId, links] of rosters) {
    if (memberIds.has(orgId)) memberRosters.set(orgId, links);
  }

  const admitted: Member[] = profiles.filter((p) => p.isMember);
  const seen = new Set(admitted.map((p) => p.id));

  for (const [orgId, links] of memberRosters) {
    const org = byId.get(orgId);
    for (const link of links) {
      const person = byId.get(link.personId);
      // A link can point at an id the profile export doesn't contain; there is
      // nothing to publish for a name we don't have.
      if (!person || person.isOrganization) continue;
      if (seen.has(person.id)) continue;
      seen.add(person.id);

      admitted.push({
        ...person,
        relatedOrgId: orgId,
        relatedOrgName: org?.name ?? "",
        titleAtOrg: link.title,
      });
    }
  }

  admitted.sort((a, b) =>
    a.sortName.localeCompare(b.sortName, "en", { sensitivity: "base" })
  );

  return {
    members: admitted,
    rosters: memberRosters,
    counts: {
      members: memberIds.size,
      relatedIndividuals: admitted.length - memberIds.size,
      notAdmitted: profiles.length - admitted.length,
    },
  };
}
