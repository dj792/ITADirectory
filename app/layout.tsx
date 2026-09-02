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

export const metadata: Metadata = {
  title: "ITA Member Directory",
  description: "Search the Information Technology Alliance membership directory.",
  icons: { icon: "/ita-icon.png" },
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
