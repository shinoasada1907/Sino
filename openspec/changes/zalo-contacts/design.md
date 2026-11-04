## Mode

**AUTO** (người dùng 2026-11-02, trả lời "Ghi đề án D ở đây, AUTO" trong phiên kỹ sư `sino-zalo` sino-30; `project-mode.yaml` `task_overrides.zalo-contacts`). Đề án do phiên kỹ sư ghi theo lệnh người dùng (ngoại lệ có ghi lại: theo *Đội Sino*, đề án là việc của quản lý). Mỗi task ghi kỹ sư phụ trách; kỹ sư không commit; quản lý nghiệm thu nội bộ, người dùng nghiệm thu, rồi quản lý commit (mỗi task một commit trên `dev`). Người dùng duyệt đề án này (Duyệt 1) trước khi giao việc.

## Context

- **Người dùng (2026-11-02):** "đồng bộ tin nhắn là bao gồm cả những người nhắn trước đó" → chọn "danh sách cuộc trò chuyện cũ, không cần tin cũ": người và nhóm đã nhắn trước đó phải tìm được trong Sino để nhắn tiếp.
- **Tin cũ không lấy được** (giữ D-278). Spike 1 (2026-11-02, tài khoản chính, QR mới): `requestOldMessages` 1-1 và nhóm với `lastId` `null`, `"0"`, `"1"` → 0 tin cả 6 lần. Spike 2: mất phiên rồi quét QR lại (imei mới) → 0 tin sau mốc; giữ imei cũ với cookie mới → "Đăng nhập thất bại". zca-js 2.2.0 là bản mới nhất trên npm.
- **zca-js 2.2.0, đọc mã (chưa gọi Zalo):**
  - Không có API "cuộc trò chuyện gần đây" hay giờ tin cuối của từng người.
  - `getAllFriends(count = 20000, page = 1, avatarSize)` → `User[]` (`userId`, `displayName`, `zaloName`, `avatar`, `lastActionTime` chưa rõ nghĩa): toàn bộ bạn bè trong một lần gọi.
  - `getAllGroups()` → `{ gridVerMap: { [groupId]: version } }`; `getGroupInfo(groupId | groupId[])` → `{ gridInfoMap: { [groupId]: GroupInfo } }` (tên, ảnh, `totalMember`); Zalo cho bao nhiêu nhóm mỗi lần: chưa biết.
  - Người lạ chưa kết bạn không có trong `getAllFriends`.
- **`sino-zalo`** đã có mẫu route theo tài khoản cần phiên sống (`sessions/aliasRoutes.ts`: `409 NO_SESSION`, `502 ZALO_UNAVAILABLE`), tên chat 1-1 bằng `displayName || zaloName` (`ZcaGateway.userInfo`, D-419), và gửi tin bằng `threadId` = ID bạn bè hay ID nhóm.
- **`sino-api`:**
  - `conversation.last_message_at` là `NOT NULL` (V6), và mọi câu liệt kê/đếm của Hộp thư (`InboxService`, `ConversationSummaries`, `JdbcConversationStats`, `ThreadGroups`) đọc thẳng bảng `conversation`: một cuộc trò chuyện trống sẽ lọt vào danh sách và số đếm.
  - F10 thư mới (`f10-new-mail`, D-192, D-195) đã có `POST /api/conversations`: tạo cuộc trò chuyện **ngay khi bấm Gửi**, kèm thư mở đầu `PENDING`, rồi dùng lại "Gửi lại" / "Bỏ" / đối chiếu của F10. Bảng `conversation` có unique `(account_id, external_conversation_id)`.
  - Mẫu facet tùy chọn (`Optional<Nicknames> nicknames()`, NK-02) và việc định kỳ cạnh `sync/application/NicknameSyncSchedule`; sự kiện `account.AccountConnected(accountId, ownerId, provider, reconnected, occurredAt)` khi tài khoản nối xong.
  - Migration mới nhất: V24 (`conversation.nickname`).
- **`sino-web`:** router có `inbox/new` (thư mới, D-191) và `messages/:conversationId`; D-304 (f05c): "Thư mới" chỉ ở Hộp thư, Tin nhắn không có nút mở cuộc chat mới.
- **Canvas** "Sino UI" chưa có nút "Nhắn tin mới", ô tìm danh bạ, hay khung chat chưa có tin.

## Goals / Non-Goals

**Goals:** tìm được mọi bạn bè và nhóm Zalo của tài khoản trong Sino theo tên (không phân biệt dấu), mở chat để nhắn tiếp; bạn bè/nhóm mới hiện trong vòng 60 phút hoặc ngay khi bấm "Làm mới"; Hộp thư không có cuộc trò chuyện trống.

**Non-Goals:** xem `proposal.md`. Thêm: tìm theo biệt danh (`conversation.nickname`), sắp theo "nhắn gần nhất".

## Decisions

### DN-1 — Chỗ hiện danh bạ: ô "Nhắn tin mới" · **người dùng chốt** (2026-11-02, brainstorm)
Một ô tìm bạn bè và nhóm Zalo, mở từ nút "Nhắn tin mới"; chọn thì mở khung chat để nhắn tiếp. Hộp thư không bị đổ hàng trăm cuộc trò chuyện trống; cuộc trò chuyện vào Hộp thư khi có tin đầu tiên.
**Phương án bị loại:** đổ mọi bạn bè và nhóm vào Hộp thư thành cuộc trò chuyện trống (hàng trăm dòng, không có thứ tự tin gần nhất); chỉ nhóm và cuộc trò chuyện đã ghim vào Hộp thư.

### DN-2 — Danh bạ lưu trong `sino-api` · **người dùng chốt** (2026-11-02, brainstorm)
Bảng danh bạ trong `sino-api`, đồng bộ định kỳ; tìm trong DB, vẫn có danh sách khi `sino-zalo` tắt.
**Phương án bị loại:** hỏi sống qua `sino-zalo` mỗi lần mở ô tìm, nhớ 10 phút (không thêm bảng, nhưng `sino-zalo` tắt hay mất phiên thì ô tìm rỗng); web gọi thẳng `sino-zalo` (trái D-282: `sino-zalo` chỉ lắng ở `127.0.0.1` và chỉ `sino-api` gọi).

### D-425 — Hợp đồng `sino-api` → `sino-zalo` · agent chốt
```text
GET /accounts/:accountId/contacts
→ 200 {
    "friends": [ { "id": "8001", "name": "Nguyễn Thị A", "avatarUrl": "https://…" | null } ],
    "groups":  [ { "id": "6001", "name": "Nhà mình", "avatarUrl": "https://…" | null, "memberCount": 12 | null } ]
  }
```
- Bạn bè: một lần `getAllFriends()` (mặc định của zca-js, tới 20 000). `name` = `displayName || zaloName`, như tên chat 1-1 hôm nay (D-419: chưa biết `displayName` có lẫn tên gợi nhớ không; CT-20 kiểm).
- Nhóm: `getAllGroups()` lấy ID, rồi `getGroupInfo` theo **lô 50 ID** (Zalo giới hạn bao nhiêu chưa biết; CT-01 ghi lại, CT-20 đo); `memberCount` = `totalMember`, không có thì `null`.
- `avatarUrl`: địa chỉ Zalo đưa, rỗng thì `null`; `sino-web` chỉ vẽ `https` (D-413).
- Lỗi: không có phiên sống → `409 { "code": "NO_SESSION" }` như route tên gợi nhớ (D-415); Zalo lỗi hay quá giờ ở **bất kỳ** lần gọi nào (bạn bè, danh sách nhóm, một lô nhóm) → `502 { "code": "ZALO_UNAVAILABLE" }` cho cả lần đó, không bao giờ trả danh sách thiếu (`sino-api` xóa người không có trong danh sách, D-428). Xác thực bằng khóa dùng chung như mọi route. Log chỉ có ID tài khoản và số lượng, không có tên.
- Không nhớ đệm ở `sino-zalo`: `sino-api` hỏi mỗi 60 phút và khi bấm "Làm mới" (D-428).

### D-433 — Mức trần thời gian của danh bạ · agent chốt (CT-01, 2026-11-02)
Thêm khi làm CT-01. **LÝ DO:** `sino-api` đọc mọi lời gọi `sino-zalo` với `READ_TIMEOUT` 10 giây (`ZaloProvider`), chỉ gửi tin và QR dùng `SLOW_TIMEOUT` 20 giây; tài khoản nhiều nhóm gọi `getGroupInfo` nhiều lô có thể quá 10 giây. `sino-zalo` dừng chờ sau **15 giây** và trả `502 ZALO_UNAVAILABLE` (các lời gọi Zalo vẫn chạy nốt, kết quả bỏ đi); **CT-02 gọi `/contacts` bằng timeout chậm 20 giây**, để `sino-zalo` luôn trả lời trước khi `sino-api` bỏ chờ.

### D-426 — Facet `Contacts` của nhà cung cấp · agent chốt
`ProviderCapability.CONTACTS` và `default Optional<Contacts> contacts()` trên `MessageProvider`, theo mẫu `nicknames()` (NK-02). `Contacts`: `List<Contact> list(ProviderContext)`, `Contact(String externalId, ConversationType type, String name, @Nullable String avatarUrl, @Nullable Integer memberCount)` với `type` `DIRECT` (bạn bè) hay `GROUP`. Bản Zalo gọi D-425 qua `ZaloClient` (cùng cách đưa lại phiên và gọi lại một lần khi `409 NO_SESSION` như `Call.ALIAS`, D-423); Gmail không có.

### D-427 — Bảng danh bạ (migration V25) và chỗ đặt code · agent chốt
```sql
CREATE TABLE contact (
    id           uuid PRIMARY KEY,
    account_id   uuid        NOT NULL REFERENCES account(id) …,   -- cùng cách xóa với bảng conversation (D-13)
    external_id  text        NOT NULL,
    type         varchar(16) NOT NULL CHECK (type IN ('DIRECT', 'GROUP')),
    name         text        NOT NULL,
    name_key     text        NOT NULL,   -- D-429
    avatar_url   text,
    member_count integer,
    updated_at   timestamptz NOT NULL,
    CONSTRAINT contact_account_external_uk UNIQUE (account_id, external_id)
);
CREATE TABLE contact_sync (
    account_id  uuid PRIMARY KEY REFERENCES account(id) …,
    synced_at   timestamptz,             -- lần đồng bộ thành công gần nhất
    error_code  varchar(64),             -- lỗi của lần gần nhất, null khi thành công
    attempted_at timestamptz NOT NULL
);
```
Kỹ sư backend chốt chi tiết cột, index (`(account_id, name_key)`) và cách xóa theo tài khoản khớp với bảng `conversation`; số migration V25 nếu chưa ai dùng. Code theo mẫu NK-02: interface `conversation.ContactSync` (như `NicknameSync`), `conversation.application.ContactSyncService`, `sync.application.ContactSyncSchedule`; danh bạ thuộc module `conversation` vì kết quả tìm cần nối với `conversation` (D-429). `ModularityTests` xanh.

### D-428 — Đồng bộ danh bạ · agent chốt
- **Khi nào:** (1) nghe `AccountConnected` (QR xong, kể cả nối lại) → đồng bộ tài khoản đó, sau khi transaction của việc nối đã commit; (2) mỗi **60 phút** (`sino.sync.contacts.interval`, mặc định `PT60M` nhúng trong `@Scheduled`, cùng cờ tắt khi test như `NicknameSyncSchedule`) cho mọi tài khoản `CONNECTED`/`DEGRADED`/`ERROR` có `CONTACTS`; (3) `POST /api/accounts/{accountId}/contacts/refresh`.
- **Ghi:** gọi nhà cung cấp ngoài transaction; rồi trong một transaction: thêm/sửa theo `(account_id, external_id)` chỉ khi có cột khác (`IS DISTINCT FROM`), xóa người không còn trong danh sách (hủy kết bạn, rời nhóm), ghi `contact_sync.synced_at`. Không phát sự kiện realtime (ô tìm đọc khi mở).
- **Lỗi:** giữ nguyên danh bạ cũ, ghi `contact_sync.error_code` và `attempted_at`, log cảnh báo (ID tài khoản, mã lỗi; không tên). Lần sau thử lại.
- **Làm mới:** chạy đồng bộ ngay và trả `200 { "syncedAt", "count" }`; một tài khoản chỉ một lần đồng bộ cùng lúc (lần thứ hai chờ lần đang chạy rồi trả kết quả của nó); lần làm mới trong vòng **30 giây** sau một lần thành công trả kết quả đó, không hỏi Zalo lại. Tài khoản không có `CONTACTS` → `422 CONTACTS_NOT_SUPPORTED`; không gọi được nhà cung cấp → `502` theo mã lỗi nhà cung cấp hiện có; tài khoản không có / không thuộc người dùng → `404 ACCOUNT_NOT_FOUND`.

### D-429 — Tìm danh bạ: `GET /api/contacts` · agent chốt
```text
GET /api/contacts?accountId=<uuid>&q=<chữ>&limit=<1..100, mặc định 50>
→ 200 {
    "items": [ { "accountId", "externalId", "type": "DIRECT" | "GROUP", "name", "avatarUrl", "memberCount",
                 "conversationId": "<uuid>" | null, "nickname": "<biệt danh>" | null } ],
    "syncedAt": "<date-time>" | null,
    "syncError": "<mã>" | null
  }
```
- **Không phân biệt dấu:** `name_key` tính trong Java khi ghi: chữ thường, tách dấu (NFD) rồi bỏ dấu kết hợp, `đ` → `d`, gộp khoảng trắng. `q` chuẩn hóa cùng cách; tìm `name_key` chứa `q` (escape `%`, `_`). `q` rỗng → `limit` người đầu tiên theo tên.
- **Sắp:** theo `name_key`, rồi `external_id`. Mỗi kết quả kèm `conversationId` (và `nickname` của nó) nếu tài khoản đã có cuộc trò chuyện với `external_conversation_id` = `externalId`.
- **Quyền:** chỉ tài khoản của người dùng, chưa xóa; khác → `404 ACCOUNT_NOT_FOUND`. Chưa từng đồng bộ → `items` rỗng, `syncedAt` `null`.
- **Phương án bị loại:** extension `unaccent` của PostgreSQL (thêm extension vào DB, không xử lý `đ`; Java làm được và test được không cần DB).

### D-430 — Tin đầu tiên tạo cuộc trò chuyện ngay khi bấm Gửi · agent chốt
**Đã sửa so với lúc trình bày trong brainstorm** (trình: `POST /api/accounts/{id}/conversations { externalId }` tìm hoặc tạo cuộc trò chuyện, Hộp thư ẩn chat trống). **LÝ DO:** `conversation.last_message_at` là `NOT NULL` và bốn chỗ đọc Hộp thư đọc thẳng bảng; ẩn chat trống phải sửa mọi câu liệt kê và đếm, sót một chỗ là chat trống lọt vào số đếm. F10 đã có mẫu tạo cuộc trò chuyện **lúc bấm Gửi** (D-192, D-195): không có chat trống nào, cùng hành vi người dùng duyệt ("cuộc trò chuyện vào Hộp thư khi có tin đầu tiên").
- `POST /api/conversations` (endpoint của thư mới) nhận thêm dạng chat: `{ "accountId", "contact": "<externalId>", "text", "clientMessageId" }`. Đúng **một** trong `to` (thư) và `contact` (chat); cả hai hay không có → `400 VALIDATION_FAILED`. `text` kiểm như `POST /api/conversations/{id}/messages` hôm nay (không rỗng, không chỉ khoảng trắng, cùng độ dài tối đa).
- Người đó **đã có** cuộc trò chuyện → gửi vào cuộc trò chuyện đó (như `POST /api/conversations/{id}/messages`), không tạo mới. **Chưa có** → tạo cuộc trò chuyện với `external_conversation_id` = `contact` (mã thật ngay từ đầu, không cần mã tạm `sino:` như Gmail), `type`, `title`, ảnh lấy từ `contact`, kèm tin `PENDING`, **trước** khi gọi nhà cung cấp; unique `(account_id, external_conversation_id)` chặn hai cuộc trò chuyện cho cùng một người khi hai lần gửi chạy chồng.
- Kết quả và mã lỗi như bảng của D-195 (`201`/`200`, `409 SEND_IN_PROGRESS`, `409 SEND_OUTCOME_UNKNOWN`, `409 SEND_NOT_ALLOWED`, `502 SEND_FAILED`, `504 SEND_OUTCOME_UNKNOWN`, `404 ACCOUNT_NOT_FOUND`); thêm `404 CONTACT_NOT_FOUND` khi `contact` không có trong danh bạ của tài khoản. Tin lỗi hay chưa rõ ở lại trong cuộc trò chuyện, dùng "Gửi lại" / "Bỏ" / đối chiếu của F10; "Bỏ" tin duy nhất xóa cả cuộc trò chuyện (D-195).
- Tin đầu tiên chỉ là chữ (non-goal: sticker, ảnh, tệp).
- Gửi xong phát `ConversationChanged` như hôm nay; tin của chính mình quay về qua listener thì khớp với tin đã lưu theo đường F10 đang có (D-131, D-132).

### D-431 — Web: nút, đường dẫn, ô tìm, chat chưa có tin · agent chốt (hình dạng theo frame CT-04)
- **Thay D-304** ở một điểm: danh sách **Tin nhắn** có nút **"Nhắn tin mới"**, cùng vị trí với "Thư mới" của Hộp thư; chỉ hiện khi có ít nhất một tài khoản có `CONTACTS` trong `capabilities`.
- **Đường dẫn:** `messages/new` mở ô tìm (desktop: hộp thoại trên màn Tin nhắn; 390: cả trang); `messages/new/:accountId/:contactId` là khung chat chưa có tin. Đặt trước `messages/:conversationId` trong router.
- **Ô tìm:** hơn một tài khoản có `CONTACTS` thì chọn tài khoản trước (nhớ lần chọn cuối); focus vào ô nhập khi mở; gọi `GET /api/contacts` sau 250 ms kể từ lần gõ cuối; mỗi dòng: ảnh (`Avatar` đang có), `nickname ?? name`, nhãn "Bạn bè" hay "Nhóm · N thành viên", dấu "Đã có cuộc trò chuyện"; "Làm mới danh bạ" + "Cập nhật lúc HH:mm" (`syncedAt`); bàn phím ↑ ↓ Enter, Esc đóng.
- **Chọn:** có `conversationId` → `messages/:conversationId`; không có → `messages/new/:accountId/:contactId`.
- **Chat chưa có tin:** đầu khung như chat thường (ảnh, tên, nhãn), "Chưa có tin nhắn. Gửi tin đầu tiên.", ô soạn chỉ chữ; Gửi → `POST /api/conversations` dạng chat; `201`/`200` → thay đường dẫn bằng `messages/:conversationId`; `502`/`504` có `conversationId` → mở cuộc trò chuyện đó (F10 hiện "Gửi lại"/"Bỏ"); lỗi khác giữ chữ đã gõ và báo trong khung.
- **Trạng thái ô tìm:** đang tải; không tìm thấy ("Không thấy ai tên như vậy. Người chưa kết bạn không có trong danh bạ."); chưa có danh bạ (`syncedAt` `null`: "Chưa có danh bạ. Bấm Làm mới."); làm mới lỗi (giữ danh sách cũ, báo một dòng).

### D-432 — Giới hạn và đo · agent chốt
Đo ở CT-20 với tài khoản người dùng, ghi vào task: số bạn bè và nhóm, thời gian một lần đồng bộ đầy đủ, `getGroupInfo` nhận tối đa bao nhiêu ID một lần (nếu 50 bị từ chối thì CT-01 hạ lô), `name` là tên Zalo hay tên gợi nhớ (D-419), `avatarUrl` có phải `https`. Không giới hạn số người trong danh bạ ở `sino-api` ngoài `limit` của mỗi lần tìm.

## Risks / Trade-offs

- [Danh bạ cũ tới 60 phút] → bấm "Làm mới"; ô tìm hiện "Cập nhật lúc HH:mm".
- [Tài khoản nhiều nhóm, nhiều lô `getGroupInfo`] → lô 50, một lần đồng bộ mỗi giờ; CT-20 đo thời gian.
- [Hai lần gửi tin đầu tiên chạy chồng cho cùng một người] → unique `(account_id, external_conversation_id)`, lần sau dùng cuộc trò chuyện đã có.
- [Người đó nhắn tới đúng lúc mình đang ở khung chat chưa có tin] → cuộc trò chuyện được tạo từ tin tới; lần gửi dùng cuộc trò chuyện đã có (D-430), web thay đường dẫn sang nó.
- [Người lạ, người đã hủy kết bạn] → không có trong ô tìm; câu báo "không tìm thấy" nói rõ.
- [zca-js không chính thức] → chỉ ba API đọc mỗi giờ; không gửi gì khi đồng bộ.
- [`messages-by-account` đang dựng lại màn Tin nhắn] → CT-04 và CT-05 làm sau canvas và web của change đó; nút "Nhắn tin mới" đặt trên `MessagesPage` mới (vị trí cụ thể theo frame CT-04).

## Contract tóm tắt

```text
sino-zalo  GET /accounts/:id/contacts → { friends[], groups[] }                                   (D-425)
sino-api   CONTACTS + Optional<Contacts> contacts(); V25 contact, contact_sync                     (D-426, D-427)
sino-api   AccountConnected · every PT60M · POST /api/accounts/{id}/contacts/refresh → sync      (D-428)
sino-api   GET /api/contacts?accountId=&q=&limit= → { items[], syncedAt, syncError }              (D-429)
sino-api   POST /api/conversations { accountId, contact, text, clientMessageId }                  (D-430)
sino-web   "Nhắn tin mới" ở Tin nhắn; messages/new; messages/new/:accountId/:contactId            (D-431)
```
