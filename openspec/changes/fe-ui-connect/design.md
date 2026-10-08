# Luồng kết nối tài khoản với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO.
> **Quyết định do agent chốt theo ủy quyền của người dùng** (2026-10-08: "viết và dựng luôn đi không cần hỏi tôi"). Các quyết định D-47…D-50 dưới đây ghi rõ phương án bị loại để người dùng xem lại; đổi ý thì chỉ phần web phải sửa, backend F04a không đổi.
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `ConnectWizard` (5 bước, `ConnectWizardStep2…5` chỉ đặt sẵn số bước), `Overlays` ("Modal / Connect Account · bước 1"). Canvas không vẽ bản mobile của hộp thoại.

## Context

- **Backend F04a** (`openspec/changes/f04a-gmail-connect/design.md`, người dùng duyệt 2026-10-07): `POST /api/accounts/connect/{provider}` (body `{"accountId"}` tùy chọn khi kết nối lại) → `200 {"authorizationUrl"}`; web chuyển **cả trang** tới đó (`window.location.assign`); Google gọi callback; backend trả `302 /accounts?connected={accountId}` hoặc `302 /accounts?connectError={CODE}`. Scope cố định `openid`, `email`, `gmail.readonly`; quyền gửi xin sau (F10). Cửa sổ nhập thư ban đầu chốt ở F04b. BE-31 xong; BE-32 (callback) chưa.
- **Canvas `ConnectWizard`** vẽ một luồng khác ở ba chỗ: bước 2 mở *cửa sổ bật lên* của Google rồi chờ ("Đang chờ bạn đăng nhập… · Mở lại cửa sổ"); bước 3 *xem lại quyền sau khi đã đăng nhập*, có công tắc "Gửi thư thay bạn · tùy chọn"; bước 4 chọn khoảng đồng bộ.
- **Web đã có** (`fe-ui-accounts`): trang Tài khoản, `Dialog`, `useAccounts`, `accounts.api.ts` (chỗ duy nhất đổi khi nối API), dữ liệu mẫu ba tài khoản.

## Decisions

### D-47 — Thứ tự bước theo luồng chuyển trang của F04a · **Agent chốt** (ủy quyền, 2026-10-08)
Bước: **1 · Nhà cung cấp → 2 · Quyền → 3 · Đăng nhập → (quay về) 4 · Đồng bộ → 5 · Xong**. Ở bước 3, nút "Tiếp tục tới Google" gọi bắt đầu kết nối rồi rời Sino; khi quay về `?connected=`, hộp thoại tự mở lại ở bước 4.
**LÝ DO:** quyền được xin *trong* yêu cầu gửi sang Google, nên xem lại quyền chỉ có nghĩa *trước* khi đăng nhập; chuyển cả trang là luồng backend đã duyệt (không bị trình duyệt chặn cửa sổ bật lên, callback trả `302` đơn giản).
**Phương án bị loại:** (a) cửa sổ bật lên như canvas — phải đổi backend (callback trả trang tự đóng và báo về bằng `postMessage`), dễ bị trình chặn popup; (b) giữ thứ tự canvas — bước "xem lại quyền" sau khi đã cấp ở Google không còn quyết định được gì.
Nội dung bước 3 lấy từ bước 2 của canvas (hình hai đầu nối, "Đăng nhập bằng Google", "Sino không bao giờ thấy mật khẩu của bạn"); bỏ phần "Đang chờ… / Mở lại cửa sổ".

### D-48 — Không có công tắc "Gửi thư · tùy chọn" lúc kết nối · **Agent chốt**
Bước Quyền liệt kê đúng các quyền sẽ xin (từ dữ liệu `scopes` của provider), mỗi quyền một câu "để làm gì", và câu "Sino không xin quyền xóa thư, đổi cài đặt Gmail hay đọc danh bạ."
**LÝ DO:** F04a xin `openid`, `email`, `gmail.readonly`; quyền gửi xin thêm ở F10. **Phương án bị loại:** hiện công tắc bị khóa — gợi ý một lựa chọn không tồn tại.

### D-49 — Bước Đồng bộ là đề xuất hợp đồng cho F04b · **Agent chốt**
Tùy chọn theo canvas: khoảng nhập "30 ngày gần nhất / 90 ngày gần nhất (mặc định) / Toàn bộ hộp thư", "Dùng nhãn Gmail làm bộ lọc trong Sino", "Chỉ tải tệp đính kèm khi bạn mở"; dải ước tính "khoảng N thư · a–b phút" (không có ước tính thì ẩn). "Bắt đầu đồng bộ" gửi tùy chọn qua mutation `startInitialSync` (dữ liệu mẫu) và sang bước Xong với tiến độ "412 / 1.180 thư · còn khoảng 3 phút".
**LÝ DO:** canvas là thiết kế cuối cùng; F04b chưa chốt cửa sổ nhập thư, nên đây là đề xuất có hình dạng cụ thể để F04b nhận hoặc sửa. **Phương án bị loại:** bỏ bước 4 tới F04b — luồng 5 bước của canvas bị hụt, và F04b mất một đề xuất cụ thể.

### D-50 — Nhà cung cấp chưa kết nối được hiện "Sắp có", theo dữ liệu · **Agent chốt**
Mỗi provider trong danh mục có `connectable`; chỉ provider `connectable` chọn được. Dữ liệu mẫu: Gmail chọn được; Zalo, Messenger, Google (danh tính, "Đăng ký"), Telegram hiện "Sắp có".
**LÝ DO:** chỉ connector Gmail có luồng OAuth; Zalo và Messenger cần spike trước F09 (chưa có API chính thức cho hộp thư cá nhân); danh tính Google gắn với màn Đăng ký (chưa có feature). Canvas vẽ ba cái đầu chọn được, nhưng chọn xong các bước sau (đăng nhập Google, quyền Gmail) sẽ sai. Khi có connector, backend bật `connectable` là đủ.

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Trạng thái hộp thoại** nằm ở trang Tài khoản (bước hiện tại, provider đã chọn, `accountId` khi kết nối lại, tài khoản vừa kết nối); mở/đóng điều khiển được (`open`, `onOpenChange`) để trang mở hộp từ nhiều nút và từ tham số URL.
- **Nút mở:** "Kết nối tài khoản" (desktop, mobile), "+" (đầu trang mobile) → bước 1. "Đăng nhập lại" (cảnh báo trên danh sách, trang chi tiết, ô cảnh báo mobile) → chuyển tới `/accounts?reconnect={id}`, trang Tài khoản mở hộp ở bước 2 với provider của tài khoản đó; nút này trên trang chi tiết vì thế cũng dùng chung một hộp thoại.
- **Rời trang:** `leaveTo(url)` trong `accounts.api.ts` (`window.location.assign`). Dữ liệu mẫu trả `authorizationUrl = /accounts?connected=acc-gmail` (kết nối mới) hoặc `/accounts?connected={accountId}` (kết nối lại). Test thay `leaveTo` bằng hàm giả.
- **Đọc kết quả quay về:** `useSearchParams`; xử lý xong thì `setSearchParams` bỏ tham số với `replace: true` (không thêm mục lịch sử; tải lại không hiện lại). `connected` trỏ tới tài khoản không có trong danh sách → bỏ qua.
- **Mobile:** hộp thoại chiếm gần hết bề ngang (lề 16px), cuộn được bên trong khi thấp; thanh bước giữ 5 ô.

## Hợp đồng dữ liệu bổ sung (template giao backend)

```ts
// GET /api/providers (mở rộng): mỗi provider
interface ConnectableProvider extends ProviderInfo {   // ProviderInfo = { type, displayName }
  capabilities: string[]        // đã có: READ_MESSAGES, SEND_MESSAGES, ... -> nhãn "Đọc", "Gửi"
  connectable: boolean          // cần thêm: có luồng kết nối (connector OAuth2)
  scopes: string[]              // cần thêm: quyền sẽ xin khi kết nối, mã ngắn như trang chi tiết
                                // ("gmail.readonly", "userinfo.email"); scope kỹ thuật "openid" không gửi
}

// Bắt đầu kết nối: đã có (BE-31)
startConnect(provider, accountId?) -> { authorizationUrl }      // POST /api/accounts/connect/{provider}

// Quay về: đã chốt (BE-32)
/accounts?connected={accountId} | /accounts?connectError={CODE}

// Ước tính cho bước Đồng bộ: API mới (F04b), null = không có ước tính
syncEstimate(accountId, range) -> { messages: number; minMinutes: number; maxMinutes: number } | null

// Bắt đầu lần đồng bộ đầu: API mới (F04b)
type SyncRange = 'DAYS_30' | 'DAYS_90' | 'ALL'
startInitialSync(accountId, { range: SyncRange; labelsAsFilters: boolean; attachmentsOnOpen: boolean })
  -> { fetched: number; total: number | null; remainingMinutes: number | null }
```

Giao diện tự suy ra: nhãn "Đọc / Gửi" từ capability, nhãn quyền và câu "để làm gì" từ mã scope, mô tả provider ("Thư điện tử", "Tin nhắn cá nhân và nhóm"…) từ `type`, thông báo lỗi từ mã `connectError` (bảng của F04a).

### Đối chiếu với API

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `type`, `displayName`, `capabilities` | `GET /api/providers` | **đã có** |
| `connectable` | connector có `oauth2()` (F04a) | **cần thêm** vào `GET /api/providers` |
| `scopes` | `OAuth2Connection.scopes` (F04a) | **cần thêm** vào `GET /api/providers` |
| `startConnect` | `POST /api/accounts/connect/{provider}` | **đã có** (BE-31) |
| `?connected` / `?connectError` | callback (BE-32) | **đã chốt**, chưa làm |
| `syncEstimate` | Gmail `resultSizeEstimate` (F04b) | **API mới** |
| `startInitialSync` | cửa sổ nhập thư ban đầu (F04b) | **API mới** |

### Thông báo lỗi (theo F04a)

| `connectError` | Thông báo |
|---|---|
| `CONNECT_CANCELLED` | Bạn đã hủy kết nối. |
| `CONNECT_STATE_INVALID` | Phiên kết nối đã hết hạn. Hãy thử lại. |
| `CONNECT_SCOPE_DENIED` | Sino cần quyền đọc Gmail. Hãy thử lại và cho phép đọc thư. |
| `CONNECT_WRONG_ACCOUNT` | Bạn đã chọn một tài khoản Google khác. Hãy chọn đúng tài khoản, hoặc dùng "Thêm Gmail". |
| `CONNECT_FAILED` và mã lạ | Không kết nối được với Google. Hãy thử lại sau. |

## Frontend design

```text
src/features/accounts/
  connect.types.ts          ConnectableProvider, SyncRange, SyncOptions, SyncEstimate, InitialSyncStatus
  connect.format.ts         mô tả provider, nhãn Đọc/Gửi, câu "để làm gì" của quyền, thông báo lỗi, ước tính, tiến độ
  accounts.api.ts           + startConnect, leaveTo, fetchSyncEstimate, startInitialSync
  useConnect.ts             useConnectProviders, useStartConnect, useSyncEstimate, useStartInitialSync
  components/ConnectWizard.tsx       hộp thoại 5 bước
  components/ConnectError.tsx        cảnh báo ?connectError
  AccountsPage.tsx          trạng thái hộp thoại, đọc ?connected / ?connectError / ?reconnect
```

```text
"Kết nối tài khoản" ─► bước 1 Nhà cung cấp ─► 2 Quyền ─► 3 Đăng nhập ─► leaveTo(authorizationUrl)
"Đăng nhập lại"     ─► /accounts?reconnect=id ─────────┘ (bước 2, accountId)
                                                        Google ... callback
/accounts?connected=id ─► 4 Đồng bộ ─► startInitialSync ─► 5 Xong ─► "Mở hộp thư" (/inbox)
                                                                └► "Kết nối thêm tài khoản" (bước 1)
/accounts?connectError=CODE ─► cảnh báo đầu trang + "Thử lại" (bước 1)
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | mô tả và nhãn provider, câu quyền, thông báo lỗi (mã lạ → câu chung), ước tính, tiến độ; dữ liệu mẫu nhất quán (chỉ Gmail `connectable`) |
| Component | mở từ từng nút; provider "Sắp có" không chọn được; đi đủ 3 bước đầu rồi `leaveTo` nhận đúng URL; kết nối lại gửi `accountId` và bắt đầu ở bước 2; `?connected` mở bước 4, tham số bị xóa; "Bắt đầu đồng bộ" gửi đúng tùy chọn, bước 5 có tiến độ; "Kết nối thêm" về bước 1; `?connectError` hiện đúng câu, "Thử lại" mở bước 1; Esc / "Đóng" đóng hộp |
| Trình duyệt thật | Chrome, 1440 / 1024 / 390px × sáng / tối, đủ 5 bước; focus nằm trong hộp; thanh bước đúng trạng thái |
| Cổng | `pnpm lint`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Canvas khác luồng backend ở ba chỗ] → D-47…D-49 ghi rõ; người dùng đổi ý thì chỉ phần web sửa.
- [Bước Đồng bộ đi trước F04b] → các trường là đề xuất; F04b chốt thật, hợp đồng đổi theo.
- [FE-30 của F04a trùng một phần việc] → FE-30 dùng lại hộp thoại này, chỉ nối `accounts.api.ts` với API; ghi chú cho phiên backend khi tới FE-30.

## Definition of Done

- [ ] Scenario của spec `connect-wizard` chạy đúng ở 3 kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng bổ sung và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật; archive sau `fe-ui-accounts`.
