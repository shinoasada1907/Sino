# Thiết kế Màn Hồ sơ người dùng (`fe-ui-profile`)

## Bối cảnh và quyết định

### D-420 — Địa chỉ và vị trí trên Shell
- Trang Profile nằm ở `/profile`.
- Bọc trong `RequireAuth` và `AppShell` như các màn hình khác (`/overview`, `/settings`, `/accounts`).
- `handle: { mobilePageHeader: true }` để hiển thị tiêu đề "Hồ sơ cá nhân" trên Mobile.
- Menu người dùng (`UserMenu.tsx`) thêm một mục đầu tiên: "Hồ sơ cá nhân" (icon `User`) dẫn tới `/profile`.

### D-421 — Bố cục giao diện (Layout)
- Phong cách nhất quán với Sino UI (nền `bg-background`, các khối bo góc `rounded-xl`, viền `border border-border`, thẻ card `bg-card`).
- Phần đầu trang: Header với banner/card tóm tắt người dùng (Avatar lớn, Tên hiển thị, Email, Badge trạng thái tài khoản, thời gian tham gia).
- Thân trang chia thành 2 cột trên Desktop (hoặc lưới 1 cột trên Mobile/Tablet):
  - Cột chính (trái): Thông tin cá nhân & Form chỉnh sửa, Đổi mật khẩu.
  - Cột phụ (phải): Tài khoản liên kết, Thiết bị & Phiên hoạt động, Tóm tắt bảo mật.

### D-422 — Tầng dữ liệu mẫu & State Management
- `profile.sample.ts`: Dữ liệu mẫu khởi tạo gồm thông tin cơ bản kế thừa từ `useMe()` (hoặc giá trị mặc định "Đại Quản Gia", "admin@daiquangia.io.vn"), số điện thoại, bio, phiên hoạt động, trạng thái 2FA.
- `useProfile.ts`: Quản lý query `['profile']` và mutation `updateProfile`, `changePassword` thông qua TanStack Query cache để người dùng có thể thao tác chỉnh sửa trực quan trên giao diện ngay lập tức mà không reload.

### D-423 — Thiết bị di động (Mobile Responsive)
- Tại breakpoint `< 768px`: chuyển về 1 cột dọc mượt mà, các nút bấm tối ưu cho cảm ứng, có `mobilePageHeader: true` và `MobilePageHeader`.

