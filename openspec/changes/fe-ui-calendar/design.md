# Màn Lịch với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO. Người dùng 2026-10-09: "trong lúc chờ BE thì giờ làm UI page Lịch và Việc cần làm". Phạm vi và D-85…D-89 do agent chốt theo cách người dùng đã chọn cho các màn trước (xem trước, luồng sửa sau; D-46, D-52, D-80) và theo ủy quyền "không cần hỏi" (2026-10-08); ghi phương án bị loại để người dùng xem lại.
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `Calendar` (chế độ `week`, `month`, `agenda`; + bản sáng), `MobileCalendar` (+ `MobileCalendarLight`). Đối chiếu link ngày 2026-10-09: phiên bản `1790948862-287a`, trùng bản sao.
> Phạm vi sản phẩm: `openspec/changes/planner-from-messages` (D-25, spec `calendar`, mô hình dữ liệu `event`, `recurrence`, `reminder`, API `GET /api/calendar?from=&to=`). Màn Việc cần làm: `openspec/changes/fe-ui-tasks` (D-80…D-84, `TaskItem`).

## Context

- Roadmap Phase 4, F17: "BE: bảng `event` (dùng lại `recurrence`, `reminder`); `GET /api/calendar?from=&to=` gộp lịch hẹn, task có hạn, nhắc nhở; lần lặp tính khi xem, không lưu sẵn. FE: màn Lịch (Tuần/Tháng/Lịch trình); menu trên tin nhắn: Lịch hẹn." Backend chưa có; `/calendar` đang là trang "đang được dựng".
- Canvas Lịch dùng đúng các việc của canvas Việc cần làm (giờ hạn, nhắc lúc nào, xong lúc nào), cùng các cuộc trò chuyện của Hộp thư; lịch hẹn là phần riêng của Lịch.
- Web đã có: `TaskItem`, `Recurrence`, `recurrenceLabel`, hàm ngày lịch (`shared/time/localDate.ts`), giờ canvas (`clockFrom`, `dayClockFrom`), `formatIn` ("sau 2 giờ"), cách làm của Việc cần làm (chọn bằng đường dẫn, cột phải từ 1280 px, trang con trên điện thoại).

## Decisions

### D-85 — Change này để xem: ba chế độ, đi tới khoảng khác, chi tiết lịch hẹn; tạo / sửa / xóa là change sau · **Agent chốt** (2026-10-09)
Làm: Tuần, Tháng, Lịch trình; "Hôm nay", khoảng trước / sau; chú giải; chi tiết một lịch hẹn; task và nhắc nhở trên lịch mở việc đó ở màn Việc cần làm (`/tasks/:id`); lịch trình có dải tuần trên điện thoại; trạng thái đang tải, không tải được. Để sau: tạo lịch hẹn ("Lịch hẹn", "Thêm lịch hẹn"), "Sửa", "Xóa lịch hẹn", "Thêm thao tác", kéo thả.
**LÝ DO:** canvas `Calendar` chỉ vẽ cột chi tiết cho lịch hẹn và không vẽ biểu mẫu tạo / sửa; biểu mẫu của Phase 4 nằm ở `InboxEvent` (thao tác trên thư, D-52), nên dựng một lần cho cả hai chỗ. Đánh dấu xong task đã có ở màn Việc cần làm; làm lại trên lịch là hai nơi cho một việc.
**Phương án bị loại:** dựng luôn biểu mẫu lịch hẹn (tự vẽ giao diện canvas chưa có); cột chi tiết cho cả task và nhắc nhở (lặp lại khối chi tiết của màn Việc cần làm).

### D-86 — Một request cho một khoảng ngày; máy chủ trả từng lần của lịch hẹn và task lặp · **Agent chốt**
`GET /api/calendar?from=2026-09-28&to=2026-10-05` (ngày lịch ở múi giờ người dùng, `to` không gồm) trả `{ events, tasks, reminders }`:
- `events`: **từng lần** của lịch hẹn giao với khoảng (lần lặp tính khi xem, spec `calendar`); mỗi lần có `id` riêng (`event-run@2026-10-04`) và `eventId` của lịch hẹn gốc; giờ là `startsAt`/`endsAt` hoặc `startDate`/`endDate` cả ngày (`endDate` không gồm), như D-81.
- `tasks`: task có hạn trong khoảng, gồm cả các lần **sắp tới** của task lặp (canvas Tháng có "Báo cáo tuần" mọi thứ Hai); mỗi lần có `taskId` của task thật để mở (lần chưa tạo mở task đang mở của chuỗi).
- `reminders`: nhắc nhở của task trong khoảng. Nhắc nhở của lịch hẹn nằm trong lịch hẹn (`reminder`), không thành mục riêng (canvas chỉ vẽ nhắc của task trên lưới; Lịch trình ghi "nhắc 07:30" cạnh lịch hẹn).
**LÝ DO:** một màn một request theo đúng khoảng đang xem; quy tắc lặp chỉ tính ở backend (D-84).
**Phương án bị loại:** web gọi `/api/tasks` và `/api/events` rồi tự tính lần lặp (lặp logic của backend, D-84); máy chủ trả cả nhắc nhở của lịch hẹn thành mục riêng (một lịch hẹn hiện hai lần trên lưới).

### D-87 — Chế độ và ngày trong địa chỉ; chọn một lịch hẹn bằng đường dẫn · **Agent chốt**
`/calendar?view=week|month|agenda&date=2026-10-02` (mặc định Tuần của hôm nay, không ghi vào địa chỉ); khoảng trước / sau dời một tuần (Tuần), một tháng (Tháng) hoặc một tuần (Lịch trình); "Hôm nay" bỏ `date`. `/calendar/:itemId` mở một lịch hẹn (giữ `view` và `date`); như Việc cần làm (D-82), cột phải từ 1280 px, trang riêng bên dưới.
**LÝ DO:** tải lại, Back, gửi link đều giữ đúng tuần / tháng đang xem.
**Phương án bị loại:** giữ trong state của trang (mất khi tải lại); một đường dẫn cho mỗi chế độ (`/calendar/week/2026-10-02`, dài và trùng với đường dẫn chi tiết).

### D-88 — Lưới tuần cả ngày, mở ở 06:00; lịch hẹn trùng giờ chia cột · **Agent chốt**
Lưới 00:00–24:00, 46 px một giờ như canvas, cuộn sẵn tới 06:00 (canvas vẽ 06:00–20:00). Hàng "cả ngày" cho lịch hẹn và task cả ngày. Lịch hẹn trùng giờ trong một ngày chia đều bề ngang (mỗi nhóm trùng nhau một số cột). Task có hạn giờ là chip ở giờ đó, nhắc nhở là dấu nhỏ ở giờ đó. Vạch "bây giờ" ở ngày hôm nay.
**LÝ DO:** lịch hẹn lúc 22:00 vẫn phải thấy được; canvas không có hai lịch hẹn trùng giờ nhưng dữ liệu thật sẽ có.
**Phương án bị loại:** chỉ vẽ 06:00–20:00 như canvas (mất mục ngoài khung); chồng các khối lên nhau (che chữ).

### D-89 — Tuần bắt đầu thứ Hai; tháng hiện đủ các tuần chạm tháng; múi giờ của trình duyệt · **Agent chốt**
Tuần thứ Hai → Chủ nhật, số tuần theo ISO 8601 ("TUẦN 40 · 2026"). Tháng hiện từ thứ Hai của tuần chứa ngày 1 tới Chủ nhật của tuần chứa ngày cuối (5 hoặc 6 hàng); ngày ngoài tháng nhạt. Mọi ngày giờ tính theo múi giờ trình duyệt (như các màn khác); chú giải ghi múi giờ đó ("Giờ Việt Nam · GMT+7").
**LÝ DO:** canvas (thứ Hai đầu tuần, "TUẦN 40", tháng 10 từ 28/9).
**Phương án bị loại:** luôn 6 hàng (thêm một hàng trống của tháng sau); tuần bắt đầu Chủ nhật.

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Mẫu dùng chung với Việc cần làm:** task và nhắc nhở của mẫu Lịch lấy từ `createTasksSample`, cùng id và giờ; các lần sắp tới của task lặp do máy chủ mẫu tính; lịch hẹn là mẫu riêng của Lịch. "Gửi lại hóa đơn tháng 9" có hạn 30/09 17:00 (canvas Lịch đặt nó ở 17:00; chữ trên màn Việc không đổi).
- **Tiêu đề nhắc nhở:** "Nhắc: " + tiêu đề task; task "Trả lời: X" thành "Nhắc: Trả lời “X”" (canvas Lịch trình). Trên lưới tuần ghi giờ và tiêu đề ngắn của task ("09:00 Trả lời: Ảnh Đà Lạt" trên canvas là chữ viết tay; web dùng tiêu đề đầy đủ, cắt bằng dấu "…").
- **Lịch trình:** từ hôm nay tới hết khoảng đang xem (mặc định 14 ngày); ngày không có mục thì không hiện. Task quá hạn từ trước hôm nay vẫn hiện ở "Hôm nay" với "Hạn 30/09" và "Quá hạn 2 ngày" (canvas).

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô, giao diện tự đổi ra chữ; phần chưa có backend được phép `null`.

```ts
// GET /api/calendar?from=<LocalDate>&to=<LocalDate>  (to không gồm), GET /api/providers
interface CalendarData {
  generatedAt: Instant
  from: LocalDate
  to: LocalDate
  providers: ProviderInfo[]
  events: CalendarEvent[]       // từng lần
  tasks: CalendarTask[]         // có hạn trong khoảng, gồm lần sắp tới của task lặp
  reminders: CalendarReminder[] // của task
}

interface CalendarEvent {
  id: string                    // của lần này: "event-run@2026-10-04"
  eventId: string
  title: string
  startsAt: Instant | null      // có giờ
  endsAt: Instant | null
  startDate: LocalDate | null   // cả ngày
  endDate: LocalDate | null     // không gồm
  location: string | null
  notes: string | null
  reminder: { at: Instant; offsetMinutes: number; state: 'PENDING' | 'FIRED' } | null
  recurrence: Recurrence | null
  source: (TaskSource & { preview: string | null }) | null   // preview: "Mẹ: Cuối tuần này cả nhà về ăn cơm nhé…"
  related: RelatedItem[] | null
}

interface CalendarTask {
  id: string                    // của lần này
  taskId: string                // task để mở (lần chưa tạo: task đang mở của chuỗi)
  title: string
  status: 'OPEN' | 'DONE'
  dueAt: Instant | null
  dueDate: LocalDate | null
  completedAt: Instant | null
  recurrence: Recurrence | null
  source: TaskSource | null
}

interface CalendarReminder {
  id: string
  taskId: string
  taskTitle: string
  at: Instant
  state: 'PENDING' | 'FIRED'
  source: TaskSource | null
}
```

### Đối chiếu với API

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `events` (từng lần) | module `planner`, bảng `event`, `recurrence` (F17) | **API mới** |
| `tasks` (có hạn, lần sắp tới) | bảng `task` (F16) + tính lần lặp khi xem | **API mới** |
| `reminders` | bảng `reminder` (F16) | **API mới** |
| `source.preview` | đoạn đầu tin gốc (F05/F06) | **API mới**, được phép `null` |
| `related` | việc, lịch hẹn, ghi chú cùng cuộc trò chuyện (F15–F17) | **API mới**, được phép `null` |
| `providers` | `GET /api/providers` | **đã có** |

## Frontend design

```text
src/features/calendar/
  calendar.types.ts    hợp đồng
  calendar.sample.ts   lịch hẹn mẫu + task, nhắc nhở lấy từ mẫu Việc cần làm; lần lặp cho khoảng được hỏi
  calendar.api.ts      fetchCalendar(from, to) (mẫu; chỗ duy nhất đổi khi nối API)
  useCalendar.ts       useCalendar(range), useCalendarView (chế độ và ngày trong URL)
  format.ts            khoảng của từng chế độ, dòng đầu, vị trí trên lưới tuần, ô tháng, nhóm lịch trình, chữ chi tiết
  CalendarPage.tsx     /calendar và /calendar/:itemId theo kích thước
  components/*         đầu trang, chú giải, tuần, tháng, lịch trình, khối chi tiết, dải tuần, trạng thái
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | khoảng của từng chế độ (tuần thứ Hai, tháng 5/6 hàng, số tuần ISO), dời trước / sau, dòng đầu; vị trí khối (giờ → px, trùng giờ chia cột), chip và dấu nhắc; mục của ô tháng theo giờ; nhóm lịch trình, ghi chú bên phải; chữ chi tiết; mẫu khớp canvas (tuần 28/09 – 04/10, tháng 10) |
| Component | đầu trang và chế độ (URL đổi), trước / sau / hôm nay, tuần (khối, chip, dấu nhắc, vạch bây giờ), tháng, lịch trình, chi tiết lịch hẹn (cột phải, đóng), task mở màn Việc cần làm, mobile, trạng thái |
| Trình duyệt thật | Chrome, đồng hồ cố định ở giờ canvas, 1440 (ba chế độ) / 1024 / 390 px × sáng / tối |
| Cổng | `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Canvas viết tay vài tiêu đề ngắn ("Gửi lại hóa đơn T9", "Mua bánh cho bà")] → web dùng tiêu đề thật, cắt bằng "…" (ghi ở `tasks.md`).
- [Mẫu tính lần lặp cho khoảng được hỏi] → chỉ là dữ liệu mẫu (D-86); hợp đồng để máy chủ trả từng lần.
- [Không có canvas cho tablet, cho chi tiết trên màn nhỏ và cho trạng thái] → theo cách màn Việc cần làm làm (D-82); ghi ở `tasks.md`.

## Definition of Done

- [ ] Scenario của spec `calendar-screen` chạy đúng ở các kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
