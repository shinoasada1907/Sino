# Kiến thức Phase 4 — Việc cần làm và Lịch

> **Dành cho:** người học Java và web qua chính dự án Sino.
> **Cách đọc:** mỗi mục trả lời 5 câu: *Ở đâu* trong code · *Là gì* · *Để làm gì* · *Vì sao chọn* (và phương án đã bỏ) · *Bẫy* hay gặp.
> **Phạm vi:** phần lõi của F16 + F17, `openspec/changes/f16-f17-tasks-calendar` (việc cần làm có hạn và lặp lại, lịch hẹn, xem lịch theo khoảng ngày; chưa có nhắc nhở, chưa gắn tin nhắn): BE-70, BE-71, BE-72, FE-70, FE-71. Mục 6 là phần lõi của F15 (ghi chú độc lập), `openspec/changes/f15-notes`: BE-90.
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

## 6. Bảng `note` và `NoteService` (BE-90)

**Ở đâu:** migration `V20__notes_create_note.sql`; `notes/domain/Note`, `NotesErrorCode`; `notes/infrastructure/NoteRepository`; `notes/application/NoteService`, `NewNote`, `NoteChange`. Test: `NoteTests` (thuần Java), `NoteServiceTests` (PostgreSQL thật).

**Là gì / để làm gì:** ghi chú lưu thật trong Sino (F15, change `f15-notes`): tạo, sửa, ghim, xóa, liệt kê. Chưa có đường REST (đó là BE-91) và chưa gắn với tin nhắn (D-170). Module `notes` đứng riêng như `planner`, chỉ nhờ `common`.

```text
NoteService (mọi hàm nhận ownerId từ web, ghi chú của người khác = NOTE_NOT_FOUND)
  list(owner)                              mọi ghi chú, sửa gần nhất trước (updated_at DESC, id DESC)
  get(owner, id)
  create(owner, NewNote)                   chưa ghim, version 0
  update(owner, id, version, NoteChange)   version lệch -> OptimisticLockingFailureException (sẽ là 409)
  delete(owner, id)                        xóa hẳn, không cần version (D-176)
```

| Quyết định | Nội dung |
|---|---|
| D-170 | Ghi chú độc lập trước, gắn tin nhắn đợt sau |
| D-172 | Mỗi ghi chú có `version`; lưu với `version` cũ thì bị từ chối, không ghi gì |
| D-173 | Danh sách trả đủ nội dung; tìm và lọc ở trình duyệt |
| D-174 | Nội dung bắt buộc, tiêu đề tùy chọn |
| D-175 | Ghim không phải một lần sửa |
| D-176 | Xóa hẳn |

### 6.1 Vì sao so `version` trong service mà vẫn cần `@Version` của JPA (câu gợi ý của task)
Hai lớp kiểm bắt hai chuyện khác nhau, cùng ra một ngoại lệ:

```text
tab cũ:     đọc ghi chú (version 3) ........ 10 phút ........ lưu với version 3
                                  tab khác: lưu -> version 4
            NoteService so 3 với 4 -> khác -> OptimisticLockingFailureException     (lớp 1: service)

cùng lúc:   request A đọc 3 --+            request B đọc 3 --+
            A: UPDATE ... WHERE id = ? AND version = 3  -> 1 hàng, version thành 4
            B: UPDATE ... WHERE id = ? AND version = 3  -> 0 hàng -> exception       (lớp 2: @Version)
```

- `@Version` chỉ biết version mà transaction **này** đã đọc ở đầu hàm. Nó luôn khớp với database tại lúc đó, nên một tab mở từ 10 phút trước không bao giờ bị nó bắt. Chỉ con số `version` mà client gửi lên mới nói được "tôi đã đọc bản nào".
- Kiểm trong service thì lại không bắt được hai request đến cùng lúc, vì cả hai cùng đọc thấy version khớp rồi mới ghi. Lúc đó câu `UPDATE ... WHERE version = ?` của Hibernate là lưới cuối.
- Cả hai ném `OptimisticLockingFailureException` nên `GlobalExceptionHandler` có sẵn đổi thành `409 CONCURRENT_MODIFICATION` ở một chỗ, đúng như D-172 muốn.

### 6.2 Vì sao `update` không cần `flush()` (một giả định sai mà kiểm bằng lỗi gài đã lộ ra)
Bản đầu của `update` có `notes.flush()` ở cuối, với lý do: Hibernate chỉ tăng `version` khi ghi xuống database (lúc commit), nên nếu hàm trả ghi chú trước đó thì web nhận `version` cũ, lưu lần sau với `version` cũ và tự gây `409` cho chính mình.

Lý do đó sai. Kiểm bằng lỗi gài (bỏ dòng `flush()`) không làm test nào đỏ, kể cả `savesANewBodyAndRaisesTheVersion` đòi object trả về mang `version` 1. Lý do:

```text
controller gọi service.update(...)
  -> proxy @Transactional mở transaction
     -> thân hàm sửa object Note (managed)
  -> proxy commit: Hibernate flush, gửi UPDATE ... version = 4, và gán 4 vào CHÍNH object đó
  -> proxy trả object về controller          <- controller đọc version SAU commit, đã là 4
```

`update` là ranh giới transaction (`open-in-view: false`, controller không nằm trong transaction nào), nên khi controller nhận object thì commit đã xong. Cùng lý do mà ngoại lệ khóa lạc quan của hai request đua nhau vẫn bay ra khỏi `update` dù không flush: lỗi lúc commit được Spring đổi thành `ObjectOptimisticLockingFailureException` rồi ném ra từ lời gọi qua proxy (test `twoSavesFromTheSameVersionAtOnceLeaveOneConflict` đúng một lần bị từ chối).

Chỉ khi một service khác gọi `update` bên trong transaction của nó thì object mới còn `version` cũ cho tới khi flush; hiện không có chỗ nào như vậy. Bài học: một dòng "để chắc ăn" mà không test nào cần là code thừa mang một lời giải thích sai; bỏ nó đi.

### 6.3 Ghim không phải một lần sửa, nhưng vẫn tăng `version` (D-175)
`updated_at` do code của ta đặt: `edit` đặt, `pin` không đụng tới. `version` thì Hibernate tự tăng khi **bất kỳ** cột nào đổi:

| Lệnh | Cột đổi | `updated_at` | `version` |
|---|---|---|---|
| sửa nội dung hoặc tiêu đề | `title`/`body`, `updated_at` | đổi | +1 |
| ghim / bỏ ghim | `pinned` | giữ | +1 |
| sửa cùng giá trị | không cột nào | giữ | giữ |

Dòng cuối là chỗ dễ sai: `edit` phải trả `false` **trước khi** gán `updatedAt`. Nếu gán `updatedAt = now` rồi mới so, Hibernate thấy một cột đổi và tăng `version` cả khi chữ không đổi. Lúc đó tab nào tự lưu lại đúng chữ cũ cũng làm tab kia gặp `409` vô lý. Test `aChangeToTheSameValuesKeepsTheVersionAndTheTimeOfTheEdit` giữ chỗ này.

### 6.4 Quy tắc nội dung ở ba nơi, mỗi nơi một vai
- Java (`Note.create`, `Note.edit`): ném `IllegalArgumentException`, giữ bất biến của object. `edit` kiểm **cả hai** giá trị trước khi gán nên lỗi giữa chừng không để lại một object nửa cũ nửa mới (test `anEditThatBreaksARuleChangesNothing`).
- API (BE-91, sắp tới): Bean Validation trả `400` có tên ô lỗi, để web hiện đúng chỗ.
- Database: `CHECK` là lưới cuối cho mọi đường ghi khác (SQL viết tay, một lỗi lập trình sau này).

Hai lớp đầu và `CHECK` không giống hệt nhau, và đó là cố ý:
- `String.isBlank()` của Java coi mọi khoảng trắng Unicode (xuống dòng, tab, khoảng trắng toàn góc U+3000) là trắng, còn `btrim(body) <> ''` của PostgreSQL chỉ cắt dấu cách. `CHECK` yếu hơn Java, nên mọi thứ Java nhận thì `CHECK` cũng nhận. Test chèn thẳng `'   '` (toàn dấu cách) để thấy `CHECK` chặn.
- Đếm ký tự: Java `String.length()` đếm đơn vị UTF-16, `char_length` của PostgreSQL đếm code point. Một ký tự ngoài bảng cơ bản (emoji chẳng hạn) là 2 trong Java và 1 trong PostgreSQL, nên Java luôn chặn trước hoặc cùng lúc, không bao giờ có ghi chú qua Java mà vi phạm `CHECK`.
- Bẫy của `CHECK`: biểu thức ra `NULL` thì **qua**. `title IS NULL OR btrim(title) <> ''` viết rõ nhánh `NULL` ra trước để không dựa vào quy tắc đó.

### 6.5 Tiêu đề trống là `null`, và `null` trong `NoteChange` là "giữ nguyên"
`Note.checkedTitle` đổi tiêu đề trống thành `null`, nên "không có tiêu đề" chỉ có một cách lưu. `edit` so hai tiêu đề bằng `Objects.equals`, an toàn với `null`.

`NoteChange` dùng `null` cho "client không gửi trường này", còn `title` là chuỗi rỗng cho "bỏ tiêu đề". `Note.edit(title, body, now)` thì nhận hai giá trị **đầy đủ**, không phải bản vá. Việc đổi "giữ nguyên" thành giá trị hiện có nằm trong `NoteService.update`:

```java
note.edit(change.title() != null ? change.title() : note.title(),
          change.body() != null ? change.body() : note.body(), clock.instant());
```

Làm vậy `edit` đơn giản, dễ test thành bảng, và "không đổi gì" chỉ là so hai cặp giá trị.

### 6.6 Thứ tự danh sách nằm ngay trong tên hàm
`findByOwnerIdOrderByUpdatedAtDescIdDesc`: Spring Data dựng câu truy vấn từ tên hàm. ID là UUIDv7, tăng theo thời gian tạo, nên hai ghi chú cùng `updated_at` thì ghi chú tạo sau đứng trước, và thứ tự không nhảy giữa các lần đọc. Test `notesEditedAtTheSameTimeComeLargestIdFirst` chèn thẳng ba ID cố định bằng SQL thay vì dựa vào cách Hibernate sinh ID.

### 6.7 Test: hai tab cùng lúc
- `NoteTests` không nạp Spring; các giá trị trống dùng `@NullAndEmptySource` cộng `@ValueSource`, một bảng cho tiêu đề và một bảng cho nội dung.
- `NoteServiceTests` dùng `MovableClock` chỉnh tay như `TaskServiceTests`.
- `twoSavesFromTheSameVersionAtOnceLeaveOneConflict` cho hai luồng cùng gửi `version` 0 sau một `CountDownLatch`. Dù hai luồng xen kẽ thế nào, kết quả cố định: đúng một lần lưu được và một lần bị từ chối. Nếu luồng sau đọc sau khi luồng trước commit thì lớp 1 bắt; nếu cả hai đọc trước thì lớp 2 bắt (PostgreSQL cho câu `UPDATE` thứ hai chờ rồi thấy `version` đã đổi). Test này không cần `sleep`, nên không chập chờn.
- `aSaveOverAnOlderReadIsRefusedByTheDatabaseToo` chạy lần sửa thứ hai trên luồng khác như mục 2.8, để chứng minh lớp 2 một mình cũng đủ.
- Test `@ApplicationModuleTest` chỉ nạp module `notes` cùng module chung `common`; `identity` chưa cần vì BE-90 chưa có đường REST.

### 6.8 Kiểm chứng (BE-90)
- RED: viết `NoteTests` và `NoteServiceTests` trước, `test-compile` hỏng vì chưa có `Note`, `NoteService`, `NoteRepository`; GREEN ngay lần chạy đầu (28 + 23 test và `ModularityTests` 2/2). `module-notes.adoc` do Modulith sinh ra xác nhận `notes` là một module.
- Kiểm bằng lỗi gài một lần cho `Note`, `NoteService` và `NoteRepository` (20 lỗi, mỗi lần một thay đổi, chạy lại hai lớp test): 19 bị bắt. Lỗi còn lại (bỏ `flush()`) sống sót và hóa ra là code thừa dựa trên giả định sai (mục 6.2), nên dòng đó bị bỏ. Hai lỗi đổi thứ tự danh sách ban đầu không biên dịch được vì đổi tên hàm repository mà quên chỗ gọi; gài lại cho đúng thì cả hai bị bắt.
- `./mvnw -B -ntp verify` (JDK 25, PostgreSQL 18 trong Docker): 1546 test, 0 lỗi, 4 bỏ qua.
