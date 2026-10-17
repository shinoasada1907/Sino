# Trang công khai trong sino-web (landing + privacy) · Implementation Plan

> **AUTO mode** (frontend). Người dùng 2026-10-17: "trước mắt landing page tích hợp vào trong sino-web đi"; phạm vi "Landing + Privacy", cách "Chép sang, giữ sino-site"; D-310…D-315 duyệt ("làm đi").
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở 1440 và 390; file kiến thức phase 1 (mục 24) + `.docx`, `genoffice docs check`; commit riêng trên `dev`.

## 1. Nền

- [x] 1.1 **WP-01 — Cổng `/`, khung trang công khai, `gsap`, chuyển động**
  - **Thực hiện:** `HomeGate` (D-310), route `/`, ~~`/privacy`, `/en/privacy`~~ tải riêng (D-313); `PublicFrame`, `PublicHeader`, `PublicFooter`, `nav.ts`, ~~`text.ts`~~ `ui.ts`, `public.css`, `animate-enter` trong `index.css`; cuộn tới `#…`; tiêu đề tab (D-315); `gsap` 3.15.0; 5 component chuyển động và test của chúng chép từ `sino-site`.
  - **Đã làm (2026-10-17, AUTO):**
    - route `/` → `HomeGate`: đang hỏi phiên thì dấu chờ như `RequireAuth`; đã đăng nhập thì `Navigate /overview replace`; chưa đăng nhập hay máy chủ lỗi thì trang giới thiệu (`React.lazy`). Cây `RequireAuth` thành route bố cục không có `path`, bỏ route `index`.
    - `PublicPages.tsx` (điểm vào chunk riêng; `Landing` = khung + tiêu đề tab); `PublicFrame` (tiêu đề tab đặt rồi trả lại, lên đầu trang khi đổi trang, cuộn tới `#…`); `PublicHeader` (link qua router `/login`, `/overview`, `/#…`; menu điện thoại `<details>` đóng khi bấm link); `PublicFooter` (chỉ link tới trang đã có, D-311); `nav.ts`; `ui.ts` (kiểu chữ + `ICON`); `public.css` (cuộn mượt và viền focus chỉ trên trang công khai, qua `html:has([data-public-page])`).
    - `--animate-enter` + `@keyframes enter` trong `index.css`; `gsap` 3.15.0 ghim đúng bản; 5 component chuyển động + 4 file test chép từ `sino-site` (chỉ sửa hai chú thích nói về HTML dựng sẵn); `stubReducedMotion` trong `src/test/matchMedia.ts`.
  - **Làm khác kế hoạch:**
    - Route `/privacy`, `/en/privacy` chuyển sang WP-03. **LÝ DO:** WP-01 chưa có nội dung privacy; một route trỏ tới khung rỗng sẽ bị thay ngay ở WP-03.
    - `text.ts` thành `ui.ts`. **LÝ DO:** gom cả `ICON` (vốn ở `icon.ts` của `sino-site`) vào cùng file kiểu dùng chung.
  - **Kiểm chứng (2026-10-17):** đỏ trước: cả 5 file test không chạy được vì thiếu module (`./PublicPages`, `./AnimatedList`, `./motion-values`, `./FadeContent`, `./SpotlightCard`). Lần xanh đầu 23/24: test tiêu đề tab đợi `Sino` nhưng jsdom không có `<title>` của `index.html` (tiêu đề ban đầu rỗng) → test so với tiêu đề trước khi mở trang. `features/public` + `router.test` 24/24. `pnpm lint` 0; `pnpm build` 0 (`tsc -b` 0; chunk `PublicPages` 6.05 kB + CSS 0.26 kB; chưa trang nào dùng chuyển động nên `gsap` chưa vào bundle nào, kiểm lại ở WP-02); `pnpm test` 751/751. Chrome (Vite 5181, API giả trả `401`, iframe): 1440 thanh đầu (logo, 5 mục, Đăng nhập, Mở Sino Messages), chân trang 3 cột, tiêu đề tab đúng, theme tối của app, không cuộn ngang; 390 chỉ còn Mở Sino Messages và nút menu, menu thả 6 link, không cuộn ngang. File kiến thức mục 24.0–24.3 + câu 167–169, `.docx` sinh lại, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** spec *Trang giới thiệu ở `/`* (cổng: chưa đăng nhập, đã đăng nhập, máy chủ lỗi), scenario *Trang công khai* của `web-app-foundation` với khung trang.

## 2. Nội dung

- [x] 2.1 **WP-02 — Trang giới thiệu Sino Messages**
  - **Thực hiện:** `LandingPage` và các khối (Hero, ProviderStrip, Features, Planning, HowItWorks, Privacy, Faq, Band, MailRow, SectionHead) chép từ `sino-site/src/pages/messages`, link theo D-311.
  - **Đã làm (2026-10-17, AUTO):** 11 file chép vào `features/public/landing/` (`MessagesPage` → `LandingPage`), chữ giữ nguyên; import đổi sang `../motion`, `../ui`, `Badge`/`ProviderIcon`/`cn` của `sino-web`; link vào app thành `<Button asChild><Link …>`: "Mở Sino Messages" → `/overview`, "Xem cách hoạt động" → `/#cach-hoat-dong`, "Mở Việc cần làm" → `/tasks`, "Đăng nhập" → `/login`, "Đọc thêm trong Chính sách quyền riêng tư" → `/privacy#google` (trang có ở WP-03); hai chú thích nói về HTML dựng sẵn sửa cho đúng `sino-web`; class giữ y nguyên bản gốc (kể cả chỗ IDE gợi ý viết gọn) để hai bản dễ so.
  - **Kiểm chứng (2026-10-17):** đỏ trước 3/3 test mới đúng lý do (không có tiêu đề trang, link, phần để cuộn tới). Sau khi chép, 5 test của WP-01 đỏ vì tìm thanh đầu qua link "Mở Sino Messages", nay có ba link như vậy → tìm vùng `banner`. Xanh `features/public` 23/23. `pnpm lint` 0; `pnpm build` 0 (chunk `PublicPages` 154.2 kB, 57.9 kB gzip, là chunk duy nhất có `ScrollTrigger` của `gsap`; chunk chính 854.5 kB như trước); `pnpm test` 754/754. Chrome (Vite 5181, API giả `401`, iframe): 1440 hero, ảnh hộp thư, dải dịch vụ như `sino-site`; bấm "Tính năng" → `/#tinh-nang`, mục nằm ngay dưới thanh đầu dính, khối hiện dần; 390 chữ xuống dòng, nút trải ngang, không phần tử nào tràn quá 390 px. File kiến thức mục 24.4 + câu 170, `.docx` sinh lại, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** *Trang giới thiệu ở `/`*, *Link của trang giới thiệu*.

- [ ] 2.2 **WP-03 — Chính sách quyền riêng tư VI/EN, thông tin chủ sở hữu**
  - **Thực hiện:** route `/privacy`, `/en/privacy` (chuyển từ WP-01); `PolicyPage`, `PrivacyPages`, `privacy.vi.tsx`, `privacy.en.tsx`, `privacy.shared.ts` chép từ `sino-site/src/pages/privacy`; `owner.ts`, `OwnerValue` (D-314); link đổi ngôn ngữ.
  - **Acceptance criteria:** *Chính sách quyền riêng tư trong app web*, *Trang công khai tải riêng*.

## 3. Nghiệm thu (để sau, như các màn khác)

- [ ] 3.1 **WP-04 — Nghiệm thu, tài liệu, archive** (1440 / 1024 / 768 / 390 × 2 theme; nhắc người dùng điền `owner.ts` giống `sino-site/site.config.ts` trước khi nộp Google).
