## Why

Google từ chối bước Verify Branding của app OAuth (2026-11-04): *"Your privacy policy page at https://daiquangia.io.vn/en/privacy does not have sufficient content"*. Server trả cho mọi đường dẫn cùng một khung `index.html` 454 byte với `<div id="root"></div>` rỗng; nội dung chỉ có sau khi chạy JavaScript. Nguyên nhân khả năng cao là công cụ của Google không thấy chữ (chưa xác nhận được, Google không nói rõ). Trang còn hiện "[chưa điền: …]" và mục bên thứ ba chưa nêu Cloudflare, trong khi toàn bộ lưu lượng đi qua Cloudflare. Chưa qua bước này thì chưa nộp được xác minh Gmail, nên người lạ chưa kết nối được Gmail.

## What Changes

- Lúc `pnpm build`, tạo sẵn HTML có đủ nội dung cho `/`, `/privacy`, `/en/privacy` từ chính các component React đang có.
- Giữ nguyên trải nghiệm khi có JavaScript: chủ tài khoản vào `/` vẫn không thấy trang giới thiệu lóe lên (D-310), các trang trong app vẫn dùng khung rỗng.
- Caddy trả đúng file HTML tạo sẵn cho ba đường dẫn trên; mọi đường dẫn khác vẫn về `index.html`.
- Điền 4 giá trị chủ sở hữu trong `owner.ts`.
- Privacy VI và EN nêu Cloudflare trong mục bên thứ ba và sửa câu "ngoài hai bên này".
- Build thất bại nếu HTML tạo sẵn thiếu nội dung hoặc còn "[chưa điền".
- Không đổi API, không đổi database, không thêm trang mới.

## Capabilities

### New Capabilities

- `public-pages-prerender`: các trang công khai có đủ nội dung ngay trong HTML server trả về, không cần chạy JavaScript.

### Modified Capabilities

Không có. Spec `web-public-pages` còn nằm trong change chưa archive, chưa có ở `openspec/specs/`.

## Impact

- `apps/sino-web`: `package.json` (lệnh `build`), `vite.config.ts`, `index.html`, entry và script prerender mới, `features/public/owner.ts`, `features/public/privacy/privacy.{vi,en}.tsx`.
- Nhánh `deploy/devtest`: `apps/sino-web/Caddyfile` (file này chỉ có trên nhánh deploy).
- Google Console: chọn "I have fixed the issues" sau khi đã deploy.
- Change `web-public-pages` (WP-04 còn mở): phần điền `owner.ts` của WP-04 được làm ở đây.
