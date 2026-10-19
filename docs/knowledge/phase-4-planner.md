# Kiến thức Phase 4 — Việc cần làm, Lịch và Ghi chú

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** phần lõi của F16 + F17, `openspec/changes/f16-f17-tasks-calendar` (việc cần làm có hạn và lặp lại, lịch hẹn, xem lịch theo khoảng ngày; chưa có nhắc nhở, chưa gắn tin nhắn): BE-70, BE-71, BE-72, FE-70, FE-71. Phần lõi của F15, `openspec/changes/f15-notes` (ghi chú chữ và ghi chú dạng sơ đồ lưu trong database, chưa gắn tin nhắn), nằm ở phần cuối, mục "Ghi chú (F15)": BE-90.
> **Cập nhật:** 2026-10-19. Đường dẫn backend tính từ `apps/sino-api/src/main/java/dev/sino/`.

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
| D-159 | Một việc sinh lần kế tiếp đúng một lần (sửa lỗi review BE-71) |

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

---

## 2. Bảng `task` và `TaskService` (BE-71)

**Ở đâu:** migration `V18__planner_create_task.sql`; `planner/domain/Task`, `Due`, `TaskStatus`, `WeekdaysConverter`, `ZoneIdConverter` (và chú thích JPA trên `Recurrence`); `planner/infrastructure/TaskRepository`; `planner/application/TaskService`, `NewTask`, `RepeatRule`, `CompletedTask`.

```text
TaskService (mọi hàm nhận ownerId từ web, việc của người khác = TASK_NOT_FOUND)
  list(owner)                    việc OPEN + việc DONE trong 7 ngày, cũ trước
  create(owner, NewTask)         lưu; có quy tắc lặp thì chuỗi mang ID của chính việc này
  update(owner, id, title, notes)  null = giữ nguyên
  schedule(owner, id, due, rule) thay cả hạn lẫn quy tắc (D-153)
  complete(owner, id)            DONE + lưu lần kế tiếp trong CÙNG transaction
  reopen(owner, id)              OPEN lại; lần kế tiếp đã tạo vẫn còn (D-154)
  delete(owner, id)              chỉ hàng đó
```

### 2.1 Quy tắc lặp nằm ngay trong hàng: `@Embeddable` record
`Recurrence` của BE-70 giờ có thêm chú thích JPA và trở thành một **embeddable**: không có bảng riêng, các trường của nó là các cột `rec_*` của bảng `task` (D-152). Trong `Task` chỉ cần:

```java
@Embedded
private Recurrence recurrence;
```

Hibernate 7 dựng được một `record` (gọi constructor đầy đủ của record). Khi **mọi** cột `rec_*` đều trống, Hibernate trả `recurrence = null`: đó là "việc không lặp".

Hai kiểu Java không có sẵn cột tương ứng nên cần **converter** (`AttributeConverter`):

| Kiểu Java | Cột | Ví dụ |
|---|---|---|
| `Set<DayOfWeek>` | `rec_by_weekdays varchar` | `MONDAY,THURSDAY` |
| `ZoneId` | `rec_time_zone varchar` | `Asia/Ho_Chi_Minh` |

Bẫy: converter của các thứ trả `null` cho tập rỗng, không trả chuỗi rỗng. Nếu trả `""` thì một việc không lặp sẽ có một cột `rec_*` không trống; Hibernate khi đọc lại sẽ cố dựng `Recurrence` với tần suất `null` và constructor ném lỗi.

### 2.2 Ràng buộc ở cả Java lẫn database
Java kiểm khi tạo object (`Task.create`, constructor của `Recurrence`), còn database kiểm bằng `CHECK`. Hai lớp đều cần: Java báo lỗi sớm và rõ, còn database chặn mọi đường ghi khác (SQL viết tay, một lỗi lập trình sau này).

```sql
CHECK (due_at IS NULL OR due_date IS NULL)                  -- không có cả hai kiểu hạn
CHECK ((status = 'DONE') = (completed_at IS NOT NULL))      -- xong <=> có lúc xong
CHECK ( (mọi rec_* trống) OR (rec_freq, rec_interval, rec_time_zone có đủ, có hạn, ...) )
```

Dòng thứ hai so hai biểu thức boolean bằng `=`: đúng khi cả hai cùng đúng hoặc cùng sai. Bẫy của `CHECK` trong SQL: một biểu thức ra `NULL` (không biết) được coi là **qua**. Ví dụ `rec_freq = 'WEEKLY'` khi `rec_freq` trống cho `NULL`, nên một ràng buộc viết hớ sẽ không chặn gì. Vì vậy ràng buộc quy tắc lặp tách hẳn nhánh "mọi cột trống" ra trước, các phép so sánh chỉ nằm trong nhánh `rec_freq` có giá trị. Test `theDatabaseRefusesATaskThatBreaksItsRules` chèn thẳng bằng SQL bốn hàng sai và cả bốn đều bị từ chối.

Các cột số dùng `integer`, không `smallint`: Hibernate chạy với `ddl-auto: validate`, so kiểu cột với kiểu Java (`int` ↔ `integer`); `smallint` sẽ làm ứng dụng không khởi động.

### 2.3 ID của chuỗi: tạo ngay, không chờ lưu
Các lần của một việc lặp chung một `series_id`. Bản đầu tiên đặt nó bằng ID của việc đầu tiên; nhưng ID là UUIDv7 do Hibernate sinh **lúc lưu**, nên phải lưu trước rồi mới đặt chuỗi, và Hibernate ghi thêm một câu `UPDATE` khi commit:

```text
INSERT task (..., series_id = NULL, version = 0)
UPDATE task SET series_id = <id>, version = 1      <- thừa, và mọi nơi tạo việc phải nhớ gọi bước này
```

Review chỉ ra hai cái giá: một câu ghi thừa, và quy tắc "việc lặp luôn có chuỗi" phụ thuộc người gọi có nhớ bước thứ hai hay không. Bản hiện tại tạo `series_id = UUID.randomUUID()` ngay trong `Task` khi việc có quy tắc lặp lần đầu. Việc tạo chỉ còn một câu `INSERT` (test kiểm `version = 0`), và database giữ quy tắc bằng `CHECK (rec_freq IS NULL OR series_id IS NOT NULL)`. ID của chuỗi không cần trùng ID của việc nào: web chỉ so hai `seriesId` với nhau.

Cùng lúc, `Task` tự gọi `recurrence.anchoredAt(...)` khi nhận quy tắc. Không còn đường nào tạo ra một việc mang quy tắc không khớp hạn, kể cả khi sau này có code khác gọi `Task.create`.

### 2.4 Vì sao lần kế tiếp phải tạo cùng transaction với việc đánh dấu xong (câu gợi ý của task)
```text
một transaction:   DONE việc này  +  INSERT lần kế tiếp   ->  cả hai, hoặc không gì cả
hai transaction:   DONE việc này  | (máy sập ở đây) |  INSERT lần kế tiếp
                   -> việc đã xong mà chuỗi mất lần sau; bấm "Xong" lại thì việc đã DONE nên không tạo nữa
```

Gọi `complete` hai lần (mạng chập chờn, bấm hai lần) cũng an toàn:
- lần sau thấy việc đã `DONE`, trả `next = null` và không tạo gì (test `completingARepeatingTaskMakesTheNextOccurrenceOnce`);
- nếu hai request tới **cùng lúc**, cả hai cùng đọc thấy `OPEN`; request commit sau sẽ hỏng ở cột `version` (khóa lạc quan, `@Version`) và rollback cả lần kế tiếp nó vừa tạo. Chuỗi vẫn chỉ có một lần kế tiếp.

### 2.5 Xong, mở lại, xong lần nữa: lỗi review tìm ra (D-159)
Ô đánh dấu trên web bật / tắt được. Theo D-154, "Mở lại" giữ lần kế tiếp đã tạo. Bản đầu của `complete` chỉ chặn trường hợp việc **đang** `DONE`:

```text
Xong      -> DONE, tạo lần 12/10                (đúng)
Mở lại    -> OPEN, lần 12/10 vẫn còn            (đúng, D-154)
Xong      -> việc đang OPEN nên lại tạo lần 12/10  <- trùng; bật tắt thêm thì trùng thêm
```

Không có gì ghi lại rằng việc này đã sinh lần kế tiếp. Sửa: cột `next_created`, thành `true` khi tạo lần kế tiếp và không đổi khi mở lại; `makeNextOccurrence` thấy `true` thì không làm gì. Tên hàm cũng đổi từ `nextOccurrence` thành `makeNextOccurrence`, vì nó **đổi** trạng thái chứ không chỉ tính.

Vì sao không dùng ràng buộc unique `(series_id, occurrence_index)`: đặt lại quy tắc cho một việc thì `occurrence_index` về 0 trong cùng chuỗi, nên hai việc hợp lệ có thể trùng cặp đó.

### 2.6 Giới hạn đã biết: giờ không tồn tại khi đổi giờ mùa hè
Lần kế tiếp lấy giờ địa phương từ hạn của lần trước. Nếu giờ đó không có ở ngày mới (02:30 ở Berlin ngày cuối tháng 3, khi đồng hồ nhảy từ 02:00 lên 03:00), `ZonedDateTime` đẩy lên 03:30, và vì lần sau chép giờ của lần trước nên giữ luôn 03:30. Lịch hẹn lặp thì không bị, vì mỗi lần tính lại từ mốc. Chấp nhận vì múi giờ của Sino là `Asia/Ho_Chi_Minh` (không đổi giờ); Javadoc của `makeNextOccurrence` ghi rõ giới hạn này. Review lưu ý một thói quen cần bỏ: Javadoc không được hứa nhiều hơn code làm được ("luôn giữ giờ địa phương" là sai ở ca này).

### 2.7 Việc của người khác là "không tìm thấy"
Mọi hàm tìm việc bằng `findByIdAndOwnerId(id, ownerId)`, không bằng `findById` rồi mới so chủ. Việc của người khác và việc không tồn tại cho cùng một lỗi `TASK_NOT_FOUND` (sẽ là `404`), nên không ai dò được ID nào có thật. Cùng cách với `ACCOUNT_NOT_FOUND` của F02.

### 2.8 Test có đồng hồ chỉnh tay và hai transaction
- `TaskServiceTests` thay bean `Clock` bằng một `MovableClock` (`@Primary`): "xong 8 ngày trước" là đặt đồng hồ lùi 8 ngày rồi gọi `complete`, không cần chờ hay sửa database.
- Test khóa lạc quan cần **hai** transaction thật. Gọi `service.update(...)` ngay trong transaction của test sẽ không đủ: `@Transactional` mặc định *tham gia* transaction đang có (`REQUIRED`), nên hai lần đọc là cùng một object và không có xung đột nào. Test chạy lần sửa thứ hai trên một luồng khác (`CompletableFuture.runAsync`), luồng đó có transaction riêng và commit trước; transaction của test ghi sau thì nhận `OptimisticLockingFailureException`.

### 2.9 Kiểm chứng (BE-71)
- RED: thân rỗng của `Due`, `Task`, `TaskService` (migration, ánh xạ và repository thật) → 30/31 test đỏ đúng lý do; GREEN ngay lần đầu.
- Review của agent `senior-reviewer`: 1 HIGH (mục 2.5, đã sửa), 1 MEDIUM (mục 2.6, chấp nhận và ghi rõ), các LOW sửa phần lớn; 10 test mới đỏ trước khi sửa, xanh sau khi sửa.
- `./mvnw -B -ntp verify` trên `dev` mới nhất (đã có V17 của F10): 1380 test, 0 lỗi, 4 bỏ qua; `ModularityTests` 2/2.

---

## 3. REST `/api/tasks` (BE-72)

**Ở đâu:** `planner/api/TasksController`, các record request `CreateTaskRequest`, `UpdateTaskRequest`, `ScheduleRequest`, `RepeatBody`, record response `TaskResponse`, hai lớp nhỏ `Dues`, `Texts`; README (bảng endpoint).

```text
GET    /api/tasks                    -> 200 {generatedAt, tasks}
GET    /api/tasks/{id}               -> 200 task
POST   /api/tasks                    -> 201 task + Location
PATCH  /api/tasks/{id}               -> 200 task          {title?, notes?}
PUT    /api/tasks/{id}/schedule      -> 200 task          {dueAt, dueDate, recurrence}
POST   /api/tasks/{id}/complete      -> 200 {task, next}
POST   /api/tasks/{id}/reopen        -> 200 task
DELETE /api/tasks/{id}               -> 204
```

Controller chỉ làm ba việc: lấy chủ sở hữu từ `CurrentUser`, đổi request thành lời gọi `TaskService`, đổi `Task` thành JSON. Không có logic nghiệp vụ nào ở đây.

### 3.1 Ba lớp kiểm, mỗi lớp một loại lỗi
```text
1. Bean Validation trên record request   -> 400 VALIDATION_FAILED, kèm tên ô sai
   (tiêu đề rỗng / quá 200, hai kiểu hạn, lặp mà không có hạn, mỗi 0 lần, hằng tuần mà không có thứ...)
2. Domain: Recurrence.anchoredAt         -> 422 INVALID_RECURRENCE
   (quy tắc không khớp hạn: phải đổi hạn ra ngày theo múi giờ mới biết thứ mấy)
3. Database: CHECK của V18                -> chỉ là lưới cuối; API không bao giờ để lỗi rơi tới đây
```

Một ràng buộc dính tới **hai ô** (ví dụ "có `untilDate` thì không có `count`") viết bằng một hàm `@AssertTrue` trong record:

```java
@AssertTrue(message = "give untilDate or count, not both")
boolean isOneEndAtMost() {
    return untilDate == null || count == null;
}
```

Bean Validation gọi mọi hàm `isXxx()` có `@AssertTrue`; trả `false` thì thành một lỗi ở "ô" tên `oneEndAtMost`. `RepeatBody` nằm trong `CreateTaskRequest` và có `@Valid` đứng trước, nên các ràng buộc của nó cũng được kiểm.

Bẫy đã gặp lúc viết: `EnumSet.copyOf(list)` ném lỗi khi danh sách **rỗng**. Một quy tắc hằng ngày có thể gửi `"byWeekdays": []` (hợp lệ, vì không phải hằng tuần), nên phải đổi danh sách rỗng thành `null` trước khi chép.

### 3.2 Vì sao `PATCH` không xóa được hạn mà phải có `PUT …/schedule` (câu gợi ý của task)
Jackson đọc JSON vào record. Với record, hai body dưới đây cho **cùng một** object, `dueAt == null`:

```text
{"title": "A"}                    -> UpdateTaskRequest(title = "A", ..., dueAt = null)
{"title": "A", "dueAt": null}     -> UpdateTaskRequest(title = "A", ..., dueAt = null)
```

Nên một `PATCH` kiểu "thiếu hoặc `null` là giữ nguyên" (như `PATCH /api/accounts/{id}`) không có cách nào nói "xóa hạn". Có hai lối ra:
- Đọc JSON thô để biết ô nào có mặt (JSON Merge Patch, `JsonNullable`): phức tạp, chỉ để dùng ở một chỗ.
- **Tách ra một endpoint thay cả cụm** (Sino chọn, D-153): `PUT /api/tasks/{id}/schedule` nhận `{dueAt, dueDate, recurrence}`, và ô nào thiếu nghĩa là "không có". `{}` xóa cả hạn lẫn quy tắc.

Hạn và quy tắc vốn phải đi cùng nhau (có lặp thì phải có hạn, ngày gốc lấy từ hạn), nên gom chúng vào một lệnh `PUT` cũng đúng với nghĩa của chúng.

### 3.3 Ký tự NUL: một lỗi 500 chặn trước bằng `@Pattern`
PostgreSQL không nhận ký tự `U+0000` trong `text` / `varchar`. Nếu để lọt, câu `INSERT` hỏng và người dùng nhận `500` thay vì `400`. Mọi ô chữ của request có:

```java
@Pattern(regexp = Texts.WITHOUT_NUL, message = Texts.WITHOUT_NUL_MESSAGE)   // "[^\\x00]*"
```

Lớp ký tự `[^\x00]` khớp mọi ký tự trừ NUL, kể cả xuống dòng, nên ghi chú nhiều dòng vẫn qua. (Bẫy lúc viết: tạo file Java bằng heredoc của shell làm `\\` rút còn `\`, ra một chuỗi Java không biên dịch được; file này được viết lại bằng công cụ ghi file.)

### 3.4 JSON theo hợp đồng của web
`TaskResponse` có đúng các ô của kiểu `TaskItem` mà màn web đã dùng với dữ liệu mẫu (`fe-ui-tasks`):
- `reminder`, `source`, `related` luôn là `null` ở đợt này. Ô vẫn có mặt để web không phải đổi kiểu khi các phần đó có sau.
- `recurrence.byWeekdays` là `null` khi không phải hằng tuần, và luôn xếp thứ Hai trước (lấy từ `EnumSet`).
- Múi giờ của quy tắc không ra JSON: web không cần, và đó là chi tiết của máy chủ.

`POST` trả `201 Created` kèm header `Location: http://…/api/tasks/{id}`. Vì `Location` phải trỏ tới thứ đọc được, đợt này thêm `GET /api/tasks/{id}` (bảng thiết kế ban đầu không có).

### 3.5 Module test phải nạp thêm `identity`
`TaskServiceTests` là `@ApplicationModuleTest`: mặc định chỉ nạp các bean của module `planner`. Từ khi có `TasksController` (cần `CurrentUser` của module `identity`), context không dựng được nữa. Test chuyển sang `BootstrapMode.DIRECT_DEPENDENCIES` (nạp thêm các module mà `planner` dùng trực tiếp), giống các module test của `account`.

### 3.6 Kiểm chứng (BE-72)
- RED: chưa có controller → 36/38 test API đỏ (`404`); hai test xanh sẵn là `401` và thiếu CSRF, vì lớp bảo mật đứng trước controller.
- GREEN: 38/38 test API (21 ca dữ liệu sai thành `400`, `422`, `404`, `409`, `401`, `403`, `201` + `Location`, JSON đúng hợp đồng).
- `./mvnw -B -ntp verify`: 1418 test, 0 lỗi, 4 bỏ qua; `ModularityTests` 2/2 (`planner` giờ phụ thuộc `identity` và `common`).

---

## 4. Màn Việc cần làm trên API thật (FE-70)

**Ở đâu** (tính từ `apps/sino-web/src/`): `features/tasks/tasks.api.ts`, `useTasks.ts`, `TasksPage.tsx`, `components/QuickAdd.tsx`, `components/TaskDetail.tsx`; `app/shell/AppShell.tsx`; test: `test/tasksSampleApi.ts`, `test/fixtures/tasksApi.ts`, `features/tasks/tasks.api.test.ts`, `TasksOnApi.test.tsx`.

```text
màn Việc cần làm ──> useTasks (TanStack Query, khóa ['tasks'])
                        |  queryFn = fetchTasks: GET /api/tasks + GET /api/providers
                        |  thay đổi = addTask / completeTask / reopenTask / saveTaskNotes
                        v
                     tasks.api.ts ──> shared/api/client (cookie phiên, CSRF) ──> /api/tasks/**
AppShell ──> cũng đọc ['tasks'] ──> số "tới hạn" trên điều hướng của mọi màn
```

### 4.1 Hợp đồng dữ liệu trả công: chỉ đổi thân hàm
Lúc dựng giao diện trước (Phase 1), màn này đã có kiểu `TaskItem` làm "hợp đồng" giao cho backend, và BE-72 trả JSON đúng hình dạng đó. Vì vậy FE-70 chỉ thay **thân** các hàm trong `tasks.api.ts`: tên hàm, tham số và kiểu trả về giữ nguyên, nên hook và component không phải sửa vì dữ liệu.

```ts
export async function completeTask(task: TaskItem): Promise<CompletedTask> {
  return api.post<CompletedTask>(path(task, '/complete'))   // trước: tự tính lần kế tiếp từ dữ liệu mẫu
}
```

### 4.2 Test cũ vẫn chạy trên dữ liệu mẫu: `sampleTasksApi`
Các test viết lúc dựng giao diện (nhóm, lọc, chữ trên dòng…) dựa vào dữ liệu mẫu của canvas. Logic mẫu cũ được dời sang `test/tasksSampleApi.ts`, và các file test đó thay module thật bằng bản mẫu:

```ts
vi.mock('./tasks.api', async (importOriginal) =>
  (await import('@/test/tasksSampleApi')).sampleTasksApi(await importOriginal()))
```

Bẫy: `vi.mock` được Vitest **kéo lên đầu file**, chạy trước mọi `import`. Viết `import { sampleTasksApi } from …` ở đầu file rồi dùng trong factory sẽ hỏng ("Cannot access … before initialization"); phải `await import(...)` ngay bên trong factory, như các test của Hộp thư.

Test mới (`TasksOnApi.test.tsx`) thì đi qua mạng giả MSW: một "backend" giữ danh sách việc trong bộ nhớ, trả lời đúng như BE-72, và có chế độ `refuse` để thử đường lỗi.

### 4.3 Số trên điều hướng: một nguồn duy nhất
Trước đây hook chép số "tới hạn" vào cache của khung app sau mỗi thay đổi. Cách đó có hai lỗ: chưa mở màn Việc cần làm thì số trên điều hướng vẫn là số mẫu, và hai bản số có thể lệch nhau. Giờ `AppShell` đọc chính danh sách việc và tự đếm:

```ts
const { tasks } = useTasks()
const now = useNow()                          // đổi mỗi phút: việc hạn 12:00 thành quá hạn khi qua 12:00
... tasks === undefined ? {} : navCountsOf(tasks, now)
```

Đánh dấu xong một việc làm đổi danh sách trong cache, nên số trên điều hướng đổi theo mà không cần ai "báo". Bẫy đã gặp: gọi `new Date()` thẳng trong lúc render bị lint (`react(purity)`) chặn, vì mỗi lần render ra một giá trị khác; dùng hook `useNow` có sẵn.

### 4.4 Đổi ngay, trả lại khi lỗi, và nói cho người dùng biết
Đánh dấu xong hiện ngay trên màn (optimistic update) rồi mới chờ máy chủ. Máy chủ từ chối thì danh sách quay về bản đã lưu trước đó, và từ FE-70 có thêm một dòng `role="alert"`: "Không lưu được thay đổi. Hãy thử lại.". Thêm nhanh thì làm ngược lại: ô trống ngay để gõ tiếp, nhưng nếu máy chủ từ chối thì tiêu đề quay lại ô (trừ khi người dùng đã gõ cái mới) cùng câu "Không thêm được việc. Hãy thử lại.". `QuickAdd` nhận một hàm trả `Promise` (`mutateAsync`) để biết kết quả.

### 4.5 Việc đổi thì Lịch đọc lại
Màn Lịch cũng hiện việc có hạn. Sau mỗi thay đổi việc, hook gọi `invalidateQueries({ queryKey: ['calendar'] })`: mọi khoảng Lịch đang có trong cache bị đánh dấu cũ, lần tới mở Lịch sẽ đọc lại. Gọi ở `onSettled` (cả khi lỗi), vì một yêu cầu "lỗi" vẫn có thể đã được máy chủ làm.

### 4.6 Chạy thật mà không đụng ai
Để thấy màn chạy với backend thật mà không làm phiền app IntelliJ của người dùng (cổng 8080) hay database dùng chung, lượt kiểm dùng: jar build từ git worktree riêng chạy cổng 8091, một PostgreSQL 18 tạm trong Docker (Flyway dựng từ V1 tới V18), vite cổng 5179 với proxy `/api` sang 8091, và các giá trị cấu hình giả chỉ cho lượt này. Xong thì dừng tiến trình và xóa container.

### 4.7 Kiểm chứng (FE-70)
- RED 15 test, GREEN; `pnpm lint` 0 cảnh báo, `tsc -b` 0, `vitest` 556/556, `pnpm build` 0.
- Chrome với backend thật: thêm, xong (máy chủ tạo lần kế tiếp T5 12/11), ghi chú (`PATCH` 200), tải lại vẫn còn; số trên điều hướng theo dữ liệu thật; 1440 và 390 (iframe 390 px), không cuộn ngang, không lỗi console.

---

## 5. Biểu mẫu sửa việc và xóa việc (FE-71)

**Ở đâu** (tính từ `apps/sino-web/src/`): `features/tasks/taskForm.ts`; `features/tasks/components/TaskForm.tsx`, `RecurrenceField.tsx`, `DeleteTaskDialog.tsx`, `fields.tsx`, `fieldProps.ts`; `tasks.api.ts` (`updateTask`, `scheduleTask`, `deleteTask`); `useTasks.ts` (`useUpdateTask`, `useDeleteTask`); `TasksPage.tsx`; `app/router.tsx` (route `tasks/:taskId/edit`); `shared/time/local.ts` (`timeZoneLabel`, chuyển từ Lịch sang). Test: `taskForm.test.ts`, `TaskForm.test.tsx`, `test/tasksBackend.ts`.

```text
"Sửa" trong chi tiết ──> /tasks/:id/edit ──> TasksPage
                                               |  từ 768 px : TaskFormDialog (hộp thoại trên trang)
                                               |  dưới 768 px: TaskFormPage (trang riêng, "Lưu" trên đầu)
                                               v
                          useTaskForm: values = formOf(task)
                                               |  "Lưu": validate(values) --lỗi--> hiện cạnh ô, không gửi
                                               |  scheduleOf(values) khác của việc? --> PUT /api/tasks/{id}/schedule
                                               |  tiêu đề / ghi chú khác?           --> PATCH /api/tasks/{id}
                                               v
                          xong: đóng biểu mẫu | lỗi: errorsOf(error) --> cạnh ô, hoặc dưới biểu mẫu
```

### 5.1 Logic thuần tách khỏi giao diện
**Là gì:** `taskForm.ts` không có React: bốn hàm nhận dữ liệu, trả dữ liệu. `formOf(task)` đọc một việc thành giá trị của biểu mẫu; `scheduleOf(values)` dựng thân của `PUT …/schedule`; `validate(values)` trả các lỗi trước khi gửi; `errorsOf(error)` đặt lỗi của máy chủ vào ô.
**Vì sao:** phần khó của biểu mẫu là quy đổi (giờ địa phương sang UTC, lựa chọn "Hằng tuần" thành quy tắc, ngày gốc hằng tháng), không phải vẽ ô. Tách ra thì 15 test chạy trong vài mili giây, không cần dựng màn, và component chỉ còn nối ô với giá trị.
**Bẫy:** `new Date('2026-10-09T17:00:00')` (không có `Z`) là 17:00 **theo giờ của trình duyệt**, rồi `toISOString()` đổi sang UTC (`10:00:00.000Z` ở Việt Nam). Test chỉ đúng khi múi giờ cố định: `vite.config.ts` đặt `TZ: 'Asia/Ho_Chi_Minh'` cho Vitest, CI chạy UTC cũng ra cùng kết quả.

### 5.2 Vì sao biểu mẫu có đường dẫn riêng chứ không chỉ là state của trang (câu gợi ý của task)
Nếu biểu mẫu chỉ là một biến `open` trong `TasksPage`, ba thứ hỏng: trên điện thoại nút Back của máy rời cả màn Việc cần làm thay vì đóng biểu mẫu; tải lại trang mất biểu mẫu; không gửi được đường dẫn "mở biểu mẫu của việc này". Với `/tasks/:id/edit`, trình duyệt giữ chỗ đang đứng như mọi trang khác (D-82, D-158).
Đóng biểu mẫu cũng phải tính tới lịch sử. Mở từ nút "Sửa" thì lịch sử là `[danh sách, chi tiết, biểu mẫu]`; nếu "Lưu" xong lại *đẩy* thêm chi tiết thì Back sẽ mở lại biểu mẫu cũ. Nên nút "Sửa" gắn một dấu vào lịch sử, và lúc đóng thì:

```ts
const fromDetail: EditState = { fromDetail: true }
<Link to={edit} state={fromDetail}>Sửa</Link>
...
const closeForm = () => (location.state?.fromDetail ? navigate(-1) : navigate(detailPath, { replace: true }))
```

```text
mở từ "Sửa":            [danh sách, chi tiết, biểu mẫu]  --navigate(-1)-->  [danh sách, chi tiết]
mở thẳng bằng địa chỉ:  [biểu mẫu]                        --replace------->  [chi tiết]
```

Xóa việc dùng cùng ý: về danh sách bằng `replace`, nên Back không quay về trang chi tiết của một việc đã mất.

### 5.3 Chỉ gửi phần đã đổi, và gửi hạn trước
Biểu mẫu so giá trị hiện tại với việc đang lưu, và chỉ gửi phần khác:

```ts
if (JSON.stringify(scheduleOf(values)) !== JSON.stringify(scheduleOf(formOf(task)))) changes.schedule = …
```

Cả hai vế đều đi qua `formOf` rồi `scheduleOf`, nên biểu mẫu chưa đụng tới luôn "không đổi", kể cả khi máy chủ lưu dạng hơi khác (giây lẻ, thứ tự các thứ). **Vì sao:** đặt lại quy tắc là bắt đầu chuỗi mới (BE-71, D-159), không nên xảy ra chỉ vì người dùng sửa tiêu đề; và một quy tắc cũ không còn khớp sẽ làm cả lần sửa tiêu đề bị 422.
Thứ tự: `PUT …/schedule` trước, `PATCH` sau, vì 422 là lỗi hay gặp nhất; nó đến trước khi có gì được lưu. Mỗi câu trả lời thay việc trong cache ngay, nên nếu `PUT` được mà `PATCH` lỗi thì lần "Lưu" sau chỉ còn gửi `PATCH`.

### 5.4 Một quy tắc, hai cách nhìn: lựa chọn có sẵn và "Tùy chỉnh…"
Máy chủ chỉ biết một kiểu `Recurrence`. Biểu mẫu nhìn nó theo hai cách: "Hằng ngày / tuần / tháng / năm" là quy tắc mỗi 1, không điểm kết thúc (hằng tuần thì đúng thứ của ngày hạn); mọi thứ khác là "Tùy chỉnh…" với mỗi N, các thứ, điểm kết thúc. Lựa chọn có sẵn được dựng lại từ ngày mỗi lần lưu, nên đổi hạn từ thứ Hai sang thứ Sáu thì "Hằng tuần" tự thành "mỗi thứ Sáu".
Ngày gốc hằng tháng là chỗ tinh tế: quy tắc bắt đầu ngày 31, lần tháng 11 rơi vào 30/11. Biểu mẫu giữ `byMonthDay = 31` khi ngày còn "khớp" (bằng, hoặc lớn hơn và ngày là cuối tháng); người dùng dời sang 29/11 thì gửi `null` để máy chủ lấy ngày theo hạn mới.

### 5.5 Lỗi hiện đúng chỗ
Hai nguồn lỗi, một cách hiện:
- `validate` chặn trước khi gửi những gì chắc chắn sai (tiêu đề trống, giờ trống, mỗi N ngoài 1…99, hằng tuần không chọn thứ nào, ngày kết thúc trước hạn, số lần ngoài 1…999).
- `errorsOf` đọc lỗi của máy chủ: `422 INVALID_RECURRENCE` đặt ở ô Lặp lại; `400` đọc tên trường trong Problem Details (`title…`, `dueAt`, `oneDueAtMost`, `recurrence.interval`, `repeatingWithADue`…) để chọn ô; còn lại là một dòng dưới biểu mẫu. Câu chữ tiếng Việt nằm ở web; câu tiếng Anh của Bean Validation chỉ để lập trình viên đọc.

Mỗi ô lỗi có `aria-invalid` và `aria-describedby` trỏ tới dòng lỗi, nên trình đọc màn hình đọc cả lỗi khi vào ô. Form đặt `noValidate`: không để trình duyệt hiện bong bóng kiểm tra của nó (tiếng Anh, mỗi trình duyệt một kiểu), mọi câu báo đều do biểu mẫu nói.

### 5.6 Bẫy test: địa chỉ đổi trước khi màn vẽ lại
Hai bẫy gặp khi viết `TaskForm.test.tsx`:
- Khi hộp thoại Radix mở, mọi phần khác của trang bị gắn `aria-hidden`, nên `getByRole('region', { name: 'Danh sách việc' })` **không thấy** danh sách. Test mở thẳng `/tasks/:id/edit` phải chờ hộp thoại, không chờ danh sách.
- `router.state.location` đổi ngay khi gọi `navigate`, còn React vẽ lại sau. Kiểm danh sách ngay sau khi địa chỉ đổi thì hộp thoại vẫn còn, danh sách vẫn bị ẩn. Test chờ hộp thoại biến mất (`formClosed()`) rồi mới kiểm.

### 5.7 Kiểm chứng (FE-71)
- RED 19 test và một file không nạp được (chưa có `taskForm.ts`); GREEN; ca "Back không mở lại biểu mẫu" viết sau nên gài lỗi một lần (`navigate(-1)` thành `replace`): test đỏ, trả code lại.
- `pnpm lint` 0 cảnh báo (tách `fieldProps.ts` vì file component không nên export hàm thường), `tsc -b` 0, `vitest` 590/590, `pnpm build` 0.
- Chrome với backend thật: "Tùy chỉnh…" mỗi 2 tuần thứ Hai và thứ Năm sau 6 lần (máy chủ lưu đúng); dời hạn sang thứ Ba → 422 hiện cạnh ô Lặp lại; Esc không đổi gì; bỏ hạn → việc về "KHÔNG CÓ HẠN"; xóa có hỏi lại; 768 (hộp thoại) và 390 (trang riêng, thu chip để bảy thứ nằm một dòng); không lỗi console.

---

## Ghi chú (F15)

Màn Ghi chú của web (ghi chú chữ và ghi chú dạng sơ đồ) dựng xong trên dữ liệu mẫu, nên tải lại trang là mất hết. F15 cho nó một chỗ lưu thật: module mới `notes`, đứng riêng như `planner`, chỉ phụ thuộc `identity` (ai đang gọi) và `common`. Change: `openspec/changes/f15-notes`.

| Quyết định | Nội dung |
|---|---|
| D-170 | Ghi chú độc lập trước, gắn tin nhắn đợt sau (người dùng) |
| D-172 | Lưu phải kèm `version` đã đọc; lệch thì `409`, không ghi gì (người dùng) |
| D-173 | Danh sách trả đủ nội dung; tìm và lọc ở trình duyệt (người dùng) |
| D-174 | Ghi chú chữ bắt buộc có nội dung; tiêu đề tùy chọn (người dùng) |
| D-175 | Ghim không phải một lần sửa: không đổi `updated_at` (người dùng duyệt) |
| D-179 | Ghi chú sơ đồ nằm cùng bảng `note`: cột `kind` và `diagram jsonb` (người dùng, 2026-10-19; thay D-171 "sơ đồ là change riêng") |

### F15.1 Bảng `note`, `Note`, `Diagram` và `NoteService` (BE-90)

**Ở đâu:** `notes/domain/{Note, NoteKind, Diagram, DiagramBlock, DiagramLink, Side, BlockColor, NotesErrorCode}`; `notes/application/{NoteService, NewNote, NoteChange}`; `notes/infrastructure/NoteRepository`; `db/migration/V20__notes_create_note.sql`.

```text
note
  id  user_id  kind  title  body  diagram  pinned  created_at  updated_at  version
                |             |       |
                |             |       +-- jsonb: cả sơ đồ {"blocks":[...], "links":[...]}
                |             +---------- chữ của ghi chú chữ; rỗng ('') với sơ đồ
                +------------------------ TEXT | DIAGRAM, chọn lúc tạo, không bao giờ đổi

TEXT    : body có chữ, diagram = NULL
DIAGRAM : body = '',   diagram là một object JSON
```

**Vì sao một bảng và một cột jsonb (D-179).** Web luôn gửi và nhận cả sơ đồ: mỗi lần tự lưu là thay toàn bộ. Không có chỗ nào cần đọc hay sửa một khối riêng. Một cột jsonb giữ sơ đồ nhất quán trong một lần ghi (không có chuyện đã lưu 3 khối trong 5 rồi lỗi), và dùng chung `version`, `409`, ghim, xóa, danh sách với ghi chú chữ. **Phương án bỏ:** hai bảng `note_block` và `note_link`: nhiều lệnh mỗi lần lưu, sơ đồ có thể dở dang khi lỗi giữa chừng, mà chưa ai truy vấn theo khối. Khi F11 (tìm toàn văn) cần tìm trong khối thì tách sau.

**`Diagram` là một `record` biết các luật nhìn xuyên.** Mỗi khối và mỗi nối tự kiểm phần của mình (`DiagramBlock`: chữ tối đa 2.000 ký tự, tọa độ là số hữu hạn; `DiagramLink`: nhãn tối đa 80 ký tự). Những luật cần nhìn cả sơ đồ nằm một chỗ, trong compact constructor của `Diagram`:

```text
1 .. 300 khối, tối đa 600 nối
mã khối không trùng, mã nối không trùng
một nối nối hai khối KHÁC nhau, cả hai nằm trong sơ đồ
một cặp (từ, tới) có tối đa một nối      (từ A tới B và từ B tới A là hai nối khác nhau)
```

Nhờ vậy không tạo được một `Diagram` hỏng ở bất kỳ đâu: API (BE-91) chỉ việc dựng nó, lỗi nào cũng ra từ một chỗ. `List.copyOf` trong constructor làm hai việc: sơ đồ không đổi được qua danh sách đã dùng để dựng nó, và `null` bị chặn ngay (NullPointerException).

**`equals` theo nội dung, và vì sao nó quan trọng.** `record` so từng thành phần. Web gửi lại cả sơ đồ ở mỗi lần tự lưu, kể cả lần chẳng có gì đổi (ví dụ đổi tiêu đề). `Note.edit` so sơ đồ mới với sơ đồ đang lưu bằng `Objects.equals`: bằng nhau thì không phải một lần sửa, `updated_at` và `version` giữ nguyên. Nếu so bằng tham chiếu (`==`), mọi lần tự lưu đều tăng `version`, và tab thứ hai sẽ bị `409` oan.

**Hibernate lưu `record` lồng nhau vào jsonb.** Chỉ cần hai dòng trên trường (`@JdbcTypeCode(SqlTypes.JSON)` và `@Column(name = "diagram")`), như `AccountCredential.scopes`. Điều chưa chắc là danh sách các record lồng nhau có đi qua Jackson 3 (Spring Boot 4) và quay lại đúng không, nên test `NoteServiceTests` lưu một sơ đồ có chữ Việt, emoji, dấu nháy kép, xuống dòng và số thập phân dài, đọc lại bằng một lần mở EntityManager khác, và so `equals` với bản gốc. Test còn hỏi thẳng jsonb bằng SQL (`diagram -> 'links' -> 0 ->> 'fromSide'`) để chắc dạng JSON khớp hợp đồng D-211, không chỉ khớp với chính Java.

**`kind` không đổi, và dùng `STRING` chứ không `ORDINAL`.** `@Column(updatable = false)`: Hibernate không bao giờ ghi lại cột này. `@Enumerated(EnumType.STRING)` lưu chữ `TEXT` / `DIAGRAM`; `ORDINAL` lưu số thứ tự, và thêm một giá trị vào giữa enum sau này sẽ làm mọi hàng cũ đổi nghĩa trong im lặng.

**Hai tầng chặn khi nhầm loại.** Trong `Note.edit` (domain): gửi `body` cho ghi chú sơ đồ, hay `diagram` cho ghi chú chữ, ném `IllegalArgumentException`: người gọi code sai. `NoteService.update` kiểm trước, và ném `SinoException(NOTE_KIND_MISMATCH)`, mã `422`. Thứ tự: không có ghi chú → `404`; nhầm loại → `422`; `version` lệch → `409`. Nhầm loại được xét trước `version` vì không phiên bản nào làm cho yêu cầu đó đúng. **Vì sao `422` mà không `400`:** ở app này `400 VALIDATION_FAILED` chỉ đến từ Bean Validation trên request, tức là lỗi thấy được chỉ nhìn request. Nhầm loại phụ thuộc vào ghi chú đã lưu: request đúng dạng nhưng trái luật nghiệp vụ, đúng nhóm `INVALID` (`422`) của `ErrorCategory`. (`POST` có `body` cho sơ đồ thì chỉ nhìn request cũng thấy sai, nên đó là `400`, kiểm ở BE-91 và ở `NewNote`.)

**Database giữ sàn dưới.** `V20` có các CHECK, mỗi cái một tên để test kiểm đúng cái bị chặn:

```text
note_kind_ck          kind IN ('TEXT','DIAGRAM')
note_text_ck          kind <> 'TEXT'    OR (diagram IS NULL AND btrim(body) <> '')
note_diagram_ck       kind <> 'DIAGRAM' OR (diagram IS NOT NULL AND jsonb_typeof(diagram) = 'object' AND body = '')
note_body_length_ck   char_length(body) <= 20000
note_title_blank_ck   title IS NULL OR btrim(title) <> ''
```

`kind <> 'TEXT' OR (...)` là cách viết "nếu là TEXT thì ..." trong SQL: chỉ khi `kind` là `TEXT` thì vế phải mới phải đúng. Bên trong sơ đồ (số khối, nối trỏ đúng) do ứng dụng kiểm, database không cố hiểu JSON. **Bẫy:** `insert ... values (?)` với một chuỗi cho cột jsonb báo lỗi kiểu ("column is of type jsonb but expression is of type character varying"); phải viết `?::jsonb`. Test dùng `insertRow` để chèn thẳng hàng hỏng nên gặp bẫy này.

**Câu gợi ý của task: "vì sao so `version` trong service mà vẫn cần `@Version` của JPA?"** Hai thứ bắt hai tình huống khác nhau:
- Service so `version` gửi lên với `version` đang lưu: bắt **tab cũ**. Tab A đọc ở version 3, tab B lưu thành 4, một lúc sau tab A lưu với version 3: service thấy 3 khác 4 và từ chối. Hai request cách nhau, JPA không thấy gì sai, vì nó chỉ biết version nó vừa đọc.
- `@Version` bắt **hai request cùng lúc**, cùng đọc version 3 và cùng qua được bước so. Câu `UPDATE ... WHERE version = 3` của request thứ hai không còn hàng nào để sửa, JPA ném `OptimisticLockingFailureException`. Test `twoSavesOfTheSameVersionAtTheSameTimeEndInOneRefusal` dựng đúng tình huống này bằng đồng hồ chỉnh tay có thể dừng lại giữa chừng.

Cả hai cùng ném `OptimisticLockingFailureException`, nên handler sẵn có trả cùng một `409 CONCURRENT_MODIFICATION`.

**Kiểm chứng (BE-90).**
- Xuất phát từ bản WIP `f43fdd6` (ghi chú chữ, chưa ai chạy): trong worktree mới, 49 test (`NoteTests` 25, `NoteServiceTests` 22, `ModularityTests` 2) xanh trước khi sửa gì, nên phần chữ là nền chắc.
- ĐỎ đúng lý do: test mới viết trước, `test-compile` chỉ báo thiếu `Diagram`, `DiagramBlock`, `DiagramLink`, `BlockColor`, `Side`, `NoteKind`, `Note.diagram()`, `Note.kind()`, `NewNote.text(...)`: không có lỗi nào khác.
- XANH: `NoteTests` 34, `DiagramTests` 21, `NewNoteTests` 5, `NoteServiceTests` 40, `ModularityTests` 2 (module `notes` được nhận). Sơ đồ có chữ Việt, emoji, dấu nháy kép, xuống dòng và số thập phân dài lưu rồi đọc lại bằng EntityManager khác đều `equals` bản gốc.
- `./mvnw -B -ntp verify` trong worktree: 1873 test, 0 lỗi, 0 error, 8 bỏ qua (sẵn có), BUILD SUCCESS.
- Gài lỗi (một lần cho `Diagram` và `Note`): 13 lỗi gài, cả 13 làm đỏ đúng test của luật đó, rồi trả code lại. `Diagram`: bỏ kiểm tự nối, trùng cặp, 301 khối, nối tới khối không có, sơ đồ rỗng, mã khối trùng, NUL trong chữ khối. `Note`: `edit` bỏ qua sơ đồ, `edit` coi sơ đồ bằng nhau là đã đổi, bỏ chặn `body` cho sơ đồ, ghim đổi `updated_at`. `NoteService`: bỏ so `version`, bỏ chuyển `diagram` xuống `edit`. Một lỗi gài đầu (mã khối trùng) làm đỏ cả những test không liên quan vì nó bỏ luôn lệnh `add` vào tập mã; viết lại chỉ tắt phần báo lỗi thì chỉ còn `twoBlocksCannotShareAnId` đỏ.
- Bài học: lỗi gài tốt chỉ tắt một nhánh, không xóa lệnh có tác dụng phụ trong cùng điều kiện, nếu không "đỏ" không còn nói lên điều gì.
