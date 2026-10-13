## Why

Người dùng (2026-10-13): "publish app lên gmail thì cần phải có 1 trang public nhưng chưa có landing page". Muốn đưa ứng dụng OAuth của Sino ra khỏi chế độ Testing, Google bắt consent screen khai một **trang chủ** và một **Chính sách quyền riêng tư** công khai:

- Hai trang đặt trên tên miền mình sở hữu và đã xác minh.
- Xem được không cần đăng nhập, URL cố định không chuyển hướng.
- Mô tả đúng ứng dụng làm gì và vì sao xin dữ liệu Google.
- Trang chủ có link tới Chính sách quyền riêng tư, và Chính sách có câu Limited Use.

Sino chưa có trang công khai nào: `/` của `sino-web` chuyển sang `/login` hoặc `/overview`, và chưa có gì được đưa lên mạng. Canvas "Sino UI" đã vẽ sẵn các trang công khai (`Landing`, `SitePrivacy`, `SiteTerms`, `SiteSecurity`, `SiteOpenSource`, `SiteNotFound`).

## What Changes

- **Site tĩnh mới `apps/sino-site`** (D-240): HTML và CSS thuần, không cần JavaScript, sinh bằng một script TypeScript chạy thẳng bằng Node (D-249). Host tĩnh nào cũng chạy được.
- **Các trang theo canvas** (D-244):
  - Trang chủ `/`.
  - Chính sách quyền riêng tư `/privacy` và `/en/privacy`; Điều khoản `/terms` và `/en/terms` (D-243).
  - Bảo mật `/security`, Phần mềm nguồn mở `/open-source`, trang 404.
- **Chữ đúng hiện trạng** (D-241): chỉ khẳng định tính năng đang chạy thật. Tính năng chưa có ghi "Sắp có" hoặc bỏ. Privacy ghi đúng dữ liệu Sino lưu, giữ và xóa.
- **Khối "Sino xin quyền gì từ Google"** trên trang chủ (D-245), mỗi scope một lý do. Canvas chưa có khối này.
- **Thông tin chưa có** (tên miền, URL app, email liên hệ, người đứng tên, ngày hiệu lực, nhà cung cấp máy chủ) nằm ở `site.config.ts` (D-242). Bản dựng để đưa lên mạng dừng và báo lỗi khi còn thiếu.
- **README:** cách đưa lên Cloudflare Pages hoặc GitHub Pages, xác minh tên miền, và ô nào trên consent screen điền URL nào.

## Capabilities

### New Capabilities
- `public-site`: các trang công khai của Sino, nội dung bắt buộc cho việc thẩm định OAuth của Google, cấu hình thông tin chủ sở hữu, bản dựng để đưa lên mạng.

### Modified Capabilities
- Không có.

## Impact

- Code: `apps/sino-site/**` (mới, gói pnpm riêng). Không đổi `apps/sino-web`, không đổi backend.
- Tài liệu: `docs/knowledge/phase-1-frontend-foundation.{md,docx}` (một mục về site).

## Non-goals

- Đưa site lên mạng và gắn tên miền: chờ người dùng chọn host. README có hướng dẫn.
- Deploy `sino-web` và `sino-api`, redirect URI trên tên miền thật, đăng ký tài khoản Sino.
- Hồ sơ thẩm định Google: video demo, xét duyệt scope restricted `gmail.readonly`, đánh giá bảo mật CASA.
- Duyệt pháp lý: Privacy và Terms viết đúng sự thật theo code, nhưng phần giới hạn trách nhiệm và luật áp dụng cần người dùng (hoặc luật sư) đọc lại.
- Bản tiếng Anh của trang chủ, Bảo mật, Nguồn mở.
- Đưa site vào CI.
- Sửa `sino-web`, ví dụ hiện lại link "Trang chủ" (ẩn ở FE-01 vì chưa có trang công khai).
