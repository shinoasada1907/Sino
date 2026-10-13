# Admin backend · Implementation Plan

> **HYBRID mode:** backend AUTO. Claude (sino-api-9d) làm từng task theo thứ tự, kiểm chứng, commit riêng trên `dev` (không push). Người dùng giao trọn ("xây đi không cần hỏi", 2026-10-13), nên các task chạy nối tiếp, không dừng hỏi giữa chừng; quyết định trong `design.md` (D-260…D-266) chờ người dùng xem lại.
> Mỗi task: test đỏ trước rồi mới xanh. Build và test trong **git worktree riêng** (`scratchpad/sino-admin`), không đụng `target/` mà IntelliJ của người dùng đọc; `./mvnw -B -ntp verify` xanh trước khi commit. Kiến thức: mục admin ở cuối `docs/knowledge/phase-0-backend-foundation.md`, sinh lại `.docx`, `genoffice docs check`.
> Thứ tự: BE-100 → BE-101 → BE-102 → ACC (người dùng).

## 1. Backend

- [x] 1.1 **BE-100 — Tài khoản quản trị, đăng nhập, tách quyền, `GET /api/admin/me`** · DONE 2026-10-13
  - **Bằng chứng:** đỏ trước: sau bước identity, `AdminSignInTests` đỏ 4 ca (admin đọc được `/api/accounts` = `200`, `/api/admin/me` = `404`); xanh sau bước chain + controller. `./mvnw -B -ntp verify` trong worktree `scratchpad/sino-admin`: 1475 test, 0 failures, 0 errors, 4 skipped, BUILD SUCCESS (4 phút 13 giây); `AdminSignInTests` 9/9, `AdminLoginTests` 6/6, `LoginSettingsTests` 16/16, `AuthApiTests` 17/17, `ModularityTests` 2/2. Lỗi gài: 8/8 bị bắt (admin trùng owner, mật khẩu không email, mật khẩu 11 ký tự, admin nhận cookie ghi nhớ, admin đăng nhập thành owner, bỏ `not(ADMIN)`, `/api/admin/**` chỉ cần đăng nhập, bỏ hẳn quy tắc admin). Lỗi đáng kể: owner chỉ có cookie ghi nhớ gọi API admin nhận `401`, không phải `403` như test viết ban đầu (hành vi chuẩn của Spring Security); sửa kỳ vọng của test và ghi vào design.
  - **Goal / Why:** một người vận hành đăng nhập riêng, không đọc được dữ liệu của owner, owner không gọi được API admin (D-260…D-263).
  - **Depends on:** —
  - **Files:** `identity/application/{AdminProperties (mới),LoginSettings,LoginConfiguration}.java`, ~~`SignInService.java`, `identity/api/AuthController.java`~~, `common/security/SecurityConfig.java`, `admin/api/{AdminController,AdminMeResponse}.java` (mới), `application.yaml`, `application-test.yaml`, `.env.example`; test `identity/application/{LoginSettingsTests,AdminLoginTests (mới)}`, `admin/AdminSignInTests` (mới); mục admin trong file kiến thức Phase 0.
  - **Hướng làm:** design D-260…D-263 và Backend 2. `AdminProperties` như `OwnerProperties` (email chuẩn hóa, trống → `null`, `toString` che mật khẩu); `LoginSettings` kiểm và băm; `UserDetailsService` trả owner hoặc admin; ~~`SignInService.mayStaySignedIn` chỉ đúng với `ROLE_OWNER`; `AuthController` chỉ gọi `loginSuccess` khi được~~ → dịch vụ remember-me (`OwnerRememberMeServices` trong `LoginConfiguration`) chỉ cấp cookie cho `ROLE_OWNER`, `AuthController` và `SignInService` không đổi. **LÝ DO:** quy tắc "cookie chỉ cho owner" nằm ngay cạnh cấu hình remember-me (D-34) và áp cho mọi chỗ gọi `loginSuccess`, không chỉ endpoint đăng nhập; bớt hai file phải sửa. `SecurityConfig` thêm hai quy tắc theo thứ tự.
  - **Ghi chú lúc làm:** body đăng nhập có trường `rememberMe` (không phải `keepSignedIn` như bản kế hoạch đầu; đã sửa design và spec). Owner chỉ còn cookie "ghi nhớ" gọi API admin nhận `401` (Spring Security đòi đăng nhập đầy đủ), không phải `403`; ghi ở design "Chốt kỹ thuật".
  - **Test:** như mục Testing của design (cấu hình, đăng nhập thật, tách quyền). Mutation một lần cho `LoginSettings` + quy tắc chain.
  - **Acceptance criteria:** requirement "Tài khoản quản trị từ cấu hình", "Đăng nhập quản trị", "Tách quyền giữa admin và owner" của spec `admin-api`.

- [x] 1.2 **BE-101 — Public API đọc và `GET /api/admin/{overview,users,accounts}`** · DONE 2026-10-13
  - **Bằng chứng:** đỏ trước: sau bước "ba public API", test của chúng xanh (13/13), `AdminApiTests` đỏ đúng 4 ca (`404`, chưa có endpoint); xanh sau bước module `admin`. `./mvnw -B -ntp verify` trong worktree: 1494 test, 0 failures, 0 errors, 4 skipped, BUILD SUCCESS (3 phút 58 giây); `AdminApiTests` 6/6, `SyncStatusServiceTests` 7/7, `UserDirectoryServiceTests` 3/3, `AccountRosterServiceTests` 3/3, `LiveSyncApiTests` 22/22 (cách tính `push` dùng chung không đổi hành vi của owner), `ModularityTests` 2/2. Lượt `verify` đầu bị Claude Code dừng vì máy thiếu RAM (1161 test chạy, 0 lỗi); người dùng cho chạy lại. Không chạy lỗi gài cho task này (kế hoạch chỉ có một lượt ở BE-100).
  - **Ghi chú lúc làm:** test của public API không xóa `app_user` của test khác (khóa ngoại của `task`), chỉ so những dòng chính nó tạo; `AdminApiTests` thì xóa trước mỗi test như `AccountsApiTests`, vì con số tổng quan đếm mọi dòng.
  - **Goal / Why:** người vận hành thấy người dùng, tài khoản hỏng, nhập thư / đồng bộ lỗi mà không thấy nội dung (D-264, D-265).
  - **Depends on:** BE-100.
  - **Files:** `identity/{UserDirectory,UserSummary}.java` (mới), `identity/application/UserDirectoryService.java` (mới), `identity/infrastructure/AppUser.java` (`createdAt()`); `account/{AccountRoster,AccountListing}.java` (mới), `account/application/AccountRosterService.java` (mới), `account/infrastructure/ConnectedAccountRepository.java` (một query); `sync/{SyncStatuses,AccountSyncStatus}.java` (mới), `sync/application/{SyncStatusService (mới),LiveSyncService}.java`; `admin/application/{AdminQueries,UserView,AccountView,SyncView,Overview}.java` (mới), `admin/api/{OverviewResponse,UsersResponse,AccountsResponse}.java` (mới), `AdminController`; test cho từng public API và `admin/AdminApiTests`; mục admin của file kiến thức.
  - **Hướng làm:** design D-265 và Backend 3; cách tính `push` chuyển thành một hàm dùng chung cho `LiveSyncService` và `SyncStatusService` (không đổi hành vi của `GET /api/accounts/{id}/sync`).
  - **Test:** như mục Testing của design (public API trên PostgreSQL thật, API admin, không lộ nội dung, `ModularityTests`).
  - **Acceptance criteria:** requirement "Danh sách người dùng cho admin", "Danh sách tài khoản kết nối cho admin", "Tổng quan cho admin", "Admin không thấy nội dung của người dùng" của spec `admin-api`; delta `module-boundaries`.

- [x] 1.3 **BE-102 — README, biến môi trường, ghi chú roadmap** · DONE 2026-10-13
  - **Bằng chứng:** README có mục *Admin (read-only operator API)*, các dòng `/api/admin/**` trong bảng endpoint, dòng `/api/**` ghi "not as admin", admin giả của test; `.env.example` có từ BE-100; ghi chú "Ngoài các phase — Admin" trong `openspec/roadmap.md`; mục 25.11 (tự kiểm tra) trong file kiến thức, `.docx` sinh lại, `genoffice docs check` không lỗi; `openspec validate admin-api --strict` hợp lệ. Đối chiếu scenario với test: thêm `aUserWithoutAccountsCountsZero` (`AdminApiTests` 7/7; gài lỗi `getOrDefault(..., 1L)` làm test này đỏ, rồi trả code lại).
  - **Goal / Why:** người dùng bật được admin và biết giới hạn của nó.
  - **Depends on:** BE-101.
  - **Files:** `apps/sino-api/README.md` (mục admin), `.env.example` (nếu BE-100 chưa đủ), `openspec/roadmap.md` (ghi chú admin), file kiến thức + `.docx`, `PROJECT_STATE.md`.
  - **Việc:** README: bật admin bằng `SINO_ADMIN_EMAIL` / `SINO_ADMIN_PASSWORD`, các endpoint, ví dụ `curl` có cookie và CSRF, admin không đọc được thư, danh sách cấm `NOT ADMIN` và lúc phải đổi; `openspec validate admin-api --strict`.
  - **Acceptance criteria:** mọi ô Definition of Done của `design.md`, trừ chạy thật và archive.

## 2. Nghiệm thu

- [x] 2.1 ~~**ACC — Người dùng chạy thật, xem lại quyết định** trước khi archive~~ → để sau archive. **LÝ DO:** người dùng cho archive ngay sau BE-102 ("archive admin-api luôn đi", 2026-10-13). Chạy thật trên backend của người dùng **chưa làm**, D-260…D-266 vẫn là "agent chốt", chưa được duyệt; cả hai ghi là việc còn mở ở `PROJECT_STATE.md`. Đổi quyết định nào sau này thì làm thành change mới, sửa spec `admin-api`.
  - Đặt `SINO_ADMIN_EMAIL` / `SINO_ADMIN_PASSWORD` trong `.env`, khởi động lại backend, đăng nhập admin bằng `curl` theo README, gọi ba endpoint; thấy owner vẫn dùng web như cũ.
  - Xem lại D-260…D-266 (agent chốt theo ủy quyền).

- [x] 2.2 **Archive:** `openspec archive admin-api -y` (2026-10-13, theo yêu cầu của người dùng, trước ACC). Delta `module-boundaries` là ADDED, không đụng requirement mà `f15-notes` / `f16-f17-tasks-calendar` sửa, nên thứ tự archive với hai change đó không quan trọng.
