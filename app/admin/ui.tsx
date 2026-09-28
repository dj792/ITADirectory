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
export function Banner({ error, saved }: { error?: string; saved?: boolean }) {
  if (error) {
    return (
      <p
        role="alert"
        className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-900"
      >
        {error}
      </p>
    );
  }
  if (saved) {
    return (
      <p
        role="status"
        className="mt-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-[13px] text-accentDark"
      >
        Saved.
      </p>
    );
  }
  return null;
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
