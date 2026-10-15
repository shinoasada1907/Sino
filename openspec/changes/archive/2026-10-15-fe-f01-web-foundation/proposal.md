## Why

Phase 0 xong backend: API account và provider chạy được, nhưng chỉ gọi được bằng curl với HTTP Basic (D-02). Phase 1 cần một web app thật gọi API thật. HTTP Basic không hợp với trình duyệt: JavaScript phải giữ mật khẩu để gửi theo mỗi request (XSS là lộ mật khẩu), mỗi `401` có `WWW-Authenticate: Basic` làm trình duyệt bật hộp thoại đăng nhập, và `EventSource` (SSE, F08) không gửi được header `Authorization`. Vì vậy Phase 1 mở bằng **D-22 — xác thực cho trình duyệt**, rồi dựng nền móng frontend (roadmap Phase 1, F01-FE) để các trang sau (Accounts — F02-FE, provider — F03-FE) chỉ việc gắn vào.

## What Changes

- **Backend — D-22 = A (người dùng chốt 2026-10-07):** đăng nhập bằng email + mật khẩu của owner, server cấp **session cookie** (`HttpOnly`, `SameSite=Lax`), bảo vệ **CSRF** kiểu SPA (`csrf.spa()` của Spring Security 7), cookie **remember-me** 30 ngày khi người dùng chọn "Giữ đăng nhập trên máy này", **khóa tạm** 15 phút sau 5 lần sai.
- API mới dưới `/api/auth`: `GET /me`, `POST /login`, `POST /logout`. Mã lỗi mới: `INVALID_CREDENTIALS` (401), `LOGIN_LOCKED` (429), `CSRF_TOKEN_INVALID` (403).
- **Bỏ HTTP Basic** (D-32) và cặp biến `SINO_API_USERNAME`/`SINO_API_PASSWORD`. Thêm `SINO_OWNER_PASSWORD` (D-33, băm BCrypt lúc khởi động) và `SINO_REMEMBER_ME_KEY` (D-34). Mọi test web hiện có chuyển từ `httpBasic(...)` sang đăng nhập bằng session.
- **Frontend — F01-FE** (`apps/sino-web`): cài React Router, TanStack Query, Tailwind CSS v4, shadcn/ui; Vitest + Testing Library + MSW cho test; design token sáng/tối lấy từ canvas "Sino UI"; API client (cùng origin, gắn `X-XSRF-TOKEN`, đọc Problem Details); trang đăng nhập theo canvas; `AppShell` có menu người dùng (đăng xuất, đổi sáng/tối); route `/login`, `/accounts` (trang trống, F02-FE làm tiếp), 404.
- **Cùng origin** (D-36): khi dev, Vite chuyển `/api` sang `localhost:8080`; không có CORS.
- CI cho frontend (`frontend-ci.yml`: lint, test, build).

## Capabilities

### New Capabilities
- `web-authentication`: đăng nhập/đăng xuất/"tôi là ai" bằng session cho trình duyệt, CSRF, remember-me, khóa tạm khi nhập sai, cấu hình mật khẩu owner.
- `web-app-foundation`: nền móng web app: gọi API cùng origin, xử lý lỗi và hết phiên, trang đăng nhập, khung app, route, theme.

### Modified Capabilities
- `api-conventions`: requirement "`/api/**` yêu cầu xác thực" đổi từ HTTP Basic + không session (D-02) sang session cookie + CSRF (D-22); `401` không còn header `WWW-Authenticate`.

## Impact

- Code backend: `apps/sino-api/src/main/java/dev/sino/common/security/**` (bỏ Basic, thêm session/CSRF/remember-me), `dev/sino/identity/**` (API auth, mật khẩu owner, khóa tạm); hầu hết test web (`SecurityConfigTests`, `GlobalExceptionHandlerTests`, `ProvidersControllerTests`, `ActuatorEndpointsTests`, `AccountsApiTests`, `AccountLifecycleEndToEndTests`...).
- Code frontend: `apps/sino-web/**` (gần như toàn bộ), `.github/workflows/frontend-ci.yml`.
- Cấu hình: `.env.example`, `application.yaml`, `application-test.yaml`; **`.env` local của người dùng phải thêm `SINO_OWNER_PASSWORD`, `SINO_REMEMBER_ME_KEY` và bỏ `SINO_API_*`**, nếu không app không khởi động.
- Không thêm dependency Maven (Spring Security đã có `csrf.spa()`, remember-me, BCrypt). Thêm dependency npm cho frontend.
- Notion (người dùng cập nhật): 02A/04A còn ghi HTTP Basic (D-02).

## Non-goals

- Đăng nhập bằng Google, "Quên mật khẩu?", đăng ký ("Bắt đầu tại đây"), nhiều người dùng, phân quyền: ngoài MVP; các nút này **ẩn** trên trang đăng nhập.
- Trang Accounts đầy đủ (F02-FE) và thẻ provider (F03-FE): hai change sau của Phase 1. Change này chỉ có `/accounts` trống.
- Inbox, conversation, gửi tin, SSE (F05+, F08). Session cookie của change này là nền để F08 dùng.
- Đa ngôn ngữ: giao diện tiếng Việt, chưa có thư viện i18n.
- Cách đóng gói khi deploy (Spring Boot phục vụ file web hay reverse proxy): F12, với ràng buộc cùng origin (D-36).
- Lưu session vào database, đổi mật khẩu qua API: không cần cho MVP một người dùng (D-33, D-34).
