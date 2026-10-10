## Why

Người dùng (2026-10-10): "giờ làm giao diện gửi mail và hiển thị nội dung mail đi", chọn phạm vi **trả lời trong cuộc trò chuyện đang mở**, rồi giao toàn quyền chốt: "tự xử hết luôn đi". Hiện ô trả lời trên API bị thay bằng dòng "Trả lời từ Sino sẽ có ở bản sau" (D-72), vì Sino chỉ có quyền đọc Gmail (`gmail.readonly`) và chưa có API gửi. Change này là **F10 — Send Message** của roadmap, giới hạn ở trả lời. Phần đọc cả cuộc trò chuyện là change `f06-message-history` và phải có trước.

## What Changes

- **Quyền gửi (D-130):** kết nối Gmail xin thêm `gmail.send`, nhưng quyền này không bắt buộc. Tài khoản đã kết nối cấp thêm bằng "Kết nối lại" (luồng đã có). Mỗi account cho biết có gửi được không (capability `SEND_MESSAGES` theo quyền đã cấp).
- **Trả lời trong cuộc trò chuyện:** `POST /api/conversations/{id}/messages` gửi một thư chữ thuần qua Gmail. Thư được xếp vào đúng thread (`threadId`, `In-Reply-To`, `References`, `Re:`).
- **Không gửi trùng (D-131, D-132):** web tạo một `clientMessageId` cho mỗi thư. Gọi lại với cùng ID không bao giờ gửi lần hai. Khi Gmail không trả lời kịp và không rõ thư đã đi chưa, Sino không gửi lại mù mà đối chiếu với Gmail sau.
- **Người nhận (D-133):** trả lời người gửi thư mới nhất (theo `Reply-To` nếu có), không phải trả lời tất cả. `GET /api/conversations/{id}` cho biết thư sẽ tới ai, và Sino gửi đúng những người đó.
- **Thư gửi đi trong cuộc trò chuyện:** thư hiện ngay với "Đang gửi". Thư gửi lỗi ở lại với "Không gửi được", kèm "Gửi lại" và "Bỏ". Sự kiện `conversations.changed` (`source: user`) cập nhật Hộp thư.
- **Web (D-134):** ô trả lời hiện người nhận; dòng báo thay ô trả lời khi chưa có quyền gửi, kèm nút "Cấp quyền gửi".

## Capabilities

### New Capabilities
- `reply`: trạng thái trả lời của một cuộc trò chuyện, người nhận, API gửi, chống gửi trùng, kết quả không rõ, bỏ thư gửi lỗi, sự kiện.
- `inbox-reply` (web): ô trả lời trên API, người nhận, thư gửi đi và các trạng thái, "Gửi lại", "Bỏ", dòng báo quyền gửi.

### Modified Capabilities
- `connected-accounts`: capability của từng account theo quyền đã cấp (`SEND_MESSAGES`).

## Impact

- Code backend (phiên backend): `dev/sino/provider/infrastructure/gmail/**` (xin `gmail.send`; gửi MIME có header thread; đọc header của thư được trả lời; tìm thư theo `Message-ID`), `dev/sino/account` (capability theo scope đã cấp), `dev/sino/conversation/**` (trạng thái trả lời, người nhận, API gửi, thư gửi đi, đối chiếu kết quả không rõ, sự kiện).
- Migration: cột `client_message_id` cho `message` (unique theo cuộc trò chuyện).
- Việc người dùng làm: nếu màn đồng ý OAuth trong Google Cloud Console có khai báo danh sách scope thì thêm `gmail.send`; kết nối lại tài khoản Gmail để cấp quyền gửi.
- Web (phiên web): `features/inbox` (API gửi, `useSendMessage`, `Composer`, `ThreadNotice`, `EmailThread`).
- Thứ tự: sau `f06-message-history` (danh sách thư, người nhận lưu khi nhập).

## Non-goals

- Soạn thư mới tới địa chỉ bất kỳ, chuyển tiếp, trả lời tất cả (người dùng chọn chỉ trả lời).
- Đính kèm tệp, định dạng chữ (HTML), trích thư cũ trong thư trả lời.
- Hẹn giờ gửi ("Gửi lúc…", cần F13), chọn tài khoản gửi khác.
- Hàng đợi gửi bền qua lần tải lại trang khi mất mạng: hàng đợi chỉ nằm trong bộ nhớ của trang.
- Gửi qua provider khác Gmail.
