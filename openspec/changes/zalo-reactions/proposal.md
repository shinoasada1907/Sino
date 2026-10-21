## Why

Trong chat Zalo, người ta thả biểu cảm (tim, haha, wow…) lên từng tin. Sino hiện không thấy những biểu cảm đó và cũng không thả được: capability `REACTIONS` khai từ F03 nhưng chưa có method nào, và `zalo-personal` để reaction ngoài phạm vi. Người dùng (2026-10-21, kèm ảnh thanh biểu cảm của Zalo): "trên sino-web chưa có cái phần thả biểu cảm emoji cho tin nhắn như thế này".

## What Changes

- **`sino-zalo`:** nghe sự kiện `reaction` của `zca-js` (và `old_reactions` khi đọc bù), đưa mỗi biểu cảm vào cùng hàng chờ với tin nhắn như một mục loại `reaction`; mỗi tin mang thêm `cliMsgId`. Route mới `POST /accounts/:accountId/reactions` thả, đổi hoặc gỡ một biểu cảm qua `addReaction`.
- **Contract provider:** `SyncBatch` mang thêm danh sách `NormalizedReaction`; `MessageProvider` có thêm `reactionSet()` (các biểu cảm connector thả được, kèm emoji và nhãn) và `react(...)` (chỉ connector có `REACTIONS`).
- **`sino-api`:** bảng mới `message_reaction` (một biểu cảm mỗi người trên một tin, có dấu gỡ để khỏi lộn thứ tự); việc nhập áp biểu cảm vào tin đã có mà không đổi số chưa đọc; `GET …/messages` trả `reactions` và `canReact` của mỗi tin, chi tiết cuộc trò chuyện trả `reactionSet`; `PUT`/`DELETE /api/conversations/{id}/messages/{messageId}/reaction` thả, đổi, gỡ biểu cảm của chính người dùng.
- **Web:** nút mặt cười cạnh bong bóng (rê chuột hoặc focus; nhấn giữ trên điện thoại) mở thanh 6 biểu cảm nhanh ❤️ 😆 😮 😢 😡 👍 và nút "+" mở bảng đầy đủ; chip dưới bong bóng hiện tối đa 3 emoji khác nhau và tổng số người, bấm vào thấy ai thả gì. Thả hiện ngay, lỗi thì trả về như cũ.

## Capabilities

### New Capabilities
- `zalo-reactions`: `sino-zalo` đưa biểu cảm của Zalo vào hàng chờ, giữ `cliMsgId` của tin, và thả/gỡ biểu cảm qua Zalo.
- `message-reactions`: `sino-api` lưu biểu cảm của tin, áp biểu cảm nhận về, và cho người dùng thả/đổi/gỡ biểu cảm qua API.
- `chat-reactions-ui`: thanh chọn biểu cảm, bảng đầy đủ và chip biểu cảm trong chat trên web.

### Modified Capabilities
- `provider-contract`: thêm hai requirement: batch sync mang được biểu cảm; contract thả biểu cảm và bộ biểu cảm của connector.

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `sessions/{SessionManager,CatchUp,MessageBuffer}.ts`, route mới trong `messages/`, README.
- **`apps/sino-api`:** `provider/spi/{SyncBatch,MessageProvider}` + kiểu mới, `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer,ZaloProvider}`, `sync` (chuyển biểu cảm cho `conversation`), `conversation` (bảng, áp, API, phản hồi), migration `V23`, `README.md`.
- **`apps/sino-web`:** `features/inbox/{inbox.types.ts,inbox.api.ts,useInbox.ts}`, `components/ChatThread.tsx`, thành phần mới cho thanh biểu cảm và chip.
- **Trùng file với `zalo-send-files`** (đang dở, thay đổi chưa commit trên `ChatThread.tsx`, `ZcaGateway.ts`, `SessionManager.ts`, `ZaloClient.java`…): code chỉ bắt đầu khi người dùng chốt cách phối hợp (ghi ở `tasks.md`).
- **Chạy thật** cần tài khoản Zalo của người dùng: RX-01 (thử) và RX-20 (nghiệm thu) làm trên máy người dùng.
- **Canvas "Sino UI":** giao diện dựng theo ảnh người dùng gửi và token của canvas; frame của biểu cảm được vẽ vào canvas sau (RX-21), theo lựa chọn của người dùng.

## Non-goals

- **Gmail:** API của Gmail không có biểu cảm cho thư.
- **Đếm theo số lần bấm như Zalo:** Sino giữ một biểu cảm mỗi người trên một tin (cái sau cùng), đếm theo người.
- **Báo khi có người thả biểu cảm:** không tăng số chưa đọc, không bật thanh thông báo, không đổi thứ tự cuộc trò chuyện.
- **Biểu cảm tự tạo của Zalo** (`CustomReaction`) khi thả từ Sino: chỉ thả các biểu cảm có sẵn; biểu cảm lạ nhận về vẫn hiện (bằng mã của nó).
