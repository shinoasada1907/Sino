## Mode

**AUTO** (người dùng, 2026-10-21: "AUTO: Claude tự làm"; `project-mode.yaml` `task_overrides.zalo-send-files`). Người dùng đã chốt phạm vi, cách gửi, giới hạn và kiến trúc trước khi viết change (mục "Đã chốt" bên dưới). D-370…D-378 do agent chốt, cần xem lại. Số quyết định bắt đầu từ D-370 để không trùng với `zalo-send-images`, change đang có thêm quyết định (tới D-359 lúc viết). Kiểm thử theo luật của repo từ 2026-10-20: test tay trước, test tự động sau.

## Context

- **Gửi hôm nay** (F10, ZS-01…ZS-09): `ReplyService` ghi trước một tin đi có `clientMessageId`, gọi `connector.sendMessage` ngoài giao dịch, rồi đánh dấu đã gửi hay lỗi; kết quả chưa rõ thì đối chiếu theo `clientMessageId` (`SentLog` của `sino-zalo`), không gửi mù. `POST /api/conversations/{id}/messages` nhận JSON có đúng một trong `text` hay `stickerId`. `SendMessageCommand` mang được một `OutgoingImage` (sticker, tối đa 1 MiB, PNG/GIF/WebP).
- **`sino-zalo`:** `POST /accounts/:accountId/messages` nhận JSON (`text` hoặc `image` base64), `bodyLimit` 2 MiB, 1 tin/giây mỗi tài khoản (`RateLimiter`), `SentLog` theo `clientMessageId`. Từ ZS-09, ảnh tĩnh của sticker đi như AI sticker của Zalo (`photo_url`, không viền).
- **`zca-js` 2.2.0:** `sendMessage({ msg, attachments })` chọn nhánh theo **đuôi tên tệp**: `jpg/jpeg/png/webp` là ảnh (`photo_original/send`, có khung), `gif` đi nhánh GIF, còn lại tải lên bằng `asyncfile/upload` (loại "others" hay "video") và **chờ Zalo báo xong qua websocket** (`ctx.uploadCallbacks`), rồi gửi `asyncfile/msg`. Zalo đặt giới hạn cỡ tệp riêng cho từng tài khoản (`sharefile.max_size_share_file_v3`).
- **Bảng `attachment`** (V9): `message_id`, `external_attachment_id`, `file_name`, `mime_type`, `size_bytes`, `remote_url`, `thumbnail_url`. Web đã hiện tệp của tin nhận về (tên và cỡ).
- **Web:** `Composer` dùng chung cho thư và chat; nút kẹp giấy chưa có luồng (D-52). `useSendMessage` có hàng chờ sticker cách nhau 1,1 giây (`stickerQueue.ts`, D-355). Giới hạn multipart của Spring hiện là 2 MB (vì sticker).

## Goals / Non-Goals

**Goals:** trong chat Zalo (đôi và nhóm), gửi được ảnh và tệp từ máy bằng dán, chọn hay kéo thả, với các bảo đảm của tin chữ: không gửi trùng, kết quả chưa rõ thì không gửi mù, lỗi nói rõ.

**Non-Goals:** xem `proposal.md`.

## Đã chốt (người dùng, 2026-10-21, hỏi trong chat)

- **Phạm vi:** chat Zalo, cả ảnh và tệp. Gmail để change sau.
- **Mode:** AUTO.
- **Cách gửi:** khay xem trước, bấm Gửi (không gửi ngay khi dán).
- **Giới hạn:** ảnh 10 MB, tệp 25 MB.
- **Kiến trúc:** gửi thẳng, không lưu tệp ("Gửi lại" dùng tệp trình duyệt còn giữ; sau khi tải lại trang thì tin lỗi chỉ còn "Bỏ"). Phương án bỏ: lưu tạm tệp trên Sino rồi gửi bằng id (database phình, cần việc dọn).
- Thiết kế 5 phần trình bày trong chat được duyệt nguyên văn ("ok duyệt").

## Decisions

### D-370 — Cùng điểm cuối gửi, thân multipart cho ảnh và tệp · agent chốt
`POST /api/conversations/{id}/messages` với `Content-Type: multipart/form-data` (phần `file` và `clientMessageId`) là gửi một ảnh hay tệp; JSON giữ nguyên cho chữ và sticker. Spring chọn phương thức theo `consumes`. Toàn bộ phần ghi trước, gọi provider, đối chiếu, "Gửi lại" và "Bỏ" của `ReplyService` dùng chung (thêm một loại nội dung vào `Outgoing`). **Phương án bỏ:** điểm cuối riêng `…/files` (hai đường cho cùng một việc gửi, như D-351 đã tránh).

### D-371 — Loại do byte đầu, cỡ theo loại · agent chốt
Byte đầu quyết: JPEG, PNG, WebP (cả WebP động) và GIF là **ảnh**, tối đa 10 MB; mọi thứ khác là **tệp**, tối đa 25 MB; tệp rỗng bị từ chối. Tên tệp được làm sạch: bỏ đường dẫn và ký tự điều khiển, tối đa 255 ký tự, rỗng thì đặt `tep`. Ảnh luôn được gửi với đuôi khớp loại thật (`zca-js` chọn nhánh theo đuôi): `chup-man-hinh.PNG` thành `chup-man-hinh.png`, một JPEG tên `a.png` thành `a.jpg`. Một tệp không phải ảnh mà tên có đuôi ảnh (`ghi-chu.jpg` chứa chữ) được thêm `.bin` để `zca-js` không đưa nó vào nhánh ảnh. Mã lỗi: `FILE_TOO_LARGE` (`413`, kèm giới hạn), `FILE_EMPTY` (`400`). **Phương án bỏ:** tin `Content-Type` hay đuôi của trình duyệt (dán ảnh từ một số ứng dụng cho tên `image.png` với nội dung JPEG).

### D-372 — `OutgoingFile` và capability `SEND_FILES` · agent chốt
`OutgoingFile(byte[] bytes, String mediaType, String fileName, Kind kind)` với `Kind` là `PHOTO` hay `FILE`, tự kiểm cỡ theo loại; `SendMessageCommand` có thêm `file` (chữ rỗng, không có `image`). Capability mới `SEND_FILES`, kéo theo `SEND_MESSAGES`; Zalo khai, Gmail không; connector không có `SEND_FILES` ném `CAPABILITY_NOT_SUPPORTED` trước mọi lời gọi ra ngoài (như D-358). Chi tiết cuộc trò chuyện có `reply.canSendFiles` (bật khi `reply.state` là `READY` và cả connector lẫn tài khoản có `SEND_FILES`). `OutgoingImage` giữ nguyên cho sticker. **Phương án bỏ:** nới `OutgoingImage` (sticker có luật riêng: 1 MiB, rộng và cao, không JPEG; trộn hai thứ làm cả hai mơ hồ).

### D-373 — Tin đi lưu thế nào · agent chốt
Ảnh: `type = IMAGE`, chữ `[Ảnh]`. Tệp: `type = FILE`, chữ là tên tệp. Cả hai có **một dòng `attachment`** (`external_attachment_id = sino:<clientMessageId>`, tên, loại, cỡ, không có địa chỉ), để bong bóng hiện chip tệp như tin nhận về. **Byte không được lưu.** Tin Zalo đẩy lại với cùng mã tin thay dòng của Sino như hiện nay (`confirm`); dòng `attachment` của tin vọng lại do việc nhập ghi, có địa chỉ ảnh của Zalo. Gửi lại cùng `clientMessageId` sau khi đã gửi trả tin đã có mà không cần đọc lại tệp.

### D-374 — `sino-api` tới `sino-zalo`: route multipart riêng · agent chốt
`POST /accounts/:accountId/messages/file`, multipart: `meta` (JSON: `threadId`, `threadType`, `clientMessageId`, `kind`, `fileName`) và `file` (byte). Giới hạn thân 26 MB. Cùng `SentLog`, cùng `RateLimiter` 1 tin/giây với route chữ, cùng các mã lỗi; `sent/lookup` không đổi (đối chiếu theo `clientMessageId`). **Khác D-353:** ở đó multipart bị bỏ vì ảnh sticker nhỏ (1 MiB thành 1,34 MiB base64); tệp 25 MB thành khoảng 34 MB base64 trong một JSON mà Fastify phải giữ và giải cả cục, nên ở đây multipart đáng hơn. `ZaloClient` dựng multipart bằng `MultipartBodyBuilder` của Spring. Thời gian chờ của lời gọi này dài hơn của tin chữ (tải lên 25 MB): 120 giây.

### D-375 — `sino-zalo` gửi ảnh và tệp thế nào · agent chốt
`ZaloConnection.sendFile(threadId, threadType, file)`: cả ảnh và tệp đi qua `sendMessage({ msg: "", attachments: [{ data, filename, metadata }] })` của `zca-js`. Ảnh có `metadata` rộng, cao (đọc từ đầu tệp ở `sino-zalo`; JPEG, PNG, WebP, GIF), nên đi nhánh ảnh thường **có khung**, không phải nhánh AI sticker của ZS-09. Tệp đi nhánh "others" hay "video" theo đuôi. `msgId` lấy từ `attachment[0]`. Tải lên chờ websocket của phiên: phiên không có websocket thì `zca-js` không bao giờ trả lời, nên route có thời gian chờ riêng (100 giây, ngắn hơn 120 giây của `sino-api`) và hết giờ là kết quả chưa rõ.

### D-376 — Khay trên web · agent chốt
Khay là một phần của `Composer`, chỉ có khi `onSendFiles` được đưa vào (chat có `reply.canSendFiles`). Nguồn: `paste` của ô soạn tin (chỉ khi clipboard có tệp; dán chữ giữ như cũ), nút kẹp giấy (`<input type="file" multiple>`), thả tệp vào khung chat. Tối đa 10 mục; mục thứ 11 trở đi bị báo. Kiểm tại chỗ bằng `File.size` và `File.type` (chỉ để báo sớm; máy chủ mới quyết loại). Ảnh trong khay có hình xem trước (`URL.createObjectURL`), tệp có chip tên và cỡ; mỗi mục có nút bỏ. Enter hoặc "Gửi" gửi khi khay có mục dù ô chữ trống.

### D-377 — Thứ tự và nhịp gửi · agent chốt
Một lượt gửi: các mục theo thứ tự trong khay, rồi chữ. Mọi thứ của lượt đó, cùng sticker, đi qua **một hàng chờ chung** cách nhau 1,1 giây (mở rộng `stickerQueue.ts` thành hàng chờ gửi), vì `sino-zalo` chỉ nhận 1 tin/giây mỗi tài khoản. Tin chữ gửi riêng (không kèm tệp) vẫn đi thẳng như trước.

### D-378 — "Gửi lại", và hình của ảnh đang gửi · agent chốt
Web giữ `File` của mỗi tin đi theo `clientMessageId` trong bộ nhớ của trang. "Gửi lại" gửi lại đúng tệp đó với cùng mã. Sau khi tải lại trang (không còn tệp), tin lỗi chỉ còn "Bỏ" và câu "Chọn lại tệp để gửi". Ảnh đang gửi và vừa gửi xong hiện bằng hình xem trước của trình duyệt cho tới khi tin có ảnh của Zalo (tin vọng lại); hình xem trước được giải phóng khi tin bị bỏ, khi có ảnh của Zalo, hay khi rời cuộc trò chuyện.

## Risks / Trade-offs

- [`zca-js` chờ websocket khi tải tệp lên] → phiên đang chạy luôn có websocket; mất websocket giữa chừng thì hết giờ và tin là chưa rõ, đối chiếu theo `SentLog`.
- [Zalo giới hạn cỡ tệp riêng, có thể nhỏ hơn 25 MB] → `zca-js` ném lỗi trước khi tải lên; báo "Zalo không nhận tệp lớn thế này".
- [Bộ nhớ: 25 MB đi qua hai tiến trình] → mỗi lượt gửi một tệp (hàng chờ), nên tối đa vài chục MB cùng lúc.
- [Zalo nén ảnh] → biết ở ZF-20; ảnh gửi đi là ảnh của Zalo, như khi gửi từ ứng dụng Zalo.
- [Delta `provider-contract` cùng requirement với `zalo-send-images`] → archive sau `zalo-send-images`; delta ở đây đã chứa cả `SEND_IMAGES`.
