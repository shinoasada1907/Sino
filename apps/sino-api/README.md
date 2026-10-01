# sino-api

Backend of Sino Messages: a Spring Boot 4 modular monolith (Java 25, Spring Modulith, PostgreSQL, Flyway).
Plan and specs live in `openspec/` at the repository root.

> Draft README. Build, run and test commands are completed in BE-08.

## Module conventions

Decided in D-03 (`openspec/changes/be-f01-project-foundation/design.md`, section 2).

- Every business module is a direct sub-package of `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`). `dev.sino.common` holds technical concerns only and depends on no business module.
- A module's **public API** is the types in its base package (for example `dev.sino.account.AccountConnected`) plus any sub-package marked with `@NamedInterface` (for example `dev.sino.provider.spi`).
- The layer packages `api` (REST controllers), `application`, `domain` and `infrastructure` are **internal**. Other modules must not reference them, so no module touches another module's repositories or JPA entities.
- Modules talk to each other through public API types or events. A module that only needs to react to something listens to an event instead of calling back.
- `ModularityTests` checks these rules on every build (`./mvnw test -Dtest=ModularityTests`). It also writes module diagrams to `target/spring-modulith-docs`.
