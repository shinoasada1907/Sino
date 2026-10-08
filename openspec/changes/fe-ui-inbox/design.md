# Màn Hộp thư với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO. Người dùng 2026-10-08: "giờ làm màn hình hộp thư đi"; phạm vi và hai quyết định D-52, D-53 do agent chốt theo cách người dùng đã chọn cho các màn trước (danh sách + chi tiết trước, luồng sau; D-46) và theo ủy quyền "không cần hỏi" ở lần trước; ghi phương án bị loại để người dùng xem lại.
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

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Đường dẫn:** `/inbox` và `/inbox/:conversationId`. Desktop: thư email mở trong cột phải của bố cục 3 cột (`Inbox`); hội thoại chat là trang riêng có cột thông tin (`Conversation`, nút "Hộp thư" quay lại). Tablet: 2 cột, mọi loại mở ở cột phải. Mobile: danh sách; hội thoại là trang con (đầu trang có nút quay lại, ẩn thanh dưới).
- **Bộ lọc nằm trong URL** (`?source=gmail&view=unread`): giữ khi tải lại, quay lại được, dùng chung cho cột nguồn, các nút trên đầu danh sách và hàng chip của tablet/mobile.
- **Một hội thoại chỉ nằm một chỗ:** đầu trang chi tiết (tiêu đề, nguồn, tài khoản, số chưa đọc) lấy từ danh sách; trang chi tiết chỉ tải tin nhắn và phần thêm (giống `useAccount`).
- **Đánh dấu đã đọc khi mở:** mutation sửa cache danh sách (dòng và số đếm), số "Hộp thư" trên điều hướng (`ShellData.navCounts.inboxUnread`) và thẻ Hộp thư của Tổng quan.
- **Nhóm theo ngày** theo thời điểm sắp xếp (tin cuối, hoặc lúc "hiện lại theo hẹn"): "HÔM NAY", "HÔM QUA", "TUẦN NÀY", "TRƯỚC ĐÓ".

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô, giao diện tự đổi ra chữ; phần chưa có backend được phép `null`.

```ts
type ConversationKind = 'EMAIL' | 'CHAT'
type LinkedKind = 'TASK' | 'EVENT' | 'NOTE'

// Danh sách: GET /api/conversations (mở rộng)
interface InboxData {
  generatedAt: Instant
  providers: ProviderInfo[]
  accounts: { id: string; provider: ProviderType; externalAccountId: string; status: AccountStatus; syncProgress: number | null }[]
  counts: {                                 // trên mọi cuộc trò chuyện, không chỉ trang đang tải
    unread: number                          // số TIN chưa đọc ("12 chưa đọc")
    byProvider: { provider: ProviderType; unread: number }[]
    needsReply: number; withAttachments: number; scheduled: number; snoozed: number
  }
  conversations: ConversationItem[]         // mới nhất trước
  nextCursor: string | null                 // trang sau (cuộn vô tận: làm sau)
}

interface ConversationItem {
  id: string
  accountId: string
  provider: ProviderType
  kind: ConversationKind
  title: string                             // người kia hoặc tên nhóm
  subject: string | null                    // tiêu đề thư; null với chat
  memberCount: number | null                // nhóm chat
  snippetFrom: string | null                // người gửi tin cuối của nhóm ("Hà"), null nếu 1-1
  snippet: string
  lastMessageAt: Instant
  unreadCount: number
  needsReply: boolean
  hasAttachments: boolean
  archived: boolean
  snooze: { until: Instant | null; resurfacedAt: Instant | null } | null
  scheduledSend: { at: Instant; failed: boolean } | null
  linked: { kind: LinkedKind; at: Instant | null; allDay: boolean }[]   // hạn task / giờ lịch hẹn; allDay: chỉ ngày
}

// Chi tiết: GET /api/conversations/{id} + GET /api/conversations/{id}/messages (F06)
interface ConversationDetail {
  id: string
  messages: Message[]                       // cũ trước, mới sau
  firstUnreadId: string | null              // vạch "N tin chưa đọc"
  linked: { id: string; kind: LinkedKind; title: string; at: Instant | null; allDay: boolean; remindAt: Instant | null; pinned: boolean }[] | null
  members: { name: string; owner: boolean; joinedRecently: boolean }[] | null   // nhóm chat
  files: { total: number; items: { name: string; type: string; sizeBytes: number; at: Instant }[] } | null
  canSend: boolean                          // false: quyền gửi hết hạn (ThreadState)
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
markRead(conversationId)                    // PATCH /api/conversations/{id} { read: true }
sendMessage(conversationId, text) -> Message   // POST /api/conversations/{id}/messages (F10)
```

### Đối chiếu với API

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `providers`, `accounts` | `GET /api/providers`, `GET /api/accounts` | **đã có** (thêm `syncProgress` như màn Tài khoản) |
| `conversations` (id, provider, title, subject, unread, lastMessageAt…) | module `conversation` (F05) | **API mới** |
| `counts` | đếm theo bộ lọc (F05) | **API mới** |
| `snooze`, `scheduledSend`, `linked` | tạm ẩn, hẹn giờ gửi, F15–F17 | **API mới**, được phép rỗng tới khi có feature |
| `messages`, `firstUnreadId`, `canSend` | module `messaging` (F06), quyền gửi (F10) | **API mới** |
| `members`, `files` | thành viên nhóm (F09), tệp (F06) | **API mới**, được phép `null` |
| `markRead` | `PATCH /api/conversations/{id}` (F05) | **API mới** |
| `sendMessage` | F10 | **API mới** |

## Frontend design

```text
src/features/inbox/
  inbox.types.ts       hợp đồng
  inbox.sample.ts      createInboxSample(now), createConversationSample(id, now) — giờ như canvas, dời theo đồng hồ
  inbox.api.ts         fetchInbox, fetchConversation, markRead, sendMessage (chỗ duy nhất đổi khi nối API)
  useInbox.ts          useInbox, useConversation, useMarkRead, useSendMessage
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
