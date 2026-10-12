# Màn Ghi chú (UI trước, dữ liệu mẫu) · Implementation Plan

> **HYBRID mode:** frontend AUTO. Người dùng duyệt thiết kế 2026-10-12 ("duyệt"): D-200…D-202; D-203…D-205 agent chốt.
> Mỗi task: test viết trước (đỏ rồi xanh); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build`; đối chiếu canvas; Chrome một lượt ở các cỡ task đụng tới; file kiến thức phase 1 + `.docx`, `genoffice docs check`; commit riêng trên `dev`.

## 1. Dữ liệu

- [x] 1.1 **NT-01 — Hợp đồng dữ liệu, dữ liệu mẫu, hàm chữ, hook, mutation**
  - **Thực hiện:** `notes.types.ts`, `notes.sample.ts` (6 ghi chú như canvas, giờ theo `canvasClock`), `notes.api.ts` (mẫu), `format.ts` (nhóm, lọc, tìm không dấu, số chip, giờ, nguồn neo, đoạn trích, chân ô soạn), `useNotes.ts` (`useNotes`, `useNote`, `useCreateNote`, `useSaveNote`, `useDeleteNote`).
  - **Đã làm (2026-10-12, AUTO):** như trên; neo vào `conv-1`, `conv-2`, `conv-3` của mẫu Hộp thư và `task-contract` của mẫu Việc cần làm; ghim không dời `updatedAt` (không phải một lần sửa); `useNotes` `staleTime: Infinity` để mẫu không bị đọc lại mất chỉnh sửa.
  - **Làm khác kế hoạch:** thứ tự "ĐÃ GHIM" theo spec (08:31 trước "Hôm qua"), khác canvas; ghi ở D-205.
  - **Kiểm chứng (2026-10-12):** RED 12/13 trên bản rỗng (test "xóa" xanh vì bản rỗng tình cờ trả "không thấy"), GREEN 13/13; hai test hook kiểm ngay sau `act` đỏ vì TanStack báo component ở nhịp sau → chờ bằng `waitFor`. Không có Chrome (chưa có giao diện). `pnpm lint` 0, `tsc -b` 0, `pnpm test` 629/629 (74 file), `pnpm build` 0. File kiến thức mục 20 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** phần dữ liệu và chữ của spec `notes-screen` (unit test).

## 2. Màn hình

- [x] 2.1 **NT-02 — Desktop: danh sách, lọc, tìm, ô soạn, tự lưu, ghi chú mới, ghim, xóa**
  - **Thực hiện:** `NotesPage`, các component; route `/notes`, `notes/new`, `notes/:noteId` (báo phiên planner trước khi sửa `router.tsx`).
  - **Đã làm (2026-10-12, AUTO):** `useNotesFilter` (`filter`, `q` trong URL, gõ tìm thay mục lịch sử); `NoteList` (đầu, "+ Ghi chú", ô tìm, chip có số, nhóm, `NoteCard`); `NoteEditor` (neo, Ghim là nút bật/tắt `aria-pressed`, Thêm thao tác chưa làm gì, Xóa; tiêu đề, trích, nội dung, việc liên quan, chân; tự lưu 600 ms, khi rời ô và khi rời ghi chú; ghi chú mới tạo khi có chữ rồi thay địa chỉ với `FROM_NEW` để giữ ô soạn); `DeleteNoteDialog`; `NoteStates` (khung xương, lỗi; hoàn thiện ở NT-03); `NotesPage` (hai cột từ 768 px: 320 px / 420 px từ 1280 px); route `/notes` trong `SCREENS`, `notes/new`, `notes/:noteId` (sino-api-94 đồng ý giữ `router.tsx` cho tới khi commit).
  - **Làm khác kế hoạch:** test router "mở màn của một mục điều hướng" dùng "Ghi chú" làm màn đang dựng → đổi sang "Dịch vụ". **LÝ DO:** Ghi chú giờ có màn thật.
  - **Kiểm chứng (2026-10-12):** RED 8/8 (route chưa có); lần đầu test đỏ vì chính test tìm vùng lúc trang đang tải → thêm `ready()`; `toHaveValue` không nhận matcher một phần → đọc `value`; test Ghim đổi thành tên cố định + `aria-pressed` trước khi viết code. GREEN 21/21 ghi chú. Chạy cả bộ: test ghi chú mới chậm quá 1 s mặc định của `waitFor` khi máy bận → `timeout: 3000` cho hai test tự lưu. Chrome thật (headless, `vite` :5174, 1440): 6 thẻ đúng thứ tự, chip "Tất cả · 6 / Gắn tin nhắn · 5 / Đã ghim · 2", cột danh sách 420 px; ô soạn có chip `/inbox/conv-1`, trích "TRÍCH TỪ THƯ · 09:41 HÔM NAY", chip `/tasks/task-contract` "hạn T4 07/10", "214 / 20.000 ký tự"; sửa nội dung → sau 1 s chân "Sửa lúc 14:05 hôm nay · tự lưu"; Ghim → "Đã ghim · 3", `aria-pressed="true"`; "+ Ghi chú" → gõ → `/notes/{uuid}`, con trỏ vẫn trong ô nội dung, "Tất cả · 7"; "Xóa ghi chú" → "Xóa ghi chú này?"; không cuộn ngang. `pnpm lint` 0, `tsc -b` 0, `pnpm test` 637/637 (75 file), `pnpm build` 0. File kiến thức 20.5–20.7 + `.docx`, `genoffice docs check` 0 lỗi.
  - **Acceptance criteria:** spec `notes-screen` *Danh sách ghi chú*, *Lọc và tìm ghi chú*, *Ô soạn một ghi chú*, *Sửa và tự lưu*, *Ghi chú mới*, *Ghim và xóa* ở 1440 px.

- [ ] 2.2 **NT-03 — Tablet và mobile, trạng thái**
  - **Thực hiện:** hai cột ở 768–1279 px; dưới 768 px hai trang (`MobileNotes`, `MobileNoteEditor`), ô tìm trên mobile mở bằng nút tìm; đang tải, không tải được, chưa có ghi chú.
  - **Acceptance criteria:** phần mobile của *Ô soạn một ghi chú*, *Trạng thái của trang Ghi chú*.

## 3. Nghiệm thu (để sau, theo ý người dùng)

- [ ] 3.1 **NT-04 — Nghiệm thu, tài liệu, archive** (đủ cỡ × 2 theme, ảnh so với canvas).
