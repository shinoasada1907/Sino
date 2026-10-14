## ADDED Requirements

### Requirement: Hộp thoại kết nối chọn bước theo cách kết nối của provider
Web MUST lấy `connectMethod` và `connectable` từ `GET /api/providers` và MUST NOT tự gán `connectable`. Provider có `connectable` = false MUST hiện "Sắp có" và không chọn được. Chọn provider `OAUTH2` MUST đi luồng hiện có; chọn provider `QR` MUST đi bước QR.

#### Scenario: Zalo đang tắt
- **WHEN** `GET /api/providers` trả `zalo` với `connectable` = false
- **THEN** ô Zalo hiện "Sắp có" và không chọn được

#### Scenario: Zalo đang bật
- **WHEN** `GET /api/providers` trả `zalo` với `connectMethod` = `QR`, `connectable` = true
- **THEN** chọn Zalo mở bước cảnh báo của luồng QR

### Requirement: Cảnh báo rủi ro trước khi hiện mã QR
Bước đầu của luồng QR Zalo MUST hiện chữ cảnh báo (DN-2) và một ô "Tôi hiểu rủi ro". Nút "Hiện mã QR" MUST bị khóa tới khi ô được tick, và request bắt đầu MUST gửi `acceptRisk` = true.

#### Scenario: Chưa tick
- **WHEN** người dùng mở bước cảnh báo và chưa tick
- **THEN** nút "Hiện mã QR" bị khóa và không có request nào

### Requirement: Mã QR và trạng thái quét
Sau khi bắt đầu, web MUST hiện ảnh QR cùng dòng hướng dẫn mở Zalo trên điện thoại để quét, và MUST hỏi trạng thái mỗi 2 giây cho tới khi trạng thái không còn là `WAITING` hay `SCANNED`. `SCANNED` MUST hiện "Đã quét: <tên>, xác nhận trên điện thoại". `EXPIRED` MUST thay mã bằng "Mã đã hết hạn" và nút "Tạo mã mới". `DECLINED` MUST hiện "Bạn đã từ chối trên điện thoại" và nút "Thử lại". `FAILED` với `CONNECT_WRONG_ACCOUNT` MUST nói rõ đã quét nhầm tài khoản. `DONE` MUST bắt đầu lần nhập đầu ngay, không hỏi khoảng thời gian (D-288), và đóng hộp thoại với dòng "Sino nhận tin Zalo từ bây giờ".

#### Scenario: Quét xong
- **WHEN** trạng thái chuyển `WAITING` → `SCANNED` → `DONE`
- **THEN** web hiện tên ở bước `SCANNED`, rồi gọi `POST /api/accounts/{id}/initial-sync` và đóng hộp thoại với dòng "Sino nhận tin Zalo từ bây giờ"

#### Scenario: Mã hết hạn
- **WHEN** trạng thái là `EXPIRED`
- **THEN** web ngừng hỏi trạng thái và hiện nút "Tạo mã mới"; bấm nút thì gọi lại `POST /api/accounts/connect/zalo/qr`

### Requirement: Đóng hộp thoại hủy lần kết nối
Đóng hộp thoại khi đang có `loginId` MUST ngừng hỏi trạng thái và gọi `DELETE /api/accounts/connect/{provider}/qr/{loginId}`.

#### Scenario: Đóng giữa chừng
- **WHEN** người dùng đóng hộp thoại khi mã đang chờ quét
- **THEN** web gọi `DELETE` với `loginId` đó và không hỏi trạng thái nữa

### Requirement: Quét lại khi account Zalo cần đăng nhập lại
Account Zalo `AUTH_EXPIRED` MUST có nút "Quét QR lại", mở luồng QR (bước cảnh báo rồi mã) với `accountId` của account đó.

#### Scenario: Bị đá rồi quét lại
- **WHEN** người dùng bấm "Quét QR lại" ở account Zalo `AUTH_EXPIRED`
- **THEN** request bắt đầu gửi `accountId` của account đó và, khi `DONE`, account hiện lại trạng thái đã kết nối
