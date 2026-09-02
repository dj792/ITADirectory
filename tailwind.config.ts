import type { Config } from "tailwindcss";

/**
 * Colors are CSS variables holding RGB channel triplets (defined in
 * globals.css), so `rgb(var(--x) / <alpha-value>)` keeps Tailwind's /opacity
 * modifiers working. Values come from italliance.com — see lib/brand.ts.
 *
 * No `darkMode` here on purpose: the ITA site has no dark palette, and
 * inventing one would put unapproved brand colors in front of members.
 */
const withVar = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: withVar("--c-bg"), // page background
        panel: withVar("--c-panel"), // card surface
        panel2: withVar("--c-panel2"), // secondary surface
        hair: withVar("--c-hair"), // hairline borders
        sub: withVar("--c-sub"), // muted text
        fg: withVar("--c-fg"), // body text
        strong: withVar("--c-strong"), // high-contrast headings
        accent: withVar("--c-accent"), // ITA blue #0176BD
        accentDark: withVar("--c-accent-dark"), // #014670
      },
      fontFamily: {
        // next/font injects --font-montserrat; the rest is the fallback chain
        // for the moment before the webfont lands.
        sans: [
          "var(--font-montserrat)",
          "Montserrat",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
