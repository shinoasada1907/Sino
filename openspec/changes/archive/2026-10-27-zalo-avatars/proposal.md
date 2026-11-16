## Why

Người dùng (2026-10-27): "lấy avatar của đối phương nhé hiện tại avatar đang mặc định nó hơi ấy". Trong chat Zalo, mọi ảnh đại diện trên web đều là vòng tròn màu thay thế, dù Zalo đã gửi ảnh: `sino-zalo` lấy ảnh của cuộc trò chuyện (`getUserInfo` với chat 1-1, `getGroupInfo` với nhóm) và `sino-api` lưu vào `conversation.avatar_url`. Ảnh bị rơi ở hai chỗ: API không trả ảnh của cuộc trò chuyện, và `Avatar` của web chưa từng vẽ ảnh. Ảnh của từng người gửi trong nhóm thì chưa ai lấy.

Đây là change đầu trong năm change hoàn thiện chat Zalo (roadmap F09, *Hoàn thiện chat Zalo*), chọn làm trước vì nhỏ và ai cũng thấy ngay.

## What Changes

- **`sino-zalo`:** mỗi người trong `participants` của một cuộc trò chuyện mang thêm `avatarUrl`. Chat 1-1 lấy từ thông tin cuộc trò chuyện đã có. Nhóm thì gọi `getUserInfo` một lần cho những người gửi chưa biết ảnh trong trang tin, nhớ 24 giờ mỗi người. Lỗi hay quá giờ thì `null`, tin vẫn đi.
- **`sino-api`:** nhận và lưu ảnh của người tham gia (cột `conversation_participant.avatar_url` đã có, không cần migration). `GET /api/conversations` và `GET /api/conversations/{id}` trả thêm `avatarUrl` của cuộc trò chuyện.
- **Web:** `Avatar` vẽ ảnh thật, phủ kín vòng tròn của canvas; vòng màu thay thế hiện khi chưa có ảnh, đang tải hay tải lỗi. Ảnh hiện ở đầu khung chat, cạnh tin của người khác trong nhóm, và mục Thành viên; hàng danh sách giữ ô nhà cung cấp như canvas (DN-2 = A).

## Capabilities

### New Capabilities
- `zalo-participant-avatars`: `sino-zalo` đưa ảnh đại diện của người tham gia cho `sino-api`.
- `conversation-avatars-api`: `sino-api` lưu ảnh của người tham gia và trả ảnh của cuộc trò chuyện qua API.
- `chat-avatars-ui`: web vẽ ảnh đại diện thật, có vòng thay thế.

### Modified Capabilities
(không có)

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, `sessions/Conversations.ts`, README (hình dạng `participants`); test.
- **`apps/sino-api`:** `provider/infrastructure/zalo/{ZaloClient,ZaloMessageNormalizer}.java`, `conversation/application/InboxItem.java` và câu đọc danh sách trong `JdbcConversationStore`, `conversation/api/ConversationResponse.java`, README *Endpoints available today*; test. Không có migration.
- **`apps/sino-web`:** `shared/ui/avatar.tsx`, `features/inbox/{inbox.types.ts,inbox.api.ts}`, `components/{ConversationAvatars,ChatThread,ConversationInfo}.tsx`; test.
- **Hợp đồng giữa các app** chốt trước trong `design.md` (D-410, D-411), nên ba kỹ sư làm song song được.
- **Canvas:** không thêm frame mới; vòng `.avatar` giữ nguyên, chỉ thay nền bằng ảnh. Riêng ảnh nhóm tùy DN-1.
- **Chạy thật** cần tài khoản Zalo của người dùng: lượt nghiệm thu (AV-20) làm trên máy người dùng, có người dùng.

## Non-goals

- **Gmail:** thư không có ảnh đại diện; giữ vòng thay thế.
- **Ảnh của chính mình** cạnh tin mình gửi: canvas không vẽ ảnh ở bong bóng của mình.
- **Đổi ảnh đại diện** (của mình hay của nhóm) từ Sino.
- **Lưu ảnh trong Sino** (tải về, cache phía server): ảnh tải thẳng từ Zalo (D-408).
- **Danh sách đủ thành viên của nhóm:** change này chỉ lấy ảnh của người đã gửi tin; danh sách đủ đến ở `zalo-mentions`.
