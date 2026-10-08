# Màn Tài khoản với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO; quyết định kiến trúc do người dùng chốt.
> Brainstorm với người dùng 2026-10-08: phạm vi "danh sách + chi tiết", tương tác "chạy trên dữ liệu mẫu"; thiết kế được duyệt ("oke duyệt"). Người dùng chọn dựng giao diện trước, nghiệm thu để sau.
> Thiết kế giao diện: canvas "Sino UI" (thiết kế cuối cùng), bản sao `design/sino-ui/project/`: `Accounts`, `AccountDetail`, `MobileAccounts`, `MobileAccountDetail`, `Overlays` (modal ngắt kết nối), `MobileMore`. Đối chiếu link ngày 2026-10-08: phiên bản `1790948862-287a`, trùng bản sao.

## Context

- Đã có từ `fe-ui-overview`: khung app co giãn, router, `ShellData`, dữ liệu mẫu qua TanStack Query, hàm giờ theo múi giờ (`src/shared/time/local.ts`), `formatAgo`, `Status`, `Avatar`, `ProviderIcon`, `Card`/`Spec` (của màn Tổng quan).
- Backend: `GET /api/accounts` trả `AccountResponse` (`id`, `provider`, `externalAccountId`, `displayName`, `avatarUrl`, `status`, `syncEnabled`, `lastSyncedAt`, `capabilities`, `createdAt`, `updatedAt`); `PATCH /api/accounts/{id}` (`displayName`, `enabled`); `DELETE /api/accounts/{id}` (xóa mềm, D-13 = B); `GET /api/providers` (`type`, `displayName`, `capabilities`). Capability: `READ_MESSAGES`, `SEND_MESSAGES`, `ATTACHMENTS`, `MARK_READ`, …

## Decisions

### D-45 — Tương tác của màn chạy trên dữ liệu mẫu · **Accepted** (người dùng, 2026-10-08)
Tìm, lọc, mở chi tiết, bật/tắt kênh và ngắt kết nối chạy thật trên dữ liệu mẫu trong cache TanStack Query (mất khi tải lại trang). Mỗi thay đổi đi qua một hàm mutation (`useSetChannel`, `useDisconnectAccount`); khi nối API chỉ đổi thân hàm sang `PATCH`/`DELETE`. Các nút thuộc luồng chưa làm (kết nối, đăng nhập lại, đồng bộ) vẫn chưa làm gì. Phương án bị loại: chỉ lọc và mở chi tiết; chỉ hiện như ảnh tĩnh.

### D-46 — Change này gồm danh sách và chi tiết; luồng kết nối là change riêng · **Accepted** (người dùng, 2026-10-08)
`ConnectWizard` (5 bước) làm cùng BE-31 (bắt đầu kết nối OAuth) để giao diện và luồng OAuth khớp nhau. Phương án bị loại: chỉ danh sách; cả ba trong một change.

### Chốt kỹ thuật (agent, trong phạm vi đã duyệt)
- **Đường dẫn:** `/accounts`, `/accounts/:accountId`. Mục "Tài khoản" của điều hướng sáng ở cả hai (`NavLink` khớp theo tiền tố).
- **Mobile:** danh sách nằm dưới tab "Thêm" (`MobileAccounts` có `TabBar` với "Thêm" sáng); tab "Thêm" sáng cho mọi màn dưới "Thêm" (`/more`, `/notes`, `/accounts`, `/services`, `/registrations`, `/notifications`, `/settings`, theo `MobileMore`). Trang con trên mobile tự vẽ đầu trang (`MobilePageHeader`: nút quay lại, tiêu đề, dòng phụ, nút phụ tùy chọn); route khai báo `handle: { mobilePageHeader: true }` để khung app ẩn thanh trên của mobile, và `handle: { hideTabBar: true }` cho trang chi tiết (`MobileAccountDetail` không có `TabBar`). Tablet và desktop giữ thanh trên của khung app.
- **Tìm kiếm không phân biệt dấu và hoa thường**: "nguyen" tìm ra "Nguyễn"; tìm trong `externalAccountId`, `displayName`, tên nhà cung cấp.
- **Cột "Dịch vụ"** = số kênh đang bật của tài khoản (canvas: Gmail 3 ↔ "Kênh đã kết nối · 3 bật · 1 tắt").
- **Kênh chưa có quyền** (`available = false`, ví dụ Danh bạ "cần thêm quyền"): công tắc tắt và không bấm được, vì bật nó cần xin thêm quyền (thuộc luồng kết nối).
- **Ngắt kết nối thành công**: tài khoản biến khỏi danh sách, quay về `/accounts`. Tùy chọn "Xóa luôn tin nhắn đã lưu" được gửi theo mutation (dữ liệu mẫu chỉ ghi nhận).

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô (thời điểm UTC, số, mã), giao diện tự đổi ra chữ. Các phần chưa có backend được phép `null` → "Chưa có dữ liệu".

```ts
type Instant = string           // ISO-8601 UTC
type ProviderType = string      // "gmail", "zalo", "messenger"
type AccountStatus = 'CONNECTED' | 'DEGRADED' | 'AUTH_EXPIRED' | 'ERROR' | 'DISABLED'
type ChannelKind = 'INBOUND' | 'SEND' | 'ATTACHMENTS' | 'CONTACTS'

// Danh sách: GET /api/accounts (mở rộng)
interface AccountsData {
  generatedAt: Instant
  providers: { type: ProviderType; displayName: string }[]
  accounts: AccountItem[]
  storedMessages: number                  // "Đã lưu 3.912 thư và tin nhắn"
}

interface AccountItem {
  // đã có trong AccountResponse
  id: string
  provider: ProviderType
  externalAccountId: string
  displayName: string
  avatarUrl: string | null
  status: AccountStatus
  syncEnabled: boolean
  lastSyncedAt: Instant | null
  createdAt: Instant
  // cần thêm
  syncProgress: number | null             // 0..100 khi đang đồng bộ lần đầu
  statusChangedAt: Instant | null
  access: { expiresAt: Instant | null; autoRenew: boolean; lastRenewedAt: Instant | null }
  storedMessages: number
  syncIntervalMinutes: number | null
  channels: { kind: ChannelKind; available: boolean; enabled: boolean }[]
}

// Chi tiết: hàng tài khoản lấy từ danh sách; phần thêm dưới đây từ GET /api/accounts/{id} (mở rộng) — mỗi phần có thể null
interface AccountExtras {
  scopes: { code: string; granted: boolean }[] | null          // "gmail.readonly"…
  sites: { total: number; items: { name: string; domain: string; method: string; sensitive: boolean; since: Instant }[] } | null
  syncRuns: { at: Instant; result: 'OK' | 'SLOW' | 'FAILED'; messages: number; durationMs: number }[] | null
  activity: AccountActivity[] | null
}

type AccountActivity =
  | { id: string; at: Instant; kind: 'SCOPE_GRANTED'; scope: string }
  | { id: string; at: Instant; kind: 'SITES_DETECTED'; count: number; method: string }   // "tài khoản Google này"
  | { id: string; at: Instant; kind: 'ACCOUNT_CONNECTED'; initialMessages: number; durationMinutes: number }
  | { id: string; at: Instant; kind: 'AUTH_EXPIRED' }

// Thay đổi (mutation)
setChannel(accountId, kind, enabled)          // PATCH /api/accounts/{id} { channels: { INBOUND: false } }
disconnect(accountId, { deleteMessages })     // DELETE /api/accounts/{id}?deleteMessages=true|false
```

Giao diện tự suy ra: chữ trạng thái đồng bộ ("Đang hoạt động", "Đang đồng bộ · 64%", "Tạm dừng"…), "lần cuối" ("2 phút trước", "Hôm qua, 21:04"), sức khỏe ("Tốt · quyền tự gia hạn", "Quyền hết hạn sau 5 ngày", "Cần đăng nhập lại"), dải tóm tắt, cảnh báo, số kênh đang bật, nhãn quyền từ mã (`gmail.readonly` → "Đọc thư và nhãn"; mã lạ hiện nguyên mã), câu hoạt động.

### Đối chiếu với API hiện có

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `id`, `provider`, `externalAccountId`, `displayName`, `avatarUrl`, `status`, `syncEnabled`, `lastSyncedAt`, `createdAt` | `GET /api/accounts`, `GET /api/accounts/{id}` | **đã có** |
| `providers` | `GET /api/providers` | **đã có** |
| `syncProgress`, `statusChangedAt` | như màn Tổng quan | **cần thêm** |
| `access` (hạn quyền, tự gia hạn) | `account_credential` (hạn token; refresh ở F04b, D-15) | **cần thêm** |
| `storedMessages` (từng tài khoản và tổng) | đếm tin đã lưu (F05) | **cần thêm** |
| `syncIntervalMinutes` | lịch đồng bộ (F07) | **cần thêm** |
| `channels` | capability của provider (đã có) + quyền đã cấp + cờ bật/tắt mới | **cần thêm** |
| `setChannel` | `PATCH /api/accounts/{id}` hiện chỉ nhận `displayName`, `enabled` | **cần thêm** trường `channels` |
| `disconnect` | `DELETE /api/accounts/{id}` | **đã có**; tham số `deleteMessages` **cần thêm** (số phận tin đã lưu là việc của F05) |
| `scopes` | scope OAuth đã cấp (F04a) | **API mới** |
| `sites` | "đăng ký" (chưa có feature, D-43) | **API mới** |
| `syncRuns` | `sync_run` (F07) | **API mới** |
| `activity` | nhật ký sự kiện tài khoản (`AccountConnected`, `AccountStatusChanged` đã có) | **API mới** |

## Frontend design

```text
src/features/accounts/
  accounts.types.ts        hợp đồng (AccountsData, AccountItem, AccountExtras…)
  accounts.sample.ts       createAccountsSample(now), createAccountExtrasSample(id, now)
  accounts.api.ts          fetchAccounts, fetchAccountExtras, saveChannel, deleteAccount: chỗ duy nhất đổi khi nối API
  useAccounts.ts           useAccounts(), useAccount(id), useSetChannel(), useDisconnectAccount()
  format.ts                chữ trạng thái, lần cuối, sức khỏe, tóm tắt, lọc + tìm không dấu, nhãn quyền, câu hoạt động
  AccountsPage.tsx         danh sách (bảng trên desktop/tablet, danh sách gọn trên mobile)
  AccountDetailPage.tsx    chi tiết + hộp thoại ngắt kết nối
  components/*             các khối của hai trang
src/app/shell/MobilePageHeader.tsx, src/shared/ui/dialog.tsx
```

Bố cục: danh sách theo `.page` (desktop padding 32, tablet 24, mobile theo `mob-scroll`); bảng `tbl-acc2` 7 cột trên desktop và tablet (rộng tối thiểu 896px, hẹp hơn thì bảng cuộn ngang trong khung của nó); mobile dùng `list-group`. Chi tiết: lưới 12 cột từ tablet (thẻ 7 / 5 như canvas), một cột trên mobile theo `MobileAccountDetail` (khối nhận diện, cảnh báo khi cần đăng nhập lại, danh sách kênh, đồng bộ, nút ngắt kết nối).

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | lọc "Cần xử lý", tìm không dấu, chữ trạng thái, lần cuối, sức khỏe, dải tóm tắt, cảnh báo, số kênh bật, nhãn quyền, câu hoạt động, thời lượng ("3,1 s"); dữ liệu mẫu nhất quán; mutation sửa cache đúng tài khoản |
| Component | khung app: tab "Thêm" sáng ở các màn dưới "Thêm", trang con trên mobile ẩn thanh trên của khung app, trang chi tiết ẩn thanh dưới; `Dialog` mở/đóng, có tên, Esc đóng; danh sách: tìm, lọc, mở chi tiết; chi tiết: bật/tắt kênh, ngắt kết nối (hủy → còn; xác nhận → mất khỏi danh sách, về `/accounts`); phần `null` → "Chưa có dữ liệu" |
| Trình duyệt thật | Chrome, đồng hồ cố định như màn Tổng quan, 1440 / 1024 / 390px × sáng / tối; Tab có viền focus; hộp thoại bẫy focus |
| Cổng | `pnpm lint`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Hợp đồng đòi nhiều thứ backend chưa có] → các phần chi tiết được phép `null`; bảng đối chiếu là chỗ thương lượng trước khi làm API.
- [Thay đổi mất khi tải lại trang] → chấp nhận (D-45); đó là dữ liệu mẫu.
- [`web-app-shell` thêm requirement ở change chưa archive] → archive `fe-ui-overview` trước `fe-ui-accounts`.

## Definition of Done

- [ ] Các scenario của spec `accounts-screen` và requirement mới của `web-app-shell` chạy đúng ở 3 kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật; change archive (sau `fe-ui-overview`).
