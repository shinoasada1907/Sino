## ADDED Requirements

### Requirement: Đặt nhắc cho lịch hẹn và việc
Hệ thống SHALL cho đặt tối đa một nhắc cho mỗi lịch hẹn và mỗi việc có hạn, bằng `reminder.offsetMinutes` trong `POST/PUT /api/events` và `/api/tasks`, với giá trị trong danh sách cho phép, và trả nhắc của lần sắp tới khi đọc.

#### Scenario: Lịch hẹn có giờ nhắc 15 phút
- **WHEN** người dùng tạo lịch hẹn 10:00 ngày 20/11 với `reminder: {offsetMinutes: 15}`
- **THEN** `GET /api/events/{id}` trả `reminder` có `at` = 09:45 ngày 20/11, `offsetMinutes` = 15, `state` = `PENDING`

#### Scenario: Lịch hẹn cả ngày nhắc 9:00 hôm trước
- **WHEN** người dùng tạo lịch hẹn cả ngày 20/11 với `offsetMinutes` = 900
- **THEN** giờ nhắc là 09:00 ngày 19/11 theo múi giờ của planner

#### Scenario: Giá trị không cho phép
- **WHEN** body có `reminder: {offsetMinutes: 7}`
- **THEN** máy chủ trả `400` với lỗi ở ô `reminder`

#### Scenario: Bỏ trống khi tạo thì theo Cài đặt
- **WHEN** người dùng có `default_reminder_minutes` = 15 và tạo lịch hẹn có giờ không có ô `reminder`
- **THEN** lịch hẹn được nhắc 15 phút trước

### Requirement: Nhắc đúng giờ qua chuông và email
Tới giờ nhắc của một lần, hệ thống SHALL ghi đúng một lần nhắc, đẩy sự kiện `reminder.due` qua SSE, và gửi email tới địa chỉ trong hồ sơ người dùng từ tài khoản gửi thư của Sino khi người dùng bật nhắc nhở và lần nhắc trễ không quá 60 phút.

#### Scenario: Nhắc lịch hẹn
- **WHEN** tới 09:45 của lịch hẹn ở scenario trên và người dùng bật nhắc nhở
- **THEN** có một nhắc trong `GET /api/reminders`, một sự kiện `reminder.due`, và một email tới địa chỉ hồ sơ có tên và giờ của lịch hẹn

#### Scenario: Không gửi trùng khi job chạy lại
- **WHEN** job nhắc của cùng một lần chạy hai lần
- **THEN** chỉ có một nhắc và một email

#### Scenario: Tắt nhắc nhở trong Cài đặt
- **WHEN** `notify_reminders` là `false` lúc tới giờ nhắc
- **THEN** nhắc vẫn hiện ở chuông nhưng không gửi email

#### Scenario: Nhắc trễ vì máy chủ tắt
- **WHEN** máy chủ chạy lại sau giờ nhắc hơn 60 phút
- **THEN** nhắc hiện ở chuông, không gửi email

### Requirement: Nhắc theo dữ liệu mới nhất
Hệ thống SHALL nhắc theo giờ của lịch hẹn hay việc ở thời điểm nhắc: sửa giờ thì nhắc theo giờ mới, xóa hay xong việc thì không nhắc, và lịch lặp nhắc từng lần.

#### Scenario: Sửa giờ trước lúc nhắc
- **WHEN** lịch hẹn 10:00 (nhắc 15 phút) được sửa thành 14:00 lúc 09:00
- **THEN** không có nhắc lúc 09:45 và có nhắc lúc 13:45

#### Scenario: Xóa trước lúc nhắc
- **WHEN** lịch hẹn bị xóa trước giờ nhắc
- **THEN** không có nhắc nào

#### Scenario: Việc xong trước lúc nhắc
- **WHEN** việc được đánh dấu xong trước giờ nhắc
- **THEN** không có nhắc cho việc đó

#### Scenario: Lịch lặp hằng tuần
- **WHEN** lịch hẹn 10:00 thứ Năm lặp hằng tuần có nhắc 15 phút
- **THEN** có nhắc 09:45 thứ Năm tuần này và 09:45 thứ Năm tuần sau

#### Scenario: Máy chủ khởi động lại trước giờ nhắc
- **WHEN** máy chủ khởi động lại sau khi lịch hẹn được tạo và trước giờ nhắc
- **THEN** nhắc vẫn tới đúng giờ

### Requirement: Danh sách nhắc cho chuông
Hệ thống SHALL trả các nhắc đã tới gần nhất của người dùng hiện tại và cho đánh dấu đã đọc từng cái hoặc tất cả; người dùng khác không thấy.

#### Scenario: Đánh dấu đã đọc
- **WHEN** người dùng gọi `POST /api/reminders/read-all`
- **THEN** mọi nhắc của người đó có `readAt`, nhắc của người khác không đổi

#### Scenario: Người khác
- **WHEN** người dùng B gọi `GET /api/reminders`
- **THEN** không thấy nhắc của người dùng A
