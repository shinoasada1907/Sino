# Ghi chú dạng sơ đồ (UI trước, dữ liệu mẫu) · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng chốt 2026-10-12: sơ đồ là một loại ghi chú, phương án B, chấm 4 cạnh, menu chuột phải, React Flow; D-206…D-208 người dùng duyệt, D-209…D-212 agent chốt.
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`. FE-90 của `f15-notes` (sino-api-11) làm sau change này.

## 1. Dữ liệu

- [x] 1.1 **DG-01 — Hợp đồng, mẫu, hàm thuần của sơ đồ, danh sách**
  - **Thực hiện:** kiểu (D-211), sơ đồ mẫu, `diagram/diagram.ts` (thêm / di chuyển / sửa / màu / xóa khối, nối với cạnh gần nhất, xóa nối, giới hạn), `format.ts` (thẻ sơ đồ, lọc "Sơ đồ", tìm trong khối, tên mặc định), API mẫu nhận sơ đồ.
  - **Đã làm (2026-10-16, AUTO; hoàn tất bản WIP `b23f5b3` của một phiên web bỏ dở):** kiểu D-211 trong `notes.types.ts` (khớp Hợp đồng dữ liệu của `design.md`); sơ đồ mẫu "Kế hoạch chuyến đi Đà Lạt" (7 khối, 6 nối); `diagram/diagram.ts` (`newDiagram`, `newBlock`, `addBlock`, `moveBlock`, `setBlockText`, `setBlockColor`, `removeBlock`, `connect`, `setLinkLabel`, `removeLink`, `nearestSide`, `diagramSummary`, `DIAGRAM_LIMITS`); `format.ts` (tên mặc định, `notePreview`, nguồn "Sơ đồ · N khối · M nối", lọc `diagram`, tìm cả chữ trong khối và trên đường nối, `noteCounts.diagram`); `notes.api.ts` (`createNote` / `saveNote` nhận `diagram`, thay cả sơ đồ). Sửa so với WIP: (1) `tsc -b` 2 lỗi TS2322 ở `notes.sample.ts`: mảng ghi chú chữ trong `...[…].map(...)` không có kiểu ngữ cảnh, nên `LinkedTask.kind: 'TASK'` bị nới thành `string` (lỗi dòng 98 là cùng lỗi, báo cho cả mảng) → hàm `text(...)` bọc từng ghi chú, như `anchor(...)`; (2) 7 test NT-01…NT-03 đỏ vì mẫu nay có 7 ghi chú và hai tiêu đề chứa "Đà Lạt" → sửa số đếm, tìm thẻ bằng `/Ý tưởng chuyến đi/`, thêm kiểm thẻ sơ đồ ghi "Sơ đồ · 7 khối · 6 nối"; (3) `connect` từ chối khối không có trong sơ đồ (máy chủ sẽ trả 400, D-211); (4) tên và đầu nội dung bỏ qua khối chưa có chữ (khối mới hiện "Khối mới").
  - **Để lại cho task sau:** tới DG-02, thẻ sơ đồ chưa có dấu sơ đồ và đầu nội dung (`NoteCard` vẫn in `body` rỗng; `notePreview` đã có), và `useNotesFilter` chưa nhận `?filter=diagram` (đi cùng chip "Sơ đồ"); tới DG-03, mở sơ đồ mẫu vẫn ra ô soạn chữ rỗng.
  - **Kiểm chứng (2026-10-16):** trước khi sửa: `tsc -b` 2 lỗi, vitest `features/notes` 7 đỏ / 40. Test mới viết trước: RED đúng 2 (`connect` tới khối không có; khối không chữ: `expected 'Sơ đồ mới' to be 'Thuê homestay'`). Các test mới còn lại (giới hạn 600 đường, ba kịch bản spec trên sơ đồ mẫu, tìm "homestay" trên mẫu, tạo và lưu sơ đồ qua hook) xanh ngay vì code WIP đã có, nên không có lượt đỏ. GREEN `features/notes` 47/47. Trên cây làm việc chung (có thay đổi chưa commit của f05c FE-111): `pnpm lint` 0, `tsc -b` 0, `pnpm test` 674/674 (77 file), `pnpm build` 0. Trên bản sạch `dev` `48ac6e3` + chỉ các file DG-01 (worktree): lint 0, `tsc -b` 0, test 672/672 (77 file), build 0. Không chạy Chrome (task dữ liệu, như NT-01): thẻ sơ đồ mẫu hiện bằng `NoteCard` có sẵn của NT-02 và đã kiểm trong jsdom; giao diện thẻ sơ đồ kiểm ở Chrome tại DG-02. File kiến thức mục 23 + câu 138–139, `.docx` sinh lại, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** phần dữ liệu của spec `diagram-notes` (unit test).

## 2. Màn hình

- [ ] 2.1 **DG-02 — Danh sách và tạo: menu "+ Ghi chú", chip "Sơ đồ", thẻ sơ đồ, `/notes/new?kind=diagram`**
  - **Acceptance criteria:** *Sơ đồ trong danh sách ghi chú*, *Sơ đồ mới* (phần tạo khi có thay đổi đầu tiên dùng hàm của DG-03 nếu cần).

- [ ] 2.2 **DG-03 — Vùng vẽ bằng React Flow (desktop): khối, màu, nối 4 cạnh, chữ trên đường, thêm (nút, bấm đúp, chuột phải), sửa, xóa, thu phóng, tự lưu**
  - **Thực hiện:** cài `@xyflow/react` 12.12.0; `DiagramEditor` tải riêng; node, edge, thanh chọn, menu "THÊM Ô".
  - **Acceptance criteria:** *Khối của sơ đồ*, *Đường nối của sơ đồ*, *Xem và tự lưu sơ đồ* ở 1440 px.

- [ ] 2.3 **DG-04 — Tablet và điện thoại; kiểm bằng lỗi gài cho `diagram.ts`**
  - **Acceptance criteria:** phần điện thoại (D-212) và tablet.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **DG-05 — Nghiệm thu, tài liệu, archive** (đủ cỡ × 2 theme).
