/**
 * ITA brand constants, read off italliance.com.
 *
 * Kept in one module rather than sprinkled through components so a brand
 * refresh is one file. The colors are also declared as CSS variables in
 * globals.css (that's what Tailwind's utilities compile against); these
 * exports are for the places CSS can't reach — inline SVG, email HTML, the
 * theme-color meta tag.
 */

export const BRAND = {
  /** Primary blue — headings, links, buttons. rgb(1,118,189) on italliance.com. */
  blue: "#0176BD",
  /** Deep blue — hover states and the footer band. */
  blueDark: "#014670",
  /** Body text. Not pure black; the site runs rgb(50,50,50). */
  ink: "#323232",
  /** Near-black used for high-contrast headings. */
  inkStrong: "#202020",
  /** Warm off-white page ground. */
  paper: "#F7F7F3",
  white: "#FFFFFF",
  /** Hairline borders — not on the marketing site, derived to suit these cards. */
  hair: "#E1E4E8",
  /** Muted secondary text. */
  muted: "#6B6B6B",
} as const;

/**
 * The logo lives in public/ and IS committed — this is ITA's own directory, so
 * the mark ships with it (a gitignored logo would build fine locally and then
 * render the fallback in production, which is the worst of both).
 *
 * `BrandMark` still falls back to a typeset wordmark if the file is missing, so
 * a fresh checkout that hasn't got the asset yet degrades to something
 * presentable and obviously-not-final rather than a broken-image icon.
 */
export const LOGO_SRC = "/ita-logo.png";
export const LOGO_ALT = "Information Technology Alliance";

/** Montserrat is the site's only typeface, at every weight it uses. */
export const FONT_STACK =
  "var(--font-montserrat), Montserrat, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
