## Mode

AUTO đề xuất (giống `zalo-reactions`, người dùng 2026-11-17 giao làm ngay); `new_features` là TRAINING nên chờ người dùng xác nhận cùng lúc duyệt đề án.

## Context

- zca-js 2.2.0: `sendMessage({ msg, quote })`, `quote` là `SendMessageQuote` = `content, msgType, propertyExt, uidFrom, msgId, cliMsgId, ts, ttl` của tin gốc. Tin nhận về có `data.quote` kiểu `TQuote` = `ownerId, cliMsgId, globalMsgId, cliMsgType, ts, msg, attach, fromD, ttl`.
- `message.reply_to_external_message_id` đã có (V8), Gmail đang dùng.
- `zalo-reactions` RX-02 đưa `cliMsgId` vào mọi tin của hàng chờ; trích dẫn cần thêm `ts` (đã có), `ttl`, `msgType`, `propertyExt` thô của tin gốc.

## Goals / Non-Goals

Goals: thấy tin trích dẫn người khác gửi; trả lời có trích dẫn từ Sino trong chat 1-1 và nhóm. Non-goals: xem proposal.

## Decisions

### D-503 — Tin nhận về mang `quote` · agent chốt
`sino-zalo` thêm vào tin của hàng chờ `quote: { msgId (= globalMsgId), cliMsgId, fromId (= ownerId), fromName (= fromD), text (= msg, cắt 200 ký tự), kind (chữ / ảnh / sticker / tệp theo cliMsgType và attach), ts }`. Log không có `text` hay `fromName`.

### D-504 — `sino-api` lưu trích dẫn · agent chốt
`ZaloMessageNormalizer` đặt `replyToExternalMessageId` = `quote.msgId` và `metadata.quote` = `{ fromName, text, kind }` (phần xem trước, dùng khi tin gốc không có trong Sino, ví dụ tin trước lúc kết nối). Không migration.

### D-505 — Tin gốc giữ đủ để trích dẫn · agent chốt
Tin Zalo lưu thêm `metadata.ttl`, `metadata.msgType`, `metadata.propertyExt` (thô, nhỏ) bên cạnh `cliMsgId` của RX-02/RX-05, và với tin không phải chữ thêm `metadata.rawContent` (nội dung thô của Zalo; zca-js cần `content` của tin gốc để trích dẫn ảnh, tệp, sticker — thêm 2026-11-17 sau QR-01). Thiếu một trong các khóa thì tin đó không trích dẫn được (D-508); tin không phải chữ thiếu `rawContent` cũng vậy.

### D-506 — Mọi loại tin gửi đi đều kèm được trích dẫn · **người dùng chốt 2026-11-17**
Người dùng: "tất cả tin nhắn chữ, ảnh, sticker, every thing ok" (bỏ phương án A "chỉ tin chữ" đề xuất ban đầu). Thanh "Đang trả lời" giữ khi gửi chữ, ảnh, tệp hay sticker, và tin đó đi kèm `quote`.
- Chữ, ảnh, tệp: zca-js `sendMessage({ msg, attachments, quote })` nhận `quote` sẵn.
- Sticker: `sendSticker` của zca-js 2.2.0 không có `quote`; sticker thư viện gửi dạng AI sticker (ZS-09) cũng tự dựng request. QR-01 thử thêm các trường trích dẫn vào request sticker với Zalo thật; Zalo không nhận thì sticker gửi không kèm trích dẫn, ghi lại và báo người dùng (không chặn phần còn lại).

### D-507 — Gửi: `quoteMessageId` · agent chốt
Các `POST` gửi tin của Sino (chữ, ảnh/tệp, sticker) nhận `quoteMessageId` (id tin trong Sino, cùng cuộc trò chuyện). `ReplyService` đọc tin gốc, dựng `QuotedMessage` (các khóa của D-505 + `externalMessageId`, `senderExternalId`, `text`) vào `SendMessageCommand` (trường tùy chọn, constructor cũ giữ nguyên); `ZaloClient` gửi `quote` cho `sino-zalo`; Gmail bỏ qua trường này. Lỗi: tin gốc khác cuộc trò chuyện hay không trích dẫn được → 422 `QUOTE_UNAVAILABLE`.

### D-508 — `canQuote` · agent chốt
Phản hồi tin có `canQuote` = tin Zalo có đủ khóa D-505 và cuộc trò chuyện gửi được. Web chỉ hiện nút "Trả lời" khi `canQuote`.

### D-509 — Giao diện · agent chốt (theo canvas khi vẽ)
- Bong bóng tin có trích dẫn: khung nhỏ phía trên chữ, vạch màu bên trái, tên người gửi tin gốc + một dòng xem trước (`[Ảnh]`, `[Sticker]`, `[Tệp]` khi không phải chữ); bấm thì cuộn tới tin gốc và nháy nền nếu tin đó đang tải trong danh sách, không thì không làm gì.
- Nút "Trả lời" (mũi tên cong) cạnh nút biểu cảm khi rê chuột; điện thoại: nằm trong menu nhấn giữ của biểu cảm.
- Thanh "Đang trả lời <tên>" + xem trước, nút ✕, phía trên ô soạn; Esc hủy; gửi xong tự đóng.

### D-510 — Tin gửi từ Sino trích dẫn được sau khi echo về · agent chốt 2026-11-18 (sửa lỗi lúc chạy thật)
Lúc gửi, Sino chưa có `cliMsgId`/`ttl`/`msgType` của tin vì phản hồi gửi của `sino-zalo` chỉ có `msgId`. Các khóa này đến khi Zalo đẩy lại bản sao tin của chính mình (`selfListen`) qua sync, cùng `external_message_id`. Lúc ghi lại (`ON CONFLICT`), `metadata` được gộp: lấy bản của Zalo, nhưng giữ `quoteSender`/`quoteText`/`quoteKind` mà Sino đã ghi khi bản của Zalo không mang chúng (trước đó bị xóa trắng). Trong lúc chờ echo, tin vừa gửi có `canQuote = false`. Chưa làm: `sino-zalo` trả các khóa ngay trong phản hồi gửi (chưa rõ zca-js có cho lấy `cliMsgId` lúc gửi không).

### D-511 — Một luật cho `canQuote` và cho việc từ chối · agent chốt 2026-11-18
`ReplyService.quoteRefusal(connector, externalMessageId, senderId, metadata)` trả lý do từ chối, hoặc null nếu trích dẫn được. Danh sách tin (`canQuote`) và lệnh gửi (`422 QUOTE_UNAVAILABLE`) dùng chung hàm này, nên API không thể vừa cho bấm "Trả lời" vừa từ chối. Trước đó danh sách không xét tin thiếu người gửi. Khi từ chối, ghi log INFO nêu lý do (không có connector / chưa gửi / không người gửi / tên các khóa metadata đang có), không có chữ hay tên.

### D-512 — Web khi bị từ chối trích dẫn · agent chốt 2026-11-18
Nút "Trả lời" (cả cạnh bong bóng lẫn menu nhấn giữ) chỉ hiện khi tin có `canQuote === true`; tin chưa có cờ này (tin local, đang gửi) thì ẩn. Nếu gửi vẫn bị `422 QUOTE_UNAVAILABLE`, bong bóng chuyển "Không gửi được", bỏ phần trích dẫn, hiện "Không trả lời được tin này. Gửi lại sẽ không kèm trích dẫn."; "Gửi lại" gửi chữ không kèm `replyToMessageId`, "Bỏ" vẫn dùng được.

## Risks / Trade-offs

- Hình dạng `quote` thật (nhất là `attach`, `cliMsgType` của ảnh/sticker) chưa thấy: kiểm ở lượt test tay với Zalo thật của QR-01, sửa bảng `kind` khi cần.
- Tin cũ không trích dẫn được cho tới khi có `cliMsgId` (chấp nhận, D-508). Lúc chạy thật 2026-11-18: mọi tin nhận hay gửi trước khi `sino-zalo` mới chạy (17/11) đều không trích dẫn được, kể cả tin của chính mình.
- Tin vừa gửi từ Sino chưa trích dẫn được cho tới lần sync kế (D-510).
- Gửi trả lời bằng ảnh, tệp, sticker kèm trích dẫn mới có test tự động, chưa chạy với Zalo thật.
