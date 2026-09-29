import { put } from "@vercel/blob";
import type { ImageKind } from "./image";

/**
 * Where uploaded member files live: Vercel Blob, a PUBLIC store.
 *
 * One env var — BLOB_READ_WRITE_TOKEN — which Vercel sets for you when a Blob
 * store is connected to the project (Storage → Create → Blob → Public). Unset,
 * the form keeps showing its "not switched on" note instead of a file picker,
 * so nothing is ever picked and silently dropped.
 *
 * The URL `put` returns is what goes into ProfileFieldValues as the field's
 * value — the reconcile already stores strings, so no schema change.
 *
 * ── NOTHING IS DELETED FROM THE STORE ─────────────────────────────────────
 *
 * Replacing or removing a logo changes the sheet row; the old file stays in
 * Blob. Same rule as the sheet (a row is never deleted): it keeps history, and
 * a stale URL someone already downloaded from keeps working. ~200 orgs with a
 * logo each changing yearly is kilobytes a year — not worth a cleanup job.
 */
export function blobConfigured(): boolean {
  return (process.env.BLOB_READ_WRITE_TOKEN ?? "").trim().length > 0;
}

export async function storeMemberImage(
  profileId: string,
  fieldId: string,
  bytes: Uint8Array,
  kind: ImageKind
): Promise<string> {
  const token = (process.env.BLOB_READ_WRITE_TOKEN ?? "").trim();
  if (!token) throw new Error("File uploads aren’t switched on (BLOB_READ_WRITE_TOKEN is not set).");
  const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
  const { url } = await put(
    `member-files/${safe(profileId)}/${safe(fieldId)}.${kind.ext}`,
    Buffer.from(bytes),
    {
      access: "public",
      // The type we DECODED, never the one the browser declared.
      contentType: kind.contentType,
      // A new URL per upload, so a replaced logo is never served from a cache
      // under the old one's address.
      addRandomSuffix: true,
      token,
    }
  );
  return url;
}
