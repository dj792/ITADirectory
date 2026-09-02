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
| `npm run check`    | Fixture assertions against the real member export   |
| `npm run typecheck`| `tsc --noEmit`                                      |
| `npm run build`    | Production build                                    |

## Deploying

Run `DeployITADirectory.command` (double-click it in Finder). It commits,
pushes to `dj792/ITADirectory`, and Vercel builds from there.
