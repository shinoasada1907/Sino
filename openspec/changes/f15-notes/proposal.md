## Why

Màn Ghi chú đã dựng xong trên dữ liệu mẫu (`fe-ui-notes`, NT-01…NT-03, 2026-10-12) nhưng backend chưa có gì: ghi chú mất khi tải lại trang. Người dùng (2026-10-12): "bây giờ đến tính năng xây dựng ghi chú", rồi chọn làm **ghi chú độc lập trước** (chưa gắn tin nhắn), **kiểm phiên bản** khi lưu, và giữ cách tìm trên trình duyệt mà web đã làm. Change này là phần lõi của **F15 — Ghi chú** (Phase 4 của roadmap), theo phạm vi D-28 của `planner-from-messages`.

Từ 2026-10-16 đến 2026-10-17 màn còn có **ghi chú dạng sơ đồ** (`fe-ui-diagram-notes`, DG-01…DG-04: khối nối bằng mũi tên), cũng chạy trên dữ liệu mẫu nên cũng mất khi tải lại. Người dùng (2026-10-19): "phần ghi chú chưa có tính năng lưu DB", rồi chọn lưu **cả ghi chú chữ lẫn sơ đồ** trong change này (cột `kind` + `diagram jsonb` trên bảng `note`).

## What Changes

- **Module mới `notes`** (theo D-29 của `planner-from-messages`): bảng `note` (có `kind` `TEXT` / `DIAGRAM` và `diagram jsonb`, D-179), JPA có `@Version`.
- **Ghi chú chữ (`TEXT`):** nội dung bắt buộc, tối đa 20.000 ký tự; tiêu đề tùy chọn, tối đa 200 ký tự (trống thì là `null`); ghim. Ghim không phải một lần sửa (D-175).
- **Ghi chú sơ đồ (`DIAGRAM`, D-179):** `diagram` là cả sơ đồ (1–300 khối, tối đa 600 đường nối, mã do web tạo), lưu một lần và thay toàn bộ mỗi lần sửa, cùng `version`; `body` luôn rỗng. Máy chủ kiểm sơ đồ (nối trỏ tới khối có trong sơ đồ, không tự nối, không trùng cặp, các giới hạn). `kind` không đổi sau khi tạo.
- **API `/api/notes`:** `GET` (mọi ghi chú của chủ, đủ nội dung, sửa gần nhất trước), `GET /{id}`, `POST` (`201` + `Location`), `PATCH /{id}` có `version` (lệch → `409 CONCURRENT_MODIFICATION`, không ghi gì; D-172), `DELETE /{id}` (`204`). Hình dạng JSON theo hợp đồng `NoteItem` của `fe-ui-notes` và `fe-ui-diagram-notes` (`kind`, `diagram`, D-211) cộng `version`; `POST` nhận `{ kind?, title?, body?, diagram? }`, `PATCH` nhận thêm `diagram`; `anchor`, `quote` là `null`, `linked` là `[]` (D-177).
- **Web:** màn Ghi chú của `fe-ui-notes` chuyển sang API (thay thân `notes.api.ts`); báo "Ghi chú này vừa được sửa ở nơi khác" với "Tải bản mới" / "Lưu bản của tôi", báo lỗi khi không lưu được, ghi chú đã bị xóa ở nơi khác; ẩn phần chưa có dữ liệu ("Thêm thao tác"; chip "Gắn tin nhắn" và dòng nguồn khi không ghi chú nào có neo) (D-178). Ghi chú sơ đồ tự lưu qua cùng đường (`PATCH` kèm `diagram`), cùng dòng báo xung đột và lỗi ở đầu vùng vẽ.

## Capabilities

### New Capabilities
- `notes`: ghi chú của người dùng, chữ hoặc sơ đồ: dữ liệu, tạo, sửa có kiểm phiên bản, ghim, xóa, danh sách, API `/api/notes`.

### Modified Capabilities
- `module-boundaries`: thêm business module `notes`.
- `notes-screen` (của `fe-ui-notes`): màn Ghi chú (chữ và sơ đồ) chạy trên API, xung đột phiên bản, lỗi lưu, ẩn phần chưa có dữ liệu.

## Impact

- Code backend: package mới `dev/sino/notes/**` (`api`, `application`, `domain`, `infrastructure`); không sửa module nào khác. Điểm xuất phát là bản WIP `origin/wip/be-90-notes` (`f43fdd6`, ghi chú chữ, chưa kiểm chứng).
- Migration: số kế tiếp còn trống trên `dev` lúc viết (2026-10-12 là **V20**; V17 F10, V18 planner, V19 f05b; 2026-10-19 `dev` vẫn dừng ở V19), tên `notes_create_note`. V20 hiện chỉ có trên nhánh WIP, chưa vào `dev`, nên được viết lại thẳng cho `kind` / `diagram` (D-179), trừ khi một database đã chạy nó (khi đó V21). Theo luật đã thống nhất: kiểm số V cao nhất trên `dev` và đọc `PROJECT_STATE.md` xem ai đang giữ số đó trước khi viết.
- API mới: `/api/notes/**`. Lỗi: mã sẵn có `VALIDATION_FAILED` (400), `CONCURRENT_MODIFICATION` (409); mã mới `NOTE_NOT_FOUND` (404).
- Code web: `apps/sino-web/src/features/notes/**` kể cả `diagram/**` ở chỗ cần dòng báo xung đột và nạp lại (FE-90; DG-01…DG-04 của `fe-ui-diagram-notes` đã xong; trước khi sửa đọc `PROJECT_STATE.md` xem ai đang giữ các file này), fixture và MSW cho test.
- Tài liệu: `apps/sino-api/README.md` (API mới); mục F15 trong file kiến thức Phase 4 (`docs/knowledge/phase-4-planner.md` + `.docx`, báo sino-api-94 trước khi sửa); `openspec/roadmap.md` (ghi chú F15, F15b).
- Thứ tự archive: sau `fe-ui-notes` (delta `notes-screen` sửa spec của change đó) và sau `fe-ui-diagram-notes` (kịch bản sơ đồ của delta nói về vùng vẽ do change đó dựng). `planner-from-messages` có spec đích `notes`: khi archive change đó phải dùng `--skip-specs` (spec `notes` của change này thay cho nó, như `tasks` / `calendar` của `f16-f17-tasks-calendar`).

## Non-goals

- **Gắn ghi chú với tin nhắn:** neo `MESSAGE` / `CONVERSATION` / `PARTICIPANT`, đoạn trích, việc liên quan, tạo ghi chú từ thư (bôi đen đoạn → "Ghi chú"), mục "Việc và ghi chú" trong cuộc trò chuyện, "Tin nhắn gốc không còn". Đợt sau, khi định danh nhóm cuộc trò chuyện của `f05b-merged-threads` đã ổn (D-170).
- ~~**F15b — Ghi chú dạng sơ đồ** (người dùng 2026-10-12: tạo ô ghi chú, kéo nối tới các ô khác): change riêng sau F15 (D-171).~~ → phần **lưu** sơ đồ nằm trong change này (người dùng 2026-10-19, D-179). **LÝ DO:** giao diện sơ đồ đã dựng xong trên dữ liệu mẫu (`fe-ui-diagram-notes`); lưu ghi chú chữ mà để sơ đồ mất khi tải lại là cùng một lỗi. Vẫn ngoài phạm vi: sửa giao diện sơ đồ, gắn sơ đồ với tin nhắn, tìm trong khối ở máy chủ.
- Tìm ở máy chủ (`?q=`, `unaccent`) và phân trang: khi ghi chú nhiều lên hoặc có F11 (D-173).
- Tự gộp khi hai nơi cùng sửa; đẩy thay đổi ghi chú sang tab khác qua SSE.
- "Thêm thao tác"; định dạng phong phú, ảnh, thư mục (D-28).
