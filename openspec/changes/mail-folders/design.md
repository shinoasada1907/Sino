## Mode

AUTO (người dùng, 2026-11-16: "AUTO: đội tự code", hỏi vì `new_features` là TRAINING); ghi vào `project-mode.yaml` `task_overrides.mail-folders` khi đề án được duyệt. Hai cổng duyệt như mọi feature: đề án này, rồi kết quả trước khi commit.

## Context

- `GmailProvider.HIDDEN_LABELS = {DRAFT, SPAM, TRASH}`: thư mang một trong ba nhãn bị bỏ ở cả lượt đầu lẫn lượt thay đổi (`isShown`).
- Lượt thay đổi (`history`) đã nghe `labelAdded` / `labelRemoved`, đọc lại thư và upsert (`JdbcConversationStore`, `ON CONFLICT ... DO UPDATE`), nhưng nhãn không được lưu.
- `messages.list` của Gmail bỏ Spam / Thùng rác trừ khi có `includeSpamTrash=true`.
- `InboxView`: điều kiện SQL theo từng view; `ARCHIVED = c.archived` (cờ của Sino). Cuộc ghép nhiều tài khoản (f05b) gộp bằng `bool_and` / `bool_or` trong `InboxService`.
- Web: `format.ts` có `InboxView` gồm `archived`; sidebar đã có ba link `?folder=`; không ai đọc `folder`.

## Goals / Non-Goals

**Goals:** ba danh sách Đã gửi, Thư rác (Spam + Thùng rác), Đã lưu trữ (Sino + Gmail) cho email; hộp thư chính không còn lẫn spam; dữ liệu cũ có ngay sau đồng bộ bù.

**Non-Goals:** thao tác chuyển thư mục từ Sino, xóa vĩnh viễn, nháp, Zalo, nhãn tùy biến, số đếm cho ba mục trên sidebar.

## Decisions

### DN-1 — "Thư rác" gồm Spam và Thùng rác · **người dùng chốt** (2026-11-16)
Một mục gom nhãn `SPAM` và `TRASH`. Lựa chọn khác: chỉ Spam, chỉ Thùng rác.

### DN-2 — "Đã lưu trữ" gồm lưu trữ ở Sino và ở Gmail · **người dùng chốt** (2026-11-16)
Lựa chọn khác: chỉ cờ `archived` của Sino (chỉ nối web).

### DN-3 — "Đã gửi" là cuộc có ít nhất một thư tôi gửi · **người dùng chốt** (2026-11-16)
Như Sent của Gmail. Lựa chọn khác: chỉ cuộc tôi mở đầu.

### DN-4 — Đồng bộ bù một lần cho tài khoản đã kết nối · **người dùng chốt** (2026-11-16)
Lựa chọn khác: chỉ từ nay về sau (Thư rác và Lưu trữ gần như trống lúc đầu).

### DN-5 — Hướng A: `message.mailbox` + cờ tính sẵn trên `conversation` · **người dùng chốt** (2026-11-16)
Lựa chọn khác: B, lưu mảng nhãn thô và lọc lúc đọc (chậm hơn, logic Gmail lọt vào `conversation`); C, gọi thẳng Gmail mỗi lần mở mục (không gộp được tài khoản, phụ thuộc Gmail).

### D-498 — `mailbox` là trường có kiểu của `NormalizedMessage` · agent chốt
Enum `Mailbox { INBOX, ARCHIVE, SPAM, TRASH }` trong `provider/spi`, null khi provider không có thư mục (Zalo). Không dùng khóa `metadata`, vì `conversation` cần đọc nó làm cột và lọc. Gmail đổi nhãn theo thứ tự ưu tiên: `TRASH` > `SPAM` > `INBOX` > còn lại `ARCHIVE`. Riêng thư **gửi đi** không có `INBOX` thì là null (không phải ARCHIVE): một thư tôi gửi mà chưa ai trả lời thì Gmail không gắn `INBOX`, và nó không được coi là "đã lưu trữ".

### D-499 — Cột và cờ · agent chốt
- `message.mailbox varchar(16) NULL` (check theo enum).
- `conversation`: `has_inbox`, `has_archive`, `has_junk`, `has_sent boolean NOT NULL DEFAULT false`, tính lại trong `ConversationSummaries` cùng câu với `unread_count`:
  - `has_inbox` = có thư `mailbox = 'INBOX'` **hoặc** `mailbox IS NULL AND direction = 'INBOUND'` (chat và dữ liệu chưa bù vẫn ở hộp thư);
  - `has_archive` = có thư `ARCHIVE`; `has_junk` = có thư `SPAM` hoặc `TRASH`; `has_sent` = có thư `direction = 'OUTBOUND'` không ở `SPAM` / `TRASH`.
- Migration chỉ thêm cột với giá trị mặc định rồi tính cờ một lần từ `direction` (để `has_sent` đúng ngay và `has_inbox` giữ hành vi cũ). Lượt bù D-501 điền `mailbox`.

### D-500 — Điều kiện của các view · agent chốt
Cuộc chỉ có thư gửi đi (chưa ai trả lời) có ba cờ kia là false; nó vẫn nằm trong hộp thư như hôm nay.

| View | Điều kiện |
|---|---|
| `all`, `unread`, `reply`, `attachments` | `NOT c.archived AND (c.has_inbox OR NOT (c.has_archive OR c.has_junk))` + điều kiện riêng như cũ |
| `archived` | `(c.archived OR (c.has_archive AND NOT c.has_inbox)) AND (c.has_inbox OR c.has_archive OR NOT c.has_junk)` |
| `sent` (mới) | `c.has_sent` |
| `trash` (mới) | `c.has_junk` |

`counts` dùng cùng điều kiện "hộp thư" như `all`. `sent` và `trash` chỉ có cuộc email (Zalo không bao giờ có `has_junk`; `sent` cho `kind=email` là hợp đồng web dùng). Cuộc ghép f05b: `has_*` gộp bằng `bool_or`. Thứ tự trang của `sent` vẫn theo `last_message_at` như các view khác (không xếp theo thời điểm gửi riêng, để dùng chung cursor; ghi ở *Risks*).

### D-501 — Đồng bộ bù · agent chốt
Một việc chạy một lần cho mỗi tài khoản Gmail đang hoạt động (đánh dấu đã chạy, ví dụ trong `sync_state` của tài khoản, để không chạy lại; chạy lại được bằng tay qua admin):
1. Liệt kê id (chỉ `id`, không đọc nội dung) của `in:spam`, `in:trash` (`includeSpamTrash=true`) và `-in:inbox` trong khoảng `since` của tài khoản.
2. Thư đã lưu: đặt `mailbox` theo ba tập đó, còn lại có nhãn INBOX thì `INBOX` (thư gửi đi theo D-498); tính lại cờ các cuộc bị đổi.
3. Thư Spam / Thùng rác chưa có trong DB: đọc và lưu như lượt đồng bộ thường.
Chạy nền, không chặn đồng bộ thường; lỗi một tài khoản không chặn tài khoản khác, ghi log và để lần khởi động sau thử lại.

### D-502 — Web đọc `folder` · agent chốt
`?folder=sent|trash|archive` ánh xạ sang `view=sent|trash|archived` và `kind=email`; giá trị lạ về hộp thư thường. Khi có `folder`, tab bộ lọc của hộp thư ẩn, tiêu đề là tên thư mục, mục sidebar tương ứng sáng (mục "Hộp thư" không sáng). Trạng thái rỗng riêng: "Chưa có thư đã gửi", "Thư rác trống", "Chưa có thư lưu trữ". Đối chiếu canvas; canvas không có frame riêng thì dùng khung Hộp thư hiện có, không vẽ mới.

## Risks / Trade-offs

- **Cờ lệch thư** → tính lại ở đúng chỗ đang tính `unread_count`, có test cho từng lần đổi nhãn.
- **`sent` xếp theo thư mới nhất, không theo thư tôi gửi mới nhất** → khác Gmail một chút; đổi sau được mà không đổi hợp đồng.
- **Lượt bù gọi Gmail nhiều** → chỉ liệt kê id (rẻ), đọc nội dung chỉ thư rác chưa có; Gmail tự xóa thư rác sau 30 ngày nên ít.
- **Thư mục cũ của web có thay đổi chưa commit** (`InboxPage.tsx`, `InboxStates.tsx`, `SourcePane.tsx` bị xóa, chủ chưa rõ) → hỏi người dùng trước khi giao task web.

## Migration Plan

V30 thêm cột (an toàn, có mặc định). Deploy backend → lượt bù tự chạy → deploy web. Rollback: web cũ bỏ qua `folder`; API cũ không biết `sent`/`trash` (400), web mới phải deploy sau.

## Contract tóm tắt

```text
GET /api/conversations?view=sent|trash|archived&kind=email[&accountId=…][&cursor=…][&limit=…]
  -> ConversationPageResponse (không đổi trường)
GET /api/conversations/counts   -> không tính cuộc chỉ ở Thư rác hay chỉ lưu trữ bên Gmail
```
