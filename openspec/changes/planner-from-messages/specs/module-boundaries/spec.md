## MODIFIED Requirements

### Requirement: Business module là package con trực tiếp của `dev.sino`
Mỗi business module MUST là một package con trực tiếp của `dev.sino` (`account`, `provider`, `conversation`, `messaging`, `sync`, `search`, `realtime`, `notes`, `planner`, `scheduler`, `notification`) và module kỹ thuật dùng chung là `dev.sino.common`. Module chỉ được tạo khi feature đầu tiên cần đến nó; MUST NOT tạo package rỗng cho module chưa có nội dung.

#### Scenario: Phát hiện module
- **WHEN** chạy phân tích Spring Modulith trên `SinoApiApplication`
- **THEN** danh sách module phát hiện được khớp đúng với các package con trực tiếp đang có code dưới `dev.sino`

#### Scenario: Module mới của phần Kế hoạch
- **WHEN** feature đầu tiên của `scheduler`, `notification`, `notes` hoặc `planner` được làm
- **THEN** module tương ứng được tạo dưới `dev.sino` và qua kiểm tra boundary như các module khác
