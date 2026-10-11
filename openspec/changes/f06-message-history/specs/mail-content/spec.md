## ADDED Requirements

### Requirement: HTML gốc được lưu khi nhập
Khi nhập hay đồng bộ một thư có phần HTML không phải tệp, Sino MUST lưu HTML gốc (tối đa 1 000 000 ký tự) và ghi `bodyFormat` = `HTML`; thư không có phần HTML MUST có `bodyFormat` = `TEXT`. HTML dài hơn giới hạn MUST NOT được lưu và thư có `bodyFormat` = `TEXT`. Phần chữ MUST vẫn được lưu như trước. Thư đã có được cập nhật lại MUST NOT mất HTML đã lưu.

#### Scenario: Thư chỉ có HTML
- **WHEN** đồng bộ một thư chỉ có `text/html`
- **THEN** Sino lưu HTML gốc, phần chữ rút từ HTML, và `bodyFormat` = `HTML`

#### Scenario: HTML quá lớn
- **WHEN** phần HTML dài hơn 1 000 000 ký tự
- **THEN** HTML không được lưu và `bodyFormat` = `TEXT`

### Requirement: HTML trả cho web luôn đã được làm sạch
`GET /api/conversations/{id}/messages/{messageId}/body` MUST trả `format`, `html` và `remoteImages`; `html` MUST là HTML đã làm sạch theo danh sách cho phép, không bao giờ là HTML gốc. Kết quả MUST NOT chứa phần tử `script`, `iframe`, `frame`, `object`, `embed`, `form`, ô nhập, `link`, `meta`, `base`, `svg`, `math`; MUST NOT chứa thuộc tính `on*`; liên kết MUST chỉ có giao thức `http`, `https`, `mailto`, `tel` và MUST có `target="_blank"` và `rel="noopener noreferrer"`; ảnh MUST chỉ có `http`, `https`, đường dẫn ảnh nhúng của Sino, hoặc `data:image/(png|jpeg|gif|webp)`. Thẻ `style` và thuộc tính `style` MAY được giữ. Thư `TEXT` MUST trả `html` = `null`.

#### Scenario: Thư có script và onerror
- **WHEN** HTML gốc có `<script>alert(1)</script>` và `<img src=x onerror=alert(1)>`
- **THEN** `html` không có `script` và không có `onerror`

#### Scenario: Liên kết javascript
- **WHEN** HTML gốc có `<a href="javascript:alert(1)">Bấm</a>`
- **THEN** liên kết trong `html` không có `href`

#### Scenario: Thư không thuộc cuộc trò chuyện
- **WHEN** `messageId` thuộc một cuộc trò chuyện khác
- **THEN** response là `404` với `code` = `MESSAGE_NOT_FOUND`

### Requirement: Báo có ảnh từ xa
`remoteImages` MUST là `true` khi HTML đã sạch có ảnh `http(s)` (thuộc tính `src`, `srcset`, `background`, hoặc `url(http…)` trong CSS), và `false` khi không có.

#### Scenario: Bản tin có pixel theo dõi
- **WHEN** HTML có `<img src="https://track.example.com/p.gif">`
- **THEN** `remoteImages` = `true`

### Requirement: Lấy bù nội dung cho thư nhập trước
Khi web hỏi nội dung một thư `UNCHECKED`, Sino MUST đọc lại thư đó từ provider, lưu HTML và ảnh nhúng, đổi `bodyFormat` thành `HTML` hoặc `TEXT`, rồi trả kết quả. Provider lỗi hoặc account không dùng được MUST trả `502` với `code` = `MESSAGE_CONTENT_UNAVAILABLE` và thư MUST giữ `UNCHECKED` để lần sau thử lại. Lời gọi provider MUST NOT nằm trong transaction của database.

#### Scenario: Lấy bù thành công
- **WHEN** web hỏi nội dung một thư `UNCHECKED` có phần HTML
- **THEN** response có `format` = `HTML`, và từ đó thư có `bodyFormat` = `HTML` mà không gọi provider nữa

#### Scenario: Provider không còn thư
- **WHEN** web hỏi nội dung một thư `UNCHECKED` mà provider không còn thư đó
- **THEN** response có `format` = `TEXT` và từ đó thư có `bodyFormat` = `TEXT`

#### Scenario: Gmail tạm lỗi
- **WHEN** provider ném `PROVIDER_UNAVAILABLE` lúc lấy bù
- **THEN** response là `502 MESSAGE_CONTENT_UNAVAILABLE` và thư vẫn là `UNCHECKED`
