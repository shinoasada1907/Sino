## Why

Màn Ghi chú đã dựng xong trên dữ liệu mẫu (`fe-ui-notes`, NT-01…NT-03, 2026-10-12) nhưng backend chưa có gì: ghi chú mất khi tải lại trang. Người dùng (2026-10-12): "bây giờ đến tính năng xây dựng ghi chú", rồi chọn làm **ghi chú độc lập trước** (chưa gắn tin nhắn), **kiểm phiên bản** khi lưu, và giữ cách tìm trên trình duyệt mà web đã làm. Change này là phần lõi của **F15 — Ghi chú** (Phase 4 của roadmap), theo phạm vi D-28 của `planner-from-messages`.

## What Changes

- **Module mới `notes`** (theo D-29 của `planner-from-messages`): bảng `note`, JPA có `@Version`.
- **Ghi chú:** nội dung bắt buộc, tối đa 20.000 ký tự; tiêu đề tùy chọn, tối đa 200 ký tự (trống thì là `null`); ghim. Ghim không phải một lần sửa (D-175).
- **API `/api/notes`:** `GET` (mọi ghi chú của chủ, đủ nội dung, sửa gần nhất trước), `GET /{id}`, `POST` (`201` + `Location`), `PATCH /{id}` có `version` (lệch → `409 CONCURRENT_MODIFICATION`, không ghi gì; D-172), `DELETE /{id}` (`204`). Hình dạng JSON theo hợp đồng `NoteItem` của `fe-ui-notes` cộng `version`; `anchor`, `quote` là `null`, `linked` là `[]` (D-177).
- **Web:** màn Ghi chú của `fe-ui-notes` chuyển sang API (thay thân `notes.api.ts`); báo "Ghi chú này vừa được sửa ở nơi khác" với "Tải bản mới" / "Lưu bản của tôi", báo lỗi khi không lưu được, ghi chú đã bị xóa ở nơi khác; ẩn phần chưa có dữ liệu ("Thêm thao tác"; chip "Gắn tin nhắn" và dòng nguồn khi không ghi chú nào có neo) (D-178).

## Capabilities

### New Capabilities
- `notes`: ghi chú chữ của người dùng: dữ liệu, tạo, sửa có kiểm phiên bản, ghim, xóa, danh sách, API `/api/notes`.

### Modified Capabilities
- `module-boundaries`: thêm business module `notes`.
- `notes-screen` (của `fe-ui-notes`): màn Ghi chú chạy trên API, xung đột phiên bản, lỗi lưu, ẩn phần chưa có dữ liệu.

## Impact

- Code backend: package mới `dev/sino/notes/**` (`api`, `application`, `domain`, `infrastructure`); không sửa module nào khác.
- Migration: số kế tiếp còn trống trên `dev` lúc viết (2026-10-12 là **V20**; V17 F10, V18 planner, V19 f05b), tên `notes_create_note`. Theo luật đã thống nhất với sino-api-27 và sino-api-94: kiểm số V cao nhất trên `dev` và báo hai phiên đó trước khi viết.
- API mới: `/api/notes/**`. Lỗi: mã sẵn có `VALIDATION_FAILED` (400), `CONCURRENT_MODIFICATION` (409); mã mới `NOTE_NOT_FOUND` (404).
- Code web: `apps/sino-web/src/features/notes/**` (FE-90; đã thống nhất thứ tự commit với sino-web-37, phiên đang giữ các file này), fixture và MSW cho test.
- Tài liệu: `apps/sino-api/README.md` (API mới); mục F15 trong file kiến thức Phase 4 (`docs/knowledge/phase-4-planner.md` + `.docx`, báo sino-api-94 trước khi sửa); `openspec/roadmap.md` (ghi chú F15, F15b).
- Thứ tự archive: sau `fe-ui-notes` (delta `notes-screen` sửa spec của change đó). `planner-from-messages` có spec đích `notes`: khi archive change đó phải dùng `--skip-specs` (spec `notes` của change này thay cho nó, như `tasks` / `calendar` của `f16-f17-tasks-calendar`).

## Non-goals

- **Gắn ghi chú với tin nhắn:** neo `MESSAGE` / `CONVERSATION` / `PARTICIPANT`, đoạn trích, việc liên quan, tạo ghi chú từ thư (bôi đen đoạn → "Ghi chú"), mục "Việc và ghi chú" trong cuộc trò chuyện, "Tin nhắn gốc không còn". Đợt sau, khi định danh nhóm cuộc trò chuyện của `f05b-merged-threads` đã ổn (D-170).
- **F15b — Ghi chú dạng sơ đồ** (người dùng 2026-10-12: tạo ô ghi chú, kéo nối tới các ô khác): change riêng sau F15 (D-171).
- Tìm ở máy chủ (`?q=`, `unaccent`) và phân trang: khi ghi chú nhiều lên hoặc có F11 (D-173).
- Tự gộp khi hai nơi cùng sửa; đẩy thay đổi ghi chú sang tab khác qua SSE.
- "Thêm thao tác"; định dạng phong phú, ảnh, thư mục (D-28).
