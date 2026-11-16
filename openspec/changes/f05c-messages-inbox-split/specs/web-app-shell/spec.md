## MODIFIED Requirements

### Requirement: Điều hướng chính
Mỗi mục điều hướng MUST dẫn tới một đường dẫn riêng (`/overview`, `/messages`, `/inbox`, `/calendar`, `/tasks`, `/notes`, `/accounts`, `/services`, `/registrations`, `/settings`; `/more` cho mục "Thêm" trên mobile). Mục của trang đang mở MUST có `aria-current="page"`. Số đếm trên điều hướng MUST lấy từ dữ liệu của app, không viết cứng. Mục chỉ có icon MUST có tên đọc được cho trình đọc màn hình. `/` MUST chuyển tới `/overview`.

#### Scenario: Mục đang mở
- **WHEN** người dùng đang ở `/overview`
- **THEN** mục "Tổng quan" có `aria-current="page"` và các mục khác thì không

#### Scenario: Trang gốc
- **WHEN** người dùng mở `/`
- **THEN** web chuyển tới `/overview`

### Requirement: Tab Thêm trên mobile
Trên thanh điều hướng dưới đáy, tab "Thêm" MUST có `aria-current="page"` khi người dùng ở `/more` hoặc ở một màn nằm dưới "Thêm" theo canvas `MobileMore`: `/calendar` (và trang con của nó), `/notes`, `/accounts` (và trang con của nó), `/services`, `/registrations`, `/notifications`, `/settings`. Trang "Thêm" MUST có mục "Lịch".

#### Scenario: Mở Tài khoản trên điện thoại
- **WHEN** người dùng ở `/accounts`
- **THEN** tab "Thêm" của thanh dưới có `aria-current="page"` và các tab khác thì không

#### Scenario: Mở Lịch trên điện thoại
- **WHEN** người dùng ở `/calendar`
- **THEN** tab "Thêm" của thanh dưới có `aria-current="page"`

## ADDED Requirements

### Requirement: Tin nhắn và Hộp thư trên điều hướng
Nhóm chính của thanh bên và rail MUST có ba mục theo thứ tự: "Tổng quan", "Tin nhắn" (`/messages`), "Hộp thư" (`/inbox`). Thanh dưới trên mobile MUST có năm tab theo thứ tự: "Tổng quan", "Tin nhắn", "Hộp thư", "Việc", "Thêm". Số cạnh "Tin nhắn" MUST là `unreadByKind.CHAT` và số cạnh "Hộp thư" MUST là `unreadByKind.EMAIL` của `GET /api/conversations/counts`; khi backend chưa trả `unreadByKind`, "Hộp thư" MUST dùng `unread` và "Tin nhắn" MUST NOT hiện số. Mục chỉ có icon MUST đọc được số của nó ("Tin nhắn, 3 chưa đọc").

#### Scenario: Số theo loại
- **WHEN** `GET /api/conversations/counts` trả `unreadByKind` = `{ "EMAIL": 12, "CHAT": 3 }`
- **THEN** thanh bên ghi 3 cạnh "Tin nhắn" và 12 cạnh "Hộp thư"

#### Scenario: Thanh dưới
- **WHEN** người dùng mở app trên màn 390px
- **THEN** thanh dưới có đúng các tab "Tổng quan", "Tin nhắn", "Hộp thư", "Việc", "Thêm" theo thứ tự đó
