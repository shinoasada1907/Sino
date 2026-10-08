# sino-api

Backend of Sino Messages: a Spring Boot 4 modular monolith (Java 25, Spring Modulith, PostgreSQL 18, Flyway).
Plans and specs live in `openspec/` at the repository root (`openspec/roadmap.md` gives the phase plan).

Run every command below from `apps/sino-api`. On PowerShell use `.\mvnw.cmd` instead of `./mvnw` and quote
`-D` arguments, for example `.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"`.

## Prerequisites

- JDK 25 (Temurin 25.0.3 is the reference). Check with `./mvnw -v`.
- Docker Desktop running. It is needed for the local database and for every test that uses Testcontainers.

## First-time setup

```bash
cp .env.example .env    # then put real values in .env (it is git-ignored)
docker compose up -d    # PostgreSQL 18 on 127.0.0.1:5432
docker compose ps       # wait until the status says (healthy)
```

`.env` is read by Docker Compose and by the `local` Spring profile. Keep the format `KEY=value`: no quotes, no
`export`, no spaces around `=`.

| Variable | Used by | Purpose |
|---|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Compose, `local` profile | Local database. Postgres reads them only when the volume is created; after changing them run `docker compose down -v`. |
| `SINO_CREDENTIAL_ACTIVE_KEY_ID`, `SINO_CREDENTIAL_KEY_K1` | application | AES-256-GCM key that encrypts provider tokens (D-11): base64 of 32 random bytes, `openssl rand -base64 32`. Back it up outside the repo; losing it means reconnecting every account. To rotate, add a `k2` slot in `application.yaml`, set it and make it active: old rows stay readable with `k1`, and each credential moves to `k2` the next time it is saved. Remove `k1` only when `select count(*) from account_credential where encryption_key_id = 'k1'` returns 0. The app refuses to start without a valid active key. |
| `SINO_OWNER_EMAIL`, `SINO_OWNER_DISPLAY_NAME` | application | The single Sino user (`app_user`) of the MVP, created or updated at startup with the email as key (D-10). Changing the email creates a new owner. The app refuses to start without them. |
| `SINO_OWNER_PASSWORD` | application | The password the owner signs in with in the browser (D-22, D-33), at least 12 characters. Only a BCrypt hash is kept after startup. To change it, change the variable and restart. The app refuses to start without it. |
| `SINO_REMEMBER_ME_KEY` | application | Signs the "keep me signed in" cookie (D-34), at least 32 characters: `openssl rand -base64 32`. Changing it signs every browser out. The app refuses to start without it. |
| `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET` | application | Sino's Google OAuth client for connecting Gmail accounts (F04a, D-38), created in the Google Cloud console as a "Web application" client. Leave both empty and Gmail is off (the startup log says so, `/api/providers` has no `gmail`); set both to turn it on. Setting only one stops the app, and the message names the missing variable, never a value. |
| `SINO_PUBLIC_BASE_URL` | application | The address the browser uses to reach Sino, `http://localhost:5173` in development (D-36). Required when Gmail is on: the connect flow sends Google `<this>/api/accounts/connect/gmail/callback` as redirect URI, which must also be listed in the Google OAuth client. The app refuses to start with Gmail on and no usable `http(s)` address. |
| `SINO_SESSION_COOKIE_SECURE` | application | `true` behind HTTPS, so the session cookie is never sent over plain HTTP. Default `false` (local HTTP). |
| `SINO_DB_URL`, `SINO_DB_USERNAME`, `SINO_DB_PASSWORD` | application, default profile | Database outside the `local` profile. They have no defaults on purpose. |

## Run

| Goal | Command |
|---|---|
| Run against the Compose database | `./mvnw spring-boot:run -Dspring-boot.run.profiles=local` |
| Run against a throwaway Testcontainers database | `./mvnw spring-boot:test-run` |
| Open a SQL shell | `docker compose exec postgres psql -U sino -d sino` |
| Stop the database (keep data) / wipe it | `docker compose down` / `docker compose down -v` |

In IntelliJ, run `SinoApiApplication` with the `local` profile and set the Run Configuration **working directory**
to `apps/sino-api`; otherwise `.env` is not found.

Flyway applies `src/main/resources/db/migration` on startup and Hibernate only validates the schema. Never edit a
migration that was already applied: add a new `V{n}__{module}_{description}.sql` instead.

## Gmail: Google project and a first real connect

Sino connects Gmail through its own Google OAuth client (F04a, D-38, D-40). Without one, Gmail is off and the rest
of the app works. Setting one up takes about ten minutes in the [Google Cloud console](https://console.cloud.google.com/),
signed in with the Google account you want to connect (menu names as of October 2026):

1. **Project.** In the project picker of the top bar, *New project*, for example `sino-dev`.
2. **Gmail API.** *APIs & Services > Library*, search *Gmail API*, *Enable*.
3. **Consent screen.** *Google Auth Platform > Branding > Get started*: an app name such as `Sino (dev)` and your
   email as support email; *Audience*: **External**; a contact email; accept the policy; *Create*. The app starts in
   **Testing**.
4. **Test users.** *Google Auth Platform > Audience > Test users > Add users*: every Gmail address you will connect.
   In Testing, only these accounts can give consent.
5. **Scopes** (recommended). *Google Auth Platform > Data Access > Add or remove scopes*: `openid`,
   `.../auth/userinfo.email` and `https://www.googleapis.com/auth/gmail.readonly` (a restricted scope). Sino asks for
   them in every consent request anyway; listing them here shows them on the consent screen.
6. **OAuth client.** *Google Auth Platform > Clients > Create client*, type **Web application**, any name, and two
   *Authorized redirect URIs*, exactly as written (scheme, port, path, no trailing slash):
   - `http://localhost:5173/api/accounts/connect/gmail/callback` (through the web dev server, D-36)
   - `http://localhost:8080/api/accounts/connect/gmail/callback` (the backend alone, for the test below)

   *Create*, then **copy the client secret right away**: Google shows it only once. Lost it? Open the client and add
   a new secret.
7. **`.env`.** Set `SINO_GOOGLE_CLIENT_ID`, `SINO_GOOGLE_CLIENT_SECRET` and `SINO_PUBLIC_BASE_URL=http://localhost:5173`,
   then restart. The startup log no longer says "Gmail is off", and `GET /api/providers` lists `gmail`.

Good to know:

- In **Testing**, Google lets a refresh token live **7 days**; after that the account has to be reconnected.
  Publishing the app (*Audience > Publish app*) without verification is allowed for personal use (fewer than 100
  users) behind an "unverified app" warning; Google does not say whether that holds for the restricted Gmail scope
  (open risk in the F04a design), so stay in Testing until it is tried.
- "Google hasn't verified this app" is expected for your own app: *Continue*.
- You can always take Sino's access away by hand at <https://myaccount.google.com/permissions>.

### Try it with real Google, without the web app

The browser that finishes the connect must hold the session that started it (the state and the PKCE verifier live
there), so everything happens in one browser tab on the backend's own address:

1. Start the backend alone, with Google sending the browser back to it (the environment wins over `.env`):

   ```bash
   SINO_PUBLIC_BASE_URL=http://localhost:8080 ./mvnw spring-boot:run -Dspring-boot.run.profiles=local
   ```

   PowerShell: `$env:SINO_PUBLIC_BASE_URL="http://localhost:8080"; .\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"`.
2. Open <http://localhost:8080/api/auth/me> (a `401` is fine: it hands out the CSRF cookie), open the developer
   console (F12) and run, with the owner email and password from `.env`:

   ```js
   const xsrf = () => document.cookie.match(/XSRF-TOKEN=([^;]+)/)[1];
   const call = (method, path, body) => fetch(path, { method, body: body && JSON.stringify(body),
       headers: { 'X-XSRF-TOKEN': xsrf(), 'Content-Type': 'application/json' } });
   await call('POST', '/api/auth/login', { email: 'OWNER_EMAIL', password: 'OWNER_PASSWORD', rememberMe: false });
   await fetch('/api/auth/me');
   location.href = (await (await call('POST', '/api/accounts/connect/gmail')).json()).authorizationUrl;
   ```

3. At Google, pick the Gmail account and allow reading mail. The browser comes back to
   `http://localhost:8080/accounts?connected=<accountId>`. That page itself is an error (there is no web app on
   8080); the address is what counts. In the console (redefine `xsrf` and `call` first, the page changed):
   `await (await fetch('/api/accounts')).json()` shows the account, `CONNECTED`.
4. Reconnect: `location.href = (await (await call('POST', '/api/accounts/connect/gmail', { accountId: '<accountId>' })).json()).authorizationUrl;`
   comes back with the same id. Picking another Google account there ends on `connectError=CONNECT_WRONG_ACCOUNT`.
5. Remove: `(await call('DELETE', '/api/accounts/<accountId>')).status` is `204`, and Sino disappears from
   <https://myaccount.google.com/permissions> (it can take a minute).

## Endpoints available today

| Path | Access | Notes |
|---|---|---|
| `/actuator/health` | public | Overall status. Signed in, you also see each component. |
| `/actuator/health/liveness`, `/actuator/health/readiness` | public | Readiness includes the database, liveness does not. |
| `/actuator/info` | public | |
| `/api/**` | signed in (session cookie, see below) | Business endpoints below. Changes (`POST`, `PATCH`, `DELETE`) also need the CSRF token. |
| `GET /api/auth/me` | public | `200 {email, displayName}` when signed in, `401` otherwise. Also hands out the `XSRF-TOKEN` cookie. |
| `POST /api/auth/login` | public, CSRF | `{email, password, rememberMe}` → `204` and a session cookie (plus a 30-day remember-me cookie when `rememberMe` is true). Wrong email or password → `401` `INVALID_CREDENTIALS` with `remainingAttempts`; the 5th wrong attempt in a row locks that email for 15 minutes → `429` `LOGIN_LOCKED` with `retryAfterSeconds` and a `Retry-After` header (D-35). |
| `POST /api/auth/logout` | CSRF | `204`; ends the session and deletes the remember-me cookie. |
| `POST /api/accounts/connect/{provider}` | signed in, CSRF | Starts connecting an account over OAuth2 (F04a). Body optional: `{"accountId": "..."}` reconnects that account. `200 {authorizationUrl}`: the browser goes there to give its consent; the state and PKCE verifier stay in the session for 10 minutes. `404 UNKNOWN_PROVIDER`, `422 CONNECT_NOT_SUPPORTED` (the provider does not connect over OAuth2), `404 ACCOUNT_NOT_FOUND` (account to reconnect missing, removed or of another provider), `400 MALFORMED_REQUEST` (`accountId` is not a UUID). |
| `GET /api/accounts/connect/{provider}/callback` | public (the pending connect in the session identifies the user) | Where the provider sends the browser back with `code` and `state` (or `error`). Always a `302`, never JSON: `/accounts?connected={accountId}` on success, `/accounts?connectError={CODE}` otherwise, with `CONNECT_CANCELLED` (the user said no), `CONNECT_STATE_INVALID` (state missing, unknown, used, older than 10 minutes, of another provider, or no session), `CONNECT_SCOPE_DENIED` (Gmail read access not granted), `CONNECT_WRONG_ACCOUNT` (a reconnect came back with another Google account; nothing changes), `CONNECT_FAILED` (anything else, including an account removed while it was being reconnected; the log says why). Whenever tokens came back but no account was connected, the grant is revoked at Google, unless it belongs to an account you already have connected (D-54): revoking would take that account's access away too. |
| `GET /api/providers` | signed in | Supported providers with `type`, `displayName` and `capabilities`, sorted by `type`. `gmail` (no capability yet; reading mail comes with F04b) when the Google OAuth client is set, `[]` otherwise. |
| `GET /api/accounts` | signed in | Connected accounts of the current user, oldest first, with the `capabilities` of their provider (`[]` when its connector is gone). No credential field. Gmail accounts appear here once connected through the callback. |
| `GET /api/accounts/{id}` | signed in | One account. `404` `ACCOUNT_NOT_FOUND` when it does not exist or belongs to another user (same response), `400` `MALFORMED_REQUEST` when the ID is not a UUID. |
| `PATCH /api/accounts/{id}` | signed in | JSON body with one or more of `displayName` (1–100 characters after trimming), `syncEnabled` (pause or resume automatic sync), `enabled` (disable or enable the account); a missing or `null` field stays as it is. `400` `VALIDATION_FAILED` for `{}` or a bad name, `404` as above, `409` `CONCURRENT_MODIFICATION` when another request changed the account first. |
| `DELETE /api/accounts/{id}` | signed in | `204`. Soft delete (D-13 B): the account row is kept but hidden from every endpoint (`404` afterwards), its stored credential is deleted for good. Connecting the same provider account again brings the same account back. For Gmail, once the removal is committed Sino also asks Google to revoke its access (best effort: if Google fails or is slow, the account is removed anyway and the log has a warning naming the account, never a token). |
| any other path | denied | Other actuator endpoints need a signed-in user and are not exposed (404). The `local` profile also exposes `/actuator/modulith`. |

Sign in with curl the way the browser does (D-22): fetch the CSRF cookie, send it back in `X-XSRF-TOKEN`, keep
the cookies in a jar.

```bash
curl -s -c jar -b jar http://localhost:8080/api/auth/me > /dev/null              # sets XSRF-TOKEN
XSRF=$(awk '$6 == "XSRF-TOKEN" {print $7}' jar)
curl -s -c jar -b jar -H "X-XSRF-TOKEN: $XSRF" -H 'Content-Type: application/json'      -d '{"email":"me@example.com","password":"<SINO_OWNER_PASSWORD>"}' http://localhost:8080/api/auth/login
curl -s -b jar http://localhost:8080/api/accounts                                  # GET: cookie only
curl -s -b jar -H "X-XSRF-TOKEN: $XSRF" -X DELETE http://localhost:8080/api/accounts/<id>   # changes: + token
```

Every error is an RFC 9457 problem response (`application/problem+json`) with a stable `code`, for example:

```json
{ "title": "Unauthorized", "status": 401, "detail": "Authentication is required to access this resource.",
  "instance": "/api/accounts", "code": "UNAUTHORIZED" }
```

The error code catalog is in the F01 design (`openspec/changes/archive/2026-10-01-be-f01-project-foundation/design.md`, section 8) and in each feature's design; the behaviour is specified in `openspec/specs/api-conventions/spec.md`.

## Test

| Goal | Command |
|---|---|
| All tests | `./mvnw test` |
| Full build, as CI runs it | `./mvnw -B verify` |
| Module boundaries only | `./mvnw test -Dtest=ModularityTests` |

Tests run with the `test` profile (`src/test/resources/application-test.yaml`, fake owner `owner@sino.test` /
`test-owner-password`) against PostgreSQL 18 started by Testcontainers. GitHub Actions
(`.github/workflows/backend-ci.yml`) runs `./mvnw -B verify` on pushes and pull requests that touch this folder.

## Module conventions

Decided in D-03 (`openspec/specs/module-boundaries/spec.md`).

- Every business module is a direct sub-package of `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`). `dev.sino.common` holds technical concerns only and depends on no business module.
- A module's **public API** is the types in its base package (for example `dev.sino.account.AccountConnected`) plus any sub-package marked with `@NamedInterface` (for example `dev.sino.common.error`).
- The layer packages `api` (REST controllers), `application`, `domain` and `infrastructure` are **internal**. Other modules must not reference them, so no module touches another module's repositories or JPA entities.
- Modules talk to each other through public API types or events. A module that only needs to react to something listens to an event instead of calling back.
- Modules report failures with `SinoException` and their own `ErrorCode` enum; the web layer maps the category to the HTTP status.
- `ModularityTests` checks these rules on every build and writes module diagrams to `target/spring-modulith-docs`.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `FATAL: invalid value for parameter "TimeZone": "Asia/Saigon"` | The JVM uses a legacy zone id that PostgreSQL 18 rejects. The app and the tests force UTC (D-23); a new launch path (another IDE configuration, a Dockerfile) must keep `-Duser.timezone=UTC` or go through `SinoApiApplication.main`. |
| `failed to connect to the docker API` | Docker Desktop is not running. |
| App stops with `The active credential key ... is not configured` or `sino.credentials.encryption.keys.k1 must decode to 32 bytes` | `SINO_CREDENTIAL_KEY_K1` is missing or is not base64 of 32 bytes. Generate one with `openssl rand -base64 32`. |
| App stops with `sino.owner.password (SINO_OWNER_PASSWORD) must be set and at least 12 characters long` or the same for `sino.auth.remember-me-key` | Add `SINO_OWNER_PASSWORD` and `SINO_REMEMBER_ME_KEY` to `.env` (see `.env.example`). The message never shows the value. |
| App stops with `SINO_GOOGLE_CLIENT_SECRET (sino.google.client-secret) is missing` (or the same for the client id) | Only half of the Google OAuth client is set. Set both `SINO_GOOGLE_CLIENT_ID` and `SINO_GOOGLE_CLIENT_SECRET`, or clear both to run without Gmail. |
| App stops with `SINO_PUBLIC_BASE_URL (sino.public-base-url) must be the http(s) address ...` | Gmail is on but the public address is missing or not an `http(s)` URL. Set `SINO_PUBLIC_BASE_URL` (for example `http://localhost:5173`). |
| Google shows `Error 400: redirect_uri_mismatch` | The redirect URI Sino sends (`SINO_PUBLIC_BASE_URL` + `/api/accounts/connect/gmail/callback`) is not listed in the OAuth client character for character: scheme, host, port, path, no trailing slash. Add it under *Google Auth Platform > Clients*. |
| Google shows `Error 403: access_denied` ("has not completed the Google verification process") | The Google account is not a test user. Add it under *Google Auth Platform > Audience > Test users*. |
| A Gmail account stops working about a week after connecting | The Google project is in Testing, where refresh tokens last 7 days. Reconnect it. |
| Connecting Gmail ends on `/accounts?connectError=CONNECT_FAILED` | Look for `Connecting gmail failed: ...` in the log: it names the reason (the token endpoint's HTTP status or OAuth error, no refresh token, profile not readable), never a code or a token. |
| Connecting Gmail ends on `/accounts?connectError=CONNECT_STATE_INVALID` | The callback came more than 10 minutes after the start, in another browser, after a restart (the session is gone), or twice. Start again. |
| App stops with `sino.owner` validation errors | `SINO_OWNER_EMAIL` / `SINO_OWNER_DISPLAY_NAME` are missing or the email is not valid. Copy them from `.env.example`. |
| Sign-in answers `429` `LOGIN_LOCKED` | Five wrong passwords in a row locked that email for 15 minutes (D-35). Wait `retryAfterSeconds`, or restart the app (the counter lives in memory). |
| Every `POST`/`PATCH`/`DELETE` answers `403` `CSRF_TOKEN_INVALID` | The `X-XSRF-TOKEN` header is missing or does not match the `XSRF-TOKEN` cookie. Call `GET /api/auth/me` first and send the cookie value back in the header. |
| App stops at bean `dataSource` with `'url' must start with "jdbc"` | No profile and no `SINO_DB_*` variables. Use `-Dspring-boot.run.profiles=local` on a dev machine. |
| Port 5432 already in use | Another PostgreSQL runs locally. Stop it or change the published port in `compose.yaml` and the URL in `application-local.yaml`. |
