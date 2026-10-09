## ADDED Requirements

### Requirement: Đầu trang và chế độ xem
Trang `/calendar` MUST có dòng nhỏ và tiêu đề theo chế độ (Tuần: "TUẦN 40 · 2026" / "28/09 – 04/10"; Tháng: "THÁNG 10 · 2026" / "Tháng 10"; Lịch trình: "TỪ HÔM NAY · 02/10" / "Lịch trình"), nút "Hôm nay", "Khoảng trước", "Khoảng sau", nhóm chọn "Tuần", "Tháng", "Lịch trình", và chú giải (Lịch hẹn, Task có hạn, Nhắc nhở, Lặp lại, Tạo từ tin nhắn, múi giờ). Chế độ và ngày MUST nằm trong địa chỉ trang.

#### Scenario: Sang tháng
- **WHEN** người dùng chọn "Tháng" lúc 14:05 thứ Sáu 02/10/2026
- **THEN** địa chỉ có `?view=month`, đầu trang ghi "THÁNG 10 · 2026" và "Tháng 10", lưới bắt đầu ở thứ Hai 28/9

#### Scenario: Tuần sau
- **WHEN** ở chế độ Tuần, người dùng bấm "Khoảng sau"
- **THEN** đầu trang ghi "TUẦN 41 · 2026" và "05/10 – 11/10", địa chỉ có `date=2026-10-09`

### Requirement: Xem theo tuần
Chế độ Tuần MUST có dải bảy ngày (thứ Hai → Chủ nhật, hôm nay được đánh dấu), hàng "cả ngày", lưới giờ cả ngày cuộn sẵn tới 06:00; lịch hẹn có giờ là khối từ giờ bắt đầu tới giờ kết thúc với tiêu đề, giờ và nguồn; lịch hẹn trùng giờ chia bề ngang; task có hạn giờ là chip ở giờ hạn (quá hạn đỏ, đã xong gạch); nhắc nhở là dấu nhỏ ở giờ nhắc; hôm nay có vạch "bây giờ".

#### Scenario: Tuần của canvas
- **WHEN** người dùng mở `/calendar` lúc 14:05 thứ Sáu 02/10/2026
- **THEN** hàng cả ngày có "Sinh nhật Hà" ở thứ Năm; thứ Sáu có chip "Chuyển tiền nhà tháng 10" lúc 17:00, khối "Gọi Minh Anh về phụ lục giá" 16:00 – 17:00 với nguồn "Trần Minh Anh", dấu nhắc 18:00, và vạch "Bây giờ 14:05"

### Requirement: Xem theo tháng
Chế độ Tháng MUST hiện các tuần chạm tháng (thứ Hai đầu tuần), ngày ngoài tháng nhạt, hôm nay được đánh dấu; mỗi ngày liệt kê lịch hẹn, task và nhắc nhở theo giờ, có giờ đứng trước tiêu đề (mục cả ngày không ghi giờ), gồm các lần lặp.

#### Scenario: Báo cáo tuần lặp lại
- **WHEN** người dùng xem tháng 10/2026
- **THEN** các thứ Hai 05, 12, 19, 26 đều có "09:00 Báo cáo tuần"

### Requirement: Lịch trình
Chế độ Lịch trình MUST liệt kê theo ngày từ hôm nay ("Hôm nay", "Ngày mai", rồi tên thứ), mỗi mục có giờ (hoặc "Hạn 30/09" với task quá hạn từ trước), tiêu đề, nguồn hoặc quy tắc lặp, và ghi chú bên phải: "Quá hạn N ngày", "Đã xong", "Đã báo", "sau 2 giờ" (lịch hẹn sắp tới hôm nay), địa điểm, quy tắc lặp, "nhắc 07:30".

#### Scenario: Hôm nay trong lịch trình
- **WHEN** người dùng chọn "Lịch trình"
- **THEN** nhóm "Hôm nay · THỨ SÁU 02/10" bắt đầu bằng "Gửi lại hóa đơn tháng 9 cho kế toán" với "Hạn 30/09" và "Quá hạn 2 ngày", và có "Gọi Minh Anh về phụ lục giá" 16:00 – 17:00 với "sau 2 giờ"

### Requirement: Chi tiết lịch hẹn
Bấm một lịch hẹn MUST mở chi tiết (`/calendar/:itemId`, giữ chế độ và ngày): loại ("Lịch hẹn" / "Lịch hẹn lặp lại"), tiêu đề, ngày giờ, nhắc ("17:30 · 1 giờ trước"), lặp lại, địa điểm, tin nhắn đã tạo ra nó (mở Hộp thư), ghi chú, liên quan. Từ 1280 px chi tiết là cột phải; dưới 1280 px là trang riêng có nút quay lại. Bấm một task hoặc nhắc nhở MUST mở việc đó ở màn Việc cần làm.

#### Scenario: Mở bữa cơm cuối tuần
- **WHEN** người dùng bấm "Về nhà ăn cơm"
- **THEN** chi tiết ghi "Thứ Bảy 03/10 · 18:30 – 21:00", "Nhắc: 17:30 · 1 giờ trước", "Lặp lại: Không", "Địa điểm: Nhà bố mẹ", và tin nhắn "Gia đình · Zalo"

#### Scenario: Mở một task từ lịch
- **WHEN** người dùng bấm chip "Chuyển tiền nhà tháng 10"
- **THEN** trang chuyển tới `/tasks/task-rent`

### Requirement: Lịch trên điện thoại
Dưới 768 px trang MUST hiện như `MobileCalendar`: đầu trang "Lịch" với tháng, "Hôm nay", "Thêm lịch hẹn", dải bảy ngày của tuần, và lịch trình bên dưới.

#### Scenario: Mở lịch trên điện thoại
- **WHEN** người dùng mở `/calendar` trên màn 390 px
- **THEN** đầu trang ghi "Lịch" và "THÁNG 10 · 2026", dải tuần 28/09 – 04/10 đánh dấu thứ Sáu 02, và lịch trình bắt đầu ở "Hôm nay"

### Requirement: Trạng thái màn Lịch
Trang MUST hiện khung xương khi đang tải và "Không tải được lịch" kèm "Thử lại" khi lỗi.

#### Scenario: Không tải được
- **WHEN** request lịch lỗi
- **THEN** trang hiện "Không tải được lịch" và "Thử lại" tải lại

### Requirement: Nút chưa có chức năng trên màn Lịch
"Lịch hẹn" (tạo), "Thêm lịch hẹn", "Sửa", "Xóa lịch hẹn" và "Thêm thao tác" MUST hiện như canvas và MUST NOT đổi dữ liệu (D-85).

#### Scenario: Bấm Xóa lịch hẹn
- **WHEN** người dùng bấm "Xóa lịch hẹn" trong chi tiết
- **THEN** lịch hẹn vẫn còn trên lịch
