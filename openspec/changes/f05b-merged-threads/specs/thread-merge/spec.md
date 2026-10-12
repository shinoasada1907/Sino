## ADDED Requirements

### Requirement: Nhóm của một chuỗi ở nhiều tài khoản
Hai cuộc trò chuyện MUST thuộc một nhóm khi chúng cùng chủ, cùng nhà cung cấp, thuộc hai tài khoản khác nhau và có ít nhất một thư cùng `Message-ID` (`rfcMessageId`). Nhóm MUST có tính bắc cầu. Hai cuộc trò chuyện của cùng một tài khoản, của hai nhà cung cấp khác nhau, hay không có thư chung MUST NOT bị gộp. Việc gộp MUST xảy ra khi lưu thư và MUST áp cho dữ liệu đã có trước change.

#### Scenario: Thư giữa hai tài khoản của cùng chủ
- **WHEN** `tienct07@gmail.com` gửi "Helllo" cho `bonzed2001@gmail.com`, cả hai đều là tài khoản đã kết nối của chủ, và cả hai lượt đồng bộ đã lưu thư
- **THEN** hai cuộc trò chuyện (thread `1a12fae4…` của `tienct07`, `1a12fadf…` của `bonzed2001`) thuộc một nhóm

#### Scenario: Thư chung đến sau gộp hai nhóm
- **WHEN** hai cuộc trò chuyện của hai tài khoản chưa có thư chung, rồi một thư mới gửi tới cả hai địa chỉ được lưu vào cả hai
- **THEN** hai cuộc trò chuyện thuộc một nhóm

#### Scenario: Hai thread cùng tiêu đề
- **WHEN** tài khoản `tienct07` có hai thread "xin chào" khác nhau, không chung thư nào
- **THEN** hai thread là hai nhóm riêng

### Requirement: Một dòng cho một nhóm
`GET /api/conversations` MUST trả một item cho mỗi nhóm trong phạm vi (tài khoản chưa xóa, không `DISABLED`). Item MUST có `accountIds` gồm mọi tài khoản của các bản trong phạm vi, bản chính đầu tiên, và `accountId` là tài khoản của bản chính. Bản chính MUST là bản giữ thư mới nhất; khi thư mới nhất có ở nhiều bản, MUST là bản mà thư đó là thư đến; vẫn ngang nhau thì bản cũ nhất. `title`, `subject`, `snippet` MUST lấy từ bản chính. `lastMessageAt` MUST là thư mới nhất của mọi bản; `unreadCount` MUST là số lớn nhất của các bản; `needsReply` MUST đúng chỉ khi mọi bản cần trả lời; `hasAttachments` MUST đúng khi một bản có tệp; `archived` MUST đúng chỉ khi mọi bản đã lưu trữ. Nhóm một bản MUST giữ đúng item như trước, với `accountIds = [accountId]`.

#### Scenario: Chuỗi "xin chào" lúc 17:41
- **WHEN** nhóm gồm bản của `tienct07` (thư "hello" 17:41 là thư đến) và bản của `bonzed2001` (thư đó là thư đi)
- **THEN** danh sách có một item, `accountId` là `tienct07`, `accountIds` = [`tienct07`, `bonzed2001`], `title` là "Sinon sama", và `needsReply` là false vì bản của `bonzed2001` không cần trả lời

### Requirement: Số đếm và bộ lọc theo nhóm
`GET /api/conversations/counts` MUST đếm mỗi nhóm một lần theo các trường gộp của nhóm; `byProvider` MUST đếm theo nhà cung cấp của nhóm. Lọc `accountId` MUST giữ nhóm có một bản thuộc tài khoản đó; lọc `provider` MUST theo nhà cung cấp của nhóm.

#### Scenario: Chuỗi chưa đọc ở hai tài khoản
- **WHEN** một nhóm hai bản có thư chưa đọc ở cả hai bản
- **THEN** `unread` tăng 1, không phải 2

### Requirement: Mở và đổi một nhóm bằng mã của bất kỳ bản nào
Mã của nhóm MUST là mã của cuộc trò chuyện cũ nhất trong các bản còn trong phạm vi. `GET`, `PATCH /api/conversations/{id}` và các đường con MUST nhận mã của bất kỳ bản nào và làm việc trên cả nhóm; item trả về MUST mang mã của nhóm. `PATCH` với `read` hay `archived` MUST đổi mọi bản trong phạm vi; `read: false` MUST đánh dấu chưa đọc thư mới nhất của bản chính. `participants` MUST gộp mọi bản, mỗi địa chỉ một lần. Sự kiện `conversations.changed` MUST mang mã của nhóm.

#### Scenario: Đường dẫn cũ trỏ vào bản kia
- **WHEN** web gọi `GET /api/conversations/{mã bản của bonzed2001}` và nhóm có mã là mã bản của `tienct07`
- **THEN** `200` với item có `id` là mã bản của `tienct07`

#### Scenario: Lưu trữ cả nhóm
- **WHEN** người dùng lưu trữ nhóm hai bản
- **THEN** cả hai bản `archived = true`, và nhóm rời "Tất cả"

### Requirement: Thư của một nhóm
`GET /api/conversations/{id}/messages` MUST trả thư của mọi bản trong phạm vi, mỗi `rfcMessageId` một lần; thư không có `rfcMessageId` MUST luôn có mặt. Khi một thư có ở nhiều bản, MUST lấy bản mà nó là thư đi, rồi bản chính, rồi bản cũ nhất. Trang và cursor MUST tính trên tập đã bỏ trùng. Nội dung, tệp đính kèm và xóa thư gửi lỗi MUST nhận thư của bất kỳ bản nào trong nhóm.

#### Scenario: Ba thư, không phải sáu
- **WHEN** web mở nhóm "xin chào" 17:41 (mỗi bản 3 thư, chung 3 `Message-ID`)
- **THEN** danh sách thư có 3 thư; thư "xin chào" 17:37 lấy từ bản của `tienct07`, có `clientMessageId`

### Requirement: Trả lời một nhóm
`reply` của `GET /api/conversations/{id}` MUST tính trên bản chính. `POST /api/conversations/{id}/messages` MUST gửi từ tài khoản của bản chính, trong thread của bản chính, và lưu thư vào bản đó.

#### Scenario: Trả lời chuỗi "xin chào" 17:41
- **WHEN** người dùng trả lời nhóm có bản chính là bản của `tienct07`
- **THEN** thư đi từ `tienct07@gmail.com` trong thread `1a12fae4…`
