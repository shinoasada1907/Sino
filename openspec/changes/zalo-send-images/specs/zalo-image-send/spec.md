## ADDED Requirements

### Requirement: Gửi một ảnh qua Zalo
`POST /accounts/:accountId/messages` của `sino-zalo` MUST nhận thêm `image` (`data` base64, `fileName` có đuôi `.png`, `.gif` hay `.webp`, `width`, `height`) với `text` được phép rỗng khi có ảnh, và MUST gửi ảnh vào cuộc trò chuyện `threadId` (`USER` hoặc `GROUP`) rồi trả `msgId` của tin ảnh. Ảnh MUST tối đa 1 MiB sau khi giải base64; lớn hơn hay `data` không phải base64 MUST là `400` và không gửi gì. Byte và `data` của ảnh MUST không bao giờ vào log; log chỉ ghi mã, loại và kích thước.

#### Scenario: Gửi vào nhóm
- **WHEN** `sino-api` gửi một ảnh PNG tới một `threadId` loại `GROUP`
- **THEN** gateway gửi ảnh vào nhóm đó và phản hồi có `msgId`

#### Scenario: Ảnh quá lớn
- **WHEN** `image.data` giải ra 2 MiB
- **THEN** phản hồi `400`, và Zalo không nhận yêu cầu nào

### Requirement: Ảnh theo đúng các bảo đảm của tin chữ
Gửi ảnh MUST dùng chung chống gửi trùng theo `clientMessageId` (`SentLog`), giới hạn một tin mỗi giây mỗi tài khoản, thời gian chờ, và cách báo phiên không còn sống, như tin chữ (ZL-05).

#### Scenario: Gửi lại cùng mã
- **WHEN** `sino-api` gửi lại một ảnh với `clientMessageId` đã gửi thành công
- **THEN** phản hồi `200` với `msgId` cũ và Zalo không nhận lần gửi thứ hai
