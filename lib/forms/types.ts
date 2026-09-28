/**
 * ITA's member-maintained profile fields — the shape the app works in.
 *
 * ── THE ONE RULE THAT MATTERS ─────────────────────────────────────────────
 *
 * **Everything here is ADDITIVE.** Not one of these fields may duplicate a
 * column that comes from the CRM export. A member's name, address, phone, email
 * and website already arrive on `Profile*` and are displayed from there; if a
 * member could also type them here, the two copies would diverge and nothing in
 * the app could say which is true. DJ's call, 28 Sep 2026: members edit only
 * what the import does not carry. `reservedFieldIds` in `parse.ts` enforces it.
 */

/** The four application forms in ITA's document, plus a fallback. */
export type ApplicationType = string;

/**
 * What kind of input a field is, and therefore how its value is stored and
 * rendered. Deliberately a small closed set — a config sheet that can name any
 * type invents types nobody implemented.
 */
export type DataType =
  | "text"
  | "textarea"
  | "number"
  | "year"
  | "boolean"
  | "select"
  | "multiselect"
  | "file"
  | "repeat";

export const DATA_TYPES: DataType[] = [
  "text", "textarea", "number", "year", "boolean",
  "select", "multiselect", "file", "repeat",
];

/**
 * WHO MAY SEE A VALUE. Not a boolean, because there are three real audiences
 * and ITA's own document mixes them freely: "Elevator Pitch" is marked for the
 * public website, while "Firm Revenue" and "Number of Partners" sit two rows
 * away on the same form.
 */
export type Visibility = "public" | "members" | "staff";
export const VISIBILITIES: Visibility[] = ["public", "members", "staff"];

/**
 * HOW A FIELD PARTICIPATES IN SEARCH. Also not a boolean — the three modes
 * build different UI:
 *   text  → folded into the free-text haystack
 *   facet → gets its own dropdown in the search panel
 *   none  → displayed but not searchable
 */
export type SearchMode = "none" | "text" | "facet";
export const SEARCH_MODES: SearchMode[] = ["none", "text", "facet"];

/** One option in a select / multiselect list. */
export type FieldOption = {
  optionSet: string;
  value: string;
  label: string;
  sortOrder: number;
};

/** A field's intrinsic nature — one row of the `Fields` tab. */
export type FieldDef = {
  /** Stable key. NEVER renamed or reused: it is the join to stored answers. */
  id: string;
  label: string;
  dataType: DataType;
  optionSet: string;
  /** Whether this field belongs to organizations, individuals, or both. */
  appliesTo: "org" | "individual" | "both";
  visibility: Visibility;
  searchMode: SearchMode;
  group: string;
  helpText: string;
  /** For `repeat` — how many entries are offered (ITA: 4 speaker topics). */
  maxRepeat: number;
  maxLength: number;
};

/**
 * A field AS IT APPEARS ON ONE FORM — the `Fields` row merged with its
 * `FieldsbyType` row. `label` and `options` are already resolved, so a renderer
 * never has to know an override happened.
 */
export type FormField = FieldDef & {
  applicationType: ApplicationType;
  required: boolean;
  sortOrder: number;
  /** Show this field only when `showIfField` holds `showIfValue`. */
  showIfField: string;
  showIfValue: string;
  /** Resolved option list, after any per-type override. */
  options: FieldOption[];
};

/** One application form: the fields a member of this type is asked. */
export type Form = {
  applicationType: ApplicationType;
  /** In `sortOrder`, then grouped by `group` for rendering. */
  fields: FormField[];
};

/**
 * The whole configuration, parsed and cross-referenced.
 *
 * `problems` is not an error channel — it is how a HAND-MAINTAINED config
 * reports its own mistakes. ITA will edit these tabs directly, so a field
 * pointing at an option set that doesn't exist, or a form type nothing maps to,
 * has to surface somewhere a human looks rather than silently rendering an
 * empty dropdown. The admin screen prints them.
 */
export type FormConfig = {
  /**
   * Membership level → application type. The KEY IS LOWERCASED, because level
   * text comes from the CRM on one side and is typed by hand into the config
   * tab on the other, and those two will not agree on capitalization forever.
   *
   * Never display a key from this map — it is a matching form, not ITA's words.
   * `levels` below keeps the original text for that.
   */
  levelToType: Map<string, ApplicationType>;
  /** The mappings as ITA wrote them, for display. Order follows the tab. */
  levels: { label: string; type: ApplicationType }[];
  /**
   * A readable name per form — "Technology Partner" rather than "TP".
   *
   * From a `FormName` column in FormTypes if ITA adds one, otherwise derived
   * from what the mapped membership levels have in common, otherwise the code.
   * Never empty, so a caller can use it without a fallback of its own.
   */
  formLabels: Map<ApplicationType, string>;
  /** The fallback form for a level that maps to nothing. */
  defaultType: ApplicationType;
  fields: Map<string, FieldDef>;
  options: Map<string, FieldOption[]>;
  forms: Map<ApplicationType, Form>;
  problems: string[];
};

/** One stored answer — a row of `ProfileFieldValues`. */
export type FieldValue = {
  valueId: string;
  profileId: string;
  fieldId: string;
  value: string;
  sortOrder: number;
  updatedAt: string;
  updatedBy: string;
};
