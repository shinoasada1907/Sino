## ADDED Requirements

### Requirement: Tiêu đề và biểu tượng của tab theo số tin chưa đọc
Khi app đã đăng nhập đang chạy và số chưa đọc đã về, tiêu đề tab MUST là `(N) Sino` với `N` = số chưa đọc của Hộp thư cộng số chưa đọc của Tin nhắn (số của Tin nhắn là 0 khi backend không đếm được), và biểu tượng tab MUST là `/favicon-unread.svg`. Từ 100 trở lên `N` MUST hiện là `99+`. Khi `N` = 0 tiêu đề MUST là `Sino` và biểu tượng là `/favicon.svg`. Chưa có số liệu thì app MUST không đổi tiêu đề và biểu tượng. Khi app đã đăng nhập thôi chạy (đăng xuất), tiêu đề và biểu tượng MUST về đúng giá trị trước khi app đặt.

#### Scenario: Có tin chưa đọc
- **WHEN** Tin nhắn có 2 và Hộp thư có 1 cuộc trò chuyện chưa đọc
- **THEN** tiêu đề tab là `(3) Sino` và biểu tượng là `/favicon-unread.svg`

#### Scenario: Số rất lớn
- **WHEN** tổng chưa đọc là 150
- **THEN** tiêu đề tab là `(99+) Sino`

#### Scenario: Đọc hết
- **WHEN** tổng chưa đọc đổi từ 3 về 0 vì người dùng đọc hết
- **THEN** tiêu đề tab là `Sino` và biểu tượng là `/favicon.svg`

#### Scenario: Tin mới đến khi đang ở tab khác
- **WHEN** tổng chưa đọc tăng từ 0 lên 1 trong lúc tab không được xem
- **THEN** tiêu đề tab đổi thành `(1) Sino` ngay, không cần người dùng quay lại tab

#### Scenario: Backend chưa đếm riêng được tin nhắn
- **WHEN** số chưa đọc của Tin nhắn là `null` và của Hộp thư là 4
- **THEN** tiêu đề tab là `(4) Sino`

#### Scenario: Chưa có số liệu
- **WHEN** số chưa đọc chưa về
- **THEN** tiêu đề tab và biểu tượng giữ nguyên như `index.html`

#### Scenario: Đăng xuất
- **WHEN** người dùng đăng xuất khi tiêu đề tab đang là `(3) Sino`
- **THEN** tiêu đề tab và biểu tượng về như trước khi app đặt (`Sino`, `/favicon.svg`)

### Requirement: Thanh thông báo tin mới trên mọi màn của app
App đã đăng nhập MUST có một thanh dưới thanh trên cùng, hiện khi nền đồng bộ mang về tin mới (sự kiện `conversations.changed` có `source` là `sync` và `newInbound` lớn hơn 0) cho một tài khoản mà người dùng không đang xem danh sách của loại đó. Mỗi loại có tin mới MUST có một dòng: `N tin mới` cho Tin nhắn, `N thư mới` cho Hộp thư, kèm nút "Xem" đi tới màn của loại đó và nút "Đóng thông báo". Thanh MUST là vùng `role="status"`. Thanh MUST không đếm sự kiện `import` hay `user`. Người dùng đang ở màn của loại đó và tab đang hiện MUST không được đếm thêm (danh sách đã có dải riêng, D-92). Thanh MUST tắt dòng của một loại khi người dùng vào màn của loại đó, bấm "Xem" hoặc "Đóng thông báo". Người dùng đang ở màn của loại đó nhưng tab đang ẩn: dòng MUST hiện, và MUST tắt 6 giây sau khi tab hiện lại.

#### Scenario: Zalo có tin khi đang ở màn khác
- **WHEN** người dùng đang ở Việc cần làm và nền đồng bộ mang về 1 tin của tài khoản Zalo
- **THEN** thanh hiện dòng `1 tin mới` với nút "Xem" trỏ tới `/messages`

#### Scenario: Gom nhiều lần
- **WHEN** nền đồng bộ mang về 1 rồi 2 tin của tài khoản Zalo, người dùng chưa đóng thanh
- **THEN** dòng là `3 tin mới`

#### Scenario: Cả hai loại
- **WHEN** có 2 tin Zalo và 1 thư Gmail mới trong khi người dùng ở Lịch
- **THEN** thanh có hai dòng: `2 tin mới` (trỏ `/messages`) và `1 thư mới` (trỏ `/inbox`)

#### Scenario: Đang xem đúng danh sách
- **WHEN** người dùng đang ở `/messages`, tab đang hiện, và có 1 tin Zalo mới
- **THEN** thanh không hiện dòng nào (danh sách tự có dải `1 tin mới`)

#### Scenario: Đang ở đúng màn nhưng tab ẩn
- **WHEN** người dùng ở `/messages`, tab đang ẩn, và có 1 tin Zalo mới
- **THEN** thanh hiện `1 tin mới`; khi tab hiện lại, dòng tắt sau 6 giây

#### Scenario: Nhập thư cũ không phải tin mới
- **WHEN** sự kiện có `source` là `import` với `newInbound` là 300
- **THEN** thanh không hiện gì

#### Scenario: Vào màn thì tắt
- **WHEN** thanh đang có dòng `2 tin mới` và người dùng mở `/messages` bằng thanh điều hướng
- **THEN** dòng đó tắt

#### Scenario: Bấm Xem
- **WHEN** người dùng bấm "Xem" ở dòng `2 tin mới`
- **THEN** app mở `/messages` và dòng đó tắt

#### Scenario: Đóng
- **WHEN** người dùng bấm "Đóng thông báo" ở một dòng
- **THEN** dòng đó tắt, dòng của loại kia (nếu có) vẫn còn

#### Scenario: Chưa biết tài khoản thuộc loại nào
- **WHEN** sự kiện nói về một tài khoản không có trong frame của loại nào
- **THEN** thanh không hiện gì, số chưa đọc trên tab và thanh điều hướng vẫn cập nhật
