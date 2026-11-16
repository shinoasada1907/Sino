# Dấu trên tab và thanh thông báo tin mới · Technical Design

> Mode: **AUTO** cho riêng change này (người dùng 2026-10-19: "AUTO đi"; `project-mode.yaml` `task_overrides.inbox-notifications`). `new_features` vẫn TRAINING cho các tính năng khác. Khu vực `architecture` vẫn TRAINING, nên mọi quyết định dưới đây là **agent chốt, cần người dùng xem lại**.
> Số quyết định: D-317…D-320. Task: NF-01…NF-03.

## Context

- Số chưa đọc theo loại đã có và đã sống: `useUnreadByKind()` (`{ EMAIL, CHAT }`, `CHAT` có thể `null` từ backend trước f05c), được `useEventStream` đọc lại mỗi khi có `conversations.changed` hay `account.changed`. `AppShell` dùng nó cho số trên thanh điều hướng.
- `conversations.changed` mang `{ accountId, conversationIds, newInbound, source: 'import' | 'sync' | 'user', at }`: số và id, không có nội dung (D-90).
- Dải "N tin mới" (D-92, `useNewMailNotice`) chỉ đếm `source === 'sync'` và `newInbound > 0` của tài khoản của màn, hiện 6 giây, nằm trong danh sách.
- App đã đăng nhập không đặt `document.title`; tiêu đề và biểu tượng là của `index.html`. Trang công khai (`PublicFrame`) tự đặt rồi trả lại tiêu đề, và nằm ngoài `AppShell`.
- Canvas "Sino UI" không có dấu trên tab hay thanh thông báo bền.

## Decisions

### D-317 — Dấu trên tab: số trong tiêu đề và chấm trên biểu tượng · agent chốt
```text
tổng = EMAIL + (CHAT ?? 0)         đã có số liệu          chưa có số liệu (undefined)
tổng = 0                           "Sino"  + favicon.svg   không đụng tới tiêu đề/biểu tượng
0 < tổng <= 99                     "(N) Sino" + favicon-unread.svg
tổng >= 100                        "(99+) Sino" + favicon-unread.svg
```
- Hook `useTabUnread(total)` gọi trong `AppShell`: nên chỉ sống khi đã đăng nhập; khi `AppShell` gỡ ra (đăng xuất) thì **trả lại đúng tiêu đề và `href` biểu tượng** đã thấy lúc đặt.
- `favicon-unread.svg` là file tĩnh: cùng dấu Sino của `favicon.svg` thêm một chấm tròn `#E56B6F` (`--danger` của theme) ở góc trên phải; không vẽ canvas, không cần số trên biểu tượng.
- Số nằm ở tiêu đề, không ở biểu tượng: biểu tượng 16 px không đọc được chữ số, còn tiêu đề tab thì đọc được cả khi tab bị đẩy sang bên (nhiều tab).

**Phương án bị loại:** vẽ số lên biểu tượng bằng canvas (mờ ở 16 px, thêm mã không cần); Notification API hay web push (xin quyền, người dùng chỉ nói "dấu chấm hoặc số trên tab"); tiêu đề kèm tên màn (`Tin nhắn · Sino`): không ai nhờ, và đổi tiêu đề mọi trang.

### D-318 — Thanh thông báo tin mới dựng từ sự kiện, loại suy từ frame đã có · agent chốt
`useArrivalNotices()` trong `AppShell` nghe `onConversationsChanged`. Một sự kiện đáng đếm khi `source === 'sync'` và `newInbound > 0` (như D-92: nhập thư cũ và thay đổi của chính người dùng không đếm). Loại (`CHAT`/`EMAIL`) của `accountId` lấy từ **frame** của hộp thư (`fetchInbox`), vốn chứa mọi tài khoản và mọi nhà cung cấp của người dùng (màn nào lọc theo loại là `screenFrame` ở `InboxPage`, không phải frame):
```text
frame = frame đã có trong cache (của loại nào cũng được)
if tài khoản không có trong frame (hoặc chưa có frame nào):
  frame = tải frame một lần          // tài khoản mới thêm, hoặc chưa vào màn nào
kind  = kindOfProvider(frame.providers, tài khoản.provider)
```
- Không đếm khi người dùng **đang ở màn của loại đó và tab đang hiện**: danh sách đã có dải D-92 của nó.
- Đếm cho loại đó trong mọi trường hợp khác (màn khác, hoặc tab đang ẩn).
- Tắt về 0 khi: người dùng vào màn của loại đó (đổi đường dẫn vào `/messages` hay `/inbox`), bấm "Xem", bấm đóng; hoặc người dùng đang ở đúng màn đó và tab hiện lại thì 6 giây sau (cùng `NOTICE_MS` với D-92).
- Mỗi loại một dòng, tối đa hai dòng.
- Chữ: `newMailText(count, kind)` có sẵn ("3 tin mới", "2 thư mới"), nút "Xem", nút đóng có nhãn "Đóng thông báo".

**Vì sao đọc cache trước:** `conversations.changed` làm frame cũ đi (`invalidateQueries`) nhưng `accountId → loại` của một tài khoản không bao giờ đổi, nên frame cũ vẫn trả lời đúng; chỉ khi tài khoản chưa có trong frame mới tải lại. Mỗi lần có tin không thêm lời gọi nào; chưa vào màn nào thì tốn một lượt tải frame (ba request nhỏ), một lần mỗi phiên. **Sửa so với bản đầu của change này** (hỏi cả hai frame `inboxKey(CHAT)` và `inboxKey(EMAIL)`): **LÝ DO** đọc `fetchInbox` và `screenFrame` thấy frame không lọc theo loại, nên hỏi cả hai là tải thừa.
**Khi không tìm ra loại** (tài khoản vừa thêm mà frame chưa có): bỏ sự kiện đó. Tab vẫn có số (D-317) vì số chưa đọc đọc lại từ API.

**Phương án bị loại:**
- Suy từ chênh lệch số chưa đọc theo loại: nhập thư cũ cũng làm số nhảy, nên khi kết nối một Gmail sẽ hiện "300 thư mới".
- Thêm `kind` vào payload của `conversations.changed`: đúng và gọn cho web, nhưng chạm backend và hợp đồng `realtime-events`, và web mới với API cũ sẽ lệch; không cần khi frame đã cho ánh xạ.
- Hiện nội dung tin trong thanh: sự kiện không mang nội dung theo thiết kế (D-90), lấy thêm thì thêm lời gọi và thêm chuyện quyền.

### D-319 — Chỗ đặt và kiểu của thanh · agent chốt, không có trong canvas
- Một hàng lưới mới giữa thanh trên cùng và `main` của `AppShell`: `grid-rows-[auto_auto_minmax(0,1fr)]`, thanh ở hàng 2, `main` ở hàng 3 (hàng 2 không có thanh thì cao 0). `main` vẫn đặt hàng rõ ràng như comment hiện có của nó đòi (một phần tử ẩn trả lại hàng của nó).
- Thanh chiếm hết bề ngang cột nội dung, ở mọi cỡ màn: `border-b`, nền `surface`, chữ nhỏ, tông trung tính (tin mới không phải cảnh báo, nên không dùng màu `danger`): dùng các lớp và token đã có, không thêm token.
- `role="status"` với `aria-live` mặc định, để trình đọc màn hình đọc khi thanh xuất hiện.
- Trên mobile, màn có `MobilePageHeader` ẩn thanh trên cùng của shell; thanh thông báo vẫn nằm ở đầu cột, trên header của trang.

### D-320 — Ngoài phạm vi, và phải nói thẳng · agent chốt
- **Chuông thông báo và `/notifications`:** chấm và nhãn "3 mới" của chuông đọc dữ liệu mẫu cố định; `navCounts.accountsNeedingAction` và `registrationsNew` cũng là dữ liệu mẫu (chỉ `messagesUnread`, `inboxUnread` và số việc là số thật, `AppShell.tsx`). Làm chuông thật cần mô hình "thông báo" ở backend: là một tính năng riêng, chưa có. Change này không đụng.
- **Tài khoản "Cần đăng nhập lại" trên thanh:** hay và gần với Zalo (phiên bị đá), nhưng không ai yêu cầu; thanh được viết sao cho thêm một loại thông báo thứ hai không phải đổi chỗ đặt.
- **Lỗi "Không bắt đầu được kết nối" trên public:** việc khác, đang chờ phản hồi của request lỗi; không thuộc change này.

## Risks / Trade-offs

- **Tiêu đề do hai nơi đặt:** `PublicFrame` (ngoài `AppShell`) và `useTabUnread` (trong `AppShell`). Hai thứ không cùng sống; nhưng nếu về sau một trang trong app tự đặt `document.title`, hook này sẽ ghi đè mỗi lần số đổi. Ghi chú trong code; chưa có trang nào làm vậy.
- **Số chưa đọc có thể lệch tạm** với thực tế vài trăm mili-giây (đợi API trả lời sau sự kiện). Chấp nhận được cho một dấu trên tab.
- **Thanh nhớ trong bộ nhớ, không qua tải lại trang:** tải lại thì thanh mất, còn tab vẫn có số vì số chưa đọc đọc lại từ API. Đúng ý "thông báo", không phải "hộp thư của thông báo".
