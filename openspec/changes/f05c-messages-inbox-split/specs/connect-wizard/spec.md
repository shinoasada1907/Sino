## MODIFIED Requirements

### Requirement: Kết quả quay về
Khi trang Tài khoản mở với `?connected={accountId}` của một tài khoản có trong danh sách (đọc sau khi danh sách đã tải), hộp thoại MUST mở ở bước 4 "Tùy chọn đồng bộ" cho tài khoản đó; khi backend chưa có đồng bộ lần đầu (F04b), hộp thoại MUST mở thẳng bước 5 "Hoàn tất" với "Đã kết nối <tài khoản>", câu cho biết chưa đồng bộ, không có tiến độ. "Bắt đầu đồng bộ" MUST gửi tùy chọn đã chọn (khoảng đồng bộ, nhãn làm bộ lọc, tải tệp khi mở) và chuyển sang bước 5 "Hoàn tất" với "Đã kết nối <tài khoản>", tiến độ đồng bộ, nút mở màn của tài khoản vừa nối và "Kết nối thêm tài khoản". Nút mở màn MUST theo loại provider của tài khoản: `EMAIL` → "Mở hộp thư" (`/inbox`), `CHAT` → "Mở Tin nhắn" (`/messages`). Với `?connectError={CODE}`, trang MUST hiện cảnh báo theo bảng thông báo (mã lạ dùng câu chung) kèm nút "Thử lại" mở bước 1. Tham số kết quả MUST được xóa khỏi URL sau khi xử lý, không thêm mục lịch sử.

#### Scenario: Quay về sau khi kết nối
- **WHEN** trang mở ở `/accounts?connected=acc-gmail`
- **THEN** hộp thoại hiện "Tùy chọn đồng bộ" (4/5) cho an.nguyen@gmail.com và đường dẫn chỉ còn `/accounts`

#### Scenario: Người dùng hủy ở Google
- **WHEN** trang mở ở `/accounts?connectError=CONNECT_CANCELLED`
- **THEN** trang hiện "Bạn đã hủy kết nối." với nút "Thử lại", và đường dẫn chỉ còn `/accounts`

#### Scenario: Ước tính theo khoảng đồng bộ
- **WHEN** ở bước 4 người dùng đổi từ "90 ngày gần nhất" sang "30 ngày gần nhất"
- **THEN** dải ước tính đổi từ "khoảng 1.180 thư · 3–5 phút" sang "khoảng 420 thư · 1–2 phút"

#### Scenario: Bắt đầu đồng bộ
- **WHEN** ở bước 4 người dùng giữ "90 ngày gần nhất", tắt "Dùng nhãn Gmail làm bộ lọc trong Sino" rồi bấm "Bắt đầu đồng bộ"
- **THEN** tùy chọn gửi đi là khoảng `DAYS_90`, không dùng nhãn làm bộ lọc, tải tệp khi mở; bước 5 hiện "Đã kết nối an.nguyen@gmail.com" cùng tiến độ "412 / 1.180 thư · còn khoảng 3 phút" và nút "Mở hộp thư" dẫn tới `/inbox`

#### Scenario: Nối một tài khoản chat
- **WHEN** bước 5 "Hoàn tất" hiện cho một tài khoản của provider loại `CHAT`
- **THEN** nút mở màn là "Mở Tin nhắn" và dẫn tới `/messages`
