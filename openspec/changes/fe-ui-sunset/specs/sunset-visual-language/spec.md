## ADDED Requirements

### Requirement: Token Sunset cho cả hai theme
Web SHALL dùng bộ token màu của canvas "Sino UI — Sunset" (`project/sunset.css`) cho theme tối và sáng, gồm nền ấm, một màu nhấn hổ phách (`--accent`) và các màu phân loại (`--honey`, `--dusk-ink`, `--success`, `--danger` cùng bản `-soft`). Chữ thường SHALL đạt tương phản ít nhất 4.5:1 trên `--surface` ở cả hai theme.

#### Scenario: Đổi theme
- **WHEN** người dùng chọn Tối hoặc Sáng trong Cài đặt
- **THEN** mọi màn dùng giá trị token của theme đó theo canvas Sunset, không còn chỗ nào giữ màu xám lạnh cũ

#### Scenario: Hành động chính
- **WHEN** một màn có nút hành động chính (Gửi, Kết nối tài khoản, Lưu)
- **THEN** nút đó có nền `--accent` và chữ `--on-accent`, các nút khác không dùng màu nhấn làm nền

### Requirement: Font và thang chữ
Web SHALL dùng Inter cho nội dung (13 px trên desktop), Space Grotesk cho tiêu đề màn và số lớn, JetBrains Mono cho giờ và phím tắt. Mọi font SHALL tự host, không tải từ dịch vụ ngoài lúc chạy. Chữ tiếng Việt có dấu SHALL hiển thị đúng ở mọi font.

#### Scenario: Tiêu đề có dấu
- **WHEN** mở Tổng quan với lời chào "Chào buổi chiều, An."
- **THEN** tiêu đề hiện bằng font tiêu đề và mọi dấu tiếng Việt hiện đúng

### Requirement: Bộ khung theo canvas
Sidebar, topbar và thanh tab điện thoại SHALL theo artboard `Sidebar`, `Dashboard` và `MobileInbox` của canvas Sunset: logo "mặt trời", nhóm mục có tiêu đề, mục đang mở có nền `--active` và icon màu nhấn, số đếm chưa đọc màu `--accent-ink`. Mục, đường dẫn và số đếm SHALL giữ nguyên như hiện tại.

#### Scenario: Mục đang mở
- **WHEN** người dùng ở `/inbox`
- **THEN** mục "Hộp thư" ở sidebar có nền `--active`, icon màu nhấn và `aria-current="page"`

### Requirement: Các màn trong canvas theo bố cục Sunset
Các màn Tổng quan, Hộp thư, Tin nhắn, Lịch, Việc cần làm, Ghi chú, Tài khoản, Cài đặt (desktop) cùng Hộp thư và Trò chuyện (điện thoại) SHALL theo bố cục, khoảng cách và thành phần của artboard tương ứng trong canvas Sunset. Dữ liệu, route và hành vi SHALL giữ nguyên. Phần canvas vẽ mà app chưa có dữ liệu SHALL không hiện số giả.

#### Scenario: Không bịa dữ liệu
- **WHEN** canvas vẽ một khối mà API chưa có dữ liệu (ví dụ biểu đồ đồng bộ 24 giờ)
- **THEN** màn không hiện khối đó, hoặc giữ khối hiện tại, và không hiện số mẫu

### Requirement: Màn ngoài canvas nhận token mới
Các màn chưa có artboard trong canvas Sunset SHALL dùng token, font và thành phần mới, còn bố cục giữ nguyên.

#### Scenario: Wizard kết nối
- **WHEN** mở wizard kết nối tài khoản
- **THEN** nền, chữ, nút và nhãn theo token Sunset, các bước và bố cục như trước
