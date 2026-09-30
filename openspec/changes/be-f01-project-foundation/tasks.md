# F01 — Project Foundation · Implementation Plan

> **TRAINING mode:** Human viết code; AI review, chạy test, debug cùng. Mỗi task có **Hướng làm** (Level 2 — hướng đi, không code hoàn chỉnh) và **Gợi ý** (Level 1 — khái niệm/tài liệu cần đọc). Muốn xem code tham khảo (Level 4) thì yêu cầu rõ ràng theo từng task.
> Mỗi task = một commit logic trên nhánh feature, build + test xanh trước khi sang task sau. Làm khác kế hoạch → gạch task cũ và ghi **LÝ DO** ngay tại chỗ.
> Chặn: không bắt đầu trước `APPROVED TO IMPLEMENT`. Decision cần chốt được ghi ở từng task.

## 1. Môi trường chạy

- [ ] 1.1 **BE-01 — PostgreSQL local bằng Docker Compose, pin phiên bản**
  - **Goal / Why:** DB local bền vững cho dev, cùng phiên bản với Testcontainers để "chạy được ở máy tôi" = "chạy được trong test".
  - **Depends:** D-05, D-06 · Docker Desktop đang chạy.
  - **Files:** `apps/sino-api/compose.yaml`, `apps/sino-api/.env.example`, `apps/sino-api/.gitignore` (thêm `.env`), `src/test/java/dev/sino/TestcontainersConfiguration.java` (đổi tag image).
  - **Hướng làm:** một service `postgres` với image tag cố định, lấy DB/user/password từ biến môi trường của `.env`, map cổng 5432, dữ liệu trong named volume, có `healthcheck`. Testcontainers dùng đúng tag đó.
  - **Test:** `docker compose up -d` → `docker compose ps` báo healthy; `select version()` trong psql ra đúng major; tạo một bảng thử → `docker compose down` → `up -d` → bảng còn; `git status` không thấy `.env`.
  - **AC:** requirement *PostgreSQL local và test dùng cùng phiên bản cố định*, *Không có secret trong repository* (`application-runtime`).
  - **Gợi ý:** `pg_isready`; named volume khác bind mount thế nào; biến trong `.env` được Compose nạp tự động ra sao.
  - **Rollback:** `docker compose down -v`.

- [ ] 1.2 **BE-02 — Cấu hình theo profile + Flyway V1 (`event_publication`) + context load xanh**
  - **Goal / Why:** ứng dụng start được trên DB thật với schema do Flyway quản lý; Hibernate chỉ validate. Thiếu V1 thì Spring Modulith JPA làm `validate` fail.
  - **Depends:** BE-01, D-04.
  - **Files:** `src/main/resources/application.yaml`, `src/main/resources/application-local.yaml`, `src/test/resources/application-test.yaml`, `src/main/resources/db/migration/V1__modulith_create_event_publication.sql`, `src/test/java/dev/sino/SinoApiApplicationTests.java` (bật profile `test`).
  - **Hướng làm:** điền property theo bảng ở design §3 (datasource từ env, `open-in-view: false`, `ddl-auto: validate`, problem details). Profile `local` import `.env` và trỏ datasource về Compose. V1 theo bảng cột ở design §4. Test dùng profile `test`, datasource do `@ServiceConnection` cung cấp.
  - **Test:** `./mvnw test` → `contextLoads` xanh. Chạy tay profile `local` → log "Successfully applied 1 migration". Chạy lại → "Schema ... is up to date". Thí nghiệm (không commit): sửa V1 sau khi đã áp → start fail vì checksum; start không profile, không env → fail với thông báo datasource.
  - **AC:** requirement *Cấu hình theo profile và environment*, *Flyway quản lý toàn bộ schema*, *Hibernate chỉ kiểm tra schema*, *Bảng cho Event Publication Registry*, *Không mở persistence context xuyên suốt HTTP request*.
  - **Gợi ý:** cú pháp `optional:file:.env[.properties]` của `spring.config.import`; vì sao **không** được tạo `src/test/resources/application.yaml`; Flyway `validateOnMigrate`.
  - **Risk:** chưa có BE-04 nên Spring Security vẫn in generated password — bình thường ở bước này.

## 2. Boundary và convention

- [ ] 2.1 **BE-03 — Module verification test (`ModularityTests`) + convention public API**
  - **Goal / Why:** mọi task sau được lưới boundary bảo vệ ngay từ đầu.
  - **Depends:** BE-02 · **D-03** (chốt cách export public API).
  - **Files:** `src/test/java/dev/sino/ModularityTests.java`; mục "Module conventions" trong `apps/sino-api/README.md` (tạo sơ bộ, hoàn thiện ở BE-08).
  - **Hướng làm:** một test dựng `ApplicationModules` từ `SinoApiApplication`, gọi `verify()`; tùy chọn in danh sách module và sinh tài liệu bằng `Documenter` vào `target/`. Ghi convention đã chốt ở D-03 thành 5–6 dòng trong README.
  - **Test:** `./mvnw test -Dtest=ModularityTests` xanh. Thí nghiệm (không commit): tạo hai package module giả phụ thuộc vòng hoặc truy cập package nội bộ của nhau → quan sát test fail và đọc thông báo → xóa.
  - **AC:** requirement *Kiểm tra boundary tự động trong mọi build*, *Business module là package con trực tiếp của `dev.sino`*.
  - **Gợi ý:** Spring Modulith reference: "Verifying Application Module Structure", "Named Interfaces", `allowedDependencies`.

- [ ] 2.2 **BE-04 — Security baseline**
  - **Goal / Why:** thay mật khẩu tự sinh bằng chính sách rõ ràng: health public, `/api/**` cần xác thực, còn lại từ chối.
  - **Depends:** BE-02 · **D-02**.
  - **Files:** `src/main/java/dev/sino/common/package-info.java` (module `common`, không dependency), `src/main/java/dev/sino/common/security/SecurityConfig.java`, `application.yaml` / `application-test.yaml` / `.env.example` (thông tin user API nếu D-02 = A), controller thử nghiệm trong **test sources** dưới `/api/...`.
  - **Hướng làm:** một `SecurityFilterChain` theo design mục "Security baseline": public health/info, authenticated `/api/**`, `denyAll` phần còn lại, stateless, không form login. Nếu tắt CSRF thì ghi lý do ngay tại chỗ (tham chiếu D-02).
  - **Test:** web test với controller thử: không credential → 401; sai mật khẩu → 401; đúng → 200 và không có `Set-Cookie`; đường dẫn ngoài `/api` và actuator → bị từ chối.
  - **AC:** requirement *`/api/**` yêu cầu xác thực* (phần status code; body Problem Details hoàn thiện ở BE-05).
  - **Gợi ý:** Security 7 chỉ còn lambda DSL; `SessionCreationPolicy.STATELESS`; `@WebMvcTest` không tự nạp `SecurityFilterChain` của bạn — cần import config.

- [ ] 2.3 **BE-05 — Error model Problem Details + error code catalog**
  - **Goal / Why:** frontend nhận một định dạng lỗi duy nhất có `code` ổn định; domain báo lỗi mà không biết HTTP.
  - **Depends:** BE-04 · D-21.
  - **Files:** `common/error/package-info.java` (`@NamedInterface("error")`), `common/error/ErrorCode.java`, `common/error/ErrorCategory.java`, `common/error/SinoException.java`, `common/web/GlobalExceptionHandler.java`, entry point + access denied handler trả Problem Details trong `common/security`, test controller trong test sources.
  - **Hướng làm:** handler kế thừa `ResponseEntityExceptionHandler` để giữ cách xử lý chuẩn của Spring rồi bổ sung `code` / `errors`; map `SinoException` theo category (bảng ở design §8); catch-all trả 500 chung chung và log đầy đủ phía server; 401/403 từ Security cũng ra Problem Details.
  - **Test:** web test cho từng scenario của requirement *Lỗi theo RFC 9457 Problem Details* (400 validation, 400 malformed, 404 domain, 404 route, 405, 415, 500 không lộ tên exception, 401 có `code`); `Content-Type` là `application/problem+json`; một response có `Instant` được serialize thành chuỗi ISO-8601 kết thúc bằng `Z`.
  - **AC:** requirement *Lỗi theo RFC 9457 Problem Details*, *Error code catalog*, *Quy ước JSON* (`api-conventions`).
  - **Gợi ý:** `ProblemDetail.setProperty`; các hook `handleMethodArgumentNotValid` / `handleExceptionInternal`; `NoResourceFoundException`; mặc định serialize ngày giờ của Jackson 3 — hãy kiểm chứng bằng test thay vì tin tutorial.

## 3. Vận hành

- [ ] 3.1 **BE-06 — Actuator health baseline + logging an toàn**
  - **Goal / Why:** có health/liveness/readiness cho vận hành, không lộ endpoint nhạy cảm, log không chứa secret.
  - **Depends:** BE-04, BE-05.
  - **Files:** `application.yaml`, `application-local.yaml` (expose thêm `modulith`), test `src/test/java/dev/sino/common/ActuatorEndpointsTests.java` (hoặc tên tương đương).
  - **Hướng làm:** property theo design §3; readiness group gồm `db`; kiểm tra log bằng output capture.
  - **Test:** full-context test: health/liveness/readiness 200 không auth, body không có `components`; `/actuator/env` → 404; request có `Authorization` → output log không chứa giá trị header. Kiểm tra tay (ghi kết quả vào PR/commit): dừng container DB khi app đang chạy → readiness 503, liveness 200.
  - **AC:** toàn bộ requirement của `operational-health`.
  - **Gợi ý:** `OutputCaptureExtension`; health group; vì sao liveness **không** nên phụ thuộc DB.

- [ ] 3.2 **BE-07 — GitHub Actions cho backend** *(chỉ làm nếu D-07 = có)*
  - **Goal / Why:** mỗi push/PR chạy `./mvnw verify` để bắt lỗi boundary/migration/test sớm.
  - **Depends:** BE-02…BE-06 xanh ở local · D-07 · Human đồng ý push branch.
  - **Files:** `.github/workflows/backend-ci.yml` (repo root); đổi mode của `apps/sino-api/mvnw` trong Git sang executable.
  - **Hướng làm:** trigger theo path `apps/sino-api/**`; checkout, setup Temurin 25 có cache Maven, `working-directory: apps/sino-api`, chạy `./mvnw -B verify`.
  - **Test:** push branch → workflow xanh; cố ý làm hỏng một test ở branch nháp → workflow đỏ.
  - **AC:** workflow xanh trên branch feature.
  - **Gợi ý:** file `mvnw` hiện được lưu trong Git với mode `100644` (đã kiểm tra 2026-09-30) → trên runner Linux sẽ `Permission denied`; tìm hiểu `git update-index --chmod=+x`.

## 4. Tài liệu và nghiệm thu

- [ ] 4.1 **BE-08 — README backend + nghiệm thu F01**
  - **Goal / Why:** người mới (hoặc chính bạn 6 tháng sau) clone về chạy được chỉ bằng README.
  - **Depends:** BE-01…BE-06 (BE-07 nếu có).
  - **Files:** `apps/sino-api/README.md`, `PROJECT_STATE.md`, file này (tick task).
  - **Hướng làm:** lệnh ở design §13, bảng biến môi trường, convention module, cách chạy test và yêu cầu Docker.
  - **Test:** thử từ đầu: `docker compose down -v` → làm theo README từng bước → app start, `./mvnw verify` xanh.
  - **AC:** toàn bộ checklist *Definition of Done — F01* trong `design.md`.
  - **Learning gate (Human tự trả lời trước khi đóng F01):** (1) Kể lại thứ tự khởi động: config → datasource → Flyway → Hibernate validate → Modulith. (2) Vì sao tắt Open Session In View? (3) Public API của một module gồm những gì, và điều gì xảy ra nếu vi phạm? (4) Muốn thêm một bảng mới thì làm những bước nào? (5) Rủi ro lớn nhất của cấu hình security đang chọn là gì?
