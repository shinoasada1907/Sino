## ADDED Requirements

### Requirement: Biệt danh trong API
Mỗi cuộc trò chuyện trong `GET /api/conversations` và đầu `GET /api/conversations/{id}` MUST có `nickname`: biệt danh đã lưu của chat 1-1, hoặc `null`. `title` MUST giữ là tên từ nhà cung cấp.

#### Scenario: Chat có biệt danh
- **WHEN** một chat Zalo 1-1 có biệt danh "Mẹ" và tên Zalo "Nguyễn Thị A"
- **THEN** mục của nó có `nickname: "Mẹ"` và `title: "Nguyễn Thị A"`

### Requirement: Đặt biệt danh qua PATCH
`PATCH /api/conversations/{id}` MUST nhận `nickname`. Với chat 1-1 của nhà cung cấp có `NICKNAMES`, `sino-api` MUST gửi biệt danh xuống nhà cung cấp trước và chỉ lưu khi nhà cung cấp đồng ý; `""` hay `null` tường minh MUST xóa biệt danh. Nhóm hay thư MUST trả `422 NICKNAME_NOT_SUPPORTED`; nhà cung cấp từ chối MUST trả `422 NICKNAME_REJECTED` và biệt danh đã lưu MUST NOT đổi. Đổi thành công MUST phát `ConversationChanged`.

#### Scenario: Đặt thành công
- **WHEN** người dùng `PATCH` một chat Zalo 1-1 với `{ "nickname": "Mẹ" }` và Zalo đồng ý
- **THEN** phản hồi có `nickname: "Mẹ"` và web đang mở nhận sự kiện thay đổi cuộc trò chuyện

#### Scenario: Xóa biệt danh
- **WHEN** người dùng `PATCH` với `{ "nickname": null }`
- **THEN** `sino-zalo` nhận `DELETE` cho người đó và phản hồi có `nickname: null`

#### Scenario: Zalo từ chối
- **WHEN** Zalo từ chối biệt danh
- **THEN** phản hồi là `422 NICKNAME_REJECTED` và `GET` cuộc trò chuyện vẫn trả biệt danh cũ

#### Scenario: Nhóm
- **WHEN** người dùng `PATCH` một nhóm Zalo với `nickname`
- **THEN** phản hồi là `422 NICKNAME_NOT_SUPPORTED` và không có lời gọi nào tới `sino-zalo`

### Requirement: Đồng bộ biệt danh từ nhà cung cấp
Mỗi 5 phút (cấu hình được), với mỗi tài khoản đang kết nối có `NICKNAMES`, `sino-api` MUST đọc danh sách biệt danh và đặt `nickname` của mọi chat 1-1 của tài khoản theo danh sách đó (không có trong danh sách thì `null`), kể cả khi không có tin mới. Chỉ dòng thực sự đổi mới phát `ConversationChanged`. Lỗi của một tài khoản MUST NOT đổi biệt danh đã lưu.

#### Scenario: Đặt trên điện thoại
- **WHEN** chủ tài khoản đặt tên gợi nhớ trên Zalo điện thoại và không ai nhắn tin
- **THEN** sau lần đồng bộ kế tiếp, `GET /api/conversations` có `nickname` mới của chat đó

#### Scenario: Zalo lỗi
- **WHEN** `sino-zalo` trả `502` khi đọc danh sách
- **THEN** biệt danh đã lưu giữ nguyên
