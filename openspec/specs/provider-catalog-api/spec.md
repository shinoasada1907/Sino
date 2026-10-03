# provider-catalog-api Specification

## Purpose
REST endpoint `GET /api/providers` cho frontend biết provider nào được hỗ trợ và mỗi provider làm được gì, trước khi có account (D-18). Thiết kế ở `openspec/changes/archive/2026-10-03-be-f03-provider-contract/design.md`.
## Requirements
### Requirement: Liệt kê provider và capability qua REST
`GET /api/providers` MUST trả mảng JSON các provider đang được hỗ trợ, mỗi phần tử gồm `type`, `displayName` và `capabilities` (mảng chuỗi UPPER_SNAKE_CASE), sắp xếp theo `type`. Endpoint MUST tuân theo convention xác thực và lỗi của F01. (Chỉ áp dụng nếu Decision D-18 = có.)

#### Scenario: Có provider
- **WHEN** client đã xác thực gọi `GET /api/providers` khi ứng dụng có connector
- **THEN** response là `200` với một phần tử cho mỗi connector, gồm `type`, `displayName`, `capabilities`

#### Scenario: Chưa có provider
- **WHEN** client đã xác thực gọi `GET /api/providers` khi chưa có connector nào
- **THEN** response là `200` với mảng rỗng

#### Scenario: Chưa xác thực
- **WHEN** client gọi `GET /api/providers` không có thông tin xác thực
- **THEN** response là `401` dạng Problem Details với `code` = `UNAUTHORIZED`

