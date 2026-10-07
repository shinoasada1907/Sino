## ADDED Requirements

### Requirement: Connector khai báo cách kết nối OAuth2
Connector MAY khai báo cách kết nối OAuth2 qua `oauth2()` của `MessageProvider`, trả `OAuth2Connection` gồm: registration id của OAuth client, tập scope bắt buộc, tham số riêng gửi kèm yêu cầu đồng ý, và địa chỉ thu hồi token (tùy chọn). Mặc định `oauth2()` trả rỗng. `OAuth2Connection` MUST chỉ chứa kiểu của Sino; client id, client secret và token MUST NOT nằm trong nó. Connector MUST NOT tự đổi code lấy token hay tự refresh token: việc đó thuộc module `account` (D-15 = A', D-38).

#### Scenario: Connector không dùng OAuth2
- **WHEN** bên gọi hỏi `oauth2()` của một connector không khai báo
- **THEN** kết quả là rỗng

#### Scenario: Connector Gmail
- **WHEN** bên gọi hỏi `oauth2()` của connector Gmail
- **THEN** kết quả có registration id `google`, scope `openid`, `email`, `https://www.googleapis.com/auth/gmail.readonly`, tham số `access_type=offline` và `prompt=consent`, và địa chỉ thu hồi của Google
