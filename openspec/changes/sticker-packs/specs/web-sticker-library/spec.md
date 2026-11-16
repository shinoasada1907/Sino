## MODIFIED Requirements

### Requirement: Màn Sticker liệt kê thư viện của người dùng
Màn Sticker (`/stickers`) MUST hiện các sticker của người dùng từ `GET /api/stickers` dưới dạng lưới chia theo bộ (`GET /api/sticker-packs`): mỗi bộ một phần có tên bộ và số sticker, theo thứ tự của danh sách bộ, và một phần "Chưa xếp bộ" ở cuối cho sticker có `packId` `null`; phần trống của một bộ MUST vẫn hiện tên bộ và nói bộ đang trống, còn "Chưa xếp bộ" trống thì không hiện. Mỗi ô là một ảnh lấy từ `GET /api/stickers/{id}/content` kèm tên. Sticker `ANIMATED` MUST tự chạy trong lưới. Mỗi ảnh MUST có `alt` là tên của sticker và MUST tải lười (`loading="lazy"`). Khi thư viện chưa có bộ nào và chưa có sticker nào MUST có trạng thái trống nói rõ cách tải lên; khi đang tải MUST có trạng thái đang tải; khi tải danh sách lỗi MUST nói lỗi và có nút thử lại, không để màn trắng.

#### Scenario: Có sticker
- **WHEN** người dùng mở `/stickers` và thư viện có hai sticker chưa xếp bộ, `meo` (PNG) và `nhay` (GIF)
- **THEN** phần "Chưa xếp bộ" có hai ô với ảnh tên `meo` và `nhay`

#### Scenario: Theo bộ
- **WHEN** thư viện có bộ `Mèo` với `meo`, bộ `Chó` chưa có sticker, và `nhay` chưa xếp bộ
- **THEN** màn có phần `Mèo` (1 sticker) với `meo`, phần `Chó` nói bộ đang trống, rồi phần "Chưa xếp bộ" với `nhay`

#### Scenario: Thư viện trống
- **WHEN** thư viện chưa có bộ và chưa có sticker
- **THEN** màn nói thư viện đang trống và chỉ cách tải lên, không hiện lưới rỗng

#### Scenario: Lỗi tải danh sách
- **WHEN** `GET /api/stickers` hoặc `GET /api/sticker-packs` lỗi
- **THEN** màn hiện thông báo lỗi và nút "Thử lại" gọi lại yêu cầu

### Requirement: Tải sticker lên bằng chọn tệp hoặc kéo thả
Màn Sticker MUST cho chọn ảnh bằng nút chọn tệp (dùng được bằng bàn phím) và bằng kéo thả tệp vào màn; chọn hay thả MUST mở bước "Thêm sticker" (spec `sticker-upload-editor`) để xem trước và chỉnh từng ảnh, và chỉ khi người dùng lưu mới gửi `POST /api/stickers` dạng `multipart/form-data` cho từng ảnh. Trước khi vào lượt, web MUST kiểm sơ bộ loại tệp (PNG, GIF, WebP, JPEG) và MUST báo ngay lỗi của tệp không đạt mà không gọi máy chủ; máy chủ vẫn là nơi quyết định cuối. Trong lúc lưu MUST có trạng thái của từng ảnh; xong thì sticker MUST xuất hiện trong lưới, trong đúng bộ, mà không phải tải lại trang. Chọn nhiều tệp cùng lúc MUST được hỗ trợ, và một ảnh lỗi MUST không làm hỏng các ảnh còn lại.

#### Scenario: Chọn một ảnh
- **WHEN** người dùng chọn `meo.png` bằng nút tải lên rồi bấm "Lưu" trong bước "Thêm sticker"
- **THEN** một yêu cầu `POST /api/stickers` multipart được gửi, và sau khi xong lưới có sticker mới đầu tiên trong bộ đã chọn

#### Scenario: Kéo thả
- **WHEN** người dùng kéo `nhay.gif` thả vào màn
- **THEN** bước "Thêm sticker" mở với `nhay.gif`, như khi chọn bằng nút

#### Scenario: Tệp sai loại bị chặn tại chỗ
- **WHEN** người dùng chọn một tệp `.pdf`
- **THEN** màn báo tệp đó không phải ảnh dùng được và không có yêu cầu nào tới máy chủ

#### Scenario: Nhiều ảnh, một ảnh lỗi
- **WHEN** người dùng lưu ba ảnh và máy chủ từ chối ảnh thứ hai
- **THEN** hai ảnh còn lại vào lưới, và lỗi của ảnh thứ hai được nêu cùng tên của nó

## ADDED Requirements

### Requirement: Quản lý bộ trên màn Sticker
Màn Sticker MUST cho tạo bộ ("Tạo bộ", hỏi tên), đổi tên bộ và xóa bộ (hỏi trước, nói rõ các sticker của bộ sẽ về "Chưa xếp bộ"), và MUST cho chuyển một sticker sang bộ khác hoặc về "Chưa xếp bộ" từ chính ô của sticker. Lỗi của máy chủ (`STICKER_PACK_NAME_TAKEN`, `STICKER_PACK_LIMIT_REACHED`, `STICKER_PACK_NOT_FOUND`, mạng) MUST được nói bằng tiếng Việt tại chỗ. Mọi thao tác này MUST dùng được bằng bàn phím.

#### Scenario: Tạo bộ trùng tên
- **WHEN** người dùng đã có bộ `Mèo` và tạo bộ `mèo`
- **THEN** màn nói đã có bộ tên này, và không có bộ mới

#### Scenario: Xóa bộ
- **WHEN** người dùng xóa bộ `Mèo` có hai sticker và xác nhận
- **THEN** phần `Mèo` biến mất, và hai sticker hiện trong "Chưa xếp bộ"

#### Scenario: Chuyển sticker
- **WHEN** người dùng chuyển `meo` từ bộ `Mèo` sang bộ `Chó`
- **THEN** ô `meo` rời phần `Mèo` và hiện trong phần `Chó`
