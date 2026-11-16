## MODIFIED Requirements

### Requirement: Hàng mới và dòng báo
Ở mỗi màn danh sách (Tin nhắn, Hộp thư), hàng có ID chưa hiện trước đó MUST được đánh dấu là mới: tối đa 6 hàng thì trượt vào theo canvas MotionSpec C, hơn 6 thì hiện ngay; khi người dùng chọn giảm chuyển động thì không trượt. Sự kiện `source` = `sync` với `newInbound` > 0 của một tài khoản cùng loại với màn (suy từ `accountId` qua tài khoản và provider đã tải) MUST hiện dòng báo ở đầu danh sách: "N thư mới" ở Hộp thư, "N tin mới" ở Tin nhắn (cộng dồn khi nhiều sự kiện tới liền nhau); bấm vào thì danh sách cuộn lên đầu. Sự kiện của tài khoản khác loại MUST NOT hiện dòng báo ở màn đó. Sự kiện `source` = `import` hoặc `user` MUST NOT hiện dòng báo (D-92).

#### Scenario: Hai thư mới
- **WHEN** Hộp thư đang mở, luồng nhận `conversations.changed` của một tài khoản Gmail với `source` = `sync`, `newInbound` = 2, và danh sách tải lại có 2 conversation mới ở đầu
- **THEN** hai hàng đó trượt vào và có dòng "2 thư mới"

#### Scenario: Tin chat mới khi đang ở Hộp thư
- **WHEN** Hộp thư đang mở và luồng nhận `conversations.changed` của một tài khoản chat với `source` = `sync`, `newInbound` = 1
- **THEN** Hộp thư không có dòng báo, và số cạnh "Tin nhắn" trên điều hướng tăng

#### Scenario: Tin mới ở Tin nhắn
- **WHEN** Tin nhắn đang mở và luồng nhận `conversations.changed` của một tài khoản chat với `source` = `sync`, `newInbound` = 3
- **THEN** đầu danh sách có dòng "3 tin mới"

#### Scenario: Người dùng tự đánh dấu đã đọc
- **WHEN** luồng nhận `conversations.changed` với `source` = `user`
- **THEN** danh sách được đọc lại và không có dòng báo

### Requirement: Số Hộp thư trên điều hướng
Số cạnh "Tin nhắn" và cạnh "Hộp thư" trên thanh điều hướng MUST lấy từ `unreadByKind` của `GET /api/conversations/counts` (`CHAT` và `EMAIL`) và MUST đổi khi danh sách của màn nào được đọc lại hoặc có sự kiện `conversations.changed` (D-93).

#### Scenario: Thư mới đến
- **WHEN** một thư email đến mới làm `unreadByKind.EMAIL` từ 3 thành 4
- **THEN** số cạnh "Hộp thư" thành 4 mà không tải lại trang, số cạnh "Tin nhắn" không đổi
