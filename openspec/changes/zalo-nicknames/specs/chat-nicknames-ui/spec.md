## ADDED Requirements

### Requirement: Hiện biệt danh
Web MUST hiện tên của cuộc trò chuyện là `nickname` khi có, không thì `title`, ở hàng danh sách, đầu khung chat (desktop và đầu trang chat ở điện thoại) và mục Thành viên.

#### Scenario: Chat có biệt danh
- **WHEN** một chat 1-1 có `nickname: "Mẹ"`, `title: "Nguyễn Thị A"`
- **THEN** hàng danh sách và đầu khung chat hiện "Mẹ"

### Requirement: Hộp đặt biệt danh
Ở chat Zalo 1-1, bấm tên ở đầu khung chat MUST mở hộp "Đặt biệt danh" theo frame canvas, có ô nhập điền sẵn biệt danh, nút Lưu, nút "Xóa biệt danh" khi đang có biệt danh, và dòng "Tên Zalo: <title>". Lưu MUST chờ `PATCH` trả về rồi mới đóng hộp; lỗi MUST hiện trong hộp và giữ chữ đã gõ. Ở nhóm và thư, tên MUST NOT bấm được.

#### Scenario: Lưu biệt danh
- **WHEN** người dùng gõ "Mẹ" và bấm Lưu, API trả thành công
- **THEN** hộp đóng và đầu khung chat hiện "Mẹ"

#### Scenario: Zalo từ chối
- **WHEN** API trả `422 NICKNAME_REJECTED`
- **THEN** hộp còn mở, hiện lỗi, ô nhập vẫn có chữ đã gõ, tên ở đầu khung chat không đổi

#### Scenario: Nhóm
- **WHEN** người dùng mở một nhóm Zalo
- **THEN** tên ở đầu khung chat không mở hộp nào
