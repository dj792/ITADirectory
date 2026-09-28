import type { Metadata } from "next";
import Link from "next/link";
import { loadFormConfig, type LoadedFormConfig } from "@/lib/forms/service";
import { formFor, visibleTo } from "@/lib/forms/parse";
import type { FormField, Visibility } from "@/lib/forms/types";
import {
  DATA_TYPE_LABELS,
  SEARCH_MODE_LABELS,
  VISIBILITY_LABELS,
  type Explained,
} from "@/lib/forms/labels";

/**
 * FORM PREVIEW — "show me the CR form as a member sees it."
 *
 * Read-only, and nothing here saves. It exists for two audiences: us, to see
 * that the config tabs parse into the forms we meant; and ITA later, as the
 * preview built into the admin screen, because the whole point of making fields
 * configurable is that they can change a form without us — which they can only
 * do safely if they can see the result.
 *
 * IT RENDERS THE REAL CONTROLS, DISABLED, rather than a table of field names. A
 * list of labels tells you the config parsed; it does not tell you the CR form
 * opens with a wall of twelve checkboxes. Those are different questions and the
 * second one is why anyone looks at a preview.
 *
 * ── SECURITY, PLAINLY ─────────────────────────────────────────────────────
 *
 * It lives under `/admin/` because that is where it belongs once there is an
 * admin area, and the path is the cheapest way to make sure it ends up behind
 * that gate rather than being found later at a stray URL. **Today /admin is NOT
 * gated** — testing mode lets everyone through. What is exposed is ITA's form
 * STRUCTURE (labels, options, which questions are staff-only), never any
 * member's answers: this page reads the config tabs and nothing else. That is
 * acceptable for an internal demo and is not acceptable once the link is shared
 * — see the banner it prints, and the TESTING MODE section in CLAUDE.md.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Form preview — ITA Member Directory",
  robots: { index: false, follow: false },
};

const TYPES_HINT = ["TP", "CR", "CAS", "ITL", "DEFAULT"];

export default async function FormPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const config = await loadFormConfig();
  const one = (k: string) => {
    const v = params[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };

  const types = [...config.forms.keys()].sort(
    (a, b) => TYPES_HINT.indexOf(a) - TYPES_HINT.indexOf(b) || a.localeCompare(b)
  );
  const active = types.includes(one("type")) ? one("type") : types[0] ?? "";
  const isOrg = one("kind") !== "individual";
  const audience: Visibility =
    (["public", "members", "staff"] as const).find((a) => a === one("as")) ?? "staff";

  // `formFor` takes a membership LEVEL, so find one that maps to this form —
  // going through the real path rather than reading `forms` directly, so the
  // preview exercises the same resolution a member's page will.
  const levelFor = (type: string) =>
    config.levels.find((l) => l.type === type)?.label ?? "";
  const form = active ? formFor(config, levelFor(active), isOrg) : null;
  const shown = form ? visibleTo(form.fields, audience) : [];

  const groups: { name: string; fields: FormField[] }[] = [];
  for (const f of shown) {
    const name = f.group || "Other";
    const g = groups.find((x) => x.name === name);
    if (g) g.fields.push(f);
    else groups.push({ name, fields: [f] });
  }

  // Header, nav and footer come from `app/admin/layout.tsx` — this page is
  // only its own content now that it sits inside the gated admin area.
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl">Custom field forms</h1>
        <p className="mt-1 text-[14px] text-sub">
          Read-only preview of the four configuration tabs. Nothing here saves.
        </p>

        <ConfigStatus config={config} />

        {config.problems.length > 0 && <Problems problems={config.problems} />}

        {types.length === 0 ? (
          <Empty config={config} />
        ) : (
          <>
            <Controls
              types={types}
              active={active}
              isOrg={isOrg}
              audience={audience}
              config={config}
            />

            <Legend />

            <p className="mt-5 text-[13px] text-sub">
              {shown.length} field{shown.length === 1 ? "" : "s"} shown
              {form && shown.length !== form.fields.length && (
                <> · {form.fields.length - shown.length} hidden at this visibility</>
              )}
            </p>

            <div className="mt-4 space-y-8">
              {groups.map((g) => (
                <section key={g.name}>
                  <h2 className="border-b border-hair pb-2 text-[16px]">{g.name}</h2>
                  <div className="mt-4 space-y-5">
                    {g.fields.map((f) => (
                      <Field key={f.id} field={f} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
    </main>
  );
}

/* ------------------------------------------------------------- pieces -- */

function ConfigStatus({ config }: { config: LoadedFormConfig }) {
  const tone =
    config.source === "sheet"
      ? "border-accent/30 bg-accent/5"
      : "border-amber-300 bg-amber-50";
  return (
    <div className={`mt-5 rounded-lg border px-4 py-3 text-[13px] ${tone}`}>
      {config.source === "sheet" || config.source === "fixture" ? (
        <>
          {config.source === "sheet" ? "Read from the sheet" : "Read from the LOCAL SEED (no sheet configured)"}{" "}
          · <strong>{config.fields.size}</strong> fields ·{" "}
          <strong>{config.forms.size}</strong> forms ·{" "}
          <strong>{config.options.size}</strong> option sets ·{" "}
          <strong>{config.levelToType.size}</strong> membership levels mapped
        </>
      ) : config.source === "unconfigured" ? (
        <>The sheet isn’t configured, so no form configuration was loaded.</>
      ) : (
        <>Could not read the configuration: {config.error}</>
      )}
    </div>
  );
}

/**
 * The problems list is the FEEDBACK LOOP for a hand-maintained config, so it is
 * prominent rather than tucked away. A field pointing at a missing option set
 * renders as an empty dropdown and looks like our bug; said out loud, it is a
 * two-second fix in a spreadsheet.
 */
function Problems({ problems }: { problems: string[] }) {
  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-[13px] font-semibold text-amber-900">
        {problems.length} thing{problems.length === 1 ? "" : "s"} to fix in the
        configuration tabs
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-amber-900">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}

function Empty({ config }: { config: LoadedFormConfig }) {
  return (
    <div className="mt-6 rounded-xl border border-hair bg-panel px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-strong">No forms configured yet</p>
      <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-sub">
        {config.source === "sheet"
          ? "The configuration tabs were read but hold no active rows. Paste the seed data into FormTypes, Fields, FieldsbyType and FieldOptions, then reload."
          : "Configure the directory sheet, then paste the seed data into the four configuration tabs."}
      </p>
    </div>
  );
}

function Controls({
  types,
  active,
  isOrg,
  audience,
  config,
}: {
  types: string[];
  active: string;
  isOrg: boolean;
  audience: Visibility;
  config: LoadedFormConfig;
}) {
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({
      type: active,
      kind: isOrg ? "org" : "individual",
      as: audience,
      ...patch,
    });
    return `/admin/forms?${p.toString()}`;
  };
  // `config.levels`, not `levelToType` — the map's keys are lowercased for
  // matching and are not ITA's words.
  const levels = config.levels.filter((l) => l.type === active).map((l) => l.label);

  return (
    <div className="mt-6 space-y-3">
      <Row label="Form">
        {types.map((t) => (
          <Pill key={t} href={href({ type: t })} on={t === active}>
            {t}
          </Pill>
        ))}
      </Row>
      <Row label="Profile">
        <Pill href={href({ kind: "org" })} on={isOrg}>
          Organization
        </Pill>
        <Pill href={href({ kind: "individual" })} on={!isOrg}>
          Individual
        </Pill>
      </Row>
      <Row label="Seen as">
        {(["public", "members", "staff"] as const).map((a) => (
          <Pill key={a} href={href({ as: a })} on={a === audience}>
            {a}
          </Pill>
        ))}
      </Row>
      {levels.length > 0 && (
        <p className="pt-1 text-[12px] text-sub">
          Shown to members at: {levels.map((l) => l || "(no level set)").join(" · ")}
        </p>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-[68px] shrink-0 text-[12px] uppercase tracking-wide text-sub">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pill({
  href,
  on,
  children,
}: {
  href: string;
  on: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-3 py-1 text-[13px] ${
        on
          ? "border-accent bg-accent text-white"
          : "border-hair bg-panel text-fg hover:border-accent/40"
      }`}
    >
      {children}
    </Link>
  );
}

/** One field, rendered as the control a member would meet, plus its metadata. */
function Field({ field: f }: { field: FormField }) {
  return (
    <div>
      {/*
        Badges read in the CUSTOMER'S words, not the config's — `lib/forms/labels`.
        `title` carries the one-line definition, and the legend above the form
        spells them all out, because ITA reviews this page and "facet" is our
        jargon rather than theirs.
      */}
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="text-[14px] font-medium text-strong">
          {f.label}
          {f.required && <span className="ml-1 text-accent">*</span>}
        </label>
        <Badge
          tone={f.visibility === "staff" ? "warn" : "quiet"}
          title={VISIBILITY_LABELS[f.visibility].description}
        >
          {VISIBILITY_LABELS[f.visibility].label}
        </Badge>
        {f.searchMode !== "none" && (
          <Badge tone="accent" title={SEARCH_MODE_LABELS[f.searchMode].description}>
            {SEARCH_MODE_LABELS[f.searchMode].label}
          </Badge>
        )}
        <Badge tone="quiet" title={DATA_TYPE_LABELS[f.dataType].description}>
          {f.dataType === "repeat"
            ? `Up to ${f.maxRepeat} entries`
            : DATA_TYPE_LABELS[f.dataType].label}
        </Badge>
        {f.showIfField && (
          <Badge tone="quiet">
            Only if “{f.showIfField}” is {f.showIfValue || "answered"}
          </Badge>
        )}
      </div>
      {f.helpText && <p className="mt-1 text-[12px] text-sub">{f.helpText}</p>}
      <div className="mt-2">
        <Control field={f} />
      </div>
    </div>
  );
}

/** Disabled on purpose — this page never saves. */
function Control({ field: f }: { field: FormField }) {
  const box =
    "w-full max-w-xl rounded-md border border-hair bg-panel2 px-3 py-2 text-[14px] text-sub";

  switch (f.dataType) {
    case "textarea":
      return <div className={`${box} h-20`}>{f.maxLength ? `up to ${f.maxLength} characters` : ""}</div>;
    case "boolean":
      return (
        <div className="flex gap-4 text-[14px] text-sub">
          <span>◯ Yes</span>
          <span>◯ No</span>
        </div>
      );
    case "select":
    case "multiselect":
      return (
        <div className="flex max-w-xl flex-wrap gap-1.5">
          {f.options.length === 0 ? (
            <span className="text-[13px] text-amber-700">
              no options — check the OptionSet
            </span>
          ) : (
            f.options.map((o) => (
              <span
                key={o.value}
                className="rounded-sm border border-hair bg-panel2 px-2 py-1 text-[12px] text-sub"
              >
                {f.dataType === "multiselect" ? "☐ " : "◯ "}
                {o.label}
              </span>
            ))
          )}
        </div>
      );
    case "file":
      return <div className={box}>Choose a file…</div>;
    case "repeat":
      return (
        <div className="max-w-xl space-y-1.5">
          {Array.from({ length: f.maxRepeat }, (_, i) => (
            <div key={i} className={box}>
              {i + 1}.
            </div>
          ))}
        </div>
      );
    case "number":
    case "year":
      return <div className={`${box} max-w-[180px]`} />;
    default:
      return <div className={box} />;
  }
}

function Badge({
  tone,
  title,
  children,
}: {
  tone: "quiet" | "accent" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "accent"
      ? "bg-accent/10 text-accentDark"
      : tone === "warn"
        ? "bg-amber-100 text-amber-900"
        : "border border-hair text-sub";
  return (
    <span
      title={title}
      className={`rounded-sm px-1.5 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {children}
    </span>
  );
}

/**
 * What the badges mean, spelled out.
 *
 * Collapsed by default: it answers a question the reader has exactly once, and
 * an explanation permanently occupying the top of the page competes with the
 * forms it exists to explain. `<details>` rather than a tooltip because a
 * printed or shared screenshot should be able to carry the definitions, and
 * because the `title` attributes on the badges don't exist on a touchscreen.
 */
function Legend() {
  const rows: [string, Explained][] = [
    ...Object.entries(VISIBILITY_LABELS).map(
      ([, v]) => ["Who sees it", v] as [string, Explained]
    ),
    ...Object.entries(SEARCH_MODE_LABELS)
      .filter(([k]) => k !== "none")
      .map(([, v]) => ["Searching", v] as [string, Explained]),
  ];
  return (
    <details className="mt-4 rounded-lg border border-hair bg-panel px-4 py-3">
      <summary className="cursor-pointer text-[13px] font-medium text-accent">
        What do the labels next to each field mean?
      </summary>
      <dl className="mt-3 space-y-2 text-[13px]">
        {rows.map(([group, r]) => (
          <div key={r.label} className="sm:flex sm:gap-3">
            <dt className="shrink-0 font-semibold text-strong sm:w-[150px]">
              {r.label}
              <span className="ml-1 font-normal text-sub sm:hidden">({group})</span>
            </dt>
            <dd className="text-sub">{r.description}</dd>
          </div>
        ))}
        <div className="sm:flex sm:gap-3">
          <dt className="shrink-0 font-semibold text-strong sm:w-[150px]">
            Required
          </dt>
          <dd className="text-sub">
            Marked with a red asterisk — the member can’t finish without it.
          </dd>
        </div>
      </dl>
    </details>
  );
}
