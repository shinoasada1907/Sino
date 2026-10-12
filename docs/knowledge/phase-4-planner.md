# Kiến thức Phase 4 — Việc cần làm và Lịch

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** phần lõi của F16 + F17, `openspec/changes/f16-f17-tasks-calendar` (việc cần làm có hạn và lặp lại, lịch hẹn, xem lịch theo khoảng ngày; chưa có nhắc nhở, chưa gắn tin nhắn): BE-70.
> **Cập nhật:** 2026-10-12. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

---

## 0. Bức tranh: một module mới đứng riêng

Màn Việc cần làm và Lịch của web đã dựng xong với dữ liệu mẫu (Phase 1). Phase 4 cho chúng một backend thật: module mới `planner`, không phụ thuộc Gmail hay Hộp thư (người dùng 2026-10-12: "làm độc lập với Gmail ... như là làm 1 tính năng độc lập").

```text
 web: màn Việc cần làm                 web: màn Lịch (Tuần / Tháng / Lịch trình)
        |                                        |
        v                                        v
  /api/tasks/**                         /api/events/**, GET /api/calendar?from=&to=
        |                                        |
        +-------------- module planner ----------+
        |   bảng task              bảng calendar_event
        |          \                  /
        |           RecurrenceCalculator   <- quy tắc lặp, tính khi cần, không lưu sẵn
        |
   chỉ phụ thuộc: identity (ai đang gọi), common (lỗi, đồng hồ)
```

| Quyết định | Nội dung |
|---|---|
| D-150 | F16 + F17 chung một change; chưa nhắc nhở, chưa gắn tin nhắn (người dùng) |
| D-151 | Sửa / xóa lịch hẹn lặp áp cho cả chuỗi (người dùng) |
| D-152 | Quy tắc lặp là các cột `rec_*` ngay trong hàng, không bảng riêng, không chuỗi RRULE |
| D-153 | `PATCH` cho tiêu đề và ghi chú; `PUT …/schedule` cho hạn + lặp |
| D-154 | Mở lại việc lặp thì giữ lần kế tiếp đã tạo |
| D-155 | `GET /api/calendar` tối đa 62 ngày |
| D-156 | JPA với `@Version`, như module `account` |
| D-157 | Múi giờ là cấu hình `sino.planner.time-zone`; mỗi quy tắc giữ múi giờ của nó |
| D-158 | Biểu mẫu web theo lớp phủ `InboxTask` / `InboxEvent` của canvas |

---

## 1. Quy tắc lặp và `RecurrenceCalculator` (BE-70)

**Ở đâu:** `planner/domain/Frequency`, `Recurrence`, `Occurrence`, `RecurrenceCalculator`, `PlannerErrorCode`; `planner/application/PlannerProperties`, `PlannerConfiguration`; `application.yaml` (`sino.planner.time-zone`).

```text
Recurrence  = tần suất (DAILY / WEEKLY / MONTHLY / YEARLY), mỗi N lần, các thứ (WEEKLY),
              ngày gốc (MONTHLY / YEARLY), dừng: tới ngày hoặc sau N lần, múi giờ
Occurrence  = (thứ tự trong chuỗi, ngày)          lần đầu tiên (mốc) có thứ tự 0

RecurrenceCalculator.between(rule, anchor, from, to)  -> các lần có ngày trong [from, to)
RecurrenceCalculator.nextAfter(rule, current, today)  -> lần kế tiếp khi đánh dấu xong
rule.instantAt(ngày, giờ địa phương)                  -> thời điểm (Instant) theo múi giờ của quy tắc
```

### 1.1 `record` làm value object, và hai loại lỗi
`Recurrence` là một `record`: bất biến, `equals` / `hashCode` so theo giá trị, không có setter. Mọi kiểm tra nằm trong **compact constructor** (khối `public Recurrence { ... }` không có danh sách tham số), nên không tạo được một quy tắc hỏng ở bất kỳ đâu trong code.

Có hai loại lỗi và chúng được báo khác nhau:

| Lỗi | Ví dụ | Báo bằng | Vì sao |
|---|---|---|---|
| Quy tắc tự nó sai | mỗi 0 lần, có cả ngày dừng lẫn số lần | `IllegalArgumentException` | API sẽ kiểm các giới hạn này trước (Bean Validation, `400`); tới được constructor nghĩa là code có lỗi |
| Quy tắc không khớp mốc | hạn rơi vào thứ Tư nhưng quy tắc chỉ có thứ Hai và thứ Sáu | `SinoException(INVALID_RECURRENCE)` → `422` | phải đổi hạn ra ngày theo múi giờ mới biết thứ mấy, nên chỉ domain kiểm được; đây là lỗi người dùng cần thấy |

`anchoredAt(anchor)` làm việc thứ hai: kiểm quy tắc với ngày đầu tiên, và nếu quy tắc hằng tháng / hằng năm chưa có ngày gốc thì lấy ngày của mốc.

### 1.2 Tập các thứ: `EnumSet` và bản sao không sửa được
Thứ trong tuần là `java.time.DayOfWeek`, một enum. `EnumSet` là `Set` dành riêng cho enum: bên trong chỉ là một dãy bit, và luôn duyệt theo thứ tự khai báo (thứ Hai trước Chủ nhật) — đúng thứ tự cần khi tính tuần.

Bẫy của `record`: nó trả ra đúng object nó giữ. Nếu constructor giữ nguyên `Set` người gọi đưa vào, người gọi sửa `Set` đó sau này thì quy tắc đổi theo. Vì vậy constructor chép ra một bản mới rồi bọc lại để không ai thêm bớt được:

```java
byWeekdays = byWeekdays == null || byWeekdays.isEmpty()
        ? Set.of()
        : Collections.unmodifiableSet(EnumSet.copyOf(byWeekdays));
```

(`EnumSet.copyOf` ném lỗi khi nhận một tập rỗng không phải `EnumSet`, nên trường hợp rỗng xử lý riêng.) Test `theWeekdaysCannotBeChangedFromOutside` kiểm đúng điều này; lần kiểm tra ngược bỏ `EnumSet.copyOf` đi thì test đó đỏ.

### 1.3 Mốc là lần thứ nhất; nhìn chuỗi từ một lần bất kỳ
Một việc lặp chỉ có **một lần đang mở**. Khi đánh dấu xong, máy chủ tạo lần kế tiếp thành một việc mới. Vậy lần kế tiếp tính từ đâu? Từ chính việc vừa xong: ngày hạn của nó và thứ tự của nó trong chuỗi (`Occurrence(index, date)`). Calculator coi lần đó là mốc, và số lần còn lại là `count - index`.

Nhờ vậy không cần lưu ngày đầu tiên của cả chuỗi. Điều này đúng vì mỗi lần do calculator tạo ra đều rơi đúng một ngày của quy tắc: ngày của nó cũng là mốc hợp lệ cho các lần sau. Kể cả "mỗi 2 tuần, thứ Hai và thứ Năm": một lần rơi vào thứ Năm thì tuần của nó vẫn là một tuần "đến lượt", nên tính tiếp từ đó vẫn ra đúng nhịp hai tuần.

### 1.4 Vì sao lặp hằng tháng tính từ ngày gốc, không từ lần trước (câu gợi ý của task)
Lấy việc "Trả tiền nhà" ngày 31, bắt đầu 31/10/2026:

| Cách tính | 10 | 11 | 12 | 1 | 2 | 3 |
|---|---|---|---|---|---|---|
| Từ **lần trước** (+1 tháng) | 31/10 | 30/11 | 30/12 | 30/01 | 28/02 | 28/03 |
| Từ **ngày gốc** 31 (Sino) | 31/10 | 30/11 | 31/12 | 31/01 | 28/02 | 31/03 |

`LocalDate.plusMonths(1)` của 31/10 cho 30/11 (Java tự lùi về cuối tháng). Nhưng lần sau lấy 30/11 cộng tiếp một tháng thì được 30/12: ngày 31 đã mất, và mỗi tháng ngắn lại kéo ngày lùi thêm. Vì thế quy tắc giữ **ngày gốc** (`byMonthDay = 31`) và mỗi lần tính lại từ đó: tháng có ngày 31 thì dùng 31, tháng không có thì dùng ngày cuối tháng.

```java
private LocalDate onMonthDay(YearMonth month) {
    return month.atDay(Math.min(monthDay, month.lengthOfMonth()));
}
```

Hằng năm làm y như vậy: 29/02/2028 → 28/02/2029, 2030, 2031 → 29/02/2032. Cũng vì thế mà một việc hạn 30/11 có thể mang ngày gốc 31: `anchoredAt` chấp nhận ngày gốc lớn hơn ngày của mốc **chỉ khi** mốc là ngày cuối tháng.

### 1.5 Nhảy thẳng tới khoảng đang xem
Màn Lịch hỏi một khoảng ngày, ví dụ tuần 01/10 – 07/10/2026, cho một việc "mỗi ngày" bắt đầu từ 01/01/2020. Sinh lần lượt từ 2020 rồi lọc thì phải đi qua hơn 2.400 lần cho mỗi request. Calculator tránh việc đó bằng hai hàm:

- `dateOf(step)`: ngày của lần thứ `step` tính thẳng bằng công thức. Hằng ngày: `mốc + step × N ngày`. Hằng tháng: tháng của mốc cộng `step × N` tháng rồi đặt ngày gốc. Hằng tuần: tuần thứ mấy và thứ mấy trong tuần, suy ra từ `step` và số thứ đã chọn.
- `firstOnOrAfter(day)`: ước lượng `step` gần ngày cần tìm bằng phép chia (số ngày / N, số tháng / N…), rồi bước tới vài lần cho tới khi `dateOf(step) >= day`.

```text
between(rule, anchor, from, to):
    step = firstOnOrAfter(from)          // nhảy, không đi từ mốc
    lặp: date = dateOf(step)
         dừng nếu date >= to, hoặc quá số lần, hoặc sau ngày dừng
         ghi (anchor.index + step, date); step++
```

Đây là ý "sinh lần lặp trong khoảng [từ, đến) thay vì sinh hết rồi lọc" của `planner-from-messages`. Test `a range far from the anchor` kiểm đúng ca này.

### 1.6 Lần kế tiếp: bỏ lần đã lỡ nhưng vẫn đếm
`nextAfter(rule, current, today)` trả lần đầu tiên **sau** `current` mà ngày **không trước hôm nay**. Việc "Báo cáo tuần" hạn thứ Hai 05/10 mà tới thứ Tư 21/10 mới đánh dấu xong: các lần 12/10 và 19/10 đã qua, lần kế tiếp là 26/10 (không tạo ba việc trễ một lúc). Hai lần bị bỏ vẫn được tính vào số lần lặp, nên một quy tắc "3 lần" có thể hết sớm hơn khi làm trễ: test `skippedOccurrencesUseUpTheCount`.

### 1.7 Giờ địa phương và đổi giờ mùa hè
Calculator chỉ tính **ngày**. Giờ được gắn sau, bằng múi giờ của quy tắc:

```java
public Instant instantAt(LocalDate date, LocalTime time) {
    return ZonedDateTime.of(date, time, timeZone).toInstant();
}
```

Việt Nam không đổi giờ mùa hè, nên ở đây giờ địa phương và UTC luôn lệch đúng 7 tiếng. Nhưng nếu cộng "7 ngày" vào một `Instant`, một lịch hẹn 9:00 ở Berlin sẽ thành 8:00 sau ngày 25/10/2026 (ngày Đức bỏ giờ mùa hè). Tính trên ngày rồi mới gắn `09:00` ở `Europe/Berlin` thì lần nào cũng là 9:00 giờ Berlin, còn thời điểm UTC tự lệch một tiếng: test `theLocalTimeStaysTheSameAcrossADaylightSavingChange`.

Mỗi quy tắc giữ múi giờ của nó (`timeZone`, cột `rec_time_zone` từ BE-71): nếu sau này đổi cấu hình múi giờ, các chuỗi cũ không bị trôi giờ.

### 1.8 Cấu hình múi giờ: `@ConfigurationProperties` nhận thẳng `ZoneId`
```java
@ConfigurationProperties("sino.planner")
public record PlannerProperties(ZoneId timeZone) { ... mặc định Asia/Ho_Chi_Minh ... }
```
```yaml
sino:
  planner:
    time-zone: ${SINO_PLANNER_TIME_ZONE:Asia/Ho_Chi_Minh}
```
Spring đổi chuỗi `"Asia/Ho_Chi_Minh"` thành `ZoneId` bằng cách gọi hàm tĩnh `ZoneId.of(String)` của chính kiểu đó (bộ chuyển đổi chung của Spring tìm hàm `of` / `valueOf` / `from`). Tên sai như `Mars/Olympus_Mons` làm `ZoneId.of` ném lỗi, việc gắn cấu hình hỏng và ứng dụng **không khởi động**, với thông báo nêu đúng `sino.planner.time-zone`. Lỗi lộ ra ngay lúc chạy, không phải lúc một người dùng mở Lịch.

**Vì sao `sino.planner` chứ không `sino.user`:** cấu hình nằm trong module dùng nó. `sino.user` không thuộc module nào; người dùng hiện là `sino.owner.*` của module `identity`, mà sửa `identity` nằm ngoài phạm vi. Khi Sino có hồ sơ người dùng, múi giờ chuyển vào đó.

### 1.9 Kiểm tra ngược tìm ra gì
Kiểm tra ngược (mutation testing) là cố ý làm hỏng code từng chỗ một, chạy lại test, và xem test có đỏ không. Test vẫn xanh trên code hỏng nghĩa là có một hành vi chưa ai kiểm. Ở BE-70 có 32 lỗi gài; 5 cái sống sót và cả 5 lộ ra cùng một chỗ trống: mọi test "khoảng ở xa mốc" đều dùng **mỗi 1** lần.

```text
lỗi gài: bỏ "/ every" trong bước nhảy hằng tháng
   đúng :  số tháng / N   -> bắt đầu gần khoảng, bước tới vài lần
   hỏng :  số tháng       -> nhảy quá xa gấp N lần, bỏ sót mọi lần trong khoảng
với N = 1 hai cách cho cùng một số, nên test cũ không thấy gì
```

Thêm các ca "mỗi 2 tháng / mỗi 3 ngày / mỗi 2 năm, ở xa mốc" thì cả ba lỗi gài đều bị bắt. Bài học: một test dạng bảng mà mọi dòng cùng có một giá trị (ở đây N = 1) thì phép nhân / chia cho giá trị đó không bao giờ được kiểm.

Có một lỗi gài vẫn sống và được để nguyên: đổi `Math.ceilDiv` (chia làm tròn lên) thành `Math.floorDiv` (làm tròn xuống) trong bước nhảy hằng ngày. Bước nhảy chỉ cần rơi **trước hoặc đúng** lần cần tìm, vì vòng `while (dateOf(step).isBefore(day)) step++` ngay sau đó bước tới đúng chỗ. Làm tròn xuống chỉ tốn thêm một bước, kết quả y hệt. Đó là lỗi gài **tương đương**: không test nào phân biệt được, vì không có hành vi nào khác đi.

### 1.10 Kiểm chứng (BE-70)
- RED: các lớp có thân rỗng → 33 test đỏ đúng lý do; GREEN 40/40.
- Kiểm tra ngược: lượt 1, 32 lỗi gài, 26 bị bắt, 5 sống (thiếu ca, đã thêm test), 1 mẫu sai; lượt 2, 6/7 bị bắt, 1 tương đương.
- `./mvnw -B -ntp verify` trong worktree riêng: 1255 test, 0 lỗi, 4 bỏ qua, BUILD SUCCESS; `ModularityTests` thấy module `planner` (chỉ phụ thuộc `common`).
