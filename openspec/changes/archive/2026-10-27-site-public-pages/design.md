# Site công khai cho thẩm định OAuth của Google · Technical Design

> Mode: **HYBRID**, frontend AUTO. Người dùng 2026-10-13 chốt bốn câu hỏi trong chat:
> - tên miền: "Đã có tên miền", còn giá trị thì "Điền sau";
> - cách dựng: "Site tĩnh riêng";
> - nội dung: "Đúng hiện trạng";
> - ngôn ngữ: "Tiếng Việt + Privacy/Terms tiếng Anh";
> - phạm vi: "theo design đi đã có landing page rồi đó";
> - host: "Chưa chọn, làm trang trước".
>
> Sau đó người dùng duyệt thiết kế trình bày trong chat ("duyệt"). D-240…D-247 là **người dùng duyệt**; D-248, D-249 là agent chốt trong phạm vi đó.
>
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `Landing` (+ `LandingLight`, `LandingMobile`, `LandingMobileLight`), `SitePrivacy`, `SiteTerms`, `SiteSecurity`, `SiteOpenSource`, `SiteNotFound` (mỗi trang có bản Light và Mobile). Đối chiếu link ngày 2026-10-13: phiên bản `1790948862-287a`, trùng bản sao.

## Context

**Google đòi gì** ([Help Center: homepage](https://support.google.com/cloud/answer/13807376), [Verification requirements](https://support.google.com/cloud/answer/13464321)):

- Trang chủ đặt trên tên miền mình sở hữu, đã xác minh trong Search Console. Không host ở nền tảng bên thứ ba mà không chứng minh được quyền sở hữu subdomain (ví dụ Google Sites).
- URL cố định, không chuyển hướng sang URL hay tên miền khác. Không dùng link rút gọn.
- Xem được không cần đăng nhập; responsive.
- Mô tả đúng ứng dụng và thương hiệu, đủ tính năng, và nói rõ vì sao xin dữ liệu người dùng.
- Trang chủ có link tới Chính sách quyền riêng tư. Link đó trùng URL khai trên consent screen, đặt cùng tên miền với trang chủ.
- Scope restricted (`gmail.readonly`): Google đọc kỹ Privacy để kiểm tra yêu cầu Limited Use, và đòi video demo.

**Sino hôm nay:**

- Chưa có trang công khai và chưa deploy ở đâu cả.
- `sino-web` có `/login` (email + mật khẩu của một chủ sở hữu duy nhất, D-33, BCrypt) và mọi trang khác sau `RequireAuth`; `/` chuyển hướng.
- Gmail xin `openid`, `email`, `gmail.readonly`, `gmail.send` (`GmailProvider.SCOPES`).
- Token mã hóa AES-256-GCM, khóa đọc từ cấu hình chứ không nằm trong database (`CredentialCipher`, D-11).
- Ngắt kết nối thì token bị thu hồi ở Google (BE-33) và xóa hẳn khỏi database. Bản ghi tài khoản được xóa mềm (D-13 = B). Thư đã lưu vẫn còn nhưng không hiện ở Hộp thư (F05 design). Chưa có chức năng xuất hay xóa toàn bộ dữ liệu.

**Canvas:** đã có HTML và CSS của các trang công khai (lớp `lp-*`, `doc-*`, `oss`, `nf` trong `sino.css`), dark mặc định và light, 1440 và 390 px. Chữ trên canvas là chữ của sản phẩm hoàn chỉnh: có Zalo, Messenger, hẹn giờ gửi, tạm ẩn, thông báo, xuất/xóa dữ liệu, danh tính. Privacy và Terms là bản nháp có chỗ `[ngoặc vuông]`.

## Decisions

### D-240 — Site tĩnh riêng `apps/sino-site`, ~~HTML thuần không cần JavaScript~~ HTML dựng sẵn · **Người dùng duyệt**

> **Thay một phần bởi D-250 (2026-10-13).** Gạch phần "HTML thuần, không cần JavaScript". **LÝ DO:** người dùng thay site tĩnh bằng template Vite + React và yêu cầu landing "sử dụng react-bit theo như design". Phần còn lại vẫn giữ: gói riêng, `dist/` tĩnh, nội dung nằm sẵn trong HTML.

- Gói pnpm riêng, không phụ thuộc `sino-web`. ~~Kết quả là thư mục `dist/` chỉ gồm HTML, CSS, phông chữ và favicon.~~ Kết quả là thư mục `dist/` tĩnh: HTML dựng sẵn, CSS, JS, phông chữ và favicon (D-250). Đưa lên host tĩnh nào cũng chạy được, không chờ deploy app.
- Nội dung nằm sẵn trong HTML, nên Google và trình duyệt tắt JavaScript đều đọc được.
- Sau này app ở tên miền con (ví dụ `app.<tên miền>`), site ở tên miền gốc. Cùng một tên miền được xác minh nên dùng chung "Authorized domains" trên consent screen.

**Phương án bị loại:**
- Trang công khai trong `sino-web`: phải đổi `/` của app, phải deploy cả app, và nên prerender ra HTML. Ngoài ra phải sửa `router.tsx`, file các phiên khác đang dùng.

### D-241 — Chữ đúng hiện trạng · **Người dùng duyệt**
Giữ bố cục, thứ tự mục và giao diện của canvas. Chữ chỉ khẳng định điều đang chạy thật trên backend và web. Tính năng chưa chạy thì ghi "Sắp có" (như canvas ghi với Telegram) hoặc bỏ đi.

Bảng dưới là sự thật ngày 2026-10-13, lấy từ `tasks.md` của các change. Phải đọc lại ở SI-02 và trước khi đưa lên mạng, vì tính năng tiếp tục vào.

| Trên canvas | Hôm nay | Trên site |
|---|---|---|
| Kết nối Gmail qua trang Google, nhiều tài khoản | Chạy (F04a, BE-34 thật) | Khẳng định |
| Hộp thư chung, lọc | Chạy (F05) | Khẳng định, chỉ nêu bộ lọc có thật |
| Đọc cả cuộc trò chuyện, tệp đính kèm | Chạy (F06) | Khẳng định |
| Tin mới tự hiện, không tải lại trang | Chạy (F07, F08) | Khẳng định |
| Trả lời ngay trong Sino, không gửi trùng | Chạy (F10) | Khẳng định |
| Việc cần làm: hạn, lặp lại | Chạy (F16, FE-70, FE-71) | Khẳng định |
| Lịch hẹn | Màn trên dữ liệu mẫu, chưa có backend (BE-73) | "Sắp có" |
| Ghi chú | Backend đang làm (F15) | "Sắp có" |
| Từ tin nhắn thành việc / lịch / ghi chú, nhắc nhở | Chưa có | "Sắp có" |
| Hẹn giờ gửi, tạm ẩn, thông báo trình duyệt | Chưa có | Bỏ thẻ hoặc "Sắp có" |
| Zalo, Messenger, Telegram | Chưa có | "Sắp có" |
| Xuất / xóa toàn bộ dữ liệu bằng một nút | Chưa có | Bỏ; Privacy ghi "gửi email yêu cầu" |
| "Biết ai dùng danh tính của bạn" (48 website) | Chưa có | Bỏ |

- Ảnh minh họa trên trang chủ (`lp-shot`, `lp-mini`, thẻ việc hôm nay) chỉ dùng dòng Gmail và nhãn của tính năng đang chạy.
- Câu hỏi thường gặp được viết lại theo bảng trên.

**Phương án bị loại:**
- Giữ y chữ canvas: Google so trang chủ với video demo và so Privacy với hành vi thật, mô tả sai thì dễ bị từ chối.

### D-242 — Thông tin chưa có nằm ở `site.config.ts`; bản dựng để đưa lên mạng dừng khi thiếu · **Người dùng duyệt**

```ts
export interface SiteConfig {
  siteUrl: string | null       // https://<tên miền>, không có "/" cuối
  appUrl: string | null        // URL của app; "Đăng nhập" trỏ tới appUrl + "/login"
  contactEmail: string | null  // email liên hệ và nhận yêu cầu xóa dữ liệu
  owner: string | null         // người hoặc pháp nhân đứng tên
  effectiveDate: string | null // ngày hiệu lực của Privacy và Terms, YYYY-MM-DD
  hosting: string | null       // nhà cung cấp máy chủ và nơi đặt dữ liệu, viết trong Privacy
}
```

- `pnpm build` là bản dựng để đưa lên mạng. Còn giá trị `null` thì dừng với mã thoát khác 0 và liệt kê tên từng trường còn thiếu.
- `pnpm build:preview` dựng được cả khi thiếu, để xem trước:
  - chỗ thiếu hiện thành `[chưa điền: email liên hệ]` với lớp `ph` của canvas;
  - mọi trang có `<meta name="robots" content="noindex">`, phòng khi lỡ đưa bản xem trước lên mạng.
- Không có giá trị nào bị đoán hay điền sẵn.

### D-243 — Ngôn ngữ: site tiếng Việt; Privacy và Terms có thêm bản tiếng Anh · **Người dùng duyệt**
- `/privacy` và `/terms` là tiếng Việt; `/en/privacy` và `/en/terms` là bản tiếng Anh cùng nội dung, phòng khi người duyệt của Google yêu cầu. Đây là khả năng, không phải quy định bắt buộc.
- Hai bản link qua lại bằng `hreflang` trong `<head>` và một link đổi ngôn ngữ thay cho nút "VI ▾" của canvas ở chân trang. Trang không có bản tiếng Anh thì không hiện nút đổi ngôn ngữ.
- Câu Limited Use giữ nguyên văn tiếng Anh của Google trong cả hai bản; bản tiếng Việt có thêm câu dịch.

### D-244 — Các trang: các trang công khai của canvas, trừ Đăng nhập · **Người dùng duyệt**

> **Sửa bởi D-253 (2026-10-13):** ~~`/` = `Landing`, trang chủ khai với Google~~ → `/` là trang thương hiệu của nhà Sino; `Landing` (Sino Messages) ở `/messages` và đó là App home page khai với Google. **LÝ DO:** sẽ có thêm sản phẩm Sino, site này là site chung.

| Đường dẫn | Canvas | Ghi chú |
|---|---|---|
| `/` | (không có; ghép từ khối canvas, D-253) | Trang thương hiệu nhà Sino |
| `/messages` | `Landing` | Trang Sino Messages, App home page khai với Google |
| `/privacy`, `/en/privacy` | `SitePrivacy` | Chính sách quyền riêng tư khai với Google |
| `/terms`, `/en/terms` | `SiteTerms` | Ô Terms (tùy chọn) trên consent screen |
| `/security` | `SiteSecurity` | |
| `/open-source` | `SiteOpenSource` | Danh sách lấy từ `pom.xml` và `package.json` thật |
| `404.html` | `SiteNotFound` | Host tĩnh trả trang này cho đường dẫn không có |

- `SiteLogin` thuộc app (`sino-web` đã có `/login`), không nằm ở site.
- ~~Các link trong mục "Tính năng", "Kế hoạch"… ở thanh trên của trang con trỏ về `/#tinh-nang`…, thay cho `Landing.dc.html` trần của canvas.~~ → thanh trên hai kiểu (D-254). **LÝ DO:** D-253.

### D-245 — Trang chủ có khối "Sino xin quyền gì từ Google" · **Người dùng duyệt**
- Đặt trong mục "Quyền riêng tư" (`#rieng-tu`), sau bốn thẻ của canvas: một danh sách bốn dòng, mỗi dòng gồm scope, tên dễ hiểu và lý do.
  - `openid`, `email`: biết tài khoản Gmail nào vừa kết nối.
  - `gmail.readonly`: đọc thư để hiện trong hộp thư chung.
  - `gmail.send`: gửi thư trả lời khi bạn bấm Gửi.
- Kèm một câu Limited Use ngắn và link tới `/privacy#google`.
- Trên canvas không có khối này. Google bắt trang chủ nói rõ vì sao xin dữ liệu, nên thêm khối này mà không đổi giao diện các thẻ của canvas: dùng lại `lp-priv-item` và `t-mono`.

### D-246 — Nút "Bắt đầu" thành "Đăng nhập" / "Mở Sino", trỏ tới `appUrl` · **Người dùng duyệt**
- App chưa có đăng ký tài khoản, nên "Bắt đầu" và "Bắt đầu với Sino" của canvas trỏ đi đâu cũng sai.
- Khi chưa có đăng ký:
  - ~~nút chính ghi "Mở Sino" và trỏ `appUrl + "/login"`;~~ nút chính ghi "Mở Sino" và trỏ `appUrl + "/"` (SI-01). **LÝ DO:** thanh trên có cả "Đăng nhập" lẫn "Mở Sino"; nếu hai nút cùng trỏ `/login` thì một nút thừa. App tự chuyển tới `/login` khi chưa đăng nhập, và vào thẳng Tổng quan khi đã đăng nhập;
  - nút phụ giữ như canvas ("Xem cách hoạt động", "Đăng nhập");
  - trang 404 giữ "Mở Sino".
- Khi app có đăng ký thì đổi lại chữ của canvas, trong một change khác.

### D-247 — Phông tự host, theme theo hệ điều hành, ~~không JavaScript~~ không tải gì từ site khác · **Người dùng duyệt**
- **Phông:** Inter và JetBrains Mono, bản variable `woff2`, ~~chép từ `@fontsource-variable/*` vào `dist/fonts` lúc dựng~~ import `@fontsource-variable/*` như `sino-web`, Vite đóng gói vào `dist/assets` (D-250). Không gọi Google Fonts như canvas `<helmet>`, nên Privacy nói đúng được rằng site không gửi gì cho bên thứ ba.
- **Theme:** biến màu `.theme-dark` của canvas là mặc định. `@media (prefers-color-scheme: light)` đổi sang biến của `.theme-light`. Canvas không có nút đổi theme trên trang công khai, nên site cũng không có.
- **Câu hỏi thường gặp:** `<details>` / `<summary>`, câu đầu mở sẵn như canvas.
- **Menu trên màn hẹp:** `<details>` với `<summary>` là nút menu (`aria-label="Mở menu"`); bấm thì danh sách hiện. Có JavaScript thì bấm một link sẽ đóng menu.
- ~~**Không có thẻ `<script>`.**~~ **Không tải script, stylesheet, phông hay ảnh từ tên miền khác.** **LÝ DO:** D-250 dùng React, nên trang có script của chính site.

### D-248 — Đường dẫn dạng thư mục; URL nộp cho Google là URL trình duyệt hiện sau khi chọn host · **Agent chốt**
- Script dựng ghi `privacy/index.html`, `en/privacy/index.html`… nên `/privacy` chạy trên mọi host tĩnh.
- Mỗi host xử lý dấu `/` cuối khác nhau: GitHub Pages chuyển `/privacy` sang `/privacy/`, Cloudflare Pages làm ngược lại. Google cấm URL chuyển hướng, nên sau khi chọn host, README dặn mở từng URL, lấy đúng URL thanh địa chỉ hiện ra rồi mới khai trên consent screen.
- Link nội bộ của site viết theo URL không có `/` cuối (`/privacy`).
- `<link rel="canonical">` dùng `siteUrl`.

**Phương án bị loại:**
- Ghi `privacy.html`: Cloudflare Pages lại chuyển hướng `.html` sang đường dẫn không đuôi.

### ~~D-249 — Script TypeScript chạy thẳng bằng Node, mỗi trang là một hàm trả về HTML~~ · **Agent chốt** · thay bởi D-250

> **LÝ DO:** người dùng đổi sang React (2026-10-13). Phần còn dùng: `scripts/build.ts` chạy thẳng bằng `node`, thanh trên và chân trang viết ở một chỗ, giá trị từ config được escape (React tự làm).
- `scripts/build.ts` chạy bằng `node` (Node 26 tự bỏ kiểu TypeScript). Mỗi trang là một hàm `(ctx) => string` trong `src/pages/`.
- `src/layout.ts` dựng `<head>`, thanh trên, chân trang dùng chung, nên thanh trên và chân trang chỉ viết ở một chỗ.
- Mọi giá trị từ config đi qua hàm `escapeHtml`.
- `src/icons.ts` giữ SVG Lucide chép từ canvas.

**Phương án bị loại:**
- React `renderToStaticMarkup`: cần thêm bước biên dịch TSX cho một site không có tương tác.
- Vite nhiều trang: không có cách ghép thanh trên và chân trang dùng chung nếu không thêm plugin.
- Viết tay tám file HTML: thanh trên và chân trang lặp lại tám lần.

### D-250 — React 19 + Vite, prerender ra HTML rồi hydrate · **Người dùng chốt** (2026-10-13, "Prerender + hydrate")
Người dùng thay site tĩnh SI-01/SI-02 bằng template Vite + React và yêu cầu landing "sử dụng react-bit theo như design".

- **Dựng:** `scripts/build.ts` (chạy thẳng bằng `node`) gọi API của Vite hai lần:
  - bản client: `index.html` + `src/entry-client.tsx` → `dist/` (JS, CSS, phông, favicon);
  - bản SSR: `src/entry-server.tsx` → thư mục tạm.
- **Prerender:** script nạp bản SSR, render từng trang bằng `react-dom/server`, rồi ghi vào khung `dist/index.html`:
  - `index.html` (trang chủ) và `404.html`;
  - `<head>` có title, description, canonical, `noindex` (404 và bản xem trước);
  - `<div id="root" data-page="…">` chứa HTML của trang.
- **Hydrate:** trình duyệt nạp `entry-client.tsx`, gọi `hydrateRoot` cho đúng trang ghi ở `data-page`. Không dùng react-router: site gồm các trang tĩnh, link là `<a>` thường.
- **Config (D-242 giữ nguyên):**
  - Script đọc `site.config.ts`, kiểm `configProblems`. Bản `build` còn thiếu thì dừng trước khi gọi Vite.
  - Giá trị config, chế độ dựng và năm bản quyền được đưa vào cả hai bản bằng `define` (`__SITE_DATA__`). Nhờ vậy HTML của server và của client giống hệt nhau.
- **`pnpm dev`:** Vite dev server render ở client, dùng `site.config.ts` ở chế độ xem trước, để sửa giao diện.
- **Không JavaScript:** trang đọc được đủ vì HTML có sẵn. Chuyển động chỉ ẩn phần tử sau khi hydrate, và chỉ phần tử dưới màn đầu (D-252).
- **`pnpm serve`:** giữ `scripts/serve.ts` của SI-01 (trả `404.html` như host tĩnh).

**Phương án bị loại:**
- SPA thuần (template Vite giữ nguyên): `index.html` chỉ có `<div id="root">`, tắt JavaScript thì trang trắng. Google bắt trang chủ mô tả ứng dụng và có link Privacy, nên không dựa vào việc Google chạy JavaScript.
- `vite-react-ssg` hay framework (Astro, Next): thêm phụ thuộc lớn cho hai trang; script tự viết khoảng 80 dòng.

### D-251 — Style như `sino-web`: Tailwind 4, token canvas, `cn`/`cva`, `lucide-react` · **Người dùng chốt** (2026-10-13, "làm giống bên sino-web đi")
- `src/index.css` chép phần token của `sino-web/src/index.css`:
  - biến màu canvas, `@theme inline`, `bg-dots`;
  - khác `sino-web`: dark là mặc định, light theo `prefers-color-scheme` (giữ D-247), không có class `theme-*`.
- `Button` (`buttonVariants`), `Badge`, `SinoMark` chép từ `sino-web/src/shared/ui`. Bỏ `asChild` / `radix-ui`: site chỉ cần link mang dáng nút (`<a className={buttonVariants(…)}>`).
- `cn` từ `src/shared/lib/utils.ts` như `sino-web`, cùng luật oxlint chặn import `cn` trần.
- Icon: `lucide-react` với `strokeWidth={1.6}` như canvas; dấu Zalo / Messenger / Telegram lấy từ `sino-web` `provider-icon.tsx`.
- Điểm gãy mặc định của Tailwind như `sino-web`: `md` = 768px, `lg` = 1024px. Khác SI-02: menu dùng nút dưới 1024px (SI-02: dưới 960px).
- `styles/site.css` của SI-01/SI-02 chuyển thành class Tailwind trong component; phần lặp lại nhiều (hàng thư, thẻ) thành component.

### D-252 — Chuyển động: React Bits theo bản đồ của canvas · **Người dùng chốt** (2026-10-13, "Theo bản đồ canvas")
Nguồn: canvas "Foundations · Chuyển động" (`Motion`, `MotionSpec`):
- Mỗi hiệu ứng React Bits có đúng một chỗ dùng.
- Thời lượng 160–240ms, `ease.out` = `cubic-bezier(.2,.8,.2,1)`.
- Không có gì tự chạy lặp lại.
- Khi giảm chuyển động: bỏ mọi dịch chuyển, chỉ giữ mờ dần ≤160ms.

Mã React Bits (reactbits.dev, bản TS-TW) được chép vào `src/shared/motion/` rồi cắt theo luật đó. Bỏ `@hugeicons`, palette nhiều màu, grain, hạt, tia sáng, tilt, magnetism.

| Hiệu ứng | Chỗ dùng | Quy tắc | Khi giảm chuyển động |
|---|---|---|---|
| Vào trang (CSS, `.anim-enter` của canvas) | Hero: chữ, nút, khung minh họa, trễ 0/40/80ms | Mờ dần + 6px, 240ms, chạy ngay từ HTML, không chờ JS | Chỉ mờ dần |
| **AnimatedList** | Các dòng thư trong khung minh họa ở hero | Mỗi dòng trễ 40ms, tối đa 6 dòng; CSS nên không chờ JS | Hiện ngay, chỉ mờ |
| **FadeContent** (gsap + ScrollTrigger) | Mỗi mục dưới hero khi cuộn tới | Mờ dần + 6px, 240ms, một lần | Chỉ mờ, 160ms |
| **MagicBento** | 6 thẻ "Tính năng" | Nhấc 2px, viền đậm khi hover; không hạt, không tia sáng | Chỉ đổi viền |
| **SpotlightCard** | Khung minh họa hộp thư ở hero | Vệt sáng 6–11% theo chuột, chỉ khi hover hoặc focus | Vệt sáng đứng yên |
| **BorderGlow** | Nút "Mở Sino" ở hero và band | Viền sáng 1px, quầng ≤24px theo hướng chuột khi hover; đủ vòng khi focus | Chỉ viền |

- **Không dùng:**
  - DotGrid: nền chấm đứng yên, nên dùng utility `bg-dots` như `sino-web`;
  - CountUp: landing không có số liệu;
  - DecryptedText: canvas chỉ cho dùng ở Onboarding;
  - LogoLoop hay vòng lặp nào: mục "Không làm" của canvas.
- **Hero không dùng FadeContent:** FadeContent ẩn phần tử trong `useEffect`. Hero đã hiện từ HTML nên sẽ nháy (hiện → ẩn → hiện).
- **Giấy phép:** React Bits là MIT + Commons Clause, cho dùng trong sản phẩm, chỉ cấm bán lại chính các component. Mỗi file chép ghi nguồn ở đầu.

**Phương án bị loại:**
- Hiệu ứng mạnh hơn canvas (DotGrid theo chuột, MagicBento có hạt, SplitText ở hero): trái mục "Không làm".
- Cài nguyên bản React Bits qua `shadcn add`: kéo `@hugeicons`, palette tím-hồng, theme riêng, không theo token canvas.

### D-253 — Site chung của nhà Sino: `/` là trang thương hiệu, Sino Messages ở `/messages` · **Người dùng chốt** (2026-10-13, "/ thương hiệu, /messages sản phẩm"; "Trang thương hiệu tối giản"; duyệt "oke duyệt")
Người dùng: sau này sẽ có nhiều sản phẩm Sino, và landing (cùng admin) phải dùng chung cho các sản phẩm.

- **`/`, trang thương hiệu tối giản:**
  - hero ("SINO", một câu về nhà Sino), một thẻ lớn cho mỗi sản phẩm (hôm nay chỉ Sino Messages: mô tả ngắn, "Xem Sino Messages" → `/messages`, "Mở ứng dụng" → `appUrl`), chân trang chung;
  - ghép từ khối canvas có sẵn (canvas chưa vẽ trang này); không hứa sản phẩm chưa có (D-241);
  - thêm sản phẩm = thêm một thẻ.
- **`/messages`:** toàn bộ trang chủ của SI-02R chuyển sang (`messages/index.html`, D-248). Đây là **App home page** khai với Google, vì Google đòi trang chủ khai trên consent screen mô tả đúng ứng dụng.
- **Trang chung cho cả nhà Sino:** `/privacy`, `/terms` (và bản `/en/`), `/security`, `/open-source`, `404.html`. Privacy có mục riêng cho Sino Messages, giữ `#google` (SI-03).
- **Consent screen:** App home page `https://<tên miền>/messages`, Privacy policy `/privacy`, Terms `/terms`. URL đã khai thì không đổi khi thêm sản phẩm.
- **Config:** `appUrl` giữ tên, nghĩa là URL app Sino Messages. Khi có sản phẩm thứ hai mới đổi thành danh sách theo sản phẩm.

**Phương án bị loại:**
- Giữ `/` là Sino Messages, tách khi có sản phẩm thứ hai: URL đã khai với Google phải đổi và khai lại.
- Mỗi sản phẩm một subdomain landing: phải xác minh và cấu hình host cho từng subdomain.
- `/` chuyển hướng sang `/messages`: cần host có chuyển hướng (GitHub Pages không có).

### D-254 — Thanh trên hai kiểu: trang sản phẩm và trang chung · **Người dùng duyệt** (thiết kế 2026-10-13)
- **Trang sản phẩm (`/messages`):** như SI-02R. Các mục Tính năng, Kế hoạch, Cách hoạt động, Quyền riêng tư, Câu hỏi trỏ `/messages#…`; nút "Đăng nhập" (`appUrl/login`) và "Mở Sino Messages" (`appUrl/`). Menu điện thoại có các mục đó.
- **Trang chung (`/`, Privacy, Terms, Bảo mật, Nguồn mở, 404):** logo Sino → `/`; link "Sino Messages" → `/messages`; nút "Mở Sino Messages" (`appUrl/`). Menu điện thoại có link sản phẩm.
- **Chân trang chung cho mọi trang:**
  - SẢN PHẨM: Sino Messages;
  - TIN CẬY: Bảo mật, Câu hỏi thường gặp (`/messages#cau-hoi`);
  - PHÁP LÝ: Điều khoản, Chính sách quyền riêng tư, Phần mềm nguồn mở.
- Mỗi trang khai thanh trên của mình trong bảng trang (`PageMeta.nav`: `product` hoặc `family`).
- "Mở Sino" ở 404 và ở band thành "Mở Sino Messages". **LÝ DO:** khi có nhiều sản phẩm, "Mở Sino" không nói mở cái gì.

## Cấu trúc

> ~~Cấu trúc site tĩnh của SI-01 (`src/html.ts`, `src/layout.ts`, `styles/site.css`, `src/pages/*.ts`)~~ → cấu trúc React dưới đây (D-250, D-251). **LÝ DO:** người dùng đổi sang React (2026-10-13).

```text
apps/sino-site/
  package.json          dev, build, build:preview, serve, test, lint, typecheck
  site.config.ts        SiteConfig (D-242)
  index.html            khung: <!--app-head-->, <div id="root"><!--app-html--></div>
  vite.config.ts        react(), tailwindcss(), alias @, vitest
  src/
    entry-client.tsx    hydrateRoot / createRoot (dev)
    entry-server.tsx    renderPage(pageId, site) → { lang, head, html }
    index.css           Tailwind + token canvas (D-251)
    site/               config.ts (configProblems), site.tsx (SiteData, useSite), pages.ts (bảng trang), document.ts
    layout/             PageFrame, SiteHeader, SiteFooter
    pages/home/         Hero, ProviderStrip, Features, Planning, HowItWorks, Privacy, Faq, Band, MailRow
    pages/NotFoundPage.tsx
    shared/ui/          button, badge, sino-mark, provider-icon (từ sino-web)
    shared/lib/         utils.ts (cn), static-files.ts
    shared/motion/      FadeContent, MagicBento, SpotlightCard, AnimatedList, BorderGlow, useReducedMotion
  public/favicon.svg    logo S2 như sino-web
  scripts/build.ts      config → Vite client + SSR → prerender → dist/: index.html, 404.html, assets/
  scripts/serve.ts      phục vụ dist/ ở localhost, trả 404.html như host tĩnh
  test/
  README.md
```

## Nội dung bắt buộc cho Google, và trang nào đáp ứng

| Yêu cầu | Đáp ứng ở |
|---|---|
| Trang chủ xem được không cần đăng nhập, URL không chuyển hướng | ~~`/` là `index.html` tĩnh~~ `/messages` là `messages/index.html` tĩnh (D-240, D-248, D-253) |
| Mô tả ứng dụng và tính năng | Trang `/messages`, theo bảng D-241 |
| Vì sao xin dữ liệu Google | Khối D-245; Privacy mục "Dữ liệu nhận từ Google" |
| Link tới Privacy từ trang chủ | Chân trang ("Chính sách quyền riêng tư") và khối D-245 của `/messages`, nằm trong HTML gốc |
| Privacy cùng tên miền | `/privacy` trên cùng site |
| Limited Use | Privacy `#google`: câu nguyên văn tiếng Anh, link tới [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) |
| Responsive | Bố cục canvas 1440 / 768 / 390 px |

## Privacy: những gì phải ghi đúng

- **Sino lưu gì:**
  - tài khoản Sino: email, tên hiển thị, mật khẩu chỉ lưu dạng băm BCrypt;
  - tài khoản Gmail đã kết nối: địa chỉ, quyền đã cấp, token mã hóa;
  - thư: nội dung, người gửi, người nhận, thời gian, ~~HTML đã làm sạch~~ HTML như nhận từ Gmail, thông tin tệp đính kèm. **LÝ DO (SI-03):** code lưu HTML gốc và chỉ làm sạch lúc hiện (`MessageBodies` gọi `MailHtml.clean(stored.html())`). Nội dung tệp đính kèm không lưu, mỗi lần mở mới lấy từ Gmail (`MessageFiles`);
  - dữ liệu bạn tạo: việc cần làm.

  Đối chiếu lại với các bảng của Flyway lúc viết. Ghi chú và lịch chỉ thêm vào khi đã có.
- **Dùng dữ liệu để làm gì:** hiện hộp thư; gửi thư chỉ khi người dùng bấm Gửi; không quảng cáo, không bán, không chuyển cho bên khác. Không dùng dữ liệu Google để huấn luyện mô hình AI hay học máy.
- **Không ai đọc dữ liệu của bạn**, trừ khi bạn đồng ý, khi cần cho bảo mật (điều tra lạm dụng), hoặc khi luật bắt buộc. Đây là ba ngoại lệ Limited Use cho phép.
- **Bên thứ ba:** Google (trong phạm vi quyền đã cấp); nhà cung cấp máy chủ (`hosting`). Không còn ai khác. Site không tải phông hay script từ bên ngoài.
- **Giữ và xóa:**
  - ngắt kết nối thì token bị thu hồi và xóa hẳn;
  - thư đã lưu vẫn giữ (ẩn), để kết nối lại không phải tải lại;
  - muốn xóa hẳn thì gửi email tới `contactEmail`, và Sino xóa trong 30 ngày.

  Thời hạn 30 ngày là cam kết của chủ sở hữu, người dùng duyệt ở SI-03.
- **Thu hồi quyền:** ngắt kết nối trong Sino, hoặc vào [myaccount.google.com/permissions](https://myaccount.google.com/permissions).
- **Liên hệ:** `owner`, `contactEmail`. **Hiệu lực:** `effectiveDate`.

## Kiểm chứng

- **Test viết trước, đỏ rồi xanh** (vitest, parse bằng jsdom):
  - `configProblems` và hai chế độ dựng;
  - HTML prerender của từng trang (`renderDocument`, không cần dựng Vite): trang nào cũng có `lang`, `<title>`, mô tả, viewport, canonical (trừ 404);
  - trang chủ có `<a href="/privacy">` trong HTML gốc;
  - nội dung không bị ẩn trong HTML (không `opacity: 0` hay `visibility: hidden` nằm sẵn), để tắt JavaScript vẫn đọc được (D-250, D-252);
  - mọi `href` nội bộ trỏ tới một trang đã dựng hoặc một `id` có thật;
  - bản để đưa lên mạng không còn `[chưa điền` hay `noindex`;
  - chuyển động: trễ của AnimatedList, thông số FadeContent khi giảm chuyển động;
  - một lần dựng thật bằng CLI vào thư mục tạm: có `index.html`, `404.html`, `favicon.svg`; script, stylesheet, phông đều nằm trên site, không có `fonts.googleapis.com` (D-247);
  - hai bản VI/EN link qua lại.
- **Mỗi task:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:preview`; Chrome một lượt ở các cỡ task đụng tới, đối chiếu canvas. Từ SI-02R thêm một lượt tắt JavaScript và một lượt giảm chuyển động.
- **Nghiệm thu (SI-06):** mọi trang ở 1440 / 768 / 390 × dark / light, không cuộn ngang. Đọc lại bảng D-241 và từng câu của Bảo mật với code.
- **Không chạy:** kiểm tra bằng lỗi gài (mutation). Site không có hàm logic đáng kể ngoài `configProblems`, và test đã phủ hàm đó.

## Definition of Done

- Đủ các trang của D-244. Test, lint, typecheck, `build:preview` xanh. `pnpm build` với config đủ giá trị xanh, với config thiếu thì đỏ và nêu tên trường.
- Chrome nghiệm thu đủ cỡ × 2 theme, so với canvas, có ghi lại chỗ khác canvas (D-241, D-245, D-246).
- Mọi khẳng định trên site đã đối chiếu với code hoặc spec (bảng D-241, trang Bảo mật).
- README: dựng, xem trước, đưa lên Cloudflare Pages hoặc GitHub Pages, xác minh tên miền, các ô của consent screen.
- File kiến thức phase 1 có mục về site, kèm `.docx` và `genoffice docs check`.
- Người dùng đọc Privacy và Terms (phần pháp lý là trách nhiệm của chủ sở hữu).
- `openspec archive site-public-pages -y`.

## Open Questions

- Host (Cloudflare Pages hay GitHub Pages) và các giá trị trong `site.config.ts`: người dùng điền khi đưa lên mạng. Không chặn việc dựng trang.
