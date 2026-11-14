# Giao diện Sunset (mềm, đổi màu được) · Implementation Plan

> **AUTO.** Mỗi task: viết code, **test tay trước** (web: Chrome thật, chỉ các cỡ màn task đó đụng tới; backend: gọi API thật, xem DB), rồi mới viết hay sửa test tự động. Chạy các kiểm tra trước commit của app (web: `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`; api: test của module trong worktree riêng vì người dùng chạy sino-api từ IntelliJ). Đối chiếu artboard trong canvas (https://claude.ai/artifact/TL8JkCNzQcrP8RE4t3UjSs, token và bộ màu ở `project/sunset.css`). Ghi **Thực hiện** và **Kiểm chứng** tại task. Quản lý commit lên `dev` sau khi người dùng nghiệm thu. Push chỉ khi người dùng bảo.
> **Thứ tự:** SU-09 (hợp đồng API) chạy được ngay, song song với việc chờ web. SU-01 chỉ bắt đầu khi `git status -- apps/sino-web` sạch và test xanh: việc dở hiện do phiên quản lý "Zalo chat progress" giữ (`sino-web-green`, NK-04, phần Antigravity), phiên đó sẽ báo khi xong. SU-10 sau SU-01 và SU-09.
> Không đổi route, dữ liệu hay hành vi ngoài phần giao diện. Không bịa số ở chỗ canvas vẽ mà API chưa có.

## 0. Ổn định hóa trước khi đổi giao diện

- [ ] ~~0.1 **SU-00 — Nhận phần dở, làm `tsc` và test xanh** · sino-web~~
  - **LÝ DO bỏ** (2026-11-13): phiên `sino-web-su00` mở ra thì thấy phiên `sino-web-green` (do phiên quản lý "Zalo chat progress" mở) đã làm đúng việc này và đi trước (`tsc` 21 → 1 lỗi). SU-00 dừng trước khi sửa file nào. Phiên kia nghiệm thu và commit theo thứ tự: nhóm cũ (gồm phần Antigravity chuyển cho Claude, kèm 3 file `sino-api` read-all), rồi NK-04. Xong thì báo phiên `fe-ui-sunset`.
  - Bối cảnh khi rà (2026-11-13): `dev` đỏ 215 test từ `a7349c1` (04/11), commit ngay trước đó `b366d4d` xanh 1369/1369. Có 32 file dở trong 4 nhóm: A NK-04; B đọc tất cả + `/notifications`; C thanh cuộn; D dán ảnh clipboard + `settings.options.ts`.

## 1. Hợp đồng API

- [ ] 1.1 **SU-09 — Cài đặt giao diện trong `/api/settings` (D-490)** · sino-api
  - **Files:** `src/main/resources/db/migration/V28__settings_add_appearance.sql`, module `dev.sino.settings` (`domain/*`, `api/SettingsResponse.java`, `api/SettingsPatchReader.java`, enum mới `Palette`, `Corners`), test của module, `README.md` của sino-api (mục cài đặt).
  - **Acceptance criteria:** spec `user-settings` › "Cài đặt giao diện" (mọi scenario). Phản hồi cũ không đổi tên trường nào.
  - **Test:** gọi API thật (curl/Postman) trên bản sao DB và app ở worktree riêng (cổng riêng): GET mặc định, PATCH từng trường, PATCH sai → 400, GET lại; rồi test tích hợp của module.

## 2. Nền tảng web

- [ ] 2.1 **SU-01 — Token, 5 bộ màu, font, thành phần dùng chung (D-483, D-486, D-487, D-488, D-489 phần bộ dựng sẵn)** · sino-web
  - **Files:** `src/index.css` (token theo `sunset.css`: `theme-*`, `pal-*`, `corners-compact`, `no-decor`), `src/main.tsx`, `package.json` (+ `@fontsource-variable/nunito`, bỏ Inter nếu không còn dùng), `src/shared/ui/**` (+ test).
  - **Acceptance criteria:** spec `sunset-visual-language` › "Phong cách mềm cho cả app". 5 bộ màu đổi được bằng class trên `<html>` (chưa cần màn chọn). Nút chính dùng `--accent`. Nhãn có biến thể accent/solid/honey/dusk/ok/bad. Avatar màu pastel.
  - **Test:** Chrome thật 1440, sáng và tối, đổi `pal-*` bằng DevTools: Tổng quan, Hộp thư, wizard kết nối; chữ có dấu; rồi Vitest.

- [ ] 2.2 **SU-02 — Bộ khung: sidebar nổi, topbar, thanh tab điện thoại** · sino-web
  - **Files:** `src/app/shell/**` (+ test), `src/shared/ui/sino-mark.tsx`.
  - **Acceptance criteria:** spec "Bộ khung theo canvas".
  - **Test:** Chrome thật 1440, 1024, 390; rồi Vitest.

- [ ] 2.3 **SU-10 — Cài đặt › Giao diện: bộ màu, màu nhấn riêng, sáng/tối, độ bo, họa tiết (D-489, D-491, D-492)** · sino-web
  - **Files:** `src/shared/theme/**` (áp `palette`, `accentColor`, `corners`, `decorations`, nhớ trong `localStorage`), `src/shared/theme/accentScale.ts` (+ test), `src/features/settings/**` (mục Giao diện theo artboard `Settings`; ô ảnh nền hiện "Sắp có"), `settings.api.ts` (4 trường mới).
  - **Acceptance criteria:** spec "Bộ màu người dùng chọn", "Màu nhấn riêng giữ đủ tương phản", "Độ bo và họa tiết", scenario "Ảnh nền chưa có".
  - **Test:** Chrome thật 1440 với sino-api sau SU-09: chọn từng bộ, nhập màu nhạt và mã sai, Gọn, tắt họa tiết, tải lại (không chớp), đăng nhập máy/tab khác; rồi Vitest. Kiểm lỗi gài một lần cho `accentScale`.

## 3. Các màn trong canvas

- [ ] 3.1 **SU-03 — Tổng quan kiểu bento** (artboard `Dashboard`, `DashboardLight`) · sino-web
  - **Acceptance criteria:** spec "Các màn trong canvas theo bố cục Sunset" và "Không bịa dữ liệu". Khối chào dùng ảnh đại diện của hồ sơ (`avatarUrl`); thẻ nào chưa có dữ liệu thật thì bỏ.
  - **Test:** Chrome thật 1440, 1024; rồi Vitest.

- [ ] 3.2 **SU-04 — Hộp thư và Tin nhắn** (artboard `Inbox`, `InboxLight`, `Messages`) · sino-web
  - **Trước khi giao:** hỏi phiên "Zalo chat progress" xem phần xem ảnh trong chat (sửa `PhotoPicture.tsx`, `ConversationInfo.tsx`) đã commit chưa.
  - **Test:** Chrome thật 1440, 1024: danh sách, đọc thư, trả lời, chat, bong bóng của mình và người khác, độ bo Gọn; rồi Vitest.

- [ ] 3.3 **SU-05 — Lịch, Việc cần làm, Ghi chú** (artboard `Calendar`, `Tasks`, `Notes`) · sino-web
  - **Test:** Chrome thật 1440; rồi Vitest.

- [ ] 3.4 **SU-06 — Tài khoản** (artboard `Accounts`) · sino-web
  - **Test:** Chrome thật 1440, cả tài khoản lỗi; rồi Vitest.

- [ ] 3.5 **SU-07 — Điện thoại: Hộp thư, Trò chuyện; rà các màn ngoài canvas (D-485)** · sino-web
  - **Acceptance criteria:** artboard `MobileInbox`, `MobileChat`; spec "Màn ngoài canvas nhận token mới" (wizard kết nối, onboarding, hồ sơ, sticker, trang giới thiệu, Privacy, các trạng thái), thử với ít nhất 2 bộ màu.
  - **Test:** Chrome thật 390 và 768; rồi Vitest.

## 4. Nghiệm thu

- [ ] 4.1 **SU-08 — Nghiệm thu, nguồn thiết kế, archive (D-482)** · quản lý
  - Đủ cỡ màn (1440, 1024, 768, 390) × sáng/tối × ít nhất 3 bộ màu, so với canvas.
  - Chép canvas vào `design/sino-ui-sunset/project/`, đổi link thiết kế trong `CLAUDE.md` và memory, ghi file kiến thức của phase.
  - `openspec validate fe-ui-sunset --strict`, rồi `openspec archive fe-ui-sunset -y`.
