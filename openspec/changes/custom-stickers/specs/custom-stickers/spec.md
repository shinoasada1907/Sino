## ADDED Requirements

### Requirement: Tải một sticker lên thư viện của người dùng
`POST /api/stickers` (`multipart/form-data`, phần `file` bắt buộc, phần `name` tùy chọn) MUST lưu một ảnh PNG, GIF hoặc WebP vào thư viện của người dùng đang đăng nhập và trả `201` với `Location: /api/stickers/{id}` và một `StickerResponse` gồm `id`, `name`, `mediaType`, `kind`, `width`, `height`, `sizeBytes`, `createdAt`, không kèm byte của ảnh. `kind` MUST là `ANIMATED` khi ảnh có từ hai khung trở lên và `STATIC` trong các trường hợp còn lại; người dùng MUST không khai được `kind`. Khi không có `name`, tên MUST lấy từ tên tệp bỏ đuôi; tên MUST được cắt khoảng trắng đầu cuối và tối đa 50 ký tự (đếm theo code point), và MUST là `Sticker` nếu rỗng.

#### Scenario: Tải một ảnh PNG tĩnh
- **WHEN** người dùng tải `meo.png` (PNG hợp lệ, 256 × 256, một khung) không kèm `name`
- **THEN** phản hồi `201`, `name` là `meo`, `mediaType` là `image/png`, `kind` là `STATIC`, `width` 256, `height` 256, và `GET /api/stickers` có sticker này

#### Scenario: Tải một GIF động
- **WHEN** người dùng tải `nhay.gif` (GIF hợp lệ có 12 khung)
- **THEN** phản hồi `201` với `mediaType` `image/gif` và `kind` `ANIMATED`

#### Scenario: GIF chỉ có một khung
- **WHEN** người dùng tải một GIF hợp lệ chỉ có một khung
- **THEN** `kind` là `STATIC`

#### Scenario: Đặt tên
- **WHEN** người dùng tải một ảnh kèm `name` = `  Mèo vui  `
- **THEN** `name` là `Mèo vui`

### Requirement: Chỉ nhận ảnh hợp lệ trong giới hạn
Loại ảnh MUST được nhận ra bằng nội dung của tệp (chữ ký ở đầu tệp), không bằng đuôi tên tệp hay `Content-Type` của phần multipart. Loại khác PNG, GIF, WebP MUST bị từ chối `415 STICKER_TYPE_UNSUPPORTED`. Chiều rộng và chiều cao MUST được đo từ phần đầu của tệp mà không giải mã điểm ảnh; ảnh có phần đầu hỏng, hoặc có cạnh vượt giới hạn, MUST bị từ chối `422 STICKER_INVALID_IMAGE`. Tệp lớn hơn giới hạn dung lượng MUST bị từ chối `413 STICKER_TOO_LARGE`, kể cả khi vượt hàng rào multipart của máy chủ, và MUST không trả `500`. Thiếu phần `file` hoặc tệp rỗng MUST trả `422 STICKER_FILE_MISSING`. Các giới hạn là số của DN-1 trong `design.md`.

#### Scenario: Tệp đổi đuôi
- **WHEN** người dùng tải một tệp văn bản đặt tên `meo.png`, khai `Content-Type: image/png`
- **THEN** phản hồi `415 STICKER_TYPE_UNSUPPORTED`, và thư viện không có thêm sticker

#### Scenario: Định dạng khác
- **WHEN** người dùng tải một ảnh JPEG hoặc SVG hợp lệ
- **THEN** phản hồi `415 STICKER_TYPE_UNSUPPORTED`

#### Scenario: Ảnh khai kích thước khổng lồ
- **WHEN** người dùng tải một PNG nhỏ có phần đầu khai chiều rộng 60.000 điểm ảnh
- **THEN** phản hồi `422 STICKER_INVALID_IMAGE`, và máy chủ không giải mã ảnh đó

#### Scenario: Quá dung lượng
- **WHEN** người dùng tải một ảnh PNG lớn hơn giới hạn dung lượng
- **THEN** phản hồi `413 STICKER_TOO_LARGE`, không phải `500`

#### Scenario: Không có tệp
- **WHEN** người dùng gửi `POST /api/stickers` không có phần `file`, hoặc `file` rỗng
- **THEN** phản hồi `422 STICKER_FILE_MISSING`

### Requirement: Không trùng nội dung và có hạn mức
Một người dùng MUST không có hai sticker cùng nội dung: tải một ảnh có cùng SHA-256 với một sticker đã có của người đó MUST bị từ chối `409 STICKER_DUPLICATE` và nêu id của sticker đã có. Khi người dùng đã đủ số sticker tối đa, tải thêm MUST bị từ chối `409 STICKER_LIMIT_REACHED`. Hai người dùng khác nhau MAY có cùng một nội dung. Các giới hạn là số của DN-1 và DN-2 trong `design.md`.

#### Scenario: Tải lại cùng ảnh
- **WHEN** người dùng tải `meo.png` hai lần
- **THEN** lần hai trả `409 STICKER_DUPLICATE` kèm id của sticker lần một, và thư viện vẫn có một sticker

#### Scenario: Đủ hạn mức
- **WHEN** người dùng đang có đúng số sticker tối đa và tải thêm một ảnh mới
- **THEN** phản hồi `409 STICKER_LIMIT_REACHED`

#### Scenario: Xóa rồi tải lại
- **WHEN** người dùng xóa `meo.png` rồi tải lại đúng ảnh đó
- **THEN** phản hồi `201` (ảnh đã xóa không còn tính là trùng)

### Requirement: Liệt kê sticker của người dùng
`GET /api/stickers` MUST trả `{ items }` chỉ gồm sticker của người dùng đang đăng nhập, mới nhất trước, mỗi phần tử là một `StickerResponse` không kèm byte. Việc liệt kê MUST không đọc cột nội dung.

#### Scenario: Thứ tự
- **WHEN** người dùng tải `a.png` rồi `b.gif`
- **THEN** `items` là `[b, a]`

#### Scenario: Người khác không thấy
- **WHEN** chủ khác có sticker riêng
- **THEN** danh sách của người dùng này không chứa sticker đó

#### Scenario: Thư viện trống
- **WHEN** người dùng chưa tải gì
- **THEN** `items` là `[]`

### Requirement: Phục vụ nội dung ảnh
`GET /api/stickers/{id}/content` MUST trả đúng byte đã lưu với `Content-Type` là loại đã nhận ra lúc tải, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` và `Cache-Control: private, max-age=31536000, immutable`. Sticker không tồn tại hoặc của người khác MUST trả `404 STICKER_NOT_FOUND`, không phân biệt hai trường hợp.

#### Scenario: Lấy lại đúng byte
- **WHEN** người dùng tải `meo.png` rồi gọi `GET /api/stickers/{id}/content`
- **THEN** thân phản hồi giống từng byte với tệp đã tải, `Content-Type` là `image/png`, và có `nosniff`

#### Scenario: Id của người khác
- **WHEN** người dùng gọi `GET /api/stickers/{id}/content` với id của một sticker thuộc chủ khác
- **THEN** phản hồi `404 STICKER_NOT_FOUND`

#### Scenario: Id không tồn tại
- **WHEN** người dùng gọi với một id chưa từng có
- **THEN** phản hồi `404 STICKER_NOT_FOUND`

### Requirement: Xóa sticker
`DELETE /api/stickers/{id}` MUST xóa sticker và nội dung của nó và trả `204`. Sau đó cả `GET /api/stickers/{id}/content` MUST trả `404` và sticker MUST không còn trong danh sách. Id của người khác hoặc không tồn tại MUST trả `404 STICKER_NOT_FOUND` và MUST không xóa gì.

#### Scenario: Xóa
- **WHEN** người dùng xóa một sticker của mình
- **THEN** phản hồi `204`, danh sách không còn nó, nội dung của nó trả `404`, và bảng nội dung không còn dòng của nó

#### Scenario: Xóa sticker của người khác
- **WHEN** người dùng xóa id của sticker thuộc chủ khác
- **THEN** phản hồi `404` và sticker đó vẫn còn nguyên

### Requirement: Chỉ người đã đăng nhập dùng được
Mọi điểm cuối của `/api/stickers` MUST yêu cầu phiên đăng nhập, và các lệnh thay đổi (`POST`, `DELETE`) MUST yêu cầu token CSRF như các API khác của Sino.

#### Scenario: Chưa đăng nhập
- **WHEN** một yêu cầu tới `/api/stickers` không có phiên
- **THEN** phản hồi `401`

#### Scenario: Thiếu CSRF
- **WHEN** một `POST /api/stickers` có phiên nhưng không có header CSRF hợp lệ
- **THEN** phản hồi `403` (mã `CSRF_TOKEN_INVALID`) và không lưu gì
