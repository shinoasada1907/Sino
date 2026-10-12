# Màn Hộp thư với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO. Người dùng 2026-10-08: "giờ làm màn hình hộp thư đi"; phạm vi và hai quyết định D-52, D-53 do agent chốt theo cách người dùng đã chọn cho các màn trước (danh sách + chi tiết trước, luồng sau; D-46) và theo ủy quyền "không cần hỏi" ở lần trước; ghi phương án bị loại để người dùng xem lại.
> FE-50 (2026-10-09, IN-08): nối màn vào API Hộp thư của F05 (`openspec/changes/f05-unified-inbox`, design mục 4) theo spec trước khi backend xong (MSW đóng vai API); người dùng: "làm đi". D-70…D-73 do agent chốt, ghi phương án bị loại để người dùng xem lại.
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `Inbox` (+ `InboxLight`), `TabletInbox`, `MobileInbox`, `Conversation`, `MobileConversation`, `InboxState*`, `ThreadState*`. Đối chiếu link ngày 2026-10-08: phiên bản `1790948862-287a`, trùng bản sao.

## Context

- Roadmap Phase 2: F05 (danh sách conversation, badge provider/account, unread; canvas `Inbox`, `TabletInbox`, `MobileInbox`, `InboxState`), F06 (timeline, bubble vào/ra, tệp đính kèm, cuộn lên tải tin cũ; "Cần chốt: HTML email, XSS").
- Backend chưa có module `conversation`, `messaging`. Màn Tổng quan đã có `InboxConversation` (id, provider, title, subject, memberCount, snippet, lastMessageAt, unreadCount); hợp đồng ở đây mở rộng cùng tên trường.
- Web đã có: khung app, `MobilePageHeader` + `handle`, `Dialog`, `Segmented`, `Status`, `Badge`, `ProviderIcon`, `AccountAvatar`, hàm giờ theo múi giờ, cách viết dữ liệu mẫu theo giờ canvas (`clockFrom`), cách tách request vào `*.api.ts`.

## Decisions

### D-52 — Change này gồm danh sách, đọc và gửi; thao tác trên thư là change sau · **Agent chốt** (2026-10-08)
Làm: danh sách hợp nhất, lọc, đọc thư và hội thoại, đánh dấu đã đọc, soạn và gửi trên dữ liệu mẫu, các trạng thái. Để sau: nhắc tôi trả lời, tạm ẩn, gửi lúc…, tạo task, lịch hẹn, ghi chú từ thư, bảng thao tác khi giữ tin trên mobile, tìm kiếm. Các nút đó hiện như canvas nhưng chưa làm gì.
**LÝ DO:** giống D-46 (người dùng chọn "danh sách + chi tiết" trước, luồng riêng sau); các thao tác thuộc Phase 4–5 (F15–F17, tạm ẩn, hẹn giờ gửi) và cần màn Việc cần làm, Ghi chú, Lịch. **Phương án bị loại:** làm hết một lần (change rất lớn, nhiều phần chưa có màn đích); chỉ danh sách (không thấy được nội dung, mất phần F06).

### D-53 — Nội dung tin là chữ thuần · **Agent chốt**
Hợp đồng gửi `text` (chữ thuần, đoạn cách nhau bằng một dòng trống); giao diện hiện bằng React (không `dangerouslySetInnerHTML`).
**LÝ DO:** roadmap để F06 chốt "HTML đã sanitize hay plain text" vì liên quan XSS; chữ thuần an toàn và đủ cho canvas. Khi F06 chọn HTML, hợp đồng thêm trường và giao diện thêm bộ lọc HTML, phần còn lại không đổi.

### D-55 — Các trạng thái của Hộp thư · **Agent chốt** (2026-10-08, IN-06)
Theo `InboxState` và `ThreadState`:
- **Đang tải** (chưa có dữ liệu lần nào): khung xương của danh sách và khung đọc; đầu danh sách ghi "đang tải".
- **Đồng bộ lần đầu:** có tài khoản đang đồng bộ (`syncProgress` khác `null`) mà hộp thư chưa có cuộc trò chuyện nào: thẻ "Đồng bộ lần đầu · Gmail" với phần trăm và thanh tiến độ, dưới là khung xương. Đã có cuộc trò chuyện thì tiến độ chỉ hiện ở cột nguồn và cột thông tin, như `Inbox`.
- **Chưa có nguồn** (`accounts` rỗng): màn trống của canvas; mỗi nhà cung cấp một dòng "Kết nối" mở hộp kết nối (`/accounts?connect=new`), Gmail là nút chính.
- **Không tải được:** "Không tải được hộp thư", "Thử lại" (tải lại), "Trạng thái hệ thống" (chưa có trang, không làm gì); dòng chi tiết ghi mã lỗi và mã yêu cầu khi lỗi có hai trường `code`, `requestId`, rồi giờ.
- **Ngoại tuyến:** theo `onlineManager` của TanStack Query: dải báo trên cùng ("dữ liệu đã lưu lúc …" là lúc danh sách về), đầu danh sách thêm "· đã lưu", ô soạn ghi "Sẽ gửi khi có mạng" và nút "Xếp hàng gửi". Tin gửi lúc mất mạng hiện "Đang gửi" và tự gửi khi có mạng lại (mutation của TanStack tạm dừng khi ngoại tuyến).
- **Hội thoại không gửi được:** tài khoản `AUTH_EXPIRED` → báo đỏ "Cần đăng nhập lại {nhà cung cấp} để nhận và gửi tin" với "Kết nối lại" (`/accounts?reconnect={id}`, hộp kết nối mở ở bước đăng nhập lại); đầu hội thoại chat "Ngắt kết nối từ …", cuối hội thoại "Tin nhắn sau … chưa về Sino". Tài khoản bình thường mà `canSend = false` → báo vàng "Quyền gửi … của {tài khoản} đã hết hạn" với "Trả lời trong {nhà cung cấp}" (chưa làm gì) và "Cấp lại quyền gửi" (cùng đường kết nối lại).
- **Hợp đồng:** `accounts[]` thêm `statusChangedAt` (cùng tên với màn Tài khoản) để biết ngắt từ lúc nào.

**LÝ DO:** canvas vẽ đủ các trạng thái; phần trăm lấy từ `syncProgress` đã có ở màn Tài khoản nên hai màn nói cùng một con số. `onlineManager` là chỗ TanStack Query dựa vào để tạm dừng request, nên dải báo và việc tạm dừng không bao giờ lệch nhau.
**Phương án bị loại:** thêm số tin đã tải / tổng / phút còn lại vào hợp đồng hộp thư để thẻ đồng bộ ghi "412 / 1.180 · Còn khoảng 3 phút" như canvas: hai trường cùng tả một lần đồng bộ và lệch với `syncProgress` của màn Tài khoản; để backend F04a chốt một hình dạng chung rồi hai màn cùng đổi. Tự nghe `navigator.onLine`: có lúc lệch với lúc TanStack tạm dừng. Không hiện câu "Bấm N ở bất cứ đâu để kết nối nhanh" (phím tắt chưa làm) và "Chưa tải · cần có mạng" dưới tệp đính kèm (chưa có bộ nhớ tệp ngoại tuyến).

### D-70 — "N chưa đọc" đếm cuộc trò chuyện · **Agent chốt** (2026-10-09, FE-50)
Số "N chưa đọc" của hộp thư, của từng nguồn và các số của bộ lọc nhanh dùng đúng số API F05 trả: số **cuộc trò chuyện** chưa lưu trữ có tin chưa đọc. Câu chữ giữ nguyên ("12 chưa đọc"). Đọc một cuộc trò chuyện làm số giảm một, dù nó có mấy tin chưa đọc.
**LÝ DO:** spec `inbox-api` của F05 (người dùng đã duyệt) đếm cuộc trò chuyện; Gmail cũng đếm thread. Câu "12 chưa đọc" đúng với cả hai cách đếm. Dòng chat vẫn hiện số tin chưa đọc của riêng nó (`unreadCount`).
**Phương án bị loại:** xin backend đếm thêm số tin (đổi spec F05 đã duyệt, thêm một truy vấn tổng); cộng `unreadCount` của các dòng đã tải (sai khi danh sách nhiều trang); đổi câu thành "12 cuộc trò chuyện chưa đọc" (dài, lệch canvas).

### D-71 — Mở một cuộc trò chuyện trước khi có lịch sử tin (F06) · **Agent chốt** (2026-10-09, FE-50)
F05 chỉ trả dòng và người tham gia (`GET /api/conversations/{id}`); xem tin là F06. Tới lúc đó, cuộc trò chuyện vẫn mở được: đầu trang như thường (không có "N thư · N tệp"), thay cho các tin là thẻ "Thư mới nhất · {giờ}" với đoạn đầu tin mới nhất (`snippet`, nhóm thêm tên người gửi) và câu "Sino mới hiện đoạn đầu của thư mới nhất. Đọc cả cuộc trò chuyện ngay trong Sino sẽ có ở bản sau." Hợp đồng: `ConversationDetail.messages = null` nghĩa là API chưa trả tin (D-56); khi F06 có, `fetchConversation` điền tin và màn tự hiện như bản dữ liệu mẫu.
**LÝ DO:** mở được thì đánh dấu đã đọc, lưu trữ, đánh dấu chưa đọc dùng được ngay; đoạn đầu là dữ liệu thật đã có, không bịa nội dung.
**Phương án bị loại:** giữ tin mẫu trong khung đọc (danh sách thật, nội dung giả: người dùng tưởng là thư thật); không cho mở (mất đánh dấu đã đọc và các nút lưu trữ).

### D-72 — Ô trả lời trước khi Sino gửi được (F10) · **Agent chốt** (2026-10-09, FE-50)
`canSend = null` nghĩa là Sino chưa gửi được (trước F10): ô soạn được thay bằng thông báo không có nút "Sino chưa gửi được thư" (chat: "tin"), "Trả lời từ Sino sẽ có ở bản sau. Bây giờ bạn trả lời trong {nhà cung cấp}." Tài khoản hết quyền vẫn ưu tiên thông báo "Kết nối lại" (D-55). Ô soạn chờ chi tiết của cuộc trò chuyện để không hiện ra rồi biến mất.
**LÝ DO:** ô soạn gõ được mà không gửi được là nói dối; câu báo nhẹ (không đỏ, không vàng) vì không có gì hỏng.
**Phương án bị loại:** giữ ô soạn rồi báo lỗi khi gửi (người dùng mất chữ đã gõ); ô soạn bị khóa (không nói vì sao); thêm nút "Mở trong Gmail" (API chưa có địa chỉ thread ở Gmail).

### D-73 — Lưu trữ và đánh dấu chưa đọc đưa về danh sách · **Agent chốt** (2026-10-09, FE-50)
"Lưu trữ" ("Bỏ lưu trữ" khi mở từ "Đã lưu trữ") và "Đánh dấu chưa đọc" của cuộc trò chuyện đang mở gửi `PATCH`, đổi dòng và số đếm ngay, rồi về danh sách với bộ lọc đang dùng, như Gmail. Mobile không có hai nút này (canvas `MobileConversation` chỉ có "Tạm ẩn" và "Thông tin"); tablet có "Lưu trữ" (canvas `TabletInbox`).
**LÝ DO:** ở lại thì "Đánh dấu chưa đọc" bị đọc lại ngay (mở là đọc), còn cuộc trò chuyện vừa lưu trữ đã rời danh sách đang xem.
**Phương án bị loại:** ở lại và đổi nút thành trạng thái bật/tắt (đánh dấu chưa đọc vô nghĩa khi vẫn đang đọc); thông báo "Đã lưu trữ · Hoàn tác" (chưa có thành phần thông báo nổi; làm khi có).

### D-97 — Dòng ghi tài khoản khi một nguồn có nhiều tài khoản · **Agent chốt** (2026-10-12, IN-10)
Người dùng (2026-10-12, khi chạy với hai tài khoản Gmail thật): "nếu có nhiều account gmail thì nên hiển thị thêm là mail này thuộc tài khoản mail nào". Canvas chỉ vẽ một tài khoản cho mỗi nguồn nên không nói tới chỗ này. Chốt: khi nguồn của một dòng có từ hai tài khoản trở lên, chữ cạnh tên ghi địa chỉ của tài khoản đó (`address`) ở **mọi** cỡ màn; từ 1280px ghi sau tên nguồn, đúng chữ của đầu thư đang mở ("Gmail · tienct07@gmail.com"); dưới 1280px chỉ ghi địa chỉ, vì dấu nguồn bên trái đã cho biết loại. Nguồn chỉ có một tài khoản giữ như canvas ("Gmail", chỉ từ 1280px). Tên và chữ cạnh nó chia dòng theo lưới `minmax(0,auto) minmax(0,auto)`: bên nào ngắn lấy đủ chữ của nó, thiếu chỗ thì chia đều, mỗi bên tự cắt "…". Tên dài trước đây không bao giờ cắt nên đè lên giờ ở 1024px; giờ nó cắt như tiêu đề thư.
**LÝ DO:** địa chỉ là thứ người dùng thấy ở cột "Tài khoản" và ở đầu thư đang mở, nên một chữ nói cùng một điều ở ba chỗ. Phần khác nhau giữa hai địa chỉ thường nằm ở đầu (`tienct07@…`, `bonzed2001@…`), nên khi bị cắt vẫn còn đọc được. Mobile cần biết tài khoản như desktop (trả lời sẽ đi từ tài khoản đó).
**Phương án bị loại:** chỉ hiện từ 1280px như chữ nguồn (tablet và mobile vẫn không biết thư của tài khoản nào); chấm màu cho từng tài khoản (canvas không có màu theo tài khoản, phải thêm token và chú thích màu); thêm một dòng riêng cho tài khoản (dòng cao thêm, danh sách ngắn đi); cho chữ cạnh tên không co (tên dài mất hết, tài khoản dài đẩy tên về "…"); lọc theo từng tài khoản ở cột "Tài khoản" (người dùng chưa hỏi; để sau).

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Đường dẫn:** `/inbox` và `/inbox/:conversationId`. Desktop: thư email mở trong cột phải của bố cục 3 cột (`Inbox`); hội thoại chat là trang riêng có cột thông tin (`Conversation`, nút "Hộp thư" quay lại). Tablet: 2 cột, mọi loại mở ở cột phải. Mobile: danh sách; hội thoại là trang con (đầu trang có nút quay lại, ẩn thanh dưới).
- **Bộ lọc nằm trong URL** (`?source=gmail&view=unread`): giữ khi tải lại, quay lại được, dùng chung cho cột nguồn, các nút trên đầu danh sách và hàng chip của tablet/mobile.
- ~~**Một hội thoại chỉ nằm một chỗ:** đầu trang chi tiết (tiêu đề, nguồn, tài khoản, số chưa đọc) lấy từ danh sách; trang chi tiết chỉ tải tin nhắn và phần thêm (giống `useAccount`).~~ **LÝ DO (FE-50):** danh sách giờ từng trang, một cuộc trò chuyện có thể không nằm trong trang đã tải (đường dẫn, tải lại, lưu trữ). Dòng của danh sách hiện ngay, rồi `GET /api/conversations/{id}` thay bằng dòng của máy chủ; mọi thay đổi sửa cả hai chỗ.
- ~~**Đánh dấu đã đọc khi mở:** mutation sửa cache danh sách (dòng và số đếm), số "Hộp thư" trên điều hướng (`ShellData.navCounts.inboxUnread`) và thẻ Hộp thư của Tổng quan.~~ **LÝ DO (FE-50):** số của điều hướng và thẻ Tổng quan vẫn là dữ liệu mẫu (D-56), trừ chúng theo dữ liệu thật là trộn hai nguồn. Đánh dấu đã đọc giờ sửa dòng (mọi danh sách đã tải và cuộc trò chuyện đang mở) và số đếm của Hộp thư; nối hai chỗ kia vào `GET /api/conversations/counts` là việc tiếp theo.
- **Ba truy vấn (FE-50):** khung `['inbox']` (tài khoản, nhà cung cấp, số đếm: ba request song song), danh sách `['inbox','list',view,source]` (`useInfiniteQuery`, trang theo `nextCursor`), cuộc trò chuyện `['inbox','conversation',id]`. Đổi bộ lọc giữ dữ liệu của bộ lọc trước (`keepPreviousData`) và lọc lại các dòng đó ở web, nên dòng còn khớp hiện ngay; dòng trùng giữa hai trang chỉ hiện một lần.
- **Thay đổi hiện ngay (FE-50):** `useUpdateConversation` đoán dòng sau thay đổi (`applyChange`), sửa mọi bản sao của dòng và số đếm (`countsAfter`, mỗi cuộc trò chuyện chưa lưu trữ đếm một), máy chủ từ chối thì trả lại tất cả; dòng máy chủ trả về thay cho dòng đoán. Lưu trữ và chưa đọc đổi chỗ của cuộc trò chuyện giữa các bộ lọc, nên mọi danh sách bị đánh dấu cũ (`refetchType: 'none'`) và tải lại khi được hiện; danh sách đang hiện không tải lại. Mở một cuộc trò chuyện chỉ đọc nó một lần cho mỗi lần mở (máy chủ từ chối thì không gửi lại).
- **Cuối danh sách (FE-50):** nút "Tải thêm"; `IntersectionObserver` bấm thay khi nút tới gần màn hình (cách 240px), nên người dùng bàn phím và trình đọc màn hình có cùng một đường.
- **Nhóm theo ngày** theo thời điểm sắp xếp (tin cuối, hoặc lúc "hiện lại theo hẹn"): "HÔM NAY", "HÔM QUA", "TUẦN NÀY", "TRƯỚC ĐÓ".

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô, giao diện tự đổi ra chữ; phần chưa có backend được phép `null`.

```ts
type ConversationKind = 'EMAIL' | 'CHAT'
type LinkedKind = 'TASK' | 'EVENT' | 'NOTE'

// Khung: GET /api/accounts + GET /api/providers + GET /api/conversations/counts (FE-50)
interface InboxData {
  generatedAt: Instant
  providers: ProviderInfo[]
  accounts: { id: string; provider: ProviderType; externalAccountId: string; status: AccountStatus
              syncProgress: number | null; statusChangedAt: Instant | null }[]   // statusChangedAt: D-55; API chưa có: null
  counts: {                                 // trên mọi cuộc trò chuyện chưa lưu trữ, không chỉ trang đang tải
    unread: number                          // số CUỘC TRÒ CHUYỆN có tin chưa đọc ("12 chưa đọc", D-70)
    byProvider: { provider: ProviderType; unread: number }[]   // API: object { "gmail": 7 }
    needsReply: number; withAttachments: number; scheduled: number; snoozed: number
  }
}

// Danh sách: GET /api/conversations?view=&provider=&cursor= (FE-50), mới nhất trước
interface ConversationPage { items: ConversationItem[]; nextCursor: string | null }

interface ConversationItem {
  id: string
  accountId: string
  provider: ProviderType
  kind: ConversationKind
  title: string                             // người kia hoặc tên nhóm
  subject: string | null                    // tiêu đề thư; null với chat
  memberCount: number | null                // nhóm chat
  snippetFrom: string | null                // người gửi tin cuối của nhóm ("Hà"), null nếu 1-1
  snippet: string                           // API: null khi tin không có chữ -> ""
  lastMessageAt: Instant
  unreadCount: number
  needsReply: boolean
  hasAttachments: boolean
  archived: boolean
  snooze: { until: Instant | null; resurfacedAt: Instant | null } | null
  scheduledSend: { at: Instant; failed: boolean } | null
  linked: { kind: LinkedKind; at: Instant | null; allDay: boolean }[]   // hạn task / giờ lịch hẹn; allDay: chỉ ngày; API: null -> []
}

// Mở một cuộc trò chuyện: GET /api/conversations/{id} (dòng + participants, F05) + .../messages (F06)
interface OpenConversation { item: ConversationItem; detail: ConversationDetail }

interface ConversationDetail {
  id: string
  messages: Message[] | null                // cũ trước, mới sau; null: API chưa trả tin (F06, D-71)
  firstUnreadId: string | null              // vạch "N tin chưa đọc"
  linked: { id: string; kind: LinkedKind; title: string; at: Instant | null; allDay: boolean; remindAt: Instant | null; pinned: boolean }[] | null
  members: { name: string; owner: boolean; joinedRecently: boolean }[] | null   // từ participants: self -> "Bạn", không tên -> externalId
  files: { total: number; items: { name: string; type: string; sizeBytes: number; image: boolean; at: Instant }[] } | null   // ảnh: ô thu nhỏ
  canSend: boolean | null                   // false: quyền gửi hết hạn (ThreadState); null: Sino chưa gửi được (F10, D-72)
  previousCursor: string | null             // tin cũ hơn (làm sau)
}

type Message =
  | { id: string; kind: 'MESSAGE'; direction: 'IN' | 'OUT'; sender: string; to: string | null; at: Instant
      text: string                          // chữ thuần (D-53)
      attachments: { name: string; type: string; sizeBytes: number; image: boolean; caption: string | null }[]
      status: 'SENDING' | 'SENT' | 'SEEN' | 'FAILED' | null      // tin của mình
      linked: { kind: LinkedKind; title: string }[] }
  | { id: string; kind: 'SYSTEM'; at: Instant; text: string }

// Thay đổi
updateConversation(id, { read?, archived? }) -> ConversationItem   // PATCH /api/conversations/{id} (F05, D-67)
sendMessage(conversationId, text) -> Message   // POST /api/conversations/{id}/messages (F10)
```

### Đối chiếu với API

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `providers`, `accounts` | `GET /api/providers`, `GET /api/accounts` | **đã có**; `syncProgress`, `statusChangedAt` = `null` (FE-52 lấy tiến độ từ `initial-sync`) |
| `conversations` (id, provider, title, subject, unread, lastMessageAt…) | `GET /api/conversations` (F05, BE-44) | **web nối theo spec (FE-50)**, chạy thật khi BE-44 xong |
| `counts` | `GET /api/conversations/counts` (F05, BE-44) | **web nối theo spec (FE-50)**; đếm cuộc trò chuyện (D-70) |
| `snooze`, `scheduledSend`, `linked` | tạm ẩn, hẹn giờ gửi, F15–F17 | F05 trả rỗng; web nhận khi có |
| `members` | `participants` của `GET /api/conversations/{id}` (F05) | **web nối theo spec (FE-50)**; `owner`, `joinedRecently` = `false` |
| `messages`, `firstUnreadId`, `files` | module `messaging` (F06) | chưa có: `null` (D-71) |
| `canSend` | quyền gửi (F10) | chưa có: `null` (D-72) |
| `updateConversation` (đọc, chưa đọc, lưu trữ) | `PATCH /api/conversations/{id}` (F05, BE-44) | **web nối theo spec (FE-50)** |
| `sendMessage` | F10 | dữ liệu mẫu |

## Frontend design

```text
src/features/inbox/
  inbox.types.ts       hợp đồng
  inbox.sample.ts      createInboxSample(now) (InboxSample = khung + mọi cuộc trò chuyện), createConversationSample(id, now)
  inbox.api.ts         fetchInbox, fetchConversations, fetchConversation, updateConversation (API F05); sendMessage (mẫu, F10)
  conversationChange.ts  applyChange, countsAfter: dòng và số đếm sau một thay đổi (FE-50)
  useInbox.ts          useInbox, useConversationList, useConversation, useUpdateConversation, useConversationActions, useSendMessage
  format.ts            nhóm ngày, giờ của dòng, dấu việc, số đếm, câu tin hệ thống, kích thước tệp…
  InboxPage.tsx        /inbox và /inbox/:id: bố cục theo kích thước
  components/*         cột nguồn, danh sách, dòng, đọc thư, hội thoại chat, cột thông tin, ô soạn, trạng thái
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | nhóm ngày, giờ của dòng, dấu việc, lọc theo nguồn và bộ lọc nhanh, số đếm, câu đầu trang, kích thước tệp, trạng thái gửi; dữ liệu mẫu nhất quán; mutation đánh dấu đã đọc và gửi sửa đúng cache |
| Component | 3 cột và lọc (URL đổi), mở thư email (thư cũ thu gọn, bấm để mở), mở hội thoại chat, đánh dấu đã đọc, gửi, trạng thái, mobile và tablet |
| Trình duyệt thật | Chrome, đồng hồ cố định, 1440 / 1024 / 768 / 390px × sáng / tối |
| Cổng | `pnpm lint`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Hai cách mở hội thoại trên desktop (thư trong cột, chat thành trang)] → đúng canvas; test cho cả hai.
- [Gửi trên dữ liệu mẫu đi trước F10] → chỉ sửa cache; hợp đồng `sendMessage` là đề xuất cho F10.
- [Canvas tự mâu thuẫn ở vài chỗ (cùng hội thoại nằm "HÔM NAY" ở desktop, "HÔM QUA" ở tablet)] → theo desktop; ghi ở `tasks.md`.

## Definition of Done

- [ ] Scenario của spec `inbox-screen` chạy đúng ở các kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
