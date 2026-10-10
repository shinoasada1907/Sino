## ADDED Requirements

### Requirement: Danh sách thư của một cuộc trò chuyện
`GET /api/conversations/{id}/messages` MUST trả các thư của cuộc trò chuyện theo `sentAt` giảm dần rồi `id` giảm dần, mỗi trang tối đa `limit` thư (mặc định 20, từ 1 tới 100), kèm `nextCursor` để lấy trang cũ hơn (`null` khi hết). Hai trang liên tiếp MUST NOT trùng hay sót thư, kể cả khi nhiều thư cùng `sentAt`. Cuộc trò chuyện không thuộc người dùng, không tồn tại, hoặc của account đã xóa hay `DISABLED` MUST trả `404` như `GET /api/conversations/{id}`; `cursor` không do API này phát ra hoặc `limit` ngoài khoảng MUST trả `400`.

#### Scenario: Hai trang
- **WHEN** cuộc trò chuyện có 25 thư và web gọi không có `cursor`, rồi gọi với `nextCursor` vừa nhận
- **THEN** trang đầu có 20 thư mới nhất, trang sau có 5 thư còn lại và `nextCursor` = `null`

#### Scenario: Thư cùng giờ
- **WHEN** ba thư có cùng `sentAt` nằm ở chỗ cắt trang và `limit` = 2
- **THEN** cả ba thư xuất hiện đúng một lần qua hai trang

#### Scenario: Cuộc trò chuyện của account đã xóa
- **WHEN** account của cuộc trò chuyện đã bị xóa
- **THEN** response là `404`

### Requirement: Các trường của một thư
Mỗi thư MUST có `id`, `direction`, `status`, `sentAt`, `sender` (`name` có thể `null`, `address`, `self`), `to`, `cc`, `subject`, `text`, `bodyFormat` (`TEXT` | `HTML` | `UNCHECKED`), `read` và `attachments` (`id`, `fileName`, `mimeType`, `sizeBytes`). `to` và `cc` MUST là `null` khi Sino không biết người nhận (thư nhập trước khi Sino lưu người nhận) và `[]` khi thư không có. Danh sách `attachments` MUST NOT có ảnh nhúng. Response MUST NOT chứa HTML của thư.

#### Scenario: Thư nhập trước khi lưu người nhận
- **WHEN** thư được nhập trước change này
- **THEN** `to` và `cc` là `null` và `bodyFormat` là `UNCHECKED`

#### Scenario: Thư có ảnh nhúng và một tệp PDF
- **WHEN** thư có một ảnh nhúng `cid:` và một tệp PDF
- **THEN** `attachments` chỉ có tệp PDF

### Requirement: Người nhận được lưu khi nhập
Khi nhập hay đồng bộ thư, Sino MUST lưu người nhận `To` và `Cc` cùng `Reply-To` (tên nếu có và địa chỉ) của thư; `Reply-To` không có trong response của danh sách thư. Thư đã có được cập nhật lại (nhãn, đã đọc) MUST NOT mất người nhận đã lưu.

#### Scenario: Thư gửi cho hai người, một người Cc
- **WHEN** đồng bộ một thư có `To: An <an@example.com>, binh@example.com` và `Cc: chi@example.com`
- **THEN** `to` có hai người theo đúng thứ tự, `cc` có một người
