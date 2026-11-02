## MODIFIED Requirements

### Requirement: Danh sách hợp nhất
Trang `/inbox` MUST hiện mọi cuộc trò chuyện chưa lưu trữ và không đang tạm ẩn của các tài khoản có provider loại `EMAIL`, mới nhất trước, nhóm theo "HÔM NAY", "HÔM QUA", "TUẦN NÀY", "TRƯỚC ĐÓ". Cuộc trò chuyện của provider loại `CHAT` nằm ở màn Tin nhắn (`messages-screen`), MUST NOT có ở `/inbox`. Mỗi dòng MUST có dấu nguồn, tiêu đề (người kia hoặc tên nhóm), nhãn tài khoản theo *Dòng ghi tài khoản*, tiêu đề thư nếu là email, xem trước tin cuối (nhóm: "Tên: nội dung"), giờ, và khi có: số tin chưa đọc (chat) hoặc chấm chưa đọc (email), dấu tệp đính kèm, một dòng dấu (việc liên quan, hiện lại theo hẹn, hẹn gửi, thư hẹn giờ không gửi được). Từ 1280px trang MUST có cột trái gồm cột tài khoản (`account-filter-ui`) chỉ với tài khoản loại `EMAIL`, rồi nhóm "Lọc nhanh" với số của từng bộ lọc theo tài khoản đang chọn.

#### Scenario: Chỉ có email
- **WHEN** chủ có một thread Gmail "Trần Minh Anh" và nhóm Zalo "Gia đình", và người dùng mở `/inbox`
- **THEN** danh sách có "Trần Minh Anh" và không có "Gia đình", cột tài khoản không có tài khoản Zalo

### Requirement: Dòng ghi tài khoản khi một nguồn có nhiều tài khoản
Ở Tin nhắn và Hộp thư, ở mọi cỡ màn, mỗi dòng MUST có một dòng nhãn riêng dưới tiêu đề (D-430): tên tài khoản (Zalo) hoặc địa chỉ (Gmail) nhận cuộc trò chuyện, rồi với nhóm thêm "· nhóm N người" (`Nguyễn Thành Tiến · nhóm 7 người`). Phần tài khoản MUST bị bỏ khi đang lọc một tài khoản hoặc khi màn chỉ có một tài khoản; khi đó nhóm chỉ ghi "nhóm N người" và chat 1-1 hay thread không có dòng nhãn. Một thread có bản sao ở nhiều tài khoản (f05b) MUST ghi mọi địa chỉ ở "Tất cả" và chỉ hiện ở mỗi tài khoản giữ nó khi lọc. Tên nhà cung cấp MUST NOT ghi bằng chữ trên dòng (ô biểu tượng nhà cung cấp đã nói điều đó). Tiêu đề dài và nhãn dài MUST cùng cắt bằng "…" trong dòng của chúng, không đè lên giờ.

#### Scenario: Hai tài khoản Zalo ở Tất cả
- **WHEN** chủ có hai tài khoản Zalo "Tiến Nguyễn" và "Nguyễn Thành Tiến", nhóm "Dev Rice T-shirt" 5 người thuộc "Tiến Nguyễn", và người dùng mở `/messages`
- **THEN** dòng "Dev Rice T-shirt" có nhãn "Tiến Nguyễn · nhóm 5 người" và không có chữ "Zalo"

#### Scenario: Đang lọc một tài khoản
- **WHEN** người dùng ở `/messages?account=<id của Tiến Nguyễn>`
- **THEN** dòng "Dev Rice T-shirt" có nhãn "nhóm 5 người", và chat 1-1 "Con Chồn" không có dòng nhãn

#### Scenario: Chỉ một tài khoản Gmail
- **WHEN** chủ chỉ có một tài khoản Gmail và mở `/inbox`
- **THEN** dòng thư không có dòng nhãn tài khoản

### Requirement: Lọc hộp thư
Người dùng MUST lọc được theo tài khoản (cột tài khoản, `account-filter-ui`) và theo bộ lọc nhanh (Chưa đọc, Cần trả lời, Có tệp, Đã hẹn giờ, Đang tạm ẩn, Đã lưu trữ); lựa chọn MUST nằm trong URL (`account`, `view`) và mục đang chọn MUST có `aria-current="page"` (cột trái) hoặc `aria-pressed="true"` (nút). `account` không phải tài khoản loại `EMAIL` của chủ MUST quay về "Tất cả"; tham số cũ `source` MUST bị bỏ qua. Khi không còn cuộc trò chuyện nào khớp, danh sách MUST báo "Không có cuộc trò chuyện nào".

#### Scenario: Một tài khoản Gmail, chưa đọc
- **WHEN** người dùng chọn tài khoản `an@congty.vn` rồi "Chưa đọc"
- **THEN** đường dẫn là `/inbox?account=<id của an@congty.vn>&view=unread` và danh sách chỉ còn các thread chưa đọc của tài khoản đó

#### Scenario: Tài khoản chat trong địa chỉ Hộp thư
- **WHEN** người dùng mở `/inbox?account=<id của một tài khoản Zalo>`
- **THEN** cột tài khoản chọn "Tất cả" và danh sách là mọi thread email
