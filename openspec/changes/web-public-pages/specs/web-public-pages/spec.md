## ADDED Requirements

### Requirement: Trang giới thiệu ở `/`
`/` MUST hiện trang giới thiệu Sino Messages (canvas `Landing`, chữ như trang `/messages` của `sino-site`) cho khách chưa đăng nhập, và MUST chuyển người đã đăng nhập tới `/overview` mà không thêm mục lịch sử. Trong lúc hỏi `GET /api/auth/me`, trang MUST NOT hiện nội dung giới thiệu. Khi không hỏi được máy chủ, trang MUST vẫn hiện nội dung giới thiệu.

#### Scenario: Khách chưa đăng nhập
- **WHEN** `GET /api/auth/me` trả `401` và người dùng mở `/`
- **THEN** trang có tiêu đề "Mọi hộp thư Gmail ở một nơi. Việc cần làm ngay bên cạnh." và các mục Tính năng, Kế hoạch, Cách hoạt động, Quyền riêng tư, Câu hỏi

#### Scenario: Người đã đăng nhập
- **WHEN** `GET /api/auth/me` trả `200` và người dùng mở `/`
- **THEN** web chuyển tới `/overview` bằng `replace`

#### Scenario: Máy chủ không trả lời
- **WHEN** `GET /api/auth/me` lỗi mạng và người dùng mở `/`
- **THEN** trang vẫn hiện nội dung giới thiệu

### Requirement: Link của trang giới thiệu
"Đăng nhập" MUST mở `/login`; "Mở Sino Messages" MUST mở `/overview`; "Mở Việc cần làm" MUST mở `/tasks`. Các mục của thanh đầu MUST trỏ tới các phần của `/` (`/#tinh-nang`, `/#ke-hoach`, `/#cach-hoat-dong`, `/#rieng-tu`, `/#cau-hoi`) và trang MUST cuộn tới phần đó, kể cả khi đi từ trang khác. Chân trang MUST chỉ có link tới trang đã có trong `sino-web`: Sino Messages (`/`), Câu hỏi thường gặp (`/#cau-hoi`), Chính sách quyền riêng tư (`/privacy`).

#### Scenario: Mở app từ trang giới thiệu
- **WHEN** khách bấm "Mở Sino Messages"
- **THEN** web đi `/overview`, và vì chưa đăng nhập nên tới `/login?returnTo=%2Foverview`

#### Scenario: Chân trang không có trang chưa làm
- **WHEN** người dùng mở `/`
- **THEN** chân trang không có link Điều khoản, Bảo mật hay Phần mềm nguồn mở

### Requirement: Chính sách quyền riêng tư trong app web
`/privacy` MUST hiện Chính sách quyền riêng tư tiếng Việt và `/en/privacy` bản tiếng Anh, cùng nội dung với `sino-site`, công khai cho mọi người. Mỗi bản MUST có link sang bản kia. Thông tin chủ sở hữu (email liên hệ, người đứng tên, ngày hiệu lực, nhà cung cấp máy chủ) MUST lấy từ một chỗ trong code; khi còn trống, trang MUST hiện "[chưa điền: …]" ở chỗ của nó.

#### Scenario: Đổi ngôn ngữ
- **WHEN** người dùng mở `/privacy` rồi bấm "English"
- **THEN** web mở `/en/privacy` với tiêu đề "Privacy policy"

#### Scenario: Thông tin chưa điền
- **WHEN** email liên hệ chưa được điền và người dùng mở `/privacy`
- **THEN** chỗ email trong trang ghi "[chưa điền: email liên hệ]"

### Requirement: Trang công khai tải riêng
Các trang công khai MUST nằm trong một phần mã tải riêng (cùng thư viện chuyển động), và MUST NOT được tải khi người đã đăng nhập dùng app. Mỗi trang công khai MUST đặt tiêu đề tab của nó.

#### Scenario: Tiêu đề tab
- **WHEN** người dùng mở `/en/privacy`
- **THEN** tiêu đề tab là "Privacy policy · Sino"
