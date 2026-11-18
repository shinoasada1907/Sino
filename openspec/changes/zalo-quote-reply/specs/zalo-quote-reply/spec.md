## ADDED Requirements

### Requirement: Tin trích dẫn nhận từ Zalo giữ tin gốc
Khi một tin Zalo nhận về trích dẫn một tin khác, Sino MUST lưu tin gốc mà nó trích dẫn (`msgId` của Zalo) và phần xem trước (tên người gửi tin gốc, một dòng chữ hay loại tin), và API MUST trả phần `quote` đó cùng tin. Log MUST NOT chứa chữ hay tên của phần trích dẫn.

#### Scenario: Bạn chat trả lời một tin của mình
- **WHEN** bạn chat trích dẫn một tin chữ của người dùng và gửi "ok"
- **THEN** tin "ok" trong Sino có `quote` với tên người dùng và chữ của tin gốc, và web vẽ khung trích dẫn phía trên "ok"

#### Scenario: Tin gốc không có trong Sino
- **WHEN** tin trích dẫn một tin gửi trước lúc kết nối
- **THEN** khung trích dẫn vẫn hiện từ phần xem trước, bấm vào không cuộn

### Requirement: Trả lời có trích dẫn từ Sino
Người dùng MUST trả lời có trích dẫn trong chat Zalo 1-1 và nhóm khi tin gốc có `canQuote`, bằng tin chữ, ảnh, tệp hay sticker (sticker theo những gì Zalo nhận, design D-506). Zalo MUST hiện tin đó là tin trả lời của tin gốc. Tin gốc khác cuộc trò chuyện hay không trích dẫn được MUST bị từ chối với `QUOTE_UNAVAILABLE`, không gửi gì cho Zalo.

#### Scenario: Trả lời trong nhóm
- **WHEN** người dùng chọn "Trả lời" trên một tin của nhóm, gõ chữ và gửi
- **THEN** trên điện thoại, tin hiện kèm khung trích dẫn tin gốc, và trong Sino tin gửi đi có `quote`

#### Scenario: Tin cũ không trích dẫn được
- **WHEN** tin không có `cliMsgId`
- **THEN** `canQuote` là false và web không hiện nút "Trả lời"
