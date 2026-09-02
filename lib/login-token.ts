import crypto from "crypto";

/**
 * Short-lived, signed magic-link token — ported from the Aligned KPIs app. The
 * token carries only the email + an expiry, signed (HMAC-SHA256) with
 * AUTH_SECRET. Stateless, so no database adapter is needed.
 *
 * It proves the person controls the inbox; it grants NO access on its own —
 * authorization is decided against the directory sheet after verification.
 *
 * Server-only (Node crypto): never import into the edge config or a client
 * component.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

/** Create a signed token for `email`, valid for `ttlMs` (default 10 min). */
export function signLoginToken(email: string, ttlMs: number = DEFAULT_TTL_MS): string {
  const payload = { e: email.trim().toLowerCase(), x: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Verify a token. Returns the lowercased email when the signature is valid and
 * unexpired, else null. Timing-safe signature comparison.
 */
export function verifyLoginToken(token: string): string | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as {
      e?: string;
      x?: number;
    };
    if (!payload.e || !payload.x) return null;
    if (Date.now() > payload.x) return null;
    return payload.e;
  } catch {
    return null;
  }
}
