## Why

Sino gom tin nhắn về một chỗ, nhưng việc phát sinh từ tin nhắn (trả lời trước một hạn, một lịch hẹn, một thông tin cần nhớ) người dùng vẫn phải tự nhớ hoặc chép sang ứng dụng khác. Cho phép biến tin nhắn thành **task, ghi chú, lịch hẹn, nhắc nhở và thư hẹn giờ gửi ngay trong Sino** để Sino là bàn điều khiển cá nhân chứ không chỉ là hộp thư.

Đây là change **cấp sản phẩm**: ghi lại phạm vi và các quyết định đã chốt với người dùng ngày 2026-10-02 (brainstorming). Theo luật của roadmap, spec và task chi tiết của từng feature (F13–F17) được viết khi bắt đầu feature đó.

## What Changes

- **Ghi chú theo ngữ cảnh (F15)**: ghi chú chữ đơn giản, neo vào một tin nhắn, một cuộc trò chuyện hoặc một người; có trang Ghi chú để xem và tìm; viết được ghi chú độc lập (D-28).
- **Việc cần làm (F16)**: task kiểu gọn — tiêu đề, ghi chú, hạn, một nhắc nhở, lặp lại, trạng thái Cần làm/Xong, liên kết tin nhắn gốc (D-27). "Nhắc tôi trả lời thư này" tạo một task.
- **Lịch (F17)**: lịch hẹn cá nhân có lặp lại; màn Lịch hiện lịch hẹn, task có hạn và nhắc nhở.
- **Tạm ẩn cuộc trò chuyện**: hiện lại theo giờ hẹn hoặc khi có tin mới (thuộc module `conversation`).
- **Hẹn giờ gửi**: soạn bây giờ, Sino gửi vào giờ đã đặt; mở rộng F10.
- **Hạ tầng hẹn giờ (F13)**: chạy việc đúng giờ, không chạy trùng, thử lại có kiểm soát; dùng chung với đồng bộ nền F07.
- **Thông báo (F14)**: trong app và Web Push trên máy tính; push của app mobile Sino khi app có (D-26).
- **Kiến trúc**: thêm 4 business module `notes`, `planner`, `scheduler`, `notification` (D-29).
- **Roadmap**: Phase 3 thêm F13, F14; thêm Phase 4 "Kế hoạch từ tin nhắn" (F15–F17, tạm ẩn); phase "Nhiều provider và gửi tin" thành Phase 5 (kèm hẹn giờ gửi); "Search và hardening" thành Phase 6.
- **Giao diện**: thêm màn Lịch, Việc cần làm, Ghi chú, trung tâm thông báo; sửa Hộp thư, Tổng quan, sidebar (chia nhóm) và thanh điều hướng mobile. Thiết kế ở canvas "Sino UI", đợt 6.

## Capabilities

### New Capabilities
- `notes`: ghi chú theo ngữ cảnh, neo, ghim, tìm kiếm, giới hạn kích thước.
- `tasks`: task kiểu gọn, trạng thái, hạn, task lặp lại, tạo từ tin nhắn.
- `calendar`: lịch hẹn cá nhân, lặp lại, xem lịch theo khoảng thời gian gồm cả task có hạn.
- `reminders`: một nhắc nhở cho mỗi task hoặc lịch hẹn, thời điểm báo, báo trễ, nhắc lại sau.
- `scheduled-jobs`: hạ tầng chạy việc đúng giờ — không chạy trùng, hồi phục sau sự cố, thử lại, không chứa nội dung.
- `notifications`: thông báo trong app, push theo thiết bị, quyền riêng tư của nội dung push.
- `scheduled-send`: hẹn giờ gửi thư/tin, sửa và hủy trước giờ gửi, xử lý khi không gửi được.
- `conversation-snooze`: tạm ẩn và hiện lại cuộc trò chuyện.

### Modified Capabilities
- `module-boundaries`: danh sách business module dưới `dev.sino` thêm `notes`, `planner`, `scheduler`, `notification`.

## Impact

- Code (khi làm từng feature): package mới `dev.sino.notes`, `dev.sino.planner`, `dev.sino.scheduler`, `dev.sino.notification`; mở rộng `messaging` (hẹn giờ gửi) và `conversation` (tạm ẩn).
- DB: bảng mới cho ghi chú, task, lịch hẹn, nhắc nhở, quy tắc lặp, việc hẹn giờ, thông báo, thiết bị nhận push — mỗi feature một migration Flyway.
- API: nhóm endpoint mới cho ghi chú, task, lịch hẹn, xem lịch theo khoảng, thông báo, đăng ký thiết bị push; endpoint hẹn giờ gửi trong messaging.
- Phụ thuộc: thư viện Web Push (VAPID) chọn ở F14; thư viện scheduler hay tự viết theo D-30.
- Cấu hình: cặp khóa VAPID (secret, nằm trong `.env`).
- Tài liệu: `openspec/roadmap.md` cập nhật. Notion 01 (yêu cầu chức năng) và 03 (roadmap) chưa có các tính năng này — chủ sản phẩm cần bổ sung vì đây là mở rộng phạm vi MVP.

## Non-goals

- Không đồng bộ với Google Calendar hay Google Tasks; không xuất lịch ra ngoài (D-25).
- Không nhắc qua email, Zalo hay Messenger; không có app mobile và push mobile trong phạm vi này — đi cùng dự án app mobile (D-26).
- Không có quy tắc tự động kiểu "nếu… thì…" và không dùng AI đọc nội dung để gợi ý task — để sau.
- Task không có danh sách/dự án, độ ưu tiên, nhãn, việc con, phụ thuộc, Kanban (D-27; có thể nâng lên sau).
- Ghi chú không có định dạng phong phú, ảnh, thư mục (D-28).
- Lịch hẹn không mời người khác, không chia sẻ, không cộng tác; Sino vẫn một người dùng.
- Mỗi task và lịch hẹn chỉ một nhắc nhở.
- Change này không viết code; chi tiết từng feature (F13–F17, hẹn giờ gửi trong F10) viết khi bắt đầu feature.
