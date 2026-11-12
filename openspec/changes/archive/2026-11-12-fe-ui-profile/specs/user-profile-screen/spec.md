## ADDED Requirements

### Requirement: Trang Hồ sơ người dùng và Điều hướng
`/profile` MUST hiện trang Hồ sơ người dùng dưới `RequireAuth` và `AppShell`. Menu người dùng `UserMenu` MUST có mục "Hồ sơ cá nhân" với biểu tượng `User` điều hướng tới `/profile`. Trên mobile, trang MUST có tiêu đề "Hồ sơ cá nhân" qua `mobilePageHeader`.

#### Scenario: Mở Hồ sơ từ UserMenu
- **WHEN** người dùng bấm vào Avatar ở thanh trên cùng (Topbar) và chọn "Hồ sơ cá nhân"
- **THEN** ứng dụng chuyển tới địa chỉ `/profile` và hiển thị trang Hồ sơ người dùng

#### Scenario: Mở trực tiếp địa chỉ /profile
- **WHEN** người dùng đã đăng nhập và truy cập đường dẫn `/profile`
- **THEN** trang Hồ sơ người dùng hiển thị đầy đủ các khối chức năng

### Requirement: Khối Thông tin cá nhân
Trang `/profile` MUST hiển thị thông tin người dùng gồm ảnh đại diện Avatar, Họ và tên (`displayName`), Email (`email`), Số điện thoại (`phoneNumber`), Chức danh (`jobTitle`), và Giới thiệu bản thân (`bio`). Người dùng MUST chỉnh sửa được các thông tin cá nhân và bấm "Lưu thay đổi" để cập nhật ngay vào trạng thái hiển thị.

#### Scenario: Chỉnh sửa Họ tên và Bio
- **WHEN** người dùng thay đổi Họ tên và Giới thiệu, rồi bấm "Lưu thay đổi"
- **THEN** thông tin mới được lưu vào state/cache và hiển thị thông báo cập nhật thành công

#### Scenario: Tải lên ảnh đại diện mới
- **WHEN** người dùng chọn nút đổi ảnh đại diện
- **THEN** ảnh đại diện mới được cập nhật trên giao diện

### Requirement: Khối Bảo mật và Đổi mật khẩu
Trang `/profile` MUST có form đổi mật khẩu với các trường: Mật khẩu hiện tại, Mật khẩu mới, Xác nhận mật khẩu mới. Form MUST kiểm tra mật khẩu mới và xác nhận mật khẩu khớp nhau trước khi cho phép bấm nút "Cập nhật mật khẩu".

#### Scenario: Đổi mật khẩu thành công
- **WHEN** người dùng nhập đầy đủ mật khẩu hiện tại, mật khẩu mới và xác nhận khớp nhau rồi bấm "Cập nhật mật khẩu"
- **THEN** form hiển thị thông báo đổi mật khẩu thành công và xoá trống các ô nhập liệu

#### Scenario: Xác nhận mật khẩu không khớp
- **WHEN** mật khẩu mới và xác nhận mật khẩu không giống nhau
- **THEN** nút cập nhật báo lỗi hoặc vô hiệu hóa kèm cảnh báo không khớp

### Requirement: Khối Tài khoản liên kết và Phiên đăng nhập
Trang `/profile` MUST hiển thị danh sách các tài khoản đang kết nối (Google, Zalo) và danh sách các phiên thiết bị đang đăng nhập với trạng thái "Đang hoạt động" cho thiết bị hiện tại.

#### Scenario: Xem phiên đăng nhập
- **WHEN** người dùng cuộn đến khối Thiết bị & Phiên hoạt động
- **THEN** danh sách hiển thị thiết bị hiện tại (Windows Chrome) và các thiết bị đã đăng nhập
