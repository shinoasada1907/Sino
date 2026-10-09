# Màn Việc cần làm với dữ liệu mẫu (UI trước) · Implementation Plan

> **HYBRID mode:** frontend AUTO — Claude làm từng task, kiểm chứng, commit. Phạm vi và D-80…D-84 do agent chốt (ghi ở `design.md`).
> Mỗi task: test đỏ trước rồi mới xanh, kiểm tra ngược cho logic, một commit trên `dev` (không push). `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh trước khi commit. Kiến thức vào `docs/knowledge/phase-1-frontend-foundation.md` + `.docx`.

## 1. Dữ liệu

- [ ] 1.1 **TK-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
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
