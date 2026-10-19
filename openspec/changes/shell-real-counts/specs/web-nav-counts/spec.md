## ADDED Requirements

### Requirement: Số tài khoản cần xử lý lấy từ danh sách tài khoản
Số tài khoản cần xử lý ở khung app (chấm đỏ trên mục Tài khoản của dải icon, "N cần xử lý" của cột điều hướng và tên đọc được của mục, dòng "N cần xử lý" và chấm đỏ ở thẻ chủ tài khoản và ở dòng Tài khoản của trang Thêm) MUST bằng số tài khoản trong danh sách tài khoản đang có `status` là `AUTH_EXPIRED` hoặc `ERROR`, cùng định nghĩa với bộ lọc "Cần xử lý" của màn Tài khoản. Tài khoản `CONNECTED`, `DEGRADED` và `DISABLED` MUST không được tính. Khi danh sách chưa về hoặc việc tải bị lỗi, số MUST là 0: không chấm, không chữ. Số MUST đổi theo danh sách mà không cần tải lại trang. Số này MUST không phụ thuộc vào dữ liệu mẫu của khung app.

#### Scenario: Có tài khoản cần đăng nhập lại hoặc đang lỗi
- **WHEN** danh sách có 3 tài khoản: một `AUTH_EXPIRED`, một `ERROR`, một `CONNECTED`
- **THEN** mục Tài khoản có tên "Tài khoản, 2 cần xử lý" ở cột điều hướng và ở dải icon, bất kể dữ liệu mẫu của khung app là bao nhiêu

#### Scenario: Không tài khoản nào cần xử lý
- **WHEN** danh sách chỉ có tài khoản `CONNECTED`, `DEGRADED` và `DISABLED`
- **THEN** mục Tài khoản không có chấm, không có chữ "cần xử lý", ở cột điều hướng, dải icon và trang Thêm

#### Scenario: Danh sách chưa về
- **WHEN** app vừa mở và `GET /api/accounts` chưa trả lời
- **THEN** mục Tài khoản không có chấm và không có chữ "cần xử lý" (không phải "1 cần xử lý" của dữ liệu mẫu)

#### Scenario: Danh sách đổi trong lúc dùng
- **WHEN** một tài khoản từ `CONNECTED` thành `AUTH_EXPIRED` (sự kiện `account.changed`), rồi người dùng đăng nhập lại nó
- **THEN** mục Tài khoản hiện "1 cần xử lý" ngay khi danh sách đọc lại, rồi mất khi tài khoản về `CONNECTED`, không cần tải lại trang

#### Scenario: Trang Thêm trên mobile
- **WHEN** người dùng mở `/more` và có 2 tài khoản cần xử lý
- **THEN** thẻ chủ tài khoản ghi "· 2 cần xử lý" và dòng Tài khoản có tên "Tài khoản, 2 cần xử lý"

### Requirement: Đọc số tài khoản cần xử lý không làm đọc lại hộp thư
Việc khung app đọc danh sách tài khoản để lấy số cần xử lý MUST không bắt hộp thư đọc lại chỉ vì có tài khoản đã nhập xong lần đầu; việc đọc lại hộp thư khi một lần nhập đầu vừa xong là của màn Tài khoản.

#### Scenario: Mở app khi có tài khoản đã nhập xong
- **WHEN** app mở, danh sách có tài khoản `firstImport.state` là `DONE`, và người dùng không ở màn Tài khoản
- **THEN** hộp thư không bị đánh dấu cũ hay đọc lại vì số tài khoản cần xử lý
