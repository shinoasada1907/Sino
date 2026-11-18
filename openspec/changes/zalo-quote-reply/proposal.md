## Why

Người dùng (2026-11-17): "làm task này đi task thả biểu cảm tin nhắn zalo và reply tin nhắn". Trong Zalo, trả lời một tin cụ thể là trích dẫn tin đó (khung tin gốc nằm trên tin trả lời). Sino hôm nay chỉ trả lời vào cả cuộc trò chuyện (ZL-09), và tin trích dẫn người khác gửi tới hiện như tin chữ thường, mất phần tin gốc.

## What Changes

- `sino-zalo`: tin nhận về mang phần trích dẫn của Zalo (`quote`); route gửi tin (chữ, ảnh, tệp, sticker) nhận thêm tin gốc để trích dẫn và gọi `sendMessage({ msg, attachments, quote })` của zca-js (sticker: xem D-506).
- `sino-api`: lưu tin gốc mà một tin trích dẫn (`reply_to_external_message_id` có sẵn, thêm phần xem trước trong `metadata`); API trả `quote` của mỗi tin và `canQuote`; gửi tin (chữ, ảnh, tệp, sticker) nhận `quoteMessageId`.
- `sino-web`: khung trích dẫn trong bong bóng tin (bấm thì cuộn tới tin gốc nếu đang có trong danh sách); nút "Trả lời" khi rê chuột / nhấn giữ một tin; thanh "Đang trả lời …" phía trên ô soạn, có nút hủy.

## Capabilities

### New Capabilities
- `zalo-quote-reply`: đọc và gửi tin trả lời có trích dẫn trong chat Zalo.

### Modified Capabilities
- Không đổi contract chung ngoài một trường tùy chọn của lệnh gửi (xem design D-507).

## Impact

- `apps/sino-zalo`: `ZcaGateway.ts`, `ZaloGateway.ts`, `FakeZaloGateway.ts`, route gửi tin, README.
- `apps/sino-api`: `ZaloMessageNormalizer`, `ZaloClient`, `ZaloProvider`, `SendMessageCommand`, `ReplyService`, `MessageResponse`; không migration (dùng cột có sẵn và `metadata`).
- `apps/sino-web`: `ChatThread.tsx`, ô soạn tin, `inbox.types.ts`, `inbox.api.ts`.
- Phụ thuộc `zalo-reactions` RX-02: tin phải mang `cliMsgId` thì mới trích dẫn được.

## Non-goals

- Trích dẫn trong email (Gmail đã có trả lời theo thread).
- Trích dẫn tin nhận trước khi tin mang `cliMsgId` (tin cũ): không có nút "Trả lời" (D-508).
