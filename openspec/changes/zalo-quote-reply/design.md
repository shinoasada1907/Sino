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

## Risks / Trade-offs

- Hình dạng `quote` thật (nhất là `attach`, `cliMsgType` của ảnh/sticker) chưa thấy: kiểm ở lượt test tay với Zalo thật của QR-01, sửa bảng `kind` khi cần.
- Tin cũ không trích dẫn được cho tới khi có `cliMsgId` (chấp nhận, D-508).
