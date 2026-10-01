# application-runtime Specification

## Purpose
Cách `sino-api` khởi động và chạy: cấu hình theo profile và environment, PostgreSQL phiên bản cố định cho local và test, Flyway là nguồn schema duy nhất, Hibernate chỉ validate.
## Requirements
### Requirement: Cấu hình theo profile và environment
Ứng dụng MUST đọc cấu hình từ `application.yaml` (dùng chung) và file profile tương ứng (`application-local.yaml` cho máy dev). Kết nối database và mọi secret MUST đến từ environment variable; profile mặc định (không profile) MUST NOT có giá trị mặc định cho secret hay URL database.

#### Scenario: Chạy local với profile `local`
- **WHEN** developer chạy PostgreSQL bằng Docker Compose rồi start ứng dụng với profile `local`
- **THEN** ứng dụng kết nối được database local và start thành công mà không cần khai báo thêm biến môi trường nào ngoài những biến có trong `.env.example`

#### Scenario: Thiếu cấu hình database ở profile mặc định
- **WHEN** ứng dụng start không có profile và không có biến môi trường cấu hình database
- **THEN** ứng dụng dừng ngay khi khởi động với thông báo lỗi chỉ rõ cấu hình datasource bị thiếu

### Requirement: Không có secret trong repository
File cấu hình và file mẫu được commit MUST NOT chứa secret thật (mật khẩu, token, encryption key). File chứa giá trị thật (ví dụ `.env`) MUST bị Git ignore; repository chỉ chứa file mẫu (`.env.example`) với giá trị placeholder.

#### Scenario: Developer tạo file `.env` từ file mẫu
- **WHEN** developer copy `.env.example` thành `.env` và điền giá trị thật
- **THEN** `git status` không liệt kê `.env` là file cần commit

### Requirement: Flyway quản lý toàn bộ schema
Mọi thay đổi schema MUST đi qua Flyway migration trong `classpath:db/migration`, được áp tự động khi ứng dụng start. Migration đã áp MUST NOT bị sửa; thay đổi tiếp theo MUST là migration mới.

#### Scenario: Database trống
- **WHEN** ứng dụng start với một database PostgreSQL trống
- **THEN** mọi migration được áp theo thứ tự version và mỗi migration có một dòng trong `flyway_schema_history`

#### Scenario: Khởi động lại
- **WHEN** ứng dụng start lại trên database đã có đủ migration
- **THEN** không migration nào được áp lại và ứng dụng start bình thường

#### Scenario: Migration đã áp bị sửa nội dung
- **WHEN** nội dung một migration đã áp bị thay đổi rồi ứng dụng start
- **THEN** ứng dụng dừng khi khởi động vì checksum migration không khớp

### Requirement: Hibernate chỉ kiểm tra schema, không tạo schema
Hibernate MUST chạy ở chế độ `validate`; Hibernate MUST NOT tạo, sửa hay xóa bảng.

#### Scenario: Entity mapping lệch với schema
- **WHEN** một entity JPA khai báo cột hoặc bảng không tồn tại trong schema do Flyway tạo
- **THEN** ứng dụng dừng khi khởi động với lỗi schema validation nêu tên bảng/cột bị lệch

### Requirement: Bảng cho Event Publication Registry
Schema MUST có bảng `event_publication` đúng cấu trúc mà Spring Modulith 2.1.x (JPA) yêu cầu, được tạo bằng migration đầu tiên.

#### Scenario: Start với Spring Modulith JPA trên classpath
- **WHEN** ứng dụng start trên database vừa được Flyway migrate
- **THEN** schema validation của Hibernate thành công cho entity event publication của Spring Modulith

### Requirement: Không mở persistence context xuyên suốt HTTP request
Open Session In View MUST bị tắt; transaction và persistence context MUST kết thúc trong tầng application service.

#### Scenario: Khởi động ứng dụng
- **WHEN** ứng dụng start
- **THEN** không có cảnh báo `spring.jpa.open-in-view` trong log và interceptor Open Session In View không được đăng ký

### Requirement: PostgreSQL local và test dùng cùng phiên bản cố định
Môi trường local (Docker Compose) và test (Testcontainers) MUST dùng cùng một image PostgreSQL có tag phiên bản cố định; MUST NOT dùng tag `latest`.

#### Scenario: Chạy database local
- **WHEN** developer chạy `docker compose up -d` trong `apps/sino-api`
- **THEN** một container PostgreSQL với tag phiên bản cố định chạy và báo healthy, dữ liệu được giữ qua các lần restart container nhờ named volume

#### Scenario: Chạy test
- **WHEN** test suite khởi tạo PostgreSQL bằng Testcontainers
- **THEN** container dùng đúng tag image đã khai báo cho Docker Compose

