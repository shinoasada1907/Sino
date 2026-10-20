## Why

Khung soạn tin của chat chỉ gửi được chữ và sticker của thư viện. Nút kẹp giấy có từ FE nhưng chưa làm gì (D-52), còn dán ảnh hay tệp vào ô soạn tin thì không có tác dụng. Người dùng (2026-10-21): "khung chát thiếu việc copy paste vào file và ảnh". Change này cho chat Zalo gửi được ảnh và tệp từ máy: dán vào, chọn bằng nút kẹp giấy, hoặc kéo thả.

## What Changes

- **Web:** khay xem trước nằm trên ô soạn tin của chat. Ảnh và tệp vào khay bằng Ctrl+V, nút kẹp giấy (chọn nhiều tệp) hoặc kéo thả; mỗi mục có nút bỏ; tối đa 10 mục một lượt. Ảnh quá 10 MB, tệp quá 25 MB hay tệp rỗng bị báo ngay. Enter hoặc "Gửi" gửi từng mục thành một tin, theo thứ tự trong khay, rồi tới chữ đang gõ. Mỗi tin hiện ngay "Đang gửi" (ảnh lấy hình xem trước, tệp hiện chip tên và cỡ), có "Gửi lại" và "Bỏ" khi lỗi.
- **`sino-api`:** `POST /api/conversations/{id}/messages` nhận thêm thân multipart (`file`, `clientMessageId`). Loại tệp xác định bằng byte đầu: JPEG, PNG, WebP, GIF tới 10 MB là ảnh; mọi loại khác tới 25 MB là tệp. Tin đi được lưu loại `IMAGE` hay `FILE` kèm một dòng `attachment` (tên, loại, cỡ); byte không được lưu. Capability mới `SEND_FILES`, và cờ `reply.canSendFiles` trong chi tiết cuộc trò chuyện.
- **Contract provider:** `SendMessageCommand` mang được một `OutgoingFile` (byte, loại, tên tệp, ảnh hay tệp); chỉ connector có `SEND_FILES` nhận lệnh đó.
- **`sino-zalo`:** route mới `POST /accounts/:accountId/messages/file` dạng multipart. Ảnh đi thành tin ảnh thường của Zalo (có khung, không phải AI sticker); tệp đi qua `uploadAttachment` của `zca-js`. Route giữ chống gửi trùng (`SentLog`), giới hạn 1 tin/giây, thời gian chờ, và không ghi byte vào log.

## Capabilities

### New Capabilities
- `chat-file-send`: gửi một ảnh hay một tệp vào một cuộc trò chuyện qua API của Sino: nhận dạng loại, giới hạn cỡ, kiểm capability, chống gửi trùng, lưu tin đi.
- `zalo-file-send`: `sino-zalo` gửi một ảnh hay một tệp qua Zalo vào chat đôi hoặc nhóm, với các bảo đảm của tin chữ.
- `chat-attachment-tray`: khay ảnh và tệp trong khung soạn tin của chat trên web: dán, chọn, kéo thả, xem trước, gửi.

### Modified Capabilities
- `provider-contract`: tập capability chuẩn thêm `SEND_FILES`; contract gửi tin mang được một tệp.

## Impact

- **`apps/sino-web`:** `features/inbox/components/{Composer,ChatThread}.tsx`, khay mới, `useInbox.ts` (gửi tệp), hàng chờ gửi (mở rộng `stickerQueue.ts`), `inbox.api.ts`.
- **`apps/sino-api`:** `provider/ProviderCapability`, `provider/spi/{SendMessageCommand,OutgoingFile}`, `provider/infrastructure/{zalo,gmail}`, `conversation/api/ConversationMessagesController`, `conversation/application/{ReplyService,Replies,Reply}`, `application.yaml` (giới hạn multipart), `README.md`.
- **`apps/sino-zalo`:** `messages/sendRoutes.ts` (hoặc một tệp route mới), `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `sessions/SessionManager.ts`, thêm `@fastify/multipart`.
- **Thứ tự:** web và phần `conversation` của `sino-api` làm trước. `ZcaGateway.ts`, `sendRoutes.ts` và `ZaloClient.java` đang thuộc phiên "sino-zalo-36" cho tới khi xong ZS-09 của `zalo-send-images`, nên phần `sino-zalo` và connector Zalo làm sau đó. Archive sau `zalo-send-images` (cùng sửa `provider-contract`).
- **Chạy thật** cần tài khoản Zalo của người dùng, nên ZF-20 làm trên máy người dùng.

## Non-goals

- **Đính kèm cho thư Gmail** (trả lời hay viết thư mới): cần dựng thư nhiều phần (MIME), làm ở một change sau.
- **Chữ làm chú thích của ảnh trong cùng một tin**: chữ đi thành tin riêng, sau các tệp.
- **Nén hay thu nhỏ ảnh trên trình duyệt**, **chuyển ảnh HEIC** (HEIC đi như một tệp), **ghi âm và video quay tại chỗ**.
- **Lưu tệp để gửi lại sau khi tải lại trang**: byte không được lưu; tin lỗi sau khi tải lại chỉ còn "Bỏ".
