## ADDED Requirements

### Requirement: Danh sách việc theo nhóm
Trang `/tasks` MUST hiện các việc theo nhóm Quá hạn, Hôm nay (kèm thứ và ngày), Sắp tới, Không có hạn, Đã xong, mỗi nhóm có số việc; nhóm rỗng MUST NOT hiện. Mỗi việc MUST có ô đánh dấu xong, tiêu đề, và khi có: hạn (quá hạn ghi số ngày trễ, cả ngày ghi "cả ngày"), nhắc nhở (đã báo: "Đã nhắc …"), quy tắc lặp, nguồn (dấu nhà cung cấp và người gửi hoặc cuộc trò chuyện); việc đã xong ghi lúc xong và, nếu là việc lặp, lần kế tiếp đã tạo. Đầu trang MUST ghi số việc đang mở, số quá hạn và số việc tạo từ tin nhắn.

#### Scenario: Mở trang lúc 14:05 thứ Sáu 02/10
- **WHEN** người dùng mở `/tasks` với dữ liệu mẫu
- **THEN** đầu trang ghi "8 việc đang mở · 1 quá hạn · 5 việc tạo từ tin nhắn"; nhóm "QUÁ HẠN" có "Gửi lại hóa đơn tháng 9 cho kế toán" với "Hạn 30/09 · trễ 2 ngày" và "Đã nhắc 08:12"; nhóm "HÔM NAY · THỨ SÁU 02/10" có "Chuyển tiền nhà tháng 10" với "Hôm nay · 17:00" và "Hằng tháng · ngày 2"; nhóm "ĐÃ XONG" có "Báo cáo tuần" với "Đã tạo lần kế tiếp: T2 05/10"

#### Scenario: Hạn đã qua trong hôm nay
- **WHEN** một việc đang mở có hạn 09:00 hôm nay và bây giờ là 14:05
- **THEN** việc nằm trong nhóm Quá hạn

### Requirement: Lọc việc
Trang MUST lọc Tất cả, Từ tin nhắn (việc có nguồn), Lặp lại (việc có quy tắc lặp); lựa chọn MUST nằm trong địa chỉ trang để tải lại và quay lại giữ nguyên. Trên mobile bộ lọc nằm sau nút "Lọc".

#### Scenario: Chỉ việc từ tin nhắn
- **WHEN** người dùng chọn "Từ tin nhắn"
- **THEN** địa chỉ có `?filter=messages` và chỉ các việc có nguồn còn trong danh sách

### Requirement: Thêm việc
Ô "Thêm việc mới" MUST lưu một việc không hạn khi nhấn Enter với tiêu đề không rỗng; ô MUST trống lại và giữ focus; tiêu đề rỗng hoặc chỉ khoảng trắng MUST NOT được lưu; tiêu đề MUST không quá 200 ký tự.

#### Scenario: Thêm một việc
- **WHEN** người dùng gõ "Gọi điện cho thợ sửa máy lạnh" rồi nhấn Enter
- **THEN** việc đó hiện trong nhóm "KHÔNG CÓ HẠN", số việc đang mở tăng một, ô nhập trống

### Requirement: Đánh dấu xong và mở lại
Bấm ô đánh dấu MUST chuyển việc đang mở sang Đã xong (và ngược lại: mở lại); với việc lặp, lần kế tiếp máy chủ trả về MUST hiện ở nhóm theo hạn của nó. Số trên điều hướng MUST đổi theo (D-83).

#### Scenario: Xong một việc lặp hằng tháng
- **WHEN** người dùng đánh dấu xong "Chuyển tiền nhà tháng 10" (hạn hôm nay 17:00, hằng tháng ngày 2)
- **THEN** việc đó vào "ĐÃ XONG" với "Đã tạo lần kế tiếp: T2 02/11", và một "Chuyển tiền nhà tháng 10" hạn 02/11 17:00 hiện trong "SẮP TỚI"

### Requirement: Chi tiết một việc
Mở một việc (`/tasks/:taskId`) MUST hiện tiêu đề, hạn, nhắc nhở, lặp lại ("Không" khi không lặp), lúc tạo (và "từ Hộp thư" khi tạo từ tin nhắn), liên kết tin nhắn gốc (người gửi · nhà cung cấp, tiêu đề thư) mở cuộc trò chuyện trong Hộp thư, ghi chú sửa được (lưu khi rời ô), các mục liên quan, và nút đánh dấu xong. Từ 1280 px chi tiết là cột phải, chỉ mở khi có việc đang mở (chưa chọn việc nào thì danh sách dùng hết bề ngang), dòng đang mở được đánh dấu, "Đóng" về danh sách và đóng cột; dưới 1280 px chi tiết là trang riêng có nút quay lại. Việc không tồn tại MUST báo "Không tìm thấy việc này."

#### Scenario: Mở việc trả lời hợp đồng
- **WHEN** người dùng mở "Trả lời: Hợp đồng thuê văn phòng — bản sửa lần 2"
- **THEN** chi tiết ghi "Hạn: Thứ Tư 07/10 · 17:00", "Nhắc: Thứ Hai 05/10 · 09:00", "Lặp lại: Không", tin nhắn gốc "Trần Minh Anh" mở `/inbox/conv-1`, và ghi chú "Xem điều khoản 4 và phụ lục giá trước khi trả lời. Minh Anh cần phản hồi trước thứ Tư."

#### Scenario: Chưa chọn việc nào
- **WHEN** người dùng mở `/tasks` trên màn 1440 px
- **THEN** không có cột chi tiết, danh sách dùng hết bề ngang; bấm một việc thì cột mở, bấm "Đóng" thì cột đóng

### Requirement: Số việc trên điều hướng
Mục "Việc cần làm" trên điều hướng MUST đếm việc tới hạn (quá hạn + hạn hôm nay) và đọc "N tới hạn"; dấu đỏ MUST là số việc quá hạn.

#### Scenario: Xong việc quá hạn
- **WHEN** người dùng đánh dấu xong việc quá hạn duy nhất
- **THEN** mục "Việc cần làm" còn 2 tới hạn và không còn dấu quá hạn

### Requirement: Trạng thái màn Việc cần làm
Trang MUST hiện khung xương khi đang tải, "Không tải được việc cần làm" kèm "Thử lại" khi lỗi, và "Chưa có việc nào." kèm ô thêm việc khi danh sách rỗng.

#### Scenario: Chưa có việc nào
- **WHEN** danh sách việc rỗng
- **THEN** trang hiện "Chưa có việc nào." và ô "Thêm việc mới" vẫn dùng được

### Requirement: Nút chưa có chức năng trên màn Việc cần làm
"Thêm thao tác", "Nhắc lại sau…" và "Xóa task" của khối chi tiết MUST hiện như canvas và MUST NOT đổi dữ liệu (D-80).

#### Scenario: Bấm Thêm thao tác
- **WHEN** người dùng bấm "Xóa task" trong khối chi tiết
- **THEN** việc không đổi
