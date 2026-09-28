import { headerIndex, toBool, type SheetTab } from "@/lib/sheets-core";
import {
  DATA_TYPES,
  SEARCH_MODES,
  VISIBILITIES,
  type ApplicationType,
  type DataType,
  type FieldDef,
  type FieldOption,
  type FieldValue,
  type Form,
  type FormConfig,
  type FormField,
  type SearchMode,
  type Visibility,
} from "./types";

/**
 * Reads ITA's four form-configuration tabs.
 *
 * Every column by HEADER NAME (`headerIndex`), never by position — the project
 * rule, and it matters more here than anywhere: these tabs are maintained by
 * hand in Google Sheets by people who will insert a column when they need one.
 *
 * ── THIS PARSER IS DEFENSIVE ON PURPOSE ───────────────────────────────────
 *
 * The directory parser reads a machine-generated SQL export; this one reads a
 * spreadsheet a human types into. So every enum is validated against a closed
 * set, every bad row is REPORTED rather than guessed at, and nothing throws: a
 * typo in one row must not blank the whole configuration. `problems` carries
 * what was wrong, and the admin screen prints it.
 */

const cell = (row: string[], i: number): string =>
  i < 0 ? "" : (row[i] ?? "").toString().trim();

/** Candidate header names per column, so a header can be reworded safely. */
const F = {
  // FormTypes
  membershipLevel: ["MembershipLevel", "Membership Level", "Level"],
  applicationType: ["ApplicationType", "Application Type", "Type", "Form"],
  formName: ["FormName", "Form Name", "Description", "Form Description"],
  active: ["Active", "IsActive", "Enabled"],
  // Fields
  fieldId: ["FieldID", "Field ID", "Field", "Key"],
  label: ["Label", "Field Label", "Question"],
  dataType: ["DataType", "Data Type", "Type of Field", "InputType"],
  optionSet: ["OptionSet", "Option Set", "Options"],
  appliesTo: ["AppliesTo", "Applies To", "OrgInd", "Org or Individual"],
  visibility: ["Visibility", "Visible", "Who Can See"],
  searchMode: ["SearchMode", "Search Mode", "Searchable"],
  group: ["Group", "Section", "Heading"],
  helpText: ["HelpText", "Help Text", "Help", "Instructions"],
  maxRepeat: ["MaxRepeat", "Max Repeat", "Max Entries"],
  maxLength: ["MaxLength", "Max Length"],
  // FieldsbyType
  labelOverride: ["LabelOverride", "Label Override", "Custom Label"],
  optionSetOverride: ["OptionSetOverride", "Option Set Override"],
  required: ["Required", "Is Required", "Mandatory"],
  sortOrder: ["SortOrder", "Sort Order", "Order", "Sequence"],
  showIfField: ["ShowIfField", "Show If Field", "Depends On"],
  showIfValue: ["ShowIfValue", "Show If Value", "Depends On Value"],
  // FieldOptions
  value: ["Value", "Option Value", "Code"],
  optionLabel: ["Label", "Option Label", "Display"],
  // ProfileFieldValues
  valueId: ["ValueID", "Value ID", "ID"],
  profileId: ["ProfileID", "Profile ID", "Profile_ProfileId"],
  updatedAt: ["UpdatedAt", "Updated At", "Updated", "Modified"],
  updatedBy: ["UpdatedBy", "Updated By", "Modified By"],
} as const;

/**
 * `Active` defaults to TRUE when the column is missing or the cell is blank.
 *
 * Deliberate, and the opposite of the usual "fail closed": ITA types these rows
 * by hand, and a new row with the Active cell not yet filled in is far more
 * likely to be a field someone just added than one they meant to disable. The
 * cost of the wrong guess is asymmetric — a field that won't appear however
 * many times it is retyped is a support call; an extra field on a form is
 * visible and fixable in a second.
 */
function isActive(row: string[], idx: number): boolean {
  if (idx < 0) return true;
  const v = cell(row, idx);
  return v === "" ? true : toBool(v);
}

/** A validated enum cell, or the fallback plus a recorded problem. */
function oneOf<T extends string>(
  raw: string,
  allowed: readonly T[],
  fallback: T,
  what: string,
  problems: string[]
): T {
  const v = raw.trim().toLowerCase();
  if (!v) return fallback;
  const hit = allowed.find((a) => a.toLowerCase() === v);
  if (hit) return hit;
  problems.push(
    `${what}: "${raw}" is not one of ${allowed.join(" / ")} — using "${fallback}"`
  );
  return fallback;
}

function num(raw: string, fallback: number): number {
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && raw.trim() !== "" ? n : fallback;
}

/**
 * COLUMNS THE IMPORT ALREADY OWNS. A custom field may not claim one of these.
 *
 * This is the additive-only rule made mechanical. ITA's own document lists
 * company name, contact, address, city, state, zip, phone, email and website on
 * every application form — all of which already arrive from the CRM. Someone
 * seeding these tabs from that document would naturally create fields for them,
 * and the moment a member could edit both copies the directory would have two
 * answers for one question and no way to choose.
 *
 * Matched loosely (case and punctuation ignored) because the collision that
 * matters is semantic, not literal.
 */
const RESERVED = [
  "companyname", "firmname", "organization", "organizationname",
  "primarycontactname", "primarycontacttitle", "maincontact",
  "individualname", "name", "title",
  "streetaddress", "address", "address1", "address2",
  "city", "state", "zip", "zipcode", "postalcode",
  "workphone", "phone", "telephone",
  "email", "emailaddress",
  "website", "companywebsite", "firmwebsite",
  "membershiplevel", "membersince", "profilestatus",
];

const loose = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The forms a name might take, so a slash-alternative still collides.
 *
 * ITA's document writes "Company / Firm Name" and "Company / Firm Website" —
 * one question offering two words for the same thing. Whoever seeds the Fields
 * tab will paste those labels verbatim, and a plain comparison misses both,
 * which would let a second editable copy of the company name into the config:
 * the exact duplication the reserved list exists to prevent.
 *
 * So a name containing "/" is also tested as each alternative carrying the
 * trailing word — "Firm Name" and "Company Name" — rather than adding the two
 * literal strings, which would miss the next variation someone types.
 */
function variants(name: string): string[] {
  const out = [name];
  if (name.includes("/")) {
    const words = name.trim().split(/\s+/);
    const last = words[words.length - 1];
    const [before, ...after] = name.split("/");
    // "Company / Firm Name" → "Firm Name"
    out.push(after.join("/").trim());
    // "Company / Firm Name" → "Company Name"
    out.push(`${before.trim()} ${last}`);
  }
  return out;
}

/** True when a proposed field id/label collides with an imported column. */
export function isReservedField(idOrLabel: string): boolean {
  return variants(idOrLabel).some((v) => RESERVED.includes(loose(v)));
}

/* ------------------------------------------------------------ FormTypes -- */

/**
 * A readable name for a form.
 *
 * "TP" and "CR" are ITA's internal shorthand. They are right in a spreadsheet
 * cell and wrong on a button someone reviews once a quarter, so the UI shows a
 * name — but the name is ITA's to choose, not ours to hard-code, which is the
 * whole premise of these tabs.
 *
 * Three sources, in order:
 *   1. A `FormName` column in FormTypes, if they add one. Optional: the tab
 *      predates it and header-name resolution means adding a column is safe.
 *   2. DERIVED from the membership levels that map to the form. The three
 *      Technology Partner tiers share the prefix "Technology Partner", which is
 *      exactly the name wanted — so the common ground between the levels IS the
 *      name of the form, for free and always in step with the mapping.
 *   3. The code itself, when neither works (DEFAULT collects CTP, MIT and SHP,
 *      which have nothing in common and should not be given an invented name).
 */
function commonPrefix(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) {
    // One level: drop a trailing code in parentheses — "Consultants and
    // Resellers (CR)" is the name plus the thing the button already says.
    return values[0].replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  const words = values.map((v) => v.trim().split(/\s+/));
  const out: string[] = [];
  for (let i = 0; i < words[0].length; i++) {
    const w = words[0][i];
    if (words.every((ws) => ws[i]?.toLowerCase() === w.toLowerCase())) out.push(w);
    else break;
  }
  // Trim a dangling separator left by the split ("Technology Partner -").
  return out.join(" ").replace(/[\s\-–—:·,]+$/, "").trim();
}

/** Readable name per application type. Never empty — falls back to the code. */
export function formLabelsFrom(
  levels: { label: string; type: ApplicationType }[],
  explicit: Map<string, string>
): Map<ApplicationType, string> {
  const byType = new Map<ApplicationType, string[]>();
  for (const l of levels) {
    if (!l.label) continue;
    byType.set(l.type, [...(byType.get(l.type) ?? []), l.label]);
  }
  const out = new Map<ApplicationType, string>();
  for (const type of new Set([...byType.keys(), ...explicit.keys()])) {
    const named = (explicit.get(type) ?? "").trim();
    if (named) {
      out.set(type, named);
      continue;
    }
    const derived = commonPrefix(byType.get(type) ?? []);
    // A two-character residue is noise, not a name.
    out.set(type, derived.length >= 4 ? derived : type);
  }
  return out;
}

export function parseFormTypes(tab: SheetTab): {
  levelToType: Map<string, ApplicationType>;
  levels: { label: string; type: ApplicationType }[];
  formLabels: Map<ApplicationType, string>;
  defaultType: ApplicationType;
  problems: string[];
} {
  const problems: string[] = [];
  const levelToType = new Map<string, ApplicationType>();
  const levels: { label: string; type: ApplicationType }[] = [];
  const explicit = new Map<string, string>();
  let defaultType = "DEFAULT";
  if (tab.headers.length === 0)
    return { levelToType, levels, formLabels: new Map(), defaultType, problems };

  const iLevel = headerIndex(tab.headers, ...F.membershipLevel);
  const iType = headerIndex(tab.headers, ...F.applicationType);
  const iActive = headerIndex(tab.headers, ...F.active);
  if (iType < 0) {
    problems.push("FormTypes: no ApplicationType column — no member gets a form");
    return { levelToType, levels, formLabels: new Map(), defaultType, problems };
  }
  const iName = headerIndex(tab.headers, ...F.formName);

  for (const row of tab.rows) {
    if (!isActive(row, iActive)) continue;
    const type = cell(row, iType);
    if (!type) continue;
    // First non-blank name for a type wins; the other rows may leave it empty.
    const named = cell(row, iName);
    if (named && !explicit.get(type)) explicit.set(type, named);
    // A BLANK membership level is the fallback row, not a mistake: 12 members
    // carry no level at all, and they still need a form to open.
    const level = cell(row, iLevel);
    if (!level) {
      defaultType = type;
      continue;
    }
    const key = level.toLowerCase();
    if (levelToType.has(key) && levelToType.get(key) !== type) {
      problems.push(
        `FormTypes: "${level}" is mapped to both ${levelToType.get(key)} and ` +
          `${type} — keeping ${levelToType.get(key)}`
      );
      continue;
    }
    levelToType.set(key, type);
    // Original casing kept for display — the key above is a matching form.
    levels.push({ label: level, type });
  }
  return {
    levelToType,
    levels,
    formLabels: formLabelsFrom(levels, explicit),
    defaultType,
    problems,
  };
}

/* --------------------------------------------------------------- Fields -- */

export function parseFields(tab: SheetTab): {
  fields: Map<string, FieldDef>;
  problems: string[];
} {
  const problems: string[] = [];
  const fields = new Map<string, FieldDef>();
  if (tab.headers.length === 0) return { fields, problems };

  const i = {
    id: headerIndex(tab.headers, ...F.fieldId),
    label: headerIndex(tab.headers, ...F.label),
    dataType: headerIndex(tab.headers, ...F.dataType),
    optionSet: headerIndex(tab.headers, ...F.optionSet),
    appliesTo: headerIndex(tab.headers, ...F.appliesTo),
    visibility: headerIndex(tab.headers, ...F.visibility),
    searchMode: headerIndex(tab.headers, ...F.searchMode),
    group: headerIndex(tab.headers, ...F.group),
    helpText: headerIndex(tab.headers, ...F.helpText),
    maxRepeat: headerIndex(tab.headers, ...F.maxRepeat),
    maxLength: headerIndex(tab.headers, ...F.maxLength),
    active: headerIndex(tab.headers, ...F.active),
  };
  if (i.id < 0) {
    problems.push("Fields: no FieldID column — nothing can be read");
    return { fields, problems };
  }

  for (const row of tab.rows) {
    if (!isActive(row, i.active)) continue;
    const id = cell(row, i.id);
    if (!id) continue;
    if (fields.has(id)) {
      problems.push(`Fields: "${id}" appears twice — keeping the first`);
      continue;
    }
    const label = cell(row, i.label) || id;

    // The additive-only rule, enforced rather than documented.
    if (isReservedField(id) || isReservedField(label)) {
      problems.push(
        `Fields: "${id}" duplicates a column that comes from the import ` +
          `(${label}) — skipped. Members edit only what the import doesn't carry.`
      );
      continue;
    }

    const dataType = oneOf<DataType>(
      cell(row, i.dataType), DATA_TYPES, "text", `Fields "${id}" DataType`, problems
    );
    const visibility = oneOf<Visibility>(
      cell(row, i.visibility), VISIBILITIES, "members",
      `Fields "${id}" Visibility`, problems
    );
    let searchMode = oneOf<SearchMode>(
      cell(row, i.searchMode), SEARCH_MODES, "none",
      `Fields "${id}" SearchMode`, problems
    );

    /*
     * SEARCHABILITY IS CONSTRAINED BY VISIBILITY, here, once.
     *
     * A staff-only field that is facetable leaks its own value without ever
     * being displayed: filter on "Firm Revenue over $50M" and read the answer
     * off the result list. So a staff field is forced to `none` at parse time
     * rather than checked at each call site — one place to get right, and it
     * cannot be undone by a later screen forgetting to ask.
     */
    if (visibility === "staff" && searchMode !== "none") {
      problems.push(
        `Fields: "${id}" is staff-only but SearchMode="${searchMode}" — forced ` +
          `to "none". A searchable field leaks its value even when hidden.`
      );
      searchMode = "none";
    }

    const appliesTo = oneOf<"org" | "individual" | "both">(
      cell(row, i.appliesTo), ["org", "individual", "both"], "both",
      `Fields "${id}" AppliesTo`, problems
    );

    fields.set(id, {
      id,
      label,
      dataType,
      optionSet: cell(row, i.optionSet),
      appliesTo,
      visibility,
      searchMode,
      group: cell(row, i.group),
      helpText: cell(row, i.helpText),
      maxRepeat: Math.max(1, num(cell(row, i.maxRepeat), 1)),
      maxLength: num(cell(row, i.maxLength), 0),
    });
  }
  return { fields, problems };
}

/* --------------------------------------------------------- FieldOptions -- */

export function parseFieldOptions(tab: SheetTab): {
  options: Map<string, FieldOption[]>;
  problems: string[];
} {
  const problems: string[] = [];
  const options = new Map<string, FieldOption[]>();
  if (tab.headers.length === 0) return { options, problems };

  const i = {
    set: headerIndex(tab.headers, ...F.optionSet),
    value: headerIndex(tab.headers, ...F.value),
    label: headerIndex(tab.headers, ...F.optionLabel),
    sortOrder: headerIndex(tab.headers, ...F.sortOrder),
    active: headerIndex(tab.headers, ...F.active),
  };
  if (i.set < 0 || i.value < 0) {
    problems.push("FieldOptions: needs both OptionSet and Value columns");
    return { options, problems };
  }

  for (const row of tab.rows) {
    if (!isActive(row, i.active)) continue;
    const set = cell(row, i.set);
    const value = cell(row, i.value);
    if (!set || !value) continue;
    const list = options.get(set) ?? [];
    if (list.some((o) => o.value === value)) {
      problems.push(`FieldOptions: "${value}" appears twice in "${set}"`);
      continue;
    }
    list.push({
      optionSet: set,
      value,
      label: cell(row, i.label) || value,
      sortOrder: num(cell(row, i.sortOrder), list.length * 10),
    });
    options.set(set, list);
  }
  for (const list of options.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  return { options, problems };
}

/* --------------------------------------------------------- FieldsbyType -- */

export function parseFieldsByType(
  tab: SheetTab,
  fields: Map<string, FieldDef>,
  options: Map<string, FieldOption[]>
): { forms: Map<ApplicationType, Form>; problems: string[] } {
  const problems: string[] = [];
  const forms = new Map<ApplicationType, Form>();
  if (tab.headers.length === 0) return { forms, problems };

  const i = {
    type: headerIndex(tab.headers, ...F.applicationType),
    id: headerIndex(tab.headers, ...F.fieldId),
    labelOverride: headerIndex(tab.headers, ...F.labelOverride),
    optionSetOverride: headerIndex(tab.headers, ...F.optionSetOverride),
    required: headerIndex(tab.headers, ...F.required),
    sortOrder: headerIndex(tab.headers, ...F.sortOrder),
    showIfField: headerIndex(tab.headers, ...F.showIfField),
    showIfValue: headerIndex(tab.headers, ...F.showIfValue),
    active: headerIndex(tab.headers, ...F.active),
  };
  if (i.type < 0 || i.id < 0) {
    problems.push("FieldsbyType: needs both ApplicationType and FieldID columns");
    return { forms, problems };
  }

  for (const row of tab.rows) {
    if (!isActive(row, i.active)) continue;
    const type = cell(row, i.type);
    const id = cell(row, i.id);
    if (!type || !id) continue;

    const def = fields.get(id);
    if (!def) {
      problems.push(
        `FieldsbyType: ${type} references "${id}", which is not an active row ` +
          `in Fields — skipped`
      );
      continue;
    }

    const setName = cell(row, i.optionSetOverride) || def.optionSet;
    const resolved = setName ? options.get(setName) ?? [] : [];
    if (setName && resolved.length === 0) {
      problems.push(
        `FieldsbyType: ${type}/"${id}" uses option set "${setName}", which has ` +
          `no active options — the control would render empty`
      );
    }
    if (
      (def.dataType === "select" || def.dataType === "multiselect") &&
      !setName
    ) {
      problems.push(`Fields: "${id}" is ${def.dataType} but names no OptionSet`);
    }

    const form = forms.get(type) ?? { applicationType: type, fields: [] };
    if (form.fields.some((f) => f.id === id)) {
      problems.push(`FieldsbyType: "${id}" appears twice on ${type} — keeping the first`);
      continue;
    }

    const field: FormField = {
      ...def,
      applicationType: type,
      label: cell(row, i.labelOverride) || def.label,
      optionSet: setName,
      options: resolved,
      required: toBool(cell(row, i.required)),
      sortOrder: num(cell(row, i.sortOrder), (form.fields.length + 1) * 10),
      showIfField: cell(row, i.showIfField),
      showIfValue: cell(row, i.showIfValue),
    };
    form.fields.push(field);
    forms.set(type, form);
  }

  // Sort once here, so no renderer has to remember to.
  for (const form of forms.values()) {
    form.fields.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    // A conditional pointing at a field that isn't on the same form would
    // simply never show — silently. Worth saying out loud.
    for (const f of form.fields) {
      if (f.showIfField && !form.fields.some((o) => o.id === f.showIfField)) {
        problems.push(
          `FieldsbyType: ${form.applicationType}/"${f.id}" is shown only when ` +
            `"${f.showIfField}" has a value, but that field is not on this form ` +
            `— it can never appear`
        );
      }
    }
  }
  return { forms, problems };
}

/* ----------------------------------------------------------- the whole -- */

export function parseFormConfig(tabs: {
  formTypes: SheetTab;
  fields: SheetTab;
  fieldsByType: SheetTab;
  fieldOptions: SheetTab;
}): FormConfig {
  const t = parseFormTypes(tabs.formTypes);
  const f = parseFields(tabs.fields);
  const o = parseFieldOptions(tabs.fieldOptions);
  const b = parseFieldsByType(tabs.fieldsByType, f.fields, o.options);

  const problems = [...t.problems, ...f.problems, ...o.problems, ...b.problems];

  // Every type a level maps to should actually have fields, or members of that
  // level open an empty form and assume the app is broken.
  for (const [level, type] of t.levelToType) {
    if (!b.forms.has(type)) {
      problems.push(
        `"${level}" maps to form "${type}", which has no active fields`
      );
    }
  }

  return {
    levelToType: t.levelToType,
    levels: t.levels,
    formLabels: t.formLabels,
    defaultType: t.defaultType,
    fields: f.fields,
    options: o.options,
    forms: b.forms,
    problems,
  };
}

/**
 * The form a given member sees.
 *
 * Two filters, in order: their membership level picks the application type
 * (falling back to the default, so a member with no level still gets a form),
 * then `appliesTo` drops fields that belong to the other kind of profile — a
 * logo upload is a company's, an individual name is a person's.
 */
export function formFor(
  config: FormConfig,
  membershipLevel: string,
  isOrganization: boolean
): Form {
  const type =
    config.levelToType.get(membershipLevel.trim().toLowerCase()) ??
    config.defaultType;
  const form = config.forms.get(type);
  if (!form) return { applicationType: type, fields: [] };
  const want = isOrganization ? "org" : "individual";
  return {
    applicationType: type,
    fields: form.fields.filter((f) => f.appliesTo === "both" || f.appliesTo === want),
  };
}

/** Fields a given audience may see, for display and for search. */
export function visibleTo(
  fields: FormField[],
  audience: Visibility
): FormField[] {
  const rank: Record<Visibility, number> = { public: 0, members: 1, staff: 2 };
  return fields.filter((f) => rank[f.visibility] <= rank[audience]);
}

/* ---------------------------------------------------- ProfileFieldValues -- */

export function parseFieldValues(tab: SheetTab): FieldValue[] {
  if (tab.headers.length === 0) return [];
  const i = {
    valueId: headerIndex(tab.headers, ...F.valueId),
    profileId: headerIndex(tab.headers, ...F.profileId),
    fieldId: headerIndex(tab.headers, ...F.fieldId),
    value: headerIndex(tab.headers, ...F.value),
    sortOrder: headerIndex(tab.headers, ...F.sortOrder),
    updatedAt: headerIndex(tab.headers, ...F.updatedAt),
    updatedBy: headerIndex(tab.headers, ...F.updatedBy),
    active: headerIndex(tab.headers, ...F.active),
  };
  if (i.profileId < 0 || i.fieldId < 0) return [];

  const out: FieldValue[] = [];
  for (const row of tab.rows) {
    if (!isActive(row, i.active)) continue;
    const profileId = cell(row, i.profileId);
    const fieldId = cell(row, i.fieldId);
    if (!profileId || !fieldId) continue;
    out.push({
      valueId: cell(row, i.valueId),
      profileId,
      fieldId,
      value: cell(row, i.value),
      sortOrder: num(cell(row, i.sortOrder), 0),
      updatedAt: cell(row, i.updatedAt),
      updatedBy: cell(row, i.updatedBy),
    });
  }
  return out;
}

/** Answers for one profile, keyed by field id. Multi-select yields several. */
export function valuesByProfile(values: FieldValue[]): Map<string, Map<string, string[]>> {
  const out = new Map<string, Map<string, string[]>>();
  for (const v of [...values].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const byField = out.get(v.profileId) ?? new Map<string, string[]>();
    const list = byField.get(v.fieldId) ?? [];
    list.push(v.value);
    byField.set(v.fieldId, list);
    out.set(v.profileId, byField);
  }
  return out;
}
