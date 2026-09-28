"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminCookieValid } from "@/lib/admin-gate";
import {
  addField,
  addOption,
  moveField,
  renameOption,
  setFieldActive,
  setFieldOnForm,
  setOptionActive,
  updateField,
} from "@/lib/forms/write";

/**
 * Server actions behind the admin screens.
 *
 * ── EVERY ACTION RE-CHECKS THE GATE ───────────────────────────────────────
 *
 * The layout's check is what stops a person seeing the page; it is NOT what
 * stops a request. A server action is a POST endpoint with a stable id, and it
 * is callable by anything that can reach the site — it does not go through the
 * layout that rendered the button. Guarding only the layout would mean a page
 * nobody can see, with write endpoints anyone can call: the exact mistake
 * behind "hiding the link is presentation, the check is the gate" in the
 * Aligned KPIs conventions.
 *
 * Errors come back as a `?error=` on the redirect rather than as an exception,
 * because these are ordinary mistakes — a duplicate id, a reserved name, a
 * select with no list — and a stack trace is not an answer to any of them.
 */

async function requireAdmin(): Promise<void> {
  const jar = await cookies();
  if (!adminCookieValid(jar.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin");
  }
}

/**
 * Run a write, then land back where the person was with a message saying what
 * happened.
 *
 * **The message is SPECIFIC, not "Saved."** A generic confirmation next to an
 * unchanged-looking page is barely better than silence: the create form sits at
 * the bottom of a long list, a new field is appended to the END of that list,
 * and the redirect lands you at the top — so "Saved." asks the reader to take
 * it on faith. "Added "Elevator Pitch" to the Technology Partner form" is
 * checkable against what they meant to do.
 *
 * `highlight` names a field the page should mark, so the thing that changed can
 * be pointed at rather than described.
 */
async function run(
  back: string,
  message: string,
  fn: () => Promise<void>,
  highlight?: string
): Promise<never> {
  await requireAdmin();
  try {
    await fn();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(detail)}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  const sep = back.includes("?") ? "&" : "?";
  const mark = highlight ? `&highlight=${encodeURIComponent(highlight)}` : "";
  // `#admin-banner` so the browser scrolls the confirmation into view rather
  // than landing at the top of a page that looks unchanged.
  redirect(`${back}${sep}saved=${encodeURIComponent(message)}${mark}#admin-banner`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function moveFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const type = str(formData, "type");
  const fieldId = str(formData, "fieldId");
  const label = str(formData, "label") || fieldId;
  const dir = str(formData, "direction") === "up" ? "up" : "down";
  await run(back, `Moved “${label}” ${dir}.`, () => moveField(type, fieldId, dir), fieldId);
}

export async function toggleFieldOnFormAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const type = str(formData, "type");
  const fieldId = str(formData, "fieldId");
  const label = str(formData, "label") || fieldId;
  const on = str(formData, "on") === "1";
  await run(
    back,
    on
      ? `Added “${label}” to the ${type} form.`
      : `Removed “${label}” from the ${type} form. The field and any answers are kept.`,
    () => setFieldOnForm(type, fieldId, on),
    on ? fieldId : undefined
  );
}

export async function toggleFieldActiveAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const fieldId = str(formData, "fieldId");
  const label = str(formData, "label") || fieldId;
  const on = str(formData, "on") === "1";
  await run(
    back,
    on ? `Turned “${label}” back on.` : `Turned “${label}” off on every form.`,
    () => setFieldActive(fieldId, on),
    fieldId
  );
}

export async function updateFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const fieldId = str(formData, "fieldId");
  const label = str(formData, "label") || fieldId;
  await run(back, `Saved changes to “${label}”.`, () =>
    updateField(fieldId, {
      label: str(formData, "label"),
      dataType: str(formData, "dataType"),
      optionSet: str(formData, "optionSet"),
      appliesTo: str(formData, "appliesTo"),
      visibility: str(formData, "visibility"),
      searchMode: str(formData, "searchMode"),
      group: str(formData, "group"),
      helpText: str(formData, "helpText"),
    }),
    fieldId
  );
}

export async function addFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const label = str(formData, "label");
  const types = formData.getAll("applicationTypes").map(String);
  const where = types.length ? ` to the ${types.join(", ")} form${types.length > 1 ? "s" : ""}` : "";
  await run(back, `Added “${label}”${where}.`, () =>
    addField({
      id: str(formData, "id"),
      label: str(formData, "label"),
      dataType: str(formData, "dataType"),
      optionSet: str(formData, "optionSet"),
      appliesTo: str(formData, "appliesTo"),
      visibility: str(formData, "visibility"),
      searchMode: str(formData, "searchMode"),
      group: str(formData, "group"),
      helpText: str(formData, "helpText"),
      applicationTypes: types,
    }),
    str(formData, "id").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "")
  );
}

export async function addOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  await run(back, `Added “${str(formData, "value")}” to ${str(formData, "optionSet")}.`, () =>
    addOption(str(formData, "optionSet"), str(formData, "value"), str(formData, "label"))
  );
}

export async function toggleOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  const on = str(formData, "on") === "1";
  await run(
    back,
    on
      ? `Restored “${str(formData, "value")}”.`
      : `Retired “${str(formData, "value")}”. Members who already chose it keep their answer.`,
    () =>
    setOptionActive(
      str(formData, "optionSet"),
      str(formData, "value"),
      on
    )
  );
}

export async function renameOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  await run(back, `Renamed to “${str(formData, "label")}”.`, () =>
    renameOption(str(formData, "optionSet"), str(formData, "value"), str(formData, "label"))
  );
}
