## ADDED Requirements

### Requirement: Tạo cuộc trò chuyện bằng một thư mới
`POST /api/conversations` MUST nhận `accountId`, `to` (1…50 địa chỉ), `subject` (có thể rỗng), `text` (không chỉ khoảng trắng) và `clientMessageId`, MUST tạo một cuộc trò chuyện của tài khoản đó với thư mở đầu **trước** khi gọi nhà cung cấp, rồi MUST gửi thư như một thread mới (không thuộc thread nào có sẵn). Gửi xong MUST trả `201` với cuộc trò chuyện và thư; mã ngoài của cuộc trò chuyện MUST là thread của nhà cung cấp. Cuộc trò chuyện MUST có mặt trong Hộp thư ngay khi được tạo, với tiêu đề, đầu chữ và giờ của thư mở đầu.

#### Scenario: Gửi một thư mới
- **WHEN** người dùng gửi từ `tienct07@gmail.com` tới `minhanh@acme.vn` với tiêu đề "Báo giá tháng 10"
- **THEN** `201`, Gmail có một thread mới chứa đúng thư đó, và Hộp thư có một cuộc trò chuyện mới "minhanh@acme.vn" với tiêu đề "Báo giá tháng 10"

#### Scenario: Địa chỉ sai
- **WHEN** `to` có "minhanh@" hay hơn 50 địa chỉ
- **THEN** `400 VALIDATION_FAILED` với lỗi của trường `to`, không tạo gì và không gọi nhà cung cấp

### Requirement: Không gửi trùng thư mới
Gọi lại với cùng `clientMessageId` MUST NOT gửi lần hai và MUST NOT tạo cuộc trò chuyện thứ hai: thư đã `SENT` → `200` với cùng cuộc trò chuyện và thư; đang `PENDING` → `409 SEND_IN_PROGRESS`; `UNKNOWN` → `409 SEND_OUTCOME_UNKNOWN`; `FAILED` → gửi lại.

#### Scenario: Bấm Gửi lại sau khi mất mạng
- **WHEN** lần gửi đầu đã tới Gmail nhưng web không nhận được câu trả lời, rồi web gửi lại cùng `clientMessageId`
- **THEN** `200` với cuộc trò chuyện của lần đầu, và Gmail chỉ có một thư

### Requirement: Gửi thư mới lỗi và kết quả không rõ
Tài khoản không gửi được MUST trả `409 SEND_NOT_ALLOWED` với `state`, không tạo gì. Nhà cung cấp từ chối chắc chắn MUST để thư `FAILED` và trả `502 SEND_FAILED` với `conversationId`, `messageId`. Không rõ thư đã đi chưa MUST để thư `UNKNOWN` và trả `504 SEND_OUTCOME_UNKNOWN` với `conversationId`, `messageId`; Sino MUST đối chiếu sau trong thư đã gửi của tài khoản (thời điểm, người nhận, tiêu đề, chữ): thấy → `SENT` và mã ngoài thành thread của nhà cung cấp; quá 10 phút không thấy → `FAILED`.

#### Scenario: Gmail hết giờ chờ
- **WHEN** Gmail không trả lời trong 15 giây
- **THEN** `504 SEND_OUTCOME_UNKNOWN` với `conversationId`, và cuộc trò chuyện có thư "chưa rõ" cho tới khi đối chiếu xong

### Requirement: Thư mở đầu chưa gửi xong
Khi thư mở đầu chưa `SENT`, `reply.state` MUST là `OPENING_NOT_SENT` và `reply.to` là người nhận của thư mở đầu. `POST /api/conversations/{id}/messages` với `clientMessageId` của thư mở đầu MUST gửi lại nó như thư mới; với `clientMessageId` khác MUST trả `409 REPLY_NOT_ALLOWED`. `DELETE` thư mở đầu `FAILED` MUST xóa cả cuộc trò chuyện.

#### Scenario: Bỏ thư mới gửi lỗi
- **WHEN** người dùng bỏ thư mở đầu `FAILED` của một cuộc trò chuyện mới
- **THEN** `204`, và cuộc trò chuyện không còn trong Hộp thư

### Requirement: Thư mới đã được đồng bộ nhập trước
Khi lượt đồng bộ đã nhập thread của thư mới trước lúc Sino ghi kết quả gửi, Hộp thư MUST chỉ có một cuộc trò chuyện cho thread đó, thư MUST giữ `clientMessageId`, và response MUST mang mã của cuộc trò chuyện còn lại.

#### Scenario: Đồng bộ nhanh hơn
- **WHEN** đồng bộ nhập thread mới trong lúc Sino chờ Gmail trả lời lệnh gửi
- **THEN** sau khi gửi xong chỉ có một cuộc trò chuyện, và gọi lại cùng `clientMessageId` trả `200` với cuộc trò chuyện đó
