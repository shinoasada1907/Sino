# Màn Cài đặt · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** trên Chrome thật (chỉ các cỡ màn task đó đụng tới), rồi mới viết test tự động; `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`; đối chiếu canvas; ghi chú và bằng chứng tại task; commit lên `dev`. Push chỉ khi người dùng bảo.
> **File chung đang có thay đổi chưa commit của change khác:** không file nào của change này (`features/settings/**`, `app/router.tsx`, `app/shell/**`, `shared/theme/**`). Không sửa `features/stickers/**` (thuộc `sticker-packs`).

## 1. Trang Cài đặt

- [x] 1.1 **SE-01 — Khung trang, mục lục, Giao diện, Ngôn ngữ, Chuyển động; theme có "Theo hệ thống" (D-392, D-393, D-394, D-395, D-400)**
  - **Files:** `features/settings/{SettingsPage.tsx,settings.sample.ts,useSettingsSample.ts,components/*}`, `shared/theme/**`, `app/router.tsx` (+ test).
  - **Acceptance criteria:** spec `settings-screen` phần "Trang Cài đặt và mục lục" và "Theme chạy thật".
  - **Test:** Chrome thật 1440 và 1024: mục lục, cuộn, chọn theme, tải lại; rồi Vitest.

- [x] 1.2 **SE-02 — Thông báo, Lịch và nhắc nhở (D-394, D-399)**
  - **Acceptance criteria:** spec "Các cài đặt khác trên dữ liệu mẫu" cho hai mục này.
  - **Test:** Chrome thật 1440; rồi Vitest.

- [x] 1.3 **SE-03 — Quyền riêng tư và dữ liệu, Nguồn đã kết nối, Bảo mật, Về Sino (D-396, D-399)**
  - **Acceptance criteria:** spec "Nguồn đã kết nối và Phiên bản thật" và phần còn lại của "Các cài đặt khác trên dữ liệu mẫu".
  - **Test:** Chrome thật 1440 với tài khoản thật; rồi Vitest (không có tài khoản, tài khoản cần xử lý).
  - **Thực hiện (SE-01…SE-03, một commit: chung `SettingsPage.tsx`):** `features/settings/` mới: `SettingsPage.tsx` (tiêu đề trang con điện thoại, mục lục từ 1280 px, tiêu đề trang từ 768 px, 9 mục), `sections.ts`, `components/SettingsNav.tsx` (liên kết `#neo`, `IntersectionObserver` với `rootMargin` −66 %, `aria-current="location"`, tên "Nguồn đã kết nối, N cần xử lý" thay cho chấm), `components/SettingRow.tsx` (`SettingSection`, `SettingRow`, `SettingSelect`, `SwitchRow`), `components/LookSections.tsx` (ba thẻ theme có hình xem trước như `.theme-tile`, `LanguageButton` của shell, định dạng ngày giờ, mức chuyển động và câu theo `prefers-reduced-motion` thật), `components/NotifySections.tsx` (6 công tắc, giờ yên lặng, Web Push, hai thiết bị, "Sino cho iOS và Android" mờ với "Sắp có"; lịch và nhắc nhở bằng 4 ô chọn), `components/DataSections.tsx` (dữ liệu đang lưu, xoá dữ liệu, tài khoản thật với trạng thái `healthView` khi `AUTH_EXPIRED` còn lại `syncStatusView`, mã hoá, phiên đăng nhập, phiên bản, ba liên kết), `settings.sample.ts`, `useSettingsSample.ts` (cache TanStack Query, `initialData`, không hết hạn). `shared/theme`: `ThemePreference`, `preference` + `choose`, `system` theo hệ điều hành bằng `useSyncExternalStore`; `theme` / `toggleTheme` giữ nguyên. `app/router.tsx`: `/settings` → `SettingsPage`. D-396 đổi: "Phiên bản" là dữ liệu mẫu (lý do ở design).
  - **Bằng chứng:** **Chrome thật: NOT VERIFIED** (Claude in Chrome không kết nối); dev server biên dịch các module mới (200). `SettingsPage.test.tsx` 7 ca xanh; `vitest run src/features/settings src/shared/theme src/app` 127/127; `pnpm lint` 0 lỗi; `tsc -b` 0; `pnpm build` 0; `pnpm test` 1305/1309 (4 ca đỏ: các test tải lên `FormData` đỏ sẵn trên Node 26). Một test đỏ lúc đầu vì có hai `h1` "Cài đặt" (của trang và của tiêu đề trang con điện thoại, CSS ẩn một cái mà jsdom không chạy CSS): sửa test.

## 2. Sticker và điện thoại

- [x] 2.1 **SE-04 — Sticker trong Cài đặt (D-397)**
  - **Files:** `app/router.tsx`, `app/shell/{navItems.ts,MorePage.tsx}` và test của shell, `features/settings/**`.
  - **Acceptance criteria:** spec "Sticker trong Cài đặt".
  - **Test:** Chrome thật: thanh bên không còn "Sticker", `/stickers` chuyển, màn sticker trong khung Cài đặt; rồi Vitest.
  - **Thực hiện:** `navItems.ts` bỏ mục "Sticker" (và icon) khỏi `NAV_ITEMS` và `MORE_PATHS` (`/settings/…` vẫn dưới tab "Thêm" nhờ `/settings`); `MorePage.tsx` bỏ `/stickers` khỏi "Đi tới". `router.tsx`: `settings/stickers` → `SettingsStickersPage` (mục lục từ 1280 px + `StickersPage` nguyên vẹn), `stickers` → `<Navigate to="/settings/stickers" replace />`; bỏ `/stickers` khỏi `SCREENS`. `SettingsNav` có `current="stickers"`: các mục thành liên kết `/settings#neo`, "Sticker" (sau "Nguồn đã kết nối") có `aria-current="page"`; `SettingsPage` tự cuộn tới `#neo` khi tới từ trang khác (router không cuộn). **Giới hạn:** trên điện thoại, nút quay lại của màn sticker vẫn về "Thêm" vì `StickersPage.tsx` (thuộc `sticker-packs`) đặt nó; đổi khi change đó nhả file.
  - **Bằng chứng:** **Chrome thật: NOT VERIFIED** (Claude in Chrome không kết nối); dev server biên dịch (200). Test shell viết lại cho chỗ mới (5 ca: không còn mục riêng ở thanh bên, rail, "Thêm"; `/stickers` → `/settings/stickers` với "Sticker" là trang hiện tại trong mục lục và "Cài đặt" là mục hiện tại ở thanh bên; tab "Thêm" vẫn là hiện tại; mục "Sticker" của mục lục đứng sau "Nguồn đã kết nối" và mở màn sticker), `UserMenu.test.tsx` và `SettingsPage.test.tsx` cập nhật danh sách. Mọi test của `features/stickers` mở `/stickers` vẫn xanh qua đường chuyển. `tsc -b` 0, lint 0 lỗi, build 0, `pnpm test` 1306/1310 (4 ca `FormData` đỏ sẵn).

- [ ] 2.2 **SE-05 — Điện thoại: danh sách, trang con (D-398)**
  - **Acceptance criteria:** spec "Cài đặt trên điện thoại".
  - **Test:** Chrome thật 390; rồi Vitest.

## 3. Nghiệm thu

- [ ] 3.1 **SE-06 — Nghiệm thu, tài liệu, archive**: đủ cỡ màn (1440, 1024, 768, 390) × 2 theme, so với canvas; file kiến thức; `openspec validate fe-ui-settings --strict`.
