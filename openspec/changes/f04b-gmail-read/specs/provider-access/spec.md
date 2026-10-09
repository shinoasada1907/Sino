## ADDED Requirements

### Requirement: Gọi connector với credential còn hạn
Module `account` MUST cung cấp `ProviderAccess` ở gói gốc của module: `call(accountId, (connector, context) -> …)` nạp credential của account, giải mã, dựng `ProviderContext` và gọi connector của provider của account (D-62). Module khác MUST NOT đọc credential hay token. Credential OAuth2 có access token còn ít hơn 60 giây MUST được refresh trước khi gọi connector. Account đã xóa hoặc không tồn tại MUST làm lời gọi thất bại với `ACCOUNT_NOT_FOUND`.

#### Scenario: Token còn hạn
- **WHEN** module khác gọi `call` cho account có access token còn hạn lâu
- **THEN** connector được gọi với token đang lưu và không có lời gọi nào tới token endpoint

#### Scenario: Token sắp hết hạn
- **WHEN** module khác gọi `call` cho account có access token còn dưới 60 giây
- **THEN** token được refresh trước, credential mới được lưu mã hóa, refresh token cũ được giữ khi provider không gửi cái mới, và connector được gọi với token mới

#### Scenario: Account đã xóa
- **WHEN** module khác gọi `call` cho account đã xóa
- **THEN** lời gọi thất bại với `ACCOUNT_NOT_FOUND` và connector không được gọi

### Requirement: Refresh một lần khi provider từ chối token
Khi connector ném `ProviderException` mã `AUTH_EXPIRED`, `ProviderAccess` MUST refresh token một lần và gọi lại connector đúng một lần. Lời gọi tới provider để refresh MUST nằm ngoài transaction; việc lưu credential mới MUST nằm trong transaction.

#### Scenario: Token bị thu hồi trước hạn
- **WHEN** connector báo `AUTH_EXPIRED` dù token còn hạn, và provider cấp token mới khi refresh
- **THEN** connector được gọi lại đúng một lần với token mới và kết quả của lần gọi lại được trả về

### Requirement: Account hết quyền chuyển AUTH_EXPIRED
Khi provider từ chối refresh token (`invalid_grant`), hoặc connector vẫn báo `AUTH_EXPIRED` sau khi refresh, hoặc credential không thể refresh, account MUST chuyển sang `AUTH_EXPIRED` và `AccountStatusChanged` MUST được publish trong cùng transaction; lời gọi MUST thất bại với `ProviderException` mã `AUTH_EXPIRED`. Account đang `AUTH_EXPIRED` MUST làm lời gọi thất bại ngay với `AUTH_EXPIRED` mà không gọi provider.

#### Scenario: Refresh token không còn dùng được
- **WHEN** provider trả `invalid_grant` khi refresh
- **THEN** account có `status` = `AUTH_EXPIRED`, `AccountStatusChanged` được publish, và lời gọi thất bại với `AUTH_EXPIRED`

#### Scenario: Account đã hết quyền
- **WHEN** module khác gọi `call` cho account `AUTH_EXPIRED`
- **THEN** lời gọi thất bại với `AUTH_EXPIRED` và không có lời gọi nào tới provider hay token endpoint

### Requirement: Lỗi tạm thời khi refresh không đổi trạng thái account
Lỗi mạng, quá thời gian hoặc lỗi `5xx` của token endpoint khi refresh MUST làm lời gọi thất bại với `ProviderException` mã `PROVIDER_UNAVAILABLE` (retryable) và MUST NOT đổi trạng thái account.

#### Scenario: Token endpoint lỗi
- **WHEN** token endpoint trả `503` khi refresh
- **THEN** lời gọi thất bại với `PROVIDER_UNAVAILABLE` và account giữ nguyên trạng thái

### Requirement: Không lộ token khi refresh
Access token, refresh token và client secret MUST NOT xuất hiện trong log, event, thông báo lỗi hay `toString()` của bất kỳ kiểu nào mà `ProviderAccess` trả ra.

#### Scenario: Kiểm log sau refresh thành công và thất bại
- **WHEN** một lần refresh thành công và một lần `invalid_grant` đã chạy
- **THEN** log và event `AccountStatusChanged` không chứa token hay client secret nào đã dùng
