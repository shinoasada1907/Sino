# Phase 3 · F07 + F08 — Hộp thư realtime · Implementation Plan

> **HYBRID mode:** backend AUTO. Người dùng 2026-10-10: "làm luôn đi không cần trình bày" — agent làm hết các task backend theo thứ tự, mỗi task kiểm chứng và commit riêng trên `dev` (không push); lựa chọn còn mở ghi trong design là "agent chốt theo ủy quyền".
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, `./mvnw -B -ntp verify` xanh, cập nhật `docs/knowledge/phase-3-sync-realtime.md` + `.docx`.
> Change dùng chung: phiên web (sino-web-33) thêm mục 2 (FE-53…) và mục **Web** trong design.

## 1. Backend — phiên backend

- [x] 1.1 **BE-48 — Đồng bộ tăng dần và "Đồng bộ ngay"**
  - **Thực hiện (2026-10-10, AUTO):** V12 `last_sync_at`, `last_sync_attempt_at`, `last_sync_error`. `ImportRunner`: hai lượt (`Pass.IMPORT`, `Pass.SYNC`) trên cùng vòng đọc trang; dòng `DONE` → lượt đồng bộ từ con trỏ đã lưu; `advanceSync` tiến con trỏ và (trang cuối) ghi thành công trong một câu `WHERE import_status = 'DONE'`, không khớp → rollback trang, lượt dừng; đầu mỗi vòng kiểm dòng vẫn `DONE`; lỗi → `last_sync_error`, import vẫn `DONE`; yêu cầu đến trong lúc đọc gộp thành **một** lượt nữa (`updateAndGet`); `Error` thoát ra thì đặt lại bộ đếm rồi ném tiếp. `CURSOR_EXPIRED` khi đồng bộ đọc lại từ một ngày trước lần đọc trọn gần nhất. `start()` xóa trạng thái đồng bộ cũ. `LiveSyncService` + `LiveSyncController` (`POST`/`GET /api/accounts/{id}/sync`), `IMPORT_NOT_DONE`; kiểm account dùng chung qua `AccountChecks`.
  - **Làm khác kế hoạch:** (1) ~~`account/AccountDirectory.byId`, `AccountSummary` (+ `ownerId`, `syncEnabled`) ở BE-48~~ → chuyển sang BE-49. **LÝ DO:** BE-48 không dùng tới; lịch (BE-49) là nơi đầu tiên cần. (2) ~~V12 có cả ba cột `watch_*` và index~~ → V12 chỉ có ba cột `last_sync_*`; cột watch vào V13 cùng BE-51. **LÝ DO:** mỗi task một migration chỉ chứa cột của nó. (3) ~~`CURSOR_EXPIRED` khi đồng bộ đọc lại từ `import_since`~~ → từ một ngày trước lần đọc trọn gần nhất (design, Chốt kỹ thuật; review BE-48). (4) Yêu cầu đến trong lúc **nhập lần đầu** giờ làm một lượt đồng bộ ngay khi nhập xong (đọc thay đổi xảy ra trong lúc nhập); test `startingTwiceRunsOnce` của F05 đổi kỳ vọng thành 3 lần gọi nhập + 1 lần đồng bộ.
  - **Kiểm chứng (2026-10-10):** RED 10/11 (CSRF xanh từ đầu); GREEN. Kiểm tra ngược lần 1: 14 lỗi cố ý, 2 sống sót (không nhận ra nhập lại; không ghi lần thử) → test giữ 2 trang cho lượt đồng bộ và thư ngoài khoảng 30 ngày, kiểm `last_sync_attempt_at` → bắt được. `./mvnw -B -ntp verify` → 846 test, 0 lỗi, 3 bỏ qua.
  - **Sau review (2026-10-10):** agent `senior-reviewer` không thấy CRITICAL/HIGH. MEDIUM đã sửa: (1) `Error` thoát khỏi worker làm bộ đếm kẹt, account không bao giờ đồng bộ lại (đã báo từ BE-45) → `catch (Error)` đặt lại bộ đếm, test `anErrorInAWorkerDoesNotBlockTheAccount`; (2) thiếu test cho lượt đồng bộ → thêm: tắt máy giữa lượt, account tắt/hết quyền/bị xóa giữa lượt, con trỏ hết hạn hai lần, bị giới hạn tần suất, lỗi sau khi nhập lại, đồng bộ đang chờ thử lại khi nhập lại. LOW đã sửa: `startOver` chỉ cho dòng `RUNNING` và đầu vòng kiểm `DONE`; `start()` xóa `last_sync_*`; loại lượt xác định trước `beginSync`; ghi thành công cùng câu với tiến con trỏ; hai lớp test chung một context; tên luồng `mail-sync-`, câu báo `ACCOUNT_DISABLED`, Javadoc. Câu hỏi của review (đọc lại từ `import_since`) → đổi cách đọc lại (Làm khác kế hoạch 3). LOW không sửa: "Đồng bộ ngay" với account `AUTH_EXPIRED` vẫn `202` rồi ghi lỗi (đúng spec, web có nút "Đăng nhập lại"); log WARN lặp lại mỗi lượt lỗi → xử lý ở BE-49 khi có lịch. Test `requestsDuringASyncMakeOneMorePass` là kiểm tra theo xác suất (lượt thứ ba phải tới trong 200 ms mới thấy), đã ghi trong test.
  - **Kiểm chứng sau review:** RED 4 test mới đỏ đúng 4 lỗi review nêu; GREEN 57 test của module `sync`. Kiểm tra ngược lần 2: 23 lỗi cố ý, 21 bị bắt; 2 sống sót có chủ đích: bỏ `import_status = 'DONE'` khỏi `beginSync` và bỏ `import_status = 'RUNNING'` khỏi `startOver`. **LÝ DO giữ:** cả hai chỉ có tác dụng khi dòng đổi trong khe giữa hai câu SQL liền nhau của cùng một luồng (người dùng nhập lại đúng lúc đó; `startOver` chỉ lượt nhập gọi trên dòng nó đang giữ), không dựng được trong test mà không thêm móc vào code; là chốt an toàn rẻ. `./mvnw -B -ntp verify` → 856 test, 0 lỗi, 3 bỏ qua, BUILD SUCCESS, `ModularityTests` 2/2.
  - **Goal / Why:** sau lần nhập đầu, thư mới vào Sino bằng cách đọc thay đổi từ con trỏ, không nhập lại cả khoảng (D-79).
  - **Depends on:** F05 (BE-45).
  - **Files:** migration V12 `sync_add_live_sync`; `sync/application/ImportRunner` (chế độ đồng bộ), `sync/infrastructure/SyncCheckpoints` (đọc dòng, tiến cursor có điều kiện, ghi trạng thái đồng bộ), `sync/api` (`POST`/`GET /api/accounts/{id}/sync`), mã lỗi `IMPORT_NOT_DONE`; `account/AccountDirectory.byId`, `AccountSummary` (+ `ownerId`, `syncEnabled`); test.
  - **Hướng làm:** theo design mục 1, 2, 7: `run` đọc dòng; `DONE` → lượt đồng bộ dùng chung vòng đọc trang; lỗi cuối ghi `last_sync_error`, không `FAILED`; tiến cursor `WHERE import_status = 'DONE'`.
  - **Test:** DB thật + `ScriptedProvider`: thư mới → lưu, cursor tiến, `lastSyncAt`; lỗi → `lastError`, vẫn `DONE`; thành công xóa lỗi; `CURSOR_EXPIRED` → đọc lại; nhập lại giữa lượt; API `202`/`404`/`409` hai loại/CSRF/trạng thái; `byId`.
  - **Acceptance criteria:** spec `live-sync` (Đồng bộ tăng dần, Lỗi khi đồng bộ, Đồng bộ ngay, Trạng thái đồng bộ); delta `connected-accounts`.
  - **Hints:** Level 1 — "vì sao tiến cursor phải kèm điều kiện `import_status = 'DONE'`?".

- [x] 1.2 **BE-49 — Đồng bộ tự động theo lịch**
  - **Thực hiện (2026-10-10, AUTO):** `LiveSyncScheduler.dueAccounts()` = `SyncCheckpoints.dueForSync(poll-interval)` (dòng `DONE`, `coalesce(last_sync_attempt_at, last_success_at) < now() - make_interval(...)` theo đồng hồ của PostgreSQL), bỏ account đang được đọc (`ImportRunner.isReading`), lọc qua `AccountDirectory.byId` (bỏ tạm dừng, `DISABLED`, `AUTH_EXPIRED`, đã xóa); `syncDueAccounts()` gọi `submit`. Nhịp nằm ở bean `LiveSyncSchedule` (`@Scheduled(fixedDelayString = "${sino.sync.live.tick:PT15S}")`, lần đầu 15 giây sau khởi động), có `@ConditionalOnProperty(sino.sync.live.scheduled)`; profile test tắt; lần quét hỏng (database sập) được bắt và log một lần. `LiveSyncProperties.poll-interval` (60 giây, phải dương). Thời điểm thử ghi lại khi lượt kết thúc (thành công hoặc lỗi). `syncFailed` trả lỗi có mới không; lỗi lặp lại (cả lỗi không lường trước kèm stack trace) log DEBUG; dòng chờ/đọc lại của lượt đồng bộ là DEBUG. `AccountDirectory.byId`, `AccountSummary` + `ownerId`, `syncEnabled` (chuyển từ BE-48).
  - **Làm khác kế hoạch:** (1) ~~gọi thẳng hàm quét với `Clock` cố định~~ → không dùng `Clock` của Java nữa: mốc đến hạn tính bằng `now()` của PostgreSQL; test dựng thời điểm bằng SQL tương đối (`now() - interval`). **LÝ DO (review):** các thời điểm được so đều do PostgreSQL ghi; so với đồng hồ của JVM thì lệch giờ giữa Windows và máy ảo Docker làm lịch hỏi dồn hoặc thưa. (2) ~~`@EnableScheduling` có điều kiện (`SyncConfiguration.Scheduling`)~~ → công tắc nằm trên bean `LiveSyncSchedule`. **LÝ DO:** kiểm tra ngược bỏ `@EnableScheduling` mà lịch vẫn chạy: `spring-modulith-moments` đã bật scheduling cho cả ứng dụng, nên công tắc cũ không tắt được gì. (3) Scenario "Account có watch" (5 phút) của spec `live-sync` chuyển sang BE-51, khi có cột watch.
  - **Kiểm chứng (2026-10-10):** RED với bốn chỗ logic thay bằng bản rỗng: 6 test đỏ; GREEN. Kiểm tra ngược 14 lỗi cố ý, 13 bị bắt; cái sống sót (bỏ `@EnableScheduling` có điều kiện) lộ ra công tắc không có tác dụng → sửa, thêm 3 lỗi cố ý (bỏ công tắc, bỏ `@Scheduled`: bị bắt; bỏ `@EnableScheduling`: sống sót có chủ đích vì thư viện khác đã bật). `./mvnw -B -ntp verify` → 865 test, 0 lỗi, 3 bỏ qua.
  - **Sau review (2026-10-10):** agent `senior-reviewer` không thấy CRITICAL/HIGH. MEDIUM đã sửa: (1) hai đồng hồ (Java và PostgreSQL) → mốc tính trong SQL; (2) lượt dài hơn khoảng hỏi (bị giới hạn tần suất, Gmail sập) bị nối ngay một lượt nữa → lịch bỏ account đang được đọc, thời điểm thử ghi lại khi lượt kết thúc; (3) chỉ một dòng log được chặn lặp → lỗi không lường trước in stack trace một lần, dòng chờ/đọc lại của lượt đồng bộ là DEBUG. LOW đã sửa: `@DirtiesContext` cho `ScheduledSyncTests` (lịch 0,2 giây không chạy tiếp suốt bộ test); `poll-interval` phải dương; lần quét hỏng không làm ồn log; "failed again" khi lần nhập vừa bắt đầu lại; Javadoc `AccountDirectoryService`; file kiến thức. LOW ghi nhận: mỗi lần quét tra từng account (`byId`), account tạm dừng/tắt/đã xóa vẫn được tra mỗi lần — nhỏ với MVP, tra gộp để sau; tạm dừng đúng lúc lượt đã xếp hàng vẫn chạy lượt đó một lần. Thêm 6 test (đang đọc thì không đến hạn, lượt hỏng/thành công tính từ lúc xong, lỗi lạ log một lần, lần quét hỏng, khoảng phải dương); kiểm tra ngược 8/8 bị bắt. `./mvnw -B -ntp verify` → 871 test, 0 lỗi, 3 bỏ qua, BUILD SUCCESS, `ModularityTests` 2/2.
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

- [x] 2.2 **FE-54 — Hàng mới, "N thư mới", số Hộp thư thật**
  - **Thực hiện (2026-10-10, AUTO):** `format.ts`: `arrivedRows` (hàng chưa thấy nằm **trên** hàng cũ đầu tiên; tối đa 6 thì trượt), `newMailText`. `ConversationList`: `useArrivedRows` giữ hàng vừa tới tới lần đổi sau (để hiệu ứng chạy hết), đổi bộ lọc hoặc đang tải view khác thì không tính; hàng mới có `data-arrived="slide"` → `animate-row-in` (6 px + mờ dần, `--dur-page`, `--ease-out`), giảm chuyển động → chỉ mờ; dòng "N thư mới" (`role="status"`) ở đầu danh sách, bấm thì cuộn lên đầu. `useNewMailNotice`: cộng `newInbound` của sự kiện `source = sync`, ẩn sau 6 s kể từ thư cuối. `shared/realtime/streamState.ts`: `publishConversationsChanged` / `onConversationsChanged`. Số "Hộp thư" của thanh điều hướng: query `['inbox-unread']` (`GET /api/conversations/counts`).
  - **Làm khác kế hoạch:**
    - ~~D-93 dùng chung query `['inbox']`~~ → query riêng `['inbox-unread']`, chỉ hỏi `/counts`. **LÝ DO:** shell giữ nó ở mọi trang; dùng chung `['inbox']` thì mọi lần Hộp thư bị đánh dấu cũ (sự kiện, lần nhập xong) đều tải lại cả khung (3 request) dù đang ở trang khác; các test của màn Tài khoản đỏ vì vậy.
    - ~~Dòng báo tự ẩn khi đã cuộn lên đầu~~ → ẩn sau 6 s hoặc khi bấm. **LÝ DO:** đủ cho mục đích báo; theo dõi vị trí cuộn là thêm một listener cho mỗi danh sách.
    - Hàng bên dưới không trượt xuống (MotionSpec: `ease.standard`), mà nhảy ngay. **LÝ DO:** cần đo vị trí từng hàng trước và sau (FLIP); để sau nếu cần.
    - Dòng báo nằm trong vùng đầu danh sách (cạnh chữ "Hộp thư" ở màn lớn, che một phần chip lọc ở tablet trong 6 s).
  - **Kiểm chứng (2026-10-10):** hàm thuần RED 4 / hook RED / màn RED, GREEN; test của shell đặt số "Hộp thư" qua dữ liệu Hộp thư. Chrome (EventSource thật, luồng do CDP trả lời, sự kiện tới sau 2,5 s) 1440 tối và 390 sáng: **lỗi tìm được** — lần tải đầu (danh sách từ rỗng sang có) làm mọi hàng trượt vào; sửa: danh sách trước rỗng thì không có gì để so (test thêm ca này, đỏ rồi xanh); sau khi sửa: lần tải đầu 0 hàng "mới", sự kiện → 2 hàng `row-in`, "2 thư mới", số "Hộp thư" 1 → 3, không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `vitest` 475/475, `pnpm build` 0.
  - **Goal / Why:** thư mới hiện như canvas MotionSpec C và người dùng thấy ngay có thư (D-92, D-93).
  - **Depends on:** FE-53.
  - **Files:** `src/features/inbox/` (danh sách: nhớ ID, đánh dấu hàng mới; dòng báo), `src/app/shell/` (số "Hộp thư" từ counts), test.
  - **Test:** hàm thuần hàng mới / ≤ 6 / > 6 / chữ; màn: `sync` → 2 hàng trượt + "2 thư mới", `user` → không báo, bấm dòng báo → lên đầu; số điều hướng theo counts.
  - **Acceptance criteria:** spec `inbox-live` (Hàng mới và dòng báo, Số Hộp thư).

- [x] 2.3 **FE-55 — "Đồng bộ ngay", trạng thái đồng bộ, báo mất kết nối**
  - **Thực hiện (2026-10-10, AUTO):** `accounts.api.ts`: `fetchSyncStatus` (`GET …/sync`), `requestSync` (`POST …/sync`); `useLiveSync.ts`: `useSyncStatus` (khóa `['accounts', id, 'sync']`, nên `account.changed` đọc lại; chỉ hỏi khi lần nhập đã `DONE`), `useRequestSync`. Trang chi tiết: tài khoản đã nhập xong → "Đồng bộ ngay" gọi `POST` (không mở bước "Đồng bộ"); dòng "Đồng bộ lần cuối … · thư mới về ngay / sau khoảng 1 phút"; lỗi đồng bộ gần nhất; `409 IMPORT_NOT_DONE` / `ACCOUNT_DISABLED` có câu riêng (`role="alert"`). `useRealtimeDown`: luồng không mở quá 30 s → `connecting` hoặc `closed`; Hộp thư hiện `RealtimeBanner` khi còn mạng.
  - **Làm khác kế hoạch:**
    - Thêm trường hợp trình duyệt bỏ hẳn luồng (`closed`): "Thư mới có thể về chậm · tải lại trang để kết nối lại" + nút "Tải lại". **LÝ DO:** lúc đó trình duyệt không tự nối lại nữa (ví dụ phiên hết hạn, hoặc backend chưa có `/api/events/stream` nên trả `404`); câu "đang kết nối lại…" sẽ sai.
    - "Đồng bộ ngay" và dòng trạng thái chỉ ở đầu trang chi tiết màn lớn; trang chi tiết điện thoại chưa có nút này. **LÝ DO:** trang vẽ hai bố cục rồi ẩn một; đặt nút ở cả hai thì có hai nút trong DOM; để sau.
  - **Kiểm chứng (2026-10-10):** RED (hook chưa có, trang chưa gọi API), GREEN; hai test chi tiết cũ trả lời thêm `GET …/sync`. Chrome: 1440 tối — chi tiết hiện "Đồng bộ lần cuối 2 phút trước · thư mới về sau khoảng 1 phút" và "Lần đồng bộ gần nhất lỗi: Gmail chưa trả lời. Hãy thử lại sau.", bấm "Đồng bộ ngay" → `POST /api/accounts/acc-1/sync`, không có hộp thoại; Hộp thư khi luồng trả `404`: trước 30 s không có dòng báo, sau 31 s có "… tải lại trang để kết nối lại" + "Tải lại" ở 1440 tối và 390 sáng. `pnpm lint` 0, `tsc -b` 0, `vitest` 481/481, `pnpm build` 0.
  - **Lưu ý:** backend người dùng đang chạy chưa có BE-50, nên Hộp thư sẽ hiện dòng báo này sau 30 s cho tới khi có BE-50.
  - **Goal / Why:** "Đồng bộ ngay" chỉ đọc thay đổi; người dùng biết thư mới về ngay hay chậm và khi realtime mất kết nối (D-94, D-95).
  - **Depends on:** FE-53; hợp đồng `live-sync` (`POST`/`GET /api/accounts/{id}/sync`).
  - **Files:** `src/features/accounts/` (`accounts.api.ts`, trang chi tiết, `ImportAlert`), `src/features/inbox/` (dòng báo mất kết nối), test.
  - **Test:** `POST …/sync` cho tài khoản đã nhập, `409` hai loại; trạng thái "lần cuối", lỗi, push; mất kết nối > 30 s → dòng báo, mở lại → ẩn.
  - **Acceptance criteria:** spec `inbox-live` (Đồng bộ ngay trên web, Báo mất kết nối).

- [x] 2.4a **FE-55b — Theo BE-49: đọc lại khi không có luồng, trạng thái đồng bộ đọc lại mỗi phút** (người dùng 2026-10-10: "xem BE làm tới đâu rồi để update FE"; BE-49 `a9d275a`)
  - **Thực hiện (2026-10-10, AUTO):** `useEventStream`: khi luồng không mở, đọc lại `['inbox']` và `['inbox-unread']` mỗi 60 s; luồng mở thì thôi. `useSyncStatus`: `refetchInterval` 60 s (D-96).
  - **Kiểm chứng (2026-10-10):** RED 2 (không đọc lại; trạng thái chỉ đọc một lần), GREEN. Chạy cả bộ thấy hai test ngắt kết nối tài khoản lúc đỏ lúc xanh; chạy lại trên code đã commit (cất thay đổi bằng `git stash -u`) cũng đỏ 2/3 lần → lỗi có từ trước, do đường "xóa → đọc lại danh sách → về danh sách" quá 3 s khi máy tải nặng (phiên backend build cùng lúc); sửa riêng ở `ee4b6b2` (chờ 8 s), sau đó 3/3 lần xanh. `pnpm lint` 0, `tsc -b` 0, `vitest` 484/484, `pnpm build` 0. Không đổi giao diện nên không chạy Chrome.

- [ ] 2.4 **FE-56 — Chạy với backend thật (sau BE-50; đủ khi có BE-53)**
  - **Goal / Why:** bằng chứng: gửi một thư tới Gmail, thư hiện trong Hộp thư đang mở không cần tải lại.
  - **Depends on:** FE-53…FE-55, BE-48…BE-50 (lịch 60 s đủ cho lần đầu; webhook khi có BE-52 và cấu hình Pub/Sub).
  - **Test:** chạy thật trên backend người dùng chạy từ `dev`; ghi thời gian từ lúc gửi tới lúc hàng hiện; ảnh chụp 1440 và 390; không ghi nội dung thư.
  - **Acceptance criteria:** spec `inbox-live` toàn bộ; DoD (phần web).
