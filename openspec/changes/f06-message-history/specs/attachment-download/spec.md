## ADDED Requirements

### Requirement: Tải tệp đính kèm qua Sino
`GET /api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}` MUST lấy nội dung tệp từ provider và trả bytes với `Content-Type` là kiểu đã lưu (không có thì `application/octet-stream`), `Content-Disposition: attachment` có tên tệp mã hóa theo RFC 6266 (`filename*=UTF-8''…`), `X-Content-Type-Options: nosniff` và `Content-Security-Policy: sandbox; default-src 'none'`. Không có kiểu đã lưu thì MUST dùng kiểu provider trả; kiểu không cụ thể (`image/*`, `*/*`) MUST thành `application/octet-stream`. Sino MUST NOT lưu nội dung tệp, và tệp tải xuống MUST NOT được trình duyệt giữ lại (`Cache-Control: no-store`). Tệp không thuộc thư đó MUST trả `404 ATTACHMENT_NOT_FOUND`; provider lỗi MUST trả `502 ATTACHMENT_UNAVAILABLE`. Tệp lớn hơn 25 MB (theo kích thước đã lưu) MUST trả `422 ATTACHMENT_TOO_LARGE` mà không gọi provider. Khi các tệp đang đọc từ provider đã chiếm hết phần dành cho tệp tải xuống (50 MB, tức hai tệp 25 MB; tệp không rõ kích thước tính như 25 MB), request mới MUST trả `503 ATTACHMENT_BUSY` ngay, không chờ, không gọi provider. Ảnh hiện trong thư (`inline=true`) MUST có phần riêng (25 MB), để tệp tải xuống không làm hỏng ảnh của thư đang mở.

#### Scenario: Tải một tệp PDF
- **WHEN** web mở đường dẫn của tệp `bao-gia.pdf`
- **THEN** response là bytes của tệp với `Content-Disposition: attachment` và tên `bao-gia.pdf`

#### Scenario: Tệp quá lớn
- **WHEN** web mở đường dẫn của một tệp 30 MB
- **THEN** response là `422 ATTACHMENT_TOO_LARGE` và provider không bị hỏi

#### Scenario: Tệp HTML đính kèm
- **WHEN** tệp đính kèm có kiểu `text/html`
- **THEN** response vẫn là `attachment` kèm `nosniff` và CSP `sandbox`, nên trình duyệt tải xuống chứ không chạy trên origin của Sino

### Requirement: Ảnh nhúng hiện trong HTML
Lúc nhập và lúc lấy bù, Sino MUST ghi các phần ảnh nhúng (ảnh PNG, JPEG, GIF hoặc WebP có `Content-ID`, không phải `attachment`, mà HTML của thư hiện bằng `<img src="cid:…">`) với `content_id`; một phần có `content_id` là ảnh nhúng, MUST NOT có trong danh sách tệp và MUST NOT làm cuộc trò chuyện thành "có tệp". Thư mà Sino không lưu HTML (dài hơn 1 000 000 ký tự) thì ảnh nhúng của nó MUST được lưu là tệp, vì không HTML nào hiện nó. Khi làm sạch HTML, `src="cid:<id>"` MUST được đổi thành đường dẫn tệp của đúng phần đó kèm `?inline=true` (tra id như viết, rồi id đã giải mã `%XX`, rồi không phân biệt hoa thường); không có phần tương ứng thì ảnh MUST bị bỏ. Với `inline=true`, Sino MUST trả `Content-Disposition: inline` chỉ khi kiểu là `image/png`, `image/jpeg`, `image/gif` hoặc `image/webp`; kiểu khác MUST trả `422 ATTACHMENT_NOT_INLINE` mà không gọi provider. Ảnh hiện `inline` MUST có `Cache-Control: max-age=86400, private`: ảnh của một thư không đổi, trình duyệt giữ một ngày thay vì hỏi provider mỗi lần mở thư.

#### Scenario: Chữ ký có logo nhúng
- **WHEN** HTML có `<img src="cid:logo@x">` và thư có phần ảnh PNG với `Content-ID: <logo@x>`
- **THEN** ảnh trong `html` trỏ tới đường dẫn tệp của phần đó với `inline=true`

#### Scenario: SVG nhúng
- **WHEN** web gọi `inline=true` cho một phần `image/svg+xml`
- **THEN** response là `422 ATTACHMENT_NOT_INLINE`
