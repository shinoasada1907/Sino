# Màn Ghi chú với dữ liệu mẫu (UI trước) · Technical Design

> Mode: **HYBRID**, frontend AUTO. Người dùng 2026-10-12: "tiếp theo là UI phần ghi chú", rồi duyệt thiết kế trình bày trong chat ("duyệt"): D-200…D-202 là **người dùng duyệt**; D-203…D-205 là agent chốt trong phạm vi đó, ghi phương án bị loại để người dùng xem lại.
> Thiết kế giao diện: canvas "Sino UI", bản sao `design/sino-ui/project/`: `Notes` (+ `NotesLight`), `MobileNotes` (+ `MobileNotesLight`), `MobileNoteEditor` (+ `MobileNoteEditorLight`). Đối chiếu link ngày 2026-10-12: phiên bản `1790948862-287a`, trùng bản sao.
> Phạm vi sản phẩm: `openspec/changes/planner-from-messages` (D-28, spec `notes`: nội dung ≤ 20.000 ký tự, neo tin nhắn / cuộc trò chuyện / người, neo không còn, lọc Tất cả / Gắn tin nhắn / Đã ghim, tìm theo nội dung).

## Context

- Roadmap Phase 4, F15: "trang Ghi chú; panel 'Việc và ghi chú' trong cuộc trò chuyện; bôi đen đoạn tin → Ghi chú". Backend (module `notes`) chưa có; `/notes` là trang "đang được dựng"; trên mobile "Ghi chú" nằm trong "Thêm" (`MORE_PATHS`).
- Web đã có: cách làm màn trên dữ liệu mẫu của Việc cần làm trước FE-70 (hàm API trả mẫu, hook ghi kết quả vào cache), bộ lọc trong URL và chọn bằng đường dẫn (Hộp thư, Việc cần làm), `MobilePageHeader`, `Dialog` (hỏi trước khi xóa như `DeleteTaskDialog`), `Input`, `Spec`, `canvasClock`.
- Canvas không vẽ tablet, các trạng thái, ô tìm trên mobile và ghi chú mới.

## Decisions

### D-200 — Phạm vi: danh sách, ô soạn, tạo, sửa, ghim, xóa, tìm, lọc · **Người dùng duyệt** (2026-10-12)
Tạo ghi chú từ một thư và mục "Việc và ghi chú" trong cuộc trò chuyện là change thao tác trên thư; "Thêm thao tác" hiện như canvas nhưng chưa làm gì.
**Phương án bị loại:** làm luôn "bôi đen đoạn trích → Ghi chú" (đụng Hộp thư, cần chọn chữ trong iframe thư HTML; để change riêng).

### D-201 — Hai cột từ 768 px; dưới 768 px hai trang; chọn bằng đường dẫn · **Người dùng duyệt**
- Từ 768 px: danh sách bên trái, ô soạn bên phải (canvas `Notes` chỉ có desktop; tablet dùng cùng bố cục, cột danh sách hẹp hơn). `/notes` chưa chọn ghi chú nào: cột phải ghi "Chọn một ghi chú để xem".
- Dưới 768 px: `/notes` là danh sách (`MobileNotes`, quay lại "Thêm", thanh dưới hiện), `/notes/:noteId` và `/notes/new` là trang soạn (`MobileNoteEditor`, quay lại "Ghi chú", ẩn thanh dưới).
**Phương án bị loại:** chi tiết là trang riêng dưới 1280 px như Việc cần làm (ô soạn cần chỗ; ở 1024 px hai cột vẫn đủ rộng).

### D-202 — Tiêu đề không bắt buộc · **Người dùng duyệt**
`title` có thể trống; thẻ và đầu trang lấy dòng đầu của nội dung khi trống. Nội dung bắt buộc (spec `notes`: không rỗng).

### D-203 — Tự lưu; ghi chú mới chỉ được tạo khi có nội dung · **Agent chốt**
- Sửa tiêu đề hay nội dung thì lưu sau 600 ms ngừng gõ và khi rời ô; chân ô soạn ghi "Sửa lúc {giờ} · tự lưu". Nội dung chặn ở 20.000 ký tự (`maxLength`), đếm "N / 20.000 ký tự".
- "+ Ghi chú" mở `/notes/new` với ô soạn trống; lần lưu đầu có nội dung mới tạo ghi chú, rồi thay đường dẫn bằng `/notes/{id}` (không thêm mục lịch sử). Rời đi khi còn trống thì không có gì được tạo.
- Nội dung bị xóa hết thì không lưu (giữ bản cũ) và báo "Ghi chú cần có nội dung".
**Phương án bị loại:** tạo ngay một ghi chú trống khi bấm "+ Ghi chú" (spec cấm nội dung rỗng, và để lại ghi chú rác); nút "Lưu" (canvas ghi "tự lưu").

### D-204 — Nguồn neo, đoạn trích, việc liên quan · **Agent chốt**
- Thẻ: neo `MESSAGE` của thư → "Thư · {tên}", của chat → "Tin nhắn · {tên}"; `CONVERSATION` → "Cuộc trò chuyện · {tên}"; `PARTICIPANT` → "Người · {tên}"; neo không còn → "Tin nhắn gốc không còn"; không neo → "Ghi chú độc lập". Canvas `MobileNotes` bỏ "Cuộc trò chuyện ·" ở hai thẻ ghim nhưng giữ "Thư ·", "Người ·" ở thẻ khác; dùng chữ của desktop ở mọi cỡ cho nhất quán.
- Ô soạn: chữ nhỏ "Gắn với thư / tin nhắn / cuộc trò chuyện / người" + chip "{tên} · {tiêu đề thư}" mở `/inbox/{conversationId}` (người: chip không có đường dẫn, chưa có màn người); neo không còn: chip "Tin nhắn gốc không còn" không bấm được.
- Đoạn trích: "TRÍCH TỪ THƯ · 09:41 HÔM NAY" (chat: "TRÍCH TỪ TIN NHẮN"), chỉ đọc.
- Việc liên quan: chip mở `/tasks/{id}` với tiêu đề và hạn.

### D-205 — Thứ tự, nhóm, tìm, số trên chip · **Agent chốt**
- "ĐÃ GHIM" rồi "GẦN ĐÂY", trong mỗi nhóm sửa gần nhất trước (spec `notes` của planner). Canvas xếp "Mã khách hàng phòng khám" (Hôm qua) trước "Danh sách mua cho bà" (08:31) trong "ĐÃ GHIM"; theo spec, 08:31 đứng trước. Giờ trên thẻ: hôm nay "09:52", hôm qua "Hôm qua", cũ hơn "29/09" (khác năm "29/09/2025").
- Tìm theo tiêu đề và nội dung, không phân biệt hoa thường và dấu ("thanh toan" thấy "thanh toán"), trong bộ lọc đang chọn; từ khóa nằm trong URL (`q`) như bộ lọc (`filter`).
- Số trên chip ("Tất cả · 6") đếm mọi ghi chú, không theo từ khóa tìm.
**Phương án bị loại:** tìm có phân biệt dấu (người Việt hay gõ không dấu khi tìm); backend làm theo bằng `unaccent` khi có F15 (ghi ở hợp đồng).

## Hợp đồng dữ liệu (template giao backend)

Nguyên tắc như D-42: API trả dữ liệu thô, giao diện tự đổi ra chữ.

```ts
// GET /api/notes: mọi ghi chú của chủ, sửa gần nhất trước
interface NotesData {
  generatedAt: Instant
  notes: NoteItem[]
}

interface NoteItem {
  id: string
  title: string | null                       // ≤ 200; null: thẻ lấy dòng đầu của body (D-202)
  body: string                               // 1…20 000 ký tự
  pinned: boolean
  createdAt: Instant
  updatedAt: Instant
  anchor: NoteAnchor | null                  // null: ghi chú độc lập
  quote: { text: string; at: Instant } | null    // đoạn trích từ tin nhắn neo, chỉ đọc
  linked: { kind: 'TASK'; id: string; title: string; dueAt: Instant | null; dueDate: string | null }[]
}

interface NoteAnchor {
  kind: 'MESSAGE' | 'CONVERSATION' | 'PARTICIPANT'
  provider: ProviderType | null              // dấu nguồn
  conversationKind: 'EMAIL' | 'CHAT' | null  // "Thư" hay "Tin nhắn"; null với PARTICIPANT
  label: string                              // tên người hay tên cuộc trò chuyện
  subject: string | null                     // tiêu đề thư, cho chip ở ô soạn
  conversationId: string | null              // mở Hộp thư; null với PARTICIPANT
  missing: boolean                           // tin nhắn / cuộc trò chuyện gốc không còn trong Sino
}
```

| Giao diện | API dự kiến (F15) |
|---|---|
| danh sách | `GET /api/notes` (tìm `?q=` không dấu, `unaccent`) |
| tạo | `POST /api/notes` `{ title, body }` → `NoteItem` |
| sửa | `PATCH /api/notes/{id}` `{ title?, body?, pinned? }` → `NoteItem` |
| xóa | `DELETE /api/notes/{id}` → `204` |

## Frontend design

```text
src/features/notes/
  notes.types.ts       hợp đồng
  notes.sample.ts      createNotesSample(now): 6 ghi chú như canvas, giờ dời theo đồng hồ
  notes.api.ts         fetchNotes, createNote, saveNote, deleteNote (mẫu; chỗ duy nhất đổi khi nối API)
  useNotes.ts          useNotes, useNote, mutation (sửa cache danh sách)
  format.ts            nhóm, lọc, tìm không dấu, chữ giờ, nguồn neo, đoạn trích, chân ô soạn
  NotesPage.tsx        /notes, /notes/:noteId, /notes/new theo kích thước
  components/*         danh sách, thẻ, ô soạn, hộp xóa, trạng thái
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | nhóm và thứ tự, lọc, tìm không dấu, số trên chip, chữ giờ, nguồn neo, đoạn trích, chân ô soạn; dữ liệu mẫu khớp canvas |
| Component | danh sách, lọc và tìm (URL đổi), chọn ghi chú, sửa và tự lưu, ghi chú mới (tạo khi có nội dung, thay đường dẫn), ghim, xóa (hỏi, quay lại), trang soạn dưới 768 px, trạng thái |
| Trình duyệt thật | Chrome một lượt mỗi task ở các cỡ task đụng tới; đủ cỡ × 2 theme ở nghiệm thu |
| Cổng | `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` |

## Risks / Trade-offs

- [Canvas không có tablet, trạng thái, ghi chú mới, tìm trên mobile] → D-201, D-203 và trạng thái theo Hộp thư / Việc cần làm; ghi ở `tasks.md`.
- [Tự lưu trên dữ liệu mẫu chỉ sống trong phiên trang] → như Việc cần làm trước FE-70; nối API chỉ đổi `notes.api.ts`.

## Definition of Done

- [ ] Scenario của spec `notes-screen` chạy đúng ở các kích thước × 2 theme, có ảnh chụp so với canvas.
- [ ] Hợp đồng dữ liệu và bảng đối chiếu khớp code.
- [ ] `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
