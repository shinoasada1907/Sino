## Why

Người dùng (2026-10-19), nói về màn Tin nhắn (Zalo): "tạo thêm thanh thông báo cũng như dấu chấm hoặc số trên tab sino trên nền web để user nhìn vào thấy có thông báo", rồi "AUTO đi" cho phần tính năng này.

Hiện nay có tin mới mà người dùng không đang nhìn vào danh sách thì không thấy gì cả:

- Tiêu đề và biểu tượng của tab luôn là "Sino" (`index.html`); không có chỗ nào đặt `document.title` trong app đã đăng nhập. Đang ở tab khác thì không biết có tin.
- Dải "N tin mới" (D-92) chỉ hiện 6 giây, chỉ trong danh sách của màn đó và chỉ cho tài khoản của màn đó: đang ở Tổng quan, Việc cần làm hay Lịch thì tin mới chỉ làm đổi một con số nhỏ trên thanh điều hướng.
- Chấm trên chuông ở thanh trên cùng đọc `shell.unreadNotifications`, là dữ liệu mẫu cố định bằng 3 (`shell.sample.ts`): chuông luôn có chấm. Change này **không** sửa chuông (xem Non-goals ở design), chỉ nêu ra.

## What Changes

- **Dấu trên tab (D-317):** khi có tin chưa đọc (Tin nhắn + Hộp thư cộng lại), tiêu đề tab thành `(N) Sino` (`(99+) Sino` từ 100), biểu tượng tab đổi sang bản có chấm. Hết tin chưa đọc thì về như cũ. Ra khỏi app (đăng xuất) thì trả lại tiêu đề và biểu tượng ban đầu.
- **Thanh thông báo tin mới (D-318):** một thanh dưới thanh trên cùng, trên mọi màn của app đã đăng nhập, hiện "N tin mới" / "N thư mới" khi nền đồng bộ mang tin về mà người dùng không đang xem danh sách của loại đó. Bấm "Xem" đi tới màn đó; có nút đóng; tự tắt khi người dùng vào màn đó.
- **Dùng lại, không thêm API (D-319):** số chưa đọc đã có (`useUnreadByKind`), sự kiện `conversations.changed` đã có; thanh dùng `source`, `newInbound` và `accountId` của sự kiện, đổi `accountId` ra loại (Tin nhắn / Hộp thư) từ frame đã có trong cache.

## Capabilities

### New Capabilities
- `web-notifications`: người dùng nhìn thấy tin mới ngoài danh sách: ở tab trình duyệt và ở một thanh trong app.

### Modified Capabilities
(không có)

## Impact

- Code: `apps/sino-web/src/app/shell/{AppShell.tsx (thêm một hàng lưới), NoticeBar.tsx (mới), useTabUnread.ts (mới), useArrivalNotices.ts (mới)}`, `apps/sino-web/public/favicon-unread.svg` (mới), test cạnh từng file.
- Không đổi backend, không API mới, không đổi hợp đồng `realtime-events`.
- `index.html` không đổi: tiêu đề và biểu tượng gốc vẫn là "Sino" và `favicon.svg`.
