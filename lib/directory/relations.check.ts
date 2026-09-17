/**
 * The profile-to-profile join — asserted against the real exports.
 *
 *   npm run check
 *
 * This is the riskiest code in the app: it decides who gets PUBLISHED. A
 * mistake here doesn't throw, it just puts someone's name and email in front of
 * strangers, or hangs a company's staff off the wrong record. So the checks
 * cover the direction of the join, what counts as current, who is admitted, and
 * — above all — that nobody is admitted who shouldn't be.
 */
import fs from "fs";
import path from "path";
import { parseCsv } from "./csv";
import { parseProfiles } from "./parse";
import { parseRelations, linksByOrg } from "./relations";
import { admit } from "./admit";

const PROFILES = path.join(process.cwd(), "data", "ProfileView.csv");
const RELATIONS = path.join(process.cwd(), "data", "ProfileRelations.csv");

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

if (!fs.existsSync(PROFILES) || !fs.existsSync(RELATIONS)) {
  console.log("relations fixtures not present — skipping");
  process.exit(0);
}

const grid = parseCsv(fs.readFileSync(PROFILES, "utf8"));
const { profiles } = parseProfiles(grid);
const byId = new Map(profiles.map((p) => [p.id, p]));
const relations = parseRelations(parseCsv(fs.readFileSync(RELATIONS, "utf8")));
const rosters = linksByOrg(relations, (id) => byId.get(id)?.isOrganization ?? false);
const result = admit(profiles, rosters);

console.log(
  `\nRelations — ${relations.length} rows · ${result.counts.members} members ` +
    `+ ${result.counts.relatedIndividuals} related people ` +
    `= ${result.members.length} in the directory\n`
);

// ── Parsing ────────────────────────────────────────────────────────────────
check("every relation row has both ids",
  relations.every((r) => r.profileId && r.relProfileId));
check("Former Employer/Employee are NOT current",
  relations.filter((r) => /^former/i.test(r.relationType)).every((r) => !r.current),
  `${relations.filter((r) => /^former/i.test(r.relationType)).length} former rows`);
check("the export still contains former relations to exclude",
  relations.some((r) => /^former/i.test(r.relationType)));
check("unrecognised relation types are inert",
  relations.filter((r) => /spouse|parent|subsidiary/i.test(r.relationType))
    .every((r) => !r.current));

// ── THE KNOWN-GOOD CASE ───────────────────────────────────────────────────
// Profile 110 (Ascentium Capital LLC) has a verified rendering: Interlicchio is
// the main contact, Kimball the billing contact, McKale neither. The mirrored
// employee-side rows mark ALL THREE as main contact, so this is the assertion
// that pins "org-side flags win" — the bug it caught badged everyone "Main".
{
  const roster = (result.rosters.get("110") ?? []).map((l) => ({
    name: byId.get(l.personId)?.name ?? "?",
    title: l.title,
    main: l.mainContact,
    billing: l.billingContact,
  }));
  check("Ascentium Capital (110) has exactly 3 people", roster.length === 3,
    `${roster.length}: ${roster.map((r) => r.name).join(", ")}`);
  check("main contact is Interlicchio, and he is FIRST",
    roster[0]?.name === "Stephen Interlicchio" && roster[0]?.main && !roster[0]?.billing,
    JSON.stringify(roster[0]));
  check("billing contact is Kimball, and she is SECOND",
    roster[1]?.name === "Christine Kimball" && roster[1]?.billing && !roster[1]?.main,
    JSON.stringify(roster[1]));
  check("McKale carries no badge",
    roster[2]?.name === "Brigid McKale" && !roster[2]?.main && !roster[2]?.billing,
    JSON.stringify(roster[2]));
  check("exactly ONE main contact for the org",
    roster.filter((r) => r.main).length === 1);
  check("titles came through",
    roster[0]?.title === "Senior Vice President - Strategic Services", roster[0]?.title);
}

// ── Direction ─────────────────────────────────────────────────────────────
check("every roster belongs to an ORGANISATION",
  [...result.rosters.keys()].every((id) => byId.get(id)?.isOrganization === true));
check("no roster entry is itself an organisation",
  [...result.rosters.values()].flat()
    .every((l) => byId.get(l.personId)?.isOrganization === false));
check("both stored directions collapse to ONE link per person",
  [...result.rosters.values()].every((links) => {
    const ids = links.map((l) => l.personId);
    return new Set(ids).size === ids.length;
  }));

// ── WHO IS ADMITTED — the part that matters ───────────────────────────────
const admittedIds = new Set(result.members.map((m) => m.id));
const memberIds = new Set(profiles.filter((p) => p.isMember).map((p) => p.id));

check("every ITA member is in the directory",
  [...memberIds].every((id) => admittedIds.has(id)));
check("related individuals were admitted", result.counts.relatedIndividuals > 500,
  `${result.counts.relatedIndividuals}`);
check("the directory is far smaller than the contact database",
  result.members.length < profiles.length * 0.75,
  `${result.members.length} of ${profiles.length} profiles`);

/*
 * The leak test. Anyone admitted who is neither a member nor CURRENTLY linked
 * to a member organisation would be a person published with no relationship to
 * ITA at all — the exact failure this module exists to prevent.
 */
{
  const legitimate = new Set(memberIds);
  for (const [orgId, links] of result.rosters) {
    if (!memberIds.has(orgId)) continue;
    for (const l of links) legitimate.add(l.personId);
  }
  const leaked = [...admittedIds].filter((id) => !legitimate.has(id));
  check("NOBODY is admitted without a member link", leaked.length === 0,
    leaked.slice(0, 5).map((id) => `${id} (${byId.get(id)?.name})`).join(" · "));
}

check("staff of a NON-member org are not admitted", (() => {
  const nonMemberOrgs = [...rosters.keys()].filter((id) => !memberIds.has(id));
  const theirPeople = nonMemberOrgs.flatMap((id) =>
    (rosters.get(id) ?? []).map((l) => l.personId));
  // Some of those people also work for a member, which is legitimate.
  const onlyNonMember = theirPeople.filter((pid) =>
    ![...result.rosters.entries()].some(([o, ls]) =>
      memberIds.has(o) && ls.some((l) => l.personId === pid)));
  return onlyNonMember.every((pid) => !admittedIds.has(pid));
})());

check("a former employee of a member is not admitted through that link", (() => {
  const formerOnly = relations
    .filter((r) => /^former/i.test(r.relationType))
    .map((r) => (byId.get(r.profileId)?.isOrganization ? r.relProfileId : r.profileId))
    .filter((pid) => {
      const p = byId.get(pid);
      if (!p || p.isOrganization || p.isMember) return false;
      // Exclude anyone who ALSO holds a current link — that's why they're in.
      return ![...result.rosters.values()].flat().some((l) => l.personId === pid);
    });
  return formerOnly.every((pid) => !admittedIds.has(pid));
})());

// ── What the admitted individuals carry ───────────────────────────────────
{
  const related = result.members.filter((m) => !m.isMember);
  check("related individuals are flagged NOT members",
    related.every((m) => !m.isMember));
  check("each names the member organisation that admitted them",
    related.every((m) => m.relatedOrgId && m.relatedOrgName),
    `${related.filter((m) => !m.relatedOrgName).length} without one`);
  check("the admitting organisation IS a member",
    related.every((m) => memberIds.has(m.relatedOrgId)));
  check("most carry a title at that organisation",
    related.filter((m) => m.titleAtOrg).length > related.length * 0.5,
    `${related.filter((m) => m.titleAtOrg).length}/${related.length}`);
  check("no related individual is an organisation",
    related.every((m) => !m.isOrganization));
  check("they are searchable by name",
    related.every((m) => m.haystack.length > 0));
}

console.log(failures === 0
  ? "\nAll relation checks passed.\n"
  : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
