## ADDED Requirements

### Requirement: Phong cách mềm cho cả app
Web SHALL dùng chất liệu mềm của canvas "Sino UI — Sunset" ở mọi màn: thẻ bo lớn, bóng mềm thay cho viền, nút, nhãn, ô tìm và mục điều hướng tròn hẳn, font Nunito cho nội dung và tiêu đề, JetBrains Mono cho giờ và phím tắt. Mọi font SHALL tự host. Chữ tiếng Việt có dấu SHALL hiển thị đúng.

#### Scenario: Tiêu đề có dấu
- **WHEN** mở Tổng quan với lời chào "Chào buổi chiều, An."
- **THEN** tiêu đề hiện bằng Nunito đậm và mọi dấu tiếng Việt hiện đúng

#### Scenario: Hành động chính
- **WHEN** một màn có nút hành động chính (Gửi, Kết nối tài khoản, Lưu)
- **THEN** nút đó có nền `--accent` và chữ `--on-accent`, các nút khác không dùng màu nhấn làm nền

### Requirement: Bộ màu người dùng chọn
Web SHALL có 5 bộ màu: Anh đào (mặc định), Hoàng hôn, Bạc hà, Oải hương, Đơn sắc, mỗi bộ có theme sáng và tối với giá trị theo canvas. Bộ màu đang chọn SHALL áp lên mọi màn ngay khi chọn, và được nhớ theo tài khoản.

#### Scenario: Đổi bộ màu
- **WHEN** người dùng chọn "Bạc hà" trong Cài đặt › Giao diện
- **THEN** mọi màn đổi sang màu Bạc hà ngay, không cần tải lại, và lựa chọn được lưu

#### Scenario: Thiết bị khác
- **WHEN** người dùng đã chọn "Oải hương" và đăng nhập trên máy khác
- **THEN** web trên máy đó dùng Oải hương

#### Scenario: Không chớp màu
- **WHEN** tải lại trang sau khi đã chọn một bộ màu
- **THEN** trang hiện ngay bằng bộ màu đó, không hiện Anh đào trước rồi mới đổi

### Requirement: Màu nhấn riêng giữ đủ tương phản
Người dùng SHALL nhập được một màu nhấn `#RRGGBB` đè lên màu nhấn của bộ đang chọn. Web SHALL tự tính các biến màu nhấn còn lại, sao cho chữ trên nút chính và chữ màu nhấn trên nền thẻ đạt ít nhất 4.5:1 ở cả sáng lẫn tối. Xóa màu nhấn riêng SHALL trả về màu của bộ.

#### Scenario: Màu quá nhạt
- **WHEN** người dùng nhập `#FFE4EE`
- **THEN** nút chính dùng một bản đậm hơn của màu đó, chữ trên nút đạt 4.5:1

#### Scenario: Mã sai
- **WHEN** người dùng nhập `hồng`
- **THEN** ô báo mã màu không hợp lệ và màu không đổi

### Requirement: Độ bo và họa tiết
Người dùng SHALL chọn độ bo Mềm (mặc định) hoặc Gọn, và bật/tắt họa tiết trang trí. Gọn SHALL hạ bán kính thẻ và đệm dòng danh sách; nút và nhãn vẫn tròn. Tắt họa tiết SHALL ẩn mọi dấu cộng và chấm bi.

#### Scenario: Gọn
- **WHEN** người dùng chọn Gọn
- **THEN** thẻ và dòng danh sách có góc nhỏ hơn, danh sách hộp thư hiện được nhiều dòng hơn trên cùng chiều cao

### Requirement: Bộ khung theo canvas
Sidebar, topbar và thanh tab điện thoại SHALL theo artboard `Sidebar`, `Dashboard` và `MobileInbox`: sidebar là khung nổi bo tròn, có logo, nhóm mục, mục đang mở có nền `--accent-soft` và chữ `--accent-ink`, số đếm chưa đọc là viên màu nhấn. Mục, đường dẫn và số đếm SHALL giữ nguyên.

#### Scenario: Mục đang mở
- **WHEN** người dùng ở `/inbox`
- **THEN** mục "Hộp thư" có nền `--accent-soft` và `aria-current="page"`

### Requirement: Các màn trong canvas theo bố cục Sunset
Tổng quan, Hộp thư, Tin nhắn, Lịch, Việc cần làm, Ghi chú, Tài khoản, Cài đặt (desktop), Hộp thư và Trò chuyện (điện thoại) SHALL theo bố cục, khoảng cách và thành phần của artboard tương ứng. Dữ liệu, route và hành vi SHALL giữ nguyên. Phần canvas vẽ mà app chưa có dữ liệu SHALL không hiện số giả.

#### Scenario: Không bịa dữ liệu
- **WHEN** canvas vẽ một khối mà API chưa có dữ liệu
- **THEN** màn không hiện khối đó, hoặc giữ khối hiện tại, và không hiện số mẫu

#### Scenario: Ảnh nền chưa có
- **WHEN** mở Cài đặt › Giao diện
- **THEN** ô "Ảnh nền Tổng quan" hiện "Sắp có" và không mở hộp chọn tệp

### Requirement: Màn ngoài canvas nhận token mới
Các màn chưa có artboard trong canvas SHALL dùng token, font, bộ màu và thành phần mới, còn bố cục giữ nguyên.

#### Scenario: Wizard kết nối
- **WHEN** mở wizard kết nối tài khoản với bộ màu Bạc hà
- **THEN** nền, chữ, nút và nhãn theo Bạc hà, các bước và bố cục như trước
