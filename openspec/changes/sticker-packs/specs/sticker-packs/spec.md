## ADDED Requirements

### Requirement: Một bộ sticker
Một bộ sticker MUST thuộc đúng một người dùng Sino và có tên từ 1 đến 50 ký tự (đếm theo code point), đã cắt khoảng trắng đầu cuối. Tên MUST không trùng với tên một bộ khác của cùng người dùng khi so không phân biệt hoa thường; trùng thì máy chủ MUST trả `409 STICKER_PACK_NAME_TAKEN` và không ghi gì. Mỗi người dùng MUST có tối đa `sino.stickers.max-packs-per-owner` bộ (mặc định 50); quá thì `409 STICKER_PACK_LIMIT_REACHED` kèm thành viên `maxPacks`. Một sticker MUST nằm trong tối đa một bộ; sticker không thuộc bộ nào là "Chưa xếp bộ" (`packId` là `null`).

#### Scenario: Tên trống
- **WHEN** người dùng tạo một bộ với `{ "name": "   " }`
- **THEN** máy chủ trả `400 VALIDATION_FAILED` và không có bộ nào được tạo

#### Scenario: Tên trùng khác hoa thường
- **WHEN** người dùng đã có bộ `Mèo` và tạo bộ `mèo`
- **THEN** máy chủ trả `409 STICKER_PACK_NAME_TAKEN`

#### Scenario: Đủ số bộ
- **WHEN** người dùng đã có 50 bộ và tạo thêm một bộ
- **THEN** máy chủ trả `409 STICKER_PACK_LIMIT_REACHED` với `maxPacks` là 50

### Requirement: Liệt kê bộ sticker
`GET /api/sticker-packs` MUST trả `{ items }` gồm mọi bộ của người dùng đang đăng nhập, bộ tạo trước đứng trước, mỗi phần tử có `id`, `name`, `stickerCount`, `coverStickerId` (sticker mới nhất của bộ, `null` khi bộ trống) và `createdAt`. Việc liệt kê MUST không đọc nội dung ảnh.

#### Scenario: Hai bộ
- **WHEN** người dùng tạo bộ `Mèo` rồi bộ `Chó`, và bộ `Mèo` có hai sticker
- **THEN** `items` là `[Mèo, Chó]`, `Mèo` có `stickerCount` 2 và `coverStickerId` là sticker mới hơn trong hai, `Chó` có `stickerCount` 0 và `coverStickerId` `null`

#### Scenario: Người khác không thấy
- **WHEN** một người dùng khác có bộ riêng
- **THEN** danh sách của người dùng này không có bộ đó

### Requirement: Tạo, đổi tên, xóa bộ
`POST /api/sticker-packs` với `{ name }` MUST tạo bộ và trả `201` kèm `Location: /api/sticker-packs/{id}` và bộ vừa tạo. `PATCH /api/sticker-packs/{id}` với `{ name }` MUST đổi tên theo cùng quy tắc tên. `DELETE /api/sticker-packs/{id}` MUST xóa bộ và trả `204`; các sticker của bộ MUST còn nguyên trong thư viện với `packId` là `null`.

#### Scenario: Tạo bộ
- **WHEN** người dùng gửi `{ "name": "  Mèo  " }`
- **THEN** máy chủ trả `201` với `name` `Mèo`, `stickerCount` 0

#### Scenario: Xóa bộ giữ sticker
- **WHEN** người dùng xóa bộ `Mèo` có hai sticker
- **THEN** máy chủ trả `204`, bộ `Mèo` không còn trong danh sách, và hai sticker vẫn có trong `GET /api/stickers` với `packId` `null`

### Requirement: Bộ của người khác là không tìm thấy
Mọi lệnh trên một bộ không thuộc người gọi, và mọi lần tải lên hay chuyển sticker vào một bộ như vậy, MUST trả `404 STICKER_PACK_NOT_FOUND`, như bộ không tồn tại, và MUST không ghi gì.

#### Scenario: Đổi tên bộ của người khác
- **WHEN** người dùng gửi `PATCH` tới ID một bộ của người khác
- **THEN** máy chủ trả `404 STICKER_PACK_NOT_FOUND` và bộ đó giữ nguyên tên
