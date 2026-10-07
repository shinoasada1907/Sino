## MODIFIED Requirements

### Requirement: Xóa account
`DELETE /api/accounts/{id}` MUST xóa mềm account (Decision D-13 = B): bản ghi account được giữ lại và đánh dấu đã xóa, credential của nó MUST bị xóa hẳn khỏi database, trả `204`, và publish `AccountRemoved`, tất cả trong một transaction. Account đã xóa MUST được đối xử như không tồn tại: không có trong `GET /api/accounts`; `GET`, `PATCH`, `DELETE` cùng ID MUST trả `404` `ACCOUNT_NOT_FOUND`. Xóa account không tồn tại hoặc của người khác MUST trả `404` `ACCOUNT_NOT_FOUND`. Nếu connector của account khai báo địa chỉ thu hồi token, hệ thống MUST gửi lệnh thu hồi refresh token tới provider **sau khi** transaction commit và ngoài transaction; lỗi thu hồi MUST chỉ được ghi log (không token) và MUST NOT làm việc xóa thất bại. Token MUST NOT nằm trong event `AccountRemoved`.

#### Scenario: Xóa account
- **WHEN** client xóa một account của mình
- **THEN** response là `204`, credential của account không còn trong database, bản ghi account vẫn còn và được đánh dấu đã xóa, và event `AccountRemoved` được publish

#### Scenario: Account đã xóa không còn hiện
- **WHEN** client gọi `GET /api/accounts`, hoặc `GET`/`PATCH`/`DELETE` với ID của account đã xóa
- **THEN** danh sách không có account đó, và các lệnh theo ID trả `404` `ACCOUNT_NOT_FOUND`

#### Scenario: Xóa account Gmail thu hồi quyền ở Google
- **WHEN** client xóa một account Gmail
- **THEN** sau khi việc xóa đã commit, Google nhận lệnh thu hồi refresh token của account đó

#### Scenario: Thu hồi thất bại không chặn việc xóa
- **WHEN** client xóa một account Gmail và Google trả lỗi hoặc không trả lời lệnh thu hồi
- **THEN** response vẫn là `204`, account vẫn bị xóa, và log ghi cảnh báo không chứa token
