## Why

Người dùng (2026-11-02, ảnh màn Tin nhắn): "cần phân loại thêm các tin nhắn này từ ai và của tài khoản nào chia ra để nhìn cho dễ". Hôm nay màn Tin nhắn dùng chung khung với Hộp thư: cột trái lọc theo nhà cung cấp chứ không theo tài khoản, bấm một tài khoản là mở trang tài khoản, và không tách được chat 1-1 với nhóm. Tệ hơn, số đếm và trang danh sách đang trộn cả Gmail (1008 chưa đọc, 454 cần trả lời trong khi Tin nhắn chỉ có 3 cuộc) vì BE-111 của `f05c-messages-inbox-split` chưa từng được làm: web gửi `?kind=chat`, server bỏ qua.

Thiết kế phần 1 do phiên VS Code "sino-web-f1" soạn và người dùng duyệt (17:02); phiên quản lý nhận lại việc theo lựa chọn của người dùng, thêm phần "từ ai" (Cá nhân / Nhóm) và phần 2, 3, người dùng duyệt cả ba.

## What Changes

- **`sino-api`:** làm BE-111 (chuyển từ `f05c`): lọc danh sách và số đếm theo `kind`, `unreadByKind`, `kind` của dòng theo provider. `GET /api/conversations/counts` trả thêm `byAccount` (số của từng tài khoản). `GET /api/conversations` nhận thêm `chatType=direct|group`. Không migration.
- **Canvas:** quản lý vẽ lại `Messages` (desktop, tablet, 390) và cột trái của `Inbox`; người dùng duyệt trước khi giao web.
- **Web, cả hai màn:** cột trái là danh sách tài khoản, xếp dưới tên nhà cung cấp, có "Tất cả"; bấm tài khoản là **lọc** (địa chỉ `?account=<id>` thay `?source=`), không còn mở trang tài khoản. Số ở cột trái và trên tab theo tài khoản. Nhãn dòng là một dòng riêng dưới tên chat (`<tài khoản> · nhóm N người`), bỏ tên tài khoản khi đang xem một tài khoản. **BREAKING** cho link cũ: `?source=` về "Tất cả".
- **Web, màn Tin nhắn tách riêng (`MessagesPage`):** 3 tab Tất cả / Chưa đọc / Cần trả lời + menu "Thêm" (Có tệp, Đã lưu trữ…); hàng chip Mọi chat / Cá nhân / Nhóm dưới tab (`?chat=direct|group`). Từ 1280px danh sách luôn cạnh khung chat, cột tài khoản thu thành dải 64px khi mở chat, cột Thông tin mở bằng nút (i) và nằm đè mép phải khung chat.
- **Web, màn Hộp thư:** giữ 3 cột và 6 bộ lọc, chỉ thay phần "Nguồn" bằng danh sách tài khoản.

## Capabilities

### New Capabilities
- `conversation-account-filters-api`: `sino-api` đếm theo từng tài khoản (`byAccount`) và lọc danh sách theo chat 1-1 hay nhóm (`chatType`).
- `account-filter-ui`: web lọc Tin nhắn và Hộp thư theo tài khoản ở cột trái, số theo tài khoản, nhãn dòng, cách giữ bộ lọc trong địa chỉ.

### Modified Capabilities
- `messages-screen` (delta của `f05c`): bố cục Tin nhắn riêng: tab + menu "Thêm", chip Cá nhân / Nhóm, danh sách cạnh khung chat từ 1280px, dải tài khoản 64px, cột Thông tin mở đè.
- `inbox-screen` (delta của `f05c`): Hộp thư lọc theo tài khoản thay vì nhà cung cấp; dòng ghi tài khoản theo quy tắc mới.

`inbox-api` (*Lọc danh sách theo loại*, *Số đếm theo loại*, *Loại của provider không có connector*) **không đổi**: các requirement đó vẫn thuộc `f05c`, change này chỉ làm phần code (BE-111).

## Impact

- **`apps/sino-api`:** `conversation/api/{ConversationsController,CountsResponse,ConversationResponse}.java`, `conversation/application/{InboxService,InboxItem,InboxCounts}.java`, helper loại theo provider trong `conversation/application`, README *Endpoints available today*; test, `ModularityTests`.
- **`apps/sino-web`:** `app/router.tsx`, `features/inbox/` (`InboxPage.tsx`, `MessagesPage.tsx` mới, `format.ts` `InboxFilter`, `inbox.api.ts`, `inbox.types.ts`, `useInbox.ts`, `components/{SourcePane,ConversationList,ConversationInfo}.tsx`, thông báo tin mới), test.
- **`design/sino-ui/project/`** và canvas trên claude.ai: `Messages`, `MessagesLight`, `MobileMessages`, cột trái của `Inbox`, frame mới cho khung chat khi danh sách cạnh nó.
- **`openspec/changes/f05c-messages-inbox-split/tasks.md`:** BE-111 gạch, ghi LÝ DO; ACC và archive của `f05c` chờ change này.
- **Đụng `zalo-nicknames` NK-04** (cùng sửa dòng danh sách, đầu khung chat): người dùng chọn change này đi trước ở `sino-web`, NK-04 làm sau trên màn đã tách.

## Non-goals

- **Lọc theo một người** (mọi chat với một người qua mọi tài khoản): cần danh bạ người gửi, để sau.
- **Số đếm trên chip** Cá nhân / Nhóm.
- **Nút "Tin mới ↓"** trong khung chat (fix `chat-scroll-new-message` riêng).
- **Lọc theo nhà cung cấp** trên giao diện (một tài khoản đã thuộc một nhà cung cấp; `provider` vẫn còn ở API).
- **Tìm kiếm** (F11), **hẹn giờ / tạm ẩn** (vẫn rỗng, chỉ nằm trong menu "Thêm").
