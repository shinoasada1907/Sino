## ADDED Requirements

### Requirement: Liệt kê bạn bè và nhóm của tài khoản Zalo
`sino-zalo` MUST nhận `GET /accounts/:accountId/contacts` và trả `200 { "friends": [ { "id", "name", "avatarUrl" } ], "groups": [ { "id", "name", "avatarUrl", "memberCount" } ] }`: toàn bộ bạn bè từ `getAllFriends`, toàn bộ nhóm từ `getAllGroups` với tên, ảnh và số thành viên lấy bằng `getGroupInfo` theo lô. `name` MUST là tên Zalo (`displayName || zaloName` cho bạn bè), không phải tên gợi nhớ do `sino-zalo` thêm vào. Log MUST NOT chứa tên.

#### Scenario: Bạn bè và nhóm
- **WHEN** tài khoản `a1` có phiên sống, hai người bạn và một nhóm 12 người
- **THEN** `GET /accounts/a1/contacts` trả `200` với hai mục trong `friends` và một mục trong `groups` có `memberCount: 12`

#### Scenario: Nhiều nhóm hơn một lô
- **WHEN** tài khoản có 120 nhóm
- **THEN** `sino-zalo` gọi `getGroupInfo` nhiều lần, mỗi lần không quá cỡ lô, và `groups` có đủ 120 mục

### Requirement: Không bao giờ trả danh sách thiếu
Khi bất kỳ lần gọi Zalo nào của một lần liệt kê thất bại hay quá giờ, `sino-zalo` MUST trả `502` với `code: "ZALO_UNAVAILABLE"` cho cả lần đó. Tài khoản không có phiên sống MUST trả `409` với `code: "NO_SESSION"`.

#### Scenario: Một lô nhóm lỗi
- **WHEN** lô `getGroupInfo` thứ hai thất bại
- **THEN** `sino-zalo` trả `502 ZALO_UNAVAILABLE`, không trả `friends` hay `groups` nào

#### Scenario: Không có phiên
- **WHEN** `sino-api` hỏi danh bạ của tài khoản chưa có phiên sống
- **THEN** `sino-zalo` trả `409 NO_SESSION`
