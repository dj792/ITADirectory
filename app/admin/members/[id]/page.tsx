import Link from "next/link";
import { notFound } from "next/navigation";
import { loadDirectory } from "@/lib/directory/service";
import { fieldValuesFor, loadFormConfig } from "@/lib/forms/service";
import { formForMember, visibleTo } from "@/lib/forms/parse";
import {
  DATA_TYPE_LABELS,
  SEARCH_MODE_LABELS,
  VISIBILITY_LABELS,
} from "@/lib/forms/labels";
import type { FormField } from "@/lib/forms/types";
import { CONTACT } from "@/lib/brand";
import { Banner } from "../../ui";
import SubmitButton from "../../SubmitButton";
import { saveProfileAction } from "./actions";
import {
  ACCEPT_ATTR,
  ACCEPT_HINT,
  downloadUrl,
  safeImageUrl,
  uploadsAllowed,
} from "@/lib/forms/image";
import { blobConfigured } from "@/lib/forms/blob";

/**
 * UPDATE PROFILE — the real editing form, rendered from the configuration.
 *
 * The fields, their order, their types, their option lists and who they are
 * asked of all come from ITA's tabs. Nothing about this page knows what a
 * question IS, which is the whole point: ITA adds a field in `/admin` and it
 * appears here on the next load, with no deploy.
 *
 * ── WHAT IS NOT EDITABLE HERE ─────────────────────────────────────────────
 *
 * Everything the CRM import supplies — name, company, address, phone, email,
 * website, membership level. Those are shown at the top as READ-ONLY context so
 * whoever is editing knows who they have, and they are not inputs because there
 * must be exactly one source of truth for them (the import). `parse.ts` rejects
 * any custom field that collides with one, so the config cannot reintroduce
 * them by accident either.
 */

export const dynamic = "force-dynamic";

export default async function UpdateProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const [directory, config] = await Promise.all([
    loadDirectory(),
    loadFormConfig({ fresh: true }),
  ]);
  const member = directory.members.find((m) => m.id === id);
  if (!member) notFound();

  const form = formForMember(config, member);
  const fields = visibleTo(form.fields, "staff");
  const values = await fieldValuesFor(member.id);

  const groups: { name: string; fields: FormField[] }[] = [];
  for (const f of fields) {
    const name = f.group || "Other";
    const g = groups.find((x) => x.name === name);
    if (g) g.fields.push(f);
    else groups.push({ name, fields: [f] });
  }

  const uploadsOn = blobConfigured();
  const answered = fields.filter((f) => (values.get(f.id) ?? []).length > 0).length;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Carries the search that found this person, so Back doesn't cost a retype. */}
        <Link
          href={one("from") ? `/admin/members?${one("from")}` : "/admin/members"}
          className="text-[13px] text-accent hover:underline"
        >
          ← Back to Member Search
        </Link>
        {/* Leaves the admin area, so a new tab — see AdminMemberSearch. */}
        <a
          href={`/member/${encodeURIComponent(member.id)}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-[13px] text-accent hover:underline"
          title="Opens this member's page in the members' directory, in a new tab"
        >
          Open in the directory
          <span aria-hidden="true" className="text-[11px]">↗</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </div>

      <h1 className="mt-2 text-2xl">{member.name}</h1>
      <p className="mt-1 text-[14px] text-sub">
        {config.formLabels.get(form.applicationType) ?? form.applicationType} form ·{" "}
        {member.isOrganization ? "Organization" : "Individual"} ·{" "}
        {answered} of {fields.length} answered
      </p>

      <Banner error={one("error")} saved={one("saved")} />

      <ProfileSummary member={member} name={member.name} />

      {fields.length === 0 ? (
        <p className="mt-8 rounded-xl border border-hair bg-panel px-6 py-10 text-center text-[14px] text-sub">
          No custom fields are configured for this kind of member yet.{" "}
          <Link href="/admin" className="text-accent hover:underline">
            Add some
          </Link>
          .
        </p>
      ) : (
        <form action={saveProfileAction} className="mt-8">
          <input type="hidden" name="profileId" value={member.id} />

          <div className="space-y-8">
            {groups.map((g) => (
              <section key={g.name}>
                <h2 className="border-b border-hair pb-2 text-[16px]">{g.name}</h2>
                <div className="mt-4 space-y-6">
                  {g.fields.map((f) => (
                    <Field
                      key={f.id}
                      field={f}
                      values={values.get(f.id) ?? []}
                      uploadsOn={uploadsOn}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/*
            The save button is sticky. The TP form runs to 24 fields, and a
            button that requires scrolling back past everything you just typed
            is how half-finished edits get abandoned.
          */}
          <div className="sticky bottom-0 mt-8 flex items-center gap-3 border-t border-hair bg-ink/95 py-4 backdrop-blur">
            <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
            <span className="text-[12px] text-sub">
              Saved to ITA’s sheet. Clearing an answer keeps its history.
            </span>
          </div>
        </form>
      )}
    </main>
  );
}

/**
 * PROFILE SUMMARY — the member's core record, read-only.
 *
 * Present so whoever is editing can see they have the right person without
 * opening another tab, and absent as INPUTS because the CRM import is the
 * single source of truth for these.
 *
 * ── IT IS WRITTEN FOR THE MEMBER, NOT FOR US ──────────────────────────────
 *
 * This panel said "FROM THE MEMBERSHIP IMPORT — NOT EDITABLE HERE", and
 * explained underneath that the values come from ITA's CRM export so the
 * directory never holds two answers for one thing. All true, and all OUR
 * problem: a member reading it learns about an export they have no relationship
 * with, and is told what they CAN'T do rather than what they can.
 *
 * DJ's call, 28 Sep: "the member doesn't need to know why." So it is now
 * "Profile Summary", and the footer answers the only question a reader actually
 * has when they spot something wrong — who do I tell? That matters more than it
 * looks, because this exact component is what members will see when self-
 * service sign-in ships; writing it for staff now would mean rewriting it then.
 */
function ProfileSummary({
  member: m,
  name,
}: {
  name: string;
  member: {
    organization: string;
    email: string;
    phone: string;
    website: string;
    city: string;
    state: string;
    membershipLevel: string;
    relatedOrgName: string;
    titleAtOrg: string;
    isMember: boolean;
  };
}) {
  const rows: [string, string][] = [
    ["Organization", m.isMember ? m.organization : m.relatedOrgName],
    ["Title", m.titleAtOrg],
    ["Membership level", m.isMember ? m.membershipLevel : ""],
    ["Email", m.email],
    ["Phone", m.phone],
    ["Location", [m.city, m.state].filter(Boolean).join(", ")],
    ["Website", m.website],
  ].filter(([, v]) => !!v) as [string, string][];

  if (rows.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-hair bg-panel2 p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-sub">
        Profile Summary
      </h2>
      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="shrink-0 text-sub">{k}</dt>
            <dd className="min-w-0 break-words text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      {/*
        The only question a reader has when something here is wrong: who do I
        tell? A mailto with the subject pre-filled saves them explaining which
        record they mean — and saves ITA guessing.
      */}
      <p className="mt-4 border-t border-hair pt-3 text-[12px] text-sub">
        Need to make updates to the above?{" "}
        <a
          href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(
            `Profile update request — ${name}`
          )}`}
          className="text-accent hover:underline"
        >
          Email us at {CONTACT.email}
        </a>
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- a field -- */

function Field({
  field: f,
  values,
  uploadsOn,
}: {
  field: FormField;
  values: string[];
  uploadsOn: boolean;
}) {
  const name = `f_${f.id}`;
  const id = `field-${f.id}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[14px] font-medium text-strong">
        {f.label}
        {f.required && <span className="ml-1 text-accent">*</span>}
      </label>
      <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12px] text-sub">
        <span title={VISIBILITY_LABELS[f.visibility].description}>
          {VISIBILITY_LABELS[f.visibility].label}
        </span>
        {f.searchMode !== "none" && (
          <span title={SEARCH_MODE_LABELS[f.searchMode].description}>
            · {SEARCH_MODE_LABELS[f.searchMode].label}
          </span>
        )}
        {f.helpText && <span className="w-full text-sub">{f.helpText}</span>}
      </p>
      <div className="mt-2">
        <Input field={f} name={name} id={id} values={values} uploadsOn={uploadsOn} />
      </div>
    </div>
  );
}

const BOX =
  "w-full rounded-md border border-hair bg-white px-3 py-2 text-[14px] text-fg " +
  "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";

function Input({
  field: f,
  name,
  id,
  values,
  uploadsOn,
}: {
  field: FormField;
  name: string;
  id: string;
  values: string[];
  uploadsOn: boolean;
}) {
  const first = values[0] ?? "";

  switch (f.dataType) {
    case "textarea":
      return (
        <textarea
          id={id}
          name={name}
          rows={4}
          maxLength={f.maxLength || undefined}
          defaultValue={first}
          required={f.required}
          className={BOX}
        />
      );

    case "boolean":
      /*
       * A hidden "" before the radios, so clearing is expressible. Without it,
       * an unanswered yes/no can be set but never UNSET: nothing is submitted
       * for an untouched radio group, and the reconcile would read that as
       * "leave it alone" forever.
       */
      return (
        <div className="flex flex-wrap items-center gap-4 text-[14px]">
          {[["TRUE", "Yes"], ["FALSE", "No"]].map(([v, label]) => (
            <label key={v} className="flex items-center gap-1.5">
              <input
                type="radio"
                name={name}
                value={v}
                defaultChecked={first.toUpperCase() === v}
              />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-1.5 text-sub">
            <input type="radio" name={name} value="" defaultChecked={first === ""} />
            Not answered
          </label>
        </div>
      );

    case "select":
      return (
        <select id={id} name={name} defaultValue={first} required={f.required} className={BOX}>
          <option value="">— not answered —</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case "multiselect":
      return (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {f.options.length === 0 && (
            <p className="text-[13px] text-amber-700">
              This question has no choices set up yet.
            </p>
          )}
          {f.options.map((o) => (
            <label key={o.value} className="flex items-start gap-2 text-[14px]">
              <input
                type="checkbox"
                name={name}
                value={o.value}
                defaultChecked={values.includes(o.value)}
                className="mt-1"
              />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      );

    case "repeat":
      return (
        <div className="space-y-2">
          {Array.from({ length: f.maxRepeat }, (_, i) => (
            <input
              key={i}
              name={name}
              defaultValue={values[i] ?? ""}
              maxLength={f.maxLength || undefined}
              placeholder={`${i + 1}.`}
              className={BOX}
            />
          ))}
        </div>
      );

    case "file":
      return (
        <FileInput field={f} name={name} id={id} current={first} uploadsOn={uploadsOn} />
      );

    case "number":
    case "year":
      return (
        <input
          id={id}
          name={name}
          type="number"
          inputMode="numeric"
          defaultValue={first}
          required={f.required}
          className={`${BOX} max-w-[200px]`}
        />
      );

    default:
      return (
        <input
          id={id}
          name={name}
          defaultValue={first}
          maxLength={f.maxLength || undefined}
          required={f.required}
          className={BOX}
        />
      );
  }
}

/**
 * A file field: the file on record (preview, open, download), a picker to
 * replace it, and a Remove box.
 *
 * Two honest placeholders instead of a picker, so nothing is ever picked and
 * silently dropped:
 *  - the field isn't PUBLIC (uploads are stored at public links — see
 *    `uploadsAllowed`), which today is the IT org chart;
 *  - no Blob store is connected yet (BLOB_READ_WRITE_TOKEN unset).
 *
 * An untouched picker submits nothing and the action leaves the stored value
 * alone, so saving another field never blanks the logo.
 */
function FileInput({
  field: f,
  name,
  id,
  current,
  uploadsOn,
}: {
  field: FormField;
  name: string;
  id: string;
  current: string;
  uploadsOn: boolean;
}) {
  const url = safeImageUrl(current);

  if (!uploadsAllowed(f) || !uploadsOn) {
    return (
      <p className="rounded-md border border-dashed border-hair bg-panel2 px-3 py-3 text-[13px] text-sub">
        {!uploadsAllowed(f)
          ? "Uploads aren’t switched on for this question yet."
          : "File uploads aren’t switched on yet — the file store still needs connecting."}{" "}
        {DATA_TYPE_LABELS.file.description} Nothing is lost in the meantime.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-hair bg-panel2 p-3">
      {url ? (
        <div className="flex flex-wrap items-center gap-4">
          {/* White tile: most logos are drawn for a white page. */}
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex h-20 w-44 items-center justify-center rounded border border-hair bg-white p-2"
            title="Open full size in a new tab"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`${f.label} on file`} className="max-h-full max-w-full object-contain" />
          </a>
          <div className="flex flex-col gap-1 text-[13px]">
            <a href={downloadUrl(url)} className="text-accent hover:underline">
              Download
            </a>
            <a href={url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
              Open full size ↗
            </a>
            <label className="mt-1 flex items-center gap-1.5 text-sub">
              <input type="checkbox" name={`${name}__remove`} value="1" />
              Remove on save
            </label>
          </div>
        </div>
      ) : current ? (
        <p className="text-[13px] text-amber-700">
          The value on record isn’t a usable image link: <span className="break-all font-mono">{current}</span>
        </p>
      ) : (
        <p className="text-[13px] text-sub">No file on record yet.</p>
      )}

      <div className="mt-3">
        <input
          id={id}
          name={name}
          type="file"
          accept={ACCEPT_ATTR}
          className="block w-full text-[13px] text-fg file:mr-3 file:rounded-md file:border file:border-hair file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:text-fg hover:file:border-accent"
        />
        <p className="mt-1 text-[12px] text-sub">
          {url ? "Choose a file to replace it" : "Choose a file"} — {ACCEPT_HINT}. It is
          uploaded when you press Save profile.
        </p>
      </div>
    </div>
  );
}
