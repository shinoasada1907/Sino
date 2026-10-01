# module-boundaries Specification

## Purpose
Cấu trúc module Spring Modulith dưới `dev.sino`, public API của một module và kiểm tra ranh giới tự động trong mọi build (D-03).
## Requirements
### Requirement: Business module là package con trực tiếp của `dev.sino`
Mỗi business module MUST là một package con trực tiếp của `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`) và module kỹ thuật dùng chung là `dev.sino.common`. Module chỉ được tạo khi feature đầu tiên cần đến nó; MUST NOT tạo package rỗng cho module chưa có nội dung.

#### Scenario: Phát hiện module
- **WHEN** chạy phân tích Spring Modulith trên `SinoApiApplication`
- **THEN** danh sách module phát hiện được khớp đúng với các package con trực tiếp đang có code dưới `dev.sino`

### Requirement: Kiểm tra boundary tự động trong mọi build
Build MUST chứa một test gọi `ApplicationModules.of(SinoApiApplication.class).verify()`; vi phạm boundary MUST làm build fail.

#### Scenario: Truy cập type nội bộ của module khác
- **WHEN** code trong một module tham chiếu type nằm trong package con (không được export) của một module khác
- **THEN** test verification fail và nêu rõ dependency vi phạm

#### Scenario: Phụ thuộc vòng giữa các module
- **WHEN** module A phụ thuộc module B và module B phụ thuộc ngược lại module A
- **THEN** test verification fail và báo cycle

### Requirement: Public API của module được khai báo rõ
Các module khác chỉ được dùng public API của một module: các type trong base package của module và các package được khai báo `@NamedInterface`. Các package layer (`api`, `application`, `domain`, `infrastructure`) MUST là nội bộ trừ khi được export có chủ đích (chi tiết cách export theo Decision D-03).

#### Scenario: Dùng public API của module khác
- **WHEN** một module gọi type nằm trong base package của module khác
- **THEN** test verification thành công

#### Scenario: Truy cập repository hoặc entity của module khác
- **WHEN** một module inject repository hoặc dùng JPA entity thuộc `infrastructure`/`domain` của module khác
- **THEN** test verification fail

### Requirement: `common` chỉ chứa technical concern
Module `common` MUST chỉ chứa concern kỹ thuật dùng chung (error model, web/security configuration...) và MUST NOT phụ thuộc bất kỳ business module nào.

#### Scenario: `common` tham chiếu business module
- **WHEN** một type trong `dev.sino.common` tham chiếu type của một business module
- **THEN** test verification fail vì `common` khai báo không có dependency nào được phép

