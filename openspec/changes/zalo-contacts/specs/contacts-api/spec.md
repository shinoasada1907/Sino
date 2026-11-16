## ADDED Requirements

### Requirement: Lưu và đồng bộ danh bạ theo tài khoản
`sino-api` MUST giữ danh bạ (bạn bè và nhóm) của mỗi tài khoản có capability `CONTACTS`, và MUST đồng bộ nó ngay sau khi tài khoản nối xong, mỗi 60 phút, và khi người dùng gọi `POST /api/accounts/{accountId}/contacts/refresh`. Một lần đồng bộ thành công MUST thêm người mới, sửa người đổi tên hay ảnh, xóa người không còn trong danh sách, và ghi giờ đồng bộ. Một lần đồng bộ lỗi MUST NOT đổi danh bạ đang có.

#### Scenario: Nối xong thì có danh bạ
- **WHEN** tài khoản Zalo vừa nối xong bằng QR và nhà cung cấp trả hai người bạn và một nhóm
- **THEN** `GET /api/contacts?accountId=…` trả ba mục và `syncedAt` khác `null`

#### Scenario: Hủy kết bạn
- **WHEN** lần đồng bộ sau không còn một người bạn
- **THEN** người đó không còn trong kết quả tìm

#### Scenario: Nhà cung cấp lỗi
- **WHEN** lần đồng bộ gặp lỗi của nhà cung cấp
- **THEN** danh bạ giữ nguyên, `syncError` có mã lỗi, `syncedAt` giữ giờ của lần thành công trước

#### Scenario: Làm mới hai lần sát nhau
- **WHEN** người dùng gọi làm mới hai lần trong vòng 30 giây sau một lần thành công
- **THEN** lần thứ hai trả kết quả của lần trước, nhà cung cấp không bị hỏi thêm

#### Scenario: Tài khoản không có danh bạ
- **WHEN** người dùng gọi làm mới cho một tài khoản Gmail
- **THEN** `sino-api` trả `422` với mã `CONTACTS_NOT_SUPPORTED`

### Requirement: Tìm danh bạ không phân biệt dấu
`GET /api/contacts?accountId=&q=&limit=` MUST trả các mục có tên chứa `q` khi bỏ dấu tiếng Việt và không phân biệt hoa thường (`đ` coi như `d`), sắp theo tên, tối đa `limit`; mỗi mục MUST có `conversationId` (và `nickname` của cuộc trò chuyện đó) khi tài khoản đã có cuộc trò chuyện với người hay nhóm đó, `null` khi chưa. Tài khoản không thuộc người dùng MUST trả `404 ACCOUNT_NOT_FOUND`.

#### Scenario: Gõ không dấu
- **WHEN** danh bạ có "Nguyễn Thị Đào" và người dùng tìm `q=nguyen dao`
- **THEN** kết quả có "Nguyễn Thị Đào"

#### Scenario: Đã có cuộc trò chuyện
- **WHEN** tài khoản đã có cuộc trò chuyện với người bạn `8001`
- **THEN** mục của `8001` có `conversationId` của cuộc trò chuyện đó

### Requirement: Tin đầu tiên mở cuộc trò chuyện
`POST /api/conversations` MUST nhận dạng chat `{ "accountId", "contact", "text", "clientMessageId" }`: khi tài khoản chưa có cuộc trò chuyện với `contact`, `sino-api` MUST tạo cuộc trò chuyện (mã ngoài là `contact`, loại, tên và ảnh từ danh bạ) cùng tin `PENDING` trước khi gọi nhà cung cấp; khi đã có, MUST gửi vào cuộc trò chuyện đó, không tạo cái thứ hai. Kết quả và mã lỗi MUST như thư mới của F10 (D-195). `contact` không có trong danh bạ MUST trả `404 CONTACT_NOT_FOUND`. Không có cuộc trò chuyện trống nào được tạo khi chỉ tìm hay mở khung chat.

#### Scenario: Nhắn người chưa có cuộc trò chuyện
- **WHEN** người dùng gửi "Chào chị" tới người bạn `8002` chưa có cuộc trò chuyện và Zalo nhận tin
- **THEN** `sino-api` trả `201` với cuộc trò chuyện mới có `external_conversation_id` `8002` và tin `SENT`, và cuộc trò chuyện có trong danh sách Tin nhắn

#### Scenario: Gửi tới người đã có cuộc trò chuyện
- **WHEN** người dùng gửi tin đầu tiên dạng chat tới `8001` đã có cuộc trò chuyện
- **THEN** tin vào cuộc trò chuyện đó, tài khoản vẫn chỉ có một cuộc trò chuyện với `8001`

#### Scenario: Gửi cả `to` lẫn `contact`
- **WHEN** request có cả `to` và `contact`
- **THEN** `sino-api` trả `400 VALIDATION_FAILED`
