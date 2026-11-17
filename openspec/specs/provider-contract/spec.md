# provider-contract Specification

## Purpose
Contract giữa core và các connector provider (SPI `MessageProvider` trong named interface `provider.spi`): định danh và capability, dữ liệu chuẩn hóa tự kiểm tra, batch bỏ qua item lỗi, che credential và phân loại lỗi provider. Thiết kế và các quyết định D-16, D-17, D-19, D-20, D-24 ở `openspec/changes/archive/2026-10-03-be-f03-provider-contract/design.md`.
## Requirements
### Requirement: Connector khai báo định danh và capability
Mỗi connector MUST triển khai `MessageProvider`, khai báo một `ProviderType` hợp lệ và một tập capability khác null. Connector MAY khai báo tên hiển thị (`displayName`); mặc định là giá trị của `ProviderType`. Tập capability MUST chỉ gồm những gì connector thực sự làm được; MUST NOT khai báo capability để "đủ bộ".

#### Scenario: Đọc capability của connector
- **WHEN** bên gọi hỏi connector có hỗ trợ một capability hay không
- **THEN** câu trả lời lấy từ tập capability connector đã khai báo, không phụ thuộc provider cụ thể nào

#### Scenario: Gọi thao tác không được hỗ trợ
- **WHEN** bên gọi yêu cầu gửi tin qua connector không khai báo `SEND_MESSAGES`
- **THEN** thao tác thất bại với `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` và không có lời gọi nào tới provider bên ngoài

### Requirement: Tập capability chuẩn
Capability MUST là một trong: `READ_MESSAGES`, `SEND_MESSAGES`, `ATTACHMENTS`, `MARK_READ`, `REACTIONS`, `PUSH_WEBHOOK`, `THREADS`. Thêm capability mới MUST đi kèm cập nhật bảng ý nghĩa capability trong design.

#### Scenario: Connector chỉ đọc
- **WHEN** một connector chỉ đọc được tin nhắn
- **THEN** tập capability của nó là `{READ_MESSAGES}` và mọi truy vấn capability khác trả về không hỗ trợ

### Requirement: Contract không chứa kiểu riêng của provider
Mọi kiểu trong public API và named interface `spi` của module `provider` MUST là kiểu của Sino (record/enum/interface thuần Java); MUST NOT tham chiếu SDK, DTO hay payload thô của provider. Việc chuyển payload thô → kiểu chuẩn hóa MUST diễn ra bên trong package infrastructure của connector.

#### Scenario: Kiểm tra phụ thuộc của contract
- **WHEN** chạy kiểm tra kiến trúc trên package `dev.sino.provider` và `dev.sino.provider.spi`
- **THEN** không type nào phụ thuộc package `dev.sino.provider.infrastructure..` hay thư viện của provider bên ngoài

### Requirement: Dữ liệu chuẩn hóa tự kiểm tra tính hợp lệ
Kiểu chuẩn hóa (conversation, participant, message, attachment) MUST từ chối dữ liệu thiếu trường bắt buộc: external ID của conversation/message/participant không được rỗng; message MUST có `externalConversationId`, `direction` và `sentAt`. Giá trị provider không map được MUST dùng `UNKNOWN` thay vì bị từ chối.

#### Scenario: Message thiếu external ID
- **WHEN** connector tạo một message chuẩn hóa với `externalMessageId` rỗng
- **THEN** việc tạo thất bại và được phân loại `PAYLOAD_NORMALIZATION_FAILED`

#### Scenario: Loại conversation không map được
- **WHEN** provider trả một loại hội thoại không tương ứng với loại nào của Sino
- **THEN** conversation chuẩn hóa có `type` = `UNKNOWN` và vẫn được trả về

### Requirement: Lỗi chuẩn hóa một item không làm hỏng cả batch
Khi một item không chuẩn hóa được, connector MUST bỏ qua item đó, ghi nó vào danh sách item bị bỏ qua của batch (external ID nếu có + lý do) và tiếp tục với các item còn lại.

#### Scenario: Batch có một message lỗi
- **WHEN** provider trả 3 message trong đó 1 message thiếu dữ liệu bắt buộc
- **THEN** batch chứa 2 message chuẩn hóa và 1 mục bị bỏ qua mang lý do `PAYLOAD_NORMALIZATION_FAILED`

### Requirement: Contract lấy cập nhật (sync)
`fetchUpdates(context, cursor)` MUST trả một batch gồm conversation, message, item bị bỏ qua, `nextCursor` khác null và cờ `hasMore`. Cursor MUST là giá trị opaque do connector tự hiểu; cursor khởi tạo biểu diễn lần sync đầu tiên. Mọi item MUST mang external ID để bên dùng khử trùng được khi cùng dữ liệu được trả lại nhiều lần.

#### Scenario: Lần sync đầu tiên
- **WHEN** bên gọi truyền cursor khởi tạo
- **THEN** connector trả batch đầu tiên cùng `nextCursor` để gọi tiếp

#### Scenario: Hết dữ liệu hiện có
- **WHEN** không còn dữ liệu nào sau cursor hiện tại
- **THEN** batch có `hasMore` = `false` và `nextCursor` dùng được cho lần sync tăng dần tiếp theo

#### Scenario: Gọi lại với cùng cursor
- **WHEN** bên gọi gọi lại `fetchUpdates` với cursor đã dùng
- **THEN** các item trả về (nếu có) mang cùng external ID như lần trước để bên dùng không tạo bản trùng

### Requirement: Contract gửi tin
Với connector có `SEND_MESSAGES`, `sendMessage(context, command)` MUST trả kết quả chứa `externalMessageId` của provider và trạng thái gửi (`PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` hoặc `UNKNOWN`).

#### Scenario: Gửi thành công
- **WHEN** connector gửi thành công một tin nhắn văn bản
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

### Requirement: Contract lấy hồ sơ account
`getAccountProfile(context)` MUST trả `externalAccountId` không rỗng và tên hiển thị; ảnh đại diện là tùy chọn.

#### Scenario: Lấy hồ sơ sau khi xác thực
- **WHEN** bên gọi truyền context có credential hợp lệ
- **THEN** connector trả hồ sơ account có `externalAccountId` ổn định giữa các lần gọi

### Requirement: Credential chỉ nằm trong bộ nhớ và luôn bị che
`ProviderContext` MUST mang credential đã giải mã chỉ trong bộ nhớ trong phạm vi một lời gọi. Biểu diễn chuỗi (`toString()`) của context và credential MUST NOT chứa giá trị token/secret. Kiểu credential MUST NOT xuất hiện trong response API hay payload event.

#### Scenario: Ghi log context
- **WHEN** một `ProviderContext` bị ghi ra log (cố ý hoặc do exception message)
- **THEN** log chỉ thấy giá trị đã che (ví dụ `****`), không thấy access token

### Requirement: Phân loại lỗi provider
Lỗi từ connector MUST được báo bằng `ProviderException` với một mã trong: `AUTH_EXPIRED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `REQUEST_REJECTED`, `PAYLOAD_NORMALIZATION_FAILED`, `CAPABILITY_NOT_SUPPORTED`. Mỗi mã MUST có cờ retryable cố định (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE` là retryable); `RATE_LIMITED` MAY kèm thời gian chờ đề xuất.

#### Scenario: Provider giới hạn tần suất
- **WHEN** provider từ chối vì vượt giới hạn tần suất và cho biết thời gian chờ
- **THEN** connector ném `ProviderException` mã `RATE_LIMITED`, retryable, kèm thời gian chờ

#### Scenario: Token hết hạn hoặc bị thu hồi
- **WHEN** provider báo credential không còn hợp lệ
- **THEN** connector ném `ProviderException` mã `AUTH_EXPIRED`, không retryable

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

