# sino-web

Web app of Sino Messages: React 19 + TypeScript 6 on Vite 8. Plans and specs live in `openspec/` at the repository
root; the current change is `openspec/changes/fe-f01-web-foundation`.

Run every command below from `apps/sino-web`.

## Prerequisites

- Node.js 26 (the version CI uses) and pnpm 11. The exact pnpm version is pinned in `packageManager` of
  `package.json`, and CI installs that one. Node 25 and later no longer ship `corepack`, so install pnpm yourself:
  `npm install -g pnpm@11`.
- For pages that call the API: the backend running on `localhost:8080` (see `apps/sino-api/README.md`).

## Commands

| Goal | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Dev server on http://localhost:5173 | `pnpm dev` |
| Lint (oxlint) | `pnpm lint` |
| Tests once (Vitest) | `pnpm test` |
| Tests in watch mode | `pnpm test:watch` |
| Type-check and production build to `dist/` | `pnpm build` |
| Serve the production build locally | `pnpm preview` |

CI (`.github/workflows/frontend-ci.yml`) runs `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test` and
`pnpm build` on every push or pull request that touches `apps/sino-web`.

## Calling the API

The web app calls the API with relative paths (`/api/...`) on its own origin (D-36). In development the Vite dev
server forwards every path under `/api/` to `http://localhost:8080` (`server.proxy` in `vite.config.ts`), so the
browser only ever sees `localhost:5173`: the session and `XSRF-TOKEN` cookies of the backend are stored for that
address and no CORS setup is needed. The key is `/api/` with the trailing slash, so a page path such as `/apis` stays with Vite.
`pnpm preview` has no proxy.

## Layout

```text
src/
  main.tsx          creates the browser router from the route table, mounts the app, loads fonts and index.css
  app/              router.tsx (route table), providers (TanStack Query, theme), UnderConstructionPage, NotFoundPage
  app/shell/        AppShell, Sidebar (>= 1280 px), Rail (768-1279 px), TabBar (< 768 px), Topbar, navItems,
                    ShellData (shell.types.ts), its sample and useShellData
  features/overview/ Tổng quan: OverviewData (overview.types.ts), sample, useOverview, format.ts, OverviewPage, cards/
  shared/lib/       utils.ts: cn, the class-name merger every component uses
  shared/theme/     theme.ts (read, save, apply), ThemeProvider, useTheme, ThemeToggle
  shared/time/      formatAgo ("2 phút trước"), useNow
  shared/ui/        shadcn/ui components restyled to the canvas, plus Status, Avatar, SinoMark, Kbd
  test/             setup.ts (Testing Library, MSW, OS theme stub), msw/server.ts, matchMedia.ts,
                    renderApp.tsx (whole app at a path, shell data seeded)
  index.css         Tailwind, design tokens, light and dark themes
```

Imports from `src` use the `@/` alias (`@/shared/ui/button`), set in `vite.config.ts` and both `tsconfig` files.

## Screens and sample data

The web is built screen by screen with typed sample data before it calls the API (D-42, change
`openspec/changes/fe-ui-overview`); there is no sign-in yet (D-44). Every navigation path exists: a screen that is not
built yet shows "Màn … đang được dựng" inside the shell, an unknown path shows the 404 page. Each screen reads its data
through a hook (`useShellData` for the shell, `useOverview` for Tổng quan) whose type is the data contract handed to the backend; the hook returns
sample data now and will call the API later without changing the components. The contract and the table of what the
backend already has are in the change's `design.md`.

## Design tokens and themes

The web UI follows the "Sino UI" design canvas: https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB (a copy of its
screens and styles is in `design/sino-ui/project/`). The colours, fonts, radii and motion timings come from its
`sino.css`.
`index.css` copies the canvas variables as they are (`--bg`, `--surface`, `--text`, `--inverse`...) under `:root`
(light) and `.theme-dark`, then maps them to Tailwind names in `@theme inline`:

| Tailwind class | Canvas variable |
|---|---|
| `bg-background`, `text-foreground` | `--bg`, `--text` |
| `bg-surface`, `bg-raised`, `bg-hover` | `--surface`, `--raised`, `--hover` |
| `border-border`, `border-border-strong` | `--border`, `--border-strong` |
| `text-muted-foreground`, `text-subtle-foreground` | `--text-muted`, `--text-subtle` |
| `bg-primary`, `text-primary-foreground`, `bg-primary-hover` | `--inverse`, `--on-inverse`, `--inverse-hover` |
| `bg-danger`, `text-danger-ink` (also `success`, `warning`) | `--danger`, `--danger-ink` |
| `rounded-xs` / `-sm` / `-md` / `-lg` | 6 / 10 / 14 / 20 px (`--r-xs` ... `--r-lg`); `rounded-xl` is 12 px (menus) |
| `shadow-popover` | `--shadow-pop` |

The shadcn names (`card`, `popover`, `secondary`, `muted`, `accent`, `destructive`, `input`) point at the same
variables, so newly added shadcn components pick up the canvas colours.

`ThemeProvider` puts `theme-light` or `theme-dark` on `<html>`. On a first visit it follows the OS
(`prefers-color-scheme`); after the user switches, the choice is kept in `localStorage` under `sino.theme`. When
the browser blocks storage the app still works and only forgets the choice on reload. Fonts (Inter, JetBrains Mono)
are bundled from `@fontsource-variable/*` instead of Google Fonts, so no request leaves for a third party.

## shadcn/ui

Components are copied into `src/shared/ui` (they are our code, not a dependency) and restyled to the canvas rules
(`.btn`, `.input`, `.field-label`, `.toggle`, `.menu`). To add one: `pnpm dlx shadcn@latest add <name>`, then restyle
it the same way. Two things differ from a project made with `shadcn init`:

- The generated code imports `cn` from the `cn` package (shadcn's class-name merger). Change that import to
  `@/shared/lib/utils`: the wrapper there tells the merger about our own theme names (without it
  `cn('shadow-popover', 'shadow-none')` keeps both classes). `pnpm lint` fails on a direct `cn` import
  (`no-restricted-imports` in `.oxlintrc.json`). A new custom theme name that is not a colour (a shadow, a font
  size...) must be added to that wrapper too.
- The short variants `data-open:`, `data-closed:`, `data-checked:`, `data-unchecked:` are defined at the top of
  `index.css` (copied from `shadcn/tailwind.css`) instead of installing the whole shadcn CLI. A new component that
  uses another one (for example `data-active:`) needs it copied the same way.

## Tests

Vitest runs in jsdom with Testing Library. `src/test/setup.ts`:

- starts an MSW server; a test adds the responses it needs with `server.use(http.get('/api/...', ...))`. A request
  without a handler gets a network error and the test fails afterwards with `Requests without an MSW handler`,
  even when the code under test catches the error, so no test reaches a real network or passes by accident;
- stands in for `window.matchMedia` (jsdom has none) with "no dark-mode preference"; a test changes it with
  `stubOsColorScheme('dark')` from `@/test/matchMedia`.

MSW stays on 2.x because Vitest 5 expects `msw ^2` (MSW 3 came out on 2026-09-28). Its install script is turned off in `pnpm-workspace.yaml` (`allowBuilds: msw: false`): it only copies
the browser service worker, which these tests do not use, and pnpm 11 fails the install when a build script is
neither allowed nor denied.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ERR_PNPM_IGNORED_BUILDS` on install | A new dependency has an install script. Decide with `pnpm approve-builds <pkg>` or `pnpm approve-builds '!<pkg>'`; the choice is saved in `pnpm-workspace.yaml`. |
| `/api/...` returns `502` with an empty body; the Vite log says `http proxy error ... ECONNREFUSED` | The backend is not running on `localhost:8080`. |
| A Tailwind class from a shadcn component has no effect | It may use a custom variant not yet defined in `index.css` (see shadcn/ui above). |
