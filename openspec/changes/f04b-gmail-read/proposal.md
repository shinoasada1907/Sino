## Why

F04a cho Gmail thật vào Sino (kết nối, kết nối lại, thu hồi khi xóa; đã chạy với Google thật ở BE-34), nhưng Sino chưa đọc được một lá thư nào: connector Gmail còn capability `{}` và `fetchUpdates` báo `CAPABILITY_NOT_SUPPORTED`. Access token của Google sống khoảng một giờ, nên trước khi đọc thư phải có chỗ tự gia hạn token (D-15 = A' đã chốt: module `account` giữ và refresh token). Change này (**F04b**, D-37) làm phần **dùng quyền**: đọc thư Gmail qua contract của F03, chuẩn hóa thread/MIME, và tự refresh token. Roadmap đặt F04b ngay trước F05 (Unified Inbox), nơi thư đọc được sẽ được lưu và hiện ra.

## What Changes

- **Contract (SPI) — sửa nhỏ, không đổi chữ ký:** `SyncCursor.initial(Instant since)` (D-59): lần đọc đầu MAY mang mốc thời gian, `null` = toàn bộ; `SyncCursor.initial()` giữ nguyên ý nghĩa. Mã lỗi mới `ProviderErrorCode.CURSOR_EXPIRED` (D-60): cursor không còn dùng được, bên gọi đọc lại bằng cursor khởi tạo.
- **Lấy token cho module khác:** interface `dev.sino.account.ProviderAccess` (D-62) — `call(accountId, (connector, context) -> …)`: nạp credential, refresh khi sắp hết hạn, gọi connector, gặp `AUTH_EXPIRED` thì refresh một lần rồi gọi lại; Google từ chối refresh (`invalid_grant`) thì account chuyển `AUTH_EXPIRED` và phát `AccountStatusChanged`. Refresh dùng token client của Spring trong `OAuth2Clients`, ngoài transaction.
- **Connector Gmail đọc thư:** capability `READ_MESSAGES`, `THREADS`, `ATTACHMENTS`; `fetchUpdates`: lần đầu `messages.list q=after:<since>` theo trang 50 thư, sau đó theo dõi thay đổi bằng `history.list` từ `historyId` lúc bắt đầu; bỏ thư nháp, Spam, Trash.
- **Chuẩn hóa:** thread → conversation, thư → message (chiều đi/đến theo nhãn `SENT`, đã đọc theo `UNREAD`, thời điểm `internalDate`), duyệt cây MIME lấy chữ thuần, thư chỉ có HTML thì lấy chữ bằng **jsoup** (D-61), thông tin tệp đính kèm, metadata `subject` và `rfcMessageId`.
- **Lỗi Gmail:** `403` vượt hạn mức → `RATE_LIMITED`; `404` của `history.list` → `CURSOR_EXPIRED`; thư biến mất giữa chừng bị bỏ qua; lỗi giữa trang làm cả lần đọc thất bại (không trả nửa batch).
- **Dependency:** runtime `org.jsoup:jsoup`.
- **Kiểm với Gmail thật:** một test có tag `real-gmail`, không chạy trong `verify`, người dùng chạy tay với account đã kết nối; chỉ in số đếm (D-58).
- **Tài liệu:** README (chạy test Gmail thật), file kiến thức Phase 2.

## Capabilities

### New Capabilities
- `provider-access`: gọi connector cho một account với credential còn hạn; refresh token; account hết quyền thì `AUTH_EXPIRED`.
- `gmail-reading`: connector Gmail đọc thư (lần đầu theo mốc thời gian, theo dõi thay đổi), chuẩn hóa thread/message/MIME, phân loại lỗi của Gmail API.

### Modified Capabilities
- `provider-contract`: cursor khởi tạo MAY mang mốc thời gian; thêm mã lỗi `CURSOR_EXPIRED`.

## Impact

- Code backend: `dev/sino/provider/spi` (`SyncCursor`, `ProviderErrorCode`), `dev/sino/provider/infrastructure/gmail/**` (đọc thư, chuẩn hóa), `dev/sino/account` (gói gốc: `ProviderAccess`, `ProviderCall`; `application`: phần cài đặt; `infrastructure/oauth`: refresh trong `OAuth2Clients`; `infrastructure/CredentialStore`: đọc credential kèm refresh token).
- Không có migration: `account_credential` đã có cột refresh token, hạn token, scope (F02).
- Dependency runtime mới: `org.jsoup:jsoup`.
- Thứ tự archive: `f04a-gmail-connect` archive **trước** change này (hai change cùng sửa requirement *Contract lấy cập nhật (sync)* của `provider-contract`; delta ở đây viết trên bản của F04a).
- Người dùng: kết nối lại một Gmail (account cũ đã xóa ở BE-34) để chạy test Gmail thật.

## Non-goals

- Lưu thư, bảng `conversation`/`message`, API `startInitialSync` / `syncEstimate`, tiến độ nhập thư (bước "Đồng bộ" của web, D-49 bên `fe-ui-connect`): **F05** (D-57). Bước Đồng bộ của web giữ dữ liệu mẫu tới F05.
- "Dùng nhãn Gmail làm bộ lọc trong Sino": **F05** (lọc trong Hộp thư).
- Tải nội dung tệp đính kèm, lưu/hiển thị HTML của thư: **F06**.
- Đồng bộ nền theo lịch, push của Gmail (`users.watch`), phản ánh thư bị xóa ở Gmail: **F07**.
- Capability theo từng account suy từ scope (D-19): **F10** (hiện chỉ xin quyền đọc nên trùng capability của provider).
- Gửi thư, `gmail.send`: **F10**.
