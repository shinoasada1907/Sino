## ADDED Requirements

### Requirement: Lưu biểu cảm của tin
`sino-api` MUST lưu cho mỗi tin tối đa một biểu cảm của mỗi người thả (mã của provider, tên người thả, có phải chính tài khoản không, lúc thả). Một biểu cảm mới hơn của cùng người MUST thay biểu cảm cũ; một biểu cảm hay một lần gỡ cũ hơn cái đang lưu MUST bị bỏ qua. Gỡ MUST được nhớ để một biểu cảm cũ tới muộn không hiện lại. Xóa tin MUST xóa biểu cảm của nó.

#### Scenario: Đổi biểu cảm
- **WHEN** cùng một người thả ❤️ rồi sau đó 😆 lên một tin
- **THEN** tin đó chỉ còn 😆 của người ấy

#### Scenario: Biểu cảm cũ tới muộn sau khi đã gỡ
- **WHEN** lần gỡ lúc 10:05 được áp trước, rồi biểu cảm ❤️ lúc 10:00 của cùng người tới sau (đọc bù)
- **THEN** tin không có biểu cảm nào của người ấy

### Requirement: Áp biểu cảm nhận về mà không thành tin mới
Việc nhập MUST áp biểu cảm trong batch vào tin đã lưu theo external ID của tin đích. Biểu cảm lên một tin Sino không có MUST bị bỏ qua mà không làm hỏng batch. Áp biểu cảm MUST NOT đổi trạng thái đã đọc, số chưa đọc, lúc có tin mới nhất hay thứ tự cuộc trò chuyện, và MUST NOT bật thông báo tin mới; web MUST được báo để đọc lại cuộc trò chuyện.

#### Scenario: Biểu cảm trên tin đã đọc
- **WHEN** một batch chỉ có một biểu cảm lên một tin đã đọc
- **THEN** tin vẫn là đã đọc, số chưa đọc không đổi, và web nhận `conversations.changed` không có tin đến mới

#### Scenario: Biểu cảm lên tin Sino không có
- **WHEN** batch có một biểu cảm lên `msgId` không có trong Sino, cùng một tin chữ mới
- **THEN** tin chữ vẫn được lưu và biểu cảm bị bỏ qua

### Requirement: Biểu cảm trong phản hồi của API
Mỗi tin trong `GET /api/conversations/{id}/messages` MUST có `reactions`: một mục cho mỗi mã còn hiệu lực với `code`, `emoji`, `count`, `mine` và `names` (chính người dùng là "Bạn"), xếp theo số người giảm dần; và `canReact`. Chi tiết cuộc trò chuyện MUST có `reactionSet` (mã, emoji, nhãn, có thuộc nhóm nhanh không) của connector, rỗng khi connector không có `REACTIONS`. Mã không có trong `reactionSet` MUST hiện với `emoji` là chính mã.

#### Scenario: Hai người thả tim, một người haha
- **WHEN** tin có ❤️ của Lan, ❤️ của chính người dùng và 😆 của Minh
- **THEN** `reactions` là ❤️ (`count` 2, `mine` true, `names` gồm "Lan" và "Bạn") rồi 😆 (`count` 1, `mine` false)

#### Scenario: Thư Gmail
- **WHEN** người dùng mở một cuộc trò chuyện Gmail
- **THEN** `reactionSet` rỗng và mọi tin có `canReact` false

### Requirement: Thả, đổi, gỡ biểu cảm của người dùng
`PUT /api/conversations/{conversationId}/messages/{messageId}/reaction` với `code` MUST thả hoặc đổi biểu cảm của người dùng qua connector, và `DELETE` cùng đường dẫn MUST gỡ nó; cả hai MUST trả `reactions` mới của tin. Tin không thuộc cuộc trò chuyện của người dùng MUST trả `404`; tin có `canReact` false MUST trả `409` `REACTION_NOT_SUPPORTED`; `code` không có trong `reactionSet` MUST trả `400` `REACTION_UNKNOWN`; trong cả ba trường hợp connector MUST NOT được gọi. Connector MUST được gọi ngoài giao dịch cơ sở dữ liệu, và biểu cảm của người dùng MUST chỉ được lưu khi connector báo thành công. Lỗi của tài khoản hay của provider MUST có mã như khi gửi tin.

#### Scenario: Thả tim
- **WHEN** người dùng gọi `PUT` với `code` `/-heart` lên một tin Zalo đã gửi xong
- **THEN** connector Zalo được gọi một lần, phản hồi `200` có ❤️ với `mine` true, và hàng biểu cảm được lưu

#### Scenario: Connector lỗi
- **WHEN** connector báo phiên Zalo đã hết
- **THEN** API trả lỗi như khi gửi tin và không có biểu cảm nào được lưu

#### Scenario: Mã lạ
- **WHEN** người dùng gọi `PUT` với `code` `🦄`
- **THEN** API trả `400` `REACTION_UNKNOWN` và connector không được gọi
