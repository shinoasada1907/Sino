## ADDED Requirements

### Requirement: Gửi một ảnh hay một tệp vào một cuộc trò chuyện
`POST /api/conversations/{id}/messages` với thân `multipart/form-data` gồm phần `file` và phần `clientMessageId` MUST gửi tệp đó qua tài khoản của cuộc trò chuyện và trả tin đã gửi như khi gửi chữ (`201`, hoặc `200` khi `clientMessageId` này đã gửi rồi). Thiếu `file` hay `clientMessageId` MUST là `400 VALIDATION_FAILED`. Tin đi MUST được lưu với loại `IMAGE` (chữ `[Ảnh]`) cho ảnh, `FILE` (chữ là tên tệp) cho tệp, kèm một tệp đính kèm có tên, loại và cỡ; byte của tệp MUST không được lưu. Chi tiết cuộc trò chuyện MUST nói gửi được ảnh và tệp hay không bằng `reply.canSendFiles`.

#### Scenario: Gửi một ảnh dán vào
- **WHEN** người dùng gửi một PNG 300 KB tên `image.png` vào một chat Zalo
- **THEN** connector Zalo nhận một lệnh có tệp loại ảnh, đúng byte, tên `image.png`, và phản hồi `201` có tin loại `IMAGE`, chữ `[Ảnh]`, một tệp đính kèm `image.png` cỡ 300 KB

#### Scenario: Gửi một tệp PDF
- **WHEN** người dùng gửi `bao-cao.pdf` 2 MB
- **THEN** connector nhận một lệnh có tệp loại tệp (không phải ảnh), và tin lưu loại `FILE`, chữ `bao-cao.pdf`

### Requirement: Loại theo nội dung, cỡ theo loại
Loại MUST được xác định bằng các byte đầu của tệp, không theo tên hay `Content-Type`: JPEG, PNG, WebP và GIF là ảnh, mọi thứ khác là tệp. Ảnh quá 10 MB hay tệp quá 25 MB MUST là `413 FILE_TOO_LARGE` kèm giới hạn; tệp rỗng MUST là `400 FILE_EMPTY`; cả hai không gửi gì. Tên tệp MUST được làm sạch (không đường dẫn, không ký tự điều khiển, tối đa 255 ký tự); ảnh MUST được gửi với đuôi khớp loại thật, và một tệp không phải ảnh mà tên có đuôi ảnh MUST được thêm `.bin`.

#### Scenario: JPEG mang tên PNG
- **WHEN** người dùng gửi một JPEG tên `chup.png`
- **THEN** tệp được gửi như ảnh với tên `chup.jpg`

#### Scenario: Ảnh quá lớn
- **WHEN** người dùng gửi một ảnh JPEG 12 MB
- **THEN** máy chủ trả `413 FILE_TOO_LARGE` có giới hạn 10 MB và connector không nhận lệnh nào

### Requirement: Chỉ nơi gửi được tệp, không gửi hai lần
Cuộc trò chuyện mà connector hay tài khoản không có `SEND_FILES` MUST bị từ chối như khi không gửi được tin, và không gửi gì. Gửi lại cùng `clientMessageId` MUST không gửi lần thứ hai, như tin chữ: đã gửi thì trả tin đã có; kết quả lần trước chưa rõ thì MUST đối chiếu chứ không gửi mù.

#### Scenario: Cuộc trò chuyện Gmail
- **WHEN** người dùng gửi một tệp vào một cuộc trò chuyện Gmail
- **THEN** máy chủ từ chối và Gmail không nhận lệnh nào

#### Scenario: Gửi lại sau khi đã gửi
- **WHEN** web gửi lại cùng `clientMessageId` và cùng tệp sau khi lần đầu đã gửi được
- **THEN** máy chủ trả `200` với đúng tin đó, và connector chỉ nhận một lệnh
