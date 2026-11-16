## ADDED Requirements

### Requirement: Đọc hồ sơ của owner
`GET /api/profile` MUST trả `200` với `email`, `displayName`, `phoneNumber`, `jobTitle`, `location`, `bio`, `role`, `joinedAt`, `avatarUrl` của owner đang đăng nhập. Trường tùy chọn chưa có giá trị MUST là `null`. `role` MUST là `OWNER`; `joinedAt` MUST là thời điểm tạo `app_user`. `avatarUrl` MUST là `null` khi chưa có ảnh, và khi có ảnh MUST là `/api/profile/avatar?v=` kèm một chuỗi đổi mỗi khi ảnh đổi. Chưa đăng nhập MUST trả `401`.

#### Scenario: Owner mới
- **WHEN** owner vừa được tạo, chưa sửa hồ sơ, gọi `GET /api/profile`
- **THEN** response là `200`, `displayName` là tên trong cấu hình, `phoneNumber`, `jobTitle`, `location`, `bio`, `avatarUrl` đều `null`, và `role` = `OWNER`

#### Scenario: Chưa đăng nhập
- **WHEN** client không có session gọi `GET /api/profile`
- **THEN** response là `401` với `code` = `UNAUTHORIZED`

### Requirement: Sửa thông tin hồ sơ
`PATCH /api/profile` MUST đổi đúng các trường có trong body (`displayName`, `phoneNumber`, `jobTitle`, `location`, `bio`) và giữ nguyên trường không gửi, rồi trả `200` với cả hồ sơ. Giá trị MUST được cắt khoảng trắng hai đầu; một trường tùy chọn trống sau khi cắt MUST thành `null`. `displayName` trống MUST bị từ chối. Giới hạn: `displayName` 1–200 ký tự, `phoneNumber` ≤ 30 ký tự chỉ gồm chữ số, khoảng trắng và `+ ( ) - .`, `jobTitle` và `location` ≤ 100, `bio` ≤ 500; không trường nào có ký tự NUL. Vi phạm hay có trường khác (như `email`, `role`) MUST trả `400` `VALIDATION_FAILED`, chỉ rõ trường lỗi, và không ghi gì. Request MUST cần CSRF token.

#### Scenario: Sửa vài trường
- **WHEN** owner gửi `PATCH /api/profile` với `{"phoneNumber": " +84 912 345 678 ", "bio": "Dòng 1\nDòng 2"}`
- **THEN** response là `200`, `phoneNumber` = `+84 912 345 678`, `bio` giữ xuống dòng, `displayName` không đổi, và `GET /api/profile` sau đó trả cùng giá trị

#### Scenario: Xóa một trường tùy chọn
- **WHEN** owner đã có `jobTitle` gửi `PATCH /api/profile` với `{"jobTitle": "  "}`
- **THEN** response là `200` với `jobTitle` = `null`

#### Scenario: Tên trống
- **WHEN** owner gửi `PATCH /api/profile` với `{"displayName": ""}`
- **THEN** response là `400` `VALIDATION_FAILED` nêu `displayName`, và tên không đổi

#### Scenario: Số điện thoại sai
- **WHEN** owner gửi `PATCH /api/profile` với `{"phoneNumber": "gọi tôi"}`
- **THEN** response là `400` `VALIDATION_FAILED` nêu `phoneNumber`

#### Scenario: Không sửa được email
- **WHEN** owner gửi `PATCH /api/profile` với `{"email": "khac@sino.test"}`
- **THEN** response là `400` `VALIDATION_FAILED` và email không đổi

### Requirement: Ảnh đại diện
`PUT /api/profile/avatar` MUST nhận `multipart/form-data` với phần `file` và lưu nó làm ảnh đại diện của owner, thay ảnh cũ, rồi trả `200` với cả hồ sơ. Tệp lớn hơn 1 MB MUST trả `413`. Tệp mà byte đầu không phải PNG, JPEG hay WebP, hoặc có cạnh lớn hơn 1024 px, MUST trả `400`; loại ảnh MUST xác định từ nội dung, không từ `Content-Type` hay tên tệp client gửi. Lỗi MUST giữ nguyên ảnh cũ. `GET /api/profile/avatar` MUST trả byte của ảnh với `Content-Type` của loại đã xác định, `X-Content-Type-Options: nosniff`, `ETag`, và `304` khi `If-None-Match` khớp; không có ảnh MUST trả `404`. `DELETE /api/profile/avatar` MUST xóa ảnh và trả `204`, kể cả khi không có ảnh. `PUT` và `DELETE` MUST cần CSRF token.

#### Scenario: Tải ảnh lên
- **WHEN** owner gửi `PUT /api/profile/avatar` với một ảnh WebP 256×256 nặng 20 KB
- **THEN** response là `200` với `avatarUrl` khác `null`, và `GET` địa chỉ đó trả đúng byte đã gửi với `Content-Type: image/webp`

#### Scenario: Đổi ảnh đổi địa chỉ
- **WHEN** owner đã có ảnh tải lên một ảnh khác
- **THEN** `avatarUrl` mới khác `avatarUrl` cũ

#### Scenario: Tệp giả làm ảnh
- **WHEN** owner gửi một tệp văn bản tên `anh.png` với `Content-Type: image/png`
- **THEN** response là `400` và ảnh cũ (nếu có) không đổi

#### Scenario: Tệp quá lớn
- **WHEN** owner gửi một ảnh PNG 2 MB
- **THEN** response là `413` và ảnh cũ không đổi

#### Scenario: Ảnh không đổi
- **WHEN** trình duyệt gọi `GET /api/profile/avatar` với `If-None-Match` bằng `ETag` lần trước
- **THEN** response là `304` không có nội dung

#### Scenario: Xóa ảnh
- **WHEN** owner gọi `DELETE /api/profile/avatar`
- **THEN** response là `204`, `GET /api/profile` trả `avatarUrl` = `null`, và `GET /api/profile/avatar` trả `404`
