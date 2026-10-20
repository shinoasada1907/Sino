## ADDED Requirements

### Requirement: Một ghi chú
Một ghi chú MUST thuộc một trong hai loại (`kind`): `TEXT` hoặc `DIAGRAM`, và loại MUST NOT đổi sau khi tạo. Ghi chú `TEXT` MUST có nội dung (`body`) với ít nhất một ký tự không phải khoảng trắng, tối đa 20.000 ký tự, lưu đúng như người dùng gõ, và `diagram` là `null`. Ghi chú `DIAGRAM` MUST có `diagram` (xem "Ghi chú dạng sơ đồ") và `body` là chuỗi rỗng. Tiêu đề (`title`) MAY có, tối đa 200 ký tự, bỏ khoảng trắng hai đầu; tiêu đề trống MUST được lưu và trả là `null`. Ghi chú MUST có `pinned`, thời điểm tạo, thời điểm sửa và `version`, và thuộc về đúng một người dùng Sino. Ở phiên bản này ghi chú không có neo: API MUST trả `anchor` và `quote` là `null`, `linked` là `[]`.

#### Scenario: Nội dung quá dài
- **WHEN** người dùng lưu một ghi chú có nội dung 20.001 ký tự
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED` và không có gì được lưu

#### Scenario: Nội dung chỉ có khoảng trắng
- **WHEN** người dùng tạo một ghi chú với `{ "title": "Gọi lại", "body": "   " }`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Tiêu đề trống
- **WHEN** người dùng tạo một ghi chú với `{ "title": "  ", "body": "Mang theo CCCD" }`
- **THEN** ghi chú được lưu với `title` là `null`

### Requirement: Ghi chú dạng sơ đồ
Sơ đồ (`diagram`) của ghi chú `DIAGRAM` MUST gồm `blocks` (1 đến 300 khối) và `links` (0 đến 600 đường nối). Mỗi khối MUST có `id` (UUID, không trùng trong sơ đồ), `x` và `y` (số hữu hạn), `text` (0 đến 2.000 ký tự), `color` (`DEFAULT`, `YELLOW`, `GREEN`, `RED`, `BLUE`) và `main` (đúng / sai). Mỗi đường nối MUST có `id` (UUID, không trùng trong sơ đồ), `from` và `to` là `id` của hai khối **khác nhau** có trong cùng sơ đồ, `fromSide` và `toSide` (`TOP`, `RIGHT`, `BOTTOM`, `LEFT`), và `label` (`null` hoặc tối đa 80 ký tự); mỗi cặp (`from`, `to`) MUST có tối đa một đường nối. Chữ trong sơ đồ MUST NOT chứa ký tự NUL. Sơ đồ sai MUST bị từ chối với `400 VALIDATION_FAILED` và không có gì được lưu. Sơ đồ MUST được lưu và trả lại nguyên vẹn (khối, vị trí, màu, chữ, đường nối, thứ tự), và MUST được thay toàn bộ ở mỗi lần sửa.

#### Scenario: Tạo ghi chú sơ đồ
- **WHEN** người dùng gửi `POST /api/notes` với `{ "kind": "DIAGRAM", "title": "Chuyến đi", "diagram": { "blocks": [khối A, khối B], "links": [nối A → B] } }`
- **THEN** máy chủ trả `201` với `kind` là `DIAGRAM`, `body` là `""`, `diagram` giống hệt sơ đồ đã gửi, và ghi chú có trong danh sách

#### Scenario: Đọc lại sơ đồ đã lưu
- **WHEN** người dùng tạo một sơ đồ 7 khối, 6 đường nối rồi gọi `GET /api/notes`
- **THEN** ghi chú đó có đủ 7 khối và 6 đường nối, mỗi khối giữ đúng chữ, vị trí, màu và `main`

#### Scenario: Đường nối tới khối không có
- **WHEN** người dùng tạo một sơ đồ có một đường nối với `to` là `id` không thuộc khối nào của sơ đồ
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED` và không có ghi chú nào được tạo

#### Scenario: Sơ đồ không có khối
- **WHEN** người dùng tạo một sơ đồ với `"blocks": []`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Sơ đồ quá lớn
- **WHEN** người dùng tạo một sơ đồ có 301 khối
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Hai đường nối cùng một cặp
- **WHEN** người dùng tạo một sơ đồ có hai đường nối cùng `from` và cùng `to`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Chữ gửi cho sơ đồ
- **WHEN** người dùng tạo một ghi chú `DIAGRAM` có kèm `"body": "ghi chú"`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

### Requirement: Danh sách ghi chú
`GET /api/notes` MUST trả `{ generatedAt, notes }` gồm mọi ghi chú của người gọi, mỗi ghi chú đủ nội dung (ghi chú sơ đồ kèm cả sơ đồ), sắp theo thời điểm sửa gần nhất trước.

#### Scenario: Chỉ thấy ghi chú của mình
- **WHEN** hai người dùng mỗi người có một ghi chú, và người thứ nhất gọi `GET /api/notes`
- **THEN** danh sách chỉ có ghi chú của người thứ nhất

#### Scenario: Ghi chú vừa sửa lên đầu
- **WHEN** người dùng sửa nội dung của ghi chú cũ nhất rồi đọc danh sách
- **THEN** ghi chú đó đứng đầu danh sách

### Requirement: Tạo ghi chú
`POST /api/notes` MUST nhận `kind` (thiếu thì là `TEXT`), tiêu đề tùy chọn, và nội dung (`TEXT`) hoặc sơ đồ (`DIAGRAM`); MUST lưu một ghi chú chưa ghim và trả `201 Created` kèm `Location` và ghi chú vừa tạo. Ghi chú `TEXT` mà có `diagram`, hoặc `DIAGRAM` mà thiếu `diagram`, MUST bị từ chối với `400 VALIDATION_FAILED`.

#### Scenario: Tạo ghi chú độc lập
- **WHEN** người dùng gửi `{ "body": "Gọi lại cho phòng khám" }`
- **THEN** máy chủ trả `201` với ghi chú có `kind` là `TEXT`, `title` là `null`, `pinned` là `false`, `diagram` là `null`, `anchor` là `null`, và ghi chú có trong danh sách

#### Scenario: Ghi chú chữ kèm sơ đồ
- **WHEN** người dùng gửi `{ "body": "Gọi lại", "diagram": { "blocks": [khối A], "links": [] } }`
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

### Requirement: Sửa ghi chú có kiểm phiên bản
`PATCH /api/notes/{id}` MUST nhận `version` đã đọc cùng ít nhất một trong `title`, `body`, `pinned`, `diagram`; trường không gửi hoặc `null` MUST giữ nguyên, `title` rỗng MUST bỏ tiêu đề. `body` MUST chỉ được gửi cho ghi chú `TEXT` và `diagram` chỉ cho ghi chú `DIAGRAM`; gửi sai loại MUST bị từ chối với `422 NOTE_KIND_MISMATCH` và MUST NOT ghi gì (kiểm trước `version`). `diagram` MUST thay toàn bộ sơ đồ đã lưu. Khi `version` khác phiên bản hiện tại, máy chủ MUST trả `409 CONCURRENT_MODIFICATION` và MUST NOT ghi gì. Thời điểm sửa MUST chỉ đổi khi tiêu đề, nội dung hoặc sơ đồ đổi giá trị; ghim hay bỏ ghim, hoặc gửi lại sơ đồ y nguyên, MUST NOT đổi thời điểm sửa. Mỗi lần ghi có thay đổi MUST tăng `version`; gửi lại đúng giá trị đang lưu MUST NOT tăng `version`.

#### Scenario: Lưu từ tab cũ
- **WHEN** ghi chú đang ở `version` 3, và một tab còn giữ `version` 2 gửi `PATCH` với nội dung mới
- **THEN** máy chủ trả `409 CONCURRENT_MODIFICATION` và nội dung đã lưu không đổi

#### Scenario: Ghim không phải một lần sửa
- **WHEN** người dùng ghim một ghi chú sửa lần cuối hôm qua
- **THEN** `pinned` là `true`, thời điểm sửa vẫn là hôm qua, và `version` tăng

#### Scenario: Sửa nội dung
- **WHEN** người dùng gửi `PATCH` với đúng `version` và nội dung mới
- **THEN** máy chủ trả ghi chú với nội dung mới, thời điểm sửa mới và `version` mới

#### Scenario: Sửa sơ đồ
- **WHEN** người dùng gửi `PATCH` với đúng `version` và một sơ đồ có thêm một khối và một đường nối
- **THEN** máy chủ trả ghi chú với sơ đồ mới (thay toàn bộ), thời điểm sửa mới và `version` tăng

#### Scenario: Lưu sơ đồ từ tab cũ
- **WHEN** sơ đồ đang ở `version` 5, và một tab còn giữ `version` 4 gửi `PATCH` với một sơ đồ khác
- **THEN** máy chủ trả `409 CONCURRENT_MODIFICATION` và sơ đồ đã lưu không đổi

#### Scenario: Gửi lại sơ đồ y nguyên
- **WHEN** người dùng gửi `PATCH` với đúng `version` và sơ đồ giống hệt sơ đồ đang lưu
- **THEN** `version` và thời điểm sửa không đổi

#### Scenario: Sơ đồ gửi cho ghi chú chữ
- **WHEN** người dùng gửi `PATCH` với `diagram` tới một ghi chú `TEXT`
- **THEN** yêu cầu bị từ chối với `422 NOTE_KIND_MISMATCH` và ghi chú không đổi

#### Scenario: Chữ gửi cho ghi chú sơ đồ
- **WHEN** người dùng gửi `PATCH` với `body` tới một ghi chú `DIAGRAM`
- **THEN** yêu cầu bị từ chối với `422 NOTE_KIND_MISMATCH` và ghi chú không đổi

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
