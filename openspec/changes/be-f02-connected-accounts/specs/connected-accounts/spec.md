## ADDED Requirements

### Requirement: Mô hình connected account
Mỗi connected account MUST có: ID (UUID), owner, `provider` (`ProviderType`), `externalAccountId`, `displayName`, `avatarUrl` (tùy chọn), `status`, `syncEnabled`, `lastSyncedAt` (tùy chọn), `createdAt`, `updatedAt`. Bộ `(owner, provider, externalAccountId)` MUST là duy nhất ở mức database.

#### Scenario: Ghi trùng account ở tầng database
- **WHEN** có hai bản ghi cùng owner, cùng provider, cùng `externalAccountId` được ghi vào database
- **THEN** database từ chối bản ghi thứ hai bằng unique constraint

### Requirement: Đăng ký kết nối idempotent
Use case đăng ký kết nối (dùng bởi luồng connect của F04) MUST nhận owner, `provider`, `externalAccountId`, thông tin hiển thị và credential. Nếu chưa có account tương ứng → tạo mới với `status` = `CONNECTED`. Nếu đã có → reconnect: thay credential, cập nhật thông tin hiển thị từ provider, `status` = `CONNECTED`; account đã bị xóa (D-13 B) cũng được dùng lại theo cách này, hiện lại và bật lại sync tự động. Provider không được registry hỗ trợ MUST bị từ chối với `UNKNOWN_PROVIDER`. Account, credential và event MUST được ghi trong cùng một transaction.

#### Scenario: Kết nối account mới
- **WHEN** use case được gọi cho một bộ `(owner, provider, externalAccountId)` chưa tồn tại
- **THEN** một account mới được tạo với `status` = `CONNECTED`, credential được lưu mã hóa và event `AccountConnected` được publish với cờ reconnect = false

#### Scenario: Kết nối lại account đã có
- **WHEN** use case được gọi lại cho cùng bộ `(owner, provider, externalAccountId)`
- **THEN** không có account thứ hai; credential cũ được thay bằng credential mới, `status` = `CONNECTED` và `AccountConnected` được publish với cờ reconnect = true

#### Scenario: Kết nối lại account đã xóa
- **WHEN** use case được gọi cho bộ `(owner, provider, externalAccountId)` của một account đã bị xóa
- **THEN** đúng account đó (cùng ID) xuất hiện lại trong danh sách với `status` = `CONNECTED`, `syncEnabled` = true, credential mới, và `AccountConnected` được publish với cờ reconnect = true

#### Scenario: Provider không được hỗ trợ
- **WHEN** use case được gọi với `provider` không có connector
- **THEN** không có gì được ghi và lỗi mang mã `UNKNOWN_PROVIDER`

#### Scenario: Lưu credential thất bại
- **WHEN** việc lưu credential thất bại sau khi account đã được tạo trong cùng transaction
- **THEN** transaction rollback: không account, không credential, không event nào được lưu

### Requirement: Vòng đời trạng thái
`status` MUST thuộc tập trạng thái chốt ở Decision D-12 (đề xuất: `CONNECTED`, `DEGRADED`, `AUTH_EXPIRED`, `DISABLED`, `ERROR`) và chỉ đổi qua các chuyển trạng thái được định nghĩa trong design. Account `DISABLED` MUST NOT bị chuyển trạng thái bởi sự kiện hệ thống (lỗi sync, hết hạn auth); chỉ hành động của người dùng (enable, reconnect) đưa nó ra khỏi `DISABLED`.

#### Scenario: Người dùng tắt account
- **WHEN** người dùng tắt một account đang `CONNECTED`
- **THEN** `status` = `DISABLED` và event `AccountStatusChanged` ghi trạng thái cũ và mới

#### Scenario: Sự kiện hệ thống trên account đã tắt
- **WHEN** hệ thống báo auth hết hạn cho một account `DISABLED`
- **THEN** `status` vẫn là `DISABLED` và không có event nào được publish

#### Scenario: Bật lại account
- **WHEN** người dùng bật lại một account `DISABLED`
- **THEN** `status` = `CONNECTED` (sức khỏe thật được đánh giá lại ở lần sync kế tiếp)

### Requirement: Liệt kê account
`GET /api/accounts` MUST trả mảng JSON các account của owner hiện tại, sắp theo `createdAt` tăng dần, mỗi phần tử gồm `id`, `provider`, `externalAccountId`, `displayName`, `avatarUrl`, `status`, `syncEnabled`, `lastSyncedAt`, `capabilities`, `createdAt`, `updatedAt`. Response MUST NOT chứa bất kỳ trường credential nào.

#### Scenario: Owner có hai account
- **WHEN** client đã xác thực gọi `GET /api/accounts`
- **THEN** response là `200` với hai phần tử theo thứ tự tạo, không có trường nào chứa token, scope hay key

#### Scenario: Chưa có account
- **WHEN** owner chưa có account nào
- **THEN** response là `200` với mảng rỗng

### Requirement: Xem một account
`GET /api/accounts/{id}` MUST trả account của owner hiện tại hoặc `404` với `code` = `ACCOUNT_NOT_FOUND`. ID sai định dạng UUID MUST trả `400` với `code` = `MALFORMED_REQUEST`.

#### Scenario: ID sai định dạng
- **WHEN** client gọi `GET /api/accounts/not-a-uuid`
- **THEN** response là `400` với `code` = `MALFORMED_REQUEST`

### Requirement: Cập nhật account
`PATCH /api/accounts/{id}` MUST chấp nhận một hoặc nhiều trường `displayName` (1–100 ký tự sau khi trim), `syncEnabled` (boolean), `enabled` (boolean); trường vắng mặt giữ nguyên. Body không có trường nào hợp lệ MUST trả `400` `VALIDATION_FAILED`. `enabled` = false chuyển sang `DISABLED`; `enabled` = true trên account `DISABLED` chuyển sang `CONNECTED`, trên account khác là no-op. Xung đột cập nhật đồng thời MUST trả `409` với `code` = `CONCURRENT_MODIFICATION`.

#### Scenario: Đổi tên hiển thị
- **WHEN** client gửi `{"displayName": "Gmail Work"}`
- **THEN** response là `200` với account đã cập nhật và `updatedAt` mới hơn

#### Scenario: Body rỗng
- **WHEN** client gửi `{}`
- **THEN** response là `400` với `code` = `VALIDATION_FAILED`

#### Scenario: Tạm dừng tự động sync
- **WHEN** client gửi `{"syncEnabled": false}`
- **THEN** `syncEnabled` = false, `status` không đổi và account vẫn xuất hiện trong danh sách

### Requirement: Xóa account
`DELETE /api/accounts/{id}` MUST xóa mềm account (Decision D-13 = B): bản ghi account được giữ lại và đánh dấu đã xóa, credential của nó MUST bị xóa hẳn khỏi database, trả `204`, và publish `AccountRemoved`, tất cả trong một transaction. Account đã xóa MUST được đối xử như không tồn tại: không có trong `GET /api/accounts`; `GET`, `PATCH`, `DELETE` cùng ID MUST trả `404` `ACCOUNT_NOT_FOUND`. Xóa account không tồn tại hoặc của người khác MUST trả `404` `ACCOUNT_NOT_FOUND`.

#### Scenario: Xóa account
- **WHEN** client xóa một account của mình
- **THEN** response là `204`, credential của account không còn trong database, bản ghi account vẫn còn và được đánh dấu đã xóa, và event `AccountRemoved` được publish

#### Scenario: Account đã xóa không còn hiện
- **WHEN** client gọi `GET /api/accounts`, hoặc `GET`/`PATCH`/`DELETE` với ID của account đã xóa
- **THEN** danh sách không có account đó, và các lệnh theo ID trả `404` `ACCOUNT_NOT_FOUND`

### Requirement: Event của account
Module account MUST publish `AccountConnected`, `AccountStatusChanged` và `AccountRemoved` trong cùng transaction với thay đổi dữ liệu. Payload MUST chỉ gồm ID, `provider`, trạng thái và thời điểm; MUST NOT chứa credential hay thông tin nhạy cảm.

#### Scenario: Kiểm tra payload event
- **WHEN** một account được kết nối
- **THEN** event `AccountConnected` chứa `accountId`, `ownerId`, `provider`, cờ reconnect, thời điểm, và không có trường nào khác
