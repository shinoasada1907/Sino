## ADDED Requirements

### Requirement: Xem trước trong cột Chi tiết hội thoại
Ở chat trong Tin nhắn, cột "Chi tiết hội thoại" MUST hiện các khối Ảnh & video, Tệp tài liệu, Liên kết, Âm thanh từ `GET /api/conversations/{id}/media`, mỗi khối có tổng số. Khối không có mục MUST ẩn; không có mục nào thì MUST hiện một dòng trống chung. Trong lúc tải và khi lỗi MUST có trạng thái riêng, không được hiện như đang trống.

#### Scenario: Có ảnh và tệp
- **WHEN** chat có 12 ảnh, 3 tệp, không có link và âm thanh
- **THEN** cột hiện 4 ảnh và tổng 12, 3 hàng tệp; khối Liên kết và Âm thanh ẩn

#### Scenario: Lỗi tải
- **WHEN** API trả lỗi
- **THEN** cột hiện lỗi kèm nút thử lại, không hiện dòng "chưa có tệp"

### Requirement: Xem tất cả
"Xem tất cả" MUST mở danh sách đủ bốn tab Ảnh/Video, File, Link, Âm thanh, mở đúng tab của khối vừa bấm, và tải tiếp theo trang khi cuộn tới cuối.

#### Scenario: Mở tab File
- **WHEN** người dùng bấm "Xem tất cả" ở khối Tệp tài liệu
- **THEN** danh sách mở ở tab File, có các tệp mới nhất trước

### Requirement: Dùng được trên điện thoại
Dưới cỡ `xl`, nút "Thông tin cuộc trò chuyện" ở đầu trang chat MUST mở kho ở một trang con có nút quay lại về đúng cuộc trò chuyện.

#### Scenario: Điện thoại
- **WHEN** ở màn 390 người dùng bấm "Thông tin cuộc trò chuyện"
- **THEN** trang con kho mở ra, quay lại thì về đúng chat đang xem

### Requirement: Mở từng loại
Ảnh MUST mở xem lớn như ảnh trong khung chat. Tệp MUST tải qua API tệp hiện có khi không vượt 25 MiB, và mở địa chỉ của Zalo ở tab mới khi vượt. Video và âm thanh MUST phát ngay trong trang, chỉ tải khi người dùng bấm phát. Link MUST mở ở tab mới với `rel="noopener noreferrer"`, và MUST chỉ thành link bấm được khi scheme là `http` hoặc `https`.

#### Scenario: Tệp lớn
- **WHEN** một tệp 60 MiB được bấm tải
- **THEN** địa chỉ của Zalo mở ở tab mới, không gọi API tệp của Sino

#### Scenario: Link có scheme lạ
- **WHEN** một mục link có địa chỉ không phải `http` hay `https`
- **THEN** mục hiện thành chữ thường, không bấm được

### Requirement: Địa chỉ không còn mở được
Ảnh, video hay âm thanh không tải được MUST hiện "Không còn trên Zalo" tại đúng chỗ của nó, các mục khác MUST vẫn dùng được, và trang MUST NOT tải lại địa chỉ đó liên tục.

#### Scenario: Ảnh 404
- **WHEN** một ảnh trong lưới trả `404`
- **THEN** ô đó hiện "Không còn trên Zalo", các ảnh còn lại vẫn hiện

### Requirement: Khung chat phát được và vẽ thẻ link
Trong khung chat, tin thoại có tệp đính kèm MUST có trình phát và độ dài khi biết; tin video MUST có ảnh xem trước và trình phát; tin thẻ link MUST vẽ thành thẻ có tiêu đề, mô tả, host và ảnh xem trước khi có. Tin không có địa chỉ MUST hiện chữ giữ chỗ như trước.

#### Scenario: Tin thoại
- **WHEN** chat có một tin thoại có địa chỉ
- **THEN** bong bóng tin có trình phát thay cho chữ `[Tin nhắn thoại]`

#### Scenario: Tin thoại cũ
- **WHEN** chat có một tin thoại đã lưu trước change này
- **THEN** bong bóng vẫn hiện chữ `[Tin nhắn thoại]`
