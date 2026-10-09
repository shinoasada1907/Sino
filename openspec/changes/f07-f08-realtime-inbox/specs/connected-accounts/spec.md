## ADDED Requirements

### Requirement: Module khác tìm account theo ID
`AccountDirectory.byId(accountId)` MUST trả account chưa xóa có ID đó, của bất kỳ owner nào, gồm owner, provider, trạng thái và `syncEnabled`; account đã xóa hoặc không tồn tại MUST trả rỗng. Kết quả MUST NOT chứa credential. Chỉ dùng cho việc nền không gắn với một request của người dùng (đồng bộ, gửi sự kiện); API cho người dùng vẫn tìm theo owner.

#### Scenario: Account đã xóa
- **WHEN** module khác hỏi `byId` của một account đã bị xóa
- **THEN** kết quả rỗng

#### Scenario: Account đang tạm dừng đồng bộ
- **WHEN** module khác hỏi `byId` của một account có `syncEnabled` = false
- **THEN** kết quả có owner của account và `syncEnabled` = false
