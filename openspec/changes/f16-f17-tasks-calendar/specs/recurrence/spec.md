## ADDED Requirements

### Requirement: Dạng quy tắc lặp
Một quy tắc lặp MUST có tần suất `DAILY`, `WEEKLY`, `MONTHLY` hoặc `YEARLY`, chu kỳ "mỗi N lần" với N từ 1 tới 99, và MAY có một điểm dừng: ngày cuối (gồm cả ngày đó) hoặc số lần từ 1 tới 999, không được có cả hai. Quy tắc luôn gắn với một mốc (hạn của việc hoặc lúc bắt đầu của lịch hẹn); mốc là lần thứ nhất và được tính vào số lần. `WEEKLY` MUST có ít nhất một thứ và MUST có thứ của mốc. `MONTHLY` và `YEARLY` MUST có ngày gốc bằng ngày của mốc, hoặc lớn hơn khi mốc là ngày cuối tháng; thiếu ngày gốc thì hệ thống lấy ngày của mốc. Ngày cuối MUST NOT trước ngày của mốc. Request sai về ô MUST bị từ chối với `400 VALIDATION_FAILED`; quy tắc không khớp mốc MUST bị từ chối với `422 INVALID_RECURRENCE`.

#### Scenario: Có cả ngày cuối và số lần
- **WHEN** người dùng lưu quy tắc hằng tuần có `untilDate` 31/12 và `count` 10
- **THEN** yêu cầu bị từ chối với `400 VALIDATION_FAILED`

#### Scenario: Thứ của mốc không có trong quy tắc
- **WHEN** người dùng lưu một việc hạn thứ Tư 07/10 với quy tắc hằng tuần vào thứ Hai và thứ Sáu
- **THEN** yêu cầu bị từ chối với `422 INVALID_RECURRENCE`

#### Scenario: Không gửi ngày gốc
- **WHEN** người dùng lưu một việc hạn 31/10 với quy tắc hằng tháng không có `byMonthDay`
- **THEN** quy tắc được lưu với ngày gốc 31

### Requirement: Lần lặp theo ngày gốc
Lần lặp hằng tháng MUST rơi vào ngày gốc của quy tắc; tháng không có ngày đó thì rơi vào ngày cuối tháng, và tháng sau đó MUST quay lại ngày gốc. Lần lặp hằng năm MUST giữ tháng của mốc và theo cùng cách đó (29/02 rơi vào 28/02 ở năm thường). Lần lặp hằng tuần MUST rơi vào các thứ của quy tắc trong các tuần (thứ Hai đầu tuần) cách tuần của mốc một bội số của N.

#### Scenario: Hằng tháng ngày 31
- **WHEN** tính các lần của quy tắc hằng tháng mốc 31/10/2026
- **THEN** các lần là 31/10, 30/11, 31/12/2026, 31/01/2027, 28/02/2027, 31/03/2027

#### Scenario: Hằng năm ngày 29/02
- **WHEN** tính các lần của quy tắc hằng năm mốc 29/02/2028
- **THEN** các lần là 29/02/2028, 28/02/2029, 28/02/2030, 28/02/2031, 29/02/2032

#### Scenario: Hai tuần một lần vào thứ Hai và thứ Năm
- **WHEN** tính các lần của quy tắc "mỗi 2 tuần, thứ Hai và thứ Năm" mốc thứ Hai 05/10/2026
- **THEN** các lần đầu là 05/10, 08/10, 19/10, 22/10, 02/11

### Requirement: Giờ địa phương ổn định
Lần lặp có giờ MUST giữ giờ địa phương của mốc theo múi giờ lưu cùng quy tắc, kể cả qua đổi giờ mùa hè. Khi tạo hoặc đặt quy tắc, múi giờ đó MUST là múi giờ cấu hình `sino.planner.time-zone` (mặc định `Asia/Ho_Chi_Minh`).

#### Scenario: Qua đổi giờ mùa hè
- **WHEN** một quy tắc hằng tuần có mốc thứ Hai 9:00 ở `Europe/Berlin` trước ngày đổi giờ cuối tháng 10
- **THEN** lần của tuần sau ngày đổi giờ vẫn là 9:00 giờ Berlin (thời điểm UTC lệch một giờ so với lần trước)

### Requirement: Các lần trong một khoảng
Hệ thống MUST tính được mọi lần của một quy tắc có ngày nằm trong một khoảng [từ, đến), có thứ tự của từng lần, tôn trọng số lần và ngày cuối; MUST NOT lưu sẵn từng lần. Khoảng ở xa mốc MUST tính được mà không phải đi qua từng lần từ mốc.

#### Scenario: Khoảng sau khi đã hết số lần
- **WHEN** tính các lần của quy tắc hằng ngày 5 lần mốc 01/10 trong khoảng [06/10, 13/10)
- **THEN** không có lần nào

#### Scenario: Khoảng cách mốc nhiều năm
- **WHEN** tính các lần của quy tắc hằng ngày không điểm dừng mốc 01/01/2020 trong khoảng [01/10/2026, 08/10/2026)
- **THEN** có đúng 7 lần, từ 01/10 tới 07/10/2026

### Requirement: Lần kế tiếp sau khi hoàn thành
Lần kế tiếp của một lần MUST là lần đầu tiên theo quy tắc nằm sau lần đó mà ngày không trước hôm nay (theo múi giờ của quy tắc). Các lần bị bỏ qua MUST vẫn được tính vào số lần. Không còn lần nào trong số lần hay trước ngày cuối thì không có lần kế tiếp.

#### Scenario: Hoàn thành trễ nhiều chu kỳ
- **WHEN** lần hạn thứ Hai 05/10 của quy tắc mỗi thứ Hai được tính lần kế tiếp vào thứ Tư 21/10
- **THEN** lần kế tiếp là thứ Hai 26/10; 12/10 và 19/10 bị bỏ qua nhưng vẫn tính vào số lần

#### Scenario: Hết số lần
- **WHEN** tính lần kế tiếp của lần thứ 3 trong quy tắc 3 lần
- **THEN** không có lần kế tiếp
