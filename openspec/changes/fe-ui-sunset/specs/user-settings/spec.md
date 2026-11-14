## ADDED Requirements

### Requirement: Cài đặt giao diện
`GET /api/settings` SHALL trả thêm `palette` (`SAKURA`, `SUNSET`, `MINT`, `LAVENDER` hoặc `MONO`; mặc định `SAKURA`), `accentColor` (chuỗi `#RRGGBB` hoặc null; mặc định null), `corners` (`SOFT` hoặc `COMPACT`; mặc định `SOFT`) và `decorations` (boolean; mặc định true). `PATCH /api/settings` SHALL nhận từng trường này như các cài đặt khác, chỉ đổi trường được gửi. Giá trị sai SHALL bị từ chối với 400 theo quy ước lỗi của API, và không trường nào đổi.

#### Scenario: Người dùng chưa lưu gì
- **WHEN** người dùng mới gọi `GET /api/settings`
- **THEN** phản hồi có `palette: "SAKURA"`, `accentColor: null`, `corners: "SOFT"`, `decorations: true`

#### Scenario: Đổi bộ màu
- **WHEN** gửi `PATCH /api/settings` với `{"palette": "MINT"}`
- **THEN** phản hồi có `palette: "MINT"`, các trường khác giữ nguyên, và `GET` sau đó trả `MINT`

#### Scenario: Màu nhấn sai định dạng
- **WHEN** gửi `PATCH /api/settings` với `{"accentColor": "hồng"}`
- **THEN** phản hồi 400 và không trường nào đổi

#### Scenario: Xóa màu nhấn riêng
- **WHEN** gửi `PATCH /api/settings` với `{"accentColor": null}`
- **THEN** `accentColor` trở về null
