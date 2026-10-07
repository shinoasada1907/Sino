# Phase 1 · Change 1 — Xác thực cho trình duyệt (D-22) + nền móng web (F01-FE) · Technical Design

> Mode: **HYBRID** — backend và frontend AUTO (agent làm từng task, kiểm chứng, báo lại rồi dừng); quyết định kiến trúc do người dùng chốt. Thiết kế được người dùng duyệt từng phần trong buổi brainstorm 2026-10-07 (phần 1 backend, phần 2 frontend, phần 3 task).
> Convention chung ở `openspec/specs/` (đặc biệt `api-conventions`, `account-owner`) và design của F01/F02 đã archive.

## Context

- Hiện trạng (2026-10-07): Phase 0 đóng (PR #3). Backend bảo vệ `/api/**` bằng **HTTP Basic** với một user cấu hình qua env (`SINO_API_USERNAME`/`SINO_API_PASSWORD`, D-02 A), `SessionCreationPolicy.STATELESS`, CSRF tắt (`SecurityConfig` trong `dev.sino.common.security`). Owner (`app_user`) được tạo lúc khởi động từ `SINO_OWNER_EMAIL`/`SINO_OWNER_DISPLAY_NAME` (BE-09); mọi principal đã xác thực ánh xạ tới owner qua `CurrentUser`.
- `apps/sino-web`: khung Vite 8 + React 19 + TypeScript 6 trống (chỉ `App.tsx` mẫu), `oxlint`, `pnpm`.
- Thiết kế giao diện đã duyệt: canvas "Sino UI" (`design/sino-ui/project/*.dc.html`), gồm `SiteLogin*` (đăng nhập: biến thể Email + mật khẩu và biến thể Google, thông báo "Email hoặc mật khẩu không đúng — Còn 4 lần thử trước khi phải đợi 15 phút", ô "Giữ đăng nhập trên máy này"), `SiteNotFound*` (404), `Breakpoints`, các màn app (Inbox, Accounts, AccountDetail, Settings) cho khung 3 cột; mỗi màn có bản sáng và tối.
- Giới hạn đã biết của D-02 (design F01): SPA phải giữ mật khẩu trong JS; `EventSource` không gửi được header tùy chỉnh. F01 design ghi: "khi bắt đầu tích hợp frontend phải xem lại quyết định CSRF".
- Stack frontend đã ghi trong roadmap (Phase 1): React Router, TanStack Query, Tailwind, shadcn/ui.

## Goals / Non-Goals

**Goals:**
- Trình duyệt đăng nhập an toàn: mật khẩu không bao giờ nằm trong JavaScript sau khi gửi form; cookie phiên không đọc được từ JS; có CSRF; có khóa tạm khi đoán mật khẩu.
- Một nền móng frontend đủ để F02-FE/F03-FE chỉ việc thêm trang: router, gọi API có kiểu, xử lý lỗi thống nhất, khung app, theme, test, CI.
- Không làm vỡ hành vi API hiện có: mọi endpoint vẫn trả Problem Details với `code` ổn định; owner isolation giữ nguyên.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-22 — Xác thực cho trình duyệt · **Accepted: A** (người dùng, 2026-10-07)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Email + mật khẩu → session cookie + CSRF** (chọn) | Mật khẩu không ở trong JS; cookie `HttpOnly` nên XSS không đọc được; cookie tự đi theo SSE (F08) và service worker (F14); chuẩn Spring Security, không cần dịch vụ ngoài; nút Google thêm sau trên cùng cơ chế session | Phải làm CSRF; session nằm trong bộ nhớ server (hết khi khởi động lại, xem D-34) |
| B. Đăng nhập bằng Google (OIDC) → session | Không quản lý mật khẩu; có 2FA của Google | Phải tạo OAuth client trên Google Cloud ngay; dev cần internet để đăng nhập; test phức tạp; ai tự cài mà không dùng Google thì không vào được |
| C. Token ngắn hạn (JWT) + refresh cookie | Stateless; hợp app mobile sau này | Phức tạp nhất (xoay/thu hồi refresh token); SSE vẫn cần cookie; quá tay cho web một người dùng |

### D-32 — Bỏ HTTP Basic · **Accepted** (người dùng, 2026-10-07)
Chỉ còn đăng nhập bằng session. **LÝ DO:** mỗi `401` có `WWW-Authenticate: Basic` làm trình duyệt bật hộp thoại; hai cách vào thì phải bảo vệ cả hai (Basic không đi qua bộ đếm khóa tạm, và request mang Basic vẫn bị CSRF chặn nếu không loại trừ riêng). Test dùng hỗ trợ của Spring Security (`with(user(...))`) hoặc đăng nhập thật qua `/api/auth/login`; curl gọi API đăng nhập rồi giữ cookie (README ghi lệnh). Phương án bị loại: giữ Basic ở profile `local` (hai cấu hình security khác nhau giữa local và thật), giữ cả hai ở mọi nơi.

### D-33 — Tài khoản đăng nhập là owner, mật khẩu trong env · **Accepted** (người dùng, 2026-10-07)
Đăng nhập bằng `SINO_OWNER_EMAIL` (đã có) + biến mới **`SINO_OWNER_PASSWORD`**, thay cặp `SINO_API_USERNAME`/`SINO_API_PASSWORD`: một danh tính duy nhất (`app_user`). Mật khẩu tối thiểu **12 ký tự**; lúc khởi động app băm nó bằng **BCrypt** một lần và chỉ giữ bản băm trong `UserDetailsService`. Đổi mật khẩu = đổi env rồi khởi động lại; "Quên mật khẩu?" chưa có ở MVP. Phương án bị loại: lưu `password_hash` trong `app_user` + API đổi mật khẩu (việc của login nhiều người, ngoài MVP); giữ username API riêng (lệch ô Email của thiết kế, còn hai danh tính).
- Giá trị mật khẩu **không** được kiểm bằng Bean Validation (`@Size`...), vì thông báo lỗi của Spring Boot in kèm giá trị bị từ chối (bài học BE-12); kiểm tay với thông báo chỉ nêu tên cấu hình.

### D-34 — Ghi nhớ đăng nhập bằng remember-me cookie · **Accepted** (người dùng, 2026-10-07)
Session nằm trong bộ nhớ server (mặc định của servlet container): hết khi server khởi động lại hoặc sau **30 phút** không dùng. Khi người dùng tích "Giữ đăng nhập trên máy này", server cấp thêm cookie remember-me **30 ngày** của Spring Security (`TokenBasedRememberMeServices`, chữ ký SHA-256 tính từ email, hạn dùng, bản băm mật khẩu và khóa `SINO_REMEMBER_ME_KEY`). Cookie sống qua khởi động lại; đổi mật khẩu thì mọi cookie cũ mất hiệu lực. `SINO_REMEMBER_ME_KEY` bắt buộc, tối thiểu 32 ký tự (tạo bằng `openssl rand -base64 32`). Phương án bị loại: Spring Session JDBC (thêm dependency + bảng), bỏ hẳn ghi nhớ.

### D-35 — Khóa tạm theo email · **Accepted** (người dùng, 2026-10-07)
Sai **5** lần liên tiếp với cùng một email (đã chuẩn hóa) thì khóa **15 phút**; trong lúc khóa, nhập đúng mật khẩu cũng bị từ chối (`429 LOGIN_LOCKED`). Đăng nhập thành công thì bộ đếm về 0. Bộ đếm nằm trong bộ nhớ (mất khi khởi động lại — chấp nhận được). Thời gian lấy từ một `Clock` được inject để test tua được.
- **Trade-off đã chấp nhận:** người khác biết email owner có thể cố tình gõ sai để khóa owner 15 phút. Với MVP tự cài, một người dùng, rủi ro này nhỏ hơn rủi ro bị dò mật khẩu không giới hạn. Phương án khác để sau: khóa theo email + IP.
- Đếm cả lần sai với email **không** tồn tại (theo email được gửi), để phản hồi giống hệt nhau và không lộ email nào có thật.
- Bộ đếm có giới hạn để không bị làm phình bộ nhớ bằng hàng loạt email ngẫu nhiên: một mục tự hết hạn 15 phút sau lần sai cuối, và số mục tối đa có giới hạn (vượt thì bỏ mục cũ nhất). Con số cụ thể chốt ở BE-29.

### D-36 — Frontend và API cùng origin · **Accepted** (người dùng, 2026-10-07)
Trình duyệt chỉ thấy một địa chỉ. Khi dev: Vite (`localhost:5173`) proxy `/api/**` sang Spring Boot (`localhost:8080`). Khi deploy (F12): web và API vẫn sau một origin (Spring Boot phục vụ file đã build, hoặc reverse proxy) — cách đóng gói chốt ở F12. **LÝ DO:** cookie `SameSite=Lax` chạy tự nhiên, không cần CORS, CSRF đơn giản. Phương án bị loại: hai origin + CORS có credentials (cookie phải `SameSite=None; Secure`, HTTPS cả khi dev, thêm cấu hình dễ sai).

## Backend design

### API (`dev.sino.identity.api`)

| Endpoint | Quyền | Body | Thành công | Lỗi |
|---|---|---|---|---|
| `GET /api/auth/me` | công khai | — | `200 {"email","displayName"}` | `401 UNAUTHORIZED` khi chưa đăng nhập |
| `POST /api/auth/login` | công khai, **cần CSRF** | `{"email","password","rememberMe"}` | `204` + cookie session (+ cookie remember-me nếu `rememberMe`) | `400 VALIDATION_FAILED` (thiếu trường), `401 INVALID_CREDENTIALS` + `remainingAttempts`, `429 LOGIN_LOCKED` + `retryAfterSeconds` + header `Retry-After`, `403 CSRF_TOKEN_INVALID` |
| `POST /api/auth/logout` | đã đăng nhập, **cần CSRF** | — | `204`, session bị hủy, cookie remember-me bị xóa | `401`, `403 CSRF_TOKEN_INVALID` |

- `GET /api/auth/me` công khai (không chặn) để luôn trả được cookie `XSRF-TOKEN` cho web trước lần POST đầu tiên; nó trả `401` khi chưa đăng nhập.
- `POST /api/auth/login` tự xác thực bằng `AuthenticationManager` rồi lưu `SecurityContext` vào session qua `SecurityContextRepository` (cách Spring Security 6+/7 khuyên cho endpoint đăng nhập tự viết), đổi session ID (chống session fixation), gọi `RememberMeServices.loginSuccess` khi `rememberMe = true`. Không dùng `formLogin()` vì nó nhận form, trả redirect và không trả Problem Details.
- `INVALID_CREDENTIALS` dùng một thông báo cho cả sai email lẫn sai mật khẩu; `remainingAttempts` = số lần còn được thử trước khi khóa.

### Bảo mật HTTP (`dev.sino.common.security.SecurityConfig`)

```text
request -> SecurityFilterChain
  CSRF (csrf.spa(): cookie XSRF-TOKEN đọc được bằng JS, header X-XSRF-TOKEN)
     POST/PUT/PATCH/DELETE thiếu/sai token -> 403 CSRF_TOKEN_INVALID
  RememberMe (cookie hợp lệ + chưa có session -> đăng nhập lại, tạo session mới)
  Authorization
     /actuator/health, /actuator/health/**, /actuator/info, GET /api/auth/me, POST /api/auth/login -> permitAll
     /actuator/**, /api/** -> authenticated
     còn lại -> denyAll
  chưa đăng nhập -> 401 UNAUTHORIZED (Problem Details, KHÔNG có WWW-Authenticate)
```

- Session: `SessionCreationPolicy.IF_REQUIRED` (mặc định) thay cho `STATELESS`. Cookie session: `HttpOnly`, `SameSite=Lax`, `Secure` bật bằng env khi chạy HTTPS (`server.servlet.session.cookie.secure`), timeout 30 phút.
- `SecurityConfig` ở `common` chỉ dùng interface của Spring Security (`UserDetailsService`, `RememberMeServices`...) để `common` vẫn không phụ thuộc module nghiệp vụ (`allowedDependencies = {}`); các bean cụ thể (user từ owner, remember-me, bộ đếm khóa tạm) nằm trong `identity`.
- Phải kiểm chứng ở BE-28 (không suy đoán): `csrf.spa()` ghi cookie `XSRF-TOKEN` vào response của `GET /api/auth/me` trước lần POST đầu; đăng nhập đổi session ID; đăng xuất cũng xóa cookie remember-me.

### Cấu hình

| Biến | Thay đổi | Ghi chú |
|---|---|---|
| `SINO_API_USERNAME`, `SINO_API_PASSWORD` | **bỏ** | cùng `ApiUserProperties` và `sino.security.api-user.*` |
| `SINO_OWNER_PASSWORD` | **thêm, bắt buộc** | ≥ 12 ký tự, chỉ giữ bản băm BCrypt sau khởi động |
| `SINO_REMEMBER_ME_KEY` | **thêm, bắt buộc** | ≥ 32 ký tự; đổi khóa = mọi cookie remember-me cũ mất hiệu lực |
| `SINO_SESSION_COOKIE_SECURE` | **thêm, mặc định `false`** | đặt `true` khi chạy sau HTTPS |

Thiếu hoặc sai → app không khởi động, thông báo chỉ nêu **tên** cấu hình, không bao giờ in giá trị. Test dùng giá trị giả trong `application-test.yaml`.

### Error code catalog — bổ sung

| code | HTTP | Nguồn |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu khi đăng nhập; kèm `remainingAttempts` |
| `LOGIN_LOCKED` | 429 | Đang khóa tạm (D-35); kèm `retryAfterSeconds` và header `Retry-After` |
| `CSRF_TOKEN_INVALID` | 403 | Thiếu hoặc sai CSRF token ở request thay đổi dữ liệu |

`UNAUTHORIZED` (401) giữ nguyên nghĩa (chưa đăng nhập hoặc session hết hạn).

## Frontend design (`apps/sino-web`)

### Stack

| Thư viện | Dùng để |
|---|---|
| React Router | chuyển trang, route guard, `returnTo` |
| TanStack Query | gọi API, cache, trạng thái loading/error, invalidation |
| Tailwind CSS v4 (`@tailwindcss/vite`) + shadcn/ui | giao diện; component shadcn được chép vào repo (`src/shared/ui`) |
| Vitest + Testing Library + jsdom + MSW | unit/component test; MSW chặn ở tầng mạng nên code vẫn gọi `fetch` thật |

Design token (màu, font, bo góc, khoảng cách) lấy từ CSS của canvas "Sino UI", khai báo thành biến CSS cho `theme-light`/`theme-dark` và nối vào Tailwind. Nếu một thư viện không tương thích với Vite 8 / TypeScript 6, FE-01 dừng lại báo người dùng trước khi đổi hướng.

### Cấu trúc

```text
src/
  main.tsx              mount + providers
  app/                  router.tsx, providers.tsx (QueryClient, theme), AppShell.tsx, NotFoundPage.tsx
  features/auth/        LoginPage.tsx, useMe.ts, useLogin.ts, useLogout.ts, RequireAuth.tsx
  features/accounts/    AccountsPage.tsx (trang trống ở change này)
  shared/api/           client.ts (gọi /api), problem.ts (ApiError)
  shared/ui/            component shadcn
  shared/theme/         ThemeProvider, nút đổi sáng/tối
```

### API client (`shared/api/client.ts`)
- Gọi đường dẫn tương đối `/api/...` (cùng origin, D-36), `credentials: 'same-origin'`, `Accept: application/json`.
- POST/PUT/PATCH/DELETE: đọc cookie `XSRF-TOKEN`, gửi header `X-XSRF-TOKEN`. GET không gửi.
- Lỗi: body `application/problem+json` thành `ApiError { status, code, detail, errors?, extra }`; lỗi mạng thành `ApiError` với `code = NETWORK_ERROR`.
- `403 CSRF_TOKEN_INVALID`: gọi `GET /api/auth/me` để lấy token mới rồi thử lại **một** lần.
- `401` ở bất kỳ request nào ngoài `/api/auth/*`: báo cho tầng app (xóa cache, về `/login?returnTo=...`).

### Luồng đăng nhập

```text
mở web -> useMe() = GET /api/auth/me
   loading -> màn chờ
   401     -> /login?returnTo=<trang đang mở>
   200     -> AppShell -> trang được yêu cầu
/login (LoginPage, theo SiteLogin của canvas)
   submit -> POST /api/auth/login {email, password, rememberMe}
      204 -> invalidate useMe -> chuyển tới returnTo (chỉ nhận đường dẫn nội bộ bắt đầu bằng "/")
      401 INVALID_CREDENTIALS -> "Email hoặc mật khẩu không đúng. Còn N lần thử ..."
      429 LOGIN_LOCKED        -> "Tạm khóa. Thử lại sau X phút."
      khác / mạng             -> thông báo lỗi chung, giữ dữ liệu đã nhập (trừ mật khẩu)
đăng xuất (menu người dùng) -> POST /api/auth/logout -> xóa cache -> /login
```

- `returnTo` chỉ nhận đường dẫn nội bộ (bắt đầu bằng một dấu `/`, không phải `//`) để không thành open redirect.
- Trang đăng nhập ẩn: nút Google, "Quên mật khẩu?", "Bắt đầu tại đây", nút chọn ngôn ngữ, link điều khoản (trang công khai chưa có). Giữ: email, mật khẩu (hiện/ẩn), "Giữ đăng nhập trên máy này".

### Khung app và route
- `AppShell` theo canvas: cột điều hướng trái + vùng nội dung; menu người dùng (tên/email, đổi sáng/tối, đăng xuất). Dùng được ở desktop và mobile theo `Breakpoints` của canvas. Menu điều hướng chỉ hiện trang đã có (Phase 1: Accounts).
- Route: `/login` (công khai); `/` → `/accounts`; `/accounts` (trong `RequireAuth`, trang trống "Chưa có account" — F02-FE làm tiếp); `*` → trang 404 theo `SiteNotFound`.
- Theme: lần đầu theo `prefers-color-scheme`; người dùng đổi thì nhớ trong `localStorage` (bọc `try/catch`, không có cũng chạy).
- Văn bản giao diện tiếng Việt, viết thẳng trong component (chưa i18n).

## Testing

| Tầng | Nội dung |
|---|---|
| Backend unit | khởi động thiếu/sai `SINO_OWNER_PASSWORD`, `SINO_REMEMBER_ME_KEY` → không start, không lộ giá trị; bộ đếm khóa tạm với `Clock` giả (5 lần, 15 phút, reset khi thành công) |
| Backend full-context (MockMvc) | login đúng → session + đổi session ID; sai → `401` + `remainingAttempts` đếm lùi; lần thứ 5 → `429`; đúng trong lúc khóa → `429`; hết khóa → đăng nhập được; thiếu CSRF → `403 CSRF_TOKEN_INVALID`; `401` không có `WWW-Authenticate`; logout hủy session; remember-me đăng nhập lại khi không còn session; `/api/auth/me` trả `XSRF-TOKEN` |
| Backend test hiện có | chuyển từ `httpBasic(...)` sang `with(user(...))`/session thật; `./mvnw verify` xanh; `ModularityTests` xanh |
| Frontend unit/component | API client (CSRF chỉ ở request thay đổi dữ liệu, Problem Details → `ApiError`, thử lại khi lỗi CSRF, báo `401`); `LoginPage` (đếm lùi, khóa, `returnTo`, chặn `returnTo` ngoài); `RequireAuth`; theme |
| Frontend build | `pnpm lint`, `pnpm test`, `pnpm build`; CI `frontend-ci.yml` |
| Chạy thật | backend profile `local` + `pnpm dev`; trên trình duyệt: đăng nhập đúng, sai (đếm lùi), bị khóa, đăng xuất, tải lại trang vẫn đăng nhập, tích ghi nhớ rồi khởi động lại backend vẫn đăng nhập; chụp màn hình làm bằng chứng |

## Risks / Trade-offs

- [Đổi sang session đụng mọi test web cũ] → BE-28 làm riêng phần chuyển test, chạy `./mvnw verify` trước khi commit; ghi rõ danh sách test đã đổi.
- [CSRF cấu hình sai làm mọi POST/PATCH/DELETE của web bị `403`] → test full-context đi đủ vòng: lấy token từ `GET /api/auth/me` rồi gửi lại; test ngược: thiếu token → `403`.
- [XSS vẫn có thể hành động thay người dùng khi đang đăng nhập] → cookie session `HttpOnly` chặn được việc **lấy cắp** phiên, không chặn được hành động trong lúc trang bị chèn script. React tự escape nội dung; Content-Security-Policy để F12. Ghi nhận, không làm ở change này.
- [Bị cố tình khóa 15 phút] → chấp nhận cho MVP (D-35).
- [Session mất khi khởi động lại] → remember-me (D-34).
- [Thư viện frontend mới (Vite 8, TS 6, Tailwind 4) chưa tương thích] → FE-01 dừng báo trước khi đổi hướng.
- [`.env` local thiếu biến mới làm app không khởi động] → README + `.env.example` + dòng xử lý sự cố; thông báo lỗi nêu đúng tên biến.

## Migration Plan

1. Người dùng thêm vào `apps/sino-api/.env`: `SINO_OWNER_PASSWORD=<≥ 12 ký tự>`, `SINO_REMEMBER_ME_KEY=<openssl rand -base64 32>`; bỏ `SINO_API_USERNAME`, `SINO_API_PASSWORD` (để lại cũng không sao, app không còn đọc).
2. curl: `curl -c jar -b jar http://localhost:8080/api/auth/me` (lấy `XSRF-TOKEN`), rồi `POST /api/auth/login` kèm header `X-XSRF-TOKEN` và `-b jar -c jar`; các lệnh sau dùng lại `jar` (README ghi đủ).
3. Không có migration database.

## Open Questions

- Cách đóng gói khi deploy (F12) — ràng buộc cùng origin đã chốt (D-36).
- Khóa tạm theo email + IP — xem lại khi có nhiều người dùng hoặc bị lạm dụng.
- Notion 02A/04A cập nhật theo D-22/D-32 — người dùng.

## Definition of Done — Change 1

- [ ] Đăng nhập/đăng xuất/`me` chạy đúng các scenario của spec `web-authentication`; HTTP Basic không còn; `401` không có `WWW-Authenticate`.
- [ ] App không khởi động khi thiếu/sai `SINO_OWNER_PASSWORD` hoặc `SINO_REMEMBER_ME_KEY`, thông báo không lộ giá trị.
- [ ] Mọi test backend cũ đã chuyển sang session; `./mvnw verify` xanh; `ModularityTests` xanh.
- [ ] Web: `pnpm lint`, `pnpm test`, `pnpm build` xanh; CI frontend xanh.
- [ ] Chạy thật trên trình duyệt: các tình huống ở mục Testing đều đúng, có ảnh chụp màn hình.
- [ ] README (backend: biến env mới, lệnh curl đăng nhập; web: cách chạy dev) và `.env.example` cập nhật; error catalog cập nhật.
- [ ] Kiến thức Phase 1 trong `docs/knowledge/phase-1-frontend-foundation.md` + bản `.docx`.
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; change archive.
