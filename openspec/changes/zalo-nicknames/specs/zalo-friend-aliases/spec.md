## ADDED Requirements

### Requirement: Đặt và xóa tên gợi nhớ của bạn bè
`sino-zalo` MUST nhận `PUT /accounts/:accountId/aliases/:friendId` với `{ "alias" }` và gọi `changeFriendAlias`, nhận `DELETE` cùng đường và gọi `removeFriendAlias`; thành công trả `204`. Zalo từ chối MUST trả `422` với `code: "ALIAS_REJECTED"`; tài khoản không có phiên MUST trả `409`. Log MUST NOT chứa tên gợi nhớ.

#### Scenario: Đặt tên gợi nhớ
- **WHEN** `sino-api` gửi `PUT /accounts/a1/aliases/8001` với `{ "alias": "Mẹ" }` và Zalo đồng ý
- **THEN** `sino-zalo` trả `204` và lần `GET /accounts/a1/aliases` sau có `{ "friendId": "8001", "alias": "Mẹ" }`

#### Scenario: Zalo từ chối
- **WHEN** Zalo trả lỗi cho `changeFriendAlias` (ví dụ người đó không phải bạn bè)
- **THEN** `sino-zalo` trả `422` với `code: "ALIAS_REJECTED"`

### Requirement: Đọc mọi tên gợi nhớ
`GET /accounts/:accountId/aliases` MUST trả mọi tên gợi nhớ của tài khoản, đã lật hết các trang của `getAliasList`, dạng `{ "items": [ { "friendId", "alias" } ] }`. Hai lần hỏi trong 60 giây MUST NOT gọi Zalo hai lần, trừ khi đã có `PUT` hay `DELETE` ở giữa.

#### Scenario: Nhiều trang
- **WHEN** Zalo trả tên gợi nhớ thành hai trang
- **THEN** `items` có đủ tên của cả hai trang

### Requirement: Tên gốc chat 1-1 không lẫn tên gợi nhớ
`title` của chat 1-1 mà `sino-zalo` đưa cho `sino-api` MUST là tên của người đó trên Zalo, không phải tên gợi nhớ chủ tài khoản đặt.

#### Scenario: Người bạn có tên gợi nhớ
- **WHEN** chủ tài khoản đã đặt tên gợi nhớ "Mẹ" cho một người bạn tên "Nguyễn Thị A"
- **THEN** cuộc trò chuyện 1-1 với người đó trong `GET /accounts/:id/messages` có `title: "Nguyễn Thị A"`
