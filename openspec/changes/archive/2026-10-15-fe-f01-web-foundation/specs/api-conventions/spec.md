## MODIFIED Requirements

### Requirement: `/api/**` yêu cầu xác thực
Mọi request tới `/api/**`, trừ `GET /api/auth/me` và `POST /api/auth/login`, MUST được xác thực bằng phiên đăng nhập của trình duyệt theo Decision D-22 = A: session cookie, hoặc cookie ghi nhớ hợp lệ (chi tiết ở capability `web-authentication`). Đường dẫn không được cho phép tường minh MUST bị từ chối (deny by default). Response `401` MUST là Problem Details với `code` = `UNAUTHORIZED` và MUST NOT có header `WWW-Authenticate`. HTTP Basic (D-02) không còn được chấp nhận (D-32).

#### Scenario: Chưa đăng nhập
- **WHEN** client gọi `/api/...` không có session và không có cookie ghi nhớ
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED` và không có header `WWW-Authenticate`

#### Scenario: Session đã hết hạn
- **WHEN** client gọi `/api/...` với cookie session đã hết hạn hoặc đã bị hủy khi đăng xuất, và không có cookie ghi nhớ
- **THEN** response là `401` với `code` = `UNAUTHORIZED`

#### Scenario: Đã đăng nhập
- **WHEN** client gọi `/api/...` với session hợp lệ
- **THEN** request được chuyển tới handler
