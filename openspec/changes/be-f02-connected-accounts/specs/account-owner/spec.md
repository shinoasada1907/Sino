## ADDED Requirements

### Requirement: Người dùng sở hữu được đảm bảo tồn tại
Ở MVP một người dùng, ứng dụng MUST đảm bảo có đúng một bản ghi `app_user` cho chủ sở hữu được cấu hình (email và tên hiển thị lấy từ cấu hình) mỗi lần khởi động. Việc này MUST idempotent.

#### Scenario: Lần khởi động đầu tiên
- **WHEN** ứng dụng start trên database chưa có `app_user` nào
- **THEN** có đúng một `app_user` với email đã cấu hình và `status` = `ACTIVE`

#### Scenario: Khởi động lại
- **WHEN** ứng dụng start lại với cùng cấu hình owner
- **THEN** không có `app_user` mới nào được tạo

#### Scenario: Thiếu cấu hình owner
- **WHEN** ứng dụng start mà không có email owner
- **THEN** ứng dụng dừng khi khởi động với thông báo chỉ rõ cấu hình owner bị thiếu

### Requirement: Xác định người dùng hiện tại
Mọi request đã xác thực tới `/api/**` MUST được gắn với một `app_user` qua một abstraction "người dùng hiện tại"; ở MVP mọi principal hợp lệ ánh xạ tới owner đã cấu hình. Code nghiệp vụ MUST lấy owner qua abstraction này, MUST NOT đọc trực tiếp `SecurityContext`.

#### Scenario: Request đã xác thực
- **WHEN** client đã xác thực gọi một endpoint của account
- **THEN** use case nhận ID của owner từ abstraction người dùng hiện tại

### Requirement: Cô lập dữ liệu theo chủ sở hữu
Truy vấn và thao tác trên connected account MUST luôn lọc theo owner hiện tại. Account của người dùng khác MUST được đối xử như không tồn tại.

#### Scenario: Truy cập account của người dùng khác
- **WHEN** client gọi `GET /api/accounts/{id}` với ID của account thuộc một `app_user` khác
- **THEN** response là `404` với `code` = `ACCOUNT_NOT_FOUND`, giống hệt trường hợp ID không tồn tại
