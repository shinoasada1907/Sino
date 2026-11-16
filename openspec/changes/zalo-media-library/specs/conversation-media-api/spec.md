## ADDED Requirements

### Requirement: Liệt kê phương tiện theo loại
`GET /api/conversations/{id}/media?kind=` MUST trả phương tiện đã lưu của cuộc trò chuyện theo một trong bốn loại: `MEDIA` (ảnh có địa chỉ, video có tệp đính kèm), `FILE` (tệp có dòng đính kèm), `LINK`, `AUDIO` (tin thoại có tệp đính kèm). Mỗi mục MUST cho biết tin nguồn, thời điểm và tên người gửi. Mục mới nhất MUST đứng trước.

#### Scenario: Ảnh và video
- **WHEN** gọi với `kind=MEDIA` trên một chat có hai ảnh và một video
- **THEN** phản hồi có ba mục, mới nhất trước, mỗi mục có `kind`, `url` và `thumbnailUrl` khi có

#### Scenario: Sticker không phải ảnh
- **WHEN** chat có một sticker Zalo và một ảnh Zalo vẽ như sticker
- **THEN** cả hai không xuất hiện trong `MEDIA`

#### Scenario: Tin giữ chỗ không vào kho
- **WHEN** chat có một tin `FILE` chỉ có chữ `[Tệp]`, không có tệp đính kèm
- **THEN** tin đó không xuất hiện trong `FILE` và không được tính vào `total`

### Requirement: Phân trang và tổng số
API MUST nhận `cursor` và `limit` (mặc định 30, tối đa 100), trả `nextCursor` và `total` của loại đang hỏi. `cursor` không do API phát, `limit` ngoài khoảng, hay `kind` lạ MUST trả `400`.

#### Scenario: Trang kế
- **WHEN** chat có 35 ảnh, gọi lần đầu với `limit=30` rồi gọi với `nextCursor`
- **THEN** lần đầu có 30 mục và `total` là 35; lần sau có 5 mục và `nextCursor` là `null`

#### Scenario: Loại không biết
- **WHEN** gọi với `kind=GIF`
- **THEN** API trả `400`

### Requirement: Chỉ chủ tài khoản xem được
API MUST chỉ trả phương tiện của cuộc trò chuyện thuộc người dùng đang đăng nhập, và MUST gồm mọi bản sao của một cuộc trò chuyện đã gộp.

#### Scenario: Cuộc trò chuyện của người khác
- **WHEN** gọi với ID cuộc trò chuyện của chủ tài khoản khác
- **THEN** API trả `404` như các API cuộc trò chuyện hiện có

### Requirement: Link trong kho
`LINK` MUST gồm cả link dạng thẻ và link `http`, `https` nằm trong chữ của tin `TEXT`. Một địa chỉ MUST chỉ xuất hiện một lần trong mỗi tin, và dấu câu dính ở cuối địa chỉ MUST bị bỏ. Địa chỉ dài quá 2048 ký tự hay không đọc được MUST bị bỏ qua.

#### Scenario: Hai link trong một tin
- **WHEN** một tin có chữ "xem https://a.vn và https://b.vn."
- **THEN** `LINK` có hai mục `https://a.vn` và `https://b.vn`

#### Scenario: Thẻ link
- **WHEN** một tin thẻ link có tiêu đề, mô tả và ảnh xem trước
- **THEN** mục của nó có đủ ba trường đó

### Requirement: Đọc từ tin đã lưu
API MUST NOT gọi nhà cung cấp, kể cả khi phiên Zalo đã mất, và MUST NOT kiểm tra địa chỉ có còn mở được hay không.

#### Scenario: Phiên Zalo đã mất
- **WHEN** tài khoản Zalo không có phiên sống
- **THEN** API vẫn trả các mục đã lưu
