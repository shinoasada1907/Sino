# sino-zalo

Node service that will sit between `sino-api` and Zalo for personal Zalo accounts, through the unofficial library
zca-js (F09, D-273). Only `sino-api` may call it, with a shared secret (D-282). It keeps nothing on disk: Zalo sessions
are stored encrypted by `sino-api` (D-274). The plan is `openspec/changes/zalo-personal` at the repository root.

**Status (ZL-02):** configuration, the shared-secret check, `GET /health` and the QR login. Sessions and listeners,
the message buffer and sending come in ZL-03…ZL-05. The QR login has run only against the fake gateway so far; the
first run against Zalo itself is ZL-13.

Run every command below from `apps/sino-zalo`.

## Prerequisites

- Node.js 24 or later (`engines` in `package.json`; this repository uses 26) and pnpm 11, as for `apps/sino-web`.
  The exact pnpm version is pinned in `packageManager` of `package.json`.
- Node runs the TypeScript files directly (it strips the types), so there is no build step. Only syntax Node can
  erase is allowed: no `enum`, `namespace` or constructor parameter properties (`erasableSyntaxOnly` in
  `tsconfig.json`). `pnpm typecheck` is the only type check: Node itself does not check types.
- zca-js is pinned to exactly `2.2.0` (D-283); moving to another version is a task of its own, with the tests run
  again. Its type entry `index.d.ts` re-exports a folder (`export * from "./dist"`), which `"module": "nodenext"`
  cannot resolve, so `tsconfig.json` points `paths` → `zca-js` at `dist/index.d.ts`. This affects type checking only.

## Configuration

Copy `.env.example` to `.env` (ignored by git) and fill in the secret. `pnpm dev` and `pnpm start` read `.env`.

| Variable | Default | What it is |
|---|---|---|
| `SINO_ZALO_SECRET` | none, required | Shared secret, at least 32 bytes, the same value on the `sino-api` side (ZL-06). Generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` |
| `SINO_ZALO_HOST` | `127.0.0.1` | Address to listen on. Keep it on this machine (D-282) |
| `SINO_ZALO_PORT` | `8090` | Port, a whole number from 1 to 65535 |

A missing or short secret, or a bad port, stops the service at start with exit code 1 and a line naming the variable.

## Commands

| Goal | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Run, restarting on file changes | `pnpm dev` |
| Run once | `pnpm start` |
| Lint (oxlint) | `pnpm lint` |
| Type-check | `pnpm typecheck` |
| Tests once (Vitest) | `pnpm test` |
| Tests in watch mode | `pnpm test:watch` |

## API so far

| Request | Answer |
|---|---|
| `GET /health` | `200 { "status": "UP", "sessions": { "live": 0, "ended": 0 } }`, no secret needed, counts only |
| Any other request without `Authorization: Bearer <SINO_ZALO_SECRET>` | `401 { "code": "UNAUTHORIZED", "message": "Missing or wrong secret" }` |
| `POST /logins` | `201 { "loginId", "qrImage" (PNG, base64), "expiresAt" }` once Zalo has given the QR code (it lives 100 seconds); `502 QR_UNAVAILABLE` when Zalo fails first or gives none within 15 seconds |
| `GET /logins/{loginId}` | `200 { "state" }`, `state` one of `WAITING`, `SCANNED` (with `displayName`), `DONE`, `EXPIRED`, `DECLINED`, `FAILED`. The first `DONE` answer carries `profile` (`ownId`, `displayName`, `avatarUrl`) and `session` (`cookie`, `imei`, `userAgent`); the login is then forgotten. `404 UNKNOWN_LOGIN` for a login it does not know |
| `DELETE /logins/{loginId}` | `204`, also when the login is unknown; stops the login at Zalo too |

The secret is checked for every request, also on paths no route serves yet, so a route added later is protected
without extra code. A login is kept in memory only and forgotten five minutes after it started, read or not. The whole
contract with `sino-api` is in the design of the change.

## Layout

| Path | Role |
|---|---|
| `src/server.ts` | Entry point: reads the configuration, builds the app, listens, closes on Ctrl+C or `SIGTERM` |
| `src/app.ts` | `buildApp(config, gateway)`: the Fastify app without listening, so tests call it with `app.inject` and a fake gateway |
| `src/config.ts` | `loadConfig(env)`: reads and checks the environment variables |
| `src/auth.ts` | The `onRequest` hook that checks the shared secret in constant time |
| `src/gateway/ZaloGateway.ts` | The interface for everything asked of Zalo; nothing else imports zca-js |
| `src/gateway/ZcaGateway.ts` | `ZaloGateway` over zca-js, used by `server.ts` |
| `src/gateway/FakeZaloGateway.ts` | `ZaloGateway` for tests: the test plays Zalo by calling the events of a login |
| `src/logins/LoginStore.ts` | QR logins in progress: their states, the session handed over once, forgetting old ones |
| `src/logins/routes.ts` | `POST`, `GET`, `DELETE /logins` |
| `test/` | Vitest tests, one file per part |
