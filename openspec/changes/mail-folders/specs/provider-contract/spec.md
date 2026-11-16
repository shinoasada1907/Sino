## ADDED Requirements

### Requirement: Thư mục của tin chuẩn hóa
`NormalizedMessage` MUST có trường `mailbox` kiểu `Mailbox` (`INBOX`, `ARCHIVE`, `SPAM`, `TRASH`) thuộc contract chung, không phải kiểu riêng của provider. Connector không có khái niệm thư mục MUST để null. Connector có thư mục MUST báo đúng thư mục hiện tại của tin mỗi lần đọc lại nó, để thay đổi bên provider đi vào Sino qua lượt đồng bộ thường.

#### Scenario: Connector chat
- **WHEN** connector Zalo chuẩn hóa một tin nhắn
- **THEN** `mailbox` là null

#### Scenario: Connector email
- **WHEN** connector Gmail chuẩn hóa một thư mang nhãn `INBOX` và `UNREAD`
- **THEN** `mailbox` là `INBOX`
