# Phase 3 · F07 + F08 — Hộp thư realtime · Technical Design

> Mode: **HYBRID** — backend AUTO. Người dùng chốt trong buổi brainstorm 2026-10-10: thư mới hiện ngay trong Sino (D-78), Gmail báo cho Sino qua webhook, chọn cách "an toàn và bảo mật nhất" (D-76); rồi giao phần còn lại: "làm luôn đi không cần trình bày". Chỗ ghi **agent chốt theo ủy quyền** là lựa chọn của agent, có phương án bị loại, để người dùng xem lại.
> Change dùng chung với phiên web: phiên backend viết phần backend; phiên web (sino-web-33) thêm mục **Web** và các task FE. Số quyết định: backend D-76…D-79, web D-90 trở đi.
> Nguồn: Gmail API (`users.watch`, `users.stop`, `users.history.list`, thông báo push qua Cloud Pub/Sub), Cloud Pub/Sub (push subscription có xác thực OIDC), roadmap F07/F08 (người dùng bảo bỏ kế hoạch cũ nếu không còn hợp), canvas "Sino UI" (`Inbox`, `Notifications`, `MobilePushSetup`: thông báo chỉ dành cho nhắc nhở, nội dung tin nhắn không rời khỏi Sino).

## Context

- Hiện trạng (2026-10-10): F05 nhập lần đầu chạy nền (`ImportRunner`, mỗi account một luồng nhờ bộ đếm yêu cầu, provider gọi ngoài transaction, lưu thư và tiến cursor trong một transaction, bảng xử lý lỗi). Khi nhập xong, `sync_checkpoint.cursor` là con trỏ theo dõi thay đổi của Gmail (`v1|history|<historyId>|<since>`), `import_status = 'DONE'`. Không có gì chạy lại sau đó.
- `GmailProvider.fetchUpdates` với con trỏ history gọi `history.list` (thư thêm, nhãn thêm/bỏ); `historyId` quá cũ (khoảng hơn một tuần) → `CURSOR_EXPIRED`. Gmail chưa có `watch`/`stop`; chưa khai báo `PUSH_WEBHOOK`.
- `ConversationStore.store` trả `StoreResult(newMessages, updatedMessages)`; bên trong biết thư nào mới, chiều thư, conversation nào bị ảnh hưởng nhưng chưa trả ra. Chưa có event nào khi lưu thư; chưa có listener event nào trong code chính.
- Bảo mật: phiên bằng cookie (`POST /api/auth/login`, remember-me), CSRF kiểu SPA, `/api/**` cần đăng nhập, còn lại `denyAll`. Chưa có lịch chạy (`@Scheduled`), chưa có SSE.
- Thư viện kiểm JWT (Nimbus, `spring-security-oauth2-jose`) đã có trên classpath qua starter OAuth2 client.

## Goals / Non-Goals

**Goals:**
- Thư mới tới Gmail vào Sino trong vài giây khi webhook chạy, chậm nhất khoảng một phút khi chưa có webhook; không cần người dùng bấm gì.
- Web đang mở thấy ngay: danh sách, số đếm, cuộc trò chuyện đang mở, dòng báo "N thư mới".
- Webhook công khai nhưng chỉ Google gọi được; không lộ nội dung thư qua sự kiện; một account không bao giờ bị đọc song song.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-76 — Gmail báo thay đổi qua Pub/Sub push (webhook), có hỏi dự phòng · **Accepted** (người dùng, 2026-10-10)
Sino gọi `users.watch` với topic Pub/Sub của dự án; Pub/Sub POST thông báo tới `POST /api/webhooks/gmail` kèm token OIDC do Google ký cho tài khoản dịch vụ của push subscription. Sino kiểm chữ ký bằng khóa công khai của Google, `iss`, `aud`, `email`, `email_verified`, thời hạn; không giữ khóa bí mật nào của Google Cloud. Thông báo (`emailAddress`, `historyId`) chỉ là tín hiệu; Sino tự đọc thay đổi bằng `history.list`. Vẫn hỏi định kỳ làm dự phòng: Pub/Sub có thể trễ hay mất tin, watch có thể hết hạn, và máy local thường chưa có đường hầm. Người dùng chọn webhook ("khi có người gửi mail thì BE có thể biết được thông qua … webhook của gmail") và chọn kiểu "an toàn và bảo mật nhất". **Phương án bị loại:** B. streaming pull (Sino giữ kết nối gRPC tới Pub/Sub, chạy được ở localhost không cần đường hầm, nhưng phải giữ khóa JSON dài hạn của một tài khoản dịch vụ và thêm thư viện gRPC nặng); C. chỉ hỏi định kỳ (trễ tới cả phút); D. IMAP IDLE (cần quyền đọc và sửa toàn bộ hộp thư `https://mail.google.com/`).

### D-77 — SSE từ Sino tới trình duyệt · **Accepted** (agent chốt theo ủy quyền, 2026-10-10: "phù hợp nhất với task này")
`GET /api/events/stream` (`text/event-stream`), một chiều server → trình duyệt. Trình duyệt tự gửi cookie phiên (D-22) và tự nối lại; Spring MVC có `SseEmitter`, không thêm thư viện; thao tác ngược lại vẫn đi REST. **Phương án bị loại:** WebSocket (hai chiều nhưng Sino chưa cần; thêm thư viện, tự lo xác thực lúc bắt tay, tự nối lại, cấu hình proxy riêng). Khi có tính năng cần hai chiều (đang gõ…), thêm WebSocket bên cạnh.

### D-78 — Thư mới chỉ hiện trong Sino · **Accepted** (người dùng, 2026-10-10)
Khi tab Sino đang mở: thư mới lên đầu Hộp thư, số chưa đọc đổi, cuộc trò chuyện đang mở tự tải lại, kèm một dòng báo nhỏ "N thư mới" khi thư đến từ đồng bộ. Không xin quyền gì. **Phương án bị loại:** B. thông báo của trình duyệt/hệ điều hành (Notification API; hiện người gửi và tiêu đề trên màn hình khóa, lệch nguyên tắc "nội dung tin nhắn không rời khỏi Sino" của canvas); C. Web Push khi đã đóng tab (F14; canvas chỉ dùng push cho nhắc nhở).

### D-79 — Đồng bộ tăng dần trong module `sync`, lịch bằng `@Scheduled` · **Accepted** (agent chốt theo ủy quyền, 2026-10-10)
Lần nhập đầu và đồng bộ tăng dần là hai chế độ của cùng một vòng đọc trang trong `ImportRunner`: cùng bộ đếm yêu cầu theo account (không bao giờ hai luồng cho một account), cùng bảng xử lý lỗi, cùng cách "provider ngoài transaction, lưu + tiến cursor trong một transaction". Mọi cò chỉ gọi `submit(accountId)`; `run` đọc dòng `sync_checkpoint` để biết làm gì. Lịch hỏi định kỳ và gia hạn watch dùng `@Scheduled` của Spring trong module `sync`; giả định một tiến trình backend. **Phương án bị loại:** B. chờ F13 (bảng `scheduled_job`, lease) — chưa cần cho một tiến trình; C. module riêng cho đồng bộ tăng dần — tách đôi vòng đọc trang và phải phối hợp khóa giữa hai module.

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Khoảng hỏi định kỳ:** 60 giây khi account chưa có watch còn hạn, 5 phút khi có; lịch quét mỗi 15 giây; đều là cấu hình (`sino.sync.live.*`). Account được hỏi khi lần thử gần nhất cũ hơn khoảng của nó, nên lỗi không bị hỏi dồn mỗi 15 giây.
- **Account được đồng bộ tự động:** chưa xóa, không `DISABLED`, không `AUTH_EXPIRED`, `syncEnabled = true`, lần nhập đầu `DONE`. "Đồng bộ ngay" chạy cả khi đã tạm dừng đồng bộ tự động (người dùng bấm tay), nhưng không chạy với `DISABLED` (`409`) hay khi chưa nhập xong (`409 IMPORT_NOT_DONE`).
- **`CURSOR_EXPIRED` khi đồng bộ:** ~~đọc lại từ `import_since` như lần nhập đầu~~ → đọc lại thư từ **một ngày trước lần đọc trọn gần nhất** (`last_sync_at`, chưa có thì `last_success_at` của lần nhập), một lần mỗi lượt; lần thứ hai thì ghi lỗi và giữ con trỏ đã lưu. **LÝ DO (review BE-48):** `import_since` đóng băng từ ngày nhập, nên mỗi tháng trôi qua lần đọc lại càng dài; với khoảng "toàn bộ" là cả hộp thư. Thư trước lần đọc trọn gần nhất đã có trong Sino; đọc lại chúng chỉ để cập nhật nhãn của thư cũ (xóa và thùng rác vốn chưa được theo dõi, BE-38). Con trỏ đọc lại mang mốc mới nên được lưu như con trỏ thường, không cần cột mới.
- **Lỗi đồng bộ không làm `FAILED` lần nhập đầu:** ghi `last_sync_error`; lượt sau thành công thì xóa. `AUTH_EXPIRED` vẫn do `ProviderAccess` chuyển trạng thái account như F04b.
- **Watch:** đăng ký ngay khi lần nhập đầu `DONE`; mỗi giờ kiểm và gia hạn watch sắp hết hạn trong 2 ngày (Google khuyên gọi lại ít nhất mỗi 7 ngày); lỗi ghi `watch_error` và thử lại ở lần kiểm sau. Không theo nhãn: watch cả hộp thư, giống phạm vi nhập. Account bị xóa không gọi `stop` (token đã bị thu hồi lúc xóa); thông báo của địa chỉ không còn account nào thì bị bỏ qua.
- **Webhook:** chỉ tạo khi đủ ba cấu hình (topic, `audience`, tài khoản dịch vụ). Token sai → `401` (Pub/Sub thử lại, không ai khác qua được). Token đúng mà nội dung hỏng hoặc địa chỉ lạ → `204` (báo nhận để Pub/Sub không gửi lại mãi) và log WARN không có địa chỉ. Đúng → `204` ngay, đồng bộ chạy nền. Không log `emailAddress`.
- **Từ thông báo tới account:** provider phát event `ProviderPushReceived(provider, address)` (gói gốc `provider`); `sync` nghe, tìm các dòng có `watch_address` trùng (không phân biệt hoa thường) và provider khớp, rồi `submit`. Connector Gmail giữ phần riêng của Google (Pub/Sub, OIDC); `sync` không biết Google.
- **Event sau commit:** `sync` phát `MailStored` trong transaction lưu trang (chỉ khi có thư mới hoặc đổi) và `SyncStateChanged` (tiến độ nhập, xong/lỗi nhập, lỗi đồng bộ đổi, watch đổi); `conversation` phát `ConversationChanged` khi người dùng `PATCH`; `realtime` nghe bằng `@TransactionalEventListener` (sau commit; `fallbackExecution` cho event ngoài transaction) nên web không bao giờ được báo về dữ liệu chưa commit. Registry event của Spring Modulith lưu các publication này; `spring.modulith.events.completion-mode: delete` để bảng `event_publication` không phình.
- **Envelope không có nội dung thư:** ID, con số, nguồn. Web tự gọi lại API nên mọi kiểm tra quyền vẫn ở API.
- **SSE:** mỗi người dùng tối đa 5 luồng (tab); luồng thứ 6 đóng luồng cũ nhất. Mỗi luồng sống 20 phút rồi server đóng, trình duyệt nối lại (kiểm lại đăng nhập, phiên hết hạn → `401`). Gửi `retry: 3000` và comment `:` mỗi 25 giây; header `X-Accel-Buffering: no`, `Cache-Control: no-store`. Gửi trên executor virtual thread của `realtime` để luồng lưu thư không chờ mạng. Tắt ứng dụng thì đóng mọi luồng.
- **Phiên đăng nhập:** mỗi lần trình duyệt nối lại là một request, nên phiên 30 phút không hết hạn khi tab Sino còn mở. Chấp nhận (giống các ứng dụng thư khác); đăng xuất vẫn kết thúc phiên ngay.

## Backend design

### 1. Dữ liệu (V12, V13)
`sync_checkpoint` thêm (V12, BE-48: ba cột `last_sync_*`; V13, BE-51: ba cột `watch_*` và index):

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `last_sync_at` | `timestamptz` | lần đồng bộ tăng dần thành công gần nhất |
| `last_sync_attempt_at` | `timestamptz` | lần thử gần nhất (thành công hay lỗi), để lịch không hỏi dồn |
| `last_sync_error` | `varchar(40)` | mã lỗi của lần đồng bộ gần nhất, `NULL` khi thành công |
| `watch_address` | `text` | địa chỉ hộp thư mà thông báo push mang (Gmail: `emailAddress` của profile) |
| `watch_expires_at` | `timestamptz` | watch còn hạn tới khi nào; `NULL` = không có |
| `watch_error` | `varchar(40)` | lỗi của lần đăng ký watch gần nhất |

Index `sync_checkpoint (lower(watch_address)) WHERE watch_address IS NOT NULL` cho webhook.

### 2. Đồng bộ tăng dần (`ImportRunner`)
```text
submit(accountId)  <- webhook | lịch | POST /sync | nhập đầu xong
  worker (một luồng mỗi account, bộ đếm yêu cầu như F05)
    run(accountId): đọc sync_checkpoint
      RUNNING -> vòng nhập đầu (F05, không đổi)
      DONE    -> lượt đồng bộ:
                   ghi last_sync_attempt_at
                   cursor = cursor đã lưu (NULL sau khi đọc lại -> initial(import_since))
                   lặp: batch = ProviderAccess.call(fetchUpdates(cursor))      ngoài transaction
                        transaction { store(batch); tiến cursor WHERE import_status='DONE';
                                      MailStored(live=true) nếu có thay đổi }
                   tới khi !hasMore -> last_sync_at, xóa last_sync_error
      khác    -> không làm gì
```
- Lỗi: cùng bảng của lần nhập đầu (`RATE_LIMITED` chờ, `PROVIDER_UNAVAILABLE` 10/30/60 giây, `CURSOR_EXPIRED` đọc lại một lần, `CURSOR_STUCK`); lỗi cuối cùng ghi `last_sync_error`, không đổi `import_status`. Luồng bị ngắt (tắt máy) thì không ghi gì.
- Tiến cursor có điều kiện `import_status = 'DONE'`: nếu người dùng bắt đầu nhập lại giữa lúc đồng bộ, câu cập nhật không khớp dòng nào → transaction rollback, lượt đồng bộ dừng; lần nhập mới chạy ngay sau (bộ đếm yêu cầu).
- Nhập đầu xong (`DONE`) → đăng ký watch nếu connector hỗ trợ.

### 3. Các cò
- **Lịch (`LiveSyncScheduler`, mỗi 15 giây):** chọn dòng `DONE` có `coalesce(last_sync_attempt_at, last_success_at)` cũ hơn 60 giây (không có watch còn hạn) hoặc 5 phút (có), lọc account đủ điều kiện qua `AccountDirectory.byId`, `submit`. Khởi động: lần quét đầu sau 15 giây tự lo các account đã lâu chưa đồng bộ; dòng `RUNNING` vẫn do `ImportResumer`.
- **Webhook:** `ProviderPushReceived` → dòng có `watch_address` trùng → lọc đủ điều kiện → `submit`.
- **"Đồng bộ ngay":** `POST /api/accounts/{id}/sync` (mục 7).
- **Gia hạn watch (`PushWatches`, mỗi giờ, lần đầu sau 1 phút):** dòng `DONE` của account đủ điều kiện, provider có `PUSH_WEBHOOK`, `watch_expires_at` rỗng hoặc trong vòng 2 ngày → `ProviderAccess.call(registerPush)` → lưu địa chỉ và hạn, hoặc `watch_error`.

### 4. Contract và Gmail watch
- `MessageProvider.registerPush(ProviderContext)` → `Optional<PushRegistration(address, expiresAt)>`, mặc định rỗng; connector có `PUSH_WEBHOOK` mới cài.
- Gmail khai báo `PUSH_WEBHOOK` khi có topic (`sino.google.pubsub.topic`). `registerPush`: `users.getProfile` (lấy `emailAddress`) rồi `POST users/me/watch {"topicName": …}` → `expiration` (mili giây). Lỗi theo bảng ánh xạ hiện có (topic sai/thiếu quyền → `REQUEST_REJECTED`).

### 5. Webhook Gmail
- `POST /api/webhooks/gmail` trong connector Gmail (gói `provider/infrastructure/gmail`), chỉ có khi đủ topic, `audience`, tài khoản dịch vụ.
- Kiểm `Authorization: Bearer <JWT>` bằng `NimbusJwtDecoder` với JWKS của Google (`https://www.googleapis.com/oauth2/v3/certs`, cấu hình được cho test): chữ ký, `exp`/`nbf`, `iss` ∈ {`https://accounts.google.com`, `accounts.google.com`}, `aud` chứa `audience` đã cấu hình, `email` = tài khoản dịch vụ đã cấu hình, `email_verified = true`.
- Body Pub/Sub: `{"message": {"data": base64(JSON {"emailAddress", "historyId"}), "messageId", …}, "subscription"}`.
- `SecurityConfig`: `POST /api/webhooks/*` không cần đăng nhập, không CSRF; mọi kiểm tra nằm ở controller.

### 6. Event và SSE (module `realtime`)
```text
sync:          MailStored(accountId, conversationIds, newInbound, live)   -> conversations.changed (source import|sync)
conversation:  ConversationChanged(accountId, conversationId)              -> conversations.changed (source user)
sync:          SyncStateChanged(accountId)                                 -> account.changed
account:       AccountStatusChanged | AccountConnected | AccountRemoved    -> account.changed
                 | (sau commit) realtime: tìm owner (AccountDirectory.byId hoặc ownerId của event) -> các luồng của owner
```
- `conversations.changed`: `{ "type", "accountId", "conversationIds": [...], "newInbound", "source": "import" | "sync" | "user", "at" }`. `account.changed`: `{ "type", "accountId", "at" }`. Tên `event:` trùng `type`. Không `id:`.
- `StoreResult` thêm `conversationIds` (các conversation bị ảnh hưởng) và `newInbound` (thư đến vừa được thêm).
- `AccountDirectory.byId(accountId)` (account chưa xóa, mọi owner); `AccountSummary` thêm `ownerId`, `syncEnabled`.
- `SecurityConfig`: cho phép dispatch `ASYNC` (SSE kết thúc bằng một async dispatch).

### 7. API đồng bộ
- `POST /api/accounts/{id}/sync` (CSRF) → `202` trạng thái bên dưới; `404 ACCOUNT_NOT_FOUND`; `409 ACCOUNT_DISABLED`; `409 IMPORT_NOT_DONE` khi lần nhập đầu chưa `DONE`.
- `GET /api/accounts/{id}/sync` → `{ "importDone", "lastSyncAt", "lastError", "push": "ACTIVE" | "OFF" | "FAILED", "pushExpiresAt" }`.

### 8. Cấu hình
- `sino.sync.live.poll-interval` (PT60S), `fallback-interval` (PT5M), `tick` (PT15S), `push-check` (PT1H), `push-renew-before` (P2D).
- `sino.google.pubsub.topic` (`projects/<id>/topics/<tên>`), `audience`, `service-account`, `jwk-set-uri`; `.env`: `SINO_GOOGLE_PUBSUB_TOPIC`, `SINO_GOOGLE_PUBSUB_AUDIENCE`, `SINO_GOOGLE_PUBSUB_SERVICE_ACCOUNT`.
- `sino.realtime.stream-timeout` (PT20M), `heartbeat` (PT25S), `max-streams-per-user` (5).

### 9. Việc người dùng làm (README)
Google Cloud Console (cùng dự án với OAuth client): bật Pub/Sub API; tạo topic; cấp `Pub/Sub Publisher` cho `gmail-api-push@system.gserviceaccount.com` trên topic; tạo một tài khoản dịch vụ cho push; tạo push subscription trỏ tới `https://<domain ngrok>/api/webhooks/gmail`, bật xác thực với tài khoản dịch vụ đó và `audience` tự đặt. Máy local: ngrok với domain cố định miễn phí và traffic policy **chỉ cho `POST /api/webhooks/gmail` đi qua** (đường hầm mở máy ra Internet; không được lộ trang đăng nhập hay actuator).

## Web
> Phiên web (sino-web-33). Mode HYBRID, frontend AUTO; người dùng 2026-10-10: "làm luôn không cần trình bày hay hỏi nữa" — các chỗ **Agent chốt** dưới đây là lựa chọn của agent, có phương án bị loại, để người dùng xem lại.

Hiện trạng: Hộp thư và trang Tài khoản chạy trên API thật (FE-50…FE-52). Mọi query của Hộp thư có `staleTime: Infinity` (chỉ tải lại khi bị đánh dấu cũ); danh sách tài khoản hỏi lại mỗi 2 s khi có lần nhập đang chạy; số "Hộp thư" ở thanh điều hướng vẫn là dữ liệu mẫu; "Đồng bộ ngay" mở bước "Đồng bộ" để nhập lại cả khoảng (tạm, AC-07).

### D-90 — Một EventSource cho cả app, chỉ báo "cần đọc lại" · **Agent chốt**
`src/shared/realtime/useEventStream.ts`, gắn một lần ở `AppShell` (chỉ có khi đã đăng nhập): `new EventSource('/api/events/stream')`, cùng origin nên cookie phiên tự đi; GET nên không cần CSRF. Theo tên sự kiện:
- `conversations.changed` → `invalidateQueries(['inbox'])`: khung (số đếm, tài khoản), mọi danh sách đã tải, cuộc trò chuyện đang mở. Query đang hiện tự tải lại; query không hiện chỉ bị đánh dấu cũ, lần mở sau mới tải.
- `account.changed` → `invalidateQueries(['accounts'])` và `['inbox']` (thanh bên Hộp thư có trạng thái tài khoản).
- `open` lần thứ hai trở đi (đã nối lại) → đọc lại `['inbox']` và `['accounts']`: bù các sự kiện lỡ trong lúc mất kết nối, vì luồng không có `id:`.
- Lỗi: EventSource tự nối lại theo `retry: 3000`. Khi trình duyệt bỏ hẳn (`readyState` = `CLOSED`, ví dụ phiên hết hạn nên `401`), web không tự mở lại; lần gọi API kế tiếp nhận `401` và về trang đăng nhập như hiện nay.
- Dữ liệu sự kiện chỉ dùng để chọn query cần đọc lại và cho dòng báo (D-92); nội dung luôn đến từ API, nên mọi kiểm tra quyền vẫn ở API.
**Phương án bị loại:** mỗi màn tự mở luồng (nhiều kết nối; HTTP/1.1 chỉ cho 6 kết nối mỗi origin, luồng nằm sẵn ăn chỗ của request thường); sửa thẳng cache theo dữ liệu sự kiện (sự kiện không mang nội dung — D-78; tự tính lại số đếm và thứ tự là chép logic của server).

### D-91 — Danh sách tài khoản chỉ hỏi lại mỗi 2 s khi luồng không mở · **Agent chốt**
`account.changed` đến sau mỗi trang nhập, nên khi luồng đang mở, polling 2 s của FE-52 là thừa. Polling chỉ chạy khi có lần nhập `RUNNING` **và** luồng không ở trạng thái mở (dự phòng khi realtime hỏng). **Phương án bị loại:** giữ polling song song (request thừa); bỏ hẳn polling (luồng hỏng thì tiến độ đứng yên).

### D-92 — Hàng mới theo MotionSpec C; dòng "N thư mới" khi thư đến từ đồng bộ · **Agent chốt** (theo canvas và lựa chọn của người dùng ở D-78)
- Danh sách nhớ ID các hàng đang hiện. Sau khi tải lại, hàng có ID mới ở đầu danh sách: tối đa 6 hàng thì trượt 6 px + mờ dần (`ease.out`), hàng dưới dời xuống; hơn 6 thì hiện ngay, không chuyển động. `prefers-reduced-motion`: không trượt.
- Sự kiện `source = sync` với `newInbound > 0` → dòng nhỏ "N thư mới" ở đầu danh sách (`role="status"`), N cộng dồn nếu nhiều sự kiện tới liền nhau; bấm vào thì cuộn danh sách lên đầu; tự ẩn khi đã cuộn lên đầu hoặc sau 6 s. `source = import` (lần nhập đầu) và `user` (đánh dấu đọc, lưu trữ) không có dòng báo.
- Số đếm thanh bên và chấm chưa đọc đổi theo dữ liệu tải lại, không có hiệu ứng riêng.
**Phương án bị loại:** dòng báo cho mọi thay đổi (người dùng tự bấm đọc cũng hiện "thư mới"); chỉ có dòng báo, không chuyển động (lệch canvas).

### D-93 — Số "Hộp thư" ở thanh điều hướng lấy từ `GET /api/conversations/counts` · **Agent chốt**
Hiện là dữ liệu mẫu ("12"), nên thư mới không làm nó đổi. Nối vào `unread` của counts, dùng chung query `['inbox']` để `conversations.changed` cập nhật luôn. Thẻ Tổng quan vẫn là dữ liệu mẫu (ngoài phạm vi). **Phương án bị loại:** để nguyên mẫu (realtime mà số không đổi).

### D-94 — Báo khi realtime mất kết nối · **Agent chốt**
Mạng tắt: banner ngoại tuyến sẵn có của Hộp thư. Mạng còn mà luồng không mở được quá 30 s: dòng nhỏ ở đầu Hộp thư "Thư mới có thể về chậm · đang kết nối lại…" (kiểu alert "Mất kết nối" của canvas `Surfaces`), ẩn khi luồng mở lại. **Phương án bị loại:** báo ngay khi mất (nhấp nháy mỗi lần server đóng luồng sau 20 phút); không báo (người dùng không biết vì sao thư không về).

### D-95 — "Đồng bộ ngay" gọi `POST /api/accounts/{id}/sync` · **Agent chốt**
Tài khoản đã nhập xong: "Đồng bộ ngay" gọi API đồng bộ (đọc thay đổi từ con trỏ), không mở bước "Đồng bộ" để nhập lại nữa (thay cách tạm của AC-07). Tài khoản chưa nhập vẫn "Nhập thư" → bước "Đồng bộ". `409 IMPORT_NOT_DONE` / `ACCOUNT_DISABLED` → câu báo riêng. Trang chi tiết đọc `GET /api/accounts/{id}/sync`: "Đồng bộ lần cuối", lỗi gần nhất (dùng cùng bảng chữ của lỗi nhập, FE-51) và "Thư mới về ngay" khi `push = ACTIVE` / "Thư mới về sau khoảng 1 phút" khi `OFF`. **Phương án bị loại:** giữ nhập lại cả khoảng (tốn hạn mức Gmail, vài phút).

### Test (web)
- jsdom không có EventSource: `src/test/eventSource.ts` thay `globalThis.EventSource` bằng lớp giả ghi lại URL và cho test `open()`, `emit(type, data)`, `drop()`, `close()`; dọn sau mỗi test.
- Hàm thuần: hàng nào là mới và có trượt không (≤ 6 / > 6), chữ "N thư mới", cộng dồn N.
- Màn (MSW cho API, EventSource giả cho luồng): `conversations.changed` (`sync`, `newInbound` = 2) → danh sách tải lại, 2 hàng mới đánh dấu trượt, dòng "2 thư mới"; `source = user` → tải lại, không dòng báo; `account.changed` → danh sách tài khoản tải lại; nối lại → tải lại; luồng mở → không polling 2 s, luồng đóng → polling; số "Hộp thư" theo counts; "Đồng bộ ngay" → `POST …/sync`, các lỗi `409`; mất kết nối quá 30 s → dòng báo.
- Chrome: luồng thật cần backend có BE-50 (CDP không giữ được một response kéo dài); trước đó kiểm bố cục với dữ liệu giả.

## Testing

- **Đồng bộ tăng dần (DB thật + connector giả theo kịch bản):** `DONE` + `submit` → đọc từ cursor đã lưu, lưu thư, tiến cursor, `last_sync_at`; lỗi → `last_sync_error`, `import_status` vẫn `DONE`; lượt sau thành công xóa lỗi; `CURSOR_EXPIRED` → đọc lại từ `import_since`; bắt đầu nhập lại giữa lượt → lượt dừng, cursor của lần nhập mới không bị ghi đè; hai cò cùng lúc → một luồng.
- **Lịch:** gọi thẳng hàm quét với `Clock` cố định: account đến hạn được `submit`, chưa đến hạn thì không, có watch thì khoảng 5 phút; account tạm dừng/`DISABLED`/`AUTH_EXPIRED`/đã xóa bị bỏ.
- **Watch (WireMock):** `users.watch` đúng topic; lưu địa chỉ và hạn; lỗi → `watch_error`; gia hạn khi sắp hết hạn, không gọi khi còn lâu; không có topic → không khai báo `PUSH_WEBHOOK`.
- **Webhook:** khóa RSA của test, JWKS phục vụ bằng WireMock, token ký bằng Nimbus: đúng → `204` và account đúng được `submit`; thiếu token, chữ ký sai, hết hạn, sai `aud`, sai `email`, `email_verified=false`, sai `iss` → `401`; nội dung hỏng hay địa chỉ lạ → `204` không `submit`; không cấu hình → `404`; không cần CSRF.
- **SSE (HTTP thật, `java.net.http`):** chưa đăng nhập → `401`; nhận `retry`, heartbeat; lưu thư → `conversations.changed` đúng owner, không tới owner khác; `PATCH` → `source=user`; rollback → không có sự kiện; luồng thứ 6 đóng luồng cũ nhất; không có nội dung thư trong envelope.
- **API đồng bộ:** `202`, `404`, `409` hai loại, CSRF, trạng thái.
- **Gmail thật (chạy tay, BE-53):** gửi một thư tới hộp thư test → thấy webhook (hoặc lịch) và sự kiện SSE, Hộp thư có thư; chỉ ghi số đếm và thời gian.
- Mỗi task: test đỏ trước, kiểm tra ngược bằng script, `./mvnw -B -ntp verify`, `ModularityTests`.

## Risks / Trade-offs

- [Đường hầm mở máy local ra Internet] → traffic policy chỉ cho đúng đường dẫn webhook; webhook kiểm token Google; README nói rõ.
- [Pub/Sub trễ/mất tin, watch hết hạn] → hỏi dự phòng 5 phút; gia hạn mỗi giờ khi sắp hết hạn.
- [Nhiều webhook dồn dập] → bộ đếm yêu cầu gộp thành một lượt mỗi account.
- [Một tiến trình] → lịch và luồng nằm trong tiến trình; chạy nhiều tiến trình cần lease (F13) — ngoài phạm vi.
- [Phiên không hết hạn khi tab mở] → chấp nhận; đăng xuất vẫn có hiệu lực ngay.
- [`CURSOR_EXPIRED` với khoảng "toàn bộ"] → đọc lại lâu; hiếm.
- [Nhiều sự kiện trong lúc nhập đầu] → mỗi trang một sự kiện; web gộp việc đọc lại.

## Migration Plan

- V12 (`sync`): thêm cột cho phép `NULL` vào `sync_checkpoint` và một index; dòng cũ có `NULL` = chưa đồng bộ lần nào, chưa có watch; rollback = bỏ cột.
- Không đổi dữ liệu cũ. Archive sau `f05-unified-inbox`.

## Open Questions

- Không có câu hỏi chặn việc làm. Người dùng có thể xem lại các lựa chọn "agent chốt theo ủy quyền" ở trên.

## Definition of Done — F07 + F08

- [ ] Các scenario của `live-sync`, `gmail-push`, `realtime-events` và delta `provider-contract`, `connected-accounts` có test và xanh.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` xanh; kiểm tra ngược từng task.
- [ ] Chạy thật: thư gửi tới Gmail test hiện trong Sino không cần tải lại (qua webhook nếu người dùng đã cấu hình Pub/Sub và ngrok, nếu không qua lịch); ghi thời gian từ lúc gửi tới lúc hiện; hoặc NOT VERIFIED kèm lý do.
- [ ] README (cấu hình Pub/Sub, ngrok, API mới), file kiến thức Phase 3 (`.md` + `.docx`).
- [ ] `tasks.md` tick đủ (cả phần web), chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; change archive sau `f05-unified-inbox`.
