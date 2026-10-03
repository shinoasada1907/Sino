# F02 — Connected Accounts · Implementation Plan

> **HYBRID mode (từ 2026-10-01):** mặc định AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào Human nhận ("để tôi làm BE-xx") thì chạy TRAINING: Human code theo **Hướng làm** (Level 2) và **Gợi ý** (Level 1), Claude review/test.
> Phụ thuộc: F01 hoàn tất; `ProviderType` + `ProviderRegistry` của F03 (thứ tự theo **D-01**). Một task = một commit logic, `./mvnw verify` xanh trước khi sang task sau.
> ~~Chặn: không bắt đầu trước `APPROVED TO IMPLEMENT`.~~ **APPROVED TO IMPLEMENT** 2026-10-03 (người dùng: "được bắt đầu đi"); mỗi task vẫn chờ quyết định D ghi ở **Depends**. BE-12 (crypto) cần review bảo mật riêng trước khi merge.
> Đã đối chiếu với F03 (2026-10-03): xem mục "Đối chiếu với F03" trong `design.md` — `UNKNOWN_PROVIDER` có sẵn, `capabilities` dùng `find`, refresh token đi riêng, test nạp module `provider`, `@WebMvcTest` ghi rõ controller.

## 1. Owner

- [x] 1.1 **BE-09 — `app_user` (V2) + tạo owner khi khởi động + `CurrentUser`**
  - **Thực hiện (2026-10-03, AUTO, D-10 = A):** module mới `identity`: `CurrentUser` (public, base package); `application/` — `OwnerProperties` (`sino.owner.email`/`display-name`, bắt buộc, email trim + chữ thường), `OwnerProvisioner` (`ApplicationRunner`, upsert theo email trong một transaction; chạy sau Flyway vì runner chỉ chạy khi context đã sẵn sàng), `OwnerCurrentUser` (kiểm tra có người đăng nhập thật, không phải anonymous; tra ID owner một lần rồi giữ lại); `infrastructure/` — entity `AppUser` (UUIDv7 bằng `@UuidGenerator(VERSION_7)` theo D-08, `status` lưu chuỗi theo D-09, `created_at`/`updated_at` qua `@PrePersist`/`@PreUpdate`), `UserStatus`, `AppUserRepository` (`findByEmail`, `findIdByEmail`). V2 `V2__identity_create_app_user.sql` có PK, `UNIQUE(email)`, `CHECK(status)`. Cấu hình: `application.yaml` (biến `SINO_OWNER_*`, mặc định rỗng → thiếu thì không start), `application-test.yaml`, `.env.example`.
  - **Làm khác kế hoạch:** thêm `README.md` (bảng biến môi trường + dòng xử lý sự cố) và đổi `TestcontainersConfiguration` thành `public`. **LÝ DO:** README phải nói đúng biến bắt buộc mới ngay khi app đòi nó (không đợi BE-18); test có database của module khác package `dev.sino` cần import cấu hình Testcontainers. Test "start hai lần" làm bằng cách gọi lại runner trong cùng context (cùng logic với lần khởi động thứ hai), không khởi động lại Spring.
  - **Kiểm chứng (2026-10-03):** `OwnerPropertiesTests` 5/5 (thiếu email/tên → không start, email sai → không start), `OwnerCurrentUserTests` 5/5, `OwnerProvisioningTests` 4/4 (owner có sau khi start, UUID version 7, gọi lại không thêm dòng, đổi tên được ghi lại, DB từ chối email trùng), `ModularityTests` 2/2 (Modulith nhận module `identity`). Log: Flyway áp V2, `Owner user … is ready`. Kiểm tra ngược: bỏ bước tìm theo email → đúng 2 test idempotent đỏ. `./mvnw -B -ntp verify` → BUILD SUCCESS, 188 test (cộng theo lớp), 0 failure, 0 error, 2 skipped.
  - **Goal / Why:** mọi account có chủ; code nghiệp vụ lấy owner qua một abstraction thay vì đọc Security trực tiếp.
  - **Depends:** F01 · **D-10**, D-02.
  - **Files:** `db/migration/V2__identity_create_app_user.sql` (tên theo D-10), module `identity` (hoặc package trong `account`): entity + repository nội bộ, component upsert owner, interface `CurrentUser` (public), `@ConfigurationProperties` cho `sino.owner.*`; `.env.example`, `application-test.yaml`.
  - **Hướng làm:** upsert idempotent theo email; properties được validate để thiếu email thì không start; `CurrentUser` ở MVP trả ID của owner cho mọi principal đã xác thực.
  - **Test:** full-context/JPA: start hai lần → một dòng `app_user`; thiếu `sino.owner.email` → context fail; unit cho `CurrentUser`.
  - **AC:** toàn bộ requirement của `account-owner` (trừ cô lập dữ liệu — kiểm ở BE-15).
  - **Gợi ý:** `ApplicationRunner` hay event `ApplicationReadyEvent` — cái nào chạy sau Flyway?; `@Validated` trên properties record.

## 2. Domain và persistence

- [x] 2.1 **BE-10 — Aggregate `ConnectedAccount` + vòng đời trạng thái (unit thuần)**
  - **Thực hiện (2026-10-03, AUTO, D-12 = A):** `account/domain/AccountStatus` (5 trạng thái), `StatusChange` (record `from`/`to`, hai trạng thái phải khác nhau), `ConnectedAccount` (Java thuần, chưa có JPA — BE-11 quyết định cách map): `register` (factory), `reconnect`, `disable`, `enable`, `markAuthExpired`, `markDegraded`, `markError`, `markHealthy` — mỗi cái khai báo tập trạng thái được phép đi từ đó; `rename`, `pauseSync`, `resumeSync`. **Lựa chọn event:** hành động trả `Optional<StatusChange>`, service tạo `AccountStatusChanged` (lý do ghi ở design §5). Tên từ provider trim + cắt còn 100 ký tự; tên do người dùng đặt 1–100 ký tự, sai → `IllegalArgumentException`; đếm theo code point (khớp `varchar(100)` của PostgreSQL, không cắt đôi emoji).
  - **Làm khác kế hoạch:** thêm file `StatusChange.java` ngoài danh sách Files. **LÝ DO:** là kiểu trả về của lựa chọn event ở trên. `INVALID_ACCOUNT_STATE` chưa tạo: bảng chuyển trạng thái không có ô nào là lỗi (ô không hợp lệ là no-op), nên F02 chưa có chỗ dùng.
  - **Kiểm chứng (2026-10-03):** `ConnectedAccountTests` 47/47 — 35 ô của bảng chuyển trạng thái chép nguyên từ design vào `@CsvSource`, cộng 12 test (register, thiếu dữ liệu, cắt tên dài, không cắt đôi emoji, reconnect làm mới dữ liệu, rename trim/100 ký tự/rỗng/101 ký tự, pause/resume không đổi status, `StatusChange` cùng trạng thái bị từ chối). `ModularityTests` 2/2 (Modulith nhận module `account`). Kiểm tra ngược: cho `markHealthy` gỡ `AUTH_EXPIRED` → đúng ô `AUTH_EXPIRED + HEALTHY` đỏ. `./mvnw -B -ntp verify` → BUILD SUCCESS, 235 test, 0 failure, 0 error, 2 skipped.
  - **Goal / Why:** luật nghiệp vụ nằm trong domain, test được không cần Spring/DB.
  - **Depends:** BE-09 (chỉ cần kiểu `ownerId`), BE-19 (`ProviderType`) · **D-12**.
  - **Files:** `account/domain/ConnectedAccount.java`, `account/domain/AccountStatus.java`, test domain.
  - **Hướng làm:** mỗi hành động là một method của aggregate; bảng chuyển trạng thái ở design là "oracle" cho test. Quyết định: method trả về event hay để service tạo event — ghi lại lựa chọn.
  - **Test:** unit phủ **mọi ô** của bảng chuyển trạng thái (parameterized test), `rename` với tên rỗng/quá dài, no-op không sinh event.
  - **AC:** requirement *Vòng đời trạng thái*.
  - **Gợi ý:** `@ParameterizedTest` + `@CsvSource`/`@MethodSource`; "tell, don't ask".

- [ ] 2.2 **BE-11 — `connected_account` (V3) + JPA mapping + repository**
  - **Goal / Why:** lưu aggregate với ràng buộc duy nhất ở DB — lớp bảo vệ cuối cùng cho idempotency.
  - **Depends:** BE-10 · D-08, D-09.
  - **Files:** `db/migration/V3__account_create_connected_account.sql`, `account/infrastructure/...` (entity hoặc mapping trực tiếp lên aggregate — chọn và ghi lý do), repository, JPA slice test.
  - **Hướng làm:** cột/constraint theo bảng ở design; enum lưu chuỗi + `CHECK`; `version` cho optimistic locking; UUIDv7 sinh ở app; `ProviderType` map sang `varchar` (converter).
  - **Test:** JPA slice với PostgreSQL thật: lưu/đọc đủ trường; ghi trùng `(user_id, provider, external_account_id)` → vi phạm constraint; `status` ngoài tập → DB từ chối; tìm theo owner.
  - **AC:** requirement *Mô hình connected account*.
  - **Gợi ý:** `AttributeConverter`; tách JPA entity khỏi domain object có đáng không ở quy mô này? — trade-off giữa "sạch" và "đơn giản".

## 3. Credential

- [ ] 3.1 **BE-12 — Cipher AES-256-GCM + key ring + validate khi khởi động**
  - **Goal / Why:** mã hóa at rest đúng chuẩn, xoay khóa được, sai là không start.
  - **Depends:** F01 · **D-11**.
  - **Files:** `account/infrastructure/crypto/...` (cipher + `@ConfigurationProperties` key ring), `.env.example` (`SINO_CREDENTIAL_*`), `application-test.yaml` (khóa giả), unit test.
  - **Hướng làm:** tham số đúng như design D-11 (IV 12 byte mới cho mỗi lần, tag 128-bit, AAD = accountId + tên trường, lưu `base64(IV‖ciphertext‖tag)`). API của cipher nhận/trả kèm `keyId`. Properties validate: có khóa active, mọi khóa đúng 32 byte.
  - **Test:** unit: round-trip; cùng plaintext → ciphertext khác; sửa 1 byte → lỗi; sai AAD → lỗi; mã hóa bằng `k1`, đổi active `k2` → vẫn giải mã được bằng `k1`; context test: thiếu khóa → không start và message không chứa giá trị khóa.
  - **AC:** requirement *Mã hóa at rest*, *Phát hiện ciphertext bị sửa hoặc bị chuyển chỗ*, *Khóa mã hóa đến từ môi trường và được kiểm tra khi khởi động*.
  - **Gợi ý:** `Cipher`, `GCMParameterSpec`, `updateAAD`; vì sao **không bao giờ** dùng lại IV với cùng khóa trong GCM?
  - **Review:** yêu cầu AI review bảo mật riêng task này trước khi commit.

- [ ] 3.2 **BE-13 — `account_credential` (V4) + credential store**
  - **Goal / Why:** credential tách bảng, chỉ đi qua store (mã hóa khi ghi, giải mã khi đọc).
  - **Depends:** BE-11, BE-12, BE-21 (`ProviderCredentials`) · **D-14**.
  - **Files:** `db/migration/V4__account_create_account_credential.sql`, entity + repository nội bộ, credential store (`save`/`load`/`delete`, trả `ProviderCredentials` khi đọc), JPA/module test.
  - **Hướng làm:** cột theo bảng ở design (kể cả cột thêm của D-14); `scopes` là `jsonb` mảng chuỗi; 1–1 + cascade; mọi type chứa secret che `toString()`.
  - **Test:** lưu rồi đọc lại bằng store → đúng giá trị; đọc cột bằng SQL thô → không chứa plaintext; chép ciphertext từ account A sang B → đọc B lỗi; xóa account → credential mất (cascade); đổi khóa active rồi ghi lại → `encryption_key_id` mới.
  - **AC:** requirement *Credential tách khỏi dữ liệu nghiệp vụ*, *Sẵn sàng xoay khóa*, *Credential không bao giờ bị lộ ra ngoài* (phần store/log).
  - **Gợi ý:** map `jsonb` với Hibernate 7 (`@JdbcTypeCode(SqlTypes.JSON)`); `JdbcTemplate` trong test để đọc giá trị thô.

## 4. Use case

- [ ] 4.1 **BE-14 — Use case đăng ký kết nối (tạo mới / reconnect) + `AccountConnected`**
  - **Goal / Why:** điểm vào duy nhất mà luồng connect của F04 sẽ gọi; idempotent theo `(owner, provider, externalAccountId)`.
  - **Depends:** BE-13, BE-23 (`ProviderRegistry`), BE-24 (`FakeMessageProvider` cho test).
  - **Files:** `account/application/...` (service + command record), `account/AccountConnected.java` (event, public), module test.
  - **Hướng làm:** kiểm tra provider qua registry → tìm account theo bộ khóa → tạo mới hoặc `reconnect()` → lưu credential → publish event, **tất cả trong một transaction**. Service không gọi provider.
  - **Test:** module test (Spring Modulith): account mới → `CONNECTED` + event (reconnected=false); gọi lại → không thêm account, credential được thay, event (reconnected=true); provider lạ → `UNKNOWN_PROVIDER`, DB không đổi; lỗi khi lưu credential → rollback toàn bộ (không account, không event publication).
  - **AC:** requirement *Đăng ký kết nối idempotent*, *Event của account* (`AccountConnected`).
  - **Gợi ý:** `Scenario`/`PublishedEvents` của Spring Modulith test; giả lập lỗi lưu credential thế nào mà không sửa code production?
  - **Đối chiếu F03:** command nhận `ProviderCredentials` + `refreshToken` tùy chọn; module test nạp cả module `provider` (`FakeMessageProvider` là bean), ví dụ `@ApplicationModuleTest(mode = DIRECT_DEPENDENCIES)`.

## 5. REST API

- [ ] 5.1 **BE-15 — `GET /api/accounts`, `GET /api/accounts/{id}`**
  - **Goal / Why:** màn hình Account Management (02C §8) đọc được danh sách và chi tiết.
  - **Depends:** BE-14 (có dữ liệu qua use case) · security + error model F01.
  - **Files:** `account/api/AccountsController.java`, `AccountResponse` (DTO), query service, error code `ACCOUNT_NOT_FOUND`, web test.
  - **Hướng làm:** luôn lọc theo `CurrentUser`; DTO map tường minh (không trả entity); `capabilities` từ `ProviderRegistry`.
  - **Test:** web test: danh sách đúng thứ tự, mảng rỗng, 404 cho ID không tồn tại **và** ID của owner khác (cùng body), 400 cho UUID sai, 401; JSON không có trường credential (kiểm tra tên field).
  - **AC:** requirement *Liệt kê account*, *Xem một account*, *Cô lập dữ liệu theo chủ sở hữu*.
  - **Gợi ý:** vì sao trả 404 chứ không 403 cho account của người khác?
  - **Đối chiếu F03:** `@WebMvcTest(AccountsController.class)`; `capabilities` qua `ProviderRegistry.find` (không còn connector → `[]`, có test).

- [ ] 5.2 **BE-16 — `PATCH /api/accounts/{id}` + `AccountStatusChanged`**
  - **Goal / Why:** đổi tên, tạm dừng sync, tắt/bật account.
  - **Depends:** BE-15.
  - **Files:** `UpdateAccountRequest` (DTO + validation), method service + controller, `account/AccountStatusChanged.java`, test.
  - **Hướng làm:** trường vắng mặt = giữ nguyên; ít nhất một trường; `enabled` gọi hành vi của aggregate (BE-10), không set `status` trực tiếp; optimistic lock → 409.
  - **Test:** web + module: đổi tên (trim, giới hạn 100), `{}` → 400, `syncEnabled=false` không đổi `status`, `enabled=false` → `DISABLED` + event, `enabled=true` trên account không tắt → no-op không event, xung đột version → 409 `CONCURRENT_MODIFICATION`.
  - **AC:** requirement *Cập nhật account*, *Event của account* (`AccountStatusChanged`).
  - **Gợi ý:** phân biệt "trường vắng mặt" với "trường = null" khi deserialize JSON.

- [ ] 5.3 **BE-17 — `DELETE /api/accounts/{id}` + `AccountRemoved`**
  - **Goal / Why:** gỡ account và hủy credential.
  - **Depends:** BE-16 · **D-13**.
  - **Files:** method service + controller, `account/AccountRemoved.java`, test.
  - **Hướng làm:** theo phương án D-13; credential phải biến mất trong cùng transaction.
  - **Test:** 204; GET sau đó 404; bảng `account_credential` không còn dòng của account; event đúng payload; xóa account của người khác → 404.
  - **AC:** requirement *Xóa account*, *Event của account* (`AccountRemoved`).
  - **Gợi ý:** cascade ở DB hay xóa tường minh trong code — cái nào dễ hiểu hơn cho người đọc sau này?

## 6. Nghiệm thu

- [ ] 6.1 **BE-18 — End-to-end + kiểm tra chống lộ secret + nghiệm thu F02**
  - **Goal / Why:** chứng minh các mảnh ghép chạy cùng nhau và secret không rò ở đâu cả.
  - **Depends:** BE-09…BE-17.
  - **Files:** một full-context test, `apps/sino-api/README.md` (biến môi trường mới, cách tạo khóa), `PROJECT_STATE.md`, file này.
  - **Test:** full-context + Testcontainers: đăng ký qua use case với token mẫu → GET/PATCH/DELETE qua HTTP → output log (output capture) và mọi response **không** chứa token mẫu. Kiểm tra tay bằng psql (ghi kết quả): cột `access_token_enc` không chứa token.
  - **AC:** checklist *Definition of Done — F02* trong `design.md`.
  - ~~**Learning gate:** người dùng tự trả lời 5 câu~~ → agent viết phần F02 vào `docs/knowledge/phase-0-backend-foundation.md` trả lời đủ 5 câu sau (rồi sinh lại `.docx`): (1) AES-GCM, IV và AAD bảo vệ chống những tấn công nào? (2) Đổi khóa khi đã có dữ liệu thì làm từng bước nào? (3) Vì sao luồng connect gọi provider trước rồi mới mở transaction? (4) Bảng chuyển trạng thái. (5) Xóa rồi connect lại thì dữ liệu nào còn, dữ liệu nào mất? **LÝ DO:** cách làm việc mới từ 2026-10-03.
