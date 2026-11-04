## MODIFIED Requirements

### Requirement: Người dùng sở hữu được đảm bảo tồn tại
Ở MVP một người dùng, ứng dụng MUST đảm bảo có đúng một bản ghi `app_user` cho chủ sở hữu được cấu hình (email lấy từ cấu hình) mỗi lần khởi động. Việc này MUST idempotent. Tên hiển thị trong cấu hình MUST chỉ được dùng khi tạo bản ghi lần đầu; khi owner đã có, ứng dụng MUST giữ tên đang lưu (tên do người dùng sửa ở màn Hồ sơ, D-476).

#### Scenario: Lần khởi động đầu tiên
- **WHEN** ứng dụng start trên database chưa có `app_user` nào
- **THEN** có đúng một `app_user` với email và tên hiển thị đã cấu hình và `status` = `ACTIVE`

#### Scenario: Khởi động lại
- **WHEN** ứng dụng start lại với cùng cấu hình owner
- **THEN** không có `app_user` mới nào được tạo

#### Scenario: Tên đã sửa trên web giữ qua lần khởi động lại
- **WHEN** owner đã đổi tên hiển thị qua `PATCH /api/profile`, rồi ứng dụng start lại với tên khác trong cấu hình
- **THEN** tên hiển thị vẫn là tên đã sửa

#### Scenario: Thiếu cấu hình owner
- **WHEN** ứng dụng start mà không có email owner
- **THEN** ứng dụng dừng khi khởi động với thông báo chỉ rõ cấu hình owner bị thiếu
