## ADDED Requirements

### Requirement: Dữ liệu của màn Tài khoản theo hợp đồng
Danh sách MUST lấy dữ liệu từ một nguồn có kiểu `AccountsData` qua `useAccounts()`; chi tiết qua `useAccount(id)`, gồm hàng tài khoản lấy từ danh sách và các phần thêm có kiểu `AccountExtras` (hợp đồng trong `design.md`). Ở change này các hook MUST trả dữ liệu mẫu sinh theo thời điểm hiện tại; component MUST NOT tự chứa dữ liệu mẫu. Các phần `scopes`, `sites`, `syncRuns`, `activity` của chi tiết có thể là `null`; khi đó khối tương ứng MUST hiện "Chưa có dữ liệu" và các khối khác hiện bình thường.

#### Scenario: Backend chưa có lịch sử đồng bộ
- **WHEN** `syncRuns` là `null`
- **THEN** khối "Lịch sử đồng bộ" hiện "Chưa có dữ liệu" và các khối khác của trang chi tiết vẫn hiện dữ liệu

### Requirement: Danh sách tài khoản
Trang `/accounts` MUST hiện theo canvas `Accounts`: dòng "TÀI KHOẢN · N ĐÃ KẾT NỐI", tiêu đề, đoạn giới thiệu, nút "Đồng bộ tất cả" và "Kết nối tài khoản"; dải tóm tắt với số tài khoản ổn định, đang đồng bộ, cần đăng nhập lại, giờ đồng bộ gần nhất và số thư đã lưu; một cảnh báo cho mỗi tài khoản `AUTH_EXPIRED` kèm nút "Đăng nhập lại"; bảng có các cột Danh tính, Nhà cung cấp, Đồng bộ, Lần cuối, Dịch vụ (số kênh đang bật), Sức khỏe. Trên mobile (dưới 768px) trang MUST hiện danh sách gọn theo `MobileAccounts`.

#### Scenario: Ba tài khoản, một cần đăng nhập lại
- **WHEN** có Gmail đang chạy (đồng bộ 2 phút trước, quyền tự gia hạn), Zalo đang đồng bộ lần đầu 64% (quyền hết hạn sau 5 ngày) và Messenger hết quyền lúc 21:04 hôm qua, xem lúc 14:05
- **THEN** trang hiện "TÀI KHOẢN · 3 ĐÃ KẾT NỐI", dải tóm tắt "1 ổn định", "1 đang đồng bộ", "1 cần đăng nhập lại", cảnh báo "Messenger an.nguyen.92 cần đăng nhập lại", và hàng Zalo có "Đang đồng bộ · 64%" và "Quyền hết hạn sau 5 ngày"

### Requirement: Tìm và lọc tài khoản
Ô tìm kiếm MUST lọc theo `externalAccountId`, `displayName` và tên nhà cung cấp, không phân biệt hoa thường và dấu tiếng Việt. Bộ lọc "Tất cả / Cần xử lý" MUST chỉ giữ tài khoản `AUTH_EXPIRED` hoặc `ERROR` khi chọn "Cần xử lý". Khi không còn tài khoản nào khớp, bảng MUST báo "Không có tài khoản nào khớp".

#### Scenario: Tìm không dấu
- **WHEN** người dùng gõ "nguyen.92"
- **THEN** bảng chỉ còn hàng Messenger

#### Scenario: Chỉ tài khoản cần xử lý
- **WHEN** người dùng chọn "Cần xử lý"
- **THEN** bảng chỉ còn hàng Messenger, và nút "Cần xử lý" có `aria-pressed="true"`

### Requirement: Chi tiết tài khoản
Bấm một hàng (hoặc nút mở chi tiết của hàng) MUST mở `/accounts/:id` theo canvas `AccountDetail`: liên kết quay lại "Tài khoản", ảnh đại diện, `externalAccountId` làm tiêu đề, dòng "Nhà cung cấp · tên · kết nối từ ngày" và trạng thái; các khối "Kênh đã kết nối" (mỗi kênh một công tắc), "Quyền đã cấp", "Website dùng danh tính này", "Lịch sử đồng bộ", "Hoạt động" và "Ngắt kết nối tài khoản". Trên mobile trang MUST theo `MobileAccountDetail` và không có thanh điều hướng dưới đáy. Đường dẫn với `id` không tồn tại MUST hiện thông báo không tìm thấy tài khoản kèm liên kết về danh sách.

#### Scenario: Mở chi tiết Gmail
- **WHEN** người dùng bấm hàng Gmail
- **THEN** web mở `/accounts/acc-gmail`, tiêu đề là "an.nguyen@gmail.com" và khối "Kênh đã kết nối" ghi "3 bật · 1 tắt"

### Requirement: Bật tắt kênh
Mỗi công tắc kênh MUST đổi trạng thái bật/tắt của kênh đó qua mutation `setChannel` và các chỗ dùng nó (số "bật · tắt", cột Dịch vụ của danh sách) MUST cập nhật ngay. Kênh `available = false` MUST hiện "cần thêm quyền" và công tắc của nó MUST không bấm được.

#### Scenario: Tắt Thư đến
- **WHEN** người dùng tắt công tắc "Thư đến" của Gmail
- **THEN** khối kênh ghi "2 bật · 2 tắt" và cột Dịch vụ của hàng Gmail trong danh sách là 2

### Requirement: Ngắt kết nối tài khoản
Nút "Ngắt kết nối …" MUST mở hộp thoại theo canvas `Overlays`: tiêu đề "Ngắt kết nối <tên nhà cung cấp>?", đoạn giải thích, công tắc "Xóa luôn tin nhắn đã lưu", nút "Hủy" và "Ngắt kết nối". "Hủy" hoặc phím Esc MUST đóng hộp thoại mà không đổi gì. "Ngắt kết nối" MUST gọi mutation `disconnect` (kèm lựa chọn xóa tin), bỏ tài khoản khỏi danh sách và đưa người dùng về `/accounts`.

#### Scenario: Hủy ngắt kết nối
- **WHEN** người dùng mở hộp thoại ngắt kết nối Messenger rồi bấm "Hủy"
- **THEN** hộp thoại đóng và Messenger vẫn còn

#### Scenario: Xác nhận ngắt kết nối
- **WHEN** người dùng xác nhận ngắt kết nối Messenger
- **THEN** web về `/accounts`, bảng không còn hàng Messenger và dòng đầu trang ghi "TÀI KHOẢN · 2 ĐÃ KẾT NỐI"

### Requirement: Nút chưa có chức năng trên màn Tài khoản
"Đồng bộ tất cả", "Đồng bộ ngay", "Mở <nhà cung cấp>" và "Xem tất cả" (website) MUST hiện như canvas và MUST NOT đổi trang hay đổi dữ liệu. ("Kết nối tài khoản", "Đăng nhập lại" và nút "+" trên mobile mở luồng kết nối của change `fe-ui-connect`.)

#### Scenario: Bấm Đồng bộ tất cả
- **WHEN** người dùng bấm "Đồng bộ tất cả"
- **THEN** đường dẫn vẫn là `/accounts` và danh sách không đổi
