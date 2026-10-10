## ADDED Requirements

### Requirement: Tải tệp đính kèm qua Sino
`GET /api/conversations/{id}/messages/{messageId}/attachments/{attachmentId}` MUST lấy nội dung tệp từ provider và trả bytes với `Content-Type` là kiểu đã lưu (không có thì `application/octet-stream`), `Content-Disposition: attachment` có tên tệp mã hóa theo RFC 6266 (`filename*=UTF-8''…`), `X-Content-Type-Options: nosniff` và `Content-Security-Policy: sandbox; default-src 'none'`. Sino MUST NOT lưu nội dung tệp. Tệp không thuộc thư đó MUST trả `404 ATTACHMENT_NOT_FOUND`; provider lỗi MUST trả `502 ATTACHMENT_UNAVAILABLE`.

#### Scenario: Tải một tệp PDF
- **WHEN** web mở đường dẫn của tệp `bao-gia.pdf`
- **THEN** response là bytes của tệp với `Content-Disposition: attachment` và tên `bao-gia.pdf`

#### Scenario: Tệp HTML đính kèm
- **WHEN** tệp đính kèm có kiểu `text/html`
- **THEN** response vẫn là `attachment` kèm `nosniff` và CSP `sandbox`, nên trình duyệt tải xuống chứ không chạy trên origin của Sino

### Requirement: Ảnh nhúng hiện trong HTML
Lúc nhập và lúc lấy bù, Sino MUST ghi các phần ảnh nhúng (có `Content-ID`, không phải `attachment`) với `content_id` và cờ `inline`. Khi làm sạch HTML, `src="cid:<id>"` MUST được đổi thành đường dẫn tệp của đúng phần đó kèm `?inline=true`; không có phần tương ứng thì ảnh MUST bị bỏ. Với `inline=true`, Sino MUST trả `Content-Disposition: inline` chỉ khi kiểu là `image/png`, `image/jpeg`, `image/gif` hoặc `image/webp`; kiểu khác MUST trả `400 ATTACHMENT_NOT_INLINE`.

#### Scenario: Chữ ký có logo nhúng
- **WHEN** HTML có `<img src="cid:logo@x">` và thư có phần ảnh PNG với `Content-ID: <logo@x>`
- **THEN** ảnh trong `html` trỏ tới đường dẫn tệp của phần đó với `inline=true`

#### Scenario: SVG nhúng
- **WHEN** web gọi `inline=true` cho một phần `image/svg+xml`
- **THEN** response là `400 ATTACHMENT_NOT_INLINE`
