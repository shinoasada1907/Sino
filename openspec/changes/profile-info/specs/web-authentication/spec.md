## MODIFIED Requirements

### Requirement: Người dùng hiện tại
`GET /api/auth/me` MUST trả `200` với `{email, displayName, avatarUrl}` của owner khi request có session hoặc cookie ghi nhớ hợp lệ, và `401` với `code` = `UNAUTHORIZED` khi chưa đăng nhập. `avatarUrl` MUST giống `avatarUrl` của `GET /api/profile` (`null` khi chưa có ảnh). Endpoint này MUST công khai (không bị chặn); khi trình duyệt chưa có cookie `XSRF-TOKEN`, response của nó MUST cấp cookie này để trình duyệt có CSRF token trước request thay đổi dữ liệu đầu tiên.

#### Scenario: Đã đăng nhập
- **WHEN** client có session hợp lệ gọi `GET /api/auth/me`
- **THEN** response là `200` với `email`, `displayName` và `avatarUrl` của owner, không có trường mật khẩu

#### Scenario: Chưa đăng nhập
- **WHEN** client không có session và chưa có cookie `XSRF-TOKEN` gọi `GET /api/auth/me`
- **THEN** response là `401` với `code` = `UNAUTHORIZED` và cấp cookie `XSRF-TOKEN`
