## ADDED Requirements

### Requirement: Bắt đầu kết nối bằng mã QR
`POST /api/accounts/connect/{provider}/qr` với `acceptRisk` = true và `accountId` tùy chọn (kết nối lại) MUST gọi `qrLogin().start()` của connector và trả `201` với `loginId`, `qrImage` (PNG base64) và `expiresAt`. Lần kết nối đang chờ MUST được giữ trong HTTP session, gắn với owner và `accountId` nếu có. Thiếu hoặc sai `acceptRisk` MUST trả `400`. Provider không có `qrLogin()` MUST trả `400 CONNECT_METHOD_MISMATCH`. Provider đang tắt MUST trả `409 PROVIDER_DISABLED`. `accountId` không thuộc owner MUST trả `404`. Endpoint MUST đòi đăng nhập và CSRF như các endpoint ghi khác.

#### Scenario: Bắt đầu kết nối Zalo
- **WHEN** người dùng đã đăng nhập gọi `POST /api/accounts/connect/zalo/qr` với `acceptRisk` = true
- **THEN** response là `201` với `loginId`, `qrImage` và `expiresAt`

#### Scenario: Chưa đồng ý rủi ro
- **WHEN** request không có `acceptRisk`
- **THEN** response là `400` và không có lời gọi nào tới connector

#### Scenario: Provider kết nối bằng OAuth2
- **WHEN** người dùng gọi `POST /api/accounts/connect/gmail/qr`
- **THEN** response là `400 CONNECT_METHOD_MISMATCH`

### Requirement: Hỏi trạng thái và hoàn tất kết nối QR
`GET /api/accounts/connect/{provider}/qr/{loginId}` MUST trả `state` của lần đăng nhập (`WAITING`, `SCANNED` kèm `displayName`, `DONE`, `EXPIRED`, `DECLINED`, `FAILED` kèm `code`). Khi connector báo `DONE`, server MUST gọi use case đăng ký kết nối của F02 với hồ sơ và credential nhận được, MUST xóa lần kết nối đang chờ khỏi session, và MUST trả `DONE` với `accountId` và `reconnected`. `loginId` không có trong session của người gọi MUST trả `404`.

#### Scenario: Kết nối mới thành công
- **WHEN** người dùng quét mã, xác nhận, và web hỏi trạng thái
- **THEN** response có `state` = `DONE`, `accountId` của account Zalo mới, `reconnected` = false, và account có `status` = `CONNECTED`

#### Scenario: loginId của người khác
- **WHEN** một session khác gọi `GET` với `loginId` không do nó tạo
- **THEN** response là `404`

### Requirement: Kết nối lại phải đúng tài khoản cũ
Khi lần kết nối đang chờ có `accountId`, server MUST so `externalAccountId` của hồ sơ nhận được với account đó. Khớp thì MUST kết nối lại account đó (credential mới, `status` = `CONNECTED`). Không khớp thì MUST NOT tạo hay sửa account nào và MUST trả `state` = `FAILED` với `code` = `CONNECT_WRONG_ACCOUNT`.

#### Scenario: Quét lại sau khi bị đá
- **WHEN** account Zalo đang `AUTH_EXPIRED` và người dùng quét lại bằng đúng nick đó
- **THEN** account có `status` = `CONNECTED` với credential mới, `reconnected` = true

#### Scenario: Quét nhầm nick
- **WHEN** người dùng kết nối lại account của nick A nhưng quét bằng nick B
- **THEN** `state` = `FAILED`, `code` = `CONNECT_WRONG_ACCOUNT`, và không account nào thay đổi

### Requirement: Hủy kết nối QR
`DELETE /api/accounts/connect/{provider}/qr/{loginId}` MUST gọi `qrLogin().cancel(loginId)`, xóa lần kết nối đang chờ khỏi session và trả `204`, kể cả khi lần kết nối đã hết hạn.

#### Scenario: Đóng hộp thoại khi đang hiện mã
- **WHEN** người dùng đóng hộp thoại trong lúc mã đang chờ quét
- **THEN** connector nhận `cancel` và lần hỏi trạng thái sau đó trả `404`
