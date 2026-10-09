# Màn Việc cần làm với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID** — frontend AUTO. Người dùng 2026-10-09: "trong lúc chờ BE thì giờ làm UI page Lịch và Việc cần làm". Phạm vi và D-80…D-84 do agent chốt theo cách người dùng đã chọn cho các màn trước (danh sách + chi tiết trước, luồng sửa sau; D-46, D-52) và theo ủy quyền "không cần hỏi" (2026-10-08); ghi phương án bị loại để người dùng xem lại.
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `Tasks` (+ `TasksLight`), `MobileTasks` (+ `MobileTasksLight`). Đối chiếu link ngày 2026-10-09: phiên bản `1790948862-287a`, trùng bản sao.
> Phạm vi sản phẩm: `openspec/changes/planner-from-messages` (D-25 dữ liệu trong Sino, D-27 task kiểu gọn, spec `tasks`, mô hình dữ liệu `task`, `recurrence`, `reminder`).

## Context

- Roadmap Phase 4, F16: "trang Việc cần làm (Quá hạn/Hôm nay/Sắp tới/Không có hạn/Đã xong); menu trên tin nhắn: Tạo task, Nhắc tôi". Backend (module `planner`) chưa có; đường dẫn `/tasks` đang là trang "đang được dựng".
- Spec `tasks` của `planner-from-messages`: task có tiêu đề ≤ 200, `OPEN`/`DONE`, MAY ghi chú, hạn (có giờ hoặc cả ngày), một nhắc nhở, một quy tắc lặp, một nguồn; việc lặp xong thì tạo lần kế tiếp theo **hạn theo lịch**; nhóm theo ngày ở múi giờ người dùng.
- Web đã có: khung app (thanh bên có mục "Việc cần làm" với số và dấu quá hạn, tabbar "Việc"), `MobilePageHeader`, `Segmented`, `Spec`, `ProviderIcon`, `DropdownMenu`, hàm giờ theo múi giờ (`shared/time/local.ts`), giờ canvas cho dữ liệu mẫu (`canvasClock`), cách làm của Hộp thư (bộ lọc trong URL, chọn bằng đường dẫn, trang con trên mobile).

## Decisions

### D-80 — Change này gồm danh sách, thêm, xong / mở lại, chi tiết và ghi chú; sửa hạn, nhắc, lặp là change sau · **Agent chốt** (2026-10-09)
Làm: danh sách theo nhóm, lọc, thêm việc bằng tiêu đề (không hạn, như chữ trong ô: "chọn hạn sau"), đánh dấu xong / mở lại (việc lặp tạo lần kế tiếp), chi tiết (hạn, nhắc, lặp, tạo lúc, tin nhắn gốc, liên quan), sửa ghi chú, các trạng thái. Để sau: sửa hạn, nhắc nhở, quy tắc lặp, xóa việc; các nút "Thêm thao tác", "Nhắc lại sau…", "Xóa task" hiện như canvas nhưng chưa làm gì.
**LÝ DO:** canvas `Tasks` vẽ danh sách và khối chi tiết (ghi chú là ô nhập thật) nhưng không vẽ bộ chọn ngày giờ, nhắc nhở, lặp; bộ chọn của Phase 4 nằm ở `InboxTask`, `InboxRemind` (thao tác trên thư, D-52) và nên dựng một lần cho cả hai chỗ. Giống D-46 (danh sách + chi tiết trước, luồng sau).
**Phương án bị loại:** làm luôn bộ chọn (tự vẽ giao diện canvas chưa có, dễ lệch khi dựng `InboxTask`); chỉ danh sách, không chi tiết (mất khối "Chi tiết việc" của canvas).

### D-81 — Hạn là `dueAt` (thời điểm) hoặc `dueDate` (ngày) · **Agent chốt**
Hợp đồng có hai trường, nhiều nhất một trường khác `null`: `dueAt: Instant` cho hạn có giờ, `dueDate: "2026-10-15"` cho hạn cả ngày. Trùng hai cột `due_at`, `due_date` của mô hình dữ liệu trong `planner-from-messages`.
**LÝ DO:** "cả ngày 15/10" là một ngày lịch, không phải một thời điểm; viết nó thành `Instant` thì phải chọn múi giờ cho nửa đêm, và đọc ở múi giờ khác sẽ lệch ngày.
**Phương án bị loại:** `{ at: Instant, allDay: boolean }` như `linked` của Hộp thư (gọn, nhưng thời điểm của ngày cả-ngày phụ thuộc múi giờ lúc tạo).

### D-82 — Chọn một việc bằng đường dẫn; dưới 1280 px chi tiết là trang riêng · **Agent chốt**
`/tasks/:taskId` mở chi tiết. Từ 1280 px chi tiết là cột phải như canvas, dòng đang mở được đánh dấu, "Đóng" về `/tasks`. Dưới 1280 px (tablet, mobile) danh sách chiếm cả màn, bấm một việc mở trang chi tiết với đầu trang con (`MobilePageHeader`, nút quay lại), cùng nội dung khối chi tiết. Bộ lọc nằm trong URL (`?filter=messages|repeat`) và đi theo khi mở/đóng chi tiết.
**LÝ DO:** canvas chỉ vẽ chi tiết ở desktop; cách này giống Hộp thư (tải lại, nút Back, gửi link đều giữ đúng việc đang xem), không cần thành phần mới.
**Phương án bị loại:** không có chi tiết trên màn nhỏ (không xem được ghi chú, tin nhắn gốc); tấm trượt từ dưới lên (chưa có thành phần, canvas không vẽ).

### D-83 — Số "Việc cần làm" trên điều hướng là số việc tới hạn (quá hạn + hôm nay) · **Agent chốt**
Thanh bên của canvas ghi "Việc cần làm 3" còn màn `Tasks` ghi "8 việc đang mở · 1 quá hạn"; 3 đúng bằng 1 việc quá hạn + 2 việc hôm nay. Số trên điều hướng là việc tới hạn, đọc là "Việc cần làm, 3 tới hạn" (trước: "3 chưa xong"); dấu đỏ vẫn là việc quá hạn. Trên dữ liệu mẫu, mỗi thay đổi trong danh sách tính lại hai số này từ danh sách.
**LÝ DO:** điều hướng nhắc việc cần làm ngay; con số khớp cả thanh bên và màn của canvas. Hai số tính từ danh sách nên không bao giờ lệch.
**Phương án bị loại:** đếm mọi việc đang mở (8, lệch thanh bên của canvas); để số của khung app là mẫu riêng không đổi (đánh dấu xong việc quá hạn mà dấu đỏ vẫn còn).

### D-84 — Nhóm, "hôm nay", "trễ N ngày" tính ở trình duyệt; lần kế tiếp của việc lặp do máy chủ trả · **Agent chốt**
Web nhóm và viết chữ theo múi giờ của trình duyệt (như Hộp thư, Tổng quan; mặc định của sản phẩm là `Asia/Ho_Chi_Minh`). Đánh dấu xong trả `{ task, next }`: `next` là lần kế tiếp máy chủ đã tạo (spec `tasks`: tính theo hạn theo lịch, bỏ lần đã lỡ, ngày 31). Web không tự tính quy tắc lặp; bản mẫu tính đủ cho bốn việc mẫu (hằng tuần, hằng tháng theo ngày).
**LÝ DO:** quy tắc lặp có nhiều ca biên (31/11, 29/02, hoàn thành trễ nhiều chu kỳ) và thuộc `RecurrenceCalculator` của backend; hai bản tính ở hai nơi sẽ lệch nhau.
**Phương án bị loại:** web tự tính lần kế tiếp (lặp logic của backend); máy chủ trả sẵn nhóm (nhóm phụ thuộc "bây giờ", đổi theo đồng hồ khi trang còn mở).

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Đường dẫn:** `/tasks`, `/tasks/:taskId`; lọc `?filter=all|messages|repeat` (mặc định `all`, không ghi vào URL).
- **Thứ tự trong nhóm:** việc có hạn theo hạn tăng dần, ~~ngày cả-ngày đứng trước các giờ của cùng ngày~~ trong cùng một ngày việc có giờ đứng trước việc cả ngày (**LÝ DO (TK-01):** canvas đặt "Chuyển tiền nhà" 17:00 trước "Trả lời: Ảnh chuyến đi Đà Lạt" cả ngày hôm nay); "Không có hạn" theo lúc tạo, mới trước; "Đã xong" theo lúc xong, mới trước.
- **Thêm việc:** Enter lưu, ô trống lại và giữ focus; chữ rỗng hoặc chỉ khoảng trắng không gửi; tiêu đề dài hơn 200 ký tự bị chặn ở ô nhập (`maxLength`). Việc mới hiện ngay trong "Không có hạn".
- **Ghi chú:** lưu khi rời ô (blur) nếu chữ đã đổi.
- **Đã xong:** hợp đồng chỉ gồm việc xong trong 7 ngày gần nhất (máy chủ lọc); mở lại thì việc về nhóm theo hạn của nó.

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô, giao diện tự đổi ra chữ; phần chưa có backend được phép `null`.

```ts
type LocalDate = string                      // "2026-10-15"
type Weekday = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

// GET /api/tasks: việc đang mở và việc xong trong 7 ngày
interface TasksData {
  generatedAt: Instant
  tasks: TaskItem[]
}

interface TaskItem {
  id: string
  title: string                              // ≤ 200
  notes: string | null
  status: 'OPEN' | 'DONE'
  dueAt: Instant | null                      // hạn có giờ (D-81)
  dueDate: LocalDate | null                  // hạn cả ngày; nhiều nhất một trong hai
  reminder: { at: Instant; state: 'PENDING' | 'FIRED' } | null
  recurrence: {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    interval: number                         // mỗi N lần
    byWeekdays: Weekday[] | null             // WEEKLY
    byMonthDay: number | null                // MONTHLY: ngày gốc
    untilDate: LocalDate | null
    count: number | null
  } | null
  seriesId: string | null                    // các lần của một việc lặp
  source: {                                  // tạo từ tin nhắn
    kind: 'MESSAGE' | 'CONVERSATION'
    id: string
    conversationId: string                   // mở Hộp thư
    provider: ProviderType
    title: string                            // người gửi hoặc tên cuộc trò chuyện
    subject: string | null                   // tiêu đề thư; null với chat
    missing: boolean                         // tin gốc đã bị xóa
  } | null
  createdAt: Instant
  completedAt: Instant | null
  related: { kind: 'TASK' | 'EVENT' | 'NOTE'; id: string; title: string; at: Instant | null; allDay: boolean }[] | null   // cùng cuộc trò chuyện
}

// Thay đổi
addTask(title) -> TaskItem                           // POST /api/tasks
completeTask(id) -> { task: TaskItem; next: TaskItem | null }   // POST /api/tasks/{id}/complete
reopenTask(id) -> TaskItem                           // POST /api/tasks/{id}/reopen
saveTaskNotes(id, notes) -> TaskItem                 // PATCH /api/tasks/{id} { notes }
```

### Đối chiếu với API

| Phần | Nguồn ở backend | Tình trạng |
|---|---|---|
| `tasks` (tiêu đề, hạn, trạng thái, lặp, nguồn) | module `planner`, bảng `task`, `recurrence` (F16) | **API mới** |
| `reminder` | bảng `reminder` (F16), báo qua F13/F14 | **API mới** |
| `related` | việc, lịch hẹn, ghi chú cùng cuộc trò chuyện (F15–F17) | **API mới**, được phép `null` |
| `addTask`, `completeTask`, `reopenTask`, `saveTaskNotes` | `POST /api/tasks`, `/complete`, `/reopen`, `PATCH` (F16, design `planner-from-messages`) | **API mới** |
| số trên điều hướng (`navCounts.tasksOpen`, `tasksOverdue`) | tính từ `GET /api/tasks` (D-83) | dữ liệu mẫu |

## Frontend design

```text
src/features/tasks/
  tasks.types.ts       hợp đồng
  tasks.sample.ts      createTasksSample(now): 10 việc như canvas, giờ dời theo đồng hồ
  tasks.api.ts         fetchTasks, addTask, completeTask, reopenTask, saveTaskNotes (mẫu; chỗ duy nhất đổi khi nối API)
  useTasks.ts          useTasks, useTask, mutation (sửa cache danh sách + số trên điều hướng)
  format.ts            nhóm, chữ hạn / nhắc / lặp / xong, dòng đầu trang, chữ chi tiết
  TasksPage.tsx        /tasks và /tasks/:taskId theo kích thước
  components/*         ô thêm, nhóm, dòng, khối chi tiết, trạng thái
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | nhóm (quá hạn theo giờ và theo ngày, hôm nay, sắp tới, không hạn, đã xong), thứ tự trong nhóm, chữ hạn / nhắc / lặp / xong, dòng đầu trang, lọc, số trên điều hướng; dữ liệu mẫu khớp canvas |
| Component | nhóm và dòng, lọc (URL đổi), thêm việc (Enter, rỗng), đánh dấu xong / mở lại (lần kế tiếp), chi tiết (cột phải, đóng, tin nhắn gốc, ghi chú lưu khi rời ô), trang chi tiết dưới 1280 px, trạng thái |
| Trình duyệt thật | Chrome, đồng hồ cố định ở giờ canvas, 1440 / 1024 / 390 px × sáng / tối |
| Cổng | `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Canvas tự mâu thuẫn số trên thanh bên] → D-83 đọc là số việc tới hạn; ghi lại để người dùng xem.
- [Bản mẫu tính lần kế tiếp cho việc lặp] → chỉ là dữ liệu mẫu (D-84); hợp đồng để máy chủ trả `next`.
- [Không có canvas cho chi tiết trên màn nhỏ và cho các trạng thái] → dựng từ khối chi tiết của desktop và trạng thái của Hộp thư (D-82, D-55); ghi ở `tasks.md`.

## Definition of Done

- [ ] Scenario của spec `tasks-screen` chạy đúng ở các kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
