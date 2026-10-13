## ADDED Requirements

### Requirement: Tài khoản quản trị từ cấu hình
Ứng dụng MAY có một tài khoản quản trị cấu hình bằng `sino.admin.email` và `sino.admin.password`. Khi email trống, ứng dụng MUST chạy không có admin. Khi có email, ứng dụng MUST dừng lúc khởi động nếu mật khẩu dưới 12 ký tự, hoặc email trùng email owner (so sau khi bỏ khoảng trắng hai đầu và viết thường), hoặc email sai dạng. Có mật khẩu mà không có email MUST cũng làm ứng dụng dừng. Thông báo lỗi MUST chỉ nêu tên cấu hình, MUST NOT chứa giá trị. Admin MUST NOT là một `app_user`.

#### Scenario: Không cấu hình admin
- **WHEN** ứng dụng khởi động với `sino.admin.email` trống
- **THEN** ứng dụng chạy bình thường và đăng nhập bằng bất kỳ email nào khác email owner đều bị từ chối với `401 INVALID_CREDENTIALS`

#### Scenario: Mật khẩu admin quá ngắn
- **WHEN** ứng dụng khởi động với email admin và mật khẩu admin 11 ký tự
- **THEN** ứng dụng dừng với thông báo nêu `sino.admin.password (SINO_ADMIN_PASSWORD)` và không chứa mật khẩu

#### Scenario: Email admin trùng email owner
- **WHEN** email admin là `  Owner@Sino.Test ` và email owner là `owner@sino.test`
- **THEN** ứng dụng dừng lúc khởi động với thông báo nêu `sino.admin.email (SINO_ADMIN_EMAIL)`

#### Scenario: Có mật khẩu mà không có email
- **WHEN** ứng dụng khởi động với mật khẩu admin nhưng email admin trống
- **THEN** ứng dụng dừng lúc khởi động với thông báo nêu `sino.admin.email (SINO_ADMIN_EMAIL)`

### Requirement: Đăng nhập quản trị
Admin MUST đăng nhập qua `POST /api/auth/login` như owner, với cùng phiên cookie, CSRF và khóa tạm theo email. Phiên admin MUST mang role `ADMIN`. Admin MUST NOT nhận cookie "ghi nhớ đăng nhập", kể cả khi gửi `keepSignedIn: true`. `GET /api/admin/me` MUST trả `{ "email" }` của admin đang đăng nhập. `GET /api/auth/me` với phiên admin MUST trả `401 UNAUTHORIZED`.

#### Scenario: Admin đăng nhập
- **WHEN** admin gửi đúng email và mật khẩu tới `POST /api/auth/login`
- **THEN** máy chủ trả `204` với cookie phiên, và `GET /api/admin/me` trả email của admin

#### Scenario: Admin xin ghi nhớ đăng nhập
- **WHEN** admin đăng nhập với `keepSignedIn: true`
- **THEN** đăng nhập thành công nhưng không có cookie `remember-me` nào được đặt

#### Scenario: Web của owner hỏi phiên admin
- **WHEN** trình duyệt đang có phiên admin gọi `GET /api/auth/me`
- **THEN** máy chủ trả `401 UNAUTHORIZED`

#### Scenario: Sai mật khẩu admin
- **WHEN** gửi email admin với mật khẩu sai
- **THEN** máy chủ trả `401 INVALID_CREDENTIALS` kèm `remainingAttempts`, như owner

### Requirement: Tách quyền giữa admin và owner
Mọi đường `/api/admin/**` MUST chỉ cho người gọi có role `ADMIN`. Mọi đường `/api/**` khác cần đăng nhập MUST từ chối người gọi có role `ADMIN`. Người gọi đã đăng nhập nhưng sai vai MUST nhận `403 FORBIDDEN`; người chưa đăng nhập MUST nhận `401 UNAUTHORIZED`.

#### Scenario: Admin gọi API của owner
- **WHEN** phiên admin gọi `GET /api/accounts` hoặc `GET /api/conversations`
- **THEN** máy chủ trả `403 FORBIDDEN` và không có dữ liệu nào của owner

#### Scenario: Owner gọi API admin
- **WHEN** phiên owner gọi `GET /api/admin/overview`
- **THEN** máy chủ trả `403 FORBIDDEN`

#### Scenario: Chưa đăng nhập
- **WHEN** không có phiên nào gọi `GET /api/admin/users`
- **THEN** máy chủ trả `401 UNAUTHORIZED`

### Requirement: Danh sách người dùng cho admin
`GET /api/admin/users` MUST trả `{ generatedAt, users }` gồm mọi người dùng Sino, cũ nhất trước, mỗi người có `id`, `email`, `displayName`, `status`, `createdAt` và `accounts` là số tài khoản kết nối chưa gỡ của người đó.

#### Scenario: Đếm tài khoản theo người dùng
- **WHEN** người dùng A có hai tài khoản kết nối, một tài khoản thứ ba đã gỡ, và người dùng B không có tài khoản nào
- **THEN** danh sách có A với `accounts` là `2` và B với `accounts` là `0`

### Requirement: Danh sách tài khoản kết nối cho admin
`GET /api/admin/accounts` MUST trả `{ generatedAt, accounts }` gồm mọi tài khoản chưa gỡ của mọi người dùng, cũ nhất trước. Mỗi tài khoản MUST có `id`, `ownerId`, `provider`, `address`, `status`, `syncEnabled`, `createdAt`, `storedMessages` và `sync` gồm `importStatus` (`NONE`, `RUNNING`, `DONE` hoặc `FAILED`), `importError`, `lastSyncAt`, `syncError`, `push` (`ACTIVE`, `FAILED` hoặc `OFF`).

#### Scenario: Tài khoản chưa từng nhập thư
- **WHEN** một tài khoản vừa kết nối, chưa bắt đầu nhập thư
- **THEN** tài khoản đó có `sync.importStatus` là `NONE`, `sync.push` là `OFF` và `storedMessages` là `0`

#### Scenario: Nhập thư lỗi
- **WHEN** lần nhập thư của một tài khoản dừng với lỗi `AUTH_EXPIRED`
- **THEN** tài khoản đó có `sync.importStatus` là `FAILED` và `sync.importError` là `AUTH_EXPIRED`

#### Scenario: Tài khoản đã gỡ
- **WHEN** owner gỡ một tài khoản
- **THEN** tài khoản đó không còn trong `GET /api/admin/accounts`

### Requirement: Tổng quan cho admin
`GET /api/admin/overview` MUST trả `generatedAt`, `users` (số người dùng), `accounts` (số tài khoản chưa gỡ), `accountsByStatus` có đủ năm khóa `CONNECTED`, `DEGRADED`, `AUTH_EXPIRED`, `ERROR`, `DISABLED`, `accountsWithSyncErrors` (số tài khoản có nhập thư `FAILED`, hoặc có lỗi đồng bộ, hoặc thông báo đẩy `FAILED`) và `storedMessages` (tổng số thư đã lưu của các tài khoản chưa gỡ).

#### Scenario: Trạng thái không có tài khoản nào
- **WHEN** mọi tài khoản đều `CONNECTED`
- **THEN** `accountsByStatus` vẫn có `DEGRADED`, `AUTH_EXPIRED`, `ERROR`, `DISABLED` với giá trị `0`

#### Scenario: Đếm tài khoản có lỗi đồng bộ
- **WHEN** một tài khoản nhập thư lỗi, một tài khoản có lần đồng bộ cuối lỗi, và một tài khoản chạy bình thường
- **THEN** `accountsWithSyncErrors` là `2`

### Requirement: Admin không thấy nội dung của người dùng
API admin MUST NOT trả tiêu đề, nội dung, người gửi, người nhận, tệp đính kèm của thư, ghi chú, việc, lịch, token hay ID của nhà cung cấp. Chỉ metadata và con số được phép.

#### Scenario: Thư đã lưu
- **WHEN** một tài khoản có thư đã lưu với tiêu đề và nội dung, và admin gọi mọi endpoint `/api/admin/**`
- **THEN** không response nào chứa tiêu đề, nội dung hay địa chỉ người gửi của thư đó, chỉ có số thư đã lưu
