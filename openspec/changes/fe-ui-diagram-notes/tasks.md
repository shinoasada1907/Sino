# Ghi chú dạng sơ đồ (UI trước, dữ liệu mẫu) · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng chốt 2026-10-12: sơ đồ là một loại ghi chú, phương án B, chấm 4 cạnh, menu chuột phải, React Flow; D-206…D-208 người dùng duyệt, D-209…D-212 agent chốt.
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`. FE-90 của `f15-notes` (sino-api-11) làm sau change này.

## 1. Dữ liệu

- [ ] 1.1 **DG-01 — Hợp đồng, mẫu, hàm thuần của sơ đồ, danh sách**
  - **Thực hiện:** kiểu (D-211), sơ đồ mẫu, `diagram/diagram.ts` (thêm / di chuyển / sửa / màu / xóa khối, nối với cạnh gần nhất, xóa nối, giới hạn), `format.ts` (thẻ sơ đồ, lọc "Sơ đồ", tìm trong khối, tên mặc định), API mẫu nhận sơ đồ.
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
