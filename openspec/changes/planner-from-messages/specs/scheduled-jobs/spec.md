## ADDED Requirements

### Requirement: Việc hẹn giờ chỉ chứa tham chiếu
Mỗi việc hẹn giờ MUST có loại, giờ chạy, tham chiếu tới đối tượng của module sở hữu (chỉ loại và ID), trạng thái, số lần thử và lỗi gần nhất. Việc hẹn giờ MUST NOT chứa nội dung tin nhắn, token hay secret.

#### Scenario: Lưu việc gửi thư hẹn giờ
- **WHEN** module messaging hẹn giờ gửi một thư
- **THEN** việc hẹn giờ chỉ chứa ID của thư gửi đi, không chứa nội dung thư

### Requirement: Không chạy trùng
Khi nhiều tiến trình cùng quét việc tới hạn, mỗi việc MUST chỉ được một tiến trình chạy tại một thời điểm.

#### Scenario: Hai tiến trình quét cùng lúc
- **WHEN** hai tiến trình cùng quét lúc một việc tới hạn
- **THEN** chỉ một tiến trình nhận và chạy việc đó

### Requirement: Hồi phục sau sự cố
Một việc đang chạy MUST có hạn giữ khóa; nếu tiến trình chạy nó dừng đột ngột, việc MUST được chạy lại sau khi hết hạn giữ khóa. Tác động phụ của việc (gửi thông báo, gửi thư) MUST dùng mã chống trùng để chạy lại không tạo kết quả trùng.

#### Scenario: Tiến trình chết giữa chừng
- **WHEN** tiến trình đang chạy một việc nhắc nhở thì dừng đột ngột
- **THEN** sau khi hết hạn giữ khóa, việc được chạy lại và người dùng chỉ nhận một thông báo

### Requirement: Thử lại có kiểm soát
Lỗi tạm thời (`PROVIDER_UNAVAILABLE`, `RATE_LIMITED`) MUST được thử lại sau 1, 5 rồi 15 phút, hoặc theo thời gian chờ provider đưa ra. Lỗi không tự hết (`AUTH_EXPIRED`, `CAPABILITY_NOT_SUPPORTED`, `REQUEST_REJECTED`) MUST thất bại ngay. Khi hết lượt thử hoặc thất bại, module sở hữu MUST được báo để xử lý.

#### Scenario: Provider tạm thời không phản hồi
- **WHEN** việc gửi thư hẹn giờ gặp `PROVIDER_UNAVAILABLE` lần đầu
- **THEN** việc được hẹn chạy lại sau 1 phút

#### Scenario: Quyền đã hết hạn
- **WHEN** việc gửi thư hẹn giờ gặp `AUTH_EXPIRED`
- **THEN** việc thất bại ngay, không thử lại, và module messaging được báo

### Requirement: Hủy việc chưa chạy
Module sở hữu MUST hủy được một việc chưa chạy; việc đã hủy MUST NOT chạy.

#### Scenario: Hủy thư hẹn giờ
- **WHEN** người dùng hủy một thư hẹn giờ trước giờ gửi
- **THEN** việc gửi của thư đó bị hủy và thư không được gửi

### Requirement: Đúng giờ và kiểm thử được
Khi hệ thống chạy bình thường, việc tới hạn MUST được chạy trong vòng 30 giây sau giờ chạy. Mọi phép tính thời gian MUST dùng một `Clock` được truyền vào để kiểm thử có thể tua giờ.

#### Scenario: Việc tới hạn
- **WHEN** một việc có giờ chạy 9:00:00 và hệ thống hoạt động bình thường
- **THEN** việc được chạy chậm nhất lúc 9:00:30
