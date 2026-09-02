"use client";

import { useState } from "react";
import { LOGO_ALT, LOGO_SRC } from "@/lib/brand";

/**
 * The ITA logo, with a typeset fallback.
 *
 * `public/ita-logo.png` is committed, but a checkout can still be missing it
 * (and it was, while this was built). Rather than render a broken-image icon,
 * the `onError` path swaps in a wordmark set in the brand's own typeface and
 * blue — presentable enough to demo, and obviously not the real mark, so
 * nobody ships it by accident.
 *
 * Plain <img> rather than next/image: this is a fixed-size PNG served from our
 * own domain, so the optimizer would add a request and a build dependency to
 * save nothing.
 */
export default function BrandMark({ height = 40 }: { height?: number }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className="font-sans font-bold tracking-tight text-accent"
        style={{ fontSize: height * 0.6, lineHeight: 1 }}
      >
        ITA
        <span className="ml-2 font-normal text-sub" style={{ fontSize: height * 0.3 }}>
          Information Technology Alliance
        </span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt={LOGO_ALT}
      height={height}
      style={{ height, width: "auto" }}
      onError={() => setFailed(true)}
    />
  );
}
