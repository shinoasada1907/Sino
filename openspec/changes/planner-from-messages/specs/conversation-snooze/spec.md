## ADDED Requirements

### Requirement: Tạm ẩn cuộc trò chuyện
Người dùng MUST tạm ẩn được một cuộc trò chuyện tới một thời điểm trong tương lai. Cuộc trò chuyện đang tạm ẩn MUST NOT hiện trong danh sách mặc định của Hộp thư và MUST hiện trong bộ lọc "Đang tạm ẩn".

#### Scenario: Tạm ẩn tới thứ Hai
- **WHEN** người dùng tạm ẩn cuộc trò chuyện "Bảo hiểm Tâm An" tới thứ Hai 9:00
- **THEN** cuộc trò chuyện biến khỏi danh sách mặc định và có trong bộ lọc "Đang tạm ẩn"

### Requirement: Hiện lại theo hẹn
Tới giờ hẹn, cuộc trò chuyện MUST quay lại danh sách mặc định ở vị trí đầu, có dấu "Hiện lại theo hẹn".

#### Scenario: Tới giờ hiện lại
- **WHEN** tới thứ Hai 9:00
- **THEN** "Bảo hiểm Tâm An" hiện ở đầu Hộp thư với dấu "Hiện lại theo hẹn"

### Requirement: Có tin mới thì hiện lại ngay
Nếu cuộc trò chuyện đang tạm ẩn nhận tin mới, nó MUST hiện lại ngay và việc hiện lại theo hẹn MUST bị hủy.

#### Scenario: Tin mới trong lúc ẩn
- **WHEN** cuộc trò chuyện đang tạm ẩn nhận một thư mới
- **THEN** cuộc trò chuyện hiện lại ngay ở đầu Hộp thư

### Requirement: Bỏ tạm ẩn
Người dùng MUST bỏ tạm ẩn được một cuộc trò chuyện bất cứ lúc nào.

#### Scenario: Bỏ tạm ẩn thủ công
- **WHEN** người dùng chọn "Bỏ tạm ẩn" trong bộ lọc "Đang tạm ẩn"
- **THEN** cuộc trò chuyện quay lại danh sách mặc định và việc hiện lại theo hẹn bị hủy
