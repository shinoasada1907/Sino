## Why

F05 nhập được thư Gmail thật vào Sino (người dùng đã nhập qua web, 2026-10-10), nhưng sau lần nhập đầu Hộp thư đứng yên: thư mới tới Gmail chỉ vào Sino khi người dùng bấm nhập lại cả khoảng. Người dùng muốn thư mới **tự hiện** trong Hộp thư khi đang mở Sino, kèm một dòng báo nhỏ (2026-10-10: "khi có mail tới là ở hộp thư sẽ phải hiển thị"). Change này gộp **F07 — đồng bộ nền** và **F08 — đẩy sự kiện lên trình duyệt** của roadmap; người dùng bảo bỏ kế hoạch cũ nếu không còn hợp ("bỏ qua cái kế hoạch đi cái đó hơi cũ rồi").

## What Changes

- **Gmail báo cho Sino khi có thay đổi (D-76):** sau lần nhập đầu, Sino đăng ký `users.watch` cho hộp thư; Gmail đẩy thông báo vào một topic Google Cloud Pub/Sub, Pub/Sub POST tới webhook `POST /api/webhooks/gmail`. Webhook chỉ nhận request có token OIDC do Google ký đúng `audience` và đúng tài khoản dịch vụ đã cấu hình; Sino không giữ khóa nào của Google Cloud. Thông báo chỉ là tín hiệu "hộp thư X có thay đổi": Sino tự đọc thay đổi bằng quyền của mình. Watch được gia hạn trước khi hết hạn (7 ngày).
- **Đồng bộ tăng dần (D-79):** module `sync` đọc thay đổi từ con trỏ `historyId` mà lần nhập đầu để lại, dùng chung vòng đọc trang, bảng xử lý lỗi và cách giữ một lượt mỗi account của lần nhập đầu. Bốn cò cùng gọi một việc: webhook, hỏi dự phòng định kỳ (60 giây khi account chưa có watch, 5 phút khi watch đang chạy), nút "Đồng bộ ngay" (`POST /api/accounts/{id}/sync`) và lúc ứng dụng khởi động. `GET /api/accounts/{id}/sync` cho biết lần đồng bộ cuối, lỗi gần nhất và watch.
- **Realtime bằng SSE (D-77):** module mới `realtime`, `GET /api/events/stream` cho người dùng đã đăng nhập. Sau khi lưu thư (nhập đầu, đồng bộ) hoặc người dùng đổi đã đọc/lưu trữ, server đẩy `conversations.changed`; khi trạng thái account, tiến độ nhập hay lỗi đồng bộ đổi, đẩy `account.changed`. Envelope chỉ có ID và con số, không có nội dung thư; web nhận rồi tự gọi lại API.
- **Thư mới chỉ hiện trong Sino (D-78):** danh sách Hộp thư, số chưa đọc, cuộc trò chuyện đang mở tự cập nhật và có dòng báo "N thư mới" khi thư đến từ đồng bộ. Không có thông báo của hệ điều hành hay Web Push.
- **Module `account`:** `AccountDirectory` cho module khác tìm account theo ID (để biết owner và có đang bật đồng bộ tự động không).
- **Contract provider:** hàm tùy chọn để connector đăng ký nhận báo thay đổi (`PUSH_WEBHOOK`); Gmail cài bằng `users.watch`.

## Capabilities

### New Capabilities
- `live-sync`: đồng bộ tăng dần sau lần nhập đầu; các cò (webhook, hỏi định kỳ, "Đồng bộ ngay", khởi động); account nào được đồng bộ; xử lý lỗi; API trạng thái.
- `gmail-push`: đăng ký và gia hạn watch của Gmail; webhook Pub/Sub và cách kiểm token; từ thông báo tới account.
- `realtime-events`: luồng SSE, loại sự kiện, envelope, kết nối lại, giới hạn.

### Modified Capabilities
- `provider-contract`: hàm tùy chọn đăng ký nhận báo thay đổi.
- `connected-accounts`: tìm account theo ID cho module khác.

## Impact

- Code backend: `dev/sino/sync/**` (đồng bộ tăng dần, lịch, watch, API `sync`), module mới `dev/sino/realtime/**`, `dev/sino/conversation` (kết quả lưu có ID conversation và số thư đến mới; event khi người dùng đổi conversation), `dev/sino/account` (`AccountDirectory.byId`, `AccountSummary` thêm owner và `syncEnabled`), `dev/sino/provider/spi` (đăng ký nhận báo), `dev/sino/provider/infrastructure/gmail/**` (watch, webhook), `dev/sino/common/security/SecurityConfig` (webhook công khai, không CSRF; dispatch async cho SSE).
- Migration: V12 thêm cột vào `sync_checkpoint` (lần đồng bộ cuối, lỗi, watch).
- Cấu hình mới: topic Pub/Sub, `audience` và tài khoản dịch vụ của push subscription (`.env`); khoảng hỏi định kỳ.
- Việc người dùng làm trong Google Cloud Console và trên máy: bật Pub/Sub, tạo topic, cấp quyền cho Gmail, tạo push subscription; chạy ngrok với domain cố định, chỉ cho đi qua đúng đường dẫn webhook. README có hướng dẫn.
- Web (phiên web, không sửa trong phiên backend): một `EventSource` cho cả app, đọc lại dữ liệu theo sự kiện, dòng báo "N thư mới", "Đồng bộ ngay" gọi `POST …/sync`.
- Thứ tự archive: sau `f05-unified-inbox` (dùng `sync_checkpoint`, `initial-sync`, `AccountDirectory` của F05).

## Non-goals

- Thông báo của hệ điều hành (Notification API), Web Push, trung tâm thông báo: F14 (D-78).
- Đọc cả cuộc trò chuyện (`GET /api/conversations/{id}/messages`): F06.
- Telegram và provider khác; webhook của chúng sẽ dùng cùng cò đồng bộ.
- Bảng lịch sử từng lần đồng bộ (`sync_run`), chạy nhiều tiến trình backend (lease/khóa phân tán).
- Phát lại sự kiện bị lỡ theo `Last-Event-ID`: web đọc lại dữ liệu mỗi lần nối lại.
- Đổi trạng thái sức khỏe của account (`DEGRADED`, `ERROR`) theo lỗi đồng bộ: lỗi được ghi ở trạng thái đồng bộ của account; trạng thái account vẫn chỉ đổi như F02/F04b (`AUTH_EXPIRED`).
