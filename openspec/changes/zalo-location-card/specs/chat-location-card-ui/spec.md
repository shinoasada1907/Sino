## ADDED Requirements

### Requirement: Thẻ vị trí trong khung chat
Tin có `location` MUST hiện thành thẻ vị trí có tên địa điểm hoặc địa chỉ, toạ độ, và nút "Mở bản đồ" mở bản đồ ở tab mới. Web MUST NOT gửi toạ độ tới dịch vụ bản đồ trước khi người dùng bấm nút.

#### Scenario: Mở bản đồ
- **WHEN** người dùng bấm "Mở bản đồ" trên thẻ vị trí
- **THEN** một tab mới mở bản đồ tại đúng vĩ độ, kinh độ của tin

#### Scenario: Vị trí không có địa chỉ
- **WHEN** tin có `location` nhưng không có tên địa điểm hay địa chỉ
- **THEN** thẻ hiện "Vị trí" và toạ độ, nút "Mở bản đồ" vẫn dùng được

### Requirement: Thẻ danh thiếp trong khung chat
Tin có `contactCard` MUST hiện thành thẻ có avatar (hoặc chữ cái đầu khi không có), tên, và số điện thoại khi có. Số điện thoại MUST bấm được để gọi trên thiết bị hỗ trợ.

#### Scenario: Danh thiếp không có avatar
- **WHEN** tin có `contactCard` không có avatar
- **THEN** thẻ hiện chữ cái đầu của tên ở chỗ avatar

### Requirement: Nội dung của người khác chỉ là chữ
Tên, địa chỉ trong thẻ vị trí và danh thiếp MUST được hiện dạng chữ, không diễn giải thành HTML.

#### Scenario: Tên có thẻ HTML
- **WHEN** tên trong danh thiếp là `<b>An</b>`
- **THEN** thẻ hiện nguyên chuỗi `<b>An</b>`
