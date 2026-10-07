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

## Endpoints available today

| Path | Access | Notes |
|---|---|---|
| `/actuator/health` | public | Overall status. Signed in, you also see each component. |
| `/actuator/health/liveness`, `/actuator/health/readiness` | public | Readiness includes the database, liveness does not. |
| `/actuator/info` | public | |
| `/api/**` | signed in (session cookie, see below) | Business endpoints below. Changes (`POST`, `PATCH`, `DELETE`) also need the CSRF token. |
| `GET /api/auth/me` | public | `200 {email, displayName}` when signed in, `401` otherwise. Also hands out the `XSRF-TOKEN` cookie. |
| `POST /api/auth/login` | public, CSRF | `{email, password, rememberMe}` → `204` and a session cookie (plus a 30-day remember-me cookie when `rememberMe` is true). Wrong email or password → `401` `INVALID_CREDENTIALS`. |
| `POST /api/auth/logout` | CSRF | `204`; ends the session and deletes the remember-me cookie. |
| `GET /api/providers` | signed in | Supported providers with `type`, `displayName` and `capabilities`, sorted by `type`. `[]` until a connector exists (F04). |
| `GET /api/accounts` | signed in | Connected accounts of the current user, oldest first, with the `capabilities` of their provider (`[]` when its connector is gone). No credential field. Empty until the connect flow exists (F04). |
| `GET /api/accounts/{id}` | signed in | One account. `404` `ACCOUNT_NOT_FOUND` when it does not exist or belongs to another user (same response), `400` `MALFORMED_REQUEST` when the ID is not a UUID. |
| `PATCH /api/accounts/{id}` | signed in | JSON body with one or more of `displayName` (1–100 characters after trimming), `syncEnabled` (pause or resume automatic sync), `enabled` (disable or enable the account); a missing or `null` field stays as it is. `400` `VALIDATION_FAILED` for `{}` or a bad name, `404` as above, `409` `CONCURRENT_MODIFICATION` when another request changed the account first. |
| `DELETE /api/accounts/{id}` | signed in | `204`. Soft delete (D-13 B): the account row is kept but hidden from every endpoint (`404` afterwards), its stored credential is deleted for good. Connecting the same provider account again brings the same account back. |
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
| App stops with `sino.owner` validation errors | `SINO_OWNER_EMAIL` / `SINO_OWNER_DISPLAY_NAME` are missing or the email is not valid. Copy them from `.env.example`. |
| Every `POST`/`PATCH`/`DELETE` answers `403` `CSRF_TOKEN_INVALID` | The `X-XSRF-TOKEN` header is missing or does not match the `XSRF-TOKEN` cookie. Call `GET /api/auth/me` first and send the cookie value back in the header. |
| App stops at bean `dataSource` with `'url' must start with "jdbc"` | No profile and no `SINO_DB_*` variables. Use `-Dspring-boot.run.profiles=local` on a dev machine. |
| Port 5432 already in use | Another PostgreSQL runs locally. Stop it or change the published port in `compose.yaml` and the URL in `application-local.yaml`. |
