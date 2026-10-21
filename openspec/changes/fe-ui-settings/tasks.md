# Màn Cài đặt · Implementation Plan

> **AUTO** (người dùng 2026-10-21). Mỗi task: viết code, **test tay trước** trên Chrome thật (chỉ các cỡ màn task đó đụng tới), rồi mới viết test tự động; `pnpm lint`, `pnpm exec tsc -b`, `pnpm test`, `pnpm build`; đối chiếu canvas; ghi chú và bằng chứng tại task; commit lên `dev`. Push chỉ khi người dùng bảo.
> **File chung đang có thay đổi chưa commit của change khác:** không file nào của change này (`features/settings/**`, `app/router.tsx`, `app/shell/**`, `shared/theme/**`). Không sửa `features/stickers/**` (thuộc `sticker-packs`).

## 1. Trang Cài đặt

- [ ] 1.1 **SE-01 — Khung trang, mục lục, Giao diện, Ngôn ngữ, Chuyển động; theme có "Theo hệ thống" (D-392, D-393, D-394, D-395, D-400)**
  - **Files:** `features/settings/{SettingsPage.tsx,settings.sample.ts,useSettingsSample.ts,components/*}`, `shared/theme/**`, `app/router.tsx` (+ test).
  - **Acceptance criteria:** spec `settings-screen` phần "Trang Cài đặt và mục lục" và "Theme chạy thật".
  - **Test:** Chrome thật 1440 và 1024: mục lục, cuộn, chọn theme, tải lại; rồi Vitest.

- [ ] 1.2 **SE-02 — Thông báo, Lịch và nhắc nhở (D-394, D-399)**
  - **Acceptance criteria:** spec "Các cài đặt khác trên dữ liệu mẫu" cho hai mục này.
  - **Test:** Chrome thật 1440; rồi Vitest.

- [ ] 1.3 **SE-03 — Quyền riêng tư và dữ liệu, Nguồn đã kết nối, Bảo mật, Về Sino (D-396, D-399)**
  - **Acceptance criteria:** spec "Nguồn đã kết nối và Phiên bản thật" và phần còn lại của "Các cài đặt khác trên dữ liệu mẫu".
  - **Test:** Chrome thật 1440 với tài khoản thật; rồi Vitest (không có tài khoản, tài khoản cần xử lý).

## 2. Sticker và điện thoại

- [ ] 2.1 **SE-04 — Sticker trong Cài đặt (D-397)**
  - **Files:** `app/router.tsx`, `app/shell/{navItems.ts,MorePage.tsx}` và test của shell, `features/settings/**`.
  - **Acceptance criteria:** spec "Sticker trong Cài đặt".
  - **Test:** Chrome thật: thanh bên không còn "Sticker", `/stickers` chuyển, màn sticker trong khung Cài đặt; rồi Vitest.

- [ ] 2.2 **SE-05 — Điện thoại: danh sách, trang con (D-398)**
  - **Acceptance criteria:** spec "Cài đặt trên điện thoại".
  - **Test:** Chrome thật 390; rồi Vitest.

## 3. Nghiệm thu

- [ ] 3.1 **SE-06 — Nghiệm thu, tài liệu, archive**: đủ cỡ màn (1440, 1024, 768, 390) × 2 theme, so với canvas; file kiến thức; `openspec validate fe-ui-settings --strict`.
