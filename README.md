# ITA Member Directory

A searchable directory of ITA members, built by 1 to 100 Advisors.

Next.js (App Router) reading a Google Sheet through a service account, with
passwordless email sign-in. Deployed on Vercel. A standalone project — it shares
its tech stack with the Aligned KPIs app and nothing else.

## Brand assets

`public/ita-logo.png` — the ITA logo (390×87), in place and committed.

One still missing: the favicon. Save
https://www.italliance.com/wp-content/uploads/2024/12/cropped-ita-icon-270x270.png
as `public/ita-icon.png` (`app/layout.tsx` already points at it). Until then the
browser tab shows the default icon.

`Assets/` holds the originals as downloaded; `public/` holds what the app
serves. `components/BrandMark.tsx` falls back to a typeset "ITA" wordmark if
`ita-logo.png` is ever missing, so a checkout without it still renders.

## Running it locally

```bash
npm install
cp .env.local.example .env.local   # then fill in AUTH_SECRET at minimum
npm run dev
```

With no Google credentials configured the app reads the local CSV fixture in
`data/`, and sign-in links are printed to the terminal instead of emailed — so
the whole thing runs with nothing but `AUTH_SECRET` and `AUTH_TRUST_HOST=true`.

## Commands

| Command            | What it does                                        |
| ------------------ | --------------------------------------------------- |
| `npm run dev`      | Local dev server on :3000                           |
| `npm run check`    | Fixture + column-order assertions against the real export |
| `npm run typecheck`| `tsc --noEmit`                                      |
| `npm run build`    | Production build                                    |

## Testing mode — currently ON by default

**The search page is the site root: `/`.** While testing mode is on, go straight
there — middleware lets everyone through before NextAuth is consulted, so the
directory works even with no auth configured at all. The sign-in page also has a
red **TESTING MODE ON** button, but you don't need it.

⚠️ **It is on unless you turn it off.** Anyone with the URL can read every
member's name and email address. Fine while testing; not fine once the link is
shared.

To turn it off: set `TESTING_MODE=0` (or `false` / `off` / `no`) in Vercel —
effective on the next request, no redeploy. At launch, also flip
`TESTING_MODE_DEFAULT` to `false` in `lib/testing-mode.ts` so unset means off.
Sign out afterwards: sessions created through the bypass survive until then,
showing a red banner meanwhile.

The deploy script warns about this on every deploy while the default stands.

## Adding columns to the source sheet

Safe to do at any time. Every column is resolved by header NAME, so columns can
be added, removed or reordered without touching the app — unknown columns are
simply ignored. `npm run check` proves it: it reparses the data with the columns
reversed, shuffled, and with new ones inserted at the front, and requires
identical output. See CLAUDE.md → "THE RULE" for how to surface a new field once
you've added it.

## Deploying

Run `DeployITADirectory.command` (double-click it in Finder). It commits,
pushes to `dj792/ITADirectory`, and Vercel builds from there.
