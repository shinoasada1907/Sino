# Phase 4 · F15 — Ghi chú (lõi, ghi chú độc lập) · Technical Design

> Mode: **HYBRID**: backend và frontend AUTO; quyết định kiến trúc do người dùng chốt. Buổi brainstorm 2026-10-12 (phiên sino-api-11): người dùng chọn phạm vi "độc lập trước", "kiểm phiên bản", hướng "version trong JSON", duyệt thiết kế backend ("duyệt"), tách ghi chú dạng sơ đồ ra sau F15, rồi khi đối chiếu với màn web đã dựng thì chọn "nội dung bắt buộc" (theo D-202) và "trả đủ nội dung, tìm trên trình duyệt" (theo D-205).
> Song song: sino-api-27 (F10, f05b backend), sino-api-94 (planner), sino-web-37 (màn Ghi chú `fe-ui-notes`, đang bàn ghi chú dạng sơ đồ với người dùng). Đã thống nhất: số quyết định D-170…D-179; task BE-90…BE-99 / FE-90…FE-99; migration lấy số kế tiếp trên `dev` lúc viết (báo hai phiên backend trước); FE-90 do phiên này làm, thứ tự commit trên `features/notes/**` báo qua lại với sino-web-37; build trong git worktree riêng.
> Nguồn: `openspec/changes/planner-from-messages` (D-28, D-29, spec đích `notes`, mô hình dữ liệu phác thảo), hợp đồng dữ liệu trong `fe-ui-notes/design.md` (D-200…D-205, `notes.types.ts`), canvas "Sino UI" (`Notes`, `MobileNotes`, `MobileNoteEditor`).

## Context

- Web (2026-10-12, `fe-ui-notes` NT-01…NT-03): màn Ghi chú dựng xong trên dữ liệu mẫu: danh sách theo nhóm "ĐÃ GHIM" / "GẦN ĐÂY", lọc Tất cả / Gắn tin nhắn / Đã ghim, tìm không dấu trên trình duyệt, ô soạn tự lưu sau 600 ms, ghi chú mới chỉ được tạo khi có nội dung, ghim, xóa (hỏi trước). Ô soạn đọc ghi chú từ danh sách (`useNote` tìm trong `useNotes`), không có request riêng cho một ghi chú. `notes.api.ts` là chỗ duy nhất đổi khi nối API.
- Backend: chưa có module `notes`. Quy ước sẵn có: JPA cho aggregate (`planner/domain/Task`, `account/domain/ConnectedAccount`: UUIDv7 bằng `@UuidGenerator`, `@Version`, `user_id` khóa ngoại tới `app_user`), `CurrentUser.requireOwnerId()`, `Clock` là bean, lỗi qua `SinoException` + `ErrorCode` theo Problem Details; `OptimisticLockingFailureException` → `409 CONCURRENT_MODIFICATION` (`common/web/GlobalExceptionHandler`); chặn ký tự NUL bằng Bean Validation (`planner/api/Texts`).
- Planner đang trả lời mọi lệnh sửa theo kiểu bản lưu sau thắng (không có `version` trong API); `@Version` chỉ bắt hai transaction cùng lúc.

## Goals / Non-Goals

**Goals:**
- Ghi chú lưu thật trong Sino; tải lại trang không mất gì.
- Không bao giờ mất chữ âm thầm khi cùng một ghi chú được sửa ở hai nơi (tab cũ, điện thoại và máy tính).
- Màn web đã dựng chạy trên API mà không đổi cách dùng.
- Không chặn hai bước tiếp theo: gắn tin nhắn và ghi chú dạng sơ đồ (F15b).

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-170 — Ghi chú độc lập trước; gắn tin nhắn đợt sau · **Accepted** (người dùng, 2026-10-12)
Đợt này: tạo, sửa (tự lưu), ghim, xóa, tìm, lọc; mọi ghi chú không có neo. Gắn với thư / cuộc trò chuyện / người làm sau, khi định danh nhóm cuộc trò chuyện của `f05b-merged-threads` (D-180…D-187) đã ổn: neo vào cuộc trò chuyện nào khi một thread nằm ở nhiều tài khoản là câu hỏi của đợt đó.
**Phương án bị loại:** độc lập + gắn thư ngay (sửa `features/inbox/**` và module `conversation` mà f05b đang sửa, neo theo định danh đang đổi); đầy đủ như canvas (thêm neo vào người và việc liên quan, chưa có màn người, việc chưa có nguồn).

### D-171 — Ghi chú dạng sơ đồ là change riêng (F15b), sau F15 · **Accepted** (người dùng, 2026-10-12)
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

### Chốt kỹ thuật (agent, trong phạm vi trên)
- **Đếm ký tự** như web: `String.length()` của Java (UTF-16), cùng cách `maxLength` và `.length` của trình duyệt; CHECK của database dùng `char_length` (số code point, không bao giờ lớn hơn), nên Bean Validation luôn chặn trước.
- **Nội dung giữ nguyên như gõ** (khoảng trắng, xuống dòng); chỉ kiểm có chữ. **Tiêu đề bỏ khoảng trắng hai đầu**, trống thì `null`.
- **Ký tự NUL** trong tiêu đề / nội dung → `400 VALIDATION_FAILED` (PostgreSQL không nhận NUL, nếu không sẽ thành `500`), như planner.
- **Kiểm `version`** trong service: đọc ghi chú của chủ, khác `version` gửi lên thì ném `OptimisticLockingFailureException` → handler sẵn có trả `409 CONCURRENT_MODIFICATION`. Hai lệnh cùng lúc với cùng `version` thì `@Version` của JPA bắt ở lúc commit, cũng ra `409`.
- **`PATCH` không đổi gì** (cùng giá trị) không tăng `version`, không đổi `updated_at`.
- **Thứ tự danh sách:** `updated_at DESC, id DESC` (ID UUIDv7 giữ thứ tự ổn định khi trùng giờ).
- **Ghi chú của người khác** → `404 NOTE_NOT_FOUND` ở mọi lệnh, không có trong danh sách.

## Backend design

### 1. Module và package

```text
dev.sino.notes
  api/             NotesController, CreateNoteRequest, UpdateNoteRequest, NoteResponse, NotesResponse
  application/     NoteService, NewNote, NoteChange
  domain/          Note (JPA), NotesErrorCode
  infrastructure/  NoteRepository (Spring Data JPA)
```

Không export gì cho module khác. Phụ thuộc: `identity` (`CurrentUser`), `common`. `ModularityTests` thấy module mới.

### 2. Dữ liệu (migration `notes_create_note`, số kế tiếp trên `dev`)

```text
note
  id          uuid PK (UUIDv7, Hibernate)
  user_id     uuid NOT NULL FK app_user
  title       varchar(200)            NULL: không có tiêu đề
  body        text NOT NULL
  pinned      boolean NOT NULL DEFAULT false
  created_at  timestamptz NOT NULL
  updated_at  timestamptz NOT NULL
  version     bigint NOT NULL
```

CHECK: `btrim(body) <> ''`; `char_length(body) <= 20000`; `title IS NULL OR btrim(title) <> ''`. Index `note (user_id, updated_at DESC)`.

### 3. Ghi chú (`NoteService`, `/api/notes`)

| Lệnh | Hành vi |
|---|---|
| `GET /api/notes` | `{ generatedAt, notes }`: mọi ghi chú của người gọi, đủ nội dung, sửa gần nhất trước |
| `GET /api/notes/{id}` | một ghi chú (đích của `Location`) |
| `POST /api/notes` | `{ title?, body }` → `201` + `Location` + ghi chú, `pinned: false` |
| `PATCH /api/notes/{id}` | `{ version, title?, body?, pinned? }`, ít nhất một trong ba trường sau; trường thiếu hoặc `null` là giữ nguyên; `title: ""` là bỏ tiêu đề; `version` lệch → `409` |
| `DELETE /api/notes/{id}` | `204` |

`NoteResponse`: `{ id, title, body, pinned, createdAt, updatedAt, version, anchor: null, quote: null, linked: [] }`.

Lỗi: `400 VALIDATION_FAILED` (nội dung trống / quá dài, tiêu đề quá dài, NUL, thiếu `version`, `PATCH` rỗng); `400` ID không phải UUID; `401`; `403 CSRF_TOKEN_INVALID`; `404 NOTE_NOT_FOUND`; `409 CONCURRENT_MODIFICATION`.

## Web design (FE-90)

- `notes.api.ts` gọi API thật: `fetchNotes` → `GET /api/notes`; `createNote` → `POST`; `saveNote(note, change)` → `PATCH` với `note.version`; `deleteNote` → `DELETE`. `NoteItem` thêm `version: number`.
- `useNotes`: bỏ `staleTime: Infinity` của dữ liệu mẫu (giữ mặc định của app). Mutation lưu: thành công thì thay ghi chú trong cache (kể cả `version` mới); `409` / `404` / lỗi khác thành trạng thái của ô soạn (D-178).
- `NoteEditor`: giữ chữ đang gõ khi danh sách đọc lại (D-178); dòng báo xung đột / đã xóa / lỗi lưu ở đầu ô soạn (desktop) và trên trang soạn (điện thoại).
- Ẩn "Thêm thao tác"; ẩn chip "Gắn tin nhắn" và dòng nguồn khi không ghi chú nào có neo (hàm thuần trong `format.ts`).
- Test: fixture như API trả, MSW cho `/api/notes`; test cũ trên dữ liệu mẫu giữ nguyên bằng các hàm mẫu (như `test/tasksSampleApi.ts` của FE-70).

## Testing

| Tầng | Nội dung |
|---|---|
| Domain (viết test trước) | `Note`: tạo (nội dung trống / chỉ khoảng trắng / 20.000 / 20.001 ký tự, tiêu đề trống → `null`, bỏ khoảng trắng), sửa đổi `updated_at` chỉ khi giá trị đổi, ghim không đổi `updated_at` |
| Service + database (Testcontainers PostgreSQL 18, `Clock` cố định) | mỗi lệnh; CHECK của database (nội dung trống, quá dài, tiêu đề trống); `version` lệch → `409` và không ghi; hai lệnh cùng `version` cùng lúc → một `409`; chủ sở hữu khác → `404`; thứ tự danh sách; `PATCH` không đổi gì giữ `version` |
| API (`MockMvc`) | mỗi endpoint: `201` + `Location`, `200`, `204`, `400` từng lỗi ô (cả NUL, `PATCH` rỗng, thiếu `version`), `401`, thiếu CSRF, `404`, `409`; JSON khớp `NoteItem` + `version` |
| Web | adapter (`notes.api.test.ts`); màn trên API với MSW: tải, tạo, tự lưu gửi `version`, `409` → dòng báo + "Tải bản mới" / "Lưu bản của tôi", `404` → "Lưu thành ghi chú mới", lỗi mạng → "Thử lại", ghim / xóa lỗi trả lại; ẩn "Thêm thao tác" và phần neo |
| Trình duyệt thật | FE-90: backend thật trong worktree (cổng riêng, PostgreSQL tạm), 1440 và 390; hai tab cùng một ghi chú để thấy `409` |
| Cổng | backend `./mvnw -B -ntp verify` trong worktree riêng; web `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` |

Kiểm bằng lỗi gài (mutation): không cho từng task; một lần cho `Note` (quy tắc sửa / ghim / `version`) ở BE-90.

## Risks / Trade-offs

- [Tải mọi ghi chú kèm nội dung mỗi lần mở trang] → chấp nhận cho một người dùng (D-173); đổi sang tìm ở máy chủ + phân trang khi lớn lên hoặc có F11.
- [Hai tab cùng có thay đổi chưa lưu] → tab lưu sau gặp `409`, chữ còn trong ô soạn, người dùng chọn "Tải bản mới" hay "Lưu bản của tôi"; không tự gộp.
- [Delta `module-boundaries` sửa cùng requirement với `f16-f17-tasks-calendar`] → delta này ghi cả `planner` lẫn `notes`; change nào archive sau phải chứa cả hai module (báo sino-api-94).
- [Delta `notes-screen` sửa spec chưa archive] → archive sau `fe-ui-notes` (NT-04).
- [Ghi chú dạng sơ đồ đổi hợp đồng `NoteItem` (`kind`, khối, đường nối)] → F15 chỉ cộng thêm được: cột `kind` mặc định `TEXT`, CHECK nội dung chỉ cho `TEXT` (D-171). Thứ tự commit trên `features/notes/**` báo qua lại với sino-web-37.
- [File kiến thức Phase 4 do planner đang giữ] → báo sino-api-94 trước khi thêm mục F15.

## Migration Plan

- Kiểm số V cao nhất trên `dev`, báo sino-api-27 và sino-api-94, rồi mới viết migration (luật đã thống nhất). Chạy trên Testcontainers trong worktree riêng; database của người dùng nhận migration khi app chạy từ `dev`.
- Rollback: bảng mới, không module nào đọc; bỏ được bằng một migration xóa bảng nếu cần.

## Definition of Done

- [ ] Scenario của spec `notes` và delta `notes-screen` chạy đúng; JSON khớp hợp đồng `NoteItem` + `version`.
- [ ] `./mvnw -B -ntp verify` xanh; `ModularityTests` thấy `notes`.
- [ ] Web: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh; Chrome thật 1440 + 390 trên backend thật, có ca hai tab.
- [ ] README (API mới), mục F15 trong file kiến thức Phase 4 + `.docx` (`genoffice docs check`).
- [ ] `tasks.md` tick đủ, chỗ lệch kế hoạch có **LÝ DO**; `PROJECT_STATE.md` cập nhật; archive sau `fe-ui-notes`.
