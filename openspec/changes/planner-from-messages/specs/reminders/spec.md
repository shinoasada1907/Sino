## ADDED Requirements

### Requirement: Một nhắc nhở cho mỗi mục
Mỗi task và mỗi lịch hẹn MUST có tối đa một nhắc nhở. Giờ nhắc MUST ở tương lai tại thời điểm đặt.

#### Scenario: Giờ nhắc đã qua
- **WHEN** người dùng đặt giờ nhắc sớm hơn thời điểm hiện tại
- **THEN** yêu cầu bị từ chối với thông báo "Giờ đã qua"

### Requirement: Báo khi tới giờ
Khi tới giờ nhắc, hệ thống MUST tạo một thông báo cho người dùng qua capability `notifications` và MUST đánh dấu nhắc nhở là đã báo. Mỗi lần hẹn của một nhắc nhở MUST được báo đúng một lần, kể cả khi việc hẹn giờ bị chạy lại.

#### Scenario: Tới giờ nhắc
- **WHEN** tới 9:00 của nhắc nhở thuộc task "Trả lời: Hợp đồng thuê văn phòng"
- **THEN** người dùng nhận một thông báo có tiêu đề task, nút "Xong" và "Nhắc lại sau 1 giờ"

#### Scenario: Báo trễ sau sự cố
- **WHEN** hệ thống không chạy lúc 9:00 và khởi động lại lúc 9:40
- **THEN** nhắc nhở được báo khi khởi động lại kèm ghi chú "trễ 40 phút"

### Requirement: Hủy khi mục không còn cần nhắc
Khi task được đánh dấu Xong hoặc bị xóa, hoặc lịch hẹn bị xóa, nhắc nhở chưa báo của mục đó MUST bị hủy.

#### Scenario: Xóa lịch hẹn
- **WHEN** người dùng xóa một lịch hẹn còn nhắc nhở chưa tới giờ
- **THEN** nhắc nhở bị hủy và không có thông báo nào được gửi

### Requirement: Nhắc lại sau
Từ một thông báo nhắc nhở, người dùng MUST đặt lại được giờ nhắc mới ("Nhắc lại sau 1 giờ") hoặc hoàn thành task ("Xong").

#### Scenario: Nhắc lại sau 1 giờ
- **WHEN** người dùng chọn "Nhắc lại sau 1 giờ" trên thông báo lúc 9:02
- **THEN** nhắc nhở được đặt lại lúc 10:02

### Requirement: Nhắc nhở của lịch hẹn lặp
Với lịch hẹn lặp, hệ thống MUST chỉ giữ việc nhắc cho lần lặp gần nhất; sau khi báo MUST đặt việc nhắc cho lần kế tiếp.

#### Scenario: Chuyển sang lần lặp kế
- **WHEN** nhắc nhở của lần lặp thứ Năm tuần này đã được báo
- **THEN** việc nhắc cho thứ Năm tuần sau được đặt
