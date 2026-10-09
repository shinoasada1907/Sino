# Màn Lịch với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-85…D-89 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [ ] 1.1 **CA-01 — Hợp đồng dữ liệu, dữ liệu mẫu, khoảng ngày, hàm chữ và vị trí, hook**
  - **Files:** `src/features/calendar/{calendar.types,calendar.sample,calendar.api,useCalendar,format}.ts`, test; `src/features/tasks/tasks.sample.ts` (hạn 30/09 17:00).
  - **Hướng làm:** kiểu đúng `design.md`; mẫu: lịch hẹn của canvas + task và nhắc nhở lấy từ mẫu Việc cần làm, lần lặp cho khoảng được hỏi; khoảng của từng chế độ, dời trước / sau, dòng đầu; vị trí trên lưới tuần (46 px / giờ, chia cột khi trùng); ô tháng; nhóm lịch trình và ghi chú bên phải; chữ chi tiết; chế độ và ngày trong URL.
  - **Test:** như bảng Testing của `design.md` (unit); mẫu khớp canvas; kiểm tra ngược.
  - **Acceptance criteria:** nền dữ liệu cho mọi requirement của `calendar-screen`.

## 2. Màn hình

- [ ] 2.1 **CA-02 — Desktop: đầu trang, chú giải, Tuần, khối chi tiết lịch hẹn**
  - **Acceptance criteria:** *Đầu trang và chế độ xem*, *Xem theo tuần*, *Chi tiết lịch hẹn* (desktop), *Nút chưa có chức năng*.

- [ ] 2.2 **CA-03 — Tháng và Lịch trình**
  - **Acceptance criteria:** *Xem theo tháng*, *Lịch trình*.

- [ ] 2.3 **CA-04 — Điện thoại, tablet, trạng thái**
  - **Acceptance criteria:** *Lịch trên điện thoại*, *Chi tiết lịch hẹn* (dưới 1280 px), *Trạng thái màn Lịch*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **CA-05 — Nghiệm thu, tài liệu, archive**
  - **Acceptance criteria:** checklist *Definition of Done* trong `design.md`.
