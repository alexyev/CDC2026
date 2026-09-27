# Schoolscape site

The Schoolscape app: Vite, React, MapLibre, and deck.gl, plus one Vercel function (`api/command.ts`).
[SPEC.md](../SPEC.md) is the build specification; the repo [README](../README.md) covers local development and the data pipeline.

## Deploy

Schoolscape is hosted on Vercel (Hobby plan) as the project `schoolscape` in the `alexander-yevchenkos-projects` scope.
The site is static apart from `/api/command`, so there is no server to run and no database.

### Project settings

The build settings live in [`vercel.json`](vercel.json), so the dashboard needs no overrides:

| Setting          | Value                                                 |
| ---------------- | ----------------------------------------------------- |
| Framework preset | Vite                                                  |
| Install command  | `npm ci`                                              |
| Build command    | `npm run build` (type check, then `vite build`)       |
| Output directory | `dist`                                                |
| Function         | `api/command.ts`, Node.js runtime, `maxDuration` 15 s |
| Node.js          | 22 or newer (`engines` in `package.json`)             |

CLI deploys run from `site/`, so the project's Root Directory setting stays empty.
If the GitHub repository is connected to the project later, set Root Directory to `site` in the dashboard at the same time.
[`.vercelignore`](.vercelignore) keeps local `node_modules`, `dist`, and test output out of CLI uploads; Vercel installs and builds from source.

### Environment variables

| Name                | Where                                | Required | Purpose                                                                       |
| ------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`  | Production, Preview, and Development | no       | TypeSafe API key for Jev, the first engine behind `/api/command` (SPEC 14.6). |
| `JEV_MODEL`         | Production and Preview               | no       | Overrides the pinned Jev version, `jev-1.13.0`.                               |
| `ANTHROPIC_API_KEY` | Production and Preview               | no       | Claude API key for `/api/command`, used when Jev is unset or fails.           |
| `COMMAND_MODEL`     | Production and Preview               | no       | Overrides the default Claude model, `claude-haiku-4-5`.                       |

All are server-side only; never prefix them with `VITE_`, which would ship them in the browser bundle.
The function tries Jev, then Claude, skipping an engine whose key is unset and moving on after any error or timeout.
Without either key the site still works: `/api/command` answers `503 {"ok":false,"error":"not_configured"}` and the command bar falls back to its local parser.
Set them with `vercel env add TYPESAFE_API_KEY production` (and `preview`), then redeploy, because environment variables apply only to new deployments.
For `npx vercel dev`, copy [`.env.example`](.env.example) to `.env.local` (gitignored), or run `vercel env pull .env.local`.

### Commands

Run these from `site/` after `vercel login`:

```sh
vercel link --yes --project schoolscape --scope alexander-yevchenkos-projects   # once per checkout; writes .vercel/ (gitignored)
vercel deploy                                                                    # preview deployment
vercel deploy --prod                                                             # production deployment
npx vercel dev                                                                   # Vite plus /api/command locally
```

The first deployment of a new Vercel project is promoted to production automatically, even without `--prod`; every later `vercel deploy` is a preview.

### Custom domain

The public URL will be `schoolscape.<personal-site-domain>`.
Add the domain under the project's Domains settings, then create a `CNAME` record for `schoolscape` pointing at `cname.vercel-dns.com` at the DNS provider.
Until then production is reachable at the project's `vercel.app` alias.

### Analytics

Vercel Web Analytics counts visits: anonymous and cookieless, page views only, with no custom events.
`src/main.tsx` mounts `<Analytics />` from `@vercel/analytics/react`, and only in Vercel builds (`__VERCEL_ANALYTICS__` in `vite.config.ts`), so dev, Vitest, and the Playwright suite never load the script.
The component gets a fixed `route="/"` and `path="/"`.
That turns off the script's history tracking, which would otherwise count every pan, zoom, or selection as a new page because the app writes its view state into the query string with `history.replaceState` and `history.pushState`.
The result is one page view per visit, recorded as `/` with no query string, so shared view links are not recorded either.
To check a deployment, load it and confirm the request for `/_vercel/insights/script.js` returns 200.

## Caching

| Path        | `Cache-Control`                       | Why                                                                 |
| ----------- | ------------------------------------- | ------------------------------------------------------------------- |
| `/data/*`   | `public, max-age=31536000, immutable` | Pipeline outputs are versioned by directory (`/data/v1/`).          |
| `/assets/*` | `public, max-age=31536000, immutable` | Vite fingerprints every file name.                                  |
| `/`         | `public, max-age=0, must-revalidate`  | `index.html` must always point at the current fingerprinted assets. |

Every path also gets `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`.
Browsers keep `/data/v1/` files for a year without revalidating, so a data change must bump the directory to `v2` in both `analysis/schoolscape/config.py` and `src/data/paths.ts` (SPEC.md section 8.2).
Overwriting a file under an existing version directory leaves returning visitors on the old copy.
Each Vercel deployment starts with a fresh CDN cache, so a new deploy never serves another deployment's data.

### Compression

Vercel compresses `.json` under `public/` automatically, choosing Brotli when the browser offers `br` and gzip otherwise.
This was verified on a preview deployment on 2026-09-26, so the `.json.gz` fallback in SPEC.md section 10.2 is not needed.
Measured then: `schools/all.json` is 1.47 MB over the wire with gzip.

### Verifying a deployment

Preview deployments sit behind Vercel Authentication, so plain `curl` gets a 302 to the Vercel login.
`vercel curl` adds the protection bypass automatically:

```sh
P=https://<deployment>.vercel.app
vercel curl /data/v1/states.json --deployment $P -- -sI -H 'Accept-Encoding: br, gzip'
# expect: cache-control: public, max-age=31536000, immutable
#         content-encoding: br
vercel curl / --deployment $P -- -sI
# expect: cache-control: public, max-age=0, must-revalidate
vercel curl /api/command --deployment $P -- -s -o /dev/null -w '%{http_code}\n'
# expect: 405 (the function accepts POST only)
```

Production deployments are public, so plain `curl -sI` works there.
