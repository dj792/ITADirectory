import { NextResponse } from "next/server";
import { findMemberByEmail } from "@/lib/access";
import { signLoginToken } from "@/lib/login-token";
import { sendMagicLink } from "@/lib/mail";

/**
 * Start passwordless sign-in.
 *
 * SECURITY — this route must never reveal whether an email is in the directory.
 * It ALWAYS responds `{ ok: true }` ("check your email"), and a working link is
 * only actually sent to an address that passes the allowlist. Anything else and
 * the sender learns nothing: an enumeration oracle here would turn the sign-in
 * box into a membership-list export.
 *
 * Node route (crypto + Sheets + mailer); never runs on the edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // A fresh response per call — a shared NextResponse can only be consumed once.
  const neutral = () => NextResponse.json({ ok: true });

  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = (body.email ?? "").trim().toLowerCase();
  } catch {
    return neutral(); // malformed body — stay neutral
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return neutral();

  try {
    const identity = await findMemberByEmail(email);
    if (identity) {
      const token = signLoginToken(identity.email);
      const base = (process.env.APP_URL ?? new URL(req.url).origin).replace(/\/$/, "");
      await sendMagicLink(
        identity.email,
        `${base}/signin/verify?token=${encodeURIComponent(token)}`
      );
    }
  } catch (err) {
    // Never leak internal errors to the client; log server-side only.
    console.error("request-link error:", err);
  }

  return neutral();
}
