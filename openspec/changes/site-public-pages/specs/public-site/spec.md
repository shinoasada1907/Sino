## ADDED Requirements

### Requirement: Các trang của site công khai
Site công khai MUST là HTML tĩnh dựng sẵn, xem được không cần đăng nhập và không cần JavaScript. Site MUST có:
- trang chủ `/`;
- Chính sách quyền riêng tư `/privacy` (tiếng Việt) và `/en/privacy` (tiếng Anh);
- Điều khoản `/terms` và `/en/terms`;
- Bảo mật `/security`, Phần mềm nguồn mở `/open-source`;
- trang `404.html` cho đường dẫn không có.

Mỗi trang MUST theo canvas "Sino UI" tương ứng (`Landing`, `SitePrivacy`, `SiteTerms`, `SiteSecurity`, `SiteOpenSource`, `SiteNotFound`) và MUST có `lang`, `<title>`, mô tả, viewport và link canonical. Trang MUST NOT có thẻ `<script>` và MUST NOT tải tài nguyên từ tên miền khác.

#### Scenario: Mở trang chủ khi tắt JavaScript
- **WHEN** một trình duyệt tắt JavaScript mở `/`
- **THEN** trang hiện đủ chữ của mọi mục, và link "Chính sách quyền riêng tư" trỏ tới `/privacy`

#### Scenario: Đường dẫn không có
- **WHEN** người dùng mở một đường dẫn không có trên site
- **THEN** host trả `404.html` với "Không tìm thấy trang này.", nút "Về trang chủ" và "Mở Sino"

### Requirement: Trang chủ mô tả đúng ứng dụng và lý do xin dữ liệu Google
Trang chủ MUST giữ các mục của canvas `Landing`: giới thiệu, dịch vụ kết nối, tính năng, kế hoạch, cách hoạt động, quyền riêng tư, câu hỏi thường gặp, lời kêu gọi cuối và chân trang. Trang MUST chỉ khẳng định tính năng đang chạy thật, và tính năng chưa có MUST mang nhãn "Sắp có" hoặc không xuất hiện. Mục "Quyền riêng tư" MUST liệt kê từng quyền Sino xin từ Google (`openid`, `email`, `gmail.readonly`, `gmail.send`) kèm lý do, và MUST có link tới mục dữ liệu Google của Chính sách quyền riêng tư.

#### Scenario: Dịch vụ chưa kết nối được
- **WHEN** người dùng xem dải "KẾT NỐI VỚI"
- **THEN** Gmail không có nhãn, còn Zalo, Messenger và Telegram có nhãn "Sắp có"

#### Scenario: Lý do của quyền đọc Gmail
- **WHEN** người dùng đọc mục "Quyền riêng tư"
- **THEN** có dòng `gmail.readonly` giải thích Sino đọc thư để hiện trong hộp thư chung, và link tới `/privacy#google`

### Requirement: Chính sách quyền riêng tư đáp ứng Limited Use
Chính sách quyền riêng tư MUST nói đúng những gì Sino làm hôm nay:
- dữ liệu Sino lưu;
- Sino dùng dữ liệu để làm gì;
- bên thứ ba nhận dữ liệu;
- dữ liệu được giữ và xóa thế nào, kể cả việc thư đã lưu còn lại sau khi ngắt kết nối và cách yêu cầu xóa hẳn qua email;
- quyền của người dùng, người đứng tên, email liên hệ và ngày hiệu lực.

Mục "Dữ liệu nhận từ Google" (`#google`) MUST có câu Limited Use nguyên văn tiếng Anh kèm link tới Google API Services User Data Policy, và MUST nói Sino không dùng dữ liệu Google để quảng cáo, không bán, và không dùng để huấn luyện mô hình AI. Bản tiếng Việt và tiếng Anh MUST có cùng nội dung và MUST link qua lại.

#### Scenario: Ngắt kết nối Gmail
- **WHEN** người dùng đọc mục giữ và xóa dữ liệu
- **THEN** chính sách nói token bị thu hồi và xóa hẳn khi ngắt kết nối, thư đã lưu được giữ lại, và muốn xóa hẳn thì gửi email tới địa chỉ liên hệ

#### Scenario: Đổi sang tiếng Anh
- **WHEN** người dùng ở `/privacy` bấm "English"
- **THEN** trang `/en/privacy` mở ra với cùng các mục, và có link "Tiếng Việt" trỏ về `/privacy`

### Requirement: Thông tin chủ sở hữu nằm trong một cấu hình, không lên mạng khi thiếu
Tên miền của site, URL của app, email liên hệ, người đứng tên, ngày hiệu lực và nhà cung cấp máy chủ MUST nằm ở một cấu hình duy nhất. Bản dựng để đưa lên mạng MUST dừng với mã thoát khác 0 và nêu tên từng trường còn thiếu. Bản dựng xem trước MUST hiện chỗ thiếu thành "[chưa điền: …]" và MUST đánh dấu mọi trang `noindex`.

#### Scenario: Dựng để đưa lên mạng khi thiếu email
- **WHEN** chạy `pnpm build` mà `contactEmail` chưa có giá trị
- **THEN** lệnh dừng với mã thoát khác 0, báo thiếu `contactEmail`, và không sinh trang nào

#### Scenario: Xem trước khi thiếu email
- **WHEN** chạy `pnpm build:preview` mà `contactEmail` chưa có giá trị
- **THEN** mục liên hệ của Privacy hiện "[chưa điền: email liên hệ]", và mọi trang có `<meta name="robots" content="noindex">`

### Requirement: Link nội bộ không gãy
Mọi link nội bộ của site MUST trỏ tới một trang đã dựng, hoặc tới một `id` có thật trên trang đó. Nút "Đăng nhập" và "Mở Sino" MUST trỏ tới URL app trong cấu hình.

#### Scenario: Link ở thanh trên của trang Điều khoản
- **WHEN** người dùng ở `/terms` bấm "Tính năng"
- **THEN** trình duyệt mở `/#tinh-nang` trên trang chủ
