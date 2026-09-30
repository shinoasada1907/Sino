## ADDED Requirements

### Requirement: Base path và định dạng của REST API
Mọi endpoint nghiệp vụ MUST nằm dưới `/api/` và nhận/trả `application/json`; lỗi MUST trả `application/problem+json`. MVP không đánh version trên path.

#### Scenario: Request tới endpoint nghiệp vụ
- **WHEN** client gọi một endpoint nghiệp vụ hợp lệ dưới `/api/`
- **THEN** response thành công có `Content-Type: application/json`

### Requirement: `/api/**` yêu cầu xác thực
Mọi request tới `/api/**` MUST được xác thực theo cơ chế chốt ở Decision D-02 (đề xuất: HTTP Basic với một user cấu hình qua environment). Đường dẫn không được cho phép tường minh MUST bị từ chối (deny by default). Server MUST NOT tạo HTTP session cho API.

#### Scenario: Không có thông tin xác thực
- **WHEN** client gọi `/api/...` không kèm thông tin xác thực
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED`

#### Scenario: Thông tin xác thực sai
- **WHEN** client gọi `/api/...` với mật khẩu sai
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED` và không tiết lộ username có tồn tại hay không

#### Scenario: Thông tin xác thực đúng
- **WHEN** client gọi `/api/...` với thông tin xác thực đúng
- **THEN** request được chuyển tới handler và response không có header `Set-Cookie` tạo session

### Requirement: Lỗi theo RFC 9457 Problem Details
Mọi lỗi từ API MUST có body Problem Details gồm `type`, `title`, `status`, `detail`, `instance` và extension `code` (UPPER_SNAKE_CASE, ổn định, dùng được cho frontend). Body lỗi MUST NOT chứa stack trace, tên class exception, câu SQL hay giá trị secret.

#### Scenario: Request body không hợp lệ theo validation
- **WHEN** client gửi body vi phạm ràng buộc Bean Validation
- **THEN** response là `400` với `code` = `VALIDATION_FAILED` và extension `errors` liệt kê từng `{ field, message }`

#### Scenario: JSON sai cú pháp
- **WHEN** client gửi body không parse được thành JSON
- **THEN** response là `400` với `code` = `MALFORMED_REQUEST`

#### Scenario: Resource không tồn tại
- **WHEN** application service báo resource được yêu cầu không tồn tại
- **THEN** response là `404` với `code` cụ thể của resource đó (ví dụ `ACCOUNT_NOT_FOUND`) hoặc `RESOURCE_NOT_FOUND` nếu không có code riêng

#### Scenario: Đường dẫn không tồn tại
- **WHEN** client đã xác thực gọi một đường dẫn dưới `/api/` không có handler
- **THEN** response là `404` với `code` = `RESOURCE_NOT_FOUND` (đường dẫn ngoài `/api/` và actuator đã bị từ chối ở tầng security trước đó)

#### Scenario: Method hoặc media type không được hỗ trợ
- **WHEN** client gọi sai HTTP method hoặc gửi `Content-Type` không được hỗ trợ
- **THEN** response lần lượt là `405` với `code` = `METHOD_NOT_ALLOWED` hoặc `415` với `code` = `UNSUPPORTED_MEDIA_TYPE`

#### Scenario: Lỗi không lường trước
- **WHEN** handler ném một exception không được map
- **THEN** response là `500` với `code` = `INTERNAL_ERROR`, `detail` chung chung, và exception đầy đủ chỉ được ghi vào log phía server

### Requirement: Error code catalog
Mỗi `code` MUST được liệt kê trong error code catalog của design (module sở hữu, HTTP status, ý nghĩa). Một code đã phát hành MUST NOT đổi ý nghĩa; code mới được thêm khi cần.

#### Scenario: Thêm lỗi nghiệp vụ mới
- **WHEN** một feature cần báo một loại lỗi mới cho client
- **THEN** feature đó thêm code mới vào catalog cùng HTTP status tương ứng thay vì dùng lại code có ý nghĩa khác

### Requirement: Quy ước JSON
Thời điểm MUST được serialize thành chuỗi ISO-8601 theo UTC (ví dụ `2026-09-30T07:00:00Z`); ID MUST là chuỗi UUID; enum MUST là chuỗi UPPER_SNAKE_CASE; tên field MUST là camelCase.

#### Scenario: Serialize thời điểm
- **WHEN** một response chứa field kiểu `Instant`
- **THEN** giá trị trong JSON là chuỗi ISO-8601 kết thúc bằng `Z`, không phải số epoch
