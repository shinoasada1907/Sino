## MODIFIED Requirements

### Requirement: Danh sách hợp nhất
Trang `/inbox` MUST hiện mọi cuộc trò chuyện chưa lưu trữ và không đang tạm ẩn của các tài khoản có provider loại `EMAIL`, mới nhất trước, nhóm theo "HÔM NAY", "HÔM QUA", "TUẦN NÀY", "TRƯỚC ĐÓ". Cuộc trò chuyện của provider loại `CHAT` nằm ở màn Tin nhắn (`messages-screen`), MUST NOT có ở `/inbox`. Mỗi dòng MUST có dấu nguồn, tiêu đề (người kia hoặc tên nhóm), nguồn, tiêu đề thư nếu là email, xem trước tin cuối (nhóm: "Tên: nội dung"), giờ, và khi có: số tin chưa đọc (chat) hoặc chấm chưa đọc (email), dấu tệp đính kèm, một dòng dấu (việc liên quan, hiện lại theo hẹn, hẹn gửi, thư hẹn giờ không gửi được). Từ 1280px trang MUST có cột "Nguồn và bộ lọc" với số đếm của từng nguồn và từng bộ lọc nhanh, danh sách tài khoản kèm trạng thái, chỉ gồm provider loại `EMAIL` và tài khoản của chúng.

#### Scenario: Chỉ có email
- **WHEN** chủ có một thread Gmail "Trần Minh Anh" và nhóm Zalo "Gia đình", và người dùng mở `/inbox`
- **THEN** danh sách có "Trần Minh Anh" và không có "Gia đình", cột nguồn không có Zalo

### Requirement: Dòng ghi tài khoản khi một nguồn có nhiều tài khoản
Khi nguồn của một dòng có từ hai tài khoản trở lên, dòng MUST ghi địa chỉ của tài khoản nhận cuộc trò chuyện đó, ở mọi cỡ màn; từ 1280px MUST ghi sau tên nguồn ("Gmail · tienct07@gmail.com"). Nguồn chỉ có một tài khoản MUST giữ chữ nguồn như cũ (chỉ từ 1280px). Tên dài và địa chỉ dài MUST cùng cắt bằng "…" trong dòng của chúng, không đè lên giờ. Quy tắc này áp như nhau cho Hộp thư và Tin nhắn.

#### Scenario: Hai tài khoản Gmail, một tài khoản Zalo
- **WHEN** chủ có hai tài khoản Gmail (`an.nguyen@gmail.com`, `an@congty.vn`) và một tài khoản Zalo, và thư "Thu Trang" về `an@congty.vn`
- **THEN** ở `/inbox`, dòng "Thu Trang" ghi "an@congty.vn" ở mọi cỡ màn, từ 1280px là "Gmail · an@congty.vn"; dòng "Trần Minh Anh" ghi "Gmail · an.nguyen@gmail.com"; ở `/messages`, dòng "Gia đình" vẫn chỉ ghi "Zalo · nhóm 6 người" từ 1280px

#### Scenario: Chỉ một tài khoản Gmail
- **WHEN** chủ chỉ có một tài khoản Gmail
- **THEN** dòng thư Gmail ghi "Gmail" từ 1280px và không ghi gì dưới 1280px, như canvas

### Requirement: Lọc hộp thư
Người dùng MUST lọc được theo nguồn (Tất cả và từng provider loại `EMAIL` có trong danh mục) và theo bộ lọc nhanh (Chưa đọc, Cần trả lời, Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ); lựa chọn MUST nằm trong URL (`source`, `view`) và mục đang chọn MUST có `aria-current="page"` (cột nguồn) hoặc `aria-pressed="true"` (nút). `source` là provider loại `CHAT` hay giá trị lạ MUST quay về "Tất cả". Khi không còn cuộc trò chuyện nào khớp, danh sách MUST báo "Không có cuộc trò chuyện nào".

#### Scenario: Chỉ Gmail, chưa đọc
- **WHEN** người dùng chọn nguồn Gmail rồi "Chưa đọc"
- **THEN** đường dẫn là `/inbox?source=gmail&view=unread` và danh sách chỉ còn các thread Gmail chưa đọc

#### Scenario: Nguồn chat trong địa chỉ Hộp thư
- **WHEN** người dùng mở `/inbox?source=zalo`
- **THEN** bộ lọc nguồn là "Tất cả" và danh sách là mọi thread email

### Requirement: Trạng thái hộp thư
Trang MUST hiện theo `InboxState`: đang tải, chưa có nguồn email nào ("Hộp thư đang trống." kèm nút kết nối cho từng nhà cung cấp loại `EMAIL`), tài khoản email đang đồng bộ lần đầu, không tải được (kèm "Thử lại"; câu dưới tiêu đề MUST nói "Máy chủ Sino trả lỗi khi lấy hộp thư." khi máy chủ trả mã lỗi HTTP và "Máy chủ Sino không phản hồi." khi không ai trả lời), ngoại tuyến (dữ liệu đã lưu). Hội thoại của tài khoản hết quyền MUST hiện thông báo của `ThreadState` thay cho ô soạn, kèm "Kết nối lại".

#### Scenario: Chưa có nguồn email
- **WHEN** chủ chưa có tài khoản email nào, kể cả khi đã có tài khoản chat
- **THEN** `/inbox` hiện "Hộp thư đang trống." và nút "Kết nối" cho từng nhà cung cấp loại `EMAIL`

### Requirement: Danh sách trên API Hộp thư (F05)
Danh sách MUST lấy từ `GET /api/conversations` với `kind=email`, `view` và `provider` theo bộ lọc của địa chỉ, từng trang (`nextCursor`); số đếm, tài khoản và nhà cung cấp lấy từ `GET /api/conversations/counts?kind=email`, `GET /api/accounts`, `GET /api/providers`. Cuối danh sách MUST có "Tải thêm" khi còn trang sau; nút tự tải khi gần tới màn hình (cuộn vô tận) và vẫn bấm được bằng bàn phím. Trang sau không tải được MUST giữ các dòng đã có và hiện "Không tải thêm được." với "Thử lại". Đổi bộ lọc MUST giữ các nút lọc và các dòng đã tải còn khớp trong lúc trang đầu của bộ lọc mới đang về; không còn dòng nào khớp thì hiện khung xương "Đang tải danh sách", không hiện "Không có cuộc trò chuyện nào". "Đồng bộ lần đầu" chỉ hiện khi cả hộp thư (mọi nguồn email, "Tất cả") trống.

#### Scenario: Lật trang
- **WHEN** máy chủ trả trang đầu kèm `nextCursor` và người dùng tới cuối danh sách
- **THEN** web hỏi trang sau với `cursor` đó, các dòng mới nối vào cuối, và "Tải thêm" mất khi hết trang

#### Scenario: Đổi bộ lọc
- **WHEN** người dùng chọn "Chưa đọc" của nguồn Gmail
- **THEN** web hỏi `GET /api/conversations?kind=email&view=unread&provider=gmail` và địa chỉ thành `?source=gmail&view=unread`

## REMOVED Requirements

### Requirement: Hội thoại chat
**Reason**: Hội thoại chat chuyển sang màn Tin nhắn (D-300); liên kết đầu trang đổi từ "Hộp thư" thành "Tin nhắn".
**Migration**: Xem requirement "Hội thoại chat ở Tin nhắn" của `messages-screen`; `/inbox/:id` của một cuộc chat tự chuyển sang `/messages/:id` ("Chuyển tới màn đúng loại").
