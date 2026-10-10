## ADDED Requirements

### Requirement: Web đọc cả cuộc trò chuyện
Khi mở một cuộc trò chuyện email, web MUST hiện các thư từ `GET /api/conversations/{id}/messages`: cũ ở trên, mới ở dưới; thư mới nhất mở sẵn, thư cũ hơn gập lại thành một dòng và mở được bằng một lần bấm (canvas `Inbox`). Còn trang cũ hơn thì đầu cuộc trò chuyện MUST có nút "Xem thư cũ hơn". Khi đã có thư, web MUST NOT hiện khung xem trước "Thư mới nhất" (D-71). Danh sách thư MUST được đọc lại khi luồng realtime báo cuộc trò chuyện thay đổi, nên thư mới đến trong lúc đang đọc hiện ở cuối mà không cần tải lại trang.

#### Scenario: Ba thư
- **WHEN** người dùng mở cuộc trò chuyện có ba thư
- **THEN** hai thư đầu gập lại, thư thứ ba mở sẵn với đủ nội dung

#### Scenario: Thư cũ hơn
- **WHEN** trang đầu có `nextCursor` và người dùng bấm "Xem thư cũ hơn"
- **THEN** các thư của trang sau hiện ở trên, đã gập

#### Scenario: Thư mới trong lúc đọc
- **WHEN** cuộc trò chuyện đang mở và luồng nhận `conversations.changed`
- **THEN** danh sách thư được đọc lại và thư mới hiện ở cuối, mở sẵn

#### Scenario: Không tải được danh sách thư
- **WHEN** `…/messages` trả lỗi
- **THEN** web hiện khung "Thư mới nhất" như trước, kèm dòng báo lỗi và nút "Thử lại"

### Requirement: Thư HTML trong khung cô lập
Thư có `bodyFormat` khác `TEXT` MUST được hiện bằng nội dung của `…/body`. HTML MUST nằm trong `iframe` có `sandbox` gồm đúng `allow-same-origin allow-popups allow-popups-to-escape-sandbox` (không có `allow-scripts`, không có `allow-forms`). `srcdoc` MUST có CSP `default-src 'none'`, chỉ cho `style-src 'unsafe-inline'`, `img-src data:` cùng origin của Sino, và `font-src data:`. Liên kết MUST mở ở tab mới. Khung MUST cao bằng nội dung, không có thanh cuộn dọc riêng. HTML MUST hiện trên nền trắng ở cả hai theme. Web MUST NOT đặt HTML của thư vào DOM của trang (`innerHTML`, `dangerouslySetInnerHTML`). Trong lúc chờ nội dung, phần chữ MUST hiện sẵn; `…/body` lỗi thì phần chữ ở lại, kèm "Không tải được bản đầy đủ của thư này. Đang hiện phần chữ." và nút "Thử lại".

#### Scenario: Bản tin HTML
- **WHEN** người dùng mở một thư `HTML`
- **THEN** thư hiện trong iframe sandbox không có `allow-scripts`, CSP trong `srcdoc` có `default-src 'none'`

#### Scenario: Lấy bù lỗi
- **WHEN** `…/body` trả `502 MESSAGE_CONTENT_UNAVAILABLE`
- **THEN** phần chữ của thư hiện kèm dòng báo và nút "Thử lại"

### Requirement: Ảnh từ xa chỉ tải khi người dùng cho phép
Khi `remoteImages` = `true`, web MUST hiện "Ảnh trong thư đang ẩn để người gửi không biết bạn đã mở thư." kèm nút "Hiện ảnh". Bấm "Hiện ảnh" MUST dựng lại khung với `img-src` có thêm `https:` và `http:` cho thư đó, và dòng báo biến mất. Lựa chọn MUST NOT được nhớ cho thư khác hay lần mở sau.

#### Scenario: Hiện ảnh một thư
- **WHEN** thư có `remoteImages` = `true` và người dùng bấm "Hiện ảnh"
- **THEN** CSP của khung cho ảnh `https:` và dòng báo biến mất; thư khác vẫn chặn ảnh

### Requirement: Thư chữ có liên kết bấm được
Thư `TEXT` (và phần chữ khi chưa có HTML) MUST hiện theo đoạn như trước; mỗi URL `http://` hoặc `https://` MUST thành liên kết mở tab mới với `rel="noopener noreferrer"`. Dấu câu đứng cuối URL (`.`, `,`, `;`, `:`, `!`, `?`, `)`) MUST NOT thuộc liên kết. Chữ khác MUST NOT thành liên kết.

#### Scenario: URL cuối câu
- **WHEN** chữ là "Xem tại https://example.com/a."
- **THEN** liên kết là `https://example.com/a`, dấu chấm là chữ thường

### Requirement: Tải tệp đính kèm
Mỗi tệp của thư MUST là liên kết tải xuống tới `…/attachments/{attachmentId}`, hiện tên, kiểu và dung lượng như canvas.

#### Scenario: Bấm tệp
- **WHEN** người dùng bấm tệp `bao-gia.pdf`
- **THEN** trình duyệt tải tệp từ đường dẫn tệp của Sino
