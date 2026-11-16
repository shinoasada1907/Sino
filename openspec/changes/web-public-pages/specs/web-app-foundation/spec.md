## MODIFIED Requirements

### Requirement: Chặn trang khi chưa đăng nhập
Mọi trang trừ `/login`, trang 404 và các trang công khai `/`, `/privacy`, `/en/privacy` (capability `web-public-pages`) MUST chỉ hiện khi `GET /api/auth/me` trả `200`. Chưa đăng nhập, hoặc session hết hạn khi đang dùng (một API trả `401`), MUST đưa người dùng về `/login?returnTo=<đường dẫn hiện tại>` và xóa dữ liệu đã cache. `returnTo` MUST chỉ nhận đường dẫn nội bộ (bắt đầu bằng một dấu `/`, không phải `//`).

#### Scenario: Mở trang khi chưa đăng nhập
- **WHEN** người dùng chưa đăng nhập mở `/accounts`
- **THEN** web chuyển tới `/login?returnTo=%2Faccounts`, và sau khi đăng nhập thành công thì quay về `/accounts`

#### Scenario: Session hết hạn khi đang dùng
- **WHEN** một lời gọi API trả `401` trong lúc người dùng đang ở `/accounts`
- **THEN** web chuyển tới `/login?returnTo=%2Faccounts`

#### Scenario: returnTo trỏ ra ngoài
- **WHEN** người dùng đăng nhập thành công từ `/login?returnTo=//evil.example`
- **THEN** web chuyển tới `/overview` (trang chính), không chuyển ra địa chỉ ngoài

#### Scenario: Trang công khai
- **WHEN** người dùng chưa đăng nhập mở `/privacy`
- **THEN** web hiện Chính sách quyền riêng tư, không chuyển tới `/login`
