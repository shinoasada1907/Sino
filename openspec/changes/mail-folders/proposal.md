## Why

Người dùng (2026-11-16, ảnh sidebar): "tính năng của email đang thiếu 3 tính năng lấy danh sách mail đã gửi, danh sách mail rác, danh sách mail đã lưu trữ". Sidebar của `sino-web` đã có ba mục **Đã gửi**, **Thư rác**, **Đã lưu trữ** (`/inbox?folder=sent|trash|archive`), nhưng web không đọc `folder`, và `sino-api` không có dữ liệu cho hai trong ba mục:

- Thư đã gửi được lưu (`MessageStatus.SENT`) nhưng không có bộ lọc "cuộc có thư tôi gửi".
- Đồng bộ Gmail bỏ hẳn thư có nhãn `SPAM`, `TRASH` (`GmailProvider.HIDDEN_LABELS`), nên Sino không có thư rác nào.
- `view=archived` chỉ là cờ lưu trữ trong Sino; thư lưu trữ bên Gmail (mất nhãn `INBOX`) vẫn nằm trong hộp thư Sino.

## What Changes

- **Hợp đồng provider:** `NormalizedMessage` có thêm `mailbox` (`INBOX | ARCHIVE | SPAM | TRASH`, null với provider không có thư mục). Gmail đổi nhãn thành `mailbox`, và không bỏ thư `SPAM`/`TRASH` nữa (vẫn bỏ `DRAFT`). Thư đổi nhãn bên Gmail đã được đọc lại và upsert như hôm nay, nên `mailbox` theo kịp.
- **`sino-api`, DB (migration V30):** `message.mailbox`; `conversation` có thêm các cờ `has_inbox`, `has_archive`, `has_junk`, `has_sent`, tính lại cùng chỗ với `unread_count` / `needs_reply`.
- **`sino-api`, API:** `GET /api/conversations?view=` nhận thêm `sent` và `trash`; `archived` gồm cả cuộc đã lưu trữ bên Gmail; các view của hộp thư (`all`, `unread`, `reply`, `attachments`) và `counts` không còn tính cuộc chỉ nằm ở Thư rác. Chat (Zalo) không đổi gì.
- **`sino-api`, đồng bộ bù một lần:** mỗi tài khoản Gmail chạy một lượt đọc lại nhãn của thư đã lưu và lấy thư Spam / Thùng rác hiện có.
- **`sino-web`:** `/inbox?folder=sent|trash|archive` mở Hộp thư ở đúng thư mục (tiêu đề, danh sách, trạng thái rỗng), mục sidebar sáng đúng chỗ.

Ngoài phạm vi: chuyển thư vào thùng rác, báo spam, khôi phục từ Sino; xóa vĩnh viễn; thư nháp; thư mục cho Zalo; nhãn Gmail tùy biến.

## Capabilities

### New Capabilities
- `mail-folders-api`: `sino-api` biết thư mục Gmail của từng thư và trả danh sách Đã gửi, Thư rác, Đã lưu trữ.
- `mail-folders-ui`: web mở Hộp thư theo thư mục từ sidebar.

### Modified Capabilities
- `provider-contract`: `NormalizedMessage` có `mailbox`.

## Impact

- **`apps/sino-api`:** `provider/spi/NormalizedMessage.java` (+ enum `Mailbox`), `provider/infrastructure/gmail/{GmailProvider,GmailMessageNormalizer,GmailApi}.java`, các connector khác và `FakeMessageProvider` (truyền null), `conversation/infrastructure/{JdbcConversationStore,ConversationSummaries}.java`, `conversation/application/{InboxView,InboxService}.java`, `conversation/api/ConversationsController.java`, module `sync` (lượt bù), migration `V30__conversation_mail_folders.sql`, README; test.
- **`apps/sino-web`:** `features/inbox/{format.ts,useInboxFilter.ts,InboxPage.tsx}`, `app/shell/Sidebar.tsx` (trạng thái sáng), MSW, test.
- **Gmail API:** thêm `includeSpamTrash=true` cho lượt bù; không thêm scope.
