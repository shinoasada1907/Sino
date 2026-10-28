## ADDED Requirements

### Requirement: Ảnh của người tham gia trong cuộc trò chuyện
Mỗi phần tử `participants` của một cuộc trò chuyện mà `sino-zalo` đưa cho `sino-api` MUST có `avatarUrl`, là địa chỉ ảnh đại diện Zalo của người đó hoặc `null`. Với chat 1-1, người kia MUST mang ảnh của cuộc trò chuyện. Chính tài khoản đã kết nối MUST mang `null`.

#### Scenario: Chat 1-1
- **WHEN** một trang tin có tin của người kia trong chat 1-1, và Zalo trả ảnh của người đó
- **THEN** cuộc trò chuyện có `avatarUrl` là ảnh đó, và người kia trong `participants` có cùng `avatarUrl`

#### Scenario: Nhóm
- **WHEN** một trang tin có tin của hai thành viên nhóm mà Zalo trả ảnh
- **THEN** mỗi thành viên trong `participants` có `avatarUrl` là ảnh của mình

### Requirement: Tra ảnh người gửi có giới hạn
`sino-zalo` MUST tra ảnh của mọi người gửi chưa biết trong một trang tin bằng một lời gọi Zalo, và MUST nhớ kết quả của mỗi người (kể cả `null`) 24 giờ theo tài khoản. Khi lời gọi lỗi hay quá thời gian, những người đó MUST có `avatarUrl: null`, tin MUST vẫn được trả như khi không có ảnh, và log MUST NOT có tên hay địa chỉ ảnh.

#### Scenario: Người gửi đã biết
- **WHEN** trang tin sau có tin của một người đã được tra ảnh trong 24 giờ qua
- **THEN** `sino-zalo` không gọi Zalo lại cho người đó

#### Scenario: Zalo lỗi
- **WHEN** lời gọi tra ảnh lỗi
- **THEN** trang tin vẫn được trả đủ tin, người gửi có `avatarUrl: null`
