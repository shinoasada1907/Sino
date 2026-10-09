# Màn Lịch với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-85…D-89 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [x] 1.1 **CA-01 — Hợp đồng dữ liệu, dữ liệu mẫu, khoảng ngày, hàm chữ và vị trí, hook**
  - **Thực hiện (2026-10-09, AUTO):** `calendar.types.ts` (`CalendarData`, `CalendarEvent`, `CalendarTask`, `CalendarReminder`, `CalendarRange`); `calendar.sample.ts` (lịch hẹn của canvas; "Chạy bộ Hồ Tây" mỗi Chủ nhật từ 06/09, chỉ lần gần nhất có nhắc; task và nhắc nhở lấy từ `createTasksSample` cho khoảng được hỏi, gồm các lần sắp tới của task lặp — `task-weekly@2026-10-12` mở `task-weekly` — và task quá hạn từ trước khi khoảng có hôm nay); `calendar.api.ts` (`fetchCalendar(range)`); `useCalendar.ts` (`useCalendar(range)` giữ khoảng trước khi khoảng sau đang về; `useCalendarView` đọc / ghi `?view=&date=`, hôm nay từ `useNow`); `format.ts` (`weekStart`, `rangeOf`, `shiftAnchor`, `calendarHead` với tuần ISO, `weekDays`, `minuteTop`, `placeTimedEvents` chia cột khi trùng, `itemsOfDay`, `monthCells`, `monthItems`, `agendaDays`, `reminderTitle`, `eventKindLabel`, `eventWhen`, `eventReminder`, `timeZoneLabel`). Dùng chung: `addMonths` trong `shared/time/localDate.ts`. Mẫu Việc cần làm: hạn của "Gửi lại hóa đơn tháng 9" thành 30/09 17:00.
  - **Làm khác kế hoạch:**
    - Lịch có thêm nhắc nhở "Gửi lại hóa đơn tháng 9" lúc 08:12 ("Đã báo"). **LÝ DO:** canvas tự mâu thuẫn: màn Việc ghi "Đã nhắc 08:12", canvas Lịch không vẽ; mẫu dùng chung một dữ liệu cho hai màn.
    - Lịch trình có thêm task cả ngày "Trả lời: Ảnh chuyến đi Đà Lạt" (hôm nay) và ghi quy tắc lặp của "Chuyển tiền nhà" ở cột phải. **LÝ DO:** canvas bỏ task đó (chỉ vẽ nhắc nhở của nó) và đặt quy tắc lặp chỗ dưới tiêu đề ("Chuyển tiền nhà") chỗ cột phải ("Báo cáo tuần"); chọn một cách cho mọi task.
    - Ghi chú bên phải của lịch hẹn theo thứ tự: "sau 2 giờ" (hôm nay, sắp tới) → quy tắc lặp → địa điểm → "nhắc 07:30". **LÝ DO:** suy ra từ 5 lịch hẹn của canvas (chạy bộ có cả địa điểm lẫn lặp → ghi lặp; bữa cơm có địa điểm và nhắc → ghi địa điểm).
  - **Kiểm chứng (2026-10-09):** hàm chữ RED (stub ném lỗi) rồi GREEN 16/16; mẫu: 2 test đỏ vì nhắc 08:12 của hóa đơn (xem trên) → sửa test cho khớp dữ liệu dùng chung; hook viết cùng code. Kiểm tra ngược 41 lỗi gài: 38 bị bắt; 3 sống: tuần ISO khi thứ Hai và thứ Năm khác năm, lịch hẹn qua nửa đêm ở ngày thứ hai (2 ca thiếu → thêm test, bị bắt), thứ tự cùng giờ (lỗi tương đương: danh sách dựng theo lịch hẹn → task → nhắc nhở và `sort` của JavaScript ổn định → bỏ điều kiện thừa, giữ test). Lint báo 2 cảnh báo (gọi `new Date()` khi vẽ → `useNow()`; helper test gán biến ngoài component → `renderHook` + `MemoryRouter`). `pnpm lint` 0, `tsc -b` 0, `vitest` 422/422 (49 file), `pnpm build` 0.
  - **Files:** `src/features/calendar/{calendar.types,calendar.sample,calendar.api,useCalendar,format}.ts`, test; `src/features/tasks/tasks.sample.ts` (hạn 30/09 17:00).
  - **Hướng làm:** kiểu đúng `design.md`; mẫu: lịch hẹn của canvas + task và nhắc nhở lấy từ mẫu Việc cần làm, lần lặp cho khoảng được hỏi; khoảng của từng chế độ, dời trước / sau, dòng đầu; vị trí trên lưới tuần (46 px / giờ, chia cột khi trùng); ô tháng; nhóm lịch trình và ghi chú bên phải; chữ chi tiết; chế độ và ngày trong URL.
  - **Test:** như bảng Testing của `design.md` (unit); mẫu khớp canvas; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `calendar-screen`.

## 2. Màn hình

- [x] 2.1 **CA-02 — Desktop: đầu trang, chú giải, Tuần, khối chi tiết lịch hẹn**
  - **Thực hiện (2026-10-09, AUTO):** `CalendarPage.tsx` (`/calendar`, `/calendar/:itemId`; lịch và cột "Chi tiết lịch hẹn" 340 px từ 1280 px; dưới 1280 px lịch hẹn đang mở thay chỗ lịch); `components/CalendarHeader.tsx` (`CalendarHeader`: dòng nhỏ, tiêu đề, "Hôm nay", khoảng trước / sau, Tuần / Tháng / Lịch trình, "Lịch hẹn"; `CalendarLegend`: chú giải và múi giờ); `components/WeekView.tsx` (dải ngày, hàng cả ngày, lưới 00:00–24:00 mở ở 06:00, khối lịch hẹn chia cột khi trùng, mờ khi đã qua, viền khi đang mở; chip task — đỏ khi quá hạn, gạch khi xong — và dấu nhắc mở màn Việc cần làm; vạch "Bây giờ"); `components/EventDetail.tsx` (loại, giờ, nhắc, lặp, địa điểm, tin nhắn đã tạo ra nó, ghi chú, liên quan; "Sửa", "Thêm thao tác", "Xóa lịch hẹn" chưa làm gì; "Đóng"); route trong `router.tsx`. Tháng và Lịch trình đổi được đầu trang nhưng chưa vẽ thân (CA-03).
  - **Làm khác kế hoạch:**
    - "Sinh nhật Hà" lặp hằng năm. **LÝ DO:** nhãn trên canvas có dấu lặp.
    - Thẻ nguồn ghi tiêu đề thư, không có thì đoạn đầu tin. **LÝ DO:** canvas: "Trần Minh Anh · Gmail" ghi tiêu đề thư, "Gia đình · Zalo" ghi tin của Mẹ.
    - Cột chi tiết có thêm "Đóng" (như màn Việc cần làm); không chọn lịch hẹn nào thì ghi "Chọn một lịch hẹn để xem chi tiết.". **LÝ DO:** canvas luôn vẽ một lịch hẹn đang mở, không có cách đóng; người dùng bàn phím cần một nút.
    - Mốc thời gian của chip việc liên quan theo canvas Lịch ("T7 17:00"), khác màn Việc ("T5 08/10"). **LÝ DO:** mỗi màn theo canvas của nó.
  - **Kiểm chứng (2026-10-09):** test màn viết trước, chạy sau khi dựng; 3 ca đỏ vì test tìm lưới tuần trước khi dữ liệu về → chờ lưới. Kiểm tra ngược 23 lỗi gài: 20 bị bắt; 3 sống vì thiếu ca (chiều cao khối dài, chip của lần lặp sắp tới mở task gốc, thẻ nguồn có cả tiêu đề thư lẫn đoạn đầu) → thêm test, cả 3 bị bắt. Test của router lấy `/calendar` làm trang "đang được dựng" → đổi sang `/services`. Chrome 1440 tối và sáng: lịch 852 px + cột chi tiết 340 px, lưới mở ở 06:00, "Về nhà ăn cơm" 18:30–21:00 cao 115 px và có viền đang mở, "Gọi Minh Anh" 16:00–17:00, vạch bây giờ 14:05, không cuộn ngang. Lỗi gặp khi xem ảnh: khối một giờ mất dòng tiêu đề (dòng có `overflow: hidden` co về 0 trong cột flex) → `*:shrink-0`; nhãn 06:00 bị che nửa → mở cao hơn 10 px. `pnpm lint` 0, `tsc -b` 0, `vitest` 432/432 (50 file), `pnpm build` 0.
  - **Acceptance criteria:** *Đầu trang và chế độ xem*, *Xem theo tuần*, *Chi tiết lịch hẹn* (desktop), *Nút chưa có chức năng*.

- [ ] 2.2 **CA-03 — Tháng và Lịch trình**
  - **Acceptance criteria:** *Xem theo tháng*, *Lịch trình*.

- [ ] 2.3 **CA-04 — Điện thoại, tablet, trạng thái**
  - **Acceptance criteria:** *Lịch trên điện thoại*, *Chi tiết lịch hẹn* (dưới 1280 px), *Trạng thái màn Lịch*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **CA-05 — Nghiệm thu, tài liệu, archive**
  - **Acceptance criteria:** checklist *Definition of Done* trong `design.md`.
