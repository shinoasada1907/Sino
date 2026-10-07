# Phase 1 · Change 1 — Xác thực cho trình duyệt (D-22) + nền móng web (F01-FE) · Implementation Plan

> **HYBRID mode:** backend và frontend AUTO — Claude làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận ("để tôi làm FE-xx") thì chạy TRAINING: người dùng code theo **Hướng làm** (Level 2) và **Gợi ý** (Level 1), Claude review/test.
> Thiết kế được người dùng duyệt từng phần 2026-10-07 (D-22 = A, D-32…D-36 Accepted). **Chờ `APPROVED TO IMPLEMENT`** sau khi người dùng đọc lại hồ sơ này.
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược, một commit trên `dev` (không push), cập nhật `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`. Backend: `./mvnw -B -ntp verify` xanh trước khi commit. Frontend: `pnpm lint && pnpm test && pnpm build` xanh trước khi commit.

## 1. Backend — đăng nhập bằng session (D-22)

- [ ] 1.1 **BE-27 — Mật khẩu owner và khóa ghi nhớ trong cấu hình**
  - **Goal / Why:** có danh tính đăng nhập (email owner + mật khẩu) và khóa ký cookie ghi nhớ; thiếu hay sai thì app không khởi động (D-33, D-34).
  - **Depends on:** — (dùng `OwnerProperties` của BE-09).
  - **Files:** `identity/application/OwnerProperties` (thêm `password`) hoặc properties riêng cho xác thực; bean `UserDetailsService` + `PasswordEncoder` (BCrypt) trong `identity`; `application.yaml` (`SINO_OWNER_PASSWORD`, `SINO_REMEMBER_ME_KEY`, `SINO_SESSION_COOKIE_SECURE`), `application-test.yaml` (giá trị giả), `.env.example`, README (bảng biến).
  - **Hướng làm:** mật khẩu được băm một lần lúc khởi động, `UserDetailsService` chỉ giữ bản băm; kiểm độ dài bằng tay với thông báo chỉ nêu tên cấu hình (không dùng `@Size`, xem D-33). `toString()` của properties che mật khẩu và khóa.
  - **Test:** `ApplicationContextRunner`: thiếu mật khẩu / mật khẩu 11 ký tự / thiếu khóa / khóa 31 ký tự → không start, stack trace không chứa giá trị; đủ → start, `UserDetailsService` tìm được owner theo email (chữ hoa, có khoảng trắng vẫn tìm được) và mật khẩu khớp bằng `PasswordEncoder`.
  - **Acceptance criteria:** requirement *Cấu hình mật khẩu owner và khóa ghi nhớ* (spec `web-authentication`).
  - **Hints:** Level 1 — "vì sao không băm mật khẩu mỗi lần đăng nhập mà băm một lần lúc khởi động?"; `PasswordEncoderFactories`, `{bcrypt}`.

- [ ] 1.2 **BE-28 — API `/api/auth/*`, session, CSRF, remember-me; bỏ HTTP Basic**
  - **Goal / Why:** trình duyệt đăng nhập/đăng xuất/hỏi "tôi là ai" bằng session; mọi request thay đổi dữ liệu có CSRF; không còn hộp thoại Basic (D-22, D-32, D-34).
  - **Depends on:** BE-27.
  - **Files:** `common/security/SecurityConfig` (bỏ `httpBasic`, session `IF_REQUIRED`, `csrf.spa()`, `rememberMe`, `permitAll` cho `GET /api/auth/me` và `POST /api/auth/login`, entry point `401` không có `WWW-Authenticate`), `common/security/ApiUserProperties` (xóa), `common/security/SecurityProblemHandler` (mã `CSRF_TOKEN_INVALID`), `identity/api/AuthController` + DTO, `application.yaml` (cookie session), mọi test web hiện có (`SecurityConfigTests`, `GlobalExceptionHandlerTests`, `ProvidersControllerTests`, `ActuatorEndpointsTests`, `AccountsApiTests`, `AccountLifecycleEndToEndTests`, `ApiSecurityTestConfiguration`...), README (lệnh curl đăng nhập).
  - **Hướng làm:** endpoint đăng nhập tự viết: `AuthenticationManager.authenticate` → lưu `SecurityContext` qua `SecurityContextRepository` → đổi session ID → `RememberMeServices.loginSuccess` khi chọn ghi nhớ. Đăng xuất: hủy session, `logout` của remember-me. `common` chỉ dùng interface Spring Security (không import `identity`). Test cũ: `with(user(...))` cho slice test; test full-context dùng một helper đăng nhập thật (lấy `XSRF-TOKEN` từ `GET /api/auth/me`, rồi `POST /api/auth/login`).
  - **Test:** full-context MockMvc: login đúng → `204`, cookie session `HttpOnly`/`SameSite=Lax`, session ID đổi; `me` trả `200`; logout → `204`, `GET /api/accounts` trả `401`; thiếu CSRF ở `POST /login` và ở `PATCH /api/accounts/{id}` → `403 CSRF_TOKEN_INVALID`; `GET /api/auth/me` khi chưa đăng nhập trả `401` **và** cookie `XSRF-TOKEN`; Basic đúng mật khẩu → `401` không có `WWW-Authenticate`; remember-me: chỉ cookie ghi nhớ (bỏ cookie session) → `me` `200` + session mới; `rememberMe=false` → không có cookie ghi nhớ. `ModularityTests` xanh. `./mvnw verify` xanh với mọi test cũ đã chuyển.
  - **Acceptance criteria:** requirement *Đăng nhập bằng email và mật khẩu của owner* (trừ đếm lùi/khóa — BE-29), *Người dùng hiện tại*, *Đăng xuất*, *Bảo vệ CSRF*, *Ghi nhớ đăng nhập*, *Không còn HTTP Basic* (spec `web-authentication`); requirement sửa đổi *`/api/**` yêu cầu xác thực* (spec `api-conventions`).
  - **Hints:** Level 1 — "vì sao trước đây tắt CSRF được mà giờ phải bật?"; `HttpSessionSecurityContextRepository`, `request.changeSessionId()`, `TokenBasedRememberMeServices`, `MockMvc` + cookie.

- [ ] 1.3 **BE-29 — Khóa tạm 5 lần / 15 phút và mã lỗi đăng nhập**
  - **Goal / Why:** chặn dò mật khẩu; web hiện được số lần còn lại và thời gian chờ (D-35).
  - **Depends on:** BE-28.
  - **Files:** `identity/application` (bộ đếm khóa tạm có `Clock`, giới hạn số mục và thời hạn), `identity/api/AuthController` (`INVALID_CREDENTIALS` + `remainingAttempts`, `LOGIN_LOCKED` + `retryAfterSeconds` + `Retry-After`), error code enum của `identity`, bean `Clock`, design (catalog lỗi).
  - **Hướng làm:** kiểm khóa **trước** khi so mật khẩu (đang khóa thì không so); sai thì tăng bộ đếm; đúng thì xóa bộ đếm. Email chuẩn hóa như `OwnerProperties`. Đếm cả email không tồn tại. Thời gian lấy từ `Clock` inject.
  - **Test:** unit bộ đếm với `Clock` giả (đếm lùi 4…0; khóa ở lần 5; còn khóa ở phút 14; hết khóa ở phút 15; thành công thì về 0; vượt giới hạn số mục thì bỏ mục cũ nhất); full-context: 4 lần sai → `remainingAttempts` 4,3,2,1 rồi lần 5 → `429`; đúng mật khẩu khi đang khóa → `429` và không có session; email lạ cho cùng `code`/`detail` như sai mật khẩu.
  - **Acceptance criteria:** requirement *Khóa tạm khi nhập sai nhiều lần* và các scenario sai mật khẩu / email không tồn tại (spec `web-authentication`).
  - **Hints:** Level 1 — "nếu so mật khẩu trước rồi mới kiểm khóa thì kẻ dò mật khẩu biết thêm được gì?"; `Clock.offset`, `ConcurrentHashMap`, `Retry-After`.

## 2. Frontend — nền móng web (F01-FE)

- [ ] 2.1 **FE-01 — Cài stack, design token, theme, proxy, CI**
  - **Goal / Why:** có nền để mọi trang sau dùng chung (D-36).
  - **Depends on:** — (song song được với backend).
  - **Files:** `apps/sino-web/package.json`, `pnpm-lock.yaml`, `vite.config.ts` (plugin Tailwind, proxy `/api` → `http://localhost:8080`, cấu hình Vitest), `tsconfig*.json` (alias `@/`), `src/index.css` (Tailwind + biến CSS sáng/tối lấy từ canvas), `components.json` (shadcn), `src/shared/ui/*` (Button, Input, Checkbox, Label, DropdownMenu...), `src/shared/theme/*`, `src/test/setup.ts` (Testing Library + MSW), `.github/workflows/frontend-ci.yml`, `apps/sino-web/README.md`.
  - **Hướng làm:** thêm React Router, TanStack Query, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui (CLI), Vitest + Testing Library + jsdom + MSW; lấy màu/font/bo góc từ CSS của canvas; theme: `prefers-color-scheme` lần đầu, nhớ lựa chọn trong `localStorage` bọc `try/catch`. Thư viện nào không tương thích Vite 8 / TS 6 thì **dừng báo người dùng**.
  - **Test:** test theme (lần đầu theo hệ điều hành; đổi rồi tải lại vẫn giữ; `localStorage` ném lỗi vẫn chạy); `pnpm lint`, `pnpm test`, `pnpm build` xanh; CI frontend xanh sau khi người dùng cho push.
  - **Acceptance criteria:** requirement *Gọi API cùng origin*, *Giao diện sáng và tối* (spec `web-app-foundation`).
  - **Hints:** Level 1 — "vì sao đặt proxy ở Vite thay vì bật CORS ở Spring?"; Level 2 — token đặt ở `:root` và `.theme-dark`, Tailwind đọc qua `@theme`.

- [ ] 2.2 **FE-02 — API client**
  - **Goal / Why:** một chỗ duy nhất gọi API: CSRF, lỗi Problem Details, thử lại khi token cũ, báo hết phiên.
  - **Depends on:** FE-01; hợp đồng API của BE-28/BE-29 (test dùng MSW nên không cần backend chạy).
  - **Files:** `src/shared/api/client.ts`, `src/shared/api/problem.ts`, test.
  - **Hướng làm:** hàm `apiFetch` (hoặc `get/post/patch/delete`) nhận đường dẫn `/api/...`; đọc cookie `XSRF-TOKEN` cho request thay đổi dữ liệu; parse `application/problem+json` thành `ApiError`; `403 CSRF_TOKEN_INVALID` → `GET /api/auth/me` rồi thử lại một lần; `401` ngoài `/api/auth/*` → gọi callback "hết phiên" do tầng app đăng ký.
  - **Test (MSW):** `PATCH` có header `X-XSRF-TOKEN`, `GET` không có; `404 ACCOUNT_NOT_FOUND` → `ApiError` đúng `status`/`code`; lỗi mạng → `NETWORK_ERROR`; `403 CSRF_TOKEN_INVALID` lần đầu → gọi `me` rồi thử lại, lần hai vẫn lỗi → trả lỗi (không lặp vô hạn); `401` → callback được gọi.
  - **Acceptance criteria:** requirement *Xử lý API thống nhất* (spec `web-app-foundation`).
  - **Hints:** Level 1 — "vì sao chỉ thử lại đúng một lần?"; `document.cookie`, `Response.headers.get('content-type')`.

- [ ] 2.3 **FE-03 — Đăng nhập: `useMe`/`useLogin`/`useLogout`, `RequireAuth`, `LoginPage`**
  - **Goal / Why:** người dùng vào được app bằng trình duyệt, và trang nào cũng được chặn khi chưa đăng nhập.
  - **Depends on:** FE-02.
  - **Files:** `src/features/auth/*`, test.
  - **Hướng làm:** `useMe` là query TanStack (`401` = chưa đăng nhập, không phải lỗi); `useLogin`/`useLogout` là mutation, thành công thì invalidate/xóa cache; `RequireAuth` chuyển hướng kèm `returnTo` (chỉ nhận đường dẫn nội bộ); `LoginPage` theo `SiteLogin` của canvas, ẩn Google/quên mật khẩu/đăng ký/ngôn ngữ/điều khoản.
  - **Test (Testing Library + MSW):** chưa đăng nhập mở `/accounts` → `/login?returnTo=%2Faccounts`; đăng nhập thành công → về `/accounts`; `returnTo=//evil.example` → về `/accounts`; `401 INVALID_CREDENTIALS` với `remainingAttempts` = 4 → thông báo + "Còn 4 lần thử", mật khẩu trống, email giữ nguyên; `429 LOGIN_LOCKED` 900 giây → thông báo 15 phút; nút hiện/ẩn mật khẩu; các nút bị ẩn không có trong trang.
  - **Acceptance criteria:** requirement *Chặn trang khi chưa đăng nhập*, *Trang đăng nhập* (spec `web-app-foundation`).
  - **Hints:** Level 1 — "vì sao `returnTo=//evil.example` nguy hiểm dù bắt đầu bằng `/`?"; `useQuery`, `useMutation`, `Navigate`, `useSearchParams`.

- [ ] 2.4 **FE-04 — `AppShell`, route, menu người dùng, 404**
  - **Goal / Why:** khung app để F02-FE/F03-FE gắn trang vào.
  - **Depends on:** FE-03.
  - **Files:** `src/app/router.tsx`, `src/app/AppShell.tsx`, `src/app/NotFoundPage.tsx`, `src/features/accounts/AccountsPage.tsx` (trang trống), test.
  - **Hướng làm:** layout theo canvas (cột điều hướng + nội dung, co lại trên mobile theo `Breakpoints`); menu người dùng: email, đổi sáng/tối, đăng xuất; `/` → `/accounts`; `*` → 404 theo `SiteNotFound`; đăng ký callback "hết phiên" của API client để về `/login?returnTo=...`.
  - **Test:** `/` → `/accounts`; đường dẫn lạ → trang 404 có link về; menu hiện email từ `me`; đăng xuất → gọi `POST /api/auth/logout` rồi về `/login`; API trả `401` khi đang ở `/accounts` → `/login?returnTo=%2Faccounts`; điều hướng chỉ có mục Accounts.
  - **Acceptance criteria:** requirement *Khung app và điều hướng* (spec `web-app-foundation`).
  - **Hints:** Level 1 — "vì sao đăng xuất phải xóa cache của TanStack Query?"; `createBrowserRouter`, `Outlet`, `queryClient.clear()`.

## 3. Nghiệm thu

- [ ] 3.1 **FE-05 — Chạy thật trên trình duyệt + tài liệu + nghiệm thu**
  - **Goal / Why:** chứng minh backend và web chạy cùng nhau trên trình duyệt thật, và người dùng tự chạy lại được.
  - **Depends on:** BE-27…BE-29, FE-01…FE-04.
  - **Files:** `apps/sino-api/README.md` (biến env mới, lệnh curl đăng nhập, xử lý sự cố), `apps/sino-web/README.md` (cách chạy dev cùng backend), `docs/knowledge/phase-1-frontend-foundation.{md,docx}`, design (DoD), file này, `PROJECT_STATE.md`.
  - **Test:** backend profile `local` (compose DB) + `pnpm dev`; trên trình duyệt: mở `/accounts` → bị đưa về đăng nhập; sai mật khẩu → đếm lùi; sai 5 lần → khóa; đúng (sau khi đợi hoặc khởi động lại) → vào `/accounts`; tải lại vẫn đăng nhập; đổi sáng/tối; đăng xuất; tích ghi nhớ, khởi động lại backend, tải lại → vẫn đăng nhập. Chụp màn hình từng bước. Cần `.env` local có biến mới (người dùng đặt giá trị).
  - **Acceptance criteria:** checklist *Definition of Done — Change 1* trong `design.md`; sau đó `openspec archive fe-f01-web-foundation -y`.
  - **Hints:** Level 1 — "khi khởi động lại backend, cái gì giữ bạn đăng nhập: session hay cookie ghi nhớ?".
