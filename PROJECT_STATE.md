# PROJECT_STATE

## Project context

- Project/root: `D:\Code\Product\MessageHub\Sino` (monorepo; backend at `apps/sino-api`)
- Remote: `origin` = https://github.com/shinoasada1907/Sino.git (`main` pushed @ `5ad6a2d`)
- Frontend: `apps/sino-web` (Vite + React skeleton)
- Last updated: 2026-09-30
- Active mode: TRAINING
- Mode source: `project-mode.yaml` (selected by the user on 2026-09-30)
- Current phase: Sino Messages — F01-F03 planning (PLAN + SPEC only; no implementation until the user says "APPROVED TO IMPLEMENT")
- Current task: F01-F03 — Implementation Plan + Technical Spec + missing architecture decisions
- Task owner: CLAUDE (drafts spec/plan documents only); design decisions owned by HUMAN
- Reviewer: HUMAN
- Current state: REVIEWING — F01-F03 spec + plan drafted in OpenSpec, waiting for Human review and decisions (2026-09-30)
- Files currently owned/being modified: see table below
- Other active agents: none known

## Task and file ownership

| Task | Owner | Reviewer | Mode | State | Exact files | Updated |
| --- | --- | --- | --- | --- | --- | --- |
| F01-F03 planning (spec + plan) | CLAUDE | HUMAN | TRAINING | REVIEWING | `openspec/config.yaml`, `openspec/changes/be-f01-project-foundation/**`, `openspec/changes/be-f02-connected-accounts/**`, `openspec/changes/be-f03-provider-contract/**`, `PROJECT_STATE.md` | 2026-09-30 |

## Completed work

- 2026-09-30: Workflow setup at `Sino/`: `git init -b main`, remote `origin` added, `openspec init --tools claude` (created `openspec/config.yaml`, `.claude/commands/opsx/*`, `.claude/skills/openspec-*`), `project-mode.yaml`, this file. No application source changed.
- 2026-09-30: `apps/sino-web` skeleton committed directly to `main` as `5ad6a2d` (the user approved the direct commit and the push) and pushed to `origin/main`. Only the 19 skeleton files were committed; `node_modules`/`dist` are ignored. Before committing, `pnpm build` (`tsc -b && vite build`) passed.

- 2026-09-30: Read Notion docs 00, 01, 02, 02A, 02B, 02C, 03, 04, 04A, 04B, 04C, 04D (public pages, read-only). Drafted three OpenSpec changes (proposal, specs, design, tasks each): `be-f01-project-foundation` (BE-01..BE-08), `be-f02-connected-accounts` (BE-09..BE-18), `be-f03-provider-contract` (BE-19..BE-26). Decision register D-01..D-21 lives in F01 `design.md` → Open Questions. Filled `openspec/config.yaml` context/rules. No application source changed.

## Architecture summary

Observed in `apps/sino-api` (Spring Initializr skeleton, no business code yet):

- Java 25 (Temurin 25.0.3 on this machine), Spring Boot 4.1.1, Spring Modulith 2.1.1, Maven wrapper 3.9.16.
- Starters: webmvc, data-jpa, flyway + flyway-database-postgresql, security, oauth2-client, validation, actuator, modulith core/jpa/observability/actuator/runtime, devtools, postgresql driver; tests: Testcontainers (postgres), modulith test, slice test starters.
- Source: `dev.sino.SinoApiApplication`, `application.yaml` (only `spring.application.name`), `TestcontainersConfiguration` (`postgres:latest`), `SinoApiApplicationTests.contextLoads`.
- Target architecture (from Project Context): Modular Monolith, modules `account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`, `common`.

## Known issues

- Docker daemon not running on this machine (2026-09-30) → Testcontainers-based tests cannot run until Docker Desktop is started.
- Spring Security is on the classpath with no configuration → every endpoint is protected by a generated password.
- `spring-modulith-starter-jpa` requires an event publication table; no Flyway migration exists yet.
- Testcontainers image is `postgres:latest` (unpinned).

## Verification evidence

- 2026-09-30 `apps/sino-api`: `./mvnw -B -ntp test-compile` → BUILD SUCCESS (17.6 s). Tests NOT RUN (Docker daemon not running → Testcontainers unavailable). Runtime start NOT VERIFIED.
- 2026-09-30 `openspec validate --all --strict` → 3 passed, 0 failed.

## Next task

Human reviews the three OpenSpec changes and answers the Decision Needed items (at minimum D-02, D-03 before F01; D-01, D-10..D-14 before F02; D-16, D-18 before F03; D-15 before F04). Implementation (TRAINING: Human codes, Claude mentors/reviews) starts only after `APPROVED TO IMPLEMENT`, beginning with BE-01.

## Last working checkpoint

- `main` @ `0574c53` — unmodified Spring Initializr skeleton (baseline; the one agreed direct commit to `main`, approved by the user 2026-09-30). Build/tests NOT VERIFIED.
- `main` @ `5ad6a2d` — adds the unmodified Vite React skeleton for `apps/sino-web`, pushed to `origin/main`. FE build VERIFIED (`pnpm build` exit 0); the BE build is still NOT VERIFIED.
- Working branch: `feature/be-f01-f03-plan`, based on `main` @ `5ad6a2d`. The user approved switching the shared working tree to this branch and committing (2026-09-30). It holds two commits: workflow setup (OpenSpec + mode + Claude OpenSpec commands) and the F01-F03 spec/plan with this file. Not pushed. The shared working tree HEAD is now on this branch, not `main`.
