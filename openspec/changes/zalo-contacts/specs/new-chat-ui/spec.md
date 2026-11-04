## ADDED Requirements

### Requirement: Nút "Nhắn tin mới" ở danh sách Tin nhắn
Danh sách Tin nhắn MUST có nút "Nhắn tin mới" ở cùng vị trí với "Thư mới" của Hộp thư khi có ít nhất một tài khoản có capability `CONTACTS`, và MUST NOT có nút đó khi không có tài khoản nào như vậy. Bấm nút MUST mở ô tìm danh bạ ở `messages/new` (desktop: hộp thoại; 390: cả trang).

#### Scenario: Có tài khoản Zalo
- **WHEN** người dùng có một tài khoản Zalo đang nối và mở màn Tin nhắn
- **THEN** thấy nút "Nhắn tin mới"; bấm vào thì ô tìm mở và ô nhập có focus

#### Scenario: Chỉ có Gmail
- **WHEN** người dùng chỉ có tài khoản Gmail
- **THEN** màn Tin nhắn không có nút "Nhắn tin mới"

### Requirement: Tìm và chọn người để nhắn
Ô tìm MUST gọi `GET /api/contacts` sau 250 ms kể từ lần gõ cuối, hiện mỗi kết quả với ảnh, `nickname ?? name`, nhãn "Bạn bè" hay "Nhóm · N thành viên", dấu "Đã có cuộc trò chuyện", và MUST có "Làm mới danh bạ" kèm "Cập nhật lúc HH:mm". Chọn một kết quả có `conversationId` MUST mở cuộc trò chuyện đó; không có MUST mở khung chat chưa có tin ở `messages/new/:accountId/:contactId`. Bàn phím: ↑ ↓ chọn, Enter mở, Esc đóng.

#### Scenario: Chọn người đã có cuộc trò chuyện
- **WHEN** người dùng gõ "dao" và chọn "Nguyễn Thị Đào" có dấu "Đã có cuộc trò chuyện"
- **THEN** web mở đúng cuộc trò chuyện đó

#### Scenario: Không tìm thấy
- **WHEN** không có ai khớp với chữ đã gõ
- **THEN** ô tìm báo không thấy và nói rõ người chưa kết bạn không có trong danh bạ

#### Scenario: Chưa có danh bạ
- **WHEN** tài khoản chưa đồng bộ danh bạ lần nào
- **THEN** ô tìm báo chưa có danh bạ và mời bấm "Làm mới danh bạ"

### Requirement: Khung chat chưa có tin
Khung chat chưa có tin MUST hiện đầu khung như chat thường (ảnh, tên, nhãn), dòng "Chưa có tin nhắn. Gửi tin đầu tiên." và ô soạn chỉ có chữ. Gửi MUST gọi `POST /api/conversations` dạng chat; thành công MUST thay đường dẫn bằng cuộc trò chuyện vừa có; lỗi gửi có `conversationId` MUST mở cuộc trò chuyện đó để dùng "Gửi lại" / "Bỏ"; lỗi khác MUST giữ chữ đã gõ và báo trong khung. Mở khung chat MUST NOT tạo cuộc trò chuyện nào.

#### Scenario: Gửi tin đầu tiên
- **WHEN** người dùng gõ "Chào chị" trong khung chat chưa có tin và bấm Gửi, server trả `201`
- **THEN** đường dẫn đổi sang `messages/:conversationId`, tin hiện trong cuộc trò chuyện, và cuộc trò chuyện có trong danh sách Tin nhắn

#### Scenario: Mở rồi đóng không gửi
- **WHEN** người dùng mở khung chat chưa có tin rồi quay về danh sách
- **THEN** danh sách Tin nhắn không có cuộc trò chuyện mới nào
