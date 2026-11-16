## MODIFIED Requirements

### Requirement: Màn Tin nhắn
Trang `/messages` MUST hiện các cuộc trò chuyện chưa lưu trữ và không đang tạm ẩn của các tài khoản có provider loại `CHAT`, mới nhất trước, nhóm theo ngày như Hộp thư (`inbox-screen`), với nhãn dòng theo *Dòng ghi tài khoản* (`inbox-screen`). Danh sách MUST lấy từ `GET /api/conversations?kind=chat` với `view`, `accountId` và `chatType` theo bộ lọc của địa chỉ; số đếm từ `GET /api/conversations/counts?kind=chat`. Cột trái từ 1280px MUST là cột tài khoản (`account-filter-ui`) chỉ gồm tài khoản loại `CHAT`, và MUST NOT có nhóm "Lọc nhanh". Đầu danh sách MUST có ba tab "Tất cả", "Chưa đọc", "Cần trả lời" (tab đang chọn có `aria-pressed="true"`, hai tab sau có số) và một nút "Thêm" mở menu "Có tệp", "Đã hẹn giờ", "Đang tạm ẩn", "Đã lưu trữ" (D-436); khi một mục của menu đang chọn, nút "Thêm" MUST ghi tên mục đó và có `aria-pressed="true"`. Bộ lọc MUST nằm trong địa chỉ (`account`, `view`, `chat`). Màn Tin nhắn MUST NOT có nút "Thư mới".

#### Scenario: Chỉ có chat
- **WHEN** chủ có một thread Gmail "Trần Minh Anh" và nhóm Zalo "Gia đình", và người dùng mở `/messages`
- **THEN** web hỏi `GET /api/conversations?kind=chat`, danh sách có "Gia đình" và không có "Trần Minh Anh"

#### Scenario: Có tệp nằm trong menu Thêm
- **WHEN** người dùng ở `/messages`, bấm "Thêm" rồi "Có tệp"
- **THEN** đường dẫn có `view=attachments`, nút "Thêm" ghi "Có tệp" và có `aria-pressed="true"`, ba tab không tab nào có `aria-pressed="true"`

#### Scenario: Không có Thư mới
- **WHEN** người dùng ở `/messages` ở bất kỳ cỡ màn nào
- **THEN** trang không có nút hay liên kết "Thư mới"

### Requirement: Hội thoại chat ở Tin nhắn
Mở một hội thoại chat (`/messages/:id`) MUST hiện tin theo ngày, tin hệ thống, vạch "N tin chưa đọc" trước tin chưa đọc đầu tiên, bong bóng tin đến (tên người gửi trong nhóm) và tin của mình (bên phải, trạng thái "Đã xem", "Đang gửi"), ảnh và việc gắn với tin, ô nhắn tin. Từ 1280px danh sách MUST vẫn hiện cạnh khung chat (D-437): cột tài khoản thu thành dải 64px (mỗi tài khoản một ô chữ cái đầu tên kèm số chưa đọc, tên đầy đủ trong `title` và tên đọc được; ô "Tất cả" đầu dải), rồi danh sách 320px, rồi khung chat; bấm một dòng khác MUST mở chat đó tại chỗ, giữ bộ lọc. Cột thông tin (việc và ghi chú, thành viên, ảnh và tệp, tài khoản dùng) MUST chỉ mở khi bấm nút "Thông tin" ở đầu khung chat, nằm đè mép phải khung chat, và đóng bằng nút đóng hay phím Esc. Từ 768 đến 1279px danh sách và khung chat MUST cùng hiện. Dưới 768px hội thoại là trang riêng có nút "Quay lại Tin nhắn" giữ bộ lọc đang chọn.

#### Scenario: Mở Gia đình trên desktop
- **WHEN** người dùng ở `/messages?chat=group` trên màn 1440px và mở "Gia đình"
- **THEN** đường dẫn là `/messages/<id của Gia đình>?chat=group`, danh sách vẫn hiện bên trái khung chat, cột tài khoản là dải 64px, và khung chat có tiêu đề "Gia đình" và vạch "3 tin chưa đọc"

#### Scenario: Cột thông tin mở đè
- **WHEN** người dùng đang mở "Gia đình" trên màn 1440px và bấm "Thông tin"
- **THEN** cột thông tin hiện đè mép phải khung chat với mục "Thành viên"; bấm Esc thì cột đóng, khung chat vẫn mở

#### Scenario: Quay lại trên điện thoại
- **WHEN** người dùng ở `/messages/<id>?account=<A>&chat=direct` trên màn 390px và bấm "Quay lại Tin nhắn"
- **THEN** web mở `/messages?account=<A>&chat=direct`

## ADDED Requirements

### Requirement: Lọc chat cá nhân và nhóm
Màn Tin nhắn MUST có một hàng chip ngay dưới các tab, ở mọi cỡ màn: "Mọi chat", "Cá nhân", "Nhóm" (D-435), không có số. "Cá nhân" MUST đặt `chat=direct` vào địa chỉ và hỏi danh sách với `chatType=direct`; "Nhóm" đặt `chat=group` và hỏi với `chatType=group`; "Mọi chat" bỏ `chat` khỏi địa chỉ và không gửi `chatType`. Chip đang chọn MUST có `aria-pressed="true"`. `chat` có giá trị khác MUST được coi là "Mọi chat". Chip MUST ghép được với tài khoản và tab đang chọn.

#### Scenario: Nhóm chưa đọc của một tài khoản
- **WHEN** người dùng ở `/messages?account=<A>`, chọn tab "Chưa đọc" rồi chip "Nhóm"
- **THEN** đường dẫn có `account=<A>`, `view=unread` và `chat=group`, và web hỏi `GET /api/conversations?kind=chat&view=unread&accountId=<A>&chatType=group`

#### Scenario: Giá trị lạ
- **WHEN** người dùng mở `/messages?chat=channel`
- **THEN** chip "Mọi chat" có `aria-pressed="true"` và danh sách được hỏi không có `chatType`
