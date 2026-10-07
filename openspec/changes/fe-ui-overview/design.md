# Màn Tổng quan với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO (agent làm từng task nhỏ, kiểm chứng, báo lại rồi dừng); quyết định kiến trúc do người dùng chốt.
> Brainstorm với người dùng 2026-10-07: phạm vi "từng màn, Tổng quan trước, chưa xác thực"; dữ liệu mẫu "kiểu + file mẫu"; website, desktop là chính và co giãn cho thiết bị di động; mỗi màn một change; phần cấu trúc được duyệt ("làm đi").
> Thiết kế giao diện: canvas "Sino UI" https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB, bản sao ở `design/sino-ui/project/` (`Dashboard`, `TabletDashboard`, `MobileDashboard`, `Sidebar`, `Rail`, `TabBar`, `Topbar`, `Breakpoints`, `SiteNotFound`).

## Context

- FE-01 xong (`62289c3`): Tailwind 4 với token của canvas, theme sáng/tối, Button/Input/Label/Switch/DropdownMenu, Vitest + Testing Library + MSW, CI. `src/app/App.tsx` đang là trang tạm.
- Backend đã có: `GET /api/auth/me` (`email`, `displayName`), `GET /api/accounts` (`id`, `provider`, `externalAccountId`, `displayName`, `avatarUrl`, `status`, `syncEnabled`, `lastSyncedAt`, `capabilities`, `createdAt`, `updatedAt`), `GET /api/providers`. `AccountStatus`: `CONNECTED`, `DEGRADED`, `AUTH_EXPIRED`, `ERROR`, `DISABLED`. Provider là chuỗi chữ thường (`gmail`, `zalo`, `messenger`).
- Chưa có: hội thoại (F05), sync (F07), thông báo (F14), việc/lịch (F16, F17), "đăng ký" (không có trong roadmap).

## Decisions

### D-42 — Dựng giao diện trước với dữ liệu mẫu; backend khớp theo hợp đồng dữ liệu · **Accepted** (người dùng, 2026-10-07)
Mỗi màn được dựng trước với dữ liệu mẫu có kiểu; kiểu TypeScript của màn là **hợp đồng dữ liệu** giao backend, backend làm hoặc chỉnh API cho khớp ở một change riêng. Mỗi màn một change OpenSpec. **LÝ DO** (người dùng): thấy và bấm thử sản phẩm sớm; API được thiết kế theo thứ giao diện cần. **Thay** luật "từ F04 mỗi feature là một vertical slice BE + FE" của roadmap (lấy từ Notion 03) cho phần frontend; backend vẫn làm theo change của nó (F04a đang chạy song song, D-41). Phương án bị loại: giữ thứ tự cũ (API client FE-02 trước); một change chung cho mọi màn (kéo dài, không archive được); sửa thẳng `fe-f01-web-foundation` (trộn hai mục tiêu).

### D-43 — Màn đầu tiên là Tổng quan, dù roadmap ghi là vượt MVP · **Accepted** (người dùng, 2026-10-07)
Dựng đủ 7 thẻ của canvas, kể cả "Dịch vụ" và "Đăng ký" (chưa có feature trong roadmap). Việc đưa các màn này vào Notion 01/03 hoặc roadmap là việc của người dùng; change này chỉ dựng giao diện với dữ liệu mẫu.

### D-44 — Web chưa có xác thực trong lúc dựng giao diện · **Accepted** (người dùng, 2026-10-07)
Không trang đăng nhập, không chặn trang, không gọi API. FE-02…FE-05 của `fe-f01-web-foundation` tạm hoãn; backend vẫn đòi đăng nhập (BE-27…BE-29 xong), không ảnh hưởng vì web chưa gọi API. Khi nối API, FE-02…FE-05 làm tiếp và dùng lại khung app của change này.

### Chốt kỹ thuật (agent, trong phạm vi đã duyệt)
- **Đường dẫn tiếng Anh**, giống `/login`, `/accounts` của change 1: `/overview`, `/inbox`, `/calendar`, `/tasks`, `/notes`, `/accounts`, `/services`, `/registrations`, `/settings`, `/notifications`, `/more` (chỉ mobile). `/` → `/overview` (change 1 từng ghi `/` → `/accounts`; FE-04 sẽ theo change này).
- **Màn chưa dựng** hiện trang "Màn này đang được dựng" trong khung app, để điều hướng chạy được và URL chốt từ đầu.
- **Nút đổi sáng/tối** có ở mọi kích thước (canvas chỉ đặt trên desktop); trên tablet và mobile nó nằm ở chỗ của nút ngôn ngữ, vốn bị ẩn.
- **Lời chào** dùng nguyên `displayName` của owner ("Chào buổi chiều, An Nguyễn."); canvas viết "An." nhưng tách tên gọi không chắc đúng với cả tên Việt (tên gọi ở cuối) lẫn tên viết kiểu Tây.

## Frontend design

### Cấu trúc

```text
src/
  main.tsx                    mount + AppProviders + RouterProvider
  app/
    providers.tsx             QueryClient, theme (có từ FE-01)
    router.tsx                bảng route
    shell/                    AppShell, Sidebar, Rail, TabBar, Topbar, navItems.ts
    UnderConstructionPage.tsx "Màn này đang được dựng"
    NotFoundPage.tsx          404 theo SiteNotFound
  features/overview/
    overview.types.ts         HỢP ĐỒNG DỮ LIỆU (OverviewData)
    overview.sample.ts        createOverviewSample(now): dữ liệu mẫu theo đúng kiểu
    useOverview.ts            hook: hiện trả dữ liệu mẫu, sau này gọi API
    format.ts                 đổi dữ liệu thô thành chữ hiển thị (giờ, lời chào, câu tóm tắt)
    OverviewPage.tsx          phần đầu trang + lưới thẻ
    cards/*.tsx               một component cho mỗi thẻ
```

### Khung app theo kích thước

```text
>= 1280px (desktop)   | Sidebar 248 | Topbar 72: tìm kiếm . trạng thái . chuông . sáng/tối |
                      |             | nội dung (lưới 12 cột)                                |
768-1279px (tablet)   | Rail 72 | thanh 64: tên trang . trạng thái . tìm . chuông . sáng/tối |
                      |         | nội dung (lưới 2 cột)                                       |
< 768px (mobile)      | thanh trên: logo . tên trang . tìm . chuông . sáng/tối |
                      | nội dung (1 cột)                                        |
                      | TabBar: Tổng quan . Hộp thư . Lịch . Việc . Thêm       |
```

- Điều hướng chính: Tổng quan, Hộp thư (số chưa đọc), nhóm KẾ HOẠCH (Lịch, Việc cần làm, Ghi chú), nhóm DANH TÍNH (Tài khoản, Dịch vụ, Đăng ký), Cài đặt ở chân, ô người dùng (tên, số tài khoản). Mục đang mở có `aria-current="page"`. Rail chỉ có icon nên mỗi mục có `aria-label` (kèm số đếm, ví dụ "Hộp thư, 12 chưa đọc").
- Số đếm trên điều hướng, tên người dùng, trạng thái đồng bộ và số thông báo lấy từ dữ liệu (`useOverview()`), không viết cứng.

### Hợp đồng dữ liệu (template giao backend)

Nguyên tắc: **API trả dữ liệu thô** (thời điểm ISO-8601 UTC, số đếm, mã enum, ID); **giao diện tự đổi ra chữ** ("09:41", "Hôm qua", "sau 2 giờ", "58%", "Hai tài khoản đang chạy bình thường"). Như vậy API không phụ thuộc ngôn ngữ hay múi giờ hiển thị. Mỗi phần chưa có backend được phép là `null`; thẻ tương ứng hiện "Chưa có dữ liệu", nhờ vậy backend có thể làm `GET /api/overview` từng phần.

```ts
type Instant = string                    // ISO-8601 UTC, ví dụ "2026-10-02T07:05:00Z"
type ProviderType = string               // như API hiện có: "gmail", "zalo", "messenger"
type AccountStatus = 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR' | 'DISABLED'
type Health = 'OK' | 'WARNING' | 'ERROR'

interface OverviewData {
  generatedAt: Instant
  owner: { displayName: string }
  navCounts: { inboxUnread: number; tasksOpen: number; tasksOverdue: number;
               accountsNeedingAction: number; registrationsNew: number }
  unreadNotifications: number
  accounts: OverviewAccount[]
  inbox: InboxSummary | null
  today: TodaySummary | null
  syncActivity: SyncActivity | null
  registrations: RegistrationSummary | null
  activity: ActivityItem[] | null
}

interface OverviewAccount {
  id: string; provider: ProviderType; externalAccountId: string; displayName: string
  status: AccountStatus; lastSyncedAt: Instant | null
  syncProgress: number | null           // 0..100 khi đang đồng bộ lần đầu, null khi không
  statusChangedAt: Instant | null       // ví dụ lúc chuyển sang AUTH_EXPIRED
}

interface InboxSummary {
  unreadCount: number; awaitingReplyCount: number
  bySource: { provider: ProviderType; unreadCount: number }[]
  conversations: { id: string; provider: ProviderType; title: string; subject: string | null
                   memberCount: number | null; snippet: string; lastMessageAt: Instant; unreadCount: number }[]
}

interface TodaySummary {
  items: { id: string; kind: 'TASK' | 'EVENT' | 'REMINDER'; title: string; at: Instant
           done: boolean; conversationTitle: string | null }[]
  tomorrow: { firstEvent: { title: string; at: Instant } | null; taskCount: number }
}

interface SyncActivity {
  buckets: { start: Instant; messages: number; health: Health }[]   // 24 giờ, mỗi giờ một ô
  providers: { provider: ProviderType; health: Health; since: Instant | null }[]
}

interface RegistrationSummary {
  total: number; updatedAt: Instant
  byMethod: { method: string; count: number }[]                     // "google", "email", "facebook", "zalo"
  latest: { siteName: string; domain: string; method: string; detectedAt: Instant; isNew: boolean } | null
}

type ActivityItem =
  | { id: string; at: Instant; kind: 'SYNC_RECOVERED'; provider: ProviderType; downtimeMinutes: number }
  | { id: string; at: Instant; kind: 'REGISTRATION_DETECTED'; siteName: string; method: string }
  | { id: string; at: Instant; kind: 'AUTH_EXPIRED'; provider: ProviderType }
  | { id: string; at: Instant; kind: 'ACCOUNT_CONNECTED'; provider: ProviderType; externalAccountId: string }
```

Giao diện tự suy ra (không cần API trả): lời chào theo giờ, dòng ngày giờ, câu tóm tắt tài khoản, "4 việc · 1 lịch hẹn", việc quá hạn (`at` đã qua và `done = false`), tỷ lệ % theo nguồn, chiều cao cột biểu đồ, tổng thư 24 giờ (cộng các ô), trạng thái đồng bộ chung trên thanh trên cùng (xấu nhất trong các tài khoản) và thời điểm đồng bộ gần nhất.

#### Đối chiếu với API hiện có

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `owner.displayName` | `GET /api/auth/me` | **đã có** |
| `accounts[].id, provider, externalAccountId, displayName, status, lastSyncedAt` | `GET /api/accounts` | **đã có** |
| `accounts[].syncProgress` | đồng bộ lần đầu (F07) | **cần thêm** |
| `accounts[].statusChangedAt` | `connected_account` (thời điểm đổi trạng thái; event `AccountStatusChanged` đã có) | **cần thêm** |
| `inbox` | hội thoại (F05) | **API mới** |
| `today` | việc, nhắc nhở, lịch (F16, F17) | **API mới** |
| `syncActivity` | `sync_run` (F07) | **API mới** |
| `registrations` | chưa có feature (D-43) | **API mới**, cần quyết phạm vi |
| `activity` | nhật ký sự kiện (`AccountConnected`, `AccountStatusChanged` đã có; sự kiện sync ở F07) | **API mới** |
| `navCounts`, `unreadNotifications` | đếm từ F05, F14, F16 | **API mới** |
| hiển thị `externalAccountId` | — | chưa quyết: che số điện thoại ("+84 9•• ••• 218") ở backend hay giao diện; dữ liệu mẫu dùng sẵn dạng đã che |

Đề xuất cho backend (quyết ở change backend): một endpoint gộp `GET /api/overview` trả `OverviewData`, mỗi phần chưa làm trả `null`.

### Nút và liên kết
- Dẫn tới màn khác: "Mở hộp thư" → `/inbox`, "Mở lịch" → `/calendar`, "Xem tất cả" (hoạt động) → `/notifications`, chuông → `/notifications`, mục điều hướng → đường dẫn của nó.
- Chưa làm gì (đúng như canvas, có `type="button"`): "Đồng bộ ngay", "Kết nối tài khoản", "Đăng nhập lại", "Xem lại", các lối tắt, ô tìm kiếm.

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | `format.ts`: lời chào theo giờ (sáng/trưa/chiều/tối), dòng ngày giờ "THỨ SÁU · 02/10/2026 · 14:05", giờ tương đối ("09:41" trong ngày, "Hôm qua", "30/09"), "sau 2 giờ", tỷ lệ % theo nguồn (tổng 0 không chia cho 0), câu tóm tắt tài khoản, câu cho từng loại hoạt động, số thành chữ ("Hai"); `createOverviewSample(now)` khớp kiểu và có mốc thời gian tương đối theo `now` |
| Component (Testing Library) | khung app: đủ mục điều hướng, mục đang mở có `aria-current`, số đếm từ dữ liệu; trang "đang được dựng"; 404; `/` → `/overview`; màn Tổng quan: mỗi thẻ hiện dữ liệu mẫu; phần `null` → "Chưa có dữ liệu"; nút dẫn trang mở đúng route |
| Trình duyệt thật | Chrome qua DevTools Protocol trên bản build: 1440, 1024, 390px × sáng, tối; không tràn ngang; đi qua điều hướng bằng phím Tab có viền focus; ảnh chụp so với canvas |
| Cổng | `pnpm lint`, `pnpm test`, `pnpm build` |

Thời gian: component nhận `now` từ một hook đồng hồ (`useNow`), test truyền một thời điểm cố định nên kết quả không phụ thuộc ngày chạy. Dữ liệu mẫu sinh theo `now` (ví dụ "4 giờ trước") nên màn trông thật vào bất kỳ ngày nào.

## Risks / Trade-offs

- [Giao diện đòi dữ liệu backend khó có] → bảng đối chiếu ở trên là chỗ thảo luận trước khi làm API; phần nào bất khả thi thì sửa giao diện ở change sau.
- [Màn vượt MVP (Dịch vụ, Đăng ký) tốn công khi chưa có feature] → người dùng chấp nhận (D-43); chỉ dựng giao diện, không làm backend.
- [Hai change cùng mở cho frontend (`fe-f01-web-foundation` chờ, change này)] → `tasks.md` của change 1 ghi rõ phần tạm hoãn và việc dùng lại khung app.
- [Đường dẫn `/` đổi so với change 1] → ghi ở mục chốt kỹ thuật; FE-04 theo change này.

## Definition of Done

- [ ] Khung app, router, trang "đang được dựng", 404 chạy đúng các scenario của spec `web-app-shell`.
- [ ] Màn Tổng quan đúng các scenario của spec `overview-screen` ở 3 kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu cập nhật theo code thật.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức trong `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật; change archive.
