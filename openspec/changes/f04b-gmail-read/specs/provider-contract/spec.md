## MODIFIED Requirements

### Requirement: Contract lấy cập nhật (sync)
Với connector có `READ_MESSAGES`, `fetchUpdates(context, cursor)` MUST trả một batch gồm conversation, message, item bị bỏ qua, `nextCursor` khác null và cờ `hasMore`. Cursor MUST là giá trị opaque do connector tự hiểu; cursor khởi tạo biểu diễn lần sync đầu tiên và MAY mang một mốc thời gian `since` (D-59): khi có, connector MUST NOT trả item có hoạt động trước mốc đó; khi không có, lần sync đầu đọc toàn bộ dữ liệu provider cho phép. Mốc thời gian chỉ có ở cursor khởi tạo. Mọi item MUST mang external ID để bên dùng khử trùng được khi cùng dữ liệu được trả lại nhiều lần. Connector không khai báo `READ_MESSAGES` MUST từ chối `fetchUpdates` với `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` và MUST NOT gọi tới provider bên ngoài.

#### Scenario: Lần sync đầu tiên
- **WHEN** bên gọi truyền cursor khởi tạo
- **THEN** connector trả batch đầu tiên cùng `nextCursor` để gọi tiếp

#### Scenario: Lần sync đầu có mốc thời gian
- **WHEN** bên gọi truyền cursor khởi tạo với mốc `since`
- **THEN** không item nào trong các batch có thời điểm hoạt động trước `since`

#### Scenario: Hết dữ liệu hiện có
- **WHEN** không còn dữ liệu nào sau cursor hiện tại
- **THEN** batch có `hasMore` = `false` và `nextCursor` dùng được cho lần sync tăng dần tiếp theo

#### Scenario: Gọi lại với cùng cursor
- **WHEN** bên gọi gọi lại `fetchUpdates` với cursor đã dùng
- **THEN** các item trả về (nếu có) mang cùng external ID như lần trước để bên dùng không tạo bản trùng

#### Scenario: Connector chưa đọc được tin
- **WHEN** bên gọi gọi `fetchUpdates` trên connector không khai báo `READ_MESSAGES`
- **THEN** thao tác thất bại với `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` và không có lời gọi nào tới provider bên ngoài

### Requirement: Phân loại lỗi provider
Lỗi từ connector MUST được báo bằng `ProviderException` với một mã trong: `AUTH_EXPIRED`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`, `REQUEST_REJECTED`, `PAYLOAD_NORMALIZATION_FAILED`, `CAPABILITY_NOT_SUPPORTED`, `CURSOR_EXPIRED`. Mỗi mã MUST có cờ retryable cố định (`RATE_LIMITED`, `PROVIDER_UNAVAILABLE` là retryable); `RATE_LIMITED` MAY kèm thời gian chờ đề xuất. `CURSOR_EXPIRED` (D-60) MUST được dùng khi cursor không còn dùng được để đọc tiếp; bên gọi MUST đọc lại bằng cursor khởi tạo.

#### Scenario: Provider giới hạn tần suất
- **WHEN** provider từ chối vì vượt giới hạn tần suất và cho biết thời gian chờ
- **THEN** connector ném `ProviderException` mã `RATE_LIMITED`, retryable, kèm thời gian chờ

#### Scenario: Token hết hạn hoặc bị thu hồi
- **WHEN** provider báo credential không còn hợp lệ
- **THEN** connector ném `ProviderException` mã `AUTH_EXPIRED`, không retryable

#### Scenario: Cursor quá cũ
- **WHEN** provider không còn đọc tiếp được từ cursor bên gọi truyền vào
- **THEN** connector ném `ProviderException` mã `CURSOR_EXPIRED`, không retryable
