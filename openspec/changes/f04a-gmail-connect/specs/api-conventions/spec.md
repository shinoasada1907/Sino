## MODIFIED Requirements

### Requirement: `/api/**` yêu cầu xác thực
Mọi request tới `/api/**`, trừ `GET /api/auth/me`, `POST /api/auth/login` và `GET /api/accounts/connect/{provider}/callback`, MUST được xác thực bằng phiên đăng nhập của trình duyệt theo Decision D-22 = A: session cookie, hoặc cookie ghi nhớ hợp lệ (chi tiết ở capability `web-authentication`). Callback kết nối được mở ở tầng security vì đó là lần chuyển trang từ provider về; người dùng được xác định bằng `state` lưu trong session (capability `account-connect`), và callback MUST NOT làm gì khi không có yêu cầu đang chờ hợp lệ. Đường dẫn không được cho phép tường minh MUST bị từ chối (deny by default). Response `401` MUST là Problem Details với `code` = `UNAUTHORIZED` và MUST NOT có header `WWW-Authenticate`. HTTP Basic (D-02) không còn được chấp nhận (D-32).

#### Scenario: Chưa đăng nhập
- **WHEN** client gọi `/api/...` không có session và không có cookie ghi nhớ
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED` và không có header `WWW-Authenticate`

#### Scenario: Session đã hết hạn
- **WHEN** client gọi `/api/...` với cookie session đã hết hạn hoặc đã bị hủy khi đăng xuất, và không có cookie ghi nhớ
- **THEN** response là `401` với `code` = `UNAUTHORIZED`

#### Scenario: Đã đăng nhập
- **WHEN** client gọi `/api/...` với session hợp lệ
- **THEN** request được chuyển tới handler

#### Scenario: Callback kết nối không có session
- **WHEN** trình duyệt gọi `GET /api/accounts/connect/gmail/callback` không có session
- **THEN** response không phải `401` mà là `302` tới `/accounts?connectError=CONNECT_STATE_INVALID`
