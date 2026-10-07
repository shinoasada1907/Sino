## ADDED Requirements

### Requirement: Khung app co giãn theo kích thước màn hình
Web app MUST hiện khung app theo canvas "Sino UI" (`Breakpoints`): từ 1280px trở lên MUST có cột điều hướng 248px và thanh trên cùng có ô tìm kiếm; từ 768px tới 1279px MUST có dải điều hướng chỉ có icon rộng 72px; dưới 768px MUST có thanh điều hướng dưới đáy với 5 mục (Tổng quan, Hộp thư, Lịch, Việc, Thêm). Ở mọi kích thước, trang MUST NOT cuộn ngang và MUST có nút đổi sáng/tối. Nút chọn ngôn ngữ MUST bị ẩn.

#### Scenario: Desktop
- **WHEN** người dùng mở `/overview` trên màn hình rộng 1440px
- **THEN** trang hiện cột điều hướng đủ các mục (Tổng quan, Hộp thư, Lịch, Việc cần làm, Ghi chú, Tài khoản, Dịch vụ, Đăng ký, Cài đặt) và thanh trên cùng có ô tìm kiếm

#### Scenario: Điện thoại
- **WHEN** người dùng mở `/overview` trên màn hình rộng 390px
- **THEN** trang hiện thanh điều hướng dưới đáy, không có cột điều hướng, và không cuộn ngang

### Requirement: Điều hướng chính
Mỗi mục điều hướng MUST dẫn tới một đường dẫn riêng (`/overview`, `/inbox`, `/calendar`, `/tasks`, `/notes`, `/accounts`, `/services`, `/registrations`, `/settings`; `/more` cho mục "Thêm" trên mobile). Mục của trang đang mở MUST có `aria-current="page"`. Số đếm trên điều hướng MUST lấy từ dữ liệu của app, không viết cứng. Mục chỉ có icon MUST có tên đọc được cho trình đọc màn hình. `/` MUST chuyển tới `/overview`.

#### Scenario: Mục đang mở
- **WHEN** người dùng đang ở `/overview`
- **THEN** mục "Tổng quan" có `aria-current="page"` và các mục khác thì không

#### Scenario: Trang gốc
- **WHEN** người dùng mở `/`
- **THEN** web chuyển tới `/overview`

### Requirement: Trang đang được dựng
Mọi đường dẫn của điều hướng mà màn chưa được dựng MUST hiện trong khung app một trang báo màn này đang được dựng, có tên màn và đường quay về Tổng quan.

#### Scenario: Mở màn chưa dựng
- **WHEN** người dùng bấm "Lịch" trên điều hướng
- **THEN** web mở `/calendar`, khung app vẫn hiện với mục "Lịch" đang chọn, nội dung báo màn Lịch đang được dựng và có liên kết về Tổng quan

### Requirement: Trang không tồn tại
Đường dẫn không thuộc bảng route MUST hiện trang 404 theo thiết kế `SiteNotFound`, có đường quay về trang chính.

#### Scenario: Đường dẫn lạ
- **WHEN** người dùng mở `/khong-co-trang-nay`
- **THEN** web hiện trang 404 có liên kết về Tổng quan
