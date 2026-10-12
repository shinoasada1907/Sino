## MODIFIED Requirements

### Requirement: Business module là package con trực tiếp của `dev.sino`
Mỗi business module MUST là một package con trực tiếp của `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`, `planner`, `notes`) và module kỹ thuật dùng chung là `dev.sino.common`. Module chỉ được tạo khi feature đầu tiên cần đến nó; MUST NOT tạo package rỗng cho module chưa có nội dung.

#### Scenario: Phát hiện module
- **WHEN** chạy phân tích Spring Modulith trên `SinoApiApplication`
- **THEN** danh sách module phát hiện được khớp đúng với các package con trực tiếp đang có code dưới `dev.sino`

#### Scenario: Module `planner`
- **WHEN** chạy `ModularityTests` sau khi có package `dev.sino.planner`
- **THEN** `planner` là một module, chỉ phụ thuộc `identity` và `common`, và kiểm tra ranh giới thành công

#### Scenario: Module `notes`
- **WHEN** chạy `ModularityTests` sau khi có package `dev.sino.notes`
- **THEN** `notes` là một module, chỉ phụ thuộc `identity` và `common`, và kiểm tra ranh giới thành công
