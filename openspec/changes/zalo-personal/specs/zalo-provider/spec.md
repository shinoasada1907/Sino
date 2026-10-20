## ADDED Requirements

### Requirement: Connector Zalo khai báo định danh và capability
Registry MUST có connector `zalo` với `displayName` "Zalo" và đúng các capability `READ_MESSAGES`, `SEND_MESSAGES`, `PUSH_WEBHOOK`. Connector MUST có `qrLogin()`, cả khi tắt, và MUST NOT có `oauth2()`.

#### Scenario: Danh sách provider
- **WHEN** client gọi `GET /api/providers` khi Zalo đang bật
- **THEN** phần tử `zalo` có `capabilities` = `READ_MESSAGES`, `SEND_MESSAGES`, `PUSH_WEBHOOK`, `connectMethod` = `QR`, `connectable` = true

### Requirement: Phiên Zalo là credential TOKEN được mã hóa
Phiên Zalo (`cookie`, `imei`, `userAgent`) MUST được lưu dưới dạng `TokenCredentials` chứa một chuỗi JSON, trong bảng credential đã mã hóa của F02, và `externalAccountId` của account MUST là `ownId` Zalo. Phiên MUST NOT xuất hiện trong log, response hay `toString()`.

#### Scenario: Kết nối xong
- **WHEN** một lần đăng nhập QR Zalo hoàn tất cho `ownId` `100000000000000001`
- **THEN** account có `provider` = `zalo`, `externalAccountId` = `100000000000000001`, và cột credential chỉ chứa ciphertext

### Requirement: Bảo đảm listener đang chạy
`ZaloProvider.registerPush` MUST gọi `PUT /accounts/{accountId}/session` của `sino-zalo` với phiên trong `ProviderContext`, và MUST trả `PushRegistration` với `address` = `ownId` và `expiresAt` = thời điểm gọi + 3 ngày. Khi `fetchUpdates`, `sendMessage` hoặc `findSentMessages` nhận `404 UNKNOWN_ACCOUNT` hoặc `410 SESSION_ENDED`, connector MUST gọi `PUT session` với phiên trong `ProviderContext` rồi thử lại đúng một lần. `PUT session` trả `410` MUST thành `AUTH_EXPIRED` mà không thử lại.

#### Scenario: sino-zalo vừa khởi động lại
- **WHEN** lượt đồng bộ dự phòng gọi `fetchUpdates` và `sino-zalo` trả `404 UNKNOWN_ACCOUNT`
- **THEN** connector gọi `PUT session`, gọi lại `GET /messages` và trả batch của lần gọi sau

#### Scenario: Quét lại sau khi bị đá
- **WHEN** account Zalo vừa được kết nối lại bằng QR với phiên mới, và lượt đồng bộ kế tiếp nhận `410 SESSION_ENDED` vì `sino-zalo` còn giữ phiên đã bị đá
- **THEN** connector gọi `PUT session` với phiên mới, gọi lại `GET /messages`, trả batch, và account vẫn `CONNECTED`

#### Scenario: Vẫn là phiên đã bị đá
- **WHEN** `fetchUpdates` nhận `410` và `PUT session` với phiên đang lưu cũng trả `410`
- **THEN** connector ném `AUTH_EXPIRED`, không gọi lại `GET /messages`, và account chuyển sang `AUTH_EXPIRED`

### Requirement: Lấy tin Zalo theo cursor
`fetchUpdates(context, cursor)` MUST gọi `GET /accounts/{accountId}/messages` với `after` = `cursor.value` (bỏ trống khi cursor là initial) và `limit` = 100, rồi trả `SyncBatch` với các cuộc trò chuyện và tin đã chuẩn hóa, `nextCursor` = `nextCursor` của `sino-zalo` (cursor đầu khi `sino-zalo` trả `null`), `hasMore` theo `sino-zalo`. `estimateMessages` MUST trả rỗng.

#### Scenario: Có một tin mới
- **WHEN** cursor là `8372251986275` và `sino-zalo` trả một tin nhóm `8372265733130`
- **THEN** batch có một tin với `externalMessageId` = `8372265733130` và `nextCursor` = `8372265733130`

### Requirement: Chuẩn hóa tin Zalo
Connector MUST đổi cuộc trò chuyện `USER` thành `DIRECT` và `GROUP` thành `GROUP`, với `externalConversationId` = `threadId`. Tin `isSelf` MUST là `OUTBOUND` và đã đọc; tin khác là `INBOUND`. Tin chữ MUST là `TEXT` với nội dung gốc; tin không phải chữ MUST có `textContent` là chữ thay thế theo bảng D-279 (`[Ảnh]`, `[Sticker]`, `[Tệp]`, `[Tin nhắn thoại]`, `[Tin Zalo chưa hỗ trợ]`) và `metadata.zaloType` = loại gốc. `sentAt` MUST lấy từ giờ gửi của Zalo.

#### Scenario: Tin ảnh trong nhóm
- **WHEN** `sino-zalo` trả tin `zaloType` = `chat.photo`, `threadType` = `GROUP`, `isSelf` = false
- **THEN** tin chuẩn hóa có `type` = `IMAGE`, `textContent` = `[Ảnh]`, `direction` = `INBOUND`, và cuộc trò chuyện có `type` = `GROUP`

#### Scenario: Tin tự gửi từ điện thoại
- **WHEN** `sino-zalo` trả tin chữ có `isSelf` = true
- **THEN** tin chuẩn hóa có `direction` = `OUTBOUND` và `read` = true

### Requirement: Ảnh trong tin ảnh Zalo
Với tin `zaloType` = `chat.photo`, `sino-zalo` MUST trả `photo { url, thumbUrl, caption }` lấy từ nội dung tin (`url` là ảnh như khung chat Zalo hiện, `thumbUrl` là ảnh nhỏ hoặc `null`, `caption` là chú thích hoặc `null`), và MUST bỏ `photo` khi nội dung không nêu địa chỉ web nào. Connector MUST chỉ lưu địa chỉ `https`, không có user info, không dài quá 2000 ký tự, thuộc tên miền Zalo; MUST lưu chúng cùng chú thích trong `metadata` (`imageUrl`, `imageThumbUrl`, `imageCaption`) và MUST giữ `textContent` = `[Ảnh]`. Ảnh chính bị từ chối mà ảnh nhỏ được nhận thì ảnh nhỏ MUST đứng thay; không địa chỉ nào được nhận thì MUST không lưu khóa ảnh nào, và log chỉ tên miền, giao thức, độ dài và cờ ASCII (không đường dẫn, không chú thích). API `GET /api/conversations/{id}/messages` MUST trả `image { url, thumbUrl, caption }` cho tin có `imageUrl` và `null` cho tin khác.

#### Scenario: Ảnh có chú thích
- **WHEN** `sino-zalo` trả tin `chat.photo` với `photo.url` và `photo.thumbUrl` trên `zdn.vn` và `photo.caption` = `Chuyến đi`
- **THEN** tin chuẩn hóa có `textContent` = `[Ảnh]` và `metadata` có `imageUrl`, `imageThumbUrl`, `imageCaption` = `Chuyến đi`

#### Scenario: Ảnh ở tên miền lạ
- **WHEN** `photo.url` là `https://evil.example.com/a.jpg` và không có ảnh nhỏ
- **THEN** tin chuẩn hóa có `textContent` = `[Ảnh]`, `metadata` không có khóa ảnh nào, và log có `evil.example.com` mà không có đường dẫn

### Requirement: Ảnh Zalo vẽ như sticker
Tin `chat.photo` mà Zalo vẽ như sticker (`params.pStickerType` là số nguyên, hoặc bong bóng không viền: `propertyExt.type` = 3) MUST có `photo.sticker` = `true` từ `sino-zalo`; ảnh khác MUST không có trường này. Connector MUST lưu tin có `photo.sticker` là `IMAGE` với `textContent` = `[Sticker]` và ảnh trong `metadata.stickerUrl` (cùng luật địa chỉ như ảnh; ảnh nhỏ đứng thay khi ảnh chính bị từ chối), không có `imageUrl` hay chú thích, để web vẽ nó như sticker. Thiếu `photo.sticker` MUST được đọc là ảnh thường.

#### Scenario: Sticker AI của Zalo
- **WHEN** `sino-zalo` trả tin `chat.photo` với `photo.url` trên `zdn.vn` và `photo.sticker` = `true`
- **THEN** tin chuẩn hóa có `type` = `IMAGE`, `textContent` = `[Sticker]`, `metadata` có `stickerUrl` và không có `imageUrl`

#### Scenario: Ảnh thường không có dấu sticker
- **WHEN** JSON của `photo` không có trường `sticker`
- **THEN** tin được đọc và lưu như ảnh (`[Ảnh]`, `imageUrl`)

### Requirement: Webhook báo có tin Zalo
`POST /api/webhooks/zalo` với `{ "ownId": ... }` và đúng khóa bí mật MUST phát `ProviderPushReceived(zalo, ownId)` và trả `204`. Sai hoặc thiếu khóa MUST trả `401` và không phát event. Endpoint MUST không cần session đăng nhập hay CSRF, và MUST đọc tối đa 1 KB body.

#### Scenario: Có tin mới
- **WHEN** `sino-zalo` gọi webhook với `ownId` của một account đang đồng bộ
- **THEN** `PushNotices` chạy đồng bộ cho đúng account đó

#### Scenario: Kẻ lạ gọi webhook
- **WHEN** một request không có khóa gọi `POST /api/webhooks/zalo`
- **THEN** response là `401` và không có event nào

### Requirement: Trả lời tin Zalo
`sendMessage(context, command)` MUST gọi `POST /accounts/{accountId}/messages` với `threadId` = `command.externalConversationId`, loại thread của cuộc trò chuyện, `text` = `command.textContent`, `clientMessageId` = `command.clientMessageId`, và trả `SendMessageResult(msgId, SENT, sentAt)`. `findSentMessages(context, command, startedAt)` MUST gọi `POST /accounts/{accountId}/sent/lookup` và trả `msgIds`; `409 CANNOT_TELL` MUST thành lỗi, MUST NOT thành danh sách rỗng.

#### Scenario: Trả lời trong nhóm
- **WHEN** người dùng gửi "Ok mình tới" trong một cuộc trò chuyện Zalo nhóm
- **THEN** `sino-zalo` nhận `threadType` = `GROUP` và `text` = "Ok mình tới", và tin lưu có `status` = `SENT` với `msgId` của Zalo

### Requirement: Đổi lỗi sino-zalo sang lỗi provider
Connector MUST đổi lỗi theo bảng D-281: không kết nối được, `5xx` hoặc hết giờ khi đọc → `PROVIDER_UNAVAILABLE`; hết giờ, `5xx` hoặc `504` khi gửi → `OUTCOME_UNKNOWN`; `404` hoặc `410` → `PUT session` rồi thử lại một lần; `410` của chính `PUT session` → `AUTH_EXPIRED`; `429` → `RATE_LIMITED`; `422` → `REQUEST_REJECTED`; `409 CANNOT_TELL` → `PROVIDER_UNAVAILABLE`; `401` → `PROVIDER_UNAVAILABLE` kèm log ERROR.

#### Scenario: Bị đá
- **WHEN** `sino-zalo` trả `410 SESSION_ENDED` cho `fetchUpdates`, rồi `410` cho `PUT session` với phiên đang lưu
- **THEN** connector ném `AUTH_EXPIRED` và account chuyển sang `AUTH_EXPIRED`

#### Scenario: Hết giờ khi gửi
- **WHEN** `sino-zalo` không trả lời request gửi trong thời gian chờ
- **THEN** connector ném `OUTCOME_UNKNOWN` và tin không bị gửi lại tự động

### Requirement: Ngắt phiên khi xóa hoặc tắt account
`ZaloProvider.disconnect(context)` MUST gọi `DELETE /accounts/{accountId}/session`. Lỗi khi ngắt MUST chỉ được ghi log và MUST NOT làm hỏng việc xóa hay tắt account.

#### Scenario: Xóa account Zalo
- **WHEN** người dùng xóa một account Zalo
- **THEN** `sino-zalo` nhận `DELETE /accounts/{accountId}/session` sau khi việc xóa đã commit

#### Scenario: sino-zalo đang tắt khi xóa
- **WHEN** người dùng xóa account Zalo lúc `sino-zalo` không chạy
- **THEN** account vẫn bị xóa và log có một dòng cảnh báo

### Requirement: Công tắc tắt Zalo
Khi `sino.zalo.enabled` = false, connector `zalo` MUST vẫn có trong registry; `turnedOn()` MUST là false; `GET /api/providers` MUST trả `connectMethod` = `QR` và `connectable` = false cho `zalo`; bắt đầu kết nối QR MUST trả `409 PROVIDER_DISABLED`; và mọi phương thức gọi ra `sino-zalo` MUST ném `PROVIDER_UNAVAILABLE` mà không gửi request nào.

#### Scenario: Kết nối Zalo khi đang tắt
- **WHEN** `SINO_ZALO_ENABLED=false` và người dùng gọi `POST /api/accounts/connect/zalo/qr` với `acceptRisk` = true
- **THEN** response là `409 PROVIDER_DISABLED` và không có request nào tới `sino-zalo`

#### Scenario: Tắt Zalo khẩn cấp
- **WHEN** `SINO_ZALO_ENABLED=false` và lượt đồng bộ gọi `fetchUpdates` cho một account Zalo
- **THEN** connector ném `PROVIDER_UNAVAILABLE`, không có request nào tới `sino-zalo`, và tin đã lưu vẫn đọc được
