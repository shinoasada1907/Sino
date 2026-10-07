## ADDED Requirements

### Requirement: Dữ liệu của màn Tổng quan theo hợp đồng
Màn Tổng quan MUST lấy mọi dữ liệu từ một nguồn duy nhất có kiểu `OverviewData` (hợp đồng dữ liệu trong `design.md`), qua hook `useOverview()`. Ở change này hook MUST trả dữ liệu mẫu sinh theo thời điểm hiện tại, và component MUST NOT tự chứa dữ liệu mẫu. Mọi thời điểm trong dữ liệu là ISO-8601 UTC; chữ hiển thị (giờ, ngày, khoảng thời gian, tỷ lệ, câu tóm tắt) MUST do giao diện tạo ra theo giờ địa phương của trình duyệt.

#### Scenario: Đổi nguồn dữ liệu
- **WHEN** hook `useOverview()` trả một `OverviewData` khác (ví dụ trong test)
- **THEN** màn hiện đúng dữ liệu đó mà không phải sửa component nào

### Requirement: Phần đầu trang Tổng quan
Phần đầu trang MUST hiện dòng ngày giờ (thứ, ngày/tháng/năm, giờ:phút), lời chào theo buổi trong ngày kèm tên owner, câu tóm tắt tình trạng tài khoản và cảnh báo cho tài khoản cần đăng nhập lại, cùng hai nút "Đồng bộ ngay" và "Kết nối tài khoản".

#### Scenario: Buổi chiều, một tài khoản hết quyền
- **WHEN** lúc 14:05 thứ Sáu 02/10/2026, owner "An Nguyễn" có Gmail và Zalo đang `CONNECTED` và Messenger `AUTH_EXPIRED`
- **THEN** phần đầu trang hiện "THỨ SÁU · 02/10/2026 · 14:05", "Chào buổi chiều, An Nguyễn.", "Hai tài khoản đang chạy bình thường." và cảnh báo "Messenger cần đăng nhập lại"

### Requirement: Các thẻ của màn Tổng quan
Màn MUST hiện các thẻ của canvas `Dashboard`: Hộp thư hợp nhất (số chưa đọc, số cuộc trò chuyện chờ trả lời, các cuộc trò chuyện mới nhất, tỷ lệ chưa đọc theo nguồn, nút "Mở hộp thư"), Hôm nay (việc và lịch hẹn trong ngày, việc quá hạn và đã xong được đánh dấu, tóm tắt ngày mai, nút "Mở lịch"), Tài khoản (trạng thái từng tài khoản, tiến độ đồng bộ lần đầu, nút "Đăng nhập lại" khi hết quyền), Dịch vụ (biểu đồ số thư đồng bộ mỗi giờ trong 24 giờ, giờ có lỗi hoặc chậm được tô khác, trạng thái từng nguồn), Đăng ký (tổng số, phân bố theo cách đăng nhập, đăng ký mới nhất), Hoạt động gần đây và Lối tắt. Lưới thẻ MUST có 12 cột từ 1280px, 2 cột từ 768px tới 1279px và 1 cột dưới 768px.

#### Scenario: Tỷ lệ theo nguồn
- **WHEN** hộp thư có 12 thư chưa đọc: Gmail 7, Zalo 4, Messenger 1
- **THEN** thẻ Hộp thư hợp nhất hiện "12 chưa đọc" và thanh tỷ lệ của Gmail rộng 58%

#### Scenario: Việc quá hạn
- **WHEN** một việc có hạn 30/09 chưa xong được xem vào ngày 02/10
- **THEN** thẻ Hôm nay hiện việc đó ở trạng thái quá hạn

### Requirement: Phần chưa có dữ liệu
Mỗi phần `inbox`, `today`, `syncActivity`, `registrations`, `activity` của `OverviewData` có thể là `null` (backend chưa làm phần đó). Khi một phần là `null`, thẻ tương ứng MUST vẫn hiện tiêu đề và báo "Chưa có dữ liệu", và các thẻ khác MUST hiện bình thường.

#### Scenario: Backend chưa có hội thoại
- **WHEN** `inbox` là `null`
- **THEN** thẻ Hộp thư hợp nhất hiện "Chưa có dữ liệu" và các thẻ còn lại vẫn hiện dữ liệu

### Requirement: Nút trên màn Tổng quan
Nút dẫn tới màn khác MUST mở đúng đường dẫn: "Mở hộp thư" → `/inbox`, "Mở lịch" → `/calendar`, "Xem tất cả" của Hoạt động gần đây → `/notifications`. Các nút hành động chưa có chức năng ("Đồng bộ ngay", "Kết nối tài khoản", "Đăng nhập lại", "Xem lại", các lối tắt) MUST hiện như canvas và MUST NOT gửi request hay đổi trang.

#### Scenario: Mở hộp thư
- **WHEN** người dùng bấm "Mở hộp thư"
- **THEN** web mở `/inbox`
