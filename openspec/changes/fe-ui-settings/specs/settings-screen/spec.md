## ADDED Requirements

### Requirement: Trang Cài đặt và mục lục
`/settings` MUST hiện trang Cài đặt theo canvas `Settings` với 9 mục theo thứ tự: Giao diện, Ngôn ngữ, Chuyển động, Thông báo, Lịch và nhắc nhở, Quyền riêng tư và dữ liệu, Nguồn đã kết nối, Bảo mật, Về Sino. Từ 1280 px MUST có cột mục lục dính khi cuộn, mỗi mục một liên kết tới mục đó và mục đang xem được đánh dấu là vị trí hiện tại; mục lục MUST có thêm "Sticker" mở `/settings/stickers`. Từ 768 tới 1279 px các mục MUST xếp dọc không có cột mục lục.

#### Scenario: Bấm một mục trong mục lục
- **WHEN** ở 1440 px người dùng bấm "Bảo mật" trong mục lục
- **THEN** trang cuộn tới mục Bảo mật và "Bảo mật" được đánh dấu là vị trí hiện tại

#### Scenario: Tài khoản cần xử lý
- **WHEN** một tài khoản của người dùng cần đăng nhập lại
- **THEN** "Nguồn đã kết nối" trong mục lục có chấm báo lỗi

### Requirement: Theme chạy thật
Mục Giao diện MUST có ba thẻ Theo hệ thống, Tối, Sáng. Chọn một thẻ MUST đổi theme của app ngay và MUST được nhớ khi tải lại trang; Theo hệ thống MUST theo cài đặt sáng / tối của hệ điều hành và đổi theo khi hệ điều hành đổi.

#### Scenario: Chọn Sáng
- **WHEN** người dùng chọn thẻ Sáng
- **THEN** app chuyển sang theme sáng, thẻ Sáng được chọn, và sau khi tải lại trang vẫn là theme sáng

#### Scenario: Theo hệ thống
- **WHEN** người dùng chọn Theo hệ thống trong lúc hệ điều hành đang ở chế độ tối
- **THEN** app dùng theme tối, và đổi sang sáng khi hệ điều hành đổi sang sáng

### Requirement: Các cài đặt khác trên dữ liệu mẫu
Ngôn ngữ, định dạng ngày giờ, mức chuyển động, các công tắc thông báo, giờ yên lặng, thiết bị nhận thông báo, múi giờ, "Sáng mai" nghĩa là, nhắc mặc định, tuần bắt đầu từ, dữ liệu Sino đang lưu và phiên đăng nhập MUST hiện giá trị mẫu theo canvas. Mỗi control MUST đổi được và giữ giá trị mới trong phiên làm việc, kể cả khi chuyển giữa trang Cài đặt và trang con; MUST NOT lưu lên máy chủ hay áp vào phần khác của app. Nút Gửi thử, Gỡ, Xuất dữ liệu, Xóa dữ liệu, Đăng xuất thiết bị khác MUST hiện mà chưa làm gì.

#### Scenario: Tắt một thông báo
- **WHEN** người dùng tắt "Đăng ký mới được phát hiện" rồi mở trang con Thông báo trên điện thoại
- **THEN** công tắc đó vẫn tắt

### Requirement: Nguồn đã kết nối và Phiên bản thật
"Nguồn đã kết nối" MUST liệt kê các tài khoản thật của người dùng với nhà cung cấp, địa chỉ và trạng thái, và "Quản lý trong Tài khoản" MUST mở `/accounts`. "Phiên bản" MUST là phiên bản của ứng dụng web.

#### Scenario: Không có tài khoản nào
- **WHEN** người dùng chưa kết nối tài khoản nào
- **THEN** mục hiện "Chưa kết nối tài khoản nào" và liên kết tới `/accounts`

### Requirement: Sticker trong Cài đặt
`/settings/stickers` MUST hiện màn quản lý sticker trong khung Cài đặt. `/stickers` MUST chuyển sang `/settings/stickers`. Thanh bên và trang "Thêm" MUST NOT còn mục "Sticker" riêng; danh sách Cài đặt trên điện thoại MUST có dòng "Sticker".

#### Scenario: Liên kết cũ
- **WHEN** người dùng mở `/stickers`
- **THEN** địa chỉ thành `/settings/stickers` và màn quản lý sticker hiện ra

### Requirement: Cài đặt trên điện thoại
Dưới 768 px `/settings` MUST là danh sách nhóm theo `MobileSettings` (Giao diện; Thông báo và lịch; Tài khoản và dữ liệu; Về Sino; cùng dòng Sticker). Thông báo, lịch và nhắc nhở MUST mở `/settings/notifications` theo `MobileSettingsNotifications`; Chuyển động, Quyền riêng tư và dữ liệu, Bảo mật MUST mở trang con với nội dung của mục đó. Trang con MUST có tiêu đề và nút quay lại, không có thanh tab.

#### Scenario: Mở trang con Thông báo
- **WHEN** ở 390 px người dùng bấm "Thông báo, lịch và nhắc nhở"
- **THEN** trang con hiện các công tắc thông báo, thiết bị, và lịch và nhắc nhở, có nút quay lại về Cài đặt
