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
`dev.sino.sticker.StickerPictures` (giao diện ở package gốc của module, nên là phần module công bố): `Optional<StickerPictureForSending> forOwner(UUID ownerId, UUID stickerId)` trả byte, loại, rộng, cao. **Không trả tên** (sửa ở ZS-04/05): tên tệp gửi đi do `conversation` đặt theo loại, vì tên người dùng đặt cho sticker là chữ của họ. `conversation` phụ thuộc `sticker` qua đúng cổng này; `ModularityTests` canh. **Phương án bỏ:** `conversation` đọc thẳng bảng `sticker_content` (phá ranh giới module); web tải byte rồi gửi lên (gửi 1 MiB hai lần, và máy chủ không còn chắc ảnh là sticker đã kiểm).

### D-351 — Một điểm cuối gửi, hai loại thân · agent chốt
`POST /api/conversations/{id}/messages` nhận đúng một trong `text` hay `stickerId`. `ReplyService.send` nhận một nội dung (chữ hoặc sticker); phần ghi trước, gọi provider, đối chiếu, "Gửi lại" / "Bỏ" giữ nguyên. **Phương án bỏ:** `POST …/stickers` riêng (hai đường cho cùng một việc gửi).

### D-352 — Tin đi lưu thế nào, và tin vọng lại · agent chốt
Tin đi: `type = IMAGE`, chữ `[Sticker]`, metadata `{ "libraryStickerId": "…" }` (đổi từ `stickerId` ở ZS-05: connector Zalo đã ghi `stickerId` cho số sticker của Zalo, hai thứ khác nhau không được chung một khoá). Web hiện tin có `libraryStickerId` bằng `GET /api/stickers/{id}/content` (ảnh của Sino, luôn tải được, không phụ thuộc CDN của Zalo, xem ZL-18). Tin Zalo đẩy lại với cùng mã tin là cùng một dòng (như tin chữ); metadata `libraryStickerId` MUST được giữ khi gộp. **Đã kiểm ở ZS-05, và đúng là bị ghi đè:** `ON CONFLICT … DO UPDATE` của `JdbcConversationStore` đặt `metadata = EXCLUDED.metadata`, nên tin vọng lại tới sau lần gửi làm mất khoá; và khi tin vọng lại tới **trước**, `ReplyService.confirm` xoá dòng của Sino rồi giữ dòng đã nhập, cũng làm mất khoá. Sửa cả hai: lệnh ghi giữ khoá trong lúc gộp (`EXCLUDED.metadata || khoá cũ`, và so sánh "có đổi không" cũng với giá trị đã gộp để một tin vọng lại y hệt không bị tính là đổi mỗi lần sync), còn `confirm` chuyển khoá sang dòng được giữ. Có test cho cả hai thứ tự.

### D-353 — `sino-zalo`: cùng route, thêm `image` · agent chốt
`image: { data (base64), fileName, width, height }`, `text` được rỗng khi có ảnh; `bodyLimit` của route nâng lên 2 MiB (1 MiB ảnh thành khoảng 1,34 MiB base64); kiểm cỡ sau khi giải. `ZaloConnection.sendImage(threadId, threadType, image)` gọi `sendMessage({ msg: "", attachments: [{ data, filename, metadata }] })` và lấy `msgId` từ `attachment[0]`. Log chỉ mã, loại, kích thước (D-282). **Phương án bỏ:** `multipart` giữa `sino-api` và `sino-zalo` (hai kiểu thân cho một route, client Java phải dựng multipart).

### D-354 — Khung chọn đọc thư viện có sẵn · agent chốt
Khung chọn dùng `useStickers` và hook bộ của `sticker-packs`; không có API riêng cho khung chọn. Mở khung chọn lần đầu mới đọc thư viện (không đọc khi chỉ mở chat).

### D-355 — Bấm liên tiếp gửi lần lượt · agent chốt
Web giữ **một hàng chờ gửi sticker cho cả ứng dụng** (giới hạn của `sino-zalo` là theo tài khoản): gửi từng cái một theo thứ tự bấm. **Sửa ở ZS-07:** "xong cái trước mới gửi cái sau" **không** đủ, vì cái trước xong sau 300 ms thì cái sau đi ngay và bị `429`. Mỗi sticker còn đợi tới 1,1 giây sau lúc *bắt đầu* của cái trước (`stickerQueue.ts`). Tin chữ không đi qua hàng chờ này. `429` vẫn là lỗi gửi được thử lại ("Gửi lại").

### D-356 — Ẩn nút khi không gửi được ảnh · agent chốt
Chi tiết cuộc trò chuyện (`reply`) đã có trạng thái gửi được hay không theo capability (BE-58); thêm cờ `reply.canSendImages` theo `SEND_IMAGES` của connector và của tài khoản, chỉ bật khi `reply.state` là `READY`. Không có cờ thì không có nút.

### D-357 — `sino-zalo` nhận ảnh chặt hơn D-353 ở ba chỗ · agent chốt (ZS-02, ZS-03)
- **Chữ cùng ảnh là `400 INVALID_MESSAGE`.** Spec chỉ nói chữ được phép rỗng khi có ảnh. `zca-js` gửi chữ kèm ảnh GIF thành hai tin và trả hai `msgId` (chữ kèm PNG/WebP thì thành chú thích của một tin), nên `SentLog` và đối chiếu không biết ghi cái nào. Không ai cần chữ kèm sticker, nên bỏ cho khỏi mơ hồ. `ZaloProvider` cũng từ chối lệnh có cả hai (`CAPABILITY_NOT_SUPPORTED`) trước khi gọi.
- **`413` của Fastify thành `400 PAYLOAD_TOO_LARGE`.** `bodyLimit` vẫn 2 MiB như D-353, nhưng spec đòi ảnh 2 MiB giải ra là `400`, mà body của nó (khoảng 2,8 MiB) vượt giới hạn nên Fastify trả `413` trước khi route đọc được. Một `errorHandler` riêng của route đổi đúng lỗi `FST_ERR_CTP_BODY_TOO_LARGE` thành `400`; lỗi khác chuyển lại cho Fastify.
- **Đối chiếu ảnh không cần chữ.** `text` của `POST /accounts/:accountId/sent/lookup` thành tuỳ chọn; thiếu thì không khớp tin trong bộ đệm theo chữ (ảnh không có chữ), chỉ `SentLog` theo `clientMessageId` nói được: `SENT` thì trả `msgId`, chưa rõ thì `409 CANNOT_TELL`, chưa từng giữ và phiên đã chạy từ trước `after` thì rỗng. `ReplyService.reconcile` dựng lệnh từ hàng đã lưu (chữ `[Sticker]`, không có ảnh) nên vẫn đi đường này; sau khi `sino-zalo` khởi động lại mà `SentLog` mất thì tin ảnh chưa rõ ở lại `UNKNOWN` (không bao giờ tự thành `FAILED`), khác tin chữ ở chỗ bộ đệm cũng không giúp được.
- **Log chỉ ghi `imageType` và `imageBytes`**, không ghi tên tệp: tên có thể là chữ người dùng gõ.

### D-358 — Contract provider mang ảnh (ZS-03) · agent chốt
- **`OutgoingImage(bytes, mediaType, fileName, width, height)`** tự kiểm khi tạo: `image/png`, `image/gif` hay `image/webp` (viết thường); 1 byte tới 1 MiB (giới hạn của sticker trong thư viện); rộng và cao 1…16384 (cùng giới hạn với schema của `sino-zalo`); tên tệp tối đa 100 ký tự, không có đường dẫn hay ký tự điều khiển, **kết thúc đúng đuôi của loại** (`sino-zalo` và `zca-js` chọn nhánh GIF theo đuôi tên). Record sao chép mảng byte vào và ra, `equals` so theo byte, `toString` chỉ nói số byte.
- **`SendMessageCommand` thêm `image`**; chữ rỗng được khi có ảnh (khi đó thành `null`); hai constructor cũ giữ nguyên, ảnh `null`.
- **Từ chối ở connector, không ở chỗ gọi:** connector có `SEND_MESSAGES` mà không có `SEND_IMAGES` (Gmail) ném `CAPABILITY_NOT_SUPPORTED` trước mọi lời gọi ra ngoài; bộ test chung (`MessageProviderContractTest`) có ba ca ảnh để connector mới không quên: từ chối khi thiếu capability, gửi được khi có, và có `SEND_IMAGES` thì phải có `SEND_MESSAGES`.
- **`ZaloClient.ImageRequest`** gửi byte dạng base64 chuẩn (có `+` và `/`, có đệm `=`, đúng cái `sino-zalo` đòi mã hoá lại ra chính nó); `toString` che `data`. `SendRequest` và thân đối chiếu bỏ hẳn trường `null` khỏi JSON vì schema của `sino-zalo` không nhận `null`.

#### Bảng ý nghĩa capability (thêm một dòng cho `SEND_IMAGES`, theo requirement "Tập capability chuẩn" của delta `provider-contract`)

| Capability | Nghĩa | Dùng bởi |
|---|---|---|
| `SEND_IMAGES` | Gửi một ảnh làm một tin: `sendMessage` nhận lệnh có `OutgoingImage`; kéo theo `SEND_MESSAGES`; không phải `ATTACHMENTS` (chỉ nói tin Sino đọc về có metadata tệp). Connector không có thì từ chối lệnh có ảnh và không gửi gì | `zalo-send-images` (Zalo có; Gmail không) |

### D-359 — Ảnh tĩnh đi như AI sticker của Zalo (ZS-09, DN-2 = B) · agent chốt, người dùng duyệt hướng
Người dùng (2026-10-20): sticker gửi từ Sino bị Zalo coi là ảnh, muốn nó giống sticker gửi từ Zalo; "sửa đi" sau khi được đưa phương án B. Cách làm đọc từ mã của chat.zalo.me (bundle tải về 2026-10-20, hàm `sendPhotoByUrl` và `_sendAISticker`), không có trong `zca-js` 2.2.0:
- **PNG và WebP:** `uploadAttachment` của `zca-js` đẩy ảnh lên như ảnh thường (chưa có tin nào trong chat), rồi `POST {file}/api/message/photo_url` (nhóm: `/api/group/photo_url`, thêm `grid`, `visibility: 0`) mã hoá AES bằng `api.custom`, với đúng các trường chat.zalo.me gửi cho một AI sticker: `properties.type = 3` (bong bóng không viền), `properties.ext = { sSrcStr: "", sSrcType: -1 }`, `jcp = { pStickerType: 1 }`, `contentId` (ở đây là `photoId` của lần upload), `webp = { width, height, url }` và `thumb_width` / `thumb_height`. Dạng này khớp với tin hổ cam thật mà ZL-18 đã đọc được (`pStickerType`, `webp`, `contentId`, `propertyExt.type: 3`).
- **GIF:** vẫn đi nhánh GIF của `zca-js` như D-353 (Zalo hiện thành ảnh động, chưa có đường sticker).
- **Lỗi:** upload hỏng thì chưa có gì trong chat, nên mọi lỗi trước lời gọi `photo_url` là `ZaloRejectedError` ("Gửi lại" được); lời gọi `photo_url` hỏng thì như `deliver` (mã lỗi của Zalo là từ chối, còn lại là chưa rõ).
- **Phương án bỏ:** loại "photo sticker" cũ của Zalo (`sSrcStr: "@STICKER"`, không có `pStickerType`): `contentId` của nó là mã một sticker có sẵn trong kho ảnh-sticker của Zalo, Sino không có mã đó.
- **Đã đo (máy người dùng, 2026-10-21, chat đôi):** Zalo nhận `contentId` là `photoId` và trả `msgId` ở gốc (bốn lần gửi đều `SENT`); tin vọng lại nằm trên CDN sticker (`b-f11-zpc.zdn.vn`) như sticker AI thật; người dùng thấy nó hiện như sticker trên Zalo. Ảnh bị đổi thành JPEG nền trắng (PNG trong suốt mất nền), giống sticker AI của chính Zalo. **Chưa kiểm:** `visibility: 0` cho nhóm; WebP động có thành ảnh tĩnh không. `photo_url` không có tài liệu: Zalo đổi thì đường này gãy, khi đó quay về D-353 (ảnh thường) bằng cách bỏ nhánh trong `ZcaGateway.sendImage`.

## Decision Needed (đã chốt: tất cả theo đề xuất A, người dùng 2026-10-20 "duyệt theo đề xuất"; trước ZS-01)

**Chốt 2026-10-20:** DN-1…DN-5 = **A** (đề xuất), người dùng: "duyệt theo đề xuất". Các phương án khác giữ lại bên dưới để biết đã bỏ gì.

**Đổi 2026-10-20, tối:** DN-2 = **B** cho ảnh tĩnh (PNG, WebP), GIF vẫn A. Lý do: sau ZS-08 người dùng thấy Zalo hiện sticker của Sino thành ảnh và muốn giống sticker của Zalo ("sửa đi"). Cách làm ở D-359.

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
- [`photo_url` (D-359) không có tài liệu, các trường đọc từ mã của chat.zalo.me] → Zalo đổi thì gửi sticker hỏng; quay về ảnh thường (D-353) chỉ cần bỏ một nhánh trong `ZcaGateway.sendImage`.
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
