## ADDED Requirements

### Requirement: Đăng ký nhận báo thay đổi
`MessageProvider` MUST có `registerPush(context)` trả đăng ký gồm địa chỉ mà thông báo push sẽ mang và thời điểm hết hạn, hoặc rỗng khi connector không hỗ trợ; mặc định MUST trả rỗng và MUST NOT gọi provider. Chỉ connector khai báo `PUSH_WEBHOOK` mới cài hàm này. Gọi lại khi đăng ký cũ còn hạn MUST an toàn (gia hạn).

#### Scenario: Connector không hỗ trợ
- **WHEN** bên gọi gọi `registerPush` của một connector không khai báo `PUSH_WEBHOOK`
- **THEN** kết quả rỗng và không có lời gọi nào tới provider
