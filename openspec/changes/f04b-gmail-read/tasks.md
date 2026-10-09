# Phase 2 · F04b — Đọc thư Gmail · Implementation Plan

> **HYBRID mode:** backend AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận ("để tôi làm BE-xx") thì chạy TRAINING: người dùng code theo **Hướng làm** (Level 2) và **Hints** (Level 1), Claude review/test.
> Thiết kế được người dùng duyệt từng phần 2026-10-09 (D-57…D-62). **Chờ người dùng duyệt hồ sơ** trước khi bắt đầu BE-35.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, một commit trên `dev` (không push), cập nhật `docs/knowledge/phase-2-one-provider.md` + `.docx`. Backend: `./mvnw -B -ntp verify` xanh trước khi commit.

## 1. Backend — đọc thư Gmail

- [ ] 1.1 **BE-35 — Contract: cursor có mốc thời gian, mã lỗi `CURSOR_EXPIRED`**
  - **Goal / Why:** bên gọi chọn được khoảng nhập thư lần đầu và biết khi nào phải đọc lại từ đầu, mà contract vẫn không dính kiểu riêng của provider (D-59, D-60).
  - **Depends on:** — (F03, F04a).
  - **Files:** `provider/spi/SyncCursor` (thêm `since`), `provider/spi/ProviderErrorCode` (`CURSOR_EXPIRED`), `src/test/java/dev/sino/provider/spi/**` (test record, contract test kit), `FakeMessageProvider` (tôn trọng `since`).
  - **Hướng làm:** `SyncCursor(String value, Instant since)`; `initial()` = `initial(null)`; `since` chỉ hợp lệ khi `value == null`; `isInitial()` giữ nguyên. Thêm `CURSOR_EXPIRED(false)`. Kit: thêm test "cursor khởi tạo có `since` không trả item cũ hơn".
  - **Test:** `SyncCursorTests` (`initial()` bằng `initial(null)`; cursor có giá trị mà có `since` → từ chối; `since` giữ nguyên); `ProviderErrorCodeTests` (`CURSOR_EXPIRED` không retryable); kit với connector giả; `ModularityTests`.
  - **Acceptance criteria:** delta `provider-contract` (*Contract lấy cập nhật (sync)*, *Phân loại lỗi provider*).
  - **Hints:** Level 1 — "vì sao mốc thời gian chỉ nằm ở cursor khởi tạo mà không ở mọi cursor?".

- [ ] 1.2 **BE-36 — `ProviderAccess`: gọi connector với token còn hạn, refresh, hết quyền**
  - **Goal / Why:** module khác (F05, F07) gọi connector mà không bao giờ thấy token; token được refresh ở một chỗ; account hết quyền chuyển `AUTH_EXPIRED` (D-15 = A', D-62).
  - **Depends on:** BE-35 (không bắt buộc), F04a.
  - **Files:** `account/ProviderAccess`, `account/ProviderCall` (mới, gói gốc), `account/application/*` (cài đặt), `account/infrastructure/oauth/OAuth2Clients` (`refresh`), `account/infrastructure/CredentialStore` (đọc credential kèm refresh token), test.
  - **Hướng làm:** theo design mục 2: nạp account (chưa xóa) và connector; `AUTH_EXPIRED` → ném ngay; nạp credential; còn < 60 giây → refresh; gọi connector; connector ném `AUTH_EXPIRED` → refresh một lần rồi gọi lại. Refresh bằng `RestClientRefreshTokenTokenResponseClient` trên `RestClient` có timeout như `exchange`, ngoài transaction; lưu trong transaction; giữ refresh token và scope cũ khi Google không gửi. `invalid_grant` / lần hai vẫn 401 / không thể refresh → `markAuthExpired()` + `AccountStatusChanged` trong transaction, rồi ném `AUTH_EXPIRED`. Lỗi tạm thời → `PROVIDER_UNAVAILABLE`. Xung đột phiên bản khi lưu → nạp lại.
  - **Test:** DB thật + WireMock đóng vai token endpoint + connector giả: còn hạn → không refresh; sắp hết hạn → refresh, credential mới lưu mã hóa, refresh token cũ giữ; connector `401` → refresh + gọi lại đúng một lần; `401` lần hai → `AUTH_EXPIRED` + event; `invalid_grant` → `AUTH_EXPIRED` + event không token; token endpoint `503` → `PROVIDER_UNAVAILABLE`, trạng thái giữ; account đã xóa → `ACCOUNT_NOT_FOUND`; account `AUTH_EXPIRED` → không gọi gì; credential `TOKEN` + connector `401` → `AUTH_EXPIRED`; log không token; `ModularityTests` (module khác chỉ thấy gói gốc).
  - **Acceptance criteria:** spec `provider-access`.
  - **Hints:** Level 1 — "vì sao refresh phải nằm ngoài transaction, còn lưu token mới thì nằm trong?"; `RestClientRefreshTokenTokenResponseClient`, `OAuth2RefreshTokenGrantRequest`, `TransactionTemplate`.

- [ ] 1.3 **BE-37 — Chuẩn hóa thư Gmail: MIME, chữ, tệp đính kèm, người tham gia**
  - **Goal / Why:** một thư Gmail (JSON `format=full`) thành `NormalizedMessage` / người tham gia / thông tin tệp đúng như Hộp thư cần (D-53, D-61).
  - **Depends on:** —.
  - **Files:** `pom.xml` (`org.jsoup:jsoup`), `provider/infrastructure/gmail/*` (lớp chuẩn hóa mới, tách khỏi `GmailProvider`), `src/test/resources/gmail/*.json` (JSON tự dựng), test.
  - **Hướng làm:** theo design bảng *Chuẩn hóa*: duyệt cây MIME đệ quy; `text/plain` đầu tiên không phải tệp; không có thì `text/html` qua jsoup (bỏ `script`/`style`); giải mã base64url rồi charset; cắt 100 000 ký tự; tệp = phần có tên và `attachmentId`; chiều theo `SENT`, đã đọc theo `UNREAD`, `sentAt` = `internalDate`; người tham gia từ From/To/Cc, `self` theo email của account; tiêu đề bỏ tiền tố trả lời/chuyển tiếp; metadata `subject`, `rfcMessageId`; header RFC 2047 giải mã nếu cần; thư thiếu From/`internalDate` → lỗi chuẩn hóa (để BE-38 đưa vào danh sách bỏ qua).
  - **Test:** đơn vị, không mạng: các trường hợp trong design mục *Testing* (multipart/alternative, chỉ HTML, lồng + tệp + ảnh nhúng, charset, base64url, tiền tố Subject, RFC 2047, `self`, nhãn, cắt 100 000, thiếu From).
  - **Acceptance criteria:** spec `gmail-reading` (*Chuẩn hóa thread và thư*, *Nội dung chữ của thư*).
  - **Hints:** Level 1 — "vì sao dùng `internalDate` của Gmail chứ không dùng header `Date` của thư?"; `Jsoup.parse(...).text()` so với `Jsoup.clean`, `Base64.getUrlDecoder()`, `Charset.forName`.

- [ ] 1.4 **BE-38 — `GmailProvider.fetchUpdates`: lần đầu, theo dõi thay đổi, lỗi, capability**
  - **Goal / Why:** connector Gmail đọc thư thật qua contract (D-59, D-60); bộ test contract của F03 chạy phần sync cho Gmail.
  - **Depends on:** BE-35, BE-37.
  - **Files:** `provider/infrastructure/gmail/GmailProvider` (+ lớp gọi Gmail API nếu cần tách), `GmailProperties` (địa chỉ Gmail API mặc định, test trỏ sang WireMock), test.
  - **Hướng làm:** theo design mục 3–4: `users.getProfile` (email, `historyId`); lần đầu `messages.list q=after:<since giây>&maxResults=50` + `messages.get format=full`; cursor `v1|list|…` rồi `v1|history|…`; theo dõi thay đổi bằng `history.list` (`messageAdded`, `labelAdded`, `labelRemoved`), lấy mỗi thư một lần; bỏ nháp/Spam/Trash; thư `404` bỏ qua; nhóm thư theo `threadId` thành conversation; dịch lỗi theo bảng (đọc lý do `403` từ body, không đưa body vào thông báo); lỗi giữa trang → cả lời gọi thất bại. Capability `READ_MESSAGES`, `THREADS`, `ATTACHMENTS`.
  - **Test:** WireMock đóng vai Gmail: lần đầu đúng `q=after:` và `maxResults`, phân trang, chuyển sang theo dõi thay đổi với `historyId` lúc bắt đầu; theo dõi thay đổi (thư mới, bỏ `UNREAD` → `read` = true); `404` history → `CURSOR_EXPIRED`; thư `404` → bỏ qua; `403 userRateLimitExceeded` → `RATE_LIMITED`; `429` + `Retry-After`; `503` giữa trang → `PROVIDER_UNAVAILABLE`, không batch; không nháp/Spam/Trash; thư thiếu From → vào danh sách bỏ qua; kit F03 (phần sync chạy, không còn bỏ qua); thông báo lỗi không body/token.
  - **Acceptance criteria:** spec `gmail-reading` (*Gmail đọc được thư*, *Lần đọc đầu theo mốc thời gian*, *Theo dõi thay đổi theo historyId*, *Phân loại lỗi của Gmail API*).
  - **Hints:** Level 1 — "vì sao ghi `historyId` lúc **bắt đầu** lần nhập đầu chứ không phải lúc kết thúc?".

- [ ] 1.5 **BE-39 — Test Gmail thật, README, nghiệm thu F04b**
  - **Goal / Why:** đọc thư với Gmail thật trước F05 (D-58); bằng chứng thật cho chuẩn hóa MIME và refresh.
  - **Depends on:** BE-36, BE-38; người dùng kết nối lại một Gmail trên máy local.
  - **Files:** `src/test/java/dev/sino/provider/infrastructure/gmail/RealGmailTests` (hoặc tên tương tự, `@Tag("real-gmail")`), `pom.xml` (Surefire loại tag `real-gmail` khỏi build thường), `apps/sino-api/README.md` (cách chạy), design (DoD), file này, `PROJECT_STATE.md`, `docs/knowledge/phase-2-one-provider.{md,docx}`.
  - **Hướng làm:** test chạy với profile `local`, tìm account Gmail của owner, gọi `ProviderAccess.call(id, (gmail, ctx) -> gmail.fetchUpdates(ctx, SyncCursor.initial(7 ngày trước)))`; kiểm không lỗi, phần lớn thư có chữ, không Subject nào còn `=?`, đếm bỏ qua; **chỉ in số đếm**. Chạy tay; không account Gmail thì test bị bỏ qua (assumption), không đỏ.
  - **Test:** chạy thật; ghi bằng chứng (số đếm, không nội dung). Chưa chạy được → NOT VERIFIED, để task mở.
  - **Acceptance criteria:** checklist *Definition of Done — F04b* trong `design.md`; archive sau `f04a-gmail-connect`.
  - **Hints:** Level 1 — "vì sao test này không được chạy trong `./mvnw verify` của CI?".
