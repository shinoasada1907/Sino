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
Mở một cuộc trò chuyện có tin chưa đọc MUST đánh dấu nó đã đọc (`PATCH /api/conversations/{id}` `{ "read": true }`), một lần cho mỗi lần mở: dòng của nó thôi đậm và mất số / chấm chưa đọc ngay, số "N chưa đọc" của hộp thư và của nguồn MUST giảm một (số đếm cuộc trò chuyện, D-70). Máy chủ từ chối thì dòng và số đếm MUST trở lại như cũ và MUST NOT tự gửi lại trong lần mở đó.

#### Scenario: Đọc Gia đình
- **WHEN** người dùng mở "Gia đình" (3 tin chưa đọc) rồi quay lại danh sách
- **THEN** đầu danh sách ghi "11 chưa đọc", Zalo ghi 3, và dòng "Gia đình" không còn số 3

#### Scenario: Máy chủ từ chối
- **WHEN** người dùng mở một thư chưa đọc và máy chủ trả lỗi cho lệnh đánh dấu đã đọc
- **THEN** thư lại hiện chưa đọc, số đếm như trước, và chỉ có một lệnh được gửi

### Requirement: Soạn và gửi
Ô soạn MUST gửi khi bấm "Gửi" hoặc phím tắt (Ctrl Enter với email, Enter với chat), MUST không gửi nội dung rỗng, và tin vừa gửi MUST hiện ngay cuối hội thoại với trạng thái "Đang gửi" rồi đổi khi xong; xem trước của dòng trong danh sách MUST đổi theo. Khi cuộc trò chuyện không gửi được (`canSend = false`), ô soạn MUST được thay bằng thông báo theo `ThreadState`. Ô soạn MUST chờ chi tiết của cuộc trò chuyện (chi tiết cho biết có gửi được không). Khi Sino chưa gửi được (`canSend = null`, trước F10, D-72), ô soạn MUST được thay bằng một thông báo không có nút: "Sino chưa gửi được thư" (chat: "tin"), "Trả lời từ Sino sẽ có ở bản sau. Bây giờ bạn trả lời trong {nhà cung cấp}."

#### Scenario: Nhắn Gia đình
- **WHEN** người dùng gõ "Con về lúc 6 giờ" vào ô nhắn tin của "Gia đình" rồi nhấn Enter
- **THEN** cuối hội thoại có bong bóng "Con về lúc 6 giờ" của mình, ô soạn trống lại, và dòng "Gia đình" trong danh sách xem trước "Con về lúc 6 giờ"

### Requirement: Trạng thái hộp thư
Trang MUST hiện theo `InboxState`: đang tải, chưa có nguồn nào ("Hộp thư đang trống." kèm nút kết nối), tài khoản đang đồng bộ lần đầu, không tải được (kèm "Thử lại"; câu dưới tiêu đề MUST nói "Máy chủ Sino trả lỗi khi lấy hộp thư." khi máy chủ trả mã lỗi HTTP và "Máy chủ Sino không phản hồi." khi không ai trả lời), ngoại tuyến (dữ liệu đã lưu). Hội thoại của tài khoản hết quyền MUST hiện thông báo của `ThreadState` thay cho ô soạn, kèm "Kết nối lại".

#### Scenario: Chưa có nguồn
- **WHEN** không có tài khoản nào
- **THEN** trang hiện "Hộp thư đang trống." và nút "Kết nối" cho từng nhà cung cấp

### Requirement: Nút chưa có chức năng trên màn Hộp thư
Tìm trong cuộc trò chuyện, tạm ẩn, "Mở trong …", các nút thao tác trên một thư (tạo task, nhắc tôi, lịch hẹn, ghi chú), đính kèm tệp, "Gửi lúc…", "Tắt thông báo…", "Hiện trong Tổng quan", "Thêm thao tác" (tablet), "Tìm kiếm", "Bộ lọc" và "Thông tin cuộc trò chuyện" (mobile), "Trạng thái hệ thống" (khi không tải được) và "Trả lời trong …" (khi hết quyền gửi) MUST hiện như canvas và MUST NOT đổi dữ liệu.

#### Scenario: Bấm Tạm ẩn
- **WHEN** người dùng bấm "Tạm ẩn" ở một cuộc trò chuyện
- **THEN** cuộc trò chuyện vẫn nằm trong danh sách

### Requirement: Danh sách trên API Hộp thư (F05)
Danh sách MUST lấy từ `GET /api/conversations` với `view` và `provider` theo bộ lọc của địa chỉ, từng trang (`nextCursor`); số đếm, tài khoản và nhà cung cấp lấy từ `GET /api/conversations/counts`, `GET /api/accounts`, `GET /api/providers`. Cuối danh sách MUST có "Tải thêm" khi còn trang sau; nút tự tải khi gần tới màn hình (cuộn vô tận) và vẫn bấm được bằng bàn phím. Trang sau không tải được MUST giữ các dòng đã có và hiện "Không tải thêm được." với "Thử lại". Đổi bộ lọc MUST giữ các nút lọc và các dòng đã tải còn khớp trong lúc trang đầu của bộ lọc mới đang về; không còn dòng nào khớp thì hiện khung xương "Đang tải danh sách", không hiện "Không có cuộc trò chuyện nào". "Đồng bộ lần đầu" chỉ hiện khi cả hộp thư (mọi nguồn, "Tất cả") trống.

#### Scenario: Lật trang
- **WHEN** máy chủ trả trang đầu kèm `nextCursor` và người dùng tới cuối danh sách
- **THEN** web hỏi trang sau với `cursor` đó, các dòng mới nối vào cuối, và "Tải thêm" mất khi hết trang

#### Scenario: Đổi bộ lọc
- **WHEN** người dùng chọn "Chưa đọc" của nguồn Gmail
- **THEN** web hỏi `GET /api/conversations?view=unread&provider=gmail` và địa chỉ thành `?source=gmail&view=unread`

### Requirement: Lưu trữ và đánh dấu chưa đọc
"Lưu trữ" ("Bỏ lưu trữ" khi đã lưu trữ) và "Đánh dấu chưa đọc" của cuộc trò chuyện đang mở MUST gửi `PATCH /api/conversations/{id}` (`archived`, `read: false`), đổi dòng và số đếm ngay, rồi MUST đưa người dùng về danh sách với bộ lọc đang dùng (D-73). Danh sách đang hiện MUST NOT tải lại; các danh sách khác tải lại khi được hiện. Mở lại cuộc trò chuyện vừa đánh dấu chưa đọc MUST đọc nó lại.

#### Scenario: Lưu trữ một thư
- **WHEN** người dùng mở "Ngân hàng ACB" rồi bấm "Lưu trữ"
- **THEN** web về `/inbox`, "Ngân hàng ACB" không còn trong danh sách, và có trong "Đã lưu trữ" với nút "Bỏ lưu trữ"

#### Scenario: Đánh dấu chưa đọc
- **WHEN** người dùng mở một thư rồi bấm "Đánh dấu chưa đọc"
- **THEN** web về danh sách, thư hiện chấm chưa đọc, số "N chưa đọc" tăng một, và thư không bị đọc lại cho tới khi được mở lần nữa

### Requirement: Cuộc trò chuyện trước khi có lịch sử tin (F06)
Khi API chưa trả tin (`messages = null`, D-71), cuộc trò chuyện đang mở MUST hiện đầu trang như thường (tiêu đề, nguồn, tài khoản; không có số thư) và thay cho các tin một thẻ "Thư mới nhất" ("Tin mới nhất" với chat) gồm người gửi trong nhóm (nếu có), giờ, đoạn đầu của tin mới nhất (không có chữ thì "Thư mới nhất không có chữ."), và câu "Sino mới hiện đoạn đầu của thư mới nhất. Đọc cả cuộc trò chuyện ngay trong Sino sẽ có ở bản sau." Một cuộc trò chuyện không có trong trang đã tải (đường dẫn, tải lại) MUST mở được qua `GET /api/conversations/{id}`; `404` thì "Không tìm thấy cuộc trò chuyện này."; lỗi khác thì "Không mở được cuộc trò chuyện này." với "Thử lại".

#### Scenario: Mở thư của Trần Minh Anh
- **WHEN** người dùng mở thư "Hợp đồng quý 4" mà API chưa trả tin
- **THEN** cột phải có tiêu đề "Hợp đồng quý 4", thẻ "Thư mới nhất · 13:41 hôm nay" với đoạn đầu thư, và thông báo "Sino chưa gửi được thư" thay cho ô trả lời
