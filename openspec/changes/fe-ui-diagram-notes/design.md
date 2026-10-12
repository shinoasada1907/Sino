# Ghi chú dạng sơ đồ (UI trước, dữ liệu mẫu) · Technical Design

> Mode: **HYBRID**, frontend AUTO; quyết định kiến trúc thuộc TRAINING. Người dùng 2026-10-12 chọn sơ đồ là một loại ghi chú (A), phương án B (màu, chữ trên đường nối), chấm nối 4 cạnh, menu chuột phải "thêm ô", React Flow (A), và đồng ý trang mẫu ("được rồi đó"): D-206…D-208 là **người dùng duyệt**; D-209…D-212 là agent chốt trong phạm vi đó, ghi phương án bị loại để người dùng xem lại.
> Thiết kế giao diện: canvas "Sino UI" chưa có màn này; theo trang mẫu https://claude.ai/artifact/Vczap6hTGKtABxhybY7EGk (bản 2, `1791815972-12fe`) dùng token của canvas, và màn Ghi chú (`Notes`, `MobileNoteEditor`) cho phần đầu, danh sách, chân.
> Số quyết định: D-206…D-215. Task: DG-01…DG-05.

## Context

- Màn Ghi chú trên dữ liệu mẫu đã có (`fe-ui-notes`, NT-01…NT-03): `NoteItem` chữ, danh sách theo nhóm, lọc và tìm trong URL, ô soạn tự lưu, `/notes/new`, `/notes/:noteId`, hai cột từ 768 px.
- F15 (phiên sino-api-11, change `f15-notes`) lên kế hoạch backend cho ghi chú chữ, thêm `version` (409 khi sửa trên bản cũ) và FE-90 đưa màn lên API. Người dùng chọn sơ đồ là change backend riêng sau F15 (F15b).
- Web chưa có thư viện vẽ sơ đồ. Bundle chính đã quá 500 kB (cảnh báo của Vite).

## Decisions

### D-206 — Sơ đồ là một loại ghi chú · **Người dùng duyệt** (2026-10-12, "chọn A đi")
`NoteItem.kind`: `TEXT` | `DIAGRAM`. Một sơ đồ ghim, tìm, xóa như mọi ghi chú. "+ Ghi chú" mở menu "Ghi chú chữ" / "Sơ đồ". Thẻ sơ đồ có dấu sơ đồ và "Sơ đồ · N khối · M nối", đầu nội dung là chữ của vài khối đầu (khối chính trước). Chip lọc thứ tư "Sơ đồ · N". Tìm khớp cả chữ trong các khối.
**Phương án bị loại:** một bản đồ chung cho mọi ghi chú (B: chỉ một bản đồ, không phác thảo được); khối là ghi chú có sẵn (C: lớn nhất, để sau).

### D-207 — Phạm vi vùng vẽ: phương án B · **Người dùng duyệt** ("ok làm phương án B đi")
- Khối: chữ nhiều dòng (sửa tại chỗ: bấm đúp; Enter xong, Shift Enter xuống dòng), khối chính (chữ đậm), 5 màu: mặc định, vàng, xanh lá, đỏ, xanh dương (theo token `warning`, `success`, `danger`, và một màu xanh dương mới cho vùng vẽ).
- Đường nối: mũi tên một chiều, cong, đi ra từ chấm được kéo và vào cạnh của khối đích gần chỗ thả nhất; chữ trên đường nối tùy chọn (bấm đúp vào đường).
- Thêm khối: nút "+ Khối" (giữa màn), bấm đúp vào chỗ trống, chuột phải (nhấn giữ trên điện thoại) vào chỗ trống mở menu "THÊM Ô": Khối chữ, Khối chính, 4 khối màu, "Vừa màn hình".
- Chọn khối hay đường nối: thanh nhỏ phía trên (màu, sửa chữ, xóa / chữ trên đường, xóa); Delete hoặc Backspace xóa; xóa khối xóa cả đường nối của nó.
- Kéo nền, thu phóng bằng cuộn, chụm hai ngón, nút −/+ và "Vừa màn hình"; chân ghi "Sửa lúc … · tự lưu" và "N khối · M đường nối".
**Phương án bị loại:** A (không màu, không chữ trên đường; người dùng chọn B); C (hình dạng, đổi cỡ, gom nhóm: để sau).

### D-208 — Vùng vẽ bằng React Flow, tải riêng · **Người dùng duyệt** ("A đi")
`@xyflow/react` 12.12.0 (MIT, ra 2026-09-24), ghim đúng phiên bản. Khối là node tự vẽ (component của Sino), đường nối là edge tự vẽ (bezier + chữ). Vùng vẽ nằm trong một chunk riêng (`React.lazy`), chỉ tải khi mở một sơ đồ, nên các màn khác không nặng thêm.
**Phương án bị loại:** tự viết bằng React + SVG như trang mẫu (phải tự làm chụm hai ngón, cuộn touchpad, kéo trên điện thoại, bàn phím).

### D-209 — Sơ đồ mới chỉ được tạo khi có thay đổi đầu tiên · **Agent chốt**
"Sơ đồ" mở `/notes/new?kind=diagram`: vùng vẽ có sẵn một khối chính "Ý chính" ở giữa. Thay đổi đầu tiên (thêm khối, kéo, sửa chữ, nối, đặt tên) mới tạo ghi chú và thay đường dẫn bằng `/notes/{id}` (như D-203). Rời đi khi chưa đổi gì thì không có gì được tạo.
**Phương án bị loại:** tạo ngay khi bấm "Sơ đồ" (để lại sơ đồ rác "Sơ đồ mới").

### D-210 — Tự lưu sơ đồ · **Agent chốt**
Mỗi thay đổi (thả khối sau khi kéo, xong sửa chữ, nối, xóa, đổi màu, đổi chữ đường nối) lưu cả sơ đồ sau 600 ms không có thay đổi mới, và khi rời sơ đồ. Đang kéo thì không lưu từng điểm. Vị trí xem (cuộn, thu phóng) không lưu: mở lại là "Vừa màn hình".
**Phương án bị loại:** lưu từng thay đổi nhỏ (nhiều request khi có API); lưu vị trí xem (thêm trường không ai cần ở bản đầu).

### D-211 — Hợp đồng dữ liệu cho F15b · **Agent chốt** (gửi phiên sino-api-11)
Xem mục Hợp đồng dữ liệu. Mã của khối và đường nối do web tạo (UUID), để nối ngay mà không cần chờ máy chủ. Cả sơ đồ được lưu một lần (thay toàn bộ), cùng `version` của F15. Giới hạn: 300 khối, 600 đường nối, chữ khối ≤ 2 000 ký tự, chữ đường nối ≤ 80 ký tự.
**Phương án bị loại:** API riêng cho từng khối / đường nối (nhiều request, khó giữ sơ đồ nhất quán khi lỗi giữa chừng).

### D-212 — Điện thoại và tablet · **Agent chốt**
Như ghi chú chữ: từ 768 px vùng vẽ ở cột phải, dưới 768 px là trang riêng (quay lại "Ghi chú", tên sơ đồ, Ghim; chân có "N khối · M nối" và "Xóa"). Trên điện thoại: chấm nối luôn hiện ở khối đang chọn, menu "THÊM Ô" mở bằng nhấn giữ, thu phóng bằng chụm hai ngón.

## Hợp đồng dữ liệu (template giao F15b)

```ts
type NoteKind = 'TEXT' | 'DIAGRAM'
type Side = 'TOP' | 'RIGHT' | 'BOTTOM' | 'LEFT'
type BlockColor = 'DEFAULT' | 'YELLOW' | 'GREEN' | 'RED' | 'BLUE'

interface NoteItem {
  // … như fe-ui-notes (và version của F15)
  kind: NoteKind
  body: string               // TEXT: 1…20 000 ký tự; DIAGRAM: ''
  diagram: Diagram | null    // DIAGRAM: có; TEXT: null
}

interface Diagram {
  blocks: DiagramBlock[]     // ≥ 1, ≤ 300
  links: DiagramLink[]       // ≤ 600
}

interface DiagramBlock {
  id: string                 // UUID do web tạo
  x: number                  // vị trí góc trên trái trên vùng vẽ (px ở mức thu phóng 100%)
  y: number
  text: string               // 0…2 000 ký tự; trống hiện "Khối mới"
  color: BlockColor
  main: boolean              // khối chính: chữ đậm
}

interface DiagramLink {
  id: string                 // UUID do web tạo
  from: string               // id khối nguồn
  fromSide: Side
  to: string                 // id khối đích, khác from; mỗi cặp (from, to) một đường
  toSide: Side
  label: string | null       // ≤ 80 ký tự
}
```

| Giao diện | API dự kiến (F15b) |
|---|---|
| tạo sơ đồ | `POST /api/notes` `{ kind: 'DIAGRAM', title, diagram }` → `NoteItem` |
| lưu sơ đồ | `PATCH /api/notes/{id}` `{ version, title?, pinned?, diagram? }` → `NoteItem` (thay toàn bộ sơ đồ) |
| danh sách, xóa | như F15 |

Máy chủ kiểm: đường nối trỏ tới khối có trong sơ đồ, không tự nối, không trùng cặp, các giới hạn; sai → `400 VALIDATION_FAILED`.

## Frontend design

```text
src/features/notes/
  notes.types.ts        + NoteKind, Diagram, DiagramBlock, DiagramLink, Side, BlockColor
  notes.sample.ts       + một sơ đồ mẫu ("Kế hoạch chuyến đi Đà Lạt": 7 khối, 6 nối)
  notes.api.ts          createNote / saveNote nhận sơ đồ (mẫu)
  format.ts             thẻ sơ đồ, lọc "Sơ đồ", tìm trong khối, tên mặc định
  diagram/
    diagram.ts          hàm thuần: thêm / di chuyển / sửa / xóa khối, nối (cạnh gần nhất), xóa nối, đếm
    DiagramEditor.tsx   (lazy) React Flow: node, edge, thanh chọn, menu "THÊM Ô", nút thu phóng, tự lưu
    BlockNode.tsx, LinkEdge.tsx, AddMenu.tsx
  NotesPage.tsx         chọn ô soạn chữ hay vùng vẽ theo kind; "+ Ghi chú" có menu
```

## Testing

| Tầng | Nội dung |
|---|---|
| Unit (viết test trước) | `diagram.ts` (thêm, di chuyển, sửa, xóa khối và đường nối của nó, nối với cạnh gần nhất, không tự nối, không trùng, giới hạn), `format.ts` (thẻ, lọc, tìm trong khối, tên mặc định), mẫu |
| Component | menu "+ Ghi chú", chip "Sơ đồ", thẻ sơ đồ, `/notes/new?kind=diagram` (chưa tạo cho tới thay đổi đầu), vùng vẽ hiện khối và chữ đường nối, thanh chọn (màu, xóa), menu "THÊM Ô" thêm khối |
| Trình duyệt thật | kéo, nối, thu phóng, chuột phải, nhấn giữ: chỉ đo được ở Chrome (jsdom không có bố cục) |
| Cổng | `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` (kiểm vùng vẽ ở chunk riêng) |

## Risks / Trade-offs

- [React Flow trong jsdom] → cần giả `ResizeObserver` / `DOMMatrix` trong test; tương tác kéo và nối kiểm ở Chrome, logic nằm trong hàm thuần `diagram.ts` để test được.
- [FE-90 đưa ghi chú chữ lên API trước F15b] → sơ đồ chưa có chỗ lưu ở máy chủ; FE-90 cần ẩn "Sơ đồ" hoặc giữ sơ đồ ở dữ liệu mẫu tới F15b (phiên sino-api-11 chốt với người dùng).
- [Thêm một thư viện] → ghim phiên bản, tải riêng.

## Definition of Done

- [ ] Scenario của spec `diagram-notes` chạy đúng ở 1440 / 1024 / 390 × 2 theme.
- [ ] Hợp đồng dữ liệu khớp code; đã gửi phiên sino-api-11.
- [ ] `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh; vùng vẽ ở chunk riêng.
- [ ] Kiến thức Phase 1 + `.docx`; `tasks.md` tick đủ; `PROJECT_STATE.md` cập nhật.
