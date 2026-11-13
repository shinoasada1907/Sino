Thứ tự: PP-02 → PP-03 có thể làm trước; PP-01 chờ DN-1; PP-04 chờ PP-01…PP-03 được nghiệm thu và DN-2; PP-05 cùng người dùng. Theo luật dự án: test tay trước, test tự động sau.

## 1. Nội dung Privacy

- [x] 1.1 **PP-01 — Điền chủ sở hữu, nêu Cloudflare** · sino-web (chờ DN-1)
  - `features/public/owner.ts`: 4 giá trị do người dùng đưa; sửa lại chú thích đang nhắc `sino-site` đã xóa.
  - `privacy.vi.tsx`, `privacy.en.tsx`: thêm Cloudflare vào mục bên thứ ba, đổi câu "ngoài hai bên này" (D-466). Quản lý rà câu chữ với cấu hình Cloudflare thật.
  - Kiểm: mở `/privacy`, `/en/privacy` trên Chrome, không còn "[chưa điền"; cập nhật `PrivacyPages.test.tsx` nếu cần.
  - **Thực hiện (sino-web, 2026-11-04):** `owner.ts` điền 4 giá trị do quản lý đưa; `hosting` đổi kiểu thành `{ vi, en } | null` (chỉ trường này theo ngôn ngữ), `OwnerValue` chọn theo `lang`. Chú thích đầu `owner.ts` không còn nhắc `sino-site`. `privacy.vi.tsx`, `privacy.en.tsx`: thêm `<li>` Cloudflare sau nhà cung cấp máy chủ đúng câu chữ quản lý đưa; câu cuối mục đổi "Ngoài các bên trên" / "Apart from these". `package.json`: thêm `--strict` cuối lệnh `build` (D-465); `scripts/prerender.mjs`: thêm câu mốc "Cloudflare" cho hai trang Privacy.
  - **Kiểm chứng:** `pnpm build` xanh với `--strict`; `dist/privacy.html`, `dist/en/privacy.html` 0 chỗ `[chưa điền`, có Cloudflare và câu cuối mới; mục máy chủ trang EN là "a private server run by Sino itself, located in Vietnam", không chữ Việt (chữ Việt còn lại ở trang EN chỉ là link "Tiếng Việt" và tên "Cu Tiến"). Trình duyệt (built-in, server tĩnh): đọc mục `#ben-thu-ba` hai trang đúng chữ, không còn "[chưa điền", ngày "HIỆU LỰC TỪ 04/11/2026". `pnpm lint` 0 lỗi (2 warning có sẵn), `tsc -b` sạch, `pnpm test` 132 file / 1369 test xanh (có 3 test mới: hosting theo ngôn ngữ, Cloudflare ở hai trang). Ảnh chụp màn hình lúc này đen (pane ẩn), nên chỉ xác nhận bằng DOM.

## 2. Tạo sẵn HTML

- [x] 2.1 **PP-02 — Bước prerender trong `pnpm build`** · sino-web
  - Entry SSR render `Landing`, `PrivacyVi`, `PrivacyEn` với router tĩnh (D-460); script Node ghi `dist/home.html`, `dist/privacy.html`, `dist/en/privacy.html`; `dist/index.html` không đổi (D-461).
  - Đặt `<title>`, `lang`, link CSS của trang công khai (D-464).
  - Build lỗi nếu thiếu câu mốc hoặc còn `[chưa điền` (D-465).
  - Sửa component dùng `window`/`document` lúc render nếu có, không đổi hành vi.
  - Kiểm: `pnpm build`, đọc ba file sinh ra; `index.html` vẫn có `#root` rỗng; thử để `owner.ts` có `null` thì build đỏ.
  - **Thực hiện (sino-web, 2026-11-04):** `scripts/prerender.mjs` + `scripts/prerender-html.mjs` (phần thuần, có test), `src/prerender/entry.tsx` (`renderToString` + `StaticRouter`), `features/public/pageTitles.ts` (tiêu đề dùng chung), `build.manifest` trong `vite.config.ts`, `.prerender` vào `.gitignore`. `build` = `tsc -b && vite build && vite build --ssr src/prerender/entry.tsx --outDir .prerender && node scripts/prerender.mjs`; script xóa `dist/.vite` sau khi đọc manifest. Không component nào phải sửa: `window`/`document` chỉ nằm trong effect.
  - **Quyết định nhỏ:** kiểm `[chưa điền` là cờ `--strict` của script, **chưa bật** trong `pnpm build` vì `owner.ts` còn `null` (PP-01). PP-01 thêm `--strict` vào cuối lệnh `build`. Kiểm câu mốc luôn bật (D-465).
  - **Kiểm chứng:** `pnpm build` xanh; 3 file đủ chữ, đúng `<title>`/`lang`/link `PublicPages-*.css`; `dist/index.html` giữ `#root` rỗng. `node scripts/prerender.mjs --strict` với `owner.ts` null: exit 1, nêu `privacy.html` và `en/privacy.html` (4 giá trị); với giá trị giả qua plugin Vite tạm (đã xóa): exit 0, 0 chỗ `[chưa điền`.

- [x] 2.2 **PP-03 — Giữ nguyên trải nghiệm khi có JavaScript** · sino-web
  - Script nội tuyến ẩn nội dung tạo sẵn; `createRoot` thay nội dung như hiện nay, không hydrate (D-463).
  - Kiểm trên Chrome thật qua server tĩnh của `dist` với luật giống Caddy: khách vào `/` thấy trang giới thiệu; đã đăng nhập vào `/` sang `/overview`, trang giới thiệu không lóe lên; `/inbox` vẫn vào app; tắt JavaScript thì ba trang vẫn đọc được chữ; 1440 và 390.
  - Trước khi báo: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`.
  - **Thực hiện:** chèn trong `<head>` của ba file: `<script>classList.add('js')</script>` và `<style>html.js [data-prerendered]{display:none}</style>`; nội dung nằm trong `#root > div[data-prerendered]`, `createRoot` thay đi như cũ (không hydrate).
  - **Kiểm chứng (built-in browser, server tĩnh Node giả luật D-462, `/api/auth/me` giả):** khách vào `/`: trang giới thiệu hiện, `[data-prerendered]` đã bị thay (0 nút), `PublicPages-*.css` nạp. Cookie giả đăng nhập vào `/`: sang `/overview`, trong 160 lần lấy mẫu mỗi 5 ms, h1 trang giới thiệu không hề hiện và nội dung tạo sẵn luôn `display:none`. `/inbox`: vào khung app (`<title>Sino</title>`, 454 byte). Không JavaScript (iframe sandbox không `allow-scripts`) ở 1440 và 390: cả ba trang hiện h1 đủ cỡ chữ, không cuộn ngang. curl cả User-Agent Googlebot: 200, đủ chữ. Giới hạn: không bắt khung hình thật, và `/api` là giả.
  - **Lệnh:** `pnpm lint` 0 lỗi (3 warning có sẵn trong code công khai); `tsc -b` sạch; `pnpm test` 132 file, 1366 test xanh (lần đầu, trước khi chuyển tiêu đề sang `pageTitles.ts`; sau đó chạy lại `scripts` + `features/public`: 45 xanh); `pnpm build` xanh.

## 3. Deploy và nộp lại

- [x] 3.1 **PP-04 — Caddy và nhánh deploy** · quản lý (chờ nghiệm thu PP-01…PP-03, DN-2; người dùng cho phép mới merge, push, deploy)
  - Đối chiếu `Sino-deploy`, `origin/deploy/devtest` và server trước khi đụng tới.
  - `apps/sino-web/Caddyfile`: `/` → `/home.html`; `try_files {path} {path}.html /index.html` (D-462). Build image, chạy thử bằng curl: `/`, `/privacy`, `/en/privacy`, `/inbox`, `/api/auth/me`, không có chuyển hướng dấu `/`. Dọn container sau test.
  - Sau khi deploy: curl trên `daiquangia.io.vn`, cả với User-Agent Googlebot, thấy toàn văn Privacy; kiểm tra Cloudflare không phục vụ bản cũ.
  - **Thực hiện (quản lý, 2026-11-13):** Google vẫn báo Privacy "does not have sufficient content"; curl trang thật ra `<div id="root"></div>` rỗng. `origin/deploy/devtest` (`8b3c5ed`) đã có PP-01…PP-03 qua lần merge `dev` (không cần cherry-pick như DN-2), nhưng `Caddyfile` còn `try_files {path} /index.html` nên bỏ qua file sinh sẵn. Sửa `Caddyfile` trong `../Sino-deploy` (khớp origin, 0/0): `rewrite / /home.html`, `try_files {path} {path}.html /index.html`. Người dùng nghiệm thu ("Commit và push"): commit `0fa6f6c` trên `deploy/devtest`, đã push; workflow `images` dựng image `ghcr.io/.../sino-web` (run 43351589040). Người dùng deploy lên server.
  - **Kiểm chứng trên `daiquangia.io.vn` (2026-11-13, curl User-Agent Googlebot):** `/` 200, 68 KB, tiêu đề trang giới thiệu; `/privacy` 200, 27 KB; `/en/privacy` 200, 25 KB, `lang="en"`, khoảng 1290 từ, có Limited Use, Cloudflare, `gmail.readonly`, 0 chỗ `[chưa điền`; `/inbox` 200 khung app; `/api/auth/me` 401 (backend thật trả lời); `cf-cache-status: DYNAMIC`, không có bản cũ trong cache. **Phát hiện:** Cloudflare *Email Address Obfuscation* đổi email liên hệ trong HTML thành `[email protected]` (chỉ JavaScript mới giải mã ra); người xem có JavaScript vẫn thấy email vì React vẽ lại trang. Tính năng này bật mặc định ở mọi domain Cloudflare, không ai cấu hình nó. Người dùng đã tắt; curl lại lúc 02:55 UTC: `/privacy`, `/en/privacy` có `tienct07@gmail.com` ngay trong HTML (6 chỗ), 0 chỗ `[email protected]`, không còn script giải mã.
  - **Kiểm chứng (image build ở máy, `docker run -p 8099:80`, User-Agent Googlebot):** `/` 200, 68 KB, tiêu đề trang giới thiệu; `/privacy` 200, 26 KB, `lang="vi"`; `/en/privacy` 200, 24 KB, `lang="en"`, khoảng 1290 từ, có câu Limited Use, Cloudflare, email liên hệ, 0 chỗ `[chưa điền`; `/inbox`, `/overview`, `/en` 200 khung app 467 B; `/api/auth/me` 502 (không chạy `sino-api`, log Caddy: không tìm thấy host `sino-api`, đúng là đã chuyển proxy); không chuyển hướng nào. Trình duyệt built-in mở `/en/privacy`: React thay nội dung tạo sẵn (0 nút `[data-prerendered]`), h1 đúng, 12 mục, không tài nguyên lỗi. Đã xóa container và image thử. **CHƯA KIỂM CHỨNG:** người đã đăng nhập vào `/` sang `/overview` với backend thật (đã kiểm ở PP-03 bằng server giả); bản trên `daiquangia.io.vn`, chờ deploy.

- [x] 3.2 **PP-05 — Nộp lại Branding** · người dùng, quản lý hướng dẫn
  - Dùng URL Inspection để đối chiếu, chọn "I have fixed the issues", đọc kết quả.
  - Nếu Google vẫn từ chối: ghi đúng lý do mới vào đây rồi quay lại thiết kế.
  - **Thực hiện (2026-11-13):** người dùng đã chọn "I have fixed the issues" và nộp lại, sau khi Privacy có đủ chữ và email trong HTML gốc (xem PP-04). Không dùng URL Inspection. **Kết quả (2026-11-13, Verification Center):** "Your branding has been verified and is being shown to users." Data access (scope `gmail.send`, `gmail.readonly`) vẫn chưa xác minh; đó là việc riêng, ngoài change này.

- [x] 3.3 **PP-06 — Tài liệu và đóng change** · quản lý
  - Mục mới trong file kiến thức của phase, sinh lại `.docx`, `genoffice docs check`; `PROJECT_STATE.md`; ghi WP-04 đã có phần `owner.ts`; `openspec archive public-pages-prerender -y`.
