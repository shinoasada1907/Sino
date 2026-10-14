# sino-site

Public static site of the Sino family: the brand page, the Sino Messages home page (the App home page given to Google
for OAuth verification) and the privacy policy. React 19 + TypeScript 6 on Vite 8 with Tailwind 4, like
`apps/sino-web`; every page is prerendered to static HTML at build time and hydrated in the browser (D-250), so it
reads without JavaScript. The plan is `openspec/changes/site-public-pages` at the repository root.

Run every command below from `apps/sino-site`.

## Prerequisites

- Node.js 26 and pnpm 11, as for `apps/sino-web`. The exact pnpm version is pinned in `packageManager` of
  `package.json`. The build scripts are TypeScript files run straight by `node`.
- No backend: the site has no API calls.

## Commands

| Goal | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Dev server (Vite prints the address: 5173, or the next free port when `sino-web` is running) | `pnpm dev` |
| Preview build to `dist/`, missing owner details allowed | `pnpm build:preview` |
| Production build to `dist/`, stops while an owner detail is missing or badly written | `pnpm build` |
| Serve `dist/` on http://localhost:4321 the way a static host does (404.html for unknown paths) | `pnpm serve` |
| Lint (oxlint) | `pnpm lint` |
| Type-check | `pnpm typecheck` |
| Tests once (Vitest) | `pnpm test` |
| Tests in watch mode | `pnpm test:watch` |

`pnpm build` and `pnpm serve` take options: `pnpm build --out <dir> --config <file>`, `pnpm serve --port <n> --dir <dir>`.

## Owner details: `site.config.ts`

The pages need details the code cannot guess (D-242). Each one starts as `null`.

| Field | What it is |
|---|---|
| `siteUrl` | `https://<domain>` of this site, no `/` at the end |
| `appUrl` | Where the Sino app runs; "Đăng nhập" opens `appUrl` + `/login`. Same format as `siteUrl` |
| `contactEmail` | Contact address, also for requests to delete data |
| `owner` | The person or company the privacy policy is in the name of |
| `effectiveDate` | When the policy takes effect, `YYYY-MM-DD` |
| `hosting` | The server provider and where the data is kept, as the privacy policy names them |

While a field is missing, `pnpm dev` and `pnpm build:preview` show `[chưa điền: …]` in its place. Every page of a
preview build carries `noindex`. `pnpm build` lists what is missing or badly written and exits with an error.

## Pages

| URL | File in `dist/` | Content |
|---|---|---|
| `/` | `index.html` | Brand page of the Sino family |
| `/messages` | `messages/index.html` | Sino Messages home page |
| `/privacy` | `privacy/index.html` | Privacy policy, Vietnamese |
| `/en/privacy` | `en/privacy/index.html` | Privacy policy, English |
| any other path | `404.html` | Not found, `noindex` |

The table of pages is `PAGES` in `src/site/pages.ts`. Terms, security and open-source pages are planned in the change
(SI-04, SI-05).

## Layout

| Folder | Content |
|---|---|
| `scripts/` | `build.ts` (client and server bundles, then one prerendered HTML file per page), `serve.ts`, `static-files.ts` |
| `src/entry-client.tsx`, `src/entry-server.tsx` | Hydration in the browser; rendering a page to HTML at build time |
| `src/site/` | Owner details and their checks (`config.ts`), the table of pages, the document `<head>` |
| `src/layout/` | Page frame, top bar, footer |
| `src/pages/` | `brand/`, `messages/`, `privacy/`, `NotFoundPage.tsx` |
| `src/shared/` | UI pieces taken from `sino-web` (`ui/`), motion components from React Bits (`motion/`) |
| `test/` | Builds run through the real CLI (`cli.test.ts`), the static file server |

## Tests

Vitest with jsdom. `test/cli.test.ts` runs real Vite builds in a child process, so `pnpm test` takes a while. No CI
workflow covers this folder yet.

## Putting the site online

Not written yet. Task SI-06 of the change adds it once the host is chosen: Cloudflare Pages or GitHub Pages, the
domain, Search Console, URLs that do not redirect (D-248) and which URL goes in which field of the Google OAuth
consent screen (D-253).
