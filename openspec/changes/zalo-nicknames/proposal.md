## Why

Người dùng (2026-10-27) muốn "đặt biệt danh" trong chat Zalo, và chọn: biệt danh là "tên gợi nhớ" của Zalo, đồng bộ hai chiều, chỉ cho bạn bè chat 1-1. Hôm nay Sino chỉ hiện tên Zalo của người kia (`getUserInfo`), không đặt được tên gợi nhớ; tên gợi nhớ đặt trên điện thoại cũng không về Sino.

Đây là change thứ hai trong năm change hoàn thiện chat Zalo (roadmap F09, *Hoàn thiện chat Zalo*), sau `zalo-avatars`.

## What Changes

- **`sino-zalo`:** ba lệnh mới cho tên gợi nhớ của bạn bè: đặt (`changeFriendAlias`), xóa (`removeFriendAlias`), đọc cả danh sách (`getAliasList`, lật hết các trang).
- **`sino-api`:** cột mới `conversation.nickname` (migration V24), tách khỏi `title` (tên Zalo). `PATCH /api/conversations/{id}` nhận `nickname`: gửi xuống Zalo trước, Zalo đồng ý mới lưu. Mỗi 5 phút đọc danh sách tên gợi nhớ của mỗi tài khoản Zalo và đối chiếu với các chat 1-1, kể cả khi không có tin mới. `GET /api/conversations` và chi tiết trả thêm `nickname`. Biệt danh đổi thì phát `ConversationChanged` như hôm nay.
- **Canvas:** quản lý vẽ hộp "Đặt biệt danh" (mở khi bấm tên ở đầu khung chat 1-1), người dùng duyệt trước khi giao web.
- **Web:** tên hiện là `nickname ?? title` ở hàng danh sách, đầu khung chat (desktop, đầu trang chat ở điện thoại) và mục Thành viên. Bấm tên ở đầu khung chat 1-1 mở hộp: ô nhập, Lưu, Xóa biệt danh, dòng "Tên Zalo: …".

## Capabilities

### New Capabilities
- `zalo-friend-aliases`: `sino-zalo` đặt, xóa và liệt kê tên gợi nhớ của bạn bè Zalo.
- `conversation-nicknames-api`: `sino-api` lưu biệt danh của chat 1-1, đổi qua `PATCH`, đồng bộ từ nhà cung cấp, trả qua API.
- `chat-nicknames-ui`: web hiện biệt danh và có hộp đặt biệt danh.

### Modified Capabilities
(không có)

## Impact

- **`apps/sino-zalo`:** `gateway/{ZaloGateway,ZcaGateway,FakeZaloGateway}.ts`, một file route mới (ví dụ `sessions/aliasRoutes.ts`) đăng ký trong `app.ts`, README *API so far*; test.
- **`apps/sino-api`:** migration `V24__conversation_add_nickname.sql`; `provider` (capability `NICKNAMES`, facet `Optional<Nicknames> nicknames()` trên `MessageProvider`, bản Zalo trong `provider/infrastructure/zalo`); `conversation` (`InboxItem`, `ConversationResponse`, `ConversationsController.UpdateConversationRequest`, `InboxService.change`, câu đọc và ghi trong `JdbcConversationStore`); việc định kỳ 5 phút (cạnh `sync/application/LiveSyncSchedule`); README *Endpoints available today*; test, `ModularityTests`.
- **`apps/sino-web`:** `features/inbox/{inbox.types.ts,inbox.api.ts}`, hàm tên hiển thị dùng chung, `components/` của đầu khung chat, hàng danh sách, Thành viên, hộp mới; test.
- **`design/sino-ui/project/`** và canvas trên claude.ai: frame hộp "Đặt biệt danh" (desktop, 390).
- **Hợp đồng giữa các app** chốt trước trong `design.md` (D-415, D-416), nên `sino-zalo` và `sino-api` làm song song được.
- **Chạy thật** cần tài khoản Zalo của người dùng: NK-20 làm trên máy người dùng, có người dùng.

## Non-goals

- **Biệt danh trong nhóm** (tên người gửi trong nhóm theo tên gợi nhớ): người dùng chọn chỉ chat 1-1.
- **Chat 1-1 với người không phải bạn bè:** không chặn trước; Zalo từ chối thì báo lỗi trong hộp.
- **Tìm kiếm theo biệt danh** (chưa có tìm kiếm, F11).
- **Gmail:** thư không có biệt danh.
- **Đổi tên nhóm** từ Sino.
