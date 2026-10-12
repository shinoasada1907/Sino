# Màn Ghi chú (UI trước, dữ liệu mẫu) · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng duyệt thiết kế 2026-10-12 ("duyệt"): D-200…D-202; D-203…D-205 agent chốt.
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; đối chiếu canvas; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`.

## 1. Dữ liệu

- [ ] 1.1 **NT-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
  - **Thực hiện:** `notes.types.ts`, `notes.sample.ts` (6 ghi chú như canvas, giờ theo `canvasClock`), `notes.api.ts` (mẫu), `format.ts` (nhóm, lọc, tìm không dấu, số chip, giờ, nguồn neo, đoạn trích, chân ô soạn), `useNotes.ts` (`useNotes`, `useNote`, `useCreateNote`, `useSaveNote`, `useDeleteNote`).
  - **Acceptance criteria:** phần dữ liệu và chữ của spec `notes-screen` (unit test).

## 2. Màn hình

- [ ] 2.1 **NT-02 — Desktop: danh sách, lọc, tìm, ô soạn, tự lưu, ghi chú mới, ghim, xóa**
  - **Thực hiện:** `NotesPage`, các component; route `/notes`, `notes/new`, `notes/:noteId` (báo phiên planner trước khi sửa `router.tsx`).
  - **Acceptance criteria:** spec `notes-screen` *Danh sách ghi chú*, *Lọc và tìm ghi chú*, *Ô soạn một ghi chú*, *Sửa và tự lưu*, *Ghi chú mới*, *Ghim và xóa* ở 1440 px.

- [ ] 2.2 **NT-03 — Tablet và mobile, trạng thái**
  - **Thực hiện:** hai cột ở 768–1279 px; dưới 768 px hai trang (`MobileNotes`, `MobileNoteEditor`), ô tìm trên mobile mở bằng nút tìm; đang tải, không tải được, chưa có ghi chú.
  - **Acceptance criteria:** phần mobile của *Ô soạn một ghi chú*, *Trạng thái của trang Ghi chú*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **NT-04 — Nghiệm thu, tài liệu, archive** (đủ cỡ × 2 theme, ảnh so với canvas).
