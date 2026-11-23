## ADDED Requirements

### Requirement: Đọc tin vị trí
Khi Zalo giao một tin `chat.location.new` có vĩ độ và kinh độ hợp lệ, hệ thống MUST lưu nó là tin `TEXT` có chữ `[Vị trí]` kèm tên địa điểm hoặc địa chỉ khi có, và giữ vĩ độ, kinh độ, tên địa điểm, địa chỉ để web vẽ thẻ vị trí.

#### Scenario: Vị trí có địa chỉ
- **WHEN** một nick khác gửi vị trí tới tài khoản đang kết nối
- **THEN** tin được lưu là `TEXT`, chữ bắt đầu bằng `[Vị trí]`, và lịch sử tin trả `location` có vĩ độ, kinh độ, địa chỉ

#### Scenario: Toạ độ sai
- **WHEN** nội dung tin vị trí có vĩ độ ngoài khoảng [-90, 90] hoặc không phải số
- **THEN** tin vẫn được lưu với chữ giữ chỗ `[Tin Zalo chưa hỗ trợ]`, không có `location`, và log có hình dạng nội dung

### Requirement: Đọc danh thiếp
Khi Zalo giao một tin `chat.recommended` là danh thiếp, hệ thống MUST lưu nó là tin `TEXT` có chữ `[Danh thiếp]` kèm tên, và giữ tên, avatar, số điện thoại khi Zalo cho biết. Avatar MUST chỉ được giữ khi nằm trên tên miền ảnh của Zalo.

#### Scenario: Danh thiếp có số điện thoại
- **WHEN** một nick khác gửi danh thiếp của một người có số điện thoại
- **THEN** tin được lưu là `TEXT`, chữ `[Danh thiếp] <tên>`, và lịch sử tin trả `contactCard` có tên, avatar, số điện thoại

#### Scenario: Thẻ link không bị coi là danh thiếp
- **WHEN** một nick khác gửi một link mà Zalo giao dạng `chat.recommended`
- **THEN** tin không có `contactCard`

### Requirement: Log không để lộ dữ liệu cá nhân
Log của `sino-zalo` và `sino-api` về tin vị trí và danh thiếp MUST NOT chứa toạ độ, địa chỉ, tên, số điện thoại hay địa chỉ ảnh đầy đủ. Log MAY nêu loại tin, tên khóa, loại giá trị và host.

#### Scenario: Nhận vị trí
- **WHEN** `sino-zalo` nhận một tin vị trí
- **THEN** dòng log "Zalo message" có `zaloType` và hình dạng nội dung, không có toạ độ hay địa chỉ
