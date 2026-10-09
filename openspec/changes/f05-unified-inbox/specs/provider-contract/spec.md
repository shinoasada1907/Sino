## ADDED Requirements

### Requirement: Ước lượng số thư
`MessageProvider` MUST có `estimateMessages(context, since)` trả số thư ước lượng có hoạt động từ `since` (`null` = toàn bộ) hoặc rỗng khi connector không ước lượng được; mặc định MUST trả rỗng (D-65). Connector không khai báo `READ_MESSAGES` MUST trả rỗng và MUST NOT gọi provider bên ngoài. Số trả về MUST không âm và chỉ là ước lượng: bên gọi MUST NOT dựa vào nó để biết khi nào nhập xong.

#### Scenario: Connector không ước lượng
- **WHEN** bên gọi hỏi ước lượng của một connector không cài hàm này
- **THEN** kết quả rỗng

#### Scenario: Connector chưa đọc được tin
- **WHEN** bên gọi hỏi ước lượng của connector không khai báo `READ_MESSAGES`
- **THEN** kết quả rỗng và không có lời gọi nào tới provider

### Requirement: Khóa metadata dùng chung
Metadata của `NormalizedMessage` MAY có khóa dùng chung `bulk` với giá trị `"true"` khi thư được gửi hàng loạt (bản tin, quảng cáo, thông báo tự động) (D-68). Connector không biết MUST bỏ trống khóa này; bên dùng MUST coi thiếu khóa là không hàng loạt.

#### Scenario: Thư quảng cáo
- **WHEN** connector biết một thư là thư hàng loạt
- **THEN** metadata của thư có `bulk` = `"true"`
