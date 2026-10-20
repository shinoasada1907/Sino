## ADDED Requirements

### Requirement: Gửi một sticker vào một cuộc trò chuyện
`POST /api/conversations/{id}/messages` với `{ clientMessageId, stickerId }` (không có `text`) MUST gửi ảnh của sticker đó qua tài khoản của cuộc trò chuyện và trả tin đã gửi như khi gửi chữ (`201`, hoặc `200` khi `clientMessageId` này đã gửi rồi). Có cả `text` lẫn `stickerId`, hay không có cái nào, MUST là `400 VALIDATION_FAILED`. Tin đi MUST được lưu với loại `IMAGE`, chữ `[Sticker]` và metadata `stickerId`, và MUST hiện trong danh sách tin của cuộc trò chuyện.

#### Scenario: Gửi sticker
- **WHEN** người dùng gửi `{ clientMessageId, stickerId }` với một sticker PNG của mình vào một chat Zalo
- **THEN** connector Zalo nhận một lệnh có ảnh PNG đúng byte của sticker, và phản hồi `201` có tin loại `IMAGE`, chữ `[Sticker]`, `stickerId` đúng

#### Scenario: Có cả chữ và sticker
- **WHEN** người dùng gửi `{ clientMessageId, text: "hi", stickerId }`
- **THEN** máy chủ trả `400 VALIDATION_FAILED` và không gửi gì

### Requirement: Chỉ sticker của mình, chỉ nơi gửi được ảnh
Sticker không thuộc người gọi hay không tồn tại MUST là `404 STICKER_NOT_FOUND`, và không gửi gì. Cuộc trò chuyện mà connector không có `SEND_IMAGES` MUST bị từ chối như khi không gửi được tin (mã lỗi trả lời hiện có của F10 cho trạng thái không hỗ trợ), và không gửi gì.

#### Scenario: Sticker của người khác
- **WHEN** người dùng gửi `stickerId` của một sticker của người khác
- **THEN** máy chủ trả `404 STICKER_NOT_FOUND` và connector không nhận lệnh nào

#### Scenario: Cuộc trò chuyện Gmail
- **WHEN** người dùng gửi một sticker vào một cuộc trò chuyện Gmail
- **THEN** máy chủ từ chối và Gmail không nhận lệnh nào

### Requirement: Không gửi hai lần một sticker
Gửi lại cùng `clientMessageId` MUST không gửi lần thứ hai, như tin chữ của F10: đã gửi thì trả tin đã có; kết quả lần trước chưa rõ thì MUST đối chiếu chứ không gửi mù. Tin Zalo gửi về lại cho chính tài khoản (selfListen) với cùng mã tin MUST được nhận là cùng một tin, và MUST giữ metadata `stickerId`.

#### Scenario: Gửi lại sau khi mạng chập chờn
- **WHEN** web gửi lại cùng `clientMessageId` sau khi lần đầu đã gửi được
- **THEN** máy chủ trả `200` với đúng tin đó, và connector chỉ nhận một lệnh

#### Scenario: Tin vọng lại từ Zalo
- **WHEN** Zalo đẩy về tin ảnh của chính tài khoản với mã tin của lần gửi
- **THEN** cuộc trò chuyện vẫn có đúng một tin sticker, còn `stickerId`
