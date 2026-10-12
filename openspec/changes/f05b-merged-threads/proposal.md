## Why

Người dùng chạy Sino với hai tài khoản Gmail của mình (`tienct07`, `bonzed2001`) và gửi thư qua lại giữa chúng (2026-10-12): "cùng 1 kênh trò chuyện mà nó lại tạo thành các mail mới luôn có thể gom lại thành 1 được không". Việc gom thư trả lời vào chuỗi không có lỗi: trong mỗi hộp thư, mỗi chuỗi "xin chào" là một cuộc trò chuyện đủ 3 thư. Nhưng một chuỗi giữa hai tài khoản của cùng một người nằm ở **cả hai** hộp thư, Gmail cho mỗi hộp thư một mã thread riêng, và Sino lưu cuộc trò chuyện theo từng tài khoản (F05), nên Hộp thư hiện hai dòng cho một chuỗi. Điều này cũng xảy ra khi một thư gửi tới hai địa chỉ của bạn (CC cả hai, danh sách thư). Hai bản của cùng một thư có chung `Message-ID` (đã lưu ở `message.metadata.rfcMessageId`), nên Sino nhận ra được chúng là một.

Người dùng chọn gom thành một dòng ("làm A đi làm 1 dòng tính theo account email") và duyệt thiết kế ("ok duyệt", 2026-10-12).

## What Changes

- **Nhận ra một chuỗi ở nhiều tài khoản (D-180):** hai cuộc trò chuyện của cùng chủ, cùng nhà cung cấp, khác tài khoản, có ít nhất một thư chung `Message-ID` thì thuộc một **nhóm** (`conversation.thread_group_id`). Gom khi lưu thư và gom lại dữ liệu đã có.
- **Một dòng cho một nhóm (D-181, D-182, D-187):** danh sách, số đếm và bộ lọc tính theo nhóm. Dòng lấy tên, tiêu đề, xem trước từ **bản chính** (bản giữ thư mới nhất; ngang nhau thì bản của tài khoản nhận thư đó) và ghi mọi tài khoản của nhóm.
- **Mã ổn định (D-183):** mã của nhóm là mã của cuộc trò chuyện cũ nhất trong nhóm; mã của bản khác vẫn mở được và trả về mã của nhóm.
- **Mở một chuỗi gộp (D-184, D-185, D-186):** thư của mọi bản, mỗi `Message-ID` một lần; đã đọc và lưu trữ áp cho mọi bản; trả lời gửi từ tài khoản của bản chính.
- **API:** `ConversationItem` thêm `accountIds`; các đường `GET`/`PATCH /api/conversations…` giữ hình dạng, nghĩa là "theo nhóm".
- **Web:** dòng và đầu chuỗi ghi mọi tài khoản; thư của bạn ghi "Bạn · địa chỉ" khi chuỗi có nhiều tài khoản của bạn; ô trả lời ghi tài khoản gửi ở mọi cỡ màn; đường dẫn của bản khác chuyển về mã của nhóm.

## Capabilities

### New Capabilities
- `thread-merge`: một chuỗi ở nhiều tài khoản của một chủ là một cuộc trò chuyện của Hộp thư: nhận ra nhóm, dòng của nhóm, số đếm và bộ lọc, mở, đổi, xem thư và trả lời theo nhóm.
- `inbox-merged-threads` (web): dòng và đầu chuỗi ghi mọi tài khoản, thư của bạn ghi địa chỉ, ô trả lời ghi tài khoản gửi, chuyển mã của bản khác về mã của nhóm.

### Modified Capabilities
- (không có trong `openspec/specs/`: `inbox-api`, `conversation-store`, `reply` của F05, F10 chưa archive; change này thêm hành vi bằng capability mới, không sửa requirement của chúng.)

## Impact

- Backend (phiên backend): `dev/sino/conversation/**` (lưu và gom nhóm, `InboxService`, `ConversationSummaries`, `MessageHistory`, `Replies`, `ReplyService`, các controller). Migration mới (V20; V18/V19 dành cho `planner`): cột `thread_group_id`, index biểu thức trên `metadata->>'rfcMessageId'`, gom dữ liệu đã có.
- Web (phiên web): `features/inbox` (`inbox.types.ts`, `inbox.api.ts`, `format.ts`, `ConversationList`, `EmailThread`, `Composer`, `InboxPage`), dữ liệu mẫu và fixture MSW.
- Thứ tự: làm trước "Tạo thư mới" (thiết kế của nó chưa được duyệt).

## Non-goals

- Gom chuỗi giữa hai nhà cung cấp khác nhau (Gmail với Outlook): chỉ trong cùng nhà cung cấp; chat không có `Message-ID`.
- Chọn tài khoản khác để trả lời trong chuỗi gộp ("Tạo thư mới" sẽ có ô "Từ").
- Ghi trạng thái đã đọc / lưu trữ sang Gmail (D-67 giữ nguyên).
- Gom theo tiêu đề hay người tham gia khi không có thư chung.
