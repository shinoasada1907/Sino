## ADDED Requirements

### Requirement: Màn Sticker liệt kê thư viện của người dùng
Màn Sticker (`/stickers`) MUST hiện các sticker của người dùng từ `GET /api/stickers` dưới dạng lưới, mỗi ô là một ảnh lấy từ `GET /api/stickers/{id}/content` kèm tên. Sticker `ANIMATED` MUST tự chạy trong lưới. Mỗi ảnh MUST có `alt` là tên của sticker và MUST tải lười (`loading="lazy"`). Khi thư viện trống MUST có trạng thái trống nói rõ cách tải lên; khi đang tải MUST có trạng thái đang tải; khi tải danh sách lỗi MUST nói lỗi và có nút thử lại, không để màn trắng.

#### Scenario: Có sticker
- **WHEN** người dùng mở `/stickers` và thư viện có hai sticker, `meo` (PNG) và `nhay` (GIF)
- **THEN** lưới có hai ô với ảnh tên `meo` và `nhay`

#### Scenario: Thư viện trống
- **WHEN** thư viện chưa có sticker
- **THEN** màn nói thư viện đang trống và chỉ cách tải lên, không hiện lưới rỗng

#### Scenario: Lỗi tải danh sách
- **WHEN** `GET /api/stickers` lỗi
- **THEN** màn hiện thông báo lỗi và nút "Thử lại" gọi lại yêu cầu

### Requirement: Tải sticker lên bằng chọn tệp hoặc kéo thả
Màn Sticker MUST cho tải lên bằng nút chọn tệp (dùng được bằng bàn phím) và bằng kéo thả tệp vào màn; mỗi tệp gửi bằng `POST /api/stickers` dạng `multipart/form-data`. Trước khi gửi, web MUST kiểm sơ bộ loại tệp (PNG, GIF, WebP) và dung lượng, và MUST báo ngay lỗi của tệp không đạt mà không gọi máy chủ; máy chủ vẫn là nơi quyết định cuối. Trong lúc tải MUST có trạng thái đang tải của từng tệp; xong thì sticker MUST xuất hiện trong lưới mà không phải tải lại trang. Chọn nhiều tệp cùng lúc MUST được hỗ trợ, và một tệp lỗi MUST không làm hỏng các tệp còn lại.

#### Scenario: Chọn một ảnh
- **WHEN** người dùng chọn `meo.png` bằng nút tải lên
- **THEN** một yêu cầu `POST /api/stickers` multipart được gửi, và sau khi xong lưới có sticker mới đầu tiên

#### Scenario: Kéo thả
- **WHEN** người dùng kéo `nhay.gif` thả vào màn
- **THEN** tệp được tải lên như khi chọn bằng nút

#### Scenario: Tệp sai loại bị chặn tại chỗ
- **WHEN** người dùng chọn một tệp `.jpg`
- **THEN** màn báo "chỉ nhận PNG, GIF, WebP" và không có yêu cầu nào tới máy chủ

#### Scenario: Nhiều tệp, một tệp lỗi
- **WHEN** người dùng chọn ba tệp và máy chủ từ chối tệp thứ hai
- **THEN** hai tệp còn lại vào lưới, và lỗi của tệp thứ hai được nêu cùng tên tệp

### Requirement: Lỗi của máy chủ khi tải lên được nói bằng tiếng Việt
Mỗi mã lỗi tải lên của máy chủ MUST được đổi thành một câu tiếng Việt nói rõ nguyên nhân và cách xử lý, không hiện mã thô hay thông điệp của máy chủ: `STICKER_TYPE_UNSUPPORTED`, `STICKER_TOO_LARGE`, `STICKER_INVALID_IMAGE`, `STICKER_DUPLICATE`, `STICKER_LIMIT_REACHED`, `STICKER_FILE_MISSING`, lỗi mạng và lỗi không rõ.

#### Scenario: Trùng
- **WHEN** máy chủ trả `STICKER_DUPLICATE` cho `meo.png`
- **THEN** màn nói sticker này đã có trong thư viện, không hiện "STICKER_DUPLICATE"

#### Scenario: Đủ hạn mức
- **WHEN** máy chủ trả `STICKER_LIMIT_REACHED`
- **THEN** màn nói thư viện đã đầy và khuyên xóa bớt sticker

#### Scenario: Mất mạng
- **WHEN** yêu cầu tải lên không tới được máy chủ
- **THEN** màn nói không kết nối được và cho thử lại

### Requirement: Xóa sticker có xác nhận
Mỗi sticker MUST có thao tác xóa mở một hộp xác nhận nêu tên sticker; chỉ khi người dùng xác nhận mới gọi `DELETE /api/stickers/{id}`. Thành công thì sticker MUST biến khỏi lưới ngay. Hủy xác nhận MUST không xóa gì. Xóa lỗi MUST nói lỗi và giữ nguyên sticker trong lưới.

#### Scenario: Xóa thành công
- **WHEN** người dùng chọn xóa `meo` và xác nhận
- **THEN** `DELETE /api/stickers/{id}` được gọi và ô `meo` biến khỏi lưới

#### Scenario: Hủy
- **WHEN** người dùng chọn xóa `meo` rồi hủy
- **THEN** không có yêu cầu nào tới máy chủ và `meo` còn nguyên

#### Scenario: Xóa lỗi
- **WHEN** `DELETE` lỗi
- **THEN** màn báo lỗi và `meo` vẫn còn trong lưới

### Requirement: Vào màn Sticker từ điều hướng
Màn Sticker MUST có mục trong điều hướng theo quyết định DN-3 của `design.md` (mặc định: mục "Sticker" ở cột bên và dải icon, một dòng ở trang Thêm của mobile) và MUST có tên trang "Sticker". Trên mobile, mục "Thêm" MUST là mục hiện hành khi đang ở `/stickers`. Màn MUST dựng theo canvas khi canvas có khung Sticker (ST-00 bị bỏ qua theo lệnh người dùng 2026-10-19, xem `tasks.md` 0.1; cho tới lúc có khung thì theo các màn có sẵn như Ghi chú) ở ba cỡ: máy tính (từ 1280 px), máy tính bảng (768-1279 px), điện thoại (dưới 768 px), cả theme sáng và tối.

#### Scenario: Từ trang Thêm
- **WHEN** người dùng ở điện thoại mở `/more` và bấm "Sticker"
- **THEN** app mở `/stickers`, và tab "Thêm" vẫn là mục hiện hành

#### Scenario: Từ cột bên
- **WHEN** người dùng ở màn máy tính bấm "Sticker" ở cột bên
- **THEN** app mở `/stickers` và mục đó ở trạng thái hiện hành

### Requirement: Màn Sticker dùng được bằng bàn phím và trình đọc màn hình
Mọi thao tác của màn Sticker (chọn tệp, xóa, xác nhận, thử lại) MUST dùng được bằng bàn phím, có tên truy cập rõ ràng, và hộp xác nhận xóa MUST giữ tiêu điểm trong hộp và trả tiêu điểm về nơi mở khi đóng. Vùng kéo thả MUST không là cách duy nhất để tải lên. Thông báo kết quả tải lên và lỗi MUST được đọc được bởi trình đọc màn hình (vùng `role="status"` hoặc `role="alert"`).

#### Scenario: Chỉ bàn phím
- **WHEN** người dùng chỉ dùng bàn phím: Tab tới nút tải lên, chọn một tệp, rồi Tab tới nút xóa của một sticker và xác nhận
- **THEN** cả hai việc làm được, và sau khi đóng hộp xác nhận tiêu điểm về nút xóa (hoặc về phần tử hợp lý kế tiếp nếu ô đó đã biến mất)
