# Phase 2 · F06 — Đọc cả cuộc trò chuyện · Implementation Plan

> **HYBRID mode:** backend AUTO, frontend AUTO. Người dùng 2026-10-10 giao toàn quyền chốt ("tự xử hết luôn đi"): quyết định D-120…D-126 trong design là agent chốt theo ủy quyền.
> Change dùng chung: phiên web (sino-web-33) làm mục 2; phiên backend (sino-api-ec) nhận mục 1 sau BE-46 và được sửa task của mình khi nhận (số task, file, hướng làm).
> Thứ tự: web làm trước theo Contract API của design (contract-first, như FE-50); backend làm song song; chạy thật ở BE-57 và FE-60.

## 1. Backend — phiên backend

> Mỗi task: test đỏ trước rồi xanh, kiểm tra ngược, `./mvnw -B -ntp verify` xanh, file kiến thức của backend + `.docx`, commit riêng trên `dev`. Build và test trong worktree riêng khi người dùng đang chạy backend từ IntelliJ.

- [ ] 1.1 **BE-54 — Danh sách thư của một cuộc trò chuyện, người nhận**
  - **Goal / Why:** web đọc được mọi thư của một cuộc trò chuyện (D-123).
  - **Depends on:** F05 (bảng `message`, `attachment`; `InboxService`).
  - **Files:** `conversation/api` (`GET /api/conversations/{id}/messages`), truy vấn keyset `message(conversation_id, sent_at DESC)` + `id`, con trỏ (dùng lại cách mã hóa của `InboxCursor`); `NormalizedMessage` + người nhận; Gmail đọc `To`/`Cc`/`Reply-To`; `ConversationStore` ghi `metadata.to`/`cc`/`replyTo` và không xóa khi cập nhật lại; test.
  - **Hướng làm:** theo design mục Contract API và Backend design 1–2. `bodyFormat` trả `TEXT` cho tới BE-55 (chưa có cột). Ảnh nhúng chưa được ghi nên danh sách tệp đã đúng.
  - **Test:** DB thật: thứ tự, hai trang, thư cùng giờ ở chỗ cắt trang, `limit` ngoài khoảng / cursor lạ → `400`, cuộc trò chuyện của account đã xóa → `404`, người nhận `null` với thư cũ; Gmail (WireMock): `To`/`Cc` nhiều địa chỉ, RFC 2047.
  - **Acceptance criteria:** spec `message-history`.

- [ ] 1.2 **BE-55 — Lưu HTML khi nhập, làm sạch, API nội dung, lấy bù thư cũ**
  - **Goal / Why:** thư HTML hiện đúng mà không mở đường cho XSS; thư đã nhập cũng có HTML (D-120, D-121, D-122).
  - **Depends on:** BE-54.
  - **Files:** migration V14 (`message.html_content`, `body_format`); `NormalizedMessage.htmlContent`; Gmail lấy phần `text/html`; `conversation` lớp làm sạch (jsoup `Cleaner`); contract `fetchMessageContent` + Gmail; `GET …/messages/{messageId}/body`; mã lỗi `MESSAGE_NOT_FOUND`, `MESSAGE_CONTENT_UNAVAILABLE`; test.
  - **Hướng làm:** design mục Backend design 3–5. Bộ lọc là hàm thuần: HTML gốc vào, `{html, remoteImages}` ra. Lấy bù: gọi provider ngoài transaction, lưu trong transaction ngắn.
  - **Test:** bảng chuỗi độc hại (OWASP XSS Filter Evasion) và vài thư thật đã ẩn danh (bản tin, biên lai, thư trả lời có `gmail_quote`); `remoteImages`; HTML quá 1 000 000 ký tự; cập nhật lại không xóa HTML; lấy bù thành công / provider lỗi → `502` và vẫn `UNCHECKED`.
  - **Acceptance criteria:** spec `mail-content`; delta `provider-contract` (đọc lại một thư).
  - **Hints:** Level 1 — "vì sao giữ HTML gốc và làm sạch mỗi lần trả, thay vì làm sạch một lần lúc lưu?".

- [ ] 1.3 **BE-56 — Tải tệp đính kèm, ảnh nhúng**
  - **Goal / Why:** tệp mở được từ Sino, ảnh nhúng hiện trong HTML, không tệp nào chạy được trên origin của Sino (D-125).
  - **Depends on:** BE-55.
  - **Files:** migration V15 (`attachment.content_id`, `inline`); Gmail ghi phần ảnh nhúng; contract `fetchAttachment` + Gmail `attachments.get`; `GET …/attachments/{attachmentId}`; bộ lọc đổi `cid:`; mã lỗi `ATTACHMENT_NOT_FOUND`, `ATTACHMENT_UNAVAILABLE`, `ATTACHMENT_NOT_INLINE`; test.
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

- [x] 2.2 **FE-58 — Thư HTML trong iframe sandbox, "Hiện ảnh"**
  - **Thực hiện (2026-10-10, AUTO):** `mailFrame.ts`: `MAIL_FRAME_SANDBOX`, `mailDocument(html, { showImages, origin })` (CSP, `base target="_blank"`, `referrer` `no-referrer`, kiểu nền trắng). `components/MailFrame.tsx`: iframe `sandbox` + `srcdoc` + `referrerPolicy`, chiều cao theo `body` của thư (`ResizeObserver` sau `load`). `components/MailBody.tsx`: thư `TEXT` (hoặc không có `bodyFormat`) hiện chữ có liên kết; `HTML`/`UNCHECKED` hỏi `…/body` qua `useMessageBody` (khóa `['message-body', …]`, `staleTime: Infinity`), trong lúc chờ hiện chữ mờ (`aria-busy`), lỗi thì chữ + "Không tải được bản đầy đủ…" + "Thử lại", `format` = `TEXT` thì ở lại chữ; dòng "Ảnh trong thư đang ẩn…" + "Hiện ảnh" cho từng thư. `Message.bodyFormat` (tùy chọn), `MessageBody`, `fetchMessageBody`.
  - **Làm khác kế hoạch:** ~~hàm dựng `srcdoc` trong `format.ts`~~ → file riêng `mailFrame.ts`. **LÝ DO:** cùng chỗ với hằng `sandbox`, cả hai là phần an ninh của khung, dễ tìm và dễ review. Thêm `<meta name="referrer" content="no-referrer">` và `referrerPolicy` (design không ghi): URL của Sino có ID cuộc trò chuyện, không cần cho trang ngoài biết.
  - **Kiểm chứng (2026-10-10):** RED: `MailHtml.test.tsx` 3/5 đỏ (2 cái giữ hành vi hiện có: thư chữ không hỏi thêm, thư cũ hóa ra chỉ có chữ), `mailFrame.test.ts` không chạy được (chưa có file); GREEN. `pnpm lint` 0, `tsc -b` 0, `vitest` 504/504, `pnpm build` 0. Chrome (API do CDP trả) 1440 tối và 390 sáng, HTML **chưa làm sạch** có `<script>`, `<img onerror>`, form: tiêu đề trang vẫn "Sino" (không script nào chạy), `form.submit()` gọi từ ngoài không tạo request; ảnh từ xa 0 request trước "Hiện ảnh", 1 sau; ảnh nhúng qua Sino tải được; khung cao bằng `body` (398 → 804 px ở 1440 khi ảnh hiện, không cuộn bên trong); không tràn ngang.
  - **Goal / Why:** bản tin và biên lai trông như trong Gmail, không script nào chạy, ảnh theo dõi không tự tải (D-120, D-121).
  - **Depends on:** FE-57; Contract API (`GET …/body`).
  - **Files:** `src/features/inbox/inbox.api.ts` (`fetchMessageBody`), `components/MailBody.tsx`, `components/MailFrame.tsx`, hàm thuần dựng `srcdoc` (`mailFrame.ts` hoặc trong `format.ts`), `EmailThread.tsx`, test.
  - **Test:** iframe có đúng `sandbox`, không `allow-scripts`; `srcdoc` có CSP `default-src 'none'`; `remoteImages` → dòng báo, "Hiện ảnh" → CSP có `https:`, thư khác vẫn chặn; `TEXT` không hỏi `…/body`; `502` → phần chữ + dòng báo + "Thử lại"; hàm dựng `srcdoc` (CSP có/không ảnh, `base target`).
  - **Acceptance criteria:** spec `inbox-thread` (Thư HTML trong khung cô lập, Ảnh từ xa chỉ tải khi người dùng cho phép).

- [ ] 2.3 **FE-59 — Tải tệp đính kèm; kiểm tra lỗi gài**
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
