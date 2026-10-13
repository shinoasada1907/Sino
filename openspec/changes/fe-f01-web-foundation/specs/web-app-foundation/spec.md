## ADDED Requirements

### Requirement: Gọi API cùng origin
Web app MUST gọi API bằng đường dẫn tương đối `/api/...` trên cùng origin với trang (Decision D-36). Khi chạy dev, Vite MUST chuyển tiếp `/api/**` sang backend; ứng dụng MUST NOT cần cấu hình CORS.

#### Scenario: Chạy dev
- **WHEN** người dùng mở web tại địa chỉ của Vite dev server trong lúc backend chạy ở `localhost:8080`
- **THEN** request `/api/auth/me` của web tới được backend qua proxy và cookie của backend được trình duyệt lưu cho cùng địa chỉ đó

### Requirement: Xử lý API thống nhất
API client MUST gửi header `X-XSRF-TOKEN` lấy từ cookie `XSRF-TOKEN` ở mọi request `POST`, `PUT`, `PATCH`, `DELETE`, và MUST NOT gửi ở request `GET`. Mọi lỗi API MUST được đổi thành một kiểu lỗi chung mang `status`, `code` và `detail` đọc từ Problem Details; lỗi mạng MUST có `code` = `NETWORK_ERROR`. Khi gặp `403` với `code` = `CSRF_TOKEN_INVALID`, client MUST lấy token mới qua `GET /api/auth/me` rồi thử lại request đó đúng một lần.

#### Scenario: Request thay đổi dữ liệu
- **WHEN** web gửi một request `PATCH`
- **THEN** request có header `X-XSRF-TOKEN` bằng giá trị cookie `XSRF-TOKEN`

#### Scenario: Lỗi từ API
- **WHEN** API trả `404` với `code` = `ACCOUNT_NOT_FOUND`
- **THEN** nơi gọi nhận lỗi có `status` = 404 và `code` = `ACCOUNT_NOT_FOUND`

#### Scenario: CSRF token cũ
- **WHEN** một request trả `403 CSRF_TOKEN_INVALID` lần đầu
- **THEN** client gọi `GET /api/auth/me`, gửi lại request một lần với token mới, và nếu vẫn lỗi thì trả lỗi cho nơi gọi

### Requirement: Chặn trang khi chưa đăng nhập
Mọi trang trừ `/login` và trang 404 MUST chỉ hiện khi `GET /api/auth/me` trả `200`. Chưa đăng nhập, hoặc session hết hạn khi đang dùng (một API trả `401`), MUST đưa người dùng về `/login?returnTo=<đường dẫn hiện tại>` và xóa dữ liệu đã cache. `returnTo` MUST chỉ nhận đường dẫn nội bộ (bắt đầu bằng một dấu `/`, không phải `//`).

#### Scenario: Mở trang khi chưa đăng nhập
- **WHEN** người dùng chưa đăng nhập mở `/accounts`
- **THEN** web chuyển tới `/login?returnTo=%2Faccounts`, và sau khi đăng nhập thành công thì quay về `/accounts`

#### Scenario: Session hết hạn khi đang dùng
- **WHEN** một lời gọi API trả `401` trong lúc người dùng đang ở `/accounts`
- **THEN** web chuyển tới `/login?returnTo=%2Faccounts`

#### Scenario: returnTo trỏ ra ngoài
- **WHEN** người dùng đăng nhập thành công từ `/login?returnTo=//evil.example`
- **THEN** web chuyển tới `/overview` (trang chính), không chuyển ra địa chỉ ngoài

### Requirement: Trang đăng nhập
Trang `/login` MUST theo thiết kế `SiteLogin` của canvas "Sino UI" với ô email, ô mật khẩu (có nút hiện/ẩn), ô "Giữ đăng nhập trên máy này" và nút "Đăng nhập". Nút Google, "Quên mật khẩu?", "Bắt đầu tại đây", nút chọn ngôn ngữ, link điều khoản và nút "Trang chủ" MUST bị ẩn ở MVP. Lỗi `INVALID_CREDENTIALS` MUST hiện số lần còn được thử; `LOGIN_LOCKED` MUST hiện thời gian phải chờ; sau lỗi, ô mật khẩu MUST được xóa còn email được giữ.

#### Scenario: Sai mật khẩu
- **WHEN** API trả `401` `INVALID_CREDENTIALS` với `remainingAttempts` = 4
- **THEN** trang hiện "Email hoặc mật khẩu không đúng" kèm "Còn 4 lần thử", ô mật khẩu trống, email còn nguyên

#### Scenario: Bị khóa
- **WHEN** API trả `429` `LOGIN_LOCKED` với `retryAfterSeconds` = 900
- **THEN** trang hiện thông báo tạm khóa và phải chờ 15 phút

### Requirement: Khung app và điều hướng
Sau khi đăng nhập, web MUST hiện khung app theo canvas (thanh bên từ 1280px, rail từ 768px, thanh dưới trên mobile; màn chưa dựng hiện trang "đang xây", D-42) và menu người dùng có tên, email của owner, nút đổi sáng/tối và nút đăng xuất: mở từ nút "Tài khoản Sino của bạn" ở thanh bên và ở rail, trên mobile nằm trong trang "Thêm". `/` MUST chuyển tới `/overview`; đường dẫn không tồn tại MUST hiện trang 404 theo thiết kế `SiteNotFound`. Khung app MUST dùng được trên desktop và mobile theo `Breakpoints` của canvas.

#### Scenario: Đăng xuất
- **WHEN** người dùng bấm "Đăng xuất" trong menu người dùng
- **THEN** web gọi `POST /api/auth/logout`, xóa dữ liệu đã cache và chuyển tới `/login`

#### Scenario: Đường dẫn không tồn tại
- **WHEN** người dùng mở `/khong-co-trang-nay`
- **THEN** web hiện trang 404 có đường quay về trang chính

### Requirement: Giao diện sáng và tối
Lần đầu mở, web MUST theo cài đặt sáng/tối của hệ điều hành (`prefers-color-scheme`). Người dùng đổi theme thì lựa chọn MUST được nhớ cho các lần sau. Khi trình duyệt không cho dùng bộ nhớ cục bộ, web MUST vẫn chạy (chỉ không nhớ lựa chọn).

#### Scenario: Đổi theme
- **WHEN** người dùng đang ở theme tối bấm đổi sang sáng rồi tải lại trang
- **THEN** trang hiện theme sáng
