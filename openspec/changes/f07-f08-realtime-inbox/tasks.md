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
> Mode HYBRID, frontend AUTO; người dùng 2026-10-10: "làm luôn không cần trình bày hay hỏi nữa". Mỗi task: test đỏ trước rồi xanh, `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`, Chrome một lượt ở cỡ màn task đụng tới (quy ước kiểm chứng frontend trong `CLAUDE.md`), file kiến thức Phase 1 + `.docx`, commit riêng trên `dev`. Làm trước theo hợp đồng trong spec (contract-first, như FE-50), chạy với backend thật ở FE-56.

- [x] 2.1 **FE-53 — Kênh sự kiện của web**
  - **Thực hiện (2026-10-10, AUTO):** `src/app/realtime/useEventStream.ts` gắn ở `AppShell` (chỉ có sau `RequireAuth`): một `EventSource('/api/events/stream')`; `conversations.changed` → đọc lại `['inbox']`; `account.changed` → `['accounts']` và `['inbox']`; mở lại sau khi mất → đọc lại cả hai; đóng khi rời app. `src/shared/realtime/streamState.ts`: trạng thái luồng (`connecting` / `open` / `closed`) qua `useSyncExternalStore`; `useAccounts` chỉ hỏi lại mỗi 2 s khi có lần nhập đang chạy **và** luồng không mở. `src/test/eventSource.ts`: EventSource giả cho mọi test (`open`, `emit`, `drop`, `fail`), cài trong `test/setup.ts`.
  - **Làm khác kế hoạch:** ~~`src/shared/realtime/useEventStream.ts`~~ → hook nằm ở `src/app/realtime/`, trạng thái luồng ở `src/shared/realtime/`. **LÝ DO:** hook phải biết khóa query của Hộp thư và Tài khoản (code của `features`), còn `useAccounts` cần đọc trạng thái luồng; để cả hai trong một file thì `features` và file đó import lẫn nhau.
  - **Kiểm chứng (2026-10-10):** RED 5/5 (app chưa mở luồng), GREEN. Chrome (EventSource thật, luồng do CDP trả lời): sự kiện tới sau khi dữ liệu đã về → Hộp thư đọc lại ngay (4,0 s); luồng kết thúc → trình duyệt nối lại sau 3 s theo `retry: 3000` → đọc lại Hộp thư và tài khoản (7,0 s). Lần thử đầu, sự kiện tới lúc dữ liệu đầu tiên của trang còn đang tải: TanStack Query chỉ chờ request đang chạy, không gửi request mới (một EventSource thử trong trang xác nhận Chrome có phát sự kiện) → ghi là giới hạn đã biết (chỉ trong khoảnh khắc mở trang; lần nối lại sau bù). `pnpm lint` 0, `tsc -b` 0, `vitest` 467/467, `pnpm build` 0.
  - **Goal / Why:** web đang mở biết khi nào cần đọc lại Hộp thư và danh sách tài khoản (D-90, D-91).
  - **Depends on:** hợp đồng `realtime-events` (không cần backend chạy: EventSource giả trong test).
  - **Files:** `src/shared/realtime/useEventStream.ts` (+ trạng thái luồng cho D-91, D-94), `src/app/shell/AppShell.tsx`, `src/features/accounts/useAccounts.ts` (polling chỉ khi luồng không mở), `src/test/eventSource.ts`, test.
  - **Test:** sự kiện → đúng query bị đọc lại; nối lại → đọc lại cả hai; `CLOSED` → không mở lại; polling 2 s chỉ khi luồng không mở.
  - **Acceptance criteria:** spec `inbox-live` (Web nghe sự kiện, Nối lại).

- [ ] 2.2 **FE-54 — Hàng mới, "N thư mới", số Hộp thư thật**
  - **Goal / Why:** thư mới hiện như canvas MotionSpec C và người dùng thấy ngay có thư (D-92, D-93).
  - **Depends on:** FE-53.
  - **Files:** `src/features/inbox/` (danh sách: nhớ ID, đánh dấu hàng mới; dòng báo), `src/app/shell/` (số "Hộp thư" từ counts), test.
  - **Test:** hàm thuần hàng mới / ≤ 6 / > 6 / chữ; màn: `sync` → 2 hàng trượt + "2 thư mới", `user` → không báo, bấm dòng báo → lên đầu; số điều hướng theo counts.
  - **Acceptance criteria:** spec `inbox-live` (Hàng mới và dòng báo, Số Hộp thư).

- [ ] 2.3 **FE-55 — "Đồng bộ ngay", trạng thái đồng bộ, báo mất kết nối**
  - **Goal / Why:** "Đồng bộ ngay" chỉ đọc thay đổi; người dùng biết thư mới về ngay hay chậm và khi realtime mất kết nối (D-94, D-95).
  - **Depends on:** FE-53; hợp đồng `live-sync` (`POST`/`GET /api/accounts/{id}/sync`).
  - **Files:** `src/features/accounts/` (`accounts.api.ts`, trang chi tiết, `ImportAlert`), `src/features/inbox/` (dòng báo mất kết nối), test.
  - **Test:** `POST …/sync` cho tài khoản đã nhập, `409` hai loại; trạng thái "lần cuối", lỗi, push; mất kết nối > 30 s → dòng báo, mở lại → ẩn.
  - **Acceptance criteria:** spec `inbox-live` (Đồng bộ ngay trên web, Báo mất kết nối).

- [ ] 2.4 **FE-56 — Chạy với backend thật (sau BE-50; đủ khi có BE-53)**
  - **Goal / Why:** bằng chứng: gửi một thư tới Gmail, thư hiện trong Hộp thư đang mở không cần tải lại.
  - **Depends on:** FE-53…FE-55, BE-48…BE-50 (lịch 60 s đủ cho lần đầu; webhook khi có BE-52 và cấu hình Pub/Sub).
  - **Test:** chạy thật trên backend người dùng chạy từ `dev`; ghi thời gian từ lúc gửi tới lúc hàng hiện; ảnh chụp 1440 và 390; không ghi nội dung thư.
  - **Acceptance criteria:** spec `inbox-live` toàn bộ; DoD (phần web).
