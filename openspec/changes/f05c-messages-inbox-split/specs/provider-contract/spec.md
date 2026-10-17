## ADDED Requirements

### Requirement: Connector khai báo loại
Mỗi connector MUST khai báo đúng một loại `ProviderKind`: `EMAIL` cho hộp thư điện tử, `CHAT` cho nhắn tin. `MessageProvider` MUST NOT có loại mặc định, để connector quên khai thì không build được. Loại MUST áp cho mọi cuộc trò chuyện của provider, bất kể `ConversationType` của từng cuộc trò chuyện.

#### Scenario: Gmail
- **WHEN** bên gọi hỏi loại của connector Gmail
- **THEN** câu trả lời là `EMAIL`

#### Scenario: Connector chat dùng thread
- **WHEN** một connector khai `CHAT` tạo cuộc trò chuyện có `ConversationType` = `THREAD`
- **THEN** cuộc trò chuyện đó vẫn thuộc loại `CHAT`
