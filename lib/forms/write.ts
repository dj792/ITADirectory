import {
  appendRows,
  getAccessToken,
  headerIndex,
  readTab,
  resolveTab,
  rowFromValues,
  writeCells,
  type CellEdit,
  type SheetTab,
} from "@/lib/sheets-core";
import { directorySheetId } from "@/lib/directory/config";
import {
  fieldOptionsTab,
  fieldsByTypeTab,
  fieldsTab,
  profileFieldValuesTab,
} from "@/lib/tabs";
import { invalidateFieldValues, invalidateFormConfig } from "./service";
import { reconcile, summarize, type Answers } from "./values";
import { isReservedField } from "./parse";
import { DATA_TYPES, SEARCH_MODES, VISIBILITIES, type FormField } from "./types";

/**
 * THE ONLY MODULE IN THIS APP THAT WRITES.
 *
 * It touches three tabs — `Fields`, `FieldsbyType`, `FieldOptions` — and no
 * others. `FormTypes` is deliberately read-only from the UI: it is ten rows
 * that change almost never, and the one mistake available there (mapping a
 * membership level to a form that doesn't exist) breaks the form for every
 * member at that level at once. It stays a deliberate edit in the spreadsheet.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────────
 *
 * **Never delete a row.** `Active = FALSE` instead, everywhere. Deleting shifts
 * every row below it, which invalidates row indexes another request may be
 * holding, and — the expensive one — a deactivated field's ANSWERS survive in
 * `ProfileFieldValues`. Turn a field off by mistake and turning it back on
 * restores the data with it; delete the row and the answers are orphaned
 * against a field id that no longer exists.
 *
 * **Validate before writing, not after.** These values are a closed set the
 * parser already enforces, so an invalid one written here would be silently
 * corrected on the next read and the admin would see their change "not save".
 * Rejecting it with a message is the honest outcome.
 *
 * **Every write ends with `invalidateFormConfig()`.** Otherwise the edit lands
 * in the sheet and the screen shows the old value for up to five minutes,
 * which reads as a failed save and invites a second one.
 */

/** What a write needs: the sheet, a token, and the tab as it stands. */
type Ctx = { token: string; sheetId: string; tab: string; grid: SheetTab };

async function open(tabName: string): Promise<Ctx> {
  const sheetId = directorySheetId();
  if (!sheetId) throw new Error("No directory sheet is configured.");
  const token = await getAccessToken();
  const tab = await resolveTab(token, sheetId, tabName, `the ${tabName} tab`);
  const grid = await readTab(token, sheetId, tab);
  if (grid.headers.length === 0) {
    throw new Error(`The "${tab}" tab has no header row, so nothing can be written.`);
  }
  return { token, sheetId, tab, grid };
}

/** Find a row by a key column's value. -1 when absent. */
function rowWhere(grid: SheetTab, header: string, value: string): number {
  const col = headerIndex(grid.headers, header);
  if (col < 0) return -1;
  return grid.rows.findIndex(
    (r) => (r[col] ?? "").trim().toLowerCase() === value.trim().toLowerCase()
  );
}

/** Find a row matching two key columns — how `FieldsbyType` is addressed. */
function rowWhereBoth(
  grid: SheetTab,
  a: [string, string],
  b: [string, string]
): number {
  const ca = headerIndex(grid.headers, a[0]);
  const cb = headerIndex(grid.headers, b[0]);
  if (ca < 0 || cb < 0) return -1;
  const eq = (cell: string, want: string) =>
    (cell ?? "").trim().toLowerCase() === want.trim().toLowerCase();
  return grid.rows.findIndex((r) => eq(r[ca], a[1]) && eq(r[cb], b[1]));
}

const oneOf = (v: string, allowed: readonly string[], what: string) => {
  const hit = allowed.find((a) => a.toLowerCase() === v.trim().toLowerCase());
  if (!hit) {
    throw new Error(`${what} must be one of: ${allowed.join(", ")} — got "${v}".`);
  }
  return hit;
};

/* ------------------------------------------------------------- reorder -- */

/**
 * Move a field one place up or down within ONE form.
 *
 * Implemented as a SWAP of two `SortOrder` values rather than a renumber of the
 * whole form: two cells instead of twenty, and a failure halfway through a
 * renumber would leave a form in an order nobody chose. The caller passes the
 * ordered field ids as the screen is showing them, so what moves is what the
 * person can see — if the sheet has changed underneath, the swap simply applies
 * to the two rows that are actually adjacent now.
 *
 * Equal or missing sort orders are the awkward case: seeding by hand easily
 * produces two 30s. Rather than swapping two identical numbers and appearing to
 * do nothing, the pair is rewritten as two values that definitely differ.
 */
export async function moveField(
  applicationType: string,
  fieldId: string,
  direction: "up" | "down"
): Promise<void> {
  const ctx = await open(fieldsByTypeTab());
  const { grid } = ctx;

  const iType = headerIndex(grid.headers, "ApplicationType");
  const iField = headerIndex(grid.headers, "FieldID");
  const iSort = headerIndex(grid.headers, "SortOrder");
  const iActive = headerIndex(grid.headers, "Active");
  if (iType < 0 || iField < 0 || iSort < 0) {
    throw new Error(
      "FieldsbyType needs ApplicationType, FieldID and SortOrder columns to reorder."
    );
  }

  const num = (s: string) => {
    const n = Number(String(s).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  const isOn = (r: string[]) => {
    if (iActive < 0) return true;
    const v = (r[iActive] ?? "").trim().toLowerCase();
    return v === "" || !["false", "0", "no", "off"].includes(v);
  };

  // The form's rows, in the order the reader sees them.
  const rows = grid.rows
    .map((r, rowIndex) => ({ rowIndex, sort: num(r[iSort] ?? ""), row: r }))
    .filter(
      (x) =>
        (x.row[iType] ?? "").trim().toLowerCase() ===
          applicationType.trim().toLowerCase() && isOn(x.row)
    )
    .sort((a, b) => a.sort - b.sort || a.rowIndex - b.rowIndex);

  const at = rows.findIndex(
    (x) => (x.row[iField] ?? "").trim().toLowerCase() === fieldId.trim().toLowerCase()
  );
  if (at < 0) throw new Error(`"${fieldId}" is not on the ${applicationType} form.`);

  const to = direction === "up" ? at - 1 : at + 1;
  if (to < 0 || to >= rows.length) return; // Already at the end; nothing to do.

  const A = rows[at];
  const B = rows[to];

  // Two equal orders would swap to no visible effect — give them distinct ones.
  let aNew = B.sort;
  let bNew = A.sort;
  if (aNew === bNew) {
    aNew = direction === "up" ? B.sort - 1 : B.sort + 1;
    bNew = B.sort;
  }

  await writeCells(ctx.token, ctx.sheetId, ctx.tab, grid.headers, [
    { rowIndex: A.rowIndex, header: "SortOrder", value: String(aNew) },
    { rowIndex: B.rowIndex, header: "SortOrder", value: String(bNew) },
  ]);
  invalidateFormConfig();
}

/* ------------------------------------------------------- edit a field -- */

export type FieldEdit = {
  label?: string;
  dataType?: string;
  optionSet?: string;
  appliesTo?: string;
  visibility?: string;
  searchMode?: string;
  group?: string;
  helpText?: string;
  maxRepeat?: string;
  maxLength?: string;
};

/**
 * Update a field's definition.
 *
 * `FieldID` is NOT editable and there is no code path that changes it. It is
 * the join to every stored answer, so renaming it orphans a member's data
 * against an id nothing refers to any more — silently, and discovered later.
 * A field that needs a different id is a new field.
 */
export async function updateField(fieldId: string, edit: FieldEdit): Promise<void> {
  const ctx = await open(fieldsTab());
  const rowIndex = rowWhere(ctx.grid, "FieldID", fieldId);
  if (rowIndex < 0) throw new Error(`No field with id "${fieldId}".`);

  if (edit.label !== undefined && isReservedField(edit.label)) {
    throw new Error(
      `"${edit.label}" is a column the member import already supplies. Members ` +
        `edit only what the import doesn't carry, so that name can't be used.`
    );
  }

  const edits: CellEdit[] = [];
  const put = (header: string, value: string | undefined) => {
    if (value !== undefined) edits.push({ rowIndex, header, value });
  };

  put("Label", edit.label);
  put("OptionSet", edit.optionSet);
  put("Group", edit.group);
  put("HelpText", edit.helpText);
  put("MaxRepeat", edit.maxRepeat);
  put("MaxLength", edit.maxLength);
  if (edit.dataType !== undefined)
    put("DataType", oneOf(edit.dataType, DATA_TYPES, "Field type"));
  if (edit.appliesTo !== undefined)
    put("AppliesTo", oneOf(edit.appliesTo, ["org", "individual", "both"], "Applies to"));

  /*
   * Visibility and search mode are resolved TOGETHER, because they constrain
   * each other: a staff-only field must not be searchable, or filtering on it
   * reveals the answer without ever displaying it. The parser forces this on
   * read; forcing it here too means the sheet never even holds the combination,
   * so nobody opens the tab and sees a value that the app is quietly ignoring.
   */
  if (edit.visibility !== undefined || edit.searchMode !== undefined) {
    const current = ctx.grid.rows[rowIndex];
    const cur = (h: string) => {
      const i = headerIndex(ctx.grid.headers, h);
      return i < 0 ? "" : (current[i] ?? "").trim();
    };
    const visibility = oneOf(
      edit.visibility ?? cur("Visibility") ?? "members",
      VISIBILITIES,
      "Visibility"
    );
    let searchMode = oneOf(
      edit.searchMode ?? cur("SearchMode") ?? "none",
      SEARCH_MODES,
      "Search mode"
    );
    if (visibility === "staff" && searchMode !== "none") searchMode = "none";
    put("Visibility", visibility);
    put("SearchMode", searchMode);
  }

  await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, edits);
  invalidateFormConfig();
}

/* -------------------------------------------------------- deactivate -- */

/**
 * Turn a field on or off. NEVER a row delete — see the note at the top.
 *
 * Deactivating in `Fields` removes it from every form at once, which is the
 * blunt instrument; `setFieldOnForm` below takes it off ONE form. Both leave
 * stored answers untouched.
 */
export async function setFieldActive(fieldId: string, active: boolean): Promise<void> {
  const ctx = await open(fieldsTab());
  const rowIndex = rowWhere(ctx.grid, "FieldID", fieldId);
  if (rowIndex < 0) throw new Error(`No field with id "${fieldId}".`);
  await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, [
    { rowIndex, header: "Active", value: active ? "TRUE" : "FALSE" },
  ]);
  invalidateFormConfig();
}

/** Add or remove a field from ONE form, leaving the other forms alone. */
export async function setFieldOnForm(
  applicationType: string,
  fieldId: string,
  on: boolean
): Promise<void> {
  const ctx = await open(fieldsByTypeTab());
  const rowIndex = rowWhereBoth(
    ctx.grid,
    ["ApplicationType", applicationType],
    ["FieldID", fieldId]
  );

  if (rowIndex >= 0) {
    await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, [
      { rowIndex, header: "Active", value: on ? "TRUE" : "FALSE" },
    ]);
    invalidateFormConfig();
    return;
  }
  if (!on) return; // Not on the form and not wanted: nothing to do.

  // New to this form — append it at the end, in tens like everything else.
  const iType = headerIndex(ctx.grid.headers, "ApplicationType");
  const iSort = headerIndex(ctx.grid.headers, "SortOrder");
  const highest = ctx.grid.rows
    .filter(
      (r) =>
        (r[iType] ?? "").trim().toLowerCase() === applicationType.trim().toLowerCase()
    )
    .reduce((max, r) => Math.max(max, Number(r[iSort] ?? 0) || 0), 0);

  await appendRows(ctx.token, ctx.sheetId, ctx.tab, [
    rowFromValues(ctx.grid.headers, {
      ApplicationType: applicationType,
      FieldID: fieldId,
      SortOrder: String(highest + 10),
      Required: "FALSE",
      Active: "TRUE",
    }),
  ]);
  invalidateFormConfig();
}

/* --------------------------------------------------------- add a field -- */

export type NewField = {
  id: string;
  label: string;
  dataType: string;
  optionSet?: string;
  appliesTo?: string;
  visibility?: string;
  searchMode?: string;
  group?: string;
  helpText?: string;
  /** Forms to put it on immediately. */
  applicationTypes: string[];
};

/**
 * Create a field and put it on the chosen forms.
 *
 * Four things are refused rather than accepted and cleaned up, because each one
 * is cheap to fix now and expensive later:
 *   · a blank or malformed id — it is a permanent key, not a label;
 *   · an id that already exists — silently editing the other field instead;
 *   · a name the import already supplies — the additive-only rule;
 *   · a select with no option list — a control that renders empty.
 */
export async function addField(field: NewField): Promise<void> {
  const id = field.id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!id) throw new Error("A field needs an id — letters, numbers and underscores.");
  if (!field.label.trim()) throw new Error("A field needs a label.");
  if (isReservedField(id) || isReservedField(field.label)) {
    throw new Error(
      `"${field.label}" duplicates a column the member import already supplies. ` +
        `Members edit only what the import doesn't carry.`
    );
  }
  const dataType = oneOf(field.dataType, DATA_TYPES, "Field type");
  const visibility = oneOf(field.visibility ?? "members", VISIBILITIES, "Visibility");
  let searchMode = oneOf(field.searchMode ?? "none", SEARCH_MODES, "Search mode");
  if (visibility === "staff" && searchMode !== "none") searchMode = "none";
  const appliesTo = oneOf(
    field.appliesTo ?? "both",
    ["org", "individual", "both"],
    "Applies to"
  );
  if ((dataType === "select" || dataType === "multiselect") && !field.optionSet?.trim()) {
    throw new Error(
      `A "${dataType}" field needs a dropdown list, or it renders with nothing ` +
        `to choose. Create the list first under Dropdown lists.`
    );
  }

  const ctx = await open(fieldsTab());
  if (rowWhere(ctx.grid, "FieldID", id) >= 0) {
    throw new Error(`A field with id "${id}" already exists.`);
  }

  await appendRows(ctx.token, ctx.sheetId, ctx.tab, [
    rowFromValues(ctx.grid.headers, {
      FieldID: id,
      Label: field.label.trim(),
      DataType: dataType,
      OptionSet: field.optionSet?.trim() ?? "",
      AppliesTo: appliesTo,
      Visibility: visibility,
      SearchMode: searchMode,
      Group: field.group?.trim() ?? "",
      HelpText: field.helpText?.trim() ?? "",
      Active: "TRUE",
    }),
  ]);

  for (const type of field.applicationTypes) {
    await setFieldOnForm(type, id, true);
  }
  invalidateFormConfig();
}

/* ------------------------------------------------------------ options -- */

export async function addOption(
  optionSet: string,
  value: string,
  label?: string
): Promise<void> {
  const set = optionSet.trim();
  const val = value.trim();
  if (!set || !val) throw new Error("A list entry needs a list name and a value.");

  const ctx = await open(fieldOptionsTab());
  const iSet = headerIndex(ctx.grid.headers, "OptionSet");
  const iVal = headerIndex(ctx.grid.headers, "Value");
  const iSort = headerIndex(ctx.grid.headers, "SortOrder");

  const mine = ctx.grid.rows.filter(
    (r) => (r[iSet] ?? "").trim().toLowerCase() === set.toLowerCase()
  );
  if (mine.some((r) => (r[iVal] ?? "").trim().toLowerCase() === val.toLowerCase())) {
    throw new Error(`"${val}" is already in the "${set}" list.`);
  }
  const highest = mine.reduce(
    (max, r) => Math.max(max, Number(r[iSort] ?? 0) || 0),
    0
  );

  await appendRows(ctx.token, ctx.sheetId, ctx.tab, [
    rowFromValues(ctx.grid.headers, {
      OptionSet: set,
      Value: val,
      Label: (label ?? val).trim(),
      SortOrder: String(highest + 10),
      Active: "TRUE",
    }),
  ]);
  invalidateFormConfig();
}

/**
 * Turn one entry of a dropdown list on or off.
 *
 * Deactivating does NOT rewrite the answers of members who already chose it —
 * nothing here touches `ProfileFieldValues`. Their stored value stays as it is
 * and simply stops being offered to anyone new, which is the behavior you want
 * when a category is retired: history stays true, and the next person can't
 * pick it.
 */
export async function setOptionActive(
  optionSet: string,
  value: string,
  active: boolean
): Promise<void> {
  const ctx = await open(fieldOptionsTab());
  const rowIndex = rowWhereBoth(
    ctx.grid,
    ["OptionSet", optionSet],
    ["Value", value]
  );
  if (rowIndex < 0) throw new Error(`"${value}" is not in the "${optionSet}" list.`);
  await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, [
    { rowIndex, header: "Active", value: active ? "TRUE" : "FALSE" },
  ]);
  invalidateFormConfig();
}

export async function renameOption(
  optionSet: string,
  value: string,
  label: string
): Promise<void> {
  const ctx = await open(fieldOptionsTab());
  const rowIndex = rowWhereBoth(ctx.grid, ["OptionSet", optionSet], ["Value", value]);
  if (rowIndex < 0) throw new Error(`"${value}" is not in the "${optionSet}" list.`);
  // The LABEL changes, never the Value — the value is what members' answers are
  // stored as, so changing it would orphan every answer that used it.
  await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, [
    { rowIndex, header: "Label", value: label.trim() || value },
  ]);
  invalidateFormConfig();
}

/* ------------------------------------------------- a member's ANSWERS -- */

/**
 * Save one member's answers.
 *
 * The reconcile itself is pure and lives in `values.ts`; this is the part that
 * talks to Sheets. One read, one batch of cell edits, one append — because a
 * form with twenty fields would otherwise be twenty round trips against a
 * shared 60-per-minute budget, and a partial failure halfway through would
 * leave a profile half-saved with no way to tell which half.
 *
 * Rows are read INCLUDING inactive ones: a retired answer is reusable, and
 * filtering them out here would make every un-tick/re-tick grow the tab.
 */
export async function saveProfileValues(
  profileId: string,
  fields: FormField[],
  answers: Answers,
  by: string
): Promise<string> {
  if (!profileId) throw new Error("No profile to save against.");
  const ctx = await open(profileFieldValuesTab());

  const i = {
    valueId: headerIndex(ctx.grid.headers, "ValueID"),
    profileId: headerIndex(ctx.grid.headers, "ProfileID"),
    fieldId: headerIndex(ctx.grid.headers, "FieldID"),
    value: headerIndex(ctx.grid.headers, "Value"),
    sortOrder: headerIndex(ctx.grid.headers, "SortOrder"),
    updatedAt: headerIndex(ctx.grid.headers, "UpdatedAt"),
    updatedBy: headerIndex(ctx.grid.headers, "UpdatedBy"),
    active: headerIndex(ctx.grid.headers, "Active"),
  };
  if (i.profileId < 0 || i.fieldId < 0 || i.value < 0) {
    throw new Error(
      `The "${ctx.tab}" tab needs ProfileID, FieldID and Value columns before ` +
        `answers can be saved.`
    );
  }

  const get = (row: string[], idx: number) => (idx < 0 ? "" : (row[idx] ?? "").trim());
  const rows = ctx.grid.rows.map((row, rowIndex) => ({
    rowIndex,
    valueId: get(row, i.valueId),
    profileId: get(row, i.profileId),
    fieldId: get(row, i.fieldId),
    value: get(row, i.value),
    sortOrder: Number(get(row, i.sortOrder)) || 0,
    updatedAt: get(row, i.updatedAt),
    updatedBy: get(row, i.updatedBy),
    // A BLANK Active means active, matching how the config tabs read.
    active:
      i.active < 0 ||
      (() => {
        const v = get(row, i.active).toLowerCase();
        return v === "" || !["false", "0", "no", "off"].includes(v);
      })(),
  }));

  const plan = reconcile(
    ctx.grid,
    rows,
    profileId,
    fields,
    answers,
    new Date().toISOString(),
    by
  );

  await writeCells(ctx.token, ctx.sheetId, ctx.tab, ctx.grid.headers, plan.edits);
  if (plan.appends.length > 0) {
    await appendRows(
      ctx.token,
      ctx.sheetId,
      ctx.tab,
      plan.appends.map((r) => rowFromValues(ctx.grid.headers, r))
    );
  }
  invalidateFieldValues();
  return summarize(plan.summary);
}
