/**
 * Small form pieces shared by the admin screens.
 *
 * Plain server components with no client JavaScript: every admin interaction is
 * a form POST to a server action, so the whole area works with scripting off,
 * on a phone, and by keyboard — and there is no client bundle to keep in step
 * with the server's idea of the data.
 */

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-xl border border-hair bg-panel p-4">
      <h2 className="text-[16px]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * The result of the last action.
 *
 * An error is shown VERBATIM, because every message the write layer produces is
 * written for the person who caused it ("a field with id X already exists",
 * "share the sheet as an EDITOR") and paraphrasing it here would lose the one
 * part that says what to do next.
 */
export function Banner({ error, saved }: { error?: string; saved?: string }) {
  if (!error && !saved) {
    // The anchor still has to EXIST when there's no message, or the `#admin-banner`
    // on a redirect scrolls nowhere and the page lands at the top looking
    // unchanged — which is the complaint that prompted all of this.
    return <span id="admin-banner" className="block scroll-mt-24" />;
  }

  const ok = !error;
  return (
    <div
      id="admin-banner"
      role={ok ? "status" : "alert"}
      className={`mt-4 flex items-start gap-3 rounded-lg border-l-4 px-4 py-3 scroll-mt-24 ${
        ok
          ? "border-l-accent border-y border-r border-y-accent/20 border-r-accent/20 bg-accent/5"
          : "border-l-red-500 border-y border-r border-y-red-200 border-r-red-200 bg-red-50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white ${
          ok ? "bg-accent" : "bg-red-500"
        }`}
      >
        {ok ? "✓" : "!"}
      </span>
      <div className="min-w-0">
        <p
          className={`text-[14px] font-semibold ${
            ok ? "text-accentDark" : "text-red-900"
          }`}
        >
          {ok ? "Saved" : "That didn’t save"}
        </p>
        {/*
          The detail is shown VERBATIM. Every message the write layer produces is
          written for the person who caused it ("a field with id X already
          exists", "share the sheet as an EDITOR"), and paraphrasing here would
          drop the part that says what to do next.
        */}
        <p className={`text-[13px] ${ok ? "text-fg" : "text-red-900"}`}>
          {ok ? saved : error}
        </p>
      </div>
    </div>
  );
}

export function TextInput({
  name,
  label,
  defaultValue,
  required,
  help,
  list,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
  help?: string;
  list?: string;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] uppercase tracking-wide text-sub">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </label>
      <input
        id={id}
        name={name}
        list={list}
        required={required}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-hair bg-white px-3 py-1.5 text-[14px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {help && <p className="mt-1 text-[12px] text-sub">{help}</p>}
    </div>
  );
}

export function Select({
  name,
  label,
  defaultValue,
  options,
  help,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  options: [string, string][];
  help?: string;
}) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[12px] uppercase tracking-wide text-sub">
        {label}
      </label>
      {/*
        A NATIVE <select> here, deliberately, even though the member-facing
        search uses a custom listbox. The directory's dropdowns are on a page
        members judge by how it looks; this is a tool for a handful of staff,
        where the native control is the one their browser and screen reader
        already agree about — and it costs no client JavaScript.
      */}
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="mt-1 w-full rounded-md border border-hair bg-white px-3 py-1.5 text-[14px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {help && <p className="mt-1 text-[12px] text-sub">{help}</p>}
    </div>
  );
}
