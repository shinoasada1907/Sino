## MODIFIED Requirements

### Requirement: Tập capability chuẩn
Capability MUST là một trong: `READ_MESSAGES`, `SEND_MESSAGES`, `SEND_IMAGES`, `ATTACHMENTS`, `MARK_READ`, `REACTIONS`, `PUSH_WEBHOOK`, `THREADS`. `SEND_IMAGES` nghĩa là connector gửi được một ảnh trong một tin; `ATTACHMENTS` vẫn chỉ nói tin chuẩn hóa có metadata tệp đính kèm. Thêm capability mới MUST đi kèm cập nhật bảng ý nghĩa capability trong design.

#### Scenario: Connector chỉ đọc
- **WHEN** một connector chỉ đọc được tin nhắn
- **THEN** tập capability của nó là `{READ_MESSAGES}` và mọi truy vấn capability khác trả về không hỗ trợ

#### Scenario: Gửi chữ mà không gửi ảnh
- **WHEN** connector Gmail khai capability của nó
- **THEN** tập có `SEND_MESSAGES` mà không có `SEND_IMAGES`

### Requirement: Contract gửi tin
Với connector có `SEND_MESSAGES`, `sendMessage(context, command)` MUST trả kết quả chứa `externalMessageId` của provider và trạng thái gửi (`PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` hoặc `UNKNOWN`). `command` MUST có chữ không rỗng, hoặc một ảnh (byte, loại `image/png`, `image/gif` hay `image/webp`, tên tệp, rộng, cao) với chữ được phép rỗng; chỉ connector có `SEND_IMAGES` MUST nhận lệnh có ảnh, connector khác MUST ném lỗi chuẩn hóa không hỗ trợ và không gửi gì.

#### Scenario: Gửi thành công
- **WHEN** connector gửi thành công một tin nhắn văn bản
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

#### Scenario: Gửi một ảnh
- **WHEN** connector có `SEND_IMAGES` gửi thành công một lệnh có ảnh PNG và chữ rỗng
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

#### Scenario: Ảnh tới connector không gửi được ảnh
- **WHEN** một lệnh có ảnh tới connector không có `SEND_IMAGES`
- **THEN** connector ném lỗi không hỗ trợ và provider không nhận yêu cầu nào
