# Phase 4 · F15 — Ghi chú (lõi, ghi chú độc lập) · Implementation Plan

> **HYBRID mode:** backend và frontend AUTO. Claude (sino-api-11) làm từng task theo thứ tự, kiểm chứng, commit riêng trên `dev` (không push), báo lại rồi dừng. Quyết định đã chốt trong `design.md` (D-170…D-178).
> Mỗi task: test đỏ trước rồi mới xanh. Backend: build, test trong **git worktree riêng** (không đụng `target/` mà IntelliJ của người dùng đọc, không dùng worktree của phiên khác), `./mvnw -B -ntp verify` xanh, migration chỉ chạy trên Testcontainers hoặc PostgreSQL tạm của change này. Web: `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` xanh, Chrome một lượt ở các cỡ màn task đụng tới. Kiến thức: mục F15 trong `docs/knowledge/phase-4-planner.md` + `.docx` (`genoffice docs check`; báo sino-api-94 trước khi sửa file đó).
> Phối hợp: migration lấy số kế tiếp trên `dev` lúc viết, báo sino-api-27 và sino-api-94 trước; FE-90 sửa `features/notes/**` của `fe-ui-notes`: báo sino-web-37 trước khi đụng và chờ trả lời (phiên đó có thể đang dựng ghi chú dạng sơ đồ trên cùng các file).
> Thứ tự: BE-90 → BE-91 → FE-90 → ACC.

## 1. Backend

- [x] 1.1 **BE-90 — Module `notes`, bảng `note`, `Note`, `NoteService`** — XONG 2026-10-19 (phiên cloud, nhánh `claude/funny-mayer-35jgp7`)
  - **Bằng chứng:** test viết trước, `test-compile` đỏ rồi xanh; `NoteTests` 28, `NoteServiceTests` 23 (CHECK có kiểm tên ràng buộc, hai tab cùng `version` cùng lúc → một lần bị từ chối), `ModularityTests` 2/2 thấy `notes`; kiểm bằng lỗi gài 19/19 bị bắt (một lỗi thứ 20, bỏ `flush()`, sống sót); `./mvnw -B -ntp verify` → 1546 test, 0 lỗi, 4 bỏ qua; mục F15 (6.1–6.8) trong `docs/knowledge/phase-4-planner.md`.
  - **Làm khác kế hoạch:** (1) migration là **V20** vì V19 là số cao nhất trên cây này; chưa báo sino-api-27, sino-api-94 (phiên cloud này không liên lạc được); nếu `dev` đã dùng V20 thì đánh số lại khi gộp. (2) `NoteService.update` **không** `flush()` (bản đầu có, kiểm bằng lỗi gài cho thấy thừa): object trả về nhận `version` mới lúc commit, trước khi controller đọc. (3) `.docx` của file kiến thức **chưa sinh lại**: máy cloud không có GenOffice; chạy `genoffice create --type docx --from docs/knowledge/phase-4-planner.md --out docs/knowledge/phase-4-planner.docx --force` rồi `genoffice docs check`. (4) Chưa báo sino-api-94 trước khi sửa file kiến thức Phase 4 (chỉ thêm mục 6 và hai dòng đầu file).
  - **Goal / Why:** ghi chú lưu thật: tạo, sửa có kiểm phiên bản, ghim, xóa, danh sách (D-172, D-174, D-175, D-176).
  - **Depends on:** —
  - **Trước khi viết:** dòng nhận việc trong `PROJECT_STATE.md`; kiểm số V cao nhất trên `dev` (2026-10-12: V19) và báo sino-api-27, sino-api-94 số sẽ dùng.
  - **Files:** migration `V<n>__notes_create_note.sql`; `notes/domain/{Note,NotesErrorCode}`; `notes/infrastructure/NoteRepository`; `notes/application/{NoteService,NewNote,NoteChange}`; test; mục F15 trong `docs/knowledge/phase-4-planner.md` + `.docx`.
  - **Hướng làm:** design Backend 1–3 và Chốt kỹ thuật. `Note` là JPA (`@UuidGenerator` UUIDv7, `@Version`, `user_id`), hàm `create`, `edit(title, body, now)` (đổi `updated_at` chỉ khi giá trị đổi; trả `false` khi không đổi gì), `pin(boolean)`; quy tắc nội dung / tiêu đề kiểm ngay trong `Note` và bằng CHECK của database. `NoteService.update` đọc ghi chú của chủ (`findByIdAndUserId`), so `version` gửi lên, lệch thì ném `OptimisticLockingFailureException` (handler sẵn có → `409`). `list` sắp `updated_at DESC, id DESC`.
  - **Test:** domain dạng bảng (nội dung trống, chỉ khoảng trắng, 20.000 / 20.001 ký tự, tiêu đề trống → `null`, bỏ khoảng trắng hai đầu, sửa cùng giá trị không đổi `updated_at`, ghim không đổi `updated_at`); Testcontainers PostgreSQL 18 + `Clock` cố định: mỗi lệnh, CHECK của database có kiểm tên ràng buộc, `version` lệch → `409` và nội dung không đổi, hai lần lưu cùng đọc một `version` → một lần `409`, chủ khác → `NOTE_NOT_FOUND`, thứ tự, `PATCH` không đổi gì giữ `version`; `ModularityTests`. Kiểm bằng lỗi gài cho `Note` (design Testing).
  - **Acceptance criteria:** spec `notes` (phần dữ liệu và hành vi); delta `module-boundaries`.
  - **Hints:** Level 1 — "vì sao so `version` trong service mà vẫn cần `@Version` của JPA?"

- [ ] 1.2 **BE-91 — REST `/api/notes`**
  - **Goal / Why:** web gọi được mọi thao tác của ghi chú với đúng hợp đồng `NoteItem` + `version`.
  - **Depends on:** BE-90.
  - **Files:** `notes/api/{NotesController,CreateNoteRequest,UpdateNoteRequest,NoteResponse}`; `apps/sino-api/README.md` (các dòng `/api/notes`, `PATCH` vào ghi chú CSRF nếu README liệt kê); test; mục F15 của file kiến thức.
  - **Hướng làm:** design Backend 3; chủ sở hữu từ `CurrentUser`; Bean Validation: `body` không trống tối đa 20.000, `title` tối đa 200, NUL bị chặn (như `planner/api/Texts`), `PATCH` bắt buộc `version` và ít nhất một trong `title` / `body` / `pinned`; `201` + `Location` tới `GET /api/notes/{id}`; `NoteResponse` có `anchor: null`, `quote: null`, `linked: []` (D-177).
  - **Test:** `MockMvc` mỗi endpoint: `201` + `Location`, `200`, `204`, `400` từng lỗi ô (cả NUL, `PATCH` rỗng, thiếu `version`), ID không phải UUID → `400`, `401`, thiếu CSRF → `403`, `404` ở mọi lệnh với ghi chú của người khác, `409`; JSON khớp hợp đồng.
  - **Acceptance criteria:** spec `notes`.
  - **Hints:** Level 1 — "vì sao `version` nằm trong body của `PATCH` mà không ở header `If-Match`?"

## 2. Web

- [ ] 2.1 **FE-90 — Màn Ghi chú trên API**
  - **Goal / Why:** tạo, sửa, ghim, xóa lưu thật; tải lại không mất; không bao giờ mất chữ âm thầm (D-172, D-178).
  - **Depends on:** BE-91 (hợp đồng; chạy thật ở cuối task); sino-web-37 đồng ý và đã commit những gì đang làm trên `features/notes/**`.
  - **Files:** `apps/sino-web/src/features/notes/{notes.types,notes.api,useNotes,format}.ts` (+ test), `components/{NoteEditor,NoteList,NoteCard}.tsx` (dòng báo, ẩn phần chưa có dữ liệu), `NotesPage.tsx` nếu cần; `apps/sino-web/src/test/{notesSampleApi.ts,fixtures/notesApi.ts}` (mới); mục F15 của file kiến thức.
  - **Hướng làm:** design Web; như FE-70: `notes.api.ts` gọi API, test cũ trên dữ liệu mẫu dùng hàm mẫu trong `vi.mock`; `NoteItem.version`; mutation lưu gửi `version`, thay ghi chú trong cache khi thành công; `409` / `404` / lỗi khác thành trạng thái của ô soạn với dòng báo và nút; ô soạn không nhận bản mới khi còn thay đổi chưa lưu; ẩn "Thêm thao tác"; hàm thuần "có ghi chú nào có neo" quyết chip "Gắn tin nhắn" và dòng nguồn.
  - **Test:** adapter; màn trên API với MSW: tải, tạo (`POST` rồi thay địa chỉ), tự lưu gửi đúng `version`, `409` → dòng báo, "Tải bản mới" nhận bản máy chủ, "Lưu bản của tôi" lưu lên `version` mới, `404` → "Lưu thành ghi chú mới", lỗi mạng → "Thử lại" và chữ còn, ghim / xóa lỗi trả lại; danh sách đọc lại không đè chữ đang gõ; ẩn "Thêm thao tác", chip "Gắn tin nhắn", dòng nguồn khi không có neo.
  - **Chrome thật:** backend thật từ worktree (cổng riêng, PostgreSQL tạm), 1440 và 390: tạo, sửa, tải lại, ghim, xóa; hai tab cùng một ghi chú → tab sau báo xung đột, không mất chữ.
  - **Acceptance criteria:** delta `notes-screen`.
  - **Hints:** Level 1 — "khi danh sách đọc lại trong lúc đang gõ, ô soạn nên tin bản nào, và vì sao?"

## 3. Nghiệm thu

- [ ] 3.1 **ACC — Nghiệm thu F15, tài liệu**
  - **Goal / Why:** Definition of Done của `design.md`.
  - **Depends on:** FE-90.
  - **Việc:** chạy lại mọi scenario của spec `notes` và delta `notes-screen` trên backend thật; README; file kiến thức + `.docx`, `genoffice docs check`; `openspec validate f15-notes --strict`; `PROJECT_STATE.md`; ghi chú F15 / F15b trong `openspec/roadmap.md`; tick một phần mục 3.3 (F15) của `planner-from-messages/tasks.md` (phần ghi chú độc lập; gắn tin nhắn còn lại).
  - **Acceptance criteria:** mọi ô Definition of Done của `design.md`, trừ archive.

- [ ] 3.2 **Archive:** sau `fe-ui-notes` (NT-04): delta `notes-screen` sửa spec của change đó. `openspec archive f15-notes -y`. Delta `module-boundaries` ghi cả `planner` và `notes`: nếu `f16-f17-tasks-calendar` archive sau change này thì delta của nó phải có `notes` (báo sino-api-94).
