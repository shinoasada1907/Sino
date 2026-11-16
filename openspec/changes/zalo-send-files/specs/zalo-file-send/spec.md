## ADDED Requirements

### Requirement: Gửi một ảnh hay một tệp qua Zalo
`sino-zalo` MUST nhận `POST /accounts/:accountId/messages/file` dạng `multipart/form-data` với phần `meta` (JSON: `threadId`, `threadType` là `USER` hay `GROUP`, `clientMessageId`, `kind` là `PHOTO` hay `FILE`, `fileName`) và phần `file`, gửi tệp vào chat đôi hoặc nhóm đó, và trả `msgId` của tin. `PHOTO` MUST đi thành tin ảnh thường của Zalo (có khung, không phải AI sticker); `FILE` MUST đi thành tin tệp. Thân quá 26 MB, `meta` sai hay thiếu `file` MUST là `400` và không gửi gì.

#### Scenario: Gửi ảnh vào một nhóm
- **WHEN** `sino-api` gửi một `PHOTO` JPEG vào một `GROUP`
- **THEN** `zca-js` nhận một lời gửi có tệp đó với rộng và cao của ảnh, vào đúng nhóm, và route trả `msgId` của tin ảnh

#### Scenario: Gửi một tệp
- **WHEN** `sino-api` gửi một `FILE` tên `bao-cao.pdf`
- **THEN** `zca-js` nhận một lời gửi có tệp tên `bao-cao.pdf`, và route trả `msgId`

### Requirement: Các bảo đảm của tin chữ
Route MUST dùng chung `SentLog` (cùng `clientMessageId` không gửi hai lần), giới hạn 1 tin mỗi giây mỗi tài khoản (`429` khi quá) và các mã lỗi của route gửi chữ (`404`/`410` khi không có phiên, `422` khi Zalo từ chối). Hết thời gian chờ (100 giây) MUST là kết quả chưa rõ, không phải lỗi chắc chắn. Log MUST không chứa byte hay tên tệp; chỉ mã, `kind` và cỡ.

#### Scenario: Gửi lại cùng mã
- **WHEN** `sino-api` gửi lại cùng `clientMessageId` sau khi lần đầu đã gửi được
- **THEN** route trả `msgId` đã có và `zca-js` không nhận lời gửi thứ hai

#### Scenario: Zalo không nhận tệp quá lớn
- **WHEN** Zalo từ chối một tệp vì quá giới hạn của tài khoản
- **THEN** route trả `422` với lý do, và `SentLog` ghi lần gửi đó là bị từ chối
