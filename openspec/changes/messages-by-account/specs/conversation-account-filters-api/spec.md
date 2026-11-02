## ADDED Requirements

### Requirement: Số đếm theo tài khoản
`GET /api/conversations/counts` MUST trả thêm `byAccount`: một map từ ID tài khoản sang `{ "unread", "needsReply", "withAttachments" }`, đếm như các số tổng cùng tên (conversation chưa lưu trữ) nhưng chỉ trong tài khoản đó (D-425). Mọi tài khoản của chủ chưa xóa và chưa tắt MUST có mục riêng, kể cả khi cả ba số bằng 0. Khi có `kind`, `byAccount` MUST chỉ có tài khoản của provider cùng loại. Một thread có bản sao ở nhiều tài khoản (f05b) MUST được tính ở mỗi tài khoản giữ nó; các số tổng (`unread`, `needsReply`, `withAttachments`) MUST vẫn tính thread đó một lần.

#### Scenario: Hai tài khoản Zalo
- **WHEN** chủ có tài khoản Zalo A với 1 chat chưa đọc và tài khoản Zalo B với 3 chat chưa đọc, trong đó 2 chat cần trả lời, và gọi `GET /api/conversations/counts?kind=chat`
- **THEN** `byAccount` có đúng hai khóa A và B, `byAccount[A].unread` = 1, `byAccount[B].unread` = 3, `byAccount[B].needsReply` = 2, và `unread` = 4

#### Scenario: Tài khoản không có gì
- **WHEN** chủ có tài khoản Zalo C chưa có chat nào và gọi `GET /api/conversations/counts?kind=chat`
- **THEN** `byAccount[C]` = `{ "unread": 0, "needsReply": 0, "withAttachments": 0 }`

#### Scenario: Thread Gmail ở hai tài khoản
- **WHEN** một thread chưa đọc có bản sao ở hai tài khoản Gmail D và E, không có thư chưa đọc nào khác, và chủ gọi `GET /api/conversations/counts?kind=email`
- **THEN** `byAccount[D].unread` = 1, `byAccount[E].unread` = 1, và `unread` = 1

#### Scenario: Lọc loại bỏ tài khoản loại kia
- **WHEN** chủ có tài khoản Gmail D và tài khoản Zalo A, và gọi `GET /api/conversations/counts?kind=chat`
- **THEN** `byAccount` có A và không có D

### Requirement: Lọc chat 1-1 hay nhóm
`GET /api/conversations` MUST nhận tham số không bắt buộc `chatType` là `direct` hoặc `group` (D-426): `direct` MUST chỉ trả conversation loại `DIRECT`, `group` MUST chỉ trả conversation loại `GROUP` hoặc `CHANNEL`. Thiếu `chatType` MUST trả mọi loại như trước. Giá trị khác MUST trả `400` theo định dạng lỗi chung. Lọc MUST xảy ra trước khi chia trang, nên một trang có đủ `limit` dòng khi còn dòng khớp. `chatType` MUST ghép được với `kind`, `accountId`, `view` và `cursor`.

#### Scenario: Chỉ nhóm
- **WHEN** chủ có chat 1-1 "Hà" và nhóm "Gia đình" trên cùng tài khoản Zalo, và gọi `GET /api/conversations?kind=chat&chatType=group`
- **THEN** danh sách có "Gia đình" và không có "Hà"

#### Scenario: Chỉ cá nhân của một tài khoản
- **WHEN** chủ có chat 1-1 "Hà" trên tài khoản Zalo A và chat 1-1 "Tuấn" trên tài khoản Zalo B, và gọi `GET /api/conversations?kind=chat&chatType=direct&accountId=<A>`
- **THEN** danh sách chỉ có "Hà"

#### Scenario: Trang đầy dù xen kẽ
- **WHEN** chủ có 40 chat xen kẽ 1-1 và nhóm, trong đó 25 chat là nhóm, và gọi `GET /api/conversations?kind=chat&chatType=group&limit=20`
- **THEN** trang đầu có 20 nhóm và `nextCursor` khác null; trang theo `nextCursor` có 5 nhóm còn lại và `nextCursor` = null

#### Scenario: Giá trị lạ
- **WHEN** chủ gọi `GET /api/conversations?chatType=channel`
- **THEN** API trả `400`

#### Scenario: Thread email không phải chat
- **WHEN** chủ gọi `GET /api/conversations?kind=email&chatType=direct`
- **THEN** API trả `200` với `items` rỗng, vì thread email có loại `THREAD`
