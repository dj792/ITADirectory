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

/** Run a write, then land back where the person was, error or not. */
async function run(back: string, fn: () => Promise<void>): Promise<never> {
  await requireAdmin();
  try {
    await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/admin");
  revalidatePath("/admin/forms");
  redirect(`${back}${back.includes("?") ? "&" : "?"}saved=1`);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function moveFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const type = str(formData, "type");
  const fieldId = str(formData, "fieldId");
  const dir = str(formData, "direction") === "up" ? "up" : "down";
  await run(back, () => moveField(type, fieldId, dir));
}

export async function toggleFieldOnFormAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const type = str(formData, "type");
  const fieldId = str(formData, "fieldId");
  const on = str(formData, "on") === "1";
  await run(back, () => setFieldOnForm(type, fieldId, on));
}

export async function toggleFieldActiveAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const fieldId = str(formData, "fieldId");
  const on = str(formData, "on") === "1";
  await run(back, () => setFieldActive(fieldId, on));
}

export async function updateFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  const fieldId = str(formData, "fieldId");
  await run(back, () =>
    updateField(fieldId, {
      label: str(formData, "label"),
      dataType: str(formData, "dataType"),
      optionSet: str(formData, "optionSet"),
      appliesTo: str(formData, "appliesTo"),
      visibility: str(formData, "visibility"),
      searchMode: str(formData, "searchMode"),
      group: str(formData, "group"),
      helpText: str(formData, "helpText"),
    })
  );
}

export async function addFieldAction(formData: FormData) {
  const back = str(formData, "back") || "/admin";
  await run(back, () =>
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
      applicationTypes: formData.getAll("applicationTypes").map(String),
    })
  );
}

export async function addOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  await run(back, () =>
    addOption(str(formData, "optionSet"), str(formData, "value"), str(formData, "label"))
  );
}

export async function toggleOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  await run(back, () =>
    setOptionActive(
      str(formData, "optionSet"),
      str(formData, "value"),
      str(formData, "on") === "1"
    )
  );
}

export async function renameOptionAction(formData: FormData) {
  const back = str(formData, "back") || "/admin/options";
  await run(back, () =>
    renameOption(str(formData, "optionSet"), str(formData, "value"), str(formData, "label"))
  );
}
