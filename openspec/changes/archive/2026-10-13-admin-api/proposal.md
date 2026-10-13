## Why

Người dùng muốn sau này có một trang admin "để quản lý Sino và quản lý cả nội dung landing page" (2026-10-13). Trong buổi bàn sáng 2026-10-13 người dùng chốt hướng: admin là **module `admin` trong `sino-api`** (`/api/admin/**`, role riêng, security chain riêng), không dựng backend thứ hai; khi có thêm sản phẩm (Sino Đại Quản Gia, Sino Vehicle) thì mới tách phần nền tảng dùng chung. Ba câu còn mở (admin là ai, làm gì trước, giao diện ở đâu) người dùng giao cho agent: "xây BE cho admin", "xây đi không cần hỏi".

Hiện Sino chỉ có một người dùng (owner từ cấu hình, role `OWNER`) và mọi principal đã đăng nhập đều được coi là owner (`OwnerCurrentUser`). Chưa có cách nào để một người vận hành xem tình trạng hệ thống mà không đăng nhập bằng chính tài khoản đọc thư.

## What Changes

- **Tài khoản quản trị riêng** từ cấu hình `sino.admin.email` / `sino.admin.password` (`SINO_ADMIN_EMAIL`, `SINO_ADMIN_PASSWORD`), role `ADMIN`, không phải một `app_user` (D-260). Tùy chọn: không đặt email thì không có admin, app chạy như cũ; đặt sai (mật khẩu dưới 12 ký tự, trùng email owner, có mật khẩu mà không có email) thì dừng khởi động (D-261).
- **Đăng nhập:** cùng `POST /api/auth/login`, cùng khóa tạm khi đoán sai (D-35); admin không bao giờ nhận cookie "ghi nhớ đăng nhập"; `GET /api/auth/me` với phiên admin trả `401`; admin hỏi "tôi là ai" qua `GET /api/admin/me` (D-262).
- **Tách quyền ở security chain:** `/api/admin/**` chỉ cho `ADMIN`; mọi `/api/**` khác cho người đã đăng nhập **không phải** `ADMIN`. Admin không đọc được thư, tài khoản, ghi chú, việc của owner qua API của owner; owner không gọi được API admin (D-263).
- **Module mới `admin`**, chỉ đọc, chỉ metadata (D-264):
  - `GET /api/admin/overview`: số người dùng, số tài khoản theo trạng thái, số tài khoản đang có lỗi đồng bộ, tổng số thư đã lưu.
  - `GET /api/admin/users`: mọi người dùng Sino với số tài khoản đang kết nối.
  - `GET /api/admin/accounts`: mọi tài khoản đang kết nối (không tính đã gỡ) của mọi người dùng, kèm tình trạng nhập thư / đồng bộ / thông báo đẩy và số thư đã lưu.
  - Không trả nội dung thư, tiêu đề, người gửi, ghi chú, việc, token.
- **Public API mới cho module `admin` đọc** (D-265): `identity.UserDirectory`, `account.AccountRoster`, `sync.SyncStatuses`; dùng lại `conversation.ConversationStats`.

## Capabilities

### New Capabilities
- `admin-api`: tài khoản quản trị, đăng nhập và tách quyền với owner, API chỉ đọc `/api/admin/**` (tổng quan, người dùng, tài khoản kết nối), quy tắc không lộ nội dung.

### Modified Capabilities
- `module-boundaries`: thêm requirement cho module `admin` (chỉ đọc qua public API, không module nào phụ thuộc nó). Viết dạng ADDED để không đụng requirement "Business module là package con trực tiếp…" mà `f15-notes` và `f16-f17-tasks-calendar` đang sửa.

## Impact

- Code backend: package mới `dev/sino/admin/**` (`api`, `application`); `identity` (cấu hình admin, `UserDetailsService`, "ghi nhớ đăng nhập" chỉ cho owner, `UserDirectory`); `account` (`AccountRoster`, một query); `sync` (`SyncStatuses`); `common/security/SecurityConfig` (quy tắc theo role).
- Không migration. Không đổi API của owner: owner vẫn gọi mọi thứ như trước; người gọi có role `ADMIN` mới bị chặn khỏi API của owner.
- Cấu hình: `application.yaml` (`sino.admin.*`), `application-test.yaml` (admin giả cho test), `.env.example`.
- Tài liệu: `apps/sino-api/README.md` (mục admin), mục admin trong `docs/knowledge/phase-0-backend-foundation.md` + `.docx`, ghi chú trong `openspec/roadmap.md`.

## Non-goals

- **Giao diện admin.** Người dùng định làm một project web riêng sau (2026-10-13). Change này chỉ có API JSON; điều kiện về cookie và CSRF khi web admin ở origin khác ghi ở `design.md` (D-266).
- **Quản lý nội dung landing page** (`apps/sino-site`): site đang dựng, chữ nằm trong code, Privacy / Terms phải giữ URL và lịch sử phiên bản; quyết khi site đã lên mạng, ưu tiên xem headless CMS (D-266).
- **Thao tác ghi:** khóa / mở người dùng, đồng bộ hộ, gỡ tài khoản hộ, xóa dữ liệu theo yêu cầu. Chỉ có nghĩa khi Sino cho người khác đăng ký (nhiều người dùng, qua thẩm định Google) (D-264).
- **Gửi lại sự kiện lỗi của Spring Modulith:** mọi listener của Sino là `@EventListener` đồng bộ, bảng `event_publication` không được dùng (D-264).
- Admin lưu trong database, nhiều admin, phân quyền chi tiết, 2FA, nhật ký thao tác admin, giới hạn IP: khi có thao tác ghi hoặc nhiều người vận hành.
- Đăng nhập chung (SSO) cho nhiều sản phẩm: khi có sản phẩm thứ hai (hướng đã bàn 2026-10-13).
