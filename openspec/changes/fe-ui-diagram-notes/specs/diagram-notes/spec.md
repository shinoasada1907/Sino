## ADDED Requirements

### Requirement: Sơ đồ trong danh sách ghi chú
Một ghi chú MUST là `TEXT` hoặc `DIAGRAM`. "+ Ghi chú" MUST cho chọn "Ghi chú chữ" hay "Sơ đồ". Thẻ của sơ đồ MUST có dấu sơ đồ, "Sơ đồ · N khối · M nối" và đầu nội dung là chữ của vài khối đầu, khối chính trước. Trang MUST có chip lọc "Sơ đồ · N", và tìm kiếm MUST khớp cả chữ trong các khối.

#### Scenario: Sơ đồ mẫu
- **WHEN** người dùng mở `/notes` với dữ liệu mẫu
- **THEN** có thẻ "Kế hoạch chuyến đi Đà Lạt" ghi "Sơ đồ · 7 khối · 6 nối", và chip "Sơ đồ · 1"

#### Scenario: Tìm trong khối
- **WHEN** người dùng tìm "homestay"
- **THEN** cả ghi chú chữ "Ý tưởng chuyến đi Đà Lạt tháng 12" lẫn sơ đồ "Kế hoạch chuyến đi Đà Lạt" (có khối "Thuê homestay gần hồ Tuyền Lâm") còn trong danh sách

### Requirement: Sơ đồ mới
"Sơ đồ" MUST mở `/notes/new?kind=diagram` với một khối chính "Ý chính". Sơ đồ MUST chỉ được tạo ở thay đổi đầu tiên; khi đó đường dẫn MUST thành `/notes/{id}` mà không thêm mục lịch sử. Rời đi khi chưa đổi gì MUST NOT tạo gì.

#### Scenario: Thêm khối vào sơ đồ mới
- **WHEN** người dùng mở sơ đồ mới rồi thêm một khối
- **THEN** sơ đồ có trong danh sách với 2 khối, và đường dẫn là `/notes/{id}` của nó

### Requirement: Khối của sơ đồ
Vùng vẽ MUST cho thêm khối bằng "+ Khối", bấm đúp vào chỗ trống, và menu "THÊM Ô" mở bằng chuột phải (nhấn giữ trên điện thoại) vào chỗ trống với: Khối chữ, Khối chính, 4 khối màu, "Vừa màn hình". Khối MUST kéo được, sửa chữ tại chỗ được (Enter xong, Shift Enter xuống dòng), đổi được 5 màu, và xóa được (Delete, Backspace, hoặc "Xóa khối"); xóa khối MUST xóa cả đường nối của nó.

#### Scenario: Thêm khối bằng chuột phải
- **WHEN** người dùng chuột phải vào chỗ trống rồi chọn "Khối vàng"
- **THEN** một khối màu vàng xuất hiện ở chỗ đó, đang sửa chữ

#### Scenario: Xóa một khối có nối
- **WHEN** người dùng xóa khối "Rủ cả nhóm chạy bộ" của sơ đồ mẫu
- **THEN** sơ đồ còn 6 khối và 3 đường nối

### Requirement: Đường nối của sơ đồ
Mỗi khối MUST có 4 chấm nối ở 4 cạnh. Kéo một chấm sang khối khác MUST tạo một mũi tên một chiều đi ra từ cạnh của chấm đó và vào cạnh của khối đích gần chỗ thả nhất. Một khối MUST NOT nối với chính nó, và mỗi cặp nguồn – đích MUST có nhiều nhất một đường nối. Đường nối MUST có thể mang chữ (bấm đúp để sửa) và xóa được.

#### Scenario: Nối hai khối
- **WHEN** người dùng kéo chấm cạnh phải của "Đặt xe 16 chỗ" thả gần cạnh trên của "Chốt ngày trước 15/11"
- **THEN** có mũi tên từ cạnh phải của "Đặt xe 16 chỗ" tới cạnh trên của "Chốt ngày trước 15/11"

### Requirement: Xem và tự lưu sơ đồ
Vùng vẽ MUST cho kéo nền, thu phóng (cuộn, chụm hai ngón, −/+) và "Vừa màn hình"; mở một sơ đồ MUST vừa màn hình. Mọi thay đổi MUST được lưu sau khi ngừng thay đổi và khi rời sơ đồ, không cần nút Lưu; chân MUST ghi "Sửa lúc … · tự lưu" và "N khối · M đường nối".

#### Scenario: Kéo một khối
- **WHEN** người dùng kéo một khối sang chỗ khác rồi chờ
- **THEN** chân ghi giờ sửa mới, và mở lại sơ đồ thấy khối ở chỗ mới
