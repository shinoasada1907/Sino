# Sino

Sino Messages brings several accounts and several message providers (Gmail, Telegram…) into one shared inbox, next to
notes, tasks and a calendar. This repository holds the backend, the web app, the Zalo service, the plans and the
design.

## What is in this repository

| Folder | Content |
|---|---|
| [`apps/sino-api`](apps/sino-api/README.md) | Backend: Spring Boot 4 modular monolith (Java 25, Spring Modulith, PostgreSQL 18, Flyway) |
| [`apps/sino-web`](apps/sino-web/README.md) | Web app: React 19 + TypeScript on Vite, Tailwind 4, shadcn/ui |
| [`apps/sino-zalo`](apps/sino-zalo/README.md) | Node service between `sino-api` and personal Zalo accounts (zca-js); only `sino-api` calls it |
| [`openspec/roadmap.md`](openspec/roadmap.md) | Phase plan and features |
| [`openspec/specs/`](openspec/specs) | How the running system behaves, merged from finished features |
| [`openspec/changes/`](openspec/changes) | Features in progress (`proposal.md`, `design.md`, `specs/`, `tasks.md`); finished ones in `archive/` |
| [`design/sino-ui/project/`](design/sino-ui/project) | Copy of the "Sino UI" design canvas (the source is the [claude.ai artifact](https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB)) |
| [`docs/knowledge/`](docs/knowledge) | One learning guide per phase: which parts of Java, Spring and React are used where, and why (`.md` source, generated `.docx`) |
| [`.github/workflows/`](.github/workflows) | CI: `backend-ci.yml` for `apps/sino-api`, `frontend-ci.yml` for `apps/sino-web`, `zalo-ci.yml` for `apps/sino-zalo` |

Each app has its own README with the full setup, commands, tests and troubleshooting.

## Prerequisites

- JDK 25 and Docker Desktop for the backend (the local database and the Testcontainers tests).
- Node.js 26 and pnpm 11 for the web app and sino-zalo (`npm install -g pnpm@11`; the exact version is pinned in
  `packageManager` of each `package.json`).

## Run it locally

Start the backend first; the web app signs in against it.

```bash
# apps/sino-api
cp .env.example .env    # then put real values in .env (it is git-ignored)
docker compose up -d    # PostgreSQL 18 on 127.0.0.1:5432
./mvnw spring-boot:run -Dspring-boot.run.profiles=local
```

```bash
# apps/sino-web
pnpm install
pnpm dev                # http://localhost:5173, sign in with SINO_OWNER_EMAIL / SINO_OWNER_PASSWORD of apps/sino-api/.env
```

On PowerShell use `.\mvnw.cmd` and quote `-D` arguments. What each `.env` variable does, and how to connect a real
Gmail account, is in [`apps/sino-api/README.md`](apps/sino-api/README.md).

## How work is organised

- Each feature is an OpenSpec change in `openspec/changes/<feature>/`: proposal, design with numbered decisions
  (D-xx), spec deltas and `tasks.md`. Tasks are ticked as they are done; a task done differently from the plan is
  struck through with the reason next to it. A finished feature is archived with `openspec archive <change> -y`,
  which merges its specs into `openspec/specs/`.
- Work happens on the `dev` branch; `main` is not committed to directly.
- Secrets live only in `apps/sino-api/.env`, which is git-ignored; `.env.example` is the template. OAuth client files
  from the Google Cloud console (`client_secret*.json`) are ignored too.
- Notes for coding agents (Claude, Codex) are in [`CLAUDE.md`](CLAUDE.md). The current task, who is working on what
  and the verification evidence are in [`PROJECT_STATE.md`](PROJECT_STATE.md); the working mode is in
  [`project-mode.yaml`](project-mode.yaml).
