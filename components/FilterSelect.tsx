"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * An Apple-style dropdown, replacing the browser's native <select>.
 *
 * A native select can't be styled past its border — the popup itself is drawn
 * by the OS, so on Windows and Linux it lands as a grey system list in the
 * middle of an otherwise Apple-looking page. This renders the menu ourselves:
 * rounded panel, soft shadow, blue highlight following the pointer, leading
 * checkmark on the current choice, the way a macOS pop-up button behaves.
 *
 * REPLACING A NATIVE CONTROL MEANS REBUILDING WHAT IT GAVE YOU FREE. A styled
 * div that only responds to clicks is a downgrade dressed as an upgrade, so
 * this implements the whole keyboard and screen-reader contract:
 *
 *   · Enter / Space / ↓ / ↑        open, landing on the current selection
 *   · ↑ ↓                          move · Home / End jump to the ends
 *   · Enter                        choose · Esc cancel · Tab commits and leaves
 *   · type-ahead                   "tech" jumps to Technology Partner
 *   · click outside                closes without changing anything
 *   · role=listbox / role=option, aria-activedescendant, aria-selected
 *
 * Focus always returns to the trigger on close, so keyboard users are never
 * dropped back at the top of the page.
 */
export default function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  /** Shown when nothing is chosen, e.g. "Membership level" → "Membership level: all". */
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const optionRefs = useRef<(HTMLLIElement | null)[]>([]);
  const typeAhead = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: "",
    timer: null,
  });

  const baseId = useId();
  const listId = `${baseId}-list`;

  // "" is a real choice — "show everything" — so it's the first row rather than
  // a separate Clear affordance the user has to go and find.
  const items: { value: string; label: string }[] = [
    { value: "", label: `${label}: all` },
    ...options.map((o) => ({ value: o, label: o })),
  ];

  const selectedIndex = Math.max(
    0,
    items.findIndex((i) => i.value === value)
  );

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => {
    setActiveIndex(selectedIndex);
    setOpen(true);
  }, [selectedIndex]);

  const choose = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) onChange(item.value);
      close();
    },
    // `items` is rebuilt each render; depending on its identity would reset this
    // every keystroke elsewhere on the page. The values it closes over come from
    // props, which the other deps already track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onChange, close, options, value, label]
  );

  // Close when the pointer goes anywhere else. `mousedown` rather than `click`
  // so the menu is gone before the click lands on whatever is underneath.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  // Move focus INTO the list when it opens, so the arrow keys work immediately
  // rather than after a second click. `autoFocus` is unreliable on an element
  // that is conditionally rendered, so do it explicitly.
  useEffect(() => {
    if (open) listRef.current?.focus();
  }, [open]);

  // Keep the highlighted row visible when arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu();
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, items.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(items.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        // Tab commits — matching a native select, and avoiding a menu left
        // hanging open over the page after focus has moved on.
        choose(activeIndex);
        break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          typeAheadTo(e.key);
        }
    }
  }

  /** Accumulate keystrokes for ~600ms so "tec" beats three separate "t" jumps. */
  function typeAheadTo(key: string) {
    const state = typeAhead.current;
    if (state.timer) clearTimeout(state.timer);
    state.buffer += key.toLowerCase();
    state.timer = setTimeout(() => {
      state.buffer = "";
    }, 600);

    const found = items.findIndex((i) => i.label.toLowerCase().startsWith(state.buffer));
    if (found >= 0) setActiveIndex(found);
  }

  const isPlaceholder = value === "";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onButtonKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        // Names the filter AND its current value. Without the value a screen
        // reader announces "Membership level, button" and the user has no idea
        // what it's set to; with only the value they don't know which filter
        // they're on. A native select gives both — so this has to as well.
        aria-label={`${label}: ${value || "all"}`}
        className={[
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2.5 text-left text-[14px]",
          "shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition",
          "focus:outline-none focus:ring-2 focus:ring-accent/30",
          open ? "border-accent ring-2 ring-accent/30" : "border-hair hover:border-sub/40",
        ].join(" ")}
      >
        <span className={`truncate ${isPlaceholder ? "text-sub" : "text-fg"}`}>
          {isPlaceholder ? `${label}: all` : value}
        </span>
        <ChevronUpDown />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${baseId}-opt-${activeIndex}`}
          onKeyDown={onListKeyDown}
          className={[
            "absolute z-50 mt-1.5 max-h-72 w-full overflow-auto rounded-xl border border-hair bg-white p-1",
            "shadow-[0_8px_28px_rgba(0,0,0,0.14)] focus:outline-none",
          ].join(" ")}
        >
          {items.map((item, i) => {
            const isSelected = item.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={item.value || "__all__"}
                id={`${baseId}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => choose(i)}
                className={[
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-[14px]",
                  isActive ? "bg-accent text-white" : "text-fg",
                  item.value === "" && !isActive ? "text-sub" : "",
                ].join(" ")}
              >
                <span className="w-4 shrink-0">
                  {isSelected && <Check className={isActive ? "text-white" : "text-accent"} />}
                </span>
                <span className="truncate">{item.label}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The macOS pop-up button's two-arrow marker — not a single downward chevron. */
function ChevronUpDown() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 16"
      fill="none"
      className="h-3.5 w-3 shrink-0 text-sub"
    >
      <path
        d="M3 6.5 6 3.5l3 3M3 9.5l3 3 3-3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className={`h-4 w-4 ${className}`}>
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
