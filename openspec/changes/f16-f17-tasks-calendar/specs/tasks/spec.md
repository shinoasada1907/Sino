## ADDED Requirements

### Requirement: Một việc cần làm
Một việc MUST có tiêu đề không rỗng tối đa 200 ký tự (bỏ khoảng trắng hai đầu) và trạng thái `OPEN` hoặc `DONE`; MAY có ghi chú tối đa 20.000 ký tự, một hạn và một quy tắc lặp (spec `recurrence`). Hạn MUST là một thời điểm (`dueAt`) hoặc một ngày cả ngày (`dueDate`), không cả hai; quy tắc lặp MUST đi cùng một hạn. Việc thuộc về đúng một người dùng Sino. Ở phiên bản này việc không có nhắc nhở, không có nguồn tin nhắn và không có mục liên quan: API trả `reminder`, `source`, `related` là `null`.

#### Scenario: Có cả hai kiểu hạn
- **WHEN** người dùng lưu một việc có cả `dueAt` và `dueDate`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Lặp mà không có hạn
- **WHEN** người dùng lưu một việc có quy tắc lặp nhưng không có hạn
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

### Requirement: Tạo việc
`POST /api/tasks` với tiêu đề và, tùy chọn, ghi chú, hạn, quy tắc lặp MUST lưu một việc `OPEN` và trả `201 Created` kèm `Location` và việc vừa tạo.

#### Scenario: Tạo việc chỉ có tiêu đề
- **WHEN** người dùng gửi `{ "title": "Gọi điện cho thợ sửa máy lạnh" }`
- **THEN** máy chủ trả `201` với việc `OPEN`, `dueAt` và `dueDate` là `null`

#### Scenario: Tạo việc có hạn và lặp
- **WHEN** người dùng tạo "Chuyển tiền nhà" hạn 02/11 17:00 giờ Việt Nam, lặp hằng tháng
- **THEN** việc được lưu với hạn đó, quy tắc hằng tháng ngày gốc 2 và `seriesId` khác `null`

#### Scenario: Tiêu đề rỗng
- **WHEN** người dùng gửi tiêu đề chỉ có khoảng trắng
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

### Requirement: Danh sách việc
`GET /api/tasks` MUST trả `generatedAt` và mọi việc `OPEN` cùng các việc `DONE` hoàn thành trong 7 ngày gần nhất của người gọi; việc của người khác MUST NOT có trong danh sách. Nhóm Quá hạn / Hôm nay / Sắp tới do web tính (D-84).

#### Scenario: Việc xong từ lâu
- **WHEN** người dùng có một việc xong 8 ngày trước và một việc xong hôm qua
- **THEN** danh sách có việc xong hôm qua và không có việc xong 8 ngày trước

### Requirement: Sửa tiêu đề và ghi chú
`PATCH /api/tasks/{id}` MUST đổi các trường được gửi trong `title`, `notes`; trường thiếu hoặc `null` MUST giữ nguyên; ít nhất một trường MUST được gửi. Ghi chú rỗng hoặc chỉ khoảng trắng MUST thành không có ghi chú.

#### Scenario: Xóa ghi chú
- **WHEN** người dùng gửi `{ "notes": "  " }` cho một việc có ghi chú
- **THEN** việc trả về có `notes` là `null` và tiêu đề không đổi

### Requirement: Đặt hạn và quy tắc lặp
`PUT /api/tasks/{id}/schedule` với `{ dueAt, dueDate, recurrence }` MUST thay cả hạn và quy tắc lặp của việc; `null` là không có. Đặt một quy tắc lặp MUST đặt việc đó làm lần thứ nhất của chuỗi (số lần tính từ đây) và gán `seriesId` nếu việc chưa có. Bỏ quy tắc MUST giữ `seriesId` nhưng không tạo lần kế tiếp nữa.

#### Scenario: Bỏ hạn
- **WHEN** người dùng gửi `{ "dueAt": null, "dueDate": null, "recurrence": null }` cho một việc hạn 07/10 17:00
- **THEN** việc không còn hạn

#### Scenario: Thêm lặp cho việc có sẵn
- **WHEN** người dùng đặt cho "Báo cáo tuần" hạn thứ Hai 12/10 9:00 và lặp mỗi thứ Hai
- **THEN** việc có hạn đó, quy tắc hằng tuần thứ Hai và `seriesId` khác `null`

### Requirement: Hoàn thành và mở lại
`POST /api/tasks/{id}/complete` MUST chuyển việc sang `DONE`, lưu lúc hoàn thành và trả `{ task, next }`. Nếu việc có quy tắc lặp và còn lần kế tiếp (spec `recurrence`), hệ thống MUST tạo trong cùng transaction một việc `OPEN` mới cùng `seriesId`, tiêu đề, ghi chú và quy tắc, hạn là lần kế tiếp (cùng giờ địa phương với việc có giờ), và trả nó là `next`; không còn lần thì `next` là `null`. Hoàn thành một việc đã `DONE` MUST trả việc đó với `next` là `null` và không tạo gì. `POST /api/tasks/{id}/reopen` MUST đưa việc về `OPEN` và xóa lúc hoàn thành; lần kế tiếp đã tạo MUST còn nguyên (D-154). Một việc MUST sinh lần kế tiếp nhiều nhất một lần, kể cả khi được mở lại rồi hoàn thành lại (D-159).

#### Scenario: Xong việc lặp hằng tuần
- **WHEN** người dùng đánh dấu xong vào thứ Tư 07/10 việc "Báo cáo tuần" lặp mỗi thứ Hai, hạn thứ Hai 05/10 9:00
- **THEN** việc thành `DONE` và `next` là "Báo cáo tuần" `OPEN` hạn thứ Hai 12/10 9:00 cùng `seriesId`

#### Scenario: Bấm xong hai lần
- **WHEN** request hoàn thành một việc lặp được gửi lại sau khi lần đầu đã thành công
- **THEN** máy chủ trả việc `DONE` với `next` là `null` và chuỗi chỉ có một lần kế tiếp

#### Scenario: Xong, mở lại rồi xong lần nữa
- **WHEN** người dùng đánh dấu xong "Báo cáo tuần" hạn 05/10, mở lại, rồi đánh dấu xong lần nữa
- **THEN** lần xong thứ hai trả `next` là `null` và chuỗi vẫn chỉ có một lần 12/10

#### Scenario: Mở lại sau khi đã có lần kế tiếp
- **WHEN** người dùng mở lại "Báo cáo tuần" hạn 05/10 sau khi lần 12/10 đã được tạo
- **THEN** cả hai việc đều `OPEN`

### Requirement: Xóa việc
`DELETE /api/tasks/{id}` MUST xóa đúng việc đó và trả `204`. Xóa lần đang mở của một việc lặp MUST NOT xóa các lần đã xong của chuỗi.

#### Scenario: Xóa một việc
- **WHEN** người dùng xóa "Hỏi Hoàng giá in bản thiết kế"
- **THEN** máy chủ trả `204` và việc không còn trong `GET /api/tasks`

### Requirement: Chủ sở hữu, không tồn tại và sửa cùng lúc
Mọi endpoint `/api/tasks/**` MUST cần đăng nhập (`401`) và thay đổi MUST cần CSRF. Việc không tồn tại hoặc của người khác MUST trả `404 TASK_NOT_FOUND` như nhau. Hai thay đổi cùng lúc trên một việc MUST để một bên nhận `409 CONCURRENT_MODIFICATION` thay vì ghi đè lặng lẽ.

#### Scenario: Việc của người khác
- **WHEN** người dùng gọi `PATCH /api/tasks/{id}` với ID việc của một người dùng khác
- **THEN** máy chủ trả `404 TASK_NOT_FOUND`, việc đó không đổi
