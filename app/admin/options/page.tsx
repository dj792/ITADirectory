import { loadFormConfig } from "@/lib/forms/service";
import {
  addOptionAction,
  renameOptionAction,
  toggleOptionAction,
} from "../fields-actions";
import { Banner, Card, TextInput } from "../ui";
import SubmitButton from "../SubmitButton";

/**
 * THE DROPDOWN LISTS — the values behind every "choose one" and "choose several".
 *
 * Separate from the fields screen because a list is shared: `industries` feeds
 * the CR and CAS forms, so editing it from inside one of them would misrepresent
 * the blast radius. Each list here names the fields that use it, so nobody
 * retires "Consulting" without seeing that two forms ask about it.
 *
 * ── DEACTIVATE, NEVER DELETE, AND NEVER RENAME THE VALUE ──────────────────
 *
 * A member's stored answer IS the value string. So:
 *   · turning an entry off stops it being offered but leaves existing answers
 *     alone — which is what retiring a category should do: history stays true
 *     and nobody new can pick it;
 *   · the LABEL can be reworded freely, because nothing is stored against it;
 *   · the VALUE is never editable, because changing it orphans every answer
 *     that used it, silently, and the damage shows up months later.
 */

export const dynamic = "force-dynamic";

export default async function AdminOptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const config = await loadFormConfig({ fresh: true });
  const back = "/admin/options";

  // Which fields use each list — the blast radius, shown before the edit.
  const usedBy = new Map<string, string[]>();
  for (const f of config.fields.values()) {
    if (!f.optionSet) continue;
    usedBy.set(f.optionSet, [...(usedBy.get(f.optionSet) ?? []), f.label]);
  }

  const sets = [...config.options.keys()].sort();

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl">Dropdown lists</h1>
      <p className="mt-1 text-[14px] text-sub">
        The choices members pick from. A list can be used by more than one field.
      </p>

      <Banner error={one("error")} saved={one("saved")} />

      {sets.length === 0 && (
        <p className="mt-6 rounded-lg border border-hair bg-panel px-4 py-8 text-center text-[14px] text-sub">
          No lists yet.
        </p>
      )}

      <div className="mt-6 space-y-6">
        {sets.map((set) => {
          const options = config.options.get(set) ?? [];
          const fields = usedBy.get(set) ?? [];
          return (
            <section key={set} className="rounded-xl border border-hair bg-panel p-4">
              <h2 className="text-[16px]">{set}</h2>
              <p className="mt-0.5 text-[12px] text-sub">
                {fields.length > 0
                  ? `Used by: ${fields.join(" · ")}`
                  : "Not used by any field yet."}
                {" · "}
                {options.length} choice{options.length === 1 ? "" : "s"}
              </p>

              <ul className="mt-3 divide-y divide-hair border-y border-hair">
                {options.map((o) => (
                  <li key={o.value} className="flex flex-wrap items-center gap-2 py-2">
                    {/* Rename edits the LABEL; the value beside it never changes. */}
                    <form
                      action={renameOptionAction}
                      className="flex min-w-0 flex-1 items-center gap-2"
                    >
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="optionSet" value={set} />
                      <input type="hidden" name="value" value={o.value} />
                      <input
                        name="label"
                        defaultValue={o.label}
                        aria-label={`Label for ${o.value}`}
                        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-[14px] hover:border-hair focus:border-accent focus:bg-white focus:outline-none"
                      />
                      <span className="shrink-0">
                        <SubmitButton variant="ghost" pendingLabel="Saving…">
                          Rename
                        </SubmitButton>
                      </span>
                    </form>

                    <code className="shrink-0 font-mono text-[11px] text-sub opacity-70">
                      {o.value}
                    </code>

                    <form action={toggleOptionAction} className="shrink-0">
                      <input type="hidden" name="back" value={back} />
                      <input type="hidden" name="optionSet" value={set} />
                      <input type="hidden" name="value" value={o.value} />
                      <input type="hidden" name="on" value="0" />
                      <SubmitButton
                        variant="ghost"
                        pendingLabel="Retiring…"
                        title="Stop offering this choice. Members who already picked it keep their answer."
                      >
                        Retire
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>

              <form action={addOptionAction} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="back" value={back} />
                <input type="hidden" name="optionSet" value={set} />
                <div className="min-w-[200px] flex-1">
                  <label
                    htmlFor={`add-${set}`}
                    className="block text-[12px] uppercase tracking-wide text-sub"
                  >
                    Add a choice
                  </label>
                  <input
                    id={`add-${set}`}
                    name="value"
                    required
                    className="mt-1 w-full rounded-md border border-hair bg-white px-3 py-1.5 text-[14px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <SubmitButton variant="secondary" pendingLabel="Adding…">
                  Add
                </SubmitButton>
              </form>
            </section>
          );
        })}
      </div>

      <Card title="Start a new list">
        <form action={addOptionAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="back" value={back} />
          <TextInput
            name="optionSet"
            label="List name"
            required
            help="Referred to by a field's “Dropdown list” setting."
          />
          <TextInput name="value" label="First choice" required />
          <div className="flex items-end">
            <SubmitButton pendingLabel="Creating…">Create list</SubmitButton>
          </div>
        </form>
      </Card>

      <p className="mt-6 text-[12px] leading-relaxed text-sub">
        Retiring a choice never changes an answer a member has already given — it
        stops being offered to anyone new. Renaming changes only what is
        displayed; the stored value stays as it is, which is what keeps existing
        answers valid.
      </p>
    </main>
  );
}
