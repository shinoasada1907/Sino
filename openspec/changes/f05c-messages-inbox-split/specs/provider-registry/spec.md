## MODIFIED Requirements

### Requirement: Mô tả provider cho bên dùng
Registry MUST cung cấp danh sách descriptor (`type`, tên hiển thị, loại `EMAIL` hoặc `CHAT`, tập capability) cho mọi connector, sắp xếp ổn định theo `type`. Descriptor MUST NOT chứa cấu hình hay secret của connector.

#### Scenario: Liệt kê provider
- **WHEN** bên gọi yêu cầu danh sách provider
- **THEN** mỗi connector có đúng một descriptor và thứ tự không đổi giữa các lần gọi

#### Scenario: Loại trong descriptor
- **WHEN** ứng dụng có một connector khai `EMAIL` và một connector khai `CHAT`
- **THEN** descriptor của mỗi connector mang đúng loại connector đó đã khai

## ADDED Requirements

### Requirement: Connector có công tắc tắt vẫn ở trong registry
Connector có công tắc bật/tắt riêng (ví dụ `sino.zalo.enabled`) MUST vẫn được đăng ký vào registry khi tắt, để loại, tên và capability của nó vẫn tra được cho các account đã có; khi tắt, thao tác gọi ra ngoài MUST thất bại theo cách connector đó định nghĩa.

#### Scenario: Zalo đang tắt
- **WHEN** ứng dụng chạy với `sino.zalo.enabled` = false và có connector Zalo
- **THEN** registry vẫn resolve được `zalo` và descriptor của nó có loại `CHAT`
