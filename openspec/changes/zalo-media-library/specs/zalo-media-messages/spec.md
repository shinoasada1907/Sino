## ADDED Requirements

### Requirement: Đọc tin thoại
Khi Zalo giao một tin `chat.voice` có địa chỉ âm thanh trên tên miền Zalo cho phép, hệ thống MUST lưu nó là tin `AUDIO` có một tệp đính kèm mang địa chỉ đó, cùng dung lượng và độ dài khi Zalo cho biết.

#### Scenario: Tin thoại có địa chỉ
- **WHEN** một nick khác gửi tin thoại tới tài khoản đang kết nối
- **THEN** tin được lưu là `AUDIO`, chữ `[Tin nhắn thoại]`, tệp đính kèm có địa chỉ âm thanh

### Requirement: Đọc video
Khi Zalo giao một tin `chat.video.msg` có địa chỉ video trên tên miền Zalo cho phép, hệ thống MUST lưu nó là tin `VIDEO` có một tệp đính kèm mang địa chỉ đó, ảnh xem trước, dung lượng và độ dài khi Zalo cho biết. Chữ của tin MUST là lời người gửi kèm theo nếu có, không thì `[Video]`.

#### Scenario: Video có ảnh xem trước
- **WHEN** một nick khác gửi video tới tài khoản đang kết nối
- **THEN** tin được lưu là `VIDEO`, tệp đính kèm có địa chỉ video và ảnh xem trước

### Requirement: Đọc link dạng thẻ
Khi Zalo giao một tin `chat.recommended` hay `chat.link` có địa chỉ `http` hoặc `https`, hệ thống MUST lưu nó là tin `TEXT` kèm địa chỉ, tiêu đề, mô tả và ảnh xem trước khi có. Ảnh xem trước MUST chỉ được giữ khi nằm trên tên miền ảnh của Zalo. Địa chỉ dùng scheme khác MUST NOT được lưu.

#### Scenario: Thẻ link
- **WHEN** một nick khác gửi một link mà Zalo giao dạng thẻ
- **THEN** tin lưu là `TEXT`, chữ của tin là tiêu đề hoặc địa chỉ, và có địa chỉ link để web vẽ thẻ

#### Scenario: Scheme không an toàn
- **WHEN** nội dung thẻ có địa chỉ `javascript:alert(1)`
- **THEN** địa chỉ không được lưu và tin ở lại dạng giữ chỗ

### Requirement: Tin không đọc được vẫn còn
Tin thoại, video hay link không có địa chỉ dùng được MUST vẫn được lưu với chữ giữ chỗ như trước change này, và một dòng log MUST mô tả hình dạng nội dung để tìm ra nguyên nhân.

#### Scenario: Địa chỉ ngoài tên miền cho phép
- **WHEN** tin thoại có địa chỉ âm thanh trên một tên miền lạ
- **THEN** tin vẫn được lưu là `AUDIO` với chữ `[Tin nhắn thoại]`, không có tệp đính kèm, và log có cảnh báo nêu host

### Requirement: Log không để lộ nội dung
Log của `sino-zalo` và `sino-api` về các tin này MUST NOT chứa địa chỉ đầy đủ, tiêu đề hay mô tả. Log MAY nêu loại tin, tên khóa, loại giá trị và host.

#### Scenario: Đo hình dạng
- **WHEN** `sino-zalo` nhận một tin thoại
- **THEN** dòng log "Zalo message" có `zaloType` và hình dạng nội dung, không có địa chỉ
