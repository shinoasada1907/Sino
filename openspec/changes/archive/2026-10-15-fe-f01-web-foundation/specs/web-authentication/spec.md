## ADDED Requirements

### Requirement: Đăng nhập bằng email và mật khẩu của owner
`POST /api/auth/login` MUST nhận JSON `{email, password, rememberMe}` và xác thực bằng email của owner (`SINO_OWNER_EMAIL`, so sau khi trim và đổi chữ thường) cùng mật khẩu `SINO_OWNER_PASSWORD` (so bằng bản băm BCrypt). Thành công MUST trả `204`, tạo session mới với session ID mới (chống session fixation) và cookie session `HttpOnly`, `SameSite=Lax`. Sai email hoặc sai mật khẩu MUST trả cùng một response `401` với `code` = `INVALID_CREDENTIALS` và `remainingAttempts`; response MUST NOT cho biết email có tồn tại hay không.

#### Scenario: Đăng nhập đúng
- **WHEN** client gửi email và mật khẩu đúng kèm CSRF token hợp lệ
- **THEN** response là `204`, có cookie session `HttpOnly` với `SameSite=Lax`, và `GET /api/auth/me` sau đó trả `200`

#### Scenario: Sai mật khẩu
- **WHEN** client gửi đúng email nhưng sai mật khẩu
- **THEN** response là `401` với `code` = `INVALID_CREDENTIALS` và `remainingAttempts` = số lần còn được thử trước khi bị khóa

#### Scenario: Email không tồn tại
- **WHEN** client gửi một email không phải của owner
- **THEN** response có cùng status, `code`, `detail` như trường hợp sai mật khẩu

#### Scenario: Thiếu trường
- **WHEN** client gửi body thiếu `email` hoặc `password`
- **THEN** response là `400` với `code` = `VALIDATION_FAILED`

#### Scenario: Session ID đổi khi đăng nhập
- **WHEN** client đã có session (chưa đăng nhập) rồi đăng nhập thành công
- **THEN** session ID sau khi đăng nhập khác session ID trước đó

### Requirement: Khóa tạm khi nhập sai nhiều lần
Sau 5 lần đăng nhập sai liên tiếp với cùng một email (đã chuẩn hóa), mọi lần đăng nhập với email đó trong 15 phút MUST trả `429` với `code` = `LOGIN_LOCKED`, `retryAfterSeconds` và header `Retry-After`, kể cả khi mật khẩu đúng. Đăng nhập thành công MUST đưa bộ đếm về 0. Bộ đếm MUST có giới hạn số mục và thời hạn để không bị làm phình bộ nhớ.

#### Scenario: Lần sai thứ năm
- **WHEN** client đăng nhập sai lần thứ 5 liên tiếp với cùng email
- **THEN** response là `429` với `code` = `LOGIN_LOCKED`, `retryAfterSeconds` > 0 và header `Retry-After`

#### Scenario: Mật khẩu đúng trong lúc bị khóa
- **WHEN** email đang bị khóa và client gửi đúng mật khẩu
- **THEN** response vẫn là `429` `LOGIN_LOCKED` và không có session đăng nhập nào được tạo

#### Scenario: Hết thời gian khóa
- **WHEN** đã qua 15 phút kể từ lúc bị khóa và client gửi đúng mật khẩu
- **THEN** response là `204` và bộ đếm của email đó về 0

### Requirement: Người dùng hiện tại
`GET /api/auth/me` MUST trả `200` với `{email, displayName}` của owner khi request có session hoặc cookie ghi nhớ hợp lệ, và `401` với `code` = `UNAUTHORIZED` khi chưa đăng nhập. Endpoint này MUST công khai (không bị chặn); khi trình duyệt chưa có cookie `XSRF-TOKEN`, response của nó MUST cấp cookie này để trình duyệt có CSRF token trước request thay đổi dữ liệu đầu tiên.

#### Scenario: Đã đăng nhập
- **WHEN** client có session hợp lệ gọi `GET /api/auth/me`
- **THEN** response là `200` với `email` và `displayName` của owner, không có trường mật khẩu

#### Scenario: Chưa đăng nhập
- **WHEN** client không có session và chưa có cookie `XSRF-TOKEN` gọi `GET /api/auth/me`
- **THEN** response là `401` với `code` = `UNAUTHORIZED` và cấp cookie `XSRF-TOKEN`

### Requirement: Đăng xuất
`POST /api/auth/logout` MUST hủy session hiện tại, xóa cookie ghi nhớ và trả `204`. Sau đó mọi request tới `/api/**` cần đăng nhập MUST trả `401`.

#### Scenario: Đăng xuất
- **WHEN** client đã đăng nhập gọi `POST /api/auth/logout` kèm CSRF token
- **THEN** response là `204`, cookie ghi nhớ bị xóa, và `GET /api/accounts` sau đó với cùng cookie trả `401`

### Requirement: Bảo vệ CSRF cho request thay đổi dữ liệu
Mọi request `POST`, `PUT`, `PATCH`, `DELETE` tới `/api/**` (kể cả đăng nhập) MUST mang header `X-XSRF-TOKEN` khớp với cookie `XSRF-TOKEN` do server cấp; thiếu hoặc sai MUST trả `403` với `code` = `CSRF_TOKEN_INVALID`. Request `GET` MUST NOT cần CSRF token. Cookie `XSRF-TOKEN` MUST đọc được bằng JavaScript; cookie session MUST NOT đọc được bằng JavaScript.

#### Scenario: Thiếu CSRF token
- **WHEN** client đã đăng nhập gửi `PATCH /api/accounts/{id}` không có header `X-XSRF-TOKEN`
- **THEN** response là `403` với `code` = `CSRF_TOKEN_INVALID` và account không đổi

#### Scenario: Có CSRF token đúng
- **WHEN** client gửi lại giá trị cookie `XSRF-TOKEN` trong header `X-XSRF-TOKEN`
- **THEN** request được xử lý bình thường

### Requirement: Ghi nhớ đăng nhập
Khi đăng nhập với `rememberMe` = true, server MUST cấp thêm cookie ghi nhớ `HttpOnly` có hạn 30 ngày, ký bằng `SINO_REMEMBER_ME_KEY`. Request không còn session nhưng có cookie ghi nhớ hợp lệ MUST được xác thực lại và nhận session mới. Với `rememberMe` = false MUST NOT có cookie ghi nhớ. Đổi `SINO_OWNER_PASSWORD` hoặc `SINO_REMEMBER_ME_KEY` MUST làm mọi cookie ghi nhớ cũ mất hiệu lực.

#### Scenario: Session hết nhưng còn cookie ghi nhớ
- **WHEN** client đăng nhập với `rememberMe` = true, rồi gọi `GET /api/auth/me` chỉ với cookie ghi nhớ (không có cookie session)
- **THEN** response là `200` và có cookie session mới

#### Scenario: Không chọn ghi nhớ
- **WHEN** client đăng nhập với `rememberMe` = false
- **THEN** response không có cookie ghi nhớ

### Requirement: Cấu hình mật khẩu owner và khóa ghi nhớ
`SINO_OWNER_PASSWORD` (tối thiểu 12 ký tự) và `SINO_REMEMBER_ME_KEY` (tối thiểu 32 ký tự) MUST bắt buộc; thiếu hoặc quá ngắn MUST làm ứng dụng dừng khi khởi động với thông báo chỉ nêu tên cấu hình. Giá trị của chúng MUST NOT xuất hiện trong log, thông báo lỗi hay endpoint Actuator. Sau khởi động, ứng dụng MUST chỉ giữ bản băm BCrypt của mật khẩu để xác thực.

#### Scenario: Thiếu mật khẩu owner
- **WHEN** ứng dụng start không có `SINO_OWNER_PASSWORD`
- **THEN** ứng dụng dừng với thông báo nêu `sino.owner.password`, không in giá trị nào

#### Scenario: Mật khẩu quá ngắn
- **WHEN** ứng dụng start với `SINO_OWNER_PASSWORD` dài 11 ký tự
- **THEN** ứng dụng dừng và thông báo không chứa giá trị mật khẩu

### Requirement: Không còn HTTP Basic
API MUST NOT chấp nhận xác thực HTTP Basic, và response `401` MUST NOT có header `WWW-Authenticate` (để trình duyệt không bật hộp thoại đăng nhập).

#### Scenario: Gửi HTTP Basic
- **WHEN** client gọi `GET /api/accounts` với header `Authorization: Basic` chứa email và mật khẩu đúng của owner
- **THEN** response là `401` với `code` = `UNAUTHORIZED` và không có header `WWW-Authenticate`
