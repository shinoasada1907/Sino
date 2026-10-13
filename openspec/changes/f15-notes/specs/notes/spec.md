## ADDED Requirements

### Requirement: Một ghi chú
Một ghi chú MUST có nội dung (`body`) với ít nhất một ký tự không phải khoảng trắng, tối đa 20.000 ký tự, lưu đúng như người dùng gõ. Tiêu đề (`title`) MAY có, tối đa 200 ký tự, bỏ khoảng trắng hai đầu; tiêu đề trống MUST được lưu và trả là `null`. Ghi chú MUST có `pinned`, thời điểm tạo, thời điểm sửa và `version`, và thuộc về đúng một người dùng Sino. Ở phiên bản này ghi chú không có neo: API MUST trả `anchor` và `quote` là `null`, `linked` là `[]`.

#### Scenario: Nội dung quá dài
- **WHEN** người dùng lưu một ghi chú có nội dung 20.001 ký tự
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED` và không có gì được lưu

#### Scenario: Nội dung chỉ có khoảng trắng
- **WHEN** người dùng tạo một ghi chú với `{ "title": "Gọi lại", "body": "   " }`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Tiêu đề trống
- **WHEN** người dùng tạo một ghi chú với `{ "title": "  ", "body": "Mang theo CCCD" }`
- **THEN** ghi chú được lưu với `title` là `null`

### Requirement: Danh sách ghi chú
`GET /api/notes` MUST trả `{ generatedAt, notes }` gồm mọi ghi chú của người gọi, mỗi ghi chú đủ nội dung, sắp theo thời điểm sửa gần nhất trước.

#### Scenario: Chỉ thấy ghi chú của mình
- **WHEN** hai người dùng mỗi người có một ghi chú, và người thứ nhất gọi `GET /api/notes`
- **THEN** danh sách chỉ có ghi chú của người thứ nhất

#### Scenario: Ghi chú vừa sửa lên đầu
- **WHEN** người dùng sửa nội dung của ghi chú cũ nhất rồi đọc danh sách
- **THEN** ghi chú đó đứng đầu danh sách

### Requirement: Tạo ghi chú
`POST /api/notes` với nội dung và, tùy chọn, tiêu đề MUST lưu một ghi chú chưa ghim và trả `201 Created` kèm `Location` và ghi chú vừa tạo.

#### Scenario: Tạo ghi chú độc lập
- **WHEN** người dùng gửi `{ "body": "Gọi lại cho phòng khám" }`
- **THEN** máy chủ trả `201` với ghi chú có `title` là `null`, `pinned` là `false`, `anchor` là `null`, và ghi chú có trong danh sách

### Requirement: Sửa ghi chú có kiểm phiên bản
`PATCH /api/notes/{id}` MUST nhận `version` đã đọc cùng ít nhất một trong `title`, `body`, `pinned`; trường không gửi hoặc `null` MUST giữ nguyên, `title` rỗng MUST bỏ tiêu đề. Khi `version` khác phiên bản hiện tại, máy chủ MUST trả `409 CONCURRENT_MODIFICATION` và MUST NOT ghi gì. Thời điểm sửa MUST chỉ đổi khi tiêu đề hoặc nội dung đổi giá trị; ghim hay bỏ ghim MUST NOT đổi thời điểm sửa. Mỗi lần ghi có thay đổi MUST tăng `version`.

#### Scenario: Lưu từ tab cũ
- **WHEN** ghi chú đang ở `version` 3, và một tab còn giữ `version` 2 gửi `PATCH` với nội dung mới
- **THEN** máy chủ trả `409 CONCURRENT_MODIFICATION` và nội dung đã lưu không đổi

#### Scenario: Ghim không phải một lần sửa
- **WHEN** người dùng ghim một ghi chú sửa lần cuối hôm qua
- **THEN** `pinned` là `true`, thời điểm sửa vẫn là hôm qua, và `version` tăng

#### Scenario: Sửa nội dung
- **WHEN** người dùng gửi `PATCH` với đúng `version` và nội dung mới
- **THEN** máy chủ trả ghi chú với nội dung mới, thời điểm sửa mới và `version` mới

### Requirement: Xóa ghi chú
`DELETE /api/notes/{id}` MUST xóa hẳn ghi chú và trả `204 No Content`.

#### Scenario: Xóa rồi đọc lại
- **WHEN** người dùng xóa một ghi chú rồi gọi `GET /api/notes/{id}` của nó
- **THEN** máy chủ trả `404 NOTE_NOT_FOUND`

### Requirement: Ghi chú của người khác
Mọi lệnh trên một ghi chú không thuộc người gọi MUST trả `404 NOTE_NOT_FOUND`, như ghi chú không tồn tại.

#### Scenario: Sửa ghi chú của người khác
- **WHEN** người dùng gửi `PATCH` tới ID một ghi chú của người khác
- **THEN** máy chủ trả `404 NOTE_NOT_FOUND` và ghi chú đó không đổi
