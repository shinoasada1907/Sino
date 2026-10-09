## ADDED Requirements

### Requirement: Gmail đăng ký nhận báo thay đổi
Khi có topic Pub/Sub được cấu hình, connector Gmail MUST khai báo `PUSH_WEBHOOK` và `registerPush` MUST gọi `users.watch` với topic đó cho cả hộp thư, trả địa chỉ hộp thư (`emailAddress` của profile) và thời điểm hết hạn. Không có topic thì connector MUST NOT khai báo `PUSH_WEBHOOK`.

#### Scenario: Đăng ký watch
- **WHEN** `registerPush` được gọi cho một account Gmail và topic đã cấu hình
- **THEN** Gmail nhận `POST users/me/watch` với `topicName` đã cấu hình, và kết quả có địa chỉ hộp thư cùng hạn lấy từ `expiration`

#### Scenario: Không có topic
- **WHEN** topic Pub/Sub không được cấu hình
- **THEN** capability của Gmail không có `PUSH_WEBHOOK`

### Requirement: Giữ watch còn hạn
Sino MUST đăng ký watch khi lần nhập đầu của account `DONE`, và MUST kiểm định kỳ (mặc định mỗi giờ) để gia hạn watch của account đủ điều kiện đồng bộ tự động khi watch chưa có hoặc hết hạn trong vòng 2 ngày. Lỗi đăng ký MUST được ghi và thử lại ở lần kiểm sau, không làm hỏng việc đồng bộ.

#### Scenario: Watch sắp hết hạn
- **WHEN** lần kiểm chạy và watch của một account hết hạn sau 1 ngày
- **THEN** Sino đăng ký lại và lưu hạn mới

#### Scenario: Topic sai
- **WHEN** Gmail từ chối `users.watch`
- **THEN** trạng thái đồng bộ của account có `push` = `FAILED`, và lịch vẫn hỏi account mỗi 60 giây

### Requirement: Webhook chỉ nhận thông báo của Google
`POST /api/webhooks/gmail` MUST chỉ tồn tại khi đủ topic, `audience` và tài khoản dịch vụ được cấu hình, MUST NOT cần đăng nhập hay CSRF, và MUST kiểm token `Authorization: Bearer`: chữ ký theo khóa công khai của Google, còn hạn, `iss` là Google, `aud` chứa `audience` đã cấu hình, `email` là tài khoản dịch vụ đã cấu hình và `email_verified` = true. Token thiếu hoặc không đạt MUST trả `401` và MUST NOT làm gì khác (D-76).

#### Scenario: Thông báo hợp lệ
- **WHEN** Pub/Sub gửi thông báo có token hợp lệ cho địa chỉ của một account đủ điều kiện
- **THEN** response là `204` và account đó được yêu cầu đồng bộ

#### Scenario: Token giả
- **WHEN** một request tới webhook có token ký bằng khóa không phải của Google, hoặc sai `aud`, sai `email`, hết hạn, hoặc không có token
- **THEN** response là `401` và không account nào được yêu cầu đồng bộ

#### Scenario: Nội dung hỏng
- **WHEN** token hợp lệ nhưng `message.data` không giải mã được hoặc không có địa chỉ
- **THEN** response là `204` (để Pub/Sub không gửi lại) và không account nào được yêu cầu đồng bộ

### Requirement: Thông báo chỉ là tín hiệu
Webhook MUST chỉ dùng địa chỉ hộp thư để tìm các account có watch của địa chỉ đó (không phân biệt hoa thường) và yêu cầu đồng bộ chúng; MUST NOT tin `historyId` hay bất kỳ dữ liệu thư nào trong thông báo. Địa chỉ không khớp account nào MUST bị bỏ qua. Địa chỉ hộp thư MUST NOT xuất hiện trong log.

#### Scenario: Địa chỉ không còn account
- **WHEN** thông báo hợp lệ mang địa chỉ của một account đã bị xóa
- **THEN** response là `204` và không có lượt đồng bộ nào
