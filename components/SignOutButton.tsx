import { signOut } from "@/auth";

/**
 * Sign out via a server action rather than a client fetch — no client bundle,
 * and it works with JavaScript disabled.
 */
export default function SignOutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/signin" });
      }}
    >
      <button
        type="submit"
        className="rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sub transition hover:bg-panel2 hover:text-fg"
      >
        Sign out
      </button>
    </form>
  );
}
