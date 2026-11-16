## Why

Người dùng (2026-11-04): "bổ sung tính năng quản lý hồ sơ", chọn làm thật (backend + nối web), AUTO. Màn `/profile` của `fe-ui-profile` (ANTIGRAVITY) đã dựng xong trên dữ liệu mẫu: sửa tên, số điện thoại hay ảnh chỉ đổi cache của trình duyệt, tải lại là mất. `sino-api` chưa có gì cho hồ sơ: `app_user` chỉ có `email` và `display_name`, `/api/auth/me` trả đúng hai trường đó, và mỗi lần khởi động `OwnerProvisioner` ghi đè `display_name` bằng `SINO_OWNER_DISPLAY_NAME`.

Người dùng chọn tách quản lý hồ sơ thành ba phần (D-475). Change này là **phần 1: thông tin cá nhân và ảnh đại diện**. Phần 2 (đổi mật khẩu, chuyển mật khẩu vào DB) và phần 3 (phiên đăng nhập) là hai change riêng, duyệt riêng; 2FA để sau nữa.

## What Changes

- **`sino-api`, module `identity`:**
  - Migration mới: các trường hồ sơ (số điện thoại, chức danh, giới thiệu, nơi ở) và ảnh đại diện `bytea` trong bảng riêng, như `sticker_content` (D-477, DN-1).
  - `GET /api/profile`, `PATCH /api/profile`: đọc và sửa họ tên, số điện thoại, chức danh, giới thiệu, nơi ở. Email, vai trò, ngày tham gia chỉ đọc (D-478).
  - `PUT /api/profile/avatar` (multipart), `GET /api/profile/avatar` (ảnh, có `ETag`), `DELETE /api/profile/avatar`. Web gửi ảnh đã cắt vuông và thu nhỏ; máy chủ nhận tối đa 1 MB, kiểm đúng là ảnh PNG, JPEG hay WebP (D-477).
  - `GET /api/auth/me` trả thêm `avatarUrl` (thêm trường, không đổi trường cũ), để thanh trên và menu người dùng hiện ảnh thật.
  - **BREAKING (hành vi khởi động):** `SINO_OWNER_DISPLAY_NAME` chỉ đặt tên khi tạo owner lần đầu; sau đó tên do web sửa, khởi động lại không ghi đè (D-476).
- **`sino-web`, `features/profile`:**
  - `useProfile` đọc và lưu qua API thật cho khối Thông tin cá nhân và ảnh; lỗi kiểm tra của máy chủ hiện đúng ô.
  - Hộp đổi ảnh: chọn tệp ảnh, cắt vuông, thu về 256×256 trên trình duyệt rồi gửi; "Xóa ảnh". Bỏ ô nhập URL ảnh.
  - Thanh trên và menu người dùng dùng `avatarUrl` của `/api/auth/me`.
  - Khối Đổi mật khẩu, Phiên đăng nhập và thẻ 2FA **giữ nguyên** dữ liệu mẫu, có nhãn "Sắp có" cho tới phần 2 và 3 (D-479).

## Capabilities

### New Capabilities
- `user-profile-api`: hồ sơ của owner qua `/api/profile` (đọc, sửa, ảnh đại diện).

### Modified Capabilities
- `account-owner`: tên hiển thị từ cấu hình chỉ dùng khi tạo owner lần đầu.
- `web-authentication`: `GET /api/auth/me` có thêm `avatarUrl`.
- `user-profile-screen` (của `fe-ui-profile`, chưa archive): thêm requirement cho dữ liệu thật; `fe-ui-profile` phải archive trước change này.

## Impact

- **Code:** `apps/sino-api/src/main/java/dev/sino/identity/**`, migration Flyway mới (số trống kế tiếp lúc làm, hiện là V25), README của `sino-api`; `apps/sino-web/src/features/profile/**`, `src/features/auth/` (kiểu của `me`), `src/app/shell/{Topbar,UserMenu}.tsx` (ảnh), handler MSW.
- **Phối hợp:** `features/profile/**`, `UserMenu.tsx` đang do ANTIGRAVITY giữ trong `PROJECT_STATE.md` (DN-2).
- **Vận hành:** đổi `SINO_OWNER_DISPLAY_NAME` sau lần chạy đầu không còn tác dụng; README và `.env.example` phải nói rõ.

## Non-goals

- Đổi mật khẩu, đổi email, phiên đăng nhập, 2FA (phần 2, 3 và sau nữa).
- Máy chủ tự thu nhỏ hay cắt ảnh.
- Nhiều người dùng: vẫn đúng một owner (D-10).
