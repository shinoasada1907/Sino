## ADDED Requirements

### Requirement: Nút sticker trong khung soạn tin
Khung soạn tin của một chat MUST có nút "Sticker" khi tài khoản của cuộc trò chuyện gửi được ảnh (`SEND_IMAGES`), và MUST không có nút này ở thư hay ở chat không gửi được ảnh. Bấm nút MUST mở khung chọn sticker: một khung nổi từ 768 px, một tấm kéo lên từ cạnh dưới dưới 768 px.

#### Scenario: Chat Zalo
- **WHEN** người dùng mở một chat Zalo của tài khoản gửi được ảnh
- **THEN** khung soạn tin có nút "Sticker"

#### Scenario: Thư Gmail
- **WHEN** người dùng mở một cuộc trò chuyện Gmail
- **THEN** khung soạn tin không có nút "Sticker"

### Requirement: Khung chọn chia theo bộ
Khung chọn MUST có một tab cho mỗi bộ có sticker (theo thứ tự bộ của thư viện) và một tab "Chưa xếp bộ" khi có sticker chưa xếp bộ; mỗi tab là một lưới sticker của bộ đó, ảnh động tự chạy. Thư viện trống MUST nói rõ và có liên kết tới màn Sticker. Lỗi tải thư viện MUST nói lỗi và cho thử lại.

#### Scenario: Hai bộ
- **WHEN** thư viện có bộ `Mèo` (2 sticker), bộ `Chó` (1 sticker) và 1 sticker chưa xếp bộ
- **THEN** khung chọn có ba tab `Mèo`, `Chó`, "Chưa xếp bộ", và tab `Mèo` có hai sticker

#### Scenario: Thư viện trống
- **WHEN** thư viện chưa có sticker
- **THEN** khung chọn nói chưa có sticker và có liên kết "Mở thư viện sticker"

### Requirement: Bấm là gửi, tin hiện ngay
Bấm một sticker MUST gửi nó ngay (`POST /api/conversations/{id}/messages` với `stickerId` và một `clientMessageId` mới) và đóng khung chọn. Tin MUST hiện ngay trong cuộc trò chuyện bằng ảnh của thư viện, ở trạng thái đang gửi; gửi được thì là đã gửi; lỗi thì có "Gửi lại" (cùng `clientMessageId`) và "Bỏ"; kết quả chưa rõ thì nói như tin chữ. Nhiều sticker bấm liên tiếp MUST được gửi lần lượt theo thứ tự bấm.

#### Scenario: Gửi một sticker
- **WHEN** người dùng bấm sticker `meo` trong khung chọn
- **THEN** một yêu cầu gửi có `stickerId` của `meo` được gọi, khung chọn đóng, và tin `meo` hiện ở cuối cuộc trò chuyện

#### Scenario: Gửi lỗi
- **WHEN** máy chủ trả lỗi cho lần gửi sticker `meo`
- **THEN** tin `meo` có "Gửi lại" và "Bỏ"; "Gửi lại" gửi lại với cùng `clientMessageId`

### Requirement: Khung chọn dùng được bằng bàn phím
Nút "Sticker", các tab và từng sticker MUST dùng được bằng bàn phím và có tên truy cập (tên của sticker); phím mũi tên MUST đi giữa các sticker trong lưới, Enter MUST gửi, Esc MUST đóng và trả tiêu điểm về nút "Sticker".

#### Scenario: Gửi bằng bàn phím
- **WHEN** người dùng mở khung chọn bằng Enter, dùng mũi tên tới `nhay` rồi bấm Enter
- **THEN** sticker `nhay` được gửi và tiêu điểm về ô soạn tin
