# Trang công khai trong sino-web (landing + privacy) · Technical Design

> Mode: **AUTO** (frontend). Người dùng 2026-10-17 chọn phạm vi "Landing + Privacy" và cách "Chép sang, giữ sino-site", rồi duyệt D-310…D-315 trong chat ("làm đi"): cả sáu là **người dùng duyệt**.
> Nguồn: `apps/sino-site` (change `site-public-pages`: D-241 chữ đúng hiện trạng, D-245 khối quyền Google, D-252 chuyển động React Bits, D-253 trang Sino Messages). Thiết kế giao diện: canvas `Landing`, `SitePrivacy` như `sino-site` đã dựng.
> Số quyết định: D-310…D-316 (D-316 agent chốt ở WP-03). Task: WP-01…WP-04.

## Context

- `sino-web` chưa có trang nào cho khách: `/` đi qua `RequireAuth` (về `/overview` hoặc `/login`), chỉ `/login` và 404 công khai (spec `web-app-foundation`).
- `sino-site` là site tĩnh riêng: trang thương hiệu `/`, Sino Messages `/messages`, privacy `/privacy` + `/en/privacy`, 404; dựng sẵn HTML rồi hydrate (D-250); link vào app qua `appUrl` của `site.config.ts`; chưa có host (SI-06).
- Muốn chạy trước một app trên một domain mà vẫn có trang chủ và privacy cho Google xác minh OAuth.

## Decisions

### D-310 — Ba trang công khai trong `sino-web` · **Người dùng duyệt**
```text
/             chưa đăng nhập  -> trang giới thiệu Sino Messages
              đã đăng nhập    -> <Navigate to="/overview" replace>
              đang hỏi phiên  -> dấu chờ (SinoMark) như RequireAuth: người đã đăng nhập không thấy trang giới thiệu chớp qua
              máy chủ lỗi     -> trang giới thiệu (trang công khai không hỏng vì API tắt)
/privacy      Chính sách quyền riêng tư, tiếng Việt   (công khai, không hỏi phiên)
/en/privacy   Privacy policy, tiếng Anh               (công khai, không hỏi phiên)
```
Trang giới thiệu không ở `/messages` như `sino-site`: trong app, `/messages` là màn Tin nhắn.
**Phương án bị loại:** trang giới thiệu cho mọi người ở `/` kể cả người đã đăng nhập (mở app phải bấm thêm một lần); đường dẫn riêng như `/gioi-thieu` (khách vào domain không thấy gì ngoài trang đăng nhập).

### D-311 — Link trong app thay cho `appUrl` · **Người dùng duyệt**
"Đăng nhập" → `/login`; "Mở Sino Messages" → `/overview` (chưa đăng nhập thì `RequireAuth` đưa tới `/login?returnTo=%2Foverview`); "Mở Việc cần làm" → `/tasks`; logo "Sino" → `/`; mục thanh đầu → `/#tinh-nang` …; "Đọc thêm trong Chính sách quyền riêng tư" → `/privacy#google`. Link đi bằng router (không tải lại trang); trang công khai tự cuộn tới `#…` của địa chỉ, vì React Router không làm việc đó. Chân trang chỉ giữ link tới trang đã có: Sino Messages, Câu hỏi thường gặp, Chính sách quyền riêng tư; Điều khoản, Bảo mật, Phần mềm nguồn mở ẩn tới khi có trang (SI-04, SI-05).

### D-312 — Chép từ `sino-site`, dùng lại UI của `sino-web` · **Người dùng duyệt**
```text
apps/sino-web/src/features/public/
  layout/      PublicFrame (PageFrame), PublicHeader (SiteHeader), PublicFooter (SiteFooter), nav.ts, text.ts
  landing/     LandingPage (MessagesPage), Hero, ProviderStrip, Features, Planning, HowItWorks, Privacy, Faq, Band, MailRow, SectionHead
  privacy/     PolicyPage, PrivacyPages, privacy.vi.tsx, privacy.en.tsx, privacy.shared.ts, OwnerValue (ConfigValue)
  motion/      FadeContent, AnimatedList, MagicBento, SpotlightCard, BorderGlow, motion-values, reduced-motion (+ test)
  owner.ts     thông tin chủ sở hữu (D-314)
  PublicRoutes / HomeGate
```
`Button`/`buttonVariants`, `Badge`, `ProviderIcon`, `SinoMark`, `cn`, token màu dùng bản của `sino-web` (bản của `sino-site` vốn chép từ đây). `sino-site` không đổi. Đầu mỗi file chép ghi "chép từ `apps/sino-site/...`; sửa nội dung thì sửa cả hai" cho tới khi SI-06 quyết giữ hay bỏ `sino-site`.
**Phương án bị loại:** chuyển hẳn (xóa khỏi `sino-site`); gói dùng chung `packages/` (phải dựng pnpm workspace).

### D-313 — Tải riêng · **Người dùng duyệt**
`React.lazy` cho cổng `/` và hai trang privacy; `gsap` 3.15.0 (bản `sino-site` dùng) chỉ nằm trong chunk đó. Người dùng app không tải thêm gì. Đổi lại: khách lần đầu tải bundle chính của app (~850 kB) cộng chunk công khai; trang không còn là HTML dựng sẵn, tắt JavaScript thì trống. Người duyệt OAuth và bot của Google chạy JavaScript nên vẫn đọc được.

### D-314 — Thông tin chủ sở hữu ở `features/public/owner.ts` · **Người dùng duyệt**
Email liên hệ, người đứng tên, ngày hiệu lực, nhà cung cấp máy chủ (các trường privacy dùng trong `site.config.ts`), giá trị đầu `null`; trang hiện "[chưa điền: …]" như bản preview của `sino-site`. Không chặn `pnpm build` khi còn trống (sẽ chặn mọi bản build của app); một test liệt kê các trường còn trống để nhắc "điền trước khi nộp Google", và giá trị phải giống `sino-site/site.config.ts`.

### D-315 — Theme và tiêu đề tab · **Người dùng duyệt**
Trang công khai theo theme của app (người dùng chọn, hay theo hệ điều hành); không có nút đổi theme riêng. Mỗi trang đặt `document.title` như `PAGES` của `sino-site` ("Sino Messages · Hộp thư chung cho Gmail và việc cần làm", "Chính sách quyền riêng tư · Sino", "Privacy policy · Sino") và trả lại tiêu đề cũ khi rời trang.

### D-316 — Câu về cookie trong bản privacy của `sino-web` · **Agent chốt** (WP-03, để người dùng xem lại)
Bản `sino-site` ghi "Site này (trang giới thiệu, chính sách và điều khoản) không dùng cookie…": đúng với một site tĩnh. Trong `sino-web`, mở `/` thì `HomeGate` hỏi `GET /api/auth/me`, và theo spec `web-authentication` câu trả lời cấp cookie `XSRF-TOKEN` (`csrf.spa()`). Chép nguyên câu thì chính sách nói sai đúng chỗ Google đọc. Bản `sino-web` đổi đoạn đó thành: trang giới thiệu và trang chính sách nằm trong ứng dụng, không đo lượt truy cập, không tải gì từ dịch vụ khác; lần hỏi phiên có thể đặt cookie chống giả mạo yêu cầu, một trong các cookie của ứng dụng đã ghi ở mục *Dữ liệu Sino lưu* (link `#thu-thap`). Tiếng Anh tương ứng. Mọi câu khác giữ nguyên.
**Phương án bị loại:** giữ nguyên câu (sai sự thật, trái D-241 "chữ đúng hiện trạng" người dùng đã duyệt cho `sino-site`); không hỏi phiên ở `/` để khỏi có cookie (người đã đăng nhập mở domain thì không vào thẳng app được, trái D-310).

## Những chỗ khác `sino-site` khi chép

| `sino-site` | `sino-web` |
|---|---|
| `useSite().appHref('/login')` | `Link to="/login"` (D-311) |
| `href="/messages#…"` | `Link to="/#…"` + cuộn tới `#…` |
| `useSite().year` (đóng lúc build) | năm hiện tại lúc vẽ |
| `ConfigValue` đọc `site.config.ts` | `OwnerValue` đọc `owner.ts` (D-314) |
| CSS `html { scroll-behavior: smooth }`, viền focus của `a`, `summary` | `public.css` tải cùng chunk, chỉ áp lên trang công khai |
| `animate-enter` (hiệu ứng vào của canvas) | thêm `--animate-enter` + `@keyframes enter` vào `index.css` của `sino-web` |
| theme theo hệ điều hành, không có lớp theme | theo `ThemeProvider` của app |

## Testing

| Tầng | Nội dung |
|---|---|
| Component (test viết trước, MSW cho `/api/auth/me`) | cổng `/`: chưa đăng nhập, đã đăng nhập (`replace` tới `/overview`), máy chủ lỗi, đang hỏi; link Đăng nhập / Mở Sino Messages / mục thanh đầu / chân trang; privacy VI và EN, nút đổi ngôn ngữ, "[chưa điền: …]"; tiêu đề tab |
| Unit | các component chuyển động (chép test của `sino-site`), `owner.ts` |
| Trình duyệt thật | Chrome ở 1440 và 390 mỗi task; đủ cỡ × 2 theme ở WP-04 |
| Cổng | `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` (kiểm `gsap` không ở chunk chính) |

## Risks / Trade-offs

- [Hai bản cùng nội dung] → ghi nguồn đầu mỗi file; SI-06 quyết bỏ một bản.
- [Khách tải bundle của app] → chunk công khai tải riêng; muốn nhẹ hơn thì về sau dựng sẵn HTML hoặc dùng lại `sino-site`.
- [Thông tin chủ sở hữu trống khi nộp Google] → test liệt kê trường trống; WP-04 nhắc người dùng điền.

## Definition of Done

- [ ] Scenario của spec `web-public-pages` và scenario mới của `web-app-foundation` chạy đúng.
- [ ] `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh; `gsap` chỉ ở chunk công khai.
- [ ] Chrome 1440 / 390 mỗi task; đủ cỡ × 2 theme ở WP-04.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
