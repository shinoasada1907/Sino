## ADDED Requirements

### Requirement: Chip biểu cảm dưới tin
Một tin có `reactions` không rỗng MUST có một chip dưới bong bóng, ở mép ngoài, với tối đa 3 emoji theo thứ tự của `reactions` và tổng số người khi lớn hơn 1. Chip MUST có viền màu nhấn khi có biểu cảm của chính người dùng. Bấm chip MUST mở danh sách ai thả biểu cảm nào. Chip MUST có tên đọc được cho trình đọc màn hình gồm tổng số người và số người của từng biểu cảm.

#### Scenario: Ba người thả
- **WHEN** một tin có ❤️ của hai người và 😆 của một người
- **THEN** dưới tin có chip "❤️😆 3"

#### Scenario: Xem ai thả
- **WHEN** người dùng bấm chip
- **THEN** một danh sách hiện tên từng người kèm emoji của họ, chính mình là "Bạn"

### Requirement: Thanh chọn biểu cảm
Khi chi tiết cuộc trò chuyện có `reactionSet` không rỗng, mỗi tin có `canReact` MUST có nút "Thả biểu cảm" hiện cạnh bong bóng khi rê chuột hay focus vào tin (từ 768px), và nhấn giữ bong bóng 500 ms MUST mở thanh (dưới 768px). Thanh MUST có các biểu cảm nhanh theo thứ tự của `reactionSet` và nút "+"; "+" MUST mở bảng đầy đủ của `reactionSet` (trong thanh từ 768px, sheet từ dưới lên dưới 768px). Bấm một biểu cảm MUST thả nó và đóng thanh; bấm biểu cảm đang là của mình MUST gỡ nó. Thanh MUST dùng được bằng bàn phím: mũi tên để đi, Enter để thả, Esc để đóng và trả focus về nút. Thư Gmail và tin `canReact` false MUST không có nút.

#### Scenario: Thả từ thanh nhanh
- **WHEN** người dùng rê chuột lên một tin Zalo, bấm nút mặt cười rồi bấm ❤️
- **THEN** chip dưới tin có ❤️ ngay lập tức và web gọi `PUT …/reaction` với `code` `/-heart`

#### Scenario: Gỡ biểu cảm của mình
- **WHEN** tin đang có ❤️ của người dùng và người dùng mở thanh rồi bấm ❤️
- **THEN** ❤️ của người dùng biến mất ngay và web gọi `DELETE …/reaction`

#### Scenario: Bảng đầy đủ
- **WHEN** người dùng bấm "+" trong thanh
- **THEN** bảng đầy đủ các biểu cảm của `reactionSet` hiện ra và bấm một cái thì thả nó

#### Scenario: Nhấn giữ trên điện thoại
- **WHEN** ở màn 390px người dùng nhấn giữ một bong bóng 500 ms
- **THEN** thanh biểu cảm nhanh mở ra và menu ngữ cảnh của trình duyệt không hiện

### Requirement: Thả hiện ngay, lỗi trả về
Thả, đổi hay gỡ MUST hiện ngay trên chip trước khi máy chủ trả lời, rồi lấy `reactions` máy chủ trả. Khi máy chủ trả lỗi, chip MUST trở về như trước và web MUST báo lỗi ngắn; quá nhịp MUST báo "Chậm lại một chút".

#### Scenario: Máy chủ từ chối
- **WHEN** người dùng thả ❤️ và máy chủ trả `429`
- **THEN** ❤️ biến mất khỏi chip và web báo "Chậm lại một chút"
