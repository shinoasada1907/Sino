## ADDED Requirements

### Requirement: Thông báo trong app là nguồn chính
Mỗi thông báo MUST được lưu trong Sino và hiện ở trung tâm thông báo (chuông ở top bar), có trạng thái đã đọc. Khi người dùng đang mở Sino, thông báo mới MUST hiện ngay (qua realtime của F08).

#### Scenario: Thông báo khi đang mở Sino
- **WHEN** một nhắc nhở tới giờ lúc người dùng đang mở tab Sino
- **THEN** thông báo hiện ngay trong app và có trong trung tâm thông báo

### Requirement: Push theo thiết bị
Người dùng MUST đăng ký và hủy được thiết bị nhận push. Trên máy tính MUST dùng Web Push của trình duyệt; push của app mobile (`IOS`, `ANDROID`) chỉ có khi app mobile Sino có mặt. Mỗi thông báo MUST được gửi tới mọi thiết bị đang đăng ký, và thông báo trong app MUST luôn được tạo kể cả khi push thất bại.

#### Scenario: Tab đã đóng
- **WHEN** nhắc nhở tới giờ lúc tab Sino đã đóng nhưng trình duyệt vẫn chạy và thiết bị đã đăng ký
- **THEN** hệ điều hành hiện thông báo của trình duyệt

#### Scenario: Thiết bị không còn nhận
- **WHEN** dịch vụ push trả về rằng thiết bị không còn đăng ký
- **THEN** thiết bị đó bị xóa khỏi danh sách nhận

### Requirement: Riêng tư của nội dung push
Nội dung push MUST chỉ gồm tiêu đề của task hoặc lịch hẹn và đường dẫn mở trong Sino. Push MUST NOT chứa nội dung tin nhắn, địa chỉ người gửi hay secret.

#### Scenario: Push của nhắc nhở tạo từ thư
- **WHEN** nhắc nhở của task tạo từ một thư được push
- **THEN** push chỉ có tiêu đề task và đường dẫn, không có nội dung thư

### Requirement: Chỉ qua Sino
Hệ thống MUST NOT gửi nhắc nhở qua email, Zalo, Messenger hay kênh nào ngoài Sino.

#### Scenario: Không có thiết bị nào đăng ký push
- **WHEN** nhắc nhở tới giờ và người dùng chưa đăng ký thiết bị push nào
- **THEN** chỉ có thông báo trong app; không có email hay tin nhắn nào được gửi
