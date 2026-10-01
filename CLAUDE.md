# Sino — hướng dẫn cho agent (Claude, Codex)

Sino Messages: gom nhiều tài khoản và nhiều nhà cung cấp tin nhắn (Gmail, Telegram…) vào một hộp thư chung.

## Repo này có gì

| Thư mục | Nội dung |
|---|---|
| `apps/sino-api` | Backend: Spring Boot 4, Java 25, PostgreSQL 18, Flyway, Spring Modulith. Lệnh chạy/test ở `apps/sino-api/README.md` |
| `apps/sino-web` | Frontend: React + Vite (khung, chưa bắt đầu — Phase 1) |
| `openspec/roadmap.md` | Lộ trình Phase 0–5, feature F01–F12 |
| `openspec/specs/` | Mô tả hệ thống **đang chạy** (gộp từ các feature đã xong) |
| `openspec/changes/<feature>/` | Feature đang làm: `proposal.md`, `design.md`, `specs/`, `tasks.md` |
| `openspec/changes/archive/` | Feature đã xong (F01 có decision register D-01…D-23 trong `design.md`) |
| `.github/workflows/backend-ci.yml` | CI backend |

## Đọc trước khi làm bất cứ việc gì

1. `PROJECT_STATE.md` — **trạng thái thật**: task hiện tại, ai đang làm (Human hay agent), bằng chứng kiểm tra, việc tiếp theo.
2. `project-mode.yaml` — mode làm việc và task override (task nào người dùng tự code).
3. `openspec/changes/*/tasks.md` của feature đang làm — task đã tick tới đâu, ghi chú thực hiện.
4. `openspec/roadmap.md` — đang ở phase nào.

Vị trí hiện tại chỉ ghi trong `PROJECT_STATE.md`; file này không lặp lại để khỏi lệch.

## Quy ước làm việc

- Mode HYBRID: mặc định agent làm từng task nhỏ, kiểm chứng, báo lại rồi dừng. Task nào người dùng nhận tự code (TRAINING) thì agent **không viết code thay**: giải thích, gợi ý, review, chạy test.
- Quyết định kiến trúc ("Decision Needed") do người dùng chốt; agent đưa phương án và đề xuất.
- Nhánh làm việc `dev`. Không commit thẳng `main`. Agent commit lên `dev` sau mỗi task đã kiểm chứng; **push, merge, mở PR chỉ khi người dùng yêu cầu**.
- Làm khác kế hoạch thì gạch task cũ trong `tasks.md` và ghi **LÝ DO** ngay tại đó. Xong feature thì `openspec archive <change> -y`.
- Không chạy thêm bước kiểm tra chậm ngoài phạm vi được giao mà chưa hỏi.
- Secret chỉ nằm trong `apps/sino-api/.env` (bị ignore); mẫu là `.env.example`.

## Tài liệu sản phẩm gốc (Notion, trang public)

00 Project Context · 01 Yêu cầu chức năng MVP · 02 Thiết kế hệ thống (02A kiến trúc, 02B database, 02C UI/UX) · 03 Roadmap · 04 Backend Workspace (04A ràng buộc, 04B hướng dẫn lập kế hoạch). Khi tài liệu mâu thuẫn: 01 > 02/02A/02B/02C > 04A > 04B > 03 > code.
