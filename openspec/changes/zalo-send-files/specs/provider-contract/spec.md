## MODIFIED Requirements

### Requirement: Tập capability chuẩn
Capability MUST là một trong: `READ_MESSAGES`, `SEND_MESSAGES`, `SEND_IMAGES`, `SEND_FILES`, `ATTACHMENTS`, `MARK_READ`, `REACTIONS`, `PUSH_WEBHOOK`, `THREADS`. `SEND_IMAGES` nghĩa là connector gửi được một ảnh của sticker trong một tin; `SEND_FILES` nghĩa là connector gửi được một ảnh hay một tệp từ máy người dùng trong một tin; `ATTACHMENTS` vẫn chỉ nói tin chuẩn hóa có metadata tệp đính kèm. `SEND_IMAGES` và `SEND_FILES` mỗi cái MUST kéo theo `SEND_MESSAGES`. Thêm capability mới MUST đi kèm cập nhật bảng ý nghĩa capability trong design.

#### Scenario: Connector chỉ đọc
- **WHEN** một connector chỉ đọc được tin nhắn
- **THEN** tập capability của nó là `{READ_MESSAGES}` và mọi truy vấn capability khác trả về không hỗ trợ

#### Scenario: Gửi chữ mà không gửi ảnh hay tệp
- **WHEN** connector Gmail khai capability của nó
- **THEN** tập có `SEND_MESSAGES` mà không có `SEND_IMAGES` hay `SEND_FILES`

### Requirement: Contract gửi tin
Với connector có `SEND_MESSAGES`, `sendMessage(context, command)` MUST trả kết quả chứa `externalMessageId` của provider và trạng thái gửi (`PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED` hoặc `UNKNOWN`). `command` MUST có đúng một nội dung: chữ không rỗng; hoặc một ảnh của sticker (byte, loại `image/png`, `image/gif` hay `image/webp`, tên tệp, rộng, cao); hoặc một tệp (byte, loại, tên tệp, ảnh hay tệp). Chỉ connector có `SEND_IMAGES` MUST nhận lệnh có ảnh của sticker, chỉ connector có `SEND_FILES` MUST nhận lệnh có tệp; connector khác MUST ném lỗi chuẩn hóa không hỗ trợ và không gửi gì.

#### Scenario: Gửi thành công
- **WHEN** connector gửi thành công một tin nhắn văn bản
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

#### Scenario: Gửi một ảnh
- **WHEN** connector có `SEND_IMAGES` gửi thành công một lệnh có ảnh PNG và chữ rỗng
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

#### Scenario: Gửi một tệp
- **WHEN** connector có `SEND_FILES` gửi thành công một lệnh có tệp PDF
- **THEN** kết quả có `externalMessageId` không rỗng và trạng thái khác `FAILED`

#### Scenario: Tệp tới connector không gửi được tệp
- **WHEN** một lệnh có tệp tới connector không có `SEND_FILES`
- **THEN** connector ném lỗi không hỗ trợ và provider không nhận yêu cầu nào
