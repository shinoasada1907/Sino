## ADDED Requirements

### Requirement: Đồng bộ tăng dần sau lần nhập đầu
Khi lần nhập đầu của một account đã `DONE`, một lượt đồng bộ MUST đọc thay đổi từ con trỏ đã lưu qua `ProviderAccess` (ngoài transaction), lưu từng trang và tiến con trỏ trong cùng một transaction, tới khi provider báo hết. Thành công MUST ghi thời điểm vào `lastSyncAt` và xóa lỗi gần nhất. Một account MUST NOT có hai lượt nhập hoặc đồng bộ chạy cùng lúc; các yêu cầu đến trong lúc đang chạy MUST được gộp thành tối đa một lượt nữa (D-79).

#### Scenario: Thư mới sau lần nhập đầu
- **WHEN** một account đã `DONE` có thư mới ở provider và một lượt đồng bộ được yêu cầu
- **THEN** thư mới được lưu, con trỏ tiến tới con trỏ provider trả về, `lastSyncAt` được ghi và `import_status` vẫn là `DONE`

#### Scenario: Nhiều yêu cầu cùng lúc
- **WHEN** webhook và lịch cùng yêu cầu đồng bộ một account trong lúc một lượt đang chạy
- **THEN** connector không bao giờ được gọi song song cho account đó, và sau lượt đang chạy có đúng một lượt nữa

#### Scenario: Nhập lại giữa lúc đồng bộ
- **WHEN** người dùng bắt đầu nhập lại lần đầu trong lúc một lượt đồng bộ đang đọc trang
- **THEN** lượt đồng bộ dừng mà không ghi con trỏ của nó lên dòng của lần nhập mới, và lần nhập mới chạy ngay sau đó

### Requirement: Lỗi khi đồng bộ
Lượt đồng bộ MUST xử lý lỗi theo cùng bảng của lần nhập đầu (chờ rồi thử lại `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`; `CURSOR_EXPIRED` đọc lại từ mốc của lần nhập đầu một lần mỗi lượt; con trỏ không tiến → `CURSOR_STUCK`). Lỗi cuối cùng MUST được ghi vào `lastError` và MUST NOT đổi `import_status` thành `FAILED`. Lượt bị ngắt vì ứng dụng tắt MUST NOT ghi lỗi.

#### Scenario: Provider không tới được
- **WHEN** provider báo `PROVIDER_UNAVAILABLE` quá số lần thử của một lượt
- **THEN** `lastError` = `PROVIDER_UNAVAILABLE`, `import_status` vẫn `DONE`, và lượt thành công sau đó xóa `lastError`

#### Scenario: Con trỏ quá cũ
- **WHEN** provider báo `CURSOR_EXPIRED` cho con trỏ đã lưu
- **THEN** lượt đồng bộ đọc lại từ mốc của lần nhập đầu, không tạo thư trùng, và lưu con trỏ mới khi xong

### Requirement: Đồng bộ tự động
Lịch MUST yêu cầu đồng bộ các account đủ điều kiện mà lần thử gần nhất cũ hơn khoảng hỏi: 60 giây khi account chưa có watch còn hạn, 5 phút khi có (cấu hình được). Account đủ điều kiện là account chưa xóa, không `DISABLED`, không `AUTH_EXPIRED`, `syncEnabled` = true và lần nhập đầu `DONE`. Thông báo push của provider cho một account đủ điều kiện MUST yêu cầu đồng bộ account đó.

#### Scenario: Account đến hạn
- **WHEN** lịch chạy và một account đủ điều kiện, không có watch, thử lần cuối 61 giây trước
- **THEN** account đó được yêu cầu đồng bộ

#### Scenario: Account có watch
- **WHEN** lịch chạy và một account có watch còn hạn thử lần cuối 2 phút trước
- **THEN** account đó chưa được yêu cầu đồng bộ

#### Scenario: Account tạm dừng đồng bộ tự động
- **WHEN** lịch chạy hoặc có thông báo push cho một account có `syncEnabled` = false
- **THEN** account đó không được đồng bộ

### Requirement: Đồng bộ ngay
`POST /api/accounts/{id}/sync` MUST yêu cầu một lượt đồng bộ cho account của owner hiện tại và trả `202` với trạng thái đồng bộ, kể cả khi đồng bộ tự động đang tạm dừng. Account không có, đã xóa hoặc của owner khác MUST trả `404 ACCOUNT_NOT_FOUND`; account `DISABLED` MUST trả `409 ACCOUNT_DISABLED`; lần nhập đầu chưa `DONE` MUST trả `409 IMPORT_NOT_DONE`. Request MUST cần CSRF token.

#### Scenario: Bấm "Đồng bộ ngay"
- **WHEN** owner gửi `POST /api/accounts/{id}/sync` cho account đã nhập xong
- **THEN** response là `202` và thư mới của account được lưu mà không nhập lại cả khoảng

#### Scenario: Chưa nhập xong
- **WHEN** owner gửi `POST /api/accounts/{id}/sync` cho account đang nhập lần đầu
- **THEN** response là `409` với `code` = `IMPORT_NOT_DONE`

### Requirement: Trạng thái đồng bộ
`GET /api/accounts/{id}/sync` MUST trả `importDone`, `lastSyncAt`, `lastError`, `push` (`ACTIVE` khi watch còn hạn, `FAILED` khi lần đăng ký gần nhất lỗi, `OFF` khi không có) và `pushExpiresAt`, cho account của owner hiện tại; ngoài ra như `POST` (`404`).

#### Scenario: Account chưa đồng bộ lần nào
- **WHEN** owner xem trạng thái đồng bộ của account vừa nhập xong
- **THEN** `importDone` = true, `lastSyncAt` = `null`, `lastError` = `null`
