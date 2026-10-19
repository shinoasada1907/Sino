## Why

Change `inbox-notifications` (D-320) nêu ra mà không sửa: một số trên khung app của `sino-web` là **dữ liệu mẫu cố định**, nên nói dối ở mọi môi trường, kể cả môi trường đã deploy.

Đọc từ code (`apps/sino-web/src/app/shell/`):

- `shell.sample.ts` cho `unreadNotifications: 3`, `navCounts.accountsNeedingAction: 1`, `navCounts.registrationsNew: 1`; `useShellData.ts` trả bản mẫu đó như dữ liệu API (D-42, "UI trước").
- `AppShell.tsx` chỉ ghi đè `messagesUnread`, `inboxUnread` (thật, từ `useUnreadByKind`) và số việc (thật, từ `useTasks`). Ba số trên không ai ghi đè.
- Hậu quả người dùng thấy: chuông ở thanh trên cùng luôn có chấm và nhãn "Thông báo, 3 mới"; `Tài khoản` luôn có chấm đỏ ở dải icon và thanh dưới, cột bên nói "1 cần xử lý" dù mọi tài khoản đang tốt; `Đăng ký` luôn "1 mới".
- Trang `Thêm` của mobile còn xấu hơn: nó đọc `useShellData()` thẳng chứ không qua `AppShell`, nên dù `AppShell` có sửa thì trang đó vẫn đọc bản mẫu.
- Spec `web-app-shell` (change `fe-ui-overview`) đã ghi: "Số đếm trên điều hướng MUST lấy từ dữ liệu của app, không viết cứng". Mẫu cố định vi phạm đúng câu đó.

`/notifications` và `/registrations` chưa có backend; `GET /api/accounts` thì có.

## What Changes

Chia hai phần, vì chỉ phần một có dữ liệu thật để nối:

- **Phần 1, làm ngay (NS-01):** số tài khoản cần xử lý (`accountsNeedingAction`) tính từ danh sách tài khoản thật: tài khoản `AUTH_EXPIRED` hoặc `ERROR`, cùng hàm `needsAttention` mà màn Tài khoản đã dùng cho bộ lọc "Cần xử lý". Dùng chung query `ACCOUNTS_QUERY_KEY` nên đổi theo `account.changed`, ngắt kết nối, kết nối lại. Chưa có danh sách (đang tải, lỗi) thì là 0, không phải 1. Cả `AppShell` (cột, dải icon) và trang `Thêm` đều đọc số này (D-321…D-324).
- **Phần 2 (NS-02, NS-03), làm sau khi người dùng chốt (2026-10-19: DN-1 = A, DN-2 = A, DN-3 = làm):** chuông (`unreadNotifications`) và `registrationsNew` không có nguồn thật nào, nên bằng 0 cho đến khi có: không chấm, không nhãn, không huy hiệu (D-325, NS-02). Không dựng mô hình thông báo. `accountCount` ("3 tài khoản" ở cột bên và trang Thêm) cũng đếm từ danh sách tài khoản thật, `null` khi chưa có danh sách (D-326, NS-03). Cả hai số tài khoản giờ do `useShellData` ghép vào, nên `AppShell` và `MorePage` không còn tự ghi đè (D-327).

## Capabilities

### New Capabilities
- `web-nav-counts`: số trên điều hướng và chấm của khung app phản ánh dữ liệu thật; khi chưa biết thì không nói gì.

### Modified Capabilities
(không có: `web-app-shell` mới chỉ có trong các change chưa archive, nên yêu cầu mới nằm ở capability riêng, như `web-notifications` của `inbox-notifications`)

## Impact

- Code: `apps/sino-web/src/features/accounts/useAccounts.ts` (hook `useAccountCounts` = tổng và số cần xử lý, thay `useAccountsNeedingAction`; `useDisconnectAccount` thôi ghi vào cache của shell), `apps/sino-web/src/app/shell/{useShellData.ts (ghép số thật, `shellToday`), shell.types.ts (`accountCount: number | null`), AppShell.tsx, MorePage.tsx, Sidebar.tsx}`.
- Test: `useAccounts.test.tsx`, `useShellData.test.tsx` (mới), `AppShell.test.tsx`, `MorePage.test.tsx` (mới), `test/accountsWithStatus.ts` (mới), `test/renderApp.tsx` (`shell: null` để chạy dữ liệu khung app của chính app); ba file test cũ phải sửa vì app giờ đọc danh sách tài khoản ở mọi màn: `MobileSubPage.test.tsx`, `EventStream.test.tsx`, `LiveInbox.test.tsx` (xem `tasks.md`).
- Không đổi backend, không API mới.
- Thay đổi hành vi có thật: danh sách tài khoản giờ có một người quan sát sống ở mọi màn, nên `account.changed` và việc mở lại stream đọc lại danh sách ở mọi màn (trước đây chỉ đánh dấu cũ rồi đọc khi vào Tài khoản). Xem D-321.
