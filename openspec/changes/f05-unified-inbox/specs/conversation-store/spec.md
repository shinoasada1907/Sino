## ADDED Requirements

### Requirement: Lưu một trang thư idempotent
Module `conversation` MUST cung cấp `ConversationStore.store(accountId, batch)` lưu conversation, người tham gia, thư và thông tin tệp của một `SyncBatch` bằng upsert theo external ID: conversation theo (account, external conversation ID), người tham gia theo (conversation, external participant ID), thư theo (conversation, external message ID), tệp theo (thư, external attachment ID) (D-63, 02B §4). Lưu lại cùng dữ liệu MUST NOT tạo bản trùng. Thư không đổi gì MUST NOT bị cập nhật (02B §11). `store` MUST trả số thư mới và số thư đã cập nhật, và MUST chạy trong transaction của bên gọi để bên gọi ghi cursor cùng lúc.

#### Scenario: Lưu cùng một trang hai lần
- **WHEN** cùng một batch được lưu hai lần
- **THEN** database có đúng một bản của mỗi conversation, người tham gia, thư và tệp, và lần lưu thứ hai trả 0 thư mới, 0 thư đã cập nhật

#### Scenario: Thư đổi nội dung hoặc trạng thái
- **WHEN** một thư đã lưu được lưu lại với nội dung chữ khác
- **THEN** thư đó được cập nhật, vẫn giữ ID nội bộ, và lần lưu trả 1 thư đã cập nhật

#### Scenario: Thư không có conversation trong batch
- **WHEN** batch có một thư mà conversation của nó không có trong danh sách conversation của batch
- **THEN** một conversation tối thiểu (loại `UNKNOWN`) được tạo và thư được lưu vào đó

### Requirement: Người tham gia và tệp được gộp, không mất
Tên của người tham gia MUST được giữ khi lần lưu sau không có tên; `is_self` MUST đúng nếu bất kỳ lần lưu nào báo đúng. Người gửi một thư không có trong danh sách người tham gia MUST được thêm vào. Tệp của một thư MUST giữ ID nội bộ qua các lần lưu; tệp không còn trong thư MUST bị xóa. Nội dung thô của provider MUST NOT được lưu.

#### Scenario: Lần lưu sau không có tên
- **WHEN** một người tham gia đã có tên được lưu lại không kèm tên
- **THEN** tên cũ vẫn còn

#### Scenario: Thư bớt một tệp
- **WHEN** một thư có hai tệp được lưu lại chỉ với một tệp
- **THEN** tệp còn lại giữ ID nội bộ cũ và tệp kia không còn

### Requirement: Tổng hợp của conversation luôn tính từ thư
Sau mỗi lần lưu, mỗi conversation được chạm tới MUST có các giá trị tính lại từ toàn bộ thư đã lưu của nó: thời điểm thư mới nhất, đoạn xem trước (200 ký tự đầu của chữ thư mới nhất, khoảng trắng gộp; không có chữ thì rỗng), người gửi thư mới nhất, người bên kia (người gửi thư đến mới nhất, không có thì người tham gia đầu tiên không phải mình), số thư chưa đọc, có tệp hay không, cần trả lời hay không. Tiêu đề MUST chỉ đổi khi batch có thư mới hơn thư mới nhất đã lưu hoặc conversation chưa có tiêu đề.

#### Scenario: Batch theo dõi thay đổi chỉ có một thư cũ
- **WHEN** conversation có ba thư chưa đọc đã lưu và một batch sau chỉ có thư cũ nhất, giờ đã đọc
- **THEN** số chưa đọc là 2, thư mới nhất, đoạn xem trước và tiêu đề không đổi

### Requirement: Trạng thái đã đọc theo thay đổi mới nhất
Mỗi thư MUST giữ trạng thái đọc đang hiện và trạng thái đọc provider báo lần trước (D-67). Thư mới MUST lấy trạng thái đọc của provider. Với thư đã có: khi trạng thái đọc provider báo khác lần trước, trạng thái đang hiện MUST theo provider; khi giống lần trước, trạng thái đang hiện MUST giữ nguyên (lựa chọn trong Sino).

#### Scenario: Đã đọc trong Sino, Gmail thêm nhãn
- **WHEN** người dùng đánh dấu một thư đã đọc trong Sino, rồi thư đó được lưu lại vì một thay đổi nhãn và Gmail vẫn báo chưa đọc
- **THEN** thư vẫn là đã đọc trong Sino

#### Scenario: Đọc trên Gmail
- **WHEN** một thư chưa đọc được lưu lại và Gmail báo đã đọc
- **THEN** thư là đã đọc trong Sino

### Requirement: Thư đến mới đưa conversation khỏi lưu trữ
Khi một lần lưu thêm một thư **đến** mới hơn thư mới nhất trước đó của một conversation đã lưu trữ, conversation đó MUST không còn lưu trữ (D-67). Thư đi mới MUST NOT bỏ lưu trữ.

#### Scenario: Có thư đến mới
- **WHEN** một conversation đã lưu trữ nhận một thư đến mới hơn thư mới nhất của nó
- **THEN** conversation không còn lưu trữ

#### Scenario: Mình gửi thêm thư
- **WHEN** một conversation đã lưu trữ nhận một thư đi mới
- **THEN** conversation vẫn lưu trữ

### Requirement: Cần trả lời
Một conversation MUST "cần trả lời" khi và chỉ khi thư mới nhất của nó là thư đến và metadata `bulk` của thư đó khác `"true"` (D-68).

#### Scenario: Thư cuối là thư của một người
- **WHEN** thư mới nhất là thư đến không có `bulk`
- **THEN** conversation cần trả lời

#### Scenario: Thư cuối là bản tin
- **WHEN** thư mới nhất là thư đến có `bulk` = `"true"`
- **THEN** conversation không cần trả lời

#### Scenario: Đã trả lời
- **WHEN** thư mới nhất là thư đi
- **THEN** conversation không cần trả lời
