## Why

Người dùng (2026-10-12): "tiếp theo là UI phần ghi chú", rồi duyệt thiết kế ("duyệt"). Ghi chú là F15 của roadmap (Phase 4, phạm vi ở `openspec/changes/planner-from-messages`: ghi chú chữ đơn giản, neo vào một tin nhắn / cuộc trò chuyện / người, ghim, tìm, D-28). Backend (module `notes`) chưa có; đường dẫn `/notes` đang là trang "đang được dựng". Như Việc cần làm và Lịch, màn này dựng giao diện trước trên dữ liệu mẫu (D-42), với hợp đồng dữ liệu để backend làm theo.

## What Changes

- **Trang `/notes`** theo canvas `Notes` (desktop) và `MobileNotes`: tiêu đề, "+ Ghi chú", ô tìm, chip lọc Tất cả / Gắn tin nhắn / Đã ghim kèm số, nhóm "ĐÃ GHIM" và "GẦN ĐÂY", thẻ ghi chú (tiêu đề, giờ sửa, đầu nội dung, nguồn neo, "Tin nhắn gốc không còn", "Ghi chú độc lập").
- **Ô soạn** (`/notes/:noteId`, `/notes/new`) theo canvas `Notes` (cột phải) và `MobileNoteEditor`: chip "Gắn với …" mở Hộp thư, Ghim, Thêm thao tác, Xóa, tiêu đề, đoạn trích, nội dung, chip việc liên quan, "Sửa lúc … · tự lưu", "N / 20.000 ký tự".
- **Bố cục (D-201):** từ 768 px hai cột; dưới 768 px danh sách và ô soạn là hai trang.
- **Tương tác trên dữ liệu mẫu:** tạo, sửa (tự lưu), ghim / bỏ ghim, xóa (hỏi trước), tìm, lọc (trong URL).
- **Trạng thái:** đang tải, không tải được, chưa có ghi chú, không có ghi chú nào khớp.
- **Hợp đồng dữ liệu** `NotesData`, `NoteItem` cùng bảng đối chiếu với API trong `design.md`.

## Capabilities

### New Capabilities
- `notes-screen`: danh sách ghi chú theo nhóm, tìm, lọc, ô soạn, tạo, sửa, ghim, xóa trên dữ liệu mẫu, các trạng thái.

### Modified Capabilities
- Không có.

## Impact

- Code: `apps/sino-web/src/features/notes/**` (mới), `src/app/router.tsx` (route `/notes`, `notes/:noteId`; báo phiên planner trước khi sửa), có thể `src/shared/**`.
- Không đổi backend, không gọi API.

## Non-goals

- Tạo ghi chú từ một thư (bôi đen đoạn trích → "Ghi chú", canvas `InboxNote`, `MobileConversation…`) và mục "Việc và ghi chú" trong cuộc trò chuyện: change thao tác trên thư.
- "Thêm thao tác": hiện như canvas nhưng chưa làm gì.
- Backend F15 (module `notes`, API).
- Nghiệm thu và archive: để sau như các màn trước.
