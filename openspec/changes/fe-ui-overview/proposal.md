## Why

Người dùng (chủ sản phẩm) đổi cách làm frontend ngày 2026-10-07: **dựng giao diện trước với dữ liệu mẫu**, từng màn một, rồi mang "template" của màn (kiểu dữ liệu nó cần) sang backend để chỉnh hoặc làm API cho khớp (D-42). Màn đầu tiên là **Tổng quan** (D-43), và trong lúc dựng UI thì web **chưa có xác thực** (D-44). Lý do: nhìn thấy và bấm thử được sản phẩm sớm, và để API được thiết kế theo đúng thứ giao diện cần thay vì đoán trước.

Nền móng FE-01 (token theo canvas, sáng/tối, component cơ bản, test, CI) đã có, nên change này chỉ việc dựng khung app và màn Tổng quan lên trên.

## What Changes

- **Khung app** dùng chung cho mọi màn, theo canvas "Sino UI" và `Breakpoints`: `Sidebar` 248px (desktop ≥ 1280px), `Rail` 72px (tablet 768–1279px), `TabBar` dưới đáy (mobile < 768px); thanh trên cùng theo từng kích thước (ô tìm kiếm trên desktop; tên trang và icon trên tablet, mobile); các nút đúng như artboard (nút đổi sáng/tối trên desktop, nút ngôn ngữ "VI" chưa có chức năng).
- **Router** (React Router): `/` → `/overview`; mỗi mục điều hướng có một đường dẫn; màn chưa dựng hiện trang "Màn này đang được dựng" trong khung app; đường dẫn lạ hiện trang 404 theo `SiteNotFound`.
- **Màn Tổng quan** (`/overview`): phần đầu trang (ngày giờ, lời chào, tóm tắt tình trạng tài khoản, hai nút) và 7 thẻ của canvas: Hộp thư hợp nhất, Hôm nay, Tài khoản, Dịch vụ (đồng bộ 24 giờ), Đăng ký, Hoạt động gần đây, Lối tắt; lưới 12 cột → 2 cột → 1 cột.
- **Hợp đồng dữ liệu**: kiểu TypeScript `OverviewData` mô tả dữ liệu màn cần, file dữ liệu mẫu theo đúng kiểu đó, hook `useOverview()` trả dữ liệu mẫu (sau này đổi ruột sang gọi API, component không đổi). `design.md` có bảng đối chiếu với API hiện có: trường đã có, cần thêm, API mới. Đây là template giao backend.
- Change `fe-f01-web-foundation`: FE-02…FE-05 (API client, đăng nhập, khung app có xác thực, nghiệm thu) **tạm hoãn**, ghi lý do tại `tasks.md` của change đó; khung app của change này sẽ được FE-04 dùng lại.

## Capabilities

### New Capabilities
- `web-app-shell`: khung app co giãn theo kích thước màn hình, điều hướng chính, trang "đang được dựng", trang 404.
- `overview-screen`: màn Tổng quan với dữ liệu mẫu theo hợp đồng dữ liệu `OverviewData`.

### Modified Capabilities
- Không có (capability `web-app-foundation` của `fe-f01-web-foundation` chưa archive; xem phần tạm hoãn ở trên).

## Impact

- Code: `apps/sino-web/src/app/**` (router, khung app, trang đang dựng, 404), `apps/sino-web/src/features/overview/**`; trang tạm của FE-01 (`src/app/App.tsx`) bị thay.
- Không đổi backend, không gọi API. Backend sau này dùng bảng đối chiếu trong `design.md` để làm hoặc chỉnh API (một change backend riêng khi người dùng quyết).
- Không thêm dependency (React Router, TanStack Query, lucide-react đã có từ FE-01).
- Roadmap: ghi D-42 (UI trước) thay cho luật "vertical slice BE + FE từ F04" ở phần frontend, và D-43 (Tổng quan, màn vượt MVP, vào phạm vi).

## Non-goals

- Đăng nhập, chặn trang, gọi API thật, API client (D-44; FE-02…FE-05 của change 1, tạm hoãn).
- Các nút hành động thật: "Đồng bộ ngay", "Kết nối tài khoản", "Đăng nhập lại", "Xem lại", lối tắt bàn phím, ô tìm kiếm. Chúng hiện đúng như canvas nhưng chưa làm gì; chỉ nút dẫn tới màn khác ("Mở hộp thư", "Mở lịch", "Xem tất cả") là mở trang tương ứng.
- Các màn khác (Hộp thư, Lịch, Việc, Ghi chú, Tài khoản, Dịch vụ, Đăng ký, Cài đặt, Thông báo, Thêm): mỗi màn một change sau (D-42); lần này chỉ có trang "đang được dựng".
- Đa ngôn ngữ (nút "VI" ẩn), cập nhật dữ liệu theo thời gian thực.
