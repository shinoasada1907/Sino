## Context

- Thiết kế: canvas "Sino UI — Sunset" (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs), người dùng duyệt 2026-11-12. Token nằm trong `project/sunset.css`. Artboard gồm `Main` (nền tảng), `Sidebar`, `Dashboard`(+`Light`), `Inbox`(+`Light`), `Messages`, `Calendar`, `Tasks`, `Notes`, `Accounts`, `Settings`, `MobileInbox`, `MobileChat`.
- Code hiện tại: mọi màu đi qua biến CSS trong `src/index.css` (`--bg`, `--surface`, `--inverse`…), map sang Tailwind bằng `@theme inline`. Chỉ một file `.tsx` có mã màu cứng. Vì vậy đổi token sẽ đổi được phần lớn giao diện trong một bước.
- Font: Inter và JetBrains Mono tự host bằng `@fontsource-variable/*` trong `src/main.tsx`.
- `sino-web` đang có việc dở chưa commit (NK-04 của `zalo-nicknames`, PI-04/05 của `profile-info`) trên đúng các file sẽ đụng.

## Goals / Non-Goals

**Goals:** web trông giống canvas Sunset ở mọi màn có trong canvas, cả hai theme, ở 1440 / 1024 / 768 / 390; các màn còn lại nhận token mới; không đổi hành vi.

**Non-Goals:** xem `proposal.md`.

## Decisions

### D-482 — Canvas Sunset là thiết kế cuối cùng · **Chốt A** (người dùng, 2026-11-12: "Duyệt, theo đề xuất")

- **A (đề xuất)**: Sunset thay "Sino UI" cho mọi thứ người dùng nhìn thấy. Bản sao để ở `design/sino-ui-sunset/project/`; `CLAUDE.md` và memory trỏ link mới. Canvas cũ vẫn dùng cho bố cục những màn Sunset chưa vẽ.
- B: Sunset chỉ là lớp màu; bố cục vẫn theo canvas cũ.

Lý do chọn A: người dùng chê cả chuyện "chật chội", tức là chê cả bố cục, không riêng màu.

### D-483 — Thứ tự làm · **Chốt A** (người dùng, 2026-11-12)

- **A (đề xuất)**: token, font và thành phần dùng chung trước (SU-01), rồi tới bộ khung (SU-02), rồi từng nhóm màn. Sau SU-01 cả app đã đổi màu, mỗi task sau chỉ chỉnh bố cục một nhóm màn.
- B: làm trọn từng màn một từ đầu tới cuối. Kiểu này mỗi màn đẹp ngay, nhưng app sẽ có hai kiểu giao diện lẫn lộn trong nhiều ngày.

### D-484 — Theme mặc định

Giữ như hiện tại: người dùng chọn Sáng, Tối hoặc "Theo hệ thống" trong Cài đặt. Canvas vẽ tối làm mặc định chỉ để trình bày. Agent tự chốt.

### D-485 — Màn chưa có trong canvas Sunset

Chỉ nhận token và thành phần mới, bố cục giữ theo canvas cũ. Người dùng muốn vẽ lại màn nào thì thêm artboard vào canvas Sunset rồi mở task riêng. Agent tự chốt.

### D-486 — Font tiêu đề

Space Grotesk cho tiêu đề màn và số lớn (`.display`, `h1`), tự host bằng `@fontsource-variable/space-grotesk`, không gọi Google Fonts lúc chạy. Font này có bộ ký tự tiếng Việt; SU-01 kiểm chữ có dấu (ằ, ễ, ự) trên Chrome thật. Nếu dấu bị vỡ thì giữ Inter cho tiêu đề và ghi LÝ DO. Agent tự chốt.

### D-487 — Ánh xạ token

Giữ tên biến cũ để không phải sửa hàng trăm chỗ; thêm biến mới. Cụ thể:

| Biến cũ | Giá trị mới (tối / sáng) | Ghi chú |
|---|---|---|
| `--bg` | `#0F0C0A` / `#FBF6F0` | nền ấm |
| `--surface`, `--raised`, `--hover` | theo `sunset.css` | |
| `--border`, `--border-strong` | theo `sunset.css` | |
| `--text`, `--text-muted`, `--text-subtle` | theo `sunset.css` | đã kiểm tương phản ≥ 4.5:1 trên `--surface` |
| `--inverse` / `--on-inverse` | **giữ** cho chỗ cần khối đảo màu (tooltip, toast) | |
| mới `--accent`, `--accent-hover`, `--on-accent`, `--accent-ink`, `--accent-soft`, `--accent-line` | theo `sunset.css` | nút chính, mục đang chọn, chưa đọc |
| mới `--honey(-soft)`, `--dusk-ink`, `--dusk-soft`, `--success-soft`, `--danger-soft` | theo `sunset.css` | nhãn phân loại |
| `--success`, `--danger`, `--warning` và các `-ink` | theo `sunset.css` (`--warning` = `--honey`) | |

Nút chính (`Button` variant mặc định) chuyển từ `--inverse` sang `--accent`. Agent tự chốt.

## Risks / Trade-offs

- **Đụng file của việc đang dở** → SU-01 chỉ bắt đầu sau khi NK-04 và PI-04/05 đã commit. Quản lý kiểm `git status -- apps/sino-web` sạch trước khi giao.
- **Test dựa vào class màu** (`bg-inverse`…) có thể đỏ → sửa test theo class mới, không đổi hành vi.
- **Màu nhấn dùng tràn lan làm mất tác dụng** → quy tắc của canvas: mỗi màn chỉ một hành động chính mang màu nhấn.
