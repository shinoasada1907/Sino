## ADDED Requirements

### Requirement: Tab Thêm trên mobile
Trên thanh điều hướng dưới đáy, tab "Thêm" MUST có `aria-current="page"` khi người dùng ở `/more` hoặc ở một màn nằm dưới "Thêm" theo canvas `MobileMore`: `/notes`, `/accounts` (và trang con của nó), `/services`, `/registrations`, `/notifications`, `/settings`.

#### Scenario: Mở Tài khoản trên điện thoại
- **WHEN** người dùng ở `/accounts`
- **THEN** tab "Thêm" của thanh dưới có `aria-current="page"` và các tab khác thì không

### Requirement: Trang con trên mobile
Một route MUST khai báo được là "trang con trên mobile": dưới 768px khung app ẩn thanh trên của nó và trang tự hiện đầu trang có nút quay lại (tên đọc được, ví dụ "Quay lại Thêm"), tiêu đề, dòng phụ tùy chọn và nút phụ tùy chọn. Một route MUST khai báo được việc ẩn thanh điều hướng dưới đáy. Từ 768px trở lên, khung app giữ thanh trên của nó.

#### Scenario: Trang chi tiết trên điện thoại
- **WHEN** người dùng mở `/accounts/acc-messenger` ở bề rộng 390px
- **THEN** trang có nút "Quay lại Tài khoản", không có thanh trên của khung app và không có thanh điều hướng dưới đáy
