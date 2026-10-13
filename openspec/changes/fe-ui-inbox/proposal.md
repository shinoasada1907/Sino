## Why

Hộp thư là màn quan trọng nhất của Sino (canvas `Breakpoints`: "Hộp thư luôn là khối quan trọng nhất") và là phần web của Phase 2 (F05 Unified Inbox, F06 Message History: "kết nối Gmail thật → thấy Unified Inbox → mở conversation đọc lịch sử"). Theo cách làm D-42, màn được dựng trước với dữ liệu mẫu; kiểu dữ liệu của màn là hợp đồng giao backend cho `GET /api/conversations` và `GET /api/conversations/{id}/messages`.

## What Changes

- **Danh sách hợp nhất** `/inbox` theo canvas `Inbox` (desktop 3 cột), `TabletInbox` (2 cột), `MobileInbox`: cột nguồn và bộ lọc (Tất cả / từng nguồn, Lọc nhanh: Chưa đọc, Cần trả lời, Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ; tài khoản và trạng thái; "Thêm nguồn"), danh sách nhóm theo ngày ("HÔM NAY", "HÔM QUA", "TUẦN NÀY"…), mỗi dòng có nguồn, tiêu đề, xem trước, dấu việc liên quan, giờ, số chưa đọc.
- **Đọc thư email** trong cột phải (`Inbox`): đầu thư, việc liên quan (task, lịch hẹn, ghi chú), các thư cũ thu gọn (bấm để mở), thư mới nhất đầy đủ, tệp đính kèm, ô trả lời.
- **Hội thoại chat** là trang riêng `/inbox/:id` theo `Conversation` (bong bóng tin, ngày, tin hệ thống, vạch "N tin chưa đọc", trạng thái gửi; cột thông tin: việc và ghi chú, thành viên, ảnh và tệp, tài khoản dùng) và `MobileConversation`.
- **Tương tác trên dữ liệu mẫu** (như D-45): lọc theo nguồn và bộ lọc nhanh (giữ trong URL), mở hội thoại thì đánh dấu đã đọc (số chưa đọc ở danh sách và điều hướng giảm theo), gửi tin / trả lời thư (tin hiện "Đang gửi" rồi "Đã gửi").
- **Trạng thái** theo `InboxState` và `ThreadState`: đang tải, chưa có nguồn, đồng bộ lần đầu, lỗi tải, ngoại tuyến; hội thoại của tài khoản mất quyền.
- **Hợp đồng dữ liệu** `InboxData`, `ConversationDetail` cùng bảng đối chiếu với API trong `design.md`.

## Capabilities

### New Capabilities
- `inbox-screen`: danh sách hợp nhất, đọc thư và hội thoại, lọc, đánh dấu đã đọc, gửi trên dữ liệu mẫu, các trạng thái.

### Modified Capabilities
- Không có.

## Impact

- Code: `apps/sino-web/src/features/inbox/**`, `src/app/router.tsx`, có thể `src/shared/**` (phần dùng chung với màn Tổng quan và Tài khoản), `src/features/accounts/AccountsPage.tsx` ("Thêm nguồn" mở luồng kết nối).
- Không đổi backend, không gọi API.

## Non-goals

- Thao tác trên thư (nhắc tôi trả lời, tạm ẩn tới…, gửi lúc…, tạo task, lịch hẹn, ghi chú từ thư; bảng thao tác khi giữ một tin trên mobile): change sau, theo Phase 4–5 (F15–F17, tạm ẩn, hẹn giờ gửi). Các nút hiện như canvas nhưng chưa làm gì (D-52).
- Tìm kiếm (`SearchEmpty`, F11), "Mở trong Gmail/Zalo", đính kèm tệp khi soạn, tắt thông báo, "Hiện trong Tổng quan": hiện như canvas, chưa làm gì.
- Nội dung thư dạng HTML: F06 chốt; ở đây chỉ chữ thuần (D-53).
- Cuộn vô tận và tải tin cũ hơn: hợp đồng có chỗ cho con trỏ trang, dữ liệu mẫu vừa một trang.
- Nghiệm thu và archive: để sau như các màn trước.
