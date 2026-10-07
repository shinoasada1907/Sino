## Why

`apps/sino-api` hiện chỉ là khung Spring Initializr: compile được (`./mvnw test-compile` → BUILD SUCCESS, 2026-09-30) nhưng chưa chạy được như một backend thật. Chưa có datasource/profile, chưa có Flyway migration (trong khi `spring-modulith-starter-jpa` bắt buộc có bảng `event_publication`), Spring Security đang khóa mọi endpoint bằng mật khẩu tự sinh, chưa có error model, chưa có module verification và chưa có môi trường DB local. F02 (Connected Accounts) và F03 (Provider Contract) đều cần nền móng này để có chỗ đặt module, migration, test và convention chung.

## What Changes

- Môi trường PostgreSQL local bằng Docker Compose; pin image version dùng chung cho Compose và Testcontainers (thay `postgres:latest`).
- Cấu hình ứng dụng theo profile (`application.yaml` + `application-local.yaml`), secret chỉ đến từ environment variable; `open-in-view` tắt, Hibernate chỉ `validate` schema.
- Flyway là nguồn duy nhất của schema; migration đầu tiên tạo bảng `event_publication` cho Spring Modulith Event Publication Registry.
- Module structure theo Spring Modulith + test `ApplicationModules.verify()` chạy trong mọi build; module `common` chỉ chứa technical concern.
- Security baseline cho REST API (phương án cụ thể chờ **Decision D-02**); health endpoint public.
- Error model thống nhất theo RFC 9457 Problem Details, có `code` ổn định cho frontend.
- Actuator/health baseline (liveness/readiness, DB health), không expose endpoint nhạy cảm; quy tắc logging không lộ secret.
- Test infrastructure: Testcontainers dùng chung, phân tầng unit / slice / module / full-context.
- (Chờ **Decision D-07**) GitHub Actions chạy `./mvnw verify` cho backend.
- README cho `apps/sino-api` với lệnh build/run/test thật.

## Capabilities

### New Capabilities
- `application-runtime`: khởi động ứng dụng theo profile, cấu hình qua environment, kết nối PostgreSQL, áp Flyway migration khi start và fail-fast khi schema/cấu hình sai.
- `module-boundaries`: cấu trúc module Spring Modulith dưới `dev.sino`, quy tắc public API của module và kiểm tra boundary tự động.
- `api-conventions`: quy ước chung cho REST API — base path, bảo vệ truy cập, định dạng lỗi Problem Details, quy ước JSON.
- `operational-health`: health/liveness/readiness, phạm vi expose của Actuator và quy tắc logging an toàn.

### Modified Capabilities
<!-- Chưa có spec nào trong openspec/specs/ — đây là change đầu tiên. -->

## Impact

- Code: `apps/sino-api/src/main/java/dev/sino/common/**`, `src/main/resources/application*.yaml`, `src/main/resources/db/migration/**`, `src/test/java/dev/sino/**`.
- Build/infra: `apps/sino-api/compose.yaml`, `apps/sino-api/.env.example`, `apps/sino-api/README.md`; có thể thêm `.github/workflows/backend-ci.yml` ở repo root (D-07). Không thêm dependency mới vào `pom.xml` (mọi starter cần thiết đã có sẵn).
- Môi trường dev: cần Docker Desktop đang chạy để chạy test (Testcontainers) và DB local.
- API: chưa có endpoint nghiệp vụ; chỉ có `/actuator/health/**`, `/actuator/info` và hành vi lỗi/bảo vệ chung cho `/api/**`.

## Non-goals

- Không có domain nghiệp vụ nào (account, provider, conversation...) — thuộc F02/F03 trở đi.
- Không làm login thật của người dùng Sino (OAuth2 login, form login) — xem D-02.
- Không cấu hình OAuth2 client registration cho provider (Gmail) — thuộc F04.
- Không có SSE/realtime, scheduler, sync engine (F07/F08).
- Không thêm Redis, message broker, search engine, tracing backend hay structured-logging pipeline.
- Không làm frontend (`apps/sino-web`).
