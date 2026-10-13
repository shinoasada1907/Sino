## ADDED Requirements

### Requirement: Lịch hẹn cá nhân
Một lịch hẹn MUST có tiêu đề không rỗng tối đa 200 ký tự và đúng một kiểu thời gian: có giờ (`startsAt`, `endsAt`, kết thúc sau bắt đầu) hoặc cả ngày (`startDate`, `endDate`, ngày kết thúc không gồm và sau ngày bắt đầu); độ dài MUST NOT quá 14 ngày. Lịch hẹn MAY có địa điểm tối đa 200 ký tự, ghi chú tối đa 20.000 ký tự và một quy tắc lặp (spec `recurrence`, mốc là lúc bắt đầu). Lịch hẹn chỉ thuộc người dùng Sino, không mời hay chia sẻ cho ai. Ở phiên bản này API trả `reminder`, `source`, `related` là `null`.

#### Scenario: Kết thúc trước bắt đầu
- **WHEN** người dùng lưu lịch hẹn 10:00 – 09:00
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Lịch hẹn cả ngày
- **WHEN** người dùng tạo "Sinh nhật Hà" cả ngày thứ Năm 01/10
- **THEN** lịch hẹn được lưu với `startDate` 01/10 và `endDate` 02/10

### Requirement: Tạo, xem, sửa và xóa lịch hẹn
`POST /api/events` MUST lưu lịch hẹn và trả `201` kèm `Location`. `GET /api/events/{id}` MUST trả cả chuỗi (mốc và quy tắc). `PUT /api/events/{id}` MUST thay cả lịch hẹn; `DELETE /api/events/{id}` MUST xóa và trả `204`. Với lịch hẹn lặp, sửa và xóa MUST áp cho mọi lần lặp (D-151). Lịch hẹn không tồn tại hoặc của người khác MUST trả `404 EVENT_NOT_FOUND`; hai thay đổi cùng lúc MUST để một bên nhận `409 CONCURRENT_MODIFICATION`. Mọi endpoint cần đăng nhập, thay đổi cần CSRF.

#### Scenario: Đổi giờ một lịch hẹn lặp
- **WHEN** người dùng đổi "Họp nhóm" lặp mỗi thứ Năm từ 10:00 sang 14:00
- **THEN** mọi lần lặp trên lịch, kể cả lần đã qua, hiện 14:00

#### Scenario: Xóa lịch hẹn lặp
- **WHEN** người dùng xóa "Chạy bộ Hồ Tây" lặp mỗi Chủ nhật
- **THEN** máy chủ trả `204` và không còn lần nào của nó trên lịch

### Requirement: Xem lịch theo khoảng ngày
`GET /api/calendar?from=&to=` MUST nhận hai ngày (`to` không gồm, sau `from`, cách nhau tối đa 62 ngày; sai thì `400 VALIDATION_FAILED`) tính theo múi giờ cấu hình, và trả `generatedAt`, `from`, `to`, `events`, `tasks`, `reminders` của người gọi:
- `events`: từng lần của lịch hẹn (lặp hay không) giao với khoảng, mỗi lần có `id` dạng `<eventId>@<ngày bắt đầu>`, `eventId`, giờ của lần đó và quy tắc; các lần MUST được tính khi xem, không lưu sẵn.
- `tasks`: việc (`OPEN` và `DONE`) có hạn trong khoảng; khi khoảng chứa hôm nay thì thêm việc `OPEN` có hạn trước khoảng (quá hạn từ trước); và với mỗi việc lặp đang mở, các lần sắp tới chưa tạo trong khoảng (sau hạn của nó, không trước hôm nay, trong số lần và ngày cuối), `id` dạng `<taskId>@<ngày hạn>` và `taskId` của việc đang mở.
- `reminders`: rỗng ở phiên bản này.

#### Scenario: Lịch hẹn lặp trong tuần đang xem
- **WHEN** người dùng xem [28/09, 05/10) và có lịch hẹn lặp mỗi Chủ nhật 06:00 từ 06/09
- **THEN** `events` có một lần ngày 04/10 06:00 với `id` "<eventId>@2026-10-04"

#### Scenario: Lịch hẹn kéo dài vào khoảng
- **WHEN** một lịch hẹn cả ngày từ 26/09 tới hết 29/09 và người dùng xem [28/09, 05/10)
- **THEN** lịch hẹn đó có trong `events`

#### Scenario: Việc quá hạn từ trước khi xem tuần này
- **WHEN** hôm nay là thứ Sáu 02/10, việc "Gửi lại hóa đơn tháng 9" đang mở có hạn 30/09 và người dùng xem [01/10, 15/10)
- **THEN** `tasks` có việc đó

#### Scenario: Lần sắp tới của việc lặp
- **WHEN** việc "Báo cáo tuần" đang mở có hạn thứ Hai 05/10 9:00, lặp mỗi thứ Hai, và người dùng xem tháng 10/2026
- **THEN** `tasks` có việc thật ngày 05/10 và các lần 12/10, 19/10, 26/10 với `taskId` của việc đó

#### Scenario: Khoảng quá dài
- **WHEN** người dùng gọi `GET /api/calendar?from=2026-10-01&to=2027-01-01`
- **THEN** máy chủ trả `400 VALIDATION_FAILED`
