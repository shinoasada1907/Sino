## Mode

**AUTO** (người dùng, 2026-10-20: "AUTO: Claude tự làm"; `project-mode.yaml` `task_overrides.zalo-send-images`). Các mục **Decision Needed** (DN-1…DN-5) do người dùng chốt trước ZS-01; D-349…D-356 do agent chốt, cần xem lại. Chạy thật cần tài khoản Zalo của người dùng, nên ZS-20 làm trên máy người dùng.

## Context

- **Gửi chữ hôm nay** (F10, ZL-05, ZL-09): `ReplyService` ghi trước một tin đi có `clientMessageId`, gọi `connector.sendMessage`, rồi đánh dấu đã gửi hay lỗi; kết quả chưa rõ thì đối chiếu, không gửi mù. `ZaloProvider` gọi `sino-zalo` `POST /accounts/:accountId/messages` (`SentLog` chống trùng, 1 tin/giây, chờ 10 giây). Zalo đẩy lại tin của chính tài khoản (`selfListen`).
- **`zca-js` 2.2.0** (bản mới nhất): `sendMessage({ msg, attachments }, threadId, type)` nhận ảnh từ buffer `{ data, filename, metadata: { totalSize, width, height } }`, cho cả `User` và `Group`; ảnh PNG/JPEG/WebP đi qua `uploadAttachment` thành tin ảnh, GIF đi nhánh riêng; trả `attachment: [{ msgId }]`. Không có API gửi "sticker tự tạo" của Zalo (dạng ảnh có `pStickerType` thấy ở ZL-18).
- **Sticker** (`custom-stickers`, `sticker-packs`): byte trong `sticker_content`, tối đa 1 MiB, PNG/GIF/WebP; module `sticker` chưa công bố gì cho module khác.
- **Web:** `Composer` dùng chung cho thư và chat; tin đi có hàng chờ (`clientMessageId`, "Gửi lại", "Bỏ", FE-62).

## Goals / Non-Goals

**Goals:** chọn và gửi sticker trong chat Zalo (đôi và nhóm) với cùng các bảo đảm của tin chữ: không gửi trùng, kết quả chưa rõ thì không gửi mù, lỗi nói rõ.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-349 — Ảnh nằm trong `SendMessageCommand`, capability `SEND_IMAGES` · agent chốt
Thêm `OutgoingImage(byte[] bytes, String mediaType, String fileName, int width, int height)` (tự kiểm loại và cỡ) làm trường tùy chọn của `SendMessageCommand`; chữ được rỗng khi có ảnh. Capability mới `SEND_IMAGES` (bảng ý nghĩa capability thêm một dòng). **Phương án bỏ:** một phương thức `sendImage` riêng trên `MessageProvider` (nhân đôi đường gửi, đối chiếu, lỗi); dùng lại `ATTACHMENTS` (đang mang nghĩa "đọc được metadata tệp đính kèm", Gmail đã khai).

### D-350 — Module `sticker` công bố một cổng đọc ảnh cho chủ · agent chốt
`dev.sino.sticker.StickerPictures` (named interface của Spring Modulith): `Optional<StickerPictureForSending> forOwner(UUID ownerId, UUID stickerId)` trả byte, loại, tên, rộng, cao. `conversation` phụ thuộc `sticker` qua đúng cổng này; `ModularityTests` canh. **Phương án bỏ:** `conversation` đọc thẳng bảng `sticker_content` (phá ranh giới module); web tải byte rồi gửi lên (gửi 1 MiB hai lần, và máy chủ không còn chắc ảnh là sticker đã kiểm).

### D-351 — Một điểm cuối gửi, hai loại thân · agent chốt
`POST /api/conversations/{id}/messages` nhận đúng một trong `text` hay `stickerId`. `ReplyService.send` nhận một nội dung (chữ hoặc sticker); phần ghi trước, gọi provider, đối chiếu, "Gửi lại" / "Bỏ" giữ nguyên. **Phương án bỏ:** `POST …/stickers` riêng (hai đường cho cùng một việc gửi).

### D-352 — Tin đi lưu thế nào, và tin vọng lại · agent chốt
Tin đi: `type = IMAGE`, chữ `[Sticker]`, metadata `{ "stickerId": "…" }`. Web hiện tin có `stickerId` bằng `GET /api/stickers/{id}/content` (ảnh của Sino, luôn tải được, không phụ thuộc CDN của Zalo, xem ZL-18). Tin Zalo đẩy lại với cùng mã tin là cùng một dòng (như tin chữ); metadata `stickerId` MUST được giữ khi gộp. Điều này cần kiểm trên mã ghi hiện có (`JdbcConversationStore`) ở ZS-05; nếu cách gộp hiện tại ghi đè metadata thì sửa ở đó, có test.

### D-353 — `sino-zalo`: cùng route, thêm `image` · agent chốt
`image: { data (base64), fileName, width, height }`, `text` được rỗng khi có ảnh; `bodyLimit` của route nâng lên 2 MiB (1 MiB ảnh thành khoảng 1,34 MiB base64); kiểm cỡ sau khi giải. `ZaloConnection.sendImage(threadId, threadType, image)` gọi `sendMessage({ msg: "", attachments: [{ data, filename, metadata }] })` và lấy `msgId` từ `attachment[0]`. Log chỉ mã, loại, kích thước (D-282). **Phương án bỏ:** `multipart` giữa `sino-api` và `sino-zalo` (hai kiểu thân cho một route, client Java phải dựng multipart).

### D-354 — Khung chọn đọc thư viện có sẵn · agent chốt
Khung chọn dùng `useStickers` và hook bộ của `sticker-packs`; không có API riêng cho khung chọn. Mở khung chọn lần đầu mới đọc thư viện (không đọc khi chỉ mở chat).

### D-355 — Bấm liên tiếp gửi lần lượt · agent chốt
Web giữ một hàng chờ gửi sticker cho mỗi cuộc trò chuyện: gửi xong cái trước mới gửi cái sau, nên không vướng giới hạn 1 tin/giây ở `sino-zalo` thành lỗi `429` trước mắt người dùng; `429` vẫn được xử lý như lỗi gửi được thử lại.

### D-356 — Ẩn nút khi không gửi được ảnh · agent chốt
Chi tiết cuộc trò chuyện (`reply`) đã có trạng thái gửi được hay không theo capability (BE-58); thêm cờ `canSendImages` theo `SEND_IMAGES` của tài khoản. Không có cờ thì không có nút.

## Decision Needed (người dùng chốt trước ZS-01)

### DN-1 — Phạm vi: chỉ sticker, hay cả ảnh từ máy
- **A (đề xuất): chỉ sticker** ở change này. Đường gửi làm chung, nên thêm ảnh từ máy sau chỉ còn phần web (chọn tệp, dán ảnh).
- **B:** cả ảnh từ máy ngay trong change này (nút đính kèm và dán ảnh vào khung soạn; ảnh chụp lớn hơn 1 MiB phải thu nhỏ trên trình duyệt trước khi gửi).

*Câu hỏi:* A hay B?

### DN-2 — Zalo nhận sticker dưới dạng gì
- **A (đề xuất): một tin ảnh** (cách duy nhất `zca-js` hỗ trợ). Người nhận thấy một ảnh trong chat, có khung ảnh của Zalo; GIF thì theo nhánh GIF của `zca-js`.
- **B:** tìm cách gửi đúng dạng "sticker tự tạo" của Zalo (ảnh có `pStickerType`, thấy ở ZL-18): giao thức không có tài liệu, phải đọc ngược ứng dụng Zalo; rủi ro cao, có thể không làm được.

*Câu hỏi:* A hay B?

### DN-3 — Sticker động
- **A (đề xuất): gửi đúng tệp** (GIF qua nhánh GIF, WebP động như ảnh) và ghi lại ở ZS-20 Zalo có giữ chuyển động không.
- **B:** đổi WebP động sang GIF trước khi gửi (cần thư viện chuyển định dạng ở máy chủ).

*Câu hỏi:* A hay B?

### DN-4 — Chạy thật và spike
- **A (đề xuất): gộp spike vào ZS-20 trên máy của người dùng**, với nick Zalo phụ: PNG trong suốt, GIF động, WebP động, nhóm và chat đôi, `msgId` của tin vọng lại. Code được viết trước với gateway giả và test hợp đồng.
- **B:** làm spike riêng trước mọi code (chậm hơn, nhưng biết sớm Zalo nhận gì).

*Câu hỏi:* A hay B?

### DN-5 — Thiết kế khung chọn
- **A (đề xuất): dựng theo thành phần sẵn có** (khung nổi, tab, lưới như màn Sticker), đối chiếu canvas khi có khung.
- **B:** vẽ khung trong canvas "Sino UI" trước.

*Câu hỏi:* A hay B?

## Risks / Trade-offs

- [Zalo nén lại ảnh hoặc mất nền trong suốt] → biết ở ZS-20; nếu xấu, cân nhắc nền trắng cho PNG trong suốt (quyết sau, có số liệu).
- [Gửi ảnh qua kết nối không chính thức làm Zalo khóa tài khoản vì giống bot] → giữ 1 tin/giây, gửi lần lượt; thử trên nick phụ trước.
- [Base64 1 MiB qua HTTP nội bộ] → nhỏ; `bodyLimit` riêng cho route gửi.
- [Metadata `stickerId` mất khi Zalo đẩy tin vọng lại] → kiểm và sửa ở ZS-05 (D-352).
- [Delta `provider-contract` cùng requirement với `zalo-personal`] → archive sau `zalo-personal`; change archive sau phải chứa cả hai thay đổi.

## Migration Plan

- Không có migration: tin đi dùng bảng `message` sẵn có (loại `IMAGE`, metadata).
- Thứ tự triển khai: `sino-zalo` trước (route mới tương thích ngược: không có `image` thì như cũ), rồi `sino-api`, rồi web.

## Testing

| Tầng | Nội dung |
|---|---|
| `sino-zalo` (Vitest) | `sendImage` với gateway giả: chat đôi, nhóm, GIF, `msgId`; route: base64 sai, quá 1 MiB, `SentLog`, `429`, log không có byte |
| `sino-api` (JUnit, Testcontainers, WireMock) | `OutgoingImage` tự kiểm; contract test có ảnh; Gmail từ chối ảnh; `ZaloClient` gửi đúng thân; `ReplyService` với sticker: chủ khác `404`, không `SEND_IMAGES`, gửi lại cùng mã, kết quả chưa rõ, tin vọng lại giữ `stickerId`; `ModularityTests` |
| Web (Vitest + MSW) | nút chỉ ở chat gửi được ảnh; khung chọn theo bộ; bấm là gửi, hiện ngay, "Gửi lại" cùng mã; bấm liên tiếp gửi lần lượt; bàn phím |
| Thật (ZS-20, máy người dùng) | các câu hỏi của DN-4 |
