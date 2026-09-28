"use client";

import { useFormStatus } from "react-dom";

/**
 * A submit button that says something while the request is in flight.
 *
 * THE ONLY CLIENT COMPONENT IN THE ADMIN AREA, and it earns that: every admin
 * action writes to Google Sheets, which takes a second or two — long enough
 * that a button with no reaction reads as a button that didn't work, so people
 * press it again. `useFormStatus` reports the pending state of the form this
 * sits inside, with no state of our own to keep in step.
 *
 * It also DISABLES itself while pending, which is the part that matters for a
 * write surface: a double-click on "Create field" would otherwise send two
 * appends and put the same field in the sheet twice.
 *
 * Everything else in /admin stays a plain server-rendered form, so the whole
 * area still works with scripting off — it just loses the spinner.
 */

type Variant = "primary" | "secondary" | "ghost" | "icon";

const STYLES: Record<Variant, string> = {
  primary:
    "rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white " +
    "hover:bg-accentDark disabled:opacity-60",
  secondary:
    "rounded-md border border-hair bg-panel px-3 py-1.5 text-[13px] " +
    "hover:border-accent hover:text-accent disabled:opacity-50",
  ghost: "text-[13px] text-sub hover:text-amber-700 disabled:opacity-40",
  icon:
    "flex h-6 w-6 items-center justify-center rounded border border-hair " +
    "text-[11px] text-sub enabled:hover:border-accent enabled:hover:text-accent " +
    "disabled:opacity-30",
};

export default function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  disabled,
  title,
  ariaLabel,
}: {
  children: React.ReactNode;
  /** Shown in place of the label while saving. Omit on icon buttons. */
  pendingLabel?: string;
  variant?: Variant;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending || undefined}
      className={STYLES[variant]}
    >
      {pending && pendingLabel ? (
        <span className="inline-flex items-center gap-1.5">
          <Spinner />
          {pendingLabel}
        </span>
      ) : pending && variant === "icon" ? (
        <Spinner />
      ) : (
        children
      )}
    </button>
  );
}

/** CSS-only, so it costs no JavaScript beyond the component itself. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-[-1px]"
    />
  );
}
