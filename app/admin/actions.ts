"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminKeyCorrect, adminToken } from "@/lib/admin-gate";

/**
 * Sign in to the admin area, and out again.
 *
 * The cookie is `httpOnly` (so page scripts can't read it), `sameSite: lax`
 * (so another site can't make an authenticated request on the visitor's
 * behalf), and `secure` outside development. It is a SESSION cookie — no
 * `maxAge` — so closing the browser ends it: this is a shared password on a
 * write surface, and the failure mode to avoid is a laptop left open in a
 * coffee shop still able to edit ITA's forms a week later.
 */
export async function signInToAdmin(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  if (!adminKeyCorrect(key)) {
    // No detail about WHY. "Wrong password" and "no password is set" are
    // different facts and neither is a stranger's business.
    redirect("/admin-login?error=1");
  }
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect("/admin");
}

export async function signOutOfAdmin() {
  const jar = await cookies();
  jar.delete(ADMIN_COOKIE);
  redirect("/admin-login");
}
