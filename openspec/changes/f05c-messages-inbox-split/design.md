# Mở rộng F05 · Tách "Tin nhắn" (chat) và "Hộp thư" (email) · Technical Design

> Mode: **AUTO** (người dùng, 2026-10-16: "Đây là sửa Hộp thư, chạy AUTO"; không tính là feature mới nên không theo `new_features: TRAINING`). Agent làm từng task đủ quy trình rồi báo và dừng.
> D-300…D-308 là **người dùng duyệt**: bốn điểm đầu chốt trong buổi brainstorm 2026-10-15, phần 1, 2, 3 của thiết kế duyệt 2026-10-16. D-309 là agent chốt, để người dùng xem lại. Số quyết định của change: D-300…D-309 (D-291…D-299 để trống cho `zalo-personal` đang chạy).

## Context

**Web hôm nay** (`apps/sino-web`):
- Điều hướng (`app/shell/navItems.ts`): một mục "Hộp thư" `/inbox` với số `inboxUnread`; tab bar mobile: Tổng quan · Hộp thư · Lịch · Việc · Thêm; `MORE_PATHS` gồm `/notes`, `/accounts`, `/services`, `/registrations`, `/notifications`, `/settings`.
- `InboxPage` dựng cả hai loại: `EmailThread` cho email, `ChatThread` cho chat; `ConversationItem.kind` (`EMAIL` | `CHAT`) đã có trong hợp đồng dữ liệu. Bộ lọc nằm trong địa chỉ (`?source=&view=`, `useInboxFilter`).
- Việc, Lịch, Ghi chú dẫn tới `/inbox/<conversationId>` mà không biết loại (`TaskDetail`, `EventDetail`, `NoteEditor`).
- Thẻ "Hộp thư hợp nhất" ở Tổng quan (`InboxCard`) có nút "Mở hộp thư" → `/inbox`; bước 5 của hộp thoại kết nối có nút "Mở hộp thư" → `/inbox`.
- Số trên điều hướng: `useInboxUnread` đọc `unread` của `GET /api/conversations/counts`.

**Backend hôm nay** (`apps/sino-api`, `dev.sino`):
- `ProviderType` là record mở (D-16), `ProviderDescriptor(type, displayName, capabilities)`; không có khái niệm loại email/chat ở đâu cả. `GET /api/providers` trả `type`, `displayName`, `capabilities`.
- `ConversationResponse.kind` được **suy** từ `ConversationType.THREAD` (THREAD → `EMAIL`, còn lại → `CHAT`); Gmail luôn tạo THREAD.
- `InboxService` lọc `provider` bằng Java: `accountsOf()` lấy các tài khoản của chủ (`Map<UUID, ProviderType>`), bỏ tài khoản khác provider, rồi bind danh sách ID vào câu SQL. Bảng `conversation` không có cột provider và module `conversation` không join sang `connected_account` (thiết kế V6).
- `GET /api/conversations/counts` không nhận tham số; trả `unread`, `byProvider`, `needsReply`, `withAttachments`, `scheduled`, `snoozed`.
- Sự kiện SSE (`conversations.changed`, `account.changed`) chỉ mang `accountId`.
- `GmailProvider` chỉ được đăng ký khi có `SINO_GOOGLE_CLIENT_ID`/`SECRET`; thiếu thì account Gmail vẫn còn trong database và thư vẫn hiện trong Hộp thư. `ZaloProvider` thì vẫn ở trong registry khi tắt công tắc (D-286 của `zalo-personal`).
- Nhóm thread (V19, `f05b-merged-threads`) chỉ gom trong cùng chủ và cùng provider, nên mỗi nhóm có đúng một loại.

## Goals / Non-Goals

**Goals:** chat và email ở hai màn riêng, mỗi màn có số chưa đọc riêng; Zalo (provider chat đầu tiên) vào đúng màn ngay khi nối; mọi link cũ tới một cuộc trò chuyện vẫn mở được.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Decisions

### D-300 — Hai mục điều hướng, không có màn gộp · **Người dùng chốt** (2026-10-15)
"Tin nhắn" (`/messages`, chat) và "Hộp thư" (`/inbox`, email), mỗi mục có số chưa đọc riêng. Không giữ màn "tất cả".
**LÝ DO:** chat và email đọc khác nhau (bong bóng theo ngày so với thread có tiêu đề), trả lời khác nhau, nhịp khác nhau.
**Phương án bị loại:** giữ một màn gộp và thêm bộ lọc loại (người dùng muốn hai nơi riêng); ba mục Tất cả / Tin nhắn / Hộp thư (thêm một mục cho việc ít dùng).

### D-301 — Tab bar mobile; Lịch vào "Thêm" · **Người dùng chốt** (2026-10-15)
Tab bar: Tổng quan · Tin nhắn · Hộp thư · Việc · Thêm. Lịch nằm dưới "Thêm" cùng Ghi chú, Tài khoản…; tab "Thêm" sáng khi đang ở `/calendar` và trang con của nó.
**LÝ DO:** tab bar giữ 5 ô; nhắn tin là việc dùng nhiều nhất của Sino Messages.

### D-302 — Canvas trước, rồi mới code web · **Người dùng chốt** (2026-10-15)
Vẽ lại các frame bị ảnh hưởng và frame mới trên canvas "Sino UI" (https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB), người dùng duyệt trên link, bản sao `design/sino-ui/project/` theo sau, rồi mới code web. Backend không chờ canvas.
**LÝ DO:** canvas là thiết kế cuối cùng (CLAUDE.md); code web trước canvas thì canvas và web lệch nhau.

### D-303 — Routes và tự chuyển giữa hai màn · **Người dùng duyệt** (phần 1, 2026-10-16)
| Route | Màn |
|---|---|
| `/messages` | danh sách chat |
| `/messages/:id` | mở một cuộc chat |
| `/inbox` | danh sách email |
| `/inbox/:id` | mở một thread email |
| `/inbox/new` | thư mới (chỉ email) |

Mở `/inbox/:id` mà cuộc trò chuyện là chat thì web thay đường dẫn bằng `/messages/:id` (`replace`, không thêm mục lịch sử), và ngược lại. Loại lấy từ `kind` của dòng (dòng đã tải hoặc `GET /api/conversations/{id}`).
**LÝ DO:** Việc, Lịch, Ghi chú dẫn tới `/inbox/<id>` mà không biết loại; bookmark cũ vẫn chạy; không phải sửa các màn đó.
**Phương án bị loại:** sửa từng chỗ dẫn link để biết loại (các màn đó chỉ giữ `conversationId`, phải thêm dữ liệu ở backend); báo 404 khi sai màn (link cũ hỏng).

### D-304 — Hai màn danh sách · **Người dùng duyệt** (phần 1)
- Cùng bố cục hiện tại (3 cột desktop, 2 cột tablet, danh sách và trang mở tách riêng trên mobile), cùng các chip view (Tất cả, Chưa đọc, Cần trả lời, Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ); mỗi màn đếm theo loại của nó.
- Cột nguồn và danh sách tài khoản chỉ có provider cùng loại. `?source=` của provider loại kia (hay giá trị lạ) quay về "Tất cả", như cách `useInboxFilter` đã làm với giá trị lạ.
- "Thư mới" chỉ ở Hộp thư. Tin nhắn không có nút mở cuộc chat mới.
- Dòng báo realtime: Tin nhắn "N tin mới", Hộp thư "N thư mới"; tin của loại kia chỉ đổi số trên điều hướng.
- Link quay lại theo màn: "Quay lại Tin nhắn" / "Quay lại Hộp thư"; liên kết đầu trang chat từ 1280px là "Tin nhắn".

### D-305 — Trạng thái trống và lối vào hai màn · **Người dùng duyệt** (phần 1, gồm hai điểm agent tự chọn)
- Tin nhắn khi chưa có tài khoản nào của provider chat: "Tin nhắn đang trống." kèm một dòng "Kết nối" cho mỗi provider chat của danh mục; danh mục chưa có provider chat thì một nút "Kết nối tài khoản" (`/accounts?connect=new`). Hộp thư giữ trạng thái trống hiện có, chỉ tính provider email.
- "Đồng bộ lần đầu" của mỗi màn chỉ tính tài khoản cùng loại.
- Bước 5 "Hoàn tất" của hộp thoại kết nối: provider `CHAT` → "Mở Tin nhắn" (`/messages`), provider `EMAIL` → "Mở hộp thư" (`/inbox`).
- Tổng quan: thẻ "Hộp thư hợp nhất" giữ nội dung gộp (số chưa đọc, chờ trả lời, cuộc trò chuyện mới nhất, tỷ lệ theo nguồn); nút "Mở hộp thư" tách thành hai nút "Tin nhắn" (`/messages`) và "Hộp thư" (`/inbox`).
**Phương án bị loại (Tổng quan):** tách thành hai thẻ (vẽ lại canvas nhiều, lưới thẻ ba cỡ đổi theo).

### D-306 — Provider tự khai loại · **Người dùng duyệt** (phần 2)
- `ProviderKind { EMAIL, CHAT }` ở gói gốc `dev.sino.provider` (cạnh `ProviderType`).
- `MessageProvider.kind()` **không có default**: connector quên khai thì không build được. Gmail khai `EMAIL`; Zalo (ZL-06) khai `CHAT`; provider giả trong test tự khai.
- `ProviderDescriptor(type, displayName, kind, capabilities)`; mỗi phần tử của `GET /api/providers` có `"kind": "EMAIL" | "CHAT"`.
**LÝ DO:** loại là đặc điểm của connector, nằm cạnh capability; không thêm dữ liệu vào database.
**Phương án bị loại:** suy loại từ `ConversationType` (một provider chat có thể dùng THREAD, ví dụ chủ đề Telegram; loại phải giống nhau cho mọi cuộc trò chuyện của một provider để danh sách và số đếm khớp); default `EMAIL` trên interface (connector chat mới quên khai sẽ lặng lẽ vào Hộp thư).

### D-307 — API theo loại · **Người dùng duyệt** (phần 2)
- `GET /api/conversations?kind=email|chat`: không bắt buộc; thiếu thì mọi loại như hôm nay; giá trị lạ → `400` như `view` sai. Lọc ở cùng chỗ với `provider`: bỏ khỏi `accountsOf()` các tài khoản có provider khác loại. Câu SQL giữ nguyên. `kind` lệch với `provider` (`?kind=chat&provider=gmail`) → trang rỗng, không lỗi.
- `GET /api/conversations/counts?kind=…`: các trường hiện có tính trong phạm vi loại (`byProvider` chỉ provider cùng loại); thêm `unreadByKind: { "EMAIL": n, "CHAT": m }` luôn đếm cả hai loại, có đủ hai khóa kể cả khi 0. Điều hướng gọi `counts` không kèm `kind` và đọc `unreadByKind`.
- `kind` của từng dòng (`ConversationResponse`, cả `GET /api/conversations/{id}`) lấy theo loại của provider; chọn `title`/`subject` cũng theo `kind` thay vì `ConversationType.THREAD`. Với Gmail kết quả không đổi.
- Không đổi: sự kiện SSE (web suy loại từ `accountId` qua tài khoản và provider đã tải; điều hướng vẫn đọc lại số đếm khi có sự kiện), `GET /api/accounts`, các đường chỉ email có (HTML, Reply-To, subject, gom thread theo `Message-ID`: tin chat là chữ thường, không có `Message-ID`).
- `POST /api/conversations` (Thư mới, BE-84 của `f10-new-mail`, chưa làm): tài khoản gửi phải có provider `EMAIL`, không thì `422`. Ghi vào BE-84, không thuộc change này.
**Phương án bị loại:** endpoint riêng cho số trên điều hướng (thêm một đường cho một con số `counts` trả được); lọc bằng `c.type = 'THREAD'` trong SQL (theo từng cuộc trò chuyện, sai với provider chat dùng THREAD).

### D-308 — Provider không có trong registry tính là `EMAIL` · **Người dùng chốt** (mục 2.6 = A, 2026-10-16)
Tài khoản có provider không có connector trong registry (hôm nay chỉ một trường hợp: Gmail khi thiếu cấu hình Google) được tính là `EMAIL` ở danh sách, số đếm và `kind` của dòng; mỗi provider như vậy ghi một dòng log `WARN` một lần mỗi lần chạy. Connector có công tắc tắt MUST vẫn ở trong registry khi tắt (như Zalo, D-286), nên không rơi vào trường hợp này.
**LÝ DO:** trường hợp có thật duy nhất là Gmail, đúng là email; không cần migration hay nơi lưu thứ hai.
**Phương án bị loại:** B: cột `kind` trên `connected_account` ghi lúc kết nối (bền khi connector bị gỡ khỏi code, nhưng loại nằm hai nơi và phải giữ khớp, tốn một số migration khi V20 đang được giữ cho Ghi chú); C: ẩn khỏi cả hai màn (thư cũ biến khỏi giao diện).

### D-309 — Delta sửa spec của các change chưa archive; archive sau cùng · **Agent chốt**, để xem lại
Change này dùng `MODIFIED` trên các requirement đã viết ở change chưa archive khi requirement cũ trở nên sai (ví dụ "`/inbox` hiện mọi cuộc trò chuyện", "`kind` = `EMAIL` cho thread email"), và `ADDED` khi chỉ thêm. Vì vậy archive change này **sau** `f05-unified-inbox`, `f07-f08-realtime-inbox`, `fe-ui-overview`, `fe-ui-accounts`, `fe-ui-connect`, `fe-ui-inbox`. Với spec đã có trong `openspec/specs/` mà change khác cũng đang sửa (`provider-catalog-api` bị `zalo-personal` sửa requirement liệt kê provider), change này chỉ `ADDED` requirement mới để không đè nhau.
**LÝ DO:** sau khi archive hết, `openspec/specs/` phải mô tả đúng hệ thống đang chạy; chỉ thêm capability mới (cách của `f05b`) thì spec cũ của Hộp thư vẫn nói sai.
**Phương án bị loại:** chỉ `ADDED` ở capability mới và để spec cũ nói sai; sửa thẳng spec trong các change đã làm xong (mất dấu change nào đổi gì).

## Thiết kế chi tiết

### Backend

1. **Loại của provider (BE-110):** `ProviderKind`; `MessageProvider.kind()`; `ProviderDescriptor` thêm `kind` (giữa `displayName` và `capabilities`); `DefaultProviderRegistry` chép `kind` vào descriptor; `ProviderResponse` thêm `kind` (chuỗi `EMAIL`/`CHAT`). `GmailProvider.kind()` = `EMAIL`. Mọi provider giả trong test khai loại (các test đang dùng "telegram" làm chat khai `CHAT`).
2. **Loại của một tài khoản (BE-111):** một helper trong `conversation/application` (ví dụ `ConversationKinds`) trả loại theo `ProviderType`: hỏi registry bằng cách tra cứu không ném lỗi; không có thì `EMAIL` và `WARN` một lần cho mỗi type (D-308). Nhóm thread chỉ gom trong một provider nên loại của nhóm là loại của bản bất kỳ.
3. **Danh sách:** `ConversationsController.list` nhận `@RequestParam(required = false) @Pattern(regexp = "email|chat") String kind`; `InboxService.page` bỏ tài khoản khác loại cùng chỗ bỏ tài khoản khác `provider` (sau `accountsOf()`, trước khi bind `:accounts`). Không còn tài khoản nào thì trả trang rỗng như hôm nay.
4. **Số đếm:** `counts(ownerId, kind)`: các trường cũ tính trên tài khoản cùng loại; `unreadByKind` cộng số chưa đọc theo tài khoản rồi gom theo loại, trên mọi tài khoản trong phạm vi. `CountsResponse` thêm `Map<String, Long> unreadByKind` (luôn có `EMAIL` và `CHAT`).
5. **`kind` của dòng:** `InboxItem` mang `kind` (đặt bởi `InboxService` theo provider của bản chính); `ConversationResponse.from` lấy `kind` từ đó và chọn `title`/`subject` theo `kind`.
6. **README** của `sino-api`: ví dụ `curl` cho `?kind=` và `counts?kind=`.

Hợp đồng (phần mới):

```http
GET /api/providers
[ { "type": "gmail", "displayName": "Gmail", "kind": "EMAIL", "capabilities": ["READ_MESSAGES", "SEND_MESSAGES", "THREADS", "ATTACHMENTS"] } ]

GET /api/conversations?kind=email&view=unread
{ "items": [ { "id": "…", "provider": "gmail", "kind": "EMAIL", … } ], "nextCursor": null }

GET /api/conversations/counts?kind=email
{ "unread": 12, "byProvider": { "gmail": 12 }, "needsReply": 3, "withAttachments": 5,
  "scheduled": 0, "snoozed": 0, "unreadByKind": { "EMAIL": 12, "CHAT": 0 } }
```

### Web

1. **Hợp đồng dữ liệu (FE-110):** `ProviderInfo.kind` (`EMAIL` | `CHAT`); provider thiếu `kind` (backend cũ) tính là `EMAIL`, cùng quy tắc với D-308. `CountsResponse.unreadByKind`; thiếu thì Hộp thư lấy `unread`, Tin nhắn không có số. `fetchInbox(kind)` và các trang danh sách gửi `kind`; query key có `kind` để hai màn không dùng chung cache. Dữ liệu mẫu và MSW tách rõ chat (Zalo, Messenger, Telegram) và email (Gmail), MSW lọc theo `kind`.
2. **Điều hướng (FE-111):** `NAV_ITEMS` nhóm chính: Tổng quan, Tin nhắn (`/messages`, icon bong bóng chat, số `messagesUnread`), Hộp thư (`/inbox`, số `inboxUnread`); `TAB_ITEMS` theo D-301; `MORE_PATHS` thêm `/calendar`; `MorePage` có Lịch. `NavCounts` thêm `messagesUnread`; `useInboxUnread` thành hook đọc `unreadByKind` cho cả hai số.
3. **Hai màn (FE-112):** `InboxPage` nhận cấu hình màn theo loại (đường gốc, tiêu đề, chữ link quay lại, chữ dòng báo, có "Thư mới" hay không) thay vì viết cứng `/inbox`; router thêm `/messages` (trong `SCREENS`) và `/messages/:conversationId`. Mọi `navigate`/`Link` trong `features/inbox` dùng đường gốc của màn. Tự chuyển (D-303): khi dòng đang mở đã biết `kind` mà khác loại của màn, `navigate({ pathname: '/<màn đúng>/<id>' }, { replace: true })`, bỏ `?source`/`?view` của màn cũ. Dòng báo realtime chỉ cộng sự kiện của tài khoản cùng loại (suy từ `accountId` qua `InboxData.accounts`).
4. **Trạng thái và lối vào (FE-113):** trạng thái trống của Tin nhắn (D-305); "Đồng bộ lần đầu" theo loại; `ConnectWizard` bước 5 chọn nút theo `kind` của provider vừa nối; `InboxCard` hai nút.

### Canvas (CV-01, CV-02)

Đọc artifact canvas trước (bản mới nhất), sửa và publish lên cùng link; artifact giữ các phiên bản cũ nên quay lại được nếu người dùng không duyệt. Sau khi duyệt, chép các frame đã đổi và `canvas.json` vào `design/sino-ui/project/` và ghi mã phiên bản đã khớp vào `PROJECT_STATE.md`.

| Frame (bản tối và sáng) | Thay đổi |
|---|---|
| `Sidebar`, `Rail`, `TabBar`, `MobileMore` | Hai mục Tin nhắn, Hộp thư; Lịch vào Thêm |
| `Inbox`, `TabletInbox`, `MobileInbox` | Chỉ email; cột nguồn chỉ provider email |
| **Mới:** `Messages`, `TabletMessages`, `MobileMessages` | Màn Tin nhắn, dựng từ phần chat của các frame Inbox |
| `Conversation`, `MobileConversation`, `ThreadState` | Link quay lại theo màn |
| `InboxState` | Thêm trạng thái trống của Tin nhắn |
| `Dashboard`, `TabletDashboard`, `MobileDashboard` | Hai nút "Tin nhắn", "Hộp thư" |
| `ConnectWizardStep5` | Nút theo loại provider |
| Frame thao tác trên tin (`InboxRemind`, `InboxSnooze`, `MobileConversation*`…) | Chỉ sửa thanh điều hướng |

## Testing

**Backend** (test đỏ trước; `verify` trong worktree riêng):
- Registry: descriptor mang `kind`; connector giả `CHAT` và `EMAIL` ra đúng loại.
- `GET /api/providers` có `kind`.
- Danh sách: `?kind=chat` chỉ chat, `?kind=email` chỉ email, không có `kind` thì cả hai; provider giả "telegram" `CHAT` tạo THREAD vẫn ra `kind` = `CHAT` (chứng minh lấy theo provider); `?kind=chat&provider=gmail` → trang rỗng; `?kind=fax` → `400`.
- Số đếm: `counts?kind=` đúng phạm vi và `byProvider` chỉ cùng loại; `unreadByKind` có đủ hai khóa; không `kind` thì như hôm nay.
- D-308: tài khoản của provider không có connector tính là `EMAIL`, log `WARN` một lần.
- Kiểm bằng lỗi gài cho phần lọc theo loại và `unreadByKind`.

**Web** (vitest + MSW; lint, `tsc -b`, build):
- Điều hướng: hai mục với số riêng; tab bar năm ô theo D-301; tab "Thêm" sáng ở `/calendar`.
- Routes: `/messages` chỉ chat, `/inbox` chỉ email; tự chuyển hai chiều bằng `replace`; `?source` của loại kia quay về "Tất cả".
- Tin nhắn không có "Thư mới"; dòng báo "N tin mới" và "N thư mới" đúng màn; link quay lại đúng màn.
- Trạng thái trống của Tin nhắn; bước 5 hộp thoại kết nối theo loại; hai nút ở Tổng quan.
- Backend cũ: provider không có `kind` → `EMAIL`; counts không có `unreadByKind`.
- Chrome một lượt mỗi task ở các cỡ task đụng tới; kiểm bằng lỗi gài cho hàm thuần (chọn màn theo loại, lọc nguồn) ở task cuối; nghiệm thu đủ cỡ × 2 theme.

## Risks / Trade-offs

- **Link cũ tới chat chớp qua Hộp thư** trước khi tự chuyển → quyết định chuyển ngay khi biết `kind` (từ dòng đã tải hoặc `GET /{id}`), trước khi dựng trang mở; chấp nhận một lần tải khung.
- **Một connector bị gỡ khỏi code** mà account của nó còn: tin chat của nó sẽ vào Hộp thư (D-308) → requirement "connector có công tắc tắt vẫn ở trong registry", log `WARN`.
- **Archive bị chặn sau sáu change** (D-309) → thứ tự ghi trong `tasks.md`; các task nghiệm thu `fe-ui-*` đang hoãn là nút thắt.
- **Tin nhắn trống cho tới khi có Zalo** (chỉ Gmail chạy thật) → trạng thái trống nói rõ và dẫn tới kết nối; dữ liệu mẫu và MSW vẫn có chat để test.
- **Lịch xa hơn một chạm trên mobile** (D-301): đánh đổi người dùng đã chọn.
- **Hai request số đếm** khi đang ở một màn (một cho điều hướng, một cho màn): nhẹ, cùng câu SQL đã có.

## Migration Plan

Không migration. Thứ tự triển khai: backend thêm `kind` (web cũ bỏ qua trường mới và tham số mới vẫn tương thích: `counts` không `kind` trả như cũ), rồi web. Quay lại: bỏ web mới là đủ; backend mới chạy được với web cũ.

## Ảnh hưởng tới change khác

- `zalo-personal`: ZL-06 khai `kind()` = `CHAT`; ZL-11 nút cuối "Mở Tin nhắn" (ghi chú vào `tasks.md` sau khi phiên ZL-05 commit xong, vì nó đang sửa file đó).
- `f10-new-mail`: BE-84 kiểm tài khoản gửi là `EMAIL` (D-307).
- `f05b-merged-threads`: BE-82 (code dở trong worktree `sino-threads`) sửa `InboxService`, `ConversationSummaries`; làm BE-82 trước BE-111.

## Open Questions

- Không còn câu hỏi mở về thiết kế. Chữ, icon và vị trí cuối cùng do canvas (CV-01) quyết.

## Definition of Done

- [ ] Canvas có các frame mới và frame đã sửa, người dùng duyệt; bản sao trong repo khớp link.
- [ ] D-306…D-308 làm đúng ở backend, có test; `./mvnw -B -ntp verify` xanh.
- [ ] Web: hai màn, điều hướng, tự chuyển, trạng thái trống, hộp thoại kết nối, Tổng quan; `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome đủ cỡ × 2 theme ở nghiệm thu.
- [ ] Chạy thật với backend: Gmail thật nằm ở Hộp thư, số "Hộp thư" đúng, Tin nhắn hiện trạng thái trống; link cũ `/inbox/<id>` vẫn mở.
- [ ] File kiến thức của phase có phần của change (bản `.docx` sinh lại); `openspec validate f05c-messages-inbox-split --strict`; archive theo D-309.
