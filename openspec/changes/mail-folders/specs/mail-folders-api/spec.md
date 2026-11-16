## ADDED Requirements

### Requirement: Thư mục Gmail của từng thư
Sino MUST lưu thư mục của mỗi thư Gmail theo nhãn: `TRASH` nếu có nhãn `TRASH`, không thì `SPAM` nếu có `SPAM`, không thì `INBOX` nếu có `INBOX`, không thì `ARCHIVE`; thư gửi đi không có `INBOX`, `SPAM`, `TRASH` MUST không có thư mục. Thư `SPAM` và `TRASH` MUST được đồng bộ, thư nháp (`DRAFT`) vẫn MUST bị bỏ. Khi Gmail đổi nhãn một thư đã lưu, thư mục của nó MUST đổi theo ở lượt đồng bộ kế tiếp.

#### Scenario: Thư bị chuyển vào thùng rác bên Gmail
- **WHEN** một thư đang ở `INBOX` bị chuyển vào Thùng rác trong Gmail và Sino đồng bộ thay đổi
- **THEN** thư có thư mục `TRASH`, cuộc của nó có trong `view=trash` và không còn trong `view=all`

#### Scenario: Thư spam mới
- **WHEN** Gmail nhận một thư bị gắn `SPAM` và Sino đồng bộ
- **THEN** thư được lưu, có trong `view=trash`, và không được tính trong `GET /api/conversations/counts`

#### Scenario: Thư gửi chưa ai trả lời
- **WHEN** chủ gửi một thư mới từ Gmail và chưa ai trả lời
- **THEN** cuộc có trong `view=sent` và `view=all`, không có trong `view=archived`

### Requirement: Danh sách Đã gửi
`GET /api/conversations?view=sent` MUST trả các cuộc có ít nhất một thư chủ gửi đi không nằm ở Spam / Thùng rác, chia trang như các view khác, ghép được với `kind`, `accountId`, `cursor`, `limit`.

#### Scenario: Cuộc chủ đã trả lời
- **WHEN** một cuộc bắt đầu bằng thư người khác gửi và chủ đã trả lời một lần
- **THEN** cuộc có trong `view=sent`

#### Scenario: Cuộc chỉ có thư đến
- **WHEN** một cuộc chỉ có thư người khác gửi
- **THEN** cuộc không có trong `view=sent`

### Requirement: Danh sách Thư rác
`GET /api/conversations?view=trash` MUST trả các cuộc có ít nhất một thư ở Spam hoặc Thùng rác. Một cuộc mà mọi thư đều ở Spam / Thùng rác MUST không có trong `all`, `unread`, `reply`, `attachments`, `archived`, và không được tính trong `counts`.

#### Scenario: Spam và thùng rác chung một mục
- **WHEN** chủ có một cuộc ở Spam và một cuộc ở Thùng rác
- **THEN** `view=trash` trả cả hai

### Requirement: Danh sách Đã lưu trữ gồm lưu trữ bên Gmail
`GET /api/conversations?view=archived` MUST trả cuộc được lưu trữ trong Sino và cuộc có thư đã lưu trữ bên Gmail mà không còn thư nào ở `INBOX`. Cuộc lưu trữ bên Gmail MUST không có trong `all`, `unread`, `reply`, `attachments`, và không được tính trong `counts`. Chat không có thư mục MUST giữ hành vi cũ.

#### Scenario: Lưu trữ bên Gmail
- **WHEN** chủ lưu trữ một cuộc trong Gmail và Sino đồng bộ
- **THEN** cuộc có trong `view=archived` và không có trong `view=all`

#### Scenario: Có thư mới sau khi lưu trữ
- **WHEN** cuộc đã lưu trữ bên Gmail nhận một thư mới vào `INBOX`
- **THEN** cuộc lại có trong `view=all` và không có trong `view=archived` (trừ khi đã lưu trữ trong Sino)

#### Scenario: Zalo không đổi
- **WHEN** chủ có một chat Zalo chưa lưu trữ trong Sino
- **THEN** chat có trong `view=all` và không có trong `view=archived` hay `view=trash`, như trước thay đổi này

### Requirement: Đồng bộ bù thư mục một lần
Sau khi tính năng được triển khai, mỗi tài khoản Gmail đang hoạt động MUST chạy một lượt bù đúng một lần: đặt thư mục cho thư đã lưu theo nhãn hiện tại của Gmail và lưu thư Spam / Thùng rác hiện có trong khoảng đồng bộ của tài khoản. Lỗi ở một tài khoản MUST không chặn tài khoản khác và MUST được thử lại ở lần khởi động sau.

#### Scenario: Tài khoản cũ có thư lưu trữ
- **WHEN** một tài khoản đã đồng bộ trước thay đổi này có thư đã lưu trữ bên Gmail, và lượt bù chạy xong
- **THEN** cuộc của thư đó có trong `view=archived`

#### Scenario: Không chạy lại
- **WHEN** ứng dụng khởi động lại sau khi lượt bù của một tài khoản đã xong
- **THEN** lượt bù không chạy lại cho tài khoản đó
