## ADDED Requirements

### Requirement: Web nghe sự kiện
Khi người dùng đã đăng nhập, web MUST mở đúng một luồng `GET /api/events/stream` cho cả app. Sự kiện `conversations.changed` MUST làm web đọc lại dữ liệu Hộp thư đang hiện (danh sách, số đếm, cuộc trò chuyện đang mở); `account.changed` MUST làm web đọc lại danh sách tài khoản và khung Hộp thư. Web MUST NOT lấy nội dung từ sự kiện; nội dung luôn đến từ API (D-90).

#### Scenario: Thư mới từ đồng bộ
- **WHEN** Hộp thư đang mở và luồng nhận `conversations.changed` với `source` = `sync`
- **THEN** danh sách và số đếm được đọc lại từ API và thư mới hiện mà người dùng không tải lại trang

#### Scenario: Tiến độ nhập qua sự kiện
- **WHEN** trang Tài khoản đang mở, một lần nhập đang chạy và luồng đang mở
- **THEN** danh sách tài khoản chỉ được đọc lại khi có `account.changed`, không hỏi lại mỗi 2 giây

#### Scenario: Luồng không mở được
- **WHEN** một lần nhập đang chạy và luồng không ở trạng thái mở
- **THEN** danh sách tài khoản được hỏi lại mỗi 2 giây như trước (D-91)

### Requirement: Nối lại
Khi luồng mở lại sau khi mất, web MUST đọc lại Hộp thư và danh sách tài khoản để bù các sự kiện đã lỡ. Khi trình duyệt bỏ hẳn luồng (ví dụ phiên hết hạn), web MUST NOT tự mở lại vòng lặp; lần gọi API kế tiếp xử lý phiên hết hạn như hiện nay.

#### Scenario: Server đóng luồng sau 20 phút
- **WHEN** server đóng luồng và trình duyệt nối lại
- **THEN** web đọc lại Hộp thư và danh sách tài khoản một lần

### Requirement: Hàng mới và dòng báo
Hàng có ID chưa hiện trước đó MUST được đánh dấu là mới: tối đa 6 hàng thì trượt vào theo canvas MotionSpec C, hơn 6 thì hiện ngay; khi người dùng chọn giảm chuyển động thì không trượt. Sự kiện `source` = `sync` với `newInbound` > 0 MUST hiện dòng "N thư mới" ở đầu danh sách (cộng dồn khi nhiều sự kiện tới liền nhau); bấm vào thì danh sách cuộn lên đầu. Sự kiện `source` = `import` hoặc `user` MUST NOT hiện dòng báo (D-92).

#### Scenario: Hai thư mới
- **WHEN** luồng nhận `conversations.changed` với `source` = `sync`, `newInbound` = 2, và danh sách tải lại có 2 conversation mới ở đầu
- **THEN** hai hàng đó trượt vào và có dòng "2 thư mới"

#### Scenario: Người dùng tự đánh dấu đã đọc
- **WHEN** luồng nhận `conversations.changed` với `source` = `user`
- **THEN** danh sách được đọc lại và không có dòng "thư mới"

### Requirement: Số Hộp thư trên điều hướng
Số cạnh "Hộp thư" trên thanh điều hướng MUST là số conversation chưa đọc của `GET /api/conversations/counts` và MUST đổi khi Hộp thư được đọc lại (D-93).

#### Scenario: Thư mới đến
- **WHEN** một thư đến mới làm `unread` từ 3 thành 4
- **THEN** số cạnh "Hộp thư" thành 4 mà không tải lại trang

### Requirement: Đồng bộ ngay trên web
Với tài khoản đã nhập xong, "Đồng bộ ngay" MUST gọi `POST /api/accounts/{id}/sync` và MUST NOT nhập lại cả khoảng; `409 IMPORT_NOT_DONE` và `409 ACCOUNT_DISABLED` MUST có câu báo riêng. Trang chi tiết MUST hiện lần đồng bộ cuối, lỗi đồng bộ gần nhất và cho biết thư mới về ngay (push `ACTIVE`) hay sau khoảng một phút (D-95).

#### Scenario: Bấm "Đồng bộ ngay"
- **WHEN** người dùng bấm "Đồng bộ ngay" ở tài khoản đã nhập xong
- **THEN** web gửi `POST /api/accounts/{id}/sync` và không mở bước chọn khoảng

### Requirement: Báo mất kết nối
Khi mạng còn mà luồng không mở được quá 30 giây, Hộp thư MUST hiện dòng "Thư mới có thể về chậm · đang kết nối lại…", và MUST ẩn nó khi luồng mở lại (D-94).

#### Scenario: Backend khởi động lại
- **WHEN** luồng mất 40 giây rồi mở lại
- **THEN** dòng báo hiện sau 30 giây và biến mất khi luồng mở lại
