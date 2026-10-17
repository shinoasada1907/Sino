## ADDED Requirements

### Requirement: Contract kết nối bằng mã QR
Connector MAY khai báo `qrLogin()`; mặc định MUST rỗng. `QrLogin.start()` MUST trả `loginId`, ảnh QR và `expiresAt`. `QrLogin.status(loginId)` MUST trả một trong `WAITING`, `SCANNED(displayName)`, `DONE(AccountProfile, ProviderCredentials)`, `EXPIRED`, `DECLINED`, `FAILED(reason)`. `QrLogin.cancel(loginId)` MUST kết thúc lần đăng nhập. Credential trong `DONE` MUST bị che khi in ra, như mọi credential khác. Một connector MUST NOT có cả `oauth2()` lẫn `qrLogin()`.

#### Scenario: Connector không kết nối bằng QR
- **WHEN** một connector không ghi đè `qrLogin()`
- **THEN** `qrLogin()` trả rỗng

#### Scenario: In trạng thái DONE
- **WHEN** trạng thái `DONE` được ghi ra log
- **THEN** dòng log không có giá trị của credential

### Requirement: Contract công tắc riêng của connector
Connector MAY ghi đè `turnedOn()`; mặc định MUST là true. Connector đang tắt MUST vẫn có trong registry, giữ cách kết nối của nó (`connectMethod`), nhưng MUST NOT kết nối được (`connectable` = false). Registry MUST từ chối khởi động khi một connector có cả `oauth2()` lẫn `qrLogin()`.

#### Scenario: Connector không có công tắc
- **WHEN** một connector không ghi đè `turnedOn()`
- **THEN** `turnedOn()` là true, và nó kết nối được nếu có `oauth2()` hoặc `qrLogin()`

#### Scenario: Hai cách kết nối
- **WHEN** ứng dụng khởi động với một connector có cả `oauth2()` lẫn `qrLogin()`
- **THEN** ứng dụng dừng với lời nêu tên lớp của connector đó

### Requirement: Contract ngắt kết nối
Connector MAY ghi đè `disconnect(context)` để dừng những gì nó giữ cho một account (phiên, listener); mặc định MUST không làm gì. Module `account` MUST gọi `disconnect` sau khi việc xóa hoặc tắt một account đã commit, và lỗi của `disconnect` MUST chỉ được ghi log.

#### Scenario: Xóa account Gmail
- **WHEN** người dùng xóa một account Gmail (connector không ghi đè `disconnect`)
- **THEN** việc xóa diễn ra như trước, kể cả thu hồi token OAuth2

#### Scenario: disconnect lỗi
- **WHEN** `disconnect` ném lỗi khi người dùng tắt một account
- **THEN** account vẫn ở trạng thái đã tắt và log có một dòng cảnh báo
