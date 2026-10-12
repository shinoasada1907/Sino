## ADDED Requirements

### Requirement: Dòng của chuỗi gộp ghi mọi tài khoản
Khi `accountIds` của một dòng có nhiều hơn một tài khoản, dòng MUST ghi địa chỉ của mọi tài khoản đó theo thứ tự của `accountIds`, cách nhau bằng ", ", ở mọi cỡ màn; từ 1280px MUST ghi sau tên nguồn ("Gmail · tienct07@gmail.com, bonzed2001@gmail.com"). Đầu chuỗi đang mở MUST ghi cùng danh sách. API chưa có `accountIds` MUST được coi là `[accountId]`.

#### Scenario: Chuỗi "xin chào" ở hai tài khoản
- **WHEN** danh sách có dòng "Sinon sama" với `accountIds` = [`tienct07`, `bonzed2001`]
- **THEN** dòng ghi "tienct07@gmail.com, bonzed2001@gmail.com", từ 1280px có "Gmail · " phía trước, và chỉ có một dòng cho chuỗi đó

### Requirement: Thư của bạn ghi địa chỉ trong chuỗi gộp
Khi chuỗi đang mở có nhiều hơn một tài khoản, thư do một tài khoản của bạn gửi MUST ghi người gửi là "Bạn · {địa chỉ gửi}". Chuỗi một tài khoản MUST giữ "Bạn".

#### Scenario: Thư tự gửi giữa hai tài khoản
- **WHEN** chuỗi gộp có thư "Helllo" gửi từ `bonzed2001@gmail.com`
- **THEN** người gửi của thư đó là "Bạn · bonzed2001@gmail.com"

### Requirement: Ô trả lời ghi tài khoản gửi trong chuỗi gộp
Khi chuỗi đang mở có nhiều hơn một tài khoản, ô trả lời MUST ghi "Gửi từ {địa chỉ của bản chính}" ở mọi cỡ màn.

#### Scenario: Trả lời trên mobile
- **WHEN** người dùng mở chuỗi gộp ở cỡ 390px
- **THEN** ô trả lời ghi "Gửi từ tienct07@gmail.com"

### Requirement: Mã của bản khác chuyển về mã của nhóm
Khi web mở `/inbox/{id}` và API trả item có `id` khác, web MUST thay đường dẫn bằng `/inbox/{id của item}`, giữ bộ lọc, không thêm mục vào lịch sử trình duyệt.

#### Scenario: Đường dẫn cũ
- **WHEN** người dùng mở `/inbox/{mã bản của bonzed2001}?view=unread` và mã của nhóm là mã bản của `tienct07`
- **THEN** đường dẫn thành `/inbox/{mã bản của tienct07}?view=unread` và chuỗi mở bình thường
