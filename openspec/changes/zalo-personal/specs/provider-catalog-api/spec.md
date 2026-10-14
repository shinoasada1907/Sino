## MODIFIED Requirements

### Requirement: Liệt kê provider và capability qua REST
`GET /api/providers` MUST trả mảng JSON các provider đang được hỗ trợ, mỗi phần tử gồm `type`, `displayName`, `capabilities` (mảng chuỗi UPPER_SNAKE_CASE), `connectMethod` (`OAUTH2`, `QR` hoặc `null` khi provider không có luồng kết nối) và `connectable` (`true` khi provider có luồng kết nối và đang bật), sắp xếp theo `type`. Endpoint MUST tuân theo convention xác thực và lỗi của F01. (Chỉ áp dụng nếu Decision D-18 = có.)

#### Scenario: Có provider
- **WHEN** client đã xác thực gọi `GET /api/providers` khi ứng dụng có connector
- **THEN** response là `200` với một phần tử cho mỗi connector, gồm `type`, `displayName`, `capabilities`, `connectMethod`, `connectable`

#### Scenario: Provider kết nối bằng OAuth2
- **WHEN** client gọi `GET /api/providers` và có connector Gmail
- **THEN** phần tử `gmail` có `connectMethod` = `OAUTH2` và `connectable` = true

#### Scenario: Provider đang tắt
- **WHEN** client gọi `GET /api/providers` khi `sino.zalo.enabled` = false
- **THEN** phần tử `zalo` có `connectMethod` = `QR` và `connectable` = false

#### Scenario: Chưa có provider
- **WHEN** client đã xác thực gọi `GET /api/providers` khi chưa có connector nào
- **THEN** response là `200` với mảng rỗng

#### Scenario: Chưa xác thực
- **WHEN** client gọi `GET /api/providers` không có thông tin xác thực
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED`
