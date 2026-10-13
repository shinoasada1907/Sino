## ADDED Requirements

### Requirement: Module `admin` chỉ đọc qua public API
Module `admin` (package `dev.sino.admin`) MUST chỉ dùng public API của các module khác (type ở base package của chúng) và MUST NOT đọc bảng, repository hay entity của module khác. Các module khác MUST NOT phụ thuộc `admin`.

#### Scenario: Kiểm tra ranh giới với module `admin`
- **WHEN** chạy `ModularityTests` sau khi có package `dev.sino.admin`
- **THEN** `admin` là một module, chỉ dùng public API của `identity`, `account`, `sync`, `conversation`, `provider` và `common`, không module nào phụ thuộc nó, và kiểm tra ranh giới thành công
