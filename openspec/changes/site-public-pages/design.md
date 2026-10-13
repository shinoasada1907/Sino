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

### D-240 — Site tĩnh riêng `apps/sino-site`, HTML thuần không cần JavaScript · **Người dùng duyệt**
- Gói pnpm riêng, không phụ thuộc `sino-web`. Kết quả là thư mục `dist/` chỉ gồm HTML, CSS, phông chữ và favicon. Đưa lên host tĩnh nào cũng chạy được, không chờ deploy app.
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

| Đường dẫn | Canvas | Ghi chú |
|---|---|---|
| `/` | `Landing` | Trang chủ khai với Google |
| `/privacy`, `/en/privacy` | `SitePrivacy` | Chính sách quyền riêng tư khai với Google |
| `/terms`, `/en/terms` | `SiteTerms` | Ô Terms (tùy chọn) trên consent screen |
| `/security` | `SiteSecurity` | |
| `/open-source` | `SiteOpenSource` | Danh sách lấy từ `pom.xml` và `package.json` thật |
| `404.html` | `SiteNotFound` | Host tĩnh trả trang này cho đường dẫn không có |

- `SiteLogin` thuộc app (`sino-web` đã có `/login`), không nằm ở site.
- Các link trong mục "Tính năng", "Kế hoạch"… ở thanh trên của trang con trỏ về `/#tinh-nang`…, thay cho `Landing.dc.html` trần của canvas.

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
  - nút chính ghi "Mở Sino" và trỏ `appUrl + "/login"`;
  - nút phụ giữ như canvas ("Xem cách hoạt động", "Đăng nhập");
  - trang 404 giữ "Mở Sino".
- Khi app có đăng ký thì đổi lại chữ của canvas, trong một change khác.

### D-247 — Phông tự host, theme theo hệ điều hành, không JavaScript · **Người dùng duyệt**
- **Phông:** Inter và JetBrains Mono, bản variable `woff2`, chép từ `@fontsource-variable/*` vào `dist/fonts` lúc dựng. Không gọi Google Fonts như canvas `<helmet>`, nên Privacy nói đúng được rằng site không gửi gì cho bên thứ ba.
- **Theme:** biến màu `.theme-dark` của canvas là mặc định. `@media (prefers-color-scheme: light)` đổi sang biến của `.theme-light`. Canvas không có nút đổi theme trên trang công khai, nên site cũng không có.
- **Câu hỏi thường gặp:** `<details>` / `<summary class="lp-q">`, câu đầu mở sẵn như canvas.
- **Menu dưới 768 px:** `<details>` với `<summary>` là nút menu (`aria-label="Mở menu"`); bấm thì `lp-menu` hiện.
- **Không có thẻ `<script>`.**

### D-248 — Đường dẫn dạng thư mục; URL nộp cho Google là URL trình duyệt hiện sau khi chọn host · **Agent chốt**
- Script dựng ghi `privacy/index.html`, `en/privacy/index.html`… nên `/privacy` chạy trên mọi host tĩnh.
- Mỗi host xử lý dấu `/` cuối khác nhau: GitHub Pages chuyển `/privacy` sang `/privacy/`, Cloudflare Pages làm ngược lại. Google cấm URL chuyển hướng, nên sau khi chọn host, README dặn mở từng URL, lấy đúng URL thanh địa chỉ hiện ra rồi mới khai trên consent screen.
- Link nội bộ của site viết theo URL không có `/` cuối (`/privacy`).
- `<link rel="canonical">` dùng `siteUrl`.

**Phương án bị loại:**
- Ghi `privacy.html`: Cloudflare Pages lại chuyển hướng `.html` sang đường dẫn không đuôi.

### D-249 — Script TypeScript chạy thẳng bằng Node, mỗi trang là một hàm trả về HTML · **Agent chốt**
- `scripts/build.ts` chạy bằng `node` (Node 26 tự bỏ kiểu TypeScript). Mỗi trang là một hàm `(ctx) => string` trong `src/pages/`.
- `src/layout.ts` dựng `<head>`, thanh trên, chân trang dùng chung, nên thanh trên và chân trang chỉ viết ở một chỗ.
- Mọi giá trị từ config đi qua hàm `escapeHtml`.
- `src/icons.ts` giữ SVG Lucide chép từ canvas.

**Phương án bị loại:**
- React `renderToStaticMarkup`: cần thêm bước biên dịch TSX cho một site không có tương tác.
- Vite nhiều trang: không có cách ghép thanh trên và chân trang dùng chung nếu không thêm plugin.
- Viết tay tám file HTML: thanh trên và chân trang lặp lại tám lần.

## Cấu trúc

```text
apps/sino-site/
  package.json          build, build:preview, serve, test, lint, typecheck
  site.config.ts        SiteConfig (D-242)
  src/
    config.ts           missingFields(config), cách hiện chỗ thiếu
    html.ts             escapeHtml, html``
    layout.ts           page({ title, description, lang, path, alternate, body })
    icons.ts
    pages/              home.ts, privacy.ts (vi + en), terms.ts (vi + en),
                        security.ts, open-source.ts, not-found.ts
  styles/site.css       phần cần dùng của canvas sino.css: biến màu hai theme, chữ, nút,
                        badge, lp-*, doc-*, oss, nf, mrow, các thẻ minh họa
  public/favicon.svg    logo S2 như sino-web
  scripts/build.ts      dist/: index.html, privacy/, en/privacy/, terms/, en/terms/,
                        security/, open-source/, 404.html, site.css, fonts/
  scripts/serve.ts      phục vụ dist/ ở localhost, trả 404.html như host tĩnh
  test/
  README.md
```

## Nội dung bắt buộc cho Google, và trang nào đáp ứng

| Yêu cầu | Đáp ứng ở |
|---|---|
| Trang chủ xem được không cần đăng nhập, URL không chuyển hướng | `/` là `index.html` tĩnh (D-240, D-248) |
| Mô tả ứng dụng và tính năng | Trang chủ, theo bảng D-241 |
| Vì sao xin dữ liệu Google | Khối D-245; Privacy mục "Dữ liệu nhận từ Google" |
| Link tới Privacy từ trang chủ | Chân trang ("Chính sách quyền riêng tư") và khối D-245, nằm trong HTML gốc |
| Privacy cùng tên miền | `/privacy` trên cùng site |
| Limited Use | Privacy `#google`: câu nguyên văn tiếng Anh, link tới [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy) |
| Responsive | Bố cục canvas 1440 / 768 / 390 px |

## Privacy: những gì phải ghi đúng

- **Sino lưu gì:**
  - tài khoản Sino: email, tên hiển thị, mật khẩu chỉ lưu dạng băm BCrypt;
  - tài khoản Gmail đã kết nối: địa chỉ, quyền đã cấp, token mã hóa;
  - thư: nội dung, người gửi, người nhận, thời gian, HTML đã làm sạch, thông tin tệp đính kèm;
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

- **Test viết trước, đỏ rồi xanh** (vitest, đọc HTML trong `dist/` của một lần dựng vào thư mục tạm, parse bằng jsdom):
  - `missingFields` và hai chế độ dựng;
  - trang nào cũng có `lang`, `<title>`, mô tả, viewport, canonical;
  - trang chủ có `<a href="/privacy">` trong HTML gốc;
  - không có thẻ `<script>`, không có URL `fonts.googleapis.com`;
  - mọi `href` nội bộ trỏ tới một trang đã dựng hoặc một `id` có thật;
  - bản để đưa lên mạng không còn `[chưa điền` hay `noindex`;
  - hai bản VI/EN link qua lại.
- **Mỗi task:** `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build:preview`; Chrome một lượt ở các cỡ task đụng tới, đối chiếu canvas.
- **Nghiệm thu (SI-06):** mọi trang ở 1440 / 768 / 390 × dark / light, không cuộn ngang. Đọc lại bảng D-241 và từng câu của Bảo mật với code.
- **Không chạy:** kiểm tra bằng lỗi gài (mutation). Site không có hàm logic đáng kể ngoài `missingFields`, và test đã phủ hàm đó.

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
