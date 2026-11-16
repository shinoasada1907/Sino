## ADDED Requirements

### Requirement: Màn Tin nhắn
Trang `/messages` MUST hiện các cuộc trò chuyện chưa lưu trữ và không đang tạm ẩn của các tài khoản có provider loại `CHAT`, mới nhất trước, với cùng bố cục, cách nhóm theo ngày và nội dung dòng như Hộp thư (`inbox-screen`). Danh sách MUST lấy từ `GET /api/conversations?kind=chat` với `view` và `provider` theo bộ lọc của địa chỉ; số đếm từ `GET /api/conversations/counts?kind=chat`. Từ 1280px cột "Nguồn và bộ lọc" MUST chỉ liệt kê provider loại `CHAT` và tài khoản của chúng. Bộ lọc MUST nằm trong địa chỉ (`source`, `view`); `source` là provider loại `EMAIL` hay giá trị lạ MUST quay về "Tất cả". Màn Tin nhắn MUST NOT có nút "Thư mới".

#### Scenario: Chỉ có chat
- **WHEN** chủ có một thread Gmail "Trần Minh Anh" và nhóm Zalo "Gia đình", và người dùng mở `/messages`
- **THEN** web hỏi `GET /api/conversations?kind=chat`, danh sách có "Gia đình" và không có "Trần Minh Anh"

#### Scenario: Nguồn của loại kia trong địa chỉ
- **WHEN** người dùng mở `/messages?source=gmail&view=unread`
- **THEN** bộ lọc nguồn là "Tất cả", bộ lọc nhanh vẫn là "Chưa đọc" và cột nguồn không có Gmail

#### Scenario: Không có Thư mới
- **WHEN** người dùng ở `/messages` ở bất kỳ cỡ màn nào
- **THEN** trang không có nút hay liên kết "Thư mới"

### Requirement: Hội thoại chat ở Tin nhắn
Mở một hội thoại chat (`/messages/:id`) MUST hiện tin theo ngày, tin hệ thống, vạch "N tin chưa đọc" trước tin chưa đọc đầu tiên, bong bóng tin đến (tên người gửi trong nhóm) và tin của mình (bên phải, trạng thái "Đã xem", "Đang gửi"), ảnh và việc gắn với tin, ô nhắn tin. Từ 1280px hội thoại là trang riêng có liên kết "Tin nhắn" và cột thông tin: việc và ghi chú, thành viên, ảnh và tệp, tài khoản dùng. Dưới 768px trang có nút "Quay lại Tin nhắn" giữ bộ lọc đang chọn.

#### Scenario: Mở Gia đình
- **WHEN** người dùng mở "Gia đình" từ `/messages`
- **THEN** đường dẫn là `/messages/<id của Gia đình>`, trang có tiêu đề "Gia đình", vạch "3 tin chưa đọc", và liên kết đầu trang là "Tin nhắn"

#### Scenario: Quay lại trên điện thoại
- **WHEN** người dùng ở `/messages/<id>?source=zalo` trên màn 390px và bấm "Quay lại Tin nhắn"
- **THEN** web mở `/messages?source=zalo`

### Requirement: Hai màn dùng chung hành vi của một cuộc trò chuyện
Các hành vi đã định cho danh sách và cuộc trò chuyện của Hộp thư MUST áp như nhau cho Tin nhắn, trong phạm vi loại của màn: đánh dấu đã đọc, lưu trữ và đánh dấu chưa đọc, lịch sử tin và tải trang cũ hơn, trả lời và trạng thái gửi, tải tệp, chuỗi gộp nhiều tài khoản, đọc lại khi có sự kiện, trạng thái đang tải, không tải được, ngoại tuyến, và các nút chưa có chức năng (`inbox-screen`, `inbox-thread`, `inbox-reply`, `inbox-live`, `inbox-merged-threads`).

#### Scenario: Đánh dấu đã đọc ở Tin nhắn
- **WHEN** người dùng mở một cuộc chat có tin chưa đọc ở `/messages/<id>`
- **THEN** web gửi `PATCH /api/conversations/<id>` với `{ "read": true }` và số "Tin nhắn" trên điều hướng giảm

### Requirement: Trạng thái trống của Tin nhắn
Khi chủ chưa có tài khoản nào của provider loại `CHAT`, `/messages` MUST hiện "Tin nhắn đang trống." kèm một dòng "Kết nối" cho mỗi provider loại `CHAT` của danh mục (`GET /api/providers`), mỗi dòng mở hộp thoại kết nối; khi danh mục chưa có provider `CHAT` nào, trang MUST hiện một nút "Kết nối tài khoản" mở `/accounts?connect=new`. "Đồng bộ lần đầu" của Tin nhắn MUST chỉ tính tài khoản của provider `CHAT`.

#### Scenario: Chỉ có Gmail
- **WHEN** chủ chỉ có một tài khoản Gmail và danh mục chỉ có Gmail
- **THEN** `/messages` hiện "Tin nhắn đang trống." và nút "Kết nối tài khoản" dẫn tới `/accounts?connect=new`

#### Scenario: Danh mục có provider chat
- **WHEN** chủ chưa có tài khoản chat và danh mục có Zalo loại `CHAT`
- **THEN** `/messages` hiện "Tin nhắn đang trống." và dòng "Kết nối Zalo"

### Requirement: Chuyển tới màn đúng loại
Khi người dùng mở một cuộc trò chuyện ở màn không đúng loại của nó (`/inbox/:id` cho cuộc trò chuyện `CHAT`, `/messages/:id` cho cuộc trò chuyện `EMAIL`), web MUST thay đường dẫn bằng màn đúng loại với cùng `id`, không thêm mục lịch sử, và bỏ bộ lọc của màn cũ. Loại MUST lấy từ `kind` của dòng (dòng đã tải hoặc `GET /api/conversations/{id}`), và web MUST chuyển trước khi dựng trang mở cuộc trò chuyện.

#### Scenario: Link cũ tới một cuộc chat
- **WHEN** từ chi tiết một việc, người dùng mở `/inbox/<id>` của nhóm Zalo "Gia đình"
- **THEN** đường dẫn thành `/messages/<id>`, trang hiện hội thoại "Gia đình", và bấm Back trên trình duyệt quay về chi tiết việc

#### Scenario: Thread email mở ở Tin nhắn
- **WHEN** người dùng mở `/messages/<id>?view=unread` của một thread Gmail
- **THEN** đường dẫn thành `/inbox/<id>` và trang hiện thread đó
