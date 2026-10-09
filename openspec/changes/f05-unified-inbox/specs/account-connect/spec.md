## MODIFIED Requirements

### Requirement: Định danh Gmail bất biến
Hồ sơ account của Gmail MUST dùng `sub` của Google làm `externalAccountId`, và email làm tên hiển thị mặc định và làm `address` (D-75); MUST NOT dùng email làm định danh.

#### Scenario: Cùng tài khoản Google kết nối hai lần
- **WHEN** cùng một tài khoản Google (cùng `sub`) được kết nối lần thứ hai bằng "Thêm Gmail"
- **THEN** không có account thứ hai; account cũ được kết nối lại

#### Scenario: Hồ sơ Gmail có địa chỉ
- **WHEN** Google trả thông tin người dùng có `sub` và `email`
- **THEN** hồ sơ có `externalAccountId` = `sub`, tên hiển thị và `address` đều là email
