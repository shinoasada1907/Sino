## ADDED Requirements

### Requirement: Module khác đọc danh sách account
Module `account` MUST cung cấp `AccountDirectory` ở gói gốc của module: `accountsOf(ownerId)` trả các account chưa xóa của owner, mỗi account có ID, provider, trạng thái và external account ID; `find(ownerId, accountId)` trả account đó hoặc rỗng khi không thuộc owner, đã xóa hoặc không tồn tại. `AccountDirectory` MUST NOT trả credential hay token.

#### Scenario: Account đã xóa
- **WHEN** owner có một account `CONNECTED` và một account đã xóa
- **THEN** `accountsOf(owner)` chỉ có account `CONNECTED`, và `find(owner, <account đã xóa>)` rỗng

#### Scenario: Account của owner khác
- **WHEN** module khác gọi `find(owner, <account của owner khác>)`
- **THEN** kết quả rỗng

### Requirement: Địa chỉ của account
Account MAY có `address`: địa chỉ người khác dùng để liên lạc với account (với Gmail là email), do connector đưa lúc kết nối (D-75). Kết nối lại MUST thay `address` bằng giá trị connector vừa đưa, kể cả khi không có. Giá trị rỗng hoặc chỉ có khoảng trắng MUST được lưu là không có; có thì MUST bỏ khoảng trắng hai đầu. Người dùng MUST NOT sửa được `address` qua `PATCH /api/accounts/{id}`. Account kết nối trước khi có `address` không có địa chỉ cho tới lần kết nối lại.

#### Scenario: Kết nối account có địa chỉ
- **WHEN** connector đưa hồ sơ có `address` = " owner@gmail.test "
- **THEN** account được lưu với `address` = "owner@gmail.test" và `GET /api/accounts/{id}` trả `address` đó

#### Scenario: Connector không có địa chỉ
- **WHEN** connector đưa hồ sơ không có `address`, hoặc có chuỗi chỉ gồm khoảng trắng
- **THEN** account được lưu và API trả `address` = `null`

#### Scenario: Kết nối lại đổi địa chỉ
- **WHEN** một account có `address` được kết nối lại và connector đưa địa chỉ khác, hoặc không đưa địa chỉ nào
- **THEN** `address` là giá trị mới, hoặc `null`; ID account không đổi

#### Scenario: PATCH không đổi địa chỉ
- **WHEN** client gửi `PATCH /api/accounts/{id}` với `{"displayName": "Công việc", "address": "other@example.com"}`
- **THEN** tên đổi thành "Công việc", `address` giữ nguyên

## MODIFIED Requirements

### Requirement: Mô hình connected account
Mỗi connected account MUST có: ID (UUID), owner, `provider` (`ProviderType`), `externalAccountId`, `displayName`, `address` (tùy chọn, D-75), `avatarUrl` (tùy chọn), `status`, `syncEnabled`, `lastSyncedAt` (tùy chọn), `createdAt`, `updatedAt`. Bộ `(owner, provider, externalAccountId)` MUST là duy nhất ở mức database.

#### Scenario: Ghi trùng account ở tầng database
- **WHEN** có hai bản ghi cùng owner, cùng provider, cùng `externalAccountId` được ghi vào database
- **THEN** database từ chối bản ghi thứ hai bằng unique constraint

### Requirement: Liệt kê account
`GET /api/accounts` MUST trả mảng JSON các account của owner hiện tại, sắp theo `createdAt` tăng dần, mỗi phần tử gồm `id`, `provider`, `externalAccountId`, `displayName`, `address`, `avatarUrl`, `status`, `syncEnabled`, `lastSyncedAt`, `capabilities`, `createdAt`, `updatedAt`. Response MUST NOT chứa bất kỳ trường credential nào.

#### Scenario: Owner có hai account
- **WHEN** client đã xác thực gọi `GET /api/accounts`
- **THEN** response là `200` với hai phần tử theo thứ tự tạo, không có trường nào chứa token, scope hay key

#### Scenario: Chưa có account
- **WHEN** owner chưa có account nào
- **THEN** response là `200` với mảng rỗng
