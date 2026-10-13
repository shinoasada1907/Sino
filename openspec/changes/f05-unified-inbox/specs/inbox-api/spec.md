## ADDED Requirements

### Requirement: Danh sách conversation của Hộp thư
`GET /api/conversations` MUST trả `{ items, nextCursor }` gồm các conversation của những account của owner chưa bị xóa (D-66) và không `DISABLED` (D-12), sắp theo thời điểm thư mới nhất giảm dần rồi ID giảm dần, phân trang keyset bằng `cursor` mờ và `limit` (1–100, mặc định 30). Tham số `view` MUST là một trong `all` (không lưu trữ, mặc định), `unread` (có thư chưa đọc), `reply` (cần trả lời), `attachments` (có tệp), `archived` (đã lưu trữ), `scheduled`, `snoozed` (tạm thời luôn rỗng); `unread`, `reply`, `attachments` MUST NOT gồm conversation đã lưu trữ. `provider` và `accountId` MUST lọc thêm. `view`, `limit`, `cursor` hoặc `accountId` không hợp lệ MUST trả `400` theo định dạng lỗi chung.

#### Scenario: Hộp thư mặc định
- **WHEN** owner gọi `GET /api/conversations`
- **THEN** kết quả có các conversation chưa lưu trữ của account đang hoạt động, conversation có thư mới nhất đứng đầu

#### Scenario: Lật trang khi nhiều conversation cùng giờ
- **WHEN** nhiều conversation có cùng thời điểm thư mới nhất và owner lật trang bằng `nextCursor` với `limit` nhỏ
- **THEN** mỗi conversation xuất hiện đúng một lần qua các trang

#### Scenario: Account đã xóa
- **WHEN** một account của owner đã bị xóa
- **THEN** conversation của account đó không có trong danh sách và số đếm, nhưng thư của nó vẫn còn trong database

#### Scenario: View lạ
- **WHEN** owner gọi `GET /api/conversations?view=starred`
- **THEN** API trả `400`

### Requirement: Nội dung một conversation trong danh sách
Mỗi item MUST có `id`, `accountId`, `provider`, `kind` (`EMAIL` cho thread email, `CHAT` cho loại khác), `title` (email: người bên kia; chat: tiêu đề), `subject` (email: tiêu đề thread; chat: rỗng), `memberCount` và `snippetFrom` (chat nhóm), `snippet`, `lastMessageAt`, `unreadCount`, `needsReply`, `hasAttachments`, `archived`, và `snooze`, `scheduledSend`, `linked` (rỗng cho tới khi có tính năng đó). Item MUST NOT chứa nội dung đầy đủ của thư hay HTML.

#### Scenario: Một thread email
- **WHEN** danh sách có một thread Gmail mà thư mới nhất do người khác gửi
- **THEN** item có `kind` = `EMAIL`, `title` là tên người gửi đó, `subject` là tiêu đề thread, `snippet` là đoạn đầu chữ của thư mới nhất

### Requirement: Số đếm của Hộp thư
`GET /api/conversations/counts` MUST trả số conversation chưa lưu trữ có thư chưa đọc (`unread`), số đó theo provider (`byProvider`), số cần trả lời (`needsReply`), số có tệp (`withAttachments`), và `scheduled`, `snoozed` (tạm thời 0), trên cùng phạm vi account với danh sách.

#### Scenario: Đếm chưa đọc theo provider
- **WHEN** owner có 3 conversation Gmail chưa đọc chưa lưu trữ và 1 đã lưu trữ
- **THEN** `unread` = 3 và `byProvider.gmail` = 3

### Requirement: Xem và đổi một conversation
`GET /api/conversations/{id}` MUST trả item kèm danh sách người tham gia (tên, ID provider, có phải mình). `PATCH /api/conversations/{id}` với `read` và/hoặc `archived` MUST: `read: true` đánh dấu mọi thư đã đọc; `read: false` đánh dấu thư mới nhất chưa đọc; `archived` bật/tắt lưu trữ; trả item sau khi đổi. Thay đổi MUST chỉ có trong Sino, MUST NOT ghi sang provider (D-67). Conversation không thuộc owner, thuộc account đã xóa hoặc `DISABLED`, hoặc không tồn tại MUST trả `404` với mã `CONVERSATION_NOT_FOUND`.

#### Scenario: Đánh dấu đã đọc
- **WHEN** owner gửi `PATCH /api/conversations/{id}` với `{ "read": true }`
- **THEN** item trả về có `unreadCount` = 0 và không có lời gọi nào tới Gmail

#### Scenario: Lưu trữ
- **WHEN** owner gửi `PATCH` với `{ "archived": true }`
- **THEN** conversation không còn trong view `all` và có trong view `archived`

#### Scenario: Conversation của account đã xóa
- **WHEN** owner gọi `GET /api/conversations/{id}` cho conversation của account đã xóa
- **THEN** API trả `404` mã `CONVERSATION_NOT_FOUND`
