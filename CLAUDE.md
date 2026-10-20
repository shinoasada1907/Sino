# Sino — hướng dẫn cho agent (Claude, Codex)

Sino Messages: gom nhiều tài khoản và nhiều nhà cung cấp tin nhắn (Gmail, Telegram…) vào một hộp thư chung.

## Repo này có gì

| Thư mục | Nội dung |
|---|---|
| `apps/sino-api` | Backend: Spring Boot 4, Java 25, PostgreSQL 18, Flyway, Spring Modulith. Lệnh chạy/test ở `apps/sino-api/README.md` |
| `apps/sino-web` | Frontend: React + Vite + Tailwind + shadcn/ui. Lệnh chạy/test ở `apps/sino-web/README.md` |
| `design/sino-ui/project/` | Bản sao canvas thiết kế giao diện "Sino UI" (bản gốc và bản cuối cùng: https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB); phải khớp với link |
| `openspec/roadmap.md` | Lộ trình Phase 0–5, feature F01–F12 |
| `openspec/specs/` | Mô tả hệ thống **đang chạy** (gộp từ các feature đã xong) |
| `openspec/changes/<feature>/` | Feature đang làm: `proposal.md`, `design.md`, `specs/`, `tasks.md` |
| `openspec/changes/archive/` | Feature đã xong (F01 có decision register D-01…D-23 trong `design.md`) |
| `.github/workflows/backend-ci.yml` | CI backend |
| `docs/knowledge/` | Kiến thức theo phase cho người học (`phase-0-backend-foundation.md`…): chỗ nào dùng gì của Java/Spring, để làm gì, vì sao |

## Đọc trước khi làm bất cứ việc gì

1. `PROJECT_STATE.md` — **trạng thái thật**: task hiện tại, ai đang làm (Human hay agent), bằng chứng kiểm tra, việc tiếp theo.
2. `project-mode.yaml` — mode làm việc và task override (task nào người dùng tự code).
3. `openspec/changes/*/tasks.md` của feature đang làm — task đã tick tới đâu, ghi chú thực hiện.
4. `openspec/roadmap.md` — đang ở phase nào.

Vị trí hiện tại chỉ ghi trong `PROJECT_STATE.md`; file này không lặp lại để khỏi lệch.

## Quy ước làm việc

- **Chỉ ở mode AUTO agent mới tự làm** (người dùng, 2026-10-15). Ở TRAINING và HYBRID, người dùng tự code, tự test, tự debug; agent chỉ hướng dẫn:
  - chia việc thành các bước nhỏ; mỗi bước đưa code cần gõ (chỉ phần mới, kèm chỗ chèn chính xác) và giải thích nó làm gì, vì sao;
  - kèm hướng dẫn test chi tiết từng bước: lệnh chạy, kết quả đúng trông ra sao, lỗi hay gặp và cách đọc lỗi;
  - **không** chạy thử code trước trong scratchpad/sandbox, không build, không chạy test, không viết tài liệu, không cập nhật `PROJECT_STATE.md` / `tasks.md`, không commit, trừ khi người dùng yêu cầu đúng việc đó.

  Khi người dùng bật AUTO (`mode: AUTO` trong `project-mode.yaml`), agent tự làm từng task nhỏ theo đủ quy trình (kiểm chứng, tài liệu, commit) rồi báo lại và dừng.
- Quyết định kiến trúc ("Decision Needed") do người dùng chốt; agent đưa phương án và đề xuất.
- Người dùng đang học Java qua dự án (vai trò intern; agent là senior engineer): ở AUTO agent làm task rồi giải thích cái đã dùng và vì sao, ở TRAINING/HYBRID agent hướng dẫn như trên; người dùng quyết bước tiếp theo. Mỗi phase có một file kiến thức trong `docs/knowledge/`; ở AUTO xong mỗi task thì agent bổ sung phần của task đó vào file của phase, ở TRAINING/HYBRID chỉ khi người dùng yêu cầu. File `.md` là bản gốc; bản Word `.docx` cạnh nó được sinh lại sau mỗi lần sửa (máy này dùng GenOffice: `genoffice create --type docx --from <file>.md --out <file>.docx --force`), không sửa tay `.docx`. Sơ đồ trong file kiến thức vẽ bằng ký tự trong khối `text`, không dùng Mermaid, vì Word không hiển thị được Mermaid. Không dùng emoji trong file kiến thức: bản Word render bằng GenOffice mất toàn bộ chữ thường khi gặp emoji.
- Nhánh làm việc `dev`. Không commit thẳng `main`. Ở AUTO agent commit lên `dev` sau mỗi task đã kiểm chứng; ở TRAINING/HYBRID agent chỉ commit khi người dùng yêu cầu. **Push, merge, mở PR chỉ khi người dùng yêu cầu**.
- Làm khác kế hoạch thì gạch task cũ trong `tasks.md` và ghi **LÝ DO** ngay tại đó. Xong feature thì `openspec archive <change> -y`.
- Không chạy thêm bước kiểm tra chậm ngoài phạm vi được giao mà chưa hỏi.
- **Test tay trước, test tự động sau** (người dùng, 2026-10-20). Áp cho mọi task, backend lẫn frontend, ở mọi mode:
  1. Viết code.
  2. Test tay cho tới khi chạy đúng: frontend thì chạy app và thao tác trên Chrome thật; backend thì chạy app và gọi API thật (curl, Postman), xem DB và log khi cần.
  3. Chỉ khi test tay xong mới viết unit test (và các test tự động khác), để kiểm lại một lần nữa đúng hành vi vừa test tay.

  Không viết test trước code nữa (bỏ "đỏ rồi xanh"). Luật này ghi đè skill `superpowers:test-driven-development` và các dòng "test viết trước" còn trong `tasks.md` của các change đang làm. Ở TRAINING/HYBRID, hướng dẫn cho người dùng cũng theo đúng thứ tự này. Bằng chứng trong `tasks.md` ghi cả lượt test tay: đã làm gì, thấy gì.
- Kiểm chứng mỗi task **frontend** khi agent tự làm ở AUTO (người dùng chọn 2026-10-09 để làm nhanh hơn):
  - Giữ: thứ tự test ở mục trên (Chrome thật trước, test tự động sau); `pnpm lint`, `tsc -b`, `pnpm test`, `pnpm build` trước khi commit; đối chiếu canvas.
  - Chrome thật: một lượt mỗi task, chỉ ở các cỡ màn task đó đụng tới. Đủ các cỡ × 2 theme để dành cho task nghiệm thu của màn.
  - Kiểm tra bằng lỗi gài (mutation): không chạy ở mỗi task; chỉ một lần cho hàm logic thuần của màn (như `format.ts`), ở task cuối trước nghiệm thu.
  - File kiến thức: sinh lại `.docx` và chạy `genoffice docs check`; không render thành ảnh.
  - Bằng chứng trong `tasks.md` ghi ngắn: lệnh, kết quả, lỗi đáng kể và cách sửa.
- Secret chỉ nằm trong `apps/sino-api/.env` (bị ignore); mẫu là `.env.example`.

## Tài liệu sản phẩm gốc (Notion, trang public)

00 Project Context · 01 Yêu cầu chức năng MVP · 02 Thiết kế hệ thống (02A kiến trúc, 02B database, 02C UI/UX) · 03 Roadmap · 04 Backend Workspace (04A ràng buộc, 04B hướng dẫn lập kế hoạch). Khi tài liệu mâu thuẫn: 01 > 02/02A/02B/02C > 04A > 04B > 03 > code.

**Giao diện web** (người dùng, 2026-10-08): canvas "Sino UI" (https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB) là **thiết kế cuối cùng**. Với mọi thứ người dùng nhìn thấy, canvas ưu tiên hơn 02C; 02C chỉ còn dùng ở chỗ canvas không nói tới. Trước khi dựng hay sửa một màn, đối chiếu với canvas; nếu link có bản mới hơn bản sao trong `design/sino-ui/project/` thì cập nhật bản sao trước.
