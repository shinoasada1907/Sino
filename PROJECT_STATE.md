# PROJECT_STATE

## Project context

- Project/root: `D:\Code\Product\MessageHub\Sino` (monorepo; backend at `apps/sino-api`)
- Remote: `origin` = https://github.com/shinoasada1907/Sino.git (`main` pushed @ `5ad6a2d`)
- Frontend: `apps/sino-web` (Vite + React skeleton)
- Last updated: 2026-10-01
- Active mode: HYBRID (default AUTO; architecture decisions TRAINING; any task the user claims runs in TRAINING)
- Mode source: `project-mode.yaml` (TRAINING chosen 2026-09-30; switched to HYBRID by the user on 2026-10-01; the F03 TRAINING override was removed by the user the same day: "chuyển qua auto đi")
- Current phase: Phase 0 (backend foundation) — F01 done and archived; F03 Provider Contract in progress; F02 after F03 (D-01 = A)
- Current task: F03 Provider Contract — BE-19…BE-21 DONE; next BE-22
- Task owner: CLAUDE (AUTO, one small task at a time, stop and report after each) unless the user claims a task
- Standing authorization (user, 2026-10-01): after each finished and verified task Claude commits to `dev` **without pushing**. Push, merge and PR still need an explicit request.
- Reviewer: HUMAN
- Current state: F03 in AUTO; BE-21 committed on `dev`, waiting for the user before BE-22
- Files currently owned/being modified: see table below
- Other active agents: none known

## Task and file ownership

| Task | Owner | Reviewer | Mode | State | Exact files | Updated |
| --- | --- | --- | --- | --- | --- | --- |
| F01-F03 planning (spec + plan) | CLAUDE | HUMAN | TRAINING | DONE (F01 approved to implement; D-xx for F02/F03 open) | `openspec/config.yaml`, `openspec/changes/be-f01-project-foundation/**`, `openspec/changes/be-f02-connected-accounts/**`, `openspec/changes/be-f03-provider-contract/**`, `PROJECT_STATE.md` | 2026-09-30 |
| BE-01 step 1 env files (branch `dev`) — explicit task-scoped takeover requested by the user ("tạo đi") | CLAUDE | HUMAN | TRAINING | DONE | `apps/sino-api/.env.example`, `apps/sino-api/.gitignore` (+ local `apps/sino-api/.env`, ignored) | 2026-09-30 |
| BE-01 step 2 compose.yaml (branch `dev`) — explicit task-scoped takeover requested by the user ("tạo compose.yaml luôn đi") | CLAUDE | HUMAN | TRAINING | DONE (container healthy, PostgreSQL 18.6) | `apps/sino-api/compose.yaml` | 2026-09-30 |
| BE-01 steps 3-4 + D-23 timezone fix (branch `dev`) — Human ran compose; Claude made the D-23 fix and the tag change on explicit request | CLAUDE | HUMAN | TRAINING | DONE | `apps/sino-api/src/test/java/dev/sino/TestcontainersConfiguration.java`, `apps/sino-api/src/main/java/dev/sino/SinoApiApplication.java`, `apps/sino-api/pom.xml` | 2026-09-30 |
| BE-02 config (branch `dev`) | CLAUDE | HUMAN | TRAINING → HYBRID | DONE | `apps/sino-api/src/main/resources/application.yaml`, `apps/sino-api/src/main/resources/application-local.yaml`, `apps/sino-api/src/test/resources/application-test.yaml`, `apps/sino-api/src/test/java/dev/sino/SinoApiApplicationTests.java` (`@ActiveProfiles("test")`) | 2026-09-30 |
| BE-02 V1 migration + local run checks (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/main/resources/db/migration/V1__modulith_create_event_publication.sql` | 2026-09-30 |
| BE-03 ModularityTests + module conventions (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/test/java/dev/sino/ModularityTests.java`, `apps/sino-api/README.md` | 2026-10-01 |
| BE-04 security baseline, D-02 A (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/main/java/dev/sino/common/**`, `application.yaml`, `application-test.yaml`, `.env.example`, `TestSinoApiApplication.java`, `src/test/java/dev/sino/common/security/**` | 2026-10-01 |
| BE-05 Problem Details error model, D-21 (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/main/java/dev/sino/common/error/**`, `.../common/web/**`, `.../common/security/SecurityProblemHandler.java`, `SecurityConfig.java`, `src/test/java/dev/sino/common/web/GlobalExceptionHandlerTests.java`, `ApiSecurityTestConfiguration.java`, spec `api-conventions`, design §8 | 2026-10-01 |
| BE-06 actuator health + safe logging (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `application.yaml`, `application-local.yaml`, `SecurityConfig.java`, `src/test/java/dev/sino/ActuatorEndpointsTests.java`, `ReadinessWhenDatabaseIsDownTests.java`, `GlobalExceptionHandlerTests.java`, spec `operational-health`, design §3 | 2026-10-01 |
| BE-07 GitHub Actions backend CI (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE (CI run 36837841135 green) | `.github/workflows/backend-ci.yml`, `apps/sino-api/mvnw` (mode 100755) | 2026-10-01 |
| BE-08 README + F01 acceptance (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/README.md`, F01 design DoD, tasks | 2026-10-01 |
| BE-19 `ProviderType`, `ProviderCapability`, `ProviderCapabilities` (branch `dev`) — the user typed the classes in TRAINING, then switched F03 to AUTO | CLAUDE | HUMAN | TRAINING → AUTO | DONE | `apps/sino-api/src/main/java/dev/sino/provider/{ProviderType,ProviderCapability,ProviderCapabilities}.java`, `apps/sino-api/src/test/java/dev/sino/provider/{ProviderTypeTests,ProviderCapabilitiesTests}.java`, `project-mode.yaml` | 2026-10-01 |
| BE-20 normalized types, enums, `SkippedItem` + minimal `ProviderErrorCode`/`ProviderException` (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/main/java/dev/sino/provider/spi/**`, `apps/sino-api/src/test/java/dev/sino/provider/spi/**`, F03 `design.md`, `tasks.md` | 2026-10-01 |
| BE-21 SPI `MessageProvider`, context/credentials, profile/cursor/batch/send (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | DONE | `apps/sino-api/src/main/java/dev/sino/provider/spi/**`, `apps/sino-api/src/test/java/dev/sino/provider/spi/**`, F03 `design.md`, `tasks.md` | 2026-10-01 |
| F03 Provider Contract BE-22..BE-26 (branch `dev`) | CLAUDE | HUMAN | AUTO (HYBRID) | TODO (next: BE-22) | `apps/sino-api/src/main/java/dev/sino/provider/**`, `apps/sino-api/src/test/java/dev/sino/provider/**` | 2026-10-01 |

## Completed work

- 2026-09-30: Workflow setup at `Sino/`: `git init -b main`, remote `origin` added, `openspec init --tools claude` (created `openspec/config.yaml`, `.claude/commands/opsx/*`, `.claude/skills/openspec-*`), `project-mode.yaml`, this file. No application source changed.
- 2026-09-30: `apps/sino-web` skeleton committed directly to `main` as `5ad6a2d` (the user approved the direct commit and the push) and pushed to `origin/main`. Only the 19 skeleton files were committed; `node_modules`/`dist` are ignored. Before committing, `pnpm build` (`tsc -b && vite build`) passed.

- 2026-09-30: Read Notion docs 00, 01, 02, 02A, 02B, 02C, 03, 04, 04A, 04B, 04C, 04D (public pages, read-only). Drafted three OpenSpec changes (proposal, specs, design, tasks each): `be-f01-project-foundation` (BE-01..BE-08), `be-f02-connected-accounts` (BE-09..BE-18), `be-f03-provider-contract` (BE-19..BE-26). Decision register D-01..D-21 lives in F01 `design.md` → Open Questions. Filled `openspec/config.yaml` context/rules. No application source changed.

- 2026-09-30: BE-01 done on `dev`: local PostgreSQL 18 via Docker Compose (`127.0.0.1:5432`, named volume, healthcheck), `.env.example` + ignored `.env`, Testcontainers pinned to `postgres:18`, D-23 (JVM in UTC) added after the `Asia/Saigon` connection failure.

- 2026-10-01: F01 Project Foundation DONE (BE-01…BE-08) on `dev`; README complete; CI green; OpenSpec change `be-f01-project-foundation` archived.

## Architecture summary

Observed in `apps/sino-api` (Spring Initializr skeleton, no business code yet):

- Java 25 (Temurin 25.0.3 on this machine), Spring Boot 4.1.1, Spring Modulith 2.1.1, Maven wrapper 3.9.16.
- Starters: webmvc, data-jpa, flyway + flyway-database-postgresql, security, oauth2-client, validation, actuator, modulith core/jpa/observability/actuator/runtime, devtools, postgresql driver; tests: Testcontainers (postgres), modulith test, slice test starters.
- Source: `dev.sino.SinoApiApplication`, `application.yaml` (only `spring.application.name`), `TestcontainersConfiguration` (`postgres:latest`), `SinoApiApplicationTests.contextLoads`.
- Target architecture (from Project Context): Modular Monolith, modules `account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`, `common`.

## Known issues

- The user's IntelliJ terminal ran Maven on Java 26.0.1 (baseline and `JAVA_HOME` in PowerShell: Temurin 25.0.3). Check with `.\mvnw.cmd -v` and align.
- Windows (region Vietnam) gives the JVM the legacy zone id `Asia/Saigon`, which PostgreSQL 18 (Debian 13) rejects. Mitigated by D-23 (JVM runs in UTC); any new launch path (Dockerfile, CI, IDE config) must keep UTC.
- Spring Security is on the classpath with no configuration → every endpoint is protected by a generated password.
- `spring-modulith-starter-jpa` requires an event publication table; no Flyway migration exists yet.

## Verification evidence

- 2026-09-30 `apps/sino-api`: `./mvnw -B -ntp test-compile` → BUILD SUCCESS (17.6 s). Tests NOT RUN (Docker daemon not running → Testcontainers unavailable). Runtime start NOT VERIFIED.
- 2026-09-30 `openspec validate --all --strict` → 3 passed, 0 failed.
- 2026-09-30 BE-01: `docker compose ps` → `sino-api-postgres-1` Up (healthy), `127.0.0.1:5432`; `select version()` → PostgreSQL 18.6; volume `sino-api_pgdata`, `PGDATA=/var/lib/postgresql/18/docker`. `./mvnw test` with `-DargLine=` reproduced `FATAL: invalid value for parameter "TimeZone": "Asia/Saigon"`; with the D-23 fix → BUILD SUCCESS (1 test); after pinning Testcontainers to `postgres:18` → BUILD SUCCESS (1 test). App runtime through `main` NOT separately verified (the user declined the extra check; BE-02 will exercise it).
- 2026-10-01 BE-02: without V1 `./mvnw test` → red `Schema validation: missing table [event_publication]`; with V1 → BUILD SUCCESS (1 test, `Successfully applied 1 migration`). `spring-boot:run` profile `local` (web off) → run 1 applied V1 and started in 8.6 s, run 2 `Schema "public" is up to date` (this also exercises D-23 through `main`). Compose DB has `event_publication` and `flyway_schema_history` (V1 success). No profile and no env → fails at bean `dataSource`: `'url' must start with "jdbc"`.
- 2026-10-01 BE-03: `./mvnw test -Dtest=ModularityTests` → 2/2 green, docs in `target/spring-modulith-docs`. Temporary violation (`demob` → `demoa.internal.Hidden`) → red with `Module 'demob' depends on non-exposed type dev.sino.demoa.internal.Hidden within module 'demoa'!`; removed, green again. Full `./mvnw test` → 3/3, BUILD SUCCESS.
- 2026-10-01 BE-04: `SecurityConfigTests` 4/4 (401 without credentials + `WWW-Authenticate: Basic`, 401 wrong password, 200 valid without session, 403 for `/internal/**` even when authenticated), `ApiUserPropertiesTests` 3/3, full `./mvnw test` 10/10 BUILD SUCCESS. Not checked with curl against a running app; `spring-boot:test-run` after the `TestSinoApiApplication` change NOT run.
- 2026-10-01 BE-05: first run 21/22 (`No value at JSON path "$.type"`). Spring 7.0.9 sources show `ProblemDetail.type` defaults to null and is omitted (`NON_EMPTY`), as RFC 9457 §3.1.1 allows; spec and design updated. Then `GlobalExceptionHandlerTests` 12/12, full `./mvnw test` 22/22 BUILD SUCCESS.
- 2026-10-01 BE-06: `ActuatorEndpointsTests` 5/5, `ReadinessWhenDatabaseIsDownTests` 1/1 (readiness 503 DOWN, liveness 200 UP with a fake DOWN `db` indicator), 2 new log-safety tests, full `./mvnw test` 30/30 BUILD SUCCESS. The actuator 404 scenario was corrected to 401 anonymous / 404 authenticated.
- 2026-10-01 BE-07: workflow YAML parses; local `./mvnw -B -ntp verify` (the CI command) → BUILD SUCCESS. GitHub Actions: push of `dev` @ `7caf6ac` → run 36837841135, job `verify` success in 1m02s (all steps success).
- 2026-10-01 BE-08: app jar with profile `local` started in ~4 s; curl: health public UP (components only for the API user), readiness/liveness 200, `/api/accounts` 401 problem+json with `WWW-Authenticate: Basic` / 404 `RESOURCE_NOT_FOUND` with the API user, `/actuator/env` 401/404, `/actuator/modulith` 200 (local), `/internal` 403, password found 0 times in the app log. No `postgres:latest`, `.env` untracked, no committed file contains a real local password.
- 2026-10-01 BE-19: `./mvnw -B -ntp verify` → 56/56 (30 existing + `ProviderTypeTests` 17 + `ProviderCapabilitiesTests` 9), BUILD SUCCESS; `ModularityTests` 2/2 and Modulith documents the new module (`target/spring-modulith-docs/module-provider.adoc`). Mutation check in a scratch copy: removing the defensive copy and the unmodifiable wrapper turns exactly `copiesTheSetItWasGiven` and `cannotBeChangedFromOutside` red.
- 2026-10-01 BE-20: `./mvnw -B -ntp verify` → 96/96 (40 new in `dev.sino.provider.spi`), BUILD SUCCESS. A temporary test (deleted afterwards) printed the named interfaces of module `provider`: `<<UNNAMED>>`, `spi`. Mutation check in a scratch copy (dropping the `sentAt` check, the participants copy, the `UNKNOWN` default and the null-element loop) turned exactly the 6 matching tests red.
- 2026-10-01 BE-21: `./mvnw -B -ntp verify` → 133/133 (37 new), BUILD SUCCESS. Mutation check in a scratch copy (record-default `toString()` on both credential types, default `sendMessage` returning `null`, no `nextCursor` check) turned exactly the 7 matching tests red, including both "token never printed" tests for the context.

## Next task

F03 in AUTO (the user removed the TRAINING override on 2026-10-01). D-01 = A (F03 first), D-16 = A (value object), D-18 = A (yes), accepted 2026-10-01. BE-19…BE-21 done; next **BE-22** (complete `ProviderException`: `retryAfter`, `SinoException` question, switch `require`, `UNKNOWN_PROVIDER` in the catalog), one task at a time, stop and report after each.

- BE-20 pulled a minimal `ProviderErrorCode` + `ProviderException` forward from BE-22 (reason in `tasks.md`). BE-22 keeps `retryAfter`, the `SinoException` question, switching `require`, and `UNKNOWN_PROVIDER` in the catalog.

- `ProviderCapabilities.require` throws `UnsupportedOperationException` until BE-22 adds `ProviderException(CAPABILITY_NOT_SUPPORTED)`; BE-22 must update `ProviderCapabilitiesTests.requireFailsWhenNotSupported` too.
- Code comments stay sparse (user, 2026-10-01: "hạn chế comment quá nhiều"): English Javadoc plus a line comment only for a non-obvious reason; explanations go in chat.
- The decision register (D-01…D-23) is in `openspec/changes/archive/2026-10-01-be-f01-project-foundation/design.md`. F02 still needs D-10…D-14.

## Last working checkpoint

- `main` @ `0574c53` — unmodified Spring Initializr skeleton (baseline; the one agreed direct commit to `main`, approved by the user 2026-09-30). Build/tests NOT VERIFIED.
- `main` @ `5ad6a2d` — adds the unmodified Vite React skeleton for `apps/sino-web`, pushed to `origin/main`. FE build VERIFIED (`pnpm build` exit 0); the BE build is still NOT VERIFIED.
- Working branch: `feature/be-f01-f03-plan`, based on `main` @ `5ad6a2d`. The user approved switching the shared working tree to this branch and committing (2026-09-30). It holds two commits: workflow setup (OpenSpec + mode + Claude OpenSpec commands) and the F01-F03 spec/plan with this file. Pushed to `origin/feature/be-f01-f03-plan` @ `9ac3693` (user asked, 2026-09-30); no PR opened.
- PR #1 (`feature/be-f01-f03-plan`) was merged into `main` on GitHub as `16aa8d6` (merge commit; done by the user).
- `feature/be-f01-project-foundation` @ `12af56b` (roadmap + D-22) pushed to origin (user asked, 2026-09-30).
- **`dev`**: the user's coding branch (requested 2026-09-30), created from `12af56b`. The shared working tree HEAD is on `dev`. Not pushed. Relative to `origin/main` it is 1 ahead / 1 behind; the missing commit is only the PR #1 merge commit and brings no file changes.
