# Phase 2 · F05 — Unified Inbox · Implementation Plan

> **HYBRID mode:** backend AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận ("để tôi làm BE-xx") thì chạy TRAINING: người dùng code theo **Hướng làm** (Level 2) và **Hints** (Level 1), Claude review/test.
> Thiết kế được người dùng duyệt từng phần 2026-10-09 (D-63…D-69). ~~**Chờ người dùng duyệt hồ sơ** trước BE-40.~~ **APPROVED TO IMPLEMENT** 2026-10-09 (người dùng: "duyệt, làm BE-40 đi").
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, một commit trên `dev` (không push), cập nhật `docs/knowledge/phase-2-one-provider.md` + `.docx`. Backend: `./mvnw -B -ntp verify` xanh trước khi commit.

## 1. Backend — lưu thư, lần nhập đầu, API Hộp thư

- [x] 1.1 **BE-40 — Contract: ước lượng số thư, khóa `bulk`; Gmail ước lượng và đánh dấu thư hàng loạt**
  - **Thực hiện (2026-10-09, AUTO):** `MessageProvider.estimateMessages(context, since)` → `OptionalLong`, `default` trả rỗng (Javadoc: không âm, chỉ là ước lượng, không có `READ_MESSAGES` thì rỗng và không gọi provider). `NormalizedMessage.BULK` = `"bulk"` (hằng số của contract, thiếu khóa = không hàng loạt). Kit F03 thêm `anEstimateIsEmptyOrNotNegative` (có và không có mốc) và `aConnectorThatCannotReadEstimatesNothing`; `FakeMessageProvider.Builder.estimate(long)` (không cấu hình hoặc không có `READ_MESSAGES` → rỗng; mẫu "chỉ gửi" của kit cấu hình 5 để kiểm tra thứ hai có ý nghĩa). Gmail: `GmailApi.list(…, maxResults)` dùng chung cho trang 50 thư và ước lượng (`maxResults=1`, `resultSizeEstimate`); `Profile.messagesTotal`; `GmailProvider.estimateMessages` trả rỗng khi Gmail bỏ số hoặc số âm, lỗi HTTP dịch qua `call()` như khi đọc thư. `GmailMessageNormalizer`: nhãn `CATEGORY_PROMOTIONS`/`SOCIAL`/`UPDATES`/`FORUMS` hoặc header `List-Unsubscribe` → `bulk = "true"`. Thư mẫu mới `newsletter.json` (bản tin ở tab Chính, có `List-Unsubscribe`, tự dựng). Test Gmail ước lượng ở lớp mới `GmailEstimateTests` (WireMock), không dồn thêm vào `GmailSyncTests` (613 dòng).
  - **Làm khác kế hoạch:** sửa thêm `provider/spi/NormalizedMessage` ngoài danh sách file (hằng số `BULK`). **LÝ DO:** tên khóa là một phần của contract; connector và module `conversation` (BE-43) dùng chung một hằng số thay vì gõ lại chuỗi. Assertion cũ của `html-only.json` đổi từ "metadata chỉ có `subject`" sang `subject` + `bulk` (thư mẫu có nhãn `CATEGORY_PROMOTIONS`).
  - **Kiểm chứng (2026-10-09):** RED: 15 test đỏ đúng chỗ (connector giả 1, Gmail ước lượng 6, chuẩn hóa 8). GREEN. Kiểm tra ngược: 16/16 lỗi cố ý có test đỏ, lần chạy mốc xanh (`docs/knowledge/phase-2-one-provider.md` mục 11.5). `./mvnw -B -ntp verify`: 678 test, 0 lỗi, 3 bỏ qua (thêm 1: kiểm tra "không đọc được thì không ước lượng" của kit tự bỏ qua với Gmail), BUILD SUCCESS; `ModularityTests` xanh.
  - **Sau review (2026-10-09):** agent `senior-reviewer` không thấy CRITICAL/HIGH. MEDIUM: file kiến thức viết rằng D-68 "chấp nhận" việc thư qua Google Groups bị coi là hàng loạt, trong khi D-68 không bàn tới → bỏ câu đó, ghi **Decision Needed** vào Open Questions của design (giữ quy tắc / thu hẹp theo `List-Id` / đánh dấu tay), cần chốt trước BE-43; code giữ đúng D-68. LOW đã sửa: thêm `429` → `RATE_LIMITED` và `400` không có page token → `REQUEST_REJECTED` cho đường ước lượng. LOW không sửa code: ước lượng toàn bộ hộp thư bằng `messagesTotal` (đếm cả nháp, spam, thùng rác) thay vì `resultSizeEstimate` của danh sách không có `q`. **LÝ DO:** D-65 và spec `gmail-reading` đã duyệt `messagesTotal`; đây là số đếm chính xác còn `resultSizeEstimate` vốn thô, nên chọn cách nào là câu hỏi đo đạc → ghi cho BE-46 so cả hai với số nhập thật. LOW ghi cho BE-45: cột `estimated_count int` so với `OptionalLong`; lúc `DONE` không được còn số phút hay phần trăm dở dang chỉ vì ước lượng dư. Sau sửa: `GmailEstimateTests` 10 test xanh.
  - **Goal / Why:** bước "Đồng bộ" cần số thư ước lượng (D-65); "Cần trả lời" cần biết thư hàng loạt (D-68).
  - **Depends on:** — (F04b).
  - **Files:** `provider/spi/MessageProvider` (`estimateMessages`), kit F03 (`MessageProviderContractTest`), `FakeMessageProvider` (ước lượng cấu hình được), `provider/infrastructure/gmail/{GmailProvider,GmailApi,GmailMessageNormalizer}`, thư mẫu `src/test/resources/gmail/*.json`, test.
  - **Hướng làm:** `default OptionalLong estimateMessages(ProviderContext context, Instant since)` trả rỗng; kit: rỗng hoặc ≥ 0, connector không có `READ_MESSAGES` thì rỗng. Gmail: có `since` → `messages.list q=after:<giây> maxResults=1` lấy `resultSizeEstimate`; không có → `users.getProfile` lấy `messagesTotal`. Chuẩn hóa: nhãn `CATEGORY_PROMOTIONS`/`SOCIAL`/`UPDATES`/`FORUMS` hoặc header `List-Unsubscribe` → metadata `bulk = "true"`.
  - **Test:** WireMock (có mốc, toàn bộ, `401`/`503`, JSON hỏng); thư mẫu bản tin có `List-Unsubscribe`, thư `CATEGORY_PROMOTIONS`, thư cá nhân không có `bulk`; kit với connector giả; `ModularityTests`.
  - **Acceptance criteria:** delta `provider-contract` (*Ước lượng số thư*, *Khóa metadata dùng chung*), delta `gmail-reading`.
  - **Hints:** Level 1 — "vì sao hàm ước lượng có cài đặt mặc định trong interface, còn `fetchUpdates` thì không?".

- [x] 1.2 **BE-41 — `AccountDirectory`: module khác đọc danh sách account**
  - **Thực hiện (2026-10-09, AUTO):** gói gốc `account`: interface `AccountDirectory` (`accountsOf(ownerId)` cũ trước mới, mọi trạng thái; `find(ownerId, accountId)` → `Optional`, mọi trạng thái) và record `AccountSummary(id, provider, status, externalAccountId)` (bắt buộc cả bốn). Cài đặt `account/application/AccountDirectoryService` (`@Transactional(readOnly = true)`) dùng lại hai truy vấn của API account (`findByOwnerIdAndRemovedAtIsNullOrderByCreatedAtAscIdAsc`, `findByIdAndOwnerIdAndRemovedAtIsNull`); `ConnectedAccountRepository` không đổi. Test: `AccountDirectoryServiceTests` (`@DataJpaTest`, PostgreSQL thật), `AccountSummaryTests` (đúng bốn trường, không credential).
  - **Làm khác kế hoạch:** không cần truy vấn mới trong `ConnectedAccountRepository` (kế hoạch ghi "nếu cần"). **LÝ DO:** hai truy vấn của API account đã đúng luật (chưa xóa, đúng owner, cũ trước mới); dùng lại để luật chỉ nằm một chỗ.
  - **Kiểm chứng (2026-10-09):** RED: 4 test đỏ trên service tạm trả rỗng. GREEN. Kiểm tra ngược 12/12, lần chạy mốc xanh. `./mvnw -B -ntp verify`: 687 test, 0 lỗi, 3 bỏ qua, BUILD SUCCESS, `ModularityTests` 2/2.
  - **Sau review (2026-10-09):** agent `senior-reviewer` không thấy CRITICAL/HIGH. MEDIUM: test thứ tự đặt `created_at` đúng theo thứ tự mong đợi, nên một truy vấn quên `ORDER BY` có thể xanh nhờ thứ tự dòng của PostgreSQL; file kiến thức khẳng định quá. Chạy thử: lỗi "bỏ `ORDER BY`" vẫn bị test cũ bắt (PostgreSQL đọc qua index unique), nhưng đó là may → đổi thứ tự cập nhật để thứ tự lưu, thứ tự cập nhật và thứ tự index đều khác kết quả mong đợi; lỗi đó vẫn bị bắt; sửa mục 12.4. LOW đã sửa: `find` trả account `DISABLED`/`AUTH_EXPIRED` có test và Javadoc (lỗi "`find` chỉ trả `CONNECTED`" bị bắt); `design.md` dòng phụ thuộc module thêm gói gốc `provider` (`ProviderType`). LOW không sửa: hai tham số UUID liền nhau có thể bị đảo ở bên gọi → BE-44/45 test `find` với account thật. Sau sửa: `AccountDirectoryServiceTests` 6/6, `AccountSummaryTests` 2/2, `ModularityTests` 2/2; full verify chạy trước các sửa này (code chính chỉ đổi Javadoc).
  - **Goal / Why:** `conversation` và `sync` cần biết account nào của owner còn hoạt động, provider gì, trạng thái gì, mà không chạm vào bảng của `account`.
  - **Depends on:** —.
  - **Files:** `account/AccountDirectory`, `account/AccountSummary` (gói gốc), cài đặt trong `account/application`, `ConnectedAccountRepository` nếu cần truy vấn mới, test.
  - **Hướng làm:** `accountsOf(ownerId)` → account chưa xóa của owner (cũ trước mới), `AccountSummary(id, provider, status, externalAccountId)`; `find(ownerId, accountId)` → `Optional`; chỉ đọc, không credential.
  - **Test:** account đã xóa không có; owner khác không có; `ModularityTests` (module khác chỉ thấy gói gốc).
  - **Acceptance criteria:** delta `connected-accounts` (*Module khác đọc danh sách account*).
  - **Hints:** Level 1 — "vì sao module khác không được tự `JOIN` bảng `connected_account`?".

- [ ] 1.3 **BE-42 — Module `conversation`: bảng và `ConversationStore.store`**
  - **Goal / Why:** lưu thư idempotent theo external ID (D-63, 02B §4, §11).
  - **Depends on:** BE-41 (không bắt buộc).
  - **Files:** migration V6 `conversation_create_conversation`, V7 `conversation_create_conversation_participant`, V8 `conversation_create_message`, V9 `conversation_create_attachment`; `conversation/ConversationStore`, `conversation/StoreResult` (gói gốc), cài đặt (`JdbcClient`), test.
  - **Hướng làm:** theo design mục 1–2 bước 1–4: upsert conversation, người tham gia (giữ tên cũ, `is_self` cộng dồn), thư (`ON CONFLICT … DO UPDATE … WHERE` có thay đổi), tệp (upsert + xóa tệp không còn); thư không có conversation → conversation tối thiểu; người gửi ngoài danh sách → thêm; chạy trong transaction của bên gọi.
  - **Test:** DB thật (Testcontainers): cùng batch hai lần → không trùng, lần hai 0/0; thư đổi chữ → cập nhật, giữ ID; tệp giữ ID, tệp bị bỏ thì xóa; thư không có conversation; người gửi ngoài danh sách; `ModularityTests`.
  - **Acceptance criteria:** spec `conversation-store` (*Lưu một trang thư idempotent*, *Người tham gia và tệp được gộp, không mất*).
  - **Hints:** Level 1 — "`ON CONFLICT DO UPDATE` khác gì `findBy…` rồi `save` của JPA khi hai lượt cùng lưu một thư?"; `RETURNING (xmax = 0)`.

- [ ] 1.4 **BE-43 — Tổng hợp conversation, đã đọc, lưu trữ, cần trả lời**
  - **Goal / Why:** các con số của Hộp thư luôn đúng với thư đã lưu, kể cả batch theo dõi thay đổi chỉ có vài thư (D-67, D-68).
  - **Depends on:** BE-42.
  - **Files:** cài đặt `ConversationStore` (bước 5), migration cột tổng hợp nếu chưa có ở V6, test.
  - **Hướng làm:** theo design mục 2 bước 3 (quy tắc `is_read`/`provider_read`) và bước 5 (tính lại từ `message`: thư mới nhất, đoạn xem trước 200 ký tự, người gửi, `counterpart`, `unread_count`, `has_attachments`, `needs_reply`; thư đến mới hơn → bỏ lưu trữ); tiêu đề chỉ đổi khi có thư mới hơn.
  - **Test:** batch chỉ có một thư cũ vừa đọc → tổng hợp đúng; đã đọc trong Sino + Gmail thêm nhãn → vẫn đọc; Gmail đổi sang đã đọc → theo; thư đến mới bỏ lưu trữ, thư đi mới không; cần trả lời với thư đến/đi/`bulk`; đoạn xem trước gộp khoảng trắng, cắt 200; `counterpart`.
  - **Acceptance criteria:** spec `conversation-store` (*Tổng hợp…*, *Trạng thái đã đọc…*, *Thư đến mới…*, *Cần trả lời*).
  - **Hints:** Level 1 — "vì sao tính lại từ bảng `message` mà không cộng trừ `unread_count` theo từng thư?".

- [ ] 1.5 **BE-44 — API Hộp thư**
  - **Goal / Why:** web thay dữ liệu mẫu của Hộp thư bằng dữ liệu thật (FR-02).
  - **Depends on:** BE-41, BE-43.
  - **Files:** `conversation/api/*` (controller, DTO `ConversationItem`, cursor), truy vấn danh sách/số đếm/chi tiết, `PATCH`, mã lỗi `CONVERSATION_NOT_FOUND`, `SecurityConfig` nếu cần, test.
  - **Hướng làm:** theo design mục 4: phạm vi qua `AccountDirectory` (bỏ account đã xóa và `DISABLED`); view; lọc provider/account; keyset `(last_message_at, id)`, cursor base64url; `limit` 1–100; ánh xạ item; số đếm; `PATCH` đọc/chưa đọc/lưu trữ rồi tính lại tổng hợp; không ghi sang provider.
  - **Test:** MockMvc + DB thật: các view; lọc; lật trang khi nhiều conversation cùng giờ; account đã xóa và `DISABLED` bị ẩn; `400` (view, limit, cursor, accountId); `404`; `PATCH`; số đếm; CSRF cho `PATCH`; `EXPLAIN ANALYZE` câu danh sách (ghi vào file kiến thức).
  - **Acceptance criteria:** spec `inbox-api`.
  - **Hints:** Level 1 — "vì sao phân trang keyset phải sắp theo cả `id` chứ không chỉ `last_message_at`?".
  - **Hẹn với phiên web (sino-web-33, 2026-10-09; web làm FE-50 trên MSW theo design mục 4):** `lastMessageAt` là ISO-8601 UTC đuôi `Z`, có thể có mili giây (giờ Gmail); `participants[]` đề xuất `{ externalId, name, avatarUrl, self }` (`name`, `avatarUrl` có thể `null`). Hình dạng khác đề xuất này thì nhắn "sino-web-33" trước khi commit.

- [ ] 1.6 **BE-45 — Module `sync`: lần nhập đầu chạy nền**
  - **Goal / Why:** người dùng chọn khoảng, thấy ước lượng và tiến độ, việc nhập chạy nền và chịu được lỗi, khởi động lại (D-64, D-69).
  - **Depends on:** BE-40, BE-41, BE-43.
  - **Files:** migration V10 `sync_create_sync_checkpoint`; `sync/**` (API ước lượng/bắt đầu/trạng thái, vòng nhập, executor virtual thread, chạy tiếp khi `ApplicationReadyEvent`, cấu hình thời gian chờ); `conversation` gói gốc `ConversationStats.storedMessages`; `FakeMessageProvider` (ném lỗi theo kịch bản); test.
  - **Hướng làm:** theo design mục 3: `range` → `since`; giữ một lượt bằng `UPDATE … WHERE import_status <> 'RUNNING'`; cùng khoảng sau `FAILED` → nhập tiếp, khác → nhập lại; vòng: `ProviderAccess.call` ngoài transaction, `TransactionTemplate` { `store` + cursor + đếm }; xử lý lỗi theo bảng; `remainingMinutes`.
  - **Test:** DB thật + connector giả: nhập 3 trang → `DONE`, cursor theo dõi thay đổi lưu; bắt đầu hai lần → một lượt; `RATE_LIMITED` rồi qua; `PROVIDER_UNAVAILABLE` quá số lần → `FAILED`; `CURSOR_EXPIRED` → đọc lại một lần; `AUTH_EXPIRED` → `FAILED`; nhập tiếp/nhập lại; dòng `RUNNING` khi sẵn sàng → chạy tiếp; lưu lỗi → cursor không tiến; `404`/`400`; log không nội dung; `ModularityTests`.
  - **Acceptance criteria:** spec `initial-sync`.
  - **Hints:** Level 1 — "vì sao ghi cursor cùng transaction với việc lưu thư, còn gọi provider thì ngoài transaction?".
  - **Ghi chú từ review BE-40:** `estimateMessages` trả `OptionalLong` mà cột `estimated_count` là `int` → chặn khi đổi kiểu (hoặc dùng `bigint`); ước lượng toàn bộ hộp thư của Gmail (`messagesTotal`) thường dư, nên khi `DONE` thì `remainingMinutes` rỗng và web hiện xong, không dựa vào `imported`/`estimated`.

- [ ] 1.7 **BE-46 — Nhập thật với Gmail, README, nghiệm thu F05**
  - **Goal / Why:** bằng chứng thật cho việc lưu và API Hộp thư trước khi web dùng; đo tốc độ để ước lượng số phút đúng hơn.
  - **Depends on:** BE-44, BE-45; Gmail đang kết nối trên máy local (Testing: 7 ngày).
  - **Files:** `src/test/java/…/RealGmailImportTests` (hoặc tương tự, `@Tag("real-gmail")`), hằng số tốc độ ước lượng, `apps/sino-api/README.md` (API Hộp thư, lần nhập đầu, chạy test thật), design (DoD), file này, `PROJECT_STATE.md`, `docs/knowledge/phase-2-one-provider.{md,docx}`.
  - **Hướng làm:** test chạy với profile `local`, bắt đầu nhập `DAYS_30` cho account Gmail đã kết nối, chờ `DONE`, so số conversation/thư/chưa đọc/cần trả lời giữa database và API; in số đếm và tốc độ; chỉnh tốc độ giả định nếu lệch nhiều. Không account Gmail → bỏ qua.
  - **Ghi chú từ review BE-40:** in thêm ba số để so với số thư nhập thật: `resultSizeEstimate` có mốc, `messagesTotal`, và `resultSizeEstimate` của danh sách không có `q`; nếu `messagesTotal` lệch nhiều hơn thì đổi cách ước lượng toàn bộ hộp thư (sửa D-65, hỏi người dùng).
  - **Test:** chạy thật; ghi bằng chứng (số đếm, không nội dung). Chưa chạy được → NOT VERIFIED, để task mở.
  - **Acceptance criteria:** checklist *Definition of Done — F05* trong `design.md`; archive sau `f04b-gmail-read`.
  - **Hints:** Level 1 — "vì sao nhập vào database local trong test thật lại chấp nhận được, còn trong CI thì không?".

## 2. Web — phiên web (sino-web-41) nhận; phiên backend không sửa `apps/sino-web`

- [ ] 2.1 **FE-50 — Hộp thư trên API thật:** `GET /api/conversations` (view, lọc, infinite scroll bằng `nextCursor`), `GET /api/conversations/counts`, `PATCH` đọc/chưa đọc/lưu trữ; bỏ dữ liệu mẫu ở `inbox.api.ts`. Phụ thuộc BE-44.
- [ ] 2.2 **FE-51 — Bước "Đồng bộ" của luồng kết nối trên API thật:** ước lượng, bắt đầu, hỏi tiến độ cho tới `DONE`/`FAILED`; `INITIAL_SYNC_READY = true`. Hai công tắc "Dùng nhãn Gmail làm bộ lọc", "Chỉ tải tệp đính kèm khi bạn mở" chưa có tác dụng (design, Open Questions). Phụ thuộc BE-45.
- [ ] 2.3 **FE-52 — Trang Tài khoản:** `syncProgress`, `storedMessages` từ `GET /api/accounts/{id}/initial-sync`; nút nhập tiếp khi `FAILED`. Phụ thuộc BE-45.
