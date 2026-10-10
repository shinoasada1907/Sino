## ADDED Requirements

### Requirement: Contract đọc lại một thư và tải một tệp
Contract MUST có hai hàm tùy chọn: đọc lại nội dung một thư theo external ID (HTML nếu có, các phần ảnh nhúng), và tải nội dung một tệp theo external ID của thư và của tệp. Connector không cài MUST trả rỗng (đọc lại) hoặc ném `ProviderException` mã `CAPABILITY_NOT_SUPPORTED` (tải tệp) mà không gọi provider. Lỗi từ provider MUST theo bảng mã `ProviderException` đã có. Gmail MUST cài cả hai.

#### Scenario: Connector không cài
- **WHEN** bên gọi đọc lại một thư của connector không cài hàm này
- **THEN** kết quả rỗng và không có lời gọi nào ra provider

#### Scenario: Gmail tải tệp
- **WHEN** bên gọi tải một tệp của thư Gmail
- **THEN** connector gọi `users.messages.attachments.get` và trả bytes đã giải mã base64url
