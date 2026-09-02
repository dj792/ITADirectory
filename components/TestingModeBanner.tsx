/**
 * The banner a testing session can't hide from.
 *
 * The whole risk of a login bypass is forgetting it's on — so this is loud, at
 * the very top of every page, and it names the env var to unset. It renders
 * only for sessions that actually came through the bypass, so a real member
 * never sees it.
 */
export default function TestingModeBanner() {
  return (
    <div
      role="alert"
      className="bg-[#B3261E] px-4 py-2 text-center text-[13px] font-semibold text-white"
    >
      TESTING MODE — sign-in was skipped. Unset <code className="font-mono">TESTING_MODE</code>{" "}
      before sharing this URL with members.
    </div>
  );
}
