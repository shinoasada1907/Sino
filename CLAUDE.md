# Sino — hướng dẫn cho agent (Claude, Codex)

Sino Messages: gom nhiều tài khoản và nhiều nhà cung cấp tin nhắn (Gmail, Telegram…) vào một hộp thư chung.

## Repo này có gì

| Thư mục | Nội dung |
|---|---|
| `apps/sino-api` | Backend: Spring Boot 4, Java 25, PostgreSQL 18, Flyway, Spring Modulith. Lệnh chạy/test ở `apps/sino-api/README.md` |
| `apps/sino-web` | Frontend: React + Vite + Tailwind + shadcn/ui; cả trang giới thiệu `/` và Privacy. Lệnh chạy/test ở `apps/sino-web/README.md` |
| `apps/sino-zalo` | Dịch vụ Node giữa `sino-api` và Zalo cá nhân (zca-js). Lệnh chạy/test ở `apps/sino-zalo/README.md` |
| `.claude/agents/` | Vai trò của ba kỹ sư: `sino-api`, `sino-web`, `sino-zalo` (xem mục *Đội Sino*) |
| `design/sino-ui/project/` | Bản sao canvas thiết kế giao diện "Sino UI" (bản gốc và bản cuối cùng: https://claude.ai/artifact/T9xQb6gPQ39mwcF1TEe6zB); phải khớp với link |
| `openspec/roadmap.md` | Lộ trình Phase 0–5, feature F01–F12 |
| `openspec/specs/` | Mô tả hệ thống **đang chạy** (gộp từ các feature đã xong) |
| `openspec/changes/<feature>/` | Feature đang làm: `proposal.md`, `design.md`, `specs/`, `tasks.md` |
| `openspec/changes/archive/` | Feature đã xong (F01 có decision register D-01…D-23 trong `design.md`) |
| `.github/workflows/` | CI: `backend-ci.yml`, `frontend-ci.yml`, `zalo-ci.yml` |
| `docs/knowledge/` | Kiến thức theo phase cho người học (`phase-0-backend-foundation.md`…): chỗ nào dùng gì của Java/Spring, để làm gì, vì sao |

## Đọc trước khi làm bất cứ việc gì

1. `PROJECT_STATE.md` — **trạng thái thật**: task hiện tại, ai đang làm (Human hay agent), bằng chứng kiểm tra, việc tiếp theo.
2. `project-mode.yaml` — mode làm việc và task override (task nào người dùng tự code).
3. `openspec/changes/*/tasks.md` của feature đang làm — task đã tick tới đâu, ghi chú thực hiện.
4. `openspec/roadmap.md` — đang ở phase nào.

Vị trí hiện tại chỉ ghi trong `PROJECT_STATE.md`; file này không lặp lại để khỏi lệch.

## Đội Sino (người dùng, 2026-10-27)

Người dùng chỉ đạo và giám sát. Phiên quản lý đưa ra đề án và hướng xây dựng theo chỉ đạo đó, rồi giao việc. Ba kỹ sư làm phần việc trong app của mình.

| Vai | Ai | Giữ |
|---|---|---|
| Chỉ đạo, duyệt | Người dùng | Mục tiêu, ưu tiên, Decision Needed, duyệt đề án, nghiệm thu, push/merge/PR |
| Quản lý | Phiên chính "Quản lý Sino" | Đề án (OpenSpec), giao việc, review, test bù, `PROJECT_STATE.md`, file chung, commit |
| Kỹ sư backend | Phiên `sino-api` · `.claude/agents/sino-api.md` | `apps/sino-api` |
| Kỹ sư frontend | Phiên `sino-web` · `.claude/agents/sino-web.md` | `apps/sino-web` |
| Kỹ sư Zalo | Phiên `sino-zalo` · `.claude/agents/sino-zalo.md` | `apps/sino-zalo` |

Một phiên mở với brief "Bạn là kỹ sư …" là phiên kỹ sư: nó theo file vai trò của nó và *Luật chung cho kỹ sư* dưới đây, không làm việc của quản lý.

### Quy trình một feature

1. Người dùng nêu mục tiêu hay chỉ đạo.
2. Quản lý soạn **đề án**: change OpenSpec (proposal; design có Decision Needed kèm phương án và đề xuất; tasks). Mỗi task ghi kỹ sư phụ trách (`· sino-api`) và thứ tự: hợp đồng API làm trước, app gọi nó làm sau.
3. **Duyệt 1, đề án**: người dùng duyệt và chốt các Decision Needed. Chưa duyệt thì chưa giao việc.
4. Quản lý **giao việc**: mở phiên kỹ sư trong nhóm "Đội Sino" ở sidebar, cùng thư mục làm việc này (không worktree). Mỗi kỹ sư một phiên cho mỗi feature; việc tiếp theo của cùng feature gửi vào phiên đó. Brief nêu change, mã task, mode, phạm vi file, việc không làm. Quản lý cập nhật bảng *Team* trong `PROJECT_STATE.md`. Hai kỹ sư khác app chạy song song được; một app chỉ một kỹ sư một lúc.
5. Kỹ sư làm và báo lại. Người dùng giám sát trực tiếp: mở phiên kỹ sư để xem, nhắn, hoặc dừng.
6. Quản lý **nghiệm thu nội bộ**: đọc diff và bằng chứng trong `tasks.md`, tự làm phần kỹ sư ghi CHƯA KIỂM CHỨNG (Chrome thật, gọi API), chạy các kiểm tra trước commit của app. Chưa đạt thì gửi lại kỹ sư.
7. **Duyệt 2, nghiệm thu**: quản lý trình kết quả, diff tóm tắt và phần chưa kiểm chứng. Người dùng nói "được" thì quản lý commit lên `dev` (mỗi task một commit), ghi `PROJECT_STATE.md` và file kiến thức. Push, merge, PR chỉ khi người dùng bảo.

Ở TRAINING/HYBRID, kỹ sư không sửa code: nó soạn bản hướng dẫn từng bước, quản lý chuyển cho người dùng.

### Luật chung cho kỹ sư

- **Làm như một kỹ sư giỏi**: đọc code xung quanh trước khi viết; theo đúng cách đặt tên, comment và cấu trúc đang có; thay đổi gọn, đúng task, không thêm thứ không ai yêu cầu. Brief mơ hồ hay sai với code thì hỏi, không đoán.
- **Phạm vi**: chỉ sửa thư mục app của mình, và dòng task của mình trong `tasks.md` (tick, **Thực hiện**, **Kiểm chứng**; làm khác kế hoạch thì gạch và ghi **LÝ DO**). Không sửa app khác hay file chung của quản lý (`PROJECT_STATE.md`, `CLAUDE.md`, `project-mode.yaml`, `openspec/roadmap.md`, `openspec/specs/`, `design/`, `docs/`, `compose.yaml`, `README.md` ở gốc, `.github/`, `.claude/`).
- **Git chỉ để đọc** (`status`, `diff`, `log`, `show`). Không `add`, `commit`, `stash`, `reset`, `checkout`, `switch`, `restore`, `rebase`, `merge`, `push`, `tag`: quản lý và ba kỹ sư dùng chung một thư mục làm việc.
- **Cổng dùng chung**: 5432 PostgreSQL, 8080 sino-api, 8090 sino-zalo, 5173 sino-web. Trước khi chạy, xem cổng đã có ai dùng chưa (`ss -ltnp | grep :8080`). Có rồi thì dùng chung. Không tắt process mình không mở; xong việc thì tắt cái mình mở. Phải khởi động lại sino-api thì ghi trong báo cáo.
- **Secret**: không in giá trị trong `.env` ra log, báo cáo hay file.
- **Dừng phần bị chặn và báo** khi gặp Decision Needed (đưa 2–3 phương án kèm đề xuất), khi cần app khác đổi (ghi chính xác cái gì), hay khi phải đụng ngoài phạm vi. Phần không bị chặn thì làm tiếp.
- **Người dùng nhắn thẳng vào phiên kỹ sư**: làm theo, đó là chỉ thị cao nhất; ghi lại trong báo cáo để quản lý biết.
- **Tự review trước khi báo**: đọc lại `git diff -- apps/<app>`, đối chiếu acceptance criteria, xóa code thử, xét các trường hợp biên.
- **Báo cáo** bằng tiếng Việt, ngắn. Quản lý chỉ nhận khoảng 400 ký tự đầu, nên recap cuối lượt và báo cáo đều mở đầu bằng dòng trạng thái:
  1. `TRẠNG THÁI: XONG | CẦN QUYẾT ĐỊNH | BỊ CHẶN — <mã task> — <một câu>`
  2. Các file đã đổi; đã làm gì; quyết định nhỏ đã tự chốt (D-xx).
  3. Test tay: làm gì, thấy gì. Test tự động: lệnh, số test, kết quả.
  4. **CHƯA KIỂM CHỨNG**, kèm lý do.
  5. Việc cho quản lý: hợp đồng cần app khác đổi, số migration đã dùng, dòng cần ghi vào `PROJECT_STATE.md`.
  6. Kiến thức: đã dùng gì của Java/Spring, React hay Node, để làm gì, vì sao (quản lý đưa vào `docs/knowledge/`).
  7. Gợi ý commit message kiểu `feat(<scope>): …` như lịch sử git.

`apps/sino-site` đã xóa 2026-10-27 (bản cuối ở tag `sino-site-v0`): trang giới thiệu và Privacy chỉ còn trong `sino-web`. Site chung của nhà Sino dựng lại khi có sản phẩm thứ hai.

## Quy ước làm việc

- **Chỉ ở mode AUTO agent mới tự làm** (người dùng, 2026-10-15). Ở TRAINING và HYBRID, người dùng tự code, tự test, tự debug; agent chỉ hướng dẫn:
  - chia việc thành các bước nhỏ; mỗi bước đưa code cần gõ (chỉ phần mới, kèm chỗ chèn chính xác) và giải thích nó làm gì, vì sao;
  - kèm hướng dẫn test chi tiết từng bước: lệnh chạy, kết quả đúng trông ra sao, lỗi hay gặp và cách đọc lỗi;
  - **không** chạy thử code trước trong scratchpad/sandbox, không build, không chạy test, không viết tài liệu, không cập nhật `PROJECT_STATE.md` / `tasks.md`, không commit, trừ khi người dùng yêu cầu đúng việc đó.

  Khi người dùng bật AUTO (`mode: AUTO` trong `project-mode.yaml`), đội tự làm từng task nhỏ theo quy trình của mục *Đội Sino* (kiểm chứng, tài liệu, nghiệm thu, commit) rồi báo lại và dừng.
- Quyết định kiến trúc ("Decision Needed") do người dùng chốt; agent đưa phương án và đề xuất.
- Người dùng đang học Java qua dự án (vai trò intern; agent là senior engineer): ở AUTO agent làm task rồi giải thích cái đã dùng và vì sao, ở TRAINING/HYBRID agent hướng dẫn như trên; người dùng quyết bước tiếp theo. Mỗi phase có một file kiến thức trong `docs/knowledge/`; ở AUTO xong mỗi task thì agent bổ sung phần của task đó vào file của phase, ở TRAINING/HYBRID chỉ khi người dùng yêu cầu. File `.md` là bản gốc; bản Word `.docx` cạnh nó được sinh lại sau mỗi lần sửa (máy này dùng GenOffice: `genoffice create --type docx --from <file>.md --out <file>.docx --force`), không sửa tay `.docx`. Sơ đồ trong file kiến thức vẽ bằng ký tự trong khối `text`, không dùng Mermaid, vì Word không hiển thị được Mermaid. Không dùng emoji trong file kiến thức: bản Word render bằng GenOffice mất toàn bộ chữ thường khi gặp emoji.
- Nhánh làm việc `dev`. Không commit thẳng `main`. Ở AUTO, phiên quản lý commit lên `dev` sau mỗi task đã kiểm chứng **và được người dùng nghiệm thu** (người dùng, 2026-10-27); ở TRAINING/HYBRID chỉ commit khi người dùng yêu cầu. **Push, merge, mở PR chỉ khi người dùng yêu cầu**.
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
