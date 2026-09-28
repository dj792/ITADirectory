import { headerIndex, type SheetTab, type CellEdit } from "@/lib/sheets-core";
import type { FieldValue, FormField } from "./types";

/**
 * Reconciling a member's submitted answers against what is already stored.
 *
 * PURE — no network, no Sheets. It takes the current `ProfileFieldValues` rows
 * and the submitted answers, and returns the cell edits and new rows needed.
 * `write.ts` performs them. Separated this way because the reconcile is the
 * part with the interesting failure modes, and a pure function is the part that
 * can be exhaustively checked without a spreadsheet.
 *
 * ── THE RULES ─────────────────────────────────────────────────────────────
 *
 * **A ROW IS NEVER DELETED.** An answer that goes away is marked
 * `Active = FALSE` and keeps its row. Deleting shifts every row beneath it,
 * invalidating positions another request may hold, and `ValueID = max + 1`
 * means the highest id becomes reusable — so a later answer would silently
 * inherit a retired one's identity. The sheet is also the audit trail: "this
 * member used to say X" is a fact ITA may want, and a delete destroys it.
 *
 * **A RETIRED ROW IS REUSED, not duplicated.** Un-tick a checkbox, change your
 * mind, tick it again: without this the sheet grows a new row every time, and
 * after a year a member with a volatile multi-select has fifty rows for one
 * question. Matching on the VALUE means the reactivated row is genuinely the
 * same answer coming back.
 *
 * **ONLY THE FIELDS ON THIS FORM ARE TOUCHED.** The reconcile is scoped to the
 * field ids the form actually rendered. A member's stored answer to a field
 * that has since been removed from their form — or that belongs to a different
 * form entirely — must survive untouched; it is not this submission's business,
 * and treating "absent from the payload" as "cleared" would erase it.
 */

/** What the form submitted: field id → the values chosen (possibly none). */
export type Answers = Map<string, string[]>;

export type Reconciliation = {
  /** Cells to overwrite in existing rows. */
  edits: CellEdit[];
  /** Rows to append, already in the tab's column order. */
  appends: Record<string, string>[];
  /** For the confirmation message. */
  summary: { added: number; changed: number; removed: number; restored: number };
};

/**
 * Work out the minimal set of writes.
 *
 * @param grid    the ProfileFieldValues tab as read
 * @param rows    the parsed rows, INCLUDING inactive ones (retired answers are
 *                reusable, so the caller must not filter them out)
 * @param profileId whose answers these are
 * @param fields  the fields the form rendered — the scope of the reconcile
 * @param answers what was submitted
 * @param now     ISO timestamp, passed in so checks are deterministic
 * @param by      who is saving, for the audit columns
 */
export function reconcile(
  grid: SheetTab,
  rows: (FieldValue & { rowIndex: number; active: boolean })[],
  profileId: string,
  fields: FormField[],
  answers: Answers,
  now: string,
  by: string
): Reconciliation {
  const edits: CellEdit[] = [];
  const appends: Record<string, string>[] = [];
  const summary = { added: 0, changed: 0, removed: 0, restored: 0 };

  const hasCol = (h: string) => headerIndex(grid.headers, h) >= 0;
  const stamp = (rowIndex: number) => {
    if (hasCol("UpdatedAt")) edits.push({ rowIndex, header: "UpdatedAt", value: now });
    if (hasCol("UpdatedBy")) edits.push({ rowIndex, header: "UpdatedBy", value: by });
  };

  // `ValueID = max + 1`, computed once over the WHOLE tab — not per field and
  // not over this profile's rows, or two profiles get the same id.
  let nextId = rows.reduce((max, r) => {
    const n = Number(r.valueId);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  for (const field of fields) {
    // A file input has nothing to store yet — see the note in the form.
    if (field.dataType === "file") continue;

    const wanted = (answers.get(field.id) ?? [])
      .map((v) => v.trim())
      .filter((v) => v !== "");
    const mine = rows.filter(
      (r) => r.profileId === profileId && r.fieldId === field.id
    );

    /*
     * A SINGLE-VALUE FIELD IS AN OVERWRITE, NOT A SET.
     *
     * Treating it like a multi-select would retire the old row and append a new
     * one on every edit — correct, but it turns a typo fix into two rows and
     * loses the "this cell has always been this member's answer" simplicity.
     * So: rewrite the first active row in place and retire any extras (which
     * only exist if the field's type was changed from multi to single).
     */
    const single = field.dataType !== "multiselect" && field.dataType !== "repeat";

    if (single) {
      const active = mine.filter((r) => r.active);
      const value = wanted[0] ?? "";
      const current = active[0];

      if (current) {
        if (current.value !== value) {
          if (value === "") {
            edits.push({ rowIndex: current.rowIndex, header: "Active", value: "FALSE" });
            summary.removed++;
          } else {
            edits.push({ rowIndex: current.rowIndex, header: "Value", value });
            summary.changed++;
          }
          stamp(current.rowIndex);
        }
        // Any extra active rows are leftovers from a type change.
        for (const extra of active.slice(1)) {
          edits.push({ rowIndex: extra.rowIndex, header: "Active", value: "FALSE" });
          stamp(extra.rowIndex);
        }
      } else if (value !== "") {
        const retired = mine.find((r) => !r.active && r.value === value);
        if (retired) {
          edits.push({ rowIndex: retired.rowIndex, header: "Active", value: "TRUE" });
          stamp(retired.rowIndex);
          summary.restored++;
        } else {
          // Reuse any retired row for this field rather than growing the tab.
          const spare = mine.find((r) => !r.active);
          if (spare) {
            edits.push({ rowIndex: spare.rowIndex, header: "Value", value });
            edits.push({ rowIndex: spare.rowIndex, header: "Active", value: "TRUE" });
            stamp(spare.rowIndex);
            summary.added++;
          } else {
            appends.push(newRow(++nextId, profileId, field.id, value, 0, now, by));
            summary.added++;
          }
        }
      }
      continue;
    }

    /*
     * MULTI-VALUE: reconcile two SETS, matched on the stored value.
     *
     * Order is recorded in SortOrder so a repeat field keeps the order someone
     * typed, and a multi-select comes back in the order it was offered.
     */
    const seen = new Set<string>();
    wanted.forEach((value, i) => {
      seen.add(value);
      const existing = mine.find((r) => r.value === value);
      if (!existing) {
        appends.push(newRow(++nextId, profileId, field.id, value, i * 10, now, by));
        summary.added++;
        return;
      }
      if (!existing.active) {
        edits.push({ rowIndex: existing.rowIndex, header: "Active", value: "TRUE" });
        summary.restored++;
      }
      if (existing.sortOrder !== i * 10 && hasCol("SortOrder")) {
        edits.push({ rowIndex: existing.rowIndex, header: "SortOrder", value: String(i * 10) });
      }
      if (!existing.active || existing.sortOrder !== i * 10) stamp(existing.rowIndex);
    });

    for (const r of mine) {
      if (r.active && !seen.has(r.value)) {
        edits.push({ rowIndex: r.rowIndex, header: "Active", value: "FALSE" });
        stamp(r.rowIndex);
        summary.removed++;
      }
    }
  }

  return { edits, appends, summary };
}

function newRow(
  valueId: number,
  profileId: string,
  fieldId: string,
  value: string,
  sortOrder: number,
  now: string,
  by: string
): Record<string, string> {
  return {
    ValueID: String(valueId),
    ProfileID: profileId,
    FieldID: fieldId,
    Value: value,
    SortOrder: String(sortOrder),
    UpdatedAt: now,
    UpdatedBy: by,
    Active: "TRUE",
  };
}

/** A human sentence for the confirmation banner. */
export function summarize(s: Reconciliation["summary"]): string {
  const bits = [
    s.added && `${s.added} added`,
    s.changed && `${s.changed} changed`,
    s.restored && `${s.restored} restored`,
    s.removed && `${s.removed} cleared`,
  ].filter(Boolean) as string[];
  return bits.length === 0 ? "No changes." : `${bits.join(", ")}.`;
}
