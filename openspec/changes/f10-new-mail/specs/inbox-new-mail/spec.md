## ADDED Requirements

### Requirement: Nút "Thư mới" và trang soạn
Hộp thư MUST có nút "Thư mới": từ 1280px ở đầu danh sách, ở tablet cuối hàng chip lọc, ở mobile trên đầu trang. Nút MUST mở `/inbox/new`: ô soạn ở chỗ đọc thư (cột phải từ 768px; trang toàn màn có nút quay lại và không có thanh dưới ở mobile). Ô soạn MUST có "Từ", "Tới", "Tiêu đề", "Nội dung", "Gửi", "Bỏ".

#### Scenario: Mở trang soạn trên desktop
- **WHEN** người dùng bấm "Thư mới" ở 1440px
- **THEN** đường dẫn là `/inbox/new`, danh sách vẫn hiện, cột phải là ô soạn

### Requirement: Tài khoản gửi
"Từ" MUST liệt kê tài khoản của nhà cung cấp gửi được; tài khoản chưa cấp quyền gửi MUST hiện "Cần cấp quyền gửi" và tài khoản hết quyền MUST hiện "Cần đăng nhập lại", cả hai không chọn được. Mặc định MUST là tài khoản dùng lần trước trên trình duyệt này nếu còn gửi được, không thì tài khoản gửi được đầu tiên. Không tài khoản nào gửi được thì ô soạn MUST được thay bằng dòng báo có "Cấp quyền gửi".

#### Scenario: Hai tài khoản, một chưa cấp quyền gửi
- **WHEN** `tienct07` gửi được và `bonzed2001` chưa cấp quyền gửi
- **THEN** "Từ" là `tienct07@gmail.com`; `bonzed2001@gmail.com` hiện "Cần cấp quyền gửi" và không chọn được

### Requirement: Kiểm người nhận và nội dung
"Tới" MUST nhận các địa chỉ cách nhau bằng dấu phẩy, chấm phẩy hay xuống dòng, bỏ trùng không phân biệt hoa thường. Địa chỉ sai MUST được báo dưới ô ("Địa chỉ không hợp lệ: …"); không có người nhận, quá 50 người nhận hay nội dung trống MUST chặn việc gửi kèm lời báo. Lỗi theo trường của `400 VALIDATION_FAILED` MUST hiện ở đúng ô.

#### Scenario: Một địa chỉ thiếu tên miền
- **WHEN** người dùng gõ "minhanh@acme.vn, an@" rồi bấm "Gửi"
- **THEN** dưới "Tới" ghi "Địa chỉ không hợp lệ: an@" và không có request gửi

### Requirement: Sau khi bấm Gửi
Gửi xong (`201`) web MUST thay `/inbox/new` bằng `/inbox/{id}` của cuộc trò chuyện mới, không thêm mục vào lịch sử trình duyệt, và đọc lại danh sách và số đếm. `502 SEND_FAILED` và `504 SEND_OUTCOME_UNKNOWN` MUST cũng sang cuộc trò chuyện (`conversationId`). Không có câu trả lời (lỗi mạng) MUST giữ ô soạn với chữ đã gõ, khóa chữ, báo "Mất kết nối khi gửi. Gửi lại không làm thư bị gửi hai lần." kèm "Gửi lại" (cùng `clientMessageId`) và "Bỏ". `409 SEND_NOT_ALLOWED` MUST đọc lại tài khoản và báo ở "Từ". Backend chưa có đường tạo (`404` khác `ACCOUNT_NOT_FOUND`, hoặc `405`) MUST giữ chữ và báo "Sino chưa gửi được thư mới. Bạn gửi trong Gmail.".

#### Scenario: Mất mạng khi gửi
- **WHEN** request gửi không có câu trả lời
- **THEN** ô soạn còn nguyên chữ nhưng không sửa được, có "Gửi lại" và "Bỏ"; bấm "Gửi lại" gửi cùng `clientMessageId`

### Requirement: Rời trang khi còn chữ
Còn chữ trong ô soạn (Tới, Tiêu đề hay Nội dung) mà người dùng rời `/inbox/new` (bấm thư khác, quay lại, "Bỏ") thì web MUST hỏi "Bỏ thư đang soạn?" với "Bỏ thư" và "Tiếp tục soạn"; đóng hay tải lại tab MUST có hộp hỏi của trình duyệt. Ô soạn trống thì MUST rời ngay.

#### Scenario: Bấm một thư khác khi đang soạn
- **WHEN** ô soạn có chữ và người dùng bấm một dòng trong danh sách
- **THEN** hộp "Bỏ thư đang soạn?" hiện; "Tiếp tục soạn" giữ nguyên chữ và đường dẫn

### Requirement: Cuộc trò chuyện có thư mở đầu chưa gửi xong
Khi `reply.state` là `OPENING_NOT_SENT`, cuộc trò chuyện MUST NOT có ô trả lời hay dòng báo thay ô trả lời; thư mở đầu MUST hiện trạng thái gửi của nó như F10 ("Gửi lại", "Bỏ", "Chưa rõ đã gửi chưa"). "Bỏ" thư mở đầu MUST đưa về danh sách.

#### Scenario: Thư mới gửi lỗi
- **WHEN** người dùng mở cuộc trò chuyện mới có thư mở đầu "Không gửi được"
- **THEN** thư có "Gửi lại" và "Bỏ", không có ô trả lời; bấm "Bỏ" về `/inbox`
