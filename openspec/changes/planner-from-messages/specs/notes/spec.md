## ADDED Requirements

### Requirement: Ghi chú chữ đơn giản
Một ghi chú MUST có nội dung chữ không rỗng, tối đa 20.000 ký tự; định dạng giới hạn ở xuống dòng, gạch đầu dòng và liên kết. Ghi chú MUST lưu thời điểm tạo và sửa, và MAY được ghim.

#### Scenario: Tạo ghi chú độc lập
- **WHEN** người dùng tạo ghi chú từ trang Ghi chú mà không chọn neo
- **THEN** ghi chú được lưu không có neo và hiện trong danh sách Ghi chú

#### Scenario: Nội dung quá dài
- **WHEN** người dùng lưu ghi chú dài hơn 20.000 ký tự
- **THEN** yêu cầu bị từ chối với lỗi validation theo error model của F01

### Requirement: Neo ghi chú vào ngữ cảnh
Một ghi chú MAY có một neo trỏ tới một tin nhắn, một cuộc trò chuyện hoặc một người tham gia. Neo MUST chỉ lưu loại và ID của Sino, MUST NOT sao chép nội dung tin nhắn, và MUST NOT dùng khóa ngoại sang bảng của module khác.

#### Scenario: Tạo ghi chú từ đoạn trích
- **WHEN** người dùng bôi đen một đoạn trong tin nhắn và chọn "Ghi chú"
- **THEN** ghi chú mới mở ra với đoạn đó được trích sẵn và neo vào tin nhắn đó

#### Scenario: Xem ghi chú của cuộc trò chuyện
- **WHEN** người dùng mở một cuộc trò chuyện
- **THEN** các ghi chú neo vào cuộc trò chuyện đó hoặc vào tin nhắn bên trong nó được liệt kê ở mục "Việc và ghi chú"

#### Scenario: Tin nhắn gốc không còn
- **WHEN** tin nhắn mà ghi chú neo vào đã bị xóa khỏi Sino
- **THEN** ghi chú vẫn còn và neo hiện "tin nhắn gốc không còn"

### Requirement: Tìm và lọc ghi chú
Trang Ghi chú MUST cho lọc theo Tất cả, Gắn tin nhắn và Đã ghim, và MUST cho tìm theo nội dung ghi chú.

#### Scenario: Lọc ghi chú đã ghim
- **WHEN** người dùng chọn bộ lọc "Đã ghim"
- **THEN** chỉ các ghi chú đã ghim được hiện, mới sửa gần nhất trước
