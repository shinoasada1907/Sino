# Gửi ảnh và tệp trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** cho tới khi chạy đúng (web: Chrome thật; backend: chạy app và gọi API thật), rồi mới viết test tự động; kiểm chứng; ghi chú thực hiện và bằng chứng tại task (cả lượt test tay: đã làm gì, thấy gì); commit lên `dev`. Push chỉ khi người dùng bảo.
> **Lệnh kiểm tra.** `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`. `apps/sino-api`: `./mvnw -B -ntp test` trong một worktree riêng (không build trong cây chính khi người dùng chạy app từ IntelliJ). `apps/sino-zalo`: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.
> **Thứ tự:** phần 1 (web) và phần 2 (`conversation` của `sino-api`) làm trước. Phần 3 đụng `ZcaGateway.ts`, `sendRoutes.ts` và `ZaloClient.java`, đang thuộc phiên "sino-zalo-36" cho tới khi xong ZS-09 của `zalo-send-images`: chỉ bắt đầu khi phiên đó nhả file.
> **Gợi ý** theo hai mức: **Level 1** (hướng nghĩ), **Level 2** (hướng làm).

## 1. Web

- [ ] 1.1 **ZF-01 — Gửi một tệp: request, hàng chờ chung, tin hiện ngay (D-370, D-377, D-378)**
  - **Goal:** `useSendMessage` gửi được một `File` thành một tin, qua hàng chờ chung với sticker; giữ tệp để "Gửi lại".
  - **Files:** `features/inbox/{inbox.api.ts,inbox.types.ts,useInbox.ts,stickerQueue.ts}` (+ test), `test/inboxSampleApi.ts`.
  - **Acceptance criteria:** spec `chat-attachment-tray` phần "Gửi cả khay" (thứ tự, nhịp 1,1 giây, hiện ngay) và "Lỗi, gửi lại và bỏ"; `reply.canSendFiles` vào `ConversationDetail.canSendFiles`.
  - **Test:** test tay trên Chrome thật với MSW hoặc backend giả (một lượt gửi hai tệp và một câu); rồi Vitest + MSW: multipart có `file` và `clientMessageId`, thứ tự và nhịp, "Gửi lại" cùng mã và cùng tệp, tệp không còn thì chỉ "Bỏ".
  - **Depends on:** —.
  - **Hints:** **Level 1:** hàng chờ sticker có gì gắn riêng với sticker? **Level 2:** chỉ cái tên; nhịp và `scope` dùng chung được.

- [ ] 1.2 **ZF-02 — Khay trong khung soạn tin: dán, kẹp giấy, kéo thả (D-376)**
  - **Goal:** đưa ảnh và tệp vào khay, xem trước, bỏ, báo lỗi cỡ, gửi cả khay.
  - **Files:** `features/inbox/components/{Composer,ChatThread}.tsx`, khay mới (`AttachmentTray.tsx`) (+ test).
  - **Acceptance criteria:** spec `chat-attachment-tray` phần "Đưa ảnh và tệp vào khay" và "Gửi cả khay".
  - **Test:** test tay trên Chrome thật (1440 và 390): dán ảnh chụp màn hình, chọn nhiều tệp, kéo thả, tệp 30 MB, mục thứ 11, dán chữ vẫn như cũ, thư Gmail không có khay; rồi Vitest.
  - **Depends on:** ZF-01.
  - **Hints:** **Level 1:** sự kiện `paste` cho biết tệp ở đâu? **Level 2:** `event.clipboardData.files`; chỉ `preventDefault` khi có tệp.

- [ ] 1.3 **ZF-03 — Bong bóng ảnh và tệp đi (D-373, D-378)**
  - **Goal:** tin ảnh đi hiện hình xem trước tới khi có ảnh của Zalo; tin tệp hiện chip; lỗi có "Gửi lại" / "Bỏ" hay "Chọn lại tệp để gửi".
  - **Files:** `features/inbox/components/ChatThread.tsx` (+ test).
  - **Acceptance criteria:** spec `chat-attachment-tray` phần "Lỗi, gửi lại và bỏ"; hình xem trước được giải phóng khi bỏ, khi có ảnh của Zalo, khi rời cuộc trò chuyện.
  - **Test:** test tay trên Chrome thật; rồi Vitest.
  - **Depends on:** ZF-01.
  - **Hints:** **Level 1:** ai giữ object URL, và ai giải phóng nó? **Level 2:** một nơi theo `clientMessageId`, cạnh `File` của ZF-01.

## 2. `sino-api`

- [x] 2.1 **ZF-04 — `OutgoingFile`, `SEND_FILES`, Gmail từ chối (D-372)**
  - **Goal:** contract gửi tin mang được một tệp; connector không có `SEND_FILES` từ chối.
  - **Files:** `provider/ProviderCapability`, `provider/spi/{SendMessageCommand,OutgoingFile}`, `provider/infrastructure/gmail/GmailProvider`, contract test kit, connector giả; bảng ý nghĩa capability trong design của change.
  - **Acceptance criteria:** delta `provider-contract`.
  - **Test:** test tay không áp dụng (chưa có đường gọi); test tự động: `OutgoingFile` tự kiểm (loại, cỡ theo `Kind`, tên), Gmail ném không hỗ trợ, bộ test chung có ca tệp.
  - **Depends on:** —.
  - **Hints:** **Level 1:** `OutgoingImage` có gì nên chép, gì không? **Level 2:** sao chép byte vào và ra, `toString` không lộ byte; luật cỡ thì khác.
  - **Thực hiện:** `SEND_FILES` khai ngay sau `SEND_IMAGES`. `OutgoingFile(bytes, mediaType, fileName, Kind)`: `PHOTO` là JPEG/PNG/WebP/GIF 1 byte tới 10 MiB, tên kết thúc đúng đuôi của loại (không phân biệt hoa thường); `FILE` là 1 byte tới 25 MiB, tên không được kết thúc bằng đuôi ảnh (người gọi thêm `.bin`, D-371); tên tối đa 255 ký tự, không đường dẫn, không ký tự điều khiển; byte sao chép vào và ra; `toString` chỉ nói loại, kiểu và số byte, **không nói tên tệp** (tên là chữ của người dùng). `SendMessageCommand` thêm `file`; tệp đi một mình (có chữ hay ảnh sticker kèm là `IllegalArgumentException`); hai constructor cũ và một constructor 8 tham số (có `image`) giữ nguyên nên không chỗ gọi nào phải sửa. Gmail, connector giả và **Zalo** từ chối tệp bằng `CAPABILITY_NOT_SUPPORTED` trước mọi lời gọi ra ngoài; Zalo sẽ khai `SEND_FILES` và gửi thật ở ZF-07. Bộ test chung có ba ca tệp; `FakeMessageProviderContractTest` có lớp `SendingFiles` để ca "gửi được khi có `SEND_FILES`" chạy trên ít nhất một connector.
  - **Bằng chứng:** test tay không áp dụng (chưa có đường gọi tới contract). `./mvnw -B -ntp -q test -Dtest='dev/sino/provider/**/*'` trong worktree riêng ở `0af1b13` cộng các thay đổi của task: thoát 0; `OutgoingFileTests` 7, `SendMessageTests` 21 (thêm `aFileGoesAlone`), `ProviderCapabilitiesTests` 11 (thêm thứ tự `SEND_FILES`), các lớp contract của Fake, Gmail và Zalo xanh. **Chưa chạy:** toàn bộ `verify` (để ZF-05).

- [ ] 2.2 **ZF-05 — `POST …/messages` multipart, nhận dạng loại, lưu tin (D-370, D-371, D-373)**
  - **Goal:** gửi ảnh hay tệp qua API như gửi chữ; lưu tin `IMAGE`/`FILE` kèm `attachment`; `reply.canSendFiles`.
  - **Files:** `conversation/api/ConversationMessagesController`, `conversation/application/{ReplyService,Replies,Reply,ConversationErrorCode}`, nhận dạng loại (tách hay dùng lại phần đọc byte đầu của `sticker`), `application.yaml` (multipart 26 MB), `README.md`; test.
  - **Acceptance criteria:** spec `chat-file-send`.
  - **Test:** test tay: chạy `sino-api` từ worktree với connector giả, gọi API thật bằng `curl` (ảnh, PDF, quá cỡ, rỗng, Gmail, gửi lại); rồi Testcontainers.
  - **Depends on:** ZF-04.
  - **Hints:** **Level 1:** byte đầu của sticker được đọc ở đâu? **Level 2:** module `sticker`; dùng chung hay chép phải giữ ranh giới module (`ModularityTests`).

## 3. `sino-zalo` và connector Zalo (sau khi phiên "sino-zalo-36" nhả file)

- [ ] 3.1 **ZF-06 — Route `/messages/file` và `sendFile` (D-374, D-375)**
  - **Goal:** `sino-zalo` gửi ảnh (có khung) và tệp qua Zalo.
  - **Files:** `apps/sino-zalo/{package.json,pnpm-lock.yaml}` (`@fastify/multipart`), `messages/` (route), `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `sessions/SessionManager.ts`, README; test.
  - **Acceptance criteria:** spec `zalo-file-send`.
  - **Test:** test tay: gửi thật một ảnh JPEG, một PNG, một PDF, một DOCX vào chat nick phụ và một nhóm (người dùng xem bên Zalo); rồi Vitest với gateway giả (`inject` multipart, `SentLog`, 429, hết giờ, log không có tên tệp).
  - **Depends on:** ZS-09 xong (file được nhả).
  - **Hints:** **Level 1:** `zca-js` chọn nhánh ảnh hay tệp theo gì? **Level 2:** đuôi tên tệp; ảnh cần `metadata` rộng, cao.

- [ ] 3.2 **ZF-07 — `ZaloProvider` khai `SEND_FILES`, `ZaloClient` gửi multipart (D-372, D-374)**
  - **Goal:** connector Zalo gửi một `OutgoingFile` tới route của ZF-06.
  - **Files:** `provider/infrastructure/zalo/{ZaloProvider,ZaloClient}`; test.
  - **Acceptance criteria:** delta `provider-contract`; lời gọi có thời gian chờ 120 giây; `400`/`422`/`429`/`410` đổi như tin chữ.
  - **Test:** test tay: gửi thật từ web qua cả chuỗi; rồi WireMock (thân multipart đúng, mã lỗi).
  - **Depends on:** ZF-05, ZF-06.
  - **Hints:** **Level 1:** `RestClient` dựng multipart thế nào? **Level 2:** `MultipartBodyBuilder`, phần `meta` là JSON.

## 4. Nghiệm thu

- [ ] 4.1 **ZF-20 — Chạy thật trên máy người dùng, tài liệu, kết thúc**
  - **Goal:** chứng minh dán, chọn và kéo thả gửi được ảnh và tệp qua Zalo thật.
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới) và `.docx`; `PROJECT_STATE.md`; `tasks.md`.
  - **Acceptance criteria:** từ Sino gửi tới nick Zalo phụ và một nhóm: ảnh dán từ ảnh chụp màn hình, ảnh 8 MB, PDF, DOCX, tệp 24 MB; tệp 30 MB bị chặn; ghi lại Zalo hiện ra sao; tin vọng lại không thành hai tin; mọi lệnh kiểm tra xanh; `openspec validate zalo-send-files --strict` hợp lệ; người dùng đã xem.
  - **Test:** như trên.
  - **Depends on:** ZF-01…ZF-07.
  - **Hints:** **Level 1:** Zalo có nén ảnh không? **Level 2:** so cỡ ảnh tải về từ Zalo với ảnh gốc. Archive sau `zalo-send-images`.
