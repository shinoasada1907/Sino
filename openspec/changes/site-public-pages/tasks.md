# Site công khai cho thẩm định OAuth của Google · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng duyệt thiết kế 2026-10-13 ("duyệt"): D-240…D-247; D-248, D-249 agent chốt.
> Mỗi task gồm:
> - test viết trước (đỏ rồi xanh);
> - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:preview` trong `apps/sino-site`;
> - đối chiếu canvas; Chrome một lượt ở các cỡ task đụng tới;
> - file kiến thức phase 1 + `.docx`, `genoffice docs check`;
> - commit riêng trên `dev`, không push.

## 1. Nền

- [x] 1.1 **SI-01 — Gói `apps/sino-site`, cấu hình, khung trang, CSS, phông, dựng và xem, trang 404**
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

## 2. Các trang

- [ ] 2.1 **SI-02 — Trang chủ**
  - **Thực hiện:**
    - Đọc lại bảng sự thật D-241 với `tasks.md` của các change ngay trước khi viết.
    - `src/pages/home.ts` theo `Landing`: hero và ảnh minh họa chỉ có Gmail, dải "KẾT NỐI VỚI", bento tính năng, kế hoạch, ba bước, quyền riêng tư cùng khối quyền Google (D-245), câu hỏi thường gặp bằng `<details>`, lời kêu gọi cuối (D-246).
    - Thêm vào `site.css` các lớp của trang chủ.
  - **Acceptance criteria:** spec *Trang chủ mô tả đúng ứng dụng và lý do xin dữ liệu Google* (hai scenario); scenario *Mở trang chủ khi tắt JavaScript*.
  - **Kiểm chứng:** Chrome 1440 / 768 / 390, dark và light, so với `Landing`, `LandingLight`, `LandingMobile`; menu mobile mở và đóng được; không cuộn ngang.

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
