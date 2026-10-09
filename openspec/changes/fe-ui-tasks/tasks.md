# Màn Việc cần làm với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-80…D-84 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [x] 1.1 **TK-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
  - **Thực hiện (2026-10-09, AUTO):** `tasks.types.ts` (`TasksData`, `TaskItem`, `Recurrence`, `TaskSource`, `RelatedItem`, `CompletedTask`); `tasks.sample.ts` (10 việc như canvas; id `task-contract`, `task-cake` trùng việc mà mẫu Hộp thư gắn; nguồn là các cuộc trò chuyện của mẫu Hộp thư; `nextOccurrenceSample` cho máy chủ mẫu); `tasks.api.ts` (`fetchTasks`, `addTask`, `completeTask` trả `{ task, next }` và hủy nhắc chưa báo, `reopenTask`, `saveTaskNotes`); `useTasks.ts` (`useTasks`, `useTask`, `useAddTask`, `useToggleTask` đổi ngay, trả lại khi lỗi, không thêm cùng một lần kế tiếp hai lần, `useSaveTaskNotes`; mỗi thay đổi tính lại số trên điều hướng); `format.ts` (nhóm, chữ hạn / nhắc / lặp / xong / lần kế tiếp, đầu trang, lọc, số trên điều hướng, chữ chi tiết). Dùng chung: `LocalDate` trong `shared/domain.ts`; `shared/time/localDate.ts` (`localDateOf`, `daysBetweenDates`, `addDays`, `weekdayOfDate`, `dayMonthOfDate`); `dayClockFrom` trong `canvasClock.ts` (dời ngày của mẫu theo đồng hồ, làm tròn số ngày để việc cả ngày giữ chỗ giữa các việc có giờ); `WEEKDAY_NAMES`, `WEEKDAY_SHORT` của `local.ts` được export. Khung app: `NavCounts.tasksOpen` → `tasksDue`, chữ đọc "tới hạn" (D-83).
  - **Làm khác kế hoạch:**
    - Thứ tự trong một ngày: việc có giờ trước việc cả ngày (gạch ở `design.md`). **LÝ DO:** canvas.
    - `source` có thêm `subject`. **LÝ DO:** thẻ "Tin nhắn gốc" của canvas ghi cả tiêu đề thư.
    - Nguồn của "Gia hạn bảo hiểm TA-2025-0418" là tin đã bị xóa (`missing: true`). **LÝ DO:** mẫu Hộp thư không có cuộc trò chuyện "Bảo hiểm Tâm An"; dùng ca này để màn có một nguồn không mở được (thay vì một liên kết dẫn tới "không tìm thấy").
    - Canvas tự mâu thuẫn: Hộp thư ghi việc "Trả lời: Hợp đồng thuê văn phòng" hạn "T4 07/10" (cả ngày), màn Việc ghi "T4 07/10 · 17:00". Màn Việc theo canvas `Tasks`; mẫu Hộp thư không đổi.
  - **Kiểm chứng (2026-10-09):** hàm chữ RED 10/10 trên stub, GREEN; mẫu: 1 test đỏ đúng lý do (khung app chưa có `tasksDue`), xanh sau khi đổi tên; hook viết cùng code, kiểm bằng lỗi gài. Kiểm tra ngược 36 lỗi gài: 27 bị bắt ngay; 9 sống: 1 điều kiện thừa (`isOverdue` kiểm `OPEN` mà nơi gọi đã lọc → bỏ), 7 thiếu ca biên (hạn đúng bằng bây giờ, trễ 45 phút, chuỗi chỉ còn việc đã xong, hai việc mở cùng chuỗi, lặp ngày 31 sang tháng ngắn, ghi chú toàn khoảng trắng, `useTask` khi danh sách chưa về → thêm test, cả 7 bị bắt), 1 không bắt được ở máy này (`getUTCDay` → `getDay` chỉ khác ở múi giờ âm; test chạy `Asia/Ho_Chi_Minh`; code đúng, để nguyên). `pnpm lint` 0, `tsc -b` 0, `vitest` 369/369 (44 file), `pnpm build` 0.
  - **Files:** `src/features/tasks/{tasks.types,tasks.sample,tasks.api,useTasks,format}.ts`, test; `src/app/shell/{navItems.ts,shell.sample.ts}` (D-83); có thể `src/shared/time/local.ts`.
  - **Hướng làm:** kiểu đúng `design.md`; mẫu theo canvas `Tasks` (10 việc: 1 quá hạn, 2 hôm nay, 4 sắp tới, 1 không hạn, 2 đã xong; giờ dời theo đồng hồ, như canvas lúc 14:05 thứ Sáu 02/10); `completeTask` mẫu trả `next` cho việc lặp; mutation sửa cache danh sách và tính lại số trên điều hướng.
  - **Test:** nhóm, thứ tự, chữ hạn / nhắc / lặp / xong, dòng đầu trang, lọc, số trên điều hướng; mẫu khớp canvas; mutation; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `tasks-screen`.

## 2. Màn hình

- [ ] 2.1 **TK-02 — Desktop: đầu trang, lọc, thêm việc, nhóm, dòng, khối chi tiết**
  - **Files:** `src/features/tasks/TasksPage.tsx`, `components/*`, `src/app/router.tsx`, test.
  - **Hướng làm:** theo canvas `Tasks` (1440): danh sách và khối "Chi tiết việc" 2 cột từ 1280 px; `/tasks/:taskId` chọn việc; lọc trong URL; ghi chú lưu khi rời ô.
  - **Test:** nhóm và dòng như canvas, lọc, thêm việc, xong / mở lại, chi tiết, tin nhắn gốc, đóng, việc không tồn tại.
  - **Acceptance criteria:** *Danh sách việc theo nhóm*, *Lọc việc*, *Thêm việc*, *Đánh dấu xong và mở lại*, *Chi tiết một việc* (desktop), *Số việc trên điều hướng*, *Nút chưa có chức năng*.

- [ ] 2.2 **TK-03 — Tablet và mobile, trạng thái**
  - **Files:** `src/features/tasks/**`, test.
  - **Hướng làm:** theo canvas `MobileTasks`: đầu trang riêng ("Việc cần làm", "8 đang mở", nút "Lọc"), ô thêm, nhóm; dưới 1280 px chi tiết là trang riêng (D-82); trạng thái đang tải / lỗi / rỗng (D-55 của Hộp thư làm mẫu).
  - **Test:** mobile và tablet, trang chi tiết, trạng thái.
  - **Acceptance criteria:** *Chi tiết một việc* (dưới 1280 px), *Lọc việc* (mobile), *Trạng thái màn Việc cần làm*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **TK-04 — Nghiệm thu, tài liệu, archive**
  - **Acceptance criteria:** checklist *Definition of Done* trong `design.md`.
