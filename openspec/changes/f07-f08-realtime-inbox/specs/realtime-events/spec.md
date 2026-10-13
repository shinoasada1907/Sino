## ADDED Requirements

### Requirement: Luồng sự kiện cho người dùng đã đăng nhập
`GET /api/events/stream` MUST trả `text/event-stream` cho người dùng đã đăng nhập, và `401` (không chuyển hướng) khi chưa đăng nhập hay phiên đã hết. Luồng MUST mở đầu bằng `retry: 3000`, MUST gửi comment `:` khoảng mỗi 25 giây, MUST có header `X-Accel-Buffering: no` và không được nén. Server MUST đóng mỗi luồng sau một thời gian cấu hình được (mặc định 20 phút) để trình duyệt nối lại và đăng nhập được kiểm lại. Mỗi người dùng MUST có tối đa 5 luồng (cấu hình được); luồng mới vượt giới hạn MUST đóng luồng cũ nhất của người đó (D-77).

#### Scenario: Chưa đăng nhập
- **WHEN** một request không có phiên gọi `GET /api/events/stream`
- **THEN** response là `401`

#### Scenario: Mở luồng
- **WHEN** người dùng đã đăng nhập mở luồng
- **THEN** dữ liệu đầu tiên có `retry: 3000`, và trong lúc không có sự kiện vẫn có comment `:` định kỳ

#### Scenario: Quá nhiều tab
- **WHEN** người dùng mở luồng thứ 6 trong lúc 5 luồng khác đang mở
- **THEN** luồng mở sớm nhất bị đóng, 5 luồng còn lại vẫn nhận sự kiện

### Requirement: Sự kiện khi Hộp thư đổi
Sau khi một transaction lưu thư (nhập đầu hoặc đồng bộ) có thư mới hoặc thư đổi đã commit, và sau khi người dùng đổi đã đọc/chưa đọc/lưu trữ của một conversation đã commit, server MUST gửi tới mọi luồng của owner account đó một sự kiện có tên `conversations.changed` và data JSON `{ "type": "conversations.changed", "accountId", "conversationIds", "newInbound", "source", "at" }`, với `source` là `import`, `sync` hoặc `user`, `newInbound` là số thư đến vừa được thêm. Transaction rollback MUST NOT tạo sự kiện. Owner khác MUST NOT nhận sự kiện.

#### Scenario: Thư mới từ đồng bộ
- **WHEN** một lượt đồng bộ lưu 2 thư đến mới vào 2 conversation của account của owner A
- **THEN** các luồng của owner A nhận `conversations.changed` với `source` = `sync`, `newInbound` = 2 và hai ID conversation; luồng của owner B không nhận gì

#### Scenario: Người dùng đánh dấu đã đọc
- **WHEN** owner gửi `PATCH /api/conversations/{id}` với `{"read": true}`
- **THEN** các luồng của owner nhận `conversations.changed` với `source` = `user`, `newInbound` = 0 và ID conversation đó

#### Scenario: Lưu thất bại
- **WHEN** transaction lưu một trang thư bị rollback
- **THEN** không luồng nào nhận sự kiện cho trang đó

### Requirement: Sự kiện khi account đổi
Server MUST gửi sự kiện `account.changed` với data `{ "type": "account.changed", "accountId", "at" }` tới các luồng của owner khi account được kết nối, bị xóa hoặc đổi trạng thái, khi một trang của lần nhập đầu được lưu, khi lần nhập đầu xong hoặc lỗi, khi lỗi đồng bộ xuất hiện hoặc hết, và khi watch được đăng ký hoặc lỗi.

#### Scenario: Tiến độ nhập
- **WHEN** lần nhập đầu lưu xong một trang
- **THEN** các luồng của owner nhận `account.changed` với ID account đó

### Requirement: Sự kiện không mang nội dung
Sự kiện MUST chỉ chứa tên loại, ID account, ID conversation, con số, nguồn và thời điểm; MUST NOT chứa tiêu đề, người gửi, địa chỉ, đoạn xem trước hay nội dung thư. Tên `event:` MUST trùng `type` trong data; sự kiện MUST NOT có `id:` (web đọc lại dữ liệu sau mỗi lần nối lại).

#### Scenario: Kiểm envelope
- **WHEN** một thư có tiêu đề "Hợp đồng" được lưu và sự kiện được gửi
- **THEN** dữ liệu của luồng không chứa "Hợp đồng" hay địa chỉ người gửi
