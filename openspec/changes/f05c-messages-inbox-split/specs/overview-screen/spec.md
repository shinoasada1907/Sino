## MODIFIED Requirements

### Requirement: Các thẻ của màn Tổng quan
Màn MUST hiện các thẻ của canvas `Dashboard`: Hộp thư hợp nhất (số chưa đọc, số cuộc trò chuyện chờ trả lời, các cuộc trò chuyện mới nhất, tỷ lệ chưa đọc theo nguồn, hai nút "Tin nhắn" và "Hộp thư"; nội dung gộp cả chat và email), Hôm nay (việc và lịch hẹn trong ngày, việc quá hạn và đã xong được đánh dấu, tóm tắt ngày mai, nút "Mở lịch"), Tài khoản (trạng thái từng tài khoản, tiến độ đồng bộ lần đầu, nút "Đăng nhập lại" khi hết quyền), Dịch vụ (biểu đồ số thư đồng bộ mỗi giờ trong 24 giờ, giờ có lỗi hoặc chậm được tô khác, trạng thái từng nguồn), Đăng ký (tổng số, phân bố theo cách đăng nhập, đăng ký mới nhất), Hoạt động gần đây và Lối tắt. Lưới thẻ MUST có 12 cột từ 1280px, 2 cột từ 768px tới 1279px và 1 cột dưới 768px, và mỗi kích thước MUST hiện bộ thẻ của artboard tương ứng: desktop đủ 7 thẻ (`Dashboard`); tablet có Hộp thư hợp nhất trải hai cột rồi Tài khoản, Dịch vụ, Đăng ký, Hoạt động gần đây (`TabletDashboard`); mobile có Hôm nay trước tiên rồi Hộp thư hợp nhất, Tài khoản, Đăng ký (`MobileDashboard`).

#### Scenario: Tỷ lệ theo nguồn
- **WHEN** hộp thư có 12 thư chưa đọc: Gmail 7, Zalo 4, Messenger 1
- **THEN** thẻ Hộp thư hợp nhất hiện "12 chưa đọc" và thanh tỷ lệ của Gmail rộng 58%

#### Scenario: Việc quá hạn
- **WHEN** một việc có hạn 30/09 chưa xong được xem vào ngày 02/10
- **THEN** thẻ Hôm nay hiện việc đó ở trạng thái quá hạn

### Requirement: Nút trên màn Tổng quan
Nút dẫn tới màn khác MUST mở đúng đường dẫn: "Tin nhắn" của thẻ Hộp thư hợp nhất → `/messages`, "Hộp thư" của thẻ đó → `/inbox`, "Mở lịch" → `/calendar`, "Xem tất cả" của Hoạt động gần đây → `/notifications`. Các nút hành động chưa có chức năng ("Đồng bộ ngay", "Kết nối tài khoản", "Đăng nhập lại", "Xem lại", các lối tắt) MUST hiện như canvas và MUST NOT gửi request hay đổi trang.

#### Scenario: Mở Tin nhắn
- **WHEN** người dùng bấm "Tin nhắn" ở thẻ Hộp thư hợp nhất
- **THEN** web mở `/messages`

#### Scenario: Mở Hộp thư
- **WHEN** người dùng bấm "Hộp thư" ở thẻ Hộp thư hợp nhất
- **THEN** web mở `/inbox`
