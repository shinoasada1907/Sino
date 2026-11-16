## Why

Sticker của người dùng đã nằm trong thư viện (`custom-stickers`) và sắp có bộ (`sticker-packs`), nhưng chưa gửi được đi đâu. Người dùng (2026-10-20) muốn chọn và gửi sticker ngay trong khung chat Zalo, như sticker của chính Zalo, ở cả chat đôi lẫn nhóm. Change này mở đường gửi một ảnh qua Zalo từ Sino và đặt khung chọn sticker vào khung soạn tin.

## What Changes

- **Contract provider:** capability mới `SEND_IMAGES`; `SendMessageCommand` mang được một ảnh (byte, loại, tên tệp, rộng, cao), chữ được phép rỗng khi có ảnh. Zalo khai `SEND_IMAGES`; Gmail không.
- **`sino-zalo`:** route gửi tin `POST /accounts/:accountId/messages` nhận thêm `image` (base64, tên tệp, rộng, cao) và gửi bằng `sendMessage` có `attachments` của `zca-js` (ảnh từ buffer, GIF theo nhánh GIF của thư viện), vào chat đôi hay nhóm; giữ nguyên chống gửi trùng (`SentLog`), giới hạn một tin mỗi giây và thời gian chờ; không bao giờ ghi byte ảnh vào log.
- **`sino-api`:** `POST /api/conversations/{id}/messages` nhận `{ clientMessageId, stickerId }` (thay cho `text`): module `conversation` lấy ảnh của sticker qua một cổng do module `sticker` công bố, gửi qua provider, lưu tin đi loại `IMAGE`, chữ `[Sticker]`, metadata `stickerId`; gửi lại cùng `clientMessageId` không gửi hai lần; cuộc trò chuyện không có `SEND_IMAGES` thì từ chối.
- **Web:** nút sticker trong khung soạn tin của chat Zalo (ẩn khi tài khoản không gửi được ảnh), mở khung chọn chia tab theo bộ (bộ của `sticker-packs`, cộng "Chưa xếp bộ"); bấm một sticker là gửi ngay; tin sticker hiện ngay trong cuộc trò chuyện bằng ảnh của thư viện, với "Gửi lại" / "Bỏ" khi lỗi như tin chữ.

## Capabilities

### New Capabilities
- `sticker-send`: gửi một sticker của thư viện vào một cuộc trò chuyện qua API của Sino: kiểm chủ sở hữu và capability, chống gửi trùng, lưu và hiện tin đi.
- `zalo-image-send`: `sino-zalo` gửi một ảnh qua Zalo vào chat đôi hoặc nhóm, cùng các bảo đảm của tin chữ.
- `chat-sticker-picker`: nút và khung chọn sticker trong khung soạn tin của chat trên web.

### Modified Capabilities
- `provider-contract`: tập capability chuẩn thêm `SEND_IMAGES`; contract gửi tin mang được một ảnh.

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts` (`sendImage`), `messages/sendRoutes.ts`, `sessions/SessionManager.ts`; test.
- **`apps/sino-api`:** `provider/ProviderCapability`, `provider/spi/SendMessageCommand` (+ kiểu ảnh), `provider/infrastructure/zalo/{ZaloProvider,ZaloClient}`; module `sticker` công bố cổng đọc ảnh cho chủ (named interface); `conversation/application/ReplyService`, `conversation/api/ConversationMessagesController`; `apps/sino-api/README.md`.
- **`apps/sino-web`:** `features/inbox/components/{Composer,ChatThread}.tsx`, khung chọn sticker mới, hook gửi sticker và hàng chờ gửi; đọc bộ và sticker từ `features/stickers`.
- **Thứ tự:** phần web của khung chọn cần lớp dữ liệu bộ (`sticker-packs` SP-05); phần backend làm song song được. Archive sau `custom-stickers`, `sticker-packs` và `zalo-personal` (cùng sửa `provider-contract`).
- **Chạy thật** cần một tài khoản Zalo thật nên chỉ làm được trên máy của người dùng (container cloud không có phiên Zalo, và proxy chặn CDN của Zalo).

## Non-goals

- **Gửi ảnh chụp từ máy hay dán ảnh vào khung soạn** (đường gửi giống hệt; làm sau nếu người dùng muốn, theo DN-1).
- ~~**Gửi dưới dạng "sticker" thật của Zalo** (`chat.sticker` hay ảnh kiểu sticker có `pStickerType`): `zca-js` 2.2.0 không có API, giao thức không có tài liệu (xem ZL-18). Change này gửi như một ảnh (DN-2).~~ **Đổi 2026-10-20 (người dùng: "sửa đi"):** ảnh tĩnh đi như AI sticker của Zalo (ảnh có `pStickerType`, D-359, ZS-09). Vẫn ngoài phạm vi: sticker trong kho của Zalo (`chat.sticker`), và GIF dạng sticker.
- **Gửi sticker qua Gmail** (thư); **gửi nhiều sticker trong một tin**; **"Gần đây"** trong khung chọn; **hẹn giờ gửi sticker**.
- **Hiện sticker người khác gửi đến như sticker:** đó là phía nhận của `zalo-personal` (ZL-14…ZL-18).
