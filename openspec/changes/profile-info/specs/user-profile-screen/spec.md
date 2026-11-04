## ADDED Requirements

### Requirement: Thông tin cá nhân lưu ở máy chủ
Khối Thông tin cá nhân của `/profile` MUST đọc từ `GET /api/profile` và lưu bằng `PATCH /api/profile` khi bấm "Lưu thay đổi", chỉ gửi các trường đã đổi. Email, vai trò và ngày tham gia MUST chỉ đọc. Lưu xong, thẻ đầu trang, thanh trên và menu người dùng MUST hiện tên mới mà không tải lại trang. Lỗi `400` MUST hiện dưới đúng ô của trường lỗi và giữ chữ người dùng đã gõ; lỗi khác MUST hiện thông báo có nút thử lại.

#### Scenario: Lưu và tải lại
- **WHEN** người dùng đổi số điện thoại, bấm "Lưu thay đổi", rồi tải lại trang
- **THEN** ô số điện thoại có giá trị mới

#### Scenario: Số điện thoại sai
- **WHEN** người dùng gõ chữ vào ô số điện thoại và bấm "Lưu thay đổi"
- **THEN** dưới ô số điện thoại có dòng báo lỗi, các ô khác giữ nguyên chữ đã gõ

### Requirement: Đổi ảnh đại diện bằng tệp
Hộp đổi ảnh MUST cho chọn một tệp ảnh, cắt vuông, thu về 256×256 trên trình duyệt (WebP, hoặc PNG khi trình duyệt không xuất được WebP), rồi gửi `PUT /api/profile/avatar`; và MUST có "Xóa ảnh" gọi `DELETE /api/profile/avatar`. Hộp MUST không còn ô nhập URL ảnh. Lưu xong, ảnh ở thẻ đầu trang, thanh trên và menu người dùng MUST đổi theo. Lỗi MUST hiện trong hộp và giữ ảnh cũ.

#### Scenario: Đổi ảnh
- **WHEN** người dùng chọn một ảnh chụp 4000×3000 và xác nhận
- **THEN** request gửi đi là một ảnh 256×256, và ảnh ở thanh trên đổi sang ảnh mới

#### Scenario: Xóa ảnh
- **WHEN** người dùng bấm "Xóa ảnh"
- **THEN** thẻ đầu trang và thanh trên hiện chữ cái đầu thay cho ảnh

### Requirement: Khối chưa có máy chủ
Khối Đổi mật khẩu, Phiên đăng nhập và thẻ 2FA MUST có nhãn "Sắp có" và nút gửi bị tắt, cho tới khi phần 2 và phần 3 của quản lý hồ sơ có API (D-479).

#### Scenario: Đổi mật khẩu chưa có
- **WHEN** người dùng mở `/profile`
- **THEN** khối Đổi mật khẩu có nhãn "Sắp có" và không gửi được request nào
