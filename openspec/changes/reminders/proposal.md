## Why

Người dùng (2026-11-18): "phần mà lịch thì phải có nhắc hẹn nhỉ thì cái này chắc gửi mail", rồi "thêm tính năng gửi mail nhắc hẹn". Lịch hẹn và việc có hạn đã có (`f16-f17-tasks-calendar`, BE-71…BE-74) nhưng ô `reminder` của API luôn `null`: tới giờ không có gì nhắc người dùng.

Các lựa chọn người dùng đã chốt trong chat cùng ngày:

- Gửi mail tới **email trong hồ sơ Sino** của người dùng (`app_user.email`).
- Bên gửi là **một tài khoản Google riêng của Sino**, gửi bằng **OAuth2** (Gmail API), không SMTP mật khẩu ("SMTP không an toàn").
- Mỗi lịch hẹn / việc **một nhắc, chọn sẵn** (Không, Đúng giờ, 5/15/30 phút, 1 giờ, 1 ngày trước; cả ngày: 9:00 hôm đó / 9:00 hôm trước). Lịch lặp nhắc mỗi lần.
- Kênh đợt này: **email + chuông trong app**. Web Push để F14.
- Áp cho **cả lịch hẹn và việc**.
- Hẹn giờ bằng **background job** (phần 1 của thiết kế, người dùng duyệt "được làm với BE đi").

## What Changes

- **Đổi D-26** (`planner-from-messages`): nhắc nhở thêm kênh email, gửi từ tài khoản của Sino (không qua tài khoản provider của người dùng, nên không lẫn với thư thật) — D-520.
- `sino-api`:
  - Lịch hẹn và việc nhận và trả `reminder` (số phút trước lúc bắt đầu / hạn) — D-523.
  - Hàng đợi background job trên PostgreSQL: mỗi chuỗi có nhắc giữ đúng một job hẹn vào giờ nhắc của lần sắp tới; tạo / sửa / xóa / xong việc thì hẹn lại hoặc hủy; job chạy xong tự hẹn lần lặp kế tiếp — D-521, D-522.
  - Khi tới giờ: ghi `reminder_delivery` (chống trùng), gửi mail qua Gmail API của tài khoản Sino, đẩy sự kiện `reminder.due` qua SSE; `GET /api/reminders` cho chuông — D-524…D-527.
  - `GET /api/calendar` trả `reminders` và `reminder.state` thật.
- `sino-web` (đợt sau, không thuộc phần BE này): ô "Nhắc" trong biểu mẫu lịch hẹn (FE-73) và biểu mẫu việc; chuông hiện nhắc hẹn.

## Capabilities

### New Capabilities
- `reminders`: nhắc người dùng trước một lịch hẹn hay hạn của một việc, qua email và trong app.

### Modified Capabilities
- Không đổi spec chính đang chạy (spec `calendar`, `tasks` còn nằm trong `f16-f17-tasks-calendar` chưa archive); ô `reminder` của các API đó đã có trong hợp đồng, nay mới có giá trị.

## Impact

- `apps/sino-api`: module `planner` (lịch hẹn, việc, job nhắc), module mới `mail` (gửi thư hệ thống qua Gmail API), `realtime` (sự kiện mới), migration `V33` (hoặc số kế tiếp còn trống), `pom.xml` (thư viện job, D-521), `.env.example`, README.
- Cấu hình mới (secret trong `.env`): client id / secret / refresh token của tài khoản Google gửi thư, địa chỉ gửi.
- Người dùng cần tạo tài khoản Google của Sino và cấp quyền `gmail.send` một lần (hướng dẫn trong README).

## Non-goals

- Web Push, app mobile (F14).
- Nhiều nhắc cho một lịch hẹn (D-27 giữ: một nhắc).
- Nhắc "chỉ lần này" của một lần trong chuỗi lặp.
- Hẹn giờ gửi thư (F10): dùng lại hàng đợi job được, nhưng không làm ở đây.
- Mẫu mail HTML cầu kỳ, theo dõi mở thư.
