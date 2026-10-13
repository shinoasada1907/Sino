# Phase 2 · F06 — Đọc cả cuộc trò chuyện · Technical Design

> Mode: **HYBRID**. Frontend AUTO, backend AUTO; quyết định kiến trúc thuộc TRAINING, nhưng người dùng giao toàn quyền ngày 2026-10-10: chọn "Trả lời trong thread" cho phạm vi gửi (change `f10-reply`), rồi với câu hỏi về HTML trả lời "tự xử hết luôn đi". Mọi quyết định dưới đây là **agent chốt theo ủy quyền**, có phương án bị loại, để người dùng xem lại.
> Change dùng chung: phiên web (sino-web-33) viết hồ sơ, contract và phần Web; phiên backend (sino-api-ec) nhận mục Backend sau BE-46 và được sửa mục Backend design khi làm. Số quyết định của F06 + F10: D-120…D-139 (thỏa thuận với phiên backend 2026-10-10).
> Nguồn: roadmap F06 ("Cần chốt: plain text hay HTML đã sanitize, liên quan XSS"), Gmail API (`users.messages.get` `format=full`, `users.messages.attachments.get`), jsoup `Cleaner`/`Safelist`, HTML Living Standard (`iframe` `sandbox`, `srcdoc`), CSP Level 3, canvas "Sino UI" (`Inbox`, `TabletInbox`, `ThreadState`).

## Context

- Bảng `message` (V8) lưu `text_content` là chữ thuần, cắt 100 000 ký tự. Thư Gmail chỉ có HTML được jsoup rút thành chữ khi chuẩn hóa (D-61, BE-37), nên mất liên kết và ảnh. Không lưu HTML gốc hay payload thô. `metadata` jsonb có `subject`, `bulk`. Người gửi nằm ở `conversation_participant`, không lưu To/Cc.
- Bảng `attachment` (V9) chỉ có metadata tệp. Ảnh nhúng (phần có `Content-ID`, không phải `attachment`) không được ghi (F04b design).
- `GET /api/conversations/{id}` (BE-44) trả tóm tắt và `participants`, chưa có thư. Danh sách Hộp thư dùng con trỏ keyset (`nextCursor`, `limit` 1…100), lỗi theo Problem Details với `code`.
- Contract provider đã có `sendMessage` (F03) và các hàm tùy chọn kiểu `default` (`estimateMessages`, `registerPush`). Gmail đọc thư bằng `format=full`, nên lúc nhập đã nhận đủ phần HTML mà không tốn thêm request.
- Web: `EmailThread` đã dựng theo canvas (thư cũ gập, thư mới nhất mở, tệp, ô trả lời) và chạy được với dữ liệu mẫu. Trên API, `detail.messages = null` nên web hiện `LatestPreview` (D-71). Key của cuộc trò chuyện đang mở là `['inbox', 'conversation', id]`, nằm dưới tiền tố `['inbox']` mà sự kiện `conversations.changed` đọc lại (D-90).
- Hộp thư của người dùng đã được nhập trọn (2026-10-10), nên gần như mọi thư hiện có đều là thư "trước F06": chỉ có chữ.

## Goals / Non-Goals

**Goals:** mở một cuộc trò chuyện là đọc được mọi thư của nó, thư HTML trông gần như trong Gmail mà không mở đường cho XSS, ảnh theo dõi không tự tải, tệp tải được, thư mới đến trong lúc đọc tự hiện.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Decisions

### D-120 — HTML gốc lưu lúc nhập, làm sạch ở backend khi trả, web hiện trong iframe sandbox không có script · **Agent chốt theo ủy quyền** (2026-10-10)
Lúc chuẩn hóa thư Gmail, connector trả thêm phần `text/html` đầu tiên (không phải tệp) và Sino lưu vào cột mới, tối đa 1 000 000 ký tự. Dài hơn thì không lưu HTML, thư hiện bằng chữ. Phần chữ vẫn lưu như hiện nay vì Hộp thư, đoạn xem trước và tìm kiếm sau này đều dùng nó. Khi web hỏi nội dung một thư, backend làm sạch HTML bằng jsoup theo danh sách cho phép (mục Backend design 3). Web đặt HTML đã sạch vào `<iframe sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" srcdoc="…">`. Không có `allow-scripts` nên không script nào chạy được, kể cả khi bộ lọc bỏ sót. `allow-same-origin` chỉ để trang đo chiều cao nội dung. Không có `allow-forms` nên form không gửi được. Trong `srcdoc` có thẻ meta CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data: <origin của Sino>; font-src data:`, và liên kết mở tab mới.
**Phương án bị loại:**
- A. Chữ thuần giữ liên kết. Bản tin, biên lai và thông báo, tức phần lớn thư thật, mất bố cục và ảnh.
- B. Lấy HTML từ Gmail mỗi lần mở. Mở thư phải chờ Gmail, hỏng khi token hết hạn hoặc Gmail lỗi, và tốn quota.
- C. Làm sạch một lần lúc lưu, chỉ giữ bản sạch. Khi cần siết chặt bộ lọc, phải chạy lại trên mọi dòng đã lưu. Giữ bản gốc và làm sạch khi trả thì sửa bộ lọc có tác dụng ngay với mọi thư.
- D. Chỉ làm sạch ở web (DOMPurify). Ranh giới tin cậy là server; iframe không script là lớp thứ hai, không phải lớp duy nhất.
- E. Iframe có `allow-scripts` để tự báo chiều cao bằng `postMessage`. Bộ lọc bỏ sót một chỗ là script chạy.

### D-121 — Ảnh từ xa tắt sẵn, bấm "Hiện ảnh" cho từng thư · **Agent chốt theo ủy quyền**
CSP trong `srcdoc` chỉ cho ảnh `data:` và ảnh từ Sino (ảnh nhúng `cid:` đi qua Sino). Vì vậy ảnh `http(s)`, nền CSS `url(...)` và font từ xa đều không tải. Backend báo `remoteImages: true` khi HTML đã sạch có tham chiếu ảnh `http(s)`. Khi đó web hiện dòng "Ảnh trong thư đang ẩn để người gửi không biết bạn đã mở thư." kèm nút "Hiện ảnh". Bấm vào thì web dựng lại `srcdoc` với `img-src` thêm `https: http:`. Lựa chọn này chỉ áp cho thư đó, trong lần xem đó; Sino không nhớ.
**Phương án bị loại:**
- Luôn hiện ảnh. Pixel theo dõi báo cho người gửi lúc mở thư và địa chỉ IP.
- Nhớ "luôn hiện" theo người gửi. Cần chỗ lưu và màn quản lý; để sau.
- Proxy ảnh qua Sino như Gmail. Giấu được IP, nhưng server phải tải URL bất kỳ (nguy cơ SSRF) và tốn băng thông; để sau.

### D-122 — Thư nhập trước F06: lấy bù nội dung từ Gmail khi mở lần đầu · **Agent chốt theo ủy quyền**
Mỗi thư có dạng nội dung:
- `TEXT`: thư không có phần HTML.
- `HTML`: đã lưu HTML gốc.
- `UNCHECKED`: thư nhập trước change này. Đây là giá trị cho mọi dòng hiện có khi migration chạy.

Khi web hỏi nội dung một thư `UNCHECKED`, backend gọi hàm tùy chọn mới của contract để đọc lại thư đó. Có kết quả thì lưu HTML, ghi ảnh nhúng, đổi dạng thành `HTML` hoặc `TEXT`, rồi trả. Provider lỗi thì trả `502 MESSAGE_CONTENT_UNAVAILABLE`, web hiện phần chữ đã có kèm một dòng báo. Lần mở sau lại thử.
**Phương án bị loại:**
- Không lấy bù. Cả hộp thư đã nhập sẽ mãi chỉ có chữ.
- Chạy một việc nền lấy bù mọi thư lúc nâng cấp. Hàng nghìn lời gọi Gmail cho những thư có thể không bao giờ được mở.

### D-123 — Danh sách thư và nội dung HTML là hai request · **Agent chốt theo ủy quyền**
`GET /api/conversations/{id}/messages` trả mỗi thư kèm phần chữ, người gửi, người nhận, tệp và `bodyFormat`; không có HTML. `GET …/messages/{messageId}/body` trả HTML đã sạch. Nội dung một thư không đổi, nên web giữ nó mãi trong cache (`staleTime: Infinity`). Web chỉ hỏi nội dung cho thư đang mở (thư mới nhất và thư người dùng bấm mở), và chỉ khi `bodyFormat` khác `TEXT`.
**Phương án bị loại:**
- HTML nằm trong danh sách. Một cuộc trò chuyện 20 bản tin nặng hàng MB, trong khi thư gập không bao giờ cần HTML.
- Cả phần chữ cũng tách thành request riêng cho từng thư. Khi có chat (F09), mỗi bong bóng sẽ là một request.

### D-124 — Thư cũ hơn tải bằng nút ở đầu cuộc trò chuyện · **Agent chốt theo ủy quyền**
Mỗi trang 20 thư, mới nhất trước. Còn trang sau thì đầu cuộc trò chuyện có nút "Xem thư cũ hơn"; bấm vào thì thư cũ hơn hiện phía trên, đã gập.
**Phương án bị loại:** tự tải khi cuộn tới đầu. Phải giữ vị trí cuộn để nội dung không nhảy, mà phần lớn cuộc trò chuyện email dưới 20 thư.

### D-125 — Tệp đính kèm tải qua Sino, không lưu, luôn là tải xuống · **Agent chốt theo ủy quyền**
`GET …/messages/{messageId}/attachments/{attachmentId}` gọi hàm tùy chọn mới của contract (Gmail `users.messages.attachments.get`) rồi trả bytes. Header: `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`. Riêng ảnh nhúng: `?inline=true` chỉ được nhận khi kiểu là `image/png`, `image/jpeg`, `image/gif` hoặc `image/webp` (không có SVG), và khi đó trả `inline`. Lúc nhập (và lúc lấy bù), ảnh nhúng được ghi vào `attachment` với `content_id` ~~và cờ `inline`~~ (BE-56: chỉ `content_id`, xem Backend design 1). Danh sách tệp của thư không có chúng. Lúc làm sạch, `src="cid:…"` được đổi thành đường dẫn `?inline=true` của đúng phần đó; không tìm thấy thì bỏ ảnh.
**Phương án bị loại:**
- Lưu nội dung tệp trong Sino. Tốn chỗ, phải mã hóa lúc lưu, và không cần cho việc đọc.
- Mở tệp ngay trong trình duyệt. Một tệp HTML hoặc SVG sẽ chạy trên origin của Sino, tức là XSS.

### D-126 — Web: thread đọc từ API, thư mới tự hiện, chữ có liên kết bấm được · **Agent chốt theo ủy quyền**
Danh sách thư là một `useInfiniteQuery` dưới key `['inbox', 'conversation', id, 'messages']`. Nhờ vậy sự kiện `conversations.changed` (đọc lại tiền tố `['inbox']`, D-90) mang thư mới vào cuộc trò chuyện đang mở mà không cần code mới. `useConversation` ghép các trang (cũ trước) vào `detail.messages` và `detail.previousCursor` đã có sẵn trong kiểu dữ liệu, nên `EmailThread` vẫn đọc `detail.messages` như với dữ liệu mẫu. Thư dạng chữ hiện như nay (đoạn văn, D-53); URL `http(s)` thành liên kết mở tab mới bằng phần tử React, không dùng `innerHTML`. Thư HTML hiện trên nền trắng ở cả hai theme, vì thư HTML luôn được viết cho nền sáng.
**Phương án bị loại:**
- Đổi `EmailThread` sang một kiểu dữ liệu mới. Sửa nhiều, trong khi kiểu cũ đã có chỗ cho thư và con trỏ.
- Đảo màu HTML theo theme tối. Chữ và nền do người gửi đặt sẽ hỏng (chữ đen trên nền đen).

## Contract API

Mọi lỗi theo Problem Details với `code` (spec `api-conventions`). Cuộc trò chuyện không thuộc người dùng, không tồn tại, hoặc của account đã xóa hay `DISABLED` → `404` như `GET /api/conversations/{id}`.

### `GET /api/conversations/{id}/messages?cursor=&limit=`
`limit` mặc định 20, từ 1 tới 100. `cursor` là `nextCursor` của trang trước; cursor hay `limit` sai → `400` như `GET /api/conversations`.

```json
{
  "items": [
    {
      "id": "0192f0d4-…",
      "direction": "INBOUND",
      "status": "SENT",
      "sentAt": "2026-10-10T07:05:00Z",
      "sender": { "name": "An Nguyễn", "address": "an@example.com", "self": false },
      "to": [{ "name": null, "address": "me@gmail.com" }],
      "cc": [],
      "subject": "Báo giá tháng 10",
      "text": "Chào bạn,\n\nGửi bạn báo giá…",
      "bodyFormat": "HTML",
      "read": true,
      "attachments": [
        { "id": "0192f0d4-…", "fileName": "bao-gia.pdf", "mimeType": "application/pdf", "sizeBytes": 182000 }
      ]
    }
  ],
  "nextCursor": "eyJ0IjoiMjAyNi0xMC0wOVQwMTowMDowMFoiLCJpIjoiMDE5MmYwIn0"
}
```

- Thứ tự `sentAt` giảm dần, rồi `id` giảm dần; không trùng, không sót khi nhiều thư cùng giờ. `nextCursor` = `null` khi hết.
- `sender.address` là địa chỉ email (Gmail) hoặc ID của người gửi (provider khác); `name` có thể `null`; `self` = thư từ chính account. Cả `sender` là `null` khi provider không cho biết người gửi (thư hệ thống, thông báo; BE-54).
- `to`, `cc`: `null` khi Sino không biết (thư nhập trước change này), `[]` khi thư không có.
- `text`: `null` khi thư không có chữ. `subject`: `null` khi không có.
- `bodyFormat`: `TEXT` | `HTML` | `UNCHECKED` (D-122).
- `status`: giá trị của cột `status` (`PENDING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `UNKNOWN`); F10 dùng cho thư gửi đi.
- `attachments`: chỉ tệp, không có ảnh nhúng; `fileName`, `mimeType`, `sizeBytes` có thể `null`.

### `GET /api/conversations/{id}/messages/{messageId}/body`
```json
{ "format": "HTML", "html": "<div style=\"…\">…</div>", "remoteImages": true }
```
- `format` = `TEXT` thì `html` = `null`, `remoteImages` = `false`.
- Thư không thuộc cuộc trò chuyện → `404 MESSAGE_NOT_FOUND`.
- Thư `UNCHECKED` mà lấy bù không được (provider lỗi, account hết quyền) → `502 MESSAGE_CONTENT_UNAVAILABLE`.

### `GET /api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}[?inline=true]`
- `200` bytes, `Content-Type` = `mimeType` đã lưu (không có thì `application/octet-stream`), các header của D-125.
- Không có tệp đó trong thư → `404 ATTACHMENT_NOT_FOUND`.
- `inline=true` với kiểu không nằm trong danh sách ảnh → ~~`400`~~ `422 ATTACHMENT_NOT_INLINE` (BE-56: hệ thống lỗi không có loại nào ánh xạ sang `400`; `422` là "yêu cầu đúng dạng nhưng phạm quy tắc"; web dùng đường dẫn này trong `<img>` nên không đọc mã).
- Provider lỗi → `502 ATTACHMENT_UNAVAILABLE`.
- BE-56 (review): lớn hơn 25 MB → `422 ATTACHMENT_TOO_LARGE`; các tệp đang đọc từ provider đã chiếm hết 50 MB → `503 ATTACHMENT_BUSY` (không chờ; ảnh `inline` có phần riêng 25 MB); cả hai không gọi provider. Không có kiểu đã lưu thì dùng kiểu provider trả; `image/*`, `*/*` → `application/octet-stream`. Ảnh `inline` có `Cache-Control: max-age=86400, private`; tệp tải xuống giữ `no-store` của Spring Security.

## Backend design (phiên backend nhận; được sửa khi làm)

### 1. Dữ liệu (~~migration tiếp theo, V14 và V15~~ → V14 người nhận ở BE-54, V15 nội dung ở BE-55, V16 tệp ở BE-56)
- `message`: `html_content text` (null), `body_format varchar(16) NOT NULL DEFAULT 'UNCHECKED'` (`CHECK IN ('TEXT','HTML','UNCHECKED')`). Thư mới ghi `TEXT` hoặc `HTML`. ~~`to`/`cc` lưu trong `metadata` (`to`, `cc`: mảng `{name, address}`), cùng `replyTo`, không cần cột mới~~ → cột riêng `message.recipients jsonb` (null), V14: `{"to": […], "cc": […], "replyTo": […]}`, mỗi phần tử `{name, address}`; SQL `NULL` = Sino không biết (F10 dùng `replyTo` để biết trả lời tới ai). Lưu lại: `recipients = coalesce(EXCLUDED.recipients, m.recipients)`. **LÝ DO (BE-54, agent chốt sau review):** để trong `metadata` thì phải giữ riêng một khóa trong cột của connector, bỏ khóa trùng tên do connector đặt, và lặp một biểu thức `CASE … ||` ở cả `SET` lẫn `WHERE`; một cột riêng chỉ cần `coalesce`, và không nằm trong "vài giá trị nhỏ" của `metadata` (một thư gửi 2 000 người To/Cc nặng cỡ trăm KB). Bản đầu dùng một khóa `metadata.recipients` rồi đổi trước khi commit.
- `attachment`: `content_id text` (null), ~~`inline boolean NOT NULL DEFAULT false`~~ (V16, BE-56). **LÝ DO:** một phần có `content_id` luôn là ảnh nhúng và không bao giờ là tệp, nên cờ `inline` luôn suy được từ `content_id`; hai cột chỉ thêm cơ hội lệch nhau. Danh sách tệp và `has_attachments` bỏ qua dòng có `content_id`.

### 2. Nhập và chuẩn hóa
- `NormalizedMessage` thêm `htmlContent` (null) và người nhận. `NormalizedAttachment` thêm `contentId`, ~~`inline`~~. BE-54: người nhận là thành phần `recipients` kiểu `NormalizedRecipients(to, cc, replyTo)` (mỗi phần tử `Address(name, address)`), `null` khi connector không biết (chat); `subject` thành khóa metadata dùng chung `NormalizedMessage.SUBJECT` vì module `conversation` đọc nó cho từng thư. Gmail: phần `text/html` đầu tiên không phải tệp; header `To`, `Cc`, `Reply-To` (RFC 2047, nhiều địa chỉ); phần ảnh có `Content-ID` mà không phải `attachment` → ~~`inline = true`~~ ảnh nhúng (`contentId`) chỉ khi là PNG, JPEG, GIF hoặc WebP và HTML hiện nó bằng `<img src="cid:…">`; ảnh nhúng khác là tệp, kể cả khi không có tên (BE-56). **LÝ DO:** review của BE-56: ảnh mà HTML không gọi tới (thư chỉ có chữ, ảnh chụp gửi từ điện thoại) hay trình duyệt không hiện an toàn được (SVG, TIFF) sẽ không hiện trong thư mà cũng không có trong danh sách tệp, tức là mất. Danh sách kiểu ảnh nằm ở contract (`NormalizedAttachment.PICTURE_TYPES`), dùng chung cho connector và cho `inline`.
- `ConversationStore` lưu các trường mới. Thư đã có (cập nhật nhãn, đã đọc) MUST NOT xóa HTML đã lưu. BE-55: HTML của một thư không bao giờ đổi, nên lưu lại giữ bản đã lưu (`coalesce(m.html_content, EXCLUDED.html_content)`, ghi lại đúng giá trị cũ để PostgreSQL không chép lại HTML vào TOAST mỗi lần thư đổi trạng thái đọc); `WHERE ... IS DISTINCT FROM` so `body_format` chứ không so HTML. V15 có hai `CHECK` (`body_format` hợp lệ; có HTML khi và chỉ khi `HTML`) và bỏ `DEFAULT` sau khi đánh dấu các dòng cũ `UNCHECKED`, để một câu `INSERT` sau này quên cột này thì lỗi ngay. Người nhận cũng vậy: một lần lưu không mang người nhận giữ bản đã lưu (`coalesce` ở cả `SET` lẫn `WHERE ... IS DISTINCT FROM`), và không tính là "đổi" chỉ vì điều đó (BE-54).
- Thư nhập trước BE-54 chưa có người nhận (`to`/`cc` = `null`) cho tới khi được lưu lại: đồng bộ chạm vào thư đó, nhập lại, hoặc lấy bù nội dung ở BE-55; vì vậy lấy bù ở BE-55 nên ghi cả người nhận.

### 3. Làm sạch HTML (`conversation`, một lớp, ví dụ `MailHtml`)
- jsoup `Cleaner` với `Safelist` dựa trên `relaxed()`, thêm:
  - thuộc tính `style` cho mọi thẻ; `class`, `id`;
  - thuộc tính bảng (`width`, `height`, `align`, `valign`, `bgcolor`, `border`, `cellpadding`, `cellspacing`, `background`);
  - `font` (`color`, `face`, `size`), `center`;
  - thẻ `style`, và nội dung của nó trong `<head>` chuyển vào body.
- Giao thức cho phép:
  - `a[href]`: `http`, `https`, `mailto`, `tel`;
  - `img[src]`: `http`, `https`, `cid`, và `data` chỉ khi là `data:image/(png|jpeg|gif|webp)`.
- Bỏ: `script`, `iframe`, `frame`, `object`, `embed`, `form` và các ô nhập, `link`, `meta`, `base`, `svg`, `math`, mọi thuộc tính `on*`.
- Mọi `a` có `target="_blank"` và `rel="noopener noreferrer"`.
- `cid:` đổi thành đường dẫn ảnh nhúng của đúng thư (D-125); không có phần tương ứng thì bỏ `img`.
- `remoteImages` = có `img[src^=http]`, `img[srcset]`, `[background^=http]` hoặc `url(http` trong `style` (thuộc tính và thẻ).
- Bộ lọc là hàm thuần, test bằng bảng đầu vào độc hại (chuỗi XSS của OWASP Cheat Sheet: `javascript:`, `onerror`, `<svg onload>`, `<math>`, `<style>` thoát thẻ, `srcdoc`, `formaction`, `data:text/html`, entity lồng nhau).
- BE-55 (sau review): các `<style>` của `<head>` dời vào body **giữ thứ tự** (luật sau đè luật trước) và giữ thuộc tính `media`; sau khi làm sạch, mỗi `<style>` chỉ giữ CSS thuần (`data()`), có `</style` thì bỏ cả thẻ, vì trong `<svg>`/`<math>` trình phân tích đọc thẻ bên trong `<style>` thành phần tử và thuộc tính, viết ra lại sẽ thành mã HTML (mXSS); `src`, `href` bắt đầu bằng `http`, và `background`, phải có đủ `//` (`https:/api/x` trình duyệt hiểu là đường dẫn của chính Sino); `remoteImages` dò mọi `//` trong CSS (bắt cả `image-set(...)`).

### 4. Contract provider
- `Optional<MessageContent> fetchMessageContent(ProviderContext, String externalMessageId)`: đọc lại một thư, trả HTML (null), các phần ảnh nhúng. Mặc định `Optional.empty()`.
- `AttachmentContent fetchAttachment(ProviderContext, String externalMessageId, String externalAttachmentId)`: bytes và kiểu. Mặc định ném `CAPABILITY_NOT_SUPPORTED`.
- Gmail: `messages.get format=full` (dùng lại bộ chuẩn hóa) và `messages.attachments.get` (base64url). Lỗi theo bảng `ProviderException` đã có.
- BE-55: `MessageContent(htmlContent, recipients)`: đọc lại cho cả người nhận, vì thư nhập trước BE-54 cũng chưa có. BE-56 thêm `attachments`: các tệp và ảnh nhúng như lúc nhập bây giờ (~~chỉ ảnh nhúng~~; review: phần ảnh nhúng mà quy tắc của BE-56 coi là tệp chưa từng được nhập với thư cũ), Sino thêm chúng bên cạnh các tệp đã lưu. Thư mà HTML không được lưu (quá dài) thì ảnh nhúng lưu là tệp. Rỗng nghĩa là "không có gì thêm": connector không đọc lại được, hoặc provider không còn thư; khi đó thư thành `TEXT`. Gộp hai trường hợp là chủ ý: thư `UNCHECKED` chỉ có từ trước F06, đều là Gmail và Gmail có cài hàm này; connector mới (F09) lưu thư mới thẳng thành `TEXT`/`HTML`, không có `UNCHECKED`. Gmail chọn phần thân không đi vào bên trong một tệp hay một thư chuyển tiếp đính kèm (`message/rfc822`).

### 5. API (`conversation/api`)
Ba endpoint của Contract API. Lấy bù (D-122) chạy ngoài transaction khi gọi provider, rồi lưu trong một transaction ngắn. Hai request cùng lấy bù một thư thì cả hai đều được trả; lần ghi sau không đổi gì.
- BE-55: service `MessageBodies` (không có `@Transactional`; ghi bằng `TransactionTemplate`, chỉ đổi thư còn `UNCHECKED`). Lấy bù xong phát `ConversationChanged` để danh sách thư của các tab đọc lại (định dạng, người nhận). Lỗi provider (`ProviderException`) hay account không dùng được (`SinoException` của `ProviderAccess`, ví dụ connector đã tắt) → `502 MESSAGE_CONTENT_UNAVAILABLE` qua loại lỗi mới `PROVIDER_FAILED` (`502`; `503` vẫn là "Sino tạm không dùng được một thứ nó cần"). Ảnh `cid:` bị bỏ cho tới BE-56.

## Web

### Thành phần
- `inbox.api.ts`: `fetchMessages(conversationId, cursor)` → `{ items: Message[], nextCursor }`, `fetchMessageBody(conversationId, messageId)`, `attachmentUrl(conversationId, messageId, attachmentId)`. Ánh xạ:
  - `INBOUND` → `IN`, `OUTBOUND` → `OUT`;
  - `sender` = `self` ? "Bạn" : `name ?? address`;
  - `to` = tên hoặc địa chỉ nối bằng dấu phẩy, `null` khi không biết;
  - `status` của thư gửi đi: `PENDING` → `SENDING`, `FAILED` → `FAILED`, còn lại → `SENT`;
  - tệp → `Attachment` (`type` từ đuôi tệp hoặc `mimeType`, `image` theo `mimeType`).
- `useInbox.ts`: `messagesKey(id)` = `['inbox', 'conversation', id, 'messages']`; `useConversation` thêm `useInfiniteQuery` theo key đó, ghép các trang (cũ trước) vào `detail.messages`, `detail.previousCursor`, và trả `loadOlder`. Lỗi danh sách thư → `messagesFailed`, `retryMessages`.
- `MailBody` (mới): `bodyFormat` = `TEXT` → chữ có liên kết; khác `TEXT` → hỏi `…/body` (`useQuery`, `staleTime: Infinity`). Trong lúc chờ: phần chữ đã có, mờ đi. Có HTML → `MailFrame`. Lỗi → phần chữ kèm dòng "Không tải được bản đầy đủ của thư này. Đang hiện phần chữ." và nút "Thử lại".
- `MailFrame` (mới): iframe theo D-120, chiều cao bằng `ResizeObserver` trên tài liệu bên trong, đặt sau sự kiện `load`. Dòng "Hiện ảnh" theo D-121.
- `EmailThread`: bỏ `LatestPreview` khi đã có thư; "Xem thư cũ hơn" ở đầu (D-124); lỗi danh sách thì hiện `LatestPreview` cùng dòng báo lỗi và "Thử lại"; tệp là liên kết tải xuống (`<a href download>`).

### Test (web)
- MSW theo đúng Contract API: danh sách hai trang, thư `TEXT`/`HTML`/`UNCHECKED`, nội dung lỗi `502`, danh sách lỗi `500`.
- jsdom không dựng `srcdoc`, nên test kiểm thuộc tính của iframe (`sandbox` đúng giá trị, `srcdoc` có CSP, không `allow-scripts`) chứ không kiểm nội dung bên trong. Hàm dựng `srcdoc` và hàm tìm liên kết là hàm thuần, test riêng.
- Kiểm tra bằng lỗi gài (theo luật frontend gọn): một lần cho hàm dựng `srcdoc` và hàm tìm liên kết, ở task cuối trước khi chạy thật.
- Chrome thật: thư HTML thật (bản tin có ảnh, bảng rộng) ở 1440 và 390, hai theme; xác nhận script trong thư không chạy (thư test có `<script>` và `onerror`).

## Testing (backend)
- Bộ lọc HTML: bảng chuỗi độc hại và thư thật (bản tin, biên lai, thư trả lời của Gmail có `gmail_quote`), so đầu ra.
- API (MockMvc + DB thật): thứ tự, phân trang không trùng/không sót, `404`, `400`, người nhận `null` với thư cũ, ảnh nhúng không có trong danh sách tệp; nội dung `TEXT`/`HTML`/`UNCHECKED` (lấy bù thành công, provider lỗi → `502`, gọi lại sau lỗi); tệp: header, `inline` chỉ với ảnh, `404`, `502`.
- Gmail (WireMock): `format=full` có HTML, `To`/`Cc`, ảnh nhúng; `attachments.get`.

## Risks / Trade-offs
- Bộ lọc bỏ sót một cách tấn công → iframe không script, không form và CSP chặn tiếp. Hai lớp độc lập; test bảng chuỗi độc hại giữ cho lớp thứ nhất.
- CSS trong thư không được làm sạch. Rủi ro còn lại là đọc trộm qua `url()`, và CSP chặn mọi tải từ xa cho tới khi người dùng bấm "Hiện ảnh". CSS không chạy được script ở trình duyệt hiện đại.
- `srcdoc` thừa hưởng CSP của trang. Nếu sau này Sino đặt CSP cho cả app, `img-src` của app phải cho `https:` thì "Hiện ảnh" mới có tác dụng.
- Tệp lớn (tới 25 MB) đi qua bộ nhớ backend vì Gmail trả base64 trong JSON. Chấp nhận với MVP một người dùng; ghi vào F12. BE-56 (review): chặn trên 25 MB và đọc tối đa 50 MB tệp tải xuống cùng 25 MB ảnh trong thư từ provider cùng lúc (`Semaphore` đếm theo byte). Giới hạn chỉ phủ lúc đọc từ provider (lúc bộ nhớ gấp mấy lần cỡ tệp); sau đó mỗi tệp còn giữ một bản tới khi ghi xong cho trình duyệt. Đọc theo luồng (stream) thay vì cả tệp để F12.
- Hạn đọc của client JDK trong Spring 7 là hạn **tổng** tới lúc đọc xong thân response, không phải giữa hai lần đọc. 10 s cho một tệp 25 MB (khoảng 33 MB base64) đòi mạng nhanh hơn khoảng 3,3 MB/s, nên riêng `attachments.get` có hạn 60 s (BE-56, có test WireMock trả chậm).
- Tệp không rõ kích thước tính như 25 MB lúc giữ chỗ, nhưng kích thước thật không được kiểm sau khi đọc. Gmail luôn cho kích thước; connector của F09 phải xét lại.
- Thư nhập giữa BE-55 và BE-56 đã là `HTML` nên không được lấy bù: ảnh nhúng của chúng chưa có dòng `attachment` và `cid:` bị bỏ, cho tới khi thư được nhập lại. Chỉ ảnh hưởng dữ liệu trên máy dev.
- `attachmentId` của Gmail đổi sau mỗi lần đọc thư (BE-39, theo tài liệu) nên Sino tìm phần theo `partId`; BE-57 kiểm trên hộp thư thật rằng `partId` đứng yên giữa các lần đọc. **Còn mở (2026-10-12):** hộp thư thử chưa có thư kèm tệp, nên chưa đo được; `RealGmailTests` đã có phép đếm, chạy lại khi có thư kèm tệp.
- Lần đầu mở thư cũ chờ Gmail (BE-57 đo: trung vị 637 ms, chậm nhất 1,4 s; mở lại 35 ms). Trong lúc đó vẫn thấy phần chữ.

## Migration Plan
- Migration chỉ thêm cột có mặc định. Thư hiện có thành `UNCHECKED` và được lấy bù khi mở. Rollback = bỏ cột; không mất dữ liệu cũ.
- Web và backend có thể ra riêng: web với backend cũ nhận `404` ở `…/messages` thì hiện `LatestPreview` như trước.

## Open Questions
- Không có. Các lựa chọn để sau đã nằm ở Non-goals.

## Definition of Done — F06
- Backend: ba endpoint theo Contract API, HTML lưu khi nhập và lấy bù khi mở, bộ lọc qua bảng chuỗi độc hại, `./mvnw -B -ntp verify` xanh; chạy thật với Gmail của người dùng (README).
- Web: đọc cả cuộc trò chuyện trên API thật, HTML trong iframe sandbox, "Hiện ảnh", thư cũ hơn, tải tệp; lint, `tsc -b`, test, build xanh; Chrome thật.
- Spec delta được dồn vào `openspec/specs/` và change được archive.
