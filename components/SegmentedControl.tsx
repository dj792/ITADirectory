"use client";

/**
 * A macOS-style segmented control — a pill split into fixed choices, with the
 * selected one raised on a white slab.
 *
 * NOT a `FilterSelect`. That control picks one value out of a data-driven list
 * that can run to dozens; this is a small, closed set where every option should
 * be readable without opening anything, and where the default ("Both") is a
 * real choice rather than the absence of one. Putting it in a dropdown would
 * hide "Both" behind the word "all" and make the commonest state the least
 * visible.
 *
 * Implemented as a RADIO GROUP, not buttons: it is one question with mutually
 * exclusive answers, which is what radios are, and it gets arrow-key navigation
 * and correct screen-reader announcement ("Organisations, radio button, 2 of
 * 3") for free. The native inputs stay in the DOM and are visually hidden
 * rather than replaced, so focus, labels and form semantics all still work.
 */
export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** The question, for screen readers — the options carry the visible text. */
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div
        className="inline-flex w-full rounded-lg border border-hair bg-panel2/70 p-0.5"
        role="none"
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <label
              key={o.value || "both"}
              className={[
                "relative flex-1 cursor-pointer select-none rounded-md px-3 py-2 text-center text-[13px] transition",
                // focus-within, because the real focus lands on the hidden input
                "focus-within:ring-2 focus-within:ring-accent/40",
                selected
                  ? "bg-white font-semibold text-accentDark shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                  : "font-medium text-sub hover:text-fg",
              ].join(" ")}
            >
              <input
                type="radio"
                name={label}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="sr-only"
              />
              <span className="truncate">{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
