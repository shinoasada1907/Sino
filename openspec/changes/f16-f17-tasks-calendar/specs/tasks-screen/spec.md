## ADDED Requirements

### Requirement: Việc cần làm lưu trên máy chủ
Màn Việc cần làm MUST đọc việc từ `GET /api/tasks` và ghi mọi thay đổi (thêm, sửa, đặt hạn, xong / mở lại, ghi chú, xóa) qua API của spec `tasks`; tải lại trang MUST thấy đúng dữ liệu đã lưu. Thay đổi hiện ngay trên màn MUST trở lại như cũ khi máy chủ từ chối, kèm dòng báo "Không lưu được thay đổi. Hãy thử lại." tại chỗ thao tác. Mọi thay đổi việc MUST làm mới các khoảng của màn Lịch đang có trong bộ nhớ đệm.

#### Scenario: Tải lại sau khi thêm
- **WHEN** người dùng thêm "Gọi điện cho thợ sửa máy lạnh" rồi tải lại trang
- **THEN** việc đó vẫn ở nhóm "KHÔNG CÓ HẠN"

#### Scenario: Máy chủ từ chối đánh dấu xong
- **WHEN** người dùng đánh dấu xong một việc và máy chủ trả lỗi
- **THEN** việc trở lại nhóm cũ, chưa xong, và màn báo "Không lưu được thay đổi. Hãy thử lại."

### Requirement: Sửa hạn và lặp lại của một việc
Nút "Sửa" trong khối chi tiết MUST mở biểu mẫu `/tasks/:taskId/edit` theo lớp phủ `InboxTask` của canvas (D-158): Tiêu đề, Hạn (ngày) với Giờ ("Cả ngày", "09:00", "17:00" hoặc giờ tự chọn), Lặp lại ("Không lặp", "Hằng ngày", "Hằng tuần", "Hằng tháng", "Hằng năm", "Tùy chỉnh…" với mỗi N, các thứ và điểm kết thúc), Ghi chú; chân biểu mẫu ghi múi giờ, "Hủy" và "Lưu". Không có ô nhắc nhở và liên kết thư. Lưu MUST gửi tiêu đề và ghi chú qua `PATCH`, hạn và lặp qua `PUT …/schedule`; lỗi từ máy chủ MUST hiện cạnh ô liên quan và giữ biểu mẫu mở. Từ 768 px biểu mẫu là hộp thoại trên trang; dưới 768 px là trang riêng có nút quay lại. "Hủy" hoặc Back MUST đóng biểu mẫu không đổi gì.

#### Scenario: Đặt hạn và lặp hằng tuần
- **WHEN** người dùng mở "Sửa" của "Báo cáo tuần", chọn ngày thứ Hai 12/10, giờ 09:00, "Hằng tuần", rồi "Lưu"
- **THEN** biểu mẫu đóng, việc ở nhóm "SẮP TỚI" với "T2 12/10 · 09:00" và "Mỗi thứ Hai"

#### Scenario: Bỏ hạn
- **WHEN** người dùng xóa ngày trong biểu mẫu của một việc có hạn rồi "Lưu"
- **THEN** việc chuyển sang nhóm "KHÔNG CÓ HẠN" và không còn quy tắc lặp

#### Scenario: Sửa trên điện thoại
- **WHEN** người dùng bấm "Sửa" trên màn 390 px
- **THEN** biểu mẫu là trang riêng; nút quay lại về chi tiết việc, giữ bộ lọc

### Requirement: Xóa việc
"Xóa task" trong khối chi tiết MUST hỏi lại "Xóa việc này?" với "Hủy" và "Xóa"; xác nhận MUST xóa việc qua API, đóng chi tiết và về danh sách (giữ bộ lọc).

#### Scenario: Xóa một việc
- **WHEN** người dùng bấm "Xóa task" rồi "Xóa"
- **THEN** việc biến khỏi danh sách và địa chỉ về `/tasks`

## MODIFIED Requirements

### Requirement: Thêm việc
Ô "Thêm việc mới" MUST lưu một việc không hạn qua `POST /api/tasks` khi nhấn Enter với tiêu đề không rỗng; ô MUST trống lại và giữ focus; tiêu đề rỗng hoặc chỉ khoảng trắng MUST NOT được lưu; tiêu đề MUST không quá 200 ký tự. Máy chủ từ chối thì việc MUST NOT còn trong danh sách, tiêu đề MUST trở lại ô và màn báo "Không thêm được việc. Hãy thử lại."

#### Scenario: Thêm một việc
- **WHEN** người dùng gõ "Gọi điện cho thợ sửa máy lạnh" rồi nhấn Enter
- **THEN** việc đó hiện trong nhóm "KHÔNG CÓ HẠN", số việc đang mở tăng một, ô nhập trống

#### Scenario: Không thêm được
- **WHEN** người dùng nhấn Enter và máy chủ trả lỗi
- **THEN** danh sách không đổi, ô nhập có lại tiêu đề vừa gõ và màn báo "Không thêm được việc. Hãy thử lại."

### Requirement: Chi tiết một việc
Mở một việc (`/tasks/:taskId`) MUST hiện tiêu đề, hạn, lặp lại ("Không" khi không lặp), lúc tạo, ghi chú sửa được (lưu khi rời ô), nút đánh dấu xong, "Sửa" và "Xóa task". Nhắc nhở, liên kết tin nhắn gốc (người gửi · nhà cung cấp, tiêu đề thư, mở cuộc trò chuyện trong Hộp thư) và các mục liên quan MUST chỉ hiện khi việc có dữ liệu đó. "Nhắc lại sau…" và "Thêm thao tác" MUST NOT hiện khi chưa có thao tác tương ứng. Từ 1280 px chi tiết là cột phải, chỉ mở khi có việc đang mở (chưa chọn việc nào thì danh sách dùng hết bề ngang), dòng đang mở được đánh dấu, "Đóng" về danh sách và đóng cột; dưới 1280 px chi tiết là trang riêng có nút quay lại. Việc không tồn tại MUST báo "Không tìm thấy việc này."

#### Scenario: Mở một việc không có nguồn
- **WHEN** người dùng mở "Chuyển tiền nhà tháng 10" (hạn 02/11 17:00, hằng tháng, không nhắc, không nguồn)
- **THEN** chi tiết ghi hạn và "Lặp lại: Hằng tháng · ngày 2", có "Sửa" và "Xóa task", không có dòng "Nhắc", thẻ "Tin nhắn gốc" hay mục "Liên quan"

#### Scenario: Mở một việc có tin nhắn gốc
- **WHEN** dữ liệu của việc có nguồn là thư "Hợp đồng thuê văn phòng — bản sửa lần 2" của "Trần Minh Anh"
- **THEN** chi tiết có thẻ "Tin nhắn gốc" mở cuộc trò chuyện của thư đó

#### Scenario: Chưa chọn việc nào
- **WHEN** người dùng mở `/tasks` trên màn 1440 px
- **THEN** không có cột chi tiết, danh sách dùng hết bề ngang; bấm một việc thì cột mở, bấm "Đóng" thì cột đóng

## REMOVED Requirements

### Requirement: Nút chưa có chức năng trên màn Việc cần làm
**Reason**: "Sửa" và "Xóa task" đã có chức năng (D-158); "Nhắc lại sau…" và "Thêm thao tác" không hiện khi chưa có thao tác.
**Migration**: xem *Sửa hạn và lặp lại của một việc*, *Xóa việc*, *Chi tiết một việc*.
