# Trang công khai trong sino-web (landing + privacy) · Implementation Plan

> **AUTO mode** (frontend). Người dùng 2026-10-17: "trước mắt landing page tích hợp vào trong sino-web đi"; phạm vi "Landing + Privacy", cách "Chép sang, giữ sino-site"; D-310…D-315 duyệt ("làm đi").
> **2026-10-27 (người dùng):** `apps/sino-site` đã xóa (tag `sino-site-v0`), nên bản trong `sino-web` là bản duy nhất của trang giới thiệu và Privacy. Chú thích "change both together" ở đầu các file chép đổi theo.
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

- [x] 2.2 **WP-03 — Chính sách quyền riêng tư VI/EN, thông tin chủ sở hữu**
  - **Đã làm (2026-10-17, AUTO):** route `/privacy`, `/en/privacy` → `PrivacyRoute` (công khai, không hỏi phiên, `React.lazy` cùng chunk); `PrivacyVi`, `PrivacyEn` trong `PublicPages.tsx` (thanh đầu kiểu `family`, link sang bản kia); `PolicyPage`, `privacy.vi.tsx`, `privacy.en.tsx`, `privacy.shared.ts` chép vào `features/public/privacy/`; `OwnerValue` (+ `formatDate`) thay `ConfigValue`; `owner.ts` (4 trường `null`, `ownerDetails()`, `OWNER_LABELS`).
  - **Làm khác kế hoạch:**
    - `PrivacyPages.tsx` của `sino-site` không chép. **LÝ DO:** hai trang nằm luôn trong `PublicPages.tsx`, điểm vào của chunk.
    - Câu "Chi tiết ở trang Bảo mật" / "More on the Security page" giữ, bỏ link `/security`. **LÝ DO:** trang chưa có (SI-05), D-311.
    - Đoạn "Site này … không dùng cookie" viết lại (D-316, agent chốt, chờ người dùng xem). **LÝ DO:** trong `sino-web`, `/` hỏi `/api/auth/me` và nhận cookie `XSRF-TOKEN`; chép nguyên câu thì chính sách nói sai.
    - Không có test riêng "liệt kê trường còn trống" (D-314). **LÝ DO:** test như vậy sẽ đỏ đúng lúc chủ sở hữu điền giá trị thật; thay bằng test qua `vi.mock` của `ownerDetails()` cho cả hai trường hợp, và WP-04 nhắc điền.
  - **Kiểm chứng (2026-10-17):** đỏ trước 10/11 đúng lý do (chưa có route: trang 404); test "không link tới trang chưa có" xanh ngay (trang 404 không có link nào), giữ để canh; test cookie D-316 đỏ đúng chỗ (`not to contain 'không dùng cookie'` / `'sets no cookies'`) rồi xanh. Xanh `features/public` 36/36. `pnpm lint` 0; `pnpm build` 0 (chunk `PublicPages` 178.9 kB, 64.4 kB gzip, là chunk duy nhất chứa chữ Limited Use và `gsap`); `pnpm test` 767/767; `openspec validate --strict` hợp lệ. Chrome (iframe, API giả `401`): 1440 `/privacy` mục lục 232 px dính bên trái, 6 chỗ "[chưa điền: …]", bấm "English" → `/en/privacy`, tiêu đề tab "Privacy policy · Sino", `lang="en"`; 390 mục lục thành chip xuống dòng, không cuộn ngang. File kiến thức mục 24.5 + câu 171–172, `.docx` sinh lại, `genoffice docs check` 0 lỗi.
  - **Thực hiện:** route `/privacy`, `/en/privacy` (chuyển từ WP-01); `PolicyPage`, `PrivacyPages`, `privacy.vi.tsx`, `privacy.en.tsx`, `privacy.shared.ts` chép từ `sino-site/src/pages/privacy`; `owner.ts`, `OwnerValue` (D-314); link đổi ngôn ngữ.
  - **Acceptance criteria:** *Chính sách quyền riêng tư trong app web*, *Trang công khai tải riêng*.

## 3. Nghiệm thu (để sau, như các màn khác)

- [ ] 3.1 **WP-04 — Nghiệm thu, tài liệu, archive** (1440 / 1024 / 768 / 390 × 2 theme; nhắc người dùng điền `owner.ts` ~~giống `sino-site/site.config.ts`~~ trước khi nộp Google; người dùng duyệt các cam kết của Privacy và `GOOGLE_APP_NAME`, chuyển từ SI-03a của `site-public-pages`). **LÝ DO:** `sino-site` đã xóa 2026-10-27 (người dùng; bản cuối ở tag `sino-site-v0`).
