## Why

Người dùng (2026-10-12): "UI chỗ Ghi chú tôi muốn có 1 tính năng đó là ghi chú dạng diagram tạo các khối ghi chú và liên kết đến các khối khác". Sau khi bấm thử trang mẫu (https://claude.ai/artifact/Vczap6hTGKtABxhybY7EGk, bản 2), người dùng chốt: sơ đồ là một loại ghi chú (A), làm phương án B (màu khối, chữ trên đường nối), chấm nối ở 4 cạnh, chuột phải vào chỗ trống mở danh sách thêm ô, và dựng vùng vẽ bằng React Flow (A). Canvas "Sino UI" chưa có màn này; trang mẫu đã được người dùng xem và đồng ý ("được rồi đó").

Backend: người dùng chọn để sơ đồ thành change riêng sau F15 (F15b, phiên sino-api-11). Màn này dựng trước trên dữ liệu mẫu (D-42), với hợp đồng dữ liệu để F15b làm theo.

## What Changes

- **Loại ghi chú "Sơ đồ" (D-206):** `NoteItem.kind` `TEXT` | `DIAGRAM`; "+ Ghi chú" hỏi "Ghi chú chữ" hay "Sơ đồ"; thẻ sơ đồ trong danh sách ("Sơ đồ · N khối · M nối"); chip lọc "Sơ đồ"; tìm cả trong chữ của các khối.
- **Vùng vẽ (D-207, D-208):** khối chữ, khối chính, 5 màu; mũi tên một chiều có chữ (tùy chọn); 4 chấm nối ở 4 cạnh; thêm khối bằng nút, bấm đúp hay chuột phải ("THÊM Ô"); kéo, sửa chữ tại chỗ, xóa; kéo nền, thu phóng (kể cả chụm hai ngón), "Vừa màn hình"; tự lưu.
- **React Flow (`@xyflow/react`)** cho vùng vẽ, tải riêng chỉ khi mở một sơ đồ (D-208).
- **Bố cục:** như ghi chú chữ (D-201 của `fe-ui-notes`): từ 768 px ở cột phải, dưới 768 px là trang riêng.
- **Hợp đồng dữ liệu** `Diagram`, `DiagramBlock`, `DiagramLink` cho F15b (D-211).

## Capabilities

### New Capabilities
- `diagram-notes`: ghi chú dạng sơ đồ: tạo, danh sách và lọc, vùng vẽ (khối, màu, đường nối có chữ, thêm, kéo, sửa, xóa, thu phóng), tự lưu, trên dữ liệu mẫu.

### Modified Capabilities
- (không có trong `openspec/specs/`: `notes-screen` của `fe-ui-notes` chưa archive; change này thêm hành vi bằng capability mới.)

## Impact

- Code: `apps/sino-web/src/features/notes/**` (kiểu, mẫu, API mẫu, `format.ts`, danh sách, trang), thư mục mới `features/notes/diagram/**`; `apps/sino-web/package.json` + `pnpm-lock.yaml` (`@xyflow/react`).
- Phối hợp: FE-90 của `f15-notes` (phiên sino-api-11) đưa màn Ghi chú lên API và sửa cùng các file; FE-90 làm sau các task của change này, trên commit của nó (đã thống nhất 2026-10-12).
- Không đổi backend, không gọi API.

## Non-goals

- Khối là một ghi chú có sẵn (phương án C của câu hỏi đầu), khối hình tròn / thoi, đổi kích thước khối, gom nhóm, đường nối hai chiều.
- Xuất ảnh, in, chia sẻ sơ đồ; nhiều người cùng sửa.
- Tạo sơ đồ từ một thư.
- Backend F15b.
