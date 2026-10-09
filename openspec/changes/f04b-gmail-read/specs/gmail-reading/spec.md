## ADDED Requirements

### Requirement: Gmail đọc được thư
Connector Gmail MUST khai báo capability `READ_MESSAGES`, `THREADS` và `ATTACHMENTS`, và MUST vượt contract test kit của F03, kể cả phần sync.

#### Scenario: Capability của Gmail
- **WHEN** bên gọi hỏi capability của connector Gmail
- **THEN** kết quả là đúng `READ_MESSAGES`, `THREADS`, `ATTACHMENTS`

### Requirement: Lần đọc đầu theo mốc thời gian
Với cursor khởi tạo, connector Gmail MUST liệt kê thư theo trang tối đa 50 thư, chỉ lấy thư nhận hoặc gửi từ `since` trở đi (toàn bộ khi `since` vắng), và MUST NOT trả thư nháp, Spam hay Trash. `historyId` của hộp thư MUST được ghi lại lúc bắt đầu; khi hết trang, `nextCursor` MUST chuyển sang theo dõi thay đổi từ `historyId` đó và `hasMore` = `false`.

#### Scenario: Nhập 90 ngày gần nhất
- **WHEN** bên gọi truyền cursor khởi tạo với `since` = 90 ngày trước
- **THEN** Gmail được hỏi danh sách thư từ mốc đó, mỗi batch có tối đa 50 thư, và không batch nào có thư nháp, Spam hay Trash

#### Scenario: Hết lần đọc đầu
- **WHEN** trang cuối của lần đọc đầu đã được trả
- **THEN** batch có `hasMore` = `false` và `nextCursor` theo dõi thay đổi từ `historyId` ghi lúc bắt đầu, để thư đến trong lúc nhập vẫn được đọc ở lần sau

### Requirement: Theo dõi thay đổi theo historyId
Với cursor theo dõi thay đổi, connector Gmail MUST đọc các thay đổi kể từ `historyId` (thư mới, nhãn thêm hoặc bớt) và trả lại các thư bị thay đổi đã chuẩn hóa, mỗi thư một lần trong một batch. Gmail báo `historyId` quá cũ MUST thành `ProviderException` mã `CURSOR_EXPIRED`. Thư biến mất giữa lúc liệt kê và lúc lấy MUST bị bỏ qua, không làm lời gọi thất bại.

#### Scenario: Thư mới đến
- **WHEN** một thư mới đến sau `historyId` của cursor
- **THEN** batch có thư đó và `nextCursor` mang `historyId` mới

#### Scenario: Thư được đánh dấu đã đọc
- **WHEN** nhãn `UNREAD` bị bỏ khỏi một thư sau `historyId` của cursor
- **THEN** batch có lại thư đó với cùng external ID và `read` = `true`

#### Scenario: historyId quá cũ
- **WHEN** Gmail trả `404` cho `history.list`
- **THEN** connector ném `ProviderException` mã `CURSOR_EXPIRED`

### Requirement: Chuẩn hóa thread và thư
Một thread Gmail MUST thành một conversation loại `THREAD` với external ID = `threadId`, tiêu đề = Subject đã bỏ tiền tố trả lời/chuyển tiếp, người tham gia = các địa chỉ From/To/Cc (email viết thường làm ID, `self` khi trùng email của account). Một thư MUST thành một message với external ID = id của Gmail, `externalConversationId` = `threadId`, chiều đi khi có nhãn `SENT` và chiều đến khi không, `read` = không có nhãn `UNREAD`, `sentAt` = `internalDate`, metadata `subject` và `rfcMessageId`. Thư không chuẩn hóa được MUST vào danh sách bỏ qua của batch (external ID + lý do) và các thư khác MUST đi tiếp.

#### Scenario: Thư mình gửi
- **WHEN** một thư có nhãn `SENT`
- **THEN** message có chiều đi, và người tham gia có email của account được đánh dấu `self`

#### Scenario: Thư thiếu người gửi
- **WHEN** một thư trong trang không có header From
- **THEN** thư đó vào danh sách bỏ qua với lý do, và các thư khác của trang vẫn có trong batch

### Requirement: Nội dung chữ của thư
Nội dung chữ MUST lấy từ phần `text/plain` đầu tiên không phải tệp đính kèm, duyệt cả `multipart` lồng nhau; không có thì MUST lấy chữ từ phần `text/html` đầu tiên bằng jsoup (D-61), bỏ `script` và `style`, giải mã entity. Phần nội dung MUST được giải mã base64url và theo `charset` của phần đó. Nội dung MUST được cắt ở 100 000 ký tự. HTML MUST NOT được lưu trong message chuẩn hóa. Tệp đính kèm MUST chỉ có thông tin (ID tệp, tên, loại, dung lượng), không có nội dung.

#### Scenario: Thư chỉ có HTML
- **WHEN** thư chỉ có phần `text/html` chứa `<style>`, `<script>` và `&amp;`
- **THEN** `textContent` là chữ của thư, không có nội dung của `style` hay `script`, và `&amp;` thành `&`

#### Scenario: Thư có cả chữ thuần và HTML
- **WHEN** thư là `multipart/alternative` có `text/plain` và `text/html`
- **THEN** `textContent` lấy từ `text/plain`

#### Scenario: Thư có tệp đính kèm
- **WHEN** thư có một phần mang tên tệp và `attachmentId`
- **THEN** message có loại `MIXED` và một attachment với ID, tên, loại, dung lượng của tệp

### Requirement: Phân loại lỗi của Gmail API
Lỗi của Gmail API MUST được dịch: `401` → `AUTH_EXPIRED`; `429` hoặc `403` với lý do vượt hạn mức → `RATE_LIMITED` (kèm `Retry-After` nếu có); `403` khác → `REQUEST_REJECTED`; `5xx`, quá thời gian, không kết nối được → `PROVIDER_UNAVAILABLE`; JSON không đọc được ở mức trang → `PAYLOAD_NORMALIZATION_FAILED`. Thông báo lỗi MUST NOT chứa token, nội dung thư hay body lỗi của Google. Lỗi xảy ra giữa một trang MUST làm cả lời gọi thất bại, không trả nửa batch.

#### Scenario: Vượt hạn mức
- **WHEN** Gmail trả `403` với lý do `userRateLimitExceeded`
- **THEN** connector ném `ProviderException` mã `RATE_LIMITED`

#### Scenario: Google lỗi giữa trang
- **WHEN** Gmail trả `503` khi lấy thư thứ 20 của một trang 50 thư
- **THEN** lời gọi thất bại với `PROVIDER_UNAVAILABLE` và không batch nào được trả
