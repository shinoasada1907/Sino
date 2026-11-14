## Context

- Thiết kế: canvas "Sino UI — Sunset" (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs), bản mềm vẽ lại 2026-11-14 và được người dùng duyệt ("Ưng, sửa đề án"). Token và 5 bộ màu nằm trong `project/sunset.css` (class `theme-light|theme-dark` và `pal-sunset|pal-mint|pal-lavender|pal-mono` trên gốc; không có `pal-*` nghĩa là Anh đào). Artboard: `Main` (nền tảng, 5 bộ màu), `Sidebar`, `Dashboard` (sáng, Anh đào), `DashboardLight` (tối, Oải hương; tên file giữ từ bản trước), `Inbox`, `InboxLight` (tối), `Messages`, `Calendar`, `Tasks`, `Notes`, `Accounts`, `Settings` (bấm chọn được bộ màu), `MobileInbox`, `MobileChat`.
- Code hiện tại: mọi màu đi qua biến CSS trong `src/index.css`, map sang Tailwind bằng `@theme inline`. `ThemeProvider` (`shared/theme`) đặt `theme-light|theme-dark` trên `<html>` theo `/api/settings.theme`. Font Inter và JetBrains Mono tự host bằng `@fontsource-variable/*`.
- `sino-api`: module `settings`, bảng `user_settings` (D-401), `GET`/`PATCH /api/settings` với PATCH chỉ gửi trường thay đổi (D-402). Migration mới nhất là `V27`.
- `sino-web` đang có việc dở chưa commit trên đúng các file sẽ đụng (phiên `sino-web-green` và NK-04, do phiên quản lý "Zalo chat progress" giữ).

## Goals / Non-Goals

**Goals:** web giống canvas ở mọi màn có trong canvas, cả 5 bộ màu × 2 theme, ở 1440 / 1024 / 768 / 390. Người dùng đổi bộ màu, màu nhấn, độ bo, họa tiết; lựa chọn lưu theo tài khoản. Không đổi hành vi nào khác.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-482 — Canvas Sunset là thiết kế cuối cùng · **Chốt A** (người dùng, 2026-11-12)

Sunset thay "Sino UI" cho mọi thứ người dùng nhìn thấy. Bản sao để ở `design/sino-ui-sunset/project/`; `CLAUDE.md` và memory trỏ link mới. Canvas cũ vẫn dùng cho bố cục những màn Sunset chưa vẽ.

### D-483 — Thứ tự làm · **Chốt A** (người dùng, 2026-11-12)

Token, font, thành phần dùng chung và cơ chế bộ màu làm trước, rồi bộ khung, rồi từng nhóm màn.

### D-484 — Theme mặc định

Đổi: người dùng mới mặc định **Sáng** (canvas mềm vẽ sáng làm chính). Người đã lưu `theme` giữ lựa chọn của mình; "Theo hệ thống" vẫn còn. Agent tự chốt.

### D-485 — Màn chưa có trong canvas

Chỉ nhận token và thành phần mới, bố cục giữ theo canvas cũ. Agent tự chốt.

### D-486 — Font · thay bản trước

**Nunito** cho cả nội dung và tiêu đề (tiêu đề đậm 800), tự host bằng `@fontsource-variable/nunito`, có bộ ký tự tiếng Việt. JetBrains Mono giữ cho giờ và phím tắt. Bỏ Inter và Space Grotesk. Agent tự chốt.

### D-487 — Ánh xạ token

Giữ tên biến cũ (`--bg`, `--surface`, `--raised`, `--hover`, `--border`, `--text*`, `--success`, `--danger`, `--warning`, `--inverse`…), thêm biến mới theo `sunset.css`: `--active`, `--accent`, `--accent-hover`, `--on-accent`, `--accent-ink`, `--accent-soft`, `--accent-line`, `--accent-tint`, `--honey(-soft)`, `--dusk-ink`, `--dusk-soft`, `--success-soft`, `--danger-soft`, `--shadow`, `--shadow-pop`, `--glow`, `--dots`, và bán kính `--r-xs…--r-xl`, `--r-pill`. Nút chính (`Button` mặc định) chuyển từ `--inverse` sang `--accent`. Agent tự chốt.

### D-488 — Phong cách mềm cho cả app (người dùng, 2026-11-14: "đổi hết luôn")

Mọi màn, kể cả Hộp thư và Tin nhắn, nhận chất liệu mềm: thẻ bo 24 px, khung và cột nổi cách mép 12 px, bóng mềm thay cho viền (viền chỉ còn trong bảng và danh sách dài), nút/nhãn/ô tìm/mục sidebar tròn hẳn. Họa tiết (dấu cộng, chấm bi) chỉ đặt ở thẻ lớn: khối chào Tổng quan, đầu Cài đặt, thẻ "Sino của bạn".

### D-489 — Bộ màu và màu nhấn riêng

5 bộ dựng sẵn, giá trị theo `sunset.css`, mỗi bộ có sáng và tối: `SAKURA` (Anh đào, mặc định), `SUNSET`, `MINT`, `LAVENDER`, `MONO`. Màu nhấn riêng là một mã `#RRGGBB` đè lên `--accent*` của bộ đang chọn; nền vẫn theo bộ. Sino tự tính các biến còn lại từ màu đó (tính trong không gian OKLCH):
- `--accent`: nếu chữ trên nút (trắng ở theme sáng, tối ở theme tối) chưa đạt 4.5:1, chỉnh độ sáng cho tới khi đạt;
- `--accent-ink`: chữ màu nhấn trên `--surface` đạt 4.5:1;
- `--accent-soft`, `--accent-tint`, `--accent-line`: cùng sắc độ, nhạt dần.

Một hàm thuần `accentScale(hex, theme)` có test riêng, và kiểm bằng lỗi gài (mutation) một lần. Agent tự chốt.

### D-490 — Lưu lựa chọn ở đâu · **Chốt A** (người dùng, 2026-11-14: "Duyệt, D-490 = A")

- **A (đề xuất)**: thêm 4 cột vào `user_settings` (`V28`): `palette` (`SAKURA|SUNSET|MINT|LAVENDER|MONO`, mặc định `SAKURA`), `accent_color` (`#RRGGBB` hoặc null), `corners` (`SOFT|COMPACT`, mặc định `SOFT`), `decorations` (boolean, mặc định true). Đi qua `GET`/`PATCH /api/settings` như các cài đặt khác; PATCH kiểm giá trị và trả 400 theo `api-conventions` khi sai.
- B: một cột JSON `appearance`. Thêm trường sau này không cần migration, nhưng khác cách mọi cài đặt đang lưu, và backend không kiểm được từng giá trị.

Lý do chọn A: đúng cách D-401 đang làm, kiểm được từng giá trị, và web dùng lại được `SettingsChange` có sẵn.

### D-491 — Áp bộ màu trên web

`ThemeProvider` thêm `palette`, `accentColor`, `corners`, `decorations` từ `useSettings`. Nó đặt class `pal-*`, `corners-compact`, `no-decor` trên `<html>`; màu nhấn riêng ghi thẳng các biến `--accent*` lên `<html>` qua `style`. Để khỏi chớp màu lúc tải, lựa chọn cuối được nhớ trong `localStorage` và áp trước khi `/api/settings` trả về (như theme hiện nay). Đổi trong Cài đặt thì áp ngay, rồi PATCH. Agent tự chốt.

### D-492 — Độ bo "Gọn"

`corners-compact` hạ bán kính (thẻ 14, khung 16, dòng 10; nút và nhãn vẫn tròn), giảm đệm của dòng danh sách từ 12 xuống 8 px. Agent tự chốt.

### D-493 — Màu chữ: theo bộ màu hoặc trung tính (người dùng, 2026-11-14: "Hai kiểu")

Không cho chọn mã màu chữ tự do, vì dễ ra chữ nhạt khó đọc. Có hai kiểu: `TINTED` (mặc định, chữ ngả theo bộ như canvas) và `NEUTRAL` (chữ đen xám chuẩn). Trên web là class `text-neutral` trên `<html>`, giá trị theo `sunset.css`. Cả hai kiểu đều đạt tương phản 4.5:1.

### D-494 — Nền sáng: phớt màu hoặc trắng (người dùng, 2026-11-14: "Cho người dùng chọn")

`TINTED` (mặc định, nền nhuốm nhẹ theo bộ) hoặc `WHITE` (nền gần trắng #F7F7F8, thẻ trắng có viền mảnh thay cho bóng nhuốm màu, bỏ quầng sáng). Chỉ áp khi theme đang là Sáng. Trên web là class ~~`bg-white`~~ `light-white` trên `<html>`. **LÝ DO đổi tên** (SU-10, 2026-11-14): Tailwind đã có sẵn tiện ích `bg-white`, nó đè lên nền của `<html>`. Canvas vẫn dùng `bg-white` vì không có Tailwind. Cách lưu giống D-490 A: thêm hai cột `text_tone`, `light_background` (V29), đi qua `/api/settings`.

### D-495 — Theme tối sáng hơn, chữ trắng, màu nhấn pastel (người dùng, 2026-11-14)

Người dùng thử bản tối và chê bốn điểm: chữ ngả hồng (muốn trắng), tối quá và bí, thiếu chất mềm, màu nhấn chói. Bản tối mới trong `sunset.css`:
- nền nâng lên một bậc (Anh đào `#27222A`, thẻ `#322C35`);
- chữ trắng trung tính `#F7F5F7`, chữ phụ xám trung tính;
- màu nhấn pastel (Anh đào `#F4A3BF`, chữ trên nút tối `#3A1426`);
- bóng nhẹ hơn, có viền sáng mảnh phía trên thẻ; quầng sáng và chấm bi rõ hơn.
Mỗi bộ màu có bản tối tương ứng. Ở theme tối, "Màu chữ" của D-493 gần như không khác nhau, vì cả hai kiểu đều là chữ trắng.

### D-496 — Web site công khai cũng theo phong cách mềm (người dùng, 2026-11-14: "duyệt xong thì apply UI cho web site luôn")

Trang giới thiệu `/` và trang Privacy (`/privacy`, `/en/privacy`) không còn nằm trong D-485 nữa: chúng được vẽ lại theo artboard `Landing` và `Privacy` của canvas, gồm thanh điều hướng dạng một viên thuốc, Hero kiểu bento, các thẻ bo tròn, họa tiết, dải lời mời có chấm bi. Giữ nguyên:
- **toàn bộ chữ**, gồm cả tên mục, thứ tự và câu Limited Use, vì Google đã xác minh Branding trên nội dung này (2026-11-13);
- prerender ra HTML (`public-pages-prerender`): build vẫn phải ra `index.html`, `privacy.html`, `en/privacy.html` có đủ chữ;
- các route và liên kết.
Trang công khai luôn dùng bộ Anh đào (khách chưa có cài đặt), sáng hoặc tối theo hệ thống. Làm sau khi người dùng nghiệm thu đợt app (SU-12).

## Risks / Trade-offs

- **Đụng file của việc đang dở** → SU-01 chỉ bắt đầu khi `apps/sino-web` đã commit sạch và test xanh.
- **Hộp thư mềm có thể bớt dày** → độ bo "Gọn" (D-492) là lối ra cho người đọc nhiều thư.
- **Màu nhấn riêng xấu hoặc khó đọc** → `accentScale` chặn tương phản; vẫn giữ nền của bộ màu nên không thể ra nền chói.
- **Test dựa vào class màu cũ** đỏ → sửa test theo class mới, không đổi hành vi.
