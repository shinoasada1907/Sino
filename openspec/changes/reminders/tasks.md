# Tasks — reminders

> **Mode:** chờ người dùng chọn khi duyệt (`new_features: TRAINING` trong `project-mode.yaml`; các change gần đây người dùng chọn AUTO). Đợt này **chỉ backend** (người dùng: "được làm với BE đi"); web ở mục 3, làm sau.
> **Thứ tự:** RM-00 → RM-01 → RM-02 → RM-03; RM-04 (mail) song song được sau RM-00; RM-05 sau RM-01. Migration: `V33` hoặc số kế tiếp còn trống lúc làm (hỏi quản lý).
> **Test:** test tay trước (curl, DB, log), test tự động sau (`CLAUDE.md`). Hand test trên bản sao DB, worktree riêng, cổng 8091.

## 1. Nền

- [ ] 1.1 **RM-00 — Spike: thư viện background job (D-521)** · sino-api
  - **Việc:** trong worktree vứt đi, thêm JobRunr (rồi db-scheduler nếu cần) với Spring Boot 4 / Java 25 / PostgreSQL 18: hẹn một job 30 giây, khởi động lại app giữa chừng, job chạy bù; job ném lỗi thì thử lại; hai instance không chạy trùng; tắt tự tạo schema được không; tắt dashboard.
  - **Đầu ra:** câu trả lời ghi ở đây (thư viện + phiên bản, hoặc đường lùi bảng tự viết), không giữ code.

- [ ] 1.2 **RM-01 — Ô `reminder` của lịch hẹn và việc (D-523)** · sino-api
  - **Files:** migration (cột `reminder_offset_minutes`, bảng `reminder_delivery`, bảng của thư viện job), `planner/domain` (`Reminder`, giờ nhắc của một lần), `EventRequest/TaskRequest`, `EventResponse/TaskResponse`, test, README.
  - **Acceptance:** spec *Đặt nhắc cho lịch hẹn và việc*.

## 2. Hẹn giờ và gửi

- [ ] 2.1 **RM-02 — Hẹn và hủy job nhắc (D-522)** · sino-api
  - **Files:** `planner/application/reminder/ReminderScheduler`, sự kiện thay đổi của `planner`, lệnh dọn hẹn job còn thiếu, test.
  - **Acceptance:** spec *Nhắc theo dữ liệu mới nhất* (phần hẹn / hủy).

- [ ] 2.2 **RM-03 — Job nhắc chạy: ghi, SSE, mail, lần kế tiếp (D-524, D-527)** · sino-api
  - **Files:** `ReminderJob`, `reminder_delivery` repository, sự kiện `reminder.due` trong `realtime`, `GET /api/reminders`, `POST /api/reminders/{id}/read`, `POST /api/reminders/read-all`, test.
  - **Acceptance:** spec *Nhắc đúng giờ qua chuông và email*, *Danh sách nhắc cho chuông*, *Nhắc theo dữ liệu mới nhất*.

- [ ] 2.3 **RM-04 — Module `mail`: gửi thư hệ thống qua Gmail API OAuth2 (D-525, D-526)** · sino-api
  - **Files:** `mail/SystemMailSender` (cổng), hiện thực Gmail API + làm mới access token, bản giả cho test, cấu hình `SINO_MAIL_*`, `.env.example`, README (lấy refresh token, consent screen "In production").
  - **Test tay:** gửi một thư thật tới một địa chỉ của người dùng khi có cấu hình; thiếu cấu hình thì app vẫn chạy, `DISABLED`.

- [ ] 2.4 **RM-05 — `reminders` và `reminder.state` trong `GET /api/calendar`** · sino-api
  - **Acceptance:** `CalendarData.reminders` có nhắc của việc trong khoảng; `reminder` của lịch hẹn có `at`, `state` thật.

## 3. Web (đợt sau, chưa giao)

- [ ] 3.1 **RM-W1 — Ô "Nhắc" trong biểu mẫu lịch hẹn (cùng FE-73) và biểu mẫu việc** · frontend
- [ ] 3.2 **RM-W2 — Chuông hiện nhắc hẹn (`GET /api/reminders`, `reminder.due`)** · frontend

## 4. Nghiệm thu

- [ ] 4.1 **ACC-BE — Chạy thật phần backend** theo Definition of Done của `design.md`, kèm một thư thật tới email hồ sơ.
- [ ] 4.2 Sửa D-26 trong `planner-from-messages` (ghi chú trỏ tới D-520); archive change khi xong cả web.
