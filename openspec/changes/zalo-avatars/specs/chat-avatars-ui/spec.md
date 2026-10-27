## ADDED Requirements

### Requirement: Ảnh đại diện thật trong chat
Khi có địa chỉ ảnh, mỗi vòng ảnh đại diện của chat (danh sách cuộc trò chuyện, đầu khung chat, cạnh tin của người khác trong nhóm, mục Thành viên) MUST hiện ảnh đó phủ kín vòng tròn, tải với `referrerPolicy="no-referrer"`. Khi không có địa chỉ, khi ảnh đang tải, hay khi ảnh tải lỗi, vòng MUST hiện vòng màu thay thế như hôm nay. Ảnh MUST là trang trí (không đọc cho trình đọc màn hình).

#### Scenario: Chat 1-1 có ảnh
- **WHEN** danh sách có một chat 1-1 với `avatarUrl`
- **THEN** mục đó hiện ảnh của người kia trong vòng tròn

#### Scenario: Ảnh lỗi
- **WHEN** địa chỉ ảnh không tải được
- **THEN** vòng hiện vòng màu thay thế, không có biểu tượng ảnh vỡ

#### Scenario: Tin của thành viên nhóm
- **WHEN** khung chat nhóm có tin của một thành viên có `avatarUrl`
- **THEN** vòng cạnh tin đó hiện ảnh của thành viên

### Requirement: Ảnh của nhóm
Một nhóm có `avatarUrl` (ảnh riêng của nhóm) MUST hiện một vòng với ảnh đó. Một nhóm không có `avatarUrl` MUST hiện tối đa 3 vòng của thành viên chồng lên nhau như `.av-stack` của canvas (DN-1 = A).

#### Scenario: Nhóm có ảnh riêng
- **WHEN** một nhóm có `avatarUrl`
- **THEN** vòng của nhóm là một vòng với ảnh đó

#### Scenario: Nhóm không có ảnh riêng
- **WHEN** một nhóm có `avatarUrl: null` và ba thành viên có ảnh
- **THEN** vòng của nhóm là ba ảnh thành viên chồng lên nhau như `.av-stack` của canvas
