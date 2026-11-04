## Why

Người dùng (2026-11-04): "xây dựng quang profile người dùng" (xây dựng trang profile người dùng). Hiện tại hệ thống chưa có màn hình Hồ sơ cá nhân (`/profile`) riêng biệt để người dùng xem thông tin tài khoản, cập nhật tên/ảnh đại diện, đổi mật khẩu và quản lý các phiên đăng nhập.

## What Changes

- **Trang `/profile`** mới trong `apps/sino-web`:
  - **Thông tin cá nhân (Profile Information):** Ảnh đại diện (Avatar) với nút đổi ảnh xem trước, Họ tên (`displayName`), Email (`email`), Số điện thoại, Vai trò/Chức danh, Giới thiệu (Bio), nút Lưu thay đổi (lưu vào mock/query state).
  - **Bảo mật & Mật khẩu (Security & Password):** Đổi mật khẩu (Mật khẩu hiện tại, Mật khẩu mới, Xác nhận mật khẩu), trạng thái 2FA mẫu.
  - **Tài khoản liên kết (Connected Accounts):** Danh sách nguồn kết nối (Google, Zalo) đồng bộ với tài khoản hiện có trong Sino.
  - **Thiết bị & Phiên hoạt động (Active Sessions):** Danh sách các thiết bị/phiên đang đăng nhập Sino.
- **Điều hướng:**
  - Route `/profile` đăng ký trong `router.tsx` dưới `RequireAuth` + `AppShell`.
  - `UserMenu.tsx` (menu khi bấm vào Avatar ở Topbar và Sidebar rail) bổ sung mục "Hồ sơ cá nhân" dẫn tới `/profile`.
- **Dữ liệu:** Dựng trên dữ liệu mẫu `profile.sample.ts` và TanStack Query hook `useProfile.ts` để lưu tạm các chỉnh sửa, hỗ trợ hoàn thiện giao diện trước khi nối backend API.

## Capabilities

### New Capabilities
- `user-profile-screen`: Màn hình Hồ sơ người dùng `/profile` trên Desktop, Tablet và Mobile; form cập nhật thông tin cá nhân; form đổi mật khẩu; danh sách tài khoản liên kết và phiên đăng nhập; mục điều hướng trong UserMenu.

### Modified Capabilities
- Không có.

## Impact

- **Code:** `apps/sino-web/src/features/profile/**` (mới), `src/app/router.tsx` (route `/profile`), `src/app/shell/UserMenu.tsx` (liên kết tới `/profile`).
- Không ảnh hưởng backend, không gọi API mới ngoài những endpoint có sẵn.

## Non-goals

- API backend thực tế lưu vào DB cho đổi mật khẩu / cập nhật thông tin profile (sẽ tích hợp khi `sino-api` có endpoint).

