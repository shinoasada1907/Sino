## ADDED Requirements

### Requirement: Task kiểu gọn
Một task MUST có tiêu đề không rỗng tối đa 200 ký tự và trạng thái `OPEN` hoặc `DONE`; MAY có ghi chú, hạn (có giờ hoặc cả ngày), một nhắc nhở, một quy tắc lặp và một nguồn (tin nhắn hoặc cuộc trò chuyện). Task MUST NOT có danh sách, độ ưu tiên, nhãn hay việc con.

#### Scenario: Tạo task có hạn
- **WHEN** người dùng tạo task "Gửi lại phụ lục giá" với hạn 07/10 17:00
- **THEN** task được lưu ở trạng thái `OPEN` với hạn đó

#### Scenario: Tiêu đề rỗng
- **WHEN** người dùng lưu task không có tiêu đề
- **THEN** yêu cầu bị từ chối với lỗi validation theo error model của F01

### Requirement: Tạo task từ tin nhắn
Khi tạo task từ một tin nhắn, hệ thống MUST gợi ý tiêu đề "Trả lời: <chủ đề hoặc người gửi>" và MUST lưu liên kết tới tin nhắn nguồn (chỉ loại và ID). "Nhắc tôi" trên một tin nhắn MUST tạo một task như vậy kèm nhắc nhở.

#### Scenario: Nhắc tôi trả lời thư
- **WHEN** người dùng chọn "Nhắc tôi" → "Sáng mai 9:00" trên thư "Hợp đồng thuê văn phòng"
- **THEN** một task "Trả lời: Hợp đồng thuê văn phòng" được tạo, liên kết tới thư đó, có nhắc nhở lúc 9:00 sáng mai

#### Scenario: Mở tin nhắn gốc từ task
- **WHEN** người dùng mở một task có nguồn
- **THEN** task có liên kết đưa về đúng tin nhắn nguồn trong Hộp thư

### Requirement: Hoàn thành và mở lại
Đánh dấu Xong MUST chuyển task sang `DONE`, lưu thời điểm hoàn thành và hủy nhắc nhở chưa báo. Task `DONE` MUST mở lại được về `OPEN`.

#### Scenario: Hoàn thành task có nhắc
- **WHEN** người dùng đánh dấu Xong một task còn nhắc nhở chưa tới giờ
- **THEN** task thành `DONE` và nhắc nhở đó bị hủy

### Requirement: Task lặp lại
Task MAY có quy tắc lặp: hằng ngày, hằng tuần vào các thứ chọn, hằng tháng theo ngày, hằng năm, với chu kỳ mỗi N lần, kết thúc theo ngày hoặc số lần. Khi task lặp được đánh dấu Xong, hệ thống MUST tạo lần kế tiếp tính từ **hạn theo lịch** (không theo ngày hoàn thành), tính theo múi giờ của người dùng: lần kế tiếp là lần theo lịch đầu tiên sau hạn hiện tại mà không rơi vào trước hôm nay; các lần đã lỡ bị bỏ qua nhưng vẫn tính vào số lần lặp. Ngày không tồn tại trong tháng (31, 29/02) MUST dùng ngày cuối tháng, và tháng sau đó MUST quay về ngày gốc.

#### Scenario: Lặp hằng tuần
- **WHEN** người dùng đánh dấu Xong vào thứ Tư task "Báo cáo tuần" lặp mỗi thứ Hai, hạn thứ Hai 05/10 9:00
- **THEN** task kế tiếp được tạo với hạn thứ Hai 12/10 9:00

#### Scenario: Lặp hằng tháng vào ngày 31
- **WHEN** task lặp hằng tháng ngày 31 có lần kế tiếp rơi vào tháng 11
- **THEN** hạn của lần đó là 30/11, và lần của tháng 12 là 31/12

#### Scenario: Hoàn thành trễ nhiều chu kỳ
- **WHEN** task lặp mỗi thứ Hai có hạn 05/10 được đánh dấu Xong vào thứ Tư 21/10
- **THEN** task kế tiếp có hạn thứ Hai 26/10; các lần 12/10 và 19/10 bị bỏ qua

#### Scenario: Hết số lần lặp
- **WHEN** task lặp 3 lần được đánh dấu Xong ở lần thứ 3
- **THEN** không tạo lần kế tiếp

### Requirement: Nhóm hiển thị task
Danh sách task MUST được nhóm theo Quá hạn, Hôm nay, Sắp tới, Không có hạn và Đã xong, tính theo ngày ở múi giờ của người dùng.

#### Scenario: Task quá hạn
- **WHEN** một task `OPEN` có hạn trước thời điểm hiện tại
- **THEN** task nằm ở nhóm Quá hạn
