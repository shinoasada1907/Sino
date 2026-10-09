## Why

F04b cho Sino đọc được thư Gmail thật qua contract F03 (đã chạy với hộp thư thật và refresh token thật ở BE-39), nhưng chưa lưu lá thư nào: Hộp thư trên web vẫn là dữ liệu mẫu, bước "Đồng bộ" của luồng kết nối chưa làm gì. Change này (**F05 — Unified Inbox**) lưu thư vào database, cho người dùng chọn khoảng nhập lần đầu (30/90 ngày/toàn bộ) và theo dõi tiến độ, và mở API Hộp thư để web thay dữ liệu mẫu bằng dữ liệu thật. Đây là bước thứ hai của mốc M1 (Phase 2): kết nối Gmail thật → thấy Hộp thư → mở đọc thread (F06).

## What Changes

- **Lưu cả thư ở F05 (D-63):** module mới `conversation` với bảng `conversation`, `conversation_participant`, `message`, `attachment` (theo 02B, migration V6–V9). Lưu một trang thư là upsert idempotent theo external ID; các cột tổng hợp (thư mới nhất, đoạn xem trước, số chưa đọc, có tệp, cần trả lời) luôn tính lại từ bảng `message`. Bảng `message` chuyển từ F06 sang F05; F06 còn lại API và màn đọc lịch sử một thread.
- **Nhập lần đầu do người dùng bắt đầu, chạy nền (D-64):** module mới `sync` với bảng `sync_checkpoint` (V10). `POST /api/accounts/{id}/initial-sync` với khoảng đã chọn; backend đọc từng trang qua `ProviderAccess` và `fetchUpdates`, lưu thư, ghi cursor và tiến độ trong cùng một transaction; `GET` trả tiến độ; khởi động lại thì nhập tiếp từ cursor đã lưu.
- **Ước lượng số thư (D-65):** contract thêm hàm tùy chọn `MessageProvider.estimateMessages(context, since)` (mặc định rỗng); Gmail trả `resultSizeEstimate` (có mốc) hoặc `messagesTotal` (toàn bộ). API `GET /api/accounts/{id}/initial-sync/estimate`.
- **Xóa account (D-66):** thư đã lưu được giữ lại nhưng ẩn khỏi Hộp thư; kết nối lại đúng tài khoản thì hiện lại.
- **Đã đọc và Lưu trữ chỉ trong Sino (D-67):** `PATCH /api/conversations/{id}` đổi trạng thái của Sino, không ghi sang Gmail (quyền chỉ đọc); Sino chỉ làm theo Gmail khi trạng thái đọc bên Gmail thật sự đổi; thư đến mới đưa conversation khỏi lưu trữ.
- **Cần trả lời (D-68):** thư cuối là thư đến và không phải thư hàng loạt. Contract thêm khóa metadata dùng chung `bulk`; connector Gmail đánh dấu thư có nhãn `CATEGORY_PROMOTIONS`/`SOCIAL`/`UPDATES`/`FORUMS` hoặc header `List-Unsubscribe`.
- **API Hộp thư:** `GET /api/conversations` (view `all`/`unread`/`reply`/`attachments`/`archived`, lọc provider/account, phân trang keyset), `GET /api/conversations/counts`, `GET /api/conversations/{id}`, `PATCH /api/conversations/{id}`.
- **Module `account`:** interface công khai mới `AccountDirectory` (account của owner chưa xóa, kèm provider và trạng thái) cho `conversation` và `sync`.
- **Kiểm với Gmail thật:** test gắn tag `real-gmail` nhập 30 ngày của hộp thư đã kết nối vào database local, đo tốc độ để chỉnh ước lượng số phút; chỉ in số đếm.

## Capabilities

### New Capabilities
- `conversation-store`: lưu conversation, người tham gia, thư, thông tin tệp idempotent; tính lại các cột tổng hợp; quy tắc đã đọc, lưu trữ, cần trả lời.
- `inbox-api`: danh sách conversation (lọc, phân trang keyset), số đếm, xem một conversation, đánh dấu đã đọc/chưa đọc và lưu trữ.
- `initial-sync`: ước lượng, bắt đầu, chạy nền và theo dõi lần nhập đầu của một account; xử lý lỗi; nhập tiếp sau khi khởi động lại.

### Modified Capabilities
- `provider-contract`: hàm ước lượng số thư tùy chọn; khóa metadata dùng chung `bulk`.
- `gmail-reading` (capability của `f04b-gmail-read`): Gmail ước lượng số thư; đánh dấu thư hàng loạt.
- `connected-accounts`: module khác đọc danh sách account qua `AccountDirectory`.

## Impact

- Code backend: module mới `dev/sino/conversation/**` và `dev/sino/sync/**`; `dev/sino/account` (gói gốc: `AccountDirectory`, `AccountSummary`; phần cài đặt trong `application`); `dev/sino/provider/spi/MessageProvider` (`estimateMessages`); `dev/sino/provider/infrastructure/gmail/**` (ước lượng, `bulk`).
- Migration: V6 `conversation`, V7 `conversation_participant`, V8 `message`, V9 `attachment`, V10 `sync_checkpoint`.
- Web (phiên web, không sửa trong phiên backend): Hộp thư chuyển sang API thật; bước "Đồng bộ" gọi ước lượng/bắt đầu/tiến độ; trang Tài khoản lấy `syncProgress`, `storedMessages`.
- Thứ tự archive: sau `f04b-gmail-read` (cùng sửa `provider-contract`, và `gmail-reading` chỉ có trong `openspec/specs/` sau khi F04b archive), mà F04b archive sau `f04a-gmail-connect`.
- Lệch roadmap: bảng `message`/`attachment` và việc lưu thư làm ở F05 thay vì F06 (D-63); F06 thu lại còn API và màn đọc lịch sử.

## Non-goals

- API và màn đọc lịch sử một thread (`GET /api/conversations/{id}/messages`), lưu/hiển thị HTML, tải nội dung tệp: **F06**.
- Đồng bộ nền định kỳ, nút "Đồng bộ ngay", `sync_run`, khóa theo account khi chạy nhiều tiến trình, backoff đầy đủ: **F07**. Sau lần nhập đầu, Hộp thư chưa tự cập nhật cho tới F07.
- Realtime (SSE), event cho conversation/message: **F08**.
- Tạm ẩn, hẹn giờ gửi, liên kết task/lịch hẹn: các tính năng sau (API trả `null`/rỗng cho các trường đó).
- "Dùng nhãn Gmail làm bộ lọc" và "Chỉ tải tệp đính kèm khi bạn mở" ở bước "Đồng bộ" của canvas: F05 không lưu nhãn Gmail và không tải nội dung tệp; hai lựa chọn này chưa có tác dụng (xem design, Open Questions).
- Gắn sao (`starred` của 02B): canvas và web không có.
- Xóa hẳn thư đã lưu của account đã xóa: màn Quyền riêng tư sau này (D-66).
- Ghi trạng thái đã đọc/lưu trữ ngược sang Gmail (`gmail.modify`): không làm (D-67).
