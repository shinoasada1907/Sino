## ADDED Requirements

### Requirement: Mở luồng kết nối
Nút "Kết nối tài khoản" (desktop, mobile) và nút "Thêm tài khoản" (đầu trang mobile) của màn Tài khoản MUST mở hộp thoại "Kết nối tài khoản" ở bước 1/5 theo canvas `ConnectWizard`: dòng "KẾT NỐI TÀI KHOẢN · N/5", tiêu đề bước, thanh 5 bước (bước hiện tại có `aria-current="step"`), nội dung bước, câu ghi chú và các nút ở chân hộp. "Đóng" và phím Esc MUST đóng hộp thoại.

#### Scenario: Bấm Kết nối tài khoản
- **WHEN** người dùng bấm "Kết nối tài khoản" trên `/accounts`
- **THEN** hộp thoại "Chọn nhà cung cấp" hiện với "KẾT NỐI TÀI KHOẢN · 1/5" và Gmail được chọn sẵn

### Requirement: Chọn nhà cung cấp
Bước 1 MUST liệt kê các provider của danh mục, mỗi provider có tên, mô tả và nhãn khả năng ("Đọc", "Gửi"). Provider không `connectable` MUST hiện "Sắp có" và không chọn được.

#### Scenario: Provider chưa kết nối được
- **WHEN** danh mục có Telegram với `connectable = false`
- **THEN** lựa chọn Telegram có nhãn "Sắp có" và bị vô hiệu

### Requirement: Xem quyền trước khi đăng nhập
Bước 2 MUST liệt kê các quyền mà provider đã chọn sẽ xin (từ `scopes`), mỗi quyền có tên và câu nói để làm gì, cùng câu cho biết những quyền Sino không xin. Bước 3 MUST giải thích việc đăng nhập diễn ra trên trang của nhà cung cấp; nút "Tiếp tục tới Google" MUST gọi bắt đầu kết nối rồi chuyển trình duyệt tới `authorizationUrl` nhận được.

#### Scenario: Đi tới Google
- **WHEN** người dùng chọn Gmail, bấm "Tiếp tục", rồi "Đồng ý và tiếp tục", rồi "Tiếp tục tới Google"
- **THEN** web gọi bắt đầu kết nối cho `gmail` không kèm `accountId` và chuyển tới `authorizationUrl` trả về

### Requirement: Đăng nhập lại
Nút "Đăng nhập lại" của một tài khoản (cảnh báo trên danh sách, trang chi tiết, ô cảnh báo trên mobile) MUST mở hộp thoại ở bước 2 với provider của tài khoản đó, và bắt đầu kết nối MUST gửi kèm `accountId` của tài khoản.

#### Scenario: Đăng nhập lại Messenger
- **WHEN** người dùng bấm "Đăng nhập lại" ở cảnh báo của Messenger rồi đi hết tới "Tiếp tục tới …"
- **THEN** bắt đầu kết nối được gọi cho `messenger` kèm `accountId = acc-messenger`

### Requirement: Kết quả quay về
Khi trang Tài khoản mở với `?connected={accountId}` của một tài khoản có trong danh sách, hộp thoại MUST mở ở bước 4 "Tùy chọn đồng bộ" cho tài khoản đó. "Bắt đầu đồng bộ" MUST gửi tùy chọn đã chọn (khoảng đồng bộ, nhãn làm bộ lọc, tải tệp khi mở) và chuyển sang bước 5 "Hoàn tất" với "Đã kết nối <tài khoản>", tiến độ đồng bộ, nút "Mở hộp thư" và "Kết nối thêm tài khoản". Với `?connectError={CODE}`, trang MUST hiện cảnh báo theo bảng thông báo (mã lạ dùng câu chung) kèm nút "Thử lại" mở bước 1. Tham số kết quả MUST được xóa khỏi URL sau khi xử lý, không thêm mục lịch sử.

#### Scenario: Quay về sau khi kết nối
- **WHEN** trang mở ở `/accounts?connected=acc-gmail`
- **THEN** hộp thoại hiện "Tùy chọn đồng bộ" (4/5) cho an.nguyen@gmail.com và đường dẫn chỉ còn `/accounts`

#### Scenario: Người dùng hủy ở Google
- **WHEN** trang mở ở `/accounts?connectError=CONNECT_CANCELLED`
- **THEN** trang hiện "Bạn đã hủy kết nối." với nút "Thử lại", và đường dẫn chỉ còn `/accounts`

#### Scenario: Bắt đầu đồng bộ
- **WHEN** ở bước 4 người dùng chọn "30 ngày gần nhất" rồi bấm "Bắt đầu đồng bộ"
- **THEN** tùy chọn gửi đi có khoảng `DAYS_30`, và bước 5 hiện "Đã kết nối an.nguyen@gmail.com" cùng tiến độ "412 / 1.180 thư · còn khoảng 3 phút"
