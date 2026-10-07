## ADDED Requirements

### Requirement: Connector khai báo cách kết nối OAuth2
Connector MAY khai báo cách kết nối OAuth2 qua `oauth2()` của `MessageProvider`, trả `OAuth2Connection` gồm: registration id của OAuth client, tập scope bắt buộc, tham số riêng gửi kèm yêu cầu đồng ý, và địa chỉ thu hồi token (tùy chọn). Mặc định `oauth2()` trả rỗng. `OAuth2Connection` MUST chỉ chứa kiểu của Sino; client id, client secret và token MUST NOT nằm trong nó. Connector MUST NOT tự đổi code lấy token hay tự refresh token: việc đó thuộc module `account` (D-15 = A', D-38).

#### Scenario: Connector không dùng OAuth2
- **WHEN** bên gọi hỏi `oauth2()` của một connector không khai báo
- **THEN** kết quả là rỗng

#### Scenario: Connector Gmail
- **WHEN** bên gọi hỏi `oauth2()` của connector Gmail
- **THEN** kết quả có registration id `google`, scope `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, tham số `access_type=offline` và `prompt=consent`, và địa chỉ thu hồi của Google

## MODIFIED Requirements

### Requirement: Contract lấy cập nhật (sync)
Với connector có `READ_MESSAGES`, `fetchUpdates(context, cursor)` MUST trả một batch gồm conversation, message, item bị bỏ qua, `nextCursor` khác null và cờ `hasMore`. Cursor MUST là giá trị opaque do connector tự hiểu; cursor khởi tạo biểu diễn lần sync đầu tiên. Mọi item MUST mang external ID để bên dùng khử trùng được khi cùng dữ liệu được trả lại nhiều lần. Connector không khai báo `READ_MESSAGES` MUST từ chối `fetchUpdates` với `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` và MUST NOT gọi tới provider bên ngoài.

#### Scenario: Lần sync đầu tiên
- **WHEN** bên gọi truyền cursor khởi tạo
- **THEN** connector trả batch đầu tiên cùng `nextCursor` để gọi tiếp

#### Scenario: Hết dữ liệu hiện có
- **WHEN** không còn dữ liệu nào sau cursor hiện tại
- **THEN** batch có `hasMore` = `false` và `nextCursor` dùng được cho lần sync tăng dần tiếp theo

#### Scenario: Gọi lại với cùng cursor
- **WHEN** bên gọi gọi lại `fetchUpdates` với cursor đã dùng
- **THEN** các item trả về (nếu có) mang cùng external ID như lần trước để bên dùng không tạo bản trùng

#### Scenario: Connector chưa đọc được tin
- **WHEN** bên gọi gọi `fetchUpdates` trên connector không khai báo `READ_MESSAGES` (ví dụ Gmail ở F04a)
- **THEN** thao tác thất bại với `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` và không có lời gọi nào tới provider bên ngoài
