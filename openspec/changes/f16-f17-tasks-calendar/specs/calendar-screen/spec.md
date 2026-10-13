## ADDED Requirements

### Requirement: Lịch đọc từ máy chủ
Màn Lịch MUST đọc mỗi khoảng đang xem từ `GET /api/calendar?from=&to=` và ghi lịch hẹn qua API của spec `calendar`; tải lại trang MUST thấy đúng dữ liệu đã lưu. Mọi thay đổi lịch hẹn MUST làm mới các khoảng Lịch đang có trong bộ nhớ đệm; thay đổi việc ở màn Việc cần làm cũng vậy.

#### Scenario: Việc vừa đặt hạn hiện trên lịch
- **WHEN** người dùng đặt hạn thứ Hai 12/10 09:00 cho một việc rồi mở Lịch tuần đó
- **THEN** thứ Hai 12/10 có chip của việc đó lúc 09:00

### Requirement: Tạo lịch hẹn
"Lịch hẹn" ở đầu trang (desktop) và "Thêm lịch hẹn" (điện thoại) MUST mở biểu mẫu `/calendar/new` (giữ `view`, `date`; ngày mặc định là ngày đang xem, hôm nay nếu khoảng chứa hôm nay) theo lớp phủ `InboxEvent` của canvas (D-158): Tiêu đề, Ngày, Thời gian (bắt đầu – kết thúc hoặc "Cả ngày"), Địa điểm, Lặp lại ("Không lặp", "Hằng tuần", "Hằng tháng", "Tùy chỉnh…"), Ghi chú, dòng "Lịch hẹn chỉ nằm trong Sino, không gửi lời mời cho ai.", múi giờ, "Hủy" và "Tạo lịch hẹn". Không có ô nhắc nhở và liên kết thư. Từ 768 px biểu mẫu là hộp thoại; dưới 768 px là trang riêng có nút quay lại. Lỗi từ máy chủ MUST hiện cạnh ô liên quan và giữ biểu mẫu mở.

#### Scenario: Tạo lịch hẹn lặp hằng tuần
- **WHEN** người dùng tạo "Họp nhóm" thứ Năm 08/10, 10:00 – 11:00, "Hằng tuần"
- **THEN** biểu mẫu đóng và mọi thứ Năm từ 08/10 trên lịch có khối "Họp nhóm" 10:00 – 11:00

#### Scenario: Giờ kết thúc trước giờ bắt đầu
- **WHEN** người dùng chọn 11:00 – 10:00 rồi bấm "Tạo lịch hẹn"
- **THEN** biểu mẫu vẫn mở và báo lỗi ở ô Thời gian

### Requirement: Sửa lịch hẹn
"Sửa" trong chi tiết lịch hẹn MUST mở biểu mẫu `/calendar/:itemId/edit` với dữ liệu của cả chuỗi (đọc `GET /api/events/{id}`), nút chính "Lưu". Với lịch hẹn lặp, biểu mẫu MUST hiện mốc của chuỗi và ghi "Áp dụng cho mọi lần lặp"; lưu MUST đổi mọi lần (D-151).

#### Scenario: Đổi giờ lịch hẹn lặp từ một lần giữa chuỗi
- **WHEN** người dùng mở lần 22/10 của "Họp nhóm" (lặp từ 08/10), bấm "Sửa", đổi sang 14:00 – 15:00 rồi "Lưu"
- **THEN** biểu mẫu hiện ngày 08/10 với "Áp dụng cho mọi lần lặp", và sau khi lưu mọi thứ Năm hiện 14:00 – 15:00

### Requirement: Xóa lịch hẹn
"Xóa lịch hẹn" MUST hỏi lại "Xóa lịch hẹn này?" ("Xóa cả chuỗi lịch hẹn này?" khi lặp) với "Hủy" và "Xóa"; xác nhận MUST xóa qua API, đóng chi tiết và về lịch (giữ `view`, `date`).

#### Scenario: Xóa một lịch hẹn lặp
- **WHEN** người dùng bấm "Xóa lịch hẹn" trên một lần của "Chạy bộ Hồ Tây" rồi "Xóa"
- **THEN** hộp thoại đã ghi "Xóa cả chuỗi lịch hẹn này?", và sau khi xóa không còn lần nào trên lịch

## MODIFIED Requirements

### Requirement: Chi tiết lịch hẹn
Bấm một lịch hẹn MUST mở chi tiết (`/calendar/:itemId`, giữ chế độ và ngày): loại ("Lịch hẹn" / "Lịch hẹn lặp lại"), tiêu đề, ngày giờ, lặp lại, địa điểm, ghi chú, "Sửa" và "Xóa lịch hẹn". Nhắc nhở ("17:30 · 1 giờ trước"), tin nhắn đã tạo ra nó (mở Hộp thư) và các mục liên quan MUST chỉ hiện khi lịch hẹn có dữ liệu đó; "Thêm thao tác" MUST NOT hiện khi chưa có thao tác tương ứng. Từ 1280 px chi tiết là cột phải, chỉ mở khi có lịch hẹn đang mở (chưa chọn thì lịch dùng hết bề ngang); dưới 1280 px là trang riêng có nút quay lại. Bấm một task (kể cả lần sắp tới của việc lặp) hoặc nhắc nhở MUST mở việc đó ở màn Việc cần làm.

#### Scenario: Mở lịch hẹn không có nguồn
- **WHEN** người dùng bấm "Họp nhóm" (thứ Năm 10:00 – 11:00, hằng tuần, không nhắc, không nguồn)
- **THEN** chi tiết ghi "Lịch hẹn lặp lại", giờ, "Lặp lại: Mỗi thứ Năm", có "Sửa" và "Xóa lịch hẹn", không có dòng "Nhắc" hay thẻ tin nhắn

#### Scenario: Mở lần sắp tới của việc lặp
- **WHEN** người dùng bấm chip "Báo cáo tuần" ngày 19/10, một lần chưa tạo của việc đang mở hạn 05/10
- **THEN** trang chuyển tới `/tasks/<ID của việc hạn 05/10>`

#### Scenario: Chưa chọn lịch hẹn nào
- **WHEN** người dùng mở `/calendar` trên màn 1440 px
- **THEN** không có cột chi tiết, lịch dùng hết bề ngang; bấm một lịch hẹn thì cột mở, bấm "Đóng" thì cột đóng

## REMOVED Requirements

### Requirement: Nút chưa có chức năng trên màn Lịch
**Reason**: "Lịch hẹn", "Thêm lịch hẹn", "Sửa", "Xóa lịch hẹn" đã có chức năng (D-158); "Thêm thao tác" không hiện khi chưa có thao tác.
**Migration**: xem *Tạo lịch hẹn*, *Sửa lịch hẹn*, *Xóa lịch hẹn*, *Chi tiết lịch hẹn*.
