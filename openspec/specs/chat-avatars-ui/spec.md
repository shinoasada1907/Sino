# chat-avatars-ui Specification

## Purpose
Web vẽ ảnh đại diện thật trong chat, có vòng màu thay thế khi chưa có, đang tải hay lỗi (D-412, D-413); nhóm có ảnh riêng thì hiện ảnh đó, không thì chồng 3 thành viên (DN-1 = A); hàng danh sách giữ ô nhà cung cấp của canvas (DN-2 = A). Thiết kế ở `openspec/changes/archive/2026-10-27-zalo-avatars/design.md`.
## Requirements
### Requirement: Ảnh đại diện thật trong chat
Khi có địa chỉ ảnh `https` (D-413), mỗi vòng ảnh đại diện của chat (đầu khung chat, cạnh tin của người khác trong nhóm, mục Thành viên) MUST hiện ảnh đó phủ kín vòng tròn, tải với `referrerPolicy="no-referrer"`. Khi không có địa chỉ, khi ảnh đang tải, hay khi ảnh tải lỗi, vòng MUST hiện vòng màu thay thế như hôm nay. Ảnh MUST là trang trí (không đọc cho trình đọc màn hình).

#### Scenario: Chat 1-1 có ảnh
- **WHEN** người dùng mở một chat 1-1 có `avatarUrl`
- **THEN** đầu khung chat hiện ảnh của người kia trong vòng tròn

#### Scenario: Hàng danh sách giữ như canvas
- **WHEN** danh sách có một chat Zalo có `avatarUrl`
- **THEN** đầu hàng vẫn là ô biểu tượng nhà cung cấp như canvas, không có vòng ảnh

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

