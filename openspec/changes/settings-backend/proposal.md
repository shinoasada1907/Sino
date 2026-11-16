## Why

Màn Cài đặt (`fe-ui-settings`) đang chạy trên dữ liệu mẫu: đổi gì cũng mất khi tải lại trang. Người dùng (2026-10-21): "làm việc với sino-api để hoàn thiện cái BE setting", chọn phạm vi "Lưu tuỳ chọn + số liệu thật", duyệt hợp đồng API trong chat và cách chia việc ("Duyệt, AUTO"): phiên `sino-api` làm backend, phiên `sino-web` nối web.

## What Changes

- **`sino-api`, module mới `settings`:** một bản cài đặt mỗi người dùng trong bảng `user_settings` (migration kế tiếp). `GET /api/settings` trả bản cài đặt (mặc định khi chưa lưu), `PATCH /api/settings` đổi từng trường và trả bản đầy đủ, `GET /api/settings/storage` trả số thư và tin cùng dung lượng Sino đang lưu của người dùng.
- **`sino-web`:** màn Cài đặt đọc và ghi qua API thay cho dữ liệu mẫu: theme, định dạng ngày giờ, mức chuyển động, sáu công tắc thông báo, giờ yên lặng, múi giờ, "sáng mai", nhắc mặc định, đầu tuần, và số liệu "Dữ liệu Sino đang lưu". Đổi hiện ngay, máy chủ từ chối thì trả về như cũ. Theme đã lưu được áp khi mở app.

## Capabilities

### New Capabilities
- `user-settings`: lưu và đọc cài đặt của người dùng, số liệu dữ liệu đang lưu, qua API của Sino.

### Modified Capabilities
- Không có (yêu cầu của `settings-screen` trong `fe-ui-settings` về dữ liệu mẫu được thay khi change đó archive; ghi ở `tasks.md`).

## Impact

- **`apps/sino-api`:** `dev.sino.settings` (mới: `api`, `application`, `infrastructure`), migration `V2x__settings_create_user_settings.sql`, `README.md` (bảng API), test.
- **`apps/sino-web`:** `features/settings/**` (API, hook, các mục), `shared/theme/**` (áp theme đã lưu), test.
- **Phiên làm:** backend do phiên `sino-api-e0`, web do phiên `sino-web-03`; chung hợp đồng ở `design.md`.

## Non-goals

- Áp các tuỳ chọn vào phần khác của app (định dạng ngày giờ, múi giờ, đầu tuần, nhắc mặc định, mức chuyển động, giờ yên lặng): change sau.
- Phiên đăng nhập và "Đăng xuất thiết bị khác", xuất dữ liệu, xoá toàn bộ dữ liệu, Web Push và thiết bị nhận thông báo: change sau.
- Ngôn ngữ: chỉ có tiếng Việt.
