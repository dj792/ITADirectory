import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

/**
 * Montserrat is ITA's only typeface (italliance.com uses it for body AND
 * headings). Loaded through next/font so it's self-hosted from our own domain:
 * no request to Google on the member's behalf, and no flash of fallback text.
 * The weights are the ones the site actually uses — 400 body, 500/600 for
 * emphasis, 700 for the few bold marks.
 */
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

/**
 * Icons are generated from ITA's own logo by `scripts/make-icons.py` — run that
 * rather than editing the PNGs, and read its header for why the artwork differs
 * between sizes (short version: "ita" alone at 16px reads as "itc").
 *
 * `favicon.ico` is listed FIRST and carries seven sizes. Browsers pick from it
 * by size, and it is also what anything asking for `/favicon.ico` by convention
 * gets — including link previews and feed readers that never look at the HTML.
 */
export const metadata: Metadata = {
  title: "ITA Member Directory",
  description: "Search the Information Technology Alliance membership directory.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport = { themeColor: BRAND.blue };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={montserrat.variable}>
      <body className="bg-ink font-sans text-fg">{children}</body>
    </html>
  );
}
