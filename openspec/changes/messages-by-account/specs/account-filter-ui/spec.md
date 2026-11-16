## ADDED Requirements

### Requirement: Cột tài khoản
Ở Tin nhắn và Hộp thư, từ 1280px, phần đầu cột trái MUST là danh sách tài khoản thay cho "Nguồn" (D-429): mục "Tất cả" với số chưa đọc tổng, rồi các tài khoản của loại màn đó xếp dưới tên nhà cung cấp của chúng, mỗi tài khoản có chấm trạng thái, tên hoặc địa chỉ, và số chưa đọc lấy từ `byAccount[<id>].unread` (không hiện khi bằng 0). Tài khoản cần đăng nhập lại MUST có chấm đỏ thay cho số. "Thêm nguồn" MUST giữ ở cuối. Bấm một tài khoản MUST lọc danh sách theo tài khoản đó và MUST NOT mở trang tài khoản; mục đang chọn MUST có `aria-current="page"`. Khi đang lọc một tài khoản, đầu danh sách MUST có liên kết "Xem tài khoản" tới `/accounts/<id>`.

#### Scenario: Lọc một tài khoản Zalo
- **WHEN** chủ có hai tài khoản Zalo "Tiến Nguyễn" và "Nguyễn Thành Tiến", và người dùng bấm "Nguyễn Thành Tiến" ở cột trái của `/messages`
- **THEN** đường dẫn là `/messages?account=<id của Nguyễn Thành Tiến>`, danh sách chỉ còn chat của tài khoản đó, mục "Nguyễn Thành Tiến" có `aria-current="page"`, và đầu danh sách có "Xem tài khoản"

#### Scenario: Tài khoản cần đăng nhập lại
- **WHEN** tài khoản Zalo "Tiến Nguyễn" có trạng thái `AUTH_EXPIRED`
- **THEN** mục "Tiến Nguyễn" có chấm đỏ và chữ đọc được "cần đăng nhập lại", không có số

### Requirement: Tài khoản trên tablet và điện thoại
Từ 768 đến 1279px, đầu danh sách MUST có một ô chọn tài khoản ("Tất cả" và từng tài khoản của loại màn, kèm số chưa đọc). Dưới 768px, đầu danh sách MUST có một hàng chip cuộn ngang: "Tất cả" và từng tài khoản, mỗi chip ghi tên kèm số chưa đọc khi khác 0 (`Tất cả · 2`, `Nguyễn Thành Tiến · 1`); chip đang chọn MUST có `aria-pressed="true"`. Cả hai MUST dùng cùng tham số `account` của địa chỉ như cột trái.

#### Scenario: Chip trên điện thoại
- **WHEN** người dùng ở `/messages` trên màn 390px và chạm chip "Nguyễn Thành Tiến · 1"
- **THEN** đường dẫn có `account=<id của Nguyễn Thành Tiến>` và chip đó có `aria-pressed="true"`

### Requirement: Bộ lọc tài khoản trong địa chỉ
Tài khoản đang chọn MUST nằm trong địa chỉ là `account=<ID tài khoản>` (D-428), và danh sách MUST được hỏi với `accountId` bằng giá trị đó. `account` là ID không có trong danh sách tài khoản của màn (lạ, đã xóa, hay thuộc loại kia) MUST được coi là "Tất cả". Tham số cũ `source` MUST bị bỏ qua (coi là "Tất cả").

#### Scenario: Tài khoản loại kia trong địa chỉ
- **WHEN** người dùng mở `/messages?account=<id của một tài khoản Gmail>&view=unread`
- **THEN** cột trái chọn "Tất cả", tab "Chưa đọc" vẫn chọn, và danh sách được hỏi không có `accountId`

#### Scenario: Link cũ có source
- **WHEN** người dùng mở `/inbox?source=gmail`
- **THEN** cột trái chọn "Tất cả" và danh sách là mọi thread email

### Requirement: Số theo tài khoản đang chọn
Khi đang chọn một tài khoản, số trên tab và trên bộ lọc nhanh (Chưa đọc, Cần trả lời, Có tệp) MUST lấy từ `byAccount[<id>]`; ở "Tất cả" MUST lấy từ các số tổng (D-431). Các số đó MUST NOT đổi theo chip Cá nhân / Nhóm.

#### Scenario: Cần trả lời của một tài khoản
- **WHEN** `byAccount[B].needsReply` = 2, `needsReply` tổng = 5, và người dùng chọn tài khoản B ở `/messages`
- **THEN** tab "Cần trả lời" ghi 2; chọn lại "Tất cả" thì ghi 5

### Requirement: Đọc và lưu trữ đổi số của mọi tài khoản giữ cuộc trò chuyện
Khi người dùng đánh dấu đã đọc, chưa đọc, hay lưu trữ một cuộc trò chuyện, web MUST đổi ngay số tổng và `byAccount` của **mọi** tài khoản trong `accountIds` của dòng đó, trước khi server trả lời; server báo lỗi thì MUST hoàn lại các số như trước (D-432).

#### Scenario: Đọc thread ở hai tài khoản
- **WHEN** một thread chưa đọc có `accountIds` = [D, E], `byAccount[D].unread` = 1, `byAccount[E].unread` = 2, và người dùng mở nó ở `/inbox`
- **THEN** ngay khi mở, cột trái ghi D không số (0) và E là 1; nếu `PATCH` trả lỗi, D về 1 và E về 2

### Requirement: Thanh tin mới theo tài khoản đang xem
Khi đang lọc một tài khoản, thanh "N tin mới" MUST chỉ đếm cuộc trò chuyện của tài khoản đó; tin mới của tài khoản khác MUST chỉ làm đổi số của tài khoản đó ở cột trái (D-433). Ở "Tất cả", thanh đếm như hôm nay.

#### Scenario: Tin tới tài khoản khác
- **WHEN** người dùng đang ở `/messages?account=<A>` và một tin mới tới chat của tài khoản B
- **THEN** không có thanh "1 tin mới", và số của B ở cột trái tăng 1

### Requirement: Đổi bộ lọc khi đang mở một cuộc trò chuyện
Khi đang mở một cuộc trò chuyện mà người dùng đổi tài khoản hay chip Cá nhân / Nhóm, cuộc trò chuyện MUST vẫn mở nếu nó khớp bộ lọc mới (`accountIds` có tài khoản được chọn, loại khớp chip), hoặc bộ lọc mới là "Tất cả" / "Mọi chat"; không khớp thì MUST đóng, về danh sách với bộ lọc mới (D-434).

#### Scenario: Đổi sang tài khoản không giữ chat
- **WHEN** người dùng đang mở chat "Hà" của tài khoản A ở `/messages/<id của Hà>` từ 1280px và bấm tài khoản B
- **THEN** đường dẫn thành `/messages?account=<B>` và khung chat trở lại "Chọn một cuộc trò chuyện để đọc."

#### Scenario: Chọn Tất cả
- **WHEN** người dùng đang mở chat "Hà" với `account=<A>` và bấm "Tất cả"
- **THEN** chat "Hà" vẫn mở và đường dẫn không còn `account`
