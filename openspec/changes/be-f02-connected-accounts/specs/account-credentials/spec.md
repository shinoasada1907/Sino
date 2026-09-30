## ADDED Requirements

### Requirement: Credential tách khỏi dữ liệu nghiệp vụ
Credential MUST nằm trong bảng `account_credential` (quan hệ 1–1 với `connected_account`, xóa theo account). Bảng `connected_account` và mọi bảng nghiệp vụ khác MUST NOT có cột chứa token hay secret.

#### Scenario: Kiểm tra schema
- **WHEN** xem cấu trúc bảng `connected_account`
- **THEN** không có cột token/secret nào; mọi giá trị token chỉ nằm trong `account_credential`

### Requirement: Mã hóa at rest
Access token, refresh token (nếu có) và mọi secret của credential MUST được mã hóa ở tầng ứng dụng trước khi ghi xuống database theo thuật toán chốt ở Decision D-11 (đề xuất: AES-256-GCM, IV ngẫu nhiên cho mỗi giá trị). Database MUST NOT bao giờ nhận plaintext.

#### Scenario: Lưu rồi đọc lại
- **WHEN** một credential được lưu rồi đọc lại qua credential store
- **THEN** giá trị đọc được giống hệt giá trị gốc, còn giá trị thô trong cột database không chứa plaintext

#### Scenario: Cùng token lưu hai lần
- **WHEN** cùng một access token được mã hóa hai lần
- **THEN** hai ciphertext khác nhau (IV khác nhau)

### Requirement: Phát hiện ciphertext bị sửa hoặc bị chuyển chỗ
Giải mã MUST thất bại nếu ciphertext bị sửa, hoặc bị chép sang account khác hay sang cột khác (ciphertext được gắn với account ID và tên trường qua associated data).

#### Scenario: Ciphertext bị sửa
- **WHEN** một byte của ciphertext trong database bị thay đổi rồi credential được đọc
- **THEN** việc đọc thất bại với lỗi giải mã, không trả về dữ liệu sai

#### Scenario: Ciphertext bị chép sang account khác
- **WHEN** ciphertext access token của account A được chép vào credential của account B rồi credential B được đọc
- **THEN** việc đọc thất bại với lỗi giải mã

### Requirement: Khóa mã hóa đến từ môi trường và được kiểm tra khi khởi động
Khóa MUST đến từ cấu hình qua environment (không nằm trong repository, không nằm trong database). Khóa đang hoạt động bị thiếu hoặc sai độ dài MUST làm ứng dụng dừng khi khởi động. Giá trị khóa MUST NOT xuất hiện trong log hay endpoint Actuator.

#### Scenario: Thiếu khóa
- **WHEN** ứng dụng start không có khóa mã hóa đang hoạt động
- **THEN** ứng dụng dừng khi khởi động với thông báo nêu tên cấu hình bị thiếu, không in giá trị khóa nào

### Requirement: Sẵn sàng xoay khóa
Mỗi credential MUST ghi lại ID của khóa đã dùng để mã hóa. Giải mã MUST dùng đúng khóa theo ID đó; ghi mới MUST dùng khóa đang hoạt động. Nhiều khóa MAY cùng được cấu hình để đọc dữ liệu cũ.

#### Scenario: Đổi khóa đang hoạt động
- **WHEN** khóa đang hoạt động đổi từ `k1` sang `k2` trong khi đã có credential mã hóa bằng `k1`
- **THEN** credential cũ vẫn đọc được bằng `k1`, và khi credential đó được ghi lại thì nó được mã hóa bằng `k2` với ID khóa `k2`

### Requirement: Credential không bao giờ bị lộ ra ngoài
Giá trị credential MUST NOT xuất hiện trong response REST, payload event, log hay thông báo exception. Credential đã giải mã chỉ được đọc qua credential store nội bộ của module account; F02 MUST NOT export API đọc credential cho module khác (việc export cho `sync` được quyết định ở F07).

#### Scenario: Log khi lưu credential thất bại
- **WHEN** việc lưu credential ném exception
- **THEN** exception message và log không chứa token hay khóa

#### Scenario: Module khác cố truy cập credential store
- **WHEN** một module khác tham chiếu credential store của module account
- **THEN** test module verification fail
