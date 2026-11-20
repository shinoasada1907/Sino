## ADDED Requirements

### Requirement: Thẻ vị trí trong khung chat
Tin có `location` MUST hiện thành thẻ vị trí có bản đồ Google nhúng tại đúng toạ độ, nút "Maps" mở Google Maps ở tab mới, và bên dưới là tên địa điểm và địa chỉ khi có. Tên, địa chỉ và nút "Maps" MUST vẫn dùng được khi bản đồ nhúng không tải được.

#### Scenario: Mở bản đồ
- **WHEN** người dùng bấm "Maps" trên thẻ vị trí
- **THEN** một tab mới mở Google Maps tại đúng vĩ độ, kinh độ của tin

#### Scenario: Địa điểm có tên
- **WHEN** tin có `location` với tên địa điểm và địa chỉ
- **THEN** thẻ hiện bản đồ, tên địa điểm in đậm và địa chỉ bên dưới

#### Scenario: Vị trí hiện tại của người gửi
- **WHEN** tin có `location` với `current` là true và không có tên địa điểm
- **THEN** thẻ hiện bản đồ và chữ "Vị trí hiện tại"

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
