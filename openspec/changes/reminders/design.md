# Design — reminders (nhắc hẹn qua email và trong app)

> Mode: chờ người dùng chọn (`new_features: TRAINING`, xem tasks.md). Phần 1 (hẹn giờ bằng background job) người dùng duyệt 2026-11-18; các lựa chọn sản phẩm chốt trong chat cùng ngày (proposal, *Why*). Đợt này làm backend; web làm ở đợt sau.

## Bối cảnh

- `planner` có `calendar_event` (V27) và `task` (V18), quy tắc lặp và `RecurrenceCalculator`, múi giờ `sino.planner.time-zone`.
- API `/api/events`, `/api/tasks`, `/api/calendar` đã có ô `reminder` (luôn `null`, D-150). Web đã khai báo kiểu: lịch hẹn `{at, offsetMinutes, state}`, việc `{at, state}`, `CalendarData.reminders`.
- `user_settings` (V23) có `notify_reminders` và `default_reminder_minutes` (5, 10, 15, 30, 60, 120, 1440).
- `provider/infrastructure/gmail/GmailApi` đã gọi Gmail API bằng OAuth2 (gửi thư trả lời, F10).
- `realtime` có SSE `/api/events/stream` (`conversations.changed`, `account.changed`).
- Chuông trên web chưa có kho thông báo phía máy chủ.

## Quyết định

### D-520 — Kênh nhắc: thêm email (sửa D-26) · **Accepted** (người dùng, 2026-11-18)
Nhắc qua chuông trong app **và** email tới `app_user.email`. Email gửi từ tài khoản Google riêng của Sino, không từ tài khoản provider của người dùng: lý do của D-26 (không trộn nhắc với tin thật, không phụ thuộc provider còn nối) vẫn giữ được. Web Push vẫn là F14.

### D-521 — Hàng đợi background job · **Accepted hướng, thư viện chốt ở RM-00**
Người dùng chọn background job ("dùng background job đi"). Thứ tự thử:
1. **JobRunr** (lưu job trong PostgreSQL đang có, tự thử lại, dashboard, nhiều instance không chạy trùng).
2. **db-scheduler** nếu JobRunr chưa chạy với Spring Boot 4 / Java 25.
3. Bảng `scheduled_job` tự viết (`FOR UPDATE SKIP LOCKED`, worker `@Scheduled` 15 giây) nếu cả hai không hợp.
RM-00 là spike vứt đi: thêm thư viện vào một worktree, hẹn một job 30 giây, khởi động lại app giữa chừng, xem job chạy bù. Kết quả ghi vào tasks.md trước khi làm RM-02. Dashboard của thư viện (nếu có) **tắt** ở mọi môi trường (local = production, và không mở thêm cổng).

### D-522 — Một job cho mỗi chuỗi có nhắc · **Accepted** (phần 1)
- Mã job cố định: `reminder:event:<id>`, `reminder:task:<id>`.
- Tạo / sửa lịch hẹn hay việc: hủy job cũ, tính lần sắp tới có giờ nhắc ≥ bây giờ, hẹn job mới vào giờ nhắc đó. Không có lần nào nữa (hết `count` / `until`) thì không hẹn.
- Xóa, việc xong, bỏ nhắc: hủy job.
- Job chạy xong một lần: tự hẹn lần lặp kế tiếp.
- Việc lặp: chỉ việc **đang mở** mang job; khi xong và sinh lần kế tiếp (việc thật mới) thì việc mới tự hẹn job của nó.
- Việc hẹn / hủy job chạy **sau khi giao dịch commit** (`@TransactionalEventListener(AFTER_COMMIT)` trên sự kiện của `planner`), để không hẹn job cho một thay đổi bị rollback.
- Lúc khởi động: không quét lại tất cả. Job nằm trong DB nên tự còn. Có một lệnh dọn chạy một lần (RM-02) hẹn job cho mọi chuỗi đang có nhắc mà chưa có job (cho dữ liệu cũ và phòng lệch).

### D-523 — Dạng của nhắc trong API · **Proposed**
- Ghi: `reminder: { "offsetMinutes": n } | null` trong body `POST/PUT /api/events` và `/api/tasks`. Giờ nhắc = lúc bắt đầu (hạn) − `n` phút.
- Có giờ: `n` ∈ {0, 5, 15, 30, 60, 1440}.
- Cả ngày (lịch hẹn cả ngày, việc chỉ có ngày): mốc là 00:00 ngày đó theo múi giờ của planner; `n` ∈ {−540 (9:00 hôm đó), 900 (9:00 hôm trước)}.
- Giá trị khác → `400` (`reminderAllowed`). Bỏ ô `reminder` khi tạo thì lấy `default_reminder_minutes` của Cài đặt nếu là lịch có giờ và giá trị đó nằm trong danh sách; còn lại không nhắc. `PUT` giữ luật "ô thiếu là không có" như hiện nay.
- Đọc: lịch hẹn `{at, offsetMinutes, state}`, việc `{at, offsetMinutes, state}` (thêm `offsetMinutes`, web bỏ qua được). `at` là giờ nhắc của **lần sắp tới** (đơn lẻ: của chính nó); `state` = `FIRED` khi lần đó đã có `reminder_delivery`, ngược lại `PENDING`.
- Lưu: cột `reminder_offset_minutes integer NULL` trên `calendar_event` và `task` (CHECK theo danh sách trên).

### D-524 — Khi job chạy · **Accepted** (phần 1)
1. Đọc lại lịch hẹn / việc. Không còn, đã xong, bỏ nhắc, hay giờ nhắc của lần này đã khác giờ job được hẹn → bỏ qua (không lỗi).
2. `INSERT INTO reminder_delivery … ON CONFLICT DO NOTHING` với khóa duy nhất (`owner_id`, `kind`, `item_id`, `occurrence_date`). Không chèn được (đã gửi) → bỏ qua phần gửi, vẫn hẹn lần kế tiếp.
3. Đẩy `reminder.due` qua SSE (chuông).
4. Nếu `notify_reminders` bật **và** trễ không quá 60 phút so với giờ nhắc: gửi mail (D-525). Trễ hơn (app tắt lâu) thì chỉ có chuông, ghi `email_status = SKIPPED_LATE`.
5. Hẹn job cho lần kế tiếp (D-522).
Gửi mail lỗi tạm thời (5xx, mạng, 429): job ném lỗi để thư viện thử lại (1, 5, 15 phút, tối đa 3 lần); lần thử lại gặp dòng `reminder_delivery` đã có nhưng `email_status = PENDING` thì chỉ gửi lại mail. Lỗi vĩnh viễn (4xx khác, token bị thu hồi) → `email_status = FAILED`, ghi log, không thử lại.

### D-525 — Gửi mail bằng OAuth2 qua tài khoản Google của Sino · **Accepted** (người dùng)
- Module mới `mail`, cổng `SystemMailSender.send(to, subject, text, html)`; `planner` chỉ gọi cổng này (Modulith: `mail` không phụ thuộc `planner`).
- Hiện thực: Gmail API `users.messages.send` với access token lấy từ refresh token của tài khoản Sino (Google OAuth2 token endpoint), cache access token tới gần lúc hết hạn. Không dùng SMTP.
- Cấu hình (`.env`, mẫu ở `.env.example`): `SINO_MAIL_ENABLED`, `SINO_MAIL_FROM` (địa chỉ, tên hiển thị "Sino"), `SINO_MAIL_GOOGLE_CLIENT_ID`, `SINO_MAIL_GOOGLE_CLIENT_SECRET`, `SINO_MAIL_GOOGLE_REFRESH_TOKEN`. Có thể dùng chung OAuth client với kết nối Gmail hoặc client riêng; refresh token là của tài khoản Sino, không phải của người dùng.
- `SINO_MAIL_ENABLED=false` (mặc định khi thiếu cấu hình): không gửi, `email_status = DISABLED`, app vẫn khởi động. Test và hand test dùng bản giả ghi thư vào bộ nhớ.
- README hướng dẫn lấy refresh token một lần (OAuth Playground hoặc lệnh nhỏ), quyền duy nhất `https://www.googleapis.com/auth/gmail.send`.
- Giới hạn Gmail: ~500 thư/ngày (tài khoản thường), 2.000 (Workspace). Đủ cho giai đoạn này; ghi vào Rủi ro.

### D-526 — Nội dung thư · **Proposed**
Tiêu đề: `Nhắc hẹn: <tên> — <giờ>` (việc: `Nhắc việc: <tên> — hạn <giờ>`). Thân thư chữ thuần + HTML đơn giản: tên, thời gian theo múi giờ của planner, địa điểm, ghi chú (cắt 500 ký tự), một liên kết mở Sino (`<SINO_WEB_URL>/calendar/<id>` hoặc `/tasks/<id>`). Không đưa nội dung tin nhắn hay dữ liệu provider vào thư.

### D-527 — Chuông: `GET /api/reminders` và `reminder.due` · **Proposed**
- `reminder_delivery` cũng là danh sách nhắc cho chuông: `GET /api/reminders?limit=20` trả các nhắc đã tới gần nhất `{id, kind, itemId, title, at, occurrenceDate, readAt}`; `POST /api/reminders/{id}/read` và `POST /api/reminders/read-all`.
- SSE: sự kiện `reminder.due {id, kind, itemId, at}` sau khi commit (D-77: chỉ id, không nội dung).
- Không làm kho thông báo chung cho mọi loại: YAGNI; khi có loại thứ hai thì gộp.

### D-528 — Module · **Proposed**
Nhắc thuộc `planner` (`planner/application/reminder/…`), vì giờ nhắc tính từ lịch hẹn, việc và quy tắc lặp của chính nó. `mail` là module riêng (gửi thư hệ thống, sau này dùng cho thư khác). `ModularityTests` phải xanh.

## Dữ liệu (migration V33 hoặc số kế tiếp còn trống)

```text
calendar_event  + reminder_offset_minutes integer NULL  (CHECK)
task            + reminder_offset_minutes integer NULL  (CHECK)
reminder_delivery
  id uuid PK, owner_id uuid NOT NULL, kind varchar(16) (EVENT|TASK), item_id uuid NOT NULL,
  occurrence_date date NOT NULL, title varchar NOT NULL, remind_at timestamptz NOT NULL,
  fired_at timestamptz NOT NULL, email_status varchar(16) (PENDING|SENT|FAILED|SKIPPED_LATE|DISABLED|OFF),
  read_at timestamptz NULL
  UNIQUE (owner_id, kind, item_id, occurrence_date)
  INDEX (owner_id, fired_at DESC)
```
Bảng của thư viện job (D-521) do thư viện tạo: nếu thư viện tự tạo schema thì tắt và đưa DDL vào Flyway, để Flyway là nơi duy nhất đổi schema.

## Luồng

```text
POST/PUT/DELETE /api/events|tasks
  -> planner lưu, phát EventChanged/TaskChanged
  -> AFTER_COMMIT: ReminderScheduler hủy job cũ, hẹn job lần sắp tới

tới giờ nhắc
  -> ReminderJob(kind, id, remindAt)
       đọc lại; sai giờ / đã xóa -> bỏ
       reminder_delivery (ON CONFLICT DO NOTHING)
       SSE reminder.due
       SystemMailSender (nếu bật, trễ <= 60')
       hẹn lần kế tiếp
```

## Rủi ro

- [Thư viện job chưa hỗ trợ Spring Boot 4] → RM-00 trước; có hai đường lùi (D-521).
- [Refresh token của tài khoản Sino bị thu hồi / hết hạn sau 7 ngày nếu OAuth app ở chế độ "Testing"] → README: đưa OAuth consent screen sang "In production" (chỉ quyền `gmail.send` của chính tài khoản Sino); lỗi `invalid_grant` ghi log rõ và `email_status = FAILED`, chuông vẫn chạy.
- [Mail vào Spam] → tài khoản Gmail gửi chuẩn (SPF/DKIM của Google); thư chữ ngắn, không liên kết lạ.
- [Giới hạn ~500 thư/ngày] → đủ cho số người dùng hiện tại; vượt thì chuyển Workspace hoặc dịch vụ gửi thư khác qua cùng cổng `SystemMailSender`.
- [Lệch múi giờ, DST] → giờ nhắc tính theo `ZonedDateTime` của múi giờ planner như `RecurrenceCalculator`.

## Definition of Done (phần BE)

- Tạo lịch hẹn có giờ, nhắc 5 phút: đúng giờ nhắc có dòng `reminder_delivery`, sự kiện SSE, thư tới hộp thư email hồ sơ (tài khoản Sino thật, hoặc bản giả khi `SINO_MAIL_ENABLED=false`).
- Sửa giờ trước lúc nhắc: chỉ nhắc theo giờ mới. Xóa trước lúc nhắc: không nhắc.
- Lịch lặp hằng tuần: nhắc hai lần liên tiếp đúng giờ.
- Khởi động lại app giữa lúc hẹn và lúc nhắc: vẫn nhắc. Tắt app quá 60 phút qua giờ nhắc: chỉ chuông, không mail.
- `notify_reminders = false`: không mail.
- Test của `planner`, `mail`, `ModularityTests` xanh; README, `.env.example`.
