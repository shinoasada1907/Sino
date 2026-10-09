## ADDED Requirements

### Requirement: Ước lượng lần nhập đầu
`GET /api/accounts/{id}/initial-sync/estimate?range=` với `range` là `DAYS_30`, `DAYS_90` hoặc `ALL` MUST trả số thư ước lượng (hoặc rỗng khi connector không ước lượng được, D-65) và khoảng số phút tối thiểu–tối đa suy từ tốc độ nhập. Lỗi của provider khi ước lượng MUST cho kết quả rỗng, không làm API lỗi. Account không thuộc owner hoặc đã xóa MUST trả `404` mã `ACCOUNT_NOT_FOUND`; account `DISABLED` MUST trả `409` mã `ACCOUNT_DISABLED` và MUST NOT gọi provider; `range` lạ MUST trả `400`.

#### Scenario: Gmail ước lượng 90 ngày
- **WHEN** owner hỏi ước lượng `DAYS_90` cho account Gmail
- **THEN** API trả số thư Gmail ước lượng từ mốc 90 ngày trước và khoảng số phút

#### Scenario: Connector không ước lượng được
- **WHEN** connector của account trả rỗng khi được hỏi ước lượng
- **THEN** API trả `messages` rỗng

### Requirement: Bắt đầu lần nhập đầu
`POST /api/accounts/{id}/initial-sync` với `range` MUST bắt đầu nhập thư của account từ mốc tương ứng (`DAYS_30`/`DAYS_90` = bây giờ trừ 30/90 ngày, `ALL` = toàn bộ) và trả `202` kèm trạng thái (D-64). Mỗi account MUST có nhiều nhất một lượt nhập đang chạy: gọi lại khi đang chạy MUST trả trạng thái hiện tại mà không bắt đầu lượt thứ hai. Lượt trước `FAILED` với cùng khoảng MUST nhập tiếp từ cursor đã lưu; khoảng khác hoặc lượt trước `DONE` MUST nhập lại từ cursor khởi tạo với mốc mới. Account không thuộc owner hoặc đã xóa MUST trả `404`; account `DISABLED` (D-12: không đồng bộ) MUST trả `409` mã `ACCOUNT_DISABLED` và MUST NOT bắt đầu lượt nhập; `range` lạ MUST trả `400`.

#### Scenario: Bấm bắt đầu hai lần
- **WHEN** owner gửi `POST …/initial-sync` hai lần liên tiếp
- **THEN** chỉ một lượt nhập chạy và cả hai lần đều trả trạng thái `RUNNING`

#### Scenario: Nhập tiếp sau khi hỏng
- **WHEN** lượt nhập `DAYS_90` đã `FAILED` giữa chừng và owner bắt đầu lại `DAYS_90`
- **THEN** việc nhập đi tiếp từ cursor đã lưu, không đọc lại các trang đã lưu

### Requirement: Nhập nền theo trang, cursor chỉ tiến sau khi lưu
Việc nhập MUST chạy nền, ngoài request: lặp gọi `fetchUpdates` qua `ProviderAccess` (ngoài transaction), rồi trong một transaction lưu trang thư bằng `ConversationStore` và ghi cursor tiếp theo cùng số thư đã nhập, số item bị bỏ qua. Lỗi khi lưu MUST NOT làm cursor tiến. Khi trang cuối đã lưu (`hasMore` = `false`), lượt nhập MUST kết thúc `DONE` và cursor lúc đó MUST được giữ cho việc theo dõi thay đổi sau này (F07).

#### Scenario: Nhập hết ba trang
- **WHEN** connector trả ba trang thư cho lần nhập đầu
- **THEN** cả ba trang được lưu, trạng thái là `DONE`, và cursor theo dõi thay đổi của trang cuối được lưu

#### Scenario: Lưu thất bại
- **WHEN** việc lưu một trang thất bại
- **THEN** cursor vẫn là cursor trước trang đó

### Requirement: Lỗi khi nhập
Khi connector báo `RATE_LIMITED`, việc nhập MUST chờ theo thời gian provider đề xuất (không có thì một khoảng mặc định, có giới hạn trên) rồi thử lại cùng trang, tối đa một số lần. `PROVIDER_UNAVAILABLE` MUST được thử lại vài lần với khoảng chờ tăng dần rồi `FAILED`. `CURSOR_EXPIRED` MUST làm việc nhập đọc lại từ cursor khởi tạo cùng mốc một lần; lần thứ hai MUST `FAILED`. `AUTH_EXPIRED`, account bị xóa hoặc bị tắt giữa chừng và mọi lỗi khác MUST làm lượt nhập `FAILED` ngay. Mã lỗi MUST được lưu; thông báo lỗi, log và trạng thái MUST NOT chứa nội dung thư, token hay body của provider.

#### Scenario: Bị giới hạn tần suất rồi qua
- **WHEN** connector báo `RATE_LIMITED` một lần rồi trả trang bình thường
- **THEN** việc nhập chờ, thử lại và đi tiếp tới `DONE`

#### Scenario: Account đã tắt
- **WHEN** owner bắt đầu nhập cho một account `DISABLED`
- **THEN** API trả `409` mã `ACCOUNT_DISABLED` và không có lời gọi nào tới provider

#### Scenario: Token hết quyền
- **WHEN** `ProviderAccess` báo `AUTH_EXPIRED` giữa lúc nhập
- **THEN** lượt nhập `FAILED` với mã `AUTH_EXPIRED` và cursor giữ ở trang cuối đã lưu

### Requirement: Nhập tiếp sau khi khởi động lại
Khi ứng dụng sẵn sàng, mọi lượt nhập đang `RUNNING` MUST được chạy tiếp từ cursor đã lưu.

#### Scenario: Backend khởi động lại giữa lúc nhập
- **WHEN** backend dừng khi một lượt nhập đang `RUNNING` rồi khởi động lại
- **THEN** lượt nhập chạy tiếp từ cursor đã lưu và đi tới `DONE`

### Requirement: Trạng thái lần nhập đầu
`GET /api/accounts/{id}/initial-sync` MUST trả `status` (`NOT_STARTED`, `RUNNING`, `DONE`, `FAILED`), khoảng đã chọn, số thư đã nhập, số item bị bỏ qua, số ước lượng, số phút còn lại ước tính (rỗng khi chưa đủ dữ liệu), số thư đã lưu của account, thời điểm bắt đầu/kết thúc và mã lỗi gần nhất. Account không thuộc owner hoặc đã xóa MUST trả `404`.

#### Scenario: Đang nhập
- **WHEN** một lượt nhập `DAYS_90` đang chạy và đã nhập 412 thư trên ước lượng 1 180
- **THEN** API trả `RUNNING`, `imported` = 412, `estimated` = 1180 và số phút còn lại
