## ADDED Requirements

### Requirement: Gmail ước lượng số thư
Connector Gmail MUST ước lượng số thư (D-65 = B, BE-61): có `since` thì đếm ID của `messages.list` với `q=after:<since giây>`, `maxResults=500`, `fields=messages/id,nextPageToken`, lật qua các trang, dừng và trả 5 000 khi số đếm chạm 5 000; MUST NOT dùng `resultSizeEstimate`. Không có `since` thì lấy `messagesTotal` của `users.getProfile`. Lỗi của Gmail, kể cả ở một trang giữa chừng, MUST được dịch như khi đọc thư (`ProviderException`), không trả số đếm dở.

#### Scenario: Ước lượng 30 ngày
- **WHEN** bên gọi hỏi ước lượng với `since` là 30 ngày trước và Gmail liệt kê 500 ID ở trang đầu, 120 ID ở trang cuối
- **THEN** Gmail được hỏi hai trang `messages.list` với `q=after:<since giây>` và kết quả là 620, bất kể `resultSizeEstimate`

#### Scenario: Khoảng ngày có rất nhiều thư
- **WHEN** trang nào Gmail cũng còn trang sau
- **THEN** connector dừng khi đã đếm 5 000 ID và kết quả là 5 000

#### Scenario: Gmail lỗi ở trang thứ hai
- **WHEN** trang đầu trả ID kèm trang sau, trang thứ hai trả `503`
- **THEN** connector ném `ProviderException` với `PROVIDER_UNAVAILABLE`

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
