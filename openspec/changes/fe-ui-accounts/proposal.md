## Why

Màn thứ hai của cách làm "giao diện trước với dữ liệu mẫu" (D-42): **Tài khoản**. Backend đã có `GET/PATCH/DELETE /api/accounts` và `GET /api/providers`, nên hợp đồng dữ liệu của màn này phần lớn là "đã có", và đây cũng là màn roadmap đặt cho Phase 1 (F02-FE). Màn Tài khoản cũng là chỗ luồng "Kết nối tài khoản" (BE-31, F04a) sẽ gắn vào sau.

## What Changes

- **Danh sách tài khoản** `/accounts` theo canvas `Accounts` (desktop, tablet) và `MobileAccounts`: đầu trang, dải tóm tắt (ổn định / đang đồng bộ / cần đăng nhập lại, lần đồng bộ gần nhất, số thư đã lưu), cảnh báo tài khoản cần đăng nhập lại, tìm kiếm không phân biệt dấu, bộ lọc "Tất cả / Cần xử lý", bảng tài khoản (danh tính, nhà cung cấp, đồng bộ, lần cuối, số dịch vụ đang bật, sức khỏe); trên mobile là danh sách gọn.
- **Chi tiết tài khoản** `/accounts/:id` theo `AccountDetail` và `MobileAccountDetail`: kênh đã kết nối (bật/tắt), quyền đã cấp, website dùng danh tính này, lịch sử đồng bộ, hoạt động, vùng "Ngắt kết nối" với hộp thoại xác nhận theo `Overlays` ("Ngắt kết nối …?", tùy chọn "Xóa luôn tin nhắn đã lưu").
- **Tương tác chạy trên dữ liệu mẫu** (D-45): tìm, lọc, mở chi tiết, bật/tắt kênh, ngắt kết nối. Thay đổi nằm trong bộ nhớ (cache TanStack Query), tải lại trang là về như cũ; khi nối API chỉ thay thân các hàm sang `PATCH`/`DELETE`.
- **Khung app**: tab "Thêm" của mobile sáng cho các màn nằm dưới "Thêm"; route khai báo được "trang con trên mobile" (trang tự vẽ đầu trang có nút quay lại, khung app ẩn thanh trên của mobile) và ẩn thanh dưới; component `Dialog` theo `.modal` của canvas.
- **Hợp đồng dữ liệu** `AccountsData`, `AccountDetailData` cùng bảng đối chiếu với API trong `design.md`.

## Capabilities

### New Capabilities
- `accounts-screen`: danh sách và chi tiết tài khoản với dữ liệu mẫu, tìm, lọc, bật/tắt kênh, ngắt kết nối.

### Modified Capabilities
- Không có. Phần khung app (tab "Thêm", trang con trên mobile) được thêm vào capability `web-app-shell` dưới dạng requirement mới (ADDED); capability này ra đời ở `fe-ui-overview`, chưa archive, nên archive `fe-ui-overview` trước.

## Impact

- Code: `apps/sino-web/src/features/accounts/**`, `src/app/router.tsx`, `src/app/shell/{AppShell,TabBar,Topbar,navItems}.tsx`, `src/app/shell/MobilePageHeader.tsx`, `src/shared/ui/dialog.tsx`.
- Không đổi backend, không gọi API. Bảng đối chiếu trong `design.md` liệt kê thứ backend cần thêm (hạn quyền, số thư đã lưu, bật/tắt từng kênh qua `PATCH`, tùy chọn xóa tin khi `DELETE`, quyền đã cấp, lịch sử đồng bộ, website dùng danh tính, hoạt động).
- Dependency: thêm component Dialog của shadcn (dùng gói `radix-ui` đã có).

## Non-goals

- Luồng "Kết nối tài khoản" (`ConnectWizard`, 5 bước) và "Đăng nhập lại": một change riêng, làm cùng BE-31 (D-46). Các nút này hiện như canvas nhưng chưa làm gì; "Đồng bộ tất cả", "Đồng bộ ngay", "Mở Gmail", "Xem lại", "Xem tất cả" (website) cũng vậy.
- Đổi tên tài khoản: canvas không có ô đổi tên (canvas là thiết kế cuối cùng), dù roadmap F02-FE từng ghi.
- Nhóm "Hiển thị" của `MobileAccountDetail` ("Hiện trong Hộp thư", "Thông báo tin mới"): chưa có trong hợp đồng (thông báo là F14); để màn Cài đặt hoặc change sau.
- Nghiệm thu và archive (AC-05) để sau, theo ý người dùng.
