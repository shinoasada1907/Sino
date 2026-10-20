## ADDED Requirements

### Requirement: Chọn nhiều ảnh mở bước "Thêm sticker"
Chọn tệp bằng nút "Tải lên" hoặc thả tệp vào màn Sticker MUST mở bước "Thêm sticker" thay cho gửi ngay: một hộp thoại từ 768 px, một trang riêng dưới 768 px. Bước này MUST liệt kê mọi ảnh đã chọn bằng ảnh nhỏ kèm tên tệp, MUST hiện lớn ảnh đang chọn, và MUST cho thêm ảnh vào lượt hoặc bỏ một ảnh khỏi lượt. Tệp không phải PNG, GIF, WebP hay JPEG, hay tệp ảnh động nặng hơn 1 MB, MUST bị báo ngay bằng tiếng Việt và không vào lượt.

#### Scenario: Ba ảnh
- **WHEN** người dùng chọn `meo.jpg`, `cho.png`, `nhay.gif`
- **THEN** bước "Thêm sticker" mở với ba ảnh trong danh sách, ảnh đầu tiên được chọn, và chưa có yêu cầu nào tới máy chủ

#### Scenario: Tệp sai loại
- **WHEN** người dùng chọn `ghi-chu.pdf` cùng `meo.png`
- **THEN** chỉ `meo.png` vào lượt, và màn nói `ghi-chu.pdf` không phải ảnh dùng được

### Requirement: Chỉnh một ảnh tĩnh trước khi lưu
Với ảnh tĩnh (PNG, WebP tĩnh, JPEG), bước "Thêm sticker" MUST có khung cắt trên ảnh: mặc định là hình vuông lớn nhất ở giữa ảnh, kéo được để đổi chỗ, phóng to từ 1 đến 3 lần, xoay từng 90°, và chọn được "Vuông" hoặc "Tự do" cho tỉ lệ khung. Mỗi ảnh MUST giữ phần chỉnh của riêng nó khi người dùng chuyển qua lại giữa các ảnh. Khi lưu, ảnh MUST được xuất lại trên trình duyệt thành PNG chỉ gồm phần trong khung, cạnh dài nhất tối đa 512 điểm ảnh, và MUST không phóng to một vùng nhỏ hơn thế. Ảnh JPEG MUST được gửi dưới dạng PNG đã xuất, kể cả khi không chỉnh gì.

#### Scenario: Cắt rồi lưu
- **WHEN** người dùng chọn ảnh 2000 × 1000, để khung vuông mặc định và bấm "Lưu"
- **THEN** tệp gửi lên là PNG 512 × 512 lấy từ phần giữa ảnh

#### Scenario: Vùng nhỏ không bị phóng to
- **WHEN** người dùng cắt một vùng 300 × 300 từ ảnh gốc rồi lưu
- **THEN** tệp gửi lên là PNG 300 × 300

#### Scenario: Chuyển ảnh giữ phần chỉnh
- **WHEN** người dùng xoay ảnh thứ nhất 90°, chuyển sang ảnh thứ hai rồi quay lại
- **THEN** ảnh thứ nhất vẫn xoay 90° với đúng khung đã đặt

### Requirement: Ảnh động được lưu nguyên
Với ảnh động (GIF có từ hai khung, WebP động), bước "Thêm sticker" MUST hiện ảnh đang chạy, MUST nói rõ ảnh động được lưu nguyên, và MUST không có khung cắt, phóng to hay xoay; khi lưu MUST gửi đúng tệp gốc.

#### Scenario: GIF động
- **WHEN** người dùng chọn `nhay.gif` (12 khung) và lưu
- **THEN** tệp gửi lên là đúng `nhay.gif`, không qua canvas

### Requirement: Tên và bộ của lượt tải
Mỗi ảnh MUST có ô tên, mặc định là tên tệp bỏ đuôi. Bước "Thêm sticker" MUST có một ô chọn bộ áp dụng cho cả lượt, với các bộ có sẵn, "Chưa xếp bộ" và "Bộ mới…"; "Bộ mới…" MUST hỏi tên và tạo bộ trước khi gửi ảnh đầu tiên. Mặc định MUST là bộ người dùng đang xem khi mở bước này, hoặc "Chưa xếp bộ".

#### Scenario: Lưu vào bộ mới
- **WHEN** người dùng chọn "Bộ mới…", gõ `Mèo`, rồi lưu hai ảnh
- **THEN** `POST /api/sticker-packs` được gọi một lần, rồi hai `POST /api/stickers` mang `packId` của bộ `Mèo`

### Requirement: Lưu lần lượt và báo từng ảnh
"Lưu N sticker" MUST gửi từng ảnh một theo thứ tự trong danh sách, mỗi ảnh với phần chỉnh, tên và bộ của nó. Mỗi ảnh MUST có trạng thái chờ, đang gửi, đã lưu hoặc lỗi; lỗi MUST được nói bằng câu tiếng Việt như ở màn Sticker. Ảnh đã lưu MUST rời khỏi lượt và vào lưới; ảnh lỗi MUST ở lại trong lượt để chỉnh hay thử lại. Khi mọi ảnh đã lưu, bước này MUST đóng. Đóng bước này khi còn ảnh chưa lưu MUST hỏi trước.

#### Scenario: Một ảnh bị từ chối
- **WHEN** người dùng lưu ba ảnh và máy chủ trả `STICKER_DUPLICATE` cho ảnh thứ hai
- **THEN** ảnh một và ba vào lưới, ảnh hai ở lại trong lượt với câu "Sticker này đã có trong thư viện.", và bước này không đóng

#### Scenario: Đóng khi còn ảnh
- **WHEN** còn hai ảnh chưa lưu và người dùng bấm đóng
- **THEN** màn hỏi có bỏ hai ảnh đó không, và chỉ đóng khi người dùng đồng ý

### Requirement: Bước "Thêm sticker" dùng được bằng bàn phím
Mọi điều khiển của bước này (chọn ảnh trong danh sách, khung cắt, phóng to, xoay, tỉ lệ, tên, bộ, lưu, bỏ ảnh, đóng) MUST dùng được bằng bàn phím và có tên truy cập. Vùng cắt MUST dời được bằng phím mũi tên. Hộp thoại MUST giữ tiêu điểm trong hộp và trả tiêu điểm về nút đã mở nó khi đóng.

#### Scenario: Dời vùng cắt bằng bàn phím
- **WHEN** tiêu điểm ở khung cắt và người dùng bấm phím mũi tên phải
- **THEN** phần ảnh nằm trong khung dịch đi, và tệp lưu ra là phần mới đó
