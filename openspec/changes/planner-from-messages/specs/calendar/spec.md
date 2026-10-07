## ADDED Requirements

### Requirement: Lịch hẹn cá nhân
Một lịch hẹn MUST có tiêu đề, thời điểm bắt đầu và kết thúc (kết thúc sau bắt đầu) hoặc cờ cả ngày; MAY có địa điểm, ghi chú, một nhắc nhở, một quy tắc lặp và một nguồn (tin nhắn hoặc cuộc trò chuyện). Lịch hẹn chỉ thuộc người dùng Sino; MUST NOT mời hay chia sẻ cho người khác.

#### Scenario: Tạo lịch hẹn từ tin nhắn
- **WHEN** người dùng chọn "Lịch hẹn" trên thư "Nhắc lịch khám" rồi chọn thứ Hai 05/10 08:30–09:30
- **THEN** lịch hẹn được lưu với tiêu đề gợi ý từ chủ đề thư và liên kết tới thư đó

#### Scenario: Kết thúc trước bắt đầu
- **WHEN** người dùng lưu lịch hẹn có giờ kết thúc sớm hơn giờ bắt đầu
- **THEN** yêu cầu bị từ chối với lỗi validation

### Requirement: Lịch hẹn lặp lại
Lịch hẹn MAY dùng cùng tập quy tắc lặp với task. Các lần lặp MUST được tính ra khi xem lịch và MUST NOT được lưu sẵn từng lần.

#### Scenario: Lịch hẹn lặp hằng tuần
- **WHEN** người dùng xem lịch tuần có chứa ngày lặp của một lịch hẹn lặp mỗi thứ Năm
- **THEN** lần lặp của thứ Năm đó hiện trên lịch

### Requirement: Xem lịch theo khoảng thời gian
Hệ thống MUST trả cho một khoảng [từ, đến) mọi lịch hẹn (gồm các lần lặp) giao với khoảng, mọi task có hạn trong khoảng và mọi nhắc nhở trong khoảng. Mục tạo từ tin nhắn MUST kèm thông tin để hiện icon nhà cung cấp và mở tin gốc.

#### Scenario: Xem tuần
- **WHEN** người dùng mở Lịch ở chế độ Tuần
- **THEN** lịch hẹn hiện dạng khối, task có hạn hiện dạng chip, nhắc nhở hiện dạng dấu nhỏ

### Requirement: Thời gian và múi giờ
Mọi thời điểm MUST được lưu theo UTC và hiển thị theo múi giờ của người dùng (mặc định `Asia/Ho_Chi_Minh`). Quy tắc lặp MUST được tính theo múi giờ của người dùng để giờ địa phương không đổi giữa các lần.

#### Scenario: Giờ địa phương ổn định
- **WHEN** một lịch hẹn lặp lúc 9:00 sáng thứ Hai theo giờ Việt Nam
- **THEN** mọi lần lặp đều hiện 9:00 sáng theo giờ Việt Nam
