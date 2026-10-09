# Phase 3 · F07 + F08 — Hộp thư realtime · Implementation Plan

> **HYBRID mode:** backend AUTO. Người dùng 2026-10-10: "làm luôn đi không cần trình bày" — agent làm hết các task backend theo thứ tự, mỗi task kiểm chứng và commit riêng trên `dev` (không push); lựa chọn còn mở ghi trong design là "agent chốt theo ủy quyền".
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, `./mvnw -B -ntp verify` xanh, cập nhật `docs/knowledge/phase-3-sync-realtime.md` + `.docx`.
> Change dùng chung: phiên web (sino-web-33) thêm mục 2 (FE-53…) và mục **Web** trong design.

## 1. Backend — phiên backend

- [ ] 1.1 **BE-48 — Đồng bộ tăng dần và "Đồng bộ ngay"**
  - **Goal / Why:** sau lần nhập đầu, thư mới vào Sino bằng cách đọc thay đổi từ con trỏ, không nhập lại cả khoảng (D-79).
  - **Depends on:** F05 (BE-45).
  - **Files:** migration V12 `sync_add_live_sync`; `sync/application/ImportRunner` (chế độ đồng bộ), `sync/infrastructure/SyncCheckpoints` (đọc dòng, tiến cursor có điều kiện, ghi trạng thái đồng bộ), `sync/api` (`POST`/`GET /api/accounts/{id}/sync`), mã lỗi `IMPORT_NOT_DONE`; `account/AccountDirectory.byId`, `AccountSummary` (+ `ownerId`, `syncEnabled`); test.
  - **Hướng làm:** theo design mục 1, 2, 7: `run` đọc dòng; `DONE` → lượt đồng bộ dùng chung vòng đọc trang; lỗi cuối ghi `last_sync_error`, không `FAILED`; tiến cursor `WHERE import_status = 'DONE'`.
  - **Test:** DB thật + `ScriptedProvider`: thư mới → lưu, cursor tiến, `lastSyncAt`; lỗi → `lastError`, vẫn `DONE`; thành công xóa lỗi; `CURSOR_EXPIRED` → đọc lại; nhập lại giữa lượt; API `202`/`404`/`409` hai loại/CSRF/trạng thái; `byId`.
  - **Acceptance criteria:** spec `live-sync` (Đồng bộ tăng dần, Lỗi khi đồng bộ, Đồng bộ ngay, Trạng thái đồng bộ); delta `connected-accounts`.
  - **Hints:** Level 1 — "vì sao tiến cursor phải kèm điều kiện `import_status = 'DONE'`?".

- [ ] 1.2 **BE-49 — Đồng bộ tự động theo lịch**
  - **Goal / Why:** thư mới vào Sino trong khoảng một phút khi chưa có webhook, và là dự phòng khi đã có.
  - **Depends on:** BE-48.
  - **Files:** `sync/application/LiveSyncScheduler`, `LiveSyncProperties` (`sino.sync.live.*`), `@EnableScheduling`, truy vấn dòng đến hạn trong `SyncCheckpoints`; test.
  - **Hướng làm:** design mục 3: quét mỗi 15 giây; đến hạn theo `coalesce(last_sync_attempt_at, last_success_at)` và watch; lọc đủ điều kiện qua `AccountDirectory.byId`; `submit`.
  - **Test:** gọi thẳng hàm quét với `Clock` cố định: đến hạn/chưa đến hạn, có watch, tạm dừng, `DISABLED`, `AUTH_EXPIRED`, đã xóa; lịch thật bật trong một test ngắn.
  - **Acceptance criteria:** spec `live-sync` (Đồng bộ tự động).
  - **Hints:** Level 1 — "vì sao hạn tính theo lần **thử** gần nhất chứ không theo lần thành công?".

- [ ] 1.3 **BE-50 — Sự kiện và SSE (module `realtime`)**
  - **Goal / Why:** web đang mở biết ngay khi Hộp thư hay account đổi (D-77, D-78).
  - **Depends on:** BE-48.
  - **Files:** `conversation/StoreResult` (+ `conversationIds`, `newInbound`), `JdbcConversationStore`, event `conversation/ConversationChanged` (phát trong `PATCH`); event `sync/MailStored`, `sync/SyncStateChanged`; module mới `realtime/**` (luồng, sự kiện, nghe event sau commit); `SecurityConfig` (dispatch `ASYNC`); `application.yaml` (`spring.modulith.events.completion-mode: delete`, `sino.realtime.*`); test.
  - **Hướng làm:** design mục 6: `@TransactionalEventListener(fallbackExecution = true)`; tìm owner; gửi trên executor virtual thread; `retry`, heartbeat, giới hạn luồng, đóng sau 20 phút, đóng hết khi tắt.
  - **Test:** HTTP thật (`java.net.http`): `401`; `retry` + heartbeat (thời gian ngắn trong test); lưu thư → `conversations.changed` đúng owner, owner khác không nhận; `PATCH` → `source=user`; rollback → không có; luồng thứ 6; không có nội dung thư; `account.changed` khi nhập một trang.
  - **Acceptance criteria:** spec `realtime-events`.
  - **Hints:** Level 1 — "vì sao gửi sự kiện **sau commit** chứ không ngay lúc lưu?".

- [ ] 1.4 **BE-51 — Gmail watch**
  - **Goal / Why:** Gmail biết gửi thông báo cho Sino (D-76).
  - **Depends on:** BE-48.
  - **Files:** `provider/spi/MessageProvider.registerPush`, `PushRegistration`; `GmailApi.watch`, `GmailProvider` (`PUSH_WEBHOOK` khi có topic), `GmailProperties` (`sino.google.pubsub.*`); `sync/application/PushWatches` (đăng ký sau `DONE`, gia hạn mỗi giờ); `.env.example`; test.
  - **Hướng làm:** design mục 3, 4.
  - **Test:** contract kit (`registerPush` mặc định rỗng, không gọi provider); WireMock: body `watch`, `expiration` → hạn, lỗi → `REQUEST_REJECTED`; không topic → không `PUSH_WEBHOOK`; `PushWatches`: đăng ký khi `DONE`, gia hạn khi còn dưới 2 ngày, không khi còn lâu, lỗi → `push=FAILED`.
  - **Acceptance criteria:** spec `gmail-push` (đăng ký, giữ watch còn hạn); delta `provider-contract`.
  - **Hints:** Level 1 — "vì sao địa chỉ của watch lấy từ profile Gmail chứ không từ `address` của account?".

- [ ] 1.5 **BE-52 — Webhook Gmail**
  - **Goal / Why:** thông báo của Gmail tới Sino trong vài giây, và chỉ Google gửi được (D-76).
  - **Depends on:** BE-51.
  - **Files:** `provider/infrastructure/gmail/GmailPushController` (+ kiểm token), event `provider/ProviderPushReceived`; `sync` nghe event; `SecurityConfig` (`POST /api/webhooks/*` công khai, không CSRF); test.
  - **Hướng làm:** design mục 5.
  - **Test:** khóa RSA của test, JWKS bằng WireMock, token ký bằng Nimbus: hợp lệ → `204` + `submit` đúng account; thiếu token/chữ ký sai/hết hạn/sai `aud`/sai `email`/`email_verified=false`/sai `iss` → `401`; nội dung hỏng, địa chỉ lạ, account đã xóa hoặc tạm dừng → `204` không `submit`; không cấu hình → `404`; không log địa chỉ.
  - **Acceptance criteria:** spec `gmail-push` (webhook, thông báo chỉ là tín hiệu).
  - **Hints:** Level 1 — "Pub/Sub gửi lại khi nhận lỗi: vì sao nội dung hỏng vẫn trả `204` còn token sai thì `401`?".

- [ ] 1.6 **BE-53 — Chạy thật, README, nghiệm thu backend**
  - **Goal / Why:** bằng chứng thật: thư gửi tới Gmail test hiện trong Sino không cần tải lại.
  - **Depends on:** BE-48…BE-52; người dùng đã cấu hình Pub/Sub và ngrok (nếu chưa: kiểm qua lịch, webhook NOT VERIFIED).
  - **Files:** `apps/sino-api/README.md` (Pub/Sub từng bước, ngrok với traffic policy chỉ cho đường dẫn webhook, API mới), file kiến thức, design (DoD), file này, `PROJECT_STATE.md`.
  - **Test:** chạy thật; ghi thời gian từ lúc gửi tới lúc có sự kiện SSE; chỉ số đếm, không nội dung.
  - **Acceptance criteria:** DoD trong `design.md` (phần backend).

## 2. Web — phiên web (sino-web-33)
> Phiên web thêm các task FE-53… ở đây.
