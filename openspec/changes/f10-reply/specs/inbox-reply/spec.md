## ADDED Requirements

### Requirement: Ô trả lời theo trạng thái trả lời
Web MUST hiện ô trả lời khi `reply.state` = `READY`. Với `NEEDS_PERMISSION`, chỗ của ô trả lời MUST là dòng báo "Sino chưa có quyền gửi thư từ {địa chỉ}" / "Bạn vẫn đọc thư bình thường. Cấp thêm quyền gửi để trả lời từ Sino." với nút "Cấp quyền gửi" mở luồng kết nối lại của account. Account `AUTH_EXPIRED` MUST hiện dòng báo "Kết nối lại" như hiện nay. `NOT_SUPPORTED` (hoặc backend chưa có `reply`) MUST hiện "{Provider} chưa cho Sino gửi thư" / "Bạn trả lời trong {Provider}.", không có nút.

#### Scenario: Account cũ chưa cấp quyền gửi
- **WHEN** người dùng mở cuộc trò chuyện có `reply.state` = `NEEDS_PERMISSION`
- **THEN** thay cho ô trả lời là dòng báo với nút "Cấp quyền gửi" dẫn tới `/accounts?reconnect=<id>`

### Requirement: Ô trả lời hiện người nhận
Ô trả lời MUST có dòng "Tới" với tên và địa chỉ của từng người trong `reply.to`, ở mọi cỡ màn.

#### Scenario: Trả lời một người
- **WHEN** `reply.to` là `An Nguyễn <an@example.com>`
- **THEN** ô trả lời có dòng "Tới An Nguyễn <an@example.com>"

### Requirement: Thư gửi đi và các trạng thái
Bấm gửi MUST thêm ngay thư "Đang gửi" ở cuối cuộc trò chuyện và gọi `POST` với một `clientMessageId` mới; xong thì thư của server MUST thay thư đó. `502 SEND_FAILED` MUST để thư ở lại với "Không gửi được", kèm "Gửi lại" (gọi lại với cùng `clientMessageId`) và "Bỏ" (`DELETE` khi server đã ghi thư, hoặc chỉ xóa ở web khi chưa). `504 SEND_OUTCOME_UNKNOWN` và thư `UNKNOWN` MUST hiện "Chưa rõ đã gửi chưa · Sino đang kiểm tra với Gmail", không có nút. `409 REPLY_NOT_ALLOWED` MUST đọc lại cuộc trò chuyện và để thư ở trạng thái "Không gửi được". Chữ của thư gửi lỗi MUST NOT mất. Khi mất mạng, lần gửi MUST chờ và gửi khi có mạng lại.

#### Scenario: Gửi thành công
- **WHEN** người dùng gửi và server trả `201`
- **THEN** thư "Đang gửi" được thay bằng thư của server, không còn chữ "Đang gửi"

#### Scenario: Gửi lỗi rồi gửi lại
- **WHEN** server trả `502 SEND_FAILED` và người dùng bấm "Gửi lại"
- **THEN** web gọi `POST` với đúng `clientMessageId` cũ

#### Scenario: Bỏ thư gửi lỗi
- **WHEN** người dùng bấm "Bỏ" ở thư `FAILED` đã có trên server
- **THEN** web gọi `DELETE` và thư biến mất khỏi cuộc trò chuyện

#### Scenario: Không rõ kết quả
- **WHEN** server trả `504 SEND_OUTCOME_UNKNOWN`
- **THEN** thư hiện "Chưa rõ đã gửi chưa" và không có nút "Gửi lại"
