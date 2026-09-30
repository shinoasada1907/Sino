## ADDED Requirements

### Requirement: Phát hiện connector lúc khởi động
`ProviderRegistry` MUST đăng ký mọi connector (bean triển khai `MessageProvider`) có trong ứng dụng khi khởi động. Ứng dụng MUST start bình thường khi chưa có connector nào.

#### Scenario: Có hai connector
- **WHEN** ứng dụng có hai connector với `ProviderType` khác nhau
- **THEN** registry resolve được cả hai theo `ProviderType`

#### Scenario: Chưa có connector
- **WHEN** ứng dụng start mà không có connector nào
- **THEN** ứng dụng start thành công và registry trả danh sách rỗng

### Requirement: Không cho phép trùng ProviderType
Hai connector MUST NOT khai báo cùng `ProviderType`.

#### Scenario: Hai connector trùng type
- **WHEN** hai connector cùng khai báo một `ProviderType`
- **THEN** ứng dụng dừng khi khởi động với thông báo nêu type bị trùng và hai class liên quan

### Requirement: Resolve provider không tồn tại
Yêu cầu resolve một `ProviderType` không có connector MUST thất bại với lỗi mã `UNKNOWN_PROVIDER` (category `NOT_FOUND` theo error model F01). Registry MUST cung cấp thêm cách tra cứu không ném lỗi để kiểm tra một provider có được hỗ trợ hay không.

#### Scenario: Provider chưa được hỗ trợ
- **WHEN** bên gọi resolve một `ProviderType` không có connector
- **THEN** lỗi mang mã `UNKNOWN_PROVIDER` và nêu type được yêu cầu

#### Scenario: Kiểm tra hỗ trợ
- **WHEN** bên gọi hỏi registry một `ProviderType` có được hỗ trợ không
- **THEN** registry trả kết quả có/không mà không ném lỗi

### Requirement: Mô tả provider cho bên dùng
Registry MUST cung cấp danh sách descriptor (`type`, tên hiển thị, tập capability) cho mọi connector, sắp xếp ổn định theo `type`. Descriptor MUST NOT chứa cấu hình hay secret của connector.

#### Scenario: Liệt kê provider
- **WHEN** bên gọi yêu cầu danh sách provider
- **THEN** mỗi connector có đúng một descriptor và thứ tự không đổi giữa các lần gọi
