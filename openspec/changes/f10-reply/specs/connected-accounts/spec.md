## ADDED Requirements

### Requirement: Capability của account theo quyền đã cấp
`capabilities` của một account MUST là capability của provider, trừ `SEND_MESSAGES` khi scope đã cấp cho account thiếu scope gửi mà connector khai báo. Tên scope gửi MUST do connector khai báo; module `account` MUST NOT tự biết tên scope của provider. Kết nối lại có cấp thêm scope gửi MUST làm account có `SEND_MESSAGES`.

#### Scenario: Gmail kết nối trước khi có quyền gửi
- **WHEN** account Gmail chỉ có scope `gmail.readonly`, `userinfo.email`, `openid`
- **THEN** `capabilities` không có `SEND_MESSAGES`

#### Scenario: Kết nối lại và cấp quyền gửi
- **WHEN** người dùng kết nối lại account đó và đồng ý `gmail.send`
- **THEN** `capabilities` có `SEND_MESSAGES`

#### Scenario: Bỏ tick quyền gửi
- **WHEN** người dùng kết nối Gmail mới và bỏ tick `gmail.send` trên màn đồng ý của Google
- **THEN** kết nối thành công, account đọc được thư và `capabilities` không có `SEND_MESSAGES`
