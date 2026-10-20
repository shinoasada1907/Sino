## MODIFIED Requirements

### Requirement: Tải một sticker lên thư viện của người dùng
`POST /api/stickers` (`multipart/form-data`, phần `file` bắt buộc, các phần `name` và `packId` tùy chọn) MUST lưu một ảnh PNG, GIF hoặc WebP vào thư viện của người dùng đang đăng nhập và trả `201` với `Location: /api/stickers/{id}` và một `StickerResponse` gồm `id`, `name`, `mediaType`, `kind`, `width`, `height`, `sizeBytes`, `packId`, `createdAt`, không kèm byte của ảnh. `kind` MUST là `ANIMATED` khi ảnh có từ hai khung trở lên và `STATIC` trong các trường hợp còn lại; người dùng MUST không khai được `kind`. Khi không có `name`, tên MUST lấy từ tên tệp bỏ đuôi; tên MUST được cắt khoảng trắng đầu cuối và tối đa 50 ký tự (đếm theo code point), và MUST là `Sticker` nếu rỗng. Khi có `packId`, sticker MUST vào bộ đó; bộ không thuộc người gọi hay không tồn tại MUST làm lần tải bị từ chối với `404 STICKER_PACK_NOT_FOUND` và không ghi gì. Không có `packId` thì `packId` của sticker là `null`.

#### Scenario: Tải một ảnh PNG tĩnh
- **WHEN** người dùng tải `meo.png` (PNG hợp lệ, 256 × 256, một khung) không kèm `name`
- **THEN** phản hồi `201`, `name` là `meo`, `mediaType` là `image/png`, `kind` là `STATIC`, `width` 256, `height` 256, `packId` là `null`, và `GET /api/stickers` có sticker này

#### Scenario: Tải một GIF động
- **WHEN** người dùng tải `nhay.gif` (GIF hợp lệ có 12 khung)
- **THEN** phản hồi `201` với `mediaType` `image/gif` và `kind` `ANIMATED`

#### Scenario: GIF chỉ có một khung
- **WHEN** người dùng tải một GIF hợp lệ chỉ có một khung
- **THEN** `kind` là `STATIC`

#### Scenario: Đặt tên
- **WHEN** người dùng tải một ảnh kèm `name` = `  Mèo vui  `
- **THEN** `name` là `Mèo vui`

#### Scenario: Tải vào một bộ
- **WHEN** người dùng tải `meo.png` kèm `packId` của bộ `Mèo` của mình
- **THEN** phản hồi `201` với `packId` của bộ `Mèo`, và `stickerCount` của bộ tăng một

#### Scenario: Tải vào bộ của người khác
- **WHEN** người dùng tải một ảnh kèm `packId` của một bộ của người khác
- **THEN** phản hồi `404 STICKER_PACK_NOT_FOUND` và không có sticker nào được lưu

### Requirement: Liệt kê sticker của người dùng
`GET /api/stickers` MUST trả `{ items }` chỉ gồm sticker của người dùng đang đăng nhập, mới nhất trước, mỗi phần tử là một `StickerResponse` không kèm byte, có `packId` (`null` khi chưa xếp bộ). Việc liệt kê MUST không đọc cột nội dung.

#### Scenario: Thứ tự
- **WHEN** người dùng tải `a.png` rồi `b.gif`
- **THEN** `items` là `[b, a]`

#### Scenario: Người khác không thấy
- **WHEN** chủ khác có sticker riêng
- **THEN** danh sách của người dùng này không chứa sticker đó

#### Scenario: Thư viện trống
- **WHEN** người dùng chưa tải gì
- **THEN** `items` là `[]`

## ADDED Requirements

### Requirement: Đổi tên hoặc chuyển bộ một sticker
`PATCH /api/stickers/{id}` với `{ name?, packId? }` MUST đổi tên theo cùng quy tắc tên của lần tải lên, và/hoặc chuyển sticker vào bộ `packId` (`null` là "Chưa xếp bộ"); trường không gửi MUST giữ nguyên, và MUST có ít nhất một trường. Nội dung ảnh MUST không đổi. Trả `200` với `StickerResponse` mới. Sticker của người khác MUST là `404 STICKER_NOT_FOUND`; bộ của người khác MUST là `404 STICKER_PACK_NOT_FOUND`.

#### Scenario: Chuyển sang bộ khác
- **WHEN** người dùng gửi `{ "packId": "<id bộ Chó>" }` cho sticker `meo` đang ở bộ `Mèo`
- **THEN** `meo` có `packId` của bộ `Chó`, `stickerCount` của `Mèo` giảm một và của `Chó` tăng một

#### Scenario: Bỏ khỏi bộ
- **WHEN** người dùng gửi `{ "packId": null }` cho `meo`
- **THEN** `meo` có `packId` `null`

#### Scenario: Không có trường nào
- **WHEN** người dùng gửi `{}`
- **THEN** máy chủ trả `400 VALIDATION_FAILED`
