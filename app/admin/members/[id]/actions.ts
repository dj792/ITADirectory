"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminCookieValid } from "@/lib/admin-gate";
import { loadDirectory } from "@/lib/directory/service";
import { loadFormConfig } from "@/lib/forms/service";
import { formForMember, visibleTo } from "@/lib/forms/parse";
import { saveProfileValues } from "@/lib/forms/write";
import type { Answers } from "@/lib/forms/values";
import { checkImage, uploadsAllowed } from "@/lib/forms/image";
import { blobConfigured, storeMemberImage } from "@/lib/forms/blob";

/**
 * Save a member's answers.
 *
 * ── THE FIELD LIST COMES FROM THE SERVER, NOT THE FORM ────────────────────
 *
 * The submitted payload says what the values ARE; it does not get to say which
 * fields exist. This action re-derives the member's form from the configuration
 * and reconciles only against those fields. Trusting the payload's field list
 * would let a crafted POST write an answer to any field id — including one from
 * a form this member never sees, or a staff-only field — and the reconcile
 * would dutifully store it.
 *
 * It is the same reason the member is re-loaded here rather than passed in: the
 * profile id in the URL is checked against the real directory, so a request for
 * an id that isn't published writes nothing.
 */
export async function saveProfileAction(formData: FormData) {
  const jar = await cookies();
  if (!adminCookieValid(jar.get(ADMIN_COOKIE)?.value)) redirect("/admin-login");

  const profileId = String(formData.get("profileId") ?? "").trim();
  const back = `/admin/members/${encodeURIComponent(profileId)}`;

  const [directory, config] = await Promise.all([
    loadDirectory(),
    loadFormConfig({ fresh: true }),
  ]);
  const member = directory.members.find((m) => m.id === profileId);
  if (!member) redirect("/admin/members");

  // Staff-only fields are editable here because this IS the staff screen; when
  // members edit their own profile the audience narrows and this is the line
  // that will change.
  const fields = visibleTo(formForMember(config, member).fields, "staff");

  const answers: Answers = new Map();
  for (const field of fields) {
    if (field.dataType === "file") {
      /*
       * A file field is only put in `answers` when something HAPPENED to it —
       * a new file picked, or "Remove" ticked. Absent from `answers` means
       * "leave it alone" to the reconcile, which is what an untouched file
       * input must mean: browsers never re-submit the file already on record.
       */
      if (!uploadsAllowed(field) || !blobConfigured()) continue;
      if (formData.get(`f_${field.id}__remove`) === "1") {
        answers.set(field.id, []);
        continue;
      }
      const file = formData.get(`f_${field.id}`);
      if (!(file instanceof File) || file.size === 0) continue;

      const bytes = new Uint8Array(await file.arrayBuffer());
      const checked = checkImage(bytes);
      if (!checked.ok) {
        redirect(`${back}?error=${encodeURIComponent(`${field.label}: ${checked.reason}`)}`);
      }
      let url: string;
      try {
        url = await storeMemberImage(profileId, field.id, bytes, checked.kind);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        redirect(`${back}?error=${encodeURIComponent(`${field.label}: upload failed — ${detail}`)}`);
      }
      answers.set(field.id, [url]);
      continue;
    }
    // `getAll` so a multi-select's several checkboxes and a repeat field's
    // several inputs arrive as the set they are.
    const raw = formData.getAll(`f_${field.id}`).map((v) => String(v));
    answers.set(field.id, raw);
  }

  let message: string;
  try {
    message = await saveProfileValues(
      profileId,
      fields,
      answers,
      "ITA staff (admin)"
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    redirect(`${back}?error=${encodeURIComponent(detail)}`);
  }

  revalidatePath(back);
  revalidatePath(`/member/${profileId}`);
  redirect(`${back}?saved=${encodeURIComponent(message)}#admin-banner`);
}
