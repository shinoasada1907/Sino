## ADDED Requirements

### Requirement: Hộp thư mở theo thư mục
Web MUST đọc `?folder=` ở `/inbox`: `sent` MUST gọi `GET /api/conversations?view=sent&kind=email`, `trash` MUST gọi `view=trash&kind=email`, `archive` MUST gọi `view=archived&kind=email`. Giá trị khác MUST hiện hộp thư thường. Khi có `folder`, tiêu đề MUST là tên thư mục ("Đã gửi", "Thư rác", "Đã lưu trữ"), tab bộ lọc của hộp thư MUST ẩn, bộ lọc tài khoản MUST vẫn dùng được, và mục tương ứng ở sidebar MUST sáng thay cho "Hộp thư".

#### Scenario: Bấm Đã gửi
- **WHEN** người dùng bấm "Đã gửi" ở sidebar
- **THEN** địa chỉ là `/inbox?folder=sent`, danh sách là kết quả của `view=sent&kind=email`, tiêu đề "Đã gửi", mục "Đã gửi" sáng

#### Scenario: Thư mục rỗng
- **WHEN** `view=trash` trả trang rỗng
- **THEN** màn hiện "Thư rác trống" thay vì trạng thái rỗng của hộp thư

#### Scenario: Giá trị lạ
- **WHEN** người dùng mở `/inbox?folder=drafts`
- **THEN** màn hiện hộp thư thường và không mục thư mục nào sáng

#### Scenario: Lọc tài khoản trong thư mục
- **WHEN** người dùng đang ở `/inbox?folder=archive` và chọn tài khoản A
- **THEN** request có `view=archived&kind=email&accountId=<A>` và địa chỉ giữ `folder=archive`
