# Trả lời có trích dẫn trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-11-17 duyệt đề án, D-506: "tất cả tin nhắn chữ, ảnh, sticker, every thing ok"). Mỗi task: code, test tay trước (Zalo thật trên điện thoại, API thật, Chrome thật), rồi test tự động; ghi **Thực hiện** và **Kiểm chứng** tại task; quản lý commit sau khi người dùng nghiệm thu.
> **Phụ thuộc:** `zalo-reactions` RX-02 (tin mang `cliMsgId`).

## 1. `sino-zalo`

- [ ] 1.1 **QR-01 — Tin mang `quote`, giữ `ttl`/`msgType`/`propertyExt`; gửi tin chữ kèm `quote` (D-503, D-505)** · `sino-zalo`
  - **Acceptance:** spec `zalo-quote-reply` (phần nhận); route gửi chữ, ảnh/tệp nhận `quote` tùy chọn và gọi `sendMessage({ msg, attachments, quote })`; route gửi sticker thử kèm trích dẫn (D-506), ghi kết quả; log không có chữ/tên của trích dẫn.
  - **Test tay:** người dùng trích dẫn từ điện thoại (chữ, ảnh, sticker; 1-1 và nhóm), `curl` hàng chờ thấy `quote`; `curl` gửi kèm `quote`, người dùng xem trên điện thoại.
  - **Thực hiện (2026-11-17, CHƯA TICK: chờ lượt chạy thật):** `ZaloMessage.quote` (`ZaloQuoted`: `msgId`=globalMsgId, `cliMsgId`, `fromId`=ownerId, `fromName`=fromD, `text` cắt 200 ký tự theo code point, `kind` theo `cliMsgType` 1/31/32/36/38/43/44/46/49 còn lại `other`, `ts`), `quoteShape` (chỉ log: `cliMsgType`, `kind`, `attach`/`msg` rỗng hay không, id có chính xác không); `rawContent` (nội dung thô của tin không phải chữ, để trích dẫn ảnh/tệp/sticker: ngoài danh sách D-505, thêm vì zca-js cần `content` của tin gốc). Gửi: `messages/quote.ts` (`parseQuote`, `INVALID_QUOTE` 400), `quote` tùy chọn ở route chữ, route ảnh (JSON) và phần `meta` của route tệp → `sendMessage({ msg, attachments, quote })`; ảnh gửi dạng sticker (`photo_url`) thêm các trường `qmsg*` của zca-js vào request, Zalo từ chối (mã lỗi) thì gửi lại không trích dẫn và log `sent without it`, lỗi khác không gửi lại (tránh gửi hai lần). Log chỉ `quoted: true`.
  - **Kiểm chứng:** Vitest `test/quote.test.ts` (23 ca: tin nhận có quote, loại, cắt 200, log chỉ hình dạng, gửi chữ/ảnh/tệp kèm quote, sticker thêm trường và lùi khi bị từ chối, 400 quote sai). Với Zalo thật: **CHƯA CHẠY**. Câu cần lần chạy thật trả lời: hình dạng `quote` thật của ảnh/sticker/tệp (`cliMsgType`, `attach`), `globalMsgId` có vượt 2^53 không, Zalo có hiện trích dẫn trên ảnh-sticker `photo_url` không.
  - **Depends on:** RX-02.

## 2. `sino-api`

- [ ] 2.1 **QR-02 — Normalizer lưu trích dẫn; `SendMessageCommand.quote`; `ZaloClient` gửi `quote` (D-504, D-505, D-507)** · `sino-api`
  - **Depends on:** QR-01, RX-05.
  - **Thực hiện (2026-11-18, CHƯA TICK: chờ Zalo thật):** lỗi "Không gửi được" khi trả lời tin "hehe" (OUTBOUND, `metadata = {}`) không phải lỗi của đường lưu: tin đó gửi 08:03 UTC 17/11, trước khi sino-zalo mới (có `cliMsgId`/`ttl`/`msgType`) chạy (tin INBOUND đầu có `cliMsgId` lúc 14:45; 95 tin INBOUND Zalo còn lại đều cũ; không có tin OUTBOUND nào gửi sau đó). Tin gửi từ Sino lưu `metadata` chỉ có bản xem trước trích dẫn; khóa D-505 tới khi tin tự gửi của mình (selfListen) về qua sync, cùng `external_message_id`, và `ON CONFLICT` ghi lại `metadata`. Sửa: `JdbcConversationStore.MERGED_METADATA` giữ `quoteSender/quoteText/quoteKind` do Sino ghi khi bản về từ Zalo không mang (trước đó bị xóa trắng). Tin gửi trước bản mới vẫn không trích dẫn được (D-508).
  - **Kiểm chứng:** test mới `ConversationReactionQuoteApiTests.aReplySentFromSinoBecomesQuotableWhenItsEchoComesBack` (gửi từ Sino: `canQuote=false`, trả lời nó `422 QUOTE_UNAVAILABLE`; sau khi tin về: có `cliMsgId`, giữ bản xem trước, `canQuote=true`, trả lời nó `201`). `./mvnw test -Dtest=ConversationReactionQuoteApiTests,ConversationStickerSendApiTests,ConversationSendApiTests,ConversationReplyApiTests,JdbcConversationStore*,ModularityTests` (worktree riêng): 138 test, xanh; `ZaloQuoteTests`, `ZaloReactionTests` cũng xanh (30 test trong lượt đầu). **CHƯA KIỂM CHỨNG:** Zalo thật (tin gửi từ Sino và từ điện thoại có thật mang `cliMsgId` khi về; thời gian chờ tới lần sync kế); không dựng được sino-zalo giả cùng tài khoản Zalo thật trên bản sao DB (mã khóa thật không có), nên test tay chỉ bằng test tích hợp (PostgreSQL thật, MockMvc, WireMock).
- [ ] 2.2 **QR-03 — API: `quote`, `canQuote` trong tin; `quoteMessageId` khi gửi; `QUOTE_UNAVAILABLE` (D-507, D-508)** · `sino-api`
  - **Depends on:** QR-02.

## 3. `sino-web`

- [ ] 3.1 **QR-04 — Khung trích dẫn trong bong bóng, nút "Trả lời", thanh "Đang trả lời" (D-509)** · `sino-web`
  - **Depends on:** hợp đồng API của QR-03 (dựng trước trên MSW được).
  - **Thực hiện (sửa lỗi, 2026-11-18):** nút "Trả lời" hiện trên mọi tin vì bỏ qua `canQuote`. Nay `canQuote` đi từ `MessageResponse` vào `Mail` (`inbox.api.ts`, `inbox.types.ts`), `canReply` trong `ChatThread.tsx` cần `canQuote === true` (cả nút bên bong bóng lẫn menu nhấn giữ; tin local hay không có `canQuote` thì ẩn). Gửi bị 422 `QUOTE_UNAVAILABLE` (`useInbox.ts`): bong bóng thất bại bỏ trích dẫn, đặt `quoteRefused`, hiện "Không trả lời được tin này. Gửi lại sẽ không kèm trích dẫn."; "Gửi lại" gửi chữ không kèm `replyToMessageId`. Test: `ReplyChat.test.tsx` (2 test mới, `fromDad` mặc định `canQuote: true`).
  - **Kiểm chứng:** `vitest run src/features/inbox` 41 file / 455 test xanh; `pnpm lint` (chỉ cảnh báo có sẵn), `tsc -b`, `pnpm build` xanh. Chrome thật: CHƯA KIỂM CHỨNG (cần tài khoản Zalo thật có tin cũ không trích dẫn được).

## 4. Kết thúc

- [ ] 4.1 **QR-20 — Chạy thật trên máy người dùng, vẽ canvas, tài liệu, archive** · quản lý
