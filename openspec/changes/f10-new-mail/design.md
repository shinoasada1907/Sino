# F10 (mở rộng) · Tạo thư mới · Technical Design

> Mode: **HYBRID**. Quyết định kiến trúc thuộc TRAINING: người dùng chọn phạm vi A, chỗ soạn A, cách giữ thư chưa gửi xong A, rồi duyệt cả thiết kế ("oke duyệt", 2026-10-12). D-190…D-195 là **người dùng duyệt**; D-196, D-197 và các chốt kỹ thuật là agent chốt, phiên backend sửa được khi làm.
> Change dùng chung: phiên web viết hồ sơ, contract và phần Web (FE-83…FE-85); phiên backend nhận mục Backend (BE-84…BE-86). Số quyết định: D-190…D-199.
> **Gửi thư thật thay người dùng chỉ khi người dùng cho phép rõ ràng**, tới địa chỉ người dùng chọn (BE-86, FE-85).

## Context

- F10 (`f10-reply`) đã có: `POST /api/conversations/{id}/messages` (trả lời, D-131 chống trùng bằng `clientMessageId`, D-132 kết quả không rõ, D-134 web "Gửi lại" / "Bỏ"), `DELETE …/messages/{messageId}`, `reply.state` (`READY`, `NEEDS_PERMISSION`, `ACCOUNT_UNAVAILABLE`, `NOT_SUPPORTED`), capability `SEND_MESSAGES` theo từng account (`GET /api/accounts` có `capabilities`). BE-60: Gmail thay `Message-ID` của Sino, nên thư "chưa rõ" được đối chiếu theo thread + chữ + thời điểm; BE-62: thư gửi từ Sino có tên người gửi.
- `conversation` unique `(account_id, external_conversation_id)`; `message` unique `(conversation_id, client_message_id)` khi khác null (V17).
- Web: `useSendMessage` (hộp thư đi trong trình duyệt, `clientMessageId`, trạng thái gửi), `Composer` (ô trả lời), `ThreadNotice`, `InboxPage` (bố cục 3 cột / 2 cột / mobile, `/inbox/:conversationId`), `Input`, `Dialog` trong `shared/ui`.
- Canvas "Sino UI" (bản `1790948862-287a`, khớp bản sao trong repo) không có nút hay màn soạn thư mới; kiểu của ô soạn lấy theo `.composer` và `.input` đã có.

## Goals / Non-Goals

**Goals:** soạn và gửi một thư mới từ một tài khoản Gmail của bạn tới một hoặc nhiều địa chỉ; không bao giờ gửi trùng; thư lỗi không mất; biết thư đi từ tài khoản nào.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Decisions

### D-190 — Phạm vi bản đầu: Từ, Tới, Tiêu đề, chữ thuần · **Người dùng duyệt** (2026-10-12, "chọn A")
Ô soạn có: tài khoản gửi (Từ), người nhận (Tới, một hoặc nhiều địa chỉ), tiêu đề (không bắt buộc), nội dung chữ thuần (bắt buộc).
**Phương án bị loại:** thêm Cc/Bcc (B); thêm tệp đính kèm (C); thêm lưu nháp và chuyển tiếp (D).

### D-191 — Soạn ở cột phải, đường dẫn `/inbox/new` · **Người dùng duyệt** ("chọn A")
- `/inbox/new` mở ô soạn ở chỗ đọc thư: cột phải ở 1280px trở lên và ở tablet; trang toàn màn có nút quay lại, ẩn thanh dưới ở mobile. Danh sách vẫn hiện ở desktop và tablet.
- Nút "Thư mới" (icon bút): từ 1280px ở đầu danh sách cạnh chữ "Hộp thư"; tablet ở cuối hàng chip lọc; mobile là icon trên đầu trang cạnh "Tìm kiếm".
- Còn chữ mà rời trang (bấm thư khác, quay lại, đóng tab) thì hỏi "Bỏ thư đang soạn?".
**Phương án bị loại:** hộp thoại giữa màn (B: che hộp thư); cửa sổ nhỏ góc dưới như Gmail (C: thành phần mới, tablet/mobile vẫn phải thành trang).

### D-192 — Backend tạo cuộc trò chuyện ngay khi bấm Gửi · **Người dùng duyệt** ("oke làm A đi")
Backend tạo cuộc trò chuyện với mã ngoài tạm `sino:<clientMessageId>` và thư `PENDING` **trước** khi gọi Gmail; gửi xong thì đổi mã ngoài sang `threadId` của Gmail. Thư lỗi hay chưa rõ ở lại trong cuộc trò chuyện đó, dùng lại "Gửi lại" / "Bỏ" / đối chiếu của F10. Unique `(account_id, external_conversation_id)` chặn tạo hai cuộc trò chuyện cho cùng một `clientMessageId`.
**Phương án bị loại:** chỉ tạo khi Gmail báo đã gửi (B: hết giờ chờ thì không có gì để đối chiếu, "Gửi lại" có thể gửi hai lần); bảng "hộp thư đi" riêng (C: thêm bảng, thêm luồng chuyển, đối chiếu làm lại).

### D-193 — Tài khoản gửi · **Người dùng duyệt**
- Ô "Từ" liệt kê tài khoản của nhà cung cấp gửi được. Tài khoản gửi được thì chọn được; tài khoản chưa cấp quyền gửi ("Cần cấp quyền gửi") hay hết quyền ("Cần đăng nhập lại") vẫn hiện nhưng không chọn được. Có một tài khoản gửi được thì ghi sẵn, không cần chọn.
- Mặc định: tài khoản dùng lần trước trên trình duyệt này (nếu còn gửi được), không thì tài khoản gửi được đầu tiên.
- Không tài khoản nào gửi được: thay ô soạn bằng dòng báo kèm "Cấp quyền gửi" (mở kết nối lại của tài khoản đầu tiên cần quyền), như dòng báo của ô trả lời (D-134).

### D-194 — Sau khi bấm Gửi · **Người dùng duyệt**
- `201` (gửi xong): thay `/inbox/new` bằng `/inbox/{id}` của cuộc trò chuyện mới (không thêm mục vào lịch sử, nên Quay lại về danh sách); danh sách và số đếm được đọc lại.
- `502 SEND_FAILED` / `504 SEND_OUTCOME_UNKNOWN`: cũng sang cuộc trò chuyện đó (`conversationId` trong lỗi); thư hiện "Không gửi được" với "Gửi lại" / "Bỏ", hoặc "Chưa rõ đã gửi chưa", như F10.
- Không có câu trả lời (lỗi mạng): ở lại; ô soạn khóa chữ (gửi lại phải đúng nội dung đã gửi) và báo "Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần." kèm "Gửi lại" (cùng `clientMessageId`) và "Bỏ".
- Mất mạng trước khi gửi: TanStack Query giữ lần gửi tới khi có mạng, như ô trả lời.

### D-195 — Hợp đồng `POST /api/conversations` · **Người dùng duyệt**
Xem mục Contract API. Thư mở đầu chưa gửi xong: `reply.state` = `OPENING_NOT_SENT` (chưa có ô trả lời); "Gửi lại" dùng `POST /api/conversations/{id}/messages` với cùng `clientMessageId` và server gửi lại như thư mới; "Bỏ" thư duy nhất của cuộc trò chuyện xóa cả cuộc trò chuyện.

### D-196 — Đối chiếu thư mới "chưa rõ" không có thread · **Agent chốt** (phiên backend sửa được)
Thư mở đầu `UNKNOWN` chưa có `threadId` để tìm như BE-60. Tìm trong thư đã gửi của tài khoản: nhãn `SENT`, trong khoảng [-1 phút, +5 phút] quanh lúc gửi, cùng người nhận, cùng tiêu đề, cùng chữ; chọn ứng viên chưa thuộc thư khác của Sino (như BE-60). Thấy → `SENT` và đổi mã ngoài như D-192; quá 10 phút không thấy → `FAILED`.
**Phương án bị loại:** coi như `FAILED` ngay (gửi lại có thể thành hai thư).

### D-197 — Người nhận: tách, kiểm, bỏ trùng · **Agent chốt**
Ô "Tới" nhận các địa chỉ cách nhau bằng dấu phẩy, chấm phẩy hay xuống dòng. Mỗi địa chỉ phải có đúng một `@`, phần trước và sau `@` không rỗng, phần sau có dấu chấm, không có khoảng trắng, tối đa 254 ký tự; trùng (không phân biệt hoa thường) chỉ giữ một; tối đa 50 địa chỉ. Địa chỉ sai báo ngay dưới ô ("Địa chỉ không hợp lệ: x"), không gửi. Server kiểm lại cùng quy tắc (`400 VALIDATION_FAILED` với lỗi theo trường).
**Phương án bị loại:** dạng `Tên <địa chỉ>` (để khi có gợi ý từ danh bạ); kiểm đầy đủ RFC 5322 (phức tạp, Gmail tự từ chối địa chỉ hỏng).

### Chốt kỹ thuật (agent, phiên backend sửa được khi làm)
- **Tóm tắt của cuộc trò chuyện mới:** khác D-138 (thư Sino chưa `SENT` không đổi tóm tắt), cuộc trò chuyện mới lấy tóm tắt từ thư mở đầu ngay khi tạo (tiêu đề, đầu chữ, giờ), để nó hiện trong danh sách dù thư chưa đi. `title` = người nhận (địa chỉ, nối bằng ", "), `needsReply` = false.
- **Đồng bộ nhập thư trước:** gửi xong mà lượt đồng bộ đã nhập thread đó (đã có `(account_id, threadId)`): giữ cuộc trò chuyện đã nhập, chép `client_message_id` sang thư đã nhập, xóa cuộc trò chuyện `sino:`; response trả mã của cuộc trò chuyện còn lại (như BE-59 làm với thư trả lời).
- **Contract provider:** `SendMessageCommand` thêm `subject` và cho `externalConversationId` / `replyToExternalMessageId` là null (thư mới); `SendMessageResult` thêm `externalConversationId` (Gmail: `threadId`).
- **Sự kiện:** `conversations.changed` (`source: user`) sau khi tạo và sau khi có kết quả.

## Contract API

### `POST /api/conversations`
```json
{
  "accountId": "01a11c19-…",
  "to": ["minhanh@acme.vn", "bonzed2001@gmail.com"],
  "subject": "Báo giá tháng 10",
  "text": "Chào chị, em gửi báo giá…",
  "clientMessageId": "6f1c…"
}
```
- `to`: 1…50 địa chỉ theo D-197; `subject`: 0…998 ký tự, rỗng hay chỉ khoảng trắng thì gửi không có tiêu đề (`null` trong API); `text`: 1…100 000 ký tự, không chỉ khoảng trắng; `clientMessageId`: UUID. Sai → `400 VALIDATION_FAILED`, `errors` theo trường (`to`, `subject`, `text`, `accountId`, `clientMessageId`).

| Kết quả | Response |
|---|---|
| Gửi xong | `201` + `{ "conversation": ConversationItem, "message": thư (dạng của danh sách thư) }`, `status` = `SENT` |
| Cùng `clientMessageId` đã `SENT` | `200` + như trên |
| Cùng `clientMessageId` đang `PENDING` | `409 SEND_IN_PROGRESS` |
| Cùng `clientMessageId` đang `UNKNOWN` | `409 SEND_OUTCOME_UNKNOWN`, extension `conversationId` |
| Cùng `clientMessageId` đang `FAILED` | gửi lại (lần trước chắc chắn chưa đi) |
| Tài khoản không gửi được (cả khi Gmail báo hết quyền lúc gửi) | `409 SEND_NOT_ALLOWED`, extension `state` (`NEEDS_PERMISSION`, `ACCOUNT_UNAVAILABLE`, `NOT_SUPPORTED`) |
| Gmail từ chối (4xx), giới hạn tần suất, không kết nối được | `502 SEND_FAILED`, extensions `conversationId`, `messageId`; thư `FAILED` |
| Không rõ (hết 15 giây, mất kết nối sau khi request đã đi, Gmail 5xx) | `504 SEND_OUTCOME_UNKNOWN`, extensions `conversationId`, `messageId`; thư `UNKNOWN` |
| Tài khoản không có / không thuộc người dùng / đã xóa | `404 ACCOUNT_NOT_FOUND` |

### `GET /api/conversations/{id}` — thêm trạng thái trả lời
- `reply.state` thêm `OPENING_NOT_SENT`: thư mở đầu của cuộc trò chuyện chưa `SENT` (mã ngoài còn là `sino:`); `reply.to` = người nhận của thư mở đầu.

### `POST /api/conversations/{id}/messages`, `DELETE /api/conversations/{id}/messages/{messageId}`
- Trên cuộc trò chuyện `OPENING_NOT_SENT`: `POST` với `clientMessageId` của thư mở đầu gửi lại nó như thư mới (theo D-131: `FAILED` thì gửi, `UNKNOWN` thì `409`); `clientMessageId` khác → `409 REPLY_NOT_ALLOWED`, `state` = `OPENING_NOT_SENT`.
- `DELETE` thư mở đầu `FAILED` → `204` và cuộc trò chuyện bị xóa.

## Backend design (phiên backend nhận; được sửa khi làm)

1. **API và kiểm dữ liệu:** controller mới (hoặc `ConversationsController`) `POST /api/conversations`; kiểm theo D-197 và bảng trên; tài khoản qua `AccountDirectory` (của chủ, chưa xóa), trạng thái gửi như `Replies` (capability `SEND_MESSAGES`, trạng thái tài khoản).
2. **Tạo và gửi (`NewMailService`, theo khuôn `ReplyService`):** transaction 1: tìm `(account_id, 'sino:' + clientMessageId)`; có thì xử theo trạng thái thư (bảng trên); chưa có thì tạo cuộc trò chuyện (`THREAD`, tóm tắt theo chốt kỹ thuật) và thư `PENDING` (người nhận vào `message.recipients`, tiêu đề vào `metadata.subject`). Gọi provider ngoài transaction (15 giây). Transaction 2: `SENT` + đổi mã ngoài sang `threadId` (gộp nếu đồng bộ đã nhập), hoặc `FAILED` / `UNKNOWN`. Phát sự kiện.
3. **Gmail:** MIME như BE-59 nhưng không `In-Reply-To` / `References`, `Subject` là tiêu đề người dùng gõ (RFC 2047), `From` có tên (BE-62); `users.messages.send` không có `threadId`; đọc `threadId` trong response.
4. **Thư mở đầu chưa gửi xong:** `Replies` trả `OPENING_NOT_SENT` khi mã ngoài bắt đầu bằng `sino:`; `ReplyService.send` với `clientMessageId` của thư mở đầu gọi lại đường gửi thư mới; `discard` thư mở đầu xóa cả cuộc trò chuyện.
5. **Đối chiếu:** nhịp đối chiếu của BE-59/BE-60 (D-138) xử cả thư mở đầu `UNKNOWN`/`PENDING` quá hạn theo D-196.

## Web

- `inbox.types.ts`: `InboxAccount.sending`: `'READY' | 'NEEDS_PERMISSION' | 'UNAVAILABLE' | 'NOT_SUPPORTED'`; `ConversationDetail` biết thư mở đầu chưa gửi xong (không ô trả lời, không dòng báo).
- `inbox.api.ts`: `sending` từ `capabilities` của tài khoản, trạng thái tài khoản và `capabilities` của nhà cung cấp; `createConversation(…)` → `POST /api/conversations`; `reply.state` `OPENING_NOT_SENT`.
- `format.ts`: `parseRecipients(text)` (D-197), `sendingAccounts(accounts)` + nhãn lý do, tài khoản mặc định.
- `components/NewMail.tsx`: ô soạn (Từ, Tới, Tiêu đề, Nội dung, "Gửi", "Bỏ"), lỗi theo trường, khóa khi chờ "Gửi lại".
- `useCreateConversation` (hook mới, theo khuôn `useSendMessage`): `clientMessageId` cho mỗi thư, kết quả theo D-194, đọc lại danh sách và số đếm.
- `InboxPage`: chế độ soạn khi đường dẫn là `/inbox/new` (router: route `inbox/new` trước `inbox/:conversationId`, `hideTabBar`), nút "Thư mới" trong `ConversationList`, hỏi trước khi rời trang (`useBlocker` của React Router + `beforeunload`).
- Tài khoản dùng lần trước: `localStorage` (bọc `try/catch`, chỉ là tiện lợi cho từng trình duyệt).

## Testing

**Backend:** kiểm dữ liệu (D-197, tiêu đề rỗng); `201` và cuộc trò chuyện có mã ngoài là `threadId`; cùng ID đã `SENT` → `200` không gửi lần hai; `409` các loại; `502` + `FAILED` rồi "Gửi lại" qua `/messages` gửi như thư mới; `504` + `UNKNOWN` rồi đối chiếu thấy / không thấy (D-196); đồng bộ nhập trước → một cuộc trò chuyện; "Bỏ" thư mở đầu xóa cuộc trò chuyện; `reply.state` `OPENING_NOT_SENT`; MIME thư mới (không `In-Reply-To`, tiêu đề RFC 2047); sự kiện.

**Web (MSW theo Contract):** nút "Thư mới" ở ba cỡ; ô soạn; tài khoản gửi được / không / một tài khoản / không tài khoản nào; mặc định lần trước; địa chỉ sai, trùng, quá 50; `201` → sang cuộc trò chuyện (thay đường dẫn); `502` / `504` → sang cuộc trò chuyện với trạng thái thư; lỗi mạng → khóa, "Gửi lại" cùng ID; `400` lỗi theo trường; `409 SEND_NOT_ALLOWED`; rời trang khi còn chữ; `OPENING_NOT_SENT` không có ô trả lời; "Bỏ" thư duy nhất về danh sách.

## Risks / Trade-offs

- **Hai dòng trong vài giây:** thư mới gửi tới một tài khoản khác của bạn hiện hai dòng cho tới khi f05b gom (lượt đồng bộ sau).
- **Đối chiếu không có thread (D-196)** dựa vào tìm kiếm của Gmail theo thời điểm, người nhận, tiêu đề; thư không tiêu đề hay gửi nhiều thư giống nhau liền nhau có thể khó phân biệt, nên chọn ứng viên chưa thuộc thư khác của Sino.
- **Khóa chữ sau lỗi mạng:** người dùng muốn sửa thì phải "Bỏ" rồi soạn lại; đổi lại không bao giờ gửi một nội dung khác dưới cùng `clientMessageId`.

## Migration Plan

Không cần bảng mới. Phiên backend kiểm `external_conversation_id` chứa được `sino:<uuid>` (kiểu `text`). Web chạy được trước BE-84: `POST /api/conversations` trả `404` / `405` (backend chưa có đường này) thì ô soạn giữ chữ và báo "Sino chưa gửi được thư mới. Bạn gửi trong Gmail.".

## Definition of Done

- [ ] D-190…D-197 làm đúng ở backend và web, có test; `./mvnw -B -ntp verify` xanh; `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`.
- [ ] Chrome ở các cỡ đụng tới (1440, 1024, 390).
- [ ] Chạy thật (chỉ khi người dùng cho phép gửi): một thư mới từ một tài khoản Gmail của người dùng tới địa chỉ người dùng chọn; một thread mới ở Gmail; một dòng trong Sino; gọi lại cùng ID không gửi lần hai.
- [ ] File kiến thức (web, backend) có phần của change; `openspec validate f10-new-mail --strict`; archive sau `f10-reply`.
