# Kế hoạch từ tin nhắn · Technical Design (cấp sản phẩm)

> Mode: **HYBRID**. Trạng thái (2026-10-02): phạm vi và D-25…D-29 đã chốt với người dùng trong buổi brainstorming; D-30, D-31 còn mở, chốt khi mở F13. Change này **không có code**. Mỗi feature (F13–F17, hẹn giờ gửi trong F10, tạm ẩn trong F05) sẽ có change riêng với spec và task chi tiết khi bắt đầu, theo luật của `openspec/roadmap.md`.
> Convention chung (module, error model, transaction, test) xem `openspec/specs/` và design F01 đã archive.

## Context

- Nguồn: brainstorming với người dùng ngày 2026-10-02; brief thiết kế "Sino Monochrome Motion" (canvas "Sino UI"); 02A (module, event, quy tắc không gọi connector trong transaction); 02B (bảng `conversation`, `message`); design F01 (error model, D-23 JVM chạy UTC), F02 (`app_user`, owner), F03 (`ProviderCapability.SEND_MESSAGES`, `ProviderException` có `retryAfter`).
- Hiện trạng: đang ở Phase 0 (F03). Chưa có module `conversation`, `messaging`, `sync`, `realtime`. Không có cơ chế chạy việc nền nào.
- **Conflict C9 — phạm vi MVP.** Notion 01 (yêu cầu chức năng MVP) và 03 (roadmap) không có ghi chú, task, lịch, nhắc nhở, hẹn giờ gửi. Theo thứ tự nguồn (01 > … > code), đây là **mở rộng phạm vi** chứ không phải mâu thuẫn với yêu cầu có sẵn: không yêu cầu nào của 01 bị thay đổi. Cách xử lý: chủ sản phẩm đã quyết định thêm (2026-10-02); các tính năng này nằm **sau** M1 và sync/realtime (Phase 4 mới), trước nhiều provider và gửi tin. Hệ quả: **M2 và phần gửi tin của M3 lùi một phase**. Notion 01 và 03 cần được cập nhật.

## Goals / Non-Goals

**Goals:**
- Từ một tin nhắn, chỉ cần một hoặc hai thao tác là có task, ghi chú, lịch hẹn, nhắc nhở hay thư hẹn giờ, kèm liên kết ngược về tin gốc.
- Một hạ tầng hẹn giờ duy nhất, tin cậy, dùng chung cho nhắc nhở, hẹn giờ gửi, tạm ẩn (và có thể cho đồng bộ nền F07).
- Thông báo tới người dùng qua đúng một kênh là Sino; nội dung tin nhắn không bao giờ đi qua dịch vụ push của bên thứ ba.
- Ranh giới module rõ để từng feature làm và kiểm thử riêng được.

**Non-Goals:** xem `proposal.md` (không đồng bộ lịch ngoài, không nhắc qua kênh khác, không quy tắc tự động hay AI, task không có dự án/ưu tiên/nhãn, ghi chú không định dạng phong phú, không cộng tác, không app mobile).

## Decisions

### D-25 — Dữ liệu kế hoạch nằm ở đâu · **Accepted: A — trong Sino** (2026-10-02)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Sino tự lưu task, ghi chú, lịch** | Mọi thao tác ở một chỗ (người dùng: "thao tác hay làm cái gì đó đều trên Sino hết"); không phụ thuộc quyền OAuth thêm; dữ liệu nằm trong PostgreSQL như phần còn lại | Phải tự làm màn Lịch, quy tắc lặp |
| B. Đồng bộ Google Calendar / Google Tasks | Tận dụng app có sẵn của Google | Thêm scope OAuth, đồng bộ hai chiều, xung đột; chỉ hợp với người dùng Google; trái mong muốn của người dùng |

### D-26 — Nhắc nhở tới người dùng bằng kênh nào · **Accepted: chỉ qua Sino** (2026-10-02)

- Web: thông báo trong app (trung tâm thông báo + hiện ngay qua SSE của F08) **và** Web Push chuẩn (VAPID): tới được cả khi tab đã đóng, miễn trình duyệt còn chạy.
- Mobile: push của app Sino khi app mobile có mặt (dự án riêng, không thuộc roadmap này). Bảng thiết bị đã có cột `platform` để không phải đổi schema về sau.
- Không dùng email, Zalo, Messenger: dùng kênh của provider để nhắc thì sẽ trộn nhắc nhở với tin nhắn thật, và phụ thuộc vào provider còn kết nối.

### D-27 — Task kiểu gọn hay kiểu đầy đủ · **Accepted: A — gọn** (2026-10-02)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Gọn**: tiêu đề, ghi chú, hạn (giờ hoặc cả ngày), một nhắc nhở, lặp lại, OPEN/DONE, nguồn | Đủ cho "trả lời thư này trước thứ Sáu"; ít bảng, ít màn hình | Người cần dự án/ưu tiên phải chờ |
| B. Đầy đủ: thêm danh sách/dự án, độ ưu tiên, nhãn, việc con | Mạnh hơn | Thành một app quản lý công việc riêng, lấn át mục tiêu chính |

"Nhắc tôi" trên tin nhắn = tạo task "Trả lời: <chủ đề>" có nhắc nhở. Không có loại "nhắc nhở độc lập": mọi nhắc nhở gắn vào một task hoặc lịch hẹn, nên trang Việc cần làm là nơi duy nhất để xem những thứ còn treo.

### D-28 — Ghi chú kiểu nào · **Accepted: A — theo ngữ cảnh** (2026-10-02)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Theo ngữ cảnh**: chữ đơn giản, neo vào MESSAGE / CONVERSATION / PARTICIPANT, ghim, viết độc lập được | Ghi chú hiện đúng chỗ cần (khi mở cuộc trò chuyện); nhỏ gọn | Không thay được app ghi chú chuyên dụng |
| B. Sổ ghi chú: thư mục, định dạng phong phú, ảnh | Đa năng | Lớn, ít liên quan tới tin nhắn |

Giới hạn: nội dung ≤ 20.000 ký tự, tiêu đề ≤ 200 ký tự.

### D-29 — Kiến trúc module · **Accepted: hướng 1 — module riêng theo trách nhiệm** (2026-10-02)

| Module | Sở hữu | Phụ thuộc |
|---|---|---|
| `scheduler` | bảng `scheduled_job`; worker quét việc tới hạn; SPI cho module khác đăng ký loại việc | `common` |
| `notification` | bảng `notification`, `push_subscription`; gửi Web Push | `common` |
| `notes` | bảng `note` | `common`; nghe event xóa tin/cuộc trò chuyện khi có |
| `planner` | `task`, `event`, `recurrence`, `reminder` | `scheduler`, `notification`, `common` |
| `messaging` (F10, mở rộng) | thư hẹn giờ (trạng thái `SCHEDULED`) | thêm `scheduler`, `notification` |
| `conversation` (F05, mở rộng) | `snoozed_until` | thêm `scheduler` |
| `realtime` (F08) | — | nghe `NotificationCreated` để đẩy SSE (giống cách nghe event tin nhắn) |

`scheduler` và `notification` không phụ thuộc module nghiệp vụ nào → không có vòng phụ thuộc. Hai phương án không chọn: (2) gom tất cả vào một module `planner` (scheduler và thông báo bị khóa vào planner, `messaging` phải phụ thuộc `planner` chỉ để hẹn giờ gửi); (3) đặt scheduler trong `common` (trái quy tắc `common` chỉ chứa thứ kỹ thuật tối thiểu, và scheduler có bảng, có trạng thái).

**Tham chiếu chéo module chỉ là loại + ID** (ví dụ `source_kind = 'MESSAGE'`, `source_id`), không có khóa ngoại sang bảng của module khác, không sao chép nội dung tin nhắn. Ngoại lệ duy nhất là `user_id` → `app_user(id)`, theo tiền lệ của F02 (owner là gốc của mọi dữ liệu).

### D-30 — Scheduler tự viết hay dùng thư viện · **Decision Needed (chốt khi mở F13)**

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Tự viết trên PostgreSQL** (bảng `scheduled_job` + `FOR UPDATE SKIP LOCKED` + lease) | Không thêm dependency; dữ liệu và trạng thái nằm trong schema của mình, Flyway quản lý; tham chiếu loại + ID đúng như D-29; học sâu về khóa và idempotency (đúng mục tiêu học của F07) | Tự chịu trách nhiệm về đúng đắn; phải tự viết worker, lease, thử lại, dọn dẹp |
| B. db-scheduler | Thư viện nhỏ, chỉ cần một bảng PostgreSQL, đã dùng nhiều trong thực tế; có sẵn heartbeat, thử lại | Bảng và mô hình dữ liệu theo thư viện (dữ liệu việc được serialize); thêm dependency phải theo dõi tương thích Spring Boot 4 |
| C. JobRunr | Có dashboard, nhiều tính năng | Nặng; serialize lambda/đối số; bản miễn phí giới hạn một số tính năng; quá mức nhu cầu |
| D. `@Scheduled` + ShedLock | Đơn giản | Chỉ khóa *cả tác vụ định kỳ*, không quản lý từng việc với giờ chạy riêng → không đáp ứng nhắc nhở/hẹn giờ gửi |

**Đề xuất: A**, vì nhu cầu hẹp (vài loại việc, một người dùng), ràng buộc dự án ưu tiên ít dependency, và F07 cũng cần đúng kỹ thuật này. Nếu khi làm F13 phần tự viết phình quá dự tính (ví dụ phải tự làm heartbeat phức tạp), chuyển sang B.
*Câu hỏi cho bạn:* nếu chọn B, những cột nào của `scheduled_job` bên dưới sẽ không còn nằm trong schema của bạn, và điều đó ảnh hưởng gì tới việc truy vấn "các thư đang hẹn giờ"?

### D-31 — Scheduler gọi module sở hữu thế nào · *Proposed default* (chốt cùng D-30)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. SPI handler + event khi thất bại**: module sở hữu cài `ScheduledJobHandler` cho loại việc của mình; worker gọi handler **đồng bộ** sau khi nhận việc, ghi kết quả; hết lượt thử hoặc lỗi vĩnh viễn thì phát `ScheduledJobFailed` để module sở hữu xử lý (ví dụ chuyển thư sang `FAILED`) | Scheduler biết kết quả nên thử lại tập trung một chỗ (1/5/15 phút, tôn trọng `retryAfter`); hướng phụ thuộc giống SPI của `provider` (module sở hữu → `scheduler`) | Handler chạy trong luồng của worker, phải nhanh và không giữ transaction khi gọi ra ngoài |
| B. Chỉ phát event `JobDue`, module sở hữu nghe | Lỏng hơn | Scheduler không biết việc thành hay bại → mỗi module phải tự làm thử lại; mất ý nghĩa của trạng thái job |

Handler báo kết quả bằng ngoại lệ có phân loại: tạm thời (thử lại, có thể kèm thời gian chờ) hay vĩnh viễn. `ProviderException` được ánh xạ theo `ProviderErrorCode.retryable()` đã có từ F03: `PROVIDER_UNAVAILABLE`, `RATE_LIMITED` → tạm thời (dùng `retryAfter` nếu có); `AUTH_EXPIRED`, `CAPABILITY_NOT_SUPPORTED`, `REQUEST_REJECTED` → vĩnh viễn.

### Mô hình dữ liệu (phác thảo, chốt cột ở từng feature)

Mọi thời điểm là `timestamptz` (UTC, khớp D-23). Mọi bảng có `id uuid`, `user_id`, `created_at`, `updated_at`, `version` (optimistic locking) trừ khi ghi khác.

**`scheduled_job`** (F13)

| Cột | Ghi chú |
|---|---|
| `job_type` | `REMINDER`, `SEND_MESSAGE`, `UNSNOOZE` … (chuỗi, module sở hữu khai báo) |
| `ref_kind`, `ref_id` | đối tượng của module sở hữu; không có nội dung |
| `run_at` | giờ chạy |
| `status` | `SCHEDULED`, `RUNNING`, `DONE`, `FAILED`, `CANCELLED` |
| `attempts`, `max_attempts` | mặc định tối đa 4 lần (lần đầu + 3 lần thử lại 1/5/15 phút) |
| `last_error` | mã lỗi + mô tả ngắn; không chứa secret hay nội dung |
| `locked_by`, `locked_until` | lease khi `RUNNING` |
| `completed_at` | |

- Index một phần `(run_at) WHERE status = 'SCHEDULED'`.
- Unique một phần `(job_type, ref_kind, ref_id) WHERE status IN ('SCHEDULED','RUNNING')`: mỗi đối tượng chỉ có một việc đang chờ cho mỗi loại.
- **Đổi giờ = hủy việc cũ + tạo việc mới**, không sửa `run_at` tại chỗ. Lý do: mã chống trùng của tác động phụ là ID của việc; nếu dùng lại một ID cho lần nhắc thứ hai ("Nhắc lại sau 1 giờ") thì lần thứ hai sẽ bị coi là trùng và bị bỏ.
- Nhận việc (giờ `:now` lấy từ `Clock`, không dùng `now()` của SQL để test tua giờ được):

  ```sql
  UPDATE scheduled_job
     SET status = 'RUNNING', attempts = attempts + 1,
         locked_by = :worker, locked_until = :now + :lease
   WHERE id IN (SELECT id FROM scheduled_job
                 WHERE (status = 'SCHEDULED' AND run_at <= :now)
                    OR (status = 'RUNNING'  AND locked_until < :now)
                 ORDER BY run_at
                 LIMIT :batch
                 FOR UPDATE SKIP LOCKED)
  RETURNING *;
  ```
- Worker quét mỗi ~15 giây (đáp ứng "chậm nhất 30 giây"). Dọn việc `DONE`/`CANCELLED` cũ hơn 30 ngày.

**`notification`** (F14): `kind` (`REMINDER`, `SCHEDULED_SEND_FAILED`, …), `title` (≤ 200), `link` (đường dẫn trong Sino), `actions` (`jsonb`, danh sách khóa hành động nhỏ như `done`, `snooze_1h`), `late_by_seconds` (báo trễ), `read_at`, `dedup_key` **unique** (= `job:<id>` khi tạo từ việc hẹn giờ).

**`push_subscription`** (F14): `platform` (`WEB`, `IOS`, `ANDROID`), `endpoint` (unique), `p256dh`, `auth`, `label` (ví dụ "Chrome · Windows"), `last_success_at`, `failure_count`. `endpoint` và khóa là dữ liệu nhạy cảm (ai có chúng thì gửi push được tới thiết bị): không log, không trả ra API ngoài `label`.

**`note`** (F15): `title` (≤ 200, có thể rỗng), `body` (check ≤ 20.000), `pinned`, `anchor_kind` (`MESSAGE`, `CONVERSATION`, `PARTICIPANT`, có thể null), `anchor_id`, `context_conversation_id` (để lấy cả ghi chú của tin bên trong một cuộc trò chuyện), `anchor_missing`. Tìm kiếm: `ILIKE` ở F15, chuyển sang Full Text Search khi có F11.

**`task`** (F16): `title` (≤ 200), `notes`, `due_at` **hoặc** `due_date` (cả ngày; check không đồng thời), `status` (`OPEN`, `DONE`), `completed_at`, `series_id` + `occurrence_index` (các lần của task lặp), `recurrence_id`, `source_kind` (`MESSAGE`, `CONVERSATION`), `source_id`, `source_provider` (`ProviderType`, để hiện icon mà không phải gọi chéo module), `source_missing`.

**`event`** (F17): `title`, `location`, `notes`, `starts_at`/`ends_at` hoặc `start_date`/`end_date` (cả ngày), `recurrence_id`, các cột `source_*` như `task`.

**`recurrence`** (F16): `freq` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`), `interval`, `by_weekdays` (cho `WEEKLY`), `by_month_day` (ngày gốc, cho `MONTHLY`), `until_date` **hoặc** `count`, `time_zone` (IANA). Lưu có cấu trúc thay vì chuỗi RRULE (RFC 5545): tập quy tắc nhỏ, không cần parser hay thư viện iCalendar, kiểm thử dạng bảng dễ hơn. Nếu sau này cần xuất `.ics` thì chuyển đổi một chiều.

**`reminder`** (F16): `target_kind` (`TASK`, `EVENT`), `target_id`, `remind_at` (lần báo kế tiếp), `offset_minutes` (chỉ cho lịch hẹn: "15 phút trước"), `state` (`PENDING`, `FIRED`, `CANCELLED`), `fired_at`, `job_id`. Unique một phần `(target_kind, target_id) WHERE state = 'PENDING'` bảo đảm "một nhắc nhở cho mỗi mục".

**Mở rộng bảng có sẵn:** `message.status` thêm `SCHEDULED`, `SENDING`; `message.scheduled_at` (F10). `conversation.snoozed_until`, `conversation.resurfaced_at` (F05). Danh sách mặc định của Hộp thư lọc `snoozed_until IS NULL` và sắp theo `greatest(last_message_at, resurfaced_at)` để cuộc trò chuyện hiện lại nằm ở đầu.

### Luồng chính

**1. "Nhắc tôi" trên một tin nhắn (F16 + F13 + F14)**

1. FE gọi `POST /api/tasks` với tiêu đề gợi ý, `source`, `reminder.remindAt`.
2. `planner`, trong một transaction: lưu `task` + `reminder`, gọi `JobScheduler.schedule(REMINDER, remindAt, reminder)` (cùng database nên tạo việc nguyên tử với task).
3. Tới giờ, worker nhận việc và gọi `ReminderJobHandler` của `planner`: nạp `reminder`; nếu không còn `PENDING` thì kết thúc (task đã Xong hay bị xóa); nếu còn thì gọi `NotificationService.notify(..., dedupKey = "job:<id>", lateBy)` và chuyển `FIRED`. Lịch hẹn lặp: đặt việc cho lần kế tiếp.
4. `notification` lưu bản ghi (trùng `dedup_key` thì bỏ qua) và phát `NotificationCreated` sau commit. `realtime` đẩy SSE cho tab đang mở. Một listener khác gửi Web Push tới từng thiết bị (Event Publication Registry của Modulith giữ event nếu gửi lỗi). Push lỗi không ảnh hưởng thông báo trong app; trả về 404/410 thì xóa thiết bị.

**2. Đánh dấu Xong task lặp (F16)**: chuyển `DONE`, hủy nhắc nhở còn chờ; nếu còn lần lặp thì tính hạn kế tiếp bằng `RecurrenceCalculator` (theo hạn, bỏ qua các lần đã lỡ, xem spec `tasks`), tạo task mới cùng `series_id` và nguồn, chép nhắc nhở theo cùng độ lệch so với hạn.

**3. Hẹn giờ gửi (F10 + F13)**

1. `POST /api/conversations/{id}/messages` có `sendAt`: kiểm tra `SEND_MESSAGES` và `sendAt ≥ now + 1 phút`; lưu thư đi ở `SCHEDULED`; tạo việc `SEND_MESSAGE`.
2. Sửa/hủy: chỉ khi còn `SCHEDULED` (optimistic locking); hủy thì xóa thư chưa gửi và hủy việc.
3. Tới giờ, handler của `messaging`:
   - Thư không còn `SCHEDULED` và không phải `SENDING` → kết thúc.
   - Thư đang `SCHEDULED` → chuyển `SENDING` (commit), kiểm tra tài khoản, capability, quyền; gọi provider **ngoài transaction** (quy tắc F01) với khóa chống trùng = ID của việc; thành công → `SENT`.
   - Thư đã ở `SENDING` khi handler bắt đầu, tức lần trước dừng giữa chừng và không rõ đã gửi chưa → nếu provider hỗ trợ kiểm tra (ví dụ Gmail: tìm theo `Message-ID` sinh từ ID của việc) thì kiểm tra rồi quyết định; nếu không kiểm tra được thì **không gửi lại**, chuyển `FAILED` với lý do "không rõ đã gửi chưa" và báo người dùng. Chấp nhận "nhiều nhất một lần" hơn là gửi trùng cho người nhận.
4. Lỗi vĩnh viễn hoặc hết lượt thử → `ScheduledJobFailed` → `messaging` chuyển `FAILED` và gọi `notification` ("Không gửi được thư hẹn giờ", hành động Sửa / Gửi lại).

**4. Tạm ẩn (F05 + F13)**: `PATCH /api/conversations/{id}` với `snoozedUntil` → lưu và tạo việc `UNSNOOZE`. Tới giờ: xóa `snoozed_until`, đặt `resurfaced_at`. Có tin mới: luồng upsert tin của `messaging` (02B §11) vốn đã cập nhật `conversation`; ở bước đó, nếu đang tạm ẩn thì bỏ tạm ẩn và hủy việc qua API của `conversation`.

**5. Hành động trên thông báo**: push và thông báo trong app chỉ mang khóa hành động (`done`, `snooze_1h`) và đường dẫn. Bấm nút trên push → service worker mở hoặc focus Sino tại đường dẫn kèm `?action=done`; trang thực hiện hành động bằng phiên đăng nhập bình thường. Service worker không tự gọi API, nên không phải giải quyết xác thực/CSRF trong service worker (phụ thuộc D-22). `notification` không phụ thuộc `planner`.

### Thời gian và múi giờ

- Lưu UTC; hiển thị theo múi giờ của người dùng. Ở bản một người dùng, múi giờ là cấu hình `sino.user.time-zone` (mặc định `Asia/Ho_Chi_Minh`, validate là IANA hợp lệ); chuyển vào hồ sơ người dùng khi có màn chỉnh.
- `RecurrenceCalculator` tính trên `ZonedDateTime` ở múi giờ của quy tắc rồi đổi ra `Instant`: giờ địa phương giữ nguyên giữa các lần, kể cả ở nơi có giờ mùa hè.
- Lặp hằng tháng tính từ **ngày gốc** (`by_month_day`), không từ lần trước: 31/10 → 30/11 → 31/12. Nếu tính từ lần trước thì sau tháng 11 sẽ trôi thành ngày 30 mãi mãi.
- Mọi chỗ cần "bây giờ" nhận `Clock` qua constructor.

### API (phác thảo, chốt đường dẫn ở từng feature)

| Module | Endpoint |
|---|---|
| `notes` | `GET/POST /api/notes` (lọc `anchorKind`, `anchorId`, `conversationId`, `pinned`, `q`), `GET/PATCH/DELETE /api/notes/{id}` |
| `planner` | `GET/POST /api/tasks` (`group` hoặc `from`/`to`), `PATCH/DELETE /api/tasks/{id}`, `POST /api/tasks/{id}/complete`, `/reopen`; `PUT/DELETE /api/tasks/{id}/reminder`; `POST /api/reminders/{id}/snooze`; `GET/POST /api/events`, `PATCH/DELETE /api/events/{id}`; `GET /api/calendar?from=&to=` |
| `notification` | `GET /api/notifications`, `POST /api/notifications/{id}/read`, `POST /api/notifications/read-all`; `GET /api/push/vapid-public-key`; `GET/POST/DELETE /api/push-subscriptions` |
| `messaging` | `POST /api/conversations/{id}/messages` thêm `sendAt`; `PATCH/DELETE /api/messages/{id}` khi `SCHEDULED` |
| `conversation` | `PATCH /api/conversations/{id}` thêm `snoozedUntil`; `GET /api/conversations?view=snoozed\|scheduled` |

Lỗi theo Problem Details của F01. Mã mới dự kiến: `TIME_IN_PAST` (400), `SEND_TIME_TOO_SOON` (400), `SCHEDULED_MESSAGE_NOT_EDITABLE` (409); lỗi "tài khoản không gửi được" của F10 dùng lại cho hẹn giờ gửi.

### Giao diện

Thiết kế ở canvas "Sino UI", đợt 6: màn **Lịch** (Tuần/Tháng/Lịch trình), **Việc cần làm** (nhóm Quá hạn/Hôm nay/Sắp tới/Không có hạn/Đã xong), **Ghi chú**, **trung tâm thông báo**; Hộp thư có menu thao tác trên tin (Tạo task, Nhắc tôi, Lịch hẹn, Ghi chú), Tạm ẩn, nút Gửi ▾ → Gửi lúc…, bộ lọc Đã hẹn giờ / Đang tạm ẩn, chip các mục đã gắn, panel "Việc và ghi chú"; Tổng quan thêm khối "Hôm nay"; sidebar chia nhóm (Tổng quan · Hộp thư / KẾ HOẠCH / DANH TÍNH / Cài đặt); tabbar mobile (Tổng quan · Hộp thư · Lịch · Việc · Thêm); Cài đặt thêm thông báo và danh sách thiết bị. Spec UI ghi vào OpenSpec khi người dùng chốt UI.

### Kiểm thử

- Unit test dạng bảng cho `RecurrenceCalculator`: mỗi `freq`, `interval`, ngày 31, 29/02, `until`/`count`, hoàn thành trễ nhiều chu kỳ.
- Integration test scheduler (Testcontainers PostgreSQL, `Clock` tua được): hai worker cùng quét → mỗi việc chạy đúng một lần; worker dừng giữa chừng → chạy lại sau lease; thử lại 1/5/15 và `retryAfter`; lỗi vĩnh viễn → `ScheduledJobFailed`; hủy → không chạy.
- Spring Modulith `Scenario` cho chuỗi event (việc tới hạn → thông báo → `NotificationCreated`).
- `PushSender` là interface; test dùng bản giả, kiểm tra payload **không** chứa nội dung tin nhắn hay địa chỉ người gửi.
- Web test cho mọi endpoint: thành công, validation, 401, 404, 409 theo Problem Details.

## Risks / Trade-offs

- [Gửi trùng thư hẹn giờ khi tiến trình dừng sau lúc provider đã nhận] → Trạng thái `SENDING` trước khi gọi provider; lần chạy lại thấy `SENDING` thì kiểm tra hoặc báo lỗi, không gửi mù (luồng 3).
- [Nhắc nhở tới muộn khi server tắt] → Chạy bù khi khởi động, ghi "trễ N phút"; không bỏ nhắc nhở cũ một cách lặng lẽ.
- [Web Push chỉ tới khi trình duyệt đang chạy; Safari/iOS có hạn chế riêng] → Thông báo trong app luôn được tạo; ghi rõ giới hạn ở màn Cài đặt; push mobile thật đi cùng app mobile.
- [Nội dung push đi qua máy chủ push của Google/Mozilla/Apple] → Payload chỉ có tiêu đề task/lịch hẹn và đường dẫn (spec `notifications`); vẫn được mã hóa theo chuẩn Web Push.
- [Khóa VAPID bị lộ → kẻ khác gửi push dưới danh nghĩa Sino tới thiết bị đã đăng ký] → Khóa riêng chỉ trong `.env`; không log; đổi khóa thì mọi thiết bị phải đăng ký lại (chấp nhận).
- [Tham chiếu loại + ID có thể trỏ tới thứ đã bị xóa] → Cờ `*_missing` cập nhật khi nghe event xóa; FE xử lý 404 khi mở tin gốc.
- [Phạm vi sản phẩm phình ra trước khi lõi xong; M2/M3 đến muộn hơn] → Phase 4 chỉ bắt đầu sau M1 và sync/realtime; mỗi feature vẫn qua vòng lặp spec → code → nghiệm thu. Nếu cần M2 sớm, Phase 4 và Phase 5 đổi chỗ được: chỉ hẹn giờ gửi (F10) phụ thuộc F13/F14, Phase 4 không phụ thuộc Phase 5.
- [Scheduler tự viết có lỗi đồng thời khó thấy] → Integration test chạy song song thật trên PostgreSQL; nếu D-30 = A tỏ ra quá sức thì chuyển B.

## Migration Plan

- Mỗi feature một (hoặc vài) migration Flyway mới, chỉ thêm bảng/cột; không sửa dữ liệu có sẵn. Rollback = không deploy feature; bảng mới không ảnh hưởng phần còn lại.
- Thứ tự: F13 (`scheduled_job`) → F14 (`notification`, `push_subscription`) → F15 (`note`) / F16 (`task`, `recurrence`, `reminder`) / F17 (`event`); cột tạm ẩn đi cùng F05 hoặc sau F13 (cái nào muộn hơn); cột hẹn giờ gửi đi cùng F10.
- Hồ sơ OpenSpec: change này **không** archive theo cách thường, vì spec của nó là đích đến chứ chưa phải hệ thống đang chạy. Mỗi feature change mang delta riêng vào `openspec/specs/`; cuối cùng archive change này bằng `--skip-specs` (tasks 4.1).
- Cấu hình mới: `SINO_PUSH_VAPID_PUBLIC_KEY`, `SINO_PUSH_VAPID_PRIVATE_KEY`, `SINO_PUSH_SUBJECT` (thêm vào `.env.example`, giá trị thật chỉ trong `.env`); `sino.user.time-zone`.

## Open Questions

- D-30, D-31: chốt khi mở F13.
- Thứ tự F07 và F13 trong Phase 3: nếu làm F13 trước, F07 dùng luôn `scheduled_job` cho việc đồng bộ định kỳ; nếu làm F07 trước, F13 tách phần hẹn giờ chung ra từ F07. Chốt khi mở Phase 3.
- Thư viện Web Push cho Java (mã hóa payload RFC 8291, ký VAPID RFC 8292): chọn ở F14, kiểm tra tương thích Java 25 / Spring Boot 4.
- Hành động "Gửi lại" sau khi thư hẹn giờ thất bại: gửi ngay hay mở lại ô soạn. Chốt ở F10.
- Notion 01 và 03 cần thêm các tính năng này (Conflict C9) — việc của chủ sản phẩm.
