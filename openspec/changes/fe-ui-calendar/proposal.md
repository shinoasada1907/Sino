## Why

Lịch là màn thứ hai của Phase 4 (F17 "Lịch": "màn Lịch (Tuần/Tháng/Lịch trình)"), phạm vi đã chốt ở `openspec/changes/planner-from-messages` (D-25 dữ liệu trong Sino, spec `calendar`: một khoảng thời gian gồm lịch hẹn và các lần lặp, task có hạn, nhắc nhở). Người dùng chọn dựng UI của Việc cần làm và Lịch trong lúc chờ backend F05 (2026-10-09); màn Việc cần làm đã xong (`fe-ui-tasks`). Theo cách làm D-42, màn được dựng trước với dữ liệu mẫu; kiểu dữ liệu của màn là hợp đồng giao backend cho `GET /api/calendar?from=&to=` của F17.

## What Changes

- **Trang `/calendar`** theo canvas `Calendar` (desktop, ba chế độ) và `MobileCalendar`: đầu trang (dòng nhỏ và tiêu đề theo chế độ: "TUẦN 40 · 2026" / "28/09 – 04/10"…), "Hôm nay", khoảng trước / sau, chọn Tuần / Tháng / Lịch trình, nút "Lịch hẹn", chú giải và múi giờ.
- **Tuần:** dải ngày, hàng "cả ngày", lưới giờ (lịch hẹn là khối theo giờ, task có hạn là chip, nhắc nhở là dấu nhỏ), vạch "bây giờ".
- **Tháng:** lưới các tuần của tháng, mỗi ngày liệt kê mục theo giờ.
- **Lịch trình:** từ hôm nay, nhóm theo ngày, mỗi mục có giờ, tiêu đề, nguồn, và ghi chú bên phải (quá hạn, đã xong, đã báo, "sau 2 giờ", địa điểm, quy tắc lặp, giờ nhắc).
- **Chi tiết lịch hẹn** (`/calendar/:itemId`): cột phải từ 1280 px; dưới 1280 px là trang riêng. Task và nhắc nhở mở màn Việc cần làm.
- **Mobile** (`MobileCalendar`): lịch trình với dải tuần.
- **Trạng thái:** đang tải, không tải được.
- **Hợp đồng dữ liệu** `CalendarData` cùng bảng đối chiếu với API trong `design.md`.

## Capabilities

### New Capabilities
- `calendar-screen`: lịch theo tuần, tháng, lịch trình; đi tới khoảng khác; chi tiết lịch hẹn; trên dữ liệu mẫu; các trạng thái.

### Modified Capabilities
- Không có.

## Impact

- Code: `apps/sino-web/src/features/calendar/**`, `src/app/router.tsx`, `src/features/tasks/tasks.sample.ts` (hạn của "Gửi lại hóa đơn tháng 9" có giờ, như canvas Lịch), có thể `src/shared/**`, `src/test/renderApp.tsx`.
- Không đổi backend, không gọi API.

## Non-goals

- Tạo, sửa, xóa lịch hẹn ("Lịch hẹn", "Sửa", "Xóa lịch hẹn", "Thêm thao tác"): change sau cùng bộ chọn ngày giờ của Phase 4 (canvas `InboxEvent`). Nút hiện như canvas nhưng chưa làm gì (D-85).
- Kéo thả, đổi giờ trên lưới; xem theo ngày; lịch của người khác; đồng bộ lịch ngoài (D-25).
- Đánh dấu xong task ngay trên lịch: mở màn Việc cần làm.
- Nghiệm thu và archive: để sau như các màn trước.
