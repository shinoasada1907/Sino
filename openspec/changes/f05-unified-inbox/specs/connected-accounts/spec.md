## ADDED Requirements

### Requirement: Module khác đọc danh sách account
Module `account` MUST cung cấp `AccountDirectory` ở gói gốc của module: `accountsOf(ownerId)` trả các account chưa xóa của owner, mỗi account có ID, provider, trạng thái và external account ID; `find(ownerId, accountId)` trả account đó hoặc rỗng khi không thuộc owner, đã xóa hoặc không tồn tại. `AccountDirectory` MUST NOT trả credential hay token.

#### Scenario: Account đã xóa
- **WHEN** owner có một account `CONNECTED` và một account đã xóa
- **THEN** `accountsOf(owner)` chỉ có account `CONNECTED`, và `find(owner, <account đã xóa>)` rỗng

#### Scenario: Account của owner khác
- **WHEN** module khác gọi `find(owner, <account của owner khác>)`
- **THEN** kết quả rỗng
