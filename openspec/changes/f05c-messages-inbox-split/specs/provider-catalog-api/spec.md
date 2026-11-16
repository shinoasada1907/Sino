## ADDED Requirements

### Requirement: Loại của provider trên REST
Mỗi phần tử của `GET /api/providers` MUST có `kind` là `EMAIL` hoặc `CHAT`, đúng loại connector đã khai, để web biết provider thuộc màn Hộp thư hay Tin nhắn trước khi có account.

#### Scenario: Gmail là email
- **WHEN** client đã xác thực gọi `GET /api/providers` khi có connector Gmail
- **THEN** phần tử `gmail` có `kind` = `EMAIL`

#### Scenario: Provider chat
- **WHEN** client gọi `GET /api/providers` khi có một connector khai `CHAT`
- **THEN** phần tử của connector đó có `kind` = `CHAT`
