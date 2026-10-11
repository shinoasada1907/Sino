# Phase 2 · F06 — Đọc cả cuộc trò chuyện · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng 2026-10-10 giao toàn quyền chốt ("tự xử hết luôn đi"): quyết định D-120…D-126 trong design là agent chốt theo ủy quyền.
> Change dùng chung: phiên web (sino-web-33) làm mục 2; phiên backend (sino-api-ec) nhận mục 1 sau BE-46 và được sửa task của mình khi nhận (số task, file, hướng làm).
> Thứ tự: web làm trước theo Contract API của design (contract-first, như FE-50); backend làm song song; chạy thật ở BE-57 và FE-60.

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, kiểm tra ngược, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [x] 1.1 **BE-54 — Danh sách thư của một cuộc trò chuyện, người nhận**
  - **Thực hiện (2026-10-11, AUTO):**
    - Contract: `NormalizedRecipients(to, cc, replyTo)` với `Address(name, address)` (mới); `NormalizedMessage` thêm thành phần `recipients` (`null` = connector không biết) và khóa dùng chung `SUBJECT`; 20 lời gọi constructor thêm đối số.
    - Gmail: `To`, `Cc`, `Reply-To` qua `MailHeaders.mailboxes` (thứ tự giữ nguyên, tên RFC 2047, địa chỉ viết thường, bỏ NUL).
    - Lưu: migration V14 thêm cột `message.recipients jsonb` (null = không biết); `JdbcConversationStore` ghi người nhận vào đó, lần lưu không mang người nhận giữ bản đã lưu bằng `coalesce` ở cả `SET` lẫn `WHERE ... IS DISTINCT FROM` nên không tính là đổi. `WithoutNul` bỏ NUL trong người nhận (địa chỉ chỉ toàn NUL thì bỏ địa chỉ đó, tên chỉ toàn NUL thì thành `null`). Gmail: tiêu đề rỗng thì không có khóa `subject`.
    - API: `GET /api/conversations/{id}/messages` (`ConversationMessagesController`, `MessageResponse`), service `MessageHistory` (trang thư + tệp của cả trang trong hai câu SQL), phạm vi qua `InboxService.requireInInbox` (mới, `detail` dùng lại). Cursor: `KeysetCursor` dùng chung (`<loại><thời điểm>|<id>`), `InboxCursor` loại rỗng (chữ như trước), `MessageCursor` loại `message|`. `bodyFormat` luôn `TEXT` tới BE-55.
    - README: dòng endpoint. File kiến thức Phase 2 mục 19. Design: mục Contract API (`sender` có thể `null`) và Backend design 1–2.
  - **Làm khác kế hoạch:**
    - ~~`metadata.to`/`cc`/`replyTo`~~ → cột riêng `message.recipients` (V14) = `{to, cc, replyTo}`. **LÝ DO:** review hỏi vì sao không dùng cột riêng; bản đầu dùng một khóa `metadata.recipients`, phải giữ riêng khóa đó trong cột của connector và lặp một biểu thức `CASE … ||` ở `SET` lẫn `WHERE`; cột riêng chỉ cần `coalesce`. Hệ quả: BE-55 dùng V15, BE-56 dùng V16 (design mục Backend 1).
    - `sender` = `null` khi provider không cho biết người gửi (design chỉ ghi `name` có thể `null`). **LÝ DO:** cột `sender_participant_id` vốn cho phép `null` (thông báo hệ thống); phiên web đã chịu được (`501f9ee`).
    - Danh sách thư ở service riêng `MessageHistory` thay vì thêm vào `InboxService`. **LÝ DO:** BE-55, BE-56 thêm nội dung và tệp (có gọi provider) vào cùng chỗ; `InboxService` giữ phần Hộp thư.
    - `subject` thành khóa dùng chung của contract. **LÝ DO:** module `conversation` đọc tiêu đề của từng thư; trước đó là khóa riêng của Gmail.
  - **Kiểm chứng (2026-10-11):** build và test trong worktree riêng (backend của người dùng chạy trong IntelliJ).
    - RED: `ConversationMessagesApiTests` 12/13 đỏ (`404`; test `401` xanh từ đầu nhờ lớp bảo mật), `JdbcConversationStoreTests` 15 đỏ, `GmailMessageNormalizerTests` 2 đỏ; `NormalizedRecipientsTests` xanh từ đầu (record viết trước test). GREEN: 194 test của các lớp liên quan.
    - Kiểm tra ngược: 29 lỗi gài (thứ tự, cursor, phạm vi, `limit`, các trường của thư, lưu và giữ người nhận, lọc NUL, Gmail đọc To/Cc/Reply-To, tiêu đề rỗng), 29 bị bắt; lỗi duy nhất sống sót ở lần đầu (bỏ kiểm tiền tố cursor) bị bắt sau khi thêm ca `notours|…`; lần chạy mốc xanh. Bảng ở file kiến thức mục 19.5.
    - `./mvnw -B -ntp verify` → 1035 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS; `ModularityTests` xanh.
  - **Sau review (2026-10-11):** agent `senior-reviewer` không thấy CRITICAL/HIGH. MEDIUM: spec `message-history` nói `sender` luôn có → sửa spec, thêm scenario "Thư không có người gửi". Câu hỏi cuối "sao không dùng cột riêng" → đổi sang cột `message.recipients` (V14), xem "Làm khác kế hoạch". LOW đã sửa: tiêu đề rỗng → không có khóa `subject`; tên/địa chỉ chỉ toàn NUL; Javadoc `NormalizedRecipients`; `getObject(OffsetDateTime)` thay `getTimestamp`; `@JsonIgnoreProperties(ignoreUnknown = true)` cho bản đọc người nhận; test chốt chuỗi cursor Hộp thư, `MessageCursorTests`, thứ tự `id` của thư cùng giờ. Không làm: test Gmail bằng WireMock. **LÝ DO:** đường gọi `messages.get` không đổi, phần mới là đọc ba header và đã có test bộ chuẩn hóa trên mẫu JSON.
  - **Goal / Why:** web đọc được mọi thư của một cuộc trò chuyện (D-123).
  - **Depends on:** F05 (bảng `message`, `attachment`; `InboxService`).
  - **Files:** `conversation/api` (`GET /api/conversations/{id}/messages`), truy vấn keyset `message(conversation_id, sent_at DESC)` + `id`, con trỏ (dùng lại cách mã hóa của `InboxCursor`); `NormalizedMessage` + người nhận; Gmail đọc `To`/`Cc`/`Reply-To`; `ConversationStore` ghi ~~`metadata.to`/`cc`/`replyTo`~~ cột `recipients` (migration V14) và không xóa khi cập nhật lại; test.
  - **Hướng làm:** theo design mục Contract API và Backend design 1–2. `bodyFormat` trả `TEXT` cho tới BE-55 (chưa có cột). Ảnh nhúng chưa được ghi nên danh sách tệp đã đúng.
  - **Test:** DB thật: thứ tự, hai trang, thư cùng giờ ở chỗ cắt trang, `limit` ngoài khoảng / cursor lạ → `400`, cuộc trò chuyện của account đã xóa → `404`, người nhận `null` với thư cũ; Gmail (WireMock): `To`/`Cc` nhiều địa chỉ, RFC 2047.
  - **Acceptance criteria:** spec `message-history`.

- [x] 1.2 **BE-55 — Lưu HTML khi nhập, làm sạch, API nội dung, lấy bù thư cũ**
  - **Thực hiện (2026-10-11, AUTO):**
    - Dữ liệu: V15 `message.html_content`, `body_format` (`TEXT`/`HTML`/`UNCHECKED`, hai `CHECK`, `DEFAULT` chỉ để đánh dấu dòng cũ rồi bỏ). `JdbcConversationStore`: HTML tối đa 1 000 000 ký tự (dài hơn thì `TEXT`), lưu lại giữ HTML đã lưu, `UNCHECKED` được chốt khi đồng bộ chạm vào; `storeContent` cho lấy bù (chỉ đổi thư còn `UNCHECKED`). `WithoutNul` lọc NUL trong HTML.
    - Contract: `NormalizedMessage.htmlContent` (thành phần thứ 14), `MessageContent(htmlContent, recipients)`, `MessageProvider.fetchMessageContent` (mặc định rỗng). Gmail: phần `text/html` đầu tiên không phải tệp, không đi vào tệp hay thư chuyển tiếp đính kèm (`message/rfc822`, sửa luôn cho phần chữ); `fetchMessageContent` qua `messages.get`.
    - `MailHtml` (bộ lọc, hàm thuần, jsoup `Cleaner` + danh sách cho phép), `MessageBodies` (phạm vi, tìm thư trong cuộc trò chuyện, lấy bù ngoài transaction, ghi trong `TransactionTemplate`, phát `ConversationChanged`), `BodyFormat`, `MessageBody`; `GET …/messages/{messageId}/body`; danh sách thư trả `bodyFormat` thật. Mã lỗi `MESSAGE_NOT_FOUND`, `MESSAGE_CONTENT_UNAVAILABLE` qua loại lỗi mới `PROVIDER_FAILED` (`502`).
    - README: dòng endpoint, `bodyFormat`. File kiến thức Phase 2 mục 20. Design (Backend design 2–5), spec `mail-content` (scenario "Provider không còn thư").
  - **Làm khác kế hoạch:**
    - ~~migration V14~~ → V15. **LÝ DO:** V14 là cột người nhận của BE-54.
    - Lấy bù ghi cả người nhận (`MessageContent` có `recipients`). **LÝ DO:** thư nhập trước BE-54 cũng chưa có người nhận; một lần `messages.get` cho cả hai.
    - Ảnh `cid:` bị bỏ ở BE-55 (bộ lọc nhận một hàm tra ảnh nhúng, ở đây luôn rỗng). **LÝ DO:** ảnh nhúng và đường dẫn của chúng là BE-56.
    - Thêm loại lỗi `PROVIDER_FAILED` → `502` (module `common`). **LÝ DO:** contract dùng `502`, chưa có loại nào ứng với nó; `503` vẫn là "Sino tạm không dùng được một thứ nó cần". F10 cũng cần `502`.
    - Gmail không đi vào bên trong tệp hay `message/rfc822` khi chọn phần thân (đổi cả phần chữ của BE-37). **LÝ DO:** review: thư chỉ có chữ mà đính kèm một thư HTML thì lấy nhầm HTML của thư đính kèm.
  - **Kiểm chứng (2026-10-11):** build và test trong worktree riêng (backend của người dùng chạy trong IntelliJ).
    - RED: `MailHtmlTests` 43/52 đỏ trên `MailHtml` tạm (trả nguyên HTML). Các test lưu, API, Gmail viết sau code; khả năng đỏ của chúng chứng minh bằng kiểm tra ngược.
    - GREEN: 409 test của các lớp liên quan (bộ lọc 64, API nội dung 9, lưu, Gmail chuẩn hóa và WireMock, contract, xử lý lỗi).
    - Kiểm tra ngược: lượt 1, 37 lỗi gài, 33 bị bắt; 4 sống sót → 3 test mới và bỏ phép so HTML ở `WHERE` (tương đương phép so `body_format`). Lượt 2 (phần sửa sau review), 16 lỗi gài, 10 bị bắt, 6 sống sót có chủ đích (hai lớp kiểm `background` đỡ nhau; hai lớp gia cố trùng việc jsoup 1.23.2 đã làm; ưu tiên HTML mới chỉ khác ở TOAST; phát sự kiện thừa chỉ khác khi hai request cùng lúc); bảng ở file kiến thức mục 20.6.
    - mXSS review nghi: chạy thẳng jsoup 1.23.2 với ba payload `<svg>`/`<math>` + `<style>`: jsoup mã hóa `<` trong thuộc tính và chữ nên không lọt; bộ test mới cũng xanh với bộ lọc cũ. Gia cố vẫn giữ.
    - `./mvnw -B -ntp verify` → 1129 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS; `ModularityTests` xanh. Sau khi xuống dòng hai chỗ (chú thích, annotation): `MailHtmlTests` + `JdbcConversationStoreTests` 107/107.
  - **Sau review (2026-10-11):** agent `senior-reviewer` không có CRITICAL/HIGH đã xác minh. MEDIUM: thứ tự và `media` của `<style>` → sửa, test; thiếu ca mXSS `<svg>`/`<math>` + `<style>` → thêm ba ca, gia cố `keepCssOnly`. LOW đã sửa: bỏ `DEFAULT` của `body_format`; Javadoc (CSP, `content`, `TEXT`); phát `ConversationChanged` sau lấy bù; `image-set`; giữ HTML đã lưu (không chép lại TOAST); Gmail không vào `message/rfc822`; `https:/…` không là địa chỉ web. Câu hỏi "gộp hai nghĩa của rỗng" → giữ, lý do ở design (Backend design 4).

  - **Goal / Why:** thư HTML hiện đúng mà không mở đường cho XSS; thư đã nhập cũng có HTML (D-120, D-121, D-122).
  - **Depends on:** BE-54.
  - **Files:** migration ~~V14~~ V15 (`message.html_content`, `body_format`; V14 là cột người nhận của BE-54); `NormalizedMessage.htmlContent`; Gmail lấy phần `text/html`; `conversation` lớp làm sạch (jsoup `Cleaner`); contract `fetchMessageContent` + Gmail; `GET …/messages/{messageId}/body`; mã lỗi `MESSAGE_NOT_FOUND`, `MESSAGE_CONTENT_UNAVAILABLE`; test.
  - **Hướng làm:** design mục Backend design 3–5. Bộ lọc là hàm thuần: HTML gốc vào, `{html, remoteImages}` ra. Lấy bù: gọi provider ngoài transaction, lưu trong transaction ngắn.
  - **Test:** bảng chuỗi độc hại (OWASP XSS Filter Evasion) và vài thư thật đã ẩn danh (bản tin, biên lai, thư trả lời có `gmail_quote`); `remoteImages`; HTML quá 1 000 000 ký tự; cập nhật lại không xóa HTML; lấy bù thành công / provider lỗi → `502` và vẫn `UNCHECKED`.
  - **Acceptance criteria:** spec `mail-content`; delta `provider-contract` (đọc lại một thư).
  - **Hints:** Level 1 — "vì sao giữ HTML gốc và làm sạch mỗi lần trả, thay vì làm sạch một lần lúc lưu?".

- [x] 1.3 **BE-56 — Tải tệp đính kèm, ảnh nhúng**
  - **Thực hiện (2026-10-11, AUTO):**
    - Dữ liệu: V16 `attachment.content_id` (có giá trị = ảnh nhúng). `JdbcConversationStore` ghi `content_id`; lấy bù (`storeContent`) thêm ảnh nhúng bên cạnh các tệp đã có. `ConversationSummaries`: `has_attachments` bỏ qua ảnh nhúng; `MessageHistory`: danh sách tệp bỏ qua ảnh nhúng.
    - Contract: `NormalizedAttachment.contentId`, `AttachmentContent` (mới), `MessageContent.inlineImages`, `MessageProvider.fetchAttachment` (mặc định ném `CAPABILITY_NOT_SUPPORTED`). Gmail: ảnh PNG/JPEG/GIF/WebP có `Content-ID` (không phải `attachment`) mà HTML hiện bằng `<img src="cid:…">` là ảnh nhúng; ảnh nhúng khác và phần có tên mà Gmail giữ riêng là tệp; danh sách kiểu ảnh dùng chung ở `NormalizedAttachment.PICTURE_TYPES`; kiểu `MIXED` chỉ khi có tệp thật; `fetchAttachment` đọc thư tìm phần theo `partId`, rồi `messages.attachments.get` khi Gmail giữ phần đó riêng.
    - `MessageFiles` (mới) + `GET …/messages/{messageId}/attachments/{attachmentId}[?inline=true]`: `Content-Type` đã lưu (không có thì kiểu provider trả; không cụ thể thì `application/octet-stream`), `Content-Disposition` `attachment`/`inline` với `filename*=UTF-8''…`, `nosniff`, CSP `sandbox; default-src 'none'`; `inline` chỉ PNG/JPEG/GIF/WebP. `MessageBodies` đổi `cid:` thành đường dẫn tương đối của đúng ảnh (đúng id, rồi giải mã `%XX`, rồi không phân biệt hoa thường). Mã lỗi `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_NOT_INLINE`, `ATTACHMENT_UNAVAILABLE`.
    - Sau review: tệp lớn hơn 25 MB → `422 ATTACHMENT_TOO_LARGE`; tối đa 50 MB tệp tải xuống đang đọc từ provider cùng lúc, ảnh `inline` có phần riêng 25 MB (`Semaphore` đếm theo byte, tệp không rõ kích thước tính 25 MB) → `503 ATTACHMENT_BUSY`; ảnh `inline` có `Cache-Control: max-age=86400, private`, tệp tải xuống giữ `no-store`.
    - Sau review lần hai: một `Content-ID` chỉ một ảnh nhúng (phần trùng id là tệp); thư mà HTML không được lưu (quá dài) thì ảnh nhúng lưu là tệp; ~~`MessageContent.inlineImages`~~ → `attachments` (đọc lại thư cũ mang cả tệp lẫn ảnh nhúng); riêng `attachments.get` của Gmail có hạn 60 s vì hạn 10 s của Spring là hạn tổng tới lúc đọc xong.
    - README: dòng endpoint. File kiến thức Phase 2 mục 21. Design, spec `attachment-download`.
  - **Làm khác kế hoạch:**
    - ~~migration V15 (`content_id`, `inline`)~~ → V16 chỉ `content_id`. **LÝ DO:** V15 là HTML (BE-55); cờ `inline` luôn suy được từ `content_id` (ảnh nhúng không bao giờ là tệp), hai cột chỉ thêm cơ hội lệch nhau.
    - ~~`400 ATTACHMENT_NOT_INLINE`~~ → `422`. **LÝ DO:** hệ thống lỗi không có loại nào ánh xạ sang `400`; `422` (`INVALID`) là "đúng dạng nhưng phạm quy tắc". Phiên web không đọc mã này (đã xác nhận).
    - Phần nhúng không phải ảnh (có `Content-ID`) giờ là tệp; trước BE-56 nó bị bỏ hẳn. **LÝ DO:** kiểm tra ngược cho thấy quy tắc chưa có test; bỏ hẳn thì người dùng không tải được tệp đó.
    - ~~Ảnh có `Content-ID` là ảnh nhúng~~ → chỉ khi HTML hiện nó và là PNG/JPEG/GIF/WebP; còn lại là tệp, kể cả khi không có tên. **LÝ DO:** review: ảnh mà HTML không gọi tới hay trình duyệt không hiện được sẽ không hiện trong thư mà cũng không có trong danh sách tệp.
    - Thêm ngoài kế hoạch: giới hạn 25 MB và 50 MB cùng lúc, `Cache-Control` cho ảnh. **LÝ DO:** review (HIGH): Gmail trả cả tệp base64 trong JSON, mỗi lần tải chiếm bộ nhớ gấp mấy lần cỡ tệp, không giới hạn thì vài lần tải lớn cùng lúc có thể làm backend hết bộ nhớ. Đọc theo luồng để F12.
  - **Kiểm chứng (2026-10-11):** đỏ trước 133 test (15 sai, 5 lỗi trên code tạm), xanh 405; sau review: 7 test mới đỏ (giới hạn 25 MB, tải cùng lúc, `Cache-Control`, `cid:` có `%`, kiểu do provider cho, ảnh không được gọi tới, SVG/TIFF), vòng hai 4 test đỏ (ảnh của thư HTML quá dài khi nhập và khi lấy bù, ảnh trong thư lúc hai tệp lớn đang tải, Gmail trả chậm 3 s bị cắt ở hạn 2 s), xanh 244 test liên quan. Kiểm tra ngược: trước review 13 lỗi gài (dừng khi có review), 10 bị bắt, `gmail-any-embedded-part` sống sót → đổi quy tắc + test, `store-content-id-change-ignored` → thêm test; sau review 47 lỗi gài, 44 bị bắt, `files-any-message`/`files-any-conversation` sống sót → thêm test (thư khác cùng cuộc trò chuyện; cuộc trò chuyện hợp lệ với thư nằm chỗ khác), `controller-no-nosniff` tương đương (Spring Security cũng gắn `nosniff`; giữ ở controller, test kiểm header chỉ có một giá trị); vòng hai 14 lỗi gài, 14 bị bắt; `gmail-fetch-apart-first` tương đương (Gmail không cho cả `data` lẫn `attachmentId`). `./mvnw -B -ntp verify` → 1184 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS. Review `senior-reviewer` hai lượt: lượt một HIGH (bộ nhớ khi tải), MEDIUM (ảnh nhúng không hiện được, bộ nhớ đệm), LOW; lượt hai không CRITICAL/HIGH, MEDIUM (ảnh của thư HTML quá dài, Javadoc nói quá giới hạn bộ nhớ), LOW; đều đã sửa hoặc ghi lại (độ dài thật của tệp không rõ kích thước: F09). Chưa chạy với Gmail thật: BE-57.
  - **Goal / Why:** tệp mở được từ Sino, ảnh nhúng hiện trong HTML, không tệp nào chạy được trên origin của Sino (D-125).
  - **Depends on:** BE-55.
  - **Files:** migration ~~V15~~ V16 (`attachment.content_id`, ~~`inline`~~); Gmail ghi phần ảnh nhúng; contract `fetchAttachment` + Gmail `attachments.get`; `GET …/attachments/{attachmentId}`; bộ lọc đổi `cid:`; mã lỗi `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_UNAVAILABLE`, `ATTACHMENT_NOT_INLINE`; test.
  - **Hướng làm:** design D-125, mục Contract API. Lấy bù (BE-55) cũng ghi ảnh nhúng.
  - **Test:** header (`attachment`, `filename*`, `nosniff`, CSP `sandbox`); `inline=true` chỉ với PNG/JPEG/GIF/WebP, SVG → `400`; `404`; provider lỗi → `502`; `cid:` không có phần tương ứng → ảnh bị bỏ; danh sách tệp không có ảnh nhúng.
  - **Acceptance criteria:** spec `attachment-download`; delta `provider-contract` (tải tệp).

- [ ] 1.4 **BE-57 — Chạy thật với Gmail, README, tổng kết**
  - **Goal / Why:** bằng chứng trên hộp thư thật của người dùng: thư cũ được lấy bù, bản tin hiện HTML, tệp tải được.
  - **Depends on:** BE-54…BE-56.
  - **Test:** gọi ba endpoint trên dữ liệu thật; đếm thư `UNCHECKED` → `HTML`/`TEXT` sau khi mở; đo thời gian lấy bù; không ghi nội dung thư vào hồ sơ.
  - **Acceptance criteria:** DoD (phần backend).

## 2. Web — phiên web (sino-web-33)

> Mode HYBRID, frontend AUTO. Mỗi task: test đỏ trước rồi xanh, `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`, Chrome một lượt ở cỡ màn task đụng tới (quy ước kiểm chứng frontend trong `CLAUDE.md`), file kiến thức Phase 1 + `.docx`, commit riêng trên `dev`. Làm theo Contract API trong design, chạy với backend thật ở FE-60.

- [x] 2.1 **FE-57 — Đọc cả cuộc trò chuyện trên API**
  - **Thực hiện (2026-10-10, AUTO):**
    - `inbox.api.ts`: `fetchMessages`, ánh xạ thư theo Contract API (`self` → "Bạn", `to` nối tên/địa chỉ, `null` khi không biết; thư đi `PENDING` → "Đang gửi", `FAILED` → "Không gửi được", `UNKNOWN` không nói gì tới F10; kiểu tệp từ đuôi tệp hoặc `mimeType`, không tên → "Tệp không tên").
    - `useInbox.ts`: `messagesKey`; `useConversation` thêm `useInfiniteQuery` chạy song song với chi tiết, ghép trang vào `detail.messages` (cũ trước, bỏ trùng) và trả `history` (`loading`, `failed`, `retry`, `older`). `useSendMessage` chèn thư "Đang gửi" vào cache danh sách thư.
    - `EmailThread`: khung chờ khi đang tải, "Xem thư cũ hơn", lỗi có "Thử lại" kèm đoạn đầu thư mới nhất, "Thư không có chữ.", liên kết trong chữ (`linkParts` trong `format.ts`). `LatestPreview` có `later` (bỏ câu "sẽ có ở bản sau" khi là lỗi). `Attachment.sizeBytes` có thể `null`.
    - Bộ API giả dùng dữ liệu mẫu có `fetchMessages`; test FE-50 trả `404` ở API thư như backend F05.
  - **Làm khác kế hoạch:**
    - ~~`useConversation` trả `loadOlder`, `messagesFailed`, `retryMessages`~~ → gom vào một `history`. **LÝ DO:** `EmailThread` nhận một prop thay vì bốn.
    - Thêm: API thư trả `404` thì giữ khung "Thư mới nhất" cũ, không báo lỗi. **LÝ DO:** backend người dùng đang chạy từ `dev` chưa có BE-54; báo lỗi ở mọi cuộc trò chuyện cho tới lúc đó là sai (design, Migration Plan).
    - Hai test `useSendMessage` đổi chỗ kiểm (cache danh sách thư thay cho `detail.messages`), và test "Đang gửi" giữ request lại để thấy được bước giữa: bản cũ kiểm `toHaveLength(1)`, đúng cả khi thư đã thành "Đã gửi".
  - **Kiểm chứng (2026-10-10):** RED: `ThreadOnApi.test.tsx` 6/7 đỏ (cái thứ 7, backend chưa có API thư, giữ hành vi cũ nên xanh từ đầu và ở lại làm test chống hồi quy), `linkParts` 3/3 đỏ, `useSendMessage` 2/2 đỏ; GREEN. `pnpm lint` 0, `tsc -b` 0 (một lỗi kiểu `readonly` trong test, đã sửa), `vitest` 494/494, `pnpm build` 0 (cảnh báo chunk lớn cũ). Chrome (API do CDP trả, 3 thư, mỗi trang 2): 1440 tối và 390 sáng: thư cũ gập, thư mới nhất mở với "tới an.nguyen@gmail.com", 2 liên kết `rel="noopener noreferrer"`, tệp "PDF hop-dong-q4.pdf 242 KB" và "PNG Tệp không tên", "Xem thư cũ hơn" gọi `?cursor=2` rồi biến mất, "2 thư · 2 tệp" → "3 thư · 2 tệp", không tràn ngang (URL 120 ký tự xuống dòng ở 390).
  - **Goal / Why:** mở cuộc trò chuyện là thấy mọi thư (phần chữ), thư mới tự hiện, có thư cũ hơn (D-123, D-124, D-126).
  - **Depends on:** Contract API (`GET …/messages`); không cần backend chạy (MSW).
  - **Files:** `src/features/inbox/inbox.api.ts` (`fetchMessages`, ánh xạ), `useInbox.ts` (`messagesKey`, `useInfiniteQuery` trong `useConversation`, `loadOlder`), `components/EmailThread.tsx` ("Xem thư cũ hơn", lỗi), `format.ts` (chữ có liên kết, nếu cần), `src/test/inboxSampleApi.ts`, test.
  - **Test:** MSW: ba thư → hai gập, một mở; hai trang + "Xem thư cũ hơn"; lỗi `500` → khung "Thư mới nhất" + "Thử lại"; sự kiện `conversations.changed` → thư mới ở cuối; ánh xạ (`self` → "Bạn", `to` `null`, trạng thái thư gửi đi); URL thành liên kết, dấu câu cuối không thuộc liên kết.
  - **Acceptance criteria:** spec `inbox-thread` (Web đọc cả cuộc trò chuyện, Thư chữ có liên kết bấm được).

  - **Theo BE-54 (2026-10-11, phiên backend báo trước khi commit):** `sender` có thể `null` khi provider không cho biết người gửi (thư hệ thống) → web không đọc thẳng `sender.self` nữa: thư đến ghi "Không rõ người gửi", thư đi ghi "Bạn" (`senderName`). Trước đó gặp thư như vậy là `TypeError` và cả cuộc trò chuyện lỗi. RED 1 (`TypeError`), GREEN; `vitest` 539/539, `tsc -b` 0, lint 0, build 0; không đổi giao diện nên không chạy Chrome. Backend cũng cho biết `bodyFormat` = `TEXT` cho mọi thư tới BE-55, nên web chưa gọi `…/body`.

- [x] 2.2 **FE-58 — Thư HTML trong iframe sandbox, "Hiện ảnh"**
  - **Thực hiện (2026-10-10, AUTO):** `mailFrame.ts`: `MAIL_FRAME_SANDBOX`, `mailDocument(html, { showImages, origin })` (CSP, `base target="_blank"`, `referrer` `no-referrer`, kiểu nền trắng). `components/MailFrame.tsx`: iframe `sandbox` + `srcdoc` + `referrerPolicy`, chiều cao theo `body` của thư (`ResizeObserver` sau `load`). `components/MailBody.tsx`: thư `TEXT` (hoặc không có `bodyFormat`) hiện chữ có liên kết; `HTML`/`UNCHECKED` hỏi `…/body` qua `useMessageBody` (khóa `['message-body', …]`, `staleTime: Infinity`), trong lúc chờ hiện chữ mờ (`aria-busy`), lỗi thì chữ + "Không tải được bản đầy đủ…" + "Thử lại", `format` = `TEXT` thì ở lại chữ; dòng "Ảnh trong thư đang ẩn…" + "Hiện ảnh" cho từng thư. `Message.bodyFormat` (tùy chọn), `MessageBody`, `fetchMessageBody`.
  - **Làm khác kế hoạch:** ~~hàm dựng `srcdoc` trong `format.ts`~~ → file riêng `mailFrame.ts`. **LÝ DO:** cùng chỗ với hằng `sandbox`, cả hai là phần an ninh của khung, dễ tìm và dễ review. Thêm `<meta name="referrer" content="no-referrer">` và `referrerPolicy` (design không ghi): URL của Sino có ID cuộc trò chuyện, không cần cho trang ngoài biết.
  - **Kiểm chứng (2026-10-10):** RED: `MailHtml.test.tsx` 3/5 đỏ (2 cái giữ hành vi hiện có: thư chữ không hỏi thêm, thư cũ hóa ra chỉ có chữ), `mailFrame.test.ts` không chạy được (chưa có file); GREEN. `pnpm lint` 0, `tsc -b` 0, `vitest` 504/504, `pnpm build` 0. Chrome (API do CDP trả) 1440 tối và 390 sáng, HTML **chưa làm sạch** có `<script>`, `<img onerror>`, form: tiêu đề trang vẫn "Sino" (không script nào chạy), `form.submit()` gọi từ ngoài không tạo request; ảnh từ xa 0 request trước "Hiện ảnh", 1 sau; ảnh nhúng qua Sino tải được; khung cao bằng `body` (398 → 804 px ở 1440 khi ảnh hiện, không cuộn bên trong); không tràn ngang.
  - **Goal / Why:** bản tin và biên lai trông như trong Gmail, không script nào chạy, ảnh theo dõi không tự tải (D-120, D-121).
  - **Depends on:** FE-57; Contract API (`GET …/body`).
  - **Files:** `src/features/inbox/inbox.api.ts` (`fetchMessageBody`), `components/MailBody.tsx`, `components/MailFrame.tsx`, hàm thuần dựng `srcdoc` (`mailFrame.ts` hoặc trong `format.ts`), `EmailThread.tsx`, test.
  - **Test:** iframe có đúng `sandbox`, không `allow-scripts`; `srcdoc` có CSP `default-src 'none'`; `remoteImages` → dòng báo, "Hiện ảnh" → CSP có `https:`, thư khác vẫn chặn; `TEXT` không hỏi `…/body`; `502` → phần chữ + dòng báo + "Thử lại"; hàm dựng `srcdoc` (CSP có/không ảnh, `base target`).
  - **Acceptance criteria:** spec `inbox-thread` (Thư HTML trong khung cô lập, Ảnh từ xa chỉ tải khi người dùng cho phép).

  - **Sau review (2026-10-10, agent `senior-reviewer` cho FE-57…FE-62):** không CRITICAL; khung thư đứng được khi thư lọt bộ lọc. HIGH đã sửa: thư có `height:100vh` làm khung cao lên mãi (chiều cao `vh` trong iframe theo chính iframe) → hàm thuần `fitFrame`: đo lại sau mỗi lần đổi chiều cao, cùng một khoảng thiếu ba lần liền thì dừng ở 640 px và cho cuộn bên trong; trần 12 000 px. LOW đã sửa: `img-src` chỉ còn `<origin>/api/conversations/` (trước đây thư gọi được mọi đường dẫn của Sino kèm cookie); web gỡ lại `meta`, `base`, `link`, `title` khỏi HTML và ép `target`/`rel` cho mọi liên kết (`DOMParser`, tài liệu trơ) vì backend chưa có bộ lọc; chú thích `gcTime` của nội dung thư sửa cho đúng. Test: `fitFrame` 4, gỡ thẻ 1, CSP đổi 2. Chrome 1440: thư `100vh` đứng ở 640 px qua 6 lần đo (2,4 s), cuộn bên trong; thư thường vẫn 398 → 804 px; ảnh nhúng vẫn tải; liên kết có `noopener noreferrer`.

- [x] 2.3 **FE-59 — Tải tệp đính kèm; kiểm tra lỗi gài**
  - **Thực hiện (2026-10-10, AUTO):** `inbox.api.ts`: `attachmentUrl`, mỗi tệp từ API có `url`; `Attachment.url` (tùy chọn, dữ liệu mẫu không có). `EmailThread`: `MailFile` là `<a href download>` khi có `url`, vẫn là nút như canvas khi không có; tên tệp dài bị cắt (`truncate`).
  - **Kiểm chứng (2026-10-10):** RED 1 (chưa có liên kết), GREEN. Kiểm tra lỗi gài (`mutate.mjs`, 23 lỗi cho `linkParts`, `mailDocument`, `MAIL_FRAME_SANDBOX`, `MailBody`): lần 1 bắt 20; sống sót: địa chỉ trong dấu nháy và `https://.` (thiếu test → thêm 2 test, lần 2 bắt cả hai), regex nhận mọi scheme (**giữ có chủ đích**: lỗi tương đương, phép kiểm `^https?://.` ngay sau đó loại mọi scheme khác). `pnpm lint` 0, `tsc -b` 0, `vitest` 507/507, `pnpm build` 0. Chrome 1440 tối và 390 sáng: hai tệp là `a[download]` đúng đường dẫn (`…/m-3/attachments/att-1`, `att-2`), trông như trước, không tràn ngang.
  - **Goal / Why:** bấm tệp là tải về (D-125); một lần kiểm tra bằng lỗi gài cho hàm thuần của màn đọc thư, trước khi chạy thật.
  - **Depends on:** FE-57; Contract API (`GET …/attachments/{id}`).
  - **Files:** `components/EmailThread.tsx` (tệp là `<a href download>`), `inbox.api.ts` (`attachmentUrl`), test.
  - **Test:** liên kết tệp trỏ đúng đường dẫn; kiểm tra lỗi gài cho hàm dựng `srcdoc` và hàm tìm liên kết.
  - **Acceptance criteria:** spec `inbox-thread` (Tải tệp đính kèm).

- [ ] 2.4 **FE-60 — Chạy với backend thật (sau BE-57)**
  - **Goal / Why:** bằng chứng trên hộp thư thật: thư cũ lấy bù, bản tin HTML, "Hiện ảnh", tệp tải được, thư mới tự hiện trong cuộc trò chuyện đang mở.
  - **Depends on:** FE-57…FE-59, BE-54…BE-57.
  - **Test:** Chrome trên backend người dùng chạy từ `dev`, 1440 và 390, hai theme; đếm request `…/body`; không ghi nội dung thư vào hồ sơ.
  - **Acceptance criteria:** spec `inbox-thread` toàn bộ; DoD (phần web).

## 3. Hoàn tất

- [ ] 3.1 Dồn delta vào `openspec/specs/` và archive (`openspec archive f06-message-history -y`), sau `f05-unified-inbox`.
