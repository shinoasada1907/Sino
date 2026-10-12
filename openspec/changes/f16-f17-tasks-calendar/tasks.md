# Phase 4 · F16 + F17 — Việc cần làm và Lịch (lõi) · Implementation Plan

> **HYBRID mode:** backend và frontend AUTO — Claude (sino-api-94) làm từng task theo thứ tự, kiểm chứng, commit riêng trên `dev` (không push), báo lại rồi dừng. Quyết định kiến trúc đã chốt trong `design.md` (D-150…D-158).
> Mỗi task: test đỏ trước rồi mới xanh. Backend: build, test trong **git worktree riêng** (không đụng `target/` mà IntelliJ của người dùng đọc, không dùng worktree `sino-build` của sino-api-27), `./mvnw -B -ntp verify` xanh, V18/V19 chỉ chạy trên Testcontainers hoặc database riêng của change này, không bao giờ trên database Compose dùng chung trước khi V17 của F10 và V18/V19 đều đã lên `dev`. Tính năng độc lập với Gmail (người dùng 2026-10-12): không task nào cần account đã kết nối hay phần việc của sino-api-27. Web: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh, Chrome một lượt ở các cỡ màn task đụng tới. Kiến thức vào `docs/knowledge/phase-4-planner.md` + `.docx` (`genoffice docs check`).
> Thứ tự: BE-70 → BE-71 → BE-72 → FE-70 → FE-71 → BE-73 → BE-74 → FE-72 → FE-73 → ACC (việc chạy hết vòng rồi mới sang lịch).

## 1. Việc cần làm

- [x] 1.1 **BE-70 — Module `planner`, múi giờ, quy tắc lặp và `RecurrenceCalculator`**
  - **Thực hiện (2026-10-12, AUTO):** `planner/domain`: `Frequency`; `Recurrence` (record; compact constructor kiểm mỗi N 1…99, số lần 1…999, không cả ngày dừng lẫn số lần, thứ chỉ cho hằng tuần và không rỗng, ngày gốc 1…31 chỉ cho hằng tháng / năm; tập thứ chép thành `EnumSet` không sửa được; `anchoredAt(mốc)` kiểm thứ của mốc, ngày gốc = ngày của mốc hoặc lớn hơn khi mốc là ngày cuối tháng, ngày dừng không trước mốc, điền ngày gốc còn thiếu, sai → `SinoException(INVALID_RECURRENCE)`; `instantAt(ngày, giờ)` theo múi giờ của quy tắc); `Occurrence(index, date)`; `RecurrenceCalculator.between(rule, anchor, from, to)` và `nextAfter(rule, current, today)` tính trên ngày, nhìn chuỗi từ một lần bất kỳ (thứ tự của lần đó + số lần còn lại), `dateOf(step)` bằng công thức và `firstOnOrAfter` nhảy bằng phép chia rồi bước tới; `PlannerErrorCode.INVALID_RECURRENCE` (`INVALID` → 422). `planner/application`: `PlannerProperties` (`sino.planner.time-zone`, `ZoneId`, mặc định `Asia/Ho_Chi_Minh`), `PlannerConfiguration`. `application.yaml`: `sino.planner.time-zone: ${SINO_PLANNER_TIME_ZONE:Asia/Ho_Chi_Minh}`.
  - **Làm khác kế hoạch:**
    - ~~`PlannerErrorCode` trong `planner/application` (BE-71)~~ → `planner/domain`, làm ở BE-70. **LÝ DO:** `Recurrence.anchoredAt` (domain) ném `INVALID_RECURRENCE`; domain không được phụ thuộc application.
    - ~~`Recurrence` là `@Embeddable` ở BE-70~~ → thêm chú thích JPA ở BE-71. **LÝ DO:** chưa có bảng để kiểm cách map cột; chú thích JPA không có test map là code chưa kiểm.
    - ~~`planner/package-info.java`~~ → không tạo. **LÝ DO:** không module nào khác có; Spring Modulith nhận module theo package, chưa có gì để khai báo.
  - **Kiểm chứng (2026-10-12):** build và test trong git worktree riêng (`scratchpad/sino-planner`, tách khỏi `target/` của IntelliJ và worktree của sino-api-27). RED với bản rỗng của các lớp (trả rỗng / `this` / `null`): 33 test đỏ đúng lý do (thiếu logic); 7 xanh sẵn là các ca "không có lần nào" (bản rỗng trả rỗng) và hai ca gắn cấu hình mà Spring tự làm (`ZoneId.of`). GREEN 40/40 ngay lần đầu. Kiểm tra ngược lượt 1: 32 lỗi gài, 26 bị bắt, 1 mẫu ghi sai thụt đầu dòng không áp được, 5 sống sót vì thiếu ca: lặp hằng năm mỗi 2 năm; nhảy tới khoảng xa mốc với mỗi N > 1 ở hằng ngày, hằng tháng, hằng năm; ngày gốc nhỏ hơn ngày cuối tháng của mốc → thêm 5 test. Lượt 2: 7 lỗi gài (5 cái cũ, cái không áp được, và một lỗi tương đương), 6 bị bắt; lỗi còn lại (`ceilDiv` → `floorDiv` trong bước nhảy hằng ngày) là **tương đương**: vòng bước tới ngay sau đó cho cùng kết quả. Sau khi thêm test: 45 test của `planner` xanh (28 + 14 + 3). `./mvnw -B -ntp verify` → 1255 test, 0 lỗi, 4 bỏ qua (giả định theo capability trong bộ kiểm contract, như trước), BUILD SUCCESS; `ModularityTests` 2/2, tài liệu Modulith có `module-planner` với cấu hình `sino.planner.time-zone`.
  - **Goal / Why:** lõi tính lần lặp dùng chung cho việc và lịch hẹn, kiểm được không cần database (D-152, D-157).
  - **Depends on:** —
  - **Files:** `planner/package-info.java`; `planner/application/PlannerProperties` (`sino.planner.time-zone`) + cấu hình; `planner/domain/{Frequency,Recurrence,RecurrenceCalculator,Occurrence}`; `application.yaml`; `docs/knowledge/phase-4-planner.md` (mới); test.
  - **Hướng làm:** design mục Chốt kỹ thuật, Backend 3. `Recurrence` là `@Embeddable` bất biến có hàm kiểm với mốc (`INVALID_RECURRENCE`); `RecurrenceCalculator` thuần `java.time`: `occurrencesBetween`, `nextAfter`, nhảy số học tới đầu khoảng.
  - **Test:** dạng bảng theo mọi scenario của spec `recurrence` (31 → 30/11 → 31/12, 29/02, mỗi 2 tuần nhiều thứ, `count`, `until`, trễ nhiều chu kỳ, khoảng cách mốc nhiều năm, `Europe/Berlin` đổi giờ); cấu hình múi giờ sai → ứng dụng không khởi động; `ModularityTests`. Kiểm tra ngược cho `RecurrenceCalculator`.
  - **Acceptance criteria:** spec `recurrence`; delta `module-boundaries`.
  - **Hints:** Level 1 — "vì sao lặp hằng tháng tính từ ngày gốc chứ không từ lần trước?"

- [ ] 1.2 **BE-71 — Bảng `task` và `TaskService`**
  - **Goal / Why:** việc lưu thật: tạo, sửa, đặt hạn và lặp, xong (lần kế tiếp) / mở lại, xóa.
  - **Depends on:** BE-70.
  - **Files:** migration V18 `planner_create_task`; `planner/domain/Task`; `planner/infrastructure/TaskRepository`; `planner/application/{TaskService,PlannerErrorCode,…}`; test.
  - **Hướng làm:** design Backend 2, 4; D-153, D-154, D-156; `complete` tạo lần kế tiếp trong cùng transaction, gọi lại trên việc đã xong không tạo thêm.
  - **Test:** Testcontainers PostgreSQL + `Clock` cố định: mỗi lệnh; 7 ngày của việc đã xong; CHECK của database (hai kiểu hạn, `DONE` không có lúc xong…); `INVALID_RECURRENCE`; chủ sở hữu khác → `TASK_NOT_FOUND`; khóa lạc quan.
  - **Acceptance criteria:** spec `tasks` (phần dữ liệu và hành vi).
  - **Hints:** Level 1 — "vì sao lần kế tiếp phải tạo cùng transaction với việc đánh dấu xong?"

- [ ] 1.3 **BE-72 — REST `/api/tasks`**
  - **Goal / Why:** web gọi được mọi thao tác của việc.
  - **Depends on:** BE-71.
  - **Files:** `planner/api/{TasksController,CreateTaskRequest,UpdateTaskRequest,ScheduleRequest,RecurrenceBody,TaskResponse,TasksResponse,CompletedTaskResponse}`; `apps/sino-api/README.md`; test.
  - **Hướng làm:** design Backend 4, 7; hình dạng JSON theo hợp đồng `TaskItem` của `fe-ui-tasks` (`reminder`, `source`, `related` = `null`).
  - **Test:** web test mỗi endpoint: `201` + `Location`, `200`, `204`, `400` từng lỗi ô, `422`, `401`, thiếu CSRF, `404`, `409`; JSON khớp hợp đồng.
  - **Acceptance criteria:** spec `tasks`.
  - **Hints:** Level 1 — "vì sao `PATCH` không xóa được hạn mà phải có `PUT …/schedule`?"

- [ ] 1.4 **FE-70 — Màn Việc cần làm trên API**
  - **Goal / Why:** thêm, xong / mở lại, ghi chú lưu thật; tải lại không mất.
  - **Depends on:** BE-72 (hợp đồng; chạy thật ở ACC).
  - **Files:** `apps/sino-web/src/features/tasks/{tasks.api,useTasks}.ts` (+ adapter), handler MSW, test; số "Việc cần làm" trên điều hướng; `TaskDetail`, `TaskRow` (ẩn phần không có dữ liệu, ẩn "Nhắc lại sau…", "Thêm thao tác").
  - **Hướng làm:** như `inbox.api.ts`; giữ đổi ngay rồi trả lại khi lỗi; dòng báo lỗi tại chỗ; thay đổi việc làm mới các khoảng Lịch trong cache.
  - **Test:** adapter, hook (lỗi → trả lại + câu báo), màn với MSW; Chrome 1440 và 390.
  - **Acceptance criteria:** delta `tasks-screen` (*Việc cần làm lưu trên máy chủ*, *Thêm việc*, *Chi tiết một việc*).
  - **Hints:** Level 1 — "dữ liệu mẫu còn giữ để làm gì khi màn đã chạy trên API?"

- [ ] 1.5 **FE-71 — Biểu mẫu việc (hạn, lặp) và xóa**
  - **Goal / Why:** đặt hạn và lặp lại cho một việc, xóa việc (D-158).
  - **Depends on:** FE-70.
  - **Files:** `features/tasks/components/{TaskForm,…}.tsx`, `src/shared/…/RecurrenceField.tsx` (dùng chung với lịch hẹn), route `/tasks/:taskId/edit`, hộp thoại hỏi lại; test.
  - **Hướng làm:** lớp phủ `InboxTask` của canvas bỏ nhắc và liên kết; hộp thoại từ 768 px, trang riêng dưới 768 px; lưu = `PATCH` + `PUT …/schedule`; lỗi máy chủ hiện cạnh ô.
  - **Test:** đặt hạn có giờ / cả ngày, bỏ hạn, mỗi lựa chọn lặp, "Tùy chỉnh…", lỗi `422` hiện ở ô Lặp lại, Hủy / Back, xóa; Chrome 1440, 768, 390.
  - **Acceptance criteria:** delta `tasks-screen` (*Sửa hạn và lặp lại của một việc*, *Xóa việc*).
  - **Hints:** Level 1 — "vì sao biểu mẫu có đường dẫn riêng chứ không chỉ là state của trang?"

## 2. Lịch

- [ ] 2.1 **BE-73 — Bảng `calendar_event` và `/api/events`**
  - **Goal / Why:** lịch hẹn lưu thật, sửa / xóa cả chuỗi (D-151).
  - **Depends on:** BE-70 (dùng `Recurrence`).
  - **Files:** migration V19 `planner_create_calendar_event`; `planner/domain/CalendarEvent`; `planner/infrastructure/CalendarEventRepository`; `planner/application/EventService`; `planner/api/{EventsController,EventRequest,EventResponse}`; README; test.
  - **Hướng làm:** design Backend 2, 5, 7; độ dài ≤ 14 ngày; lần lặp giữ giờ bắt đầu địa phương.
  - **Test:** service (Testcontainers) và web: `201`, `GET` cả chuỗi, `PUT`, `204`, `400` (kết thúc trước bắt đầu, quá 14 ngày, hai kiểu thời gian), `422`, `401`, CSRF, `404`, `409`.
  - **Acceptance criteria:** spec `calendar` (*Lịch hẹn cá nhân*, *Tạo, xem, sửa và xóa lịch hẹn*).
  - **Hints:** Level 1 — "vì sao bảng tên `calendar_event` chứ không phải `event`?"

- [ ] 2.2 **BE-74 — `GET /api/calendar`**
  - **Goal / Why:** một request cho một khoảng ngày gộp lần lặp của lịch hẹn và việc có hạn (D-86, D-155).
  - **Depends on:** BE-71, BE-73.
  - **Files:** `planner/application/CalendarService`; `planner/api/{CalendarController,CalendarResponse,…}`; truy vấn theo khoảng trong hai repository; README; test.
  - **Hướng làm:** design Backend 6: lịch hẹn không lặp theo SQL giao khoảng, lịch hẹn lặp tính trong [`from` − 14 ngày, `to`); việc có hạn trong khoảng, quá hạn từ trước khi khoảng chứa hôm nay, lần sắp tới của việc lặp; `reminders: []`.
  - **Test:** mọi scenario của *Xem lịch theo khoảng ngày*; biên của khoảng (`to` không gồm, lịch hẹn kết thúc đúng lúc `from`); 62 / 63 ngày; người dùng khác không thấy.
  - **Acceptance criteria:** spec `calendar` (*Xem lịch theo khoảng ngày*).
  - **Hints:** Level 1 — "vì sao tìm lần lặp từ `from` − 14 ngày chứ không từ `from`?"

- [ ] 2.3 **FE-72 — Màn Lịch trên API**
  - **Goal / Why:** Lịch hiện dữ liệu thật của khoảng đang xem.
  - **Depends on:** BE-74 (hợp đồng), FE-70.
  - **Files:** `features/calendar/{calendar.api,useCalendar}.ts` (+ adapter), handler MSW, `EventDetail` (ẩn phần không có dữ liệu, ẩn "Thêm thao tác"), test.
  - **Hướng làm:** như FE-70; chip của lần sắp tới mở việc đang mở (`taskId`).
  - **Test:** adapter, hook, màn với MSW; Chrome 1440 (Tuần, Tháng, Lịch trình) và 390.
  - **Acceptance criteria:** delta `calendar-screen` (*Lịch đọc từ máy chủ*, *Chi tiết lịch hẹn*).

- [ ] 2.4 **FE-73 — Biểu mẫu lịch hẹn: tạo, sửa, xóa**
  - **Goal / Why:** tạo lịch hẹn từ màn Lịch, sửa và xóa cả chuỗi (D-151, D-158).
  - **Depends on:** FE-72, FE-71 (`RecurrenceField`).
  - **Files:** `features/calendar/components/{EventForm,…}.tsx`, route `/calendar/new`, `/calendar/:itemId/edit`, hộp thoại hỏi lại, `CalendarHeader`, `MobileCalendar`; test.
  - **Hướng làm:** lớp phủ `InboxEvent` của canvas bỏ nhắc và liên kết; sửa đọc `GET /api/events/{id}`, lịch hẹn lặp ghi "Áp dụng cho mọi lần lặp".
  - **Test:** tạo có giờ / cả ngày / lặp, lỗi kết thúc trước bắt đầu, sửa từ một lần giữa chuỗi, xóa (câu hỏi lại khác khi lặp), Hủy / Back; Chrome 1440, 768, 390.
  - **Acceptance criteria:** delta `calendar-screen` (*Tạo lịch hẹn*, *Sửa lịch hẹn*, *Xóa lịch hẹn*).

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Chạy thật, tài liệu, nghiệm thu**
  - **Depends on:** mọi task trên. ~~V17 (F10) và V18/V19 đã lên `dev` (báo sino-api-27 trước khi chạy migration trên database Compose dùng chung)~~ → không chờ F10. **LÝ DO:** người dùng 2026-10-12: "trước tiên làm độc lập với Gmail đi như là làm 1 tính năng độc lập": chạy thật trên một PostgreSQL riêng (container riêng, cổng riêng, database bỏ đi được), không đụng database Compose dùng chung và không cần account Gmail.
  - **Việc:** chạy backend (từ worktree, profile trỏ tới database riêng) + web thật: luồng của Definition of Done trong `design.md`, đủ cỡ màn × 2 theme; README; file kiến thức + `.docx`; `PROJECT_STATE.md`.
  - **Acceptance criteria:** Definition of Done của `design.md`.
- [ ] 3.2 Archive: sau `fe-ui-tasks` (TK-04) và `fe-ui-calendar` (CA-05) — delta `tasks-screen`, `calendar-screen` sửa spec của hai change đó — `openspec archive f16-f17-tasks-calendar -y`. Đánh dấu mục 3.4 (F16) và 3.5 (F17) của `planner-from-messages` là làm một phần (phần nhắc nhở và gắn tin nhắn còn mở).
