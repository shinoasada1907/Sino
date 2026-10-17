## Why

Người dùng (2026-10-17): "trước mắt landing page tích hợp vào trong sino-web đi". Trang giới thiệu Sino Messages và Chính sách quyền riêng tư hiện chỉ có ở `apps/sino-site` (change `site-public-pages`), một site tĩnh riêng chưa được đưa lên mạng (SI-06 chưa chọn host). Đặt hai trang này vào `sino-web` thì trước mắt chỉ cần chạy một app trên một domain mà vẫn có trang chủ và trang privacy cùng domain, đủ để nộp Google xác minh OAuth.

Người dùng chọn 2026-10-17: phạm vi "Landing + Privacy" (không lấy trang thương hiệu, không lấy 404 của site), cách làm "Chép sang, giữ sino-site", và duyệt thiết kế D-310…D-315 ("làm đi").

## What Changes

- **`/` của `sino-web` (D-310):** khách chưa đăng nhập thấy trang Sino Messages; người đã đăng nhập đi thẳng `/overview` như hiện nay; lúc đang hỏi phiên thì hiện dấu chờ như `RequireAuth`; máy chủ không trả lời thì vẫn hiện trang giới thiệu.
- **`/privacy` và `/en/privacy` (D-310):** Chính sách quyền riêng tư tiếng Việt và tiếng Anh, công khai.
- **Link (D-311):** "Đăng nhập" → `/login`, "Mở Sino Messages" → `/overview`; mục trên thanh đầu → `/#…`; chân trang chỉ giữ link tới trang đã có.
- **Code chép từ `sino-site` (D-312)** vào `apps/sino-web/src/features/public/`, dùng lại UI và token của `sino-web`; `sino-site` không đổi.
- **Tải riêng (D-313):** các trang công khai và `gsap` 3.15.0 ở một chunk riêng.
- **Thông tin chủ sở hữu (D-314)** của trang privacy ở `features/public/owner.ts`, còn trống thì hiện "[chưa điền: …]".
- **Theme, tiêu đề tab (D-315).**

## Capabilities

### New Capabilities
- `web-public-pages`: trang giới thiệu Sino Messages ở `/` và Chính sách quyền riêng tư VI/EN trong app web, công khai, không cần đăng nhập.

### Modified Capabilities
- `web-app-foundation`: yêu cầu *Chặn trang khi chưa đăng nhập* thêm ba trang công khai `/`, `/privacy`, `/en/privacy` bên cạnh `/login` và 404 (D-310).

## Impact

- Code: `apps/sino-web/src/features/public/**` (mới), `apps/sino-web/src/app/router.tsx` (ba route công khai), `apps/sino-web/src/index.css` (hiệu ứng `enter` của canvas), `apps/sino-web/package.json` + `pnpm-lock.yaml` (`gsap`).
- `apps/sino-site` không đổi; mỗi file chép ghi nguồn. SI-06 của `site-public-pages` quyết giữ hay bỏ `sino-site`.
- Không đổi backend, không gọi API mới (chỉ `GET /api/auth/me` có sẵn).

## Non-goals

- Trang thương hiệu `/` của `sino-site`, trang 404 công khai, Điều khoản, Bảo mật, Phần mềm nguồn mở (SI-04, SI-05 chưa làm).
- HTML dựng sẵn (prerender) cho trang công khai trong `sino-web`.
- Gói dùng chung giữa hai app (pnpm workspace).
- Điền thông tin chủ sở hữu (người dùng điền trước khi nộp Google).
