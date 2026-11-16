# Phase 4 · F15 — Ghi chú (lõi, ghi chú độc lập; chữ và sơ đồ) · Technical Design

> Mode: **HYBRID**: backend và frontend AUTO; quyết định kiến trúc do người dùng chốt. Buổi brainstorm 2026-10-12 (phiên sino-api-11): người dùng chọn phạm vi "độc lập trước", "kiểm phiên bản", hướng "version trong JSON", duyệt thiết kế backend ("duyệt"), tách ghi chú dạng sơ đồ ra sau F15, rồi khi đối chiếu với màn web đã dựng thì chọn "nội dung bắt buộc" (theo D-202) và "trả đủ nội dung, tìm trên trình duyệt" (theo D-205). **Cập nhật 2026-10-19** (phiên mới, sau câu "phần ghi chú chưa có tính năng lưu DB"): người dùng chọn lưu **cả ghi chú chữ lẫn ghi chú sơ đồ** trong change này, cột `kind` + `diagram jsonb` trên bảng `note`; D-171 (sơ đồ là change riêng) bị thay, thêm D-179.
> Song song: sino-api-27 (F10, f05b backend), sino-api-94 (planner), sino-web-37 (màn Ghi chú `fe-ui-notes`, đang bàn ghi chú dạng sơ đồ với người dùng). Đã thống nhất: số quyết định D-170…D-179; task BE-90…BE-99 / FE-90…FE-99; migration lấy số kế tiếp trên `dev` lúc viết (báo hai phiên backend trước); FE-90 do phiên này làm, thứ tự commit trên `features/notes/**` báo qua lại với sino-web-37; build trong git worktree riêng. (2026-10-19: phiên sino-api-11 đã kết thúc và phiên mới làm tiếp; DG-01…DG-04 của phiên web đã xong. Chỗ nào ghi "báo … trước" thì nghĩa là: đọc `PROJECT_STATE.md` xem ai đang giữ file hay số V, và báo người đó nếu họ còn giữ.)
> Nguồn: `openspec/changes/planner-from-messages` (D-28, D-29, spec đích `notes`, mô hình dữ liệu phác thảo), hợp đồng dữ liệu trong `fe-ui-notes/design.md` (D-200…D-205, `notes.types.ts`), canvas "Sino UI" (`Notes`, `MobileNotes`, `MobileNoteEditor`).

## Context

- Web (2026-10-12, `fe-ui-notes` NT-01…NT-03): màn Ghi chú dựng xong trên dữ liệu mẫu: danh sách theo nhóm "ĐÃ GHIM" / "GẦN ĐÂY", lọc Tất cả / Gắn tin nhắn / Đã ghim, tìm không dấu trên trình duyệt, ô soạn tự lưu sau 600 ms, ghi chú mới chỉ được tạo khi có nội dung, ghim, xóa (hỏi trước). Ô soạn đọc ghi chú từ danh sách (`useNote` tìm trong `useNotes`), không có request riêng cho một ghi chú. `notes.api.ts` là chỗ duy nhất đổi khi nối API.
- Web (2026-10-17, `fe-ui-diagram-notes` DG-01…DG-04): cùng màn và cùng danh sách còn có ghi chú loại sơ đồ: `NoteItem` có `kind` (`TEXT` / `DIAGRAM`) và `diagram` (khối + đường nối, D-211); vùng vẽ React Flow tự lưu cả sơ đồ qua `saveNote`, sơ đồ mới chỉ được tạo ở thay đổi đầu tiên (D-209). Tất cả vẫn trên dữ liệu mẫu.
- Backend: chưa có module `notes` trên `dev`; bản WIP của BE-90 (ghi chú chữ: `Note`, `NoteService`, V20, test) nằm ở `origin/wip/be-90-notes` (`f43fdd6`), chưa kiểm chứng. Quy ước sẵn có: JPA cho aggregate (`planner/domain/Task`, `account/domain/ConnectedAccount`: UUIDv7 bằng `@UuidGenerator`, `@Version`, `user_id` khóa ngoại tới `app_user`), `CurrentUser.requireOwnerId()`, `Clock` là bean, lỗi qua `SinoException` + `ErrorCode` theo Problem Details; `OptimisticLockingFailureException` → `409 CONCURRENT_MODIFICATION` (`common/web/GlobalExceptionHandler`); chặn ký tự NUL bằng Bean Validation (`planner/api/Texts`).
- Planner đang trả lời mọi lệnh sửa theo kiểu bản lưu sau thắng (không có `version` trong API); `@Version` chỉ bắt hai transaction cùng lúc.

## Goals / Non-Goals

**Goals:**
- Ghi chú lưu thật trong Sino; tải lại trang không mất gì.
- Không bao giờ mất chữ âm thầm khi cùng một ghi chú được sửa ở hai nơi (tab cũ, điện thoại và máy tính).
- Màn web đã dựng chạy trên API mà không đổi cách dùng.
- Ghi chú dạng sơ đồ cũng lưu thật, tải lại không mất khối nào (D-179). Không chặn bước tiếp theo: gắn tin nhắn.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-170 — Ghi chú độc lập trước; gắn tin nhắn đợt sau · **Accepted** (người dùng, 2026-10-12)
Đợt này: tạo, sửa (tự lưu), ghim, xóa, tìm, lọc; mọi ghi chú không có neo. Gắn với thư / cuộc trò chuyện / người làm sau, khi định danh nhóm cuộc trò chuyện của `f05b-merged-threads` (D-180…D-187) đã ổn: neo vào cuộc trò chuyện nào khi một thread nằm ở nhiều tài khoản là câu hỏi của đợt đó.
**Phương án bị loại:** độc lập + gắn thư ngay (sửa `features/inbox/**` và module `conversation` mà f05b đang sửa, neo theo định danh đang đổi); đầy đủ như canvas (thêm neo vào người và việc liên quan, chưa có màn người, việc chưa có nguồn).

### D-171 — ~~Ghi chú dạng sơ đồ là change riêng (F15b), sau F15~~ → lưu sơ đồ cùng F15 · **Thay thế bởi D-179** (người dùng, 2026-10-19)
**Làm khác kế hoạch (2026-10-19):** ~~F15b là change riêng, làm sau F15~~ → phần lưu sơ đồ nằm trong F15 (D-179). **LÝ DO:** giao diện sơ đồ đã dựng xong trên dữ liệu mẫu (`fe-ui-diagram-notes`, DG-01…DG-04) và người dùng báo "phần ghi chú chưa có tính năng lưu DB"; lưu ghi chú chữ mà để sơ đồ mất khi tải lại là cùng một lỗi. Hướng "sơ đồ là một loại ghi chú" mà D-171 chờ đã được chốt (D-206 của `fe-ui-diagram-notes`), nên không còn lý do tách.
Nội dung gốc 2026-10-12 (giữ lại để biết đã nghĩ gì):
Người dùng muốn "note dạng giống diagram: tạo ô note và kéo nối đến các ô khác". Làm sau khi F15 xong, brainstorm khi mở. Đây là **mở rộng phạm vi** so với D-28 (đã loại "sổ ghi chú đa năng" vì lớn); canvas "Sino UI" chưa có màn này nên phải thiết kế trước khi dựng.
Phiên web sino-web-37 đang bàn với người dùng hướng "sơ đồ là một **loại** ghi chú (`kind`: `TEXT` / `DIAGRAM`) nằm trong danh sách Ghi chú". F15 không chặn hướng đó: cột `kind` mặc định `TEXT` và bảng khối / đường nối là thay đổi cộng thêm; ràng buộc "nội dung bắt buộc" khi đó chỉ áp cho `TEXT`.
**Phương án bị loại:** thiết kế cả hai bây giờ rồi làm F15 trước (lâu mới có code); gộp vào F15 (change lớn, lâu mới nghiệm thu được).

### D-172 — Kiểm phiên bản khi lưu: `version` nằm trong JSON, lệch → `409` · **Accepted** (người dùng, 2026-10-12)
Mỗi ghi chú trả về có `version`. `PATCH /api/notes/{id}` bắt buộc gửi `version` đã đọc; khác `version` hiện tại thì máy chủ trả `409 CONCURRENT_MODIFICATION` và không ghi gì. Web dừng tự lưu cho ghi chú đó và để người dùng chọn (D-178).
**LÝ DO:** ô soạn tự lưu cả nội dung mỗi lần ngừng gõ. Một tab cũ để mở, khi người dùng gõ thêm một chữ, sẽ ghi đè và xóa âm thầm đoạn vừa sửa ở nơi khác.
**Phương án bị loại:** bản lưu sau thắng như Việc cần làm (mất chữ âm thầm); ETag / `If-Match` → `412` (đường lỗi mới, web phải đọc và gửi header, mục trong danh sách không mang ETag riêng).

### D-173 — Danh sách trả đủ nội dung; tìm và lọc ở trình duyệt · **Accepted** (người dùng, 2026-10-12; giữ D-205 của `fe-ui-notes`)
`GET /api/notes` trả mọi ghi chú của chủ với cả `body`, sửa gần nhất trước; không có `?q=`, không phân trang. Web nhóm, lọc, tìm không dấu như đã làm.
**Làm khác lúc trình bày:** ~~hướng 1: danh sách trả 300 ký tự đầu (`preview`), tìm `?q=` bằng `ILIKE` ở máy chủ, ô soạn tải `GET /api/notes/{id}`~~ → đủ nội dung, tìm ở trình duyệt. **LÝ DO:** lúc trình bày chưa biết màn web đã dựng xong theo hợp đồng này (ô soạn đọc từ danh sách, tìm không dấu ngay trên trình duyệt); ghi chú thật thường ngắn (500 ghi chú × khoảng 500 ký tự ≈ 250 KB), con số 20.000 ký tự mỗi ghi chú là trường hợp xấu nhất; `ILIKE` không tìm được khi gõ không dấu, làm ở máy chủ phải thêm extension `unaccent`.
**Khi nào đổi:** danh sách quá lớn để tải một lần, hoặc khi có F11 (Full Text Search). Khi đó thêm `?q=` (không dấu) và phân trang, danh sách trả đoạn đầu.

### D-174 — Nội dung bắt buộc, tiêu đề tùy chọn · **Accepted** (người dùng, 2026-10-12; = D-202 của `fe-ui-notes`)
`body` phải có ít nhất một ký tự không phải khoảng trắng; `title` trống (hoặc chỉ khoảng trắng) lưu và trả là `null`, thẻ lấy dòng đầu của nội dung.
**Làm khác lúc trình bày:** ~~hợp lệ khi có tiêu đề hoặc nội dung~~ → nội dung bắt buộc. **LÝ DO:** D-202 đã được người dùng duyệt và web dựng theo (ghi chú bị xóa hết nội dung thì không lưu, báo "Ghi chú cần có nội dung"); khớp spec đích `notes` của `planner-from-messages`.

### D-175 — Ghim không phải một lần sửa · **Accepted** (agent đề xuất, người dùng duyệt trong thiết kế backend)
`updated_at` chỉ đổi khi tiêu đề hoặc nội dung đổi giá trị; "Sửa lúc …" và thứ tự "sửa gần nhất trước" không nhảy khi ghim. Ghim vẫn tăng `version` (một tab cũ ghim rồi tự lưu sẽ gặp `409`, đúng ý D-172). Giống cách mẫu của web (NT-01).

### D-176 — Xóa hẳn, không cần `version` · **Accepted** (agent đề xuất, người dùng duyệt)
`DELETE /api/notes/{id}` → `204`; ghi chú không còn thì `404 NOTE_NOT_FOUND`. Web luôn hỏi "Xóa ghi chú này?" trước.
**Phương án bị loại:** xóa mềm / thùng rác (chưa có màn); xóa phải gửi `version` (người dùng đã xác nhận trên màn đang xem, xóa nhầm do bản cũ rất khó xảy ra).

### D-177 — Giữ hình dạng hợp đồng; chưa có cột neo · **Agent chốt** (như D-150 của planner)
API trả `anchor: null`, `quote: null`, `linked: []` cho mọi ghi chú, đúng `NoteItem` của `fe-ui-notes`; bảng chưa có cột neo.
**Phương án bị loại:** thêm cột neo trống ngay (không ai ghi; neo theo cuộc trò chuyện hay nhóm của f05b chỉ rõ ở đợt gắn tin nhắn).

### D-178 — Web: xung đột, lỗi lưu, phần chưa có dữ liệu · **Agent chốt** (frontend AUTO)
- **`409`:** tự lưu dừng cho ghi chú đó, chữ đang gõ giữ nguyên trong ô soạn. Đầu ô soạn hiện "Ghi chú này vừa được sửa ở nơi khác. Chữ bạn đang gõ chưa được lưu." với hai nút: "Tải bản mới" (đọc lại danh sách, ô soạn nhận bản của máy chủ) và "Lưu bản của tôi" (đọc lại danh sách để lấy `version` mới rồi lưu chữ đang gõ).
- **`404` khi lưu** (đã bị xóa ở nơi khác): "Ghi chú này đã bị xóa ở nơi khác." với "Lưu thành ghi chú mới" (tạo ghi chú mới từ chữ đang gõ) và chữ vẫn còn.
- **Lỗi khác** (mạng, `5xx`): "Không lưu được thay đổi." với "Thử lại"; lần ngừng gõ sau tự thử lại. Tạo ghi chú mới lỗi: ở lại `/notes/new`, chữ còn. Ghim / xóa lỗi: trả lại như cũ và báo tại chỗ.
- **Danh sách đọc lại** (về tab, sau khi lưu): ô soạn không thay chữ đang gõ; chỉ nhận bản mới của máy chủ khi không có thay đổi chưa lưu.
- **Ẩn khi chưa có dữ liệu:** "Thêm thao tác" (chưa có thao tác nào, như FE-70 với việc); chip "Gắn tin nhắn" và dòng nguồn "Ghi chú độc lập" khi không ghi chú nào có neo (lúc đó mọi ghi chú đều độc lập, hiện ra chỉ là nhiễu). Khi đợt gắn tin nhắn có neo thật, chúng tự hiện lại.
**Phương án bị loại:** chỉ có "Tải bản mới" (người vừa gõ một đoạn dài phải tự chép ra); luôn hiện "Gắn tin nhắn · 0" và "Ghi chú độc lập" trên mọi thẻ như canvas.

### D-179 — Ghi chú sơ đồ lưu trong bảng `note`: cột `kind` và `diagram jsonb` · **Accepted** (người dùng, 2026-10-19: "cột kind + diagram jsonb trên bảng note")
Bảng `note` thêm `kind` (`TEXT` / `DIAGRAM`, không đổi sau khi tạo) và `diagram jsonb` (có khi `DIAGRAM`, `NULL` khi `TEXT`). Cả sơ đồ (khối + đường nối, hợp đồng D-211, mã do web tạo) lưu một lần và **thay toàn bộ** mỗi lần sửa, cùng `version` của ghi chú; không có API riêng cho từng khối. Ràng buộc "nội dung bắt buộc" của D-174 chỉ áp cho `TEXT`; ghi chú sơ đồ có `body` rỗng.
**LÝ DO:** web luôn gửi và nhận cả sơ đồ (tự lưu thay toàn bộ, D-210) và không có truy vấn nào cần một khối riêng; một cột jsonb giữ sơ đồ nhất quán trong một lần ghi, và dùng chung `version`, `409`, ghim, xóa, danh sách với ghi chú chữ.
**Phương án bị loại:** bảng `note_block` và `note_link` (điều D-171 cũ nghĩ tới): nhiều bảng, nhiều lệnh mỗi lần lưu, sơ đồ có thể dở dang khi lỗi giữa chừng, mà chưa ai cần truy vấn theo khối. Tách sau nếu F11 (tìm toàn văn) cần tìm trong khối.

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Đếm ký tự** như web: `String.length()` của Java (UTF-16), cùng cách `maxLength` và `.length` của trình duyệt; CHECK của database dùng `char_length` (số code point, không bao giờ lớn hơn), nên Bean Validation luôn chặn trước.
- **Nội dung giữ nguyên như gõ** (khoảng trắng, xuống dòng); chỉ kiểm có chữ. **Tiêu đề bỏ khoảng trắng hai đầu**, trống thì `null`.
- **Ký tự NUL** trong tiêu đề / nội dung → `400 VALIDATION_FAILED` (PostgreSQL không nhận NUL, nếu không sẽ thành `500`), như planner.
- **Kiểm `version`** trong service: đọc ghi chú của chủ, khác `version` gửi lên thì ném `OptimisticLockingFailureException` → handler sẵn có trả `409 CONCURRENT_MODIFICATION`. Hai lệnh cùng lúc với cùng `version` thì `@Version` của JPA bắt ở lúc commit, cũng ra `409`.
- **`PATCH` không đổi gì** (cùng giá trị) không tăng `version`, không đổi `updated_at`.
- **Thứ tự danh sách:** `updated_at DESC, id DESC` (ID UUIDv7 giữ thứ tự ổn định khi trùng giờ).
- **Ghi chú của người khác** → `404 NOTE_NOT_FOUND` ở mọi lệnh, không có trong danh sách.
- **Luật của sơ đồ** (D-179; đặt trong `Diagram` của domain, API gọi lại): 1…300 khối và 0…600 nối; mã khối và mã nối là UUID, không trùng trong sơ đồ; `x`, `y` là số hữu hạn; chữ khối 0…2.000 ký tự; `label` của nối là `null` hoặc tối đa 80 ký tự; `color` và `fromSide` / `toSide` đúng tập của D-211; `from` và `to` là mã hai khối **khác nhau** có trong sơ đồ; mỗi cặp (`from`, `to`) tối đa một nối; không có ký tự NUL. Đếm ký tự như ghi chú chữ (UTF-16). Sai → `400 VALIDATION_FAILED`, không ghi gì.
- **Loại và trường:** `POST` thiếu `kind` là `TEXT`; `TEXT` cần `body` và không có `diagram`; `DIAGRAM` cần `diagram` và không có `body` (`body` khác `null` là lỗi). `PATCH`: `body` chỉ cho `TEXT`, `diagram` chỉ cho `DIAGRAM`; gửi sai loại → `422 NOTE_KIND_MISMATCH` (mã mới, kiểm trước `version`, không ghi gì). `kind` không có trong `PATCH`.
  **Làm khác lúc trình bày (BE-90, 2026-10-19):** ~~`400 VALIDATION_FAILED` cho `PATCH` sai loại~~ → `422 NOTE_KIND_MISMATCH`. **LÝ DO:** lỗi này phụ thuộc loại đã lưu của ghi chú chứ không phải hình dạng của request; ở app này `400 VALIDATION_FAILED` chỉ đến từ Bean Validation trên request, còn "request đúng dạng nhưng trái luật nghiệp vụ" là nhóm `INVALID` (`422`) của `ErrorCategory`. `POST` có `body` cho sơ đồ hay `diagram` cho ghi chú chữ thì vẫn `400` (sai ngay trong request, kiểm được không cần đọc ghi chú nào).
- **`updated_at` và sơ đồ:** đổi khi tiêu đề, nội dung hoặc sơ đồ đổi giá trị. So sánh theo nội dung, không theo tham chiếu: web gửi lại cả sơ đồ mỗi lần tự lưu, nên gửi lại y nguyên thì không tăng `version`, không đổi `updated_at`.
- **jsonb:** `@JdbcTypeCode(SqlTypes.JSON)` như `AccountCredential.scopes`. Sơ đồ là các record lồng nhau nên BE-90 có test lưu rồi đọc lại trên PostgreSQL thật; nếu Hibernate không map được thì chuyển đổi bằng `JsonMapper` của app.
- **Cỡ:** trường hợp xấu nhất khoảng 0,8 MB mỗi sơ đồ (300 khối × 2.000 ký tự và 600 nối); không thêm giới hạn riêng.

## Backend design

### 1. Module và package

```text
dev.sino.notes
  api/             NotesController, CreateNoteRequest, UpdateNoteRequest, NoteResponse, NotesResponse
  application/     NoteService, NewNote, NoteChange
  domain/          Note (JPA), NoteKind, Diagram (record cùng DiagramBlock, DiagramLink, Side, BlockColor), NotesErrorCode
  infrastructure/  NoteRepository (Spring Data JPA)
```

Không export gì cho module khác. Phụ thuộc: `identity` (`CurrentUser`), `common`. `ModularityTests` thấy module mới.

### 2. Dữ liệu (migration `notes_create_note`, số kế tiếp trên `dev`)

```text
note
  id          uuid PK (UUIDv7, Hibernate)
  user_id     uuid NOT NULL FK app_user
  kind        varchar(10) NOT NULL DEFAULT 'TEXT'   TEXT | DIAGRAM, không đổi sau khi tạo
  title       varchar(200)            NULL: không có tiêu đề
  body        text NOT NULL           DIAGRAM: ''
  diagram     jsonb                   TEXT: NULL; DIAGRAM: cả sơ đồ (D-179)
  pinned      boolean NOT NULL DEFAULT false
  created_at  timestamptz NOT NULL
  updated_at  timestamptz NOT NULL
  version     bigint NOT NULL
```

CHECK: `kind IN ('TEXT', 'DIAGRAM')`; `char_length(body) <= 20000`; `title IS NULL OR btrim(title) <> ''`; theo loại: `kind = 'TEXT'` thì `diagram IS NULL AND btrim(body) <> ''`, `kind = 'DIAGRAM'` thì `diagram IS NOT NULL AND jsonb_typeof(diagram) = 'object' AND body = ''`. Index `note (user_id, updated_at DESC)`. Cấu trúc bên trong `diagram` do ứng dụng kiểm (luật ở Chốt kỹ thuật), database chỉ giữ sàn ở trên.

### 3. Ghi chú (`NoteService`, `/api/notes`)

| Lệnh | Hành vi |
|---|---|
| `GET /api/notes` | `{ generatedAt, notes }`: mọi ghi chú của người gọi, đủ nội dung (ghi chú sơ đồ kèm cả sơ đồ), sửa gần nhất trước |
| `GET /api/notes/{id}` | một ghi chú (đích của `Location`) |
| `POST /api/notes` | `{ kind?, title?, body?, diagram? }`: ghi chú chữ `{ title?, body }` (như trước), sơ đồ `{ kind: 'DIAGRAM', title?, diagram }` → `201` + `Location` + ghi chú, `pinned: false` |
| `PATCH /api/notes/{id}` | `{ version, title?, body?, pinned?, diagram? }`, ít nhất một trong bốn trường sau; trường thiếu hoặc `null` là giữ nguyên; `title: ""` là bỏ tiêu đề; `diagram` thay toàn bộ sơ đồ; `body` chỉ cho ghi chú chữ, `diagram` chỉ cho sơ đồ; `version` lệch → `409` |
| `DELETE /api/notes/{id}` | `204` |

`NoteResponse`: `{ id, kind, title, body, diagram, pinned, createdAt, updatedAt, version, anchor: null, quote: null, linked: [] }` (`diagram` là `null` với ghi chú chữ, `body` là `''` với sơ đồ).

Lỗi: `400 VALIDATION_FAILED` (nội dung trống / quá dài, tiêu đề quá dài, NUL, thiếu `version`, `PATCH` rỗng, sơ đồ sai luật, `POST` có `body` cho sơ đồ hoặc `diagram` cho ghi chú chữ); `422 NOTE_KIND_MISMATCH` (`PATCH` có `body` cho sơ đồ hoặc `diagram` cho ghi chú chữ); `400` ID không phải UUID; `401`; `403 CSRF_TOKEN_INVALID`; `404 NOTE_NOT_FOUND`; `409 CONCURRENT_MODIFICATION`.

## Web design (FE-90)

- `notes.api.ts` gọi API thật: `fetchNotes` → `GET /api/notes`; `createNote` → `POST`; `saveNote(note, change)` → `PATCH` với `note.version` (gửi `diagram` khi `change.diagram` có); `deleteNote` → `DELETE`. `createNote` gửi `kind` và `diagram` cho sơ đồ (không gửi `body`). `NoteItem` thêm `version: number`.
- `useNotes`: bỏ `staleTime: Infinity` của dữ liệu mẫu (giữ mặc định của app). Mutation lưu: thành công thì thay ghi chú trong cache (kể cả `version` mới); `409` / `404` / lỗi khác thành trạng thái của ô soạn (D-178).
- `NoteEditor`: giữ chữ đang gõ khi danh sách đọc lại (D-178); dòng báo xung đột / đã xóa / lỗi lưu ở đầu ô soạn (desktop) và trên trang soạn (điện thoại).
- Vùng vẽ sơ đồ: tự lưu (D-210) đi qua cùng `useSaveNote`, gửi cả `diagram` và `version`; `409` / `404` / lỗi khác dùng chung dòng báo của D-178, ở đầu vùng vẽ (desktop) và trên trang (điện thoại). "Tải bản mới" nạp lại sơ đồ của máy chủ (vùng vẽ dựng lại từ bản mới), "Lưu bản của tôi" lưu sơ đồ đang vẽ lên `version` mới. Danh sách đọc lại không thay sơ đồ đang vẽ khi còn thay đổi chưa lưu.
- Ẩn "Thêm thao tác"; ẩn chip "Gắn tin nhắn" và dòng nguồn khi không ghi chú nào có neo (hàm thuần trong `format.ts`).
- Test: fixture như API trả, MSW cho `/api/notes`; test cũ trên dữ liệu mẫu giữ nguyên bằng các hàm mẫu (như `test/tasksSampleApi.ts` của FE-70).

## Testing

| Tầng | Nội dung |
|---|---|
| Domain (viết test trước) | `Note`: tạo (nội dung trống / chỉ khoảng trắng / 20.000 / 20.001 ký tự, tiêu đề trống → `null`, bỏ khoảng trắng), sửa đổi `updated_at` chỉ khi giá trị đổi, ghim không đổi `updated_at`; theo loại (chữ không có sơ đồ, sơ đồ không có chữ, sửa sơ đồ y nguyên không đổi gì); `Diagram` (bảng): từng luật của D-179 (không khối, 301 khối, 601 nối, nối tới khối không có, tự nối, trùng cặp, mã trùng, chữ quá dài, NUL, màu / cạnh lạ, tọa độ vô hạn) |
| Service + database (Testcontainers PostgreSQL 18, `Clock` cố định) | mỗi lệnh; CHECK của database (nội dung trống, quá dài, tiêu đề trống); `version` lệch → `409` và không ghi; hai lệnh cùng `version` cùng lúc → một `409`; chủ sở hữu khác → `404`; thứ tự danh sách; `PATCH` không đổi gì giữ `version`; sơ đồ lưu rồi đọc lại đúng từng khối và nối (jsonb), CHECK của database theo `kind` (sơ đồ có chữ, ghi chú chữ có sơ đồ, `kind` lạ), `PATCH` thay toàn bộ sơ đồ và tăng `version`, `version` lệch → `409` và sơ đồ cũ còn nguyên |
| API (`MockMvc`) | mỗi endpoint: `201` + `Location`, `200`, `204`, `400` từng lỗi ô (cả NUL, `PATCH` rỗng, thiếu `version`), `401`, thiếu CSRF, `404`, `409`; JSON khớp `NoteItem` + `version`; sơ đồ: `POST` `201` và `PATCH` `200`, `400` từng lỗi sơ đồ và sai trường ở `POST`, `422 NOTE_KIND_MISMATCH` sai trường ở `PATCH` (`body` cho sơ đồ, `diagram` cho ghi chú chữ), JSON `diagram` khớp D-211 |
| Web | adapter (`notes.api.test.ts`); màn trên API với MSW: tải, tạo, tự lưu gửi `version`, `409` → dòng báo + "Tải bản mới" / "Lưu bản của tôi", `404` → "Lưu thành ghi chú mới", lỗi mạng → "Thử lại", ghim / xóa lỗi trả lại; ẩn "Thêm thao tác" và phần neo; sơ đồ: tạo (`POST` ở thay đổi đầu tiên), tự lưu gửi `diagram` và `version`, `409` → dòng báo trên vùng vẽ, "Tải bản mới" dựng lại vùng vẽ từ bản máy chủ, lỗi mạng → "Thử lại" và sơ đồ còn nguyên |
| Trình duyệt thật | FE-90: backend thật trong worktree (cổng riêng, PostgreSQL tạm), 1440 và 390, ghi chú chữ và sơ đồ; hai tab cùng một ghi chú để thấy `409` |
| Cổng | backend `./mvnw -B -ntp verify` trong worktree riêng; web `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` |

Kiểm bằng lỗi gài (mutation): không cho từng task; một lần cho `Note` (quy tắc sửa / ghim / `version`) và một lần cho `Diagram` (luật kiểm) ở BE-90.

## Risks / Trade-offs

- [Tải mọi ghi chú kèm nội dung mỗi lần mở trang] → chấp nhận cho một người dùng (D-173); đổi sang tìm ở máy chủ + phân trang khi lớn lên hoặc có F11.
- [Hai tab cùng có thay đổi chưa lưu] → tab lưu sau gặp `409`, chữ còn trong ô soạn, người dùng chọn "Tải bản mới" hay "Lưu bản của tôi"; không tự gộp.
- [Delta `module-boundaries` sửa cùng requirement với `f16-f17-tasks-calendar`] → delta này ghi cả `planner` lẫn `notes`; change nào archive sau phải chứa cả hai module (báo sino-api-94).
- [Delta `notes-screen` sửa spec chưa archive] → archive sau `fe-ui-notes` (NT-04) và `fe-ui-diagram-notes` (DG-05).
- [Danh sách trả kèm mọi sơ đồ] → mỗi sơ đồ tối đa khoảng 0,8 MB, thường vài chục KB; chấp nhận cho một người dùng (D-173). Khi lớn lên thì danh sách chỉ trả tóm tắt sơ đồ (số khối, số nối) và sơ đồ đọc riêng bằng `GET /api/notes/{id}`.
- [Hibernate lưu record lồng nhau vào jsonb] → test lưu rồi đọc lại ở BE-90 trên PostgreSQL thật; không map được thì chuyển đổi bằng `JsonMapper` của app (Spring Boot 4 dùng Jackson 3).
- [V20 của nhánh WIP viết cho ghi chú chữ: CHECK `btrim(body) <> ''` từ chối sơ đồ] → viết lại thẳng V20 vì chưa vào `dev`; nếu một database đã chạy V20 từ nhánh WIP thì dùng V21 thêm cột `kind` / `diagram`, không sửa V20.
- [Thứ tự commit trên `features/notes/**` với phiên web] → đọc `PROJECT_STATE.md` trước khi sửa; DG-01…DG-04 đã xong, DG-05 (nghiệm thu) còn để người dùng quyết.
- [File kiến thức Phase 4 do planner đang giữ] → báo sino-api-94 trước khi thêm mục F15.

## Migration Plan

- Kiểm số V cao nhất trên `dev`, báo sino-api-27 và sino-api-94, rồi mới viết migration (luật đã thống nhất). Chạy trên Testcontainers trong worktree riêng; database của người dùng nhận migration khi app chạy từ `dev`. V20 của nhánh `origin/wip/be-90-notes` (`f43fdd6`) chưa vào `dev` nên viết lại thẳng cho `kind` / `diagram` (D-179), sau khi xác nhận `dev` vẫn dừng ở V19.
- Rollback: bảng mới, không module nào đọc; bỏ được bằng một migration xóa bảng nếu cần.

## Definition of Done

- [ ] Scenario của spec `notes` và delta `notes-screen` chạy đúng, cho cả ghi chú chữ lẫn sơ đồ; JSON khớp hợp đồng `NoteItem` (+ `kind`, `diagram`) + `version`.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` thấy `notes`.
- [ ] Web: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh; Chrome thật 1440 + 390 trên backend thật, có ca hai tab.
- [ ] README (API mới), mục F15 trong file kiến thức Phase 4 + `.docx` (`genoffice docs check`).
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có **LÝ DO**; `PROJECT_STATE.md` cập nhật; archive sau `fe-ui-notes`.
