## ADDED Requirements

### Requirement: Đọc cài đặt của người dùng
`GET /api/settings` MUST trả `200` với bản cài đặt của người dùng đang đăng nhập: `theme`, `dateFormat`, `motion`, `notifications` (sáu công tắc), `quietHours`, `timeZone`, `morningTime`, `defaultReminderMinutes`, `weekStart`. Khi người dùng chưa lưu gì, response MUST là giá trị mặc định (theme `SYSTEM`, `DMY`, `FULL`, các công tắc bật trừ `importantOnly`, giờ yên lặng 22:00–07:00, `Asia/Ho_Chi_Minh`, `09:00`, 15 phút, `MONDAY`) và MUST NOT ghi gì vào cơ sở dữ liệu. Người dùng chỉ đọc được cài đặt của chính mình.

#### Scenario: Chưa lưu gì
- **WHEN** người dùng mới gọi `GET /api/settings`
- **THEN** response là `200` với các giá trị mặc định và bảng `user_settings` không có dòng nào của người dùng

### Requirement: Đổi cài đặt
`PATCH /api/settings` MUST đổi đúng các trường có trong thân, giữ nguyên các trường vắng, gộp `notifications` theo từng công tắc, coi `quietHours: null` và `defaultReminderMinutes: null` là tắt, và trả `200` với bản đầy đủ sau khi đổi. Giá trị không hợp lệ hay tên trường lạ MUST là `400 VALIDATION_FAILED` với `errors` liệt kê từng trường, và MUST NOT ghi gì. Thay đổi MUST còn sau khi đăng xuất và đăng nhập lại.

#### Scenario: Tắt một công tắc
- **WHEN** người dùng gửi `PATCH /api/settings` với `{ "notifications": { "newRegistrations": false } }`
- **THEN** response có `notifications.newRegistrations` false, năm công tắc kia giữ nguyên, và `GET /api/settings` sau đó trả cùng giá trị

#### Scenario: Múi giờ không tồn tại
- **WHEN** người dùng gửi `{ "timeZone": "Asia/Hanoi_Not_A_Zone" }`
- **THEN** response là `400 VALIDATION_FAILED` với một lỗi cho `timeZone` và cài đặt không đổi

#### Scenario: Tắt giờ yên lặng
- **WHEN** người dùng gửi `{ "quietHours": null }`
- **THEN** response có `quietHours` null

### Requirement: Số liệu dữ liệu đang lưu
`GET /api/settings/storage` MUST trả `200` với `messages` (số thư và tin Sino đang lưu của mọi tài khoản của người dùng) và `bytes` (dung lượng gần đúng các dữ liệu đó trong cơ sở dữ liệu), chỉ của người dùng đang đăng nhập.

#### Scenario: Người dùng có thư đã đồng bộ
- **WHEN** người dùng có 3 tin đã lưu và gọi `GET /api/settings/storage`
- **THEN** `messages` là 3 và `bytes` lớn hơn 0

### Requirement: Màn Cài đặt dùng cài đặt đã lưu
Màn Cài đặt MUST hiện các giá trị của `GET /api/settings` và MUST ghi mỗi thay đổi bằng `PATCH /api/settings`; thay đổi MUST hiện ngay và MUST trở về như trước kèm một câu báo lỗi khi máy chủ từ chối. Theme đã lưu MUST được áp khi mở app. "Dữ liệu Sino đang lưu" MUST lấy từ `GET /api/settings/storage`.

#### Scenario: Đổi định dạng ngày rồi tải lại
- **WHEN** người dùng chọn định dạng `2026-10-02 · 14:05` rồi tải lại trang
- **THEN** ô chọn vẫn là `2026-10-02 · 14:05`

#### Scenario: Máy chủ từ chối
- **WHEN** người dùng tắt một công tắc và máy chủ trả lỗi
- **THEN** công tắc bật lại và dưới dòng đó có câu báo không lưu được
