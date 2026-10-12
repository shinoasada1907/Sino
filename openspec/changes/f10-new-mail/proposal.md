## Why

Người dùng (2026-10-12): "cái hộp thư của mail thiếu 1 cái là Tạo thư mới gòi". F10 đến giờ chỉ trả lời trong cuộc trò chuyện đang mở (người dùng chọn ngày 2026-10-10, change `f10-reply`). Sino chưa soạn được thư mới tới một địa chỉ bất kỳ, canvas "Sino UI" không có nút hay màn soạn thư mới, và backend chỉ gửi được thư trả lời (`POST /api/conversations/{id}/messages`).

Người dùng chọn phạm vi A (Từ, Tới, Tiêu đề, chữ thuần), chỗ soạn A (cột phải, `/inbox/new`), cách giữ thư chưa gửi xong A (tạo cuộc trò chuyện ngay khi bấm Gửi), rồi duyệt cả thiết kế ("oke duyệt", 2026-10-12).

## What Changes

- **Nút "Thư mới" và trang `/inbox/new` (D-190, D-191):** soạn ở cột phải như mở một cuộc trò chuyện; mobile là trang toàn màn. Ô soạn có Từ, Tới (một hoặc nhiều địa chỉ), Tiêu đề (không bắt buộc), Nội dung (chữ thuần, bắt buộc), "Gửi", "Bỏ"; rời trang khi còn chữ thì hỏi trước.
- **Tài khoản gửi (D-193):** chỉ chọn được tài khoản gửi được; tài khoản chưa gửi được hiện kèm lý do; không tài khoản nào gửi được thì báo kèm "Cấp quyền gửi".
- **`POST /api/conversations` (D-192, D-195):** backend tạo cuộc trò chuyện ngay (mã ngoài tạm `sino:<clientMessageId>`), ghi thư `PENDING`, gửi một thread Gmail mới, rồi đổi sang `threadId` của Gmail. Chống gửi trùng bằng `clientMessageId` như F10.
- **Sau khi gửi (D-194):** gửi xong, Gmail từ chối hay chưa rõ đã gửi chưa thì mở cuộc trò chuyện mới (trạng thái của thư như F10); không có câu trả lời thì ở lại, giữ chữ, "Gửi lại" an toàn.
- **Thư mở đầu chưa gửi xong:** cuộc trò chuyện chưa có ô trả lời (`reply.state` = `OPENING_NOT_SENT`); "Gửi lại" đi qua đường gửi của F10; "Bỏ" thư duy nhất xóa cả cuộc trò chuyện.
- **Đối chiếu thư mới chưa rõ (D-196):** chưa có thread để dựa vào, nên tìm trong thư đã gửi theo thời điểm, người nhận, tiêu đề và chữ.

## Capabilities

### New Capabilities
- `new-mail`: API tạo cuộc trò chuyện bằng một thư mới, chống gửi trùng, lỗi và kết quả không rõ, thư mở đầu chưa gửi xong, đối chiếu.
- `inbox-new-mail` (web): nút "Thư mới", trang soạn, tài khoản gửi, kiểm tra địa chỉ, sau khi gửi, rời trang khi còn chữ.

### Modified Capabilities
- (không có trong `openspec/specs/`: `reply`, `inbox-reply` của F10 chưa archive; change này thêm trạng thái `OPENING_NOT_SENT` bằng capability mới.)

## Impact

- Backend (phiên backend): `dev/sino/conversation/**` (API, tạo cuộc trò chuyện, thư đi, đối chiếu, trạng thái trả lời), `dev/sino/provider/spi` (`SendMessageCommand` có tiêu đề, không có thread), `dev/sino/provider/infrastructure/gmail/**` (thread mới, tìm thư đã gửi không theo thread). Không cần migration mới nếu `sino:` vừa với cột `external_conversation_id` (phiên backend kiểm).
- Web (phiên web): `app/router.tsx` (route `inbox/new`), `features/inbox` (nút, trang soạn, API, hook gửi, `ThreadNotice`/ô trả lời theo `OPENING_NOT_SENT`).
- Thứ tự: độc lập với `f05b-merged-threads`; thư mới gửi tới một tài khoản khác của chính bạn được gom sau lượt đồng bộ (f05b D-180).

## Non-goals

- Cc, Bcc, tệp đính kèm, định dạng chữ, lưu nháp, chuyển tiếp, trả lời tất cả.
- Gợi ý người nhận từ danh bạ (canvas `AccountDetail` có "Danh bạ · cần thêm quyền").
- Hẹn giờ gửi (cần F13).
- Gửi qua provider khác Gmail.
