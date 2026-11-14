# Giao diện Sunset · Implementation Plan

> **AUTO** (frontend). Mỗi task: viết code, **test tay trước** trên Chrome thật (chỉ các cỡ màn task đó đụng tới), rồi mới viết hay sửa test tự động. Sau đó chạy `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`, đối chiếu artboard trong canvas Sunset (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs, token ở `project/sunset.css`), ghi Thực hiện và Kiểm chứng tại task. Quản lý commit lên `dev` sau khi người dùng nghiệm thu. Push chỉ khi người dùng bảo.
> **Điều kiện bắt đầu SU-01:** SU-00 đã nghiệm thu, commit, và `git status -- apps/sino-web` sạch, tức là NK-04 (`zalo-nicknames`) và PI-04/05 (`profile-info`) đã commit. Change này đụng `index.css`, `shared/ui/**`, `app/shell/**` và hầu hết `features/*`.
> **Mọi task · sino-web.** Không đổi route, API, dữ liệu hay hành vi. Không bịa số ở chỗ canvas vẽ mà API chưa có.

## 0. Ổn định hóa trước khi đổi giao diện

- [x] 0.1 **SU-00 — Nhận phần dở, làm `tsc` và test xanh** · sino-web
  - **Thực hiện:** phiên `sino-web-green` (2026-11-13) sửa test theo giao diện hiện tại (cột Thông tin mới của chat, thẻ hồ sơ), và sửa code sản phẩm ở `useArrivalNotices.ts`, `inbox.api.ts` (`toMember`), `format.ts` (`memberAvatar`), `Sidebar.tsx` (`useMemo`); thêm `src/test/fixtures/inboxFrameApi.ts`. Phiên `sino-web-su00` dừng trước khi sửa vì trùng việc.
  - **Kiểm chứng (quản lý, 2026-11-14):** `pnpm exec tsc -b` 0 lỗi; `pnpm test` 134 file, 1395/1395 xanh; `pnpm lint` 0 lỗi (cảnh báo cũ); `pnpm build` xanh. 3 file `sino-api` chép sang worktree tách tại `9f82825`: `./mvnw test -Dtest=ConversationsApiTests` 45/45 xanh (có `markAllReadMarksEveryMessageOfUserRead`), worktree đã gỡ. **CHƯA KIỂM CHỨNG** trên Chrome thật: biệt danh, đọc tất cả, `/notifications`, dán ảnh vào ô soạn, thanh cuộn, chuông khi import, avatar trong nhóm.
  - ~~Quản lý commit tách theo nhóm A/B/C/D~~ **LÝ DO:** bốn nhóm đan vào cùng file (`Sidebar.tsx`, `format.ts`, `index.css`, `inbox.api.ts`…) và `tsc` chỉ xanh khi có đủ cả bốn, nên commit tách sẽ để lại các commit trung gian đỏ. Làm hai commit: `sino-api` (`read-all`) và `sino-web` (A+B+C+D+chữa test).
  - Cột Thông tin của chat lệch spec (không còn việc/ghi chú gắn kèm, danh sách thành viên, tài khoản dùng, hai công tắc "Tắt thông báo nhóm này" và "Hiện trong Tổng quan"): xử lý ở SU-04.
  - **Vì sao** (rà 2026-11-13, người dùng: "Đồng ý, giao đi"): `dev` đỏ 215 test từ `a7349c1` (04/11; `b366d4d` ngay trước đó 1369/1369 xanh). Thư mục làm việc có 32 file dở thuộc 4 nhóm, đan vào nhau trong cùng file: **A** NK-04 biệt danh (`zalo-nicknames`, chưa nghiệm thu; `format.ts` làm `InboxFilter.account` bắt buộc nên `tsc -b` đỏ 21 chỗ trong test); **B** đọc tất cả và trang Thông báo (Antigravity 05/11, kèm 3 file `sino-api` cho `POST /api/conversations/read-all`); **C** thanh cuộn mảnh (Antigravity 05/11, `index.css`); **D** dán ảnh từ clipboard (`clipboard.ts`…) và `settings.options.ts` (Antigravity 05/11, không ghi ở đâu). Người dùng giao B, C, D cho CLAUDE ngày 2026-11-13.
  - **Phạm vi:** `apps/sino-web/**`. Giữ nguyên mọi tính năng của 4 nhóm, không bỏ, không viết lại. Sửa test theo giao diện và hành vi hiện tại. Thấy bug thật (hành vi sai so với spec hay với chủ ý rõ ràng của code) thì **báo**, không tự đổi hành vi. Không đụng `apps/sino-api` (quản lý kiểm 3 file đó trong worktree riêng).
  - **Acceptance criteria:** `pnpm exec tsc -b` 0 lỗi; `pnpm lint` 0 lỗi; `pnpm test` xanh hết, trừ ca đỏ có lý do ngoài code (ghi rõ); `pnpm build` xanh. Báo cáo liệt kê file theo nhóm A/B/C/D để quản lý commit tách được.
  - **Test:** chạy app, thử tay một lượt trên Chrome thật nếu có: biệt danh, đọc tất cả, `/notifications`, dán ảnh vào ô soạn, thanh cuộn. Không có Chrome thì ghi CHƯA KIỂM CHỨNG kèm danh sách cho người dùng tự kiểm.

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
