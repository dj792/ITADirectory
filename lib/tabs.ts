/**
 * EVERY TAB NAME IN THE WORKBOOK, IN ONE PLACE.
 *
 * These are hard-coded on purpose (DJ's call, 28 Sep 2026), and the reason is a
 * bug that already cost a deploy cycle: the directory tabs were originally read
 * from `DIRECTORY_TAB` / `DIRECTORY_RELATIONS_TAB`, someone named the actual
 * tabs after those env vars, and the error message — "this spreadsheet has 2
 * tabs (DIRECTORY_TAB, DIRECTORY_RELATIONS_TAB) and DIRECTORY_TAB isn't set" —
 * was completely accurate and completely unreadable. The tabs have since been
 * renamed to `Profiles` and `ProfileRelations`, which would have broken those
 * env vars a second time if they were still the source of truth.
 *
 * A tab name is a fact about the workbook, not a deployment setting. Putting it
 * in code means renaming a tab is a one-line change that ships with a version
 * number and a git history, instead of an invisible mismatch between a sheet
 * someone renamed and a Vercel variable nobody can read without redeploying.
 *
 * THE ENV OVERRIDE IS KEPT, but only as an escape hatch: it lets a tab be
 * repointed without a deploy if a workbook is ever restructured in a hurry. An
 * UNSET variable now means "use the name below" rather than "guess", so the
 * normal path touches no configuration at all.
 *
 * `resolveTab` still validates whatever name comes out of here against the
 * workbook's real tabs and matches case- and space-insensitively, so
 * `FieldsbyType` and `FieldsByType` both resolve.
 */

function tab(envVar: string, hardCoded: string): string {
  return (process.env[envVar] ?? "").trim() || hardCoded;
}

/** Profiles — the ProfileView SQL export. The member list. */
export const profilesTab = () => tab("DIRECTORY_TAB", "Profiles");

/** ProfileRelations — profile-to-profile links, the source of company rosters. */
export const relationsTab = () => tab("DIRECTORY_RELATIONS_TAB", "ProfileRelations");

/* ---------------------------------------------------- custom form config --
 * The four tabs behind ITA's member-maintained profile fields. Config only —
 * `ProfileFieldValues` below is the data. See `lib/forms/`.
 */

/** Membership level → which application form (TP / CR / CAS / ITL / DEFAULT). */
export const formTypesTab = () => tab("FORM_TYPES_TAB", "FormTypes");

/** The field catalog: what each field IS. */
export const fieldsTab = () => tab("FORM_FIELDS_TAB", "Fields");

/** Which forms ask which field, and how it's presented there. */
export const fieldsByTypeTab = () => tab("FORM_FIELDS_BY_TYPE_TAB", "FieldsbyType");

/** Option lists for select / multiselect fields. */
export const fieldOptionsTab = () => tab("FORM_OPTIONS_TAB", "FieldOptions");

/**
 * The answers themselves: one row per ProfileID × FieldID × value.
 *
 * The ONLY tab this app will ever write to. Everything else is read-only, and
 * the service account's token is currently read-only scope — that widens when
 * profile editing ships, not before.
 */
export const profileFieldValuesTab = () =>
  tab("FORM_VALUES_TAB", "ProfileFieldValues");
