## ADDED Requirements

### Requirement: Health, liveness và readiness công khai
`/actuator/health`, `/actuator/health/liveness` và `/actuator/health/readiness` MUST truy cập được không cần xác thực và MUST NOT hiển thị chi tiết component cho client chưa xác thực. User API đã xác thực MAY xem chi tiết component để chẩn đoán.

#### Scenario: Kiểm tra health khi hệ thống ổn
- **WHEN** client chưa xác thực gọi `/actuator/health`
- **THEN** response là `200` với `status` = `UP` và không có chi tiết component (tên database, phiên bản, dung lượng đĩa)

### Requirement: Readiness phản ánh database
Readiness MUST bao gồm trạng thái kết nối database; liveness MUST NOT phụ thuộc database.

#### Scenario: Database không truy cập được
- **WHEN** database ngừng hoạt động trong khi ứng dụng đang chạy
- **THEN** `/actuator/health/readiness` trả `503` với `status` = `DOWN` còn `/actuator/health/liveness` vẫn trả `200` với `status` = `UP`

### Requirement: Chỉ expose endpoint Actuator cần thiết
Qua HTTP, Actuator MUST chỉ expose `health` và `info` ở mọi profile trừ `local`; profile `local` MAY expose thêm `modulith` để quan sát cấu trúc module.

#### Scenario: Gọi endpoint nhạy cảm khi chưa xác thực
- **WHEN** client chưa xác thực gọi `/actuator/env`, `/actuator/configprops` hoặc `/actuator/heapdump`
- **THEN** response là `401`

#### Scenario: Gọi endpoint nhạy cảm khi đã xác thực
- **WHEN** user API đã xác thực gọi `/actuator/env`, `/actuator/configprops` hoặc `/actuator/heapdump`
- **THEN** response là `404`, vì các endpoint này không được expose qua HTTP

### Requirement: Log không chứa secret
Log MUST NOT chứa giá trị header `Authorization`, mật khẩu, access/refresh token, encryption key hay bind parameter SQL. Logging bind parameter của Hibernate MUST NOT được bật trong file cấu hình được commit.

#### Scenario: Request có header Authorization
- **WHEN** một request có header `Authorization` được xử lý (thành công hoặc lỗi) ở mức log mặc định
- **THEN** giá trị header không xuất hiện trong log output

#### Scenario: Lỗi 500 được ghi log
- **WHEN** một exception không lường trước xảy ra và được ghi log kèm stack trace
- **THEN** log có đủ thông tin để debug (path, method, exception) nhưng không có body request hay giá trị header xác thực
