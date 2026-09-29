/**
 * Checks for the upload gate — what counts as an acceptable member logo.
 * The dangerous cases are the ones that LOOK like images: an SVG, an HTML page
 * renamed .png, a truncated header. Each must be refused on its bytes.
 */
import {
  MAX_IMAGE_BYTES, checkImage, downloadUrl, safeImageUrl, uploadsAllowed,
} from "./image";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function png(w: number, h: number, pad = 0): Uint8Array {
  const b = new Uint8Array(33 + pad);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const dv = new DataView(b.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0, // APP0
    0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3,
    1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
    0xff, 0xd9,
  ]);
}
const text = (s: string) => new TextEncoder().encode(s);

console.log("image.check");

{
  const r = checkImage(png(400, 120));
  check("a PNG is accepted, as image/png", r.ok && r.kind.contentType === "image/png");
  check("its size is read from IHDR", r.ok && r.kind.width === 400 && r.kind.height === 120);
}
{
  const r = checkImage(jpeg(640, 200));
  check("a JPEG is accepted, as image/jpeg", r.ok && r.kind.contentType === "image/jpeg");
  check("its size is read from the frame header", r.ok && r.kind.width === 640 && r.kind.height === 200,
    r.ok ? `${r.kind.width}x${r.kind.height}` : r.reason);
}
check("an SVG is refused",
  !checkImage(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')).ok);
check("HTML renamed to .png is refused", !checkImage(text("<!doctype html><script>x</script>")).ok);
check("a GIF is refused", !checkImage(text("GIF89a\x01\x00\x01\x00")).ok);
check("an empty file is refused", !checkImage(new Uint8Array()).ok);
check("a PNG signature with no IHDR is refused", !checkImage(png(1, 1).slice(0, 12)).ok);
check("a JPEG that never reaches a frame is refused",
  !checkImage(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])).ok);
check("a zero-size image is refused", !checkImage(png(0, 10)).ok);
check("an absurdly large image is refused", !checkImage(png(50_000, 10)).ok);
check("a file over the byte limit is refused", !checkImage(png(10, 10, MAX_IMAGE_BYTES)).ok);

check("uploads allowed for a PUBLIC file field",
  uploadsAllowed({ dataType: "file", visibility: "public" }));
check("uploads NOT allowed for a members-only file field (the org chart)",
  !uploadsAllowed({ dataType: "file", visibility: "members" }));
check("uploads NOT allowed for a non-file field",
  !uploadsAllowed({ dataType: "text", visibility: "public" }));

check("an https URL is rendered", safeImageUrl("https://a.example/logo.png") !== null);
check("javascript: is not", safeImageUrl("javascript:alert(1)") === null);
check("data: is not", safeImageUrl("data:image/svg+xml,<svg/>") === null);
check("plain http is not", safeImageUrl("http://a.example/logo.png") === null);
check("junk is not", safeImageUrl("not a url") === null);

check("a Blob URL gets ?download=1",
  downloadUrl("https://abc.public.blob.vercel-storage.com/x.png").endsWith("?download=1"));
check("any other URL is left alone",
  downloadUrl("https://a.example/logo.png") === "https://a.example/logo.png");

if (failures) {
  console.log(`\n${failures} FAILED`);
  process.exit(1);
}
