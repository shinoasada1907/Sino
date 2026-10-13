# Site công khai cho thẩm định OAuth của Google · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng duyệt thiết kế 2026-10-13 ("duyệt"): D-240…D-247; D-248, D-249 agent chốt.
> **Đổi sang React (2026-10-13):** người dùng thay site tĩnh bằng template Vite + React, yêu cầu landing "sử dụng react-bit theo như design" và duyệt D-250…D-252. SI-01 và SI-02 được làm lại trên React ở SI-01R và SI-02R. Từ SI-03 trở đi, mỗi trang là component React trong `src/pages/`, thay cho `src/pages/*.ts`.
> Mỗi task gồm:
> - test viết trước (đỏ rồi xanh);
> - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:preview` trong `apps/sino-site`;
> - đối chiếu canvas; Chrome một lượt ở các cỡ task đụng tới;
> - file kiến thức phase 1 + `.docx`, `genoffice docs check`;
> - commit riêng trên `dev`, không push.

## 1. Nền

- [x] 1.1 **SI-01 — Gói `apps/sino-site`, cấu hình, khung trang, CSS, phông, dựng và xem, trang 404**
  - ~~Site tĩnh `src/html.ts` / `src/layout.ts` / `styles/site.css`~~ → làm lại ở 1.2 SI-01R. **LÝ DO:** người dùng đổi sang React + React Bits (2026-10-13, D-250…D-252). Phần giữ lại: `configProblems`, `site.config.ts`, `scripts/serve.ts`, `resolveRequest`, test của chúng.
  - **Thực hiện:**
    - `package.json`: `build`, `build:preview`, `serve`, `test`, `lint`, `typecheck`.
    - `site.config.ts` với mọi trường `null`; `src/config.ts` (`missingFields`).
    - `src/html.ts` (`escapeHtml`, tagged template `html`), `src/layout.ts` (head, thanh trên có menu `<details>`, chân trang), `src/icons.ts`.
    - `styles/site.css` lấy từ canvas `sino.css`: biến màu dark mặc định và light theo `prefers-color-scheme`, chữ, nút, `lp-nav`, `lp-foot`, `nf`.
    - Phông chép từ `@fontsource-variable/*`; `public/favicon.svg`.
    - `scripts/build.ts` (hai chế độ, D-242), `scripts/serve.ts`.
    - `src/pages/not-found.ts` theo `SiteNotFound`.
  - **Acceptance criteria:**
    - spec `public-site` *Thông tin chủ sở hữu nằm trong một cấu hình*: cả hai scenario;
    - *Các trang của site công khai*: phần chung (`lang`, title, mô tả, viewport, canonical, không `<script>`, không tài nguyên ngoài) và scenario 404;
    - *Link nội bộ không gãy* cho các trang đã có.
  - **Kiểm chứng:** test trên `dist/` của một lần dựng vào thư mục tạm; Chrome 404 ở 1440 và 390, dark và light.
  - **Đã làm (2026-10-13, AUTO):**
    - Gói pnpm riêng (devDependencies cùng phiên bản `sino-web`: TypeScript 6, vitest 5, jsdom 30, oxlint, `@fontsource-variable/*` 5.3.0).
    - `configProblems`: báo trường trống, và cả trường viết sai: URL không `https://` hoặc có `/` cuối, email sai, ngày không có thật. Lý do: một `siteUrl` có `/` cuối làm canonical thành `//privacy`.
    - `html` (tagged template có escape), `createContext` (`value`, `appHref`, `canonical`), `renderPage` (head, thanh trên, menu `<details>`, chân trang VI/EN), `notFoundPage`.
    - `buildSite`: dựng hết trong bộ nhớ trước, rồi mới xóa và ghi `outDir`. Chép `styles/site.css`, `public/`, sáu file phông (latin, latin-ext, vietnamese của Inter và JetBrains Mono).
    - `scripts/build.ts`: thêm `--out` và `--config` để test chạy được CLI thật.
    - `scripts/serve.ts` + `resolveRequest` (giống host tĩnh, chặn path traversal).
    - `site.config.ts`: mọi trường `null`.
  - **Làm khác kế hoạch:**
    - ~~Mỗi trang có link canonical~~ → trang 404 có `noindex` và không có canonical; spec đã sửa. **LÝ DO:** 404 không phải một URL thật, không được để Google lập chỉ mục.
    - ~~"Mở Sino" trỏ `appUrl + "/login"`~~ → trỏ `appUrl + "/"` (ghi ở D-246). **LÝ DO:** thanh trên có thêm nút "Đăng nhập" trỏ `/login`; hai nút cùng đích thì một nút thừa.
    - Câu giới thiệu ở chân trang: ~~"Hộp thư chung và kế hoạch từ tin nhắn, ở cùng một nơi."~~ → "Hộp thư chung và việc cần làm, ở cùng một nơi." **LÝ DO:** D-241, chưa tạo được việc từ tin nhắn.
    - Menu điện thoại hiện đè ngay dưới thanh trên (`position: absolute`), không đẩy nội dung xuống như canvas. **LÝ DO:** `<details>` phải chứa cả nút lẫn danh sách, mà nút nằm trong hàng của thanh trên.
    - "Quyền riêng tư" ở cột TIN CẬY trỏ `/#rieng-tu` trên mọi trang. **LÝ DO:** canvas trỏ `#rieng-tu` ở trang chủ nhưng `SitePrivacy` ở trang con; cột PHÁP LÝ đã có "Chính sách quyền riêng tư".
    - Năm bản quyền lấy theo ngày dựng thay vì "2026" viết cứng.
    - Bản xem trước khi chưa có `appUrl`: nút vào app trỏ `#chua-dien-app-url`.
  - **Kiểm chứng (2026-10-13):**
    - RED: 35/43 đỏ trên bản rỗng chỉ có chữ ký hàm. Mấy test duyệt từng trang xanh vì chưa có trang nào; chúng được canh bằng test "writes the pages…" đang đỏ.
    - Sửa một test của chính mình trước khi GREEN: test "không tải gì từ site khác" coi cả `link rel=canonical` (URL tuyệt đối) là tài nguyên → chỉ xét `stylesheet`, `icon`, `preload`, `img`, `source`.
    - GREEN: 43/43 (7 file). `pnpm lint` 0, `pnpm typecheck` 0.
    - `pnpm build` với `site.config.ts` thật: thoát 1, liệt kê đủ 6 trường. `pnpm build:preview`: thoát 0, có liệt kê chỗ thiếu.
    - `pnpm serve`: `/nope` → 404 `text/html`, `/site.css` 200, phông 200 `font/woff2`.
    - Chrome headless (CDP, `localhost:4321/nope`), 1440 và 390 × dark và light: không cuộn ngang; nền `#070707` / `#F2F2EF`; Inter (cả bộ chữ tiếng Việt) và JetBrains Mono đã nạp; bố cục như canvas `SiteNotFound`. Ở 390, bấm nút menu thì `details.open = true`, danh sách `display: flex` hiện dưới thanh trên.
    - File kiến thức phase 1 mục 21 + câu 113–117; `.docx` sinh lại, `genoffice docs check` 0 lỗi.

- [x] 1.2 **SI-01R — Nền React: Vite + React + Tailwind như `sino-web`, prerender, trang 404**
  - **Thực hiện:**
    - Trên template Vite + React người dùng đã tạo:
      - bỏ `App.tsx`, `App.css`, `src/assets/`, `public/icons.svg`;
      - `public/favicon.svg` trả về logo S2 của SI-01.
    - `package.json`:
      - script `dev`, `build`, `build:preview`, `serve`, `test`, `lint`, `typecheck`;
      - thêm Tailwind 4, `cn`, `class-variance-authority`, `lucide-react`, `@fontsource-variable/*`, `gsap`, vitest, Testing Library, jsdom.
    - `vite.config.ts`: `react()`, `tailwindcss()`, alias `@`, vitest; `__SITE_DATA__` cho `dev` và test.
    - `src/index.css`: token canvas từ `sino-web`, dark mặc định, light theo hệ điều hành (D-251).
    - `src/shared/ui`: `buttonVariants`, `Badge`, `SinoMark`, `ProviderIcon`. `src/shared/lib/utils.ts` (`cn`).
    - `src/site/`:
      - `config.ts` (`configProblems` của SI-01);
      - `site.tsx` (`SiteData`, `SiteProvider`, `useSite`: `appHref`, `value`);
      - `pages.ts` (bảng trang: id, đường dẫn, file, lang, title, description, indexable);
      - `document.ts` (`renderDocument`: ghi head và HTML vào khung).
    - `src/layout/`: `PageFrame`, `SiteHeader` (menu `<details>`, bấm link thì đóng), `SiteFooter`.
    - `src/pages/NotFoundPage.tsx` theo `SiteNotFound`.
    - `src/entry-server.tsx`, `src/entry-client.tsx`, `index.html` có chỗ trống `<!--app-head-->` và `<!--app-html-->`.
    - `scripts/build.ts`: config → Vite client + SSR → prerender → `dist/`.
    - `scripts/serve.ts` + `resolveRequest` của SI-01.
  - **Acceptance criteria:**
    - spec *Thông tin chủ sở hữu nằm trong một cấu hình*: hai scenario;
    - *Các trang của site công khai*: phần chung và scenario 404;
    - *Link nội bộ không gãy* cho 404.
  - **Kiểm chứng:**
    - test `configProblems`, `resolveRequest`, `renderDocument` cho 404, CLI dựng thật;
    - lint, typecheck, test, `build:preview`, `serve`;
    - Chrome `/nope` ở 1440 và 390, dark và light.
  - **Đã làm (2026-10-13, AUTO):**
    - Cấu trúc theo D-250/D-251:
      - `src/site/{config,site-data,site-context,SiteProvider,pages,document}`;
      - `src/layout/{PageFrame,SiteHeader,SiteFooter,nav}`, `src/pages/NotFoundPage.tsx`, `src/App.tsx`;
      - `src/entry-{client,server}.tsx`, `scripts/build.ts`.
    - Chép từ `sino-web`: token canvas, `cn`, `buttonVariants`, `SinoMark`. Mã của SI-01 giữ lại: `configProblems`, `scripts/serve.ts`, `scripts/static-files.ts` (`resolveRequest`), cùng test của chúng.
    - `scripts/build.ts`:
      - kiểm config rồi gọi Vite bản client và bản SSR vào một thư mục tạm trong `node_modules`;
      - prerender mỗi trang của `PAGES` vào khung `index.html`;
      - xóa khung `index.html` để `dist/` chỉ còn trang đã prerender;
      - chép sang `--out` (mặc định `dist/`).
  - **Làm khác kế hoạch:**
    - ~~`src/site/site.tsx` (`SiteProvider` + `useSite`)~~ → `SiteProvider.tsx` và `site-context.ts`. **LÝ DO:** oxlint `only-export-components` cảnh báo khi một file `.tsx` vừa xuất component vừa xuất hook (fast refresh); `sino-web` cũng tách như vậy (`themeContext.ts`).
    - `scripts/build.ts` đặt `NODE_ENV=production`. **LÝ DO:** test chạy CLI bên trong vitest (`NODE_ENV=test`); Vite giữ biến đó và đóng gói bản React phát triển (>500 kB, có cảnh báo ra stderr).
    - `buttonVariants` là hàm gọi `cn(cva(...))`, không phải `cva` trần. **LÝ DO:** Chrome cho thấy nút phụ mất viền. `border-transparent` (lớp gốc) và `border-border-strong` (biến thể) cùng nằm trong chuỗi, và CSS của Tailwind để `border-transparent` thắng. `Button` của `sino-web` gọi `cn` nên không bị. Có test `button.test.ts`.
    - Menu dùng nút dưới 1024 px (điểm `lg` của Tailwind, D-251), SI-01 là dưới 960 px.
    - Không thêm `value(field)` (chỗ thiếu `[chưa điền: …]`) vào `useSite`. **LÝ DO:** 404 không dùng; SI-03 (Privacy) sẽ thêm.
  - **Kiểm chứng (2026-10-13):**
    - RED: 6/6 file test đỏ vì chưa có module; CLI báo `Cannot find module scripts/build.ts`.
    - GREEN: 42/42 (7 file), kể cả 3 test CLI dựng thật. `pnpm lint` 0 cảnh báo, `pnpm typecheck` 0, `pnpm build:preview` 0.
    - `dist/`: `404.html`, `favicon.svg`, `assets/` (1 JS 303 kB, 1 CSS, phông woff2). `404.html` có title, description, `noindex`, `data-page="not-found"` và đủ chữ.
    - `pnpm serve`: `/nope` → 404.
    - Chrome headless (CDP, `localhost:4321/nope`), 1440 và 390 × dark và light:
      - không cuộn ngang; nền `#070707` / `#F2F2EF`;
      - Inter (cả bộ tiếng Việt) và JetBrains Mono đã nạp;
      - hydrate xong, không lỗi hydration trong console;
      - ở 390: bấm nút menu thì `details.open` và danh sách hiện ở `top: 60px`; bấm một link thì menu đóng;
      - tắt JavaScript: trang vẫn hiện đủ.
      - Lỗi Chrome bắt được: nút phụ mất viền (đã sửa, xem trên). Đo lại: viền `#4A4A4F` (dark), `#C3C3C0` (light).
    - File kiến thức phase 1 mục 21.10 + câu 121–124; `.docx` sinh lại, `genoffice docs check` 0 lỗi.

## 2. Các trang

- [x] 2.1 **SI-02 — Trang chủ**
  - ~~`src/pages/home.ts` + `styles/site.css`~~ → làm lại ở 2.1b SI-02R. **LÝ DO:** người dùng đổi sang React + React Bits (2026-10-13, D-250…D-252). Chữ và các quyết định nội dung của SI-02 giữ nguyên.
  - **Thực hiện:**
    - Đọc lại bảng sự thật D-241 với `tasks.md` của các change ngay trước khi viết.
    - `src/pages/home.ts` theo `Landing`: hero và ảnh minh họa chỉ có Gmail, dải "KẾT NỐI VỚI", bento tính năng, kế hoạch, ba bước, quyền riêng tư cùng khối quyền Google (D-245), câu hỏi thường gặp bằng `<details>`, lời kêu gọi cuối (D-246).
    - Thêm vào `site.css` các lớp của trang chủ.
  - **Acceptance criteria:** spec *Trang chủ mô tả đúng ứng dụng và lý do xin dữ liệu Google* (hai scenario); scenario *Mở trang chủ khi tắt JavaScript*.
  - **Kiểm chứng:** Chrome 1440 / 768 / 390, dark và light, so với `Landing`, `LandingLight`, `LandingMobile`; menu mobile mở và đóng được; không cuộn ngang.
  - **Đã làm (2026-10-13, AUTO):**
    - Đọc lại bảng D-241 với code. Ba điều canvas nói mà app chưa làm, nên trang không khẳng định: danh sách quyền đã cấp ở trang tài khoản (API trả `scopes: null`), thông báo trình duyệt, xuất/xóa dữ liệu. Bốn điều có thật được đưa vào thay:
      - bước "Xem lại quyền truy cập" trước khi sang Google;
      - "không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ" (`connect.format.ts`);
      - ảnh trong thư ẩn tới khi bấm "Hiện ảnh" (`MailBody.tsx`);
      - nhập 30 ngày / 90 ngày / toàn bộ hộp thư (`ConnectWizard.tsx`).
    - `src/pages/home.ts` theo `Landing`:
      - hero và ảnh minh họa chỉ có thư Gmail; thẻ nổi là một việc cần làm và "Đã trả lời … trong cùng chuỗi thư" (thay lịch hẹn và nhắc nhở);
      - dải "KẾT NỐI VỚI": Gmail, còn Zalo, Messenger, Telegram mang "Sắp có";
      - bento: Hộp thư hợp nhất, Thư mới tự hiện, Trả lời ngay trong Sino, Đọc thư an toàn, Việc cần làm, Lịch hẹn và ghi chú ("Sắp có");
      - Kế hoạch: chỉ có việc cần làm, không gắn tin nhắn;
      - ba bước; quyền riêng tư (bốn mục có thật) + khối "QUYỀN GOOGLE" (D-245: `openid`, `email`, `gmail.readonly`, `gmail.send`, câu Limited Use, link `/privacy#google`);
      - sáu câu hỏi thường gặp bằng `<details>`, câu đầu mở; band.
    - Icon thêm vào `icons.ts`, lấy từ canvas. Hai icon canvas không có (`reply`, `refresh`) lấy từ Lucide.
    - CSS: các khối của trang chủ và các mảnh mượn từ màn app của canvas (`mrow`, `lchip`, `nitem`, `td-row`…). `style=""` gắn thẳng trên thẻ ở canvas chuyển thành lớp (`lp-card is-wide/is-half/is-third`, `lp-split-copy`, `lp-today`…).
  - **Làm khác kế hoạch:**
    - Thanh trên dùng nút menu từ **960 px** trở xuống (kế hoạch: theo canvas, chỉ dưới 720 px). **LÝ DO:** Chrome ở 768 px cho thấy năm link gãy thành 2–3 dòng; canvas không vẽ tablet. Ở 961 px các link vẫn trên một dòng (cao 36 px).
    - Hero và band xếp một cột từ 960 px trở xuống. **LÝ DO:** ở 768 px tiêu đề gãy 6 dòng và khung minh họa chỉ rộng 290 px.
    - `.mrow-sender` được cắt bằng "…" (`overflow: hidden; min-width: 0`). **LÝ DO:** ở 768 px "Phòng khám Ánh Dương" tràn đè lên giờ 08:15.
    - Thêm câu hỏi "Sino có dùng thư của tôi để quảng cáo hay huấn luyện AI không?" và "Ngắt kết nối thì thư đã lưu có bị xóa không?"; câu về thư hẹn giờ thành "Nếu gửi thư bị lỗi giữa chừng thì sao?". **LÝ DO:** D-241, và Google đọc kỹ cách ứng dụng dùng dữ liệu Gmail.
    - Nút "Xem màn Lịch" thành "Mở Việc cần làm" (`appUrl/tasks`). **LÝ DO:** Lịch chưa có backend.
  - **Kiểm chứng (2026-10-13):**
    - RED: lần chạy đầu 15 test trang chủ bị *bỏ qua* chứ không đỏ, vì chưa có `index.html` nên `beforeAll` lỗi → thêm một trang chủ rỗng, chạy lại: 9 đỏ đúng vì thiếu nội dung (kể cả test link nội bộ, vì `/#tinh-nang`… chưa có `id`).
    - GREEN: 58/58 (8 file). `pnpm lint` 0, `pnpm typecheck` 0, `pnpm build:preview` 0.
    - Chrome headless, cả trang ở 1440 / 768 / 390 × dark / light: không cuộn ngang, phông tiếng Việt đã nạp. Ở 390 và 768, bấm menu thì danh sách hiện (`display: flex`). Câu hỏi thường gặp: bấm câu 2 thì mở, bấm câu 1 thì đóng.
    - Lỗi script kiểm (không phải lỗi site): trang cuộn mượt (`scroll-behavior: smooth`) nên ảnh chụp ngay sau `scrollIntoView` còn đang cuộn dở → script tắt cuộn mượt trước khi chụp.

- [x] 2.1b **SI-02R — Trang chủ trên React, chuyển động React Bits theo canvas**
  - **Thực hiện:**
    - Đọc lại bảng D-241 với `tasks.md` của các change trước khi chép chữ của SI-02 (`0793678`).
    - `src/pages/home/`: `Hero`, `ProviderStrip`, `Features`, `Planning`, `HowItWorks`, `Privacy` (+ khối quyền Google D-245), `Faq` (`<details>`), `Band`, `MailRow`.
    - `src/shared/motion/` (D-252), chép từ React Bits rồi cắt theo canvas: `FadeContent`, `MagicBento`, `SpotlightCard`, `AnimatedList`, `BorderGlow`, `useReducedMotion`.
    - Thêm trang chủ vào bảng trang; prerender ghi `index.html`.
  - **Acceptance criteria:**
    - spec *Trang chủ mô tả đúng ứng dụng…* (hai scenario);
    - *Mở trang chủ khi tắt JavaScript*;
    - *Chuyển động theo bản đồ React Bits của canvas* (hai scenario);
    - *Link nội bộ không gãy* cho trang chủ.
  - **Kiểm chứng:**
    - test nội dung trang chủ (chuyển từ `home.test.ts` của SI-02), HTML prerender không ẩn nội dung, thông số chuyển động;
    - lint, typecheck, test, `build:preview`;
    - Chrome 1440 / 768 / 390 × dark / light so với `Landing`, `LandingLight`, `LandingMobile`; một lượt tắt JavaScript; một lượt giảm chuyển động.
  - **Đã làm (2026-10-13, AUTO):**
    - Đọc lại bảng D-241: từ SI-02 (`0793678`) không có commit tính năng nào, nên chữ của SI-02 giữ nguyên.
    - `src/pages/home/`: `HomePage`, `Hero`, `MailRow`, `ProviderStrip`, `Features` (+ `FeatureIcon`, `CardCopy`), `Planning`, `HowItWorks`, `Privacy` (+ khối quyền Google), `Faq`, `Band`, `SectionHead`.
    - `src/shared/motion/`: `FadeContent`, `AnimatedList`, `MagicBento` (+ `MagicBentoCard`), `SpotlightCard`, `BorderGlow`, `motion-values.ts` (`fadeMotion`, `pointerAngle`), `reduced-motion.ts`. Mỗi file ghi nguồn React Bits và phần đã bỏ.
    - Chép từ `sino-web`: `Badge`, `ProviderIcon`. Thêm `ICON` (nét 1.6 như canvas).
    - `index.css`: `animate-enter` (hero, `.anim-enter` của canvas), `animate-row-in`, `animate-fade-in`.
    - Test nhận diện phần tử bằng `data-slot` (`mail-row`, `mail-source`, `provider`, `badge`, `scope`, `cta`) và `data-soon`, thay cho lớp `lp-*` của SI-02.
  - **Làm khác kế hoạch:**
    - FadeContent không ẩn phần tử đã ở trên màn hình (hoặc phía trên) lúc hydrate. **LÝ DO:** HTML prerender đã hiện phần tử đó; bản gốc React Bits ẩn nó trong `useEffect` nên phần tử sẽ nháy. Chrome: lúc mở trang ở 1440, dải "KẾT NỐI VỚI" (top 783) và Tính năng (top 865) để yên, năm khối dưới bị ẩn tới khi cuộn tới. Mở `/#rieng-tu` thì mục đó hiện ngay.
    - Thẻ "Hôm nay" của mục Kế hoạch cũng dùng `MagicBentoCard` (kế hoạch: chỉ 6 thẻ Tính năng). **LÝ DO:** canvas cho thẻ đó lớp `card-bento`, cùng hover với bento.
    - Thẻ "Hộp thư hợp nhất" giữ vệt sáng đứng yên của canvas (`card-spotlight`), không có hover. **LÝ DO:** canvas vẽ như vậy; SpotlightCard chỉ có một chỗ dùng, là khung minh họa ở hero.
    - Tách `fadeMotion` và `pointerAngle` ra `motion-values.ts`. **LÝ DO:** oxlint `only-export-components`.
    - Không làm gsap tải muộn (dynamic import). JS 456 kB (145 kB gzip), trong đó gsap + ScrollTrigger + CustomEase khoảng 140 kB. Ghi lại để cân nhắc ở SI-06.
  - **Kiểm chứng (2026-10-13):**
    - RED: 6 file đỏ (chưa có trang chủ và module chuyển động); test link toàn site đỏ vì 404 trỏ tới `/` chưa có.
    - GREEN: 74/74 (12 file). `pnpm lint` 0 cảnh báo, `pnpm typecheck` 0, `pnpm build:preview` 0 (`dist/index.html` có `data-page="home"`).
    - Chrome headless (CDP, `pnpm serve`):
      - 1440 / 768 / 390 × dark / light: không cuộn ngang, không lỗi console hay hydration, phông tiếng Việt đã nạp;
      - hero 2 cột ở 1440 và 1 cột ở 768/390; bento 12 cột từ 768 và 1 cột ở 390; menu từ dưới 1024;
      - cuộn hết trang thì 0/7 khối còn ẩn; tắt JavaScript thì đủ 7 khối;
      - hover thẻ bento: `translate: 0 -2px`, viền `#4A4A4F`;
      - rê chuột trên khung minh họa: vệt sáng `opacity ≈ 1` đúng chỗ chuột; rê sát mép phải nút "Mở Sino": `--glow-angle: 90deg`, quầng hiện;
      - giảm chuyển động: khối chờ hiện không có `translate` (chỉ mờ), bento không nhấc (chỉ đổi viền), hero dùng `fade-in`, glow chỉ còn viền 1px, vệt sáng không chạy;
      - menu ở 768 mở được; câu hỏi thường gặp bấm câu 2 thì mở, câu 1 thì đóng.
    - Lỗi script kiểm (không phải lỗi site): lượt chụp đầu ở 390 chờ trước khi cuộn nên ảnh bắt lúc khối đang mờ dần. Chụp lại với bước chờ sau khi cuộn thì đúng.
    - File kiến thức phase 1 mục 21.11 + câu 125–128; `.docx` sinh lại, `genoffice docs check` 0 lỗi.
    - File kiến thức phase 1 mục 21.8–21.9 + câu 118–120; `.docx` sinh lại, `genoffice docs check` 0 lỗi.

- [ ] 2.2 **SI-03 — Chính sách quyền riêng tư, tiếng Việt và tiếng Anh**
  - **Thực hiện:**
    - `src/pages/privacy.ts` theo `SitePrivacy` (mục lục, các mục, tóm tắt), nội dung theo mục "Privacy: những gì phải ghi đúng" của `design.md`.
    - Đối chiếu từng câu với các bảng Flyway và code: `CredentialCipher`, BE-33, D-13, F05.
    - Bản `/en/privacy` có cùng nội dung; link đổi ngôn ngữ và `hreflang` (D-243).
    - Bỏ khung "Bản nháp để thiết kế".
  - **Acceptance criteria:** spec *Chính sách quyền riêng tư đáp ứng Limited Use* (hai scenario).
  - **Kiểm chứng:** Chrome 1440 và 390, dark và light; người dùng đọc lại nội dung, nhất là thời hạn xóa 30 ngày.

- [ ] 2.3 **SI-04 — Điều khoản, tiếng Việt và tiếng Anh**
  - **Thực hiện:**
    - `src/pages/terms.ts` theo `SiteTerms`.
    - Bỏ đoạn nói về thư hẹn giờ (chưa có).
    - Báo trước thay đổi lớn 30 ngày; luật Việt Nam; giới hạn trách nhiệm soạn ở mức "dịch vụ cung cấp nguyên trạng", đánh dấu cần người dùng đọc lại.
    - Bản `/en/terms`.
  - **Acceptance criteria:** spec *Các trang của site công khai* cho `/terms`, `/en/terms`; scenario *Link ở thanh trên của trang Điều khoản*.
  - **Kiểm chứng:** Chrome 1440 và 390, dark và light.

- [ ] 2.4 **SI-05 — Bảo mật và Phần mềm nguồn mở**
  - **Thực hiện:**
    - `src/pages/security.ts` theo `SiteSecurity`: chỉ giữ biện pháp có trong code, mỗi câu ghi nguồn đối chiếu ở phần "Đã làm".
    - `src/pages/open-source.ts` theo `SiteOpenSource`: thành phần và giấy phép lấy từ `apps/sino-api/pom.xml` và `apps/sino-web/package.json`; "Xem toàn văn giấy phép" trỏ tới trang giấy phép của từng dự án; bỏ câu "sinh tự động mỗi lần đóng gói".
  - **Acceptance criteria:** spec *Các trang của site công khai* cho `/security`, `/open-source`.
  - **Kiểm chứng:** Chrome 1440 và 390, dark và light.

## 3. Nghiệm thu

- [ ] 3.1 **SI-06 — Nghiệm thu, README, archive**
  - **Thực hiện:**
    - Chrome mọi trang ở 1440 / 768 / 390 × dark / light, không cuộn ngang; ghi chỗ khác canvas.
    - Đọc lại bảng D-241.
    - `pnpm build` với config đủ giá trị (giá trị thử, không commit) xanh; với config thiếu thì đỏ.
    - `README.md`: dựng, xem trước, đưa lên Cloudflare Pages hoặc GitHub Pages, gắn tên miền, xác minh trong Search Console, URL cuối cùng không chuyển hướng (D-248), các ô của consent screen (App home page, Privacy policy, Terms of service, Authorized domains).
  - **Acceptance criteria:** Definition of Done trong `design.md`.
  - **Kiểm chứng:** như trên; sau đó chạy `openspec archive site-public-pages -y`.
