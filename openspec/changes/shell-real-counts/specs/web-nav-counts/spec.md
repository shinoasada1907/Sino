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

### Requirement: Chuông thông báo và mục Đăng ký không báo gì khi chưa có nguồn thật
Khi app chưa có nguồn thông báo hay đăng ký thật, chuông ở thanh trên cùng (chấm và chữ "N mới" trong tên), dòng Thông báo và dòng Đăng ký ở trang Thêm, và mục Đăng ký của cột điều hướng, dải icon MUST không báo số nào: chuông tên "Thông báo" và không có chấm, Đăng ký không có huy hiệu "N mới". Khi dữ liệu của khung app có số khác 0 (một backend đã có nguồn), các chỗ đó MUST hiện đúng số đó.

#### Scenario: Chưa có nguồn thông báo và đăng ký
- **WHEN** app mở với dữ liệu khung app của chính nó, không có backend nào cho thông báo và đăng ký
- **THEN** chuông ở thanh trên cùng có tên "Thông báo" và không có chấm; mục Đăng ký có tên "Đăng ký", không có "mới"; trang Thêm không có huy hiệu ở dòng Thông báo và Đăng ký

#### Scenario: Dữ liệu khung app có số thông báo
- **WHEN** dữ liệu khung app báo 3 thông báo chưa đọc
- **THEN** chuông có tên "Thông báo, 3 mới" và một chấm, và dòng Thông báo ở trang Thêm có huy hiệu 3

### Requirement: Số tài khoản lấy từ danh sách tài khoản
Số tài khoản ở chân cột điều hướng ("N tài khoản") và ở thẻ chủ tài khoản của trang Thêm ("N tài khoản · M cần xử lý") MUST bằng số tài khoản trong danh sách tài khoản đang có, mọi trạng thái đều tính (kể cả `DISABLED` và `ERROR`). Khi danh sách chưa về hoặc việc tải bị lỗi, dòng đó MUST không hiện (không phải "0 tài khoản", không phải số của dữ liệu mẫu). Số MUST đổi theo danh sách mà không cần tải lại trang, kể cả khi một tài khoản bị ngắt kết nối. Số này MUST không phụ thuộc vào dữ liệu mẫu của khung app.

#### Scenario: Có danh sách
- **WHEN** danh sách có 3 tài khoản và dữ liệu mẫu của khung app ghi 9
- **THEN** chân cột điều hướng ghi "3 tài khoản", và thẻ chủ tài khoản của trang Thêm bắt đầu bằng "3 tài khoản"

#### Scenario: Danh sách chưa về
- **WHEN** app vừa mở và `GET /api/accounts` chưa trả lời
- **THEN** chân cột điều hướng và thẻ chủ tài khoản của trang Thêm không có dòng "N tài khoản"

#### Scenario: Danh sách đổi trong lúc dùng
- **WHEN** danh sách từ hai tài khoản còn một (như khi người dùng ngắt kết nối một tài khoản, hay danh sách được đọc lại sau `account.changed`)
- **THEN** chân cột điều hướng ghi "1 tài khoản" ngay khi danh sách đổi, không cần tải lại trang và không cần ghi riêng vào dữ liệu của khung app

