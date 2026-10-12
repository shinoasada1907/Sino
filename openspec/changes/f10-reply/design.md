# Phase 5 (kéo lên sau F06) · F10 — Trả lời trong cuộc trò chuyện · Technical Design

> Mode: **HYBRID**. Frontend AUTO, backend AUTO; quyết định kiến trúc thuộc TRAINING, nhưng người dùng giao toàn quyền ngày 2026-10-10: chọn "Trả lời trong thread" cho phạm vi, rồi "tự xử hết luôn đi". Mọi quyết định dưới đây là **agent chốt theo ủy quyền**, có phương án bị loại, để người dùng xem lại.
> Người dùng ưu tiên "kết nối và nhắn tin" trước các màn khác (2026-10-09), nên F10 (Phase 5 trong roadmap) được làm ngay sau F06, chỉ phần trả lời. Phần hẹn giờ gửi vẫn ở Phase 5 cùng F13.
> Change dùng chung: phiên web (sino-web-33) viết hồ sơ, contract và phần Web; phiên backend (sino-api-ec) nhận mục Backend. Số quyết định: D-120…D-139 cho F06 + F10.
> Nguồn: Gmail API (`users.messages.send`, `users.messages.get` `format=metadata`, `users.messages.list` `q=rfc822msgid:`), hướng dẫn threading của Gmail (`threadId`, `References`, `In-Reply-To`, `Subject` khớp), RFC 5322 (`Message-ID`, `In-Reply-To`, `References`, `Reply-To`), Google OAuth granular consent, roadmap F10, canvas "Sino UI" (`Inbox` `.composer`, `ThreadState` `.blocked`).

## Context

- Contract provider đã có `sendMessage(ProviderContext, SendMessageCommand)` (F03). `SendMessageCommand` có `externalConversationId`, `textContent`, `replyToExternalMessageId`; `SendMessageResult` có `externalMessageId`, `status`, `sentAt`. Gmail chưa cài.
- Gmail xin `openid`, `email`, `gmail.readonly`; bắt buộc chỉ `gmail.readonly` (D-51). Scope được cấp lưu ở `account_credential.scopes`. Kết nối lại dùng cùng luồng; web mở bằng `/accounts?reconnect=<id>`.
- Bảng `message`: `external_message_id NOT NULL`, unique `(conversation_id, external_message_id)`; `status` có `PENDING`, `SENT`, `FAILED`, `UNKNOWN`. F06 thêm `to`, `cc` (và ở F10 cần `replyTo`) vào `metadata` khi nhập.
- Web: `Composer` (Ctrl Enter gửi, khi mất mạng hiện "Sẽ gửi khi có mạng"), `useSendMessage` (thêm thư "Đang gửi" ngay, thay bằng thư của server), `ThreadNotice` (`RECONNECT`, `PERMISSION`, `NOT_READY`), `sendBlock(account, canSend)`. `api` client chỉ gửi body JSON, không có header riêng cho từng request.
- Luồng realtime: `conversations.changed` với `source` `user` không hiện dòng "N thư mới" (D-92).

## Goals / Non-Goals

**Goals:** trả lời một thư từ Sino, thư vào đúng thread ở Gmail của cả hai bên, không bao giờ gửi trùng, người dùng thấy rõ thư đi tới ai và thư đã đi chưa.

**Non-Goals:** xem phần Non-goals của `proposal.md`.

## Decisions

### D-130 — Xin `gmail.send` khi kết nối, không bắt buộc; tài khoản cũ cấp thêm bằng "Kết nối lại" · **Agent chốt theo ủy quyền** (2026-10-10)
`scopes` của Gmail thêm `https://www.googleapis.com/auth/gmail.send`; `requiredScopes` vẫn chỉ `gmail.readonly` (D-51). Nhờ vậy người dùng bỏ tick quyền gửi trên màn đồng ý của Google thì vẫn kết nối để đọc. Luồng kết nối gửi `include_granted_scopes=true`. Account có capability `SEND_MESSAGES` khi provider gửi được **và** scope đã cấp có `gmail.send`. Tài khoản đã kết nối trước đây không có quyền gửi: dòng báo thay ô trả lời có nút "Cấp quyền gửi", mở luồng kết nối lại đã có.
**Phương án bị loại:**
- `gmail.modify` hoặc `https://mail.google.com/`. Quyền rộng hơn nhiều so với việc cần làm.
- Bắt buộc `gmail.send` khi kết nối. Người chỉ muốn đọc sẽ không kết nối được.
- Luồng "xin thêm quyền" riêng. Kết nối lại đã làm đúng việc đó; thêm một luồng là thêm một đường lỗi.

### D-131 — Gửi ngay trong request; chống trùng bằng `clientMessageId` trong body · **Agent chốt theo ủy quyền**
Web tạo một UUID cho mỗi thư (`clientMessageId`); "Gửi lại" dùng lại đúng ID đó. Backend làm theo thứ tự:
1. Ghi thư đi `PENDING` với `client_message_id`, unique theo `(conversation_id, client_message_id)`, **trước** khi gọi Gmail. `external_message_id` tạm là `sino:<clientMessageId>`.
2. Gọi Gmail (giới hạn 15 giây).
3. Thành công: thư thành `SENT` với ID của Gmail, trả `201`.

Gặp lại cùng ID:
- thư đã `SENT` → trả `200` kèm thư đó, không gửi;
- thư đang `PENDING` → `409 SEND_IN_PROGRESS`;
- thư `FAILED` → gửi lại (lần trước chắc chắn chưa đi);
- thư `UNKNOWN` → `409 SEND_OUTCOME_UNKNOWN` (D-132).

Gmail từ chối chắc chắn (lỗi 4xx, hết quyền) → `FAILED`, trả lỗi kèm `messageId`. Thư gửi đi phát `conversations.changed` với `source` = `user`.
**Phương án bị loại:**
- Gửi nền (`202` rồi báo kết quả qua SSE). Nhiều phần chuyển động hơn, trong khi gửi một thư chỉ mất khoảng một giây.
- Header `Idempotency-Key`. `api` client của web không có header riêng cho từng request; trường trong body an toàn như nhau và nằm ngay trong dòng đã lưu.
- Không chống trùng. Bấm lại sau khi mạng chập chờn là gửi hai lần.

### D-132 — Kết quả không rõ: không gửi lại mù, đối chiếu với Gmail theo `Message-ID` · **Agent chốt theo ủy quyền**
Hết 15 giây, lỗi mạng sau khi request đã đi, hoặc Gmail trả lỗi 5xx (Gmail có thể đã gửi), thì thư thành `UNKNOWN` và API trả `504 SEND_OUTCOME_UNKNOWN`. Mỗi thư Sino gửi mang `Message-ID: <sino.<clientMessageId>@<tên miền của account>>`. Lượt đồng bộ kế tiếp của account tìm `rfc822msgid:` trên Gmail:
- thấy → `SENT` với ID của Gmail;
- không thấy sau 10 phút → `FAILED` (người dùng bấm "Gửi lại" được).

Khi đồng bộ nhập một thư đi mà `Message-ID` có dạng của Sino và có dòng cùng `clientMessageId`, Sino ghép vào dòng đó, không thêm dòng mới.
**Phương án bị loại:**
- Coi như `FAILED`. "Gửi lại" có thể gửi lần hai.
- Coi như `SENT`. Thư có thể chưa đi mà người dùng không biết.

**Phải kiểm ở BE-59 trên Gmail thật:** Gmail có giữ `Message-ID` do Sino đặt không. Nếu không giữ, đối chiếu bằng `threadId` + thư đi gần thời điểm gửi + phần chữ trùng, và ghi lại.

### D-133 — Trả lời người gửi thư mới nhất; chữ thuần; không trích thư cũ; người nhận hiện ra là người nhận thật · **Agent chốt theo ủy quyền**
Người nhận là `Reply-To`, không có thì `From`, của thư **đến** mới nhất trong cuộc trò chuyện. Cuộc trò chuyện chỉ có thư đi thì gửi tới người nhận `To` của thư đi mới nhất. Thư cũ không có `Reply-To` đã lưu thì dùng địa chỉ người gửi. `GET /api/conversations/{id}` trả `reply.to`; `POST` dùng **đúng** danh sách đó, tính lại phía server theo cùng quy tắc, không nhận người nhận từ web. Các header:
- `Subject` = `Re: ` + chủ đề (không thêm nếu đã bắt đầu bằng `Re:`);
- `In-Reply-To` = `Message-ID` của thư mới nhất trong cuộc trò chuyện;
- `References` = `References` của thư đó + `Message-ID` của nó (backend đọc hai header này từ Gmail bằng `format=metadata` lúc gửi);
- `threadId` của Gmail.

Thân thư là `text/plain; charset=UTF-8`, không trích thư cũ. `From` là địa chỉ của account.
**Phương án bị loại:**
- Trả lời tất cả. Dễ gửi tới người không định gửi; để sau, dưới dạng một lựa chọn.
- Trích thư cũ (`> `). Mỗi lần trả lời mang cả cuộc trò chuyện theo; ứng dụng thư của người nhận đã hiện thread.
- Web gửi danh sách người nhận. Server phải tin dữ liệu từ trình duyệt cho một hành động ra ngoài.
- Thư HTML. Cần trình soạn có định dạng.

### D-134 — Web: thư hiện ngay, thư lỗi ở lại với "Gửi lại" và "Bỏ", ô trả lời hiện người nhận · **Agent chốt theo ủy quyền**
- Thư hiện ngay ở cuối cuộc trò chuyện với "Đang gửi". Server trả về thì thay bằng thư của server (cùng `clientMessageId`).
- `502 SEND_FAILED` → thư ở lại với "Không gửi được", kèm "Gửi lại" (cùng ID) và "Bỏ" (`DELETE` thư `FAILED` trên server, hoặc chỉ xóa ở web nếu server chưa ghi). Chữ không mất.
- `504 SEND_OUTCOME_UNKNOWN` → "Chưa rõ đã gửi chưa · Sino đang kiểm tra với Gmail", không có nút.
- Không có câu trả lời (lỗi mạng giữa chừng; thêm sau review FE-62) → "Chưa rõ đã gửi chưa · Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần.", kèm "Gửi lại" (cùng ID, an toàn nhờ D-131) và "Bỏ" (chỉ ở web). **LÝ DO:** request có thể đã tới server; ghi "Không gửi được" dễ làm người dùng gửi lại từ Gmail thành hai thư.
- Thư đang gửi và thư chưa tới server nằm ở hộp thư đi riêng của trình duyệt (`['outbox', id]`), ghép với danh sách của server theo `clientMessageId`: bản của server thắng, trừ bản `FAILED` đang được gửi lại (thay cho "thêm vào cache danh sách thư" của bản đầu; xem `tasks.md` FE-62).
- `409 REPLY_NOT_ALLOWED` → đọc lại cuộc trò chuyện để dòng báo thay ô trả lời, và thư thành "Không gửi được".
- Mất mạng: TanStack Query tạm dừng lần gửi và gửi tiếp khi có mạng (`networkMode: 'online'`). Ô trả lời hiện "Sẽ gửi khi có mạng" như canvas. Hàng đợi chỉ nằm trong bộ nhớ.
- Ô trả lời có một dòng "Tới …" (tên và địa chỉ của `reply.to`) phía trên ô chữ, ở mọi cỡ màn. Canvas không có dòng này; gửi nhầm người tệ hơn lệch canvas một dòng.
- Dòng báo quyền gửi (`PERMISSION`): "Sino chưa có quyền gửi thư từ {địa chỉ}" / "Bạn vẫn đọc thư bình thường. Cấp thêm quyền gửi để trả lời từ Sino.", nút "Cấp quyền gửi". Canvas viết "Cấp lại quyền gửi", nhưng tài khoản cũ chưa từng cấp.
- `NOT_SUPPORTED` → "{Provider} chưa cho Sino gửi thư" / "Bạn trả lời trong {Provider}.", thay câu "sẽ có ở bản sau".

**Phương án bị loại:**
- Xóa ngay thư gửi lỗi và trả chữ về ô soạn. Người dùng có thể không thấy thư đã không đi.
- Hàng đợi bền trong `localStorage`. Phải giải quyết gửi trùng giữa các tab; để sau.

### D-135 — Contract: mã `OUTCOME_UNKNOWN` cho "request đã tới provider mà không có câu trả lời" · **Agent chốt theo ủy quyền** (BE-59, 2026-10-12)
`ProviderErrorCode.OUTCOME_UNKNOWN` (không thử lại): hết hạn chờ sau khi request đã đi, provider trả 5xx cho một lệnh ghi, kết nối đứt giữa chừng, hay 2xx mà không đọc được ID. Không kết nối được (`ConnectException`, `HttpConnectTimeoutException`, `UnknownHostException`) vẫn là `PROVIDER_UNAVAILABLE`: chắc chắn chưa gửi. Phía web: loại lỗi mới `ErrorCategory.PROVIDER_OUTCOME_UNKNOWN` ra `504`; `SEND_OUTCOME_STILL_UNKNOWN` mang cùng chuỗi `SEND_OUTCOME_UNKNOWN` với `409`, như Contract API đã hứa với web.
**Phương án bị loại:** một cờ `mayHaveTakenEffect` trong `ProviderException` (mọi chỗ bắt lỗi phải nhớ xem thêm cờ); coi hết giờ là `PROVIDER_UNAVAILABLE` (đúng như trước, nhưng "Gửi lại" có thể gửi hai lần).

### D-136 — `SendMessageCommand` mang người nhận và `clientMessageId`; connector tự đánh dấu và tự tìm lại thư · **Agent chốt theo ủy quyền** (BE-59)
`SendMessageCommand(externalConversationId, textContent, replyToExternalMessageId, to, clientMessageId)`. Connector đặt dấu riêng của nó (Gmail: `Message-ID: <sino.<clientMessageId>@<tên miền của account>>`, tên miền lấy từ profile) và cài `findSentMessage(context, clientMessageId)`. Chủ đề `Re:` và `In-Reply-To`/`References` do connector đọc từ thư được trả lời (`format=metadata`), vì đó là chuyện của email. `findSentMessage` mặc định ném `CAPABILITY_NOT_SUPPORTED`, không trả rỗng: "không biết" khác "không có" (review BE-59).
**Phương án bị loại:** module `conversation` dựng `Message-ID` (phải biết tên miền và quy ước email); `findSentMessage` theo `Message-ID` (lộ khái niệm email vào contract chung).

### D-137 — Không có ai để gửi tới: `422 REPLY_NO_RECIPIENT` · **Agent chốt theo ủy quyền** (BE-59)
`reply.state` = `READY` chỉ nói account gửi được. Khi `reply.to` rỗng (thư đến không rõ người gửi, thư đi không rõ người nhận), `POST` trả `422 REPLY_NO_RECIPIENT`, không ghi gì và không gọi provider. Web hiện thư "Không gửi được" như một lỗi chung (FE-62 chưa biết mã này).

### D-138 — Đối chiếu thư chưa rõ: sau mỗi lượt đồng bộ và theo nhịp riêng mỗi phút · **Agent chốt theo ủy quyền** (BE-59, sửa sau review)
- Sau mỗi lượt đồng bộ thành công của account (`ImportRunner`), và mỗi phút cho mọi account còn thư chưa rõ (`LiveSyncSchedule`, trên luồng riêng), trừ account bị tắt hay phải kết nối lại. Nhịp riêng có vì account tạm dừng đồng bộ, đang import, hay đồng bộ lỗi liên tục sẽ không bao giờ có lượt đồng bộ (review BE-59, HIGH); spec nói tạm dừng đồng bộ không được chặn việc gửi.
- Thư `UNKNOWN` được hỏi ở mọi tuổi, không chờ 1 phút như spec ghi: hỏi sớm không hại gì, và tránh hai dòng cho một thư trong lúc chờ (đồng bộ vừa nhập thư mà thư `UNKNOWN` chưa được ghép).
- Thư `PENDING` quá 5 phút (lần gửi chết giữa chừng) cũng được hỏi. 5 phút chứ không 1, vì một lần gửi bị từ chối token rồi được `ProviderAccess` chạy lại có thể quá một phút.
- Không thấy và đã quá 10 phút kể từ lúc gửi: `FAILED`. Connector không tìm được (`CAPABILITY_NOT_SUPPORTED`): giữ `UNKNOWN`, không bao giờ `FAILED`.
- Thư Sino gửi mà chưa `SENT` không đổi tóm tắt cuộc trò chuyện (dòng xem trước, giờ, "Cần trả lời"): một thư trả lời bị từ chối không làm cuộc trò chuyện rời khỏi "Cần trả lời" (review BE-59, MEDIUM).

**Giới hạn còn lại (BE-59):** thư gốc đã bị xóa (404) thì thư trả lời đi không có `Subject`, Gmail vẫn xếp theo `threadId`; `"` trong địa chỉ bị bỏ (hỏng địa chỉ có phần trước `@` trong ngoặc kép, rất hiếm); Gmail trả `403` khi quyền gửi bị thu hồi ở Google thì thành `502 SEND_FAILED` mãi trong khi `reply.state` vẫn `READY`; Gmail có giữ `Message-ID` của Sino không và `rfc822msgid:` có tìm ra không: kiểm ở BE-60.

## Contract API

### `GET /api/conversations/{id}` — thêm `reply`
```json
{
  "reply": {
    "state": "READY",
    "to": [{ "name": "An Nguyễn", "address": "an@example.com" }]
  }
}
```
- `state`:
  - `READY`: gửi được.
  - `NEEDS_PERMISSION`: provider gửi được nhưng account chưa cấp quyền gửi.
  - `ACCOUNT_UNAVAILABLE`: account `AUTH_EXPIRED` hoặc `DISABLED`.
  - `NOT_SUPPORTED`: provider không gửi được.
- `to`: theo D-133; `[]` khi không tính được.

### `GET /api/conversations/{id}/messages` — thêm `clientMessageId`
Mỗi thư thêm `clientMessageId` (`null` với thư không do Sino gửi). `status` của thư gửi từ Sino: `PENDING`, `SENT`, `FAILED`, `UNKNOWN`.

### `POST /api/conversations/{id}/messages`
```json
{ "text": "Cảm ơn anh, em nhận được rồi.", "clientMessageId": "6f1c…" }
```
- `text`: 1…100 000 ký tự, không chỉ có khoảng trắng; `clientMessageId`: UUID. Sai → `400 VALIDATION_FAILED`.

| Kết quả | Response |
|---|---|
| Gửi xong | `201` + thư (dạng của danh sách thư), `status` = `SENT` |
| Cùng `clientMessageId` đã `SENT` | `200` + thư đó |
| Cùng `clientMessageId` đang `PENDING` | `409 SEND_IN_PROGRESS` |
| `reply.state` khác `READY` (cả khi Gmail báo hết quyền lúc gửi) | `409 REPLY_NOT_ALLOWED`, extension `state` |
| Gmail từ chối (4xx), giới hạn tần suất (429), không kết nối được tới Gmail | `502 SEND_FAILED`, extension `messageId`; thư `FAILED` |
| Không rõ (hết 15 giây, mất kết nối sau khi request đã đi, Gmail lỗi 5xx) | `504 SEND_OUTCOME_UNKNOWN`, extension `messageId`; thư `UNKNOWN` |
| Cùng `clientMessageId` đang `UNKNOWN` | `409 SEND_OUTCOME_UNKNOWN` |
| `reply.to` rỗng (thêm ở BE-59, D-137) | `422 REPLY_NO_RECIPIENT` |
| Cuộc trò chuyện không có / không thuộc người dùng | `404` |

### `DELETE /api/conversations/{id}/messages/{messageId}`
Chỉ cho thư `FAILED` do Sino gửi → `204`. Thư khác → `409 MESSAGE_NOT_DELETABLE`; không có → `404 MESSAGE_NOT_FOUND`.

## Backend design (phiên backend nhận; được sửa khi làm)

1. **Dữ liệu (~~V16~~ → V17):** `message.client_message_id uuid` (null), unique `(conversation_id, client_message_id)` khi khác null. ~~`metadata.replyTo` lưu khi nhập~~ → `replyTo` nằm trong cột `message.recipients` (`{to, cc, replyTo}`), lưu khi nhập từ BE-54 của F06. **LÝ DO:** F06 dùng V14 (người nhận, BE-54), V15 (nội dung), V16 (tệp); BE-54 lưu người nhận vào cột riêng thay vì `metadata` (design F06, Backend design 1). Số migration chốt khi làm: số kế tiếp lúc đó.
2. **Quyền:** Gmail `OAuth2Connection.scopes` + `gmail.send`; luồng kết nối gửi `include_granted_scopes=true`. `account` tính capability của từng account: capability của provider, bỏ `SEND_MESSAGES` khi scope đã cấp thiếu scope gửi của provider. Scope gửi do connector khai báo, ví dụ `OAuth2Connection.sendScopes`, để `account` không phải biết tên scope của Google.
   **Đã làm (BE-58, 2026-10-12):** `OAuth2Connection.sendScopes` (tập con của `scopes`; constructor 5 tham số cũ = không có scope gửi); `include_granted_scopes` nằm trong `extraParameters` của Gmail (tham số riêng của Google, không phải của luồng chung). `AccountCapabilities.of(accountId, provider)` dùng cho `GET /api/accounts` và cho module khác qua `AccountDirectory.capabilitiesOf(accountId)`; scope đã cấp đọc bằng `CredentialStore.grantedScopes` (cột không mã hóa). **Gmail chưa khai báo `SEND_MESSAGES` ở BE-58**, vì `sendMessage` tới BE-59 mới có và connector chỉ khai báo việc nó làm được (FR-06); nên tới BE-59, `reply.state` của Gmail vẫn là `NOT_SUPPORTED`.
3. **Trạng thái trả lời:** `conversation` tính `reply` từ account (trạng thái, capability) và thư đã lưu (D-133).
   **Đã làm (BE-58):** `Replies.of(ownerId, conversation)`; thứ tự: provider không gửi được → `NOT_SUPPORTED`; account `AUTH_EXPIRED`/`DISABLED` → `ACCOUNT_UNAVAILABLE`; account thiếu `SEND_MESSAGES` → `NEEDS_PERMISSION`; còn lại `READY`. Người nhận đọc từ `message.recipients` (`StoredRecipients`, tách từ `MessageHistory`) và người gửi (`conversation_participant`). Account `DISABLED` không có trong Hộp thư nên chi tiết của nó là `404` trước khi tới `reply`.
   **Để lại sau review BE-58:**
   - BE-59 phải từ chối gửi khi `reply.to` rỗng. `READY` chỉ nói account gửi được, không nói có người để gửi tới; spec chưa có trường hợp này, BE-59 chốt mã lỗi.
   - Từ BE-59 (Gmail có `SEND_MESSAGES`), `GET /api/accounts` đọc scope đã cấp cho từng account: N+1 với N = số account của một chủ (nhỏ). Đọc gộp khi cần.
   - BE-60: kiểm trên Google thật rằng bỏ tick quyền gửi thì `account_credential.scopes` không có `gmail.send`. Khi câu trả lời token không có `scope`, `OAuth2Clients` coi như được cấp mọi scope đã xin; RFC 6749 §5.1 bắt server ghi `scope` khi nó khác những gì đã xin.
4. **Gửi:** `ReplyService`: kiểm `reply.state`, ghi `PENDING` (transaction 1); gọi provider ngoài transaction; ghi kết quả (transaction 2). Ghi `SENT` mà đồng bộ đã nhập thư đó trước (trùng `external_message_id`) thì giữ dòng đã nhập, chép `client_message_id` sang, rồi xóa dòng `PENDING`. Sau transaction 2 phát event để `realtime` đẩy `conversations.changed` (`source` = `user`).
5. **Gmail `sendMessage`:**
   - Dựng MIME: `From`, `To`, `Subject` (RFC 2047 khi có chữ ngoài ASCII), `Message-ID` theo D-132, `In-Reply-To`, `References`, `Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: base64`.
   - Gọi `users.messages.send` với `raw` (base64url) và `threadId`.
   - Đọc `Message-ID` và `References` của thư được trả lời bằng `messages.get format=metadata`.
   - Lỗi theo bảng `ProviderException`. Hết thời gian chờ sau khi request đã đi thì báo là "không rõ" (cần một mã hoặc cờ riêng trong contract; phiên backend chốt khi làm).
6. **Đối chiếu `UNKNOWN`:** lượt đồng bộ của account (BE-48) xử lý các thư `UNKNOWN` của account đó cũ hơn 1 phút, qua hàm tùy chọn mới của contract `findSentMessage(context, rfcMessageId)`.

## Web

- `inbox.api.ts`:
  - `fetchConversation` ánh xạ `reply`: `canSend` = `READY` → `true`, `NEEDS_PERMISSION`/`ACCOUNT_UNAVAILABLE` → `false`, `NOT_SUPPORTED` → `null`; `replyTo` mới trong `ConversationDetail`.
  - `sendMessage(conversationId, text, clientMessageId)` → `POST`.
  - `discardMessage(conversationId, messageId)` → `DELETE`.
- `inbox.types.ts`: `Message` (`MESSAGE`) thêm `clientMessageId` (null) và trạng thái `UNKNOWN`; `ConversationDetail.replyTo`.
- `useSendMessage`: tạo `clientMessageId`, thêm thư "Đang gửi" vào cache danh sách thư (F06), thay bằng thư của server khi xong; lỗi theo D-134; `resend(message)`, `discard(message)`.
- `Composer`: thêm prop `to` (dòng "Tới …").
- `EmailThread`: truyền `to`; thư `FAILED` có "Gửi lại" và "Bỏ"; thư `UNKNOWN` có dòng "Chưa rõ đã gửi chưa".
- `format.ts`: `sendBlockText` theo D-134; `sendState` thêm `UNKNOWN`.

### Test (web)
MSW theo Contract API:
- `201` → thư thay "Đang gửi";
- `502` → "Không gửi được" + "Gửi lại" (cùng `clientMessageId`) + "Bỏ";
- `504` → "Chưa rõ đã gửi chưa";
- `409 REPLY_NOT_ALLOWED` → dòng báo thay ô trả lời;
- mất mạng → lần gửi chờ rồi gửi khi có mạng;
- dòng "Tới …";
- `reply.state` → đúng loại dòng báo.

## Testing (backend)
- MIME (đơn vị): header thread, `Re:` không lặp, RFC 2047, base64, `Message-ID` theo `clientMessageId`.
- Người nhận (đơn vị): `Reply-To`/`From`, chỉ có thư đi, thư cũ không có `Reply-To`.
- API (MockMvc + DB thật + provider giả): `201`, gọi lại cùng ID → `200` không gửi lần hai, `409` các loại, `502` + `FAILED` rồi gửi lại thành công, `504` + `UNKNOWN`, `DELETE`, CSRF, sự kiện `source: user`.
- Đồng bộ: thư Sino đã gửi được nhập lại không thành hai dòng; `UNKNOWN` → `SENT`/`FAILED` theo kết quả tìm.
- Gmail (WireMock): `messages.send` với `raw` + `threadId`; `format=metadata`; `rfc822msgid:`.
- Quyền: kết nối có/không có `gmail.send` → capability; kết nối lại cấp thêm.

## Risks / Trade-offs
- Gmail có thể thay `Message-ID` → đối chiếu dự phòng (D-132), phải kiểm ở BE-59.
- `gmail.send` là scope nhạy cảm; app ở chế độ Testing vẫn dùng được với tài khoản test (D-40). Màn đồng ý của Google hiện thêm một quyền.
- Gửi trong request giữ một luồng của server tới 15 giây. Chấp nhận với MVP một người dùng.
- Hàng đợi khi mất mạng mất nếu tải lại trang; chữ đang soạn chưa gửi cũng mất (không có nháp).

## Migration Plan
Migration thêm một cột null. Tài khoản cũ không có quyền gửi cho tới khi kết nối lại. Web với backend chưa có `reply` → `canSend` = `null` → dòng báo `NOT_SUPPORTED` như hiện nay.

## Open Questions
Không có. Các lựa chọn để sau đã nằm ở Non-goals.

## Definition of Done — F10
- Backend: quyền gửi, `reply`, `POST`/`DELETE`, chống trùng, đối chiếu `UNKNOWN`, `./mvnw -B -ntp verify` xanh; chạy thật một lần gửi **sau khi người dùng cho phép**, tới địa chỉ người dùng chọn.
- Web: trả lời trên API thật, các trạng thái của thư gửi đi, dòng "Tới …", dòng báo quyền gửi; lint, `tsc -b`, test, build xanh; Chrome thật.
- Spec delta dồn vào `openspec/specs/` và change được archive (sau `f06-message-history`).
