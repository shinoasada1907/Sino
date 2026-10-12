## Why

Màn Việc cần làm và Lịch đã dựng xong với dữ liệu mẫu (`fe-ui-tasks`, `fe-ui-calendar`, 2026-10-09) nhưng backend chưa có gì: việc thêm vào mất khi tải lại, Lịch không tạo được lịch hẹn. Người dùng muốn bắt đầu phần này ngay, chạy song song với phần Gmail đang làm ở phiên khác (2026-10-12: "làm song song luôn đi… 2 cái này chưa ăn nhập gì hết, khi nào xong gmail sẽ có 1 số tính năng liên quan đến lịch và todo"). Change này gộp phần lõi của **F16 — Việc cần làm** và **F17 — Lịch** (Phase 4 của roadmap), đứng độc lập với tin nhắn; nhắc nhở và các thao tác gắn tin nhắn làm ở đợt sau.

## What Changes

- **Module mới `planner`** (theo D-29 của `planner-from-messages`): bảng `task` và `calendar_event`, quy tắc lặp nằm ngay trong hàng (D-152), JPA có `@Version` (D-156).
- **Việc cần làm (F16, không nhắc nhở):** tạo việc (có hoặc không có hạn; hạn là thời điểm hoặc cả ngày), sửa tiêu đề và ghi chú, đặt lại hạn và quy tắc lặp (D-153), đánh dấu xong / mở lại, xóa. Việc lặp xong thì máy chủ tạo lần kế tiếp theo hạn trên lịch; mở lại không xóa lần kế tiếp (D-154). API `GET/POST /api/tasks`, `PATCH/DELETE /api/tasks/{id}`, `PUT /api/tasks/{id}/schedule`, `POST /api/tasks/{id}/complete`, `/reopen`.
- **Lịch (F17, không nhắc nhở):** lịch hẹn có giờ hoặc cả ngày, có địa điểm, ghi chú, quy tắc lặp; sửa và xóa luôn áp cho cả chuỗi (D-151). `GET /api/calendar?from=&to=` (tối đa 62 ngày, D-155) trả từng lần của lịch hẹn, việc có hạn trong khoảng (cả lần sắp tới của việc lặp, cả việc quá hạn từ trước khi khoảng chứa hôm nay) và `reminders: []`.
- **Lặp lại:** hằng ngày / tuần (các thứ chọn) / tháng (ngày gốc) / năm, mỗi N lần, dừng theo ngày hoặc số lần; `RecurrenceCalculator` tính theo múi giờ của quy tắc, chỉ sinh các lần trong khoảng hỏi (spec `recurrence`).
- **Múi giờ:** cấu hình `sino.planner.time-zone` (mặc định `Asia/Ho_Chi_Minh`), mỗi hàng có lặp lưu múi giờ của nó (D-157).
- **Web:** hai màn chuyển từ dữ liệu mẫu sang API (chỉ thay thân hàm `*.api.ts` + adapter, như Hộp thư); biểu mẫu việc và lịch hẹn theo lớp phủ `InboxTask` / `InboxEvent` của canvas, bỏ phần nhắc và liên kết thư (D-158); nút "Sửa", "Xóa task", "Lịch hẹn" / "Thêm lịch hẹn", "Xóa lịch hẹn" có chức năng; phần chưa có dữ liệu (nhắc, tin nhắn gốc, liên quan) không hiện.

## Capabilities

### New Capabilities
- `tasks`: việc cần làm của người dùng: dữ liệu, tạo, sửa, đặt hạn và lặp, xong / mở lại, việc lặp, xóa, danh sách, API `/api/tasks`.
- `calendar`: lịch hẹn cá nhân (tạo, sửa, xóa cả chuỗi) và xem lịch theo khoảng ngày gộp lịch hẹn và việc có hạn, API `/api/events`, `/api/calendar`.
- `recurrence`: quy tắc lặp dùng chung cho việc và lịch hẹn: các dạng, ràng buộc, cách tính lần kế tiếp và các lần trong một khoảng, múi giờ.

### Modified Capabilities
- `module-boundaries`: thêm business module `planner`.
- `tasks-screen` (của `fe-ui-tasks`): màn Việc cần làm chạy trên API, có biểu mẫu sửa hạn / lặp và xóa; nhắc nhở và tin nhắn gốc không hiện khi chưa có.
- `calendar-screen` (của `fe-ui-calendar`): màn Lịch chạy trên API, tạo / sửa / xóa lịch hẹn.

## Impact

- Code backend: package mới `dev/sino/planner/**` (`api`, `application`, `domain`, `infrastructure`); `application.yaml` (`sino.planner.time-zone`); không sửa module nào khác.
- Migration: V18 `planner_create_task`, V19 `planner_create_calendar_event` (đã thống nhất với phiên sino-api-27: F10 giữ V17 và lên `dev` trước).
- API mới: `/api/tasks/**`, `/api/events/**`, `/api/calendar`. Lỗi: mã sẵn có `VALIDATION_FAILED` (400), `CONCURRENT_MODIFICATION` (409); mã mới của module `TASK_NOT_FOUND`, `EVENT_NOT_FOUND` (404), `INVALID_RECURRENCE` (422).
- Code web: `apps/sino-web/src/features/tasks/**`, `features/calendar/**` (adapter API, biểu mẫu, MSW cho test); dữ liệu mẫu ở lại cho test.
- Tài liệu: `docs/knowledge/phase-4-planner.md` + `.docx` (mới); `apps/sino-api/README.md` (API mới); `openspec/roadmap.md` (ghi chú Phase 4).
- Thứ tự archive: sau `fe-ui-tasks` và `fe-ui-calendar` (delta `tasks-screen`, `calendar-screen` sửa spec của hai change đó).

## Non-goals

- **Nhắc nhở** (bảng `reminder`), **F13 — Scheduler**, **F14 — Thông báo / Web Push**: đợt sau (người dùng 2026-10-12: "Để sau"). API trả `reminder: null`, `reminders: []`.
- **Gắn với tin nhắn:** tạo việc / lịch hẹn từ thư, "Nhắc tôi", thẻ "Tin nhắn gốc", "Liên quan", nhãn nguồn: sau khi phần Gmail xong. API trả `source: null`, `related: null`; cột `source_*` chưa có trong bảng.
- Sửa hay xóa **một lần** của lịch hẹn lặp ("chỉ lần này", "lần này và các lần sau"): sau, bằng bảng ngoại lệ thêm vào (D-151).
- Ghi chú (F15), tạm ẩn cuộc trò chuyện, hẹn giờ gửi.
- Khối "Hôm nay" của Tổng quan và số trên thanh bên ngoài mục "Việc cần làm": vẫn là dữ liệu mẫu.
- Kéo thả trên lịch, mời người khác, đồng bộ Google Calendar / Google Tasks (D-25).
- Nhiều người dùng, múi giờ theo hồ sơ người dùng (vẫn một cấu hình).
