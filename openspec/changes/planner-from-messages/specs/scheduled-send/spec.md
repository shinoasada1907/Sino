## ADDED Requirements

### Requirement: Hẹn giờ gửi
Người dùng MUST hẹn được giờ gửi cho một thư hoặc tin trả lời trên tài khoản có capability `SEND_MESSAGES`. Giờ gửi MUST cách thời điểm hiện tại ít nhất 1 phút. Thư hẹn giờ MUST ở trạng thái `SCHEDULED` và hiện ở bộ lọc "Đã hẹn giờ" của Hộp thư.

#### Scenario: Hẹn giờ một thư trả lời
- **WHEN** người dùng chọn "Gửi lúc…" → thứ Hai 05/10 8:00 cho thư trả lời Trần Minh Anh
- **THEN** thư ở trạng thái `SCHEDULED` và hiện trong bộ lọc "Đã hẹn giờ"

#### Scenario: Tài khoản không gửi được
- **WHEN** người dùng mở ô soạn của một tài khoản không có `SEND_MESSAGES`
- **THEN** lựa chọn "Gửi lúc…" không có

### Requirement: Sửa và hủy trước giờ gửi
Trước giờ gửi, người dùng MUST sửa được nội dung, giờ gửi, hoặc hủy thư hẹn giờ. Khi thư đang được gửi, MUST NOT sửa hay hủy được nữa.

#### Scenario: Đổi giờ gửi
- **WHEN** người dùng đổi giờ gửi của thư hẹn giờ từ 8:00 sang 9:00
- **THEN** thư được gửi lúc 9:00 và không gửi lúc 8:00

### Requirement: Gửi đúng một lần
Tới giờ gửi, hệ thống MUST kiểm tra tài khoản còn kết nối, có `SEND_MESSAGES` và quyền gửi còn hiệu lực, rồi gửi qua luồng gửi tin của F10 với khóa chống trùng là mã việc hẹn giờ. Thư MUST được gửi đúng một lần.

#### Scenario: Việc gửi bị chạy lại
- **WHEN** việc gửi của một thư hẹn giờ bị chạy lại sau sự cố
- **THEN** người nhận chỉ nhận một thư

### Requirement: Không gửi được
Nếu không gửi được sau các lần thử lại của `scheduled-jobs`, hoặc gặp lỗi không tự hết, thư MUST chuyển sang `FAILED` và người dùng MUST nhận thông báo kèm "Sửa" và "Gửi lại".

#### Scenario: Quyền gửi hết hạn tới giờ gửi
- **WHEN** tới giờ gửi mà quyền gửi của tài khoản đã hết hạn
- **THEN** thư thành `FAILED` và người dùng nhận thông báo "Không gửi được thư hẹn giờ"
