## ADDED Requirements

### Requirement: Lọc danh sách theo loại
`GET /api/conversations` MUST nhận tham số không bắt buộc `kind` là `email` hoặc `chat`: chỉ trả conversation của các account có provider cùng loại (D-306, D-308). Thiếu `kind` MUST trả mọi loại như trước. `kind` khác hai giá trị trên MUST trả `400` theo định dạng lỗi chung. `kind` và `provider` cùng có mà provider khác loại MUST trả trang rỗng, không lỗi.

#### Scenario: Chỉ chat
- **WHEN** owner có account Gmail và account của một provider `CHAT`, và gọi `GET /api/conversations?kind=chat`
- **THEN** mọi item có `kind` = `CHAT` và không có conversation Gmail nào

#### Scenario: Không có kind
- **WHEN** owner gọi `GET /api/conversations` không có `kind`
- **THEN** danh sách có conversation của cả hai loại như trước

#### Scenario: Loại lạ
- **WHEN** owner gọi `GET /api/conversations?kind=fax`
- **THEN** API trả `400`

#### Scenario: Loại lệch với provider
- **WHEN** owner gọi `GET /api/conversations?kind=chat&provider=gmail`
- **THEN** API trả `200` với `items` rỗng và `nextCursor` = null

### Requirement: Số đếm theo loại
`GET /api/conversations/counts` MUST nhận tham số không bắt buộc `kind` (`email` hoặc `chat`, giá trị khác trả `400`): khi có, mọi trường hiện có (`unread`, `byProvider`, `needsReply`, `withAttachments`, `scheduled`, `snoozed`) MUST chỉ tính conversation của account cùng loại, và `byProvider` chỉ có provider cùng loại. Response MUST luôn có `unreadByKind` với đủ hai khóa `EMAIL` và `CHAT` (0 khi không có), đếm conversation chưa lưu trữ có thư chưa đọc của cả hai loại, không phụ thuộc `kind`.

#### Scenario: Đếm Hộp thư
- **WHEN** owner có 3 conversation Gmail chưa đọc và 2 conversation chat chưa đọc, đều chưa lưu trữ, và gọi `GET /api/conversations/counts?kind=email`
- **THEN** `unread` = 3, `byProvider` chỉ có `gmail`, và `unreadByKind` = `{ "EMAIL": 3, "CHAT": 2 }`

#### Scenario: Chưa có chat
- **WHEN** owner chỉ có account Gmail và gọi `GET /api/conversations/counts`
- **THEN** `unreadByKind.CHAT` = 0

### Requirement: Loại của provider không có connector
Account có provider không có connector trong registry (ví dụ Gmail khi thiếu cấu hình Google) MUST được tính là loại `EMAIL` ở danh sách, số đếm và `kind` của item. Ứng dụng MUST ghi một dòng log mức `WARN` cho mỗi provider như vậy, một lần mỗi lần chạy, không ghi lại ở mỗi request.

#### Scenario: Gmail tắt vì thiếu cấu hình
- **WHEN** ứng dụng chạy không có cấu hình Google, owner còn account Gmail có thư, và gọi `GET /api/conversations?kind=email` hai lần
- **THEN** cả hai lần đều có thư Gmail với `kind` = `EMAIL`, và log có đúng một dòng `WARN` nêu `gmail`

## MODIFIED Requirements

### Requirement: Nội dung một conversation trong danh sách
Mỗi item MUST có `id`, `accountId`, `provider`, `kind` (loại của provider: `EMAIL` hoặc `CHAT`, theo D-306 và D-308, không theo `ConversationType`), `title` (email: người bên kia; chat: tiêu đề), `subject` (email: tiêu đề thread; chat: rỗng), `memberCount` và `snippetFrom` (chat nhóm), `snippet`, `lastMessageAt`, `unreadCount`, `needsReply`, `hasAttachments`, `archived`, và `snooze`, `scheduledSend`, `linked` (rỗng cho tới khi có tính năng đó). Item MUST NOT chứa nội dung đầy đủ của thư hay HTML.

#### Scenario: Một thread email
- **WHEN** danh sách có một thread Gmail mà thư mới nhất do người khác gửi
- **THEN** item có `kind` = `EMAIL`, `title` là tên người gửi đó, `subject` là tiêu đề thread, `snippet` là đoạn đầu chữ của thư mới nhất

#### Scenario: Chat dạng thread
- **WHEN** một provider loại `CHAT` lưu một conversation có `ConversationType` = `THREAD`
- **THEN** item có `kind` = `CHAT`, `subject` rỗng và `title` là tiêu đề của cuộc chat
