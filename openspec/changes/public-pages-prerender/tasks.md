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

- [ ] 3.1 **PP-04 — Caddy và nhánh deploy** · quản lý (chờ nghiệm thu PP-01…PP-03, DN-2; người dùng cho phép mới merge, push, deploy)
  - Đối chiếu `Sino-deploy`, `origin/deploy/devtest` và server trước khi đụng tới.
  - `apps/sino-web/Caddyfile`: `/` → `/home.html`; `try_files {path} {path}.html /index.html` (D-462). Build image, chạy thử bằng curl: `/`, `/privacy`, `/en/privacy`, `/inbox`, `/api/auth/me`, không có chuyển hướng dấu `/`. Dọn container sau test.
  - Sau khi deploy: curl trên `daiquangia.io.vn`, cả với User-Agent Googlebot, thấy toàn văn Privacy; kiểm tra Cloudflare không phục vụ bản cũ.

- [ ] 3.2 **PP-05 — Nộp lại Branding** · người dùng, quản lý hướng dẫn
  - Dùng URL Inspection để đối chiếu, chọn "I have fixed the issues", đọc kết quả.
  - Nếu Google vẫn từ chối: ghi đúng lý do mới vào đây rồi quay lại thiết kế.

- [ ] 3.3 **PP-06 — Tài liệu và đóng change** · quản lý
  - Mục mới trong file kiến thức của phase, sinh lại `.docx`, `genoffice docs check`; `PROJECT_STATE.md`; ghi WP-04 đã có phần `owner.ts`; `openspec archive public-pages-prerender -y`.
