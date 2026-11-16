# Thả biểu cảm trong chat Zalo · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** cho tới khi chạy đúng (web: Chrome thật; backend: chạy app và gọi API thật; Zalo: thao tác thật trên điện thoại hay chat.zalo.me), rồi mới viết test tự động; kiểm chứng; ghi chú thực hiện và bằng chứng tại task (cả lượt test tay: đã làm gì, thấy gì); commit lên `dev`. Push chỉ khi người dùng bảo.
> **Lệnh kiểm tra.** `apps/sino-web`: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`. `apps/sino-api`: `./mvnw -B -ntp test` trong một worktree riêng (không build trong cây chính khi người dùng chạy app từ IntelliJ). `apps/sino-zalo`: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`.
> **Phối hợp với `zalo-send-files`:** change đó để lại thay đổi chưa commit trên `ChatThread.tsx`, `inbox.types.ts`, `inbox.api.ts`, `ZcaGateway.ts`, `ZaloClient.java`… Người dùng (2026-10-21): change đó đã làm và test xong, không đụng tới; phiên "sino-web" này làm phần web của biểu cảm. Commit của phần web chỉ chứa phần biểu cảm: ba file chung được dựng lại thành `HEAD` + phần biểu cảm và kiểm riêng trên một worktree sạch trước khi đưa vào index; thay đổi của `zalo-send-files` vẫn nằm nguyên, chưa commit, trong cây làm việc.
> **Thứ tự đổi (2026-10-21):** ~~RX-01 trước rồi mới dựng~~. **LÝ DO:** người dùng muốn phần thả biểu cảm trên web làm ngay trong phiên "sino-web"; RX-08 và RX-09 được dựng trước trên hợp đồng API của D-386/D-387 (dữ liệu mẫu, MSW), chưa có backend. Trên app thật, nút và chip chỉ hiện khi `sino-api` trả `reactionSet` và `reactions` (RX-07).
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

- [x] 4.1 **RX-08 — Kiểu, API và chip biểu cảm (D-387, D-390)** · làm cùng RX-09 trong một commit (cùng sửa `ChatThread.tsx`), trừ lượt xem trên Chrome thật
  - **Goal:** `Message.reactions`, `Message.canReact`, `ConversationDetail.reactionSet`; chip dưới bong bóng và danh sách ai thả.
  - **Files:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, chip mới (`ReactionChips.tsx`), `components/ChatThread.tsx`, `test/inboxSampleApi.ts` (+ test).
  - **Acceptance criteria:** spec `chat-reactions-ui` phần "Chip biểu cảm dưới tin".
  - **Test:** test tay trên Chrome thật (1440 và 390, sáng và tối) với backend thật hay MSW; rồi Vitest.
  - **Depends on:** RX-07 (hình dạng API); dựng được với MSW trước.
  - **Hints:** **Level 1:** chip nằm ở mép nào với tin đến và tin đi? **Level 2:** mép ngoài, như ảnh của Zalo.

- [x] 4.2 **RX-09 — Thanh chọn, bảng đầy đủ, nhấn giữ, thả hiện ngay (D-390, D-391)** · trừ lượt xem trên Chrome thật
  - **Goal:** nút mặt cười, thanh 6 biểu cảm và "+", bảng đầy đủ, nhấn giữ dưới 768px, `useReactToMessage` sửa cache ngay và trả về khi lỗi.
  - **Files:** thanh mới (`ReactionPicker.tsx`), `features/inbox/useInbox.ts` (hay hook mới), `components/ChatThread.tsx` (+ test).
  - **Acceptance criteria:** spec `chat-reactions-ui` phần "Thanh chọn biểu cảm" và "Thả hiện ngay, lỗi trả về".
  - **Test:** test tay trên Chrome thật (1440 và 390): thả, đổi, gỡ, "+", bàn phím, nhấn giữ (giả lập chạm), lỗi 429; rồi Vitest + MSW.
  - **Depends on:** RX-08.
  - **Hints:** **Level 1:** `StickerPicker` chọn Popover hay sheet theo gì? **Level 2:** cùng ngưỡng 768px.
  - **Thực hiện (RX-08 + RX-09):** file mới `reactions.ts` (kiểu `Reaction`, `ReactionKind`; `afterPick`, `withoutMine`, `chipLabel`), `reactions.api.ts` (`PUT`/`DELETE …/reaction`), `useReactToMessage.ts` (sửa cache tin ngay; các lần chọn đi lần lượt trong một `scope`, lần chọn bị lần sau vượt trước khi gửi thì không gửi, chỉ giữ câu trả lời của lần chọn cuối; lỗi thì trả chip về trạng thái trước lúc bấm, báo dưới tin "Chậm lại một chút." với 429 hay "Không thả được biểu cảm. Hãy thử lại.", rồi đọc lại tin), `components/ReactionPicker.tsx` (nút `SmilePlus` hiện khi rê chuột hay focus, Popover neo vào bong bóng; thanh nhanh `role="toolbar"` và lưới đầy đủ với `tabIndex` xoay vòng; "+" đổi Popover thành lưới 8 cột từ 768px, mở sheet dưới 768px; nhấn giữ 500 ms bằng ngón tay, huỷ khi lệch quá 10 px, chặn menu ngữ cảnh), `components/ReactionChips.tsx` (chip tối đa 3 emoji và tổng số người khi lớn hơn 1, viền `primary` khi có của mình, Popover "Người đã thả biểu cảm"). Sửa nhỏ: `inbox.types.ts` (`Message.reactions`, `Message.canReact`, `ConversationDetail.reactionSet`), `inbox.api.ts` (đọc ba trường đó; rỗng hay thiếu thì không có), `ChatThread.tsx` (`Bubble` bọc cột bong bóng bằng thanh chọn khi có `reactionSet` và `canReact`, chip sau tệp đính kèm). Tin chỉ có trong trình duyệt (`local`) không có nút.
  - **Sau lượt xem của người dùng (2026-10-21, cùng ngày):**
    - **Bản xem trước trên máy dev** (`reactionsPreview.ts`, người dùng: "local đã có cái quái nào đâu"): chỉ khi `import.meta.env.MODE === 'development'` (không trong test, không trong bản build), chat Zalo mà máy chủ không nói gì về biểu cảm thì dùng bộ của Zalo (6 nhanh + 37, mã của `zca-js` `Reactions`), mọi tin nhận biểu cảm, và lần chọn chỉ giữ trong trình duyệt (`useReactToMessage(…, previewOnly)` không gọi API). Tự tắt khi `sino-api` trả `reactionSet`.
    - **Thanh mở ở góc màn hình** (ảnh của người dùng): nút mặt cười là `Popover.Trigger` bên cạnh một `Popover.Anchor` riêng. Radix (`react-popper` 1.3) đăng ký vật neo bằng callback ref: lần đầu nút neo sau cùng, rồi Radix bỏ lớp neo quanh nút, React dựng lại nút, và vật neo còn là nút cũ đã rời trang (khung 0 × 0 ở 0, 0). Sửa: nút là `Button` thường tự bật tắt, `aria-haspopup` / `aria-expanded` / `data-state` tự đặt, `onInteractOutside` bỏ qua nút, `onCloseAutoFocus` trả focus về nút. Test mới giả lập bố cục (phần tử trên trang ở 400, 300; phần tử rời trang 0 × 0): code cũ cho `translate(0px, 6px)`, bản sửa `translate(400px, 294px)`. Người dùng xem lại: "ok rồi".
    - **Emoji theo phong cách của trang** (người dùng: "muốn cái emoji nó style theo cái phong cách của trang web"): font Noto Emoji (đơn sắc, nét, OFL 1.1), cắt bằng `fontTools.subset` còn 43 emoji của bộ (24,8 KB, giữ trục độ đậm 300…700), ở `src/assets/fonts/sino-emoji.woff2` kèm `OFL-noto-emoji.txt`; `@font-face` "Sino Emoji" và token `--font-emoji` trong `index.css`; `ReactionEmoji.tsx` vẽ emoji nét mảnh (`font-light`) theo màu chữ, bỏ `U+FE0F` để trình duyệt không chọn font màu. Không thêm gói npm (`package.json` đang thuộc `sticker-packs`). Emoji ngoài bộ vẫn hiện bằng emoji màu của hệ thống.
    - **Kiểm chứng:** `tsc -b` 0, lint 0 lỗi, `vitest run src/features/inbox` 361/361, `pnpm build` 0 (font thành `sino-emoji-….woff2` 24,78 kB), dev server trả font 200; bản commit (`HEAD` + các chỗ sửa này, không có dòng `zalo-send-files`) kiểm riêng trên worktree sạch với cùng kết quả. Chrome: người dùng tự xem trên `localhost:5173` (ảnh thanh đúng chỗ); kiểu emoji mới chưa có ảnh của người dùng.
  - **Bằng chứng:** **Chrome thật: NOT VERIFIED.** Claude in Chrome không kết nối trong phiên này, và `sino-api` chưa trả `reactionSet` / `reactions` (RX-07 chưa làm), nên trên app thật chưa có gì để thấy. Thay vào đó, 15 test mới bấm thật bằng `user-event` trên chat dựng với dữ liệu mẫu và MSW (`Reactions.test.tsx` 13: chip và danh sách người, không số khi một người, thả hiện ngay rồi lấy câu trả lời, thứ tự 6 nút và "+", gỡ của mình bằng `DELETE`, "+" ra đủ bộ, 429 trả chip về và báo, mũi tên / End / Escape trả focus, không nút khi không có bộ hay `canReact` false, nhấn giữ ở 390 px mở thanh rồi "+" mở sheet, ngón tay trượt thì không mở; `inbox.api.test.ts` thêm 2: đọc `reactions` / `canReact`, đọc `reactionSet`). Trong cây làm việc: `pnpm lint` 0 lỗi, `tsc -b` 0, `pnpm build` 0, `pnpm test` 1297/1301; 4 ca đỏ là upload `FormData` của `client.test.ts` và `useStickers.test.tsx`, đỏ y hệt trên worktree sạch ở `8d5fdf8` trước mọi thay đổi (máy chạy Node v26.1.0), không thuộc change này. Bản commit (`HEAD` + phần biểu cảm, không có thay đổi chưa commit của `zalo-send-files`) kiểm riêng trên worktree sạch: `tsc -b` 0, lint 0 lỗi, `vitest run src/features/inbox` 360/360, `pnpm build` 0.

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
