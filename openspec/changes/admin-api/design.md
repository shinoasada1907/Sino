# Admin backend (module `admin` trong `sino-api`) · Technical Design

> Mode: **HYBRID**: backend AUTO; quyết định kiến trúc thuộc người dùng. Hướng chung do người dùng chốt trong buổi bàn sáng 2026-10-13 (phiên sino-api trước): admin nằm trong `sino-api` như một module, có role và security chain riêng, không có backend thứ hai; tách phần nền tảng dùng chung khi có sản phẩm thứ hai. Ba câu còn mở người dùng giao cho agent ("xây BE cho admin", "xây đi không cần hỏi", 2026-10-13), nên D-260…D-266 là **agent chốt theo ủy quyền**, có ghi phương án bị loại để người dùng xem lại.
> Phiên: sino-api-9d. Số quyết định D-260…D-269; task BE-100…BE-109; không migration. Build trong git worktree riêng.

## Context

- `identity`: một owner từ cấu hình `sino.owner.*` (D-10, D-33), lưu trong `app_user`. `LoginConfiguration` có `UserDetailsService` chỉ biết owner, role `OWNER`; "ghi nhớ đăng nhập" (D-34) ký cookie bằng HMAC của mật khẩu owner. `SignInService` khóa tạm theo email sau 5 lần sai (D-35). `OwnerCurrentUser` coi **mọi** principal đã đăng nhập là owner.
- `common/security/SecurityConfig`: chain webhook riêng (D-76) và chain trình duyệt: `/api/**` chỉ cần `authenticated()`, CSRF kiểu SPA, phiên bằng cookie `JSESSIONID` `SameSite=Lax`. `common` không được phụ thuộc business module.
- Test API dùng `with(user("owner@sino.test"))` của Spring Security Test (khoảng 50 chỗ, role mặc định `USER`); các phiên song song (`f15-notes`, `f16-f17-tasks-calendar`) đang viết test cùng kiểu trong worktree của chúng.
- Đọc chéo module: chỉ qua type ở base package (Spring Modulith, `ModularityTests`). Đã có `AccountDirectory` (theo owner, và `byId` cho việc nền), `ConversationStats.storedMessages(accountId)`. Tình trạng đồng bộ nằm trong `sync_checkpoint` (module `sync`), owner đọc qua `GET /api/accounts/{id}/sync` và `/initial-sync`.
- Sino đang chuẩn bị xin Google thẩm định (`site-public-pages`): Google API Services User Data Policy (Limited Use) cấm người đọc dữ liệu Gmail của người dùng, trừ vài ngoại lệ hẹp (người dùng đồng ý cho từng thư, an ninh, pháp lý, vận hành nội bộ với dữ liệu đã gộp và ẩn danh).

## Goals / Non-Goals

**Goals:**
- Một người vận hành đăng nhập riêng và thấy tình trạng của Sino: bao nhiêu người dùng, tài khoản nào hỏng kết nối, nhập thư hay đồng bộ nào đang lỗi, thông báo đẩy có chạy không.
- Admin không đọc được dữ liệu riêng của người dùng, kể cả khi gọi thẳng API của owner.
- Không đổi gì cho owner, cho web `sino-web`, cho test đang có và test của các phiên song song.
- Khi có web admin hoặc thêm thao tác ghi, chỉ cần cộng thêm, không làm lại phần đăng nhập và tách quyền.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-260 — Admin là một tài khoản riêng từ cấu hình, role `ADMIN`, không phải `app_user` · **Agent chốt** (ủy quyền 2026-10-13)
`sino.admin.email` và `sino.admin.password` (biến môi trường `SINO_ADMIN_EMAIL`, `SINO_ADMIN_PASSWORD`), cùng cách với owner (D-33): email bỏ khoảng trắng và viết thường, chỉ giữ hash BCrypt của mật khẩu sau khi khởi động. Admin không có dòng `app_user`, không sở hữu tài khoản, thư, ghi chú hay việc nào.
**LÝ DO:** người đọc thư và người vận hành là hai vai khác nhau. Một phiên owner bị lộ không được kèm quyền vận hành, và khi Sino có nhiều người dùng thì người vận hành không được là một người dùng có hộp thư.
**Phương án bị loại:** (A) owner kiêm admin (thêm role `ADMIN` cho owner): gọn nhất nhưng trộn hai vai, cookie "ghi nhớ" 30 ngày của owner thành cookie vận hành; (B) admin là `app_user` có cột role: cần migration và màn quản lý admin cho một việc chưa có. Khi Sino có đăng ký nhiều người, owner và admin cùng chuyển vào database (hoặc SSO); cấu hình hôm nay chỉ là chỗ đứng tạm như owner.

### D-261 — Admin tùy chọn; cấu hình sai thì dừng khởi động · **Agent chốt**
- Không đặt `sino.admin.email` (hoặc để trống): không có admin, app chạy như cũ. `.env` hiện có của người dùng và của các phiên khác không phải sửa.
- Có email: mật khẩu phải có ít nhất 12 ký tự (như owner, D-33), email phải khác email owner, email phải đúng dạng. Có mật khẩu mà không có email cũng là lỗi (cấu hình dở dang không được im lặng bỏ qua). Thông báo lỗi chỉ nêu tên cấu hình, không bao giờ in giá trị (như `LoginSettings`).
**Phương án bị loại:** bắt buộc có admin (mọi `.env` và mọi máy chạy test đều phải sửa ngay cho một tính năng chưa có giao diện).

### D-262 — Đăng nhập dùng chung `POST /api/auth/login`; admin không có "ghi nhớ đăng nhập"; `GET /api/admin/me` · **Agent chốt**
- `UserDetailsService` biết hai người: owner (role `OWNER`) và admin (role `ADMIN`, khi có). Cùng endpoint, cùng phiên cookie, cùng CSRF, cùng khóa tạm theo email (D-35), cùng cách so một hash giả khi email lạ.
- `keepSignedIn: true` của admin bị **bỏ qua**: không bao giờ có cookie `remember-me` cho admin. Dịch vụ remember-me vẫn chỉ biết owner, nên một cookie giả mạo tên admin cũng không đăng nhập được.
- `GET /api/auth/me` (của web owner) với phiên admin trả `401 UNAUTHORIZED` như chưa đăng nhập: web owner sẽ mời đăng nhập lại, không mở giao diện owner cho admin. Admin hỏi mình là ai qua `GET /api/admin/me` → `{ "email": "…" }`.
- Đăng xuất: `POST /api/auth/logout` như owner.
**Phương án bị loại:** endpoint và chain đăng nhập riêng cho admin (lặp lại phiên, CSRF, khóa tạm); admin có "ghi nhớ" 30 ngày (một cookie bị lộ cho quyền vận hành cả tháng); thêm `role` vào `GET /api/auth/me` (web owner phải tự hiểu role để khỏi mở giao diện cho admin).

### D-263 — Tách quyền ở security chain: `/api/admin/**` chỉ `ADMIN`; `/api/**` khác: đã đăng nhập và không phải `ADMIN` · **Agent chốt**
Thứ tự trong chain trình duyệt: các đường công khai như cũ → `/api/admin/**` `hasRole("ADMIN")` → `/api/**` `allOf(authenticated, not(hasRole("ADMIN")))`. Người gọi sai vai nhận `403 FORBIDDEN` (handler sẵn có); chưa đăng nhập nhận `401`.
**LÝ DO của dạng "không phải ADMIN" (danh sách cấm) thay vì "phải là OWNER" (danh sách cho phép):** ở MVP mọi principal không phải admin đều là owner (D-02 A, `OwnerCurrentUser`). Khoảng 50 chỗ trong test và test của hai phiên song song tạo principal bằng `user(...)` với role `USER`; đổi sang danh sách cho phép thì tất cả cùng đỏ, và các phiên kia đỏ khi rebase. Khi Sino có nhiều người dùng và role thật, đổi `/api/**` sang `hasRole("OWNER")`/`hasRole("USER")` và sửa test một lần (ghi ở Risks).
**Phương án bị loại:** `hasRole("OWNER")` ngay (đổi test hàng loạt, đụng file của phiên khác); kiểm trong `CurrentUser` (lớp nghiệp vụ, dễ quên ở endpoint mới, và endpoint không gọi `CurrentUser` sẽ lọt).
Role là chữ `"ADMIN"` / `"OWNER"` ở hai nơi (`identity` cấp, `common` kiểm) vì `common` không được phụ thuộc `identity`; test bảo mật giữ hai nơi khớp nhau.

### D-264 — Đợt này chỉ đọc, chỉ metadata; không bao giờ trả nội dung · **Agent chốt**
API admin trả: người dùng (email, tên hiển thị, trạng thái, ngày tạo, số tài khoản), tài khoản kết nối (nhà cung cấp, địa chỉ, trạng thái, bật đồng bộ, ngày kết nối, số thư đã lưu, tình trạng nhập thư / đồng bộ / thông báo đẩy kèm mã lỗi), con số tổng. **Không** trả: tiêu đề, nội dung, người gửi, người nhận, tệp đính kèm, ghi chú, việc, lịch, token, ID của nhà cung cấp.
**LÝ DO:** đủ để biết "cái gì đang hỏng" mà không cần nhìn vào thư; đúng Limited Use của Google (người vận hành không đọc dữ liệu Gmail). Mã lỗi là mã của Sino (`AUTH_EXPIRED`, `RATE_LIMITED`…), không chứa dữ liệu thư.
**Phương án bị loại:** thao tác ghi ngay (khóa người dùng, đồng bộ hộ, gỡ tài khoản hộ): với một người dùng, owner tự làm được ở màn Tài khoản; khóa người dùng chỉ có nghĩa khi có đăng ký nhiều người, và đăng nhập hiện không đọc `app_user.status`. "Gửi lại sự kiện lỗi" của Spring Modulith: mọi listener của Sino là `@EventListener` đồng bộ, bảng `event_publication` không có gì để gửi lại.

### D-265 — `admin` đọc qua ba public API mới; mỗi tài khoản một lần đọc · **Agent chốt**
- `identity.UserDirectory.allUsers()` → `UserSummary(id, email, displayName, status, createdAt)`, cũ nhất trước. `status` là chữ (`ACTIVE` / `DISABLED`) để không phải đưa `UserStatus` ra base package.
- `account.AccountRoster.allAccounts()` → `AccountListing(id, ownerId, provider, status, address, syncEnabled, createdAt)`: mọi tài khoản chưa gỡ của mọi owner, cũ nhất trước. Tách khỏi `AccountDirectory` vì `AccountDirectory` là cách các module đọc tài khoản **của một owner** cho việc của owner; danh sách cho người vận hành là một vai khác. Không thêm trường vào `AccountSummary` (bản ghi đang được tạo trong test của bốn file khác).
- `sync.SyncStatuses.statusOf(accountId)` → `AccountSyncStatus(importStatus, importError, lastSyncAt, syncError, push)`: `importStatus` là `NONE` khi chưa từng nhập, rồi `RUNNING` / `DONE` / `FAILED`; `push` tính đúng như `GET /api/accounts/{id}/sync` (`ACTIVE` / `FAILED` / `OFF`), dùng chung một chỗ tính.
- `conversation.ConversationStats.storedMessages(accountId)` có sẵn.
- Đọc tình trạng đồng bộ và số thư **từng tài khoản một** (2 truy vấn mỗi tài khoản). Với một người dùng vài tài khoản là không đáng kể; khi lên hàng trăm tài khoản thì thêm cách đọc theo lô (ghi ở Risks).
**Phương án bị loại:** `admin` đọc SQL thẳng các bảng của module khác (phá ranh giới, `ModularityTests` không bắt được SQL); thêm `allAccounts()` vào `AccountDirectory` (trộn hai vai, thiếu địa chỉ).

### D-266 — Giao diện admin và nội dung landing ngoài change này · **Agent chốt** (theo hướng người dùng nêu)
- Web admin: project riêng, làm sau (người dùng, 2026-10-13). API ở đây là JSON thuần, không giả định giao diện.
- **Điều kiện cho web admin sau này:** phiên là cookie `JSESSIONID` `SameSite=Lax` và CSRF đọc từ cookie `XSRF-TOKEN`. Web admin nên chạy **cùng site** với API (cùng tên miền gốc, gọi `/api` qua cùng reverse proxy, hoặc proxy `/api` như Vite của `sino-web` khi dev). Nếu đặt ở một origin khác hẳn thì phải mở CORS có credentials và đổi `SameSite`: là một quyết định riêng lúc làm web admin.
- Nội dung landing (`apps/sino-site`): chữ đang nằm trong code, Privacy / Terms phải giữ URL đã khai với Google và giữ lịch sử phiên bản. Quyết lúc site đã lên mạng, ưu tiên xem một headless CMS có sẵn thay vì tự viết (đã bàn 2026-10-13).

### Chốt kỹ thuật (agent, trong phạm vi trên)
- Hình dạng trả về theo quy ước sẵn có: `{ generatedAt, users: [...] }`, `{ generatedAt, accounts: [...] }`; thời điểm theo ISO-8601 UTC; `generatedAt` từ bean `Clock`.
- `provider` là `ProviderType.value()` (như API tài khoản của owner, ví dụ `gmail`); `status` của tài khoản là tên `AccountStatus`.
- `accountsByStatus` trong tổng quan luôn có đủ năm trạng thái (`0` khi không có), để giao diện không phải đoán khóa nào có.
- "Tài khoản có lỗi đồng bộ" = `importStatus` là `FAILED`, hoặc có `syncError`, hoặc `push` là `FAILED`.
- Không phân trang: một người dùng, vài tài khoản. Thêm khi có đăng ký nhiều người.

## Backend design

### 1. Module và package

```text
dev.sino.admin                       (mới, không ai phụ thuộc nó)
├── api/AdminController              GET /api/admin/{me,overview,users,accounts}
├── api/*Response                    bản ghi JSON
└── application/AdminQueries         ghép dữ liệu từ các public API dưới đây

dev.sino.identity
├── UserDirectory, UserSummary       (mới, public)
└── application/
    ├── AdminProperties              (mới) sino.admin.email / password
    ├── LoginSettings                + kiểm và băm mật khẩu admin
    ├── LoginConfiguration           UserDetailsService biết owner và admin
    ├── SignInService                + mayStaySignedIn(authentication): chỉ owner
    └── UserDirectoryService         (mới)

dev.sino.account
├── AccountRoster, AccountListing    (mới, public)
└── application/AccountRosterService (mới)

dev.sino.sync
├── SyncStatuses, AccountSyncStatus  (mới, public)
└── application/SyncStatusService    (mới, dùng chung cách tính push với LiveSyncService)

dev.sino.common.security.SecurityConfig   quy tắc theo role (D-263)
```

### 2. Đăng nhập và tách quyền (BE-100)

```text
POST /api/auth/login {email, password, keepSignedIn}
  -> SignInService.authenticate  (khóa tạm theo email, D-35)
  -> UserDetailsService: owner -> ROLE_OWNER | admin -> ROLE_ADMIN | khác -> sai mật khẩu
  -> phiên mới (đổi session ID), SecurityContext vào session
  -> keepSignedIn && mayStaySignedIn(owner) -> cookie remember-me    (admin: không bao giờ)

Chain trình duyệt:
  công khai như cũ (/actuator/health, GET /api/auth/me, POST /api/auth/login, callback kết nối)
  /api/admin/**  -> hasRole ADMIN                       sai vai: 403, chưa đăng nhập: 401
  /api/**        -> authenticated AND NOT hasRole ADMIN
```

### 3. API admin (BE-101)

| Endpoint | Trả về |
|---|---|
| `GET /api/admin/me` | `{ "email": "admin@…" }` (BE-100) |
| `GET /api/admin/overview` | `{ generatedAt, users, accounts, accountsByStatus: { CONNECTED, DEGRADED, AUTH_EXPIRED, ERROR, DISABLED }, accountsWithSyncErrors, storedMessages }` |
| `GET /api/admin/users` | `{ generatedAt, users: [ { id, email, displayName, status, createdAt, accounts } ] }`, cũ nhất trước; `accounts` = số tài khoản chưa gỡ |
| `GET /api/admin/accounts` | `{ generatedAt, accounts: [ { id, ownerId, provider, address, status, syncEnabled, createdAt, storedMessages, sync: { importStatus, importError, lastSyncAt, syncError, push } } ] }`, cũ nhất trước, không có tài khoản đã gỡ |

## Testing

| Tầng | Nội dung |
|---|---|
| Cấu hình (unit, viết test trước) | `LoginSettings`: không có admin; mật khẩu admin ngắn / trống; trùng email owner (cả khác hoa thường, khoảng trắng); có mật khẩu mà không có email; thông báo không chứa giá trị. `UserDetailsService`: admin → `ROLE_ADMIN`, owner → `ROLE_OWNER`, không cấu hình admin thì email admin là lạ |
| Đăng nhập thật (server cổng ngẫu nhiên, client giữ cookie như `AuthApiTests`) | admin đăng nhập → `204`, `GET /api/admin/me` → email; `keepSignedIn` của admin không có cookie `remember-me`; phiên admin: `GET /api/auth/me` → `401`, `GET /api/accounts` và `GET /api/conversations` → `403 FORBIDDEN`; phiên owner: `GET /api/admin/me` → `403`; chưa đăng nhập: `401`; sai mật khẩu admin → `401 INVALID_CREDENTIALS` kèm `remainingAttempts` |
| Public API (Testcontainers PostgreSQL 18) | `UserDirectory`: thứ tự, đủ trường; `AccountRoster`: mọi owner, bỏ tài khoản đã gỡ, thứ tự; `SyncStatuses`: chưa nhập → `NONE`, đang nhập, nhập lỗi kèm mã, đồng bộ lỗi, push `ACTIVE` / `FAILED` / `OFF` |
| API admin (`MockMvc`, `user(...).roles("ADMIN")`) | hai owner, nhiều tài khoản: JSON từng endpoint; đếm theo trạng thái đủ năm khóa; tài khoản đã gỡ không có; không có trường nội dung / token (kiểm cả chuỗi JSON không chứa tiêu đề, nội dung thư mẫu, token mẫu); role khác → `403` |
| Ranh giới | `ModularityTests`: module `admin` chỉ phụ thuộc public API |
| Cổng | `./mvnw -B -ntp verify` trong worktree riêng |

Không chạy mutation cho từng task (luật chung của dự án cho task nhỏ); một lần cho `LoginSettings` + quy tắc chain ở BE-100 vì đây là chỗ bảo mật.

## Risks / Trade-offs

- [Danh sách cấm `NOT ADMIN` trên `/api/**`] → một role mới sau này (ví dụ `SUPPORT`) sẽ vào được API của owner theo mặc định. Chấp nhận khi chỉ có hai role; khi thêm role thứ ba hoặc có nhiều người dùng: đổi sang danh sách cho phép, sửa test `user(...)` một lần. Ghi ở README.
- [Admin cấu hình bằng biến môi trường] → đổi mật khẩu cần khởi động lại; không có nhiều admin. Đủ cho một người vận hành.
- [Không nhật ký thao tác admin] → đợt này chỉ đọc. Khi có thao tác ghi: thêm nhật ký (ai, lúc nào, làm gì) trước khi thêm thao tác.
- [2 truy vấn mỗi tài khoản] → không đáng kể với vài tài khoản; đọc theo lô khi có nhiều người dùng.
- [Admin thấy địa chỉ email của tài khoản kết nối và email người dùng] → cần để vận hành (biết tài khoản nào hỏng); không phải dữ liệu Gmail bị Limited Use giới hạn (lấy qua scope `email`), nhưng vẫn là dữ liệu cá nhân: Privacy của `sino-site` phải nói người vận hành thấy gì khi có admin thật (báo phiên sino-site khi change này archive).
- [Phiên admin dùng chung cookie `JSESSIONID` với owner trên cùng trình duyệt] → đăng nhập vai này thay phiên vai kia (một trình duyệt, một phiên). Chấp nhận; web admin riêng ở tên miền con riêng sẽ có cookie riêng.

## Migration Plan

- Không migration. Thêm `sino.admin.*` (trống mặc định) vào `application.yaml`; `.env.example` thêm hai dòng có chú thích.
- Triển khai: không đặt `SINO_ADMIN_EMAIL` thì không có gì đổi cho owner. Rollback: bỏ hai biến môi trường, hoặc revert commit.

## Definition of Done

- [ ] Scenario của spec `admin-api` và delta `module-boundaries` chạy đúng.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` thấy `admin` và ranh giới đúng.
- [ ] Test sẵn có (owner, web) không phải sửa; owner không thấy thay đổi nào.
- [ ] README (mục admin, biến môi trường), `.env.example`, mục admin trong file kiến thức Phase 0 + `.docx` (`genoffice docs check`), ghi chú `openspec/roadmap.md`.
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có **LÝ DO**; `PROJECT_STATE.md` cập nhật; người dùng xem lại D-260…D-266 rồi mới archive.
