## Why

Việc cần làm là màn đầu của Phase 4 (F16 "Việc cần làm + nhắc nhở": "trang Việc cần làm (Quá hạn/Hôm nay/Sắp tới/Không có hạn/Đã xong)"), phạm vi đã chốt ở `openspec/changes/planner-from-messages` (D-25 dữ liệu nằm trong Sino, D-27 task kiểu gọn). Trong lúc chờ backend F05 (BE-44, BE-45), người dùng chọn dựng UI của Việc cần làm và Lịch (2026-10-09). Theo cách làm D-42, màn được dựng trước với dữ liệu mẫu; kiểu dữ liệu của màn là hợp đồng giao backend cho `GET /api/tasks` của F16.

## What Changes

- **Trang `/tasks`** theo canvas `Tasks` (desktop) và `MobileTasks`: đầu trang với số việc đang mở, quá hạn, tạo từ tin nhắn; lọc Tất cả / Từ tin nhắn / Lặp lại; ô "Thêm việc mới"; các nhóm Quá hạn, Hôm nay, Sắp tới, Không có hạn, Đã xong; mỗi việc có ô đánh dấu xong, tiêu đề, hạn, nhắc nhở, lặp lại, nguồn (nhà cung cấp + người/cuộc trò chuyện).
- **Chi tiết một việc** (`/tasks/:taskId`): cột phải từ 1280 px (canvas `Tasks`, khối "Chi tiết việc"): hạn, nhắc, lặp lại, tạo lúc, tin nhắn gốc (mở Hộp thư), ghi chú, liên quan, "Đánh dấu xong"; dưới 1280 px là trang riêng.
- **Tương tác trên dữ liệu mẫu** (như D-45): thêm việc bằng tiêu đề, đánh dấu xong / mở lại (việc lặp tạo lần kế tiếp), sửa ghi chú, lọc (giữ trong URL); số "Việc cần làm" trên điều hướng đi theo danh sách.
- **Trạng thái:** đang tải, không tải được, chưa có việc nào.
- **Hợp đồng dữ liệu** `TasksData`, `TaskItem` cùng bảng đối chiếu với API trong `design.md`.

## Capabilities

### New Capabilities
- `tasks-screen`: danh sách việc theo nhóm, lọc, thêm, đánh dấu xong / mở lại, chi tiết và ghi chú trên dữ liệu mẫu, các trạng thái.

### Modified Capabilities
- Không có.

## Impact

- Code: `apps/sino-web/src/features/tasks/**`, `src/app/router.tsx`, `src/app/shell/{navItems.ts,shell.sample.ts}` (nghĩa của số "Việc cần làm", D-83), có thể `src/shared/**`, `src/test/renderApp.tsx`.
- Không đổi backend, không gọi API.

## Non-goals

- Sửa hạn, nhắc nhở, lặp lại; xóa việc; "Thêm thao tác": change sau (canvas `Tasks` không vẽ bộ chọn; các bộ chọn của Phase 4 nằm ở canvas `InboxTask`, `InboxRemind`). Nút hiện như canvas nhưng chưa làm gì (D-80).
- Tạo task / "Nhắc tôi" từ một tin nhắn trong Hộp thư: change thao tác trên thư (D-52).
- Thông báo khi tới giờ nhắc (F13, F14).
- Màn Lịch: change riêng `fe-ui-calendar`, ngay sau change này.
- Nghiệm thu và archive: để sau như các màn trước.
