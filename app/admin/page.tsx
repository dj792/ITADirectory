import Link from "next/link";
import { loadFormConfig } from "@/lib/forms/service";
import { formFor } from "@/lib/forms/parse";
import {
  DATA_TYPE_LABELS,
  SEARCH_MODE_LABELS,
  VISIBILITY_LABELS,
  APPLIES_TO_LABELS,
} from "@/lib/forms/labels";
import { DATA_TYPES, SEARCH_MODES, VISIBILITIES, type FormField } from "@/lib/forms/types";
import {
  addFieldAction,
  moveFieldAction,
  toggleFieldOnFormAction,
  updateFieldAction,
} from "./fields-actions";
import { Banner, Card, Select, TextInput } from "./ui";

/**
 * MANAGE THE FIELDS ON ONE FORM.
 *
 * Scoped to one application type at a time, because that is the question people
 * actually have — "what does a CR member get asked, and in what order" — and
 * because a single list of 40 fields across five forms is a table nobody can
 * reason about.
 *
 * ── WHY ARROWS RATHER THAN DRAG-AND-DROP ──────────────────────────────────
 *
 * Reordering is up/down buttons: no JavaScript, works on a phone and with a
 * keyboard, and each press is one atomic swap of two cells in the sheet. Drag
 * and drop would need a client bundle, a drop-target model, and a way to
 * reconcile a dropped order against a sheet someone else may have edited
 * mid-drag. Arrows are worse to use for a twenty-place move and better for
 * everything else, including being obviously correct.
 */

export const dynamic = "force-dynamic";

export default async function AdminFieldsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const config = await loadFormConfig();

  const order = ["TP", "CR", "CAS", "ITL", "DEFAULT"];
  const types = [...config.forms.keys()].sort(
    (a, b) => order.indexOf(a) - order.indexOf(b) || a.localeCompare(b)
  );
  const type = types.includes(one("type")) ? one("type") : types[0] ?? "";
  const back = `/admin?type=${encodeURIComponent(type)}`;
  const form = config.forms.get(type);
  const fields = form?.fields ?? [];
  const optionSets = [...config.options.keys()].sort();
  const groups = [...new Set([...config.fields.values()].map((f) => f.group).filter(Boolean))];

  // Fields that exist but aren't on THIS form — the "add an existing one" list.
  const notOnForm = [...config.fields.values()]
    .filter((f) => !fields.some((x) => x.id === f.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  const editing = one("edit");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl">Member form fields</h1>
      <p className="mt-1 text-[14px] text-sub">
        What each kind of member is asked, and in what order. Changes take effect
        immediately.
      </p>

      <Banner error={one("error")} saved={!!one("saved")} />

      {config.source !== "sheet" && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          {config.source === "fixture"
            ? "Showing the local seed file. Edits here would try to write to a sheet that isn't configured."
            : `The configuration isn't loaded: ${config.error ?? "unknown reason"}`}
        </p>
      )}

      {/* Which form */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="w-[68px] shrink-0 text-[12px] uppercase tracking-wide text-sub">
          Form
        </span>
        {types.map((t) => (
          <Link
            key={t}
            href={`/admin?type=${encodeURIComponent(t)}`}
            className={`rounded-md border px-3 py-1 text-[13px] ${
              t === type
                ? "border-accent bg-accent text-white"
                : "border-hair bg-panel text-fg hover:border-accent/40"
            }`}
          >
            {t}
          </Link>
        ))}
        <Link
          href={`/admin/forms?type=${encodeURIComponent(type)}`}
          className="ml-auto text-[13px] text-accent hover:underline"
        >
          Preview this form →
        </Link>
      </div>

      <p className="mt-4 text-[13px] text-sub">
        {fields.length} field{fields.length === 1 ? "" : "s"} on the {type} form
      </p>

      {/* The list */}
      <ol className="mt-3 space-y-2">
        {fields.map((f, i) => (
          <li key={f.id}>
            <FieldRow
              field={f}
              type={type}
              back={back}
              first={i === 0}
              last={i === fields.length - 1}
              expanded={editing === f.id}
              optionSets={optionSets}
              groups={groups}
            />
          </li>
        ))}
      </ol>

      {/* Put an existing field on this form */}
      {notOnForm.length > 0 && (
        <Card title="Add a field that already exists">
          <p className="text-[13px] text-sub">
            These are defined but not asked on the {type} form.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {notOnForm.map((f) => (
              <form key={f.id} action={toggleFieldOnFormAction}>
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="type" value={type} />
                <input type="hidden" name="fieldId" value={f.id} />
                <input type="hidden" name="on" value="1" />
                <button
                  type="submit"
                  className="rounded-md border border-hair bg-panel px-3 py-1 text-[13px] hover:border-accent hover:text-accent"
                >
                  + {f.label}
                </button>
              </form>
            ))}
          </div>
        </Card>
      )}

      <NewFieldForm
        type={type}
        types={types}
        back={back}
        optionSets={optionSets}
        groups={groups}
      />
    </main>
  );
}

/* --------------------------------------------------------------- a row -- */

function FieldRow({
  field: f,
  type,
  back,
  first,
  last,
  expanded,
  optionSets,
  groups,
}: {
  field: FormField;
  type: string;
  back: string;
  first: boolean;
  last: boolean;
  expanded: boolean;
  optionSets: string[];
  groups: string[];
}) {
  return (
    <div className="rounded-lg border border-hair bg-panel">
      <div className="flex items-start gap-3 p-3">
        {/* Order controls. Disabled at the ends rather than hidden, so the
            column doesn't reflow and the first row's buttons stay where the
            eye expects them. */}
        <div className="flex shrink-0 flex-col gap-1">
          <MoveButton
            back={back}
            type={type}
            fieldId={f.id}
            direction="up"
            disabled={first}
          />
          <MoveButton
            back={back}
            type={type}
            fieldId={f.id}
            direction="down"
            disabled={last}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-strong">
            {f.label}
            {f.required && <span className="ml-1 text-accent">*</span>}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px] text-sub">
            <span>{DATA_TYPE_LABELS[f.dataType].label}</span>
            <span>· {VISIBILITY_LABELS[f.visibility].label}</span>
            {f.searchMode !== "none" && (
              <span>· {SEARCH_MODE_LABELS[f.searchMode].label}</span>
            )}
            <span>· {APPLIES_TO_LABELS[f.appliesTo].label}</span>
            {f.group && <span>· {f.group}</span>}
            <span className="font-mono opacity-60">· {f.id}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 text-[13px]">
          <Link
            href={expanded ? back : `${back}&edit=${encodeURIComponent(f.id)}`}
            className="text-accent hover:underline"
          >
            {expanded ? "Close" : "Edit"}
          </Link>
          <form action={toggleFieldOnFormAction}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="fieldId" value={f.id} />
            <input type="hidden" name="on" value="0" />
            <button
              type="submit"
              className="text-sub hover:text-amber-700"
              title={`Stop asking this on the ${type} form. The field and any answers are kept.`}
            >
              Remove
            </button>
          </form>
        </div>
      </div>

      {expanded && (
        <EditForm
          field={f}
          back={back}
          optionSets={optionSets}
          groups={groups}
        />
      )}
    </div>
  );
}

function MoveButton({
  back,
  type,
  fieldId,
  direction,
  disabled,
}: {
  back: string;
  type: string;
  fieldId: string;
  direction: "up" | "down";
  disabled: boolean;
}) {
  return (
    <form action={moveFieldAction}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="fieldId" value={fieldId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={`Move ${direction}`}
        className="flex h-6 w-6 items-center justify-center rounded border border-hair text-[11px] text-sub enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-30"
      >
        {direction === "up" ? "▲" : "▼"}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------- editing -- */

function EditForm({
  field: f,
  back,
  optionSets,
  groups,
}: {
  field: FormField;
  back: string;
  optionSets: string[];
  groups: string[];
}) {
  return (
    <form
      action={updateFieldAction}
      className="border-t border-hair bg-panel2 p-3"
    >
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="fieldId" value={f.id} />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput name="label" label="Label" defaultValue={f.label} />
        <TextInput
          name="group"
          label="Section"
          defaultValue={f.group}
          list="admin-groups"
        />
        <Select
          name="dataType"
          label="Answer type"
          defaultValue={f.dataType}
          options={DATA_TYPES.map((d) => [d, DATA_TYPE_LABELS[d].label])}
        />
        <Select
          name="appliesTo"
          label="Asked of"
          defaultValue={f.appliesTo}
          options={(["both", "org", "individual"] as const).map((a) => [
            a,
            APPLIES_TO_LABELS[a].label,
          ])}
        />
        <Select
          name="visibility"
          label="Who sees the answer"
          defaultValue={f.visibility}
          options={VISIBILITIES.map((v) => [v, VISIBILITY_LABELS[v].label])}
        />
        <Select
          name="searchMode"
          label="Searching"
          defaultValue={f.searchMode}
          options={SEARCH_MODES.map((s) => [s, SEARCH_MODE_LABELS[s].label])}
          help="An ITA-staff-only field is never searchable — filtering on a field reveals its answer."
        />
        <Select
          name="optionSet"
          label="Dropdown list"
          defaultValue={f.optionSet}
          options={[["", "— none —"], ...optionSets.map((o) => [o, o] as [string, string])]}
          help="Only used by “Choose one” and “Choose several”."
        />
        <TextInput name="helpText" label="Help text" defaultValue={f.helpText} />
      </div>

      <datalist id="admin-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accentDark"
        >
          Save changes
        </button>
        <span className="text-[12px] text-sub">
          The field’s id (<code className="font-mono">{f.id}</code>) can’t change —
          members’ existing answers are stored against it.
        </span>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------- new field -- */

function NewFieldForm({
  type,
  types,
  back,
  optionSets,
  groups,
}: {
  type: string;
  types: string[];
  back: string;
  optionSets: string[];
  groups: string[];
}) {
  return (
    <Card title="Create a new field">
      <form action={addFieldAction}>
        <input type="hidden" name="back" value={back} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput name="label" label="Question" required />
          <TextInput
            name="id"
            label="Short id"
            required
            help="Permanent — answers are stored against it. Letters, numbers, underscores."
          />
          <Select
            name="dataType"
            label="Answer type"
            defaultValue="text"
            options={DATA_TYPES.map((d) => [d, DATA_TYPE_LABELS[d].label])}
          />
          <Select
            name="appliesTo"
            label="Asked of"
            defaultValue="both"
            options={(["both", "org", "individual"] as const).map((a) => [
              a,
              APPLIES_TO_LABELS[a].label,
            ])}
          />
          <Select
            name="visibility"
            label="Who sees the answer"
            defaultValue="members"
            options={VISIBILITIES.map((v) => [v, VISIBILITY_LABELS[v].label])}
          />
          <Select
            name="searchMode"
            label="Searching"
            defaultValue="none"
            options={SEARCH_MODES.map((s) => [s, SEARCH_MODE_LABELS[s].label])}
          />
          <Select
            name="optionSet"
            label="Dropdown list"
            defaultValue=""
            options={[["", "— none —"], ...optionSets.map((o) => [o, o] as [string, string])]}
          />
          <TextInput name="group" label="Section" list="admin-groups" />
        </div>

        <fieldset className="mt-4">
          <legend className="text-[12px] uppercase tracking-wide text-sub">
            Ask it on
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {types.map((t) => (
              <label key={t} className="flex items-center gap-1.5 text-[13px]">
                <input
                  type="checkbox"
                  name="applicationTypes"
                  value={t}
                  defaultChecked={t === type}
                />
                {t}
              </label>
            ))}
          </div>
        </fieldset>

        <datalist id="admin-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>

        <button
          type="submit"
          className="mt-4 rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white hover:bg-accentDark"
        >
          Create field
        </button>
      </form>
    </Card>
  );
}
