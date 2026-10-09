## ADDED Requirements

### Requirement: Gmail ước lượng số thư
Connector Gmail MUST ước lượng số thư (D-65): có `since` thì lấy `resultSizeEstimate` của `messages.list` với `q=after:<since giây>` (một lời gọi, `maxResults=1`); không có `since` thì lấy `messagesTotal` của `users.getProfile`. Lỗi của Gmail MUST được dịch như khi đọc thư (`ProviderException`).

#### Scenario: Ước lượng 30 ngày
- **WHEN** bên gọi hỏi ước lượng với `since` là 30 ngày trước
- **THEN** Gmail được hỏi `messages.list` với `q=after:<since giây>` và kết quả là `resultSizeEstimate` của Gmail

#### Scenario: Ước lượng toàn bộ hộp thư
- **WHEN** bên gọi hỏi ước lượng không có `since`
- **THEN** kết quả là `messagesTotal` của profile Gmail

### Requirement: Gmail đánh dấu thư hàng loạt
Connector Gmail MUST đặt metadata `bulk` = `"true"` cho thư có nhãn `CATEGORY_PROMOTIONS`, `CATEGORY_SOCIAL`, `CATEGORY_UPDATES` hoặc `CATEGORY_FORUMS`, hoặc có header `List-Unsubscribe` (D-68); thư khác MUST NOT có khóa này.

#### Scenario: Bản tin có List-Unsubscribe
- **WHEN** một thư có header `List-Unsubscribe`
- **THEN** metadata của thư có `bulk` = `"true"`

#### Scenario: Thư của một người
- **WHEN** một thư chỉ có nhãn `INBOX` và `CATEGORY_PERSONAL`, không có `List-Unsubscribe`
- **THEN** metadata của thư không có `bulk`
