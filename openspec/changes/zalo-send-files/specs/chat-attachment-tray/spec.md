## ADDED Requirements

### Requirement: Đưa ảnh và tệp vào khay
Khung soạn tin của một chat MUST có khay ảnh và tệp khi chi tiết cuộc trò chuyện có `canSendFiles`, và MUST không có ở thư hay ở chat không gửi được tệp. Ảnh và tệp MUST vào khay khi người dùng dán (Ctrl+V) vào ô soạn tin, chọn bằng nút kẹp giấy (được chọn nhiều tệp), hay thả tệp vào khung chat; dán chữ MUST giữ như cũ. Mỗi ảnh MUST có hình xem trước, mỗi tệp MUST có tên và cỡ, và mỗi mục MUST có nút bỏ. Khay MUST giữ tối đa 10 mục; ảnh quá 10 MB, tệp quá 25 MB và tệp rỗng MUST không vào khay mà được báo ngay bằng tên tệp và lý do.

#### Scenario: Dán một ảnh chụp màn hình
- **WHEN** người dùng chụp màn hình rồi bấm Ctrl+V trong ô soạn tin của một chat Zalo
- **THEN** khay có một ảnh với hình xem trước và nút bỏ, và ô chữ không đổi

#### Scenario: Tệp quá lớn
- **WHEN** người dùng chọn một tệp 30 MB bằng nút kẹp giấy
- **THEN** khay không thêm tệp đó và khung soạn tin báo tên tệp kèm giới hạn 25 MB

#### Scenario: Thư không có khay
- **WHEN** người dùng mở một cuộc trò chuyện Gmail và dán một ảnh
- **THEN** không có khay nào hiện ra

### Requirement: Gửi cả khay
Enter (khi không gõ dở bằng bộ gõ) hay nút "Gửi" MUST gửi khi khay có mục, kể cả khi ô chữ trống. Mỗi mục MUST thành một tin, gửi theo thứ tự trong khay, rồi tới chữ đang gõ nếu có, lần lượt từng tin một cách nhau ít nhất 1,1 giây. Khay và ô chữ MUST trống ngay sau khi bấm gửi. Mỗi tin MUST hiện ngay ở cuối cuộc trò chuyện ở trạng thái đang gửi: ảnh bằng hình xem trước, tệp bằng tên và cỡ.

#### Scenario: Hai ảnh và một câu
- **WHEN** khay có ảnh `a.png` rồi `b.jpg`, ô chữ có "xem nhé", và người dùng bấm Enter
- **THEN** ba yêu cầu gửi đi theo thứ tự `a.png`, `b.jpg`, "xem nhé", cách nhau ít nhất 1,1 giây, và ba tin hiện ngay theo đúng thứ tự đó

### Requirement: Lỗi, gửi lại và bỏ
Tin ảnh hay tệp gửi lỗi MUST có "Gửi lại" (gửi lại đúng tệp với cùng `clientMessageId`) và "Bỏ", như tin chữ. Khi trang không còn giữ tệp (đã tải lại trang), tin lỗi MUST chỉ còn "Bỏ" và câu "Chọn lại tệp để gửi". Kết quả chưa rõ MUST được nói như tin chữ.

#### Scenario: Gửi lại một tệp lỗi
- **WHEN** máy chủ trả lỗi cho lần gửi `bao-cao.pdf` và người dùng bấm "Gửi lại"
- **THEN** web gửi lại đúng tệp đó với cùng `clientMessageId`

#### Scenario: Sau khi tải lại trang
- **WHEN** người dùng tải lại trang và mở cuộc trò chuyện có tin `bao-cao.pdf` gửi lỗi
- **THEN** tin đó có "Bỏ" và câu "Chọn lại tệp để gửi", không có "Gửi lại"
