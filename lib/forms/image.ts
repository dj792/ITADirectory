import type { FormField } from "./types";

/**
 * Member-uploaded images — what we accept, decided by READING THE BYTES.
 *
 * Pure (no storage, no network) so it can be checked exhaustively in
 * `image.check.ts`. The storage half lives in `blob.ts`.
 *
 * ── WHY SNIFF, NOT TRUST ──────────────────────────────────────────────────
 *
 * A filename's extension and the browser's declared content type are both just
 * claims the uploader makes. The file is accepted only if its own header
 * decodes as a PNG or a JPEG with sane dimensions, and the content type we
 * store it under comes from that decode — never from the request. That is what
 * keeps an HTML or SVG document from being served back as a "logo".
 *
 * ── WHY NO SVG ────────────────────────────────────────────────────────────
 *
 * Decided 28 Sep 2026: an SVG is a document that can carry <script>, so
 * accepting member-supplied SVG and serving it back is a stored-XSS surface.
 * See CLAUDE.md → "Uploads". Don't add it back without reading that.
 */

/** 2 MB. A logo is tens of KB; this is generous and keeps well under Vercel's
 *  4.5 MB request cap once the rest of the form rides along. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Beyond this on either side it is a photo or a bomb, not a logo. */
export const MAX_IMAGE_DIMENSION = 10_000;

export const ACCEPT_ATTR = "image/png,image/jpeg";
export const ACCEPT_HINT = "PNG or JPG, up to 2 MB";

export type ImageKind = {
  ext: "png" | "jpg";
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
};

export type ImageCheck =
  | { ok: true; kind: ImageKind }
  | { ok: false; reason: string };

/**
 * WHICH FILE FIELDS MAY UPLOAD AT ALL: public ones only.
 *
 * Uploaded files are stored at public links (Vercel Blob, public store), so a
 * field whose answers are meant for members or staff must not upload into it —
 * the link would be readable by anyone who got hold of it. Today that admits
 * `logo` and keeps `it_org_chart` (members-only) switched off, which is also
 * what ITA asked for: their answer on 29 Sep covered logos, and the org chart
 * still needs its own decision.
 */
export function uploadsAllowed(field: Pick<FormField, "dataType" | "visibility">): boolean {
  return field.dataType === "file" && field.visibility === "public";
}

export function checkImage(bytes: Uint8Array): ImageCheck {
  if (bytes.length === 0) return { ok: false, reason: "The file is empty." };
  if (bytes.length > MAX_IMAGE_BYTES) {
    const mb = (bytes.length / 1024 / 1024).toFixed(1);
    return { ok: false, reason: `The file is ${mb} MB — the limit is 2 MB.` };
  }
  const kind = sniffPng(bytes) ?? sniffJpeg(bytes);
  if (!kind) {
    return {
      ok: false,
      reason: "That file isn’t a PNG or JPG image. (SVG, GIF, WebP and PDF aren’t accepted.)",
    };
  }
  if (
    kind.width < 1 || kind.height < 1 ||
    kind.width > MAX_IMAGE_DIMENSION || kind.height > MAX_IMAGE_DIMENSION
  ) {
    return {
      ok: false,
      reason: `The image is ${kind.width}×${kind.height} pixels — it needs to be between 1 and ${MAX_IMAGE_DIMENSION} on each side.`,
    };
  }
  return { ok: true, kind };
}

/* -------------------------------------------------------------- PNG -- */

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Signature, then the mandatory IHDR chunk first, which carries the size. */
function sniffPng(b: Uint8Array): ImageKind | null {
  if (b.length < 24) return null;
  for (let i = 0; i < PNG_SIG.length; i++) if (b[i] !== PNG_SIG[i]) return null;
  // bytes 12..15 are the first chunk's type and must be "IHDR".
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) return null;
  return {
    ext: "png",
    contentType: "image/png",
    width: u32(b, 16),
    height: u32(b, 20),
  };
}

/* ------------------------------------------------------------- JPEG -- */

/**
 * Walk the marker segments to the first start-of-frame, which carries the
 * size. A file that starts FF D8 FF but never reaches a frame header is not an
 * image we can show, however it is named.
 */
function sniffJpeg(b: Uint8Array): ImageKind | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    // Fill bytes: any number of 0xFF may pad before a marker.
    while (b[i] === 0xff && i + 1 < b.length && b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    i += 2;
    // Standalone markers carry no length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS before any frame
    if (i + 1 >= b.length) return null;
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2) return null;
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 6 >= b.length) return null;
      return {
        ext: "jpg",
        contentType: "image/jpeg",
        height: (b[i + 3] << 8) | b[i + 4],
        width: (b[i + 5] << 8) | b[i + 6],
      };
    }
    i += len;
  }
  return null;
}

function u32(b: Uint8Array, at: number): number {
  return ((b[at] << 24) >>> 0) + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
}

/**
 * A stored value is only rendered as an image if it is an https URL. Values
 * live in a sheet ITA can edit by hand, so this is the line that stops a
 * `javascript:` or `data:` string from reaching an <img> or <a href>. Pasting a
 * logo's https URL from the member's own site into the sheet still works.
 */
export function safeImageUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Vercel Blob serves a download (Content-Disposition: attachment) with ?download=1. */
export function downloadUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith(".blob.vercel-storage.com")) {
      u.searchParams.set("download", "1");
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return url;
}
