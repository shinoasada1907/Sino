# sino-zalo

Node service that sits between `sino-api` and Zalo for personal Zalo accounts, through the unofficial library
zca-js (F09, D-273). Only `sino-api` may call it, with a shared secret (D-282). It keeps nothing on disk: Zalo sessions
are stored encrypted by `sino-api` (D-274). The plan is `openspec/changes/zalo-personal` at the repository root.

**Status (2026-10-21):** configuration, the shared-secret check, `GET /health`, the QR login, sessions with their
listeners (start, stop, kick, reconnect), reading (the message buffer, the cursor, the catch-up after a restart and
the batched webhook; stickers, GIFs and photos with their pictures), and sending text and stickers: one send per
`clientMessageId`, one message per second per account, and the lookup of sent messages. The `sino-api` side is done
too (connect by QR from the web, reading, replies, stickers, disconnect when an account is removed or turned off).
It has run against Zalo itself on the user's machine (zalo-personal ZL-14 to ZL-19, zalo-send-images ZS-09); the
acceptance run of the whole change, with its measurements, is ZL-13, and the message types in
`ZaloMessageNormalizer` of `sino-api` are the ones that run will confirm or correct.

`zalo-ci` (`.github/workflows/zalo-ci.yml`) runs the lint, the type check and the tests of this folder on every push
and pull request that touches it.

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
| `SINO_API_URL` | `http://127.0.0.1:8080` | Where `sino-api` listens; sino-zalo calls `POST <SINO_API_URL>/api/webhooks/zalo` there |

A missing or short secret, a bad port or an address that is not http(s) stops the service at start with exit code 1
and a line naming the variable.

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

## Run it next to sino-api

From a fresh clone, with nothing of Sino running yet:

1. **Make the shared secret**, once, and keep the output:
   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```
2. **This service:** `cp .env.example .env` in `apps/sino-zalo`, put the secret in `SINO_ZALO_SECRET`, leave
   `SINO_ZALO_HOST`, `SINO_ZALO_PORT` and `SINO_API_URL` as they are if `sino-api` will listen on its usual `:8080`.
3. **`sino-api`:** in `apps/sino-api/.env`, set `SINO_ZALO_ENABLED=true` and `SINO_ZALO_SECRET` to the *same* secret;
   `SINO_ZALO_URL` already points at `http://127.0.0.1:8090`. The whole section is in
   `apps/sino-api/README.md` → "Zalo: personal accounts through sino-zalo (F09)".
4. **Start this service first:** `pnpm install` then `pnpm dev` (or `pnpm start`) in `apps/sino-zalo`. Check it:
   ```bash
   curl http://127.0.0.1:8090/health
   ```
   `{"status":"UP","sessions":{"live":0,"ended":0}}` means it is up. A wrong secret or port stops it at start with a
   line naming the variable, so a service that is running is a service that is configured.
5. **Then start `sino-api`** and `apps/sino-web` as their own READMEs say. With Zalo off, `sino-api` logs that it is
   off and names the two settings; on, it logs nothing special.
6. **Connect an account:** in the web, Tài khoản → Thêm tài khoản → Zalo, accept the warning, scan the QR with the
   Zalo app. Zalo missing from that dialog, or shown as "Sắp có", means `sino-api` still has Zalo off.

The order matters only so that step 6 works: `sino-api` starts fine while `sino-zalo` is down, every Zalo call simply
fails until it is up.

## Turn Zalo off in a hurry

Two steps, in this order (D-286); the same list, with the settings spelled out, is in `apps/sino-api/README.md`:

1. **Stop this process** (Ctrl+C, or stop its service). Every listener dies with it, so the Zalo sessions stop at Zalo
   straight away, without needing anything from `sino-api`.
2. **Set `SINO_ZALO_ENABLED=false` in `apps/sino-api/.env` and restart `sino-api`**, so nothing calls this service any
   more and the connect dialog stops offering Zalo.

## API so far

| Request | Answer |
|---|---|
| `GET /health` | `200 { "status": "UP", "sessions": { "live", "ended" } }`, no secret needed, counts only |
| Any other request without `Authorization: Bearer <SINO_ZALO_SECRET>` | `401 { "code": "UNAUTHORIZED", "message": "Missing or wrong secret" }` |
| `POST /logins` | `201 { "loginId", "qrImage" (PNG, base64), "expiresAt" }` once Zalo has given the QR code (it lives 100 seconds); `502 QR_UNAVAILABLE` when Zalo fails first or gives none within 15 seconds |
| `GET /logins/{loginId}` | `200 { "state" }`, `state` one of `WAITING`, `SCANNED` (with `displayName`), `DONE`, `EXPIRED`, `DECLINED`, `FAILED`. The first `DONE` answer carries `profile` (`ownId`, `displayName`, `avatarUrl`) and `session` (`cookie`, `imei`, `userAgent`); the login is then forgotten. `404 UNKNOWN_LOGIN` for a login it does not know |
| `DELETE /logins/{loginId}` | `204`, also when the login is unknown; stops the login at Zalo too |
| `PUT /accounts/{accountId}/session` `{ "session": { "cookie", "imei", "userAgent" } }` | `204` once the account runs one listener on this session; the same session while it lives changes nothing. `410 SESSION_ENDED` when Zalo refuses the session, or for the very session that was kicked (Zalo is not asked again). `502 ZALO_UNAVAILABLE` when Zalo does not answer (the session held so far stays). `400` for a body without a usable session |
| `DELETE /accounts/{accountId}/session` | `204`, also when the account is unknown; stops the listener and forgets the account |
| `GET /accounts/{accountId}/messages?after=<msgId>&limit=<n>` | `200 { "conversations", "messages", "nextCursor", "hasMore" }`: up to `limit` (1–1000, default 100) buffered messages with a `msgId` above `after` (all of them without `after`), their conversations, the last `msgId` given (or `after`; `null` with neither), and whether more wait. `404 UNKNOWN_ACCOUNT`, `410 SESSION_ENDED`, `400` for a cursor that is not a whole number |
| `POST /accounts/{accountId}/messages` `{ "threadId", "threadType" (USER or GROUP), "text" or "image", "clientMessageId" }` | `201 { "msgId", "sentAt" }` once Zalo took the text, or the picture (`image` is `{ "data" (base64), "fileName" (a name without a path, ending `.png`, `.gif` or `.webp`), "width", "height" }`: at most 1 MiB once decoded, `text` then empty or missing; a text beside a picture is `400 INVALID_MESSAGE`, base64 that does not encode back to itself `400 INVALID_IMAGE`, more than 1 MiB `400 IMAGE_TOO_LARGE`, a request larger than the 2 MiB the route reads `400 PAYLOAD_TOO_LARGE`; the log carries the type and the size of a picture, never its bytes or its name). A PNG or WebP is uploaded, then sent through Zalo's `photo_url` as a photo in the bubble without a border, without the AI sticker marks (`pStickerType`, `webp`) that the Zalo phone app draws as an empty placeholder (ZS-09); a GIF goes down zca-js's own GIF path. The same `clientMessageId` within 24 hours: `200` with the first result, nothing sent, also once the session has ended. `429 RATE_LIMITED` for a second message within a second (nothing sent); `422 REJECTED` when Zalo refused it; `504 OUTCOME_UNKNOWN` when Zalo gave no answer within 10 seconds or the send broke midway, also for a repeat of such a send (never sent twice); `404 UNKNOWN_ACCOUNT`, `410 SESSION_ENDED`, `400` |
| `POST /accounts/{accountId}/sent/lookup` `{ "threadId", "clientMessageId", "text" (missing for a picture), "after" (date-time with a zone) }` | `200 { "msgIds" }`: the `msgId` remembered for `clientMessageId`, then, for a text, the account's own buffered messages in that thread with the same text sent after `after` (a picture has no text, so only what was remembered speaks for it). `409 CANNOT_TELL` instead of an empty list when the session started after `after`, when `after` is more than 24 hours ago, or when the send of that `clientMessageId` has no known outcome yet. `404 UNKNOWN_ACCOUNT`, `410 SESSION_ENDED`, `400` |

The secret is checked for every request, also on paths no route serves yet, so a route added later is protected
without extra code. A login is kept in memory only and forgotten five minutes after it started, read or not.

Sessions are kept in memory only, one per account, with a SHA-256 fingerprint to tell a new session from the same one
(D-289). When Zalo closes the listener with `3000` (another web connection) or `3003` (kick), the session ends and
sino-zalo calls the `sino-api` webhook with the `ownId`; any other close is reconnected after 1, 2, 4… up to 60 seconds,
back to 1 second once connected. sino-zalo reconnects itself (zca-js `retryOnClose` is off): zca-js would also reconnect
after a kick and then report `1006`.

Each account has a message buffer in memory: at most 1,000 messages, each kept 24 hours after it came in, ordered by
`msgId` compared as a whole number, the account's own messages included. A new message goes into the buffer first,
then sino-zalo calls the webhook, once per account per 0.5 seconds; a failed webhook loses nothing, `sino-api` finds the
message at its next pull. A read whose cursor is older than the buffer first asks Zalo for what it kept since then
(`requestOldMessages`, page after page until it joins the buffer, at most 10 pages per type and 5 seconds, once per
cursor per session, and only once the listener can read Zalo's messages); stopping short logs a warning without
message text. Conversation names come from Zalo, cached for an hour; a name that fails or takes over 2 seconds is left
out, never the messages. The log carries message ids, types and lengths, never their text. The whole contract with
`sino-api` is in the design of the change.

Sends are remembered by `clientMessageId` for 24 hours, in memory: the `msgId` is written the moment Zalo gives it,
before the `201` and even after a `504`, so a send `sino-api` stopped waiting for is found by the lookup. Only an error
code in Zalo's answer counts as a refusal; any other failure may come after Zalo took the message, so it stays unknown.
After a restart sino-zalo knows no earlier send, and the lookup answers `409 CANNOT_TELL` rather than "nothing".

## Layout

| Path | Role |
|---|---|
| `src/server.ts` | Entry point: reads the configuration, builds the app, listens, closes on Ctrl+C or `SIGTERM` |
| `src/app.ts` | `buildApp(config, gateway, { logger, notifier, now, sendTimeoutMs })`: the Fastify app without listening, so tests call it with `app.inject`, a fake gateway, a recording notifier and a clock they move by hand |
| `src/config.ts` | `loadConfig(env)`: reads and checks the environment variables |
| `src/auth.ts` | The `onRequest` hook that checks the shared secret in constant time |
| `src/gateway/ZaloGateway.ts` | The interface for everything asked of Zalo; nothing else imports zca-js |
| `src/gateway/ZcaGateway.ts` | `ZaloGateway` over zca-js, used by `server.ts` |
| `src/gateway/FakeZaloGateway.ts` | `ZaloGateway` for tests: the test plays Zalo by calling the events of a login |
| `src/logins/LoginStore.ts` | QR logins in progress: their states, the session handed over once, forgetting old ones |
| `src/logins/routes.ts` | `POST`, `GET`, `DELETE /logins` |
| `src/sessions/SessionManager.ts` | One session, listener and buffer per account: fingerprints, kicks, reconnects, one task at a time per account, reads with catch-up |
| `src/sessions/MessageBuffer.ts` | The messages waiting for `sino-api`, ordered by `msgId` as a BigInt, with the 1,000 / 24 hour limits |
| `src/sessions/CatchUp.ts` | Reads what Zalo kept after a cursor, page after page, within 10 pages per type and 5 seconds |
| `src/sessions/Conversations.ts` | Names the conversations of a page of messages, one Zalo lookup per thread per hour |
| `src/sessions/Stickers.ts` | Gives the sticker messages of a page their still picture and, for a sticker that moves, its sprite sheet, one Zalo lookup per sticker |
| `src/sessions/routes.ts` | `PUT`, `DELETE /accounts/{accountId}/session`, and the `404` / `410` / `502` answers shared by account routes |
| `src/messages/readRoutes.ts` | `GET /accounts/{accountId}/messages` |
| `src/messages/sendRoutes.ts` | `POST /accounts/{accountId}/messages` (send) and `POST /accounts/{accountId}/sent/lookup` |
| `src/messages/SentLog.ts` | Sends by `clientMessageId` for 24 hours: on their way, sent with their `msgId`, or unknown |
| `src/messages/RateLimiter.ts` | One message per second per account, on a monotonic clock |
| `src/notify.ts` | The webhook to `sino-api`, batched per account; a failure is logged, never thrown |
| `test/` | Vitest tests, one file per part |
