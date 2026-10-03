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
| `SINO_API_USERNAME`, `SINO_API_PASSWORD` | application | The single HTTP Basic user of the REST API (D-02). The app refuses to start without them. |
| `SINO_OWNER_EMAIL`, `SINO_OWNER_DISPLAY_NAME` | application | The single Sino user (`app_user`) of the MVP, created or updated at startup with the email as key (D-10). Changing the email creates a new owner. The app refuses to start without them. |
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
| `/actuator/health` | public | Overall status. With the API user you also see each component. |
| `/actuator/health/liveness`, `/actuator/health/readiness` | public | Readiness includes the database, liveness does not. |
| `/actuator/info` | public | |
| `/api/**` | HTTP Basic (`curl -u "$SINO_API_USERNAME:$SINO_API_PASSWORD" ...`) | Business endpoints below. |
| `GET /api/providers` | HTTP Basic | Supported providers with `type`, `displayName` and `capabilities`, sorted by `type`. `[]` until a connector exists (F04). |
| any other path | denied | Other actuator endpoints need the API user and are not exposed (404). The `local` profile also exposes `/actuator/modulith`. |

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

Tests run with the `test` profile (`src/test/resources/application-test.yaml`, fake API user `test-user` /
`test-password`) against PostgreSQL 18 started by Testcontainers. GitHub Actions
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
| App stops with `sino.security.api-user` validation errors | `SINO_API_USERNAME` / `SINO_API_PASSWORD` are missing from `.env` or the environment. |
| App stops with `sino.owner` validation errors | `SINO_OWNER_EMAIL` / `SINO_OWNER_DISPLAY_NAME` are missing or the email is not valid. Copy them from `.env.example`. |
| App stops at bean `dataSource` with `'url' must start with "jdbc"` | No profile and no `SINO_DB_*` variables. Use `-Dspring-boot.run.profiles=local` on a dev machine. |
| Port 5432 already in use | Another PostgreSQL runs locally. Stop it or change the published port in `compose.yaml` and the URL in `application-local.yaml`. |
