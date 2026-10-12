## ADDED Requirements

### Requirement: Danh sách ghi chú
Trang `/notes` MUST hiện mọi ghi chú theo hai nhóm "ĐÃ GHIM" và "GẦN ĐÂY", trong mỗi nhóm sửa gần nhất trước. Mỗi thẻ MUST có tiêu đề (trống thì dòng đầu của nội dung), giờ sửa (hôm nay "HH:mm", hôm qua "Hôm qua", cũ hơn "dd/MM"), đầu nội dung, và nguồn: "Thư · tên", "Tin nhắn · tên", "Cuộc trò chuyện · tên", "Người · tên", "Tin nhắn gốc không còn" hoặc "Ghi chú độc lập". Thẻ đã ghim MUST có dấu ghim.

#### Scenario: Ghi chú lúc 14:05 thứ Sáu
- **WHEN** người dùng mở `/notes` với dữ liệu mẫu lúc 14:05 ngày 02/10/2026
- **THEN** "ĐÃ GHIM" có "Danh sách mua cho bà" (08:31) rồi "Mã khách hàng phòng khám" (Hôm qua); "GẦN ĐÂY" có "Điều khoản 4 — thời hạn thanh toán" (09:52, "Thư · Trần Minh Anh"), "Hoàng thích nhận file qua Drive" (29/09, "Người · Lê Hoàng"), "Số hợp đồng bảo hiểm" ("Tin nhắn gốc không còn"), "Ý tưởng chuyến đi Đà Lạt tháng 12" ("Ghi chú độc lập")

### Requirement: Lọc và tìm ghi chú
Trang MUST cho lọc Tất cả, Gắn tin nhắn (có neo), Đã ghim, mỗi chip kèm số ghi chú của nó trên mọi ghi chú; MUST cho tìm theo tiêu đề và nội dung, không phân biệt hoa thường và dấu, trong bộ lọc đang chọn. Bộ lọc và từ khóa MUST nằm trong URL (`filter`, `q`). Không có ghi chú nào khớp thì MUST báo "Không có ghi chú nào khớp".

#### Scenario: Tìm không dấu
- **WHEN** người dùng gõ "thanh toan" vào ô tìm
- **THEN** chỉ "Điều khoản 4 — thời hạn thanh toán" còn trong danh sách, và URL có `q=thanh+toan`

### Requirement: Ô soạn một ghi chú
Chọn một thẻ MUST mở `/notes/{id}`: từ 768 px ở cột phải, dưới 768 px là trang riêng có nút quay lại "Ghi chú" và không có thanh dưới. Ô soạn MUST có: nguồn neo (chữ "Gắn với …" và chip mở cuộc trò chuyện trong Hộp thư, hoặc "Tin nhắn gốc không còn"), Ghim, Thêm thao tác, Xóa, tiêu đề, đoạn trích chỉ đọc nếu có ("TRÍCH TỪ THƯ · giờ"), nội dung, chip việc liên quan mở `/tasks/{id}`, chân "Sửa lúc … · tự lưu" và "N / 20.000 ký tự". Từ 768 px, `/notes` chưa chọn ghi chú MUST ghi "Chọn một ghi chú để xem".

#### Scenario: Mở ghi chú điều khoản 4
- **WHEN** người dùng chọn "Điều khoản 4 — thời hạn thanh toán"
- **THEN** ô soạn có "Gắn với thư", chip "Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2" trỏ tới `/inbox/conv-1`, đoạn trích "TRÍCH TỪ THƯ · 09:41 HÔM NAY", chip việc "Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2"

### Requirement: Sửa và tự lưu
Sửa tiêu đề hay nội dung MUST được lưu sau khi ngừng gõ và khi rời ô, không cần nút Lưu; thẻ trong danh sách MUST đổi theo và lên đầu nhóm của nó. Nội dung MUST NOT vượt 20.000 ký tự. Nội dung bị xóa hết MUST NOT được lưu và MUST báo "Ghi chú cần có nội dung".

#### Scenario: Sửa nội dung
- **WHEN** người dùng thêm một dòng vào nội dung rồi ngừng gõ
- **THEN** chân ô soạn ghi giờ sửa mới, và thẻ trong danh sách hiện đầu nội dung mới

### Requirement: Ghi chú mới
"+ Ghi chú" MUST mở `/notes/new` với ô soạn trống. Ghi chú MUST chỉ được tạo khi có nội dung; khi đó đường dẫn MUST thành `/notes/{id}` mà không thêm mục vào lịch sử. Rời `/notes/new` khi còn trống MUST NOT tạo gì.

#### Scenario: Viết ghi chú mới
- **WHEN** người dùng bấm "+ Ghi chú", gõ "Gọi lại cho phòng khám" vào nội dung rồi ngừng gõ
- **THEN** ghi chú mới có trong "GẦN ĐÂY" với nguồn "Ghi chú độc lập", và đường dẫn là `/notes/{id}` của nó

### Requirement: Ghim và xóa
"Ghim" MUST bật / tắt ghim và chuyển thẻ giữa hai nhóm. "Xóa ghi chú" MUST hỏi "Xóa ghi chú này?"; xác nhận MUST xóa ghi chú và quay về `/notes` (giữ bộ lọc) mà không thêm mục lịch sử; "Hủy" MUST không đổi gì.

#### Scenario: Ghim một ghi chú
- **WHEN** người dùng ghim "Ý tưởng chuyến đi Đà Lạt tháng 12"
- **THEN** thẻ đó chuyển lên "ĐÃ GHIM" và chip "Đã ghim" thành "Đã ghim · 3"

### Requirement: Trạng thái của trang Ghi chú
Trang MUST có trạng thái đang tải (khung xương), không tải được ("Không tải được ghi chú" và "Thử lại"), và chưa có ghi chú nào ("Chưa có ghi chú nào" kèm "+ Ghi chú").

#### Scenario: Chưa có ghi chú
- **WHEN** người dùng chưa có ghi chú nào
- **THEN** trang ghi "Chưa có ghi chú nào" và có nút "+ Ghi chú"
