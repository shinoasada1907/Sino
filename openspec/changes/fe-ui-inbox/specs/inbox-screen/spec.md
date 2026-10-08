## ADDED Requirements

### Requirement: Danh sách hợp nhất
Trang `/inbox` MUST hiện mọi cuộc trò chuyện chưa lưu trữ và không đang tạm ẩn của mọi tài khoản, mới nhất trước, nhóm theo "HÔM NAY", "HÔM QUA", "TUẦN NÀY", "TRƯỚC ĐÓ". Mỗi dòng MUST có dấu nguồn, tiêu đề (người kia hoặc tên nhóm), nguồn, tiêu đề thư nếu là email, xem trước tin cuối (nhóm: "Tên: nội dung"), giờ, và khi có: số tin chưa đọc (chat) hoặc chấm chưa đọc (email), dấu tệp đính kèm, một dòng dấu (việc liên quan, hiện lại theo hẹn, hẹn gửi, thư hẹn giờ không gửi được). Từ 1280px trang MUST có cột "Nguồn và bộ lọc" với số đếm của từng nguồn và từng bộ lọc nhanh, danh sách tài khoản kèm trạng thái.

#### Scenario: Hộp thư lúc 14:05 thứ Sáu
- **WHEN** người dùng mở `/inbox` với dữ liệu mẫu lúc 14:05 ngày 02/10/2026
- **THEN** đầu danh sách ghi "12 chưa đọc", nhóm "HÔM NAY" có "Trần Minh Anh" (09:41, "Task · hạn T4 07/10") và "Gia đình" (08:20, 3 tin chưa đọc), nhóm "TUẦN NÀY" có "Điện lực Hà Nội" với giờ "Thứ 3"

### Requirement: Lọc hộp thư
Người dùng MUST lọc được theo nguồn (Tất cả, Gmail, Zalo, Messenger) và theo bộ lọc nhanh (Chưa đọc, Cần trả lời, Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ); lựa chọn MUST nằm trong URL (`source`, `view`) và mục đang chọn MUST có `aria-current="page"` (cột nguồn) hoặc `aria-pressed="true"` (nút). Khi không còn cuộc trò chuyện nào khớp, danh sách MUST báo "Không có cuộc trò chuyện nào".

#### Scenario: Chỉ Zalo, chưa đọc
- **WHEN** người dùng chọn nguồn Zalo rồi "Chưa đọc"
- **THEN** đường dẫn là `/inbox?source=zalo&view=unread` và danh sách chỉ còn "Gia đình"

### Requirement: Đọc thư email
Mở một thư email MUST hiện tiêu đề thư, nguồn và tài khoản, số thư và số tệp, các việc liên quan, các thư cũ thu gọn (người gửi, câu đầu, ngày; bấm để mở), thư mới nhất đầy đủ (người gửi, người nhận, giờ, nội dung chữ thuần, tệp đính kèm) và ô trả lời. Từ 1280px thư mở trong cột phải của danh sách và dòng đang mở được đánh dấu.

#### Scenario: Mở hợp đồng
- **WHEN** người dùng mở "Trần Minh Anh · Hợp đồng thuê văn phòng — bản sửa lần 2"
- **THEN** cột phải có tiêu đề "Hợp đồng thuê văn phòng — bản sửa lần 2", "Gmail · an.nguyen@gmail.com", "3 thư · 2 tệp", hai thư cũ thu gọn và tệp "Hop-dong-thue-VP-v2.pdf · 1,4 MB"

### Requirement: Hội thoại chat
Mở một hội thoại chat MUST hiện tin theo ngày, tin hệ thống, vạch "N tin chưa đọc" trước tin chưa đọc đầu tiên, bong bóng tin đến (tên người gửi trong nhóm) và tin của mình (bên phải, trạng thái "Đã xem", "Đang gửi"), ảnh và việc gắn với tin, ô nhắn tin. Từ 1280px hội thoại là trang riêng có liên kết "Hộp thư" và cột thông tin: việc và ghi chú, thành viên, ảnh và tệp, tài khoản dùng.

#### Scenario: Mở Gia đình
- **WHEN** người dùng mở "Gia đình"
- **THEN** trang có tiêu đề "Gia đình", "Zalo · nhóm 6 người · qua +84 9•• ••• 218", vạch "3 tin chưa đọc", tin "Để con mang thêm trái cây nữa nhé." với "Đang gửi", và cột thông tin có "Thành viên · 6"

### Requirement: Đánh dấu đã đọc
Mở một cuộc trò chuyện có tin chưa đọc MUST đánh dấu nó đã đọc: dòng của nó thôi đậm và mất số / chấm chưa đọc, số "N chưa đọc" của hộp thư, của nguồn và của mục "Hộp thư" trên điều hướng MUST giảm đúng số tin đó.

#### Scenario: Đọc Gia đình
- **WHEN** người dùng mở "Gia đình" (3 tin chưa đọc) rồi quay lại danh sách
- **THEN** đầu danh sách ghi "9 chưa đọc", Zalo ghi 1, và dòng "Gia đình" không còn số 3

### Requirement: Soạn và gửi
Ô soạn MUST gửi khi bấm "Gửi" hoặc phím tắt (Ctrl Enter với email, Enter với chat), MUST không gửi nội dung rỗng, và tin vừa gửi MUST hiện ngay cuối hội thoại với trạng thái "Đang gửi" rồi đổi khi xong; xem trước của dòng trong danh sách MUST đổi theo. Khi cuộc trò chuyện không gửi được (`canSend = false`), ô soạn MUST được thay bằng thông báo theo `ThreadState`.

#### Scenario: Nhắn Gia đình
- **WHEN** người dùng gõ "Con về lúc 6 giờ" vào ô nhắn tin của "Gia đình" rồi nhấn Enter
- **THEN** cuối hội thoại có bong bóng "Con về lúc 6 giờ" của mình, ô soạn trống lại, và dòng "Gia đình" trong danh sách xem trước "Con về lúc 6 giờ"

### Requirement: Trạng thái hộp thư
Trang MUST hiện theo `InboxState`: đang tải, chưa có nguồn nào ("Hộp thư đang trống." kèm nút kết nối), tài khoản đang đồng bộ lần đầu, không tải được (kèm "Thử lại"), ngoại tuyến (dữ liệu đã lưu). Hội thoại của tài khoản hết quyền MUST hiện thông báo của `ThreadState` thay cho ô soạn, kèm "Kết nối lại".

#### Scenario: Chưa có nguồn
- **WHEN** không có tài khoản nào
- **THEN** trang hiện "Hộp thư đang trống." và nút "Kết nối" cho từng nhà cung cấp

### Requirement: Nút chưa có chức năng trên màn Hộp thư
Tìm trong cuộc trò chuyện, đánh dấu chưa đọc, lưu trữ, tạm ẩn, "Mở trong …", các nút thao tác trên một thư (tạo task, nhắc tôi, lịch hẹn, ghi chú), đính kèm tệp, "Gửi lúc…", "Tắt thông báo…", "Hiện trong Tổng quan" MUST hiện như canvas và MUST NOT đổi dữ liệu.

#### Scenario: Bấm Lưu trữ
- **WHEN** người dùng bấm "Lưu trữ" ở một cuộc trò chuyện
- **THEN** cuộc trò chuyện vẫn nằm trong danh sách
