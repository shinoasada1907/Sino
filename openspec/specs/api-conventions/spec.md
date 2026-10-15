# api-conventions Specification

## Purpose
Quy ước chung cho REST API của `sino-api`: base path `/api`, bảo vệ truy cập, định dạng lỗi RFC 9457 có `code` ổn định và quy ước JSON. Error code catalog đầy đủ nằm ở design F01 §8 (`openspec/changes/archive/2026-10-01-be-f01-project-foundation/design.md`) và design của từng feature.
## Requirements
### Requirement: Base path và định dạng của REST API
Mọi endpoint nghiệp vụ MUST nằm dưới `/api/` và nhận/trả `application/json`; lỗi MUST trả `application/problem+json`. MVP không đánh version trên path.

#### Scenario: Request tới endpoint nghiệp vụ
- **WHEN** client gọi một endpoint nghiệp vụ hợp lệ dưới `/api/`
- **THEN** response thành công có `Content-Type: application/json`

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

### Requirement: Lỗi theo RFC 9457 Problem Details
Mọi lỗi từ API MUST có body Problem Details gồm `title`, `status`, `detail`, `instance` và extension `code` (UPPER_SNAKE_CASE, ổn định, dùng được cho frontend). `type` được bỏ qua khi bằng `about:blank`; RFC 9457 §3.1.1 quy định thiếu `type` nghĩa là `about:blank`, và đây là hành vi mặc định của Spring Framework 7. Body lỗi MUST NOT chứa stack trace, tên class exception, câu SQL hay giá trị secret.

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

