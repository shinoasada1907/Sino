# Giao diện Sunset · Implementation Plan

> **AUTO** (frontend). Mỗi task: viết code, **test tay trước** trên Chrome thật (chỉ các cỡ màn task đó đụng tới), rồi mới viết hay sửa test tự động. Sau đó chạy `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`, đối chiếu artboard trong canvas Sunset (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs, token ở `project/sunset.css`), ghi Thực hiện và Kiểm chứng tại task. Quản lý commit lên `dev` sau khi người dùng nghiệm thu. Push chỉ khi người dùng bảo.
> **Điều kiện bắt đầu:** `git status -- apps/sino-web` sạch, tức là NK-04 (`zalo-nicknames`) và PI-04/05 (`profile-info`) đã commit. Change này đụng `index.css`, `shared/ui/**`, `app/shell/**` và hầu hết `features/*`.
> **Mọi task · sino-web.** Không đổi route, API, dữ liệu hay hành vi. Không bịa số ở chỗ canvas vẽ mà API chưa có.

## 1. Nền tảng

- [ ] 1.1 **SU-01 — Token, font, thành phần dùng chung (D-483, D-486, D-487)** · sino-web
  - **Files:** `src/index.css`, `src/main.tsx`, `package.json` (+ `@fontsource-variable/space-grotesk`), `src/shared/ui/**` (+ test).
  - **Acceptance criteria:** spec `sunset-visual-language` gồm "Token Sunset cho cả hai theme" và "Font và thang chữ". Nút chính dùng `--accent`. Nhãn có thêm biến thể accent/honey/dusk/ok/bad. Avatar dùng các màu đào của canvas.
  - **Test:** Chrome thật 1440, cả hai theme: Tổng quan, Hộp thư, wizard kết nối (đã đổi màu, không còn xám lạnh), chữ có dấu ở tiêu đề; rồi Vitest.

- [ ] 1.2 **SU-02 — Bộ khung: sidebar, topbar, thanh tab điện thoại** · sino-web
  - **Files:** `src/app/shell/**` (+ test), `src/shared/ui/sino-mark.tsx`.
  - **Acceptance criteria:** spec "Bộ khung theo canvas" (artboard `Sidebar`, phần top của `Dashboard`, thanh tab của `MobileInbox`).
  - **Test:** Chrome thật 1440, 1024, 390; rồi Vitest.

## 2. Các màn trong canvas

- [ ] 2.1 **SU-03 — Tổng quan** (artboard `Dashboard`, `DashboardLight`) · sino-web
  - **Acceptance criteria:** spec "Các màn trong canvas theo bố cục Sunset" và "Không bịa dữ liệu". Thẻ số liệu chỉ hiện số app đang có.
  - **Test:** Chrome thật 1440, 1024; rồi Vitest.

- [ ] 2.2 **SU-04 — Hộp thư và Tin nhắn** (artboard `Inbox`, `InboxLight`, `Messages`) · sino-web
  - **Test:** Chrome thật 1440, 1024: danh sách, đọc thư, trả lời, chat, bong bóng của mình và của người khác; rồi Vitest.

- [ ] 2.3 **SU-05 — Lịch, Việc cần làm, Ghi chú** (artboard `Calendar`, `Tasks`, `Notes`) · sino-web
  - **Test:** Chrome thật 1440; rồi Vitest.

- [ ] 2.4 **SU-06 — Tài khoản, Cài đặt** (artboard `Accounts`, `Settings`) · sino-web
  - **Test:** Chrome thật 1440, cả tài khoản lỗi; rồi Vitest.

- [ ] 2.5 **SU-07 — Điện thoại: Hộp thư, Trò chuyện; rà các màn ngoài canvas (D-485)** · sino-web
  - **Acceptance criteria:** artboard `MobileInbox`, `MobileChat`; spec "Màn ngoài canvas nhận token mới" (wizard kết nối, onboarding, hồ sơ, sticker, trang giới thiệu, Privacy, các trạng thái).
  - **Test:** Chrome thật 390 và 768; rồi Vitest.

## 3. Nghiệm thu

- [ ] 3.1 **SU-08 — Nghiệm thu, nguồn thiết kế, archive (D-482)** · quản lý
  - Đủ cỡ màn (1440, 1024, 768, 390) × 2 theme, so với canvas; kiểm lỗi gài một lần cho hàm thuần nếu có.
  - Chép canvas vào `design/sino-ui-sunset/project/`, đổi link thiết kế trong `CLAUDE.md` và memory, ghi file kiến thức của phase.
  - `openspec validate fe-ui-sunset --strict`, rồi `openspec archive fe-ui-sunset -y`.
