## Context

`sino-web` là SPA Vite + React. Trong production, Caddy phục vụ `dist` với `try_files {path} /index.html`, nên `/privacy` và `/en/privacy` đều trả khung rỗng. Kiểm tra ngày 2026-11-04 bằng curl, kể cả với User-Agent của Googlebot: `200`, 454 byte, gần như không có chữ.

Ràng buộc từ code hiện tại:

- `/` qua `HomeGate`: hỏi phiên đăng nhập trước, chủ tài khoản được chuyển sang `/overview` mà không thấy trang giới thiệu lóe lên (D-310). Cookie phiên là HttpOnly nên script trong HTML không biết được đã đăng nhập hay chưa.
- `index.html` là khung dùng chung cho mọi trang trong app, nên không được chứa nội dung trang giới thiệu.
- `PublicFrame` đặt `document.title` và `lang` trong effect, nên server render không có các giá trị này.
- `Caddyfile` và `Dockerfile` chỉ có trên nhánh `deploy/devtest`. `Dockerfile` chạy `pnpm build` rồi chép `dist` vào `/srv`.

Người dùng đã chọn hướng A (tạo sẵn HTML lúc build từ component đang có) thay cho hướng B (viết tay HTML tĩnh) ngày 2026-11-04.

## Goals / Non-Goals

**Goals:**

- HTML thô của `/`, `/privacy`, `/en/privacy` có đủ nội dung, đúng `<title>` và `lang`.
- Chỉ có một bản nội dung, là các component React.
- Khi có JavaScript, hành vi giống hệt hiện tại.
- Privacy không còn chỗ trống và nêu đúng các bên thứ ba.

**Non-Goals:**

- Không làm SSR lúc chạy, không hydrate.
- Không làm trang chủ tiếng Anh hay trang Terms.
- Không sửa nội dung Privacy về Zalo (thuộc ZL-13 của `zalo-personal`).
- Không làm xác minh scope Gmail, video demo hay CASA.

## Decisions

Mã bắt đầu từ D-460 vì `zalo-contacts` sẽ đánh số lại từ D-439 trở đi.

**D-460: Render bằng Vite SSR build và `react-dom/server` trong bước build.** Một entry riêng render `Landing`, `PrivacyVi`, `PrivacyEn` với router tĩnh; một script Node ghi kết quả vào bản sao của `dist/index.html`. Lý do: dùng lại đúng component và CSS của Vite. Đã bỏ: headless Chrome lúc build (nặng, thêm phụ thuộc vào image build) và một framework SSG (quá lớn cho ba trang).

**D-461: Tên file là `home.html`, `privacy.html`, `en/privacy.html`; `dist/index.html` giữ nguyên là khung rỗng.** Lý do: mọi trang trong app vẫn fallback về khung rỗng, không rò nội dung trang giới thiệu. Đã bỏ: `privacy/index.html` (dễ dính chuyển hướng dấu `/` của `file_server`).

**D-462: Caddy đổi `/` sang `/home.html` và dùng `try_files {path} {path}.html /index.html`.** Hệ quả chấp nhận được: `/privacy.html` cũng mở được. Đường dẫn `/api/*` không đổi.

**D-463: Không hydrate; `createRoot` thay nội dung tạo sẵn như hiện nay.** Một script nội tuyến nhỏ trong `<head>` ẩn nội dung tạo sẵn ngay khi có JavaScript, nên người dùng thấy đúng trình tự hiện tại và chủ tài khoản không thấy trang lóe lên. Không có JavaScript thì script không chạy và toàn bộ chữ hiển thị. Đã bỏ: hydrate (`HomeGate` lần đầu render dấu kiểm tra phiên, không khớp với HTML, và phải sửa cổng phiên).

**D-464: Script prerender tự đặt `<title>`, `lang`, và thêm link CSS của trang công khai.** Lấy CSS từ `build.manifest` của Vite, vì `public.css` nằm trong chunk riêng.

**D-465: Build thất bại nếu đầu ra sai.** Mỗi file phải chứa các câu mốc của trang đó và không được chứa `[chưa điền`. Lý do: lỗi này chỉ lộ ra khi Google từ chối, nên phải chặn sớm. D-314 tránh test kiểu này vì lúc đó chưa có giá trị thật; change này điền giá trị trước, nên không còn vướng.

**D-466: Privacy nêu Cloudflare là bên thứ ba thứ ba.** Nội dung: toàn bộ lưu lượng tới Sino đi qua Cloudflare để bảo vệ và định tuyến, nên dữ liệu trên đường truyền, kể cả thư khi hiển thị, đi qua hạ tầng của họ; Sino không dùng Cloudflare để lưu thư. Câu "ngoài hai bên này" đổi thành "ngoài các bên này" ở cả VI và EN. Quản lý rà lại cấu hình Cloudflare thật trước khi chốt câu chữ, gồm cả header báo lỗi mạng (NEL) mà Cloudflare đang gửi cho trình duyệt, vì Privacy nói các trang công khai không gọi dịch vụ khác.

## Decision Needed

**DN-1: Bốn giá trị của `owner.ts`** (người dùng cung cấp): email liên hệ, người đứng tên, ngày hiệu lực, nhà cung cấp máy chủ và quốc gia. Chưa có thì PP-01 bị chặn, nhưng PP-02 và PP-03 làm trước được.

**DN-2: Đưa lên nhánh deploy thế nào.**

- **A (đề xuất):** cherry-pick riêng các commit của change này vào `deploy/devtest`. Không kéo theo các việc khác trên `dev` chưa nghiệm thu.
- **B:** merge cả `dev`. Bản deploy mới nhất, nhưng phải nghiệm thu thêm mọi thay đổi khác cùng lúc.

Bản checkout `Sino-deploy` đang ở `eb6bad1` (2026-10-22), trong khi file đang chạy có thời điểm 2026-10-28. Trước khi làm PP-04 phải đối chiếu với `origin/deploy/devtest` và với server.

**DN-3: Mode của change.** `new_features` đang là TRAINING. Đề xuất `task_overrides.public-pages-prerender: AUTO`, vì người dùng đã đồng ý để kỹ sư `sino-web` làm.

**Đã chốt (người dùng, 2026-11-04: "Duyệt, giao việc"):** DN-2 = A, cherry-pick; DN-3 = AUTO. DN-1 còn chờ 4 giá trị.

## Risks / Trade-offs

- **Google vẫn từ chối vì lý do khác** → Sau khi deploy, đọc lại lý do trong Console; dùng URL Inspection của Search Console để đối chiếu.
- **Component dùng `window` hay `document` lúc render** → Sẽ lỗi ngay ở bước build. Sửa bằng cách chuyển vào effect, không đổi hành vi. Đã thấy các lần dùng trong `features/public` đều cần kiểm tra ở `reduced-motion.ts`, `FadeContent.tsx`, `PublicFrame.tsx`.
- **Khối hiệu ứng ẩn chữ khi không có JavaScript** → Chữ vẫn nằm trong HTML. Hand test tắt JavaScript sẽ xem chữ có đọc được không.
- **Build chậm hơn** → Thêm một lượt SSR build ngắn, chấp nhận được.
- **Caddy mới có thể trả sai đường dẫn** → Chạy thử image thật ở máy trước khi deploy; rollback bằng image cũ.
- **Đồng ý nêu Cloudflare làm lộ một phần hạ tầng** → Đây là yêu cầu trung thực của Privacy, không phải rủi ro cần tránh.

## Migration Plan

1. Làm và nghiệm thu trên `dev`.
2. Đưa lên `deploy/devtest` theo DN-2, đổi `Caddyfile`, build image rồi chạy thử.
3. Người dùng cho phép thì deploy. Kiểm tra bằng curl trên tên miền thật.
4. Người dùng chọn "I have fixed the issues" trong Console.

Rollback: chạy lại image web trước đó. Không có migration dữ liệu.

## Open Questions

Không có ngoài DN-1…DN-3.
