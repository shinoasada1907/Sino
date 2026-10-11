# Phase 2 · F05 — Unified Inbox · Technical Design

> Mode: **HYBRID** — backend AUTO (agent làm từng task, kiểm chứng, báo lại rồi dừng); quyết định kiến trúc do người dùng chốt. Thiết kế được người dùng duyệt từng phần trong buổi brainstorm 2026-10-09 (phạm vi lưu, cách nhập lần đầu, ước lượng, xóa account, đã đọc/lưu trữ, cần trả lời, tổ chức module; rồi 5 phần thiết kế).
> Nguồn: Notion 01 (FR-02 Unified Inbox, FR-04 Message Sync), 02B (ERD v0.1, §4 ràng buộc, §5 index, §11 luồng upsert, §12 giữ dữ liệu, đọc qua API công khai của Notion ngày 2026-10-09); canvas "Sino UI" (`Inbox`, `TabletInbox`, `MobileInbox`, `InboxState`, `ConnectWizard` bước "Đồng bộ"); hợp đồng dữ liệu của web (`apps/sino-web/src/features/inbox/inbox.types.ts`, `accounts/connect.types.ts`). Convention chung ở `openspec/specs/` và design của F02/F03/F04a/F04b.

## Context

- Hiện trạng (2026-10-09): F04b xong BE-35…BE-39 và nghiệm thu: `GmailProvider.fetchUpdates` đọc thư Gmail thật (lần đầu theo mốc `since`, theo dõi thay đổi bằng `historyId`), `ProviderAccess.call(accountId, …)` cho module khác gọi connector với token còn hạn. Chưa có bảng nào lưu thư; chưa có listener event nào trong code chính.
- Module backend: `common`, `identity`, `account` (gói gốc công khai: event `AccountConnected`/`AccountRemoved`/`AccountStatusChanged`, `AccountStatus`, `ProviderAccess`, `ProviderCall`), `provider` (gói gốc + named interface `spi`). Migration tới V5 (`account_add_removed_at`).
- Account bị xóa là xóa mềm (D-13 = B, `removed_at`), giữ unique key nên kết nối lại dùng lại ID; F02 để "số phận tin nhắn" cho F05 (02B §12). `DISABLED` bị loại khỏi Hộp thư (D-12).
- Connector trả `SyncBatch(conversations, messages, skipped, nextCursor, hasMore)`; các batch theo dõi thay đổi chỉ có thư vừa đổi, nên conversation trong batch chỉ phản ánh các thư đó (ghi chú F04b cho F05: gộp, không ghi đè).
- Web: Hộp thư (`fe-ui-inbox`) và bước "Đồng bộ" (`fe-ui-connect`) đang chạy dữ liệu mẫu; kiểu `ConversationItem`, `InboxData.counts`, `SyncRange` (`DAYS_30`/`DAYS_90`/`ALL`), `SyncEstimate`, `InitialSyncStatus` đã có. Trang Tài khoản chờ `syncProgress`, `storedMessages`.
- Quyền Gmail chỉ đọc (`gmail.readonly`): Sino không ghi được trạng thái đọc/lưu trữ sang Gmail.

## Goals / Non-Goals

**Goals:**
- Thư của account đã kết nối được lưu idempotent; lưu lại cùng dữ liệu không tạo bản trùng; các con số trên Hộp thư (chưa đọc, cần trả lời, có tệp, thư mới nhất) luôn đúng với thư đã lưu.
- Người dùng chọn khoảng nhập lần đầu, thấy ước lượng và tiến độ; việc nhập chạy nền, chịu được lỗi tạm thời và khởi động lại.
- Web thay dữ liệu mẫu của Hộp thư bằng API thật, đúng hợp đồng `ConversationItem` đã có.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-63 — F05 lưu cả thư · **Accepted: A** (người dùng, 2026-10-09)
F05 lưu conversation, người tham gia, thư và thông tin tệp. Số chưa đọc, đoạn xem trước, có tệp, cần trả lời tính từ thư nên luôn đúng; nhập một lần là đủ. F06 còn API và màn đọc lịch sử một thread. **Lệch roadmap:** bảng `message`/`attachment` và việc lưu thư chuyển từ F06 sang F05. **Phương án bị loại:** B. đúng roadmap, F05 chỉ lưu conversation với số chưa đọc và đoạn xem trước tính sẵn từ batch (đánh dấu đã đọc một thư cũ thì không trừ đúng được; F06 phải nhập lại thư); C. gộp F05 và F06 thành một change (hồ sơ và số task gấp đôi).

### D-64 — Nhập lần đầu do người dùng bắt đầu, chạy nền · **Accepted: A** (người dùng, 2026-10-09)
Web gọi `POST /api/accounts/{id}/initial-sync` với khoảng đã chọn ở bước "Đồng bộ"; backend nhập từng trang trong nền, ghi tiến độ vào database; web hỏi tiến độ; backend khởi động lại thì nhập tiếp từ cursor đã lưu. Đúng canvas. **Phương án bị loại:** B. tự nhập 90 ngày khi nghe `AccountConnected` (lựa chọn 30/90/toàn bộ trên canvas thành vô dụng); C. nhập đồng bộ trong request (hộp thư lớn làm request chạy hàng phút rồi quá thời gian; không có tiến độ).

### D-65 — Ước lượng số thư qua hàm tùy chọn của contract · **Accepted: A** (người dùng, 2026-10-09)
`MessageProvider.estimateMessages(context, since)` trả số ước lượng hoặc rỗng (mặc định rỗng). Gmail: `resultSizeEstimate` của `messages.list q=after:<since>` khi có mốc, `messagesTotal` của profile khi nhập toàn bộ. Web luôn ghi "khoảng"; khi số đã nhập vượt ước lượng, mẫu số tăng theo. **Phương án bị loại:** B. không ước lượng ở F05 (lệch canvas, không có phần trăm); C. liệt kê hết id để đếm đúng (hàng trăm lời gọi trước khi nhập được thư nào).

### D-66 — Xóa account: giữ thư, ẩn khỏi Hộp thư · **Accepted: A** (người dùng, 2026-10-09)
Thư của account đã xóa nằm lại trong database nhưng không hiện ở Hộp thư; kết nối lại đúng tài khoản (cùng ID, D-13) thì hiện lại, không phải nhập lại. Xóa hẳn để cho màn Quyền riêng tư sau này. Đúng câu chữ trên canvas ("thư đã lưu được giữ lại cho tới khi bạn xóa trong Quyền riêng tư"). **Phương án bị loại:** B. xóa hẳn khi nghe `AccountRemoved` (kết nối lại phải nhập lại từ đầu); C. giữ và vẫn hiện (Hộp thư có thư của một nguồn không còn kết nối).

### D-67 — Đã đọc và Lưu trữ chỉ trong Sino, thay đổi mới nhất thắng · **Accepted: A** (người dùng, 2026-10-09)
Sino đổi trạng thái của riêng nó, không ghi sang Gmail. Mỗi thư nhớ trạng thái đọc Gmail báo lần trước (`provider_read`); chỉ khi trạng thái đó thật sự đổi (ví dụ đọc trên Gmail) Sino mới làm theo; một thay đổi khác (thêm nhãn) không đè lựa chọn trong Sino. Thư **đến** mới hơn thư mới nhất trước đó đưa conversation khỏi lưu trữ, giống Gmail. **Phương án bị loại:** B. xin `gmail.modify` để ghi ngược (kết nối lại để cấp quyền, Google xét duyệt gắt hơn, vượt phạm vi); C. chỉ phản chiếu Gmail, không có nút đánh dấu/lưu trữ (lệch canvas).

### D-68 — "Cần trả lời" · **Accepted: A** (người dùng, 2026-10-09)
Một conversation cần trả lời khi thư mới nhất là thư đến và không phải thư hàng loạt. Contract thêm khóa metadata dùng chung `bulk` (`"true"`); connector Gmail đánh dấu thư có nhãn `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_UPDATES`, `CATEGORY_FORUMS` hoặc header `List-Unsubscribe`. Trả lời xong (thư mới nhất là thư đi) thì hết; danh sách "Cần trả lời" không gồm conversation đã lưu trữ. **Phương án bị loại:** B. thư cuối là thư đến (thư quảng cáo, thông báo cũng vào); C. hoãn (tab "Cần trả lời" chưa dùng được).

### D-69 — Hai module `conversation` và `sync`, chạy nền trên executor · **Accepted: A** (người dùng, 2026-10-09)
`conversation` giữ dữ liệu Hộp thư và API Hộp thư; `sync` lo khi nào và làm sao lấy thư (gọi `ProviderAccess`, giữ cursor và tiến độ trong `sync_checkpoint` của 02B, đưa từng trang sang `conversation`). Chạy nền trên executor virtual thread; mỗi account một lượt nhờ `UPDATE` có điều kiện; khởi động lại thì chạy tiếp. F07 mở rộng `sync`. **Phương án bị loại:** B. một module `conversation` làm cả việc nhập (F07 phải tách ra); C. như A nhưng chạy bằng listener event bất đồng bộ của Spring Modulith (listener chạy hàng phút, vẫn cần bảng tiến độ: hai cơ chế cho một việc).

### D-74 — Thư qua nhóm vẫn là thư hàng loạt · **Accepted: A** (người dùng, 2026-10-09: "chọn A")
Thư có header `List-Unsubscribe` vẫn được đánh dấu `bulk`, kể cả thư đi qua Google Groups hay một địa chỉ chung kiểu `support@` dựng bằng nhóm: các conversation đó vẫn ở Hộp thư nhưng không vào "Cần trả lời". Giữ nguyên D-68 như BE-40 đã cài. Số D-70…D-73 do phiên web giữ cho FE-50 (`openspec/changes/fe-ui-inbox/design.md`). **Phương án bị loại:** B. thư có `List-Id` mà không có nhãn `CATEGORY_*` thì không coi là hàng loạt; C. để người dùng đánh dấu tay sau này.

### D-75 — Địa chỉ của account (`address`) · **Accepted: A** (người dùng, 2026-10-09)
`GET /api/accounts` và `GET /api/accounts/{id}` có thêm `address` (chuỗi hoặc `null`): địa chỉ người khác dùng để liên lạc với account, với Gmail là claim `email` lúc kết nối hoặc kết nối lại. Lưu ở cột mới `connected_account.address` (V11), cho phép `null`; người dùng không sửa được (khác `displayName`). Account kết nối trước thay đổi này giữ `null` tới lần kết nối lại; web hiện `address ?? displayName`. Không đổi scope Google. Lý do: `externalAccountId` của Gmail là `sub` (định danh bất biến, spec `account-connect`), web hiện nó như email nên người dùng thấy một dãy số; `displayName` chỉ là email tới khi người dùng đổi tên. Phiên web (sino-web-33) đề nghị trường này. **Phương án bị loại:** B. như A nhưng migration chép `displayName` sang `address` cho account Gmail cũ trông giống email (phỏng đoán, sai nếu người dùng đã đổi tên); C. không thêm, web hiện `displayName` (mất email khi đổi tên).

### Chốt kỹ thuật (agent, trong phạm vi trên)
- `conversation` đọc/ghi bằng SQL qua `JdbcClient` (`INSERT … ON CONFLICT … DO UPDATE`, truy vấn danh sách keyset), không có entity JPA: upsert hàng loạt và projection là SQL thuần.
- Không khóa ngoại sang `connected_account` (bảng của module khác; quy ước giữa module chỉ giữ ID). Khóa ngoại trong cùng module: `conversation_participant`/`message` → `conversation`, `attachment` → `message`, `message.sender_participant_id` → `conversation_participant`.
- Bỏ `starred` (02B) — canvas và web không có. `sync_run` (02B) hoãn sang F07.
- Đoạn xem trước: 200 ký tự đầu của `text_content` thư mới nhất, khoảng trắng gộp; không có chữ thì `null`. Không dùng `snippet` riêng của Gmail (contract không có).
- Cột `counterpart` (tên người bên kia, cho `title` của email) tính ở bước tổng hợp: người gửi thư đến mới nhất, không có thì người tham gia đầu tiên không phải mình (tên, không có tên thì email/ID).
- View `scheduled`, `snoozed` hợp lệ nhưng trả rỗng (tính năng sau); số đếm tương ứng là 0.
- `syncProgress`, `storedMessages` của trang Tài khoản lấy từ `GET /api/accounts/{id}/initial-sync`; ~~`GET /api/accounts` không đổi~~ → chỉ thêm `address` (D-75, BE-47). **LÝ DO:** người dùng thấy mã Google thay cho email trên màn thật; module `account` vẫn không phụ thuộc hai module mới.
- Thử lại khi nhập: `RATE_LIMITED` chờ `Retry-After` (không có thì 30 giây, tối đa 5 phút), tối đa 5 lần liên tiếp; `PROVIDER_UNAVAILABLE` sau 10/30/60 giây; thời gian chờ là cấu hình để test chạy nhanh.
- Số phút ước lượng: ~~tốc độ giả định ban đầu 200–400 thư/phút~~ → 60–120 thư/phút (đọc tuần tự, mỗi thư một lời gọi). **LÝ DO:** BE-46 đo với Gmail thật được khoảng 100 thư/phút (hai lần đọc lại 53 thư: 33 và 28 giây); giữ 200–400 thì màn "Đồng bộ" báo số phút ngắn hơn thật 2–4 lần. Hai lần đo đều là đọc lại, chưa có lần nhập đầu thật với hộp thư lớn; đo thêm khi có.
- Giả định một tiến trình backend (MVP): chạy tiếp các dòng `RUNNING` khi ứng dụng sẵn sàng; nhiều tiến trình cần lease/khóa theo account (F07). Review BE-46: với F07, thông báo Gmail, "Đồng bộ ngay" và lịch của một tiến trình khác vẫn gọi `submit` cho một dòng `RUNNING` và nhập tiếp nó; khi có nhiều tiến trình, lời gọi đồng bộ phải bỏ qua dòng `RUNNING`, hoặc dùng lease. Test nhập thật (BE-46) vì vậy đòi tắt backend trước khi chạy.

## Backend design

### 1. Dữ liệu (migration V6–V10)

```text
conversation                        module conversation
  id uuid PK, account_id uuid, external_conversation_id varchar
  type varchar, title text, avatar_url text
  last_message_at timestamptz NOT NULL, last_message_preview text, last_message_from text, counterpart text
  unread_count int, has_attachments boolean, needs_reply boolean      <- tính lại từ message
  archived boolean                                                     <- chỉ trong Sino
  created_at, updated_at
  UNIQUE (account_id, external_conversation_id)
conversation_participant
  id, conversation_id FK, external_participant_id, display_name, avatar_url, is_self
  UNIQUE (conversation_id, external_participant_id)
message
  id, conversation_id FK, sender_participant_id FK NULL, external_message_id
  direction, type, text_content, status, sent_at NOT NULL, reply_to_external_message_id
  is_read, provider_read, metadata jsonb, created_at, updated_at
  UNIQUE (conversation_id, external_message_id)
attachment
  id, message_id FK, external_attachment_id, file_name, mime_type, size_bytes, remote_url, thumbnail_url
  UNIQUE (message_id, external_attachment_id)
sync_checkpoint                     module sync
  account_id uuid PK, cursor text, import_status varchar (RUNNING|DONE|FAILED),
  import_range varchar, import_since timestamptz, imported_count int, skipped_count int,
  estimated_count int NULL, last_started_at, last_success_at, last_error_code varchar, updated_at
```

Index: `conversation(account_id, last_message_at DESC)` (02B §5); ~~`conversation(last_message_at DESC, id DESC) WHERE NOT archived` cho danh sách Hộp thư~~ → `conversation(account_id, last_message_at DESC, id DESC) WHERE NOT archived` (đổi ở BE-44 sau khi đo `EXPLAIN ANALYZE`: không có `account_id` đứng đầu thì PostgreSQL đi qua mọi conversation mới hơn của account khác); `conversation(account_id) WHERE unread_count > 0` (02B §5); `message(conversation_id, sent_at DESC)` (02B §5). Tên migration theo quy ước `V<n>__<module>_<việc>`.

### 2. Lưu một trang thư — `ConversationStore.store(accountId, batch)`

```text
store(accountId, batch)                          một transaction (bên gọi mở), ~50 thư
  1. upsert conversation         ON CONFLICT (account_id, external_conversation_id)
     tiêu đề chỉ đổi khi batch có thư mới hơn last_message_at đã lưu (hoặc chưa có tiêu đề)
  2. upsert người tham gia       giữ display_name cũ khi lần này null; is_self = cũ OR mới
  3. upsert thư                  ON CONFLICT (conversation_id, external_message_id)
     mới:   is_read = provider_read = read của connector
     đã có: read của connector khác provider_read -> is_read = provider_read = read mới
            giống provider_read -> giữ is_read (lựa chọn trong Sino)             (D-67)
     các trường còn lại đổi thì UPDATE, không đổi thì không chạm (02B §11)
  4. tệp                         upsert theo (message_id, external_attachment_id); xóa tệp không còn
  5. tổng hợp từng conversation chạm tới, từ bảng message:
     last_message_at, last_message_preview, last_message_from, counterpart,
     unread_count = số thư is_read = false, has_attachments,
     needs_reply = thư mới nhất INBOUND và metadata.bulk khác "true"          (D-68)
     có thư INBOUND mới chèn vào, mới hơn last_message_at trước đó -> archived = false (D-67)
  -> StoreResult(newMessages, updatedMessages)
```

- Thư mà connector không nêu conversation: tạo conversation tối thiểu (`type` = `UNKNOWN`, tiêu đề null). Người gửi không có trong người tham gia: thêm vào (chỉ ID).
- Không lưu nội dung thô của provider, không lưu item bị bỏ qua (chỉ `sync` đếm và ghi log ID).
- ~~`PATCH` của API và `store` không làm mất thay đổi của nhau: mỗi thao tác là `UPDATE` trên cột riêng; bước 5 đọc dữ liệu đã commit (READ COMMITTED).~~ **Sửa sau review BE-43:** cả hai cùng ghi `is_read` và các cột tổng hợp. Một câu `UPDATE` ở bước 5 tính tổng hợp từ ảnh chụp lúc nó bắt đầu, nên nếu `PATCH` commit giữa chừng thì bước 5 có thể ghi đè số cũ lên kết quả của `PATCH`. Vì vậy `PATCH` **bắt buộc** lấy cùng khóa theo account với `store` (`pg_advisory_xact_lock(hashtextextended('conversation:' || account, 0))`) rồi tính lại tổng hợp bằng cùng một đoạn SQL (BE-44 tách `summarize` ra để dùng chung).
- Module `conversation` mở gói gốc: `ConversationStore`, `StoreResult`, và `ConversationStats.storedMessages(accountId)` cho `sync`.

### 3. Lần nhập đầu (module `sync`)

```text
GET  /api/accounts/{id}/initial-sync/estimate?range=DAYS_30|DAYS_90|ALL
     -> { messages: <số> | null, minMinutes, maxMinutes }
POST /api/accounts/{id}/initial-sync    { "range": "DAYS_90" }   -> 202 + trạng thái
GET  /api/accounts/{id}/initial-sync
     -> { status: NOT_STARTED|RUNNING|DONE|FAILED, range, imported, skipped, estimated,
          remainingMinutes, storedMessages, startedAt, finishedAt, errorCode }
```

- `range` → `since`: `DAYS_30`/`DAYS_90` = bây giờ trừ 30/90 ngày; `ALL` = `null`.
- Bắt đầu: `UPDATE sync_checkpoint SET import_status = 'RUNNING' … WHERE account_id = ? AND import_status <> 'RUNNING'` (dòng chưa có thì `INSERT … ON CONFLICT DO NOTHING` trước). Không đổi được dòng nào → đang chạy: trả trạng thái hiện tại. `FAILED` với **cùng** khoảng → nhập tiếp từ cursor đã lưu; khoảng **khác** hoặc `DONE` → nhập lại từ `SyncCursor.initial(since mới)` (upsert nên không trùng). Ước lượng gọi một lần lúc bắt đầu (lỗi → `estimated` = null).
- Sau commit, giao việc cho executor (virtual thread):

```text
loop
  cursor = cursor đã lưu, hoặc SyncCursor.initial(import_since)
  batch  = ProviderAccess.call(account, (connector, ctx) -> connector.fetchUpdates(ctx, cursor))   ngoài transaction
  transaction { ConversationStore.store(account, batch); cursor = batch.nextCursor;
                imported_count += mới + cập nhật; skipped_count += batch.skipped }
  batch.hasMore = false -> DONE, last_success_at   (cursor lúc này theo dõi thay đổi: để dành cho F07)
```

- Lỗi (mã lưu ở `last_error_code`, không kèm nội dung): `RATE_LIMITED` chờ rồi thử lại cùng trang; `PROVIDER_UNAVAILABLE` thử lại 3 lần rồi `FAILED`; `CURSOR_EXPIRED` → tự đọc lại từ `initial(since)` một lần (D-60), lần hai thì `FAILED`; `AUTH_EXPIRED` → `FAILED` (account đã `AUTH_EXPIRED` nhờ `ProviderAccess`; kết nối lại rồi bấm nhập tiếp); account bị xóa/không thấy → `FAILED` (`ACCOUNT_NOT_FOUND`); lỗi khác (kể cả lỗi lập trình) → `FAILED` (`INTERNAL`), log ERROR có account id, không thử lại.
- Khởi động lại: khi ứng dụng sẵn sàng (`ApplicationReadyEvent`), mỗi dòng `RUNNING` được giao lại cho executor. Tắt ứng dụng: executor ngắt các lượt đang chạy; dòng vẫn `RUNNING` để lần sau chạy tiếp.
- `remainingMinutes` = (estimated − imported) chia tốc độ đo được của lượt này (null khi chưa có ước lượng hoặc chưa đủ dữ liệu).
- Quyền: account phải thuộc owner và chưa xóa (`AccountDirectory`), không thì `404 ACCOUNT_NOT_FOUND` như API account. `range` lạ → `400`. **Thêm ở BE-45 (review):** account `DISABLED` (D-12: không đồng bộ) → ước lượng và bắt đầu trả `409 ACCOUNT_DISABLED`; `ProviderAccess` không gọi provider cho account `DISABLED`, nên lượt đang chạy `FAILED` với `ACCOUNT_DISABLED`.
- Log: INFO bắt đầu/xong (account id, provider, số thư), WARN khi thử lại (mã lỗi), không bao giờ có nội dung thư hay token.

### 4. API Hộp thư (module `conversation`)

```text
GET   /api/conversations?view=all|unread|reply|attachments|archived|scheduled|snoozed
                        &provider=&accountId=&cursor=&limit=30
      -> { items: [ConversationItem], nextCursor: <chuỗi> | null }
GET   /api/conversations/counts
      -> { unread, byProvider: { "<provider>": <số> }, needsReply, withAttachments, scheduled: 0, snoozed: 0 }
GET   /api/conversations/{id}     -> ConversationItem + participants
PATCH /api/conversations/{id}     { read?: boolean, archived?: boolean }  -> ConversationItem
```

- Phạm vi: conversation của các account của owner chưa xóa (D-66) và không `DISABLED` (D-12), lấy qua `AccountDirectory`.
- View: `all` = không lưu trữ; `unread` = `unread_count > 0`; `reply` = `needs_reply`; `attachments` = `has_attachments`; ba view này cũng không lưu trữ; `archived` = đã lưu trữ; `scheduled`, `snoozed` = rỗng. Số đếm đếm **conversation** (không lưu trữ) theo cùng các điều kiện; `byProvider` đếm conversation chưa đọc theo provider.
- Thứ tự `last_message_at DESC, id DESC`; cursor là base64url của `lastMessageAt|id`, phân trang keyset. `limit` 1–100 (mặc định 30). View/`limit`/cursor/`accountId` không hợp lệ → `400` (định dạng lỗi chung).
- `ConversationItem`: `id`, `accountId`, `provider`, `kind` (`THREAD` → `EMAIL`, còn lại → `CHAT`), `title` (email: `counterpart`; chat: tiêu đề), `subject` (email: tiêu đề thread; chat: null), `memberCount` (chat nhóm), `snippetFrom` (chat nhóm: người gửi thư mới nhất), `snippet`, `lastMessageAt`, `unreadCount`, `needsReply`, `hasAttachments`, `archived`; `snooze`, `scheduledSend`, `linked` = `null`/`false`.
- `PATCH`: `read: true` → mọi thư `is_read = true`; `read: false` → thư mới nhất `is_read = false`; `archived` bật/tắt; tính lại tổng hợp; không ghi sang provider (D-67). Không thuộc owner, account đã xóa/`DISABLED`, hoặc không có → `404 CONVERSATION_NOT_FOUND`.
- `AccountDirectory` (gói gốc `account`): `accountsOf(ownerId)` → `List<AccountSummary(id, provider, status, externalAccountId)>` của account chưa xóa; `find(ownerId, accountId)` → `Optional<AccountSummary>`.
- Phụ thuộc module: `sync` → `account`, `conversation`, `provider` (gốc: `ProviderType`), `provider::spi`, `identity` (`CurrentUser`, BE-45); `conversation` → `account`, `provider` (gốc: `ProviderType`, qua `AccountSummary.provider()`), `provider::spi`, `identity` (`CurrentUser`, BE-44); `account` không phụ thuộc hai module mới. (Sửa sau review BE-41: trước ghi thiếu gói gốc của `provider`.)

### 5. Contract và Gmail
- `MessageProvider.estimateMessages(ProviderContext context, Instant since)` → `OptionalLong`, mặc định rỗng; connector không có `READ_MESSAGES` trả rỗng; lỗi provider ném `ProviderException` như các thao tác khác (bên gọi coi là không có ước lượng).
- Khóa metadata dùng chung `bulk` (`"true"` khi thư gửi hàng loạt: bản tin, quảng cáo, thông báo tự động). Tùy chọn; connector không biết thì bỏ trống.
- Gmail: `estimateMessages` — có `since`: `messages.list q=after:<giây> maxResults=1` → `resultSizeEstimate`; không có: `users.getProfile` → `messagesTotal`. Chuẩn hóa: `bulk = "true"` khi nhãn có một trong `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_UPDATES`, `CATEGORY_FORUMS` hoặc có header `List-Unsubscribe`.

## Testing

- **Contract/Gmail:** kit F03 kiểm `estimateMessages` rỗng hoặc ≥ 0; WireMock cho ước lượng của Gmail (có mốc, toàn bộ, lỗi); thư mẫu có nhãn `CATEGORY_*` và header `List-Unsubscribe` → `bulk`.
- **`AccountDirectory`:** account đã xóa không có; account của owner khác không có; `ModularityTests`.
- **`ConversationStore` (DB thật, Testcontainers):** cùng batch hai lần → không trùng, lần hai 0 thư mới; thư đổi → cập nhật; tệp giữ ID nội bộ, tệp bị bỏ thì xóa; batch theo dõi thay đổi chỉ có một thư cũ → tổng hợp vẫn đúng; đã đọc trong Sino không bị thay đổi nhãn đè, Gmail đổi trạng thái đọc thì theo; thư đến mới bỏ lưu trữ, thư đi mới không bỏ; cần trả lời với thư đến/đi/hàng loạt; thư không có conversation trong batch; người gửi ngoài danh sách người tham gia.
- **API Hộp thư (MockMvc + DB thật):** các view; lọc provider/account; phân trang keyset không trùng/không sót khi nhiều conversation cùng `last_message_at`; account đã xóa và `DISABLED` bị ẩn; `400` cho view/limit/cursor sai; `404`; `PATCH` đọc/chưa đọc/lưu trữ; số đếm; `EXPLAIN ANALYZE` câu danh sách ghi vào file kiến thức.
- **`sync` (DB thật + connector giả có thể ném lỗi theo kịch bản, thời gian chờ ngắn):** nhập hết nhiều trang → `DONE`, cursor theo dõi thay đổi được lưu; bấm bắt đầu hai lần chỉ một lượt; `RATE_LIMITED` rồi thành công; `PROVIDER_UNAVAILABLE` quá số lần → `FAILED`; `CURSOR_EXPIRED` → đọc lại từ đầu một lần; `AUTH_EXPIRED` → `FAILED`; `FAILED` rồi bấm lại cùng khoảng → nhập tiếp; khoảng khác → nhập lại; dòng `RUNNING` khi ứng dụng sẵn sàng → chạy tiếp; lỗi khi lưu → cursor không tiến; `404`/`400`; log không nội dung.
- **Gmail thật (`real-gmail`, chạy tay):** nhập 30 ngày của hộp thư đã kết nối vào database local, kiểm `DONE`, số conversation/thư/chưa đọc/cần trả lời khớp API; đo tốc độ; chỉ in số đếm.
- Mỗi task: test đỏ trước, kiểm tra ngược bằng script, `./mvnw -B -ntp verify`, `ModularityTests`.

## Risks / Trade-offs

- [Hộp thư lớn (hàng chục nghìn thư) với "toàn bộ"] → nhập tuần tự khoảng 100 thư/phút (đo ở BE-46) có thể mất hàng giờ; tiến độ và nhập tiếp sau khởi động lại giảm rủi ro; tối ưu (song song, batch API của Gmail) để F07.
- [Ước lượng của Gmail lệch] → web ghi "khoảng", mẫu số tăng theo khi vượt.
- [Sau lần nhập đầu Hộp thư không tự cập nhật cho tới F07] → chấp nhận cho mốc M1; cursor theo dõi thay đổi đã lưu sẵn cho F07.
- [Refresh token Testing sống 7 ngày] → lượt nhập dài có thể gặp `AUTH_EXPIRED` → `FAILED`, kết nối lại rồi nhập tiếp.
- [Nhiều tiến trình backend] → MVP một tiến trình; F07 thêm lease/khóa.
- [Thứ tự archive] → `f04a-gmail-connect` → `f04b-gmail-read` → change này.

## Migration Plan

- V6–V9 (`conversation`), V10 (`sync`): bảng mới, không đổi bảng cũ; rollback = bỏ bảng (chưa có dữ liệu người dùng ngoài máy local).
- V11 (`account`, BE-47): thêm cột `address` cho phép `null` vào `connected_account`, không điền ngược (D-75); rollback = bỏ cột.
- Delta `account-connect` của change này sửa requirement "Định danh Gmail bất biến" mà `f04a-gmail-connect` thêm vào: archive f04a trước f05; nếu requirement đó còn được sửa trong f04a thì chép lại câu chữ mới sang delta của f05, kẻo archive f05 ghi đè bằng bản cũ (review BE-47).
- Người dùng kết nối Gmail (đang kết nối từ BE-39; Testing: 7 ngày) để chạy test thật ở BE-46.

## Open Questions

- **Decision Needed — ước lượng theo khoảng ngày (D-65)** (BE-46, 2026-10-10). Đo trên hộp thư thật: `resultSizeEstimate` với `q=after:` trả 201 cho cả 30 ngày (29 thư thật) lẫn 90 ngày (53 thư thật), gần bằng cả hộp thư; `messagesTotal` của toàn bộ hộp thư khớp đúng (212/212). Màn "Đồng bộ" vì vậy báo "khoảng 201 thư" cho 29 thư. Phương án: (A) giữ, web vẫn ghi "khoảng"; (B) đếm đúng bằng cách lật danh sách ID như lúc nhập (`messages.list` với `maxResults=500`, chỉ lấy ID): mỗi 500 thư một lời gọi (5 đơn vị hạn mức), dừng ở một ngưỡng (ví dụ 5.000) và báo "hơn 5.000"; (C) không báo số cho khoảng ngày, chỉ cho toàn bộ hộp thư. Đề xuất B: khoảng 30/90 ngày thường chỉ 1–2 lời gọi mà số chính xác; chỉ sửa `GmailApi` và `GmailProvider.estimateMessages`, contract `estimateMessages` giữ nguyên.
- **Việc sau — tiến độ khi nhập lại** (review BE-46, 2026-10-10). `imported` đếm thư mới hoặc đổi (`advance` cộng `newMessages + updatedMessages`). Khi nhập lại cùng khoảng, mọi thư đã có nên `imported` đứng ở 0: tiến độ trên web không nhích và `remainingMinutes` để trống suốt lượt. Khi đổi sang khoảng rộng hơn, tốc độ chỉ tính trên thư mới nên số phút còn lại sai (báo "còn 1 phút" lúc sắp xong). Hướng sửa: thêm `read_count`/`run_read_count` (thư đã đọc + bỏ qua) cho tiến độ và tốc độ, giữ `imported` với nghĩa thư mới; cần migration và đổi spec `initial-sync`. Chưa làm trong BE-46.

- **Decision Needed — kết nối lại có đè tên người dùng đặt không?** (review BE-47, 2026-10-10). Từ F02, `reconnect` thay `displayName` bằng tên của provider (với Gmail là email), nên tên người dùng tự đặt ("Công việc") mất sau mỗi lần kết nối lại. Trước D-75 đó là cách duy nhất để email quay lại màn hình; nay email đã có `address` riêng. Phương án: (A) giữ như spec `connected-accounts` hiện tại; (B) chỉ lấy tên của provider lúc tạo account, kết nối lại giữ tên đang có; (C) như B nhưng chỉ giữ khi người dùng đã đổi tên (cần cột đánh dấu). Đề xuất B: đơn giản, đúng ý người dùng; đổi spec `connected-accounts` và một test domain.
- "Dùng nhãn Gmail làm bộ lọc" và "Chỉ tải tệp đính kèm khi bạn mở" trên bước "Đồng bộ" của canvas: F05 không lưu nhãn Gmail và không tải nội dung tệp (F06), nên hai lựa chọn chưa có tác dụng. F04b từng ghi lọc theo nhãn cho F05; buổi brainstorm F05 chưa chốt — đề xuất hoãn tới khi có yêu cầu lọc theo nhãn cụ thể; web giữ hai công tắc ở dữ liệu mẫu hoặc ẩn.
- Cách hiện thư "Bạn" khi người gửi là chính account trong `snippetFrom`/`title`: web quyết hiển thị (API trả tên/email; `participants[].self` cho biết).
- ~~**Decision Needed — thư qua nhóm có phải thư hàng loạt?**~~ → **chốt D-74 = A** (người dùng, 2026-10-09). (review BE-40, 2026-10-09). D-68 đánh dấu `bulk` khi có header `List-Unsubscribe`. Thư đi qua Google Groups, kể cả địa chỉ chung kiểu `support@` dựng bằng nhóm, thường cũng có header này (chưa kiểm với hộp thư thật), nên thư khách hỏi tới đó sẽ không vào "Cần trả lời". Phương án: (A) giữ quy tắc như đã duyệt; (B) thư có `List-Id` mà không có nhãn `CATEGORY_*` thì không coi là hàng loạt; (C) để người dùng đánh dấu tay sau này. BE-40 cài đúng D-68 (A); đổi sang B chỉ sửa `GmailMessageNormalizer` và thư mẫu. Cần chốt trước BE-43.

## Definition of Done — F05

- [x] Các scenario của `conversation-store`, `inbox-api`, `initial-sync` và delta `provider-contract`, `gmail-reading`, `connected-accounts`, `account-connect` có test và xanh. (BE-40…BE-47, 2026-10-10.)
- [x] `./mvnw -B -ntp verify` xanh; `ModularityTests` xanh (không vòng phụ thuộc); kiểm tra ngược từng task. (BE-46: 1000 test, 0 lỗi.)
- [x] Nhập thật với Gmail (`real-gmail`) chạy với account thật, có số đếm và tốc độ đo được; hoặc ghi rõ NOT VERIFIED và lý do. (BE-46: 53 thư, khoảng 100 thư/phút, database và API khớp.)
- [x] README (API Hộp thư, lần nhập đầu, chạy test thật), file kiến thức Phase 2 (`.md` + `.docx`). (BE-46.)
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; báo phiên web (sino-web-41) các API sẵn sàng; change archive (sau `f04b-gmail-read`). — Backend BE-40…BE-47 tick đủ; phiên web đã dùng các API (FE-51, FE-52 xong; FE-50 là của phiên web). Archive chờ `f04a-gmail-connect` rồi `f04b-gmail-read` (F04a còn chờ `fe-f01-web-foundation`, người dùng đang tạm dừng FE-05).
