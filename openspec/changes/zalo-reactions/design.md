## Mode

**AUTO** (người dùng, 2026-10-21: "AUTO: Claude tự làm", hỏi vì `new_features` là TRAINING; `project-mode.yaml` `task_overrides.zalo-reactions`). Người dùng chốt phạm vi, bộ biểu cảm, đường đi của biểu cảm nhận về và cách làm với canvas (mục "Đã chốt"), rồi duyệt thiết kế 5 phần trình bày trong chat ("duyệt làm đi"). D-380…D-391 do agent chốt, cần xem lại. Số quyết định bắt đầu từ D-380 để không trùng `zalo-send-files` (tới D-378). Kiểm thử theo luật của repo từ 2026-10-20: test tay trước, test tự động sau.

## Context

- **Đường đi của một tin Zalo hôm nay:** `zca-js` (`listener.on("message")`) → `ZcaGateway` đổi thành `ZaloMessage` → `MessageBuffer` của tài khoản (xếp theo `msgId` dạng số, D-277) → webhook `POST /api/webhooks/zalo` → `sino-api` gọi `fetchUpdates`, tức `GET /accounts/:id/messages?after=<msgId>` → `ZaloMessageNormalizer` thành `SyncBatch` → `sync` lưu qua `ConversationStore` → SSE `conversations.changed` → web đọc lại. Khi phiên nối lại, `CatchUp` gọi `requestOldMessages` để lấp chỗ trống (D-278).
- **`zca-js` 2.2.0:**
  - `listener.on("reaction", Reaction)`; `Reaction.data` có `msgId`, `cliMsgId`, `uidFrom`, `dName`, `ts`, `content.rMsg[{gMsgID, cMsgID, msgType}]`, `content.rIcon`, `content.rType`, `content.source`; `isSelf`, `isGroup`, `threadId`. Biểu cảm của chính mình chỉ tới khi `selfListen` bật.
  - `listener.requestOldReactions(threadType, lastMsgId)` trả lời bằng `old_reactions`.
  - `api.addReaction(icon, { data: { msgId, cliMsgId }, threadId, type })`: gửi `gMsgID: parseInt(msgId)`, `cMsgID: parseInt(cliMsgId)`, `msgType: 1`; `rType` và `source` lấy theo bảng của enum `Reactions` (khoảng 50 mã như `/-heart`, `:>`, `:o`). **`Reactions.NONE` ném "Invalid reaction"** (nhánh mặc định không đặt `source`), nên gỡ phải dùng `CustomReaction { rType: -1, source: 6, icon: "" }`.
- **Sino không giữ `cliMsgId`:** `ZaloMessage` chỉ có `msgId`; bảng `message` có `external_message_id` và cột `metadata` jsonb cho "vài giá trị nhỏ connector ghi rõ" (V8).
- **Capability `REACTIONS`** có trong `ProviderCapability` từ F03 ("Reaction trên message", chưa có feature), không connector nào khai, không method nào dùng.
- **Web:** `ChatThread.tsx` vẽ bong bóng (`Bubble`, `TextBubble`); `useEventStream` đọc lại khi có `conversations.changed`; thanh thông báo (inbox-notifications) chỉ bật với `newInbound > 0`. `StickerPicker` đã có mẫu Popover (từ 768px) / sheet dưới đáy (dưới 768px).

## Goals / Non-Goals

**Goals:** trong chat Zalo (đôi và nhóm), thấy biểu cảm mọi người thả lên từng tin, gần realtime như tin nhắn; thả, đổi, gỡ biểu cảm của mình từ Sino như trên Zalo.

**Non-Goals:** xem `proposal.md`.

## Đã chốt (người dùng, 2026-10-21, hỏi trong chat)

- **Phạm vi:** hai chiều (thấy và thả), chỉ chat Zalo.
- **Bộ biểu cảm:** 6 cái nhanh như ảnh của Zalo (❤️ 😆 😮 😢 😡 👍) và nút "+" mở bảng đầy đủ những gì Zalo nhận.
- **Mode:** AUTO.
- **Đường đi của biểu cảm nhận về:** phương án **A**, chung hàng chờ với tin. Phương án bỏ: **B** hàng chờ riêng (`/accounts/:id/reactions?after=`, lặp phần con trỏ, đọc bù, webhook), giữ làm đường lui nếu RX-01 cho thấy A không được; **C** chỉ đọc khi mở chat (không realtime).
- **Canvas:** dựng theo ảnh người dùng gửi và token của canvas, vẽ vào canvas sau (RX-21). Phương án bỏ: vẽ canvas trước rồi mới dựng; không đụng canvas.
- Thiết kế 5 phần trình bày trong chat được duyệt nguyên văn ("duyệt làm đi").

## Decisions

### D-380 — Thử thật trước khi dựng (RX-01) · agent chốt
Ba điều chỉ Zalo trả lời được, nên RX-01 thử trên máy người dùng bằng code bỏ đi (một nhánh tạm, không commit vào `dev`):
1. `msgId` của một sự kiện `reaction` có nằm trong cùng dãy tăng với `msgId` của tin (lớn hơn tin mới nhất lúc đó) không, và `old_messages` có kèm biểu cảm không hay chỉ `old_reactions` mới có.
2. `addReaction` với tin không có `cliMsgId` (thử `cliMsgId` rỗng, và bằng `msgId`) có được Zalo nhận và hiện trên điện thoại không; thả lên tin ảnh hay sticker (`msgType` luôn là 1) có được không.
3. Gỡ bằng `{ rType: -1, source: 6, icon: "" }` có làm biểu cảm biến mất trên điện thoại không, và sự kiện vọng lại trông thế nào.

Kết quả ghi vào `tasks.md` và quyết định: (1) sai thì đổi sang phương án B, ghi lý do; (2) không được thì tin không có `cliMsgId` chỉ xem biểu cảm (`canReact` false); (3) không được thì bỏ nút gỡ và ghi lý do.

### D-381 — Biểu cảm là một mục của hàng chờ · agent chốt
`ZaloMessage` có thêm `cliMsgId` (mọi tin) và `reaction?: { targets: [{ msgId, cliMsgId }], icon }`. Một sự kiện biểu cảm thành **một** mục `zaloType: "reaction"`, `text: null`, `msgId` là `msgId` của chính sự kiện, `fromId`/`fromName`/`isSelf` của người thả, `sentAt` từ `ts`; `targets` giữ mọi `rMsg` của sự kiện (Zalo cho phép nhiều), và `sino-api` tách thành một `NormalizedReaction` mỗi đích. Một mục cho một sự kiện vì `MessageBuffer` khử trùng theo `msgId`. `MessageBuffer`, webhook, con trỏ `after` và `CatchUp` không đổi cách chạy; `CatchUp` gọi thêm `requestOldReactions` cạnh `requestOldMessages` nếu RX-01 cho thấy `old_messages` không kèm biểu cảm. **Không ghi biểu tượng hay tên vào log**, chỉ hình dạng.

### D-382 — `cliMsgId` nằm trong `metadata` của tin · agent chốt
`ZaloMessageNormalizer` ghi `metadata.cliMsgId` cho mọi tin có giá trị đó; không thêm cột. Tin Sino gửi lấy `cliMsgId` từ tin vọng lại của Zalo (việc nhập thay dòng của Sino, như hôm nay). Tin nhập trước change này không có `cliMsgId`; số phận của chúng theo kết quả (2) của D-380.

### D-383 — Contract: `NormalizedReaction`, `reactionSet()`, `react(...)` · agent chốt
- `NormalizedReaction(externalConversationId, externalMessageId, reactorExternalId, reactorName, boolean self, String code, Instant reactedAt)`; `code` rỗng là gỡ. Tự kiểm: ID không rỗng, `code` tối đa 64 ký tự, không ký tự điều khiển; `toString` không lộ tên người thả.
- `SyncBatch` có thêm `reactions`; constructor cũ giữ (danh sách rỗng) để mọi chỗ gọi không phải sửa.
- `MessageProvider.reactionSet()`: `List<ReactionKind(code, emoji, label, boolean quick)>`, rỗng mặc định; connector có `REACTIONS` MUST trả ít nhất một mục.
- `MessageProvider.react(context, ReactCommand)`: `ReactCommand(externalConversationId, ConversationType, externalMessageId, Map<String,String> messageMetadata, String code)` (`code` rỗng là gỡ; `messageMetadata` là `metadata` của tin, để connector tìm lại `cliMsgId`). Mặc định ném `CAPABILITY_NOT_SUPPORTED` không gọi ra ngoài. `REACTIONS` nghĩa từ nay: connector đọc được biểu cảm trên tin và thả được biểu cảm.
- **Phương án bỏ:** đổi mã Zalo sang emoji ngay ở `sino-zalo` rồi lưu emoji: bảng mã của Zalo không một-một với emoji (`COOL` và `SUNGLASSES` cùng là 😎), nên gỡ hay thả lại không biết gửi mã nào.

### D-384 — Bảng `message_reaction`, có dấu gỡ · agent chốt
Migration `V23__conversation_create_message_reaction.sql`: `message_id` (→ `message` `ON DELETE CASCADE`), `reactor_external_id`, `reactor_name` (có thể null), `is_self`, `code` (null là đã gỡ), `reacted_at`, `updated_at`; khóa chính `(message_id, reactor_external_id)`. Áp một biểu cảm: chỉ ghi khi `reacted_at` mới hơn hàng đang có (đọc bù có thể tới muộn, lộn thứ tự). Gỡ ghi `code = null` thay vì xóa hàng, để một biểu cảm cũ tới muộn không sống lại. Biểu cảm lên một tin Sino không có (cũ hơn khoảng đã đồng bộ) bị bỏ qua và đếm vào log.

### D-385 — Biểu cảm không phải tin mới · agent chốt
Áp biểu cảm không đổi `is_read`, số chưa đọc, `last_message_at` hay thứ tự cuộc trò chuyện. Batch chỉ có biểu cảm vẫn phát `conversations.changed` (với `newInbound = 0`) để web đọc lại; thanh thông báo và dấu trên tab không bật (chúng chỉ nhìn `newInbound > 0`).

### D-386 — API thả, đổi, gỡ · agent chốt
`PUT /api/conversations/{conversationId}/messages/{messageId}/reaction` với `{"code": "/-heart"}` thả hoặc đổi; `DELETE` cùng đường dẫn gỡ. Cả hai trả `200` với `{"reactions": [...]}` của tin đó. `sino-api` kiểm: tin thuộc cuộc trò chuyện của người dùng (không thì `404`), tin `canReact` (không thì `409 REACTION_NOT_SUPPORTED`), `code` có trong `reactionSet` của connector (không thì `400 REACTION_UNKNOWN`), tài khoản sẵn sàng (mã lỗi như khi gửi tin). Gọi connector **ngoài giao dịch**; thành công mới ghi hàng của người dùng (`is_self`, `reactor_external_id` là ID Zalo của tài khoản, `reacted_at` là lúc gọi). Lỗi của provider đổi như khi gửi tin; `OUTCOME_UNKNOWN` trả lỗi và không ghi gì (tin vọng lại sẽ sửa nếu Zalo đã nhận). Thả lại đúng biểu cảm đang có vẫn gọi Zalo (Zalo đếm thêm một lần; Sino vẫn một hàng).

### D-387 — Hình dạng trong phản hồi · agent chốt
- Mỗi tin trong `GET …/messages`: `reactions: [{ code, emoji, count, mine, names }]`, một mục mỗi `code` còn hiệu lực, xếp theo số người giảm dần rồi theo lần thả sớm nhất; `emoji` lấy từ `reactionSet` (mã lạ: `emoji` là chính mã); `names` là tên người thả theo thứ tự thả, chính mình là "Bạn"; và `canReact`.
- `canReact` đúng khi connector có `REACTIONS`, tài khoản sẵn sàng, tin không phải tin hệ thống, đã gửi xong (không `PENDING`/`FAILED`/chưa rõ), và (theo D-380 (2)) có `metadata.cliMsgId`.
- Chi tiết cuộc trò chuyện: `reactionSet: [{ code, emoji, label, quick }]`, rỗng với Gmail.

### D-388 — Bảng biểu cảm của Zalo nằm trong `ZaloProvider` · agent chốt
Một bảng trong connector Zalo (không ở web, không ở `sino-zalo`): mã của enum `Reactions` → emoji Unicode và nhãn tiếng Việt. 6 mục `quick`, theo thứ tự trong ảnh của Zalo: `/-heart` ❤️ "Tim", `:>` 😆 "Haha", `:o` 😮 "Ngạc nhiên", `:-((` 😢 "Buồn", `:-h` 😡 "Giận", `/-strong` 👍 "Thích". Bảng đầy đủ chỉ đưa những mã có emoji rõ nghĩa và không trùng; mã chưa chắc hình (như `/-share`, `:-dig`, `:-f`, `:-l`, `:-r`) chỉ để hiện khi nhận về. RX-20 so bảng với cách Zalo vẽ từng mã và sửa chỗ lệch.

### D-389 — `sino-zalo` thả biểu cảm thế nào · agent chốt
`POST /accounts/:accountId/reactions` với `{ threadId, threadType, msgId, cliMsgId, icon }` (`icon` rỗng là gỡ). `icon` MUST là một mã của enum `Reactions` (không thì `400`); gỡ đi bằng `CustomReaction { rType: -1, source: 6, icon: "" }` (D-380 (3)). Dùng chung `RateLimiter` của tài khoản với việc gửi tin (Zalo chặn nhịp gửi theo tài khoản), nên bấm liên tục có thể gặp `429`. Lỗi đổi như route gửi (`410` phiên hết, `422` Zalo từ chối, `429`). Không có `SentLog`: thả lại cùng biểu cảm không hại gì (D-386). Log chỉ có hình dạng, không có biểu tượng.

### D-390 — Giao diện thả biểu cảm · agent chốt
- **Từ 768px:** nút mặt cười (`SmilePlus`) hiện cạnh bong bóng khi rê chuột hoặc focus vào hàng tin (bên phải tin đến, bên trái tin của mình) và giữ hiện khi thanh đang mở. Bấm mở Popover: viên thuốc tối, 6 biểu cảm nhanh và "+". "+" đổi nội dung Popover thành lưới bảng đầy đủ (8 cột, cuộn). Bấm một biểu cảm thả nó và đóng; bấm biểu cảm đang là của mình thì gỡ.
- **Dưới 768px:** nhấn giữ bong bóng 500 ms (huỷ nếu ngón tay đi quá 10 px; chặn menu ngữ cảnh) mở cùng thanh nhanh; "+" mở sheet từ dưới như `StickerPicker`.
- **Chip:** dưới bong bóng, phía mép ngoài, một chip có tối đa 3 emoji (theo thứ tự của `reactions`) và tổng số người khi lớn hơn 1. Có biểu cảm của mình thì chip có viền màu nhấn. Bấm chip mở Popover danh sách "Tên emoji" theo từng biểu cảm.
- **Bàn phím và trợ năng:** nút có `aria-label` "Thả biểu cảm"; trong thanh, mũi tên trái/phải đi giữa các biểu cảm (`tabIndex` xoay vòng), Enter thả, Esc đóng và trả focus về nút; mỗi biểu cảm có `aria-label` là nhãn, `aria-pressed` khi là của mình; chip có `aria-label` như "3 người đã thả biểu cảm: Tim 2, Haha 1".
- Chỉ có khi `reactionSet` không rỗng; tin `canReact` false vẫn hiện chip nhưng không có nút.

### D-391 — Thả hiện ngay, lỗi trả về · agent chốt
`useReactToMessage` sửa cache tin của cuộc trò chuyện ngay khi bấm (thêm, đổi hoặc bỏ mục `mine`), gọi API, thay bằng `reactions` máy chủ trả; lỗi thì trả cache về như trước và báo lỗi ngắn (429: "Chậm lại một chút"). Mỗi tin chỉ có một yêu cầu đang chạy; bấm tiếp khi chưa xong thì yêu cầu sau thay yêu cầu trước khi nó gửi đi.

## Risks / Trade-offs

- [`msgId` của biểu cảm không cùng dãy với tin] → con trỏ có thể bỏ sót biểu cảm; RX-01 kiểm trước, sai thì đổi sang B (D-380).
- [Tin cũ không có `cliMsgId`] → có thể không thả được lên tin cũ; RX-01 kiểm, không được thì chỉ xem (D-387).
- [`msgType: 1` cố định trong `zca-js`] → thả lên ảnh hay sticker có thể bị Zalo từ chối; RX-01 kiểm, nếu cần thì gọi thẳng với `msgType` đúng như ZS-09 đã làm với `sendMessage`.
- [Zalo đếm theo lần bấm, Sino đếm theo người] → số trên chip của Sino có thể nhỏ hơn số trên Zalo; ghi trong Non-goals.
- [Bấm nhanh gặp `429` do chung nhịp với việc gửi tin] → web trả về và báo "Chậm lại một chút"; một yêu cầu mỗi tin (D-391).
- [Trùng file với `zalo-send-files` đang dở] → code chỉ bắt đầu khi người dùng chốt cách phối hợp; ghi ở `tasks.md`.
- [Delta `provider-contract`] → change này chỉ **thêm** hai requirement ("Batch sync mang biểu cảm", "Contract thả biểu cảm"), không sửa "Contract lấy cập nhật (sync)" mà `f04a-gmail-connect` và `f04b-gmail-read` còn sửa, hay "Tập capability chuẩn" / "Contract gửi tin" mà `zalo-send-images` và `zalo-send-files` sửa; `REACTIONS` đã có trong tập chuẩn.
