# Phase 4 · F16 + F17 — Việc cần làm và Lịch (lõi, chưa nhắc nhở) · Technical Design

> Mode: **HYBRID** — backend và frontend AUTO; quyết định kiến trúc do người dùng chốt. Buổi brainstorm 2026-10-12 (phiên sino-api-94): người dùng chọn làm song song với phần Gmail, chưa gắn tin nhắn, nhắc nhở để sau, phạm vi "đủ dùng, có lặp lại", sửa / xóa lịch hẹn lặp áp cho cả chuỗi; rồi duyệt thiết kế hai phần trong chat ("oke ổn ồi đó", "oke viết change luôn đi").
> Chạy song song với phiên sino-api-27 (F10). Đã thống nhất: migration V18–V19 cho change này (F10 giữ V17 và lên `dev` trước); số quyết định D-150…D-169; task BE-70…BE-79, FE-70…FE-79; build trong git worktree riêng; V18/V19 chỉ chạy trên Testcontainers, không đưa vào database Compose dùng chung cho tới khi cả hai đã lên `dev`.
> Nguồn: `openspec/changes/planner-from-messages` (D-25…D-29, spec đích `tasks`, `calendar`, mô hình dữ liệu phác thảo), hợp đồng dữ liệu trong `fe-ui-tasks/design.md` (D-80…D-84) và `fe-ui-calendar/design.md` (D-85…D-89), canvas "Sino UI" (`Tasks`, `Calendar`, `MobileTasks`, `MobileCalendar`, lớp phủ `InboxTask`, `InboxEvent`, `MobileConversationTask`, `MobileConversationEvent`).

## Context

- Web (2026-10-09): màn Việc cần làm (`/tasks`) và Lịch (`/calendar`) dựng xong trên dữ liệu mẫu, có kiểu dữ liệu làm hợp đồng cho backend. Màn Việc: danh sách theo nhóm, lọc, thêm bằng tiêu đề, xong / mở lại (việc lặp: máy chủ trả lần kế tiếp), chi tiết, ghi chú lưu khi rời ô; nhóm và "hôm nay" tính ở trình duyệt (D-84). Màn Lịch: Tuần / Tháng / Lịch trình, chi tiết lịch hẹn, một request cho một khoảng ngày, máy chủ trả từng lần lặp (D-86). Các nút "Sửa", "Xóa task", "Lịch hẹn", "Xóa lịch hẹn"… hiện như canvas nhưng chưa làm gì (D-80, D-85).
- Backend: chưa có module `planner`. Quy ước sẵn có: JPA cho aggregate có trạng thái (`account/domain/ConnectedAccount`: UUIDv7 bằng `@UuidGenerator`, `@Version`, `user_id` khóa ngoại tới `app_user`), `CurrentUser.requireOwnerId()`, `Clock` là bean (`common/time`), lỗi qua `SinoException` + `ErrorCode` theo Problem Details (F01), JVM chạy UTC.
- Hai phiên làm song song: sino-api-27 đang làm F10 (`account`, `conversation`, `provider`); change này chỉ thêm package mới.

## Goals / Non-Goals

**Goals:**
- Việc và lịch hẹn lưu thật trong Sino; tải lại trang không mất gì.
- Việc lặp và lịch hẹn lặp đúng lịch ở các ca biên (ngày 31, 29/02, hoàn thành trễ, đổi giờ mùa hè), giờ địa phương không trôi.
- Một request cho một khoảng ngày của Lịch, gồm cả lần lặp, không lưu sẵn từng lần.
- Hai màn web dùng được hết vòng: tạo, sửa hạn và lặp, xong / mở lại, xóa; tạo, sửa, xóa lịch hẹn.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-150 — Một change cho F16 + F17; đợt này không nhắc nhở, chưa gắn tin nhắn · **Accepted** (người dùng, 2026-10-12)
Lõi việc + lịch hẹn + xem lịch trong một change, như `f07-f08-realtime-inbox`: cùng module, cùng quy tắc lặp, API Lịch gộp cả việc. Nhắc nhở cần F13 (scheduler) và F14 (thông báo) — làm ở đợt sau. Tạo từ tin nhắn, "Nhắc tôi", nguồn: sau khi phần Gmail xong. API vẫn giữ hình dạng của hợp đồng: `reminder: null`, `source: null`, `related: null`, `reminders: []`.
**Phương án bị loại:** theo đúng roadmap F13 → F14 → F16 → F17 (hai feature hạ tầng trước khi thấy việc thật); F13 trước rồi báo trong app qua SSE.

### D-151 — Sửa hay xóa lịch hẹn lặp áp cho cả chuỗi · **Accepted** (người dùng, 2026-10-12)
Không có "chỉ lần này" hay "lần này và các lần sau". Canvas cũng chỉ vẽ "Sửa" và "Xóa lịch hẹn". Khi cần, thêm bảng ngoại lệ (bỏ / đổi một lần) mà không sửa cái đã làm.
**Phương án bị loại:** "Chỉ lần này / Cả chuỗi" (bảng ngoại lệ, API và hộp thoại canvas chưa vẽ); đủ ba kiểu (tách chuỗi).

### D-152 — Quy tắc lặp là các cột `rec_*` ngay trong hàng · **Accepted** (agent đề xuất, người dùng duyệt 2026-10-12)
`task` và `calendar_event` cùng có `rec_freq`, `rec_interval`, `rec_by_weekdays`, `rec_by_month_day`, `rec_until_date`, `rec_count`, `rec_time_zone`; Java là một `@Embeddable Recurrence` dùng chung. Mỗi quy tắc thuộc đúng một chuỗi; lần kế tiếp của việc lặp chép quy tắc sang hàng mới, nên sửa quy tắc ở lần mới không đổi các lần đã xong. CHECK trong database giữ ràng buộc (không có `until` và `count` cùng lúc…).
**Phương án bị loại:** bảng `recurrence` riêng như bản phác thảo của `planner-from-messages` (join, vòng đời của hàng dùng chung giữa các lần); chuỗi RRULE theo RFC 5545 (cần parser hoặc thư viện iCalendar cho một tập quy tắc nhỏ).

### D-153 — `PATCH` cho tiêu đề và ghi chú; `PUT …/schedule` cho hạn + lặp; lịch hẹn sửa bằng `PUT` cả bản · **Accepted** (agent đề xuất, người dùng duyệt)
`PATCH /api/tasks/{id}` nhận `title`, `notes`; trường thiếu hoặc `null` là giữ nguyên (như `PATCH /api/accounts/{id}`). `PUT /api/tasks/{id}/schedule` nhận `{ dueAt, dueDate, recurrence }` và thay cả cụm; `null` là không có. `PUT /api/events/{id}` thay cả lịch hẹn.
**LÝ DO:** record Java không phân biệt "không gửi" với "gửi null", nên không xóa được hạn qua một `PATCH` kiểu account; hạn và quy tắc lặp phải đổi cùng nhau (có lặp thì phải có hạn, ngày gốc lấy từ hạn). Biểu mẫu lịch hẹn luôn gửi đủ các ô.
**Phương án bị loại:** JSON Merge Patch (RFC 7396) với `JsonNullable` hay `Optional` trong record (thêm cách đọc JSON riêng cho một chỗ); một `PUT /api/tasks/{id}` cả bản (ghi chú lưu khi rời ô sẽ phải gửi lại cả hạn và lặp).

### D-154 — Mở lại một việc lặp đã có lần kế tiếp thì giữ cả hai · **Accepted** (agent đề xuất, người dùng duyệt)
`reopen` chỉ đổi việc đó về `OPEN`; lần kế tiếp đã tạo vẫn còn. Web đã xử lý hai việc mở cùng chuỗi (TK-01).
**LÝ DO:** không bao giờ tự xóa dữ liệu người dùng có thể đã sửa (ghi chú, hạn của lần kế tiếp).
**Phương án bị loại:** xóa lần kế tiếp khi nó chưa bị sửa (phải theo dõi "đã sửa chưa", vẫn có thể xóa nhầm).

### D-155 — `GET /api/calendar` tối đa 62 ngày, ngày tính theo múi giờ của Sino · **Accepted** (agent đề xuất, người dùng duyệt)
`from`, `to` là ngày (`to` không gồm), `from < to`, `to - from ≤ 62`; sai → `400 VALIDATION_FAILED`. Khoảng thời điểm là [đầu ngày `from`, đầu ngày `to`) ở `sino.planner.time-zone`. Màn Tháng cần tối đa 42 ngày, Lịch trình 14.
**LÝ DO:** giới hạn số lần lặp phải tính cho một request.

### D-156 — JPA với `@Version` · **Accepted** (agent đề xuất, người dùng duyệt)
Như `account`: thêm, sửa, xóa từng việc theo aggregate, khóa lạc quan báo `409 CONCURRENT_MODIFICATION`. Không dùng JDBC như `conversation` (ở đó là ghi đè hàng loạt khi đồng bộ).

### D-157 — Múi giờ là cấu hình `sino.planner.time-zone`; mỗi hàng có lặp lưu múi giờ của nó · **Accepted** (agent đề xuất, người dùng duyệt)
`PlannerProperties` (`@ConfigurationProperties("sino.planner")`, `timeZone` là `ZoneId`, mặc định `Asia/Ho_Chi_Minh`, tên sai thì ứng dụng không khởi động). Khi tạo hoặc đặt quy tắc lặp, `rec_time_zone` = múi giờ cấu hình lúc đó; lần lặp tính theo múi giờ của hàng.
**Làm khác lúc trình bày:** ~~`sino.user.time-zone`~~ → `sino.planner.time-zone`. **LÝ DO:** cấu hình nằm trong module dùng nó; prefix `sino.user` không có chủ, còn người dùng là `sino.owner.*` của module `identity` (đang không ai sửa và không thuộc phạm vi). Khi có hồ sơ người dùng thì chuyển múi giờ vào đó.
**Phương án bị loại:** không lưu múi giờ trong hàng (đổi cấu hình thì mọi chuỗi cũ trôi giờ).

### D-158 — Biểu mẫu theo lớp phủ `InboxTask` / `InboxEvent`; hộp thoại trên desktop, trang riêng trên điện thoại · **Accepted** (agent chốt, frontend AUTO; người dùng duyệt trong thiết kế phần 2)
- Việc: Tiêu đề, Hạn (ngày) + Giờ (chip "Cả ngày", "09:00", "17:00" và ô chọn giờ), Lặp lại (Không lặp / Hằng ngày / Hằng tuần / Hằng tháng / Hằng năm / Tùy chỉnh…), Ghi chú. Bỏ "Nhắc tôi", "Liên kết với thư".
- Lịch hẹn: Tiêu đề, Ngày, Thời gian (bắt đầu – kết thúc hoặc cả ngày), Địa điểm, Lặp lại, Ghi chú, dòng "Lịch hẹn chỉ nằm trong Sino, không gửi lời mời cho ai." Bỏ "Nhắc tôi", "Liên kết với thư".
- "Tùy chỉnh…": mỗi N ngày / tuần / tháng / năm, các thứ (Hằng tuần), kết thúc: không bao giờ / tới ngày / sau N lần. Canvas chưa vẽ: dựng bằng chip và ô nhập của canvas.
- Chân biểu mẫu: múi giờ của trình duyệt ("Giờ Việt Nam · GMT+7"), "Hủy", nút chính ("Tạo task" / "Lưu", "Tạo lịch hẹn" / "Lưu").
- Đường dẫn: `/tasks/:taskId/edit`, `/calendar/new`, `/calendar/:itemId/edit` (giữ `view`, `date`), để Back và tải lại giữ đúng chỗ như D-82 / D-87. Từ 768 px biểu mẫu là hộp thoại trên trang đang xem; dưới 768 px là trang riêng có nút quay lại.
**Phương án bị loại:** sửa từng dòng ngay trong khối chi tiết (canvas không vẽ, mỗi dòng cần bộ chọn riêng); một hộp thoại không có đường dẫn (Back đóng cả màn trên điện thoại).

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Tên bảng `calendar_event`**, không `event`: tránh nhầm với `event_publication` của Spring Modulith và với "event" của `realtime`. Lớp Java `CalendarEvent`.
- **Ngày gốc của lặp hằng tháng / hằng năm** là `rec_by_month_day` (ngày trong tháng của hạn / giờ bắt đầu đầu tiên). Gửi thiếu thì máy chủ lấy ngày của mốc. Gửi kèm thì phải bằng ngày của mốc, hoặc lớn hơn khi mốc là ngày cuối tháng (mốc đã bị lùi từ ngày 31 về 30/11). Hằng năm dùng tháng của mốc và cùng cột này (29/02 → 28/02 → 29/02).
- **Hằng tuần:** `rec_by_weekdays` không rỗng và phải có thứ của mốc. Tuần tính từ thứ Hai (ISO 8601); "mỗi N tuần" đếm từ tuần của mốc.
- **Mốc là lần thứ nhất.** `rec_count` đếm cả mốc; `rec_until_date` gồm cả ngày đó và không trước ngày của mốc. `rec_interval` 1…99, `rec_count` 1…999.
- **Chuỗi việc:** `series_id` đặt bằng ID của việc lần đầu nó có quy tắc lặp và giữ nguyên về sau; `occurrence_index` là thứ tự của lần (mốc = 0). `PUT …/schedule` với quy tắc mới đặt việc đó làm mốc mới (`occurrence_index = 0`, `series_id` giữ). Bỏ quy tắc thì việc vẫn giữ `series_id` (lịch sử chuỗi), không tạo lần kế tiếp nữa.
- **Lịch hẹn:** độ dài tối đa 14 ngày (cả có giờ và cả ngày), để lần lặp bắt đầu trước khoảng xem mà còn kéo dài vào khoảng thì vẫn tìm được (tìm các lần bắt đầu trong [`from` − 14 ngày, `to`)). Lần lặp có giờ giữ giờ bắt đầu địa phương, kết thúc = bắt đầu + độ dài của mốc.
- **ID của một lần trên Lịch:** `<eventId>@<ngày bắt đầu>` cho mọi lịch hẹn (lặp hay không), `<taskId>@<ngày hạn>` cho lần sắp tới chưa tạo của việc lặp; việc thật dùng ID của nó.
- **Ghi chú** của việc và lịch hẹn ≤ 20.000 ký tự (như ghi chú F15); chỉ khoảng trắng là không có ghi chú. Địa điểm ≤ 200.
- **Xong / mở lại lặp lại hai lần** không lỗi và không tạo thêm lần kế tiếp (gọi lại an toàn khi mạng chập chờn): `complete` trên việc đã xong trả `{ task, next: null }`; `reopen` trên việc đang mở trả nguyên việc.

## Backend design

### 1. Module và package

```text
dev.sino.planner
  api/             TasksController, EventsController, CalendarController, request/response records
  application/     TaskService, EventService, CalendarService, PlannerProperties, PlannerErrorCode
  domain/          Task, CalendarEvent (JPA), Recurrence (@Embeddable), Frequency, Due, RecurrenceCalculator
  infrastructure/  TaskRepository, CalendarEventRepository (Spring Data JPA)
```

Không export gì cho module khác (chưa module nào cần). Phụ thuộc: `identity` (`CurrentUser`), `common`. `ModularityTests` thấy module mới.

### 2. Dữ liệu (V18, V19)

```text
task                                         calendar_event
  id uuid PK (UUIDv7, Hibernate)               id uuid PK
  user_id uuid FK app_user                     user_id uuid FK app_user
  title varchar(200) NOT NULL                  title varchar(200) NOT NULL
  notes text (≤ 20000, CHECK)                  location varchar(200)
  due_at timestamptz                           notes text (≤ 20000, CHECK)
  due_date date                                starts_at, ends_at timestamptz
  status varchar(8) OPEN|DONE                  start_date, end_date date (end không gồm)
  completed_at timestamptz                     rec_* (như bên trái)
  series_id uuid, occurrence_index int         created_at, updated_at, version
  rec_freq varchar(8), rec_interval smallint,
  rec_by_weekdays varchar(64), rec_by_month_day smallint,
  rec_until_date date, rec_count smallint, rec_time_zone varchar(64)
  created_at, updated_at timestamptz, version bigint
```

CHECK: `due_at` và `due_date` không cùng có; `status = 'DONE'` ⇔ có `completed_at`; nhóm `rec_*` hoặc đều trống hoặc có `rec_freq`, `rec_interval`, `rec_time_zone`; không có `rec_until_date` cùng `rec_count`; có `rec_freq` thì phải có hạn (task) / mốc (event). Lịch hẹn: đúng một trong hai cặp (`starts_at`+`ends_at`, `start_date`+`end_date`), kết thúc sau bắt đầu. `rec_by_weekdays` lưu như `MONDAY,THURSDAY` (converter JPA, thứ tự cố định).

Index: `task (user_id, status, due_at, due_date)` cho danh sách và khoảng ngày; `task (user_id, completed_at) WHERE status = 'DONE'`; `calendar_event (user_id, starts_at)`, `(user_id, start_date)`; lịch hẹn lặp lọc theo `user_id` + `rec_freq IS NOT NULL`.

### 3. `RecurrenceCalculator` (thuần `java.time`, không Spring)

- `occurrencesBetween(anchor, rule, fromInclusive, toExclusive)`: mọi lần (kèm `occurrenceIndex`) có ngày trong khoảng, tôn trọng `count` / `until`. Nhảy thẳng tới gần đầu khoảng bằng số học (DAILY: số ngày / N; WEEKLY: số tuần / N × số thứ; MONTHLY, YEARLY: số tháng / năm), không sinh từ mốc rồi lọc.
- `nextAfter(anchor, rule, currentIndex, currentDate, today)`: lần đầu tiên sau lần hiện tại mà ngày không trước `today`; các lần bị bỏ qua vẫn tăng `occurrenceIndex`; vượt `count` / `until` → rỗng.
- Ngày không có trong tháng: lùi về ngày cuối tháng, tháng sau quay về ngày gốc.
- Có giờ: `ZonedDateTime.of(ngày, giờ địa phương của mốc, rec_time_zone)` (giờ không tồn tại khi đổi giờ mùa hè thì theo quy tắc mặc định của `ZonedDateTime`: lùi về sau khoảng hở).

### 4. Việc (`TaskService`, `/api/tasks`)

| Lệnh | Hành vi |
|---|---|
| `GET /api/tasks` | `{ generatedAt, tasks }`: mọi việc `OPEN` + việc `DONE` có `completed_at` trong 7 ngày (theo `Clock`), của người gọi |
| `POST /api/tasks` | `{ title, notes?, dueAt?, dueDate?, recurrence? }` → `201` + `Location` + việc |
| `PATCH /api/tasks/{id}` | `{ title?, notes? }`, ít nhất một trường; `notes: ""` là xóa ghi chú |
| `PUT /api/tasks/{id}/schedule` | `{ dueAt, dueDate, recurrence }` thay cả cụm (D-153) |
| `POST /api/tasks/{id}/complete` | `{ task, next }`; việc lặp còn lần → tạo `next` cùng `series_id`, tiêu đề, ghi chú, quy tắc |
| `POST /api/tasks/{id}/reopen` | việc về `OPEN`, `completed_at` trống (D-154) |
| `DELETE /api/tasks/{id}` | `204`; chỉ hàng đó |

Hình dạng một việc theo hợp đồng `TaskItem` của `fe-ui-tasks` (`reminder`, `source`, `related` = `null`). `recurrence` trong JSON: `{ freq, interval, byWeekdays, byMonthDay, untilDate, count }` (không trả `timeZone`; web không cần).

### 5. Lịch hẹn (`EventService`, `/api/events`)

`POST /api/events` → `201`; `GET /api/events/{id}` (cả chuỗi: mốc, quy tắc — biểu mẫu "Sửa" đọc từ đây); `PUT /api/events/{id}` thay cả bản; `DELETE /api/events/{id}` → `204` (cả chuỗi, D-151). Thân: `{ title, startsAt?, endsAt?, startDate?, endDate?, location?, notes?, recurrence? }`.

### 6. Xem lịch (`CalendarService`, `GET /api/calendar`)

1. Kiểm `from`, `to` (D-155); đổi ra [`fromInstant`, `toInstant`) ở `sino.planner.time-zone`; `today` từ `Clock` ở cùng múi giờ.
2. **Lịch hẹn không lặp** giao với khoảng (có giờ: `starts_at < toInstant AND ends_at > fromInstant`; cả ngày: `start_date < to AND end_date > from`). **Lịch hẹn lặp** có mốc trước `to`: tính các lần bắt đầu trong [`from` − 14 ngày, `to`) rồi giữ lần giao với khoảng.
3. **Việc**: việc có hạn trong khoảng (`OPEN` và `DONE`); nếu khoảng chứa `today` thì thêm việc `OPEN` có hạn trước `from` (quá hạn từ trước, như mẫu `fe-ui-calendar`); với mỗi việc lặp đang mở: các lần sau hạn của nó, ngày không trước `today`, trong khoảng, chưa vượt `count` / `until` → mục ảo `{ id: "<taskId>@<ngày>", taskId, status: OPEN }`.
4. `{ generatedAt, from, to, events, tasks, reminders: [] }`, hình dạng theo hợp đồng `CalendarData` (trừ `providers`, web lấy ở `GET /api/providers`).

### 7. Lỗi và bảo mật

- Lỗi theo ô và giữa các ô của cùng một request (tiêu đề rỗng / quá dài, có cả `dueAt` lẫn `dueDate`, lặp mà không có hạn, `until` cùng `count`, kết thúc không sau bắt đầu, lịch hẹn dài quá 14 ngày, `from`/`to` sai hoặc quá 62 ngày) kiểm bằng Bean Validation trên record request → `400 VALIDATION_FAILED` kèm danh sách ô (như các module khác).
- Quy tắc lặp không khớp mốc — cần múi giờ mới biết thứ / ngày của mốc (thứ của mốc không nằm trong `byWeekdays`, `byMonthDay` khác ngày của mốc, `untilDate` trước mốc) — domain kiểm và ném `SinoException(PlannerErrorCode.INVALID_RECURRENCE)`, category `INVALID` → `422`.
- `TASK_NOT_FOUND`, `EVENT_NOT_FOUND` (category `NOT_FOUND` → `404`; việc của người khác báo y như không có).
- Khóa lạc quan → `409 CONCURRENT_MODIFICATION` (đã có trong `GlobalExceptionHandler`).
- Mọi endpoint dưới `/api/**`: cần đăng nhập, thay đổi cần CSRF (đã cấu hình chung).

## Web

### 1. Dữ liệu
- `tasks.api.ts`, `calendar.api.ts`: thân hàm gọi API qua `shared/api/client` và đổi dữ liệu trong adapter (như `inbox.api.ts`); thêm `updateTask`, `scheduleTask`, `deleteTask`, `fetchEvent`, `createEvent`, `updateEvent`, `deleteEvent`. Dữ liệu mẫu ở lại cho test và MSW.
- Hook: mọi thay đổi việc làm mới cả danh sách việc lẫn mọi khoảng Lịch đang có trong cache (và ngược lại với lịch hẹn); giữ cách đổi ngay rồi trả lại khi lỗi của TK-01 cho xong / mở lại.
- Số "Việc cần làm" trên điều hướng tính từ `GET /api/tasks` (D-83).

### 2. Màn
- Phần không có dữ liệu không hiện: dòng "Nhắc", thẻ "Tin nhắn gốc", "Liên quan", nhãn nguồn. "Nhắc lại sau…" và "Thêm thao tác" ẩn cho tới khi có thao tác thật.
- Việc: khối chi tiết có "Sửa" (mở `/tasks/:taskId/edit`) và "Xóa task" (hỏi lại: "Xóa việc này?"). Ô thêm nhanh giữ nguyên (chỉ tiêu đề).
- Lịch: "Lịch hẹn" (desktop) / "Thêm lịch hẹn" (điện thoại) mở `/calendar/new` với ngày đang xem; khối chi tiết có "Sửa" và "Xóa lịch hẹn" (lịch hẹn lặp: "Xóa cả chuỗi lịch hẹn này?"). Sửa lịch hẹn lặp hiện mốc của chuỗi và ghi "Áp dụng cho mọi lần lặp".
- Biểu mẫu theo D-158; `RecurrenceField` dùng chung cho hai biểu mẫu.

### 3. Test (web)
MSW cho mọi request; test viết trước; hook và adapter có test riêng; biểu mẫu: tạo, sửa, bỏ hạn, đổi lặp, "Tùy chỉnh…", lỗi validation từ máy chủ, hủy; xóa và hỏi lại; Chrome theo luật kiểm chứng gọn của `CLAUDE.md`.

## Testing

| Lớp | Nội dung |
|---|---|
| Unit (test viết trước, dạng bảng) | `RecurrenceCalculator`: mỗi `freq`, `interval`, nhiều thứ trong tuần, ngày 31 qua tháng ngắn rồi quay lại, 29/02 qua năm thường, `count`, `until`, hoàn thành trễ nhiều chu kỳ, khoảng xa mốc (nhảy số học), đổi giờ mùa hè (`Europe/Berlin`), ngày cuối khoảng không gồm; validation của `Recurrence` |
| Service + JPA (Testcontainers PostgreSQL, `Clock` cố định) | tạo / sửa / đặt hạn / xong (lần kế tiếp, hết lần) / mở lại / xóa; 7 ngày của việc đã xong; CHECK của database; khóa lạc quan; chủ sở hữu khác |
| Web (`MockMvc` hoặc HTTP thật như các module khác) | mỗi endpoint: thành công, `400` từng lỗi validation, `422 INVALID_RECURRENCE`, `401`, thiếu CSRF, `404`, `409`; `GET /api/calendar`: lần lặp, quá hạn từ trước, lần sắp tới của việc lặp, 62 ngày |
| Kiến trúc | `ModularityTests` thấy `planner`, không vi phạm |
| Kiểm tra ngược | chỉ cho `RecurrenceCalculator` (logic thuần, nhanh); không chạy cho phần Spring (mỗi lượt cả giờ) |
| Chạy thật | ACC: backend + web trên một PostgreSQL riêng (không chờ F10, không cần account Gmail; người dùng 2026-10-12: "làm độc lập với Gmail"), đủ cỡ màn × 2 theme |

## Risks / Trade-offs

- [Trình duyệt và máy chủ khác múi giờ] → web nhóm việc theo múi giờ trình duyệt (D-84, D-89), máy chủ tính lần lặp và ngày của khoảng theo `sino.planner.time-zone`. Một người dùng ở Việt Nam thì trùng; chú giải và chân biểu mẫu ghi múi giờ đang dùng. Hồ sơ người dùng có múi giờ là việc sau.
- [Chuỗi không có điểm dừng] → lần lặp chỉ tính trong khoảng ≤ 62 ngày, nhảy số học tới đầu khoảng; độ dài lịch hẹn ≤ 14 ngày.
- [`GET /api/tasks` không phân trang] → một người dùng, việc đã xong chỉ lấy 7 ngày; nếu danh sách lớn thì thêm trang sau.
- [Hai phiên cùng sửa repo] → số hiệu và migration đã chia; database Compose dùng chung không nhận V18/V19 trước khi cả hai lên `dev`; `PROJECT_STATE.md` mỗi phiên chỉ sửa dòng của mình, đọc lại trước khi lưu.
- [Delta `tasks-screen`, `calendar-screen` sửa spec chưa archive] → archive change này sau `fe-ui-tasks` (TK-04) và `fe-ui-calendar` (CA-05).
- [Sửa cả chuỗi làm đổi các lần đã qua của lịch hẹn lặp] → chấp nhận theo D-151; biểu mẫu ghi rõ "Áp dụng cho mọi lần lặp".

## Migration Plan

V18 `planner_create_task`, V19 `planner_create_calendar_event`: chỉ thêm bảng, không đụng dữ liệu cũ. Lên `dev` sau V17 của F10. Không cần chuyển dữ liệu: dữ liệu mẫu chỉ có ở web. Gỡ change: xóa hai bảng và package `planner`.

## Open Questions

- Không còn câu hỏi chặn. Sau đợt này: nhắc nhở (F13, F14), gắn tin nhắn, "chỉ lần này" cho lịch hẹn lặp.

## Definition of Done — F16 + F17 (lõi)

- [ ] Các scenario của `tasks`, `calendar`, `recurrence` và delta `module-boundaries`, `tasks-screen`, `calendar-screen` có test và xanh.
- [ ] `./mvnw -B -ntp verify` xanh (trong worktree riêng); `ModularityTests` xanh; kiểm tra ngược `RecurrenceCalculator`.
- [ ] Web: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh.
- [ ] Chạy thật: tạo việc có hạn và lặp, xong → lần kế tiếp, mở lại, xóa; tạo lịch hẹn lặp, thấy trên Tuần / Tháng / Lịch trình, sửa, xóa; tải lại vẫn còn; đủ cỡ màn × 2 theme; hoặc NOT VERIFIED kèm lý do.
- [ ] README (API mới, cấu hình múi giờ), `docs/knowledge/phase-4-planner.md` + `.docx` (`genoffice docs check`).
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có lý do; `PROJECT_STATE.md` cập nhật; archive sau `fe-ui-tasks`, `fe-ui-calendar`.
