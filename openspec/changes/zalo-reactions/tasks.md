# Thả biểu cảm trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** cho tới khi chạy đúng (web: Chrome thật; backend: chạy app và gọi API thật; Zalo: thao tác thật trên điện thoại hay chat.zalo.me), rồi mới viết test tự động; kiểm chứng; ghi chú thực hiện và bằng chứng tại task (cả lượt test tay: đã làm gì, thấy gì); commit lên `dev`. Push chỉ khi người dùng bảo.
> **Lệnh kiểm tra.** `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`. `apps/sino-api`: `./mvnw -B -ntp test` trong một worktree riêng (không build trong cây chính khi người dùng chạy app từ IntelliJ). `apps/sino-zalo`: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.
> **Phối hợp với `zalo-send-files`:** change đó (phiên "sino-web-ba", không còn chạy lúc 2026-10-21) để lại thay đổi chưa commit trên `ChatThread.tsx`, `Composer.tsx`, `inbox.types.ts`, `inbox.api.ts`, `useInbox.ts`, `ZaloGateway.ts`, `ZcaGateway.ts`, `FakeZaloGateway.ts`, `SessionManager.ts`, `sendRoutes.ts`, `ZaloClient.java`, `ZaloMessageNormalizer.java`, `ZaloProvider.java`…, đúng những file change này phải sửa. **Chưa chốt cách phối hợp** (hỏi người dùng 2026-10-21); không task nào dưới đây sửa các file đó trước khi chốt.
> **Gợi ý** theo hai mức: **Level 1** (hướng nghĩ), **Level 2** (hướng làm).

## 1. Thử thật

- [ ] 1.1 **RX-01 — Thử biểu cảm với Zalo thật, code bỏ đi (D-380)**
  - **Goal:** trả lời ba câu của D-380 trước khi dựng: `msgId` của biểu cảm có cùng dãy với tin không (và `old_messages` có kèm biểu cảm không); thả lên tin thiếu `cliMsgId`, lên ảnh và sticker có được không; gỡ bằng `{ rType: -1, source: 6, icon: "" }` có được không.
  - **Files:** chỉ trên một nhánh tạm (không commit vào `dev`): log hình dạng của sự kiện `reaction` / `old_reactions` trong `ZcaGateway.ts`, một route thử gọi `addReaction`. Kết quả ghi vào task này và D-380.
  - **Acceptance criteria:** ba câu có câu trả lời kèm bằng chứng (log hình dạng, không có nội dung tin; ảnh hay lời người dùng kể điện thoại hiện gì); quyết định A hay B, `canReact` cho tin cũ, có nút gỡ hay không đã ghi.
  - **Test:** người dùng thả và gỡ vài biểu cảm từ điện thoại lên một tin chữ, một ảnh, một sticker (chat đôi với nick phụ và một nhóm); agent thả từ route thử lên tin mới và tin cũ; người dùng xem bên Zalo.
  - **Depends on:** chốt phối hợp (đụng `ZcaGateway.ts`).
  - **Hints:** **Level 1:** so `msgId` của sự kiện với `msgId` tin mới nhất trong `MessageBuffer` lúc đó. **Level 2:** `selfListen` phải bật mới thấy biểu cảm của chính mình.

## 2. `sino-zalo`

- [ ] 2.1 **RX-02 — Biểu cảm vào hàng chờ, tin mang `cliMsgId` (D-381)**
  - **Goal:** sự kiện `reaction` (và đọc bù) thành mục `zaloType: "reaction"` trong hàng chờ; mọi tin có `cliMsgId`.
  - **Files:** `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `src/sessions/{SessionManager,CatchUp}.ts` (nếu RX-01 cần `requestOldReactions`), README (hình dạng của mục); test.
  - **Acceptance criteria:** spec `zalo-reactions` phần "Biểu cảm của Zalo vào hàng chờ" và "Tin mang `cliMsgId`"; log không có biểu tượng hay tên.
  - **Test:** test tay: chạy `sino-zalo`, người dùng thả và gỡ từ điện thoại, gọi `GET /accounts/:id/messages?after=` bằng `curl` thấy mục; rồi Vitest với gateway giả (mục, nhiều đích, đọc bù, log).
  - **Depends on:** RX-01.
  - **Hints:** **Level 1:** một sự kiện, một mục, vì sao? **Level 2:** `MessageBuffer` khử trùng theo `msgId`.

- [ ] 2.2 **RX-03 — Route thả, đổi, gỡ biểu cảm (D-389)**
  - **Goal:** `POST /accounts/:accountId/reactions` gọi `addReaction`.
  - **Files:** route mới trong `src/messages/`, `src/gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `src/sessions/SessionManager.ts`, README; test.
  - **Acceptance criteria:** spec `zalo-reactions` phần "Thả, đổi, gỡ biểu cảm qua Zalo".
  - **Test:** test tay: `curl` thả ❤️, đổi 😆, gỡ, mã lạ; người dùng xem bên Zalo; rồi Vitest (`inject`: 400, 410, 422, 429, chung nhịp với gửi tin).
  - **Depends on:** RX-01.
  - **Hints:** **Level 1:** `Reactions.NONE` đi nhánh nào trong `addReaction`? **Level 2:** nhánh mặc định không đặt `source`.

## 3. `sino-api`

- [ ] 3.1 **RX-04 — Contract: `NormalizedReaction`, `SyncBatch.reactions`, `reactionSet()`, `react(...)` (D-383)**
  - **Goal:** kiểu và method của contract; mặc định không hỗ trợ; Gmail và connector giả trả rỗng hay từ chối.
  - **Files:** `provider/spi/{SyncBatch,MessageProvider}` + `NormalizedReaction`, `ReactionKind`, `ReactCommand`; contract test kit, connector giả; bảng ý nghĩa capability trong design.
  - **Acceptance criteria:** delta `provider-contract`; constructor cũ của `SyncBatch` giữ nguyên.
  - **Test:** test tay không áp dụng (chưa có đường gọi); test tự động: tự kiểm của kiểu mới, `toString` không lộ tên, Gmail ném không hỗ trợ không gọi ra ngoài, bộ test chung có ca biểu cảm.
  - **Depends on:** —.
  - **Hints:** **Level 1:** `OutgoingFile` (ZF-04) giữ constructor cũ của `SendMessageCommand` thế nào? **Level 2:** constructor phụ gọi constructor chính với danh sách rỗng.

- [ ] 3.2 **RX-05 — Connector Zalo: đọc biểu cảm, `cliMsgId`, bảng biểu cảm, thả (D-382, D-388)**
  - **Goal:** `ZaloMessageNormalizer` tách mục `reaction` thành `NormalizedReaction` (một mỗi đích) và ghi `metadata.cliMsgId`; `ZaloProvider` khai `REACTIONS`, có bảng biểu cảm, `react` gọi route của RX-03 qua `ZaloClient`.
  - **Files:** `provider/infrastructure/zalo/{ZaloMessageNormalizer,ZaloProvider,ZaloClient}`; test.
  - **Acceptance criteria:** delta `provider-contract`; 6 mục `quick` đúng thứ tự D-388; mã không có trong bảng bị từ chối trước lời gọi ra ngoài; lỗi đổi như tin chữ.
  - **Test:** test tay: chạy `sino-api` (worktree) với `sino-zalo` thật, xem log sync và `metadata` của tin mới trong DB; rồi WireMock và test của normalizer.
  - **Depends on:** RX-02, RX-03, RX-04.
  - **Hints:** **Level 1:** `ConversationType` của Sino đổi sang `threadType` của Zalo ở đâu khi gửi tin? **Level 2:** dùng lại đúng chỗ đó.

- [ ] 3.3 **RX-06 — Lưu và áp biểu cảm (D-384, D-385)**
  - **Goal:** `V23`, áp biểu cảm từ batch vào tin đã có, không đổi số chưa đọc, báo web.
  - **Files:** `db/migration/V23__conversation_create_message_reaction.sql`, `conversation/ConversationStore` + `infrastructure/JdbcConversationStore`, `sync/application` (chuyển `reactions` của batch), sự kiện `conversations.changed`; test.
  - **Acceptance criteria:** spec `message-reactions` phần "Lưu biểu cảm của tin" và "Áp biểu cảm nhận về mà không thành tin mới".
  - **Test:** test tay: thả từ điện thoại, xem bảng `message_reaction` và số chưa đọc trước và sau, xem SSE bằng `curl -N`; rồi Testcontainers (thay, lộn thứ tự, dấu gỡ, tin không có, chưa đọc không đổi).
  - **Depends on:** RX-04, RX-05.
  - **Hints:** **Level 1:** "chỉ ghi khi mới hơn" viết trong một câu SQL thế nào? **Level 2:** `INSERT … ON CONFLICT … DO UPDATE … WHERE excluded.reacted_at > message_reaction.reacted_at`.

- [ ] 3.4 **RX-07 — API: `reactions`, `canReact`, `reactionSet`, `PUT`/`DELETE …/reaction` (D-386, D-387)**
  - **Goal:** web đọc được biểu cảm và thả, đổi, gỡ biểu cảm của người dùng.
  - **Files:** `conversation/api/{ConversationMessagesController,MessageResponse,ConversationDetailResponse}`, `conversation/application/` (dịch vụ thả, `ConversationErrorCode`), `README.md`; test.
  - **Acceptance criteria:** spec `message-reactions` phần "Biểu cảm trong phản hồi của API" và "Thả, đổi, gỡ biểu cảm của người dùng".
  - **Test:** test tay: `curl` `PUT` ❤️, đổi, `DELETE`, mã lạ, tin Gmail, phiên Zalo đã tắt; người dùng xem bên Zalo; rồi Testcontainers + WireMock (không gọi connector trong giao dịch, không lưu khi lỗi).
  - **Depends on:** RX-06.
  - **Hints:** **Level 1:** `ReplyService` gọi connector ngoài giao dịch thế nào? **Level 2:** đọc và kiểm trong một giao dịch, gọi ngoài, ghi trong giao dịch thứ hai.

## 4. Web

- [ ] 4.1 **RX-08 — Kiểu, API và chip biểu cảm (D-387, D-390)**
  - **Goal:** `Message.reactions`, `Message.canReact`, `ConversationDetail.reactionSet`; chip dưới bong bóng và danh sách ai thả.
  - **Files:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, chip mới (`ReactionChips.tsx`), `components/ChatThread.tsx`, `test/inboxSampleApi.ts` (+ test).
  - **Acceptance criteria:** spec `chat-reactions-ui` phần "Chip biểu cảm dưới tin".
  - **Test:** test tay trên Chrome thật (1440 và 390, sáng và tối) với backend thật hay MSW; rồi Vitest.
  - **Depends on:** RX-07 (hình dạng API); dựng được với MSW trước.
  - **Hints:** **Level 1:** chip nằm ở mép nào với tin đến và tin đi? **Level 2:** mép ngoài, như ảnh của Zalo.

- [ ] 4.2 **RX-09 — Thanh chọn, bảng đầy đủ, nhấn giữ, thả hiện ngay (D-390, D-391)**
  - **Goal:** nút mặt cười, thanh 6 biểu cảm và "+", bảng đầy đủ, nhấn giữ dưới 768px, `useReactToMessage` sửa cache ngay và trả về khi lỗi.
  - **Files:** thanh mới (`ReactionPicker.tsx`), `features/inbox/useInbox.ts` (hay hook mới), `components/ChatThread.tsx` (+ test).
  - **Acceptance criteria:** spec `chat-reactions-ui` phần "Thanh chọn biểu cảm" và "Thả hiện ngay, lỗi trả về".
  - **Test:** test tay trên Chrome thật (1440 và 390): thả, đổi, gỡ, "+", bàn phím, nhấn giữ (giả lập chạm), lỗi 429; rồi Vitest + MSW.
  - **Depends on:** RX-08.
  - **Hints:** **Level 1:** `StickerPicker` chọn Popover hay sheet theo gì? **Level 2:** cùng ngưỡng 768px.

## 5. Nghiệm thu

- [ ] 5.1 **RX-20 — Chạy thật trên máy người dùng, tài liệu, kết thúc**
  - **Goal:** chứng minh hai chiều với Zalo thật.
  - **Files:** `docs/knowledge/phase-5-multi-provider-send.md` (mục mới) và `.docx`; `PROJECT_STATE.md`; `tasks.md`.
  - **Acceptance criteria:** chat đôi và nhóm: người kia thả, đổi, gỡ thì Sino hiện trong vài giây; Sino thả, đổi, gỡ thì điện thoại hiện; biểu cảm khi `sino-zalo` mất kết nối hiện sau khi nối lại; số chưa đọc không đổi; bảng biểu cảm so với cách Zalo vẽ từng mã (D-388), chỗ lệch đã sửa; mọi lệnh kiểm tra xanh; `openspec validate zalo-reactions --strict` hợp lệ; người dùng đã xem.
  - **Test:** như trên.
  - **Depends on:** RX-01…RX-09.
  - **Hints:** **Level 1:** Zalo đếm theo lần bấm, Sino theo người: số nào người dùng thấy? **Level 2:** ghi lại trong tài liệu.

- [ ] 5.2 **RX-21 — Vẽ biểu cảm vào canvas "Sino UI"**
  - **Goal:** canvas có frame của nút, thanh, bảng đầy đủ, chip và danh sách ai thả (desktop và mobile, hai theme), khớp với app; bản sao `design/sino-ui/project/` khớp bản mới.
  - **Files:** canvas https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB, `design/sino-ui/project/**`.
  - **Acceptance criteria:** người dùng duyệt frame mới; bản sao khớp phiên bản xuất bản (cỡ tệp, SHA-256 của các tệp đổi).
  - **Test:** so frame với ảnh chụp app ở 1440 và 390.
  - **Depends on:** RX-09. Archive change sau RX-20 và RX-21.
