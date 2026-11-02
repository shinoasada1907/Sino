## Mode

**AUTO** (người dùng 2026-11-02: "được làm đi" sau khi được hỏi, vì `new_features` là TRAINING; `project-mode.yaml` `task_overrides.messages-by-account`). Đội Sino: quản lý (phiên `sino-27`) giao việc, kỹ sư `sino-api` và `sino-web` làm phần app của mình (`CLAUDE.md`, *Đội Sino*). Người dùng duyệt đề án này trước khi giao việc, duyệt canvas trước khi giao web, và nghiệm thu từng task trước khi commit.

## Context

- **Màn Tin nhắn là `InboxPage kind="CHAT"`** (`app/router.tsx`): cùng `SourcePane` (Nguồn theo provider, Lọc nhanh 6 mục, Tài khoản là link tới `/accounts/<id>`), cùng `ConversationList`, cùng `useInbox`. Từ 1280px mở một chat làm mất cả cột trái lẫn danh sách: khung chat chiếm chỗ, cột Thông tin ở phải.
- **BE-111 của `f05c` chưa làm:** `GET /api/conversations` nhận `view`, `provider`, `accountId`, `cursor`, `limit` nhưng không nhận `kind`; `GET /api/conversations/counts` không nhận tham số nào, trả `unread`, `byProvider`, `needsReply`, `withAttachments`, `0`, `0`. Web đã gửi `?kind=` (FE-110), server bỏ qua, nên số và trang của Tin nhắn trộn cả Gmail (ảnh của người dùng: 1008 chưa đọc khi Tin nhắn chỉ có 3 cuộc). Spec của BE-111 nằm sẵn trong delta `inbox-api` của `f05c` và được giữ nguyên.
- **`conversation.type`** đã có `DIRECT`, `GROUP`, `THREAD`, `CHANNEL`, `UNKNOWN` (V6); `InboxService` đã dùng nó cho `participants`. Lọc 1-1 / nhóm không cần migration.
- **`ConversationItem.accountIds`** (f05b) có mọi tài khoản giữ một thread; `accountId` là bản chính.
- **`AccountAvatar`** vẽ theo nhà cung cấp, nên hai tài khoản Zalo trông giống hệt nhau.
- **Canvas "Sino UI"** vẽ `Messages` với cột trái như `Inbox` (Nguồn / Lọc nhanh / Tài khoản). Change này đổi canvas trước (MA-01).
- **Đụng việc khác:** `zalo-nicknames` NK-04 (phiên quản lý `sino-16`) cũng sửa dòng danh sách và đầu khung chat, chưa bắt đầu (chờ canvas NK-03). `chat-scroll-new-message` (chưa commit) sửa `ChatThread.tsx`.

## Goals / Non-Goals

**Goals:** xem riêng từng tài khoản ở Tin nhắn và Hộp thư; tách chat 1-1 với nhóm ở Tin nhắn; số đếm đúng loại và đúng tài khoản; ở desktop đổi chat mà không phải quay lại danh sách.

**Non-Goals:** xem `proposal.md`.

## Decisions

### DN-1 — Tách theo tài khoản ở cột trái · **người dùng chốt** (2026-11-02, phiên VS Code "sino-web-f1")
Chọn tài khoản ở cột trái, giữ "Tất cả", áp cho Zalo và Gmail (Tin nhắn và Hộp thư).
**Phương án bị loại:** chia mục theo tài khoản ngay trong danh sách; mỗi lúc chỉ xem một tài khoản.

### DN-2 — Danh sách luôn cạnh chat ở desktop · **người dùng chốt** (2026-11-02, "sino-web-f1")
Từ 1280px, mở chat không làm mất danh sách. Hộp thư giữ như hôm nay.
**Phương án bị loại:** ẩn hẳn cột tài khoản; giữ như hiện tại.

### DN-3 — Bộ lọc của Tin nhắn · **người dùng chốt** (2026-11-02, "sino-web-f1")
3 tab Tất cả / Chưa đọc / Cần trả lời + menu "Thêm" (Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ). Hộp thư giữ 6 bộ lọc ở cột trái.
**Phương án bị loại:** chỉ 3 tab + Đã lưu trữ; giữ đủ 6.

### DN-4 — Tách `MessagesPage` · **người dùng chốt** (2026-11-02, phần 1 của "sino-web-f1", "được rồi ổn rồi ă")
`MessagesPage` riêng khỏi `InboxPage`, dùng chung hook dữ liệu (`useInbox`), dòng danh sách và khung chat.
**Phương án bị loại:** một `InboxPage` thêm điều kiện (bố cục hai màn đã khác nhau, càng thêm càng rối); chép thành `features/messages` riêng (lặp logic dữ liệu).

### DN-5 — "Từ ai" là Cá nhân / Nhóm, hàng chip dưới tab · **người dùng chốt** (2026-11-02, phiên quản lý)
**Phương án bị loại:** lọc theo một người (cần danh bạ người gửi, việc lớn hơn nhiều); chỉ ghi rõ nhãn dòng; đặt Cá nhân / Nhóm trong cột tài khoản (cột dài gấp ba, dải 64px không chứa nổi); thay tab bằng Cá nhân / Nhóm (Chưa đọc phải thêm một cú bấm).

### D-425 — `byAccount` trong số đếm · agent chốt, người dùng duyệt ở phần 2
```json
"byAccount": { "<accountId>": { "unread": 1, "needsReply": 3, "withAttachments": 0 } }
```
Mọi tài khoản chưa xóa, chưa tắt của chủ (của loại `kind` khi có) có mục, kể cả 0. Đếm trên bản sao của từng tài khoản (không gộp nhóm thread như danh sách), nên thread f05b ở hai tài khoản tính ở cả hai; các số tổng giữ cách đếm một lần như hôm nay. `CountsResponse` (record lồng trong `ConversationsController`) thêm trường cuối `byAccount`; `scheduled`, `snoozed` giữ `0`.

### D-426 — `chatType=direct|group` · agent chốt, người dùng duyệt ở phần 2
`direct` → `c.type = 'DIRECT'`; `group` → `c.type IN ('GROUP', 'CHANNEL')`. Điều kiện nằm trong câu SQL của trang (`InboxService.page`), cạnh điều kiện `accountId`, trước `LIMIT`. Giá trị lạ → `400` qua `@Pattern` như `view`. Tên `chatType` tránh trùng với `kind` (CHAT/EMAIL) và `type` (từ quá chung).

### D-427 — BE-111 chuyển từ `f05c` · agent chốt, người dùng duyệt ở phần 2
BE-111 làm đúng như task và spec của `f05c` (D-306, D-307, D-308: `kind` ở danh sách và số đếm, `unreadByKind`, `kind` của dòng theo provider, provider không có connector tính là `EMAIL`, log `WARN` một lần). Ở `f05c/tasks.md` task 2.2 được gạch với LÝ DO; requirement vẫn thuộc delta `inbox-api` của `f05c`. Vì delta `messages-screen` và `inbox-screen` ở đây sửa requirement của `f05c`, **archive `f05c` trước change này**.

### D-428 — Bộ lọc trong địa chỉ · agent chốt (phần 1)
`InboxFilter` đổi `source: string | null` thành `account: string | null`, thêm `chatType: 'direct' | 'group' | null` (chỉ Tin nhắn dùng); địa chỉ là `account=<id>`, `view=…`, `chat=direct|group`. `account` không có trong danh sách tài khoản của màn → "Tất cả"; `source` cũ bị bỏ qua. `fetchConversations` gửi `accountId` và `chatType`; bỏ gửi `provider` (API vẫn nhận). Hàm tạo địa chỉ (`searchFor`) giữ các tham số khác khi đổi một tham số.

### D-429 — Cột tài khoản · agent chốt (phần 1)
Thay "Nguồn" và "Tài khoản" của `SourcePane` bằng một danh sách: "Tất cả", rồi tài khoản xếp dưới tên nhà cung cấp (nhãn nhóm nhỏ, không bấm được), mỗi tài khoản: chấm trạng thái (`accountTone` hôm nay), tên hay địa chỉ, số `byAccount[id].unread`. Bấm là lọc; "Xem tài khoản" ở đầu danh sách khi đang lọc. Dải 64px (D-437) dùng chữ cái đầu tên tài khoản (không dùng `AccountAvatar`, vì hai tài khoản Zalo sẽ giống nhau). Tablet: ô chọn; điện thoại: hàng chip, thay hàng chip "Nguồn" hiện có của `ConversationList` (`md:hidden`).

### D-430 — Nhãn dòng · agent chốt (phần 1, điểm 3)
Dòng riêng dưới tiêu đề: `<tài khoản>` [+ ` · nhóm N người`]. Bỏ phần tài khoản khi đang lọc một tài khoản hoặc màn chỉ có một tài khoản (thêm so với phần 1: một tài khoản thì ghi tên là thừa). Không ghi tên nhà cung cấp bằng chữ (ô biểu tượng đã có, DN-2 = A của `zalo-avatars`). Thread f05b ở "Tất cả" ghi mọi địa chỉ (như f05b đã duyệt).

### D-431 — Số theo tài khoản, chip không số · agent chốt (phần 2)
Tab và Lọc nhanh dùng `byAccount[id]` khi đang chọn tài khoản, số tổng ở "Tất cả". Chip Cá nhân / Nhóm không có số, nên không cần thêm chiều đếm theo `type`.
**Phương án bị loại:** số trên chip (thêm một chiều cho `counts`, ít giá trị khi đã có số theo tài khoản).

### D-432 — Đổi số lạc quan cho mọi tài khoản giữ thread · agent chốt (phần 2)
Đọc / chưa đọc / lưu trữ đổi số tổng và `byAccount` của mọi `accountIds` của dòng trong cache trước khi server trả lời, hoàn lại khi lỗi, cùng chỗ với cách `useConversationActions` đang đổi số hôm nay.

### D-433 — Thanh "N tin mới" theo tài khoản đang xem · agent chốt (phần 2)
Thông báo tin mới (`useNewMailNotice` / thanh của danh sách) lọc theo `account` đang chọn; tin của tài khoản khác chỉ làm đổi số ở cột trái (đọc lại `counts` như hôm nay).

### D-434 — Đổi bộ lọc khi đang mở chat · agent chốt (phần 2)
Chat vẫn mở nếu khớp bộ lọc mới (`accountIds` có tài khoản, `memberCount` khớp chip) hoặc bộ lọc mới là "Tất cả" / "Mọi chat"; không thì về danh sách với bộ lọc mới.

### D-435 — Hàng chip Cá nhân / Nhóm · agent chốt theo DN-5
"Mọi chat", "Cá nhân", "Nhóm" ngay dưới tab, mọi cỡ màn, `aria-pressed`. Chỉ ở Tin nhắn.

### D-436 — Tab và menu "Thêm" · agent chốt theo DN-3
Ba tab là ba giá trị `view` (`all`, `unread`, `reply`); "Thêm" là menu của thư viện giao diện đang có (shadcn `DropdownMenu`, nếu `src/shared/ui` đã có; không thì dùng `Popover` đang có, không thêm thư viện), mục chọn được ghi lên nút. Số trên tab theo D-431.

### D-437 — Bố cục Tin nhắn khi mở chat · agent chốt theo DN-2 (phần 1)

| Cỡ màn | Chưa mở chat | Đang mở chat |
|---|---|---|
| Từ 1280px | Cột tài khoản 232px · danh sách 320px · ô trống "Chọn một cuộc trò chuyện để đọc." | Dải tài khoản 64px · danh sách 320px · khung chat |
| 768–1279px | Ô chọn tài khoản + tab + chip ở đầu danh sách · ô trống | Danh sách · khung chat |
| Dưới 768px | Chip tài khoản · tab · chip loại · danh sách | Chat chiếm cả trang, như hôm nay |

Cột Thông tin chỉ mở bằng nút "Thông tin" (i) ở đầu khung chat, đè mép phải khung chat (1280px không đủ chỗ cho cột thứ tư), đóng bằng nút hay Esc.

### D-438 — Không có nhánh dự phòng cho backend cũ · agent chốt (phần 2)
Backend làm trước (MA-02, MA-03) và cả hai cùng lên `dev`; web không viết đường cho `counts` thiếu `byAccount`. Trước khi backend xong, web dựng và test trên MSW theo hợp đồng ở đây.

## Conflict

- **Canvas (thiết kế cuối cùng, `CLAUDE.md`) ↔ yêu cầu mới:** canvas `Messages` vẽ cột Nguồn / Lọc nhanh như `Inbox`. Quy tắc: canvas thắng cho mọi thứ người dùng nhìn thấy, nên **canvas đổi trước** (MA-01) theo DN-1…DN-5 và D-429…D-437, người dùng duyệt frame rồi mới giao web.
- **Delta `messages-screen` / `inbox-screen` của `f05c` ↔ delta ở đây:** change này viết MODIFIED trên requirement của `f05c`. Quy tắc: archive theo thứ tự `f05c` rồi change này (D-427).

## Risks / Trade-offs

- [Thread f05b ở hai tài khoản làm tổng số của các tài khoản lớn hơn số "Tất cả"] → chấp nhận, đúng ý "tin của tài khoản nào"; người dùng đã thấy hệ quả này ở phần 1.
- [`MessagesPage` tách ra mà vẫn dùng chung `ConversationList`, `ChatThread`, `ConversationInfo`] → chỉ tách trang và bố cục; dòng, khung chat, hook dùng chung, test hiện có của Hộp thư phải còn xanh.
- [NK-04 sửa cùng file] → NK-04 làm sau MA-05 (người dùng chọn); quản lý ghi thứ tự trong `PROJECT_STATE.md` để phiên `sino-16` thấy.
- [`chat-scroll-new-message` chưa commit, sửa `ChatThread.tsx`] → commit trước khi giao MA-05.
- [Truy vấn đếm theo tài khoản chậm khi nhiều thread] → một câu `GROUP BY account_id` trên cùng điều kiện với số tổng; MA-03 ghi thời gian đo trên bản sao DB.

## Migration Plan

Không migration. Thứ tự lên `dev`: MA-02 → MA-03 (backend, tương thích ngược: tham số mới không bắt buộc, trường mới thêm vào cuối) → MA-04 → MA-05 → MA-06. Rollback: revert commit web; backend thừa trường không ảnh hưởng.

## Contract tóm tắt

```text
sino-api  GET /api/conversations?kind=chat|email (BE-111, f05c D-306…D-308)
sino-api  GET /api/conversations?chatType=direct|group                        (D-426)
sino-api  GET /api/conversations/counts?kind=… → + unreadByKind, + byAccount   (BE-111, D-425)
sino-web  /messages?account=<id>&view=all|unread|reply|…&chat=direct|group    (D-428, D-435, D-436)
sino-web  /inbox?account=<id>&view=…                                           (D-428)
```
